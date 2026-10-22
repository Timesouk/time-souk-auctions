// Instagram-only auctions, the demo auction, trays, and buyers who pay the consignor directly. Made-up records only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = new URL("../../.office-test/office/", import.meta.url).pathname;
const E = require(out + "engine.js");
const { sampleOffice } = require(out + "sample.js");
const A = require(out + "accounting.js");
const T = require(out + "types.js");
const { DEFAULT_CHART } = require(out + "chart.js");

const NOW = Date.parse("2026-10-20T08:00:00Z");
const acct = { accounts: DEFAULT_CHART, entries: [], cleared: [], recons: [] };
const extras = () => sampleOffice(NOW, true);

test("auction states: draft, Instagram only, website, closed, demo", () => {
  assert.equal(T.auctionState({ status: "draft" }), "Draft");
  assert.equal(T.auctionState({ status: "draft", instagram: true }), "Instagram only");
  assert.equal(T.auctionState({ status: "published", instagram: true }), "Website + Instagram");
  assert.equal(T.auctionState({ status: "closed" }), "Closed");
  assert.equal(T.auctionState({ status: "draft", demo: true }), "Demo");
});

test("a buyer who paid the consignor directly: the invoice is paid and the seller owes us our fee", () => {
  const o = E.compute(extras());
  const inv = o.invoicesByNo.get("TS001-B0006");
  assert.equal(inv.total, 7930);
  assert.equal(inv.paidToSeller, 4000);
  assert.equal(inv.balance, 0);
  assert.equal(inv.status, "Paid");
  const lot = o.lots.find(l => l.key === "1-09");
  assert.equal(lot.net, 3700); // 4,000 less 7.5%
  assert.equal(lot.toPay, -300);
  assert.equal(lot.payout, "Seller owes us");
  const s1 = o.sellersById.get("sS1");
  assert.equal(s1.direct, 4000);
  // S001: their other sold lots still to pay, less the 300 they owe us
  const otherNet = o.lots.filter(l => l.seller_id === "sS1" && l.sold && l.key !== "1-09").reduce((t, l) => t + l.net, 0);
  assert.equal(s1.owed, E.r2(otherNet - 300));
});

test("the books balance with a direct payment, and 2100 agrees with what sellers are owed", () => {
  const data = extras();
  const o = E.compute(E.withoutDemo(data));
  const j = A.buildJournal(o, acct);
  const tb = A.trialBalance(j, "2099-12-31");
  assert.equal(tb.debit, tb.credit);
  assert.equal(A.balanceSheet(j, "2099-12-31").difference, 0);
  const b = A.balances(j, "", "2099-12-31");
  const bal = c => b.get(c)?.balance || 0;
  assert.equal(bal("2100"), E.r2(o.sellers.filter(s => s.kind !== "own").reduce((t, s) => t + s.owed, 0)));
  assert.equal(bal("1100"), E.r2(o.invoices.reduce((t, i) => t + i.balance, 0)));
  const direct = j.entries.find(e => e.id === "pay:p4");
  assert.deepEqual(direct.lines.map(l => [l.account, l.debit, l.credit]), [["2100", 4000, 0], ["1100", 0, 4000]]);
});

test("settling with a seller who was paid directly: they pay us the difference, and the books follow", () => {
  const data = extras();
  let o = E.compute(data);
  const lot = o.lots.find(l => l.key === "1-09");
  const cash = E.settleCash([lot.settle]);
  assert.equal(cash.get(lot.id), -300);
  const raw = data.lots.find(l => l.id === lot.id);
  raw.seller_paid_on = "2026-10-19";
  raw.payout_amount = cash.get(lot.id);
  o = E.compute(E.withoutDemo(data));
  const after = o.lots.find(l => l.key === "1-09");
  assert.equal(after.payout, "Paid");
  const s1 = o.sellersById.get("sS1");
  assert.equal(s1.paidOut, -300);
  const otherNet = o.lots.filter(l => l.seller_id === "sS1" && l.sold && l.key !== "1-09").reduce((t, l) => t + l.net, 0);
  assert.equal(s1.owed, E.r2(otherNet)); // the 300 is settled
  const j = A.buildJournal(o, acct);
  const p = j.entries.find(e => e.source === "payout");
  assert.match(p.title, /settled with us/);
  assert.deepEqual(p.lines.map(l => [l.account, l.debit, l.credit]), [["2100", 0, 300], ["1020", 300, 0]]);
  assert.equal(A.trialBalance(j, "2099-12-31").debit, A.trialBalance(j, "2099-12-31").credit);
  const b = A.balances(j, "", "2099-12-31");
  assert.equal(b.get("2100").balance, E.r2(o.sellers.filter(s => s.kind !== "own").reduce((t, s) => t + s.owed, 0)));
});

