"use server";
// Accounting actions. Entries go through acct_post() in the database, which refuses anything unbalanced,
// to an unknown account, or dated on or before the closed-books date.
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireStaff, type Staff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import type { ManualKind } from "@/lib/office/types";
import type { Result } from "../../actions";

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
    const m = (e as Error).message || "Something went wrong";
    return bad(m.replace(/^acct: /, "").replace(/^(.)/, c => c.toUpperCase()));
  }
}

const refresh = () => revalidatePath("/admin/office", "layout");
const str = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);
const ymd = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const money = (v: unknown) => {
  const t = String(v ?? "").replace(/[^\d.-]/g, "");
  if (!t) return 0;
  const x = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(x) ? x : NaN;
};

export type LineInput = { account_code: string; debit: string | number; credit: string | number; memo?: string };
export type EntryInput = { kind: ManualKind; entry_date: string; memo: string; payee: string; reference: string; lines: LineInput[] };

/** Staff can record expenses, income, stock bought and transfers; owners' money, opening balances and journals are the admin's. */
const ADMIN_KINDS: ManualKind[] = ["owner", "opening", "journal"];

export async function postEntry(input: EntryInput) {
  return guard(async staff => {
    if (ADMIN_KINDS.includes(input.kind) && staff.role !== "admin") return bad("Only the admin can record this kind of entry.");
    const date = ymd(input.entry_date);
    if (!date) return bad("Choose the date.");
    const lines = (input.lines || [])
      .map(l => ({ account_code: str(l.account_code, 6), debit: money(l.debit), credit: money(l.credit), memo: str(l.memo, 300) }))
      .filter(l => l.account_code && (l.debit || l.credit));
    if (lines.some(l => !Number.isFinite(l.debit) || !Number.isFinite(l.credit) || l.debit < 0 || l.credit < 0)) return bad("Amounts must be numbers, 0 or more.");
    if (lines.length < 2) return bad("An entry needs at least two lines (where the money came from, and where it went).");
    const dr = Math.round(lines.reduce((t, l) => t + l.debit, 0) * 100);
    const cr = Math.round(lines.reduce((t, l) => t + l.credit, 0) * 100);
    if (dr !== cr) return bad(`Debits (${(dr / 100).toFixed(2)}) and credits (${(cr / 100).toFixed(2)}) must be equal.`);
    const { data, error } = await adminClient().rpc("acct_post", {
      p_entry: { entry_date: date, kind: input.kind, memo: str(input.memo, 500), payee: str(input.payee, 160), reference: str(input.reference, 160), created_by: staff.id },
      p_lines: lines
    });
    if (error) return bad(error.message.replace(/^acct: /, "").replace(/^(.)/, c => c.toUpperCase()));
    refresh();
    return ok("Saved to the books.", String(data));
  });
}

export async function voidEntry(id: string, reason: string) {
  return guard(async () => {
    if (!str(reason)) return bad("Say why (e.g. typed twice).");
    const { error } = await adminClient().rpc("acct_void", { p_id: id, p_reason: str(reason, 300) });
    if (error) return bad(error.message.replace(/^acct: /, "").replace(/^(.)/, c => c.toUpperCase()));
    refresh();
    return ok("Voided. It stays on record, struck out, and no longer counts.");
  }, true);
}

export type AccountInput = { code: string; name: string; type: string; subtype: string; active: boolean; notes: string; isNew: boolean };

export async function saveAccount(input: AccountInput) {
  return guard(async () => {
    const code = str(input.code, 6);
    const name = str(input.name, 120);
    if (!/^\d{3,6}$/.test(code)) return bad("The account code is 3 to 6 digits (e.g. 6120).");
    if (!name) return bad("Type the account's name.");
    const db = adminClient();
    if (input.isNew) {
      const type = ["asset", "liability", "equity", "income", "expense"].includes(input.type) ? input.type : "";
      if (!type) return bad("Choose the account type.");
      const { error } = await db.from("acct_accounts").insert({ code, name, type, subtype: str(input.subtype, 30), notes: str(input.notes, 300) });
      if (error) return bad(error.code === "23505" ? `Account ${code} already exists.` : error.message);
      refresh();
      return ok(`Account ${code} added.`);
    }
    const { data: cur } = await db.from("acct_accounts").select("system").eq("code", code).maybeSingle();
    if (!cur) return bad("Unknown account.");
    if (cur.system && !input.active) return bad("This account is used by the automatic journal: it can be renamed, not switched off.");
    const { error } = await db.from("acct_accounts").update({ name, active: !!input.active, notes: str(input.notes, 300) }).eq("code", code);
    if (error) return bad(error.message);
    refresh();
    return ok("Account saved.");
  }, true);
}

export async function saveAcctSettings(input: { methods: Record<string, string>; payout_default: string; lock_date: string }) {
  return guard(async () => {
    const db = adminClient();
    const { data: accts } = await db.from("acct_accounts").select("code, type, active");
    const asset = new Set((accts || []).filter(a => a.type === "asset" && a.active).map(a => a.code as string));
    const methods: Record<string, string> = {};
    for (const [m, code] of Object.entries(input.methods || {})) {
      if (!str(m) || !code) continue;
      if (!asset.has(code)) return bad(`"${m}" must land in an asset account (bank, cash or a payment provider).`);
      methods[str(m, 40)] = code;
    }
    if (!asset.has(input.payout_default)) return bad("Sellers are paid from an asset account (usually the bank).");
    const lock = input.lock_date ? ymd(input.lock_date) : null;
    if (input.lock_date && !lock) return bad("Pick the closing date.");
    const { error } = await db.from("office_settings").update({ acct_methods: methods, acct_payout_default: input.payout_default, acct_lock_date: lock, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return bad(error.message);
    refresh();
    return ok(lock ? `Saved. The books are closed up to ${lock}.` : "Saved. The books are open.");
  }, true);
}

/** Ticks lines off (or back on) against a bank statement. */
export async function setCleared(input: { account: string; keys: string[]; cleared: boolean; date: string }) {
  return guard(async () => {
    const keys = (input.keys || []).map(k => str(k, 200)).filter(Boolean).slice(0, 1000);
    if (!keys.length) return ok("Nothing to change.");
    const db = adminClient();
    const { error } = input.cleared
      ? await db.from("acct_cleared").upsert(keys.map(key => ({ key, account_code: str(input.account, 6), cleared_on: ymd(input.date) || new Date().toISOString().slice(0, 10) })), { onConflict: "key" })
      : await db.from("acct_cleared").delete().in("key", keys);
    if (error) return bad(error.message);
    refresh();
    return ok("Saved.");
  });
}

/** Records a finished reconciliation: the statement's closing balance and what was ticked off. */
export async function saveReconciliation(input: { account: string; statement_date: string; statement_balance: string; cleared_balance: number }) {
  return guard(async staff => {
    const date = ymd(input.statement_date);
    const bal = money(input.statement_balance);
    if (!date) return bad("Choose the statement date.");
    if (!Number.isFinite(bal)) return bad("Type the statement's closing balance.");
    const diff = Math.round((bal - input.cleared_balance) * 100) / 100;
    if (Math.abs(diff) > 0.004) return bad(`It doesn't reconcile yet: AED ${diff.toFixed(2)} difference. Tick the lines on the statement, or record what's missing (bank charges, a transfer).`);
    const { error } = await adminClient().from("acct_reconciliations").insert({ account_code: str(input.account, 6), statement_date: date, statement_balance: bal, cleared_balance: input.cleared_balance, created_by: staff.id });
    if (error) return bad(error.message);
    refresh();
    return ok(`Reconciled to ${date}.`);
  });
}
