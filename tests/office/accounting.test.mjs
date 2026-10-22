// Accounting: the journal balances and agrees with the back office's own figures. Made-up records only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = new URL("../../.office-test/office/", import.meta.url).pathname;
const { compute, r2 } = require(out + "engine.js");
const { sampleOffice } = require(out + "sample.js");
const A = require(out + "accounting.js");

const NOW = Date.parse("2026-10-20T08:00:00Z");
const CHART = [
  ["1010", "asset", "cash"], ["1020", "asset", "bank"], ["1030", "asset", "clearing"], ["1040", "asset", "clearing"], ["1050", "asset", "clearing"], ["1060", "asset", "clearing"],
  ["1100", "asset", "receivable"], ["1200", "asset", "inventory"], ["1300", "asset", "tax"], ["1900", "asset", "suspense"], ["2010", "liability", ""], ["2100", "liability", ""],
  ["2200", "liability", ""], ["2300", "liability", "tax"], ["2500", "liability", ""], ["3010", "equity", ""], ["3050", "equity", ""], ["3100", "equity", ""], ["3900", "equity", ""],
  ["4010", "income", ""], ["4100", "income", ""], ["4200", "income", ""], ["4300", "income", ""], ["4400", "income", ""], ["4500", "income", ""], ["4600", "income", "contra"],
  ["4900", "income", ""], ["5010", "expense", "cogs"], ["6010", "expense", ""], ["6020", "expense", ""], ["6100", "expense", ""], ["6900", "expense", ""]
].map(([code, type, subtype]) => ({ code, name: `Account ${code}`, type, subtype, system: true, active: true, notes: "" }));

const acct = (entries = []) => ({ accounts: CHART, entries, cleared: [], recons: [] });
const journal = (data, entries) => {
  const o = compute(data);
  return { o, j: A.buildJournal(o, acct(entries)) };
};

test("every entry balances, and so does the whole journal", () => {
  const { j } = journal(sampleOffice(NOW));
  for (const e of j.entries) {
    const dr = r2(e.lines.reduce((t, l) => t + l.debit, 0));
    const cr = r2(e.lines.reduce((t, l) => t + l.credit, 0));
    assert.equal(dr, cr, e.title);
  }
  const tb = A.trialBalance(j, "2099-12-31");
  assert.equal(tb.debit, tb.credit);
  assert.equal(A.balanceSheet(j, "2099-12-31").difference, 0);
  assert.deepEqual(j.warnings, []);
});

test("the accounts agree with invoices, deposits and sellers", () => {
  const { o, j } = journal(sampleOffice(NOW));
  const b = A.balances(j, "", "2099-12-31");
  const bal = c => b.get(c)?.balance || 0;
  assert.equal(bal("1100"), r2(o.invoices.reduce((t, i) => t + i.balance, 0)));
  assert.equal(bal("2200"), r2(o.customers.reduce((t, c) => t + c.depositHeld, 0)));
  assert.equal(bal("2100"), r2(o.sellers.filter(s => s.kind !== "own").reduce((t, s) => t + s.owed, 0)));
  // own-stock profit + seller fees = the auctions' profit
  assert.equal(r2(bal("4010") - bal("5010") + bal("4100")), r2(o.auctions.reduce((t, a) => t + a.profit, 0)));
  // money received by method
  assert.equal(bal("1020"), 11030); // bank transfer
  assert.equal(bal("1010"), 5000); // cash deposit
  assert.equal(bal("1030"), 9476); // card link
  assert.equal(bal("4400"), 276); // card fee inside it
});

test("cancelled order: payment stays as money owed back to the buyer", () => {
  const data = sampleOffice(NOW);
  data.lots.find(l => l.id === "l1-2").exception = "Returned by buyer";
  const { o, j } = journal(data);
  const refunds = o.refunds.filter(r => r.source !== "deposit").reduce((t, r) => t + r.amount, 0);
  const owing = o.invoices.filter(i => i.balance > 0).reduce((t, i) => t + i.balance, 0);
  assert.equal(A.balanceOf(j, "1100", "2099-12-31"), r2(owing - refunds));
  assert.equal(A.trialBalance(j, "2099-12-31").debit, A.trialBalance(j, "2099-12-31").credit);
});

