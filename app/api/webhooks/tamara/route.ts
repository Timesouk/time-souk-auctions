import { tamaraVerify } from "@/lib/payments/tamara";
import { paymentByRef, settlePayment } from "@/lib/payments/settle";
import { json } from "@/lib/http";

export async function POST(req: Request) {
  const u = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const token = u.searchParams.get("tamaraToken") || (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null);
  if (!(await tamaraVerify(token))) return json({ ok: false }, 401);
  const body = (await req.json().catch(() => ({}))) as { order_id?: string; event_type?: string };
  if (body.order_id && ["order_approved", "order_authorised", "order_captured"].includes(String(body.event_type))) {
    const p = await paymentByRef("tamara", body.order_id);
    if (p) await settlePayment(p, "approved").catch(() => null);
  }
  return json({ ok: true });
}
