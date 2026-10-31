// Seller paperwork, printed with both logos: the consignment intake receipt and the listing / statement per auction.
import { amt, type IntakeView, type LotView, type Office } from "@/lib/office/engine";
import { auctionFigures, oursText, sellerAuctions, type AuctionFigures, type SellerAccount } from "@/lib/office/seller-account";
import { dateText } from "@/lib/office/messages";
import type { OAuction, OfficeSettings, Seller } from "@/lib/office/types";
import { DocHead } from "./DocHead";
import { feeRule, ruleText } from "@/lib/office/fees";

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
  // each watch's fee: its own, else the seller's (scale or %), else the standard (scale or %)
  const itemFee = (i: IntakeView) => ruleText(feeRule({ seller_fee: i.fee_pct, fee_fixed: i.fee_fixed }, seller, s));
  const feeAll = first ? itemFee(first) : ruleText(feeRule(null, seller, s));
  const mixed = items.some(i => itemFee(i) !== feeAll);
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
                {mixed && (i.fee_pct != null || i.fee_fixed != null) ? <small className="sub">Fee: {itemFee(i)}</small> : null}
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
          <p><b>Seller fee:</b> {mixed ? `${feeAll}; some items as shown` : feeAll}, charged only when an item sells and never more than its hammer price.</p>
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
  /** This auction's figures: now (buyers who have paid) and once every buyer has paid. */
  fig: AuctionFigures;
  /** The seller's account across every auction: we owe them (+) or they owe us (−). */
  account: { owed: number; held: number };
  /** Every auction with something for this seller, now and once every buyer has paid, plus payments on account. */
  all: { rows: { auction: OAuction; now: number; later: number; current: boolean }[]; onAccount: number; now: number; later: number };
  asOf: string;
};

/** One seller's lots in one auction. Before the results are in it's a listing; after, a statement of what's owed. */
export function statementFor(o: Office, auctionId: string, sellerId: string): Statement | null {
  const auction = o.data.auctions.find(a => a.id === auctionId);
  const seller = o.data.sellers.find(x => x.id === sellerId);
  const fig = auctionFigures(o, auctionId, sellerId);
  if (!auction || !seller || !fig) return null;
  const decided = !fig.lots.length || fig.lots.some(l => l.sold || l.status === "Unsold" || l.exception);
  const sv = o.sellersById.get(sellerId);
  const sa = sellerAuctions(o, sellerId);
  const rows = [...sa.byAuction.entries()]
    .map(([id, f]) => ({ auction: o.data.auctions.find(a => a.id === id)!, now: f.balanceNow, later: f.balance, current: id === auctionId }))
    .filter(r => r.auction && (r.current || Math.abs(r.now) > 0.005 || Math.abs(r.later) > 0.005))
    .sort((a, b) => a.auction.number - b.auction.number);
  return {
    auction, seller, lots: fig.lots, listing: !decided && auction.sale_date >= o.today, fig,
    account: { owed: sv?.owed || 0, held: sv?.held || 0 }, asOf: o.today,
    all: { rows, onAccount: sa.onAccount, now: sa.now, later: sa.later }
  };
}

const lessAmt = (n: number) => (Math.abs(n) < 0.005 ? "0" : n > 0 ? `−${amt(n)}` : `+${amt(-n)}`);
const listKeys = (keys: string[]) => (keys.length > 1 ? `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}` : keys[0] || "");

const balCell = (n: number) => (n > 0.005 ? `We owe you ${amt(n)}` : n < -0.005 ? `You owe us ${amt(-n)}` : "0");

/** "We owe you AED 1,200" / "You owe us AED 330" / "Nothing is due either way" */
function owing(n: number) {
  if (n > 0.005) return <>we owe you <b>AED {amt(n)}</b></>;
  if (n < -0.005) return <>you owe us <b>AED {amt(-n)}</b></>;
  return <>nothing is due either way</>;
}

