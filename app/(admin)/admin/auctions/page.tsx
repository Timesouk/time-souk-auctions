import Link from "next/link";
import { AuctionForm } from "@/components/admin/AuctionForm";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW } from "@/lib/env";
import { addDays, dateShort, nextSaturday, pad2, todayDubai } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuctionsPage() {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to create auctions. The Live console shows a preview.</p>;
  const db = adminClient();
  const { data: auctions } = await db.from("auctions").select("id, number, sale_date, status").order("number", { ascending: false });
  const { data: counts } = await db.from("lots").select("auction_id");
  const { data: settings } = await db.from("settings").select("timer_seconds").eq("id", 1).single();
  const n = new Map<string, number>();
  (counts || []).forEach(c => n.set(c.auction_id, (n.get(c.auction_id) || 0) + 1));
  const last = auctions?.[0];
  const sale = last ? addDays(last.sale_date, 7) : nextSaturday(todayDubai());
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
                  <td><span className={`pill ${a.status === "published" ? "ok" : a.status === "closed" ? "st-sold" : "st-preview"}`}>{a.status}</span></td>
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
        <AuctionForm defaultTimer={settings?.timer_seconds || 180} initial={{ number: (last?.number || 0) + 1, sale_date: sale, prebid_date: addDays(sale, -5), prebid_time: "12:00", live_time: "16:00", timer_seconds: null }} />
        <p className="fine">New auctions start as drafts. Add lots, then publish to put the catalogue on the website. Nothing carries over from earlier auctions unless you relist it.</p>
      </div>
    </div>
  );
}
