"use client";
// Back office forms: a payment / deposit / refund, an invoice's adjustments, a buyer.
import { useState } from "react";
import { ConfirmButton, Msg, useAction } from "@/components/admin/ui";
import {
  deleteEntry, recordEntry, saveAdjustment, saveCustomer,
  type AdjustmentInput, type CustomerInput, type EntryInput
} from "@/app/(admin)/admin/office/actions";
import { COUNTRIES, DIRECT, PAY_METHODS, type MessageOverrides, type OfficeSettings } from "@/lib/office/types";
import { Wording, depositMessage, paidMessage, refundMessage, type Code } from "@/lib/office/messages";
import { r2 } from "@/lib/office/engine";
import { WaButton } from "./Wa";

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);

export type BuyerOption = { id: string; label: string };

/** After saving, offer the WhatsApp confirmation (payment received, deposit received, refund made). */
export type Confirm = {
  phone: string; mode: "app" | "web"; name: string; ref: string; code: Code; invoice: string; balanceBefore: number; settings: OfficeSettings; overrides: MessageOverrides;
} | null;

function confirmText(c: NonNullable<Confirm>, kind: EntryInput["kind"], amount: number, method: string) {
  const w = new Wording(c.settings, c.overrides);
  if (kind === "Deposit") return depositMessage(w, c.code, c.name, amount);
  if (kind === "Refund") return refundMessage(w, c.code, c.name, c.invoice, amount, method);
  const rate = (c.settings.card_fee_pct || 0) / 100;
  const fee = (c.settings.card_fee_methods || []).some(m => m.toLowerCase() === method.toLowerCase()) ? r2((amount * rate) / (1 + rate)) : 0;
  return paidMessage(w, c.code, c.name, c.invoice, amount, r2(c.balanceBefore - amount + fee));
}

