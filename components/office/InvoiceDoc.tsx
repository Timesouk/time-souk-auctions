// The co-branded invoice, as printed by the workbook: both logos, the buyer, every lot, totals and how to pay.
// Used in the back office (print or save as PDF) and on the buyer's private invoice link.
import { amt, type InvoiceView } from "@/lib/office/engine";
import { dateText, pctText } from "@/lib/office/messages";
import { COD, UAE, type OfficeSettings } from "@/lib/office/types";
import { DocHead, dubaiStamp } from "./DocHead";

export function InvoiceDoc({ inv, s }: { inv: InvoiceView; s: OfficeSettings }) {
  const c = inv.customer;
  const rate = (s.card_fee_pct || 0) / 100;
  const paid = inv.balance <= 0;
  return (
    <article className="doc">
      <DocHead s={s} />

      <div className="doc-title">
        <h2>{s.vat_sales_pct > 0 ? "TAX INVOICE" : "INVOICE"}</h2>
        <dl>
          <dt>Invoice no.</dt><dd className="mono">{inv.no}</dd>
          <dt>Auction</dt><dd>{inv.auctionNo} · {dateText(inv.auction?.sale_date, "EN")}</dd>
          {!paid && inv.due && inv.paysBy !== COD ? (<><dt>Please pay by</dt><dd>{dubaiStamp(inv.due)}</dd></>) : null}
          <dt>Status</dt><dd><b>{inv.status}</b></dd>
        </dl>
      </div>

      <section className="doc-bill">
        <span className="k">Bill to</span>
        <strong>{c.full_name || (c.instagram ? `@${c.instagram}` : c.code)}</strong>
        <span>{[c.instagram ? `@${c.instagram}` : "", c.phone, c.email].filter(Boolean).join("  ·  ")}</span>
        <span>{[c.address, c.area, inv.country === UAE ? "UAE" : inv.country].filter(Boolean).join(", ")}</span>
        <span className="fine">Buyer {c.code} · {inv.delivery === "Pickup" ? "Pickup" : "Courier delivery"} · pays by {inv.paysBy}</span>
      </section>

      <table className="doc-lots">
        <thead>
          <tr><th>Lot</th><th>Watch</th><th>Box &amp; papers</th><th className="n">Hammer (AED)</th></tr>
        </thead>
        <tbody>
          {inv.lots.map(l => (
            <tr key={l.id}>
              <td className="mono">{l.key}</td>
              <td>{`${l.brand} ${l.model}`.trim()}{l.reference ? <small> · ref {l.reference}</small> : null}</td>
              <td>{l.box_papers || [l.has_box ? "Box" : "", l.has_papers ? "Papers" : ""].filter(Boolean).join(" + ")}</td>
              <td className="n">{amt(l.hammer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.inv_note ? <p className="fine">{s.inv_note}</p> : null}

      <div className="doc-foot">
        <div className="doc-pay">
          {!paid && inv.paysBy !== COD ? (
            <>
              <span className="k">How to pay</span>
              {s.bank_iban ? (
                <p>
                  <b>Bank transfer: AED {amt(inv.balance)}</b><br />
                  {s.bank_name}<br />
                  {s.bank_account ? <>Account name: {s.bank_account}<br /></> : null}
                  IBAN: <span className="mono">{s.bank_iban}</span>
                  {s.bank_swift ? <> · SWIFT {s.bank_swift}</> : null}<br />
                  Reference: <span className="mono">{inv.no}</span>
                </p>
              ) : null}
              <p><b>Card: AED {amt(inv.cardAmount)}</b> (includes the {pctText(rate)} card fee). Ask us on WhatsApp for a secure card link.</p>
              <p className="fine">Tabby or Tamara: ask us on WhatsApp.</p>
            </>
          ) : inv.paysBy === COD && !paid ? (
            <p><b>Cash on delivery:</b> please have AED {amt(inv.balance)} ready for the courier.</p>
          ) : (
            <p><b>Paid in full. Thank you!</b></p>
          )}
          {inv.note ? <p className="doc-note">{inv.note}</p> : null}
        </div>
        <table className="doc-totals">
          <tbody>
            <tr><td>Hammer total</td><td className="n">{amt(inv.hammer)}</td></tr>
            <tr><td>{inv.delivery === "Pickup" ? "Delivery: pickup" : `Delivery (${inv.country === UAE ? "UAE" : inv.country})`}</td><td className="n">{inv.feeMissing ? "to be confirmed" : amt(inv.deliveryFee)}</td></tr>
            {inv.cod ? <tr><td>Cash on delivery charge</td><td className="n">{amt(inv.cod)}</td></tr> : null}
            {inv.extra ? <tr><td>{inv.extraLabel || "Other charges"}</td><td className="n">{amt(inv.extra)}</td></tr> : null}
            {inv.discount ? <tr><td>Discount</td><td className="n">−{amt(inv.discount)}</td></tr> : null}
            {inv.vat ? <tr><td>VAT {s.vat_sales_pct}%</td><td className="n">{amt(inv.vat)}</td></tr> : null}
            {inv.cardFee ? <tr><td>Card payment fee</td><td className="n">{amt(inv.cardFee)}</td></tr> : null}
            <tr className="tot"><td>Total (AED)</td><td className="n">{amt(inv.total)}</td></tr>
            {inv.depositApplied ? <tr><td>Deposit received</td><td className="n">−{amt(inv.depositApplied)}</td></tr> : null}
            {inv.paidDirect ? <tr><td>Already paid</td><td className="n">−{amt(inv.paidDirect)}</td></tr> : null}
            <tr className="tot"><td>{inv.balance < 0 ? "To refund" : "Balance due"}</td><td className="n">{amt(Math.abs(inv.balance))}</td></tr>
          </tbody>
        </table>
      </div>
      {s.inv_terms ? <p className="doc-terms">{s.inv_terms}</p> : null}
    </article>
  );
}
