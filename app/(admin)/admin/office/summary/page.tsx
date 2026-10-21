import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { aed, amt, auctionDue } from "@/lib/office/engine";
import { dateText } from "@/lib/office/messages";
import { AuctionState, SetupNeeded } from "@/components/office/bits";
import { AuctionOfficeForm } from "@/components/office/forms2";
import { dubaiStamp } from "@/components/office/DocHead";

export const dynamic = "force-dynamic";

/** Every auction's figures side by side (the workbook's Auctions sheet and Auction Summary). */
export default async function OfficeSummary() {
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const s = o.data.settings;
  const rows = o.auctions;
  // totals leave out the demo (training) auction
  const tot = (f: (r: (typeof rows)[number]) => number) => rows.filter(r => !r.auction.demo).reduce((t, r) => t + f(r), 0);
  const pct = (x: number | null) => (x == null ? "" : `${Math.round(x * 100)}%`);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Auction summary</h1>
          <p className="fine">Sales, profit and money from buyers for every auction. Figures update as results and payments are typed. The demo auction is listed but left out of the totals.</p>
        </div>
      </div>
      <div className="stats">
        <div><span className="k">Hammer, all auctions</span><b>{aed(tot(r => r.hammer))}</b></div>
        <div><span className="k">Our profit</span><b>{aed(tot(r => r.profit))}</b></div>
        <div><span className="k">Outstanding</span><b className={tot(r => r.outstanding) > 0 ? "warn-ink" : undefined}>{aed(tot(r => r.outstanding))}</b></div>
        <div><span className="k">Owed to sellers</span><b>{aed(tot(r => r.owedToSellers))}</b></div>
        <div><span className="k">Refunds to make</span><b>{aed(o.refunds.reduce((t, r) => t + r.amount, 0))}</b></div>
      </div>
      {rows.length === 0 ? <p className="empty">No auctions yet.</p> : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Auction</th><th>Payment due</th><th className="n">Lots</th><th className="n">Sold</th><th className="n">Unsold</th><th className="n">Sell-through</th><th className="n">Hammer</th>
                <th className="n">Own-stock sales</th><th className="n">Own-stock cost</th><th className="n">Seller fees</th><th className="n">Profit</th><th className="n">Invoices</th>
                <th className="n">Billed</th><th className="n">Collected</th><th className="n">Outstanding</th><th className="n">Deposits used</th><th className="n">Owed to sellers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const due = auctionDue(r.auction, s);
                return (
                  <tr key={r.auction.id}>
                    <td className="nowrap"><Link href={`/admin/office?a=${r.auction.number}`}>{r.auction.number} · {dateText(r.auction.sale_date, "EN")}</Link>{r.auction.status !== "published" ? <AuctionState a={r.auction} /> : null}</td>
                    <td className="nowrap fine">{due ? dubaiStamp(due) : ""}</td>
                    <td className="n">{r.lots} / {r.target}</td>
                    <td className="n">{r.sold}</td>
                    <td className="n">{r.unsold}</td>
                    <td className="n">{pct(r.sellThrough)}</td>
                    <td className="n">{amt(r.hammer)}</td>
                    <td className="n">{amt(r.ownSales)}</td>
                    <td className="n">{amt(r.ownCost)}</td>
                    <td className="n">{amt(r.sellerFees)}</td>
                    <td className="n"><b>{amt(r.profit)}</b></td>
                    <td className="n">{r.invoices}</td>
                    <td className="n">{amt(r.billed)}</td>
                    <td className="n">{amt(r.collected)}</td>
                    <td className="n">{r.outstanding > 0.005 ? <b className="warn-ink">{amt(r.outstanding)}</b> : "0"}</td>
                    <td className="n">{amt(r.depositsApplied)}</td>
                    <td className="n">{amt(r.owedToSellers)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <section className="panel-card">
        <span className="k">Each auction&apos;s payment clock and lot target</span>
        <p className="fine">The payment clock starts on auction day at this time (blank = Settings, {s.pay_clock}); buyers then have {s.hours_to_pay} hours. Dates and live times are set under <Link href="/admin/auctions">Auctions &amp; lots</Link>.</p>
        {o.data.auctions.slice().sort((x, y) => y.number - x.number).map(a => (
          <div key={a.id} className="row">
            <b className="nowrap" style={{ minWidth: 190 }}>{a.number} · {dateText(a.sale_date, "EN")}</b>
            <AuctionOfficeForm id={a.id} pay_clock={a.pay_clock || ""} lot_target={a.lot_target ? String(a.lot_target) : ""} office_notes={a.office_notes} defaultClock={s.pay_clock} defaultTarget={s.lot_target} />
          </div>
        ))}
      </section>
    </div>
  );
}
