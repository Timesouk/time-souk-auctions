import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { consignorPayables, receivablesAging } from "@/lib/office/accounting";
import { m2 } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

export default async function AgingPage() {
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { o } = data;
  const ar = receivablesAging(o);
  const pay = consignorPayables(o);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Who owes what</h1>
          <p className="fine">Buyers who owe us, by how long the payment has been due, and what we owe consignors.</p>
        </div>
        <PrintButton />
      </div>
      <section className="stack" style={{ gap: 8 }}>
        <h2 className="h-sec">Buyers owe us · AED {m2(ar.total)}</h2>
        <div className="stats">{ar.buckets.map((b, k) => <div key={b}><span className="k">{b}</span><b className={k >= 2 && ar.totals[k] ? "warn-ink" : undefined}>{m2(ar.totals[k])}</b></div>)}</div>
        {ar.rows.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Buyer</th><th>WhatsApp</th><th className="n">Balance</th><th>Due</th><th className="n">Days overdue</th><th>Status</th></tr></thead>
              <tbody>
                {ar.rows.map(({ inv, days, bucket }) => (
                  <tr key={inv.no}>
                    <td className="mono"><Link href={`/admin/office/invoices/${inv.no}`}>{inv.no}</Link></td>
                    <td><Link href={`/admin/office/buyers/${inv.customer.code}`}>{inv.customer.code} {inv.customer.full_name || (inv.customer.instagram ? `@${inv.customer.instagram}` : "")}</Link></td>
                    <td className="mono nowrap">{inv.customer.phone}</td>
                    <td className="n"><b>{m2(inv.balance)}</b></td>
                    <td className="nowrap">{ar.buckets[bucket]}</td>
                    <td className="n">{bucket ? days : ""}</td>
                    <td>{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="fine">Nobody owes anything.</p>}
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <h2 className="h-sec">We owe consignors · AED {m2(pay.reduce((t, p) => t + p.due + p.waiting, 0))}</h2>
        {pay.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Seller</th><th>IBAN</th><th className="n">Due now (buyer has paid)</th><th className="n">Waiting for the buyer</th><th className="n">Total</th></tr></thead>
              <tbody>
                {pay.map(p => (
                  <tr key={p.seller.id}>
                    <td><Link href={`/admin/office/sellers/${p.seller.code}`}>{p.seller.code} · {p.seller.name}</Link></td>
                    <td className="mono">{p.seller.iban}</td>
                    <td className="n"><b>{m2(p.due)}</b></td>
                    <td className="n">{m2(p.waiting)}</td>
                    <td className="n">{m2(p.due + p.waiting)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="fine">Nothing owed to consignors.</p>}
      </section>
    </div>
  );
}