test("expenses, stock bought, transfers and owners' money", () => {
  const m = (id, date, kind, lines) => ({ id, entry_date: date, kind, memo: kind, payee: "", reference: "", void: false, void_reason: "", created_at: "", lines: lines.map((l, i) => ({ id: Number(id.replace(/\D/g, "")) * 10 + i, memo: "", debit: 0, credit: 0, ...l })) });
  const entries = [
    m("e1", "2026-10-01", "opening", [{ account_code: "1020", debit: 50000 }, { account_code: "1200", debit: 30000 }, { account_code: "3050", credit: 80000 }]),
    m("e2", "2026-10-18", "expense", [{ account_code: "6100", debit: 400 }, { account_code: "1020", credit: 400 }]),
    m("e3", "2026-10-19", "transfer", [{ account_code: "1020", debit: 9200 }, { account_code: "6020", debit: 276 }, { account_code: "1030", credit: 9476 }]),
    m("e4", "2026-10-19", "owner", [{ account_code: "3100", debit: 1000 }, { account_code: "1010", credit: 1000 }]),
    { ...m("e5", "2026-10-19", "expense", [{ account_code: "6900", debit: 999 }, { account_code: "1020", credit: 999 }]), void: true }
  ];
  const { j } = journal(sampleOffice(NOW), entries);
  assert.equal(A.balanceOf(j, "1020", "2099-12-31"), 50000 + 11030 - 400 + 9200);
  assert.equal(A.balanceOf(j, "1030", "2099-12-31"), 0);
  const pl = A.profitLoss(j, "2026-10-01", "2026-10-31");
  assert.equal(pl.totalExpenses, 676);
  const bs = A.balanceSheet(j, "2026-10-31");
  assert.equal(bs.difference, 0);
  const led = A.accountLedger(j, "1020", "2026-10-18", "2026-10-31");
  assert.equal(led.opening, 50000 + 11030);
  assert.equal(led.closing, 50000 + 11030 - 400 + 9200);
});

test("VAT: output on invoices and seller fees, input on expenses", () => {
  const data = sampleOffice(NOW);
  data.settings = { ...data.settings, vat_sales_pct: 5, vat_fee_pct: 5 };
  const entries = [{ id: "v1", entry_date: data.auctions[0].sale_date, kind: "expense", memo: "", payee: "", reference: "", void: false, void_reason: "", created_at: "", lines: [
    { id: 1, account_code: "6010", debit: 100, credit: 0, memo: "" }, { id: 2, account_code: "1300", debit: 5, credit: 0, memo: "" }, { id: 3, account_code: "1020", debit: 0, credit: 105, memo: "" }
  ] }];
  const { o, j } = journal(data, entries);
  const v = A.vatSummary(j, "", "");
  assert.equal(v.outInvoices, r2(o.invoices.reduce((t, i) => t + i.vat, 0)));
  assert.equal(v.outFees, r2(o.lots.reduce((t, l) => t + l.vatFee, 0)));
  assert.equal(v.input, 5);
  assert.equal(v.net, r2(v.output - 5));
  assert.equal(A.balanceSheet(j, "2099-12-31").difference, 0);
});

test("seller payouts leave the account they were paid from", () => {
  const data = sampleOffice(NOW);
  for (const l of data.lots.filter(x => x.seller_id === "sS2" && x.auction_id === "a1")) {
    l.seller_paid_on = "2026-10-19";
    l.payout_ref = "TRF-1";
  }
  const { o, j } = journal(data);
  const paid = o.lots.filter(l => l.payout === "Paid").reduce((t, l) => t + l.net, 0);
  assert.equal(A.balanceOf(j, "1020", "2099-12-31"), r2(11030 - paid));
  assert.equal(j.entries.filter(e => e.source === "payout").length, 1);
});

test("dates and periods", () => {
  assert.equal(A.monthEnd("2026-02-10"), "2026-02-28");
  assert.equal(A.prevDay("2026-03-01"), "2026-02-28");
  assert.deepEqual(A.months("2026-11-15", "2027-01-02").map(m => m[0]), ["2026-11-01", "2026-12-01", "2027-01-01"]);
  assert.equal(A.periods("2026-10-21")[1].from, "2026-09-01");
});

test("the chart in code matches the database's starting chart", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../../supabase/migrations/0007_accounting.sql", import.meta.url), "utf8");
  const seeded = [...sql.matchAll(/\('(\d{4})', '((?:[^']|'')*)', '(\w+)', '(\w*)', (true|false)\)/g)].map(m => [m[1], m[2].replace(/''/g, "'"), m[3], m[4], m[5] === "true"]);
  const { DEFAULT_CHART } = require(out + "chart.js");
  assert.deepEqual(DEFAULT_CHART.map(a => [a.code, a.name, a.type, a.subtype, a.system]), seeded);
  // every account the automatic journal uses is a system account
  const { j } = journal(sampleOffice(NOW));
  const used = new Set(j.lines.map(l => l.account));
  for (const code of used) assert.ok(DEFAULT_CHART.find(a => a.code === code)?.system, code);
});

test("preview books balance", () => {
  const { sampleAccounting } = require(out + "sample.js");
  const o = compute(sampleOffice(NOW));
  const j = A.buildJournal(o, sampleAccounting(NOW));
  assert.equal(A.balanceSheet(j, "2099-12-31").difference, 0);
  assert.equal(A.balanceOf(j, "1030", "2099-12-31"), 0);
});
