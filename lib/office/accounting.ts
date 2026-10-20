// Double-entry accounting for the back office.
// The journal is built from the back office's own records (invoices, seller fees, cost of own stock, payments,
// deposits, refunds, seller payouts), plus the entries typed under Accounting (expenses, stock bought, transfers,
// owners' money, opening balances, corrections). Every report reads from that one journal.
import { r2, type Office } from "./engine";
import type { Account, AccountType, AcctData, ManualEntry } from "./types";

export type Source = "sale" | "fees" | "cogs" | "payment" | "deposit" | "refund" | "apply" | "payout" | "manual";

export type JLine = {
  /** Stable id of this line (used to tick it off on a bank reconciliation). */
  key: string;
  entry: string;
  date: string;
  account: string;
  debit: number;
  credit: number;
  memo: string;
};

export type JEntry = {
  id: string;
  date: string;
  source: Source;
  title: string;
  ref: string;
  href: string;
  lines: JLine[];
  manual?: ManualEntry;
};

export type Journal = {
  entries: JEntry[];
  lines: JLine[];
  accounts: Account[];
  byCode: Map<string, Account>;
  warnings: string[];
};

export const SOURCE_LABEL: Record<Source, string> = {
  sale: "Invoice", fees: "Seller fees", cogs: "Cost of stock sold", payment: "Payment", deposit: "Deposit", refund: "Refund",
  apply: "Deposit used", payout: "Seller payout", manual: "Entry"
};

/** The usual account for a payment method, when Settings doesn't name one. */
function guessAccount(method: string) {
  const m = method.toLowerCase();
  if (/cash on delivery|cod/.test(m)) return "1060";
  if (/tabby/.test(m)) return "1040";
  if (/tamara/.test(m)) return "1050";
  if (/card|ziina/.test(m)) return "1030";
  if (/cash/.test(m)) return "1010";
  if (/bank|transfer|iban/.test(m)) return "1020";
  return "1900";
}

const later = (a: string, b: string) => (a > b ? a : b);