export function StatementDoc({ st, s }: { st: Statement; s: OfficeSettings }) {
  const { auction, seller, lots, listing, fig, asOf } = st;
  const own = seller.kind === "own";
  const sold = fig.sold;
  const rowOf = new Map(fig.rows.map(r => [r.lot.id, r]));
  const vat = s.vat_fee_pct > 0;
  return (
    <article className="doc doc-page">
      <DocHead s={s} />
      <div className="doc-title">
        <h2>{listing ? (own ? "OWN STOCK LISTING" : "CONSIGNMENT LISTING") : own ? "OWN STOCK STATEMENT" : "CONSIGNMENT STATEMENT"}</h2>
        <dl>
          <dt>Auction</dt><dd>{auction.number} · {dateText(auction.sale_date, "EN")}</dd>
          <dt>Seller ID</dt><dd className="mono">{seller.code}</dd>
          <dt>Seller fee</dt><dd style={{ maxWidth: 360 }}>{own ? "Own stock: no fee" : ruleText(feeRule(null, seller, s, auction.sale_date))}</dd>
          {!listing ? <><dt>As of</dt><dd>{dateText(asOf, "EN")}</dd></> : null}
        </dl>
      </div>
      <section className="doc-bill">
        <span className="k">{own ? "Stock of" : "Seller"}</span>
        <strong>{seller.name}</strong>
        <span>{[seller.phone, seller.email].filter(Boolean).join("  ·  ")}</span>
        {seller.iban && !own ? <span>Payout to: {seller.bank ? `${seller.bank} · ` : ""}<span className="mono">{seller.iban}</span></span> : null}
      </section>

      {listing ? (
        <table className="doc-lots">
          <thead><tr><th>Lot</th><th>Watch</th><th className="n">Start</th><th className="n">Reserve</th></tr></thead>
          <tbody>
            {lots.map(l => (
              <tr key={l.id}>
                <td className="mono">{l.key}</td>
                <td>{`${l.brand} ${l.model}`.trim()}{l.reference ? <small> · ref {l.reference}</small> : null}</td>
                <td className="n">{amt(l.start_price)}</td>
                <td className="n">{l.reserve ? amt(l.reserve) : "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : own ? (
        <table className="doc-lots">
          <thead><tr><th>Lot</th><th>Watch</th><th>Result</th><th className="n">Hammer</th><th className="n">Cost</th><th className="n">Profit</th><th>Buyer</th></tr></thead>
          <tbody>
            {lots.map(l => (
              <tr key={l.id}>
                <td className="mono">{l.key}</td>
                <td>{`${l.brand} ${l.model}`.trim()}{l.reference ? <small> · ref {l.reference}</small> : null}</td>
                <td>{l.sold || l.status === "Sold – add buyer" ? "Sold" : l.status}</td>
                <td className="n">{l.sold ? amt(l.hammer) : ""}</td>
                <td className="n">{l.sold ? (Number(l.cost) > 0 ? amt(l.cost) : "not typed") : ""}</td>
                <td className="n">{l.sold ? amt(l.profit) : ""}</td>
                <td>{fig.buyer.get(l.id) || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <section className="stack" style={{ gap: 6 }}>
          <span className="k">1 · Your watches</span>
          <table className="doc-lots">
            <thead>
              <tr><th>Lot</th><th>Watch</th><th className="n">Sold for</th><th className="n">Our fee{vat ? " + VAT" : ""}</th><th className="n">Your share</th><th>Buyer</th><th>Your money</th></tr>
            </thead>
            <tbody>
              {lots.map(l => {
                const r = rowOf.get(l.id);
                return (
                  <tr key={l.id}>
                    <td className="mono">{l.key}</td>
                    <td>{`${l.brand} ${l.model}`.trim()}{l.reference ? <small> · ref {l.reference}</small> : null}</td>
                    {r ? (
                      <>
                        <td className="n">{amt(l.hammer)}</td>
                        <td className="n">{amt(l.fee + l.vatFee)}</td>
                        <td className="n"><b>{amt(l.net)}</b></td>
                        <td>{r.buyer ? <span className="mono">{r.buyer}</span> : null}<small className="sub">{r.buyerPaid}</small></td>
                        <td>{r.toYou}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="fine">{l.status === "Sold – add buyer" ? "Sold: buyer being confirmed" : l.status}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {!listing && !own && fig.splits.length ? (
        <section className="stack" style={{ gap: 10 }}>
          <span className="k">2 · Money buyers paid you directly</span>
          {fig.splits.map(d => (
            <div key={d.invoice} className="doc-direct">
              <p>
                Buyer <b>{d.buyer || "?"}</b> paid you <b>AED {amt(d.received)}</b> directly{d.dates.length ? ` on ${d.dates.map(x => dateText(x, "EN").slice(4)).join(" and ")}` : ""} for invoice <span className="mono">{d.invoice}</span>.
                {d.items.length ? " The invoice was for:" : " That order was cancelled, so all of it is ours."}
              </p>
              {d.items.length ? (
                <table className="doc-totals">
                  <tbody>
                    {d.items.map((i, k) => <tr key={k}><td>{i.label}</td><td className="n">{amt(i.amount)}</td></tr>)}
                    <tr className="tot"><td>Invoice total</td><td className="n">{amt(d.total)}</td></tr>
                    <tr><td>Paid to you directly</td><td className="n">{amt(d.received)}</td></tr>
                    {d.paidToOtherSellers > 0.005 ? <tr><td>Paid to other sellers directly</td><td className="n">{amt(d.paidToOtherSellers)}</td></tr> : null}
                    <tr><td>Paid to us</td><td className="n">{amt(d.paidToUs)}</td></tr>
                    <tr><td>Still to pay</td><td className="n">{amt(d.stillToPay)}</td></tr>
                  </tbody>
                </table>
              ) : null}
              <p>
                {d.yours > 0.005 ? <>Of the AED {amt(d.received)} you received, <b>AED {amt(d.yours)} is your share</b> of your watch{d.items.filter(i => i.yours).length === 1 ? "" : "es"}</> : <>None of the AED {amt(d.received)} is for your watches</>}
                {d.ours > 0.005 ? <>{d.yours > 0.005 ? " and " : ": "}<b>AED {amt(d.ours)} is ours</b>: {oursText(d)}. It comes off what we pay you.</> : "."}
                {!d.ready ? <> The buyer still owes AED {amt(d.stillToPay)} on this invoice, so it counts in the &ldquo;once every buyer has paid&rdquo; column.</> : null}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {!listing && !own ? (
        <section className="stack" style={{ gap: 10 }}>
          <span className="k">{fig.splits.length ? "3" : "2"} · What we owe you</span>
          <table className="doc-sum">
            <thead><tr><th /><th className="n">Now<small>buyers who have paid</small></th><th className="n">Once every buyer<small>has paid</small></th></tr></thead>
            <tbody>
              <tr><td>Your share of watches sold (after our fee)</td><td className="n">{amt(fig.netReady)}</td><td className="n">{amt(fig.net)}</td></tr>
              {fig.direct ? <tr><td>Less: paid to you directly by this auction&apos;s buyers</td><td className="n">{lessAmt(fig.directNow)}</td><td className="n">{lessAmt(fig.direct)}</td></tr> : null}
              {fig.usedElsewhere ? <tr><td>Plus: part of that already used to settle your other watches (see below)</td><td className="n">+{amt(fig.usedElsewhere)}</td><td className="n">+{amt(fig.usedElsewhere)}</td></tr> : null}
              <tr><td>{fig.paidByUs < -0.005 ? "Plus: what you paid us when we settled" : "Less: paid to you by us"}</td><td className="n">{lessAmt(fig.paidByUs)}</td><td className="n">{lessAmt(fig.paidByUs)}</td></tr>
              {fig.settledFromElsewhere ? <tr><td>Less: settled from money you held from other auctions&apos; buyers (see below)</td><td className="n">−{amt(fig.settledFromElsewhere)}</td><td className="n">−{amt(fig.settledFromElsewhere)}</td></tr> : null}
              <tr className="tot">
                <td>Balance</td>
                <td className="n">{balCell(fig.balanceNow)}</td>
                <td className="n">{balCell(fig.balance)}</td>
              </tr>
            </tbody>
          </table>
          <div className="doc-pay">
            <p><b>Now:</b> {owing(fig.balanceNow)}{fig.balanceNow < -0.005 ? (fig.balance > 0.005 ? ". It comes off what we pay you once your other buyers have paid." : ". It comes off your next payment from us, or please transfer it to us.") : fig.balanceNow > 0.005 ? ", for watches whose buyers have paid." : "."}</p>
            {fig.waitingRows.length ? (
              <p>
                <b>Waiting for buyers:</b> lot{fig.waitingRows.length === 1 ? "" : "s"} {listKeys(fig.waitingRows.map(r => `${r.lot.key} (${r.buyer || "buyer to confirm"}: ${r.buyerPaid.toLowerCase()})`))}.
                {" "}Your share of {fig.waitingRows.length === 1 ? "it" : "these"} is AED {amt(fig.waiting)}; we pay it once the buyer{fig.waitingRows.length === 1 ? " has" : "s have"} paid.
              </p>
            ) : <p>Every buyer has paid.</p>}
            {fig.waitingRows.length || Math.abs(fig.balance - fig.balanceNow) > 0.005 ? <p><b>Once every buyer has paid:</b> {owing(fig.balance)}.</p> : null}
            {lots.length ? <p>{sold.length} of {lots.length} sold{lots.length > sold.length ? `; unsold watches stay yours (collect them or relist).` : "."}</p> : <p>You had no watches in this auction; a buyer from it paid you directly.</p>}
            {fig.setoffsIn.map((x, i) => (
              <p key={`in${i}`}>
                <b>Lot {x.toLot}</b> was settled on {dateText(x.date, "EN").slice(4)} with AED {amt(x.amount)} from {x.fromAuctionId ? `money buyers in ${x.fromLabel} paid you directly, beyond your share there` : x.fromLabel}, so we didn&apos;t pay that part again.
              </p>
            ))}
            {fig.setoffsOut.map((x, i) => (
              <p key={`out${i}`}>
                AED {amt(x.amount)} of the money this auction&apos;s buyers paid you {x.toAuctionId ? <>settled <b>{x.toLabel}</b> on {dateText(x.date, "EN").slice(4)}</> : <>is covered by {x.toLabel}</>}, so it isn&apos;t owed here any more.
              </p>
            ))}
          </div>
          {st.all.rows.length > 1 || Math.abs(st.all.onAccount) > 0.005 ? (
            <>
              <span className="k">All your auctions with us</span>
              <table className="doc-sum">
                <thead><tr><th /><th className="n">Now<small>buyers who have paid</small></th><th className="n">Once every buyer<small>has paid</small></th></tr></thead>
                <tbody>
                  {st.all.rows.map(r => (
                    <tr key={r.auction.id}>
                      <td>Auction {r.auction.number} · {dateText(r.auction.sale_date, "EN").slice(4)}{r.current ? " (this statement)" : ""}</td>
                      <td className="n">{balCell(r.now)}</td>
                      <td className="n">{balCell(r.later)}</td>
                    </tr>
                  ))}
                  {Math.abs(st.all.onAccount) > 0.005 ? (
                    <tr><td>Payments between us on account</td><td className="n">{balCell(st.all.onAccount)}</td><td className="n">{balCell(st.all.onAccount)}</td></tr>
                  ) : null}
                  <tr className="tot"><td>Your account in total</td><td className="n">{balCell(st.all.now)}</td><td className="n">{balCell(st.all.later)}</td></tr>
                </tbody>
              </table>
            </>
          ) : null}
        </section>
      ) : null}

      {!listing && own ? (
        <div className="doc-foot">
          <div className="doc-pay">
            <p>{sold.length} of {lots.length} sold.</p>
            {fig.unpaidHammer > 0.005 ? <p><b>AED {amt(fig.unpaidHammer)}</b> of it is on invoices the buyer hasn&apos;t paid in full yet.</p> : sold.length ? <p>Every buyer has paid.</p> : null}
            {fig.costMissing ? <p className="fine">{fig.costMissing} sold watch{fig.costMissing === 1 ? " has" : "es have"} no cost typed (Lots › Lot details): the profit counts {fig.costMissing === 1 ? "it" : "them"} at no cost.</p> : null}
          </div>
          <table className="doc-totals">
            <tbody>
              <tr className="tot"><td>Sold for (hammer)</td><td className="n">{amt(fig.hammer)}</td></tr>
              <tr><td>Cost of the watches sold</td><td className="n">−{amt(fig.cost)}</td></tr>
              <tr className="tot"><td>Profit</td><td className="n">{amt(fig.profit)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {s.seller_terms && !own ? <p className="doc-terms">{s.seller_terms}</p> : null}
      {listing && !own ? <Signatures left="Seller's signature" right={`For ${s.trading_name || "The Time Souk"}`} /> : null}
    </article>
  );
}

/** The seller's whole account with us, every auction, line by line with a running balance. */
export function AccountDoc({ seller, acct, s, asOf, now }: { seller: Seller; acct: SellerAccount; s: OfficeSettings; asOf: string; now?: number }) {
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
          {now != null && Math.abs(now - acct.balance) > 0.005 ? (
            <>
              <p><b>Now</b> (buyers who have paid): {owing(now)}.</p>
              <p><b>Once every buyer has paid:</b> {owing(acct.balance)}. Some of your watches&apos; buyers haven&apos;t paid yet; we pay your share once they do.</p>
            </>
          ) : acct.balance > 0.005 ? <p><b>We owe you AED {amt(acct.balance)}.</b></p>
            : acct.balance < -0.005 ? <p><b>Please pay us AED {amt(-acct.balance)}.</b> Buyers paid you more than your sold watches came to (for example, our fee, delivery, or watches that weren&apos;t yours).</p>
              : <p><b>Your account is settled.</b></p>}
          <p className="fine">+ adds to what we owe you; − is money you&apos;ve had (from us, or straight from buyers).</p>
        </div>
        <table className="doc-totals">
          <tbody>
            {now != null && Math.abs(now - acct.balance) > 0.005 ? <tr><td>Now</td><td className="n">{balCell(now)}</td></tr> : null}
            <tr className="tot"><td>{now != null && Math.abs(now - acct.balance) > 0.005 ? "Once every buyer has paid" : "Balance"}</td><td className="n">{balCell(acct.balance)}</td></tr>
          </tbody>
        </table>
      </div>
      {s.seller_terms ? <p className="doc-terms">{s.seller_terms}</p> : null}
    </article>
  );
}
