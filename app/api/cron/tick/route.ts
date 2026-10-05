// Runs every minute (vercel.json): retries payment links that failed to send, and sends reminders.
// It never creates invoices: staff send each one with "Send invoice" once the lot is confirmed.
import { adminClient } from "@/lib/supabase/admin";
import { notifyInvoice, remindInvoice } from "@/lib/invoices";
import { addWorkingDays, todayDubai } from "@/lib/format";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ ok: false }, 401);
  const db = adminClient();
  const report = { notified: 0, reminded: 0 };

  // Payment links not yet sent (a send that failed, or Instagram winners linked to a bidder later).
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: pending } = await db.from("invoices").select("id, notify_error, updated_at").eq("status", "unpaid").is("notified_at", null).not("bidder_id", "is", null).gte("created_at", since).limit(25);
  for (const inv of pending || []) {
    // Retry failed sends at most every 15 minutes.
    if (inv.notify_error && Date.now() - Date.parse(inv.updated_at) < 15 * 60e3) continue;
    const r = await notifyInvoice(inv.id);
    if (r.sent) report.notified++;
  }

  // One reminder the working day before the due date, between 10:00 and 20:00 in Dubai.
  const hour = new Date(Date.now() + 4 * 3600e3).getUTCHours();
  if (hour >= 10 && hour < 20) {
    const tomorrow = addWorkingDays(todayDubai(), 1);
    // Cash on delivery buyers pay when the watch arrives, so they get no reminder.
    const { data: due } = await db.from("invoices").select("id").eq("status", "unpaid").eq("due_date", tomorrow).is("reminded_at", null).is("cod_requested_at", null).not("notified_at", "is", null).limit(25);
    for (const inv of due || []) {
      const r = await remindInvoice(inv.id);
      if (r.sent) report.reminded++;
    }
  }
  return json({ ok: true, ...report });
}
