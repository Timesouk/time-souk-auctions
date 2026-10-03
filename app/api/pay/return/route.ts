import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { settlePayment, type PaymentRow } from "@/lib/payments/settle";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const pid = u.searchParams.get("pid") || "";
  const r = u.searchParams.get("r");
  const hint = r === "success" ? "success" : r === "cancel" ? "cancel" : r === "failure" ? "failure" : undefined;
  if (!/^[0-9a-f-]{36}$/i.test(pid)) return NextResponse.redirect(`${SITE_URL}/en`, 303);
  const db = adminClient();
  const { data: pay } = await db.from("payments").select("*").eq("id", pid).maybeSingle();
  if (!pay) return NextResponse.redirect(`${SITE_URL}/en`, 303);
  const { data: inv } = await db.from("invoices").select("pay_token, bidder_id").eq("id", pay.invoice_id).single();
  const { data: prof } = inv?.bidder_id ? await db.from("profiles").select("lang").eq("id", inv.bidder_id).maybeSingle() : { data: null };
  const lang = prof?.lang === "ar" ? "ar" : "en";
  let outcome = "processing";
  try {
    outcome = await settlePayment(pay as PaymentRow, hint);
  } catch {
    outcome = "processing";
  }
  return NextResponse.redirect(`${SITE_URL}/${lang}/pay/${inv?.pay_token}?status=${outcome}`, 303);
}
