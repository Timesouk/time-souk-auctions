"use server";
// Back office actions. Each one checks the signed-in user is staff, then writes with the server key.
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireStaff, type Staff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import { normIg, toE164 } from "@/lib/format";
import { compute, findCustomer, nextCustomerCode, invoiceNo, pad2, planTrays, type TrayLot } from "@/lib/office/engine";
import { fetchAll, loadOfficeData } from "@/lib/office/load";
import { DELIVERY_STATUSES, DIRECT, EXCEPTIONS, PAY_METHODS, type Customer } from "@/lib/office/types";
import type { ImportPlan } from "@/lib/office/import";
import type { Result } from "../actions";
import { booksClosedUpTo, closedMessage } from "@/lib/office/lock";

const ok = (message: string, id?: string): Result => ({ ok: true, message, id });
/** A column added by 0008 missing means that update hasn't been run yet: say so plainly. */
const bad = (message: string): Result => ({
  ok: false,
  message: /does not exist/.test(message) && /instagram|demo|paid_to_seller_id|payout_amount/.test(message)
    ? "The back office needs one more database update: run supabase/migrations/0008_office_extras.sql in the Supabase SQL Editor."
    : message
});

async function guard(fn: (staff: Staff) => Promise<Result>, admin = false): Promise<Result> {
  try {
    if (IS_PREVIEW) return bad("Preview mode: connect Supabase to save.");
    const staff = admin ? await requireAdmin() : await requireStaff();
    return await fn(staff);
  } catch (e) {
    return bad((e as Error).message || "Something went wrong");
  }
}

const refresh = () => revalidatePath("/admin/office", "layout");
const str = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);
const ymd = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
/** A typed amount ("1,250", "AED 1250.50") → 1250.5; blank → null. */
const amount = (v: unknown) => {
  const t = String(v ?? "").replace(/[^\d.-]/g, "");
  if (!t) return null;
  const x = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(x) ? x : null;
};
const posInt = (v: unknown) => {
  const x = amount(v);
  return x != null && x > 0 ? Math.round(x) : null;
};

// ───────────────────────────── buyers ─────────────────────────────

async function allCodes() {
  return fetchAll<{ code: string }>(adminClient(), "customers", "code", "code");
}

/** Adds a buyer with the next code (B0061…, or D0001… for a demo buyer). Retries if two staff add one at the same moment. */
async function insertCustomer(row: Partial<Customer>): Promise<Customer> {
  const db = adminClient();
  for (let i = 0; i < 4; i++) {
    const code = nextCustomerCode(await allCodes(), row.demo ? "D" : "B");
    const { data, error } = await db.from("customers").insert({ ...row, code }).select("*").single();
    if (!error) return data as Customer;
    if (error.code !== "23505" || /instagram|profile/.test(error.message)) throw new Error(error.message);
  }
  throw new Error("Couldn't give the buyer a code. Try again.");
}

export type CustomerInput = {
  id?: string; instagram: string; full_name: string; phone: string; email: string; address: string; area: string; country: string;
  delivery: string; usual_pay: string; id_checked: boolean; flag: string; notes: string; lang: string;
};

export async function saveCustomer(input: CustomerInput) {
  return guard(async () => {
    const ig = normIg(input.instagram);
    const phoneRaw = str(input.phone, 40);
    const phone = phoneRaw ? toE164(phoneRaw) : "";
    if (phoneRaw && !phone) return bad("That WhatsApp number doesn't look right. Include the country code, e.g. +971 50 123 4567.");
    if (!ig && !str(input.full_name) && !phone) return bad("Type at least an Instagram handle, a name or a WhatsApp number.");
    const row = {
      instagram: ig, full_name: str(input.full_name, 120), phone, email: str(input.email, 160), address: str(input.address, 300), area: str(input.area, 80),
      country: str(input.country, 60) === "United Arab Emirates" ? "" : str(input.country, 60),
      delivery: ["Courier", "Pickup"].includes(input.delivery) ? input.delivery : "", usual_pay: (PAY_METHODS as readonly string[]).includes(input.usual_pay) ? input.usual_pay : "",
      id_checked: !!input.id_checked, flag: ["OK", "Watch", "Blocked"].includes(input.flag) ? input.flag : "OK", notes: str(input.notes, 1000),
      lang: ["both", "en", "ar"].includes(input.lang) ? input.lang : ""
    };
    const db = adminClient();
    if (ig) {
      const { data: same } = await db.from("customers").select("id, code").eq("instagram", ig).limit(2);
      const other = (same || []).find(x => x.id !== input.id);
      if (other) return bad(`@${ig} is already buyer ${other.code}.`);
    }
    if (input.id) {
      const { error } = await db.from("customers").update(row).eq("id", input.id);
      if (error) return bad(error.message);
      refresh();
      return ok("Buyer saved.", input.id);
    }
    const c = await insertCustomer(row as Partial<Customer>);
    refresh();
    return ok(`Buyer ${c.code} added.`, c.code);
  });
}

