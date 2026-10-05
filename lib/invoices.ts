// Winners' invoices: telling the buyer, reminding them, and recording payment. Server only.
import { adminClient } from "./supabase/admin";
import { SITE_URL } from "./env";
import { emailHtml, emailReady, sendEmail, staffEmails } from "./notify/email";
import { sendWhatsAppTemplate, whatsappReady } from "./notify/twilio";
import { dateLong, money, pad2 } from "./format";
import type { Invoice, Locale } from "./types";

export type InvoiceCtx = {
  invoice: Invoice;
  lot: { id: string; lot_number: number; brand: string; model: string; reference: string; photos: string[]; case_material: string; bracelet: string; dial_colour: string; bezel: string; shape: string; hands: string };
  auction: { id: string; number: number; sale_date: string };
  buyer: { id: string; full_name: string; email: string; phone: string | null; lang: Locale; paddle: number; created_at: string; address: string; city: string } | null;
  lang: Locale;
  payUrl: string;
  /** The cash on delivery charge from Settings (what COD would add to this invoice). */
  codFee: number;
};

/** What the buyer pays: the winning bid, plus the cash on delivery charge if they chose it. */
export const invoiceTotal = (i: Pick<Invoice, "amount" | "cod_fee" | "cod_requested_at">) => i.amount + (i.cod_requested_at ? i.cod_fee || 0 : 0);

export const payUrl = (lang: Locale, token: string) => `${SITE_URL}/${lang}/pay/${token}`;
export const lotTitle = (lot: { lot_number: number; brand: string; model: string }, lang: Locale) =>
  `${lang === "ar" ? "القطعة" : "Lot"} ${pad2(lot.lot_number)} · ${lot.brand} ${lot.model}`;

