import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { SetupNeeded } from "@/components/office/bits";
import { RunButton } from "@/components/office/RunButton";
import { CardLinkButton } from "@/components/office/forms2";
import { checkCardPayments } from "../actions2";
import { ziinaReady } from "@/lib/payments/ziina";
import { langCode } from "@/lib/office/messages";
import { dubaiStamp } from "@/components/office/DocHead";

export const dynamic = "force-dynamic";

export default async function OfficeCards({ searchParams }: { searchParams: Promise<{ buyer?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const s = o.data.settings;
  const links = o.data.cards.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ready = ziinaReady();
  const buyer = sp.buyer ? o.data.customers.find(c => c.code === sp.buyer) : undefined;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Card links</h1>
          <p className="fine">Every Ziina card payment link sent for an invoice, lots or a deposit. Paid links are recorded on Payments by themselves (Ziina tells the website, and open links are checked every few minutes).</p>
        </div>
        {ready ? <RunButton label="Check card payments now" run={checkCardPayments} /> : null}
      </div>
      {!ready ? (
        <p className="alert">
          Ziina isn&apos;t connected to the website yet: add <code>ZIINA_API_KEY</code> in Vercel › Settings › Environment Variables (the same key the website&apos;s card payments use). Until then, paste links made in the Ziina app on each invoice&apos;s page.
        </p>
      ) : null}
      <section className="panel-card">
        <span className="k">Card link for a deposit</span>
        <form className="inline-form" action="/admin/office/cards">
          <select name="buyer" defaultValue={buyer?.code || ""} aria-label="Buyer">
            <option value="">Choose the buyer…</option>
            {o.data.customers.map(c => <option key={c.id} value={c.code}>{c.code} · {c.full_name || (c.instagram ? `@${c.instagram}` : "")}</option>)}
          </select>
          <button className="btn sm">Choose</button>
        </form>
        {buyer ? (
          <CardLinkButton kind="Deposit" customerId={buyer.id} ask phone={buyer.phone} name={buyer.full_name} code={langCode(buyer.lang || s.wa_lang)} lots="" watch="" nLots={0} due={null} settings={s} overrides={o.data.messages} label="Make deposit link" />
        ) : null}
        <p className="fine">For an invoice, use the Card link button on the invoice&apos;s page. For lots during the live, use the invoice once the winner is typed.</p>
      </section>
      {links.length === 0 ? <p className="empty">No card links yet.</p> : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Made</th><th>For</th><th>Invoice</th><th>Lots</th><th>Buyer</th><th className="n">Due</th><th className="n">Card fee</th><th className="n">Link amount</th><th>Status</th><th>Checked</th><th>Link</th></tr></thead>
            <tbody>
              {links.map(l => {
                const c = l.customer_id ? o.customersById.get(l.customer_id) : undefined;
                return (
                  <tr key={l.id}>
                    <td className="nowrap fine">{dubaiStamp(Date.parse(l.created_at))}</td>
                    <td>{l.kind}</td>
                    <td className="mono">{l.invoice_no ? <Link href={`/admin/office/invoices/${l.invoice_no}`}>{l.invoice_no}</Link> : ""}</td>
                    <td className="mono">{l.lot_key}</td>
                    <td>{c ? <Link href={`/admin/office/buyers/${c.code}`}>{c.code}</Link> : l.name}</td>
                    <td className="n">{amt(l.amount)}</td>
                    <td className="n">{amt(l.fee)}</td>
                    <td className="n"><b>{amt(l.card_amount)}</b></td>
                    <td className={l.status === "paid" ? "ok-ink" : "fine"}>{l.status}{l.ledger_id ? " · on Payments" : ""}</td>
                    <td className="nowrap fine">{l.checked_at ? dubaiStamp(Date.parse(l.checked_at)) : ""}</td>
                    <td>{l.url ? <a href={l.url} target="_blank" rel="noreferrer">open</a> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