// ───────────────────────────── lots ─────────────────────────────

export type LotChange = { id: string; fields: Record<string, string> };

const LOT_PUBLIC = new Set(["brand", "model", "reference", "year", "condition", "start_price"]);

/** Saves edits from the lots grid (results during the live, delivery and payouts after it, or the lot details). */
export async function saveLots(changes: LotChange[]) {
  return guard(async () => {
    if (!Array.isArray(changes) || !changes.length) return ok("Nothing to save.");
    if (changes.length > 400) return bad("Save fewer rows at a time.");
    const db = adminClient();
    const customers = await fetchAll<Customer>(db, "customers", "id, code, instagram, full_name, phone, demo", "code");
    const sellers = await fetchAll<{ id: string; code: string; name: string; kind: string; demo: boolean }>(db, "sellers", "id, code, name, kind, demo", "code");
    const notes: string[] = [];
    let saved = 0;
    // each lot's auction: for the closed-books check, the demo rules and the trays
    const { data: info, error: infoErr } = await db.from("lots").select("id, lot_number, auction_id, auctions!lots_auction_id_fkey(number, sale_date, demo)").in("id", changes.map(c => c.id));
    if (infoErr) return bad(infoErr.message);
    type AInfo = { number: number; sale_date: string; demo: boolean };
    const lotInfo = new Map((info || []).map(r => [r.id as string, { lot_number: r.lot_number as number, auction_id: r.auction_id as string, a: (Array.isArray(r.auctions) ? r.auctions[0] : r.auctions) as AInfo | null }]));
    const lock = await booksClosedUpTo();
    if (lock) {
      const MONEY = ["winner", "hammer", "exception", "cost", "fee_pct", "fee_fixed", "seller", "seller_paid_on"];
      for (const c of changes) {
        if (!Object.keys(c.fields || {}).some(k => MONEY.includes(k))) continue;
        const r = lotInfo.get(c.id);
        if (r?.a && r.a.sale_date <= lock) return bad(`Lot ${r.a.number}-${pad2(r.lot_number)}: ${closedMessage(lock)}`);
      }
    }
    const trayAuctions = new Set<string>();
    for (const ch of changes) {
      const f = ch.fields || {};
      const here = lotInfo.get(ch.id);
      const demoLot = !!here?.a?.demo;
      if (here && ["winner", "hammer", "exception"].some(k => k in f)) trayAuctions.add(here.auction_id);
      const pub: Record<string, unknown> = {};
      const priv: Record<string, unknown> = {};
      for (const [k, raw] of Object.entries(f)) {
        const v = String(raw ?? "").trim();
        if (LOT_PUBLIC.has(k)) {
          if (k === "start_price") pub[k] = Math.max(0, Math.round(amount(v) || 0));
          else if (k === "brand" && !v) return bad("A lot needs a brand.");
          else pub[k] = v.slice(0, 120);
          continue;
        }
        switch (k) {
          case "winner": {
            if (!v) {
              priv.winner_text = "";
              priv.winner_customer_id = null;
              break;
            }
            // the demo auction only uses demo buyers, and real auctions only real ones
            const same = customers.filter(x => !!x.demo === demoLot);
            const other = customers.filter(x => !!x.demo !== demoLot);
            let c = findCustomer(same as Customer[], v);
            if (!c) {
              const elsewhere = findCustomer(other as Customer[], v);
              if (elsewhere) {
                return bad(demoLot
                  ? `"${v}" is a real buyer (${elsewhere.code}). In the demo auction, type a new handle (it becomes a demo buyer) or a demo buyer's code (D0001…).`
                  : `"${v}" is a demo buyer (${elsewhere.code}): demo buyers only win lots in the demo auction.`);
              }
              const ig = normIg(v);
              if (!ig || /^[bd]\d+$/i.test(v)) return bad(`"${v}" isn't a buyer. Type their Instagram handle or buyer code.`);
              c = await insertCustomer({ instagram: ig, ...(demoLot ? { demo: true } : {}) });
              customers.push(c);
              notes.push(`New ${demoLot ? "demo " : ""}buyer ${c.code} (@${ig}): add their WhatsApp number on Buyers.`);
            }
            priv.winner_text = v.slice(0, 80);
            priv.winner_customer_id = c.id;
            break;
          }
          case "hammer":
          case "underbid":
          case "cost": {
            const x = amount(v);
            if (x != null && x < 0) return bad("Amounts can't be negative.");
            priv[k] = k === "cost" ? (x == null ? null : Math.round(x)) : x;
            break;
          }
          case "reserve":
            priv.reserve = posInt(v);
            break;
          case "fee_pct":
            priv.seller_fee = v === "" ? null : amount(v);
            break;
          case "fee_fixed":
            priv.fee_fixed = v === "" ? null : amount(v);
            break;
          case "tray":
            priv.tray = posInt(v);
            break;
          case "exception":
            if (v && !(EXCEPTIONS as readonly string[]).includes(v)) return bad(`Unknown exception "${v}".`);
            priv.exception = v || null;
            break;
          case "delivery_status":
            if (v && !(DELIVERY_STATUSES as readonly string[]).includes(v)) return bad(`Unknown delivery status "${v}".`);
            priv.delivery_status = v;
            break;
          case "seller_paid_on":
            // typed or cleared by hand: forget the cash worked out when it was settled on the seller's page
            priv.seller_paid_on = ymd(v);
            priv.payout_amount = null;
            break;
          case "dispatched_on":
          case "intake_date":
            priv[k] = ymd(v);
            break;
          case "seller": {
            if (!v) {
              priv.seller_id = null;
              break;
            }
            const s = sellers.find(x => x.code.toUpperCase() === v.toUpperCase());
            if (!s) return bad(`Seller "${v}" isn't on Sellers.`);
            if (!!s.demo !== demoLot) return bad(demoLot ? `In the demo auction, use the demo sellers (${sellers.filter(x => x.demo).map(x => x.code).join(", ") || "DEMO-C, DEMO-O"}).` : `${s.code} is a demo seller: only for the demo auction.`);
            priv.seller_id = s.id;
            priv.source = s.kind === "own" ? "stock" : "consign";
            priv.consignor_name = s.kind === "own" ? "" : s.name;
            break;
          }
          case "underbidder":
          case "courier":
          case "payout_ref":
          case "office_notes":
          case "serial":
          case "box_papers":
            priv[k] = v.slice(0, 300);
            break;
          default:
            return bad(`Unknown field ${k}.`);
        }
      }
      if (Object.keys(pub).length) {
        const { error } = await db.from("lots").update(pub).eq("id", ch.id);
        if (error) return bad(error.message);
      }
      if (Object.keys(priv).length) {
        const { error } = await db.from("lot_private").upsert({ lot_id: ch.id, ...priv, updated_at: new Date().toISOString() }, { onConflict: "lot_id" });
        if (error) return bad(error.message);
      }
      saved++;
    }
    for (const id of trayAuctions) notes.push(...(await assignTrays(id, customers)));
    refresh();
    return ok([`Saved ${saved} lot${saved === 1 ? "" : "s"}.`, ...notes].join(" "));
  });
}

