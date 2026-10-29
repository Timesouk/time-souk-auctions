import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { dateText } from "@/lib/office/messages";
import { COD, UAE } from "@/lib/office/types";
import { AuctionPicker, DemoNote, LotKeys, SetupNeeded } from "@/components/office/bits";
import { PrintButton } from "@/components/office/forms";
import { BulkDelivery, RowDelivered, Tick, TickAll, type DeliveryInv } from "@/components/office/Delivery";
import { stillOwes } from "@/lib/office/delivery";

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
  const dinv = (i: (typeof list)[number]): DeliveryInv => ({ no: i.no, status: i.deliveryStatus, pickup: i.delivery === "Pickup", owe: stillOwes(i) });
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
      <p className="fine no-print">Grey rows are still waiting for payment: don&apos;t hand them over. Tick the orders the courier takes and press <b>With courier</b>; when they arrive, tick them again and press <b>Delivered</b> (or use the button on each row). Every lot on the invoice changes together; one lot on its own: <Link href={`/admin/office/lots?a=${a.number}&view=after`}>Lots › After the sale</Link>.</p>
      {list.length === 0 ? (
        <p className="empty">Everything from this auction has been delivered or collected.</p>
      ) : (
        <>
        <BulkDelivery formId="dispatch-delivery" rows={list.map(dinv)} />
        <div className="tbl-wrap">
          <table className="dispatch">
            <thead><tr><th className="no-print"><TickAll formId="dispatch-delivery" /></th><th>#</th><th>Invoice</th><th>Buyer</th><th>Phone</th><th>Address</th><th>Delivery</th><th>Tray</th><th>Lots</th><th>Payment</th><th className="n">Collect</th><th>Next step</th><th>AWB / tracking</th><th>Signature</th></tr></thead>
            <tbody>
              {list.map((i, n) => (
                <tr key={i.no} className={ready(i) ? undefined : "waiting"}>
                  <td className="no-print"><Tick formId="dispatch-delivery" no={i.no} /></td>
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
                  <td className="fine">
                    {i.nextStep}{i.deliveryStatus !== "Not sent" ? <small className="sub">{i.deliveryStatus}</small> : null}
                    {stillOwes(i) === 0 || i.deliveryStatus === "With courier" ? <div className="no-print" style={{ marginTop: 6 }}><RowDelivered inv={dinv(i)} /></div> : null}
                  </td>
                  <td className="sign" />
                  <td className="sign" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
