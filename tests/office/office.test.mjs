// Back office rules: invoices, fees, deposits, messages and the workbook import. Made-up records only.
// Run: npm run test:office
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = new URL("../../.office-test/office/", import.meta.url).pathname;
const { compute, invoiceNo, nextCustomerCode, nextReceiptNo, nextItemId, findCustomer } = require(out + "engine.js");
const msgs = require(out + "messages.js");
const { sampleOffice } = require(out + "sample.js");
const { planImport, planToData } = require(out + "import.js");
const { parseSheet, parseSharedStrings, cellDate, cellTime } = require(out + "xlsx.js");
const { DEFAULT_SETTINGS } = require(out + "types.js");

const NOW = Date.parse("2026-10-20T08:00:00Z");
const office = () => compute(sampleOffice(NOW));

test("one invoice per buyer per auction, lots combined, deposit applied", () => {
  const o = office();
  const i = o.invoicesByNo.get("TS001-B0001");
  assert.equal(i.lots.length, 2);
  assert.equal(i.hammer, 20600);
  assert.equal(i.deliveryFee, 30);
  assert.equal(i.total, 20630);
  assert.equal(i.depositApplied, 5000);
  assert.equal(i.balance, 15630);
  assert.equal(i.status, "Deposit paid");
  assert.equal(o.customersById.get(i.customer.id).depositHeld, 0);
});

test("card payments carry the card fee; pickup has no delivery fee", () => {
  const i = office().invoicesByNo.get("TS001-B0003");
  assert.equal(i.delivery, "Pickup");
  assert.equal(i.deliveryFee, 0);
  assert.equal(i.cardFee, 276); // 9,476 received by card at 3% → 276 of it is the fee
  assert.equal(i.total, 9476);
  assert.equal(i.balance, 0);
  assert.equal(i.status, "Paid");
  assert.equal(i.nextStep, "Ready for pickup");
});

test("overseas delivery fee from the adjustment; cash on delivery charge in the UAE", () => {
  const o = office();
  assert.equal(o.invoicesByNo.get("TS001-B0004").total, 7460);
  const cod = o.invoicesByNo.get("TS001-B0005");
  assert.equal(cod.cod, 10);
  assert.equal(cod.total, 1690);
  assert.equal(cod.status, "COD – collect");
  assert.equal(o.owing.some(x => x.no === cod.no), false);
});

test("seller fee: percentage plus fixed, never more than the hammer price", () => {
  const o = office();
  const lot = o.lots.find(l => l.key === "1-03");
  assert.equal(lot.type, "Consignment");
  assert.equal(lot.fee, 970); // 10% of 9,200 + AED 50
  assert.equal(lot.net, 8230);
  const data = sampleOffice(NOW);
  data.lots.find(l => l.id === "l1-3").hammer = 40;
  assert.equal(compute(data).lots.find(l => l.key === "1-03").fee, 40);
});

test("withdrawn lot leaves the invoice; money paid becomes a refund", () => {
  const data = sampleOffice(NOW);
  data.lots.find(l => l.id === "l1-2").exception = "Returned by buyer";
  const o = compute(data);
  assert.equal(o.invoicesByNo.has("TS001-B0002"), false);
  const r = o.refunds.find(x => x.ref === "TS001-B0002");
  assert.equal(r.source, "cancelled");
  assert.equal(r.amount, 11030);
  assert.match(o.ledger.find(e => e.invoice_no === "TS001-B0002").check, /^Order cancelled/);
});

test("overdue after the payment clock; reminders skip cash on delivery", () => {
  const o = office();
  const i = o.invoicesByNo.get("TS001-B0006");
  assert.ok(i.hoursOverdue > 0);
  assert.equal(i.nextStep, "Overdue: cancel the order?");
});

test("invoice message: lines, totals and how to pay, co-branded", () => {
  const o = office();
  const w = new msgs.Wording(o.data.settings, {});
  const t = msgs.invoiceMessage(w, o.invoicesByNo.get("TS001-B0001"), { code: "EN", url: "https://example.test/i" });
  assert.match(t, /thank you for buying at DXB Watch × The Time Souk!/);
  assert.match(t, /\*Invoice TS001-B0001\*/);
  assert.match(t, /• Lot 1-01 {2}Rolex Oyster Perpetual 36: AED 17,500/);
  assert.match(t, /Deposit received: -AED 5,000/);
  assert.match(t, /\*Balance due: AED 15,630\*/);
  assert.match(t, /IBAN: AE00 0000 0000 0000 0000 000/);
  assert.match(t, /Reply LINK/);
  assert.match(t, /Your invoice: https:\/\/example\.test\/i/);
  const both = msgs.invoiceMessage(w, o.invoicesByNo.get("TS001-B0001"), { code: "BOTH" });
  assert.match(both, /— — — — —/);
  assert.match(both, /للدفع: تحويل بنكي بمبلغ 15,630 درهم/);
});

