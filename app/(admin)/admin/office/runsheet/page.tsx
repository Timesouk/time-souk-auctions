import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { dateText } from "@/lib/office/messages";
import { AuctionPicker, Pill, SetupNeeded } from "@/components/office/bits";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

/** For the presenter: every lot in order, with start, reserve and the result as it's typed. */
export default async function OfficeRunSheet({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  if (!a) return <p className="empty">No auctions yet.</p>;
  const lots = o.lots.filter(l => l.auction_id === a.id);
  const sold = lots.filter(l => l.sold);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Run sheet · auction {a.number}</h1>
          <p className="fine">
            {dateText(a.sale_date, "EN")} · Lots: {lots.length} · Sold so far: {sold.length} · Hammer so far: AED {amt(sold.reduce((t, l) => t + (l.hammer || 0), 0))} · Profit so far: AED {amt(sold.reduce((t, l) => t + l.profit, 0))}
          </p>
        </div>
        <div className="row no-print">
          <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/runsheet" />
          <PrintButton label="Print" />
          <Link className="btn" href={`/admin/office/slips?a=${a.number}`}>Sold slips</Link>
        </div>
      </div>
      <p className="fine no-print">Keep it open on a second screen during the live: reload to see results typed on Lots.</p>
      <div className="tbl-wrap">
        <table className="runsheet">
          <thead><tr><th>Lot</th><th>Watch</th><th>Reference</th><th>Year</th><th>Box &amp; papers</th><th>Condition</th><th className="n">Start</th><th className="n">Reserve</th><th>Seller</th><th>Winner</th><th className="n">Hammer</th><th>Status</th><th>Reserve check</th></tr></thead>
          <tbody>
            {lots.map(l => (
              <tr key={l.id}>
                <td className="mono"><b>{l.key}</b></td>
                <td>{`${l.brand} ${l.model}`.trim()}</td>
                <td className="mono">{l.reference}</td>
                <td>{l.year}</td>
                <td>{l.box_papers}</td>
                <td>{l.condition}</td>
                <td className="n">{amt(l.start_price)}</td>
                <td className="n">{l.reserve ? amt(l.reserve) : "none"}</td>
                <td>{l.seller?.code || ""}</td>
                <td>{l.winner_text || l.customer?.code || ""}</td>
                <td className="n">{l.hammer ? amt(l.hammer) : ""}</td>
                <td><Pill s={l.status} /></td>
                <td className="fine">{l.reserveCheck}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
