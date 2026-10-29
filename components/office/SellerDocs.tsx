// Seller paperwork, printed with both logos: the consignment intake receipt and the listing / statement per auction.
import { amt, pad3, type IntakeView, type LotView, type Office } from "@/lib/office/engine";
import { DIRECT } from "@/lib/office/types";
import type { SellerAccount } from "@/lib/office/seller-account";
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
  /** The seller's account across every auction: we owe them (+) or they owe us (−), and money they hold for us. */
  account: { owed: number; held: number };
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
  const sv = o.sellersById.get(sellerId);
  return { auction, seller, lots, listing: !decided && auction.sale_date >= o.today, direct: Math.round(direct * 100) / 100, account: { owed: sv?.owed || 0, held: sv?.held || 0 } };
}

export function StatementDoc({ st, s }: { st: Statement; s: OfficeSettings }) {
  const { auction, seller, lots, listing, account } = st;
  const sold = lots.filter(l => l.sold);
  const sum = (f: (l: LotView) => number) => sold.reduce((t, l) => t + f(l), 0);
  const net = sum(l => l.net);
  // this auction: lots settled with the seller (whatever cash moved, since money they held from buyers is netted at account level)
  const settled = sold.filter(l => l.payout === "Paid").reduce((t, l) => t + l.net, 0);
  const left = Math.round((net - settled) * 100) / 100;
  const r = (n: number) => Math.round(n * 100) / 100;
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
            {left > 0.005 ? <p><b>AED {amt(left)} still to settle</b> for this auction, once each buyer has paid.</p> : <p><b>This auction is settled.</b></p>}
            {Math.abs(account.held) > 0.005 ? (
              <p>
                {account.held > 0
                  ? <>Buyers paid you <b>AED {amt(account.held)}</b> directly that hasn&apos;t been settled yet (for your watches or others&apos;): it comes off what we pay you.</>
                  : <>We also owe you <b>AED {amt(-account.held)}</b> on your account.</>}
              </p>
            ) : null}
            <p>
              <b>Your account, all auctions: {account.owed >= 0 ? `we owe you AED ${amt(account.owed)}` : `you owe us AED ${amt(-account.owed)}`}.</b>
            </p>
          </div>
          <table className="doc-totals">
            <tbody>
              <tr><td>Hammer total</td><td className="n">{amt(sum(l => l.hammer || 0))}</td></tr>
              <tr><td>Seller fees</td><td className="n">−{amt(sum(l => l.fee))}</td></tr>
              {s.vat_fee_pct ? <tr><td>VAT on fees</td><td className="n">−{amt(sum(l => l.vatFee))}</td></tr> : null}
              <tr className="tot"><td>Net to you</td><td className="n">{amt(net)}</td></tr>
              <tr><td>Settled already</td><td className="n">{settled ? `−${amt(r(settled))}` : "0"}</td></tr>
              <tr className="tot"><td>Still to settle</td><td className="n">{amt(left)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {s.seller_terms ? <p className="doc-terms">{s.seller_terms}</p> : null}
      {listing ? <Signatures left="Seller's signature" right={`For ${s.trading_name || "The Time Souk"}`} /> : null}
    </article>
  );
}

/** The seller's whole account with us, every auction, line by line with a running balance. */
export function AccountDoc({ seller, acct, s, asOf }: { seller: Seller; acct: SellerAccount; s: OfficeSettings; asOf: string }) {
  const sign = (n: number) => (n > 0.005 ? `+${amt(n)}` : n < -0.005 ? `−${amt(-n)}` : "0");
  const bal = (n: number) => (n < -0.005 ? `${amt(-n)} you owe` : amt(n));
  return (
    <article className="doc doc-page">
      <DocHead s={s} />
      <div className="doc-title">
        <h2>SELLER ACCOUNT STATEMENT</h2>
        <dl>
          <dt>Seller ID</dt><dd className="mono">{seller.code}</dd>
          <dt>As of</dt><dd>{dateText(asOf, "EN")}</dd>
        </dl>
      </div>
      <section className="doc-bill">
        <span className="k">Seller</span>
        <strong>{seller.name}</strong>
        <span>{[seller.phone, seller.email].filter(Boolean).join("  ·  ")}</span>
        {seller.iban ? <span>Payout to: {seller.bank ? `${seller.bank} · ` : ""}<span className="mono">{seller.iban}</span></span> : null}
      </section>
      <table className="doc-lots">
        <thead><tr><th>Date</th><th>Details</th><th className="n">AED</th><th className="n">Balance</th></tr></thead>
        <tbody>
          {acct.lines.map((l, i) => (
            <tr key={i}>
              <td className="nowrap">{l.date}</td>
              <td>{l.what}{l.note ? <small className="sub">{l.note}</small> : null}</td>
              <td className="n nowrap">{sign(l.amount)}</td>
              <td className="n nowrap">{bal(l.balance)}</td>
            </tr>
          ))}
          {!acct.lines.length ? <tr><td colSpan={4} className="fine">Nothing on this account yet.</td></tr> : null}
        </tbody>
      </table>
      <div className="doc-foot">
        <div className="doc-pay">
          {acct.balance > 0.005 ? <p><b>We owe you AED {amt(acct.balance)}.</b>{acct.waiting > 0.005 ? ` AED ${amt(Math.min(acct.waiting, acct.balance))} of it is for watches whose buyer hasn't paid yet: we pay it once they do.` : ""}</p>
            : acct.balance < -0.005 ? <p><b>Please pay us AED {amt(-acct.balance)}.</b> Buyers paid you more than your sold watches came to (for example, for watches that weren&apos;t yours).</p>
              : <p><b>Your account is settled.</b></p>}
          <p className="fine">+ adds to what we owe you; − is money you&apos;ve had (from us, or straight from buyers).</p>
        </div>
        <table className="doc-totals">
          <tbody>
            <tr className="tot"><td>{acct.balance < -0.005 ? "You owe us" : "We owe you"}</td><td className="n">{amt(Math.abs(acct.balance))}</td></tr>
          </tbody>
        </table>
      </div>
      {s.seller_terms ? <p className="doc-terms">{s.seller_terms}</p> : null}
    </article>
  );
}
