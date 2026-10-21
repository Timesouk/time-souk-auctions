// Bidding engine tests against an in-memory Postgres (PGlite).
// Run: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Every migration, in order, exactly as you run them in Supabase.
const migrationsDir = new URL("../migrations/", import.meta.url);
const migrations = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort().map(f => readFileSync(new URL(f, migrationsDir), "utf8"));
let db;

// A tiny stand-in for the parts of Supabase the migration relies on.
const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
`;

async function as(uid, fn) {
  await db.query("select set_config('test.uid', $1, false)", [uid || ""]);
  try { return await fn(); } finally { await db.query("select set_config('test.uid', '', false)"); }
}
async function expectError(promise, code) {
  await assert.rejects(promise, err => {
    assert.match(String(err.message), new RegExp("^" + code), `expected ${code}, got ${err.message}`);
    return true;
  });
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (sql, params = []) => (await db.query(sql, params)).rows;

async function makeUser(email, { verified = true, staff = false, meta = {} } = {}) {
  const u = await one(
    "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, case when $2 then now() end, $3) returning id",
    [email, verified, JSON.stringify({ full_name: email.split("@")[0], lang: "en", ...meta })]
  );
  if (verified) {
    await db.query("update profiles set phone = '+97150' || paddle, phone_verified_at = now(), terms_accepted_at = now() where id = $1", [u.id]);
  }
  if (staff) await db.query("update profiles set role = 'staff' where id = $1", [u.id]);
  const p = await one("select paddle from profiles where id = $1", [u.id]);
  return { id: u.id, paddle: p.paddle };
}
let auctionNo = 0;
async function makeAuction({ status = "published", opensInMin = -60 } = {}) {
  auctionNo += 1;
  return (await one(
    `insert into auctions (number, sale_date, prebid_opens_at, live_starts_at, status)
     values ($1, '2026-10-03', now() + make_interval(mins => $2), now() + interval '1 day', $3) returning id`,
    [auctionNo, opensInMin, status]
  )).id;
}
let lotNo = 0;
async function makeLot(auctionId, { start = 40000, reserve = 46000, noReserve = false } = {}) {
  lotNo += 1;
  const l = await one(
    `insert into lots (auction_id, lot_number, brand, model, estimate_low, estimate_high, start_price, no_reserve)
     values ($1, $2, 'Rolex', 'Submariner', 48000, 54000, $3, $4) returning id`,
    [auctionId, lotNo, start, noReserve]
  );
  await db.query("insert into lot_private (lot_id, reserve) values ($1, $2)", [l.id, noReserve ? null : reserve]);
  return l.id;
}
const bid = (user, lot, amount, kind = "bid") =>
  as(user.id, () => one("select place_bid($1, $2, $3) as r", [lot, amount, kind])).then(x => x.r);
const staffBid = (staff, lot, amount, { paddle = null, ig = null, via = "instagram", kind = "bid" } = {}) =>
  as(staff.id, () => one("select staff_record_bid($1, $2, $3, $4, $5, $6) as r", [lot, amount, paddle, ig, via, kind])).then(x => x.r);
const action = (staff, lot, a, seconds = null) =>
  as(staff.id, () => one("select staff_lot_action($1, $2, $3) as r", [lot, a, seconds])).then(x => x.r);
const secsLeft = r => (new Date(r.ends_at) - Date.now()) / 1000;
const lotRow = lot => one("select * from lots where id = $1", [lot]);
const ladder = lot => all("select amount, paddle, via, is_auto from bids where lot_id = $1 order by id", [lot]);
const closeLot = lot => db.query("update lots set ends_at = now() - interval '1 second' where id = $1", [lot]);

let A, B, C, S, U;
before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  for (const m of migrations) await db.exec(m.replace(/^notify pgrst.*$/m, ""));
  A = await makeUser("a@test.ae");
  B = await makeUser("b@test.ae");
  C = await makeUser("c@test.ae");
  S = await makeUser("staff@test.ae", { staff: true });
  U = await makeUser("new@test.ae", { verified: false, meta: { instagram: "@New.Bidder!" } });
});

test("helpers: bid steps and working days", async () => {
  const r = await one("select bid_increment(999) a, bid_increment(1000) b, bid_increment(49999) c, bid_increment(50000) d, bid_increment(600000) e");
  assert.deepEqual([r.a, r.b, r.c, r.d, r.e], [50, 100, 1000, 2500, 25000]);
  const d = await one("select add_working_days('2026-10-03', 3)::text sat, add_working_days('2026-10-01', 3)::text thu, add_working_days('2026-10-05', 1)::text mon");
  assert.equal(d.sat, "2026-10-07");
  assert.equal(d.thu, "2026-10-06");
  assert.equal(d.mon, "2026-10-06");
});

test("new sign-ups get a profile with the next paddle number", async () => {
  const p = await one("select paddle, email, instagram, lang, role from profiles where id = $1", [U.id]);
  assert.ok(p.paddle >= 101);
  assert.equal(p.email, "new@test.ae");
  assert.equal(p.instagram, "new.bidder");
  assert.equal(p.role, "bidder");
  assert.ok(B.paddle > A.paddle);
});

test("bidding needs a signed-in, verified bidder", async () => {
  const lot = await makeLot(await makeAuction());
  await expectError(as(null, () => db.query("select place_bid($1, 40000)", [lot])), "sign_in_required");
  await expectError(bid(U, lot, 40000), "verification_required");
});

test("complete_profile records terms; phone verification still required", async () => {
  const s = await as(U.id, () => one("select complete_profile('New Bidder', 'United Arab Emirates', '@new.bidder', 'ar', true) as s")).then(x => x.s);
  assert.equal(s.terms_accepted, true);
  assert.equal(s.lang, "ar");
  assert.equal(s.verified, false);
  await expectError(as(U.id, () => db.query("select complete_profile('X', '', '', 'en', false)")), "name_required|terms_required");
});

test("pre-bids only open at the set time and never on drafts", async () => {
  const lotLater = await makeLot(await makeAuction({ opensInMin: 30 }));
  await expectError(bid(A, lotLater, 40000), "bidding_not_open");
  const lotDraft = await makeLot(await makeAuction({ status: "draft" }));
  await expectError(bid(A, lotDraft, 40000), "bidding_not_open");
});

test("first bid at the starting price, then any amount above the current bid", async () => {
  const lot = await makeLot(await makeAuction());
  await expectError(bid(A, lot, 39000), "bid_too_low:40000");
  const r = await bid(A, lot, 40000);
  assert.equal(r.price, 40000);
  assert.equal(r.leading, true);
  await expectError(bid(B, lot, 40000), "bid_too_low:40001");
  await expectError(bid(A, lot, 42000), "already_leading");
  const r2 = await bid(B, lot, 40250);
  assert.equal(r2.price, 40250);
  assert.equal((await lotRow(lot)).leader_paddle, B.paddle);
  const r3 = await staffBid(S, lot, 40251, { ig: "@quick.raise" });
  assert.equal(r3.price, 40251);
});

test("a max bid still answers a free-amount bid with one bid step, up to its limit", async () => {
  const lot = await makeLot(await makeAuction(), { start: 10000, reserve: 50000 });
  await bid(A, lot, 20000, "max");
  assert.equal((await lotRow(lot)).current_bid, 10000);
  const r = await bid(B, lot, 12345);
  assert.equal(r.leading, false);
  assert.equal(r.price, 12345 + 500);
  const r2 = await bid(B, lot, 19999);
  assert.equal(r2.leading, false);
  assert.equal(r2.price, 20000);
});

test("delivery address: saved at sign-up, kept when not sent, and shown to the bidder only", async () => {
  const P = await makeUser("addr@test.ae");
  const s1 = await as(P.id, () => one("select complete_profile('Addr Person', 'United Arab Emirates', null, 'en', true, 'Villa 12, Street 4, Al Barsha', 'Dubai') as s")).then(x => x.s);
  assert.equal(s1.address, "Villa 12, Street 4, Al Barsha");
  assert.equal(s1.city, "Dubai");
  const s2 = await as(P.id, () => one("select complete_profile('Addr Person', 'United Arab Emirates', null, 'en', true) as s")).then(x => x.s);
  assert.equal(s2.address, "Villa 12, Street 4, Al Barsha");
  await db.query("set role authenticated");
  try {
    const seen = await as(A.id, () => all("select address from profiles where id = $1", [P.id]));
    assert.equal(seen.length, 0);
  } finally {
    await db.query("reset role");
  }
});

test("lots can start at 0 with no estimates: first bid from AED 1, a lone max bid holds at AED 1", async () => {
  const auc = await makeAuction();
  lotNo += 1;
  const lot = (await one(
    `insert into lots (auction_id, lot_number, brand, model, start_price, no_reserve) values ($1, $2, 'Tudor', 'Ranger', 0, true) returning id`,
    [auc, lotNo]
  )).id;
  await db.query("insert into lot_private (lot_id) values ($1)", [lot]);
  const row = await lotRow(lot);
  assert.equal(row.estimate_low, null);
  assert.equal(row.start_price, 0);
  await expectError(bid(A, lot, 0), "invalid_amount");
  const r = await bid(A, lot, 20000, "max");
  assert.equal(r.price, 1);
  const r2 = await bid(B, lot, 750);
  assert.equal(r2.leading, false);
  assert.equal(r2.price, 800);
  await expectError(db.query("update lots set start_price = -1 where id = $1", [lot]), "new row for relation");
  await expectError(db.query("update lots set estimate_low = 5000, estimate_high = 4000 where id = $1", [lot]), "new row for relation");
  await db.query("update lots set estimate_low = 5000, estimate_high = null where id = $1", [lot]);
});

test("only one admin; staff logins are unique", async () => {
  const X = await makeUser("admin2@test.ae");
  const Y = await makeUser("staffy@test.ae");
  const admins = Number((await one("select count(*) n from profiles where role = 'admin'")).n);
  if (admins === 0) await db.query("update profiles set role = 'admin' where id = $1", [X.id]);
  await expectError(db.query("update profiles set role = 'admin' where id = $1", [Y.id]), "duplicate key value");
  await db.query("update profiles set role = 'staff', staff_login = 'ahmed' where id = $1", [X.id]);
  await expectError(db.query("update profiles set staff_login = 'ahmed' where id = $1", [Y.id]), "duplicate key value");
});

test("cash on delivery is an allowed payment method and defaults to a 10 dirham fee", async () => {
  assert.equal((await one("select cod_fee from settings where id = 1")).cod_fee, 10);
  const auc = await makeAuction();
  const lot = await makeLot(auc, { noReserve: true });
  await bid(A, lot, 40000);
  await closeLot(lot);
  await db.query("update profiles set address = 'Office 5, Gate Village', city = 'Dubai' where id = $1", [A.id]);
  const inv = (await one("select finalize_lot($1) as id", [lot])).id;
  const addr = await one("select delivery_address, delivery_city from invoices where id = $1", [inv]);
  assert.equal(addr.delivery_address, "Office 5, Gate Village");
  assert.equal(addr.delivery_city, "Dubai");
  await db.query("update profiles set address = '', city = '' where id = $1", [A.id]);
  // Cash on delivery is for deliveries within the UAE only.
  await expectError(db.query("update invoices set cod_fee = 10, cod_requested_at = now(), delivery_country = 'Oman' where id = $1", [inv]), "new row for relation \"invoices\" violates check constraint \"invoices_cod_uae_check");
  await db.query("update invoices set method = 'cod', cod_fee = 10, cod_requested_at = now(), delivery_country = 'United Arab Emirates' where id = $1", [inv]);
  const row = await one("select amount + cod_fee as total from invoices where id = $1", [inv]);
  assert.equal(row.total, 40010);
  await expectError(db.query("update invoices set method = 'cheque' where id = $1", [inv]), "new row for relation");
});

test("a max bid answers one step at a time", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(A, lot, 40000);
  const r = await bid(B, lot, 47000, "max");
  assert.equal(r.price, 41000);
  assert.equal(r.leading, true);
  const r2 = await bid(A, lot, 45000);
  assert.equal(r2.price, 46000);
  assert.equal(r2.leading, false);
  assert.equal((await lotRow(lot)).leader_paddle, B.paddle);
});

test("ties go to whoever committed first", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(B, lot, 47000, "max");
  await bid(A, lot, 47000);
  const l = await lotRow(lot);
  assert.equal(l.current_bid, 47000);
  assert.equal(l.leader_paddle, B.paddle);
  const steps = await ladder(lot);
  assert.deepEqual(steps.slice(-2).map(s => [s.amount, s.paddle]), [[47000, A.paddle], [47000, B.paddle]]);
});

test("two max bids: the higher wins one step above the other", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(B, lot, 47000, "max");
  assert.equal((await lotRow(lot)).current_bid, 40000);
  const r = await bid(C, lot, 60000, "max");
  assert.equal(r.price, 48000);
  const steps = await ladder(lot);
  assert.deepEqual(steps.map(s => [s.amount, s.paddle]), [[40000, B.paddle], [47000, B.paddle], [48000, C.paddle]]);
});

test("equal max bids: the earlier one leads at that amount", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(B, lot, 52000, "max");
  await bid(C, lot, 52000, "max");
  const l = await lotRow(lot);
  assert.equal(l.current_bid, 52000);
  assert.equal(l.leader_paddle, B.paddle);
});

test("a max bid can win by less than a full step", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(B, lot, 50500, "max");
  await bid(A, lot, 50000);
  const l = await lotRow(lot);
  assert.equal(l.current_bid, 50500);
  assert.equal(l.leader_paddle, B.paddle);
});

test("raising your own max bid keeps the price; lowering it is refused", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(A, lot, 40000);
  await bid(A, lot, 50000, "max");
  assert.equal((await lotRow(lot)).current_bid, 40000);
  await expectError(bid(A, lot, 45000, "max"), "max_not_higher:50000");
  await bid(A, lot, 60000, "max");
  assert.equal((await lotRow(lot)).current_bid, 40000);
  const r = await bid(B, lot, 55000);
  assert.equal(r.price, 57500); // steps are 2,500 from 50,000
  assert.equal((await lotRow(lot)).leader_paddle, A.paddle);
});

test("a max bid above the reserve jumps straight to the reserve (pure sale)", async () => {
  const lot = await makeLot(await makeAuction(), { start: 40000, reserve: 46000 });
  const r = await bid(A, lot, 50000, "max");
  assert.equal(r.price, 46000);
  assert.equal(r.pure, true);
  assert.equal((await lotRow(lot)).reserve_met, true);
});

test("a max bid below the reserve does not reach it", async () => {
  const lot = await makeLot(await makeAuction(), { start: 40000, reserve: 46000 });
  await bid(A, lot, 44000, "max");
  const l = await lotRow(lot);
  assert.equal(l.current_bid, 40000);
  assert.equal(l.reserve_met, false);
});

test("a straight bid that meets the reserve makes it a pure sale", async () => {
  const lot = await makeLot(await makeAuction(), { start: 40000, reserve: 46000 });
  await bid(A, lot, 40000);
  assert.equal((await bid(B, lot, 45000)).pure, false);
  assert.equal((await bid(A, lot, 46000)).pure, true);
});

test("sudden death: no bids once the timer has ended", async () => {
  const lot = await makeLot(await makeAuction());
  await db.query("update lots set ends_at = now() + interval '30 seconds' where id = $1", [lot]);
  await bid(A, lot, 40000);
  await closeLot(lot);
  await expectError(bid(B, lot, 41000), "lot_closed");
  await expectError(staffBid(S, lot, 41000, { ig: "late_bidder" }), "lot_closed");
});

test("only staff can type in bids or run the block", async () => {
  const lot = await makeLot(await makeAuction());
  await expectError(staffBid(A, lot, 40000, { ig: "someone" }), "staff_only");
  await expectError(action(A, lot, "block"), "staff_only");
  await expectError(as(A.id, () => db.query("select finalize_lot($1)", [lot])), "staff_only");
});

test("Instagram bids: unknown handles stay as handles; a handle can't outbid itself", async () => {
  const lot = await makeLot(await makeAuction());
  const r = await staffBid(S, lot, 40000, { ig: "@Watch.Fan" });
  assert.equal(r.leader_paddle, null);
  const l = await lotRow(lot);
  assert.equal(l.leader_via, "instagram");
  const h = await all("select ig_handle, entered_by from bids where lot_id = $1", [lot]);
  assert.equal(h[0].ig_handle, "watch.fan");
  assert.equal(h[0].entered_by, S.id);
  await expectError(staffBid(S, lot, 41000, { ig: "watch.fan" }), "already_leading");
  await expectError(staffBid(S, lot, 41000, { paddle: 99999, via: "phone" }), "unknown_paddle");
  await expectError(staffBid(S, lot, 50000, { ig: "watch.fan", kind: "max" }), "max_needs_paddle");
});

test("a confirmed Instagram handle is credited to that bidder's paddle", async () => {
  await db.query("update profiles set instagram = 'a.collector', instagram_confirmed = true where id = $1", [A.id]);
  const lot = await makeLot(await makeAuction());
  const r = await staffBid(S, lot, 40000, { ig: "@A.Collector" });
  assert.equal(r.leader_paddle, A.paddle);
  await expectError(bid(A, lot, 41000), "already_leading");
});

test("website max bids answer Instagram bids", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(B, lot, 45000, "max");
  const r = await staffBid(S, lot, 42000, { ig: "fast.fingers" });
  assert.equal(r.price, 43000);
  assert.equal((await lotRow(lot)).leader_paddle, B.paddle);
});

test("suspended bidders can't bid and their max bids stop counting", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(C, lot, 70000, "max");
  await db.query("update profiles set suspended = true where id = $1", [C.id]);
  await expectError(bid(C, lot, 50000), "account_suspended");
  await bid(A, lot, 41000);
  assert.equal((await lotRow(lot)).leader_paddle, A.paddle);
  await db.query("update profiles set suspended = false where id = $1", [C.id]);
});

test("live controls: block, start, one live lot at a time, hammer, reopen", async () => {
  const auc = await makeAuction();
  const lot1 = await makeLot(auc, { noReserve: true });
  const lot2 = await makeLot(auc);
  await expectError(action(S, lot1, "start"), "not_on_block");
  await action(S, lot1, "block");
  const started = await action(S, lot1, "start");
  const secs = (new Date(started.ends_at) - Date.now()) / 1000;
  assert.ok(secs > 170 && secs <= 181, `timer was ${secs}s`);
  await expectError(action(S, lot1, "start"), "timer_already_used");
  await expectError(action(S, lot2, "block"), "another_lot_live");
  await action(S, lot1, "stop");
  assert.equal((await lotRow(lot1)).ends_at, null);
  await action(S, lot1, "start");
  await action(S, lot1, "restart");
  await bid(A, lot1, 40000);
  await action(S, lot1, "hammer");
  await expectError(bid(B, lot1, 41000), "lot_closed");
  await action(S, lot2, "block");
  await action(S, lot2, "clear");
  assert.equal((await one("select block_lot_id from auctions where id = $1", [auc])).block_lot_id, null);
});

test("timers: settings default, then the auction's, then the lot's own; never changed while running", async () => {
  const auc = await makeAuction();
  const [l1, l2, l3, l4] = [await makeLot(auc), await makeLot(auc), await makeLot(auc), await makeLot(auc)];
  const near = (r, s) => assert.ok(Math.abs(secsLeft(r) - s) < 3, `expected about ${s}s, got ${secsLeft(r)}s`);

  await db.query("update settings set timer_seconds = 150 where id = 1");
  await action(S, l1, "block");
  near(await action(S, l1, "start"), 150);
  await action(S, l1, "hammer");

  await db.query("update auctions set timer_seconds = 120 where id = $1", [auc]);
  await action(S, l2, "block");
  near(await action(S, l2, "start"), 120);
  await expectError(action(S, l2, "set_timer", 300), "timer_running");
  near(await action(S, l2, "restart", 90), 90);
  assert.equal((await lotRow(l2)).timer_seconds, 90);
  await action(S, l2, "hammer");

  await action(S, l3, "block", 45);
  assert.equal((await lotRow(l3)).timer_seconds, 45);
  await action(S, l3, "set_timer", 60);
  near(await action(S, l3, "start"), 60);
  await action(S, l3, "hammer");

  await action(S, l4, "block");
  await expectError(action(S, l4, "set_timer", 5), "invalid_timer");
  await expectError(action(S, l4, "start", 7200), "invalid_timer");
  await action(S, l4, "set_timer", 200);
  await action(S, l4, "set_timer", null);
  near(await action(S, l4, "start"), 120);
  await action(S, l4, "hammer");
  await expectError(as(A.id, () => one("select staff_lot_action($1, 'set_timer', 60)", [l4])), "staff_only");
  await expectError(db.query("update auctions set timer_seconds = 5 where id = $1", [auc]), "new row for relation");
  await db.query("update settings set timer_seconds = 180 where id = 1");
});

test("invoices: created once for sold lots, due in working days from the day it's sent", async () => {
  // Saturday 26 September 2026: three working days later is Wednesday 30th.
  assert.equal((await one("select add_working_days('2026-09-26', 3)::text d")).d, "2026-09-30");
  const auc = await makeAuction();
  const lot = await makeLot(auc, { reserve: 46000 });
  await bid(A, lot, 40000);
  await bid(B, lot, 47000);
  // Won on 26 September, invoice sent today: the deadline counts from today.
  await db.query("update lots set ends_at = '2026-09-26 16:05:00+04' where id = $1", [lot]);
  const id1 = (await one("select finalize_lot($1) id", [lot])).id;
  const id2 = (await one("select finalize_lot($1) id", [lot])).id;
  assert.ok(id1);
  assert.equal(id1, id2);
  const inv = await one("select number, amount, bidder_id, due_date::text due, status, length(pay_token) tl from invoices where id = $1", [id1]);
  assert.equal(inv.amount, 47000);
  assert.equal(inv.bidder_id, B.id);
  const expected = (await one("select add_working_days((now() at time zone 'Asia/Dubai')::date, 3)::text d")).d;
  assert.equal(inv.due, expected);
  assert.equal(inv.status, "unpaid");
  assert.equal(inv.tl, 48);
  assert.match(inv.number, /^TS-\d{3}-\d{3}$/);
});

test("no invoice when the reserve isn't met; making it a pure sale sells it", async () => {
  const auc = await makeAuction();
  const lot = await makeLot(auc, { reserve: 46000 });
  await bid(A, lot, 40000);
  await closeLot(lot);
  assert.equal((await one("select finalize_lot($1) id", [lot])).id, null);
  const lot2 = await makeLot(auc, { reserve: 46000 });
  await bid(A, lot2, 40000);
  await action(S, lot2, "pure");
  assert.equal((await lotRow(lot2)).made_pure, true);
  await closeLot(lot2);
  assert.ok((await one("select finalize_lot($1) id", [lot2])).id);
});

test("no-reserve lots sell at any price; Instagram winners are invoiced by handle", async () => {
  const lot = await makeLot(await makeAuction(), { start: 3500, noReserve: true });
  await staffBid(S, lot, 3500, { ig: "@Bargain.Hunter" });
  await closeLot(lot);
  const ids = (await all("select finalize_due_lots() id")).map(r => r.id);
  assert.ok(ids.length >= 1);
  const inv = await one("select bidder_id, ig_handle, amount from invoices where lot_id = $1", [lot]);
  assert.equal(inv.bidder_id, null);
  assert.equal(inv.ig_handle, "bargain.hunter");
  assert.equal(inv.amount, 3500);
});

test("reopening voids an unpaid invoice; a paid one blocks reopening", async () => {
  const auc = await makeAuction();
  const lot = await makeLot(auc, { noReserve: true });
  await bid(A, lot, 40000);
  await action(S, lot, "block");
  await action(S, lot, "hammer");
  const inv = (await one("select finalize_lot($1) id", [lot])).id;
  await action(S, lot, "reopen");
  assert.equal((await one("select status from invoices where id = $1", [inv])).status, "void");
  assert.equal((await lotRow(lot)).ends_at, null);
  await bid(B, lot, 41000);
  await action(S, lot, "hammer");
  const inv2 = (await one("select finalize_lot($1) id", [lot])).id;
  assert.notEqual(inv2, inv);
  await db.query("update invoices set status = 'paid' where id = $1", [inv2]);
  await expectError(action(S, lot, "reopen"), "invoice_paid");
});

test("my_status reports verification for the signed-in bidder only", async () => {
  const s = await as(A.id, () => one("select my_status() s")).then(x => x.s);
  assert.equal(s.paddle, A.paddle);
  assert.equal(s.verified, true);
  assert.equal((await as(null, () => one("select my_status() s"))).s, null);
});

test("privacy: browsers read public lots but never reserves, max bids, bids or invoices", async () => {
  const pub = await makeAuction();
  const draft = await makeAuction({ status: "draft" });
  const lot = await makeLot(pub);
  await makeLot(draft);
  await bid(B, lot, 45000, "max");
  await db.exec("set role anon");
  try {
    const lots = await all("select id, auction_id from lots");
    assert.ok(lots.some(l => l.id === lot));
    assert.ok(!lots.some(l => l.auction_id === draft));
    assert.equal((await all("select * from lot_private")).length, 0);
    assert.equal((await all("select * from max_bids")).length, 0);
    assert.equal((await all("select * from bids")).length, 0);
    assert.equal((await all("select * from invoices")).length, 0);
    assert.equal((await all("select * from profiles")).length, 0);
    const hist = await all("select * from lot_bid_history($1)", [lot]);
    assert.equal(hist.length, 1);
    assert.deepEqual(Object.keys(hist[0]).sort(), ["amount", "created_at", "is_auto", "paddle", "via"]);
    await expectError(db.query("insert into bids (lot_id, amount, paddle, via, bidder_id) values ($1, 999999, 1, 'web', $2)", [lot, A.id]), "permission denied");
    await expectError(db.query("update lots set current_bid = 1 where id = $1", [lot]), "permission denied");
  } finally {
    await db.exec("reset role");
  }
});

test("privacy: a signed-in bidder sees only their own bids, max bids and profile", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 90000 });
  await bid(A, lot, 40000);
  await bid(B, lot, 50000, "max");
  await db.query("select set_config('test.uid', $1, false)", [A.id]);
  await db.exec("set role authenticated");
  try {
    const bids = await all("select bidder_id from bids where lot_id = $1", [lot]);
    assert.ok(bids.length >= 1 && bids.every(b => b.bidder_id === A.id));
    assert.equal((await all("select * from max_bids where lot_id = $1", [lot])).length, 0);
    const profs = await all("select id from profiles");
    assert.deepEqual(profs.map(p => p.id), [A.id]);
    await expectError(db.query("update profiles set role = 'admin' where id = $1", [A.id]), "permission denied");
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('test.uid', '', false)");
  }
});

test("staff can read private lot data through row security", async () => {
  const lot = await makeLot(await makeAuction(), { reserve: 77000 });
  await db.query("select set_config('test.uid', $1, false)", [S.id]);
  await db.exec("set role authenticated");
  try {
    const p = await one("select reserve from lot_private where lot_id = $1", [lot]);
    assert.equal(p.reserve, 77000);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('test.uid', '', false)");
  }
});

// ───────────── back office (0006) ─────────────

test("back office: staff-only tables, bidders see nothing and nobody writes from the browser", async () => {
  const c = await one("insert into customers (code, instagram, full_name) values ('B9001', 'test.buyer', 'Test Buyer') returning id");
  await db.query("insert into ledger (kind, customer_id, invoice_no, method, amount) values ('Payment', $1, 'TS001-B9001', 'Cash', 500)", [c.id]);
  for (const [uid, sees] of [[A.id, 0], [S.id, 1]]) {
    await db.query("select set_config('test.uid', $1, false)", [uid]);
    await db.exec("set role authenticated");
    try {
      assert.equal((await all("select id from customers where code = 'B9001'")).length, sees);
      assert.equal((await all("select id from ledger where invoice_no = 'TS001-B9001'")).length, sees);
      assert.equal((await all("select id from office_settings")).length, sees);
      await expectError(db.query("insert into ledger (kind, method, amount) values ('Deposit', 'Cash', 1)"), "permission denied");
      await expectError(db.query("update customers set full_name = 'x'"), "permission denied");
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('test.uid', '', false)");
    }
  }
});

test("back office: checks on amounts and kinds; workbook rows are matched, not doubled", async () => {
  await expectError(db.query("insert into ledger (kind, method, amount) values ('Payment', 'Cash', 0)"), "new row for relation \"ledger\" violates check constraint");
  await expectError(db.query("insert into ledger (kind, method, amount) values ('Gift', 'Cash', 5)"), "new row for relation \"ledger\" violates check constraint");
  const up = "insert into ledger (import_ref, kind, method, amount) values ('wb:pay:7', 'Deposit', 'Cash', $1) on conflict (import_ref) do update set amount = excluded.amount";
  await db.query(up, [100]);
  await db.query(up, [150]);
  const rows = await all("select amount from ledger where import_ref = 'wb:pay:7'");
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].amount), 150);
  const s = await one("select brand_name, fee_pct, hours_to_pay, card_fee_methods from office_settings where id = 1");
  assert.equal(s.brand_name, "DXB Watch × The Time Souk");
  assert.equal(Number(s.fee_pct), 7.5);
  assert.deepEqual(s.card_fee_methods, ["Card link (Ziina)"]);
  assert.equal((await one("select kind from sellers where code = 'TS'")).kind, "own");
});

test("back office: 0006 can be run again safely", async () => {
  const sql = readFileSync(new URL("0006_back_office.sql", migrationsDir), "utf8");
  await db.exec(sql.replace(/^notify pgrst.*$/m, ""));
  await db.exec(sql.replace(/^notify pgrst.*$/m, ""));
  assert.equal((await one("select count(*)::int n from office_settings")).n, 1);
  assert.equal((await one("select count(*)::int n from sellers where code = 'TS'")).n, 1);
  assert.equal((await one("select count(*)::int n from customers where code = 'B9001'")).n, 1);
});

// ───────────── accounting (0007) ─────────────

const post = (entry, lines) => one("select acct_post($1::jsonb, $2::jsonb) as id", [JSON.stringify(entry), JSON.stringify(lines)]).then(r => r.id);

test("accounting: balanced entries only, from known accounts", async () => {
  const id = await post({ entry_date: "2026-10-20", kind: "expense", memo: "Courier", payee: "Aramex" }, [
    { account_code: "6010", debit: 95.24 },
    { account_code: "1300", debit: 4.76 },
    { account_code: "1020", credit: 100 }
  ]);
  const lines = await all("select account_code, debit::float, credit::float from acct_lines where entry_id = $1 order by id", [id]);
  assert.equal(lines.length, 3);
  assert.equal((await one("select kind from acct_entries where id = $1", [id])).kind, "expense");
  await expectError(post({ entry_date: "2026-10-20" }, [{ account_code: "6010", debit: 10 }, { account_code: "1020", credit: 9 }]), "acct: debits");
  await expectError(post({ entry_date: "2026-10-20" }, [{ account_code: "6010", debit: 10 }]), "acct: an entry needs");
  await expectError(post({ entry_date: "2026-10-20" }, [{ account_code: "9999", debit: 10 }, { account_code: "1020", credit: 10 }]), "acct: account 9999");
  await expectError(post({ entry_date: "2026-10-20" }, [{ account_code: "6010", debit: 10, credit: 10 }, { account_code: "1020", credit: 10 }]), "acct: each line");
  await expectError(post({ entry_date: "2026-10-20", kind: "gift" }, [{ account_code: "6010", debit: 10 }, { account_code: "1020", credit: 10 }]), "new row for relation \"acct_entries\" violates check constraint");
  // nothing half-saved from the failures
  assert.equal((await one("select count(*)::int n from acct_entries")).n, 1);
});

test("accounting: closed books refuse new and voided entries on or before the date", async () => {
  const id = await post({ entry_date: "2026-09-30" }, [{ account_code: "3100", debit: 500 }, { account_code: "1010", credit: 500 }]);
  await db.query("update office_settings set acct_lock_date = '2026-09-30' where id = 1");
  try {
    await expectError(post({ entry_date: "2026-09-30" }, [{ account_code: "6010", debit: 1 }, { account_code: "1020", credit: 1 }]), "acct: the books are closed");
    await expectError(db.query("select acct_void($1, 'x')", [id]), "acct: the books are closed");
    await post({ entry_date: "2026-10-01" }, [{ account_code: "6010", debit: 1 }, { account_code: "1020", credit: 1 }]);
  } finally {
    await db.query("update office_settings set acct_lock_date = null where id = 1");
  }
  await db.query("select acct_void($1, 'typed twice')", [id]);
  assert.equal((await one("select void from acct_entries where id = $1", [id])).void, true);
});

test("accounting: staff read, bidders see nothing, nobody posts from the browser", async () => {
  for (const [uid, sees] of [[A.id, 0], [S.id, 1]]) {
    await db.query("select set_config('test.uid', $1, false)", [uid]);
    await db.exec("set role authenticated");
    try {
      assert.equal((await all("select code from acct_accounts where code = '1020'")).length, sees);
      assert.equal((await all("select id from acct_entries limit 1")).length, sees);
      await expectError(post({ entry_date: "2026-10-21" }, [{ account_code: "6010", debit: 1 }, { account_code: "1020", credit: 1 }]), "permission denied");
      await expectError(db.query("insert into acct_accounts (code, name, type) values ('7777', 'x', 'expense')"), "permission denied");
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('test.uid', '', false)");
    }
  }
  const s = await one("select acct_methods->>'Cash' cash, acct_payout_default from office_settings where id = 1");
  assert.equal(s.cash, "1010");
  assert.equal(s.acct_payout_default, "1020");
});

test("accounting: 0007 can be run again safely", async () => {
  const sql = readFileSync(new URL("0007_accounting.sql", migrationsDir), "utf8").replace(/^notify pgrst.*$/m, "");
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await one("select count(*)::int n from acct_accounts where code = '1100'")).n, 1);
  assert.ok((await one("select count(*)::int n from acct_entries")).n >= 2);
});

// ───────────── Instagram-only, demo auction, direct payments (0008) ─────────────

test("0008: can be run again safely, and adds its columns", async () => {
  const sql = readFileSync(new URL("0008_office_extras.sql", migrationsDir), "utf8").replace(/^notify pgrst.*$/m, "");
  await db.exec(sql);
  await db.exec(sql);
  const cols = await all(
    `select table_name || '.' || column_name c from information_schema.columns
      where (table_name, column_name) in (('auctions','instagram'), ('auctions','demo'), ('customers','demo'), ('sellers','demo'), ('ledger','paid_to_seller_id'), ('lot_private','payout_amount'))`
  );
  assert.equal(cols.length, 6);
});

test("0008: an Instagram-only auction stays off the website; a demo auction can never be published", async () => {
  const a = await makeAuction({ status: "draft" });
  await db.query("update auctions set instagram = true where id = $1", [a]);
  const lot = await makeLot(a);
  // bidders see neither the auction nor its lots; staff see both
  for (const [uid, sees] of [[A.id, 0], [S.id, 1]]) {
    await db.query("select set_config('test.uid', $1, false)", [uid]);
    await db.exec("set role authenticated");
    try {
      const seen = await one("select (select count(*)::int from auctions where id = $1) a, (select count(*)::int from lots where id = $2) l", [a, lot]);
      assert.deepEqual([seen.a, seen.l], [sees, sees]);
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('test.uid', '', false)");
    }
  }
  await expectError(bid(A, lot, 1000), "bidding_not_open");
  // the demo auction
  const d = (await one(
    `insert into auctions (number, sale_date, prebid_opens_at, live_starts_at, status, demo)
     values (999, current_date, now() - interval '1 day', now() + interval '1 hour', 'draft', true) returning id`
  )).id;
  await expectError(db.query("update auctions set status = 'published' where id = $1", [d]), "new row for relation \"auctions\" violates check constraint \"auctions_demo_draft\"");
  await db.query("delete from auctions where id = $1", [d]);
});

test("0008: a payment to the seller directly names the seller, who can't be deleted while it exists", async () => {
  const s = (await one("insert into sellers (code, name, kind) values ('S900', 'Test consignor', 'consignment') returning id")).id;
  const c = (await one("insert into customers (code, instagram) values ('B9801', 'direct.buyer') returning id")).id;
  await db.query(
    "insert into ledger (kind, customer_id, invoice_no, method, amount, paid_to_seller_id) values ('Payment', $1, 'TS050-B9801', 'Paid to seller directly', 4000, $2)",
    [c, s]
  );
  await expectError(db.query("delete from sellers where id = $1", [s]), "update or delete on table \"sellers\" violates");
  await db.query("delete from ledger where customer_id = $1", [c]);
  await db.query("delete from customers where id = $1", [c]);
  await db.query("delete from sellers where id = $1", [s]);
});