/** Buyers who won more than one lot in this auction get a tray number (their watches go together). Returns what changed, to tell staff. */
async function assignTrays(auctionId: string, customers: Pick<Customer, "id" | "code" | "instagram">[]) {
  const db = adminClient();
  const { data, error } = await db.from("lots").select("id, lot_number, auctions!lots_auction_id_fkey(number), lot_private(winner_customer_id, hammer, exception, tray)").eq("auction_id", auctionId);
  if (error || !data?.length) return [];
  const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x);
  const no = (one(data[0].auctions as { number: number } | { number: number }[] | null) as { number: number } | null)?.number || 0;
  const rows: TrayLot[] = data.map(r => {
    const p = (one(r.lot_private as Record<string, unknown> | Record<string, unknown>[] | null) || {}) as Record<string, unknown>;
    return {
      id: r.id as string, lot_number: r.lot_number as number, winner: (p.winner_customer_id as string) || null,
      hammer: p.hammer == null ? null : Number(p.hammer), exception: (p.exception as string) || null, tray: p.tray == null ? null : Number(p.tray)
    };
  });
  const plan = planTrays(rows);
  const byTray = new Map<number, string[]>();
  for (const t of plan.set) byTray.set(t.tray, [...(byTray.get(t.tray) || []), t.id]);
  for (const [tray, ids] of byTray) {
    const { error: e } = await db.from("lot_private").update({ tray, updated_at: new Date().toISOString() }).in("lot_id", ids);
    if (e) return [`Couldn't set tray ${tray}: ${e.message}`];
  }
  return plan.trays.map(t => {
    const c = customers.find(x => x.id === t.winner);
    const who = c ? (c.instagram ? `@${c.instagram}` : c.code) : "a buyer";
    return `Tray ${t.tray}: ${who} has ${t.lots.length} lots (${t.lots.map(n => `${no}-${pad2(n)}`).join(", ")}).`;
  });
}

