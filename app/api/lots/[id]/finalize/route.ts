// Called by the staff console the moment a lot's timer ends, so the winner hears straight away.
import { adminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/staff";
import { notifyInvoice } from "@/lib/invoices";
import { fail, json } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return fail("staff_only", 403);
  const { id } = await params;
  const { data: invoiceId, error } = await adminClient().rpc("finalize_lot", { p_lot_id: id });
  if (error) return fail(error.message, 400);
  if (!invoiceId) return json({ ok: true, invoice: null });
  const { data: inv } = await adminClient().from("invoices").select("notified_at, bidder_id").eq("id", invoiceId).single();
  let sent = null;
  if (inv && !inv.notified_at && inv.bidder_id) sent = await notifyInvoice(invoiceId as string);
  return json({ ok: true, invoice: invoiceId, sent });
}
