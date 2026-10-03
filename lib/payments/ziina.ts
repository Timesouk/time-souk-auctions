// Ziina card payments: https://docs.ziina.com
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api-v2.ziina.com/api";
export const ziinaReady = () => !!process.env.ZIINA_API_KEY;
const headers = () => ({ Authorization: `Bearer ${process.env.ZIINA_API_KEY}`, "Content-Type": "application/json" });

export type ZiinaIntent = { id: string; status: string; redirect_url?: string; amount?: number };

export async function ziinaCreate(opts: { amountAed: number; message: string; successUrl: string; cancelUrl: string; failureUrl: string }) {
  const res = await fetch(`${BASE}/payment_intent`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      amount: Math.round(opts.amountAed * 100),
      currency_code: "AED",
      message: opts.message.slice(0, 200),
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      failure_url: opts.failureUrl,
      test: process.env.ZIINA_TEST_MODE === "true"
    })
  });
  const data = (await res.json().catch(() => ({}))) as ZiinaIntent & { message?: string };
  if (!res.ok || !data.id || !data.redirect_url) throw new Error(`Ziina: ${data.message || res.status}`);
  return data;
}

export async function ziinaGet(id: string) {
  const res = await fetch(`${BASE}/payment_intent/${encodeURIComponent(id)}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Ziina: ${res.status}`);
  return (await res.json()) as ZiinaIntent;
}

/** Ziina signs webhooks with a hex HMAC-SHA256 of the raw body in X-Hmac-Signature. */
export function ziinaVerify(raw: string, signature: string | null) {
  const secret = process.env.ZIINA_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function ziinaRegisterWebhook(url: string) {
  const res = await fetch(`${BASE}/webhook`, { method: "POST", headers: headers(), cache: "no-store", body: JSON.stringify({ url, secret: process.env.ZIINA_WEBHOOK_SECRET }) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, detail: res.ok ? "Registered" : String((data as { message?: string }).message || res.status) };
}