/** Deletes a lot typed by mistake. Only lots with no result, no website bids and no website invoice. */
export async function deleteOfficeLot(id: string) {
  return guard(async () => {
    const db = adminClient();
    const { data: lot, error } = await db
      .from("lots")
      .select("id, lot_number, bid_count, auction_id, auctions!lots_auction_id_fkey(number, sale_date), lot_private(hammer, winner_customer_id, winner_text, intake_item_id)")
      .eq("id", id)
      .maybeSingle();
    if (error) return bad(error.message);
    if (!lot) return bad("That lot isn't there any more (refresh the page).");
    const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x);
    const a = one(lot.auctions as { number: number; sale_date: string } | { number: number; sale_date: string }[] | null);
    const p = (one(lot.lot_private as Record<string, unknown> | Record<string, unknown>[] | null) || {}) as Record<string, unknown>;
    const key = `${a?.number ?? "?"}-${pad2(lot.lot_number as number)}`;
    if (p.hammer != null || p.winner_customer_id || String(p.winner_text || "").trim()) {
      return bad(`Lot ${key} has a result. Clear its winner and hammer price first (or mark it Withdrawn instead).`);
    }
    if (Number(lot.bid_count) > 0) return bad(`Lot ${key} has bids on the website, so it can't be deleted. Mark it Withdrawn instead.`);
    const lock = await booksClosedUpTo();
    if (lock && a && a.sale_date <= lock) return bad(`Lot ${key}: ${closedMessage(lock)}`);
    const { data: web } = await db.from("invoices").select("id").eq("lot_id", id).limit(1);
    if (web?.length) return bad(`Lot ${key} has a website invoice. Mark it Withdrawn instead.`);
    const { error: e2 } = await db.from("lots").delete().eq("id", id);
    if (e2) return bad(e2.message);
    refresh();
    revalidatePath(`/admin/auctions/${lot.auction_id}`);
    return ok(`Lot ${key} deleted.${p.intake_item_id ? " The watch is back in stock on Intake." : ""}`);
  });
}

export type NewLot = {
  auction_id: string; lot_number?: string; brand: string; model: string; reference: string; year: string; condition: string; box_papers: string; serial: string;
  seller: string; start_price: string; reserve: string; cost: string; fee_pct: string; fee_fixed: string; intake_item_id?: string;
};

/** Adds a lot to an auction (the next lot number unless one is given). */
export async function addLot(input: NewLot) {
  return guard(async () => {
    const db = adminClient();
    const brand = str(input.brand, 80);
    if (!brand) return bad("Type the brand.");
    const { data: auction } = await db.from("auctions").select("id, number, demo").eq("id", input.auction_id).maybeSingle();
    if (!auction) return bad("Choose the auction.");
    let lotNo = posInt(input.lot_number);
    if (!lotNo) {
      const { data: last } = await db.from("lots").select("lot_number").eq("auction_id", auction.id).order("lot_number", { ascending: false }).limit(1).maybeSingle();
      lotNo = (last?.lot_number || 0) + 1;
    }
    let seller: { id: string; name: string; kind: string; demo: boolean } | null = null;
    if (str(input.seller)) {
      const { data } = await db.from("sellers").select("id, name, kind, demo").ilike("code", str(input.seller, 20)).maybeSingle();
      if (!data) return bad(`Seller "${input.seller}" isn't on Sellers.`);
      if (!!data.demo !== !!auction.demo) return bad(auction.demo ? "In the demo auction, use the demo sellers (DEMO-C, DEMO-O)." : `${str(input.seller, 20).toUpperCase()} is a demo seller: only for the demo auction.`);
      seller = data;
    }
    const bp = str(input.box_papers, 40);
    const reserve = posInt(input.reserve);
    const { data: lot, error } = await db
      .from("lots")
      .insert({
        auction_id: auction.id, lot_number: lotNo, brand, model: str(input.model, 120), reference: str(input.reference, 60), year: str(input.year, 20),
        condition: str(input.condition, 40) || "Excellent", start_price: Math.max(0, Math.round(amount(input.start_price) || 0)),
        has_box: /box|full/i.test(bp), has_papers: /papers|full/i.test(bp), no_reserve: !reserve
      })
      .select("id")
      .single();
    if (error) return bad(error.code === "23505" ? `Lot ${auction.number}-${String(lotNo).padStart(2, "0")} already exists.` : error.message);
    const { error: e2 } = await db.from("lot_private").upsert({
      lot_id: lot.id, reserve, cost: amount(input.cost) == null ? null : Math.round(amount(input.cost)!), seller_fee: str(input.fee_pct) ? amount(input.fee_pct) : null,
      fee_fixed: str(input.fee_fixed) ? amount(input.fee_fixed) : null, seller_id: seller?.id || null, source: seller && seller.kind !== "own" ? "consign" : "stock",
      consignor_name: seller && seller.kind !== "own" ? seller.name : "", box_papers: bp, serial: str(input.serial, 60), intake_item_id: input.intake_item_id || null,
      intake_date: null
    }, { onConflict: "lot_id" });
    if (e2) return bad(e2.message);
    refresh();
    return ok(`Lot ${auction.number}-${String(lotNo).padStart(2, "0")} added.`, lot.id);
  });
}

