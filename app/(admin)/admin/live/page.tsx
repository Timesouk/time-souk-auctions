import Link from "next/link";
import { LiveProvider } from "@/components/live/LiveProvider";
import { LiveConsole } from "@/components/admin/LiveConsole";
import { adminClient } from "@/lib/supabase/admin";
import { sampleAuction, SAMPLE_SETTINGS } from "@/lib/sample";
import { IS_PREVIEW } from "@/lib/env";
import { dateLong, pad2, stamp } from "@/lib/format";
import type { Auction, Lot } from "@/lib/types";

export const dynamic = "force-dynamic";

async function load(): Promise<{ auction: Auction; lots: Lot[]; timer: number } | null> {
  if (IS_PREVIEW) return { ...sampleAuction(), timer: SAMPLE_SETTINGS.timer_seconds };
  const db = adminClient();
  let { data: auction } = await db.from("auctions").select("*").eq("status", "published").order("number").limit(1).maybeSingle();
  if (!auction) ({ data: auction } = await db.from("auctions").select("*").eq("status", "draft").order("number", { ascending: false }).limit(1).maybeSingle());
  if (!auction) return null;
  const [{ data: lots }, { data: s }] = await Promise.all([
    db.from("lots").select("*").eq("auction_id", auction.id).order("lot_number"),
    db.from("settings").select("timer_seconds").eq("id", 1).single()
  ]);
  return { auction, lots: (lots || []) as Lot[], timer: s?.timer_seconds || 180 };
}

export default async function LivePage() {
  const d = await load();
  if (!d) {
    return (
      <div className="panel-card" style={{ maxWidth: 560 }}>
        <h1 className="disp">Live console</h1>
        <p>There’s no auction yet. Create one under Auctions &amp; lots.</p>
        <Link className="btn pri" href="/admin/auctions">Auctions &amp; lots</Link>
      </div>
    );
  }
  const { auction, lots, timer } = d;
  return (
    <>
      <div className="adm-head">
        <div>
          <span className="kick">Live console</span>
          <h1 className="disp">Auction Nº {pad2(auction.number)} · {dateLong(auction.sale_date)}</h1>
          <p className="fine">Live on Instagram {stamp(auction.live_starts_at)} · {lots.length} lots · {Math.round(timer / 60 * 10) / 10} min per lot</p>
        </div>
        {auction.status !== "published" ? <p className="alert">This auction is a {auction.status}. Publish it under Auctions &amp; lots before the live.</p> : null}
      </div>
      <LiveProvider auction={auction} lots={lots} timerSeconds={timer}>
        <LiveConsole />
      </LiveProvider>
    </>
  );
}