/** The whole journal. */
export function buildJournal(o: Office, acct: AcctData): Journal {
  const s = o.data.settings;
  const byCode = new Map(acct.accounts.map(a => [a.code, a]));
  const warnings: string[] = [];
  const entries: JEntry[] = [];
  const known = (code: string) => byCode.has(code);
  const methodAcct = (method: string) => {
    const code = s.acct_methods?.[method] || guessAccount(method || "");
    if (known(code)) return code;
    warnings.push(`Payment method "${method || "(blank)"}" points to account ${code}, which isn't in the chart: booked to Suspense (1900).`);
    return "1900";
  };
  const add = (e: Omit<JEntry, "lines">, lines: Omit<JLine, "key" | "entry" | "date">[]) => {
    const ls = lines.filter(l => Math.abs(l.debit) > 0.004 || Math.abs(l.credit) > 0.004);
    if (!ls.length) return;
    const seen = new Map<string, number>();
    const out: JLine[] = ls.map(l => {
      const n = (seen.get(l.account) || 0) + 1;
      seen.set(l.account, n);
      return { ...l, debit: r2(l.debit), credit: r2(l.credit), key: `${e.id}|${l.account}${n > 1 ? `|${n}` : ""}`, entry: e.id, date: e.date };
    });
    const dr = r2(out.reduce((t, l) => t + l.debit, 0));
    const cr = r2(out.reduce((t, l) => t + l.credit, 0));
    if (Math.abs(dr - cr) > 0.004) {
      // never let a rounding difference unbalance the books: park it in Suspense and say so
      const diff = r2(dr - cr);
      out.push({ key: `${e.id}|1900|round`, entry: e.id, date: e.date, account: "1900", debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, memo: "Rounding" });
      warnings.push(`${e.title}: debits and credits differed by AED ${Math.abs(diff).toFixed(2)} (put in Suspense).`);
    }
    entries.push({ ...e, lines: out });
  };

  // ── sales: one entry per invoice, on the auction day
  for (const inv of o.invoices) {
    const date = inv.auction?.sale_date || o.today;
    const lines: Omit<JLine, "key" | "entry" | "date">[] = [];
    let own = 0;
    let consign = 0;
    for (const l of inv.lots) {
      if (l.type === "Consignment") consign += Number(l.hammer) || 0;
      else {
        own += Number(l.hammer) || 0;
        if (!l.seller_id) warnings.push(`Lot ${l.key} has no seller: counted as own stock.`);
      }
    }
    if (own) lines.push({ account: "4010", debit: 0, credit: own, memo: "Own-stock watches" });
    if (consign) lines.push({ account: "2100", debit: 0, credit: consign, memo: "Consigned watches (sold for the seller)" });
    if (inv.deliveryFee) lines.push({ account: "4200", debit: 0, credit: inv.deliveryFee, memo: "Delivery" });
    if (inv.cod) lines.push({ account: "4300", debit: 0, credit: inv.cod, memo: "Cash on delivery charge" });
    if (inv.extra) lines.push({ account: "4500", debit: 0, credit: inv.extra, memo: inv.extraLabel || "Other charges" });
    if (inv.discount) lines.push({ account: "4600", debit: inv.discount, credit: 0, memo: "Discount" });
    if (inv.vat) lines.push({ account: "2300", debit: 0, credit: inv.vat, memo: "VAT on the invoice" });
    const ar = r2(lines.reduce((t, l) => t + l.credit - l.debit, 0));
    if (Math.abs(ar - r2(inv.total - inv.cardFee)) > 0.01) warnings.push(`Invoice ${inv.no}: lines add up to ${ar}, the invoice to ${r2(inv.total - inv.cardFee)}.`);
    lines.unshift({ account: "1100", debit: ar, credit: 0, memo: `${inv.customer.code} ${inv.customer.full_name || ""}`.trim() });
    add({ id: `inv:${inv.no}`, date, source: "sale", title: `Invoice ${inv.no}`, ref: inv.no, href: `/admin/office/invoices/${inv.no}` }, lines);
    if (inv.feeMissing) warnings.push(`Invoice ${inv.no}: the overseas delivery fee isn't added yet.`);
  }

  // ── seller fees (and VAT on them), per seller per auction
  const feeGroups = new Map<string, { date: string; auction: number; seller: string; name: string; fee: number; vat: number; lots: string[] }>();
  // ── cost of own-stock watches sold, per auction
  const cogs = new Map<string, { date: string; auction: number; cost: number; lots: string[] }>();
  // ── seller payouts, per seller, day, account and reference
  const payouts = new Map<string, { date: string; seller: string; name: string; account: string; ref: string; net: number; lots: string[] }>();
  for (const l of o.lots) {
    if (!l.sold) continue;
    const date = l.auction?.sale_date || o.today;
    if (l.type === "Consignment") {
      const k = `${l.auctionNo}:${l.seller?.code}`;
      const g = feeGroups.get(k) || { date, auction: l.auctionNo, seller: l.seller?.code || "", name: l.seller?.name || "", fee: 0, vat: 0, lots: [] };
      g.fee += l.fee;
      g.vat += l.vatFee;
      g.lots.push(l.key);
      feeGroups.set(k, g);
      if (l.seller_paid_on) {
        const account = l.payout_account || s.acct_payout_default || "1020";
        const code = known(account) ? account : "1020";
        const pk = `${l.seller?.code}:${l.seller_paid_on}:${code}:${l.payout_ref}`;
        const p = payouts.get(pk) || { date: l.seller_paid_on, seller: l.seller?.code || "", name: l.seller?.name || "", account: code, ref: l.payout_ref, net: 0, lots: [] };
        p.net += l.net;
        p.lots.push(l.key);
        payouts.set(pk, p);
      }
    } else {
      const k = String(l.auctionNo);
      const g = cogs.get(k) || { date, auction: l.auctionNo, cost: 0, lots: [] };
      if (l.cost) {
        g.cost += Number(l.cost);
        g.lots.push(l.key);
      } else if (l.type === "Own stock") warnings.push(`Own-stock lot ${l.key} sold with no cost: its profit is the whole hammer price until the cost is typed.`);
      cogs.set(k, g);
    }
  }
  for (const [k, g] of feeGroups) {
    if (!g.fee && !g.vat) continue;
    add(
      { id: `fees:${k}`, date: g.date, source: "fees", title: `Seller fees · auction ${g.auction} · ${g.seller}`, ref: g.lots.join(", "), href: `/admin/office/statements?a=${g.auction}&seller=${g.seller}` },
      [
        { account: "2100", debit: g.fee + g.vat, credit: 0, memo: `${g.seller} ${g.name}`.trim() },
        { account: "4100", debit: 0, credit: g.fee, memo: `Lots ${g.lots.join(", ")}` },
        { account: "2300", debit: 0, credit: g.vat, memo: "VAT on seller fees" }
      ]
    );
  }
  for (const [k, g] of cogs) {
    if (!g.cost) continue;
    add(
      { id: `cogs:${k}`, date: g.date, source: "cogs", title: `Cost of own stock sold · auction ${g.auction}`, ref: g.lots.join(", "), href: `/admin/office/lots?a=${g.auction}&view=details` },
      [
        { account: "5010", debit: g.cost, credit: 0, memo: `Lots ${g.lots.join(", ")}` },
        { account: "1200", debit: 0, credit: g.cost, memo: "Out of stock" }
      ]
    );
  }

  // ── money in and out recorded on Payments
  const lastDeposit = new Map<string, string>();
  for (const e of o.ledger) {
    const acc = methodAcct(e.method);
    const who = e.customer ? `${e.customer.code} ${e.customer.full_name || ""}`.trim() : "";
    if (e.kind === "Deposit") {
      if (e.customer_id) lastDeposit.set(e.customer_id, later(lastDeposit.get(e.customer_id) || "", e.entry_date));
      add({ id: `pay:${e.id}`, date: e.entry_date, source: "deposit", title: `Deposit · ${who || "?"}`, ref: e.reference, href: e.customer ? `/admin/office/buyers/${e.customer.code}` : "/admin/office/payments" }, [
        { account: acc, debit: e.amount, credit: 0, memo: `${e.method}${e.reference ? ` · ${e.reference}` : ""}` },
        { account: "2200", debit: 0, credit: e.amount - e.cardFee, memo: who },
        { account: "4400", debit: 0, credit: e.cardFee, memo: "Card fee inside the payment" }
      ]);
    } else if (e.kind === "Payment") {
      add({ id: `pay:${e.id}`, date: e.entry_date, source: "payment", title: `Payment · ${e.invoice_no || who || "?"}`, ref: e.invoice_no, href: e.invoice_no ? `/admin/office/invoices/${e.invoice_no}` : "/admin/office/payments" }, [
        { account: acc, debit: e.amount, credit: 0, memo: `${e.method}${e.reference ? ` · ${e.reference}` : ""}` },
        { account: "1100", debit: 0, credit: e.amount - e.cardFee, memo: who },
        { account: "4400", debit: 0, credit: e.cardFee, memo: "Card fee inside the payment" }
      ]);
    } else {
      add({ id: `pay:${e.id}`, date: e.entry_date, source: "refund", title: `Refund · ${e.invoice_no || who || "?"}`, ref: e.invoice_no, href: e.invoice_no ? `/admin/office/invoices/${e.invoice_no}` : "/admin/office/payments" }, [
        { account: e.invoice_no ? "1100" : "2200", debit: e.amount, credit: 0, memo: who },
        { account: acc, debit: 0, credit: e.amount, memo: `${e.method}${e.reference ? ` · ${e.reference}` : ""}` }
      ]);
    }
  }

  // ── deposits used on invoices
  for (const inv of o.invoices) {
    if (inv.depositApplied <= 0) continue;
    const date = later(inv.auction?.sale_date || o.today, lastDeposit.get(inv.customer.id) || "");
    add({ id: `apply:${inv.no}`, date, source: "apply", title: `Deposit used · ${inv.no}`, ref: inv.no, href: `/admin/office/invoices/${inv.no}` }, [
      { account: "2200", debit: inv.depositApplied, credit: 0, memo: `${inv.customer.code}` },
      { account: "1100", debit: 0, credit: inv.depositApplied, memo: inv.no }
    ]);
  }

  // ── sellers paid
  for (const [k, p] of payouts) {
    add({ id: `payout:${k}`, date: p.date, source: "payout", title: `Seller payout · ${p.seller} ${p.name}`.trim(), ref: p.ref || p.lots.join(", "), href: `/admin/office/sellers/${p.seller}` }, [
      { account: "2100", debit: p.net, credit: 0, memo: `Lots ${p.lots.join(", ")}` },
      { account: p.account, debit: 0, credit: p.net, memo: p.ref || "Payout" }
    ]);
  }

  // ── entries typed under Accounting
  for (const m of acct.entries) {
    if (m.void) continue;
    const lines: JLine[] = m.lines.map(l => ({
      key: `m:${l.id}`, entry: `m:${m.id}`, date: m.entry_date, account: l.account_code, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo
    }));
    entries.push({ id: `m:${m.id}`, date: m.entry_date, source: "manual", title: m.memo || KIND_LABEL[m.kind] || "Entry", ref: m.reference, href: `/admin/office/accounting/journal#m-${m.id}`, lines, manual: m });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const lines = entries.flatMap(e => e.lines);
  for (const l of lines) if (!byCode.has(l.account)) warnings.push(`Account ${l.account} is used but isn't in the chart of accounts.`);
  return { entries, lines, accounts: acct.accounts, byCode, warnings: [...new Set(warnings)] };
}

export const KIND_LABEL: Record<string, string> = {
  expense: "Expense", income: "Other income", purchase: "Stock bought", transfer: "Transfer", owner: "Owners' money", opening: "Opening balances", journal: "Journal entry"
};

// ───────────────────────────── reports ─────────────────────────────

/** Normal balance: assets and expenses are debits; liabilities, equity and income are credits. */
export const debitNormal = (t: AccountType) => t === "asset" || t === "expense";

export type Bal = { code: string; debit: number; credit: number; balance: number };

/** Each account's totals for lines dated from `from` to `to` (inclusive; blank = open-ended). */
export function balances(j: Journal, from = "", to = ""): Map<string, Bal> {
  const out = new Map<string, Bal>();
  for (const l of j.lines) {
    if ((from && l.date < from) || (to && l.date > to)) continue;
    const b = out.get(l.account) || { code: l.account, debit: 0, credit: 0, balance: 0 };
    b.debit += l.debit;
    b.credit += l.credit;
    out.set(l.account, b);
  }
  for (const b of out.values()) {
    const t = j.byCode.get(b.code)?.type || "asset";
    b.debit = r2(b.debit);
    b.credit = r2(b.credit);
    b.balance = r2(debitNormal(t) ? b.debit - b.credit : b.credit - b.debit);
  }
  return out;
}

export const balanceOf = (j: Journal, code: string, to = "", from = "") => balances(j, from, to).get(code)?.balance || 0;

export type Row = { code: string; name: string; amount: number };
const rows = (j: Journal, bals: Map<string, Bal>, pick: (a: Account) => boolean, sign = 1): Row[] =>
  j.accounts
    .filter(pick)
    .map(a => ({ code: a.code, name: a.name, amount: r2(sign * (bals.get(a.code)?.balance || 0)) }))
    .filter(r => Math.abs(r.amount) > 0.004)
    .sort((x, y) => x.code.localeCompare(y.code));
const sum = (rs: Row[]) => r2(rs.reduce((t, r) => t + r.amount, 0));

export type ProfitLoss = {
  from: string; to: string;
  income: Row[]; totalIncome: number;
  cogs: Row[]; totalCogs: number; grossProfit: number;
  expenses: Row[]; totalExpenses: number; netProfit: number;
};

export function profitLoss(j: Journal, from: string, to: string): ProfitLoss {
  const b = balances(j, from, to);
  const income = rows(j, b, a => a.type === "income");
  const cogs = rows(j, b, a => a.type === "expense" && a.subtype === "cogs");
  const expenses = rows(j, b, a => a.type === "expense" && a.subtype !== "cogs");
  const totalIncome = sum(income);
  const totalCogs = sum(cogs);
  const totalExpenses = sum(expenses);
  return { from, to, income, totalIncome, cogs, totalCogs, grossProfit: r2(totalIncome - totalCogs), expenses, totalExpenses, netProfit: r2(totalIncome - totalCogs - totalExpenses) };
}

export type BalanceSheet = {
  asOf: string;
  assets: Row[]; totalAssets: number;
  liabilities: Row[]; totalLiabilities: number;
  equity: Row[]; earlierProfit: number; yearProfit: number; totalEquity: number;
  /** assets − liabilities − equity: 0 when the books balance */
  difference: number;
};

/** The balance sheet on a date. Profit isn't closed off into equity by hand: this year's and earlier years' are shown. */
export function balanceSheet(j: Journal, asOf: string): BalanceSheet {
  const b = balances(j, "", asOf);
  const yearStart = `${asOf.slice(0, 4)}-01-01`;
  const assets = rows(j, b, a => a.type === "asset");
  const liabilities = rows(j, b, a => a.type === "liability");
  const equity = rows(j, b, a => a.type === "equity");
  const before = profitLoss(j, "", prevDay(yearStart)).netProfit;
  const year = profitLoss(j, yearStart, asOf).netProfit;
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = r2(sum(equity) + before + year);
  return { asOf, assets, totalAssets, liabilities, totalLiabilities, equity, earlierProfit: before, yearProfit: year, totalEquity, difference: r2(totalAssets - totalLiabilities - totalEquity) };
}

export type TrialRow = { code: string; name: string; type: AccountType; debit: number; credit: number };

export function trialBalance(j: Journal, asOf: string) {
  const b = balances(j, "", asOf);
  const out: TrialRow[] = [];
  for (const a of j.accounts) {
    const x = b.get(a.code);
    if (!x) continue;
    const net = r2(x.debit - x.credit);
    if (Math.abs(net) < 0.005) continue;
    out.push({ code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  for (const [code, x] of b) {
    if (j.byCode.has(code)) continue;
    const net = r2(x.debit - x.credit);
    if (Math.abs(net) >= 0.005) out.push({ code, name: "(not in the chart)", type: "asset", debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  out.sort((x, y) => x.code.localeCompare(y.code));
  return { rows: out, debit: r2(out.reduce((t, r) => t + r.debit, 0)), credit: r2(out.reduce((t, r) => t + r.credit, 0)) };
}

export type LedgerRow = JLine & { title: string; source: Source; href: string; running: number };

/** One account's lines with a running balance. */
export function accountLedger(j: Journal, code: string, from: string, to: string) {
  const a = j.byCode.get(code);
  const dn = debitNormal(a?.type || "asset");
  const opening = from ? balanceOf(j, code, prevDay(from)) : 0;
  const byEntry = new Map(j.entries.map(e => [e.id, e]));
  let run = opening;
  const out: LedgerRow[] = [];
  for (const l of j.lines) {
    if (l.account !== code || (from && l.date < from) || (to && l.date > to)) continue;
    run = r2(run + (dn ? l.debit - l.credit : l.credit - l.debit));
    const e = byEntry.get(l.entry)!;
    out.push({ ...l, title: e.title, source: e.source, href: e.href, running: run });
  }
  return { account: a, opening, rows: out, closing: run };
}

/** VAT for a period: output VAT (on invoices and seller fees) and input VAT (on expenses). */
export function vatSummary(j: Journal, from: string, to: string) {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  let outInvoices = 0;
  let outFees = 0;
  let outOther = 0;
  let input = 0;
  let salesValue = 0;
  let feeValue = 0;
  let expenseValue = 0;
  for (const e of j.entries) {
    if (!inRange(e.date)) continue;
    for (const l of e.lines) {
      if (l.account === "2300") {
        const v = l.credit - l.debit;
        if (e.source === "sale") outInvoices += v;
        else if (e.source === "fees") outFees += v;
        else outOther += v;
      }
      if (l.account === "1300") input += l.debit - l.credit;
      const t = j.byCode.get(l.account);
      if (e.source === "sale" && t?.type === "income") salesValue += l.credit - l.debit;
      if (e.source === "fees" && l.account === "4100") feeValue += l.credit - l.debit;
      if (e.source === "manual" && t?.type === "expense" && e.lines.some(x => x.account === "1300")) expenseValue += l.debit - l.credit;
    }
  }
  const output = r2(outInvoices + outFees + outOther);
  return {
    from, to, salesValue: r2(salesValue), feeValue: r2(feeValue), expenseValue: r2(expenseValue),
    outInvoices: r2(outInvoices), outFees: r2(outFees), outOther: r2(outOther), output, input: r2(input), net: r2(output - input)
  };
}

/** Who owes what, by how long it's been due. */
export function receivablesAging(o: Office) {
  const buckets = ["Not due yet", "1–7 days", "8–30 days", "31–60 days", "Over 60 days"] as const;
  const rowsOut = o.invoices
    .filter(i => i.balance > 0.005)
    .map(i => {
      const days = i.due ? Math.floor((o.data.now - i.due) / 86400e3) : 0;
      const bucket = !i.due || o.data.now <= i.due ? 0 : days <= 7 ? 1 : days <= 30 ? 2 : days <= 60 ? 3 : 4;
      return { inv: i, days: Math.max(0, days), bucket };
    })
    .sort((a, b) => b.days - a.days);
  const totals = buckets.map((_, k) => r2(rowsOut.filter(r => r.bucket === k).reduce((t, r) => t + r.inv.balance, 0)));
  return { buckets, rows: rowsOut, totals, total: r2(totals.reduce((t, x) => t + x, 0)) };
}

export function consignorPayables(o: Office) {
  return o.sellers
    .filter(x => x.kind !== "own" && Math.abs(x.owed) > 0.005)
    .map(x => {
      const lots = o.lots.filter(l => l.seller_id === x.id && l.sold && l.payout !== "Paid");
      return { seller: x, due: r2(lots.filter(l => l.payout === "Due to seller").reduce((t, l) => t + l.net, 0)), waiting: r2(lots.filter(l => l.payout !== "Due to seller").reduce((t, l) => t + l.net, 0)) };
    })
    .sort((a, b) => b.due + b.waiting - (a.due + a.waiting));
}

// ───────────────────────────── dates ─────────────────────────────

export function prevDay(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
export function monthEnd(ymd: string) {
  const d = new Date(`${ymd.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
/** Months from `from` to `to`: [["2026-09-01", "2026-09-30"], …] */
export function months(from: string, to: string) {
  const out: [string, string][] = [];
  let m = monthStart(from);
  while (m <= to && out.length < 36) {
    out.push([m, monthEnd(m)]);
    const d = new Date(`${m}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    m = d.toISOString().slice(0, 10);
  }
  return out;
}

/** Period presets for the report pickers. */
export function periods(today: string) {
  const y = today.slice(0, 4);
  const lastMonth = prevDay(monthStart(today));
  const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  const qStart = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  const qEnd = monthEnd(`${y}-${String(q * 3 + 3).padStart(2, "0")}-01`);
  return [
    { key: "month", label: "This month", from: monthStart(today), to: monthEnd(today) },
    { key: "last", label: "Last month", from: monthStart(lastMonth), to: lastMonth },
    { key: "quarter", label: "This quarter", from: qStart, to: qEnd },
    { key: "year", label: "This year", from: `${y}-01-01`, to: `${y}-12-31` },
    { key: "all", label: "Since the start", from: "", to: "" }
  ];
}
