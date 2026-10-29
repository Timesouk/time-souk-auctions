import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { langCode } from "@/lib/office/messages";
import { LotKeys, Pill, SetupNeeded } from "@/components/office/bits";
import { CustomerForm, DeleteEntry, EntryForm } from "@/components/office/forms";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import { UAE } from "@/lib/office/types";
import { ConfirmRun } from "@/components/office/ConfirmRun";
import { deleteCustomer } from "../../actions";

export const dynamic = "force-dynamic";

export default async function OfficeBuyer({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const c = o.customers.find(x => x.code.toUpperCase() === decodeURIComponent(code).toUpperCase());
  if (!c) return <p className="empty">No buyer {code}. <Link href="/admin/office/buyers">All buyers</Link></p>;
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const s = o.data.settings;
  const invs = o.invoices.filter(i => i.customer.id === c.id).sort((a, b) => b.auctionNo - a.auctionNo);
  const entries = o.ledger.filter(e => e.customer_id === c.id).slice().reverse();
  const won = o.lots.filter(l => l.winner_customer_id === c.id);
  const confirm = { phone: c.phone, mode: s.wa_mode, name: c.full_name, ref: "", code: langCode(c.lang || s.wa_lang), invoice: "", balanceBefore: 0, settings: s, overrides: o.data.messages };
  const lastDepositMethod = entries.find(e => e.kind === "Deposit")?.method || "Bank transfer";
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">{c.code} · {c.full_name || (c.instagram ? `@${c.instagram}` : "Buyer")}</h1>
          <p className="fine">
            {c.instagram ? `@${c.instagram} · ` : ""}{c.phone || "no WhatsApp number"} · {c.country || UAE}
            {c.profile_id ? " · has a website account" : ""}
            {c.flag !== "OK" ? <> · <span className="pill warn">{c.flag}</span></> : null}
          </p>
        </div>
        <Link className="btn sm" href="/admin/office/buyers">All buyers</Link>
      </div>
      <div className="stats">
        <div><span className="k">Lots won</span><b>{c.lotsWon}</b></div>
        <div><span className="k">Bought</span><b>{amt(c.bought)}</b></div>
        <div><span className="k">Owes now</span><b className={c.outstanding > 0.005 ? "warn-ink" : undefined}>{amt(c.outstanding)}</b></div>
        <div><span className="k">Deposits taken</span><b>{amt(c.depositsTaken)}</b></div>
        <div><span className="k">Deposit held</span><b>{amt(c.depositHeld)}</b></div>
      </div>

      <div className="inv-layout">
        <div className="stack" style={{ gap: 14 }}>
          <section className="panel-card">
            <span className="k">Invoices</span>
            {invs.length ? (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Lots</th><th className="n">Total</th><th className="n">Balance</th><th>Status</th><th>Next step</th></tr></thead>
                  <tbody>
                    {invs.map(i => (
                      <tr key={i.no}>
                        <td className="mono"><Link href={`/admin/office/invoices/${i.no}`}>{i.no}</Link></td>
                        <td className="mono"><LotKeys keys={i.lots.map(l => l.key)} /></td>
                        <td className="n">{amt(i.total)}</td>
                        <td className="n">{amt(i.balance)}</td>
                        <td><Pill s={i.status} /></td>
                        <td className="fine">{i.nextStep}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="fine">No invoices yet.</p>}
            {won.filter(l => !l.sold).length ? (
              <p className="fine">Also on lots that aren&apos;t sales: {won.filter(l => !l.sold).map(l => `${l.key} (${l.status})`).join(", ")}.</p>
            ) : null}
          </section>
          <section className="panel-card">
            <span className="k">Payments, deposits and refunds</span>
            {entries.length ? (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Invoice</th><th>Method</th><th className="n">Amount</th><th /></tr></thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id}>
                        <td className="nowrap">{e.entry_date}</td>
                        <td>{e.kind}</td>
                        <td className="mono">{e.invoice_no}</td>
                        <td>{e.method}</td>
                        <td className="n">{e.kind === "Refund" ? "−" : ""}{amt(e.amount)}</td>
                        <td>{admin ? <DeleteEntry id={e.id} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="fine">None yet.</p>}
          </section>
          <section className="panel-card">
            <span className="k">Details</span>
            <CustomerForm
              value={{
                id: c.id, instagram: c.instagram || "", full_name: c.full_name, phone: c.phone, email: c.email, address: c.address, area: c.area, country: c.country,
                delivery: c.delivery, usual_pay: c.usual_pay, id_checked: c.id_checked, flag: c.flag, notes: c.notes, lang: c.lang
              }}
            />
          </section>
        </div>
        <aside className="stack" style={{ gap: 14 }}>
          <div className="panel-card">
            <EntryForm kind="Deposit" title="Record a deposit" customerId={c.id} lockBuyer confirm={confirm} />
          </div>
          {c.depositHeld > 0.005 ? (
            <div className="panel-card">
              <EntryForm kind="Refund" title={`Refund deposit · AED ${amt(c.depositHeld)} held`} customerId={c.id} amount={c.depositHeld} method={lastDepositMethod} lockBuyer confirm={confirm} />
            </div>
          ) : null}
          {admin ? (
            <div className="panel-card">
              <span className="k">Delete this buyer</span>
              <p className="fine">
                Added by mistake? Only a buyer who hasn&apos;t won a lot and has no payments, deposits or refunds can be deleted.
                {won.length || entries.length ? ` This one has ${won.length ? `${won.length} lot${won.length === 1 ? "" : "s"} won` : ""}${won.length && entries.length ? " and " : ""}${entries.length ? `${entries.length} payment${entries.length === 1 ? "" : "s"}` : ""}.` : ""} Admins only.
              </p>
              <div className="row">
                <ConfirmRun label={`Delete buyer ${c.code}`} className="btn danger" ask={`Are you sure you want to delete buyer ${c.code}${c.instagram ? ` (@${c.instagram})` : ""}?\n\nThis can't be undone.`} run={deleteCustomer.bind(null, c.id)} then="/admin/office/buyers" />
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
