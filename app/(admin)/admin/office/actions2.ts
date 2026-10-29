"use server";
// Back office actions, part 2: sellers and payouts, intake, card links, settings and wording.
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireStaff, type Staff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import { normIg, toE164 } from "@/lib/format";
import { compute, invoiceNo, nextItemId, nextReceiptNo, r2, settleCash, type LotView } from "@/lib/office/engine";
import { fetchAll, loadOfficeData } from "@/lib/office/load";
import { checkOpenCardLinks, makeCardLink } from "@/lib/office/cards";
import { MESSAGE_KEYS } from "@/lib/office/messages";
import { BOX_PAPERS, CONDITIONS, DEFAULT_SETTINGS, type IntakeItem } from "@/lib/office/types";
import type { Result } from "../actions";
import { booksClosedUpTo, closedMessage } from "@/lib/office/lock";
import { deliveryPlan, isDeliveryStep, stepWords, stillOwes } from "@/lib/office/delivery";

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
const amount = (v: unknown) => {
  const t = String(v ?? "").replace(/[^\d.-]/g, "");
  if (!t) return null;
  const x = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(x) ? x : null;
};
const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);

// ───────────────────────────── sellers ─────────────────────────────

export type SellerInput = {
  id?: string; code: string; name: string; kind: string; phone: string; instagram: string; email: string; id_checked: string;
  fee_pct: string; fee_fixed: string; bank: string; iban: string; notes: string;
};

