"use client";
import { useState } from "react";
import { Msg, useAction } from "@/components/admin/ui";
import { addLot, type NewLot } from "@/app/(admin)/admin/office/actions";
import { BOX_PAPERS, CONDITIONS } from "@/lib/office/types";

const blank = (auction_id: string, seller = ""): NewLot => ({
  auction_id, lot_number: "", brand: "", model: "", reference: "", year: "", condition: "", box_papers: "", serial: "", seller, start_price: "", reserve: "", cost: "", fee_pct: "", fee_fixed: ""
});

/** Add a watch straight to the auction (own stock, or a consignment without an intake receipt). */
export function AddLot({ auctionId, nextNo, sellers }: { auctionId: string; nextNo: number; sellers: { code: string; name: string }[] }) {
  const [v, setV] = useState<NewLot>(blank(auctionId, "TS"));
  const { pending, msg, run } = useAction();
  const f = (k: keyof NewLot) => ({ value: (v[k] as string) || "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <details className="panel-card no-print">
      <summary><strong>Add a lot</strong> <span className="fine">(next: lot {nextNo})</span></summary>
      <form
        className="form-grid"
        onSubmit={e => {
          e.preventDefault();
          run(() => addLot(v), r => r.ok && setV(blank(auctionId, v.seller)));
        }}
      >
        <label className="field">Brand<input required {...f("brand")} /></label>
        <label className="field">Model<input {...f("model")} /></label>
        <label className="field">Reference<input {...f("reference")} /></label>
        <label className="field">Year<input {...f("year")} /></label>
        <label className="field">Box &amp; papers
          <select {...f("box_papers")}><option value="" />{BOX_PAPERS.map(o => <option key={o}>{o}</option>)}</select>
        </label>
        <label className="field">Condition
          <select {...f("condition")}><option value="" />{CONDITIONS.map(o => <option key={o}>{o}</option>)}</select>
        </label>
        <label className="field">Seller
          <select {...f("seller")}>{sellers.map(s => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select>
        </label>
        <label className="field">Serial no. (internal)<input {...f("serial")} /></label>
        <label className="field">Start price (AED)<input inputMode="decimal" {...f("start_price")} /></label>
        <label className="field">Reserve (AED)<input inputMode="decimal" {...f("reserve")} /></label>
        <label className="field">Cost (own stock)<input inputMode="decimal" {...f("cost")} /></label>
        <label className="field">Fee % (blank = seller&apos;s)<input inputMode="decimal" {...f("fee_pct")} /></label>
        <label className="field">Fixed fee AED (blank = seller&apos;s)<input inputMode="decimal" {...f("fee_fixed")} /></label>
        <label className="field">Lot no. (blank = next)<input inputMode="numeric" placeholder={String(nextNo)} {...f("lot_number")} /></label>
        <div className="wide row">
          <button className="btn pri" disabled={pending}>{pending ? "Adding…" : "Add lot"}</button>
          <span className="fine">It appears on the website too if the auction is published (add photos under Auctions &amp; lots).</span>
        </div>
      </form>
      <Msg r={msg} />
    </details>
  );
}
