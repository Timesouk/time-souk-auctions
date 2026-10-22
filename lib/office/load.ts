// Loads everything the back office works from (server only).
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";
import { IS_PREVIEW } from "../env";
import { compute, withoutDemo, type Office } from "./engine";
import { sampleAccounting, sampleOffice } from "./sample";
import { buildJournal, type Journal } from "./accounting";
import {
  DEFAULT_ACCT_METHODS, DEFAULT_SETTINGS,
  type Account, type AcctData, type Cleared, type ManualEntry, type Reconciliation,
  type Adjustment, type CardLink, type Customer, type IntakeItem, type LedgerEntry, type MessageOverrides, type OAuction,
  type OfficeData, type OfficeSettings, type OLot, type Seller, type SentLog
} from "./types";

const PAGE = 1000;

/** Every row of a table (Supabase returns at most 1000 at a time). */
export async function fetchAll<T>(db: SupabaseClient, table: string, select: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(select).order(order).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const hm = (v: unknown) => (v ? String(v).slice(0, 5) : null);

export function toSettings(row: Record<string, unknown> | null | undefined): OfficeSettings {
  const s = { ...DEFAULT_SETTINGS, ...(row || {}) } as OfficeSettings;
  for (const k of ["fee_pct", "fee_fixed", "fee_min", "vat_fee_pct", "vat_sales_pct", "hours_to_pay", "uae_fee", "cod_fee", "card_fee_pct", "cash_alert", "remind_gap_hours", "lot_target"] as const) {
    (s as Record<string, unknown>)[k] = Number((s as Record<string, unknown>)[k]) || 0;
  }
  s.pay_clock = hm(s.pay_clock) || "21:00";
  const m = (row?.acct_methods && typeof row.acct_methods === "object" ? row.acct_methods : {}) as Record<string, string>;
  s.acct_methods = { ...DEFAULT_ACCT_METHODS, ...m };
  s.acct_payout_default = String(row?.acct_payout_default || "1020");
  s.acct_lock_date = row?.acct_lock_date ? String(row.acct_lock_date).slice(0, 10) : null;
  return s;
}

type LotRow = Record<string, unknown> & { lot_private: Record<string, unknown> | Record<string, unknown>[] | null };

export function toLot(r: LotRow): OLot {
  const p = (Array.isArray(r.lot_private) ? r.lot_private[0] : r.lot_private) || {};
  return {
    id: String(r.id), auction_id: String(r.auction_id), lot_number: Number(r.lot_number), brand: String(r.brand || ""), model: String(r.model || ""),
    reference: String(r.reference || ""), year: String(r.year || ""), condition: String(r.condition || ""), start_price: Number(r.start_price) || 0,
    has_box: !!r.has_box, has_papers: !!r.has_papers, current_bid: n(r.current_bid), ends_at: (r.ends_at as string) || null,
    no_reserve: !!r.no_reserve, reserve_met: !!r.reserve_met, made_pure: !!r.made_pure,
    leader_id: (p.leader_id as string) || null, leader_ig: (p.leader_ig as string) || null,
    reserve: n(p.reserve), cost: n(p.cost), seller_fee: n(p.seller_fee), fee_fixed: n(p.fee_fixed), seller_id: (p.seller_id as string) || null,
    intake_item_id: (p.intake_item_id as string) || null, serial: String(p.serial || ""), box_papers: String(p.box_papers || ""), intake_date: (p.intake_date as string) || null,
    winner_customer_id: (p.winner_customer_id as string) || null, winner_text: String(p.winner_text || ""), hammer: n(p.hammer), underbidder: String(p.underbidder || ""),
    underbid: n(p.underbid), exception: (p.exception as OLot["exception"]) || null, delivery_status: String(p.delivery_status || ""), dispatched_on: (p.dispatched_on as string) || null,
    courier: String(p.courier || ""), seller_paid_on: (p.seller_paid_on as string) || null, payout_ref: String(p.payout_ref || ""), payout_account: String(p.payout_account || ""), office_notes: String(p.office_notes || ""),
    tray: n(p.tray), slip_printed_at: (p.slip_printed_at as string) || null, payout_amount: n(p.payout_amount)
  };
}

export const LOT_SELECT =
  "id, auction_id, lot_number, brand, model, reference, year, condition, start_price, has_box, has_papers, current_bid, ends_at, no_reserve, reserve_met, made_pure, lot_private(*)";

const nums = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
  rows.map(r => {
    const o: Record<string, unknown> = { ...r };
    for (const k of keys) o[k] = n(o[k]);
    return o as T;
  });

const NEEDS_0008 = "The back office needs one more database update: run supabase/migrations/0008_office_extras.sql in the Supabase SQL Editor, then reload this page.";

/** All the back office's records, as one snapshot. */
export async function loadOfficeData(): Promise<OfficeData> {
  if (IS_PREVIEW) return sampleOffice(Date.now(), true);
  try {
    return await loadLive();
  } catch (e) {
    const m = (e as Error).message || "";
    if (/does not exist/.test(m) && /instagram|demo|paid_to_seller_id|payout_amount/.test(m)) throw new Error(NEEDS_0008);
    throw e;
  }
}

async function loadLive(): Promise<OfficeData> {
  const db = adminClient();
  const [settingsRow, auctions, lots, customers, sellers, intake, adjustments, ledger, sent, cards, messages] = await Promise.all([
    db.from("office_settings").select("*").eq("id", 1).maybeSingle().then(r => {
      if (r.error) throw new Error(r.error.code === "42P01" ? "The back office isn't set up yet: run supabase/migrations/0006_back_office.sql in the Supabase SQL Editor." : r.error.message);
      return r.data;
    }),
    fetchAll<Record<string, unknown>>(db, "auctions", "id, number, sale_date, live_starts_at, status, pay_clock, office_notes, lot_target, instagram, demo", "number"),
    fetchAll<LotRow>(db, "lots", LOT_SELECT, "id"),
    fetchAll<Customer>(db, "customers", "id, code, instagram, full_name, phone, email, address, area, country, delivery, usual_pay, id_checked, flag, notes, lang, profile_id, demo", "code"),
    fetchAll<Seller>(db, "sellers", "id, code, name, kind, phone, instagram, email, id_checked, fee_pct, fee_fixed, bank, iban, notes, demo", "code"),
    fetchAll<IntakeItem>(db, "intake_items", "id, receipt_no, item_id, position, received_on, seller_id, brand, model, reference, serial, year, box_papers, condition, notes, reserve, start_price, fee_pct, fee_fixed, received_by, returned_on", "item_id"),
    fetchAll<Adjustment>(db, "invoice_adjustments", "invoice_no, delivery, pays_by, delivery_fee, discount, extra, extra_label, note", "invoice_no"),
    fetchAll<LedgerEntry>(db, "ledger", "id, seq, entry_date, kind, customer_id, invoice_no, method, amount, reference, received_by, notes, created_at, paid_to_seller_id", "seq"),
    fetchAll<SentLog>(db, "sent_log", "id, sent_at, ref, name, phone, total, balance, file, kind, link", "id"),
    fetchAll<CardLink>(db, "card_links", "id, created_at, kind, invoice_no, lot_key, customer_id, name, amount, fee, card_amount, expires_at, ziina_id, url, status, checked_at, ledger_id", "created_at"),
    fetchAll<{ key: string; en: string | null; ar: string | null }>(db, "office_messages", "key, en, ar", "key")
  ]);
  const overrides: MessageOverrides = {};
  for (const m of messages) overrides[m.key] = { en: m.en, ar: m.ar };
  return {
    settings: toSettings(settingsRow),
    auctions: auctions.map(a => ({
      id: String(a.id), number: Number(a.number), sale_date: String(a.sale_date), live_starts_at: String(a.live_starts_at), status: a.status as OAuction["status"],
      pay_clock: hm(a.pay_clock), office_notes: String(a.office_notes || ""), lot_target: n(a.lot_target), instagram: !!a.instagram, demo: !!a.demo
    })),
    lots: lots.map(toLot),
    customers,
    sellers: nums(sellers, ["fee_pct", "fee_fixed"]),
    intake: nums(intake, ["reserve", "start_price", "fee_pct", "fee_fixed"]),
    adjustments: nums(adjustments, ["delivery_fee", "discount", "extra"]),
    ledger: ledger.map(e => ({ ...e, seq: Number(e.seq), amount: Number(e.amount) })),
    sent: nums(sent, ["total", "balance"]),
    cards: nums(cards, ["amount", "fee", "card_amount"]).map(c => ({ ...c, amount: c.amount || 0, fee: c.fee || 0, card_amount: c.card_amount || 0 })),
    messages: overrides,
    now: Date.now()
  };
}

/** Everything, worked out. */
export async function loadOffice(): Promise<Office> {
  return compute(await loadOfficeData());
}

/**
 * The auction a page shows: ?a=<number> (the back office remembers the last one chosen, see middleware.ts),
 * else the latest real one with a date on or before today, else the latest real one. The demo auction only when chosen.
 */
export function pickAuction(o: Office, a?: string) {
  const list = o.data.auctions.slice().sort((x, y) => y.number - x.number);
  if (a) {
    const hit = list.find(x => String(x.number) === a);
    if (hit) return hit;
  }
  const real = list.filter(x => !x.demo);
  return real.find(x => x.sale_date <= o.today) || real[0] || list[0] || null;
}

/** The accounting records (chart, typed entries, reconciliations). */
export async function loadAcctData(): Promise<AcctData> {
  if (IS_PREVIEW) return sampleAccounting();
  const db = adminClient();
  const first = await db.from("acct_accounts").select("code").limit(1);
  if (first.error) {
    throw new Error(first.error.code === "42P01" ? "Accounting isn't set up yet: run supabase/migrations/0007_accounting.sql in the Supabase SQL Editor." : first.error.message);
  }
  const [accounts, entries, lines, cleared, recons] = await Promise.all([
    fetchAll<Account>(db, "acct_accounts", "code, name, type, subtype, system, active, notes", "code"),
    fetchAll<Omit<ManualEntry, "lines">>(db, "acct_entries", "id, entry_date, kind, memo, payee, reference, void, void_reason, created_at", "entry_date"),
    fetchAll<{ id: number; entry_id: string; account_code: string; debit: number; credit: number; memo: string }>(db, "acct_lines", "id, entry_id, account_code, debit, credit, memo", "id"),
    fetchAll<Cleared>(db, "acct_cleared", "key, account_code, cleared_on, reconciliation_id", "key"),
    fetchAll<Reconciliation>(db, "acct_reconciliations", "id, account_code, statement_date, statement_balance, cleared_balance, created_at", "statement_date")
  ]);
  const byEntry = new Map<string, ManualEntry["lines"]>();
  for (const l of lines) {
    const arr = byEntry.get(l.entry_id) || [];
    arr.push({ id: Number(l.id), account_code: l.account_code, debit: Number(l.debit), credit: Number(l.credit), memo: l.memo });
    byEntry.set(l.entry_id, arr);
  }
  return {
    accounts,
    entries: entries.map(e => ({ ...e, lines: byEntry.get(e.id) || [] })),
    cleared,
    recons: recons.map(r => ({ ...r, statement_balance: Number(r.statement_balance), cleared_balance: Number(r.cleared_balance) }))
  };
}

/** Everything the accounting pages need: the back office (without the demo auction), its accounting records and the journal. */
export async function loadAccounting(): Promise<{ o: Office; acct: AcctData; j: Journal }> {
  const [data, acct] = await Promise.all([loadOfficeData(), loadAcctData()]);
  const o = compute(withoutDemo(data));
  return { o, acct, j: buildJournal(o, acct) };
}
