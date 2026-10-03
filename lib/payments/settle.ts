// Confirms a payment with its provider and records the outcome. Called from the return page and from webhooks,
// so a payment counts even if the buyer closes the browser before coming back.
import { adminClient } from "../supabase/admin";
import { markPaid } from "../invoices";
import { ziinaGet } from "./ziina";
import { tabbyCapture, tabbyGet } from "./tabby";
import { tamaraAuthorise, tamaraCapture } from "./tamara";

export type PaymentRow = {
  id: string;
  invoice_id: string;
  provider: "ziina" | "tabby" | "tamara" | "bank" | "cash";
  provider_ref: string | null;
  status: "created" | "authorized" | "paid" | "failed" | "cancelled";
  amount: number;
};

export type Outcome = "paid" | "failed" | "cancelled" | "processing";

async function setStatus(p: PaymentRow, status: PaymentRow["status"], detail: Record<string, unknown> = {}) {
  await adminClient().from("payments").update({ status, detail, updated_at: new Date().toISOString() }).eq("id", p.id);
}

export async function settlePayment(p: PaymentRow, hint?: "success" | "cancel" | "failure" | "approved"): Promise<Outcome> {
  if (p.status === "paid") return "paid";
  if (!p.provider_ref) return "failed";
  const { data: inv } = await adminClient().from("invoices").select("number, amount, status").eq("id", p.invoice_id).single();
  if (!inv) return "failed";
  if (inv.status === "paid") return "paid";

  if (p.provider === "ziina") {
    const intent = await ziinaGet(p.provider_ref);
    if (intent.status === "completed") {
      await setStatus(p, "paid", { ziina_status: intent.status });
      await markPaid(p.invoice_id, "card");
      return "paid";
    }
    if (intent.status === "failed") return (await setStatus(p, "failed", { ziina_status: intent.status }), "failed");
    if (intent.status === "canceled") return (await setStatus(p, "cancelled", { ziina_status: intent.status }), "cancelled");
    return hint === "cancel" ? "cancelled" : "processing";
  }

  if (p.provider === "tabby") {
    let pay = await tabbyGet(p.provider_ref);
    let status = String(pay.status).toUpperCase();
    if (status === "AUTHORIZED") {
      await setStatus(p, "authorized", { tabby_status: status });
      const captured = await tabbyCapture(p.provider_ref, inv.amount, inv.number);
      pay = await tabbyGet(p.provider_ref);
      status = String(pay.status).toUpperCase();
      if (!captured && status !== "CLOSED") {
        // Authorised but capture failed: Tabby has approved the buyer; staff can capture from the Tabby dashboard.
        await markPaid(p.invoice_id, "tabby");
        return "paid";
      }
    }
    if (status === "CLOSED") {
      await setStatus(p, "paid", { tabby_status: status });
      await markPaid(p.invoice_id, "tabby");
      return "paid";
    }
    if (status === "REJECTED" || status === "EXPIRED") return (await setStatus(p, "failed", { tabby_status: status }), "failed");
    return hint === "cancel" ? (await setStatus(p, "cancelled", { tabby_status: status }), "cancelled") : hint === "failure" ? "failed" : "processing";
  }

  if (p.provider === "tamara") {
    if (hint === "cancel") return (await setStatus(p, "cancelled"), "cancelled");
    if (hint === "failure") return (await setStatus(p, "failed"), "failed");
    const authorised = await tamaraAuthorise(p.provider_ref);
    if (!authorised) return "processing";
    await setStatus(p, "authorized");
    const captured = await tamaraCapture(p.provider_ref, inv.amount);
    await setStatus(p, "paid", { tamara_captured: captured });
    await markPaid(p.invoice_id, "tamara");
    return "paid";
  }
  return "processing";
}

export async function paymentByRef(provider: PaymentRow["provider"], ref: string) {
  const { data } = await adminClient().from("payments").select("*").eq("provider", provider).eq("provider_ref", ref).maybeSingle();
  return data as PaymentRow | null;
}
