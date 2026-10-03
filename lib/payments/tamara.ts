// Tamara (split payments): https://docs.tamara.co
import { jwtVerify } from "jose";

const base = () => (process.env.TAMARA_API_URL || "https://api-sandbox.tamara.co").replace(/\/$/, "");
export const tamaraReady = () => !!process.env.TAMARA_API_TOKEN;
const headers = () => ({ Authorization: `Bearer ${process.env.TAMARA_API_TOKEN}`, "Content-Type": "application/json" });
const money = (n: number) => ({ amount: Math.round(n * 100) / 100, currency: "AED" });

export async function tamaraCreate(opts: {
  amountAed: number;
  reference: string;
  orderNumber: string;
  title: string;
  sku: string;
  lotId: string;
  consumer: { firstName: string; lastName: string; phone: string; email: string };
  lang: "en" | "ar";
  urls: { success: string; failure: string; cancel: string; notification: string };
}) {
  const c = opts.consumer;
  const address = { first_name: c.firstName, last_name: c.lastName, line1: "Collection from The Time Souk", city: "Dubai", country_code: "AE", phone_number: c.phone };
  const instalments = Number(process.env.TAMARA_INSTALMENTS) || undefined;
  const res = await fetch(`${base()}/checkout`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      order_reference_id: opts.reference,
      order_number: opts.orderNumber,
      total_amount: money(opts.amountAed),
      shipping_amount: money(0),
      tax_amount: money(0),
      description: opts.title.slice(0, 250),
      country_code: "AE",
      payment_type: "PAY_BY_INSTALMENTS",
      ...(instalments ? { instalments } : {}),
      locale: opts.lang === "ar" ? "ar_SA" : "en_US",
      items: [{
        name: opts.title.slice(0, 250), quantity: 1, reference_id: opts.lotId, type: "Physical", sku: opts.sku.slice(0, 120),
        unit_price: money(opts.amountAed), total_amount: money(opts.amountAed), tax_amount: money(0), discount_amount: money(0)
      }],
      consumer: { first_name: c.firstName, last_name: c.lastName, phone_number: c.phone, email: c.email },
      shipping_address: address,
      billing_address: address,
      merchant_url: opts.urls,
      platform: "The Time Souk",
      is_mobile: false
    })
  });
  const data = (await res.json().catch(() => ({}))) as { order_id?: string; checkout_url?: string; message?: string; errors?: { error_code?: string }[] };
  if (res.ok && data.order_id && data.checkout_url) return { ok: true as const, orderId: data.order_id, url: data.checkout_url };
  return { ok: false as const, reason: data.errors?.[0]?.error_code || data.message || `http_${res.status}` };
}

/** Confirms an approved order. Returns true once Tamara reports it authorised. */
export async function tamaraAuthorise(orderId: string) {
  const res = await fetch(`${base()}/orders/${encodeURIComponent(orderId)}/authorise`, { method: "POST", headers: headers(), cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { status?: string };
  if (res.ok && (data.status === "authorised" || data.status === "fully_captured")) return true;
  const order = await tamaraGetOrder(orderId).catch(() => null);
  return !!order && ["authorised", "fully_captured", "partially_captured"].includes(String(order.status));
}

export async function tamaraGetOrder(orderId: string) {
  const res = await fetch(`${base()}/orders/${encodeURIComponent(orderId)}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Tamara: ${res.status}`);
  return (await res.json()) as { status: string };
}

export async function tamaraCapture(orderId: string, amountAed: number) {
  const res = await fetch(`${base()}/payments/capture`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      order_id: orderId,
      total_amount: money(amountAed),
      shipping_info: { shipped_at: new Date().toISOString(), shipping_company: "The Time Souk" }
    })
  });
  return res.ok;
}

/** Tamara signs notifications with a JWT (HS256) using your notification token. */
export async function tamaraVerify(token: string | null) {
  const key = process.env.TAMARA_NOTIFICATION_TOKEN;
  if (!key || !token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(key), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
