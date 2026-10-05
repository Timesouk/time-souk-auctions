"use client";
import { useState } from "react";
import { ConfirmButton, Msg, useAction } from "./ui";
import { importLots, relistLots, resetAuctionForRehearsal, zeroStartPrices } from "@/app/(admin)/admin/actions";
import { HEAD_COLS, parsePaste } from "@/lib/import";

export function ImportLots({ auctionId }: { auctionId: string }) {
  const [text, setText] = useState("");
  const { pending, msg, run } = useAction();
  const parsed = parsePaste(text);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="fine">Copy rows from your stock sheet, including the header row, and paste them here. Brand and Model are required. Estimates are optional (leave them empty to hide them), and an empty Start bid means 0.</p>
      <div className="row">
        <button className="btn sm" type="button" onClick={() => navigator.clipboard?.writeText(HEAD_COLS.join("\t"))}>Copy header row</button>
        <span className="fine">Paste it into row 1 of a new sheet to get the columns right.</span>
      </div>
      <textarea className="input mono" rows={8} style={{ fontSize: 13 }} value={text} onChange={e => setText(e.target.value)} placeholder={HEAD_COLS.slice(0, 6).join("\t") + "\t…"} />
      <p className="fine">
        {text.trim() ? `${parsed.lots.length} lot${parsed.lots.length === 1 ? "" : "s"} ready.${parsed.skipped.length ? ` Skipped rows ${parsed.skipped.join(", ")} (no brand or model).` : ""}` : "Nothing pasted yet."}
      </p>
      <div className="row">
        <button className="btn pri" type="button" disabled={pending || !parsed.lots.length} onClick={() => run(() => importLots(auctionId, parsed.lots), r => r.ok && setText(""))}>
          {parsed.lots.length ? `Add ${parsed.lots.length} lots` : "Add lots"}
        </button>
      </div>
      <Msg r={msg} />
    </div>
  );
}

export function Relist({ auctionId, lots }: { auctionId: string; lots: { id: string; label: string }[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const { pending, msg, run } = useAction();
  if (!lots.length) return <p className="fine">No unsold watches waiting from earlier auctions.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="fine">Nothing carries over automatically. Tick the watches the owners want offered again; their reserve and seller details come with them, their old bids don’t.</p>
      <div className="stack" style={{ gap: 4 }}>
        {lots.map(l => (
          <label key={l.id} className="check">
            <input type="checkbox" checked={sel.includes(l.id)} onChange={e => setSel(e.target.checked ? [...sel, l.id] : sel.filter(x => x !== l.id))} />
            <span>{l.label}</span>
          </label>
        ))}
      </div>
      <div className="row">
        <button className="btn" type="button" disabled={pending || !sel.length} onClick={() => run(() => relistLots(sel, auctionId), r => r.ok && setSel([]))}>Add {sel.length || ""} to this auction</button>
      </div>
      <Msg r={msg} />
    </div>
  );
}

/** Rehearsals only: puts every lot back to "not sold yet" (bids, prices, timers and invoices cleared). */
export function RehearsalReset({ auctionId, number }: { auctionId: string; number: number }) {
  const [typed, setTyped] = useState("");
  const { pending, msg, run } = useAction();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="fine">
        Ran a test sale and want to run it again? This puts every lot in this auction back to its starting price:
        all bids and max bids are deleted, timers cleared, and its invoices cancelled (paid test ones too).
        <b> Never use it on a real auction.</b> Admins only.
      </p>
      <div className="inline-form">
        <input value={typed} onChange={e => setTyped(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={`Type ${number} to confirm`} aria-label="Auction number to confirm" />
        <button className="btn danger" type="button" disabled={pending || typed !== String(number)} onClick={() => run(() => resetAuctionForRehearsal(auctionId, typed), r => r.ok && setTyped(""))}>
          Reset all lots
        </button>
      </div>
      <Msg r={msg} />
    </div>
  );
}

/** One click: every lot in the auction without bids starts at AED 0. */
export function ZeroStarts({ auctionId }: { auctionId: string }) {
  const { pending, msg, run } = useAction();
  return (
    <>
      <ConfirmButton className="btn" label="Start every lot at AED 0" confirm="Set all starting bids to 0? Tap again" disabled={pending} onConfirm={() => run(() => zeroStartPrices(auctionId))} />
      <Msg r={msg} />
    </>
  );
}
