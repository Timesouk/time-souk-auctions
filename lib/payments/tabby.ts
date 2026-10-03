// Tabby (pay in 4): https://docs.tabby.ai
const BASE = "https://api.tabby.ai";
export const tabbyReady = () => !!(process.env.TABBY_SECRET_KEY && process.env.TABBY_MERCHANT_CODE);
const headers = () => ({ Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`, "Content-Type": "application/json" });
const amt = (n: number) => n.toFixed(2);

export type TabbyBuyer = { name: string; email: string; phone: string; registeredSince: string; paidOrders: { at: string; amount: number }[] };

export async function tabbyCreate(opts: {
  amountAed: number;
  reference: string;
  title: string;
  sku: string;
  buyer: TabbyBuyer;
  lang: "en" | "ar";
  urls: { success: string; cancel: string; failure: string };
}) {
  const res = await fetch(`${BASE}/api/v2/checkout`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      payment: {
        amount: amt(opts.amountAed),
        currency: "AED",
        description: opts.title,
        buyer: { name: opts.buyer.name, email: opts.buyer.email, phone: opts.buyer.phone },
        shipping_address: { city: "Dubai", address: "Collection from The Time Souk, Dubai", zip: "00000" },
        order: {
          reference_id: opts.reference,
          updated_at: new Date().toISOString(),
          tax_amount: "0.00",
          shipping_amount: "0.00",
          discount_amount: "0.00",
          items: [{ reference_id: opts.sku, title: opts.title, quantity: 1, unit_price: amt(opts.amountAed), category: "Watches" }]
        },
        buyer_history: {
          registered_since: opts.buyer.registeredSince,
          loyalty_level: opts.buyer.paidOrders.length,
          is_phone_number_verified: true,
          is_email_verified: true
        },
        order_history: opts.buyer.paidOrders.slice(0, 10).map(o => ({ purchased_at: o.at, amount: amt(o.amount), status: "complete", payment_method: "card" }))
      },
      lang: opts.lang,
      merchant_code: process.env.TABBY_MERCHANT_CODE,
      merchant_urls: opts.urls
    })
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    payment?: { id?: string };
    configuration?: { available_products?: { installments?: { web_url?: string }[] }; products?: { installments?: { rejection_reason?: string | null } } };
    error?: string;
  };
  const url = data.configuration?.available_products?.installments?.[0]?.web_url;
  if (res.ok && data.status === "created" && url && data.payment?.id) return { ok: true as const, paymentId: data.payment.id, url };
  return { ok: false as const, reason: data.configuration?.products?.installments?.rejection_reason || data.status || data.error || `http_${res.status}` };
}

export async function tabbyGet(paymentId: string) {
  const res = await fetch(`${BASE}/api/v2/payments/${encodeURIComponent(paymentId)}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Tabby: ${res.status}`);
  return (await res.json()) as { id: string; status: string; amount: string; captures?: { amount: string }[] };
}

export async function tabbyCapture(paymentId: string, amountAed: number, reference: string) {
  const res = await fetch(`${BASE}/api/v2/payments/${encodeURIComponent(paymentId)}/captures`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({ amount: amt(amountAed), reference_id: reference })
  });
  return res.ok;
}

export const TABBY_WEBHOOK_HEADER = "X-TS-Webhook-Key";

export async function tabbyRegisterWebhook(url: string) {
  const res = await fetch(`${BASE}/api/v1/webhooks`, {
    method: "POST",
    headers: { ...headers(), "X-Merchant-Code": process.env.TABBY_MERCHANT_CODE || "" },
    cache: "no-store",
    body: JSON.stringify({ url, header: { title: TABBY_WEBHOOK_HEADER, value: process.env.TABBY_WEBHOOK_SECRET } })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, detail: res.ok ? "Registered" : String((data as { error?: string; message?: string }).error || (data as { message?: string }).message || res.status) };
}
