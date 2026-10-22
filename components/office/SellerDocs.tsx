// Seller paperwork, printed with both logos: the consignment intake receipt and the listing / statement per auction.
import { amt, pad3, type IntakeView, type LotView, type Office } from "@/lib/office/engine";
import { DIRECT } from "@/lib/office/types";
import { dateText, pctText } from "@/lib/office/messages";
import type { OAuction, OfficeSettings, Seller } from "@/lib/office/types";
import { DocHead } from "./DocHead";

const feeText = (pct: number | null | undefined, fixed: number | null | undefined) =>
  [pct ? `${pctText(pct / 100)} of the hammer price` : "", fixed ? `AED ${amt(fixed)} per item sold` : ""].filter(Boolean).join(" + ") || "none";

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="doc-sign">
      <div><span /> {left}</div>
      <div><span /> {right}</div>
    </div>
  );
}

export function ReceiptDoc({ receipt, items, seller, s }: { receipt: string; items: IntakeView[]; seller: Seller | undefined; s: OfficeSettings }) {
  const first = items[0];
  const reserves = items.reduce((t, i) => t + (i.reserve || 0), 0);
  const pct = first?.fee_pct ?? seller?.fee_pct ?? s.fee_pct;
  const fixed = first?.fee_fixed ?? seller?.fee_fixed ?? s.fee_fixed;
  const mixed = items.some(i => (i.fee_pct ?? seller?.fee_pct ?? s.fee_pct) !== pct || (i.fee_fixed ?? seller?.fee_fixed ?? s.fee_fixed) !== fixed);
  return (
    <article className="doc">
      <DocHead s={s} />
      <div className="doc-title">
        <h2>CONSIGNMENT RECEIPT</h2>
        <dl>
          <dt>Receipt no.</dt><dd className="mono">{receipt}</dd>
          <dt>Date received</dt><dd>{dateText(first?.received_on, "EN")}</dd>
          <dt>Received by</dt><dd>{first?.received_by || ""}</dd>
        </dl>
      </div>
      <section className="doc-bill">
        <span className="k">Seller</span>
        <strong>{seller?.name || "?"}</strong>
        <span>{[seller ? `Seller ID ${seller.code}` : "", seller?.phone, seller?.email, seller?.instagram ? `@${seller.instagram}` : ""].filter(Boolean).join("  ·  ")}</span>
        <span className="fine">ID checked: {seller?.id_checked || "–"}</span>
      </section>
      <table className="doc-lots">
        <thead>
          <tr><th>Item</th><th>Watch</th><th>Serial</th><th>Box &amp; papers</th><th>Condition</th><th className="n">Reserve</th><th className="n">Start</th></tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td className="mono">{i.item_id}</td>
              <td>
                {`${i.brand} ${i.model}`.trim()}
                {i.reference ? <small> · ref {i.reference}</small> : null}
                {i.year ? <small> · {i.year}</small> : null}
                {i.notes ? <small className="sub">{i.notes}</small> : null}
                {mixed && (i.fee_pct != null || i.fee_fixed != null) ? <small className="sub">Fee: {feeText(i.fee_pct ?? seller?.fee_pct ?? s.fee_pct, i.fee_fixed ?? seller?.fee_fixed ?? s.fee_fixed)}</small> : null}
              </td>
              <td className="mono">{i.serial}</td>
              <td>{i.box_papers}</td>
              <td>{i.condition}</td>
              <td className="n">{i.reserve ? amt(i.reserve) : "none"}</td>
              <td className="n">{i.start_price != null ? amt(i.start_price) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="doc-foot">
        <div className="doc-pay">
          <p><b>Seller fee:</b> {mixed ? "as shown per item" : feeText(pct, fixed)}, charged only when an item sells and never more than its hammer price.</p>
          <p className="fine">Each watch stays the seller&apos;s property until it sells. Reserves can be changed before the auction by agreement.</p>
        </div>
        <table className="doc-totals">
          <tbody>
            <tr><td>Items received</td><td className="n">{items.length}</td></tr>
            <tr className="tot"><td>Total of reserves (AED)</td><td className="n">{amt(reserves)}</td></tr>
          </tbody>
        </table>
      </div>
      {s.intake_terms ? <p className="doc-terms">{s.intake_terms}</p> : null}
      <Signatures left="Seller's signature" right={`Received for ${s.trading_name || "The Time Souk"}`} />
    </article>
  );
}

export type Statement = {
  auction: OAuction; seller: Seller; lots: LotView[]; listing: boolean;
  /** What this auction's buyers paid the seller directly. */
  direct: number;
};

/** One seller's lots in one auction. Before the results are in it's a listing; after, a statement of what's owed. */
export function statementFor(o: Office, auctionId: string, sellerId: string): Statement | null {
  const auction = o.data.auctions.find(a => a.id === auctionId);
  const seller = o.data.sellers.find(x => x.id === sellerId);
  if (!auction || !seller) return null;
  const lots = o.lots.filter(l => l.auction_id === auctionId && l.seller_id === sellerId);
  if (!lots.length) return null;
  const decided = lots.some(l => l.sold || l.status === "Unsold" || l.exception);
  const prefix = `TS${pad3(auction.number)}-`;
  const direct = o.ledger
    .filter(e => e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id === sellerId && e.invoice_no.toUpperCase().startsWith(prefix))
    .reduce((t, e) => t + e.amount, 0);
  return { auction, seller, lots, listing: !decided && auction.sale_date >= o.today, direct: Math.round(direct * 100) / 100 };
}

export function StatementDoc({ st, s }: { st: Statement; s: OfficeSettings }) {
  const { auction, seller, lots, listing, direct } = st;
  const sold = lots.filter(l => l.sold);
  const sum = (f: (l: LotView) => number) => sold.reduce((t, l) => t + f(l), 0);
  const net = sum(l => l.net);
  // the cash that moved when lots were settled (+ we paid, − the seller paid us)
  const paid = sold.filter(l => l.payout === "Paid").reduce((t, l) => t + (l.payout_amount != null ? Number(l.payout_amount) : l.net), 0);
  const left = Math.round((net - direct - paid) * 100) / 100;
  const own = seller.kind === "own";
  return (
    <article className="doc doc-page">
      <DocHead s={s} />
      <div className="doc-title">
        <h2>{listing ? "CONSIGNMENT LISTING" : "CONSIGNMENT STATEMENT"}</h2>
        <dl>
          <dt>Auction</dt><dd>{auction.number} · {dateText(auction.sale_date, "EN")}</dd>
          <dt>Seller ID</dt><dd className="mono">{seller.code}</dd>
          <dt>Seller fee</dt><dd>{feeText(seller.fee_pct ?? s.fee_pct, seller.fee_fixed ?? s.fee_fixed)}</dd>
        </dl>
      </div>
      <section className="doc-bill">
        <span className="k">Seller</span>
        <strong>{seller.name}</strong>
        <span>{[seller.phone, seller.email].filter(Boolean).join("  ·  ")}</span>
        {seller.iban ? <span>Payout to: {seller.bank ? `${seller.bank} · ` : ""}<span className="mono">{seller.iban}</span></span> : null}
      </section>
      <table className="doc-lots">
        <thead>
          {listing ? (
            <tr><th>Lot</th><th>Watch</th><th className="n">Start</th><th className="n">Reserve</th></tr>
          ) : (
            <tr><th>Lot</th><th>Watch</th><th>Result</th><th className="n">Hammer</th><th className="n">Fee</th>{s.vat_fee_pct ? <th className="n">VAT</th> : null}<th className="n">Net to you</th><th>Paid</th></tr>
          )}
        </thead>
        <tbody>
          {lots.map(l => (
            <tr key={l.id}>
              <td className="mono">{l.key}</td>
              <td>{`${l.brand} ${l.model}`.trim()}{l.reference ? <small> · ref {l.reference}</small> : null}</td>
              {listing ? (
                <>
                  <td className="n">{amt(l.start_price)}</td>
                  <td className="n">{l.reserve ? amt(l.reserve) : "none"}</td>
                </>
              ) : (
                <>
                  <td>{l.sold ? "Sold" : l.status === "Sold – add buyer" ? "Sold" : l.status}</td>
                  <td className="n">{l.sold ? amt(l.hammer) : ""}</td>
                  <td className="n">{l.sold && !own ? amt(l.fee) : ""}</td>
                  {s.vat_fee_pct ? <td className="n">{l.sold && !own ? amt(l.vatFee) : ""}</td> : null}
                  <td className="n">{l.sold && !own ? amt(l.net) : ""}</td>
                  <td className="nowrap">{l.seller_paid_on || ""}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!listing && !own ? (
        <div className="doc-foot">
          <div className="doc-pay">
            <p>{sold.length} of {lots.length} sold.</p>
            {left > 0.005 ? <p><b>We&apos;ll pay AED {amt(left)}</b> once each buyer has paid.</p>
              : left < -0.005 ? <p><b>Please pay us AED {amt(-left)}</b>: buyers paid you directly more than your net (our fee is in it).</p>
                : <p><b>Settled in full.</b></p>}
          </div>
          <table className="doc-totals">
            <tbody>
              <tr><td>Hammer total</td><td className="n">{amt(sum(l => l.hammer || 0))}</td></tr>
              <tr><td>Seller fees</td><td className="n">−{amt(sum(l => l.fee))}</td></tr>
              {s.vat_fee_pct ? <tr><td>VAT on fees</td><td className="n">−{amt(sum(l => l.vatFee))}</td></tr> : null}
              <tr className="tot"><td>Net to you</td><td className="n">{amt(net)}</td></tr>
              {direct ? <tr><td>Paid to you directly by buyers</td><td className="n">−{amt(direct)}</td></tr> : null}
              <tr><td>{paid < 0 ? "You paid us" : "Paid so far"}</td><td className="n">{paid > 0 ? `−${amt(paid)}` : paid < 0 ? `+${amt(-paid)}` : "0"}</td></tr>
              <tr className="tot"><td>{left < -0.005 ? "You owe us" : "Still to pay you"}</td><td className="n">{amt(Math.abs(left))}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {s.seller_terms ? <p className="doc-terms">{s.seller_terms}</p> : null}
      {listing ? <Signatures left="Seller's signature" right={`For ${s.trading_name || "The Time Souk"}`} /> : null}
    </article>
  );
}