/** Lots that ran on the website or in the live console: their leader and final bid become the winner and hammer price. */
export async function bringInWebsiteResults(auctionId: string) {
  return guard(async () => {
    const db = adminClient();
    const { data: lots, error } = await db
      .from("lots")
      .select("id, lot_number, current_bid, ends_at, no_reserve, reserve_met, made_pure, lot_private(leader_id, leader_ig, hammer, winner_customer_id, exception)")
      .eq("auction_id", auctionId)
      .not("current_bid", "is", null);
    if (error) return bad(error.message);
    const now = Date.now();
    const customers = await fetchAll<Customer>(db, "customers", "id, code, instagram, profile_id", "code");
    let filled = 0;
    let skipped = 0;
    const added: string[] = [];
    for (const l of lots || []) {
      const p = (Array.isArray(l.lot_private) ? l.lot_private[0] : l.lot_private) as { leader_id: string | null; leader_ig: string | null; hammer: number | null; winner_customer_id: string | null; exception: string | null } | null;
      const ended = l.ends_at && Date.parse(l.ends_at) <= now;
      const sold = l.no_reserve || l.reserve_met || l.made_pure;
      if (!ended || !sold || !p || p.exception) continue;
      if (p.hammer != null || p.winner_customer_id) {
        skipped++;
        continue;
      }
      let c: Customer | undefined;
      if (p.leader_id) {
        c = customers.find(x => x.profile_id === p.leader_id);
        if (!c) {
          const { data: prof } = await db.from("profiles").select("full_name, email, phone, country, instagram, lang, address, city").eq("id", p.leader_id).maybeSingle();
          const ig = normIg(prof?.instagram);
          c = ig ? customers.find(x => normIg(x.instagram) === ig) : undefined;
          if (c) await db.from("customers").update({ profile_id: p.leader_id }).eq("id", c.id);
          else {
            c = await insertCustomer({
              profile_id: p.leader_id, instagram: ig, full_name: prof?.full_name || "", phone: prof?.phone || "", email: prof?.email || "",
              country: prof?.country && prof.country !== "United Arab Emirates" && prof.country !== "AE" ? prof.country : "", address: prof?.address || "", area: prof?.city || "",
              lang: prof?.lang === "ar" ? "ar" : ""
            } as Partial<Customer>);
            added.push(c.code);
          }
          customers.push(c);
        }
      } else if (p.leader_ig) {
        const ig = normIg(p.leader_ig);
        c = customers.find(x => normIg(x.instagram) === ig);
        if (!c && ig) {
          c = await insertCustomer({ instagram: ig });
          customers.push(c);
          added.push(c.code);
        }
      }
      if (!c) continue;
      const { error: e } = await db.from("lot_private").upsert(
        { lot_id: l.id, hammer: l.current_bid, winner_customer_id: c.id, winner_text: c.instagram ? `@${c.instagram}` : c.code, updated_at: new Date().toISOString() },
        { onConflict: "lot_id" }
      );
      if (e) return bad(e.message);
      filled++;
    }
    const synced = await syncWebsitePayments(auctionId);
    const trays = filled ? await assignTrays(auctionId, customers) : [];
    refresh();
    const parts = [`${filled} result${filled === 1 ? "" : "s"} brought in.`, ...trays];
    if (skipped) parts.push(`${skipped} already had a result typed (left as typed).`);
    if (added.length) parts.push(`New buyers: ${added.join(", ")}.`);
    if (synced) parts.push(`${synced} website payment${synced === 1 ? "" : "s"} added to Payments.`);
    return ok(parts.join(" "));
  });
}

const WEB_METHOD: Record<string, string> = { card: "Card (website)", tabby: "Tabby", tamara: "Tamara", bank: "Bank transfer", cash: "Cash", cod: "Cash on delivery" };

/** Payments made on the website (per-lot invoices) are recorded once on the back-office invoice. */
async function syncWebsitePayments(auctionId: string) {
  const db = adminClient();
  const { data: auction } = await db.from("auctions").select("number").eq("id", auctionId).maybeSingle();
  const { data: invs } = await db.from("invoices").select("id, lot_id, amount, cod_fee, cod_requested_at, method, paid_at, number").eq("auction_id", auctionId).eq("status", "paid");
  if (!auction || !invs?.length) return 0;
  const { data: privs } = await db.from("lot_private").select("lot_id, winner_customer_id").in("lot_id", invs.map(i => i.lot_id));
  const winner = new Map((privs || []).map(p => [p.lot_id, p.winner_customer_id as string | null]));
  const ids = [...new Set([...winner.values()].filter(Boolean))] as string[];
  const { data: custs } = ids.length ? await db.from("customers").select("id, code").in("id", ids) : { data: [] as { id: string; code: string }[] };
  const codeOf = new Map((custs || []).map(c => [c.id, c.code]));
  let n = 0;
  for (const i of invs) {
    const cid = winner.get(i.lot_id);
    const code = cid ? codeOf.get(cid) : null;
    if (!cid || !code) continue;
    const { error, count } = await db.from("ledger").upsert(
      {
        import_ref: `web:${i.id}`, entry_date: String(i.paid_at || new Date().toISOString()).slice(0, 10), kind: "Payment", customer_id: cid,
        invoice_no: invoiceNo(auction.number, code), method: WEB_METHOD[i.method || ""] || "Other", amount: Number(i.amount) + (i.cod_requested_at ? Number(i.cod_fee || 0) : 0),
        reference: `Website invoice ${i.number}`, notes: "Paid on the website"
      },
      { onConflict: "import_ref", ignoreDuplicates: true, count: "exact" }
    );
    if (!error) n += count || 0;
  }
  return n;
}

