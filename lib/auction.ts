// Auction rules shared by the browser and the server. The database (supabase/migrations) is the
// final judge of every bid; these mirror it so the page can show the right numbers instantly.
import type { Auction, Lot, LotStatus } from "./types";

export const INCREMENTS: [number, number][] = [
  [1000, 50],
  [5000, 100],
  [10000, 250],
  [20000, 500],
  [50000, 1000],
  [100000, 2500],
  [200000, 5000],
  [500000, 10000],
  [Infinity, 25000]
];

export const bidIncrement = (p: number) => INCREMENTS.find(([limit]) => p < limit)![1];

export const nextMinBid = (lot: Pick<Lot, "current_bid" | "start_price">) =>
  lot.current_bid == null ? lot.start_price : lot.current_bid + bidIncrement(lot.current_bid);

export function bidLadder(lot: Pick<Lot, "current_bid" | "start_price">, count = 6): number[] {
  const out: number[] = [];
  let a = nextMinBid(lot);
  for (let i = 0; i < count; i++) {
    out.push(a);
    a += bidIncrement(a);
  }
  return out;
}

export const isPure = (lot: Pick<Lot, "no_reserve" | "reserve_met" | "made_pure">) =>
  lot.no_reserve || lot.reserve_met || lot.made_pure;

export function lotStatus(lot: Lot, auction: Pick<Auction, "block_lot_id" | "prebid_opens_at" | "status">, now: number): LotStatus {
  if (lot.ends_at) {
    const end = Date.parse(lot.ends_at);
    if (now < end) return "live";
    return lot.current_bid != null && isPure(lot) ? "sold" : "unsold";
  }
  if (auction.block_lot_id === lot.id) return "block";
  if (auction.status !== "published" || now < Date.parse(auction.prebid_opens_at)) return "preview";
  return "open";
}

export const isClosedStatus = (s: LotStatus) => s === "sold" || s === "unsold";

export function upNext(lots: Lot[], current: Lot | null, count = 4): Lot[] {
  const open = lots.filter(l => !l.ends_at && (!current || l.id !== current.id)).sort((a, b) => a.lot_number - b.lot_number);
  const after = current ? open.filter(l => l.lot_number > current.lot_number) : open;
  return (after.length ? after : open).slice(0, count);
}

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const lotPath = (locale: string, auctionNo: number, lotNo: number) => `/${locale}/auctions/${auctionNo}/lots/${lotNo}`;
