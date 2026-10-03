"use client";
import { useState } from "react";
import { Msg, useAction } from "./ui";
import { importLots, relistLots } from "@/app/(admin)/admin/actions";
import { HEAD_COLS, parsePaste } from "@/lib/import";

export function ImportLots({ auctionId }: { auctionId: string }) {
  const [text, setText] = useState("");
  const { pending, msg, run } = useAction();
  const parsed = parsePaste(text);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="fine">Copy rows from your stock sheet, including the header row, and paste them here. Brand and Model are required; leave Start bid empty for about 70% of the low estimate.</p>
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
