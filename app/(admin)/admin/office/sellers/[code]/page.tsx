import Link from "next/link";
import { loadAcctData, loadOffice } from "@/lib/office/load";
import { moneyAccounts } from "@/lib/office/acct-view";
import { amt } from "@/lib/office/engine";
import { dateText } from "@/lib/office/messages";
import { Pill, SetupNeeded } from "@/components/office/bits";
import { PayoutForm, SellerForm, SettlementForm } from "@/components/office/forms2";
import { ConfirmRun } from "@/components/office/ConfirmRun";
import { deleteSeller, deleteSettlement } from "../../actions2";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import { feeRule, ruleText } from "@/lib/office/fees";
import { FeeScaleEditor } from "@/components/office/FeeScale";
import { auctionFigures, sellerNowAndLater } from "@/lib/office/seller-account";

export const dynamic = "force-dynamic";

export default async function OfficeSeller({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const x = o.sellers.find(s => s.code.toUpperCase() === decodeURIComponent(code).toUpperCase());
  if (!x) return <p className="empty">No seller {code}. <Link href="/admin/office/sellers">All sellers</Link></p>;
  const lots = o.lots.filter(l => l.seller_id === x.id).sort((a, b) => b.auctionNo - a.auctionNo || a.lot_number - b.lot_number);
  const owing = lots.filter(l => l.sold && l.type === "Consignment" && l.payout !== "Paid");
  // auctions with their lots, or where a buyer paid them directly
  const auctions = o.data.auctions.filter(a => (x.demo || !a.demo) && auctionFigures(o, a.id, x.id)).sort((a, b) => b.number - a.number);
  const intake = o.intake.filter(i => i.seller_id === x.id);
  const receipts = [...new Set(intake.map(i => i.receipt_no))];
  const n = (v: number | null) => (v == null ? "" : String(v));
  const acct = await loadAcctData().catch(() => null);
  const payFrom = acct ? moneyAccounts(acct.accounts).map(a => ({ code: a.code, name: a.name })) : [];
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const settlements = (o.data.settlements || []).filter(s => s.seller_id === x.id).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const directs = o.ledger.filter(e => e.paid_to_seller_id === x.id && e.kind === "Payment").slice().reverse();
  const consign = x.kind !== "own";
  const feeNow = feeRule(null, x, o.data.settings);
  const nl = sellerNowAndLater(o, x.id);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">{x.code} · {x.name}</h1>
          <p className="fine">{x.kind === "own" ? "Own stock" : "Consignment"}{x.phone ? ` · ${x.phone}` : ""}{x.iban ? ` · IBAN ${x.iban}` : ""}</p>
        </div>
        <div className="row">
          {consign ? <Link className="btn sm" href={`/admin/office/sellers/${x.code}/account`}>Account statement</Link> : null}
          <Link className="btn sm" href="/admin/office/sellers">All sellers</Link>
        </div>
      </div>
      <div className="stats">
        <div><span className="k">Lots</span><b>{x.lotsEntered}</b></div>
        <div><span className="k">Sold</span><b>{x.lotsSold}</b></div>
        <div><span className="k">Hammer</span><b>{amt(x.hammer)}</b></div>
        <div><span className="k">Fees</span><b>{amt(x.fees)}</b></div>
        <div><span className="k">Net to seller</span><b>{amt(x.net)}</b></div>
        {x.direct ? <div><span className="k">Buyers paid them directly</span><b>{amt(x.direct)}</b></div> : null}
        {consign ? (
          <>
            <div><span className="k">{nl.now < -0.005 ? "They owe us now" : "Due to them now"}</span><b className={Math.abs(nl.now) > 0.005 ? "warn-ink" : undefined}>{amt(Math.abs(nl.now))}</b></div>
            <div><span className="k">{x.owed < -0.005 ? "They owe us once buyers pay" : "Owed once every buyer pays"}</span><b>{amt(Math.abs(x.owed))}</b></div>
          </>
        ) : null}
      </div>
      {consign ? (
        <section className="panel-card">
          <span className="k">Payouts <Link className="fine" href="/admin/office/sellers/payouts">(every seller of an auction at once)</Link></span>
          <PayoutForm
            lots={owing.map(l => ({ id: l.id, key: l.key, watch: `${l.brand} ${l.model}`.trim(), net: l.net, invoice: l.invoiceNo || "", state: l.payout, settle: l.settle }))}
            held={owing.length ? x.held : 0}
            accounts={payFrom}
            defaultAccount={o.data.settings.acct_payout_default}
          />
        </section>
      ) : null}
      {consign ? (
        <details className="panel-card" open={x.owed < -0.005 && !owing.length}>
          <summary><strong>Settle up outside a payout</strong> <span className="fine">(the seller pays us back, or we pay them on account)</span></summary>
          {o.data.needs0009 ? (
            <p className="alert">To record this, run <code>supabase/migrations/0009_seller_settlements.sql</code> in the Supabase SQL Editor first.</p>
          ) : (
            <>
              <p className="fine">
                When buyers paid this seller for watches that weren&apos;t theirs (another seller&apos;s, or our own stock), the money is ours: it comes off their next payout above.
                If there&apos;s no payout to take it from, record here what they paid us back.
                {x.owed < -0.005 ? <> They owe us <b>AED {amt(-x.owed)}</b>.</> : null}
              </p>
              <SettlementForm sellerId={x.id} owed={x.owed < 0 ? x.owed : 0} accounts={payFrom} defaultAccount={o.data.settings.acct_payout_default} />
            </>
          )}
        </details>
      ) : null}
      {directs.length || settlements.length ? (
        <section className="panel-card">
          <span className="k">Money between us and this seller</span>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Date</th><th>What</th><th>Invoice / reference</th><th className="n">AED</th><th /></tr></thead>
              <tbody>
                {directs.map(e => (
                  <tr key={e.id}>
                    <td className="nowrap">{e.entry_date}</td>
                    <td>Buyer {e.customer?.code || "?"} paid them directly{e.demo ? <small className="sub">demo</small> : null}</td>
                    <td className="mono">{e.invoice_no ? <Link href={`/admin/office/invoices/${e.invoice_no}`}>{e.invoice_no}</Link> : ""}{e.reference ? <small className="sub">{e.reference}</small> : null}</td>
                    <td className="n">{amt(e.amount)}</td>
                    <td />
                  </tr>
                ))}
                {settlements.map(st => (
                  <tr key={st.id}>
                    <td className="nowrap">{st.entry_date}</td>
                    <td>{st.amount < 0 ? "The seller paid us" : "We paid the seller on account"}{st.notes ? <small className="sub">{st.notes}</small> : null}</td>
                    <td>{st.reference}</td>
                    <td className="n">{amt(Math.abs(st.amount))}</td>
                    <td>{admin ? <ConfirmRun label="Remove" ask="Are you sure you want to remove this settlement?" run={deleteSettlement.bind(null, st.id)} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">Payments made to the seller by buyers are removed on the invoice&apos;s page (or Payments).</p>
        </section>
      ) : null}
      <section className="panel-card">
        <span className="k">Paperwork</span>
        <div className="row">
          {consign ? <Link className="btn sm" href={`/admin/office/sellers/${x.code}/account`}>Account statement (every auction)</Link> : null}
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
      {consign ? (
        <section className="panel-card" id="fee">
          <span className="k">Fee · {feeNow.scale ? (feeNow.from === "seller scale" ? "their own scale" : "the standard scale") : feeNow.from === "seller" ? "their own %" : "the standard %"}</span>
          <p className="fine">
            Now: {ruleText(feeNow)}. A watch with its own fee typed on it (intake or Lots › Lot details) keeps that.
            {" "}Their own % or fixed fee goes under Details below; for a fee that depends on the sold price, give them their own scale here
            {feeNow.from === "scale" ? " (otherwise they follow the standard scale in Settings)" : ""}.
          </p>
          <FeeScaleEditor
            value={x.fee_scale || []}
            from={x.fee_scale_from}
            sellerId={x.id}
            fallback={x.fee_pct != null || x.fee_fixed != null ? `their own ${x.fee_pct ?? o.data.settings.fee_pct}%${(x.fee_fixed ?? o.data.settings.fee_fixed) ? ` + AED ${x.fee_fixed ?? o.data.settings.fee_fixed}` : ""} (Details)` : o.data.settings.fee_scale.length ? "the standard scale in Settings" : `the standard ${o.data.settings.fee_pct}%`}
            feeMin={o.data.settings.fee_min}
            needs0010={o.data.needs0010}
          />
        </section>
      ) : null}
      <section className="panel-card">
        <span className="k">Details</span>
        <SellerForm
          value={{
            id: x.id, code: x.code, name: x.name, kind: x.kind, phone: x.phone, instagram: x.instagram, email: x.email, id_checked: x.id_checked,
            fee_pct: n(x.fee_pct), fee_fixed: n(x.fee_fixed), bank: x.bank, iban: x.iban, notes: x.notes
          }}
        />
      </section>
      {admin && !x.demo ? (
        <section className="panel-card">
          <span className="k">Delete this seller</span>
          <p className="fine">
            Added by mistake? Only a seller with no lots, intake receipts, payments from buyers or settlements can be deleted. Admins only.
            {receipts.length ? <> Delete their receipt{receipts.length === 1 ? "" : "s"} first: {receipts.map((r, i) => <span key={r}>{i ? ", " : ""}<Link href={`/admin/office/intake/${r}`}>{r}</Link></span>)} (at the bottom of the receipt).</> : null}
          </p>
          <div className="row">
            <ConfirmRun label={`Delete seller ${x.code}`} className="btn danger" ask={`Are you sure you want to delete seller ${x.code} · ${x.name}?\n\nThis can't be undone.`} run={deleteSeller.bind(null, x.id)} then="/admin/office/sellers" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
