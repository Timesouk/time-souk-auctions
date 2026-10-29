// The filters on the Invoices page (All, Unpaid, Overdue…), shared with "Print all invoices" so both list the same invoices.
import type { InvoiceView } from "./engine";
import { COD } from "./types";

export const INVOICE_SHOWS: [string, string][] = [
  ["", "All"],
  ["unpaid", "Unpaid"],
  ["overdue", "Overdue"],
  ["unsent", "Not sent"],
  ["fee", "Need delivery fee"],
  ["ready", "Ready to ship"],
  ["refund", "Refund due"]
];

/** A known filter key, or "" (all) for anything else. */
export const invoiceShow = (v: string | undefined) => (INVOICE_SHOWS.some(([k]) => k === v) ? v || "" : "");

export function showInvoice(show: string, i: InvoiceView): boolean {
  switch (show) {
    case "unpaid": return i.balance > 0 && i.paysBy !== COD;
    case "overdue": return (i.hoursOverdue || 0) > 0;
    case "unsent": return !i.sentAt;
    case "fee": return i.feeMissing;
    case "ready": return /^Ready/.test(i.nextStep);
    case "refund": return i.balance < -0.005;
    default: return true;
  }
}

/** Invoices in print order: by invoice number (TS001-B0002 before TS001-B0010). */
export const byInvoiceNo = (x: InvoiceView, y: InvoiceView) => x.no.localeCompare(y.no, "en", { numeric: true });
