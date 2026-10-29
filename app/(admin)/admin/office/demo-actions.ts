"use server";
// The demo auction for training staff: make it, reset it to fresh lots, or remove it (admin only).
// It never goes on the website, is kept out of the accounts and totals, and only uses demo buyers and sellers.
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import { AUCTION_TIME, addDays, dubaiInstant, todayDubai } from "@/lib/format";
import { nextCustomerCode, pad3 } from "@/lib/office/engine";
import { fetchAll } from "@/lib/office/load";
import { DEMO_BUYERS, DEMO_SELLERS, DEMO_WATCHES } from "@/lib/office/demo";
import { DEMO_AUCTION_NO } from "@/lib/office/types";
import type { Result } from "../actions";

const ok = (message: string, id?: string): Result => ({ ok: true, message, id });
const bad = (message: string): Result => ({
  ok: false,
  message: /does not exist/.test(message) && /demo|instagram/.test(message)
    ? "The back office needs one more database update: run supabase/migrations/0008_office_extras.sql in the Supabase SQL Editor."
    : message
});

async function guard(fn: () => Promise<Result>): Promise<Result> {
  try {
    if (IS_PREVIEW) return bad("Preview mode: connect Supabase to save.");
    await requireAdmin();
    return await fn();
  } catch (e) {
    return bad((e as Error).message || "Something went wrong");
  }
}

const refresh = () => {
  revalidatePath("/admin/office", "layout");
  revalidatePath("/admin/auctions");
};

type Db = ReturnType<typeof adminClient>;

async function demoAuction(db: Db) {
  const { data, error } = await db.from("auctions").select("id, number").eq("demo", true).order("number").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; number: number } | null;
}

/** The demo sellers, made if missing. */
async function ensureSellers(db: Db) {
  const { data: have, error } = await db.from("sellers").select("id, code, demo").in("code", DEMO_SELLERS.map(s => s.code));
  if (error) throw new Error(error.message);
  const clash = (have || []).find(s => !s.demo);
  if (clash) throw new Error(`Seller ${clash.code} already exists as a real seller, so the demo can't use that code.`);
  const missing = DEMO_SELLERS.filter(s => !(have || []).some(h => h.code === s.code));
  if (missing.length) {
    const { error: e } = await db.from("sellers").insert(missing.map(s => ({ ...s, demo: true })));
    if (e) throw new Error(e.message);
  }
  const { data: all } = await db.from("sellers").select("id, code").in("code", DEMO_SELLERS.map(s => s.code));
  return new Map((all || []).map(s => [s.code as string, s.id as string]));
}

/** The starter demo buyers, made if missing (D0001…). */
async function ensureBuyers(db: Db) {
  const { data: have } = await db.from("customers").select("instagram").eq("demo", true);
  const known = new Set((have || []).map(c => String(c.instagram || "")));
  for (const b of DEMO_BUYERS) {
    if (known.has(b.instagram)) continue;
    const { data: real } = await db.from("customers").select("code").eq("instagram", b.instagram).limit(1);
    if (real?.length) continue; // a real buyer happens to use that handle: skip it
    const codes = await fetchAll<{ code: string }>(db, "customers", "code", "code");
    const { error } = await db.from("customers").insert({ ...b, code: nextCustomerCode(codes, "D"), demo: true, notes: "Demo buyer for training." });
    if (error) throw new Error(error.message);
  }
}

/** Fresh made-up lots in the demo auction. */
async function seedLots(db: Db, auctionId: string, sellers: Map<string, string>) {
  const rows = DEMO_WATCHES.map(([brand, model, reference, year, bp, condition, start, reserve], i) => ({
    auction_id: auctionId, lot_number: i + 1, brand, model, reference, year, condition, start_price: start,
    has_box: /box|Full/.test(bp), has_papers: /papers|Full/.test(bp), no_reserve: !reserve
  }));
  const { data, error } = await db.from("lots").insert(rows).select("id, lot_number");
  if (error) throw new Error(error.message);
  const byNo = new Map((data || []).map(r => [r.lot_number as number, r.id as string]));
  const privs = DEMO_WATCHES.map(([, , , , bp, , , reserve, seller, cost], i) => {
    const own = seller === "DEMO-O";
    return {
      lot_id: byNo.get(i + 1)!, reserve, cost, seller_id: sellers.get(seller) || null, source: own ? "stock" : "consign",
      consignor_name: own ? "" : "Demo consignor (training)", box_papers: bp
    };
  });
  const { error: e2 } = await db.from("lot_private").insert(privs);
  if (e2) throw new Error(e2.message);
  return rows.length;
}

