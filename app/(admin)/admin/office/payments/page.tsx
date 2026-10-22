import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { aed, amt } from "@/lib/office/engine";
import { langCode } from "@/lib/office/messages";
import { SetupNeeded } from "@/components/office/bits";
import { DeleteEntry, EntryForm } from "@/components/office/forms";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

const KINDS: [string, string][] = [["", "Everything"], ["Payment", "Payments"], ["Deposit", "Deposits"], ["Refund", "Refunds"], ["checks", "Needs a look"]];

export default async function OfficePayments({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const s = o.data.settings;
  const show = KINDS.some(([k]) => k === sp.show) ? sp.show || "" : "";
  const q = String(sp.q || "").trim().toLowerCase();
  const list = o.ledger
    .filter(e => (show === "checks" ? !!e.check : show ? e.kind === show : true))
    .filter(e => !q || `${e.invoice_no} ${e.customer?.code} ${e.customer?.instagram} ${e.customer?.full_name} ${e.method} ${e.reference} ${e.notes}`.toLowerCase().includes(q))
    .slice()
    .reverse();
  const buyers = o.data.customers.map(c => ({ id: c.id, label: `${c.code} · ${c.full_name || ""}${c.instagram ? ` @${c.instagram}` : ""}${c.demo ? " (demo)" : ""}`.trim() }));
  const consignors = o.data.sellers.filter(x => x.kind !== "own").map(x => ({ id: x.id, label: `${x.code} · ${x.name}` }));
  // totals leave out the demo (training) auction
  const sum = (k: string) => o.ledger.filter(e => e.kind === k && !e.demo).reduce((t, e) => t + e.amount, 0);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Payments</h1>
          <p className="fine">Every payment, deposit and refund. Invoices, buyers and refunds update from here.</p>
        </div>
      </div>
      <div className="stats">
        <div><span className="k">Payments</span><b>{aed(sum("Payment"))}</b></div>
        <div><span className="k">Deposits</span><b>{aed(sum("Deposit"))}</b></div>
        <div><span className="k">Refunds</span><b>{aed(sum("Refund"))}</b></div>
        <div><span className="k">Refunds to make</span><b className={o.refunds.length ? "warn-ink" : undefined}>{aed(o.refunds.reduce((t, r) => t + r.amount, 0))}</b></div>
      </div>

      <details className="panel-card">
        <summary><strong>Record a payment</strong> <span className="fine">(quicker from the invoice&apos;s page)</span></summary>
        <EntryForm kind="Payment" buyers={buyers} sellers={consignors} />
      </details>
      <details className="panel-card">
        <summary><strong>Record a deposit</strong> <span className="fine">(comes off the buyer&apos;s invoices automatically)</span></summary>
        <EntryForm kind="Deposit" buyers={buyers} />
      </details>

      <section id="refunds" className="stack" style={{ gap: 10 }}>
        <h2 className="h-sec">Refunds to make</h2>
        {o.refunds.length === 0 ? (
          <p className="fine">Nothing to refund.</p>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>For</th><th>Buyer</th><th>Why</th><th className="n">Amount</th><th>Paid by</th><th /></tr></thead>
              <tbody>
                {o.refunds.map(r => {
                  const c = r.customer;
                  return (
                    <tr key={`${r.source}-${r.ref}-${c?.id}`}>
                      <td className="mono nowrap">{r.source === "invoice" ? <Link href={`/admin/office/invoices/${r.ref}`}>{r.ref}</Link> : r.ref}</td>
                      <td>{c ? <Link href={`/admin/office/buyers/${c.code}`}>{c.code} {c.full_name || (c.instagram ? `@${c.instagram}` : "")}</Link> : "?"}</td>
                      <td className="fine">{r.why}</td>
                      <td className="n"><b>{amt(r.amount)}</b></td>
                      <td>{r.paidBy}</td>
                      <td>
                        {c ? (
                          <details>
                            <summary className="btn sm">Refund</summary>
                            <EntryForm
                              kind="Refund" customerId={c.id} invoiceNo={r.source === "deposit" ? "" : r.ref} amount={r.amount} method={r.paidBy || "Bank transfer"} lockBuyer
                              confirm={{ phone: c.phone, mode: s.wa_mode, name: c.full_name, ref: r.source === "deposit" ? "" : r.ref, code: langCode(c.lang || s.wa_lang), invoice: r.source === "deposit" ? "" : r.ref, balanceBefore: 0, settings: s, overrides: o.data.messages }}
                            />
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h-sec">All entries</h2>
          <form className="inline-form" action="/admin/office/payments">
            {show ? <input type="hidden" name="show" value={show} /> : null}
            <input name="q" defaultValue={sp.q || ""} placeholder="Invoice, buyer, reference…" aria-label="Search" />
            <button className="btn sm">Find</button>
          </form>
        </div>
        <div className="chips">
          {KINDS.map(([k, label]) => (
            <Link key={k} className="chip" href={`/admin/office/payments${k ? `?show=${k}` : ""}`} aria-pressed={k === show}>{label}</Link>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="empty">Nothing here.</p>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Buyer</th><th>Invoice</th><th>Method</th><th className="n">Amount</th><th>Order</th><th>Check</th><th /></tr></thead>
              <tbody>
                {list.map(e => (
                  <tr key={e.id}>
                    <td className="nowrap">{e.entry_date}</td>
                    <td>{e.kind}</td>
                    <td>{e.customer ? <Link href={`/admin/office/buyers/${e.customer.code}`}>{e.customer.code}</Link> : "–"}{e.customer?.full_name ? <small className="sub">{e.customer.full_name}</small> : null}</td>
                    <td className="mono nowrap">{e.invoice_no ? <Link href={`/admin/office/invoices/${e.invoice_no}`}>{e.invoice_no}</Link> : ""}</td>
                    <td>{e.method}{e.paidTo ? <small className="sub">to {e.paidTo.code} · {e.paidTo.name}</small> : null}{e.reference ? <small className="sub">{e.reference}</small> : null}{e.cardFee ? <small className="sub">card fee {amt(e.cardFee)}</small> : null}{e.demo ? <small className="sub">demo</small> : null}</td>
                    <td className="n">{e.kind === "Refund" ? "−" : ""}{amt(e.amount)}</td>
                    <td>{e.order}</td>
                    <td className={e.check ? "warn-ink fine" : "fine"}>{e.check}</td>
                    <td>{admin ? <DeleteEntry id={e.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
