import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { dateText } from "@/lib/office/messages";
import { COD, UAE } from "@/lib/office/types";
import { AuctionPicker, DemoNote, LotKeys, SetupNeeded } from "@/components/office/bits";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

/** Orders not yet delivered, ready ones first: the courier signs for each parcel. */
export default async function OfficeDispatch({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  if (!a) return <p className="empty">No auctions yet.</p>;
  const open = o.invoices.filter(i => i.auction?.id === a.id && i.deliveryStatus !== "Delivered" && i.deliveryStatus !== "Collected");
  const ready = (i: (typeof open)[number]) => /^Ready/.test(i.nextStep);
  const list = [...open.filter(ready), ...open.filter(i => !ready(i))];
  const cash = list.filter(i => ready(i) && i.paysBy === COD).reduce((t, i) => t + Math.max(0, i.balance), 0);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Dispatch · auction {a.number}</h1>
          <p className="fine">
            {dateText(a.sale_date, "EN")} · Ready to go: {list.filter(ready).length} · Waiting for payment: {list.filter(i => !ready(i)).length} · Cash for the courier to collect: AED {amt(cash)}
          </p>
        </div>
        <div className="row no-print">
          <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/dispatch" />
          <PrintButton label="Print the list" />
        </div>
      </div>
      {a.demo ? <DemoNote /> : null}
      <p className="fine no-print">Grey rows are still waiting for payment: don&apos;t hand them over. Set each lot&apos;s delivery status on <Link href={`/admin/office/lots?a=${a.number}&view=after`}>Lots › After the sale</Link>.</p>
      {list.length === 0 ? (
        <p className="empty">Everything from this auction has been delivered or collected.</p>
      ) : (
        <div className="tbl-wrap">
          <table className="dispatch">
            <thead><tr><th>#</th><th>Invoice</th><th>Buyer</th><th>Phone</th><th>Address</th><th>Delivery</th><th>Tray</th><th>Lots</th><th>Payment</th><th className="n">Collect</th><th>Next step</th><th>AWB / tracking</th><th>Signature</th></tr></thead>
            <tbody>
              {list.map((i, n) => (
                <tr key={i.no} className={ready(i) ? undefined : "waiting"}>
                  <td>{n + 1}</td>
                  <td className="mono"><Link href={`/admin/office/invoices/${i.no}`}>{i.no}</Link></td>
                  <td>{i.customer.full_name || (i.customer.instagram ? `@${i.customer.instagram}` : i.customer.code)}</td>
                  <td className="mono nowrap">{i.customer.phone}</td>
                  <td>{[i.customer.address, i.customer.area, i.country === UAE ? "" : i.country].filter(Boolean).join(", ")}</td>
                  <td>{i.delivery}</td>
                  <td className="n">{i.tray || ""}</td>
                  <td className="mono"><LotKeys keys={i.lots.map(l => l.key)} /></td>
                  <td>{i.paysBy === COD ? "Cash on delivery" : i.status}</td>
                  <td className="n">{i.paysBy === COD && i.balance > 0 ? <b>{amt(i.balance)}</b> : ""}</td>
                  <td className="fine">{i.nextStep}</td>
                  <td className="sign" />
                  <td className="sign" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
