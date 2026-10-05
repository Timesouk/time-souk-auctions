"use client";
import { useState } from "react";
import { Msg, useAction } from "./ui";
import { updateBidder } from "@/app/(admin)/admin/actions";

export type BidderRowData = {
  id: string; paddle: number; full_name: string; email: string; phone: string | null; phone_verified: boolean; email_verified: boolean;
  country: string; address: string; instagram: string | null; instagram_confirmed: boolean; role: string; suspended: boolean; terms: boolean; created_at: string;
  notes: string; id_checked: boolean; wins: number; unpaid: number;
};

export function BidderRow({ b, canRole }: { b: BidderRowData; canRole: boolean }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(b.notes);
  const [ig, setIg] = useState(b.instagram || "");
  const [phone, setPhone] = useState("");
  const { pending, msg, run } = useAction();
  return (
    <>
      <tr>
        <td className="mono">{b.paddle}</td>
        <td><b>{b.full_name || "—"}</b><br /><span className="fine">{b.country}</span>{b.address ? <><br /><span className="fine">{b.address}</span></> : null}</td>
        <td style={{ fontSize: 13 }}>{b.email} {b.email_verified ? "✓" : ""}<br /><span className="mono">{b.phone || "no phone"}</span> {b.phone_verified ? "✓" : ""}</td>
        <td>{b.instagram ? `@${b.instagram}` : "—"} {b.instagram ? (b.instagram_confirmed ? <span className="pill ok">confirmed</span> : <span className="pill">unconfirmed</span>) : null}</td>
        <td>
          {b.suspended ? <span className="pill warn">suspended</span> : b.phone_verified && b.email_verified && b.terms ? <span className="pill ok">verified</span> : <span className="pill st-preview">incomplete</span>}
          {b.role !== "bidder" ? <> <span className="pill st-block">{b.role}</span></> : null}
          {b.id_checked ? <> <span className="pill">ID ✓</span></> : null}
        </td>
        <td className="n">{b.wins}{b.unpaid ? <span className="urgent"> ({b.unpaid} unpaid)</span> : null}</td>
        <td className="n"><button className="btn sm" type="button" onClick={() => setOpen(o => !o)}>{open ? "Close" : "Manage"}</button></td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={7} style={{ background: "var(--tint)" }}>
            <div className="stack" style={{ gap: 10 }}>
              <div className="inline-form">
                <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>Instagram @<input value={ig} onChange={e => setIg(e.target.value)} /></label>
                <button className="btn sm" type="button" disabled={pending} onClick={() => run(() => updateBidder(b.id, { instagram: ig, instagram_confirmed: true }))}>Save &amp; confirm handle</button>
                {b.instagram_confirmed ? <button className="btn sm" type="button" disabled={pending} onClick={() => run(() => updateBidder(b.id, { instagram_confirmed: false }))}>Unconfirm</button> : null}
              </div>
              <p className="fine">Only confirm a handle once you’ve checked it’s theirs (for example, they DM’d you from it). Confirmed handles credit Instagram bids to this paddle.</p>
              <div className="inline-form">
                <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>Set verified phone<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+971…" /></label>
                <button className="btn sm" type="button" disabled={pending || !phone} onClick={() => run(() => updateBidder(b.id, { phone }))}>Save as verified</button>
                <span className="fine">Use only if you’ve confirmed the number yourself.</span>
              </div>
              <label className="field">Staff notes (private)<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></label>
              <div className="inline-form">
                <button className="btn sm" type="button" disabled={pending} onClick={() => run(() => updateBidder(b.id, { notes }))}>Save notes</button>
                <button className="btn sm" type="button" disabled={pending} onClick={() => run(() => updateBidder(b.id, { id_checked: !b.id_checked }))}>{b.id_checked ? "Unmark ID checked" : "Mark ID checked"}</button>
                <button className={`btn sm${b.suspended ? "" : " danger"}`} type="button" disabled={pending} onClick={() => run(() => updateBidder(b.id, { suspended: !b.suspended }))}>{b.suspended ? "Unsuspend" : "Suspend"}</button>
                {canRole && b.role !== "admin" ? (
                  <select value={b.role} onChange={e => run(() => updateBidder(b.id, { role: e.target.value as "bidder" | "staff" }))} aria-label="Role">
                    <option value="bidder">Bidder</option>
                    <option value="staff">Staff (signs in with email code)</option>
                  </select>
                ) : null}
              </div>
              <Msg r={msg} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
