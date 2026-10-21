import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import type { IntakeView } from "@/lib/office/engine";
import { auctionChoices, intakeRow } from "@/lib/office/intake-view";
import { SetupNeeded } from "@/components/office/bits";
import { IntakeForm, IntakeTable } from "@/components/office/forms2";

export const dynamic = "force-dynamic";

export default async function OfficeIntake({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const show = sp.show || "stock";
  const q = String(sp.q || "").trim().toLowerCase();
  const rows = o.intake
    .filter(i => (show === "stock" ? i.status === "In stock" || /: in stock$/.test(i.status) : show === "auction" ? /^In auction/.test(i.status) : show === "sold" ? /^Sold/.test(i.status) : show === "returned" ? /Returned/.test(i.status) : true))
    .filter(i => !q || `${i.item_id} ${i.brand} ${i.model} ${i.reference} ${i.serial} ${i.seller?.name} ${i.seller?.code}`.toLowerCase().includes(q))
    .slice()
    .reverse()
    .map(intakeRow);
  const count = (f: (i: IntakeView) => boolean) => o.intake.filter(f).length;
  const chips: [string, string, number][] = [
    ["stock", "In stock", count(i => i.status === "In stock" || /: in stock$/.test(i.status))],
    ["auction", "In an auction", count(i => /^In auction/.test(i.status))],
    ["sold", "Sold", count(i => /^Sold/.test(i.status))],
    ["returned", "Returned", count(i => /Returned/.test(i.status))],
    ["all", "Everything", o.intake.length]
  ];
  const receipts = [...new Set(o.intake.map(i => i.receipt_no))].sort().reverse().slice(0, 12);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Intake</h1>
          <p className="fine">Every watch a seller hands over, on a consignment receipt. Tick watches in stock and add them to an auction.</p>
        </div>
        <form className="inline-form" action="/admin/office/intake">
          <input type="hidden" name="show" value={show} />
          <input name="q" defaultValue={sp.q || ""} placeholder="Item, watch, serial, seller…" aria-label="Find" />
          <button className="btn sm">Find</button>
        </form>
      </div>
      <details className="panel-card" open={!o.intake.length}>
        <summary><strong>New intake</strong> <span className="fine">(a seller hands over watches)</span></summary>
        <IntakeForm sellers={o.data.sellers.filter(x => x.kind !== "own").map(x => ({ id: x.id, label: `${x.code} · ${x.name}${x.demo ? " (demo)" : ""}` }))} />
      </details>
      {receipts.length ? (
        <div className="row">
          <span className="k">Receipts</span>
          {receipts.map(r => <Link key={r} className="btn sm" href={`/admin/office/intake/${r}`}>{r}</Link>)}
        </div>
      ) : null}
      <div className="chips">
        {chips.map(([k, label, n]) => <Link key={k} className="chip" href={`/admin/office/intake?show=${k}`} aria-pressed={k === show}>{label}<small>{n}</small></Link>)}
      </div>
      {rows.length ? <IntakeTable rows={rows} auctions={auctionChoices(o)} /> : <p className="empty">Nothing here.</p>}
    </div>
  );
}
