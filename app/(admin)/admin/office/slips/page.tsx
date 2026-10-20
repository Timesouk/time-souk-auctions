import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { companyName, dateText } from "@/lib/office/messages";
import { AuctionPicker, SetupNeeded } from "@/components/office/bits";
import { SlipPrint } from "@/components/office/SlipPrint";

export const dynamic = "force-dynamic";

/** Sold slips for the 80 mm printer: one per sold lot, to tape to the watch's tray. */
export default async function OfficeSlips({ searchParams }: { searchParams: Promise<{ a?: string; lot?: string; show?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  if (!a) return <p className="empty">No auctions yet.</p>;
  const s = o.data.settings;
  const sold = o.lots.filter(l => l.auction_id === a.id && (l.sold || l.status === "Sold – add buyer"));
  const show = sp.lot ? "one" : sp.show === "all" ? "all" : "new";
  const list = sp.lot ? sold.filter(l => l.key === sp.lot) : show === "all" ? sold : sold.filter(l => !l.slip_printed_at);
  const q = `/admin/office/slips?a=${a.number}`;
  return (
    <div className="stack" style={{ gap: 14 }}>
      {/* only while this page is open: the printer's 80 mm roll */}
      <style>{"@page { size: 80mm 160mm; margin: 3mm; }"}</style>
      <div className="adm-head no-print">
        <div>
          <h1 className="disp">Sold slips · auction {a.number}</h1>
          <p className="fine">Set the printer to the 80 mm roll in the print window. {sold.filter(l => !l.slip_printed_at).length} not printed yet.</p>
        </div>
        <div className="row">
          <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/slips" />
          <SlipPrint ids={list.map(l => l.id)} label={`Print ${list.length} slip${list.length === 1 ? "" : "s"}`} />
        </div>
      </div>
      <div className="chips no-print">
        <Link className="chip" href={q} aria-pressed={show === "new"}>Not printed yet</Link>
        <Link className="chip" href={`${q}&show=all`} aria-pressed={show === "all"}>Every sold lot</Link>
        {sold.slice(-12).map(l => <Link key={l.id} className="chip" href={`${q}&lot=${l.key}`} aria-pressed={sp.lot === l.key}>{l.key}</Link>)}
      </div>
      {list.length === 0 ? <p className="empty no-print">No slips to print.</p> : null}
      <div className="slips">
        {list.map(l => (
          <section key={l.id} className="slip">
            <div className="slip-brand">{companyName(s)}</div>
            <div className="slip-lot">LOT {l.key}</div>
            <div className="slip-watch">{`${l.brand} ${l.model}`.trim()}</div>
            {l.reference ? <div className="slip-sm">Ref. {l.reference}</div> : null}
            <hr />
            <div className="slip-row"><span>Winner</span><b>{l.customer?.instagram ? `@${l.customer.instagram}` : l.winner_text || "?"}</b></div>
            {l.customer?.full_name ? <div className="slip-row"><span>Name</span><b>{l.customer.full_name}</b></div> : null}
            <div className="slip-row"><span>Buyer</span><b>{l.customer?.code || "add on Buyers"}</b></div>
            <div className="slip-row big"><span>Hammer</span><b>AED {amt(l.hammer)}</b></div>
            {l.tray ? <div className="slip-row"><span>Tray</span><b>{l.tray}</b></div> : null}
            {l.invoiceNo ? <div className="slip-row"><span>Invoice</span><b>{l.invoiceNo}</b></div> : null}
            <hr />
            <div className="slip-sm">Auction {a.number} · {dateText(a.sale_date, "EN")}</div>
            {s.slip_note ? <div className="slip-sm">{s.slip_note}</div> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
