import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { amt, auctionDue, type LotView } from "@/lib/office/engine";
import { Wording, dateText, winnerMessage } from "@/lib/office/messages";
import { BOX_PAPERS, CONDITIONS, DELIVERY_STATUSES, EXCEPTIONS } from "@/lib/office/types";
import { AuctionPicker, DemoNote, SetupNeeded } from "@/components/office/bits";
import { LotsGrid, type GridCol, type GridRow } from "@/components/office/LotsGrid";
import { AddLot } from "@/components/office/AddLot";

export const dynamic = "force-dynamic";

const VIEWS = {
  live: "Live results",
  after: "After the sale",
  details: "Lot details"
} as const;
type View = keyof typeof VIEWS;

const num = (n: number | null | undefined) => (n == null ? "" : String(n));

export default async function OfficeLots({ searchParams }: { searchParams: Promise<{ a?: string; view?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.view === "after" || sp.view === "details" ? sp.view : "live";
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  if (!a) return <p className="empty">No auctions yet.</p>;
  const s = o.data.settings;
  const w = new Wording(s, o.data.messages);
  const due = auctionDue(a, s);
  const lots = o.lots.filter(l => l.auction_id === a.id);

  const winnerOf = (l: LotView) => l.winner_text || (l.customer ? (l.customer.instagram ? `@${l.customer.instagram}` : l.customer.code) : "");
  const rows: GridRow[] = lots.map((l): GridRow => {
    const c = l.customer;
    const hasResult = l.hammer != null || !!l.winner_customer_id || !!String(l.winner_text || "").trim();
    const base = {
      id: l.id, key: l.key, watch: `${l.brand} ${l.model}`.trim() + (l.reference ? ` · ${l.reference}` : ""), seller: l.seller ? `${l.seller.code}${l.type === "Consignment" ? "" : " · own"}` : "",
      status: l.status, href: l.invoiceNo ? `/admin/office/invoices/${l.invoiceNo}` : undefined,
      canDelete: !hasResult && !l.current_bid
    };
    if (view === "after") {
      return {
        ...base,
        values: { delivery_status: l.delivery_status, dispatched_on: l.dispatched_on || "", courier: l.courier, tray: num(l.tray), seller_paid_on: l.seller_paid_on || "", payout_ref: l.payout_ref, office_notes: l.office_notes },
        info: { status: l.status, invoice: l.invoiceNo || "", net: l.type === "Consignment" && l.sold ? amt(l.net) : "", payout: l.payout }
      };
    }
    if (view === "details") {
      return {
        ...base,
        values: {
          brand: l.brand, model: l.model, reference: l.reference, year: l.year, box_papers: l.box_papers, condition: l.condition, serial: l.serial, seller: l.seller?.code || "",
          start_price: num(l.start_price), reserve: num(l.reserve), cost: num(l.cost), fee_pct: num(l.seller_fee), fee_fixed: num(l.fee_fixed)
        },
        info: {
          type: l.type,
          fee: l.type !== "Consignment" ? "" : l.feeScale && !l.sold ? "by scale" : `${l.feePct ?? 0}%${l.feeFixed ? ` + ${amt(l.feeFixed)}` : ""}${l.feeScale ? " (scale)" : ""}`,
          check: l.reserveCheck
        }
      };
    }
    return {
      ...base,
      values: { winner: winnerOf(l), hammer: num(l.hammer), underbidder: l.underbidder, underbid: num(l.underbid), exception: l.exception || "" },
      info: { buyer: c ? `${c.code}${c.full_name ? ` · ${c.full_name}` : ""}` : "", status: l.status, invoice: l.invoiceNo || "", tray: l.tray ? String(l.tray) : "", check: l.reserveCheck === "Below reserve" ? "Below reserve" : "" },
      slip: l.sold || l.status === "Sold – add buyer" ? `/admin/office/slips?a=${a.number}&lot=${l.key}` : undefined,
      wa: l.sold && c ? { phone: c.phone, text: winnerMessage(w, l, due), ref: l.invoiceNo || "", name: c.full_name || c.instagram || c.code, total: l.hammer } : null
    };
  });

  const cols: Record<View, GridCol[]> = {
    live: [
      { key: "winner", label: "Winner (@ or code)", list: "dl-buyers", w: 140 },
      { key: "hammer", label: "Hammer (AED)", kind: "num", w: 85 },
      { key: "underbidder", label: "Underbidder", w: 100 },
      { key: "underbid", label: "Underbid", kind: "num", w: 75 },
      { key: "exception", label: "Exception", kind: "select", options: EXCEPTIONS }
    ],
    after: [
      { key: "delivery_status", label: "Delivery status", kind: "select", options: DELIVERY_STATUSES },
      { key: "dispatched_on", label: "Dispatched / handed over", kind: "date" },
      { key: "courier", label: "Courier & AWB", w: 140 },
      { key: "tray", label: "Tray", kind: "num", w: 50 },
      { key: "seller_paid_on", label: "Seller paid on", kind: "date" },
      { key: "payout_ref", label: "Payout ref.", w: 110 },
      { key: "office_notes", label: "Notes", w: 160 }
    ],
    details: [
      { key: "brand", label: "Brand", w: 110 },
      { key: "model", label: "Model", w: 150 },
      { key: "reference", label: "Reference", w: 100 },
      { key: "year", label: "Year", w: 60 },
      { key: "box_papers", label: "Box & papers", kind: "select", options: BOX_PAPERS },
      { key: "condition", label: "Condition", kind: "select", options: CONDITIONS },
      { key: "serial", label: "Serial (internal)", w: 110 },
      { key: "seller", label: "Seller", list: "dl-sellers", w: 70 },
      { key: "start_price", label: "Start", kind: "num", w: 80 },
      { key: "reserve", label: "Reserve", kind: "num", w: 80 },
      { key: "cost", label: "Cost (own)", kind: "num", w: 80 },
      { key: "fee_pct", label: "Fee %", kind: "num", w: 60 },
      { key: "fee_fixed", label: "Fixed fee", kind: "num", w: 70 }
    ]
  };
  const info: Record<View, { key: string; label: string; n?: boolean; wrap?: boolean }[]> = {
    // the lot number links to its invoice, so the live view leaves the invoice column out (more room for the buttons)
    live: [{ key: "buyer", label: "Buyer", wrap: true }, { key: "status", label: "Status" }, { key: "tray", label: "Tray", n: true }, { key: "check", label: "" }],
    after: [{ key: "status", label: "Status" }, { key: "invoice", label: "Invoice" }, { key: "net", label: "Net to seller", n: true }, { key: "payout", label: "Seller payout" }],
    details: [{ key: "type", label: "Type" }, { key: "fee", label: "Fee" }, { key: "check", label: "Reserve check" }]
  };
  // the demo auction only uses demo buyers and sellers, real auctions only real ones
  const buyers = view === "live" ? o.data.customers.filter(c => !!c.demo === !!a.demo).flatMap(c => (c.instagram ? [`@${c.instagram}`, c.code] : [c.code])) : undefined;
  const sold = lots.filter(l => l.sold);
  const q = (v: View) => `/admin/office/lots?a=${a.number}${v === "live" ? "" : `&view=${v}`}`;
  const nextNo = lots.reduce((m, l) => Math.max(m, l.lot_number), 0) + 1;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Lots · auction {a.number}</h1>
          <p className="fine">
            {dateText(a.sale_date, "EN")} · {lots.length} lots · {sold.length} sold · hammer AED {amt(sold.reduce((t, l) => t + (l.hammer || 0), 0))}
          </p>
        </div>
        <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/lots" extra={view === "live" ? {} : { view }} />
      </div>
      {a.demo ? <DemoNote /> : null}
      <div className="chips" role="tablist">
        {(Object.keys(VIEWS) as View[]).map(v => (
          <Link key={v} className="chip" href={q(v)} aria-pressed={v === view}>
            {VIEWS[v]}
          </Link>
        ))}
      </div>
      {view === "live" ? (
        <p className="fine">
          Type the winner&apos;s Instagram handle (or buyer code) and the hammer price as each lot sells, then Save. A handle that isn&apos;t a buyer yet becomes a new buyer.
          A buyer who wins a second lot gets a <b>tray</b> number automatically, so their watches go together. <b>Print slip</b> prints the sold slip straight away; <b>WhatsApp</b> sends the winner their price and how to pay.
        </p>
      ) : null}
      <LotsGrid
        rows={rows}
        cols={cols[view]}
        info={info[view]}
        buyers={buyers}
        sellers={o.data.sellers.filter(x => !!x.demo === !!a.demo).map(x => x.code)}
        waMode={s.wa_mode}
        empty="No lots in this auction yet. Add one below, add them under Auctions & lots, or ADD TO AUCTION from intake."
      />
      <AddLot auctionId={a.id} nextNo={nextNo} sellers={o.data.sellers.filter(x => !!x.demo === !!a.demo).map(x => ({ code: x.code, name: x.name }))} />
    </div>
  );
}