/** Deletes everything the demo produced: payments, messages, card links, adjustments, lots, demo intake and demo buyers. */
async function clearDemo(db: Db, auction: { id: string; number: number } | null, dropSellers: boolean) {
  const { data: buyers } = await db.from("customers").select("id").eq("demo", true);
  const { data: sellers } = await db.from("sellers").select("id").eq("demo", true);
  const buyerIds = (buyers || []).map(b => b.id as string);
  const sellerIds = (sellers || []).map(s => s.id as string);
  const prefix = auction ? `TS${pad3(auction.number)}-` : null;
  const steps: { error: { message: string } | null }[] = [];
  if (prefix) {
    steps.push(await db.from("ledger").delete().like("invoice_no", `${prefix}%`));
    steps.push(await db.from("card_links").delete().like("invoice_no", `${prefix}%`));
    steps.push(await db.from("sent_log").delete().like("ref", `${prefix}%`));
    steps.push(await db.from("invoice_adjustments").delete().like("invoice_no", `${prefix}%`));
  }
  if (buyerIds.length) {
    steps.push(await db.from("ledger").delete().in("customer_id", buyerIds));
    steps.push(await db.from("card_links").delete().in("customer_id", buyerIds));
  }
  if (sellerIds.length) steps.push(await db.from("ledger").delete().in("paid_to_seller_id", sellerIds));
  if (sellerIds.length) {
    const r = await db.from("seller_settlements").delete().in("seller_id", sellerIds);
    if (r.error && !/seller_settlements/.test(r.error.message)) steps.push(r); // before 0009 there's nothing to clear
  }
  if (auction) steps.push(await db.from("lots").delete().eq("auction_id", auction.id));
  if (sellerIds.length) steps.push(await db.from("intake_items").delete().in("seller_id", sellerIds));
  if (buyerIds.length) steps.push(await db.from("customers").delete().eq("demo", true));
  if (dropSellers && sellerIds.length) steps.push(await db.from("sellers").delete().eq("demo", true));
  if (dropSellers && auction) steps.push(await db.from("auctions").delete().eq("id", auction.id).eq("demo", true));
  const failed = steps.find(s => s.error);
  if (failed?.error) throw new Error(`Stopped part-way: ${failed.error.message}. Press the button again to finish.`);
}

/** Makes the demo auction (number 999) with ten made-up lots, two demo sellers and three demo buyers. */
export async function createDemoAuction() {
  return guard(async () => {
    const db = adminClient();
    const have = await demoAuction(db);
    if (have) return bad(`The demo auction already exists (auction ${have.number}). Choose it in the auction list, or reset it.`);
    const { data: taken } = await db.from("auctions").select("id").eq("number", DEMO_AUCTION_NO).maybeSingle();
    if (taken) return bad(`Auction ${DEMO_AUCTION_NO} is a real auction, so the demo can't use that number.`);
    const today = todayDubai();
    const live = dubaiInstant(today, AUCTION_TIME);
    const { data: a, error } = await db
      .from("auctions")
      .insert({
        number: DEMO_AUCTION_NO, sale_date: today, live_starts_at: live, prebid_opens_at: dubaiInstant(addDays(today, -3), "12:00"), status: "draft",
        demo: true, instagram: false, office_notes: "Demo auction for training: never on the website, not in the accounts."
      })
      .select("id, number")
      .single();
    if (error) return bad(error.message);
    const sellers = await ensureSellers(db);
    await ensureBuyers(db);
    const n = await seedLots(db, a.id, sellers);
    refresh();
    return ok(`Demo auction ${a.number} is ready with ${n} made-up lots, sellers DEMO-C and DEMO-O, and demo buyers D0001–D0003. Choose auction ${a.number} in the back office to start.`, String(a.number));
  });
}

/** Wipes the demo's results, payments, messages and demo buyers, and puts fresh lots in: ready for the next training session. */
export async function resetDemoAuction() {
  return guard(async () => {
    const db = adminClient();
    const a = await demoAuction(db);
    if (!a) return bad("There's no demo auction yet.");
    await clearDemo(db, a, false);
    const sellers = await ensureSellers(db);
    await ensureBuyers(db);
    const today = todayDubai();
    await db.from("auctions").update({ sale_date: today, live_starts_at: dubaiInstant(today, AUCTION_TIME), prebid_opens_at: dubaiInstant(addDays(today, -3), "12:00") }).eq("id", a.id);
    const n = await seedLots(db, a.id, sellers);
    refresh();
    return ok(`Demo auction ${a.number} reset: ${n} fresh lots, dated today. Demo buyers are back to D0001–D0003.`);
  });
}

/** Removes the demo auction and everything in it, with the demo sellers and buyers. */
export async function removeDemoAuction() {
  return guard(async () => {
    const db = adminClient();
    const a = await demoAuction(db);
    await clearDemo(db, a, true);
    refresh();
    return ok(a ? `Demo auction ${a.number} removed, with its demo buyers and sellers.` : "Demo buyers and sellers removed.");
  });
}
