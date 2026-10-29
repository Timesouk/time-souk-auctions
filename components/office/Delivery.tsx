"use client";
// Delivery for whole invoices: one invoice (its page or a list row), or every invoice ticked on a list.
import { useEffect, useState } from "react";
import { Msg, useAction } from "@/components/admin/ui";
import { setInvoiceDelivery } from "@/app/(admin)/admin/office/actions2";
import type { DeliveryStep } from "@/lib/office/delivery";

/** What a button needs to know about an invoice. `owe`: still to pay before handing over (0 for cash on delivery). */
export type DeliveryInv = { no: string; status: string; pickup: boolean; owe: number };

const money = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const doneLabel = (pickup: boolean) => (pickup ? "Collected" : "Delivered");
const isDone = (status: string) => status === "Delivered" || status === "Collected";

/** Handing over an unpaid order: ask first. */
function okToHandOver(list: DeliveryInv[], step: DeliveryStep) {
  if (step !== "Done" && step !== "With courier") return true;
  const due = list.filter(i => i.owe > 0.005);
  if (!due.length) return true;
  const lines = due.slice(0, 12).map(i => `${i.no}: AED ${money(i.owe)} still to pay`);
  if (due.length > 12) lines.push(`…and ${due.length - 12} more`);
  return window.confirm(`${lines.join("\n")}\n\n${step === "Done" ? "Mark as delivered" : "Hand to the courier"} anyway?`);
}

/** The panel on an invoice's page: every lot on it at once. */
export function InvoiceDelivery({ inv, courier: courier0, today }: { inv: DeliveryInv; courier: string; today: string }) {
  const { pending, msg, run } = useAction();
  const [date, setDate] = useState(today);
  const [courier, setCourier] = useState(courier0);
  const go = (step: DeliveryStep) => {
    if (!okToHandOver([inv], step)) return;
    run(() => setInvoiceDelivery({ nos: [inv.no], step, date, courier: courier !== courier0 ? courier : undefined }));
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="k">Delivery · {inv.status}</span>
      <p className="fine">Sets every lot on this invoice at once. One lot on its own: Lots › After the sale.</p>
      <div className="inline-form">
        <label className="k">{inv.pickup ? "Collected on" : "Sent / delivered on"}</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        {!inv.pickup ? <input placeholder="Courier / AWB" value={courier} onChange={e => setCourier(e.target.value)} aria-label="Courier or AWB" /> : null}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {inv.status !== "Packed" && !isDone(inv.status) ? <button type="button" className="btn sm" disabled={pending} onClick={() => go("Packed")}>Packed</button> : null}
        {!inv.pickup && inv.status !== "With courier" && !isDone(inv.status) ? <button type="button" className="btn sm" disabled={pending} onClick={() => go("With courier")}>With courier</button> : null}
        {!isDone(inv.status) ? <button type="button" className="btn sm pri" disabled={pending} onClick={() => go("Done")}>{pending ? "Saving…" : `Mark ${doneLabel(inv.pickup).toLowerCase()}`}</button> : null}
        {inv.status !== "Not sent" ? <button type="button" className="btn sm" disabled={pending} onClick={() => go("")}>Undo: not sent yet</button> : null}
      </div>
      <Msg r={msg} />
    </div>
  );
}

/** One small button on a list row: Delivered (or Collected). */
export function RowDelivered({ inv }: { inv: DeliveryInv }) {
  const { pending, msg, run } = useAction();
  if (isDone(inv.status)) return null;
  return (
    <>
      <button
        type="button"
        className="btn sm"
        disabled={pending}
        title={`Mark every lot on ${inv.no} ${doneLabel(inv.pickup).toLowerCase()}`}
        onClick={() => okToHandOver([inv], "Done") && run(() => setInvoiceDelivery({ nos: [inv.no], step: "Done" }))}
      >
        {pending ? "…" : doneLabel(inv.pickup)}
      </button>
      {msg && !msg.ok ? <Msg r={msg} /> : null}
    </>
  );
}

const boxes = (formId: string) => Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"][name="no"]`));

/** The tick box in a list's header: tick or untick every row. */
export function TickAll({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Tick every invoice"
      onChange={e => {
        for (const b of boxes(formId)) b.checked = e.target.checked;
        document.dispatchEvent(new Event("delivery-ticks"));
      }}
    />
  );
}

/** One row's tick box (rendered by the page; belongs to the bar's form). */
export function Tick({ formId, no }: { formId: string; no: string }) {
  return <input type="checkbox" form={formId} name="no" value={no} aria-label={`Tick ${no}`} onChange={() => document.dispatchEvent(new Event("delivery-ticks"))} />;
}

/** The bar above a list: mark every ticked invoice in one go. */
export function BulkDelivery({ formId, rows }: { formId: string; rows: DeliveryInv[] }) {
  const { pending, msg, run } = useAction();
  const [ticked, setTicked] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setTicked(boxes(formId).filter(b => b.checked).map(b => b.value));
    document.addEventListener("delivery-ticks", read);
    read();
    return () => document.removeEventListener("delivery-ticks", read);
  }, [formId]);
  const picked = rows.filter(r => ticked.includes(r.no));
  const allPickup = picked.length > 0 && picked.every(r => r.pickup);
  const anyPickup = picked.some(r => r.pickup);
  const go = (step: DeliveryStep) => {
    if (!picked.length || !okToHandOver(picked, step)) return;
    run(
      () => setInvoiceDelivery({ nos: picked.map(r => r.no), step }),
      r => {
        if (!r.ok) return;
        for (const b of boxes(formId)) b.checked = false;
        setTicked([]);
      }
    );
  };
  return (
    <form id={formId} className="no-print stack" style={{ gap: 6 }} onSubmit={e => e.preventDefault()}>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <span className="fine">{picked.length ? `${picked.length} ticked:` : "Tick invoices to mark them together:"}</span>
        <button type="button" className="btn sm" disabled={pending || !picked.length} onClick={() => go("Packed")}>Packed</button>
        <button type="button" className="btn sm" disabled={pending || !picked.length || allPickup} onClick={() => go("With courier")}>With courier</button>
        <button type="button" className="btn sm pri" disabled={pending || !picked.length} onClick={() => go("Done")}>
          {pending ? "Saving…" : allPickup ? "Collected" : anyPickup ? "Delivered / collected" : "Delivered"}
        </button>
      </div>
      <Msg r={msg} />
    </form>
  );
}
