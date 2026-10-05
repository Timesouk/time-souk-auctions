// "Send invoice" in the live console. Staff press it once they're sure no bid arrived before 0:00 that
// still needs typing in, so an invoice never goes to the wrong person. Creates the winner's invoice
// (once) and sends the payment link by email and WhatsApp.
import { getStaff } from "@/lib/staff";
import { createAndSendInvoice } from "@/lib/invoices";
import { fail, json } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return fail("staff_only", 403);
  const { id } = await params;
  const r = await createAndSendInvoice(id);
  if (!r.ok) return fail(r.error || "failed", 400);
  return json(r);
}
