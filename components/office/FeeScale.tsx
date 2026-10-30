"use client";
// Seller fee scale editor: price bands, each with a % of the sold price and/or a fixed fee. Used for the standard scale
// (Settings) and for one seller's own scale (their page).
import { useState } from "react";
import { Msg, useAction } from "@/components/admin/ui";
import { saveFeeScale } from "@/app/(admin)/admin/office/actions2";
import { bandFor, cleanScale, scaleProblem, type FeeBand } from "@/lib/office/fees";

type Row = { upTo: string; pct: string; fixed: string };
const toRows = (v: FeeBand[]): Row[] => v.map(b => ({ upTo: b.upTo == null ? "" : String(b.upTo), pct: b.pct ? String(b.pct) : "", fixed: b.fixed ? String(b.fixed) : "" }));
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const todayDubai = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);

export function FeeScaleEditor({ value, from: from0, sellerId, fallback, feeMin = 0, needs0010 }: { value: FeeBand[]; from?: string | null; sellerId?: string; fallback: string; feeMin?: number; needs0010?: boolean }) {
  const [rows, setRows] = useState<Row[]>(toRows(value));
  const [from, setFrom] = useState(value.length ? from0 || "" : todayDubai());
  const [tryPrice, setTryPrice] = useState("10000");
  const { pending, msg, run } = useAction();
  const problem = scaleProblem(rows);
  const scale = problem ? [] : cleanScale(rows.map(r => ({ upTo: r.upTo.trim() === "" ? null : r.upTo, pct: r.pct || 0, fixed: r.fixed || 0 })));
  const price = Number(String(tryPrice).replace(/[^\d.]/g, "")) || 0;
  const band = scale.length ? bandFor(scale, price) : null;
  const fee = band ? Math.min(price, Math.max(Math.round((price * band.pct) / 100 * 100) / 100 + band.fixed, feeMin)) : null;
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = (bands: Row[]) => run(() => saveFeeScale({ sellerId, bands, from }));
  if (!rows.length) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="fine">No fee scale: {fallback}.</p>
        <div className="row">
          <button type="button" className="btn sm" disabled={needs0010} onClick={() => setRows([{ upTo: "5000", pct: "", fixed: "300" }, { upTo: "20000", pct: "7.5", fixed: "" }, { upTo: "", pct: "5", fixed: "" }])}>
            Set up a fee scale
          </button>
        </div>
        {needs0010 ? <p className="alert">To use fee scales, run <code>supabase/migrations/0010_fee_scales.sql</code> in the Supabase SQL Editor first.</p> : null}
        <Msg r={msg} />
      </div>
    );
  }
  let prev = 0;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="fine">
        The band the sold price falls in sets the whole fee: a % of the sold price, a fixed amount, or both. Leave the last band&apos;s price blank for &ldquo;and above&rdquo;.
        {feeMin ? ` The minimum fee (AED ${money(feeMin)}) still applies.` : ""} The fee is never more than the sold price.
      </p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Sold for</th><th className="n">Fee %</th><th className="n">+ fixed fee (AED)</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const from = prev;
              const up = Number(r.upTo) || 0;
              if (r.upTo.trim() !== "" && up > prev) prev = up;
              const last = i === rows.length - 1;
              return (
                <tr key={i}>
                  <td className="nowrap">
                    {i === 0 ? "up to AED " : `over ${money(from)} up to `}
                    <input inputMode="decimal" value={r.upTo} placeholder={last ? "no limit" : "price"} onChange={e => set(i, "upTo", e.target.value)} aria-label={`Band ${i + 1} up to`} style={{ width: 110 }} />
                  </td>
                  <td className="n"><input inputMode="decimal" value={r.pct} placeholder="0" onChange={e => set(i, "pct", e.target.value)} aria-label={`Band ${i + 1} %`} style={{ width: 70 }} /></td>
                  <td className="n"><input inputMode="decimal" value={r.fixed} placeholder="0" onChange={e => set(i, "fixed", e.target.value)} aria-label={`Band ${i + 1} fixed fee`} style={{ width: 90 }} /></td>
                  <td><button type="button" className="btn sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove band ${i + 1}`}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm" onClick={() => setRows(rows.length ? [...rows.slice(0, -1), { upTo: "", pct: "", fixed: "" }, rows[rows.length - 1]] : [{ upTo: "", pct: "", fixed: "" }])}>+ Add a band</button>
        <span className="fine">Try a sold price: AED</span>
        <input inputMode="decimal" value={tryPrice} onChange={e => setTryPrice(e.target.value)} aria-label="Try a sold price" style={{ width: 110 }} />
        <span className="fine">{fee != null ? <>fee <b>AED {money(fee)}</b>, seller gets AED {money(price - fee)} (before any VAT on the fee)</> : ""}</span>
      </div>
      <label className="row" style={{ gap: 6 }}>
        <span className="fine">Applies to auctions on or after</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Applies from" />
        <span className="fine">{from ? "Earlier auctions keep the fee they had." : "Blank: every auction, including past ones (their fees and statements change)."}</span>
      </label>
      {problem ? <p className="alert">{problem}</p> : null}
      {needs0010 ? <p className="alert">To save fee scales, run <code>supabase/migrations/0010_fee_scales.sql</code> in the Supabase SQL Editor first.</p> : null}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn pri" disabled={pending || !!problem || needs0010} onClick={() => save(rows)}>{pending ? "Saving…" : "Save fee scale"}</button>
        {value.length ? (
          <button type="button" className="btn" disabled={pending || needs0010} onClick={() => { if (window.confirm(`Stop using this scale? The fee goes back to ${fallback}.`)) { setRows([]); save([]); } }}>Stop using a scale</button>
        ) : (
          <button type="button" className="btn" onClick={() => setRows([])}>Cancel</button>
        )}
      </div>
      <p className="fine">Every sold lot in those auctions that uses this scale gets its fee worked out from it (their statements and the books follow). A lot with its own fee typed on it keeps it.</p>
      <Msg r={msg} />
    </div>
  );
}
