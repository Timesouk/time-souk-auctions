"use client";
import { useState } from "react";
import { ConfirmButton, Msg, useAction } from "./ui";
import { linkInvoiceBidder, markInvoicePaid, resendInvoice, setPayout, voidInvoice } from "@/app/(admin)/admin/actions";
import { dateShort, money, pad2, waLink } from "@/lib/format";

export type InvoiceCardData = {
  id: string; number: string; amount: number; due_date: string; status: string; method: string | null; paid_at: string | null;
  notified_at: string | null; notify_error: string | null; transfer_claimed_at: string | null; payout_paid_at: string | null;
  ig_handle: string | null; payUrl: string; overdue: boolean;
  lot: { lot_number: number; brand: string; model: string };
  buyer: { paddle: number; full_name: string; email: string; phone: string | null } | null;
  source: string | null; consignor: string; fee: number; payout: number; income: number;
  payments: { provider: string; status: string; created_at: string }[];
};

export function InvoiceCard({ i }: { i: InvoiceCardData }) {
  const { pending, msg, run } = useAction();
  const [paddle, setPaddle] = useState("");
  const [method, setMethod] = useState<"bank" | "cash" | "card" | "tabby" | "tamara">("bank");
  const title = `Lot ${pad2(i.lot.lot_number)} · ${i.lot.brand} ${i.lot.model}`;
  const waText = `Hello${i.buyer ? " " + i.buyer.full_name.split(" ")[0] : ""}, congratulations on winning ${title} at The Time Souk. Amount due: ${money(i.amount)} (no buyer’s premium). Please pay by ${dateShort(i.due_date)}: ${i.payUrl}`;
  const wa = i.buyer?.phone ? waLink(i.buyer.phone, waText) : "";
  const state = i.status === "paid" ? `Paid · ${i.method || ""} · ${i.paid_at ? dateShort(i.paid_at) : ""}` : i.overdue ? "Overdue" : i.transfer_claimed_at ? "Buyer says transfer sent" : i.notified_at ? `Link sent ${dateShort(i.notified_at)}` : "Link not sent";
  return (
    <article className={`inv${i.status === "paid" ? " paid" : i.overdue ? " overdue" : ""}`}>
      <div className="inv-top">
        <div><span className="k">{i.number}</span><b>{title}</b></div>
        <div className="inv-amt">{money(i.amount)}</div>
      </div>
      <div style={{ fontSize: 14 }}>
        {i.buyer ? (
          <>Paddle {i.buyer.paddle} · <b>{i.buyer.full_name}</b> · <span className="mono">{i.buyer.phone || "no phone"}</span> · {i.buyer.email}</>
        ) : (
          <span className="urgent">Instagram winner @{i.ig_handle}, not registered. Ask them on Instagram to register on the website, then link their paddle below.</span>
        )}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className={`pill ${i.status === "paid" ? "ok" : i.overdue ? "warn" : ""}`}>{state}</span>
        <span className="fine">Due {dateShort(i.due_date)}</span>
        {i.notify_error && i.notify_error !== "sending" && i.status !== "paid" ? <span className="fine urgent">{i.notify_error}</span> : null}
      </div>
      {i.payments.length ? <p className="fine">Attempts: {i.payments.map(p => `${p.provider} ${p.status}`).join(" · ")}</p> : null}
      {i.source === "consign" ? (
        <p className="fine">Consigned{i.consignor ? ` by ${i.consignor}` : ""}: pay out {money(i.payout)} after the buyer pays (seller fee {money(i.fee)}). {i.payout_paid_at ? `Paid out ${dateShort(i.payout_paid_at)}.` : ""}</p>
      ) : i.source === "stock" ? <p className="fine">Own stock · margin {money(i.income)}</p> : null}
      {i.status !== "paid" && i.status !== "void" ? (
        <div className="inline-form">
          {i.buyer ? <button className="btn sm" type="button" disabled={pending} onClick={() => run(() => resendInvoice(i.id))}>Resend email &amp; WhatsApp</button> : null}
          {wa ? <a className="btn sm" href={wa} target="_blank" rel="noopener">WhatsApp from my phone</a> : null}
          <button className="btn sm" type="button" onClick={() => navigator.clipboard?.writeText(i.payUrl)}>Copy pay link</button>
          <select value={method} onChange={e => setMethod(e.target.value as typeof method)} aria-label="Paid by">
            <option value="bank">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="tabby">Tabby</option><option value="tamara">Tamara</option>
          </select>
          <ConfirmButton label="Mark paid" confirm={`Confirm ${money(i.amount)} received?`} onConfirm={() => run(() => markInvoicePaid(i.id, method))} />
          <ConfirmButton className="btn sm danger" label="Cancel invoice" confirm="Cancel this sale?" onConfirm={() => run(() => voidInvoice(i.id, "Cancelled by staff"))} />
        </div>
      ) : null}
      {!i.buyer && i.status !== "paid" && i.status !== "void" ? (
        <div className="inline-form">
          <input value={paddle} onChange={e => setPaddle(e.target.value.replace(/\D/g, ""))} placeholder="Paddle no." inputMode="numeric" />
          <button className="btn sm pri" type="button" disabled={pending || !paddle} onClick={() => run(() => linkInvoiceBidder(i.id, Number(paddle)))}>Link &amp; send payment link</button>
        </div>
      ) : null}
      {i.status === "paid" && i.source === "consign" ? (
        <div className="inline-form">
          <button className="btn sm" type="button" disabled={pending} onClick={() => run(() => setPayout(i.id, !i.payout_paid_at))}>{i.payout_paid_at ? "Unmark payout" : "Mark consignor paid"}</button>
        </div>
      ) : null}
      <Msg r={msg} />
    </article>
  );
}