test("a direct payment shared by two lots: it comes off in lot order, the last lot takes the rest", () => {
  const g = (id, n, net) => ({ id, lot_number: n, net, group: "s|inv", unapplied: 5000, groupUnpaid: 2 });
  // both lots settled together: 3,000 + 2,500 net, 5,000 paid directly → 0 and 500
  let c = E.settleCash([g("b", 2, 2500), g("a", 1, 3000)]);
  assert.equal(c.get("a"), 0);
  assert.equal(c.get("b"), 500);
  // only the first settled now: it can't go below 0 while another lot is still open
  c = E.settleCash([g("a", 1, 3000)]);
  assert.equal(c.get("a"), 0);
  // more paid directly than the net: the last lot goes negative (the seller owes us)
  c = E.settleCash([{ ...g("a", 1, 3000), unapplied: 6000 }, { ...g("b", 2, 2500), unapplied: 6000 }]);
  assert.equal(c.get("a"), 0);
  assert.equal(c.get("b"), -500);
  // nothing paid directly: the net
  c = E.settleCash([{ id: "x", lot_number: 1, net: 900, group: "k", unapplied: 0, groupUnpaid: 1 }]);
  assert.equal(c.get("x"), 900);
});

test("trays: a buyer with more than one lot gets one tray; others keep theirs", () => {
  const lot = (id, n, winner, hammer = 100, extra = {}) => ({ id, lot_number: n, winner, hammer, exception: null, tray: null, ...extra });
  let plan = E.planTrays([lot("1", 1, "ali"), lot("2", 2, "sara"), lot("3", 3, "ali"), lot("4", 4, "omar")]);
  assert.deepEqual(plan.set, [{ id: "1", tray: 1 }, { id: "3", tray: 1 }]);
  assert.deepEqual(plan.trays, [{ winner: "ali", tray: 1, lots: [1, 3] }]);
  // a third lot for ali joins tray 1; sara's second lot opens tray 2
  plan = E.planTrays([lot("1", 1, "ali", 100, { tray: 1 }), lot("2", 2, "sara"), lot("3", 3, "ali", 100, { tray: 1 }), lot("5", 5, "ali"), lot("6", 6, "sara")]);
  assert.deepEqual(plan.set, [{ id: "5", tray: 1 }, { id: "2", tray: 2 }, { id: "6", tray: 2 }]);
  // unsold, withdrawn and no-winner lots don't count
  plan = E.planTrays([lot("1", 1, "ali"), lot("2", 2, "ali", null), lot("3", 3, "ali", 100, { exception: "Withdrawn" }), lot("4", 4, null)]);
  assert.deepEqual(plan.set, []);
  // nothing left to do: no changes
  plan = E.planTrays([lot("1", 1, "ali", 100, { tray: 4 }), lot("2", 2, "ali", 100, { tray: 4 })]);
  assert.deepEqual(plan, { set: [], trays: [] });
});

test("the demo auction is kept out of the books, the totals and the to-do lists", () => {
  const data = extras();
  const full = E.compute(data);
  const demoLots = full.lots.filter(l => l.demo);
  assert.equal(demoLots.length, 4);
  const demoInv = full.invoices.find(i => i.demo);
  assert.equal(demoInv.no, "TS999-D0001");
  assert.ok(!full.owing.some(i => i.demo));
  assert.ok(!full.refunds.some(r => r.ref.startsWith("TS999")));
  // the journal leaves it out even when given everything
  const j1 = A.buildJournal(full, acct);
  const j2 = A.buildJournal(E.compute(E.withoutDemo(data)), acct);
  assert.ok(!j1.entries.some(e => /TS999|999/.test(e.ref) || /auction 999/.test(e.title)));
  const tb1 = A.trialBalance(j1, "2099-12-31");
  const tb2 = A.trialBalance(j2, "2099-12-31");
  assert.deepEqual(tb1.rows, tb2.rows);
  // the demo seller's figures are its own; real sellers don't see demo lots
  assert.equal(full.sellersById.get("sDC").lotsEntered, 3);
  assert.ok(!full.sellers.filter(s => !s.demo).some(s => full.lots.some(l => l.demo && l.seller_id === s.id)));
  // without the demo: no demo auction, lots, buyers or sellers
  const clean = E.withoutDemo(data);
  assert.ok(!clean.auctions.some(a => a.demo) && !clean.customers.some(c => c.demo) && !clean.sellers.some(s => s.demo));
  assert.equal(clean.lots.length, data.lots.length - 4);
});

test("demo buyer codes run D0001, D0002 … and real ones B…", () => {
  const list = [{ code: "B0007" }, { code: "D0001" }, { code: "D0002" }, { code: "B0012" }];
  assert.equal(E.nextCustomerCode(list), "B0013");
  assert.equal(E.nextCustomerCode(list, "D"), "D0003");
});