// ───────────────────────────── invoices and money ─────────────────────────────

export type AdjustmentInput = { invoice_no: string; delivery: string; pays_by: string; delivery_fee: string; discount: string; extra: string; extra_label: string; note: string };

export async function saveAdjustment(input: AdjustmentInput) {
  return guard(async () => {
    const no = str(input.invoice_no, 40).toUpperCase();
    if (!/^TS\d{3,}-.+/.test(no)) return bad("Unknown invoice number.");
    const row = {
      invoice_no: no, delivery: ["Courier", "Pickup"].includes(input.delivery) ? input.delivery : "",
      pays_by: (PAY_METHODS as readonly string[]).includes(input.pays_by) ? input.pays_by : "", delivery_fee: amount(input.delivery_fee), discount: amount(input.discount),
      extra: amount(input.extra), extra_label: str(input.extra_label, 60), note: str(input.note, 300), updated_at: new Date().toISOString()
    };
    for (const k of ["delivery_fee", "discount", "extra"] as const) if ((row[k] ?? 0) < 0) return bad("Amounts can't be negative.");
    const lock = await booksClosedUpTo();
    if (lock) {
      const { data: a } = await adminClient().from("auctions").select("sale_date").eq("number", Number(no.slice(2, no.indexOf("-")))).maybeSingle();
      if (a && a.sale_date <= lock) return bad(closedMessage(lock));
    }
    const { error } = await adminClient().from("invoice_adjustments").upsert(row, { onConflict: "invoice_no" });
    if (error) return bad(error.message);
    refresh();
    return ok(`Invoice ${no} updated.`);
  });
}

export type EntryInput = {
  kind: "Payment" | "Deposit" | "Refund"; customer_id: string; invoice_no: string; method: string; amount: string; entry_date: string; reference: string; received_by: string; notes: string;
  /** Method DIRECT: the consignor the buyer paid. */
  paid_to_seller_id?: string;
};

/** Records a payment, a deposit or a refund. */
export async function recordEntry(input: EntryInput) {
  return guard(async staff => {
    if (!["Payment", "Deposit", "Refund"].includes(input.kind)) return bad("Choose payment, deposit or refund.");
    const amt = amount(input.amount);
    if (!amt || amt <= 0) return bad("Type the amount.");
    if (amt > 5000000) return bad("That amount looks too large.");
    const inv = str(input.invoice_no, 40).toUpperCase();
    if (input.kind === "Payment" && !inv) return bad("A payment needs its invoice. Before invoicing, record a deposit.");
    if (!input.customer_id) return bad("Choose the buyer.");
    const method = str(input.method, 40);
    if (!method) return bad("Choose how it was paid.");
    const lock = await booksClosedUpTo();
    const when = ymd(input.entry_date) || new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
    if (lock && when <= lock) return bad(closedMessage(lock));
    // The buyer paid the consignor directly: it must be a payment on an invoice with that seller's lots, not yet settled with them.
    const direct = method === DIRECT;
    const sellerId = str(input.paid_to_seller_id, 40);
    let sellerCode = "";
    if (direct) {
      if (input.kind !== "Payment") return bad("“Paid to seller directly” is only for payments on an invoice.");
      if (!sellerId) return bad("Choose the seller the buyer paid.");
      const o = compute(await loadOfficeData());
      const invoice = o.invoicesByNo.get(inv);
      if (!invoice) return bad(`There's no open invoice ${inv}.`);
      const theirs = invoice.lots.filter(l => l.seller_id === sellerId && l.type === "Consignment");
      if (!theirs.length) return bad("That seller has no consigned lots on this invoice.");
      if (theirs.every(l => l.seller_paid_on)) return bad("This seller's lots on the invoice are already settled. Record the buyer's payment to them before settling the seller.");
      sellerCode = theirs[0].seller?.code || "";
    }
    const db = adminClient();
    const { data, error } = await db
      .from("ledger")
      .insert({
        kind: input.kind, customer_id: input.customer_id, invoice_no: input.kind === "Deposit" ? "" : inv, method, amount: amt,
        entry_date: ymd(input.entry_date) || undefined, reference: str(input.reference, 120), received_by: str(input.received_by, 60) || staff.name, notes: str(input.notes, 300),
        created_by: staff.id, ...(direct ? { paid_to_seller_id: sellerId } : {})
      })
      .select("id")
      .single();
    if (error) return bad(error.message);
    refresh();
    const what = input.kind === "Deposit" ? "Deposit" : input.kind === "Refund" ? "Refund" : "Payment";
    return ok(
      direct
        ? `Payment of AED ${amt.toLocaleString("en-US")} the buyer made to seller ${sellerCode} recorded. It comes off what we owe ${sellerCode} when you settle with them.`
        : `${what} of AED ${amt.toLocaleString("en-US")} recorded.`,
      data.id
    );
  });
}

