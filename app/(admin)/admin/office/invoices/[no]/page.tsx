import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { invoiceMessages } from "@/lib/office/view";
import { COD } from "@/lib/office/types";
import { Pill, SetupNeeded } from "@/components/office/bits";
import { InvoiceDoc } from "@/components/office/InvoiceDoc";
import { WaButton } from "@/components/office/Wa";
import { AdjustmentForm, CopyButton, DeleteEntry, EntryForm, PrintButton } from "@/components/office/forms";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function OfficeInvoice({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const ref = decodeURIComponent(no).toUpperCase();
  const inv = o.invoicesByNo.get(ref);
  const s = o.data.settings;
  const entries = o.ledger.filter(e => e.invoice_no === ref);
  const sent = o.data.sent.filter(x => x.ref === ref).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  if (!inv) {
    return (
      <div className="stack">
        <h1 className="disp">{ref}</h1>
        <p className="alert">
          There&apos;s no open invoice with this number. {entries.length ? "Its lots were withdrawn or returned, so the order is cancelled; the money below is listed on Payments › Refunds." : ""}
        </p>
        {entries.length ? <EntriesTable entries={entries} admin={false} /> : null}
        <Link href="/admin/office/invoices">All invoices</Link>
      </div>
    );
  }
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const m = invoiceMessages(o, inv);
  const c = inv.customer;
  const who = c.full_name || (c.instagram ? `@${c.instagram}` : c.code);
  const adj = inv.adjustment;
  const confirm = { phone: c.phone, mode: s.wa_mode, name: c.full_name, ref: inv.no, code: m.code, invoice: inv.no, balanceBefore: inv.balance, settings: s, overrides: o.data.messages };
  const n = (v: number | null | undefined) => (v == null ? "" : String(v));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head no-print">
        <div>
          <h1 className="disp">{inv.no}</h1>
          <p className="fine">
            <Link href={`/admin/office/buyers/${c.code}`}>{who}</Link> · auction {inv.auctionNo} · <Pill s={inv.status} /> · {inv.nextStep}
          </p>
        </div>
        <div className="row">
          <WaButton label={inv.sentAt ? "Resend invoice" : "Send invoice on WhatsApp"} className="btn pri" phone={c.phone} text={m.invoice} mode={s.wa_mode}
            log={{ ref: inv.no, name: who, total: inv.total, balance: inv.balance, kind: "Invoice", link: "" }} />
          {inv.balance > 0 && inv.paysBy !== COD ? (
            <WaButton label="Send reminder" className="btn" phone={c.phone} text={m.reminder} mode={s.wa_mode}
              log={{ ref: inv.no, name: who, total: inv.total, balance: inv.balance, kind: "Reminder", link: "" }} />
          ) : null}
          <PrintButton />
          <CopyButton text={m.url} label="Copy buyer's link" />
        </div>
      </div>
      {!c.phone ? <p className="alert no-print">No WhatsApp number for this buyer yet: <Link href={`/admin/office/buyers/${c.code}`}>add it on their page</Link>.</p> : null}
      {inv.feeMissing ? <p className="alert no-print">Overseas delivery: type the delivery fee below before sending.</p> : null}

      <div className="inv-layout">
        <InvoiceDoc inv={inv} s={s} />
        <aside className="stack no-print" style={{ gap: 14 }}>
          {inv.balance > 0.005 ? (
            <div className="panel-card">
              <EntryForm kind="Payment" title={`Record payment · balance AED ${amt(inv.balance)}`} customerId={c.id} invoiceNo={inv.no} amount={inv.balance} method={inv.paysBy} lockBuyer confirm={confirm} />
            </div>
          ) : null}
          {inv.balance < -0.005 ? (
            <div className="panel-card">
              <EntryForm kind="Refund" title={`Refund · AED ${amt(-inv.balance)} overpaid`} customerId={c.id} invoiceNo={inv.no} amount={-inv.balance} method={entries.filter(e => e.kind !== "Refund").pop()?.method || "Bank transfer"} lockBuyer confirm={confirm} />
            </div>
          ) : null}
          <div className="panel-card">
            <AdjustmentForm
              value={{
                invoice_no: inv.no, delivery: adj?.delivery || "", pays_by: adj?.pays_by || "", delivery_fee: n(adj?.delivery_fee), discount: n(adj?.discount),
                extra: n(adj?.extra), extra_label: adj?.extra_label || "", note: adj?.note || ""
              }}
            />
          </div>
          <div className="panel-card">
            <span className="k">Payments on this invoice</span>
            {entries.length ? <EntriesTable entries={entries} admin={admin} /> : <p className="fine">None yet.{inv.depositApplied ? ` A deposit of AED ${amt(inv.depositApplied)} is applied.` : ""}</p>}
          </div>
          <div className="panel-card">
            <span className="k">Sent on WhatsApp</span>
            {sent.length ? (
              <ul className="plain">
                {sent.map(x => <li key={x.id}><span className="mono">{new Date(Date.parse(x.sent_at) + 4 * 3600e3).toISOString().slice(0, 16).replace("T", " ")}</span> · {x.kind}</li>)}
              </ul>
            ) : <p className="fine">Not sent yet.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function EntriesTable({ entries, admin }: { entries: { id: string; entry_date: string; kind: string; method: string; amount: number; cardFee: number; reference: string; check: string }[]; admin: boolean }) {
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Method</th><th className="n">Amount</th><th /></tr></thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id}>
              <td className="nowrap">{e.entry_date}</td>
              <td>{e.kind}</td>
              <td>{e.method}{e.reference ? <small className="sub">{e.reference}</small> : null}{e.cardFee ? <small className="sub">incl. card fee {amt(e.cardFee)}</small> : null}</td>
              <td className="n">{e.kind === "Refund" ? "−" : ""}{amt(e.amount)}</td>
              <td>{admin ? <DeleteEntry id={e.id} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