test("winner, reminder and confirmation messages", () => {
  const o = office();
  const w = new msgs.Wording(o.data.settings, {});
  const lot = o.lots.find(l => l.key === "1-02");
  const win = msgs.winnerMessage(w, lot, Date.parse("2026-10-19T17:00:00Z"), { code: "EN" });
  assert.match(win, /You won Lot 1-02 at DXB Watch × The Time Souk/);
  assert.match(win, /Please pay by Mon 19 Oct, 9 PM/);
  const rem = msgs.reminderMessage(w, o.invoicesByNo.get("TS001-B0006"), NOW, { code: "EN" });
  assert.match(rem, /Payment was due by/);
  assert.equal(msgs.paidMessage(w, "EN", "Layla Example", "TS001-B0002", 11030, 0).includes("paid in full"), true);
  assert.match(msgs.refundMessage(w, "AR", "", "TS001-B0002", 100, "Bank transfer"), /تحويل بنكي/);
});

test("edited wording is used; the old workbook defaults aren't kept as edits", () => {
  const o = office();
  const w = new msgs.Wording(o.data.settings, { tabby: { en: "Instalments: ask us." } });
  assert.match(msgs.invoiceMessage(w, o.invoicesByNo.get("TS001-B0006"), { code: "EN" }), /Instalments: ask us\./);
});

test("codes and lookups", () => {
  assert.equal(invoiceNo(2, "B0044"), "TS002-B0044");
  assert.equal(nextCustomerCode([{ code: "B0009" }, { code: "B0061" }]), "B0062");
  assert.equal(nextReceiptNo([{ receipt_no: "CR-0003" }]), "CR-0004");
  assert.equal(nextItemId([{ item_id: "CR-0003-01" }, { item_id: "CR-0003-02" }], "CR-0003"), "CR-0003-03");
  const o = office();
  assert.equal(findCustomer(o.data.customers, "@Demo.Collector").code, "B0001");
  assert.equal(findCustomer(o.data.customers, "b0002").code, "B0002");
  assert.equal(findCustomer(o.data.customers, "050 000 0103")?.code, "B0003");
});

test("reading sheet XML", () => {
  const shared = parseSharedStrings('<sst><si><t>Lot ID</t></si><si><r><t>Ro</t></r><r><t>lex</t></r></si><si><t xml:space="preserve">a &amp; b</t></si></sst>');
  assert.deepEqual(shared, ["Lot ID", "Rolex", "a & b"]);
  const rows = parseSheet('<sheetData><row r="3"><c r="C3" t="s"><v>0</v></c><c r="D3" t="s"><v>1</v></c><c r="E3"><v>17500</v></c><c r="F3" t="str"><f>X</f><v>ok</v></c><c r="G3" t="inlineStr"><is><t>hi</t></is></c></row></sheetData>', shared);
  assert.equal(rows[3][3], "Lot ID");
  assert.equal(rows[3][4], "Rolex");
  assert.equal(rows[3][5], 17500);
  assert.equal(rows[3][6], "ok");
  assert.equal(rows[3][7], "hi");
  assert.equal(cellDate(46313), "2026-10-18");
  assert.equal(cellTime(0.875), "21:00");
});