/** Removes a payments row typed by mistake (admin only). */
export async function deleteEntry(id: string) {
  return guard(async () => {
    const db = adminClient();
    const lock = await booksClosedUpTo();
    if (lock) {
      const { data: row } = await db.from("ledger").select("entry_date").eq("id", id).maybeSingle();
      if (row && row.entry_date <= lock) return bad(closedMessage(lock));
    }
    const { data: card } = await db.from("card_links").select("id").eq("ledger_id", id).maybeSingle();
    if (card) await db.from("card_links").update({ ledger_id: null, status: "paid (record removed)" }).eq("id", card.id);
    const { error } = await db.from("ledger").delete().eq("id", id);
    if (error) return bad(error.message);
    refresh();
    return ok("Removed.");
  }, true);
}

export type SentInput = { ref: string; name: string; phone: string; total: number | null; balance: number | null; kind: string; link: string };

/** Notes that a WhatsApp message was opened for sending (the Sent Log). */
export async function logSent(input: SentInput) {
  return guard(async staff => {
    const { error } = await adminClient().from("sent_log").insert({
      ref: str(input.ref, 60), name: str(input.name, 120), phone: str(input.phone, 30), total: input.total, balance: input.balance, kind: str(input.kind, 60),
      link: str(input.link, 300), sent_by: staff.id
    });
    if (error) return bad(error.message);
    refresh();
    return ok("Logged.");
  });
}

// ───────────────────────────── importing the workbook ─────────────────────────────

