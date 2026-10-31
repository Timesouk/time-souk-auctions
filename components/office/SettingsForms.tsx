"use client";
// Back office › Settings: company and bank details, fees and terms, and the WhatsApp wording.
import { useMemo, useState } from "react";
import { Msg, useAction } from "@/components/admin/ui";
import { saveMessage, saveOfficeSettings } from "@/app/(admin)/admin/office/actions2";
import { PAY_METHODS, type MessageOverrides, type OfficeSettings } from "@/lib/office/types";

type Field = [keyof OfficeSettings, string, ("text" | "num" | "area" | "time")?, string?];

const GROUPS: [string, Field[]][] = [
  ["Company (printed on every invoice, statement and receipt)", [
    ["brand_name", "Name shown to customers", "text", "On invoices and in every WhatsApp message. Blank = the trading name."],
    ["trading_name", "Trading name"], ["legal_name", "Legal name"], ["licence", "Trade licence no."], ["trn", "VAT TRN"],
    ["address", "Address"], ["phone", "Phone / WhatsApp"], ["email", "Email"], ["instagram", "Instagram"], ["website", "Website"]
  ]],
  ["Bank (printed in How to pay)", [["bank_name", "Bank name"], ["bank_account", "Account name"], ["bank_iban", "IBAN"], ["bank_swift", "SWIFT / BIC"]]],
  ["Auction rules", [
    ["fee_pct", "Seller fee % (default)", "num", "Used when there's no fee scale (above)."], ["fee_fixed", "Seller fixed fee per sold lot (AED)", "num", "Added to the %, when there's no fee scale."], ["fee_min", "Minimum seller fee (AED)", "num", "Applies to the scale too."],
    ["vat_fee_pct", "VAT on seller fee %", "num"], ["vat_sales_pct", "VAT on buyer invoices %", "num"], ["hours_to_pay", "Hours to pay", "num"],
    ["pay_clock", "Payment clock starts at (auction day)", "time"], ["uae_fee", "Standard UAE delivery (AED)", "num"], ["cod_fee", "Cash on delivery charge (AED)", "num"],
    ["card_fee_pct", "Card payment fee %", "num"], ["cash_alert", "Cash payment alert (AED)", "num"], ["lot_target", "Lots per auction (target)", "num"],
    ["remind_gap_hours", "Remind again after (hours)", "num"]
  ]],
  ["Text on documents", [
    ["inv_note", "Line under the lots on invoices", "area"], ["inv_terms", "Invoice terms (small print)", "area"], ["seller_terms", "Seller declaration (statements)", "area"],
    ["intake_terms", "Intake receipt declaration", "area", "Placeholder wording: have a lawyer review it before relying on it."], ["slip_note", "Line at the bottom of sold slips", "area"]
  ]]
];

