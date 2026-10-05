"use client";
import { useState } from "react";
import { Msg, useAction } from "./ui";
import { TimerPicker } from "./TimerPicker";
import { registerWebhooks, saveSettings, sendTestEmail, setConsignmentStatus } from "@/app/(admin)/admin/actions";

type S = { seller_fee: number; pay_days: number; timer_seconds: number; lot_target: number; cod_fee: number; whatsapp: string; instagram: string; contact_email: string; bank_details: string };

export function SettingsForm({ initial }: { initial: S }) {
  const [s, setS] = useState(initial);
  const { pending, msg, run } = useAction();
  const n = (k: keyof S) => ({ value: String(s[k]), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS({ ...s, [k]: typeof initial[k] === "number" ? Number(e.target.value) : e.target.value }) });
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); run(() => saveSettings(s)); }}>
      <div className="form-grid">
        <label className="field">Seller fee %<input inputMode="decimal" {...n("seller_fee")} /></label>
        <label className="field">Working days to pay<input inputMode="numeric" {...n("pay_days")} /></label>
        <div className="field" role="group" aria-label="Default timer per lot">Default timer per lot
          <TimerPicker label="Default timer per lot" value={s.timer_seconds} onChange={v => v && setS({ ...s, timer_seconds: v })} />
          <span className="fine">Each auction can use its own timer (Auctions → the auction).</span>
        </div>
        <label className="field">Weekly lot target<input inputMode="numeric" {...n("lot_target")} /></label>
        <label className="field">Cash on delivery charge (AED)<input inputMode="numeric" {...n("cod_fee")} /><span className="fine">Added to the bill when a buyer chooses cash on delivery (UAE deliveries only).</span></label>
        <label className="field">WhatsApp number (shown to bidders)<input type="tel" placeholder="+971 5X XXX XXXX" {...n("whatsapp")} /></label>
        <label className="field">Instagram handle<input placeholder="thetimesouk" {...n("instagram")} /></label>
        <label className="field">Contact email<input type="email" {...n("contact_email")} /></label>
        <label className="field wide">Bank transfer details (shown only on winners’ invoices)<textarea rows={4} placeholder={"Account name\nBank\nIBAN AE…"} value={s.bank_details} onChange={e => setS({ ...s, bank_details: e.target.value })} /></label>
      </div>
      <p className="fine">No buyer’s premium: buyers pay the hammer price. The seller fee applies to consigned lots and can be changed per lot.</p>
      <div className="row"><button className="btn pri" type="submit" disabled={pending}>Save settings</button></div>
      <Msg r={msg} />
    </form>
  );
}

export function Connections() {
  const { pending, msg, run } = useAction();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <button className="btn" type="button" disabled={pending} onClick={() => run(() => registerWebhooks())}>Register payment webhooks</button>
        <button className="btn" type="button" disabled={pending} onClick={() => run(() => sendTestEmail())}>Send me a test email</button>
      </div>
      <Msg r={msg} />
    </div>
  );
}

export function ConsignmentStatus({ id, status }: { id: string; status: string }) {
  const { pending, run } = useAction();
  return (
    <select value={status} disabled={pending} onChange={e => run(() => setConsignmentStatus(id, e.target.value as "new"))} aria-label="Status">
      {["new", "contacted", "accepted", "declined", "listed"].map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
