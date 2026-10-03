"use client";
// Keeps one auction's lots up to date in the browser: Supabase Realtime pushes every change,
// a slow poll covers dropped connections, and the clock is synced to the database's.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { lotStatus } from "@/lib/auction";
import type { Auction, Lot, LotStatus } from "@/lib/types";

type LiveState = {
  auction: Auction;
  lots: Lot[];
  byId: Map<string, Lot>;
  offset: number; // server time minus browser time, in ms
  now: () => number;
  statusOf: (lot: Lot) => LotStatus;
  blockLot: Lot | null;
  refresh: () => Promise<void>;
  patchLot: (lot: Partial<Lot> & { id: string }) => void;
  timerSeconds: number; // this auction's timer per lot
  timerFor: (lot: Lot) => number; // the timer this lot will run for
};

const Ctx = createContext<LiveState | null>(null);

export function useLive() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive must be used inside <LiveProvider>");
  return v;
}

/** Re-renders the caller every `ms` milliseconds (for countdowns). */
export function useTick(ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN(n => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

const LOT_FIELDS =
  "id,auction_id,lot_number,brand,model,reference,year,case_size,case_material,dial,bracelet,dial_colour,bezel,shape,hands,has_box,has_papers,condition,notes_en,notes_ar,estimate_low,estimate_high,start_price,no_reserve,reserve_met,made_pure,photos,current_bid,leader_paddle,leader_via,bid_count,ends_at,timer_seconds";

export function LiveProvider({
  auction: initialAuction,
  lots: initialLots,
  timerSeconds = 180,
  children
}: {
  auction: Auction;
  lots: Lot[];
  timerSeconds?: number;
  children: React.ReactNode;
}) {
  const [auction, setAuction] = useState(initialAuction);
  const [lots, setLots] = useState(initialLots);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  const patchLot = useCallback((patch: Partial<Lot> & { id: string }) => {
    setLots(prev => {
      const i = prev.findIndex(l => l.id === patch.id);
      if (i === -1) return patch.auction_id ? [...prev, patch as Lot].sort((a, b) => a.lot_number - b.lot_number) : prev;
      const next = prev.slice();
      next[i] = { ...prev[i], ...patch };
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const sb = browserClient();
    if (!sb) return;
    const [{ data: a }, { data: l }] = await Promise.all([
      sb.from("auctions").select("id,number,sale_date,prebid_opens_at,live_starts_at,status,block_lot_id,timer_seconds").eq("id", initialAuction.id).maybeSingle(),
      sb.from("lots").select(LOT_FIELDS).eq("auction_id", initialAuction.id).order("lot_number")
    ]);
    if (a) setAuction(a as Auction);
    if (l) setLots(l as Lot[]);
  }, [initialAuction.id]);

  // Clock sync against the database.
  useEffect(() => {
    let alive = true;
    async function sync() {
      const sb = browserClient();
      const t0 = Date.now();
      let server: number | null = null;
      try {
        if (sb) {
          const { data } = await sb.rpc("server_now");
          if (data) server = Date.parse(data as string);
        } else {
          const r = await fetch("/api/time", { cache: "no-store" });
          server = (await r.json()).now;
        }
      } catch {
        server = null;
      }
      const t1 = Date.now();
      if (alive && server) setOffset(server - (t0 + t1) / 2);
    }
    sync();
    const id = setInterval(sync, 5 * 60e3);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Realtime updates, plus a slow poll in case the connection drops.
  useEffect(() => {
    const sb = browserClient();
    if (!sb) return;
    const channel = sb
      .channel(`auction-${initialAuction.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lots", filter: `auction_id=eq.${initialAuction.id}` }, payload => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) setLots(prev => prev.filter(l => l.id !== id));
        } else {
          patchLot(payload.new as Lot);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${initialAuction.id}` }, payload => {
        setAuction(prev => ({ ...prev, ...(payload.new as Auction) }));
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") refresh();
      });
    const poll = setInterval(refresh, 20000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [initialAuction.id, patchLot, refresh]);

  const value = useMemo<LiveState>(() => {
    const now = () => Date.now() + offsetRef.current;
    const byId = new Map(lots.map(l => [l.id, l]));
    const auctionTimer = auction.timer_seconds || timerSeconds;
    return {
      auction,
      lots,
      byId,
      offset,
      now,
      statusOf: (lot: Lot) => lotStatus(lot, auction, now()),
      blockLot: auction.block_lot_id ? byId.get(auction.block_lot_id) || null : null,
      refresh,
      patchLot,
      timerSeconds: auctionTimer,
      timerFor: (lot: Lot) => lot.timer_seconds || auctionTimer
    };
  }, [auction, lots, offset, refresh, patchLot, timerSeconds]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
