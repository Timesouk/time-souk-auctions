import { timingSafeEqual } from "node:crypto";
import { TABBY_WEBHOOK_HEADER } from "@/lib/payments/tabby";
import { paymentByRef, settlePayment } from "@/lib/payments/settle";
import { json } from "@/lib/http";

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const secret = process.env.TABBY_WEBHOOK_SECRET || "";
  const got = req.headers.get(TABBY_WEBHOOK_HEADER) || "";
  if (!secret || !same(secret, got)) return json({ ok: false }, 401);
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  if (body.id) {
    const p = await paymentByRef("tabby", body.id);
    // Always re-check with Tabby rather than trusting the message body.
    if (p) await settlePayment(p).catch(() => null);
  }
  return json({ ok: true });
}