/** A tiny workbook, sheet by sheet, laid out like the real one (made-up people). */
function fakeWorkbook() {
  const sheet = (header, rowNo, data) => {
    const rows = [];
    rows[rowNo] = [null, ...header];
    data.forEach((d, i) => (rows[rowNo + 1 + i] = [null, ...d]));
    return rows;
  };
  const settings = [];
  const put = (r, label, value) => (settings[r] = [null, null, label, value]);
  put(5, "Trading name", "The Time Souk");
  put(16, "Bank name", "Sample Bank");
  put(18, "IBAN", "AE00 1111");
  put(22, "Seller fee (default)", 0.05);
  put(26, "Hours to pay", 48);
  put(27, "Standard UAE delivery (AED)", 30);
  put(42, "WhatsApp language", "English");
  put(45, "Payment clock starts at (auction day)", 0.875);
  put(46, "Card payment fee", 0.03);
  put(50, "Ziina API key (paste here once)", "zk_live_SHOULD_NEVER_LEAVE");
  return {
    Settings: settings,
    Auctions: sheet(["Auction no.", "Date", "Live starts", "Payment clock (blank = Settings)", "Payment due by", "Notes", "Lot target"], 4, [
      [1, 46313, 0.875, null, null, "", 100],
      [2, null, null, null, null, "", 100]
    ]),
    Sellers: sheet(["Seller ID", "Name", "Type", "Phone / WhatsApp", "Instagram", "Email", "ID checked?", "Fee % (blank = default)"], 4, [
      ["TS", "The Time Souk (own stock)", "Own stock", "", "", "", "", 0],
      ["S001", "Sample Seller", "Consignment", "0500000999", "", "", "Yes", 0.1],
      ["S002"]
    ]),
    Buyers: sheet(["Buyer ID", "Instagram handle", "Full name", "Phone / WhatsApp", "Email", "Delivery address", "Area / city", "Country", "Delivery", "Usually pays by"], 4, [
      ["B0001", "demo.one", "Demo One", 971500000001, "", "", "Dubai", "United Arab Emirates", "", ""],
      ["B0002", "@Demo.Two", "", "", "", "", "", "Oman", "", ""],
      ["B0003"]
    ]),
    Lots: sheet(["Auction no.", "Lot no.", "Lot ID", "Brand", "Model", "Reference", "Year", "Box & papers", "Condition", "Serial no. (internal)", "Seller ID", "Seller", "Type", "Intake date", "Start price", "Reserve", "Cost (own stock)", "Fee % (blank = seller's)", "Winner (Instagram or buyer ID)", "Hammer price (AED)", "Underbidder", "Underbid (AED)", "Exception", "Status", "Buyer ID"], 3, [
      [1, 1, "1-01", "Rolex", "Datejust", "", "", "Full set", "", "", "S001", "", "", null, 10000, 12000, null, null, "demo.one", 13000, "x", 12500, "", "Sold", "B0001"],
      [1, 2, "1-02", "Omega", "Speedmaster", "", "", "", "", "", "TS", "", "", null, 5000, null, 4000, null, "B0002", 6000, "", null, "", "Sold", "B0002"],
      [1, 3, "1-03"]
    ]),
    Payments: sheet(["Date", "Type", "Buyer (Instagram or ID)", "Invoice no.", "Method", "Amount (AED)", "Reference / receipt", "Received by", "Notes", "Buyer ID"], 4, [
      [46313, "Payment", "", "TS001-B0001", "Bank transfer", 13030, "", "", "", "B0001"],
      [46313, "Deposit", "demo.two", "", "Cash", 1000, "", "", "", ""]
    ]),
    Adjustments: sheet(["Invoice no.", "Buyer", "Delivery (this invoice)", "Pays by (this invoice)", "Delivery fee (AED): overseas, type it here"], 4, [["TS001-B0002", "", "", "", 80], ["TS001-B0009"]]),
    Messages: sheet(["Key (don't change)", "Where it's used", "English", "Arabic"], 4, [
      ["inv_end", "", "Your PDF invoice is attached. Thank you for buying with {company}!", "مرفق لك الفاتورة بصيغة PDF. شكراً لتعاملك مع {company}!"],
      ["tabby", "", "Instalments: ask us.", ""]
    ])
  };
}

test("workbook import: typed values only, empty pre-numbered rows skipped, Ziina key never read", () => {
  const plan = planImport(fakeWorkbook());
  assert.equal(JSON.stringify(plan).includes("SHOULD_NEVER_LEAVE"), false);
  assert.equal(plan.settings.fee_pct, 5);
  assert.equal(plan.settings.card_fee_pct, 3);
  assert.equal(plan.settings.pay_clock, "21:00");
  assert.equal(plan.settings.wa_lang, "en");
  assert.equal(plan.auctions.length, 1);
  assert.deepEqual(plan.sellers.map(s => s.code), ["TS", "S001"]);
  assert.equal(plan.sellers[1].fee_pct, 10);
  assert.deepEqual(plan.customers.map(c => c.code), ["B0001", "B0002"]);
  assert.equal(plan.customers[0].phone, "+971500000001");
  assert.equal(plan.customers[1].instagram, "Demo.Two");
  assert.equal(plan.lots.length, 2);
  assert.equal(plan.lots[0].winner_code, "B0001");
  assert.equal(plan.lots[0].underbid, 12500);
  assert.equal(plan.ledger[1].customer_code, "B0002");
  assert.deepEqual(plan.messages.map(m => m.key), ["tabby"]);
  assert.equal(plan.adjustments.length, 1);
});

test("workbook import: the invoices it makes", () => {
  const o = compute(planToData(planImport(fakeWorkbook()), DEFAULT_SETTINGS, NOW));
  const a = o.invoicesByNo.get("TS001-B0001");
  assert.equal(a.total, 13030);
  assert.equal(a.status, "Paid");
  const b = o.invoicesByNo.get("TS001-B0002");
  assert.equal(b.country, "Oman");
  assert.equal(b.total, 6080);
  assert.equal(b.depositApplied, 1000);
  assert.equal(b.balance, 5080);
  assert.equal(o.lots.find(l => l.key === "1-01").fee, 1300);
  assert.equal(o.lots.find(l => l.key === "1-02").profit, 2000);
});

test("signed invoice links", () => {
  process.env.OFFICE_LINK_SECRET = "test-secret";
  const { signRef, verifyRef } = require(out + "links.js");
  const t = signRef("TS002-B0044");
  assert.equal(verifyRef(t), "TS002-B0044");
  assert.equal(verifyRef(t.replace("B0044", "B0045")), null);
  assert.equal(verifyRef("TS002-B0044"), null);
});
