// What pages need for one invoice: its WhatsApp messages and links (server only: the links are signed).
import { invoiceUrl } from "./links";
import { Wording, invoiceMessage, langCode, reminderMessage } from "./messages";
import type { InvoiceView, Office } from "./engine";

/** A card link already sent for this invoice and amount that hasn't been paid or expired. */
export function openCardLink(o: Office, inv: InvoiceView) {
  const now = o.data.now;
  const hit = o.data.cards
    .filter(c => c.kind === "Invoice" && c.invoice_no === inv.no && Math.abs(c.card_amount - inv.cardAmount) < 0.01)
    .filter(c => !/paid|expired|failed|cancel/i.test(c.status) && (!c.expires_at || Date.parse(c.expires_at) > now))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return hit?.url || "";
}

export function invoiceMessages(o: Office, inv: InvoiceView) {
  const w = new Wording(o.data.settings, o.data.messages);
  const code = langCode(inv.lang);
  const url = invoiceUrl(inv.no, code === "AR" ? "ar" : "en");
  const link = openCardLink(o, inv);
  return {
    url,
    code,
    invoice: invoiceMessage(w, inv, { url, link, code }),
    reminder: reminderMessage(w, inv, o.data.now, { link, code })
  };
}

/** Hours since the last reminder, or null. */
export const hoursSince = (iso: string | null, now: number) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 3600e3)) : null);
