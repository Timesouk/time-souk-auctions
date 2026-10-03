// Server-side reads for the public site. Row security decides what each visitor can see.
import { cache } from "react";
import { IS_PREVIEW } from "./env";
import { serverClient } from "./supabase/server";
import { SAMPLE_SETTINGS, sampleAuction, sampleHistory } from "./sample";
import type { Auction, BidRow, Lot, MyStatus, Settings } from "./types";

const LOT_FIELDS =
  "id,auction_id,lot_number,brand,model,reference,year,case_size,case_material,dial,bracelet,dial_colour,bezel,shape,hands,has_box,has_papers,condition,notes_en,notes_ar,estimate_low,estimate_high,start_price,no_reserve,reserve_met,made_pure,photos,current_bid,leader_paddle,leader_via,bid_count,ends_at";
const AUCTION_FIELDS = "id,number,sale_date,prebid_opens_at,live_starts_at,status,block_lot_id";

export const getSettings = cache(async (): Promise<Settings> => {
  const sb = await serverClient();
  if (!sb) return SAMPLE_SETTINGS;
  const { data } = await sb.from("settings").select("seller_fee,pay_days,timer_seconds,lot_target,whatsapp,instagram,contact_email").eq("id", 1).single();
  return data ? { ...data, seller_fee: Number(data.seller_fee) } : SAMPLE_SETTINGS;
});

/** The auction the home page is about: the newest published one, else the newest closed one. */
export const getCurrentAuction = cache(async (): Promise<{ auction: Auction; lots: Lot[] } | null> => {
  if (IS_PREVIEW) return sampleAuction();
  const sb = (await serverClient())!;
  let { data: auction } = await sb.from("auctions").select(AUCTION_FIELDS).eq("status", "published").order("number", { ascending: true }).limit(1).maybeSingle();
  if (!auction) ({ data: auction } = await sb.from("auctions").select(AUCTION_FIELDS).eq("status", "closed").order("number", { ascending: false }).limit(1).maybeSingle());
  if (!auction) return null;
  return { auction, lots: await getLots(auction.id) };
});

export const getAuctionByNumber = cache(async (n: number): Promise<{ auction: Auction; lots: Lot[] } | null> => {
  if (IS_PREVIEW) {
    const s = sampleAuction();
    return n === s.auction.number ? s : null;
  }
  const sb = (await serverClient())!;
  const { data: auction } = await sb.from("auctions").select(AUCTION_FIELDS).eq("number", n).maybeSingle();
  if (!auction) return null;
  return { auction, lots: await getLots(auction.id) };
});

export async function getLots(auctionId: string): Promise<Lot[]> {
  const sb = (await serverClient())!;
  const { data } = await sb.from("lots").select(LOT_FIELDS).eq("auction_id", auctionId).order("lot_number");
  return (data || []) as Lot[];
}

export async function getBidHistory(lot: Lot): Promise<BidRow[]> {
  if (IS_PREVIEW) return sampleHistory(lot);
  const sb = (await serverClient())!;
  const { data } = await sb.rpc("lot_bid_history", { p_lot_id: lot.id, p_limit: 50 });
  return (data || []) as BidRow[];
}

export async function getResults(): Promise<{ auction: Auction; lots: Lot[] }[]> {
  if (IS_PREVIEW) {
    const s = sampleAuction();
    return s.lots.some(l => l.ends_at && Date.parse(l.ends_at) <= Date.now()) ? [s] : [];
  }
  const sb = (await serverClient())!;
  const { data: auctions } = await sb.from("auctions").select(AUCTION_FIELDS).neq("status", "draft").order("number", { ascending: false }).limit(12);
  const out: { auction: Auction; lots: Lot[] }[] = [];
  for (const a of auctions || []) {
    const { data } = await sb.from("lots").select(LOT_FIELDS).eq("auction_id", a.id).not("ends_at", "is", null).lte("ends_at", new Date().toISOString()).order("lot_number");
    if (data && data.length) out.push({ auction: a, lots: data as Lot[] });
  }
  return out;
}

export const getMyStatus = cache(async (): Promise<MyStatus | null> => {
  const sb = await serverClient();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.rpc("my_status");
  return (data as MyStatus) || null;
});
