import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { aed } from "@/lib/office/engine";
import { INVOICE_SHOWS, byInvoiceNo, invoiceShow, showInvoice } from "@/lib/office/invoice-filter";
import { AuctionPicker, DemoNote, SetupNeeded } from "@/components/office/bits";
import { InvoiceDoc } from "@/components/office/InvoiceDoc";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

/** Every invoice of one auction on one page, one invoice per printed sheet: print them in one go, or save one PDF. */
export default async function PrintInvoices({ searchParams }: { searchParams: Promise<{ a?: string; show?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  if (!a) return <p className="empty">No auctions yet.</p>;
  const show = invoiceShow(sp.show);
  const s = o.data.settings;
  const base = o.invoices.filter(i => i.auction?.id === a.id).sort(byInvoiceNo);
  const list = base.filter(i => showInvoice(show, i));
  const label = INVOICE_SHOWS.find(([k]) => k === show)?.[1] || "All";
  const href = (k: string) => `/admin/office/invoices/print?a=${a.number}${k ? `&show=${k}` : ""}`;
  const total = list.reduce((t, i) => t + i.total, 0);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head no-print">
        <div>
          <h1 className="disp">Print invoices · auction {a.number}</h1>
          <p className="fine">
            {show ? `${label}: ` : "Every invoice of this auction: "}one invoice per page. Press <b>Print</b> and pick your printer, or choose <b>Save as PDF</b> to get one file with all of them.
          </p>
        </div>
        <div className="row">
          <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/invoices/print" extra={show ? { show } : {}} />
          <Link className="btn sm" href={`/admin/office/invoices?a=${a.number}${show ? `&show=${show}` : ""}`}>Back to invoices</Link>
          {list.length ? <PrintButton label={`Print all ${list.length}`} /> : null}
        </div>
      </div>
      {a.demo ? <div className="no-print"><DemoNote /></div> : null}
      <div className="chips">
        {INVOICE_SHOWS.map(([k, name]) => {
          const n = base.filter(i => showInvoice(k, i)).length;
          return <Link key={k} className="chip" href={href(k)} aria-pressed={k === show}>{name}<small>{n}</small></Link>;
        })}
      </div>
      {list.length ? (
        <>
          <p className="fine no-print">
            {list.length} {list.length === 1 ? "invoice" : "invoices"} · {aed(total)} billed · {list.reduce((t, i) => t + i.lots.length, 0)} lots
          </p>
          {list.map(i => <InvoiceDoc key={i.no} inv={i} s={s} page />)}
        </>
      ) : (
        <p className="empty">
          {base.length ? "No invoices with this filter." : `No invoices for auction ${a.number} yet: they appear once lots are sold with a buyer.`}
        </p>
      )}
    </div>
  );
}
