import { ziinaVerify } from "@/lib/payments/ziina";
import { paymentByRef, settlePayment } from "@/lib/payments/settle";
import { json } from "@/lib/http";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!ziinaVerify(raw, req.headers.get("x-hmac-signature"))) return json({ ok: false }, 401);
  const body = JSON.parse(raw || "{}") as { event?: string; data?: { id?: string } };
  if (body.event === "payment_intent.status.updated" && body.data?.id) {
    const p = await paymentByRef("ziina", body.data.id);
    if (p) await settlePayment(p).catch(() => null);
  }
  return json({ ok: true });
}
