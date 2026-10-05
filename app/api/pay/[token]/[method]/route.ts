import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { invoiceContext, lotTitle } from "@/lib/invoices";
import { SITE_URL } from "@/lib/env";
import { ziinaCreate, ziinaReady } from "@/lib/payments/ziina";
import { tabbyCreate, tabbyReady } from "@/lib/payments/tabby";
import { tamaraCreate, tamaraReady } from "@/lib/payments/tamara";
import { emailHtml, emailReady, sendEmail, staffEmails } from "@/lib/notify/email";
import { money } from "@/lib/format";
import { clientIp, limited } from "@/lib/http";

type P = { params: Promise<{ token: string; method: string }> };

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

export async function POST(req: Request, { params }: P) {
  const { token, method } = await params;
  const c = await invoiceContext({ token });
  const lang = c?.lang || "en";
  const back = (q: string) => NextResponse.redirect(`${SITE_URL}/${lang}/pay/${token}?${q}`, 303);
  if (!c) return NextResponse.redirect(`${SITE_URL}/${lang}`, 303);
  if (c.invoice.status === "paid") return back("status=paid");
  if (c.invoice.status === "void") return back("status=void");
  if (limited(`pay:${clientIp(req)}`, 20, 10 * 60e3)) return back("status=failed");

  const db = adminClient();
  const title = lotTitle(c.lot, lang);
  const amount = c.invoice.amount;
  const now = new Date().toISOString();

  // The delivery address from the checkout form (optional, except for cash on delivery).
  const form = await req.formData().catch(() => null);
  const address = str(form?.get("address"), 500);
  const city = str(form?.get("city"), 80);
  const delivery = { address: address || c.invoice.delivery_address || "", city: address ? city : c.invoice.delivery_city || "" };
  if (address && (address !== c.invoice.delivery_address || city !== c.invoice.delivery_city)) {
    await db.from("invoices").update({ delivery_address: address, delivery_city: city, updated_at: now }).eq("id", c.invoice.id);
    // Save it to their profile too, if they haven't given one before.
    if (c.buyer && !c.buyer.address) await db.from("profiles").update({ address, city }).eq("id", c.buyer.id);
  }

  if (method === "cod") {
    if (!delivery.address) return back("cod=address");
    const fee = c.codFee;
    await db.from("invoices").update({ cod_requested_at: now, cod_fee: fee, transfer_claimed_at: null, updated_at: now }).eq("id", c.invoice.id);
    await db.from("events").insert({ kind: "invoice_cod", data: { invoice_id: c.invoice.id, fee } });
    const total = amount + fee;
    const where = `${delivery.address}${delivery.city ? ", " + delivery.city : ""}`;
    const staff = staffEmails();
    if (staff.length && emailReady()) {
      const line = `${c.invoice.number} · ${lotTitle(c.lot, "en")} · collect ${money(total)} (incl. ${money(fee)} cash on delivery)${c.buyer ? ` · paddle ${c.buyer.paddle} ${c.buyer.full_name} · ${c.buyer.phone || "no phone"}` : ""}`;
      await sendEmail({ to: staff, subject: `Cash on delivery: ${c.invoice.number}`, text: `${line}\nDeliver to: ${where}`, html: emailHtml({ lang: "en", heading: "Buyer chose cash on delivery", blocks: [line, `Deliver to: ${where}`, "Arrange delivery with the buyer on WhatsApp, then mark the invoice paid (Cash on delivery) when the cash is collected."], button: { label: "Open payments", href: `${SITE_URL}/admin/payments` }, footer: "The Time Souk admin" }) });
    }
    if (c.buyer?.email && emailReady()) {
      const ar = lang === "ar";
      const heading = ar ? "تم تأكيد الدفع عند الاستلام" : "Cash on delivery confirmed";
      const blocks = ar
        ? [`${title}`, `يرجى تجهيز ${money(total, lang)} نقداً عند التوصيل (تشمل ${money(fee, lang)} رسوم الدفع عند الاستلام).`, `عنوان التوصيل: ${where}`, "سنراسلك عبر واتساب لترتيب موعد التوصيل."]
        : [`${title}`, `Please have ${money(total, lang)} in cash ready on delivery (includes the ${money(fee, lang)} cash on delivery charge).`, `Delivery address: ${where}`, "We’ll message you on WhatsApp to arrange a delivery time."];
      await sendEmail({ to: c.buyer.email, subject: ar ? `الدفع عند الاستلام · ${c.invoice.number}` : `Cash on delivery · ${c.invoice.number}`, text: `${heading}\n\n${blocks.join("\n")}`, html: emailHtml({ lang, heading, blocks, button: { label: ar ? "عرض الفاتورة" : "View invoice", href: c.payUrl }, footer: `${ar ? "الفاتورة" : "Invoice"} ${c.invoice.number}` }) });
    }
    return back("status=cod");
  }

  // Any other way to pay replaces cash on delivery, so its charge no longer applies.
  if (c.invoice.cod_requested_at) {
    await db.from("invoices").update({ cod_requested_at: null, cod_fee: 0, updated_at: now }).eq("id", c.invoice.id);
  }

  if (method === "transfer") {
    await db.from("invoices").update({ transfer_claimed_at: now, updated_at: now }).eq("id", c.invoice.id);
    const staff = staffEmails();
    if (staff.length && emailReady()) {
      const line = `${c.invoice.number} · ${lotTitle(c.lot, "en")} · ${money(amount)}${c.buyer ? ` · paddle ${c.buyer.paddle} ${c.buyer.full_name}` : ""}`;
      await sendEmail({ to: staff, subject: `Bank transfer sent: ${c.invoice.number}`, text: `The buyer says they have sent a bank transfer.\n${line}`, html: emailHtml({ lang: "en", heading: "Buyer says they’ve sent a transfer", blocks: [line, "Check the bank account, then mark the invoice paid in Admin → Payments."], button: { label: "Open payments", href: `${SITE_URL}/admin/payments` }, footer: "The Time Souk admin" }) });
    }
    return back("status=transfer");
  }

  const provider = method === "card" ? "ziina" : method === "tabby" ? "tabby" : method === "tamara" ? "tamara" : null;
  if (!provider) return back("status=failed");
  const ready = provider === "ziina" ? ziinaReady() : provider === "tabby" ? tabbyReady() : tamaraReady();
  if (!ready) return back(`unavailable=${method}`);

  const { data: pay, error } = await db.from("payments").insert({ invoice_id: c.invoice.id, provider, amount }).select("id").single();
  if (error || !pay) return back("status=failed");
  const ret = (r: string) => `${SITE_URL}/api/pay/return?pid=${pay.id}&r=${r}`;

  try {
    if (provider === "ziina") {
      const intent = await ziinaCreate({ amountAed: amount, message: `${c.invoice.number} · ${title}`, successUrl: ret("success"), cancelUrl: ret("cancel"), failureUrl: ret("failure") });
      await db.from("payments").update({ provider_ref: intent.id }).eq("id", pay.id);
      return NextResponse.redirect(intent.redirect_url!, 303);
    }

    const buyer = c.buyer;
    if (!buyer?.email || !buyer.phone) {
      await db.from("payments").update({ status: "failed", detail: { reason: "missing_contact" } }).eq("id", pay.id);
      return back(`rejected=${method}`);
    }
    const [first, ...rest] = (buyer.full_name || "Customer").trim().split(/\s+/);

    if (provider === "tabby") {
      const { data: history } = await db.from("invoices").select("paid_at, amount").eq("bidder_id", buyer.id).eq("status", "paid").order("paid_at", { ascending: false }).limit(10);
      const r = await tabbyCreate({
        amountAed: amount,
        reference: c.invoice.number,
        title,
        sku: c.lot.reference || c.lot.id,
        lang,
        ship: delivery,
        buyer: {
          name: buyer.full_name, email: buyer.email, phone: buyer.phone, registeredSince: buyer.created_at,
          paidOrders: (history || []).map(h => ({ at: h.paid_at as string, amount: h.amount as number }))
        },
        urls: { success: ret("success"), cancel: ret("cancel"), failure: ret("failure") }
      });
      if (!r.ok) {
        await db.from("payments").update({ status: "failed", detail: { reason: r.reason } }).eq("id", pay.id);
        return back(`rejected=tabby`);
      }
      await db.from("payments").update({ provider_ref: r.paymentId }).eq("id", pay.id);
      return NextResponse.redirect(r.url, 303);
    }

    const r = await tamaraCreate({
      amountAed: amount,
      reference: `${c.invoice.number}-${pay.id.slice(0, 8)}`,
      orderNumber: c.invoice.number,
      title,
      sku: c.lot.reference || c.lot.id,
      lotId: c.lot.id,
      lang,
      ship: delivery,
      consumer: { firstName: first, lastName: rest.join(" ") || first, phone: buyer.phone, email: buyer.email },
      urls: { success: ret("success"), failure: ret("failure"), cancel: ret("cancel"), notification: `${SITE_URL}/api/webhooks/tamara` }
    });
    if (!r.ok) {
      await db.from("payments").update({ status: "failed", detail: { reason: r.reason } }).eq("id", pay.id);
      return back(`rejected=tamara`);
    }
    await db.from("payments").update({ provider_ref: r.orderId }).eq("id", pay.id);
    return NextResponse.redirect(r.url, 303);
  } catch (e) {
    await db.from("payments").update({ status: "failed", detail: { error: String((e as Error).message).slice(0, 300) } }).eq("id", pay.id);
    return back(`unavailable=${method}`);
  }
}
