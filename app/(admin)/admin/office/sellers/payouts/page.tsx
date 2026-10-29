import Link from "next/link";
import { loadAcctData, loadOffice, pickAuction } from "@/lib/office/load";
import { moneyAccounts } from "@/lib/office/acct-view";
import { AuctionPicker, DemoNote, SetupNeeded } from "@/components/office/bits";
import { AuctionPayoutForm, type AuctionPayoutSeller } from "@/components/office/forms2";
import { ConfirmRun } from "@/components/office/ConfirmRun";
import { amt } from "@/lib/office/engine";
import { undoSellerPaid } from "../../actions2";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Mark every consignor of one auction as paid in one go: after paying them all, or for sellers paid before the back office. */
export default async function AuctionPayouts({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  if (!a) return <p className="empty">No auctions yet.</p>;
  const acct = await loadAcctData().catch(() => null);
  const accounts = acct ? moneyAccounts(acct.accounts).map(x => ({ code: x.code, name: x.name })) : [];
  const open = o.lots.filter(l => l.auction_id === a.id && l.sold && l.type === "Consignment" && !l.seller_paid_on && l.seller_id);
  const sellers: AuctionPayoutSeller[] = [...new Set(open.map(l => l.seller_id!))]
    .map(id => o.sellersById.get(id)!)
    .filter(Boolean)
    .sort((x, y) => x.code.localeCompare(y.code))
    .map(x => {
      const lots = open.filter(l => l.seller_id === x.id);
      return {
        id: x.id, code: x.code, name: x.name,
        lots: lots.map(l => ({ id: l.id, key: l.key, net: l.net, waiting: l.payout === "Wait – buyer not paid", settle: l.settle }))
      };
    });
  const settledLots = o.lots.filter(l => l.auction_id === a.id && l.sold && l.type === "Consignment" && l.seller_paid_on && l.seller_id);
  const settledAlready = settledLots.length;
  const settledSellers = [...new Set(settledLots.map(l => l.seller_id!))].map(id => o.sellersById.get(id)!).filter(Boolean).sort((x, y) => x.code.localeCompare(y.code)).map(x => {
    const ls = settledLots.filter(l => l.seller_id === x.id);
    const share = ls.reduce((t, l) => t + l.net, 0);
    const cash = ls.reduce((t, l) => t + (l.payout_amount != null ? Number(l.payout_amount) : l.net), 0);
    return { x, ls, share: Math.round(share * 100) / 100, cash: Math.round(cash * 100) / 100, dates: [...new Set(ls.map(l => l.seller_paid_on!))].sort() };
  });
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Pay sellers · auction {a.number}</h1>
          <p className="fine">
            Marks every sold watch of this auction as settled with its seller, seller by seller, in one go: after you&apos;ve paid them all, or for sellers you paid before
            using the back office. Money a buyer paid a seller directly is taken off, as on each seller&apos;s page. One watch at a time: the seller&apos;s page.
          </p>
        </div>
        <div className="row">
          <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/sellers/payouts" />
          <Link className="btn sm" href="/admin/office/sellers">All sellers</Link>
        </div>
      </div>
      {a.demo ? <DemoNote /> : null}
      {sellers.length ? (
        <section className="panel-card">
          <span className="k">Still to pay</span>
          <AuctionPayoutForm sellers={sellers} accounts={accounts} defaultAccount={o.data.settings.acct_payout_default} />
        </section>
      ) : (
        <p className="empty">
          Nothing left to settle with sellers for auction {a.number}{settledAlready ? ` (${settledAlready} sold watch${settledAlready === 1 ? " is" : "es are"} already settled)` : ""}.
        </p>
      )}
      {settledSellers.length ? (
        <section className="panel-card">
          <span className="k">Already marked paid · auction {a.number}</span>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Seller</th><th>Lots</th><th>Paid on</th><th className="n">Their share</th><th className="n">Recorded as paid</th><th /></tr></thead>
              <tbody>
                {settledSellers.map(r => (
                  <tr key={r.x.id}>
                    <td><Link href={`/admin/office/sellers/${r.x.code}`}><b>{r.x.code}</b></Link> <span className="fine">{r.x.name}</span></td>
                    <td className="mono">{r.ls.map(l => l.key).join(", ")}</td>
                    <td className="nowrap">{r.dates.join(", ")}</td>
                    <td className="n">{amt(r.share)}</td>
                    <td className="n">
                      <b>{amt(r.cash)}</b>
                      {Math.abs(r.share - r.cash) > 0.005 ? <small className="sub warn-ink">{amt(Math.abs(r.share - r.cash))} {r.cash < r.share ? "taken off for money held from buyers" : "more than their share"}</small> : null}
                    </td>
                    <td>{admin ? <ConfirmRun label="Undo" ask={`Mark ${r.x.code}'s ${r.ls.length} watch${r.ls.length === 1 ? "" : "es"} in auction ${a.number} as not paid?\n\nUse this when they were marked with the wrong date or amount, then mark them again above.`} run={undoSellerPaid.bind(null, r.ls.map(l => l.id))} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">If you paid a seller their full share but less was recorded here (money a buyer paid them later was taken off), press <b>Undo</b>, then mark them again with the date you actually paid them. Admins only.</p>
        </section>
      ) : null}
    </div>
  );
}