export function OfficeSettingsForm({ value }: { value: OfficeSettings }) {
  const init = () => {
    const o: Record<string, string> = {};
    for (const [, fields] of GROUPS) for (const [k] of fields) o[k] = String(value[k] ?? "");
    o.wa_lang = value.wa_lang;
    o.wa_mode = value.wa_mode;
    o.link_mode = value.link_mode;
    return o;
  };
  const [v, setV] = useState<Record<string, string>>(init);
  const [methods, setMethods] = useState<string[]>(value.card_fee_methods || []);
  const { pending, msg, run } = useAction();
  return (
    <form className="stack" style={{ gap: 16 }} onSubmit={e => { e.preventDefault(); run(() => saveOfficeSettings({ ...v, card_fee_methods: methods })); }}>
      {GROUPS.map(([title, fields]) => (
        <section key={title} className="panel-card">
          <span className="k">{title}</span>
          <div className="form-grid tight">
            {fields.map(([k, label, kind, help]) => (
              <label key={k} className={`field${kind === "area" ? " wide" : ""}`}>
                {label}
                {kind === "area" ? (
                  <textarea value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} rows={3} />
                ) : (
                  <input type={kind === "time" ? "time" : "text"} inputMode={kind === "num" ? "decimal" : undefined} value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} />
                )}
                {help ? <span className="fine">{help}</span> : null}
              </label>
            ))}
          </div>
        </section>
      ))}
      <section className="panel-card">
        <span className="k">WhatsApp and card links</span>
        <div className="form-grid tight">
          <label className="field">WhatsApp language
            <select value={v.wa_lang} onChange={e => setV({ ...v, wa_lang: e.target.value })}><option value="both">English + Arabic</option><option value="en">English</option><option value="ar">Arabic</option></select>
          </label>
          <label className="field">WhatsApp opens in
            <select value={v.wa_mode} onChange={e => setV({ ...v, wa_mode: e.target.value })}><option value="app">The WhatsApp app (phone or desktop)</option><option value="web">WhatsApp Web</option></select>
          </label>
          <label className="field">Card payment links
            <select value={v.link_mode} onChange={e => setV({ ...v, link_mode: e.target.value })}><option value="ask">Only when the buyer asks (reply LINK)</option><option value="always">In every message</option></select>
          </label>
        </div>
        <fieldset className="plain">
          <legend className="fine">The card fee applies to these payment methods (the amount received includes it):</legend>
          <div className="row">
            {[...new Set([...PAY_METHODS, ...methods])].map(m => (
              <label key={m} className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={methods.includes(m)} onChange={e => setMethods(e.target.checked ? [...methods, m] : methods.filter(x => x !== m))} /> {m}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="fine">UAE consumer-protection rules restrict passing card fees on to consumers. Check before charging it.</p>
      </section>
      <div className="row"><button className="btn pri" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button></div>
      <Msg r={msg} />
    </form>
  );
}

export function MessageEditor({ messages, overrides }: { messages: [string, string, string, string][]; overrides: MessageOverrides }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? messages.filter(([k, where, en, ar]) => `${k} ${where} ${en} ${ar} ${overrides[k]?.en || ""} ${overrides[k]?.ar || ""}`.toLowerCase().includes(t)) : messages;
  }, [q, messages, overrides]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <input className="grid-filter" placeholder="Find wording (e.g. reminder, IBAN, deposit)…" value={q} onChange={e => setQ(e.target.value)} aria-label="Find wording" />
      <p className="fine">Change any text, but keep the words in {"{curly brackets}"}: they&apos;re filled in automatically. *Stars* make text bold in WhatsApp. Clear both boxes and save to go back to the default.</p>
      {shown.map(([k, where, en, ar]) => <MessageRow key={k} k={k} where={where} defEn={en} defAr={ar} own={overrides[k]} />)}
    </div>
  );
}

function MessageRow({ k, where, defEn, defAr, own }: { k: string; where: string; defEn: string; defAr: string; own?: { en?: string | null; ar?: string | null } }) {
  const [en, setEn] = useState(own?.en || defEn);
  const [ar, setAr] = useState(own?.ar || defAr);
  const { pending, msg, run } = useAction();
  const changed = !!(own?.en || own?.ar);
  return (
    <div className="msg-row">
      <div className="msg-key">
        <span className="mono">{k}</span>
        <span className="fine">{where}{changed ? " · edited" : ""}</span>
      </div>
      <textarea value={en} onChange={e => setEn(e.target.value)} rows={2} aria-label={`${k} English`} />
      <textarea value={ar} onChange={e => setAr(e.target.value)} rows={2} dir="rtl" aria-label={`${k} Arabic`} />
      <div className="stack" style={{ gap: 4 }}>
        <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => saveMessage({ key: k, en: en === defEn ? "" : en, ar: ar === defAr ? "" : ar }))}>Save</button>
        {changed ? (
          <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => saveMessage({ key: k, en: "", ar: "" }), r => { if (r.ok) { setEn(defEn); setAr(defAr); } })}>Default</button>
        ) : null}
        {msg && !msg.ok ? <Msg r={msg} /> : msg?.ok ? <span className="fine ok-ink">Saved</span> : null}
      </div>
    </div>
  );
}
