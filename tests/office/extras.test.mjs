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
const SA = require(out + "seller-account.js");

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

test("a buyer who paid the consignor directly: the invoice is paid and it comes off the seller's payouts", () => {
  const o = E.compute(extras());
  const inv = o.invoicesByNo.get("TS001-B0006");
  assert.equal(inv.total, 7930);
  assert.equal(inv.paidToSeller, 4000);
  assert.equal(inv.balance, 0);
  assert.equal(inv.status, "Paid");
  const lot = o.lots.find(l => l.key === "1-09");
  assert.equal(lot.net, 3700); // 4,000 less 7.5%
  assert.equal(lot.toPay, 0); // the seller already has its money
  assert.equal(lot.payout, "Due to seller");
  const s1 = o.sellersById.get("sS1");
  assert.equal(s1.direct, 4000);
  assert.equal(s1.held, 4000);
  // S001: their other sold lots, less the 300 extra they hold (our fee on 1-09)
  const otherNet = o.lots.filter(l => l.seller_id === "sS1" && l.sold && l.key !== "1-09").reduce((t, l) => t + l.net, 0);
  assert.equal(s1.owed, E.r2(otherNet - 300));
  assert.equal(E.r2(o.lots.filter(l => l.seller_id === "sS1" && l.sold).reduce((t, l) => t + l.toPay, 0)), s1.owed);
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

const settleAll = (data, sellerId, on = "2026-10-19") => {
  const o = E.compute(data);
  const open = o.lots.filter(l => l.seller_id === sellerId && l.settle);
  const cash = E.settleCash(open.map(l => l.settle));
  for (const l of open) {
    const raw = data.lots.find(x => x.id === l.id);
    raw.seller_paid_on = on;
    raw.payout_amount = cash.get(l.id);
  }
  return cash;
};

test("settling a seller who holds a buyer's payment: it comes off what we pay, and the books follow", () => {
  const data = extras();
  // settling only 1-09 moves nothing (the seller already has the money); the extra 300 stays held for the next payout
  let o = E.compute(data);
  const lot = o.lots.find(l => l.key === "1-09");
  assert.equal(E.settleCash([lot.settle]).get(lot.id), 0);
  // settling all of S001's lots: their nets less the 4,000 they hold
  const before = o.sellersById.get("sS1").owed;
  const cash = settleAll(data, "sS1");
  assert.equal(E.r2([...cash.values()].reduce((t, x) => t + x, 0)), before);
  o = E.compute(E.withoutDemo(data));
  const s1 = o.sellersById.get("sS1");
  assert.equal(s1.owed, 0);
  assert.equal(s1.held, 0);
  const j = A.buildJournal(o, acct);
  const tb = A.trialBalance(j, "2099-12-31");
  assert.equal(tb.debit, tb.credit);
  assert.equal(A.balances(j, "", "2099-12-31").get("2100").balance, E.r2(o.sellers.filter(s => s.kind !== "own").reduce((t, s) => t + s.owed, 0)));
});

test("a buyer paid a different seller (for our own stock): the invoice is paid, that seller's payout goes down", () => {
  const data = extras();
  // B0004 bought our own Cartier (7,400 + 60 delivery) but paid S002, whom they know
  data.ledger.push({ id: "p6", seq: 6, entry_date: "2026-10-18", kind: "Payment", customer_id: "cB0004", invoice_no: "TS001-B0004", method: T.DIRECT, amount: 7460, reference: "", received_by: "", notes: "", created_at: "2026-10-18T12:00:00+04:00", paid_to_seller_id: "sS2" });
  let o = E.compute(data);
  assert.equal(o.invoicesByNo.get("TS001-B0004").balance, 0);
  const s2 = o.sellersById.get("sS2");
  const net2 = o.lots.filter(l => l.seller_id === "sS2" && l.sold).reduce((t, l) => t + l.net, 0);
  assert.equal(s2.held, 7460);
  assert.equal(s2.owed, E.r2(net2 - 7460));
  // own-stock sales still count as ours
  const j = A.buildJournal(E.compute(E.withoutDemo(data)), acct);
  const b = A.balances(j, "", "2099-12-31");
  assert.equal(b.get("4010").balance, E.r2(o.lots.filter(l => l.sold && l.type === "Own stock").reduce((t, l) => t + (l.hammer || 0), 0)));
  assert.equal(b.get("2100").balance, E.r2(o.sellers.filter(s => s.kind !== "own" && !s.demo).reduce((t, s) => t + s.owed, 0)));
  // settling S002: what we pay is their nets less the 7,460 they hold
  const cash = settleAll(data, "sS2");
  assert.equal(E.r2([...cash.values()].reduce((t, x) => t + x, 0)), E.r2(net2 - 7460));
  o = E.compute(data);
  assert.equal(o.sellersById.get("sS2").owed, 0);
});

test("a seller with nothing to sell who was paid by a buyer owes us, until they pay it back", () => {
  const data = extras();
  data.sellers.push({ id: "sS3", code: "S003", name: "Friend Of A Buyer", kind: "consignment", phone: "", instagram: "", email: "", id_checked: "", fee_pct: null, fee_fixed: null, bank: "", iban: "", notes: "" });
  data.ledger.push({ id: "p7", seq: 7, entry_date: "2026-10-18", kind: "Payment", customer_id: "cB0002", invoice_no: "TS001-B0002", method: T.DIRECT, amount: 1000, reference: "", received_by: "", notes: "", created_at: "2026-10-18T12:00:00+04:00", paid_to_seller_id: "sS3" });
  let o = E.compute(data);
  let s3 = o.sellersById.get("sS3");
  assert.equal(s3.owed, -1000);
  data.settlements = [{ id: "st1", seller_id: "sS3", entry_date: "2026-10-20", amount: -1000, account_code: "1020", reference: "Transfer", notes: "", created_at: "2026-10-20T10:00:00+04:00" }];
  o = E.compute(data);
  s3 = o.sellersById.get("sS3");
  assert.equal(s3.owed, 0);
  assert.equal(s3.held, 0);
  const j = A.buildJournal(E.compute(E.withoutDemo(data)), acct);
  const st = j.entries.find(e => e.id === "settle:st1");
  assert.deepEqual(st.lines.map(l => [l.account, l.debit, l.credit]), [["2100", 0, 1000], ["1020", 1000, 0]]);
  const tb = A.trialBalance(j, "2099-12-31");
  assert.equal(tb.debit, tb.credit);
  const b = A.balances(j, "", "2099-12-31");
  assert.equal(b.get("2100").balance, E.r2(E.compute(E.withoutDemo(data)).sellers.filter(s => s.kind !== "own").reduce((t, s) => t + s.owed, 0)));
  // their account statement tells the same story
  const acc = SA.sellerAccount(o, "sS3");
  assert.deepEqual(acc.lines.map(l => [l.kind, l.amount, l.balance]), [["direct", -1000, -1000], ["settlement", 1000, 0]]);
});

test("a seller's account statement adds up to what they're owed", () => {
  const data = extras();
  const o = E.compute(data);
  for (const s of o.sellers.filter(x => x.kind !== "own" && !x.demo)) {
    const acc = SA.sellerAccount(o, s.id);
    assert.equal(acc.balance, s.owed, s.code);
  }
});

test("settling with money held: it comes off in order, a lot never goes negative while others stay open", () => {
  const g = (id, order, net, held = 5000) => ({ id, seller: "s", order, net, held, sellerUnpaid: 2 });
  // both lots settled together: 3,000 + 2,500 net, 5,000 held → 0 and 500
  let c = E.settleCash([g("b", 2, 2500), g("a", 1, 3000)]);
  assert.equal(c.get("a"), 0);
  assert.equal(c.get("b"), 500);
  // only the first settled now: it can't go below 0 while another lot is still open
  c = E.settleCash([g("a", 1, 3000)]);
  assert.equal(c.get("a"), 0);
  // more held than the nets: the last lot goes negative (the seller owes us)
  c = E.settleCash([g("a", 1, 3000, 6000), g("b", 2, 2500, 6000)]);
  assert.equal(c.get("a"), 0);
  assert.equal(c.get("b"), -500);
  // nothing held: the net
  c = E.settleCash([{ id: "x", seller: "t", order: 1, net: 900, held: 0, sellerUnpaid: 1 }]);
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

test("print all invoices: the same filters as the Invoices page, in invoice-number order", () => {
  const F = require(out + "invoice-filter.js");
  const o = E.compute(sampleOffice(NOW));
  const a1 = o.invoices.filter(i => i.auctionNo === 1);
  assert.ok(a1.length > 1);
  const sorted = [...a1].sort(F.byInvoiceNo).map(i => i.no);
  assert.deepEqual(sorted, [...sorted].sort((x, y) => x.localeCompare(y, "en", { numeric: true })));
  assert.equal(F.invoiceShow("unpaid"), "unpaid");
  assert.equal(F.invoiceShow("nonsense"), "");
  assert.equal(F.invoiceShow(undefined), "");
  for (const i of a1) {
    assert.equal(F.showInvoice("", i), true);
    assert.equal(F.showInvoice("unpaid", i), i.balance > 0 && i.paysBy !== T.COD);
    assert.equal(F.showInvoice("refund", i), i.balance < -0.005);
  }
  // every invoice is in exactly the "All" list; the filtered lists are parts of it
  for (const [k] of F.INVOICE_SHOWS) assert.ok(a1.filter(i => F.showInvoice(k, i)).length <= a1.length);
});

test("delivery for a whole invoice: every lot together, the date kept or cleared, pickups collected", () => {
  const D = require(out + "delivery.js");
  const o = E.compute(sampleOffice(NOW));
  const multi = o.invoices.find(i => i.lots.length > 1);
  assert.ok(multi, "the sample has an invoice with two lots");
  const courier = { ...multi, delivery: "Courier", lots: multi.lots.map((l, k) => ({ ...l, delivery_status: k ? "" : "Packed", dispatched_on: k ? null : "2026-10-27" })) };
  const done = D.deliveryPlan(courier, "Done", "2026-10-29");
  assert.equal(done.length, courier.lots.length);
  assert.ok(done.every(u => u.delivery_status === "Delivered"));
  assert.equal(done[0].dispatched_on, "2026-10-27", "a date already typed is kept");
  assert.ok(done.slice(1).every(u => u.dispatched_on === "2026-10-29"));
  assert.ok(D.deliveryPlan(courier, "Packed", "2026-10-29").every(u => u.delivery_status === "Packed" && u.dispatched_on === null));
  assert.ok(D.deliveryPlan(courier, "", "2026-10-29").every(u => u.delivery_status === "" && u.dispatched_on === null));
  const pickup = { ...courier, delivery: "Pickup" };
  assert.ok(D.deliveryPlan(pickup, "Done", "2026-10-29").every(u => u.delivery_status === "Collected"));
  assert.deepEqual(D.deliveryPlan(pickup, "With courier", "2026-10-29"), [], "no courier for a pickup");
  // a watch that went back to its seller is never overwritten from the invoice
  const back = { ...courier, lots: courier.lots.map((l, k) => (k ? l : { ...l, delivery_status: "Returned to seller" })) };
  assert.equal(D.deliveryPlan(back, "Done", "2026-10-29").length, courier.lots.length - 1);
  // the engine then shows the invoice as delivered and done
  const data = sampleOffice(NOW);
  const ids = new Set(multi.lots.map(l => l.id));
  for (const l of data.lots) if (ids.has(l.id)) l.delivery_status = D.stepStatus(multi, "Done");
  const after = E.compute(data).invoicesByNo.get(multi.no);
  assert.equal(after.deliveryStatus, multi.delivery === "Pickup" ? "Collected" : "Delivered");
  assert.equal(after.nextStep, "Done");
  // cash on delivery isn't "still to pay" before handing over
  assert.equal(D.stillOwes({ paysBy: T.COD, balance: 500 }), 0);
  assert.equal(D.stillOwes({ paysBy: "Bank transfer", balance: 500 }), 500);
  assert.equal(D.isDeliveryStep("Done"), true);
  assert.equal(D.isDeliveryStep("Lost"), false);
});

test("auction statements: now (buyers who have paid) and once every buyer has paid, adding up to the seller's account", () => {
  const o = E.compute(extras());
  const a1 = o.data.auctions.find(a => a.number === 1);
  const f = SA.auctionFigures(o, a1.id, "sS1");
  // S001 in auction 1: 1-09 (buyer paid S001 4,000 directly + us the rest), 1-01 and 1-05 not paid yet
  assert.equal(f.splits.length, 1);
  assert.equal(f.direct, 4000);
  assert.equal(f.netReady, 3700, "only 1-09's buyer has paid");
  assert.equal(f.balanceNow, -300, "they hold our 300 fee on 1-09");
  assert.equal(f.balance, Math.round((f.net - f.direct - f.paidByUs) * 100) / 100);
  assert.deepEqual(f.waitingRows.map(r => r.lot.key), ["1-01", "1-05"]);
  assert.equal(f.waiting, Math.round((f.net - 3700) * 100) / 100);
  const byKey = new Map(f.rows.map(r => [r.lot.key, r]));
  assert.equal(byKey.get("1-09").toYou, "Already with you (the buyer paid you)");
  assert.equal(byKey.get("1-09").buyerPaid, "Paid (part to you directly)");
  assert.equal(byKey.get("1-01").toYou, "When the buyer pays");
  assert.match(byKey.get("1-05").buyerPaid, /Cash on delivery/);
  // what the 4,000 was for: their share of 1-09 (3,700) and our fee (300)
  const d = f.splits[0];
  assert.equal(d.yours, 3700);
  assert.equal(d.oursFee, 300);
  assert.equal(d.oursCharges + d.oursOthers, 0);
  // every consignor: the auctions' balances, less settlements on account, make the seller's balance
  for (const s of o.sellers.filter(x => x.kind !== "own" && !x.demo)) {
    const total = o.data.auctions.filter(a => !a.demo).reduce((t, a) => t + (SA.auctionFigures(o, a.id, s.id)?.balance || 0), 0);
    const settled = (o.data.settlements || []).filter(x => x.seller_id === s.id).reduce((t, x) => t + Number(x.amount), 0);
    assert.equal(Math.round((total - settled) * 100) / 100, s.owed, `${s.code}`);
  }
});

test("delivery and other watches paid to the seller directly are shown as ours", () => {
  const withPays = (toSeller, toUs) => {
    const data = extras();
    data.ledger.find(e => e.id === "p4").amount = toSeller;
    const p5 = data.ledger.find(e => e.id === "p5");
    if (toUs) p5.amount = toUs;
    else data.ledger = data.ledger.filter(e => e.id !== "p5");
    const o = E.compute(data);
    return { o, f: SA.auctionFigures(o, o.data.auctions.find(a => a.number === 1).id, "sS1") };
  };
  // the buyer paid the seller their watch and the delivery (4,030), and us our own watch (3,900)
  let { o, f } = withPays(4030, 3900);
  let d = f.splits[0];
  assert.deepEqual([d.yours, d.oursFee, d.oursCharges, d.oursOthers], [3700, 300, 30, 0]);
  assert.match(SA.oursText(d), /our fee on your watch \(300\) and delivery \(30\)/);
  assert.ok(d.items.some(i => i.label === "Delivery" && i.amount === 30));
  assert.ok(d.items.some(i => /1-08 .*not yours: our own stock/.test(i.label)));
  assert.equal(f.balanceNow, -330);
  // the buyer paid the seller the whole invoice (7,930): our watch 1-08 is in their hands too
  ({ o, f } = withPays(7930, 0));
  d = f.splits[0];
  assert.deepEqual([d.yours, d.oursFee, d.oursCharges, d.oursOthers], [3700, 300, 30, 3900]);
  assert.equal(d.paidToUs, 0);
  assert.equal(f.balanceNow, -4230);
  // the account statement explains the same split
  const acct = SA.sellerAccount(o, "sS1");
  assert.match(acct.lines.find(l => l.kind === "direct").note, /yours 3,700; ours 4,230/);
});

test("money paid to the seller on an invoice the buyer hasn't finished paying waits with it", () => {
  const data = extras();
  data.ledger.find(e => e.id === "p5").amount = 3000; // the buyer still owes us 930
  const o = E.compute(data);
  const f = SA.auctionFigures(o, o.data.auctions.find(a => a.number === 1).id, "sS1");
  assert.equal(f.splits[0].ready, false);
  assert.equal(f.splits[0].stillToPay, 930);
  assert.equal(f.directNow, 0);
  assert.equal(f.netReady, 0);
  assert.equal(f.balanceNow, 0, "nothing is due either way until the buyer finishes paying");
  assert.equal(f.balance, Math.round((f.net - 4000) * 100) / 100);
  assert.ok(f.waitingRows.some(r => r.lot.key === "1-09"));
});

test("own stock (TS) statements total the hammer, the cost and the profit", () => {
  const o = E.compute(extras());
  const a1 = o.data.auctions.find(a => a.number === 1);
  const f = SA.auctionFigures(o, a1.id, "sTS");
  assert.ok(f && f.sold.length > 0);
  assert.equal(f.hammer, f.sold.reduce((t, l) => t + Number(l.hammer), 0));
  assert.equal(f.profit, Math.round((f.hammer - f.cost) * 100) / 100);
  assert.equal(f.net, 0, "no fee or payout for our own watches");
  assert.equal(f.unpaidHammer, f.sold.filter(l => o.invoicesByNo.get(l.invoiceNo).balance > 0.005).reduce((t, l) => t + Number(l.hammer), 0));
  for (const l of f.sold) assert.ok(f.buyer.get(l.id), `${l.key} shows its buyer`);
});

test("a seller with nothing in the auction still gets a statement when one of its buyers paid them", () => {
  const data = extras();
  data.sellers.push({ id: "sS3", code: "S003", name: "Sample Consignor Three", kind: "consignment", phone: "", instagram: "", email: "", id_checked: "", fee_pct: null, fee_fixed: null, bank: "", iban: "", notes: "" });
  // B0004 owes 7,460 for our own watch 1-04 and pays all of it to S003, a seller they know
  data.ledger.push({ id: "p9", seq: 9, entry_date: "2026-10-27", kind: "Payment", customer_id: "cB0004", invoice_no: "TS001-B0004", method: T.DIRECT, amount: 7460, reference: "", received_by: "", notes: "", created_at: "2026-10-27T10:00:00Z", paid_to_seller_id: "sS3" });
  const o = E.compute(data);
  const a1 = o.data.auctions.find(a => a.number === 1);
  assert.ok(SA.sellersInAuction(o, a1.id).includes("sS3"));
  const f = SA.auctionFigures(o, a1.id, "sS3");
  assert.equal(f.lots.length, 0);
  assert.equal(f.splits[0].yours, 0);
  assert.equal(f.splits[0].ours, 7460);
  assert.equal(f.balanceNow, -7460, "the invoice is paid in full, so they owe it to us now");
  const s3 = o.sellersById.get("sS3");
  assert.equal(s3.owed, -7460);
  assert.deepEqual(SA.sellerNowAndLater(o, "sS3"), { now: -7460, later: -7460 });
  // and every consignor's "once every buyer has paid" is what the seller page calls owed
  for (const s of o.sellers.filter(x => x.kind !== "own" && !x.demo)) assert.equal(SA.sellerNowAndLater(o, s.id).later, s.owed, s.code);
});

test("money a seller held from one auction's buyers that settled their lot in another auction shows on both statements", () => {
  const build = settle => {
    const data = extras();
    const a2 = data.auctions.find(a => a.number === 2);
    a2.sale_date = "2026-10-27";
    a2.status = "closed";
    // B0006 paid S001 the whole of invoice TS001-B0006 (S001's watch, our own watch and delivery): S001 holds 4,230 of ours
    data.ledger.find(e => e.id === "p4").amount = 7930;
    data.ledger = data.ledger.filter(e => e.id !== "p5");
    // in auction 2, S001's lot 2-05 sells to B0002, who pays us in full
    const lot = data.lots.find(l => l.id === "l2-5");
    Object.assign(lot, { hammer: 2900, winner_customer_id: "cB0002", winner_text: "B0002" });
    let o = E.compute(data);
    const inv = o.invoicesByNo.get(o.lotsById.get("l2-5").invoiceNo);
    data.ledger.push({ id: "p10", seq: 10, entry_date: "2026-10-27", kind: "Payment", customer_id: "cB0002", invoice_no: inv.no, method: "Bank transfer", amount: inv.total, reference: "", received_by: "", notes: "", created_at: "2026-10-27T10:00:00Z" });
    if (settle) {
      // Sellers › S001 › Payouts: tick lot 2-05 only; what S001 holds comes off it, so no cash moves
      o = E.compute(data);
      const l = o.lotsById.get("l2-5");
      const cash = E.settleCash([l.settle]).get(l.id);
      Object.assign(lot, { seller_paid_on: "2026-10-28", payout_amount: cash });
    }
    return E.compute(data);
  };
  const o = build(true);
  const a1 = o.data.auctions.find(a => a.number === 1).id;
  const a2 = o.data.auctions.find(a => a.number === 2).id;
  const net25 = o.lotsById.get("l2-5").net;
  assert.equal(Number(o.lotsById.get("l2-5").payout_amount), 0, "no cash: settled from what they held");
  const f2 = SA.auctionFigures(o, a2, "sS1");
  assert.equal(f2.settledFromElsewhere, net25);
  assert.equal(f2.balance, 0, "auction 2 is settled, not 'we owe you'");
  assert.equal(f2.balanceNow, 0);
  assert.equal(f2.setoffsIn[0].fromAuctionId, a1);
  assert.equal(f2.setoffsIn[0].toLot, "2-05");
  const f1 = SA.auctionFigures(o, a1, "sS1");
  assert.equal(f1.usedElsewhere, net25);
  assert.equal(f1.balance, Math.round((f1.net - 7930 + net25) * 100) / 100);
  const s1 = o.sellersById.get("sS1");
  const all = SA.sellerNowAndLater(o, "sS1");
  assert.equal(all.later, s1.owed);
  assert.equal(Math.round((f1.balance + f2.balance) * 100) / 100, s1.owed);
  assert.equal(SA.sellerAuctions(o, "sS1").onAccount, 0);
  // now: they still hold 4,230 − what settled 2-05 of ours, less their share of 1-09
  assert.equal(all.now, Math.round((3700 - 7930 + net25) * 100) / 100);
  // before it was settled, auction 2 was simply owed to them
  const before = build(false);
  assert.equal(SA.auctionFigures(before, a2, "sS1").balance, net25);
});

test("a seller paying us back, or us paying them on account, lands on the right auction or on account", () => {
  const data = extras();
  data.ledger.find(e => e.id === "p4").amount = 7930;
  data.ledger = data.ledger.filter(e => e.id !== "p5");
  data.settlements = [
    { id: "st1", seller_id: "sS1", entry_date: "2026-10-28", amount: -1000, account_code: "1020", reference: "", notes: "", created_at: "2026-10-28T10:00:00Z" },
    { id: "st2", seller_id: "sS2", entry_date: "2026-10-28", amount: 500, account_code: "1020", reference: "", notes: "", created_at: "2026-10-28T10:00:00Z" }
  ];
  const o = E.compute(data);
  const a1 = o.data.auctions.find(a => a.number === 1).id;
  const f1 = SA.auctionFigures(o, a1, "sS1");
  assert.equal(f1.setoffsOut[0].toAuctionId, null, "paid back: counted against auction 1, where they held our money");
  assert.equal(f1.usedElsewhere, 1000);
  for (const id of ["sS1", "sS2"]) assert.equal(SA.sellerNowAndLater(o, id).later, o.sellersById.get(id).owed, id);
  assert.equal(SA.sellerAuctions(o, "sS1").onAccount, 0);
  assert.equal(SA.sellerAuctions(o, "sS2").onAccount, -500, "we paid S002 500 on account, not yet used");
});
