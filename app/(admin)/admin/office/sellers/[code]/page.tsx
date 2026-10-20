import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { dateText } from "@/lib/office/messages";
import { Pill, SetupNeeded } from "@/components/office/bits";
import { PayoutForm, SellerForm } from "@/components/office/forms2";

export const dynamic = "force-dynamic";

export default async function OfficeSeller({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const x = o.sellers.find(s => s.code.toUpperCase() === decodeURIComponent(code).toUpperCase());
  if (!x) return <p className="empty">No seller {code}. <Link href="/admin/office/sellers">All sellers</Link></p>;
  const lots = o.lots.filter(l => l.seller_id === x.id).sort((a, b) => b.auctionNo - a.auctionNo || a.lot_number - b.lot_number);
  const owing = lots.filter(l => l.sold && l.type === "Consignment" && l.payout !== "Paid");
  const auctions = [...new Set(lots.map(l => l.auction_id))].map(id => o.data.auctions.find(a => a.id === id)!).filter(Boolean).sort((a, b) => b.number - a.number);
  const intake = o.intake.filter(i => i.seller_id === x.id);
  const receipts = [...new Set(intake.map(i => i.receipt_no))];
  const n = (v: number | null) => (v == null ? "" : String(v));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">{x.code} · {x.name}</h1>
          <p className="fine">{x.kind === "own" ? "Own stock" : "Consignment"}{x.phone ? ` · ${x.phone}` : ""}{x.iban ? ` · IBAN ${x.iban}` : ""}</p>
        </div>
        <Link className="btn sm" href="/admin/office/sellers">All sellers</Link>
      </div>
      <div className="stats">
        <div><span className="k">Lots</span><b>{x.lotsEntered}</b></div>
        <div><span className="k">Sold</span><b>{x.lotsSold}</b></div>
        <div><span className="k">Hammer</span><b>{amt(x.hammer)}</b></div>
        <div><span className="k">Fees</span><b>{amt(x.fees)}</b></div>
        <div><span className="k">Net to seller</span><b>{amt(x.net)}</b></div>
        <div><span className="k">Still owed</span><b className={x.owed > 0.005 ? "warn-ink" : undefined}>{amt(x.owed)}</b></div>
      </div>
      {x.kind !== "own" ? (
        <section className="panel-card">
          <span className="k">Payouts</span>
          <PayoutForm lots={owing.map(l => ({ id: l.id, key: l.key, watch: `${l.brand} ${l.model}`.trim(), net: l.net, invoice: l.invoiceNo || "", state: l.payout }))} />
        </section>
      ) : null}
      <section className="panel-card">
        <span className="k">Paperwork</span>
        <div className="row">
          {auctions.map(a => <Link key={a.id} className="btn sm" href={`/admin/office/statements?a=${a.number}&seller=${x.code}`}>Statement · auction {a.number}</Link>)}
          {receipts.map(r => <Link key={r} className="btn sm" href={`/admin/office/intake/${r}`}>Receipt {r}</Link>)}
          {!auctions.length && !receipts.length ? <span className="fine">No lots or receipts yet.</span> : null}
        </div>
      </section>
      <section className="panel-card">
        <span className="k">Lots</span>
        {lots.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Lot</th><th>Auction</th><th>Watch</th><th className="n">Reserve</th><th>Status</th><th className="n">Hammer</th><th className="n">Fee</th><th className="n">Net</th><th>Payout</th></tr></thead>
              <tbody>
                {lots.map(l => (
                  <tr key={l.id}>
                    <td className="mono">{l.key}</td>
                    <td className="nowrap">{l.auctionNo} · {dateText(l.auction?.sale_date, "EN").slice(4)}</td>
                    <td>{`${l.brand} ${l.model}`.trim()}</td>
                    <td className="n">{l.reserve ? amt(l.reserve) : ""}</td>
                    <td><Pill s={l.status} /></td>
                    <td className="n">{l.sold ? amt(l.hammer) : ""}</td>
                    <td className="n">{l.fee ? amt(l.fee) : ""}</td>
                    <td className="n">{l.net ? amt(l.net) : ""}</td>
                    <td className="fine">{l.payout}{l.seller_paid_on ? ` ${l.seller_paid_on}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="fine">No lots yet.</p>}
      </section>
      <section className="panel-card">
        <span className="k">Details</span>
        <SellerForm
          value={{
            id: x.id, code: x.code, name: x.name, kind: x.kind, phone: x.phone, instagram: x.instagram, email: x.email, id_checked: x.id_checked,
            fee_pct: n(x.fee_pct), fee_fixed: n(x.fee_fixed), bank: x.bank, iban: x.iban, notes: x.notes
          }}
        />
      </section>
    </div>
  );
}