async function nextSellerCode() {
  const rows = await fetchAll<{ code: string }>(adminClient(), "sellers", "code", "code");
  let max = 0;
  for (const r of rows) {
    const m = /^S(\d+)$/i.exec(r.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `S${String(max + 1).padStart(3, "0")}`;
}

function sellerRow(input: SellerInput) {
  const phoneRaw = str(input.phone, 40);
  const phone = phoneRaw ? toE164(phoneRaw) : "";
  if (phoneRaw && !phone) throw new Error("That WhatsApp number doesn't look right. Include the country code, e.g. +971 50 123 4567.");
  const fee = str(input.fee_pct) === "" ? null : amount(input.fee_pct);
  const fixed = str(input.fee_fixed) === "" ? null : amount(input.fee_fixed);
  if ((fee ?? 0) < 0 || (fee ?? 0) > 100) throw new Error("The fee % should be between 0 and 100.");
  if ((fixed ?? 0) < 0) throw new Error("The fixed fee can't be negative.");
  return {
    name: str(input.name, 120), kind: input.kind === "own" ? "own" : "consignment", phone, instagram: normIg(input.instagram) || "", email: str(input.email, 160),
    id_checked: str(input.id_checked, 80), fee_pct: fee, fee_fixed: fixed, bank: str(input.bank, 80), iban: str(input.iban, 60), notes: str(input.notes, 1000)
  };
}

export async function saveSeller(input: SellerInput) {
  return guard(async () => {
    const row = sellerRow(input);
    if (!row.name) return bad("Type the seller's name.");
    const db = adminClient();
    if (input.id) {
      const { error } = await db.from("sellers").update({ ...row, updated_at: new Date().toISOString() }).eq("id", input.id);
      if (error) return bad(error.message);
      refresh();
      return ok("Seller saved.", input.id);
    }
    const code = (str(input.code, 12).toUpperCase() || (await nextSellerCode())).replace(/\s+/g, "");
    const { error } = await db.from("sellers").insert({ ...row, code });
    if (error) return bad(error.code === "23505" ? `Seller ID ${code} is already used.` : error.message);
    refresh();
    return ok(`Seller ${code} added.`, code);
  });
}

/**
 * Deletes a seller added by mistake (admin only). Refused while they have lots, intake receipts, payments made to them
 * directly by buyers, or settlements: those keep the seller on record.
 */
export async function deleteSeller(id: string) {
  return guard(async () => {
    const db = adminClient();
    const { data: x, error } = await db.from("sellers").select("id, code, name, demo").eq("id", id).maybeSingle();
    if (error) return bad(error.message);
    if (!x) return bad("That seller isn't there any more.");
    if (x.demo) return bad("This is a demo seller: remove the demo under Settings › Demo auction.");
    const [{ data: lots }, { data: intake }, { data: direct }] = await Promise.all([
      db.from("lot_private").select("lot_id").eq("seller_id", id),
      db.from("intake_items").select("receipt_no").eq("seller_id", id),
      db.from("ledger").select("id").eq("paid_to_seller_id", id)
    ]);
    if (lots?.length) return bad(`${x.code} has ${lots.length} lot${lots.length === 1 ? "" : "s"}. Give them another seller (Lots › Lot details) or delete them first.`);
    if (intake?.length) return bad(`${x.code} has intake receipt${new Set(intake.map(i => i.receipt_no)).size === 1 ? "" : "s"} ${[...new Set(intake.map(i => i.receipt_no))].join(", ")}, so they stay on record.`);
    if (direct?.length) return bad(`Buyers paid ${x.code} directly (${direct.length} payment${direct.length === 1 ? "" : "s"}). Remove those on Payments first, or keep the seller.`);
    const { data: settled, error: se } = await db.from("seller_settlements").select("id").eq("seller_id", id).limit(1);
    if (!se && settled?.length) return bad(`${x.code} has settlements on their account, so they stay on record.`);
    const { error: e2 } = await db.from("sellers").delete().eq("id", id);
    if (e2) return bad(e2.message);
    refresh();
    return ok(`Seller ${x.code} · ${x.name} deleted.`);
  }, true);
}

export type SettlementInput = { seller_id: string; direction: "paid_us" | "we_paid"; amount: string; date: string; account: string; reference: string; notes: string };

/** Money settled with a seller outside a lot payout: they paid us back what buyers paid them for others, or we paid them on account. */
export async function recordSettlement(input: SettlementInput) {
  return guard(async staff => {
    const amt = amount(input.amount);
    if (!amt || amt <= 0) return bad("Type the amount.");
    if (amt > 5000000) return bad("That amount looks too large.");
    const date = ymd(input.date) || today();
    const lock = await booksClosedUpTo();
    if (lock && date <= lock) return bad(closedMessage(lock));
    const db = adminClient();
    const { data: x } = await db.from("sellers").select("id, code, kind").eq("id", input.seller_id).maybeSingle();
    if (!x) return bad("Choose the seller.");
    if (x.kind === "own") return bad("That's our own stock.");
    const signed = input.direction === "we_paid" ? amt : -amt;
    const { error } = await db.from("seller_settlements").insert({
      seller_id: x.id, entry_date: date, amount: signed, account_code: str(input.account, 6), reference: str(input.reference, 120), notes: str(input.notes, 300), created_by: staff.id
    });
    if (error) return bad(/seller_settlements/.test(error.message) ? "Run supabase/migrations/0009_seller_settlements.sql in Supabase first." : error.message);
    refresh();
    return ok(signed < 0 ? `Recorded: ${x.code} paid us AED ${amt.toLocaleString("en-US")}.` : `Recorded: we paid ${x.code} AED ${amt.toLocaleString("en-US")} on account.`);
  });
}

/** Removes a settlement typed by mistake (admin only). */
export async function deleteSettlement(id: string) {
  return guard(async () => {
    const db = adminClient();
    const { data: row } = await db.from("seller_settlements").select("entry_date").eq("id", id).maybeSingle();
    if (!row) return bad("That settlement isn't there any more.");
    const lock = await booksClosedUpTo();
    if (lock && row.entry_date <= lock) return bad(closedMessage(lock));
    const { error } = await db.from("seller_settlements").delete().eq("id", id);
    if (error) return bad(error.message);
    refresh();
    return ok("Removed.");
  }, true);
}

/**
 * Settles sold lots with their seller. Each lot remembers the cash that moved: its net, less anything the buyer paid
 * the seller directly (which can leave the seller owing us the difference: a negative amount, money in).
 */
export async function markSellerPaid(input: { lotIds: string[]; date: string; ref: string; account?: string; takeOff?: boolean }) {
  return guard(async () => {
    if (!input.lotIds?.length) return bad("Choose the lots paid.");
    const date = ymd(input.date) || today();
    const lock = await booksClosedUpTo();
    if (lock && date <= lock) return bad(closedMessage(lock));
    const o = compute(await loadOfficeData());
    const picked = input.lotIds.slice(0, 500).map(id => o.lotsById.get(id)).filter((l): l is LotView => !!l && l.sold && l.type === "Consignment" && !l.seller_paid_on);
    if (!picked.length) return bad("Those lots are already settled (refresh the page).");
    // only money buyers had paid the seller by the payout date comes off (and none, when staff say they paid in full)
    const cash = settleCash(picked.map(l => l.settle).filter((x): x is NonNullable<LotView["settle"]> => !!x), date, input.takeOff !== false);
    const db = adminClient();
    const base = { seller_paid_on: date, payout_ref: str(input.ref, 80), ...(input.account ? { payout_account: str(input.account, 6) } : {}), updated_at: new Date().toISOString() };
    for (const l of picked) {
      const { error } = await db.from("lot_private").update({ ...base, payout_amount: cash.get(l.id) ?? l.net }).eq("lot_id", l.id);
      if (error) return bad(error.message);
    }
    refresh();
    const total = r2(picked.reduce((t, l) => t + (cash.get(l.id) ?? l.net), 0));
    const n = `${picked.length} lot${picked.length === 1 ? "" : "s"}`;
    return ok(total >= 0 ? `${n} settled: AED ${total.toLocaleString("en-US")} paid to the seller.` : `${n} settled: the seller paid us AED ${(-total).toLocaleString("en-US")}.`);
  });
}

// ───────────────────────────── delivery ─────────────────────────────

/** Packed, with the courier, delivered or collected: for whole invoices at once (one, or many ticked on a list). */
export async function setInvoiceDelivery(input: { nos: string[]; step: string; date?: string; courier?: string }) {
  return guard(async () => {
    if (!isDeliveryStep(input.step)) return bad("Choose packed, with courier or delivered.");
    const step = input.step;
    const nos = [...new Set((input.nos || []).map(n => str(n, 40).toUpperCase()).filter(Boolean))].slice(0, 300);
    if (!nos.length) return bad("Tick the invoices first.");
    const o = compute(await loadOfficeData());
    const gone = nos.filter(n => !o.invoicesByNo.get(n));
    if (gone.length) return bad(`No open invoice ${gone.join(", ")} (refresh the page).`);
    const invs = nos.map(n => o.invoicesByNo.get(n)!);
    const date = ymd(input.date) || today();
    const courier = input.courier == null ? undefined : str(input.courier, 300);
    // one update per distinct result, so a big list is a handful of requests
    const groups = new Map<string, { row: Record<string, unknown>; ids: string[] }>();
    for (const inv of invs) {
      for (const u of deliveryPlan(inv, step, date)) {
        const row = { delivery_status: u.delivery_status, dispatched_on: u.dispatched_on, ...(courier !== undefined ? { courier } : {}) };
        const k = JSON.stringify(row);
        const g = groups.get(k);
        if (g) g.ids.push(u.id);
        else groups.set(k, { row, ids: [u.id] });
      }
    }
    const db = adminClient();
    const now = new Date().toISOString();
    let lots = 0;
    for (const { row, ids } of groups.values()) {
      const { error } = await db.from("lot_private").update({ ...row, updated_at: now }).in("lot_id", ids);
      if (error) return bad(error.message);
      lots += ids.length;
    }
    refresh();
    const pickups = invs.filter(i => i.delivery === "Pickup").length;
    const what = invs.length === 1 ? invs[0].no : `${invs.length} invoices`;
    const handed = step === "Done" ? invs : step === "With courier" ? invs.filter(i => i.delivery !== "Pickup") : [];
    const owing = handed.filter(i => stillOwes(i) > 0);
    const warn = owing.length ? ` Not paid yet: ${owing.map(i => `${i.no} (AED ${stillOwes(i).toLocaleString("en-US")})`).join(", ")}.` : "";
    const skipped = step === "With courier" && pickups ? ` Pickup order${pickups === 1 ? "" : "s"} left as ${pickups === 1 ? "it was" : "they were"} (no courier).` : "";
    return ok(`${what} ${stepWords(step, pickups, invs.length - pickups)} (${lots} lot${lots === 1 ? "" : "s"}).${skipped}${warn}`);
  });
}

/** Undo payouts marked by mistake (or marked with the wrong amount), so they can be marked again. Admins only. */
export async function undoSellerPaid(lotIds: string[]) {
  return guard(async () => {
    const ids = (lotIds || []).slice(0, 500);
    if (!ids.length) return bad("Nothing to undo.");
    const db = adminClient();
    const { data: rows, error } = await db.from("lot_private").select("lot_id, seller_paid_on").in("lot_id", ids);
    if (error) return bad(error.message);
    const paid = (rows || []).filter(r => r.seller_paid_on);
    if (!paid.length) return bad("Those lots aren't marked paid (refresh the page).");
    const lock = await booksClosedUpTo();
    const locked = lock ? paid.filter(r => String(r.seller_paid_on) <= lock) : [];
    if (lock && locked.length) return bad(closedMessage(lock));
    const { error: e2 } = await db.from("lot_private")
      .update({ seller_paid_on: null, payout_amount: null, payout_ref: "", payout_account: "", updated_at: new Date().toISOString() })
      .in("lot_id", paid.map(r => r.lot_id));
    if (e2) return bad(e2.message);
    refresh();
    return ok(`${paid.length} lot${paid.length === 1 ? "" : "s"} back to not paid: mark them again with the right date and amount.`);
  }, true);
}

// ───────────────────────────── intake ─────────────────────────────

export type IntakeLine = {
  brand: string; model: string; reference: string; serial: string; year: string; box_papers: string; condition: string; notes: string;
  reserve: string; start_price: string; fee_pct: string; fee_fixed: string;
};

function intakeFields(l: IntakeLine) {
  return {
    brand: str(l.brand, 80), model: str(l.model, 160), reference: str(l.reference, 60), serial: str(l.serial, 60), year: str(l.year, 20),
    box_papers: (BOX_PAPERS as readonly string[]).includes(l.box_papers) ? l.box_papers : str(l.box_papers, 40),
    condition: (CONDITIONS as readonly string[]).includes(l.condition) ? l.condition : str(l.condition, 40), notes: str(l.notes, 500),
    reserve: amount(l.reserve), start_price: amount(l.start_price), fee_pct: str(l.fee_pct) === "" ? null : amount(l.fee_pct), fee_fixed: str(l.fee_fixed) === "" ? null : amount(l.fee_fixed)
  };
}

/** A seller hands over watches: one receipt (CR-0001), one row per watch (CR-0001-01…). */
export async function newIntake(input: { seller_id: string; newSeller?: SellerInput; received_on: string; received_by: string; id_checked: string; lines: IntakeLine[] }) {
  return guard(async staff => {
    const db = adminClient();
    let sellerId = input.seller_id;
    if (!sellerId && input.newSeller) {
      const row = sellerRow(input.newSeller);
      if (!row.name) return bad("Type the new seller's name.");
      const code = (str(input.newSeller.code, 12).toUpperCase() || (await nextSellerCode())).replace(/\s+/g, "");
      const { data, error } = await db.from("sellers").insert({ ...row, code, kind: "consignment" }).select("id").single();
      if (error) return bad(error.code === "23505" ? `Seller ID ${code} is already used.` : error.message);
      sellerId = data.id;
    }
    if (!sellerId) return bad("Choose the seller.");
    if (str(input.id_checked)) await db.from("sellers").update({ id_checked: str(input.id_checked, 80) }).eq("id", sellerId);
    const lines = (input.lines || []).map(intakeFields).filter(l => l.brand || l.model || l.reference || l.serial);
    if (!lines.length) return bad("Add at least one watch.");
    const items = await fetchAll<Pick<IntakeItem, "receipt_no" | "item_id">>(db, "intake_items", "receipt_no, item_id", "item_id");
    for (let attempt = 0; attempt < 3; attempt++) {
      const receipt = nextReceiptNo(items);
      const rows = lines.map((l, i) => ({
        ...l, receipt_no: receipt, item_id: `${receipt}-${String(i + 1).padStart(2, "0")}`, position: i + 1, seller_id: sellerId,
        received_on: ymd(input.received_on) || today(), received_by: str(input.received_by, 60) || staff.name
      }));
      const { error } = await db.from("intake_items").insert(rows);
      if (!error) {
        refresh();
        return ok(`Receipt ${receipt}: ${rows.length} watch${rows.length === 1 ? "" : "es"} received.`, receipt);
      }
      if (error.code !== "23505") return bad(error.message);
      items.push({ receipt_no: receipt, item_id: `${receipt}-01` });
    }
    return bad("Couldn't number the receipt. Try again.");
  });
}

/** More watches on an existing receipt. */
export async function addIntakeLines(input: { receipt_no: string; lines: IntakeLine[] }) {
  return guard(async staff => {
    const db = adminClient();
    const receipt = str(input.receipt_no, 20).toUpperCase();
    const { data: existing } = await db.from("intake_items").select("item_id, position, seller_id, received_on").eq("receipt_no", receipt).order("position");
    if (!existing?.length) return bad("Unknown receipt.");
    const lines = (input.lines || []).map(intakeFields).filter(l => l.brand || l.model || l.reference || l.serial);
    if (!lines.length) return bad("Add at least one watch.");
    const ids = existing.map(e => ({ item_id: e.item_id as string }));
    const rows = lines.map((l, i) => {
      const item_id = nextItemId(ids, receipt);
      ids.push({ item_id });
      return { ...l, receipt_no: receipt, item_id, position: existing.length + i + 1, seller_id: existing[0].seller_id, received_on: existing[0].received_on, received_by: staff.name };
    });
    const { error } = await db.from("intake_items").insert(rows);
    if (error) return bad(error.message);
    refresh();
    return ok(`Added ${rows.length} to ${receipt}.`);
  });
}

export async function saveIntakeItem(input: { id: string; line: IntakeLine; returned_on: string }) {
  return guard(async () => {
    const { error } = await adminClient().from("intake_items").update({ ...intakeFields(input.line), returned_on: ymd(input.returned_on), updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) return bad(error.message);
    refresh();
    return ok("Saved.");
  });
}

/** Watches from intake become lots of an auction, with their details, reserve and fees. */
export async function addToAuction(input: { itemIds: string[]; auctionId: string }) {
  return guard(async () => {
    const db = adminClient();
    if (!input.itemIds?.length) return bad("Choose the watches.");
    const { data: auction } = await db.from("auctions").select("id, number, demo").eq("id", input.auctionId).maybeSingle();
    if (!auction) return bad("Choose the auction.");
    const o = compute(await loadOfficeData());
    const items = o.intake.filter(i => input.itemIds.includes(i.id));
    const ready = items.filter(i => i.status === "In stock" || /: in stock$/.test(i.status));
    if (!ready.length) return bad("None of those watches is in stock (already in an auction, sold or returned).");
    if (ready.some(i => !!i.seller?.demo !== !!auction.demo)) {
      return bad(auction.demo ? "Only the demo sellers' watches go in the demo auction." : "Demo sellers' watches only go in the demo auction.");
    }
    const { data: last } = await db.from("lots").select("lot_number").eq("auction_id", auction.id).order("lot_number", { ascending: false }).limit(1).maybeSingle();
    let n = last?.lot_number || 0;
    const added: string[] = [];
    for (const it of ready) {
      n++;
      const { data: lot, error } = await db
        .from("lots")
        .insert({
          auction_id: auction.id, lot_number: n, brand: it.brand || "Watch", model: it.model, reference: it.reference, year: it.year, condition: it.condition || "Excellent",
          start_price: Math.max(0, Math.round(it.start_price || 0)), has_box: /box|full/i.test(it.box_papers), has_papers: /papers|full/i.test(it.box_papers), no_reserve: !it.reserve
        })
        .select("id")
        .single();
      if (error) return bad(`${it.item_id}: ${error.message}`);
      const { error: e2 } = await db.from("lot_private").upsert(
        {
          lot_id: lot.id, reserve: it.reserve && it.reserve > 0 ? Math.round(it.reserve) : null, seller_id: it.seller_id, source: it.seller?.kind === "own" ? "stock" : "consign",
          consignor_name: it.seller?.kind === "own" ? "" : it.seller?.name || "", consignor_phone: it.seller?.phone || "", seller_fee: it.fee_pct, fee_fixed: it.fee_fixed,
          intake_item_id: it.id, serial: it.serial, box_papers: it.box_papers, intake_date: it.received_on, office_notes: it.notes
        },
        { onConflict: "lot_id" }
      );
      if (e2) return bad(`${it.item_id}: ${e2.message}`);
      added.push(`${auction.number}-${String(n).padStart(2, "0")}`);
    }
    refresh();
    const skipped = items.length - ready.length;
    return ok(`Added to auction ${auction.number} as lot${added.length === 1 ? "" : "s"} ${added.join(", ")}.${skipped ? ` ${skipped} skipped (not in stock).` : ""}`);
  });
}

// ───────────────────────────── card payment links ─────────────────────────────

const NO_DEMO_CARDS = "Card links are switched off for the demo auction and demo buyers: they would be real Ziina payment links.";

/** A Ziina card link for an invoice's balance, some lots, or a deposit. Its URL comes back in `id`. */
export async function createCardLink(input: { kind: "Invoice" | "Lot" | "Deposit"; invoice_no?: string; lot_ids?: string[]; customer_id?: string; amount?: string }) {
  return guard(async () => {
    const o = compute(await loadOfficeData());
    const s = o.data.settings;
    const rate = (s.card_fee_pct || 0) / 100;
    if (input.kind === "Invoice") {
      const inv = o.invoicesByNo.get(str(input.invoice_no, 40).toUpperCase());
      if (!inv) return bad("Unknown invoice.");
      if (inv.demo || inv.customer.demo) return bad(NO_DEMO_CARDS);
      if (inv.balance <= 0) return bad("This invoice is paid.");
      const link = await makeCardLink({
        kind: "Invoice", invoiceNo: inv.no, lotKey: inv.lots.map(l => l.key).join(", "), customerId: inv.customer.id, name: inv.customer.full_name || inv.customer.code,
        amount: inv.balance, cardAmount: inv.cardAmount, expiresAt: inv.due && inv.due > Date.now() ? new Date(inv.due).toISOString() : null, what: `Invoice ${inv.no}`
      });
      refresh();
      return ok(`Card link for AED ${inv.cardAmount.toLocaleString("en-US")} made.`, link.url);
    }
    if (input.kind === "Lot") {
      const lots = o.lots.filter(l => (input.lot_ids || []).includes(l.id) && l.sold && l.customer);
      if (!lots.length) return bad("Choose sold lots with a buyer.");
      if (new Set(lots.map(l => l.customer!.id)).size > 1) return bad("Those lots have different buyers.");
      if (lots.some(l => l.demo || l.customer?.demo)) return bad(NO_DEMO_CARDS);
      const amt = r2(lots.reduce((t, l) => t + (l.hammer || 0), 0));
      const card = r2(amt * (1 + rate));
      const c = lots[0].customer!;
      const link = await makeCardLink({
        kind: "Lot", invoiceNo: lots[0].invoiceNo || invoiceNo(lots[0].auctionNo, c.code), lotKey: lots.map(l => l.key).join(", "), customerId: c.id, name: c.full_name || c.code,
        amount: amt, cardAmount: card, expiresAt: null, what: `Lot${lots.length > 1 ? "s" : ""} ${lots.map(l => l.key).join(", ")}`
      });
      refresh();
      return ok(`Card link for AED ${card.toLocaleString("en-US")} made.`, link.url);
    }
    const c = o.data.customers.find(x => x.id === input.customer_id);
    const amt = amount(input.amount);
    if (!c) return bad("Choose the buyer.");
    if (c.demo) return bad(NO_DEMO_CARDS);
    if (!amt || amt <= 0) return bad("Type the deposit amount.");
    const card = r2(amt * (1 + rate));
    const link = await makeCardLink({ kind: "Deposit", invoiceNo: "", lotKey: "", customerId: c.id, name: c.full_name || c.code, amount: amt, cardAmount: card, expiresAt: null, what: `Deposit, buyer ${c.code}` });
    refresh();
    return ok(`Card link for AED ${card.toLocaleString("en-US")} made.`, link.url);
  });
}

/** A link pasted by hand (made in the Ziina app): recorded so it shows on the invoice and in messages. */
export async function savePastedLink(input: { invoice_no: string; url: string; card_amount: string }) {
  return guard(async () => {
    const url = str(input.url, 400);
    if (!/^https:\/\//.test(url)) return bad("Paste the full link (https://…).");
    const o = compute(await loadOfficeData());
    const inv = o.invoicesByNo.get(str(input.invoice_no, 40).toUpperCase());
    if (!inv) return bad("Unknown invoice.");
    if (inv.demo) return bad(NO_DEMO_CARDS);
    const card = amount(input.card_amount) || inv.cardAmount;
    const { error } = await adminClient().from("card_links").insert({
      kind: "Invoice", invoice_no: inv.no, lot_key: inv.lots.map(l => l.key).join(", "), customer_id: inv.customer.id, name: inv.customer.full_name || inv.customer.code,
      amount: inv.balance, fee: r2(card - inv.balance), card_amount: card, url, status: "pasted (check payment yourself)"
    });
    if (error) return bad(error.message);
    refresh();
    return ok("Link saved. Record the payment on Payments once it's paid.", url);
  });
}

export async function checkCardPayments() {
  return guard(async () => {
    const r = await checkOpenCardLinks(60);
    refresh();
    return ok(r.checked ? `Checked ${r.checked} open link${r.checked === 1 ? "" : "s"}: ${r.paid} paid and recorded on Payments.` : "No open card links to check.");
  });
}

// ───────────────────────────── auctions, slips ─────────────────────────────

export async function saveAuctionOffice(input: { id: string; pay_clock: string; lot_target: string; office_notes: string }) {
  return guard(async () => {
    const clock = /^\d{2}:\d{2}$/.test(input.pay_clock || "") ? input.pay_clock : null;
    const target = Math.round(amount(input.lot_target) || 0) || null;
    const { error } = await adminClient().from("auctions").update({ pay_clock: clock, lot_target: target, office_notes: str(input.office_notes, 500) }).eq("id", input.id);
    if (error) return bad(error.message);
    refresh();
    return ok("Auction saved.");
  });
}

export async function markSlipsPrinted(lotIds: string[]) {
  return guard(async () => {
    if (!lotIds?.length) return ok("Nothing to mark.");
    const { error } = await adminClient().from("lot_private").update({ slip_printed_at: new Date().toISOString() }).in("lot_id", lotIds.slice(0, 200));
    if (error) return bad(error.message);
    refresh();
    return ok("Noted.");
  });
}

// ───────────────────────────── settings and wording (admin) ─────────────────────────────

const TEXT_KEYS = ["trading_name", "legal_name", "licence", "address", "phone", "email", "instagram", "website", "trn", "brand_name", "bank_name", "bank_account", "bank_iban", "bank_swift", "inv_note", "inv_terms", "seller_terms", "intake_terms", "slip_note"] as const;
const NUM_KEYS = ["fee_pct", "fee_fixed", "fee_min", "vat_fee_pct", "vat_sales_pct", "hours_to_pay", "uae_fee", "cod_fee", "card_fee_pct", "cash_alert", "remind_gap_hours", "lot_target"] as const;

export async function saveOfficeSettings(input: Record<string, string | string[]>) {
  return guard(async () => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of TEXT_KEYS) if (k in input) row[k] = str(input[k], k.endsWith("terms") ? 3000 : 300);
    for (const k of NUM_KEYS) {
      if (!(k in input)) continue;
      const v = amount(input[k]);
      if (v == null || v < 0) return bad(`${k.replace(/_/g, " ")}: type a number (0 or more).`);
      row[k] = ["hours_to_pay", "remind_gap_hours", "lot_target"].includes(k) ? Math.round(v) : v;
    }
    if ("pay_clock" in input) {
      if (!/^\d{2}:\d{2}$/.test(String(input.pay_clock))) return bad("Payment clock: pick a time.");
      row.pay_clock = input.pay_clock;
    }
    if ("wa_lang" in input) row.wa_lang = ["both", "en", "ar"].includes(String(input.wa_lang)) ? input.wa_lang : DEFAULT_SETTINGS.wa_lang;
    if ("wa_mode" in input) row.wa_mode = input.wa_mode === "web" ? "web" : "app";
    if ("link_mode" in input) row.link_mode = input.link_mode === "always" ? "always" : "ask";
    if ("card_fee_methods" in input) {
      const list = (Array.isArray(input.card_fee_methods) ? input.card_fee_methods : String(input.card_fee_methods).split(",")).map(x => str(x, 40)).filter(Boolean);
      row.card_fee_methods = list;
    }
    const { error } = await adminClient().from("office_settings").update(row).eq("id", 1);
    if (error) return bad(error.message);
    refresh();
    return ok("Settings saved. Invoices and messages use them now.");
  }, true);
}

/** Changes one message's wording (blank = the default). */
export async function saveMessage(input: { key: string; en: string; ar: string }) {
  return guard(async () => {
    if (!MESSAGE_KEYS.has(input.key)) return bad("Unknown message.");
    const en = String(input.en ?? "").slice(0, 2000);
    const ar = String(input.ar ?? "").slice(0, 2000);
    const db = adminClient();
    const { error } = !en.trim() && !ar.trim()
      ? await db.from("office_messages").delete().eq("key", input.key)
      : await db.from("office_messages").upsert({ key: input.key, en: en.trim() ? en : null, ar: ar.trim() ? ar : null, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return bad(error.message);
    refresh();
    return ok(!en.trim() && !ar.trim() ? "Back to the default wording." : "Wording saved.");
  }, true);
}