/** Brings the Excel workbook's records in (admin only). Running it again with a newer copy updates them. */
export async function importWorkbook(plan: ImportPlan) {
  return guard(async () => {
    const db = adminClient();
    const say: string[] = [];
    const fail = (where: string, e: { message: string } | null) => {
      if (e) throw new Error(`${where}: ${e.message}`);
    };

    // settings and wording
    if (plan.settings && Object.keys(plan.settings).length) {
      const s = { ...plan.settings } as Record<string, unknown>;
      delete s.brand_name; // keep the co-branded name set on the website
      const { error } = await db.from("office_settings").update({ ...s, updated_at: new Date().toISOString() }).eq("id", 1);
      fail("Settings", error);
    }
    if (plan.messages?.length) {
      const { error } = await db.from("office_messages").upsert(plan.messages.map(m => ({ key: m.key, en: m.en, ar: m.ar })), { onConflict: "key" });
      fail("Messages", error);
    }

    // sellers and buyers (by code)
    if (plan.sellers.length) {
      const { error } = await db.from("sellers").upsert(plan.sellers, { onConflict: "code" });
      fail("Sellers", error);
    }
    const sellerId = new Map((await fetchAll<{ id: string; code: string }>(db, "sellers", "id, code", "code")).map(s => [s.code.toUpperCase(), s.id]));
    const sellerKind = new Map(plan.sellers.map(s => [s.code, s]));
    if (plan.customers.length) {
      const rows = plan.customers.map(c => ({ ...c, instagram: c.instagram ? normIg(c.instagram) : null }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from("customers").upsert(rows.slice(i, i + 500), { onConflict: "code" });
        fail("Buyers", error);
      }
    }
    const custId = new Map((await fetchAll<{ id: string; code: string }>(db, "customers", "id, code", "code")).map(c => [c.code.toUpperCase(), c.id]));

    // auctions (by number); new ones are Instagram-only (they ran on Instagram): real auctions, kept off the website
    const { data: existingAuctions } = await db.from("auctions").select("id, number");
    const auctionId = new Map((existingAuctions || []).map(a => [a.number as number, a.id as string]));
    for (const a of plan.auctions) {
      const live = `${a.sale_date}T${a.live_time || "21:00"}:00+04:00`;
      const office = { pay_clock: a.pay_clock || null, office_notes: a.office_notes, lot_target: a.lot_target };
      if (auctionId.has(a.number)) {
        const { error } = await db.from("auctions").update(office).eq("id", auctionId.get(a.number)!);
        fail(`Auction ${a.number}`, error);
      } else {
        const prebid = new Date(Date.parse(live) - 3 * 86400e3).toISOString();
        const { data, error } = await db
          .from("auctions")
          .insert({ number: a.number, sale_date: a.sale_date, live_starts_at: new Date(Date.parse(live)).toISOString(), prebid_opens_at: prebid, status: "draft", instagram: true, ...office })
          .select("id")
          .single();
        fail(`Auction ${a.number}`, error);
        auctionId.set(a.number, data!.id);
        say.push(`Auction ${a.number} added as Instagram only (not on the website).`);
      }
    }

    // intake
    if (plan.intake.length) {
      const rows = plan.intake.map(({ seller_code, ...i }) => ({ ...i, seller_id: seller_code ? sellerId.get(seller_code) || null : null }));
      const { error } = await db.from("intake_items").upsert(rows, { onConflict: "item_id" });
      fail("Intake", error);
    }
    const intakeId = new Map((await fetchAll<{ id: string; item_id: string }>(db, "intake_items", "id, item_id", "item_id")).map(i => [i.item_id.toUpperCase(), i.id]));

    // lots (by auction + lot number): website lots keep their photos and descriptions
    const lotIds = new Map<string, string>();
    for (const [num, id] of auctionId) {
      const { data } = await db.from("lots").select("id, lot_number").eq("auction_id", id);
      for (const l of data || []) lotIds.set(`${num}-${l.lot_number}`, l.id);
    }
    const wanted = plan.lots.filter(l => auctionId.has(l.auction_number));
    const fresh = wanted.filter(l => !lotIds.has(`${l.auction_number}-${l.lot_number}`));
    for (let i = 0; i < fresh.length; i += 200) {
      const { data, error } = await db
        .from("lots")
        .insert(
          fresh.slice(i, i + 200).map(l => ({
            auction_id: auctionId.get(l.auction_number)!, lot_number: l.lot_number, brand: l.brand, model: l.model, reference: l.reference, year: l.year,
            condition: l.condition || "Excellent", start_price: l.start_price, has_box: /box|full/i.test(l.box_papers), has_papers: /papers|full/i.test(l.box_papers), no_reserve: !l.reserve
          }))
        )
        .select("id, auction_id, lot_number");
      fail("Lots", error);
      const numOf = new Map([...auctionId].map(([n, id]) => [id, n]));
      for (const r of data || []) lotIds.set(`${numOf.get(r.auction_id as string)}-${r.lot_number}`, r.id as string);
    }
    const newLots = fresh.length;
    const privRows = wanted.map(l => {
      const s = l.seller_code ? sellerKind.get(l.seller_code) : undefined;
      return {
        lot_id: lotIds.get(`${l.auction_number}-${l.lot_number}`)!, reserve: l.reserve && l.reserve > 0 ? Math.round(l.reserve) : null, cost: l.cost == null ? null : Math.round(l.cost),
        seller_fee: l.fee_pct, fee_fixed: l.fee_fixed, seller_id: l.seller_code ? sellerId.get(l.seller_code) || null : null, source: s && s.kind !== "own" ? "consign" : "stock",
        consignor_name: s && s.kind !== "own" ? s.name : "", intake_item_id: l.intake_item ? intakeId.get(l.intake_item) || null : null, serial: l.serial, box_papers: l.box_papers,
        intake_date: l.intake_date, winner_customer_id: l.winner_code ? custId.get(l.winner_code) || null : null, winner_text: l.winner_text, hammer: l.hammer,
        underbidder: l.underbidder, underbid: l.underbid, exception: l.exception, delivery_status: l.delivery_status, dispatched_on: l.dispatched_on, courier: l.courier,
        seller_paid_on: l.seller_paid_on, payout_ref: l.payout_ref, office_notes: l.office_notes, tray: l.tray == null ? null : Math.round(l.tray), slip_printed_at: l.slip_printed_at,
        updated_at: new Date().toISOString()
      };
    });
    for (let i = 0; i < privRows.length; i += 200) {
      const { error } = await db.from("lot_private").upsert(privRows.slice(i, i + 200), { onConflict: "lot_id" });
      fail("Lots (office details)", error);
    }

    // invoices: adjustments, payments, what was sent, card links
    if (plan.adjustments.length) {
      const { error } = await db.from("invoice_adjustments").upsert(plan.adjustments, { onConflict: "invoice_no" });
      fail("Adjustments", error);
    }
    if (plan.ledger.length) {
      const rows = plan.ledger.map(({ customer_code, ...e }) => ({ ...e, customer_id: customer_code ? custId.get(customer_code) || null : null, entry_date: e.entry_date || new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10) }));
      const { error } = await db.from("ledger").upsert(rows, { onConflict: "import_ref" });
      fail("Payments", error);
    }
    if (plan.sent.length) {
      for (let i = 0; i < plan.sent.length; i += 500) {
        const { error } = await db.from("sent_log").upsert(plan.sent.slice(i, i + 500), { onConflict: "import_ref" });
        fail("Sent Log", error);
      }
    }
    if (plan.cards.length) {
      const rows = plan.cards.map(({ customer_code, ...c }) => ({ ...c, customer_id: customer_code ? custId.get(customer_code) || null : null }));
      const { error } = await db.from("card_links").upsert(rows, { onConflict: "import_ref" });
      fail("Card Links", error);
    }

    refresh();
    revalidatePath("/admin/auctions");
    return ok(
      [
        `Imported ${plan.lots.length} lots (${newLots} new), ${plan.customers.length} buyers, ${plan.sellers.length} sellers, ${plan.ledger.length} payments and ${plan.sent.length} sent messages.`,
        ...say
      ].join(" ")
    );
  }, true);
}
