import Link from "next/link";
import { loadAcctData, loadOffice, pickAuction } from "@/lib/office/load";
import { moneyAccounts } from "@/lib/office/acct-view";
import { AuctionPicker, DemoNote, SetupNeeded } from "@/components/office/bits";
import { AuctionPayoutForm, type AuctionPayoutSeller } from "@/components/office/forms2";

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
  const settledAlready = o.lots.filter(l => l.auction_id === a.id && l.sold && l.type === "Consignment" && l.seller_paid_on).length;
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
          <AuctionPayoutForm sellers={sellers} accounts={accounts} defaultAccount={o.data.settings.acct_payout_default} />
        </section>
      ) : (
        <p className="empty">
          Nothing left to settle with sellers for auction {a.number}{settledAlready ? ` (${settledAlready} sold watch${settledAlready === 1 ? " is" : "es are"} already settled)` : ""}.
        </p>
      )}
    </div>
  );
}