export function EntryForm({
  kind, buyers, customerId, invoiceNo, amount, method, lockBuyer, confirm, title, methods, sellers
}: {
  kind: EntryInput["kind"];
  buyers?: BuyerOption[];
  customerId?: string;
  invoiceNo?: string;
  amount?: number;
  method?: string;
  lockBuyer?: boolean;
  confirm?: Confirm;
  title?: string;
  methods?: readonly string[];
  /** Consignors the buyer might have paid directly (payments only): adds "Paid to seller directly". */
  sellers?: { id: string; label: string }[];
}) {
  const direct = kind === "Payment" && !!sellers?.length;
  const list = [...(methods || PAY_METHODS), ...(direct ? [DIRECT] : [])];
  const init = (): EntryInput => ({
    kind, customer_id: customerId || "", invoice_no: invoiceNo || "", method: method || "Bank transfer", amount: amount && amount > 0 ? String(amount) : "",
    entry_date: today(), reference: "", received_by: "", notes: "", paid_to_seller_id: sellers?.length === 1 ? sellers[0].id : ""
  });
  const [v, setV] = useState<EntryInput>(init);
  const [done, setDone] = useState<{ amount: number; method: string } | null>(null);
  const { pending, msg, run } = useAction();
  const f = (k: keyof EntryInput) => ({ value: v[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });
  const label = kind === "Deposit" ? "Record deposit" : kind === "Refund" ? "Record refund" : "Record payment";
  return (
    <form
      className="stack"
      style={{ gap: 10 }}
      onSubmit={e => {
        e.preventDefault();
        const sent = { amount: Number(String(v.amount).replace(/[^\d.]/g, "")) || 0, method: v.method };
        run(() => recordEntry(v), r => {
          if (r.ok) {
            setDone(sent);
            setV(init());
          }
        });
      }}
    >
      {title ? <span className="k">{title}</span> : null}
      <div className="form-grid tight">
        {!lockBuyer && buyers ? (
          <label className="field wide">Buyer
            <select required {...f("customer_id")}>
              <option value="">Choose…</option>
              {buyers.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
        ) : null}
        {kind === "Payment" && !invoiceNo ? <label className="field">Invoice no.<input placeholder="TS002-B0044" {...f("invoice_no")} /></label> : null}
        <label className="field">Amount (AED)<input required inputMode="decimal" {...f("amount")} /></label>
        <label className="field">{kind === "Refund" ? "Paid back by" : "Method"}
          <select {...f("method")}>{list.map(m => <option key={m}>{m}</option>)}</select>
        </label>
        {direct && v.method === DIRECT ? (
          <label className="field">Seller the buyer paid
            <select required {...f("paid_to_seller_id")}>
              <option value="">Choose…</option>
              {sellers!.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        ) : null}
        <label className="field">Date<input type="date" {...f("entry_date")} /></label>
        <label className="field">Reference / receipt<input {...f("reference")} /></label>
        <label className="field">Notes<input {...f("notes")} /></label>
      </div>
      {kind === "Payment" && /card/i.test(v.method) ? <p className="fine">Card link payments: type the full amount received. The card fee inside it is split out automatically.</p> : null}
      {v.method === DIRECT ? (
        <p className="fine">
          The buyer paid the consignor straight to their account. It counts as paid on this invoice, and comes off what we owe the seller when you settle with them on their page.
          If it&apos;s more than the seller&apos;s net, they owe us the difference (our fee).
        </p>
      ) : null}
      <div className="row">
        <button className="btn pri" disabled={pending}>{pending ? "Saving…" : label}</button>
        {done && confirm && done.method !== DIRECT ? (
          <WaButton
            label="Send confirmation on WhatsApp"
            className="btn"
            phone={confirm.phone}
            mode={confirm.mode}
            text={confirmText(confirm, kind, done.amount, done.method)}
            log={{ ref: confirm.ref, name: confirm.name, total: done.amount, balance: null, kind: kind === "Deposit" ? "Deposit received" : kind === "Refund" ? "Refund" : "Payment received", link: "" }}
          />
        ) : null}
      </div>
      <Msg r={msg} />
    </form>
  );
}

export function DeleteEntry({ id }: { id: string }) {
  const { pending, msg, run } = useAction();
  return (
    <>
      <ConfirmButton label="Remove" confirm="Remove this row?" className="btn sm danger" disabled={pending} onConfirm={() => run(() => deleteEntry(id))} />
      {msg && !msg.ok ? <Msg r={msg} /> : null}
    </>
  );
}

export function AdjustmentForm({ value }: { value: AdjustmentInput }) {
  const [v, setV] = useState<AdjustmentInput>(value);
  const { pending, msg, run } = useAction();
  const f = (k: keyof AdjustmentInput) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form
      className="stack"
      style={{ gap: 10 }}
      onSubmit={e => {
        e.preventDefault();
        run(() => saveAdjustment(v));
      }}
    >
      <span className="k">Adjust this invoice</span>
      <div className="form-grid tight">
        <label className="field">Delivery
          <select {...f("delivery")}><option value="">Buyer&apos;s usual</option><option>Courier</option><option>Pickup</option></select>
        </label>
        <label className="field">Pays by
          <select {...f("pays_by")}><option value="">Buyer&apos;s usual</option>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="field">Delivery fee (AED)<input inputMode="decimal" placeholder="UAE: standard" {...f("delivery_fee")} /></label>
        <label className="field">Discount (AED)<input inputMode="decimal" {...f("discount")} /></label>
        <label className="field">Extra charge (AED)<input inputMode="decimal" {...f("extra")} /></label>
        <label className="field">Extra charge label<input placeholder="Other charges" {...f("extra_label")} /></label>
        <label className="field wide">Note printed on the invoice<input {...f("note")} /></label>
      </div>
      <p className="fine">Overseas delivery: type the fee here. UAE courier delivery uses the standard fee automatically.</p>
      <div className="row"><button className="btn" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
      <Msg r={msg} />
    </form>
  );
}

export const blankCustomer = (): CustomerInput => ({
  instagram: "", full_name: "", phone: "", email: "", address: "", area: "", country: "", delivery: "", usual_pay: "", id_checked: false, flag: "OK", notes: "", lang: ""
});

export function CustomerForm({ value, onSaved }: { value: CustomerInput; onSaved?: (code: string) => void }) {
  const [v, setV] = useState<CustomerInput>(value);
  const { pending, msg, run } = useAction();
  const f = (k: keyof CustomerInput) => ({ value: v[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form
      className="stack"
      style={{ gap: 10 }}
      onSubmit={e => {
        e.preventDefault();
        run(() => saveCustomer(v), r => {
          if (r.ok && !v.id) {
            setV(blankCustomer());
            if (r.id) onSaved?.(r.id);
          }
        });
      }}
    >
      <div className="form-grid tight">
        <label className="field">Instagram handle<input placeholder="@handle" {...f("instagram")} /></label>
        <label className="field">Full name<input {...f("full_name")} /></label>
        <label className="field">WhatsApp number<input inputMode="tel" placeholder="+971 50 123 4567" {...f("phone")} /></label>
        <label className="field">Email<input type="email" {...f("email")} /></label>
        <label className="field wide">Delivery address<input {...f("address")} /></label>
        <label className="field">Area / city<input {...f("area")} /></label>
        <label className="field">Country
          <select {...f("country")}><option value="">United Arab Emirates</option>{COUNTRIES.filter(c => c !== "United Arab Emirates").map(c => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="field">Delivery
          <select {...f("delivery")}><option value="">Courier</option><option>Pickup</option></select>
        </label>
        <label className="field">Usually pays by
          <select {...f("usual_pay")}><option value="">Bank transfer</option>{PAY_METHODS.filter(m => m !== "Bank transfer").map(m => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="field">WhatsApp language
          <select {...f("lang")}><option value="">As in Settings</option><option value="both">English + Arabic</option><option value="en">English</option><option value="ar">Arabic</option></select>
        </label>
        <label className="field">Flag
          <select {...f("flag")}><option>OK</option><option>Watch</option><option>Blocked</option></select>
        </label>
        <label className="field check"><input type="checkbox" checked={v.id_checked} onChange={e => setV({ ...v, id_checked: e.target.checked })} /> ID checked</label>
        <label className="field wide">Notes<input {...f("notes")} /></label>
      </div>
      <div className="row"><button className="btn pri" disabled={pending}>{pending ? "Saving…" : v.id ? "Save buyer" : "Add buyer"}</button></div>
      <Msg r={msg} />
    </form>
  );
}

export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return <button type="button" className="btn" onClick={() => window.print()}>{label}</button>;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); })}>
      {done ? "Copied" : label}
    </button>
  );
}
