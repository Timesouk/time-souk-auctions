import Link from "next/link";
import { AuctionForm } from "@/components/admin/AuctionForm";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW } from "@/lib/env";
import { AUCTION_TIME, addDays, dateShort, pad2, sundayFrom, todayDubai } from "@/lib/format";
import { auctionState } from "@/lib/office/types";

export const dynamic = "force-dynamic";

export default async function AuctionsPage() {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to create auctions. The Live console shows a preview.</p>;
  const db = adminClient();
  const { data: auctions } = await db.from("auctions").select("id, number, sale_date, status, instagram, demo").order("number", { ascending: false });
  const { data: counts } = await db.from("lots").select("auction_id");
  const { data: settings } = await db.from("settings").select("timer_seconds").eq("id", 1).single();
  const n = new Map<string, number>();
  (counts || []).forEach(c => n.set(c.auction_id, (n.get(c.auction_id) || 0) + 1));
  // New auctions: the next Sunday after the latest one (never in the past), live at 8 pm. The demo auction doesn't count.
  const last = auctions?.find(a => !a.demo);
  const today = todayDubai();
  const sale = sundayFrom(last && addDays(last.sale_date, 1) > today ? addDays(last.sale_date, 1) : today);
  return (
    <div className="stack" style={{ gap: 26 }}>
      <div className="adm-head"><h1 className="disp">Auctions</h1></div>
      {auctions?.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nº</th><th>Date</th><th>Status</th><th className="n">Lots</th><th /></tr></thead>
            <tbody>
              {auctions.map(a => (
                <tr key={a.id}>
                  <td className="mono">{pad2(a.number)}</td>
                  <td>{dateShort(a.sale_date)} {a.sale_date.slice(0, 4)}</td>
                  <td><span className={`pill ${a.status === "published" ? "ok" : a.status === "closed" ? "st-sold" : a.instagram ? "ok" : "st-preview"}`}>{auctionState(a)}</span></td>
                  <td className="n">{n.get(a.id) || 0}</td>
                  <td className="n"><Link className="btn sm" href={`/admin/auctions/${a.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="empty">No auctions yet. Create the first one below.</p>}
      <div className="panel-card" style={{ maxWidth: 760 }}>
        <span className="k">New auction</span>
        <AuctionForm defaultTimer={settings?.timer_seconds || 180} initial={{ number: (last?.number || 0) + 1, sale_date: sale, prebid_date: addDays(sale, -5), prebid_time: "12:00", live_time: AUCTION_TIME, timer_seconds: null }} />
        <p className="fine">New auctions start as drafts, set for the next Sunday at 8 pm. Add lots, then publish: <b>for Instagram only</b> (the back office treats it as a real auction; the website doesn&apos;t show it) or <b>on the website and Instagram</b>. Nothing carries over from earlier auctions unless you relist it.</p>
      </div>
    </div>
  );
}
