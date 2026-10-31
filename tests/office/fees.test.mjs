// Seller fee scales: a fee by sold price, standard or per seller, from a start date. Made-up records only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = new URL("../../.office-test/office/", import.meta.url).pathname;
const F = require(out + "fees.js");
const E = require(out + "engine.js");
const { sampleOffice } = require(out + "sample.js");

const NOW = Date.parse("2026-10-20T08:00:00Z");
const SCALE = [{ upTo: 5000, pct: 0, fixed: 300 }, { upTo: 20000, pct: 7.5, fixed: 0 }, { upTo: null, pct: 5, fixed: 0 }];

test("bands: the sold price picks one band, which sets the whole fee", () => {
  assert.deepEqual(F.bandFor(SCALE, 4000), SCALE[0]);
  assert.deepEqual(F.bandFor(SCALE, 5000), SCALE[0], "a limit belongs to its band");
  assert.deepEqual(F.bandFor(SCALE, 5000.01), SCALE[1]);
  assert.deepEqual(F.bandFor(SCALE, 250000), SCALE[2]);
  // no open-ended band: prices above the last limit use the last band
  assert.deepEqual(F.bandFor(SCALE.slice(0, 2), 99999), SCALE[1]);
  assert.equal(F.bandFor([], 1000), null);
});

test("scales are stored and read back tidy, with their start date", () => {
  const messy = [{ upTo: null, pct: "5" }, { upTo: "20,000", pct: 7.5 }, { upTo: 5000, fixed: 300 }, { upTo: 5000, fixed: 999 }, { upTo: -1, pct: 3 }];
  assert.deepEqual(F.cleanScale(messy), SCALE);
  assert.deepEqual(F.parseScale({ from: "2026-11-01", bands: SCALE }), { bands: SCALE, from: "2026-11-01" });
  assert.deepEqual(F.parseScale(JSON.stringify(SCALE)), { bands: SCALE, from: null });
  assert.deepEqual(F.parseScale(null), { bands: [], from: null });
  assert.equal(F.scaleText(SCALE), "up to AED 5,000: AED 300; over 5,000 up to 20,000: 7.5%; over 20,000: 5%");
  assert.match(F.scaleText(SCALE, "AR"), /حتى 5,000 درهم: 300 درهم/);
});

test("typed scales are checked before saving", () => {
  const row = (upTo, pct = "", fixed = "") => ({ upTo, pct, fixed });
  assert.equal(F.scaleProblem([row("5000", "", "300"), row("", "5")]), "");
  assert.match(F.scaleProblem([row("", "5"), row("5000", "", "300")]), /only the last band/);
  assert.match(F.scaleProblem([row("20000", "5"), row("5000", "7")]), /must go up/);
  assert.match(F.scaleProblem([row("5000", "150")]), /between 0 and 100/);
  assert.match(F.scaleProblem([row("5000", "", "-1")]), /can't be negative/);
});

test("which fee applies: the lot's own, the seller's scale or %, then the standard scale or %", () => {
  const s = { fee_pct: 7.5, fee_fixed: 0, fee_scale: SCALE, fee_scale_from: null };
  const none = { seller_fee: null, fee_fixed: null };
  const plain = { fee_pct: null, fee_fixed: null };
  assert.equal(F.feeRule(none, plain, s).from, "scale");
  assert.equal(F.feeRule(none, { ...plain, fee_pct: 10 }, s).from, "seller");
  assert.equal(F.feeRule(none, { ...plain, fee_pct: 10, fee_scale: [{ upTo: null, pct: 4, fixed: 0 }] }, s).from, "seller scale");
  const lot = F.feeRule({ seller_fee: 3, fee_fixed: null }, { ...plain, fee_scale: SCALE }, s);
  assert.deepEqual([lot.from, lot.pct, lot.fixed], ["lot", 3, 0]);
  assert.equal(F.feeRule(none, plain, { ...s, fee_scale: [] }).from, "default");
  // a start date: earlier auctions keep the % and fixed fee
  const dated = { ...s, fee_scale_from: "2026-11-01" };
  assert.equal(F.feeRule(none, plain, dated, "2026-10-26").from, "default");
  assert.equal(F.feeRule(none, plain, dated, "2026-11-01").from, "scale");
  assert.equal(F.ruleText(F.feeRule(none, { ...plain, fee_pct: 10, fee_fixed: 50 }, s)), "10% of the hammer price + AED 50 per item sold");
});

test("the engine charges by the scale; the minimum fee and the hammer cap still apply", () => {
  const data = sampleOffice(NOW);
  data.settings = { ...data.settings, fee_scale: SCALE, fee_scale_from: null, fee_min: 0 };
  // sample consignor S001 has their own 7.5%; take it off so they follow the standard scale
  const s1 = data.sellers.find(x => x.id === "sS1");
  s1.fee_pct = null;
  s1.fee_fixed = null;
  let o = E.compute(data);
  for (const l of o.lots.filter(x => x.sold && x.seller_id === "sS1" && x.seller_fee == null && x.fee_fixed == null)) {
    const b = F.bandFor(SCALE, l.hammer);
    assert.equal(l.fee, Math.min(l.hammer, E.r2((l.hammer * b.pct) / 100 + b.fixed)), l.key);
    assert.deepEqual(l.feeScale, SCALE);
  }
  // a cheap watch: the fixed AED 300 of the first band, never more than its price
  const cheap = data.lots.find(l => l.id === "l2-5" ) || data.lots.find(l => l.seller_id === "sS1");
  Object.assign(cheap, { hammer: 250, winner_customer_id: "cB0002", winner_text: "B0002" });
  data.auctions.find(a => a.id === cheap.auction_id).sale_date = "2026-10-01";
  o = E.compute(data);
  assert.equal(o.lotsById.get(cheap.id).fee, 250);
  // the minimum fee still applies on top of the scale
  data.settings.fee_min = 400;
  Object.assign(cheap, { hammer: 4000 });
  o = E.compute(data);
  assert.equal(o.lotsById.get(cheap.id).fee, 400);
  // the scale only from 1 Nov: this auction keeps the standard %
  data.settings.fee_min = 0;
  data.settings.fee_scale_from = "2026-11-01";
  o = E.compute(data);
  assert.equal(o.lotsById.get(cheap.id).fee, E.r2(4000 * data.settings.fee_pct / 100));
  assert.equal(o.lotsById.get(cheap.id).feeScale, null);
});
