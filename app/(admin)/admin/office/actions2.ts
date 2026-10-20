"use server";
// Back office actions, part 2: sellers and payouts, intake, card links, settings and wording.
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireStaff, type Staff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import { normIg, toE164 } from "@/lib/format";
import { compute, invoiceNo, nextItemId, nextReceiptNo, r2 } from "@/lib/office/engine";
import { fetchAll, loadOfficeData } from "@/lib/office/load";
import { checkOpenCardLinks, makeCardLink } from "@/lib/office/cards";
import { MESSAGE_KEYS } from "@/lib/office/messages";
import { BOX_PAPERS, CONDITIONS, DEFAULT_SETTINGS, type IntakeItem } from "@/lib/office/types";
import type { Result } from "../actions";
import { booksClosedUpTo, closedMessage } from "@/lib/office/lock";

const ok = (message: string, id?: string): Result => ({ ok: true, message, id });
const bad = (message: string): Result => ({ ok: false, message });

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

/** Marks sold lots as paid out to their seller. */
export async function markSellerPaid(input: { lotIds: string[]; date: string; ref: string; account?: string }) {
  return guard(async () => {
    if (!input.lotIds?.length) return bad("Choose the lots paid.");
    const date = ymd(input.date) || today();
    const lock = await booksClosedUpTo();
    if (lock && date <= lock) return bad(closedMessage(lock));
    const { error } = await adminClient()
      .from("lot_private")
      .update({ seller_paid_on: date, payout_ref: str(input.ref, 80), ...(input.account ? { payout_account: str(input.account, 6) } : {}), updated_at: new Date().toISOString() })
      .in("lot_id", input.lotIds.slice(0, 500));
    if (error) return bad(error.message);
    refresh();
    return ok(`${input.lotIds.length} lot${input.lotIds.length === 1 ? "" : "s"} marked as paid to the seller.`);
  });
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
    const { data: auction } = await db.from("auctions").select("id, number").eq("id", input.auctionId).maybeSingle();
    if (!auction) return bad("Choose the auction.");
    const o = compute(await loadOfficeData());
    const items = o.intake.filter(i => input.itemIds.includes(i.id));
    const ready = items.filter(i => i.status === "In stock" || /: in stock$/.test(i.status));
    if (!ready.length) return bad("None of those watches is in stock (already in an auction, sold or returned).");
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

/** A Ziina card link for an invoice's balance, some lots, or a deposit. Its URL comes back in `id`. */
export async function createCardLink(input: { kind: "Invoice" | "Lot" | "Deposit"; invoice_no?: string; lot_ids?: string[]; customer_id?: string; amount?: string }) {
  return guard(async () => {
    const o = compute(await loadOfficeData());
    const s = o.data.settings;
    const rate = (s.card_fee_pct || 0) / 100;
    if (input.kind === "Invoice") {
      const inv = o.invoicesByNo.get(str(input.invoice_no, 40).toUpperCase());
      if (!inv) return bad("Unknown invoice.");
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