export async function invoiceContext(by: { id?: string; token?: string }): Promise<InvoiceCtx | null> {
  const db = adminClient();
  let q = db.from("invoices").select("*");
  q = by.id ? q.eq("id", by.id) : q.eq("pay_token", by.token || "-");
  const { data: invoice } = await q.maybeSingle();
  if (!invoice) return null;
  const [{ data: lot }, { data: auction }, { data: buyer }, { data: settings }] = await Promise.all([
    db.from("lots").select("id,lot_number,brand,model,reference,photos,case_material,bracelet,dial_colour,bezel,shape,hands").eq("id", invoice.lot_id).single(),
    db.from("auctions").select("id,number,sale_date").eq("id", invoice.auction_id).single(),
    invoice.bidder_id
      ? db.from("profiles").select("id,full_name,email,phone,lang,paddle,created_at,address,city").eq("id", invoice.bidder_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("settings").select("*").eq("id", 1).maybeSingle()
  ]);
  if (!lot || !auction) return null;
  const lang: Locale = buyer?.lang === "ar" ? "ar" : "en";
  const codFee = Number((settings as { cod_fee?: number } | null)?.cod_fee ?? 10);
  return { invoice: invoice as Invoice, lot, auction, buyer: buyer as InvoiceCtx["buyer"], lang, payUrl: payUrl(lang, invoice.pay_token), codFee };
}

const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

function wonCopy(c: InvoiceCtx, reminder = false) {
  const lang = c.lang;
  const title = lotTitle(c.lot, lang);
  const amount = money(c.invoice.amount, lang);
  const due = dateLong(c.invoice.due_date, lang);
  const name = firstName(c.buyer?.full_name || "");
  const fee = money(c.codFee, lang);
  const waysEn = c.codFee
    ? `Pay by card, Tabby, Tamara or bank transfer, or choose cash on delivery (${fee} added).`
    : "Pay by card, Tabby, Tamara or bank transfer, or choose cash on delivery.";
  const waysAr = c.codFee
    ? `يمكنك الدفع بالبطاقة أو تابي أو تمارا أو التحويل البنكي، أو اختيار الدفع عند الاستلام (تُضاف ${fee}).`
    : "يمكنك الدفع بالبطاقة أو تابي أو تمارا أو التحويل البنكي، أو اختيار الدفع عند الاستلام.";
  if (lang === "ar") {
    return {
      subject: reminder ? `تذكير: ادفع قبل ${due} · ${title}` : `مبروك! فزت بـ ${title}`,
      heading: reminder ? "تذكير بالدفع" : `مبروك${name ? " يا " + name : ""}!`,
      blocks: reminder
        ? [`فاتورتك ${c.invoice.number} لـ ${title} بقيمة ${amount} مستحقة ${due}.`, waysAr]
        : [`فزت بـ ${title} في المزاد رقم ${pad2(c.auction.number)}.`, `المبلغ المستحق: ${amount} (بدون عمولة على المشتري).`, `يرجى الدفع قبل ${due}. ${waysAr}`],
      button: "ادفع الآن",
      footer: `تايم سوق، دبي · الفاتورة ${c.invoice.number}`
    };
  }
  return {
    subject: reminder ? `Reminder: please pay by ${due} · ${title}` : `You won ${title}`,
    heading: reminder ? "Payment reminder" : `Congratulations${name ? ", " + name : ""}!`,
    blocks: reminder
      ? [`Your invoice ${c.invoice.number} for ${title} (${amount}) is due ${due}.`, waysEn]
      : [`You won ${title} in Auction Nº ${pad2(c.auction.number)}.`, `Amount due: ${amount} (no buyer’s premium).`, `Please pay by ${due}. ${waysEn}`],
    button: "Pay now",
    footer: `The Time Souk, Dubai · Invoice ${c.invoice.number}`
  };
}

function templateSid(kind: "INVOICE" | "REMINDER", lang: Locale) {
  return (lang === "ar" && process.env[`TWILIO_WA_TEMPLATE_${kind}_AR`]) || process.env[`TWILIO_WA_TEMPLATE_${kind}`] || "";
}

async function deliver(c: InvoiceCtx, reminder: boolean) {
  const errors: string[] = [];
  let sent = 0;
  if (!c.buyer) return { sent, errors: ["No registered bidder linked to this invoice"] };
  const copy = wonCopy(c, reminder);
  if (c.buyer.email && emailReady()) {
    const r = await sendEmail({
      to: c.buyer.email,
      subject: copy.subject,
      text: `${copy.heading}\n\n${copy.blocks.join("\n")}\n\n${copy.button}: ${c.payUrl}`,
      html: emailHtml({ lang: c.lang, heading: copy.heading, blocks: copy.blocks, button: { label: copy.button, href: c.payUrl }, footer: copy.footer })
    });
    if (r.ok) sent++;
    else errors.push(`Email: ${r.error}`);
  } else errors.push("Email not configured");
  const sid = templateSid(reminder ? "REMINDER" : "INVOICE", c.lang);
  if (c.buyer.phone && whatsappReady() && sid) {
    const r = await sendWhatsAppTemplate(c.buyer.phone, sid, {
      "1": firstName(c.buyer.full_name) || (c.lang === "ar" ? "عميلنا" : "there"),
      "2": lotTitle(c.lot, c.lang),
      "3": money(c.invoice.amount, c.lang),
      "4": dateLong(c.invoice.due_date, c.lang),
      "5": c.payUrl
    });
    if (r.ok) sent++;
    else errors.push(`WhatsApp: ${r.error}`);
  } else if (!sid) errors.push("WhatsApp template not set");
  return { sent, errors };
}

/** Emails and WhatsApps the winner their payment link. Records the outcome on the invoice. */
export async function notifyInvoice(invoiceId: string, opts: { force?: boolean } = {}) {
  const c = await invoiceContext({ id: invoiceId });
  if (!c || c.invoice.status === "void" || c.invoice.status === "paid") return { sent: 0, errors: ["Invoice not payable"] };
  if (!opts.force) {
    // Claim the send so the console and the every-minute job never both message the winner.
    const stale = new Date(Date.now() - 2 * 60e3).toISOString();
    const { data: claimed } = await adminClient()
      .from("invoices")
      .update({ notify_error: "sending", updated_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .is("notified_at", null)
      .or(`notify_error.is.null,notify_error.neq.sending,updated_at.lt."${stale}"`)
      .select("id")
      .maybeSingle();
    if (!claimed) return { sent: 0, errors: ["Already sent or sending"] };
  }
  const r = await deliver(c, false);
  await adminClient().from("invoices").update({
    notified_at: r.sent ? new Date().toISOString() : c.invoice.notified_at,
    notify_error: r.errors.length ? r.errors.join(" · ").slice(0, 500) : null,
    updated_at: new Date().toISOString()
  }).eq("id", invoiceId);
  return r;
}

export type SendResult = {
  ok: boolean;
  error?: string;
  invoice: string | null;
  number: string;
  alreadySent: boolean;
  registered: boolean;
  ig: string | null;
  sent: { sent: number; errors: string[] } | null;
};

/**
 * "Send invoice" (live console and Winners & payments): creates the winner's invoice once, then emails and
 * WhatsApps the payment link. Nothing creates or sends an invoice until staff press it.
 */
export async function createAndSendInvoice(lotId: string): Promise<SendResult> {
  const db = adminClient();
  const { data: invoiceId, error } = await db.rpc("finalize_lot", { p_lot_id: lotId });
  if (error) return { ok: false, error: error.message, invoice: null, number: "", alreadySent: false, registered: false, ig: null, sent: null };
  if (!invoiceId) return { ok: true, invoice: null, number: "", alreadySent: false, registered: false, ig: null, sent: null };
  const { data: inv } = await db.from("invoices").select("number, notified_at, bidder_id, ig_handle").eq("id", invoiceId).single();
  let sent = null;
  if (inv && !inv.notified_at && inv.bidder_id) sent = await notifyInvoice(invoiceId as string);
  return {
    ok: true,
    invoice: invoiceId as string,
    number: inv?.number || "",
    alreadySent: !!inv?.notified_at,
    registered: !!inv?.bidder_id,
    ig: inv?.ig_handle || null,
    sent
  };
}

export async function remindInvoice(invoiceId: string) {
  const c = await invoiceContext({ id: invoiceId });
  if (!c || c.invoice.status !== "unpaid") return { sent: 0, errors: ["Invoice not unpaid"] };
  const r = await deliver(c, true);
  if (r.sent) await adminClient().from("invoices").update({ reminded_at: new Date().toISOString() }).eq("id", invoiceId);
  return r;
}

/** Marks an invoice paid once (safe to call repeatedly) and sends the receipt. */
export async function markPaid(invoiceId: string, method: NonNullable<Invoice["method"]>, by?: string) {
  const now = new Date().toISOString();
  // Paid online or by transfer: the cash on delivery charge no longer applies.
  const dropCod = method === "card" || method === "tabby" || method === "tamara" || method === "bank";
  const { data } = await adminClient()
    .from("invoices")
    .update({ status: "paid", method, paid_at: now, updated_at: now, ...(dropCod ? { cod_fee: 0, cod_requested_at: null } : {}) })
    .eq("id", invoiceId)
    .neq("status", "paid")
    .neq("status", "void")
    .select("id")
    .maybeSingle();
  if (!data) return false;
  await adminClient().from("events").insert({ kind: "invoice_paid", data: { invoice_id: invoiceId, method, by: by || null } });
  const c = await invoiceContext({ id: invoiceId });
  if (c) {
    const title = lotTitle(c.lot, c.lang);
    const amount = money(invoiceTotal(c.invoice), c.lang);
    if (c.buyer?.email && emailReady()) {
      const ar = c.lang === "ar";
      const heading = ar ? "تم الدفع. شكراً لك!" : "Payment received. Thank you!";
      const blocks = ar
        ? [`استلمنا ${amount} مقابل ${title}.`, "سنتواصل معك عبر واتساب لترتيب الاستلام أو التوصيل."]
        : [`We’ve received ${amount} for ${title}.`, "We’ll be in touch on WhatsApp to arrange collection or delivery."];
      await sendEmail({ to: c.buyer.email, subject: ar ? `إيصال · ${title}` : `Receipt · ${title}`, text: `${heading}\n\n${blocks.join("\n")}`, html: emailHtml({ lang: c.lang, heading, blocks, footer: `${ar ? "الفاتورة" : "Invoice"} ${c.invoice.number}` }) });
    }
    const staff = staffEmails();
    if (staff.length && emailReady()) {
      const line = `${c.invoice.number} · ${lotTitle(c.lot, "en")} · ${money(invoiceTotal(c.invoice))} · paid by ${method === "cod" ? "cash on delivery" : method}${c.buyer ? ` · paddle ${c.buyer.paddle} ${c.buyer.full_name}` : ""}`;
      await sendEmail({ to: staff, subject: `Paid: ${lotTitle(c.lot, "en")}`, text: line, html: emailHtml({ lang: "en", heading: "Invoice paid", blocks: [line], button: { label: "Open payments", href: `${SITE_URL}/admin/payments` }, footer: "The Time Souk admin" }) });
    }
  }
  return true;
}
