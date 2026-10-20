import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { AuctionPicker, SetupNeeded } from "@/components/office/bits";
import { StatementDoc, statementFor } from "@/components/office/SellerDocs";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

export default async function OfficeStatements({ searchParams }: { searchParams: Promise<{ a?: string; seller?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  if (!a) return <p className="empty">No auctions yet.</p>;
  const ids = [...new Set(o.lots.filter(l => l.auction_id === a.id && l.seller_id).map(l => l.seller_id!))];
  const sellers = ids.map(id => o.data.sellers.find(x => x.id === id)!).filter(Boolean).sort((x, y) => x.code.localeCompare(y.code));
  const one = sp.seller ? sellers.find(x => x.code.toUpperCase() === sp.seller!.toUpperCase()) : undefined;
  const shown = one ? [one] : sellers.filter(x => x.kind !== "own");
  const sts = shown.map(x => statementFor(o, a.id, x.id)).filter(Boolean) as NonNullable<ReturnType<typeof statementFor>>[];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head no-print">
        <div>
          <h1 className="disp">Seller statements · auction {a.number}</h1>
          <p className="fine">Before the auction each prints as a CONSIGNMENT LISTING (the seller&apos;s lots and reserves); after it, a STATEMENT of what sold and what you owe. One seller per page.</p>
        </div>
        <div className="row">
          <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/statements" />
          <PrintButton label={one ? "Print / save as PDF" : `Print all ${sts.length}`} />
        </div>
      </div>
      <div className="chips no-print">
        <Link className="chip" href={`/admin/office/statements?a=${a.number}`} aria-pressed={!one}>All consignors</Link>
        {sellers.map(x => (
          <Link key={x.id} className="chip" href={`/admin/office/statements?a=${a.number}&seller=${x.code}`} aria-pressed={one?.id === x.id}>{x.code}<small>{x.name}</small></Link>
        ))}
      </div>
      {sts.length ? sts.map(st => <StatementDoc key={st.seller.id} st={st} s={o.data.settings} />) : <p className="empty">No consigned lots in this auction.</p>}
    </div>
  );
}
