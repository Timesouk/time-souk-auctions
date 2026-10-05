import { Connections, SettingsForm } from "@/components/admin/SettingsForm";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW, SITE_URL } from "@/lib/env";
import { getStaff } from "@/lib/staff";
import { emailReady } from "@/lib/notify/email";
import { verifyChannels, verifyReady, whatsappReady } from "@/lib/notify/twilio";
import { ziinaReady } from "@/lib/payments/ziina";
import { tabbyReady } from "@/lib/payments/tabby";
import { tamaraReady } from "@/lib/payments/tamara";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to change settings.</p>;
  if ((await getStaff())?.role !== "admin") return <p className="alert">Only the admin can change settings.</p>;
  const db = adminClient();
  const [{ data: s }, { data: p }] = await Promise.all([
    db.from("settings").select("*").eq("id", 1).single(),
    db.from("settings_private").select("bank_details").eq("id", 1).single()
  ]);
  const checks: [string, boolean, string][] = [
    ["Site address", !!process.env.NEXT_PUBLIC_SITE_URL, SITE_URL],
    ["Supabase server key", !!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"],
    ["Every-minute job secret", !!process.env.CRON_SECRET, "CRON_SECRET"],
    ["Email (Resend)", emailReady(), "RESEND_API_KEY, EMAIL_FROM"],
    ["Staff alerts", !!process.env.STAFF_EMAIL, "STAFF_EMAIL"],
    ["Phone codes (Twilio Verify)", verifyReady(), `channels: ${verifyChannels().join(", ")}`],
    ["WhatsApp sender", whatsappReady(), "TWILIO_WHATSAPP_FROM"],
    ["WhatsApp invoice template", !!process.env.TWILIO_WA_TEMPLATE_INVOICE, "TWILIO_WA_TEMPLATE_INVOICE"],
    ["WhatsApp reminder template", !!process.env.TWILIO_WA_TEMPLATE_REMINDER, "TWILIO_WA_TEMPLATE_REMINDER"],
    ["Card payments (Ziina)", ziinaReady(), process.env.ZIINA_TEST_MODE === "true" ? "TEST MODE: no money moves" : "live"],
    ["Ziina webhook secret", !!process.env.ZIINA_WEBHOOK_SECRET, "ZIINA_WEBHOOK_SECRET"],
    ["Tabby", tabbyReady(), "TABBY_SECRET_KEY, TABBY_MERCHANT_CODE"],
    ["Tabby webhook secret", !!process.env.TABBY_WEBHOOK_SECRET, "TABBY_WEBHOOK_SECRET"],
    ["Tamara", tamaraReady(), (process.env.TAMARA_API_URL || "sandbox").includes("sandbox") ? "SANDBOX: no money moves" : "live"],
    ["Tamara notification token", !!process.env.TAMARA_NOTIFICATION_TOKEN, "TAMARA_NOTIFICATION_TOKEN"]
  ];
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="adm-head"><h1 className="disp">Settings</h1></div>
      <div className="cols">
        <div className="panel-card">
          <span className="k">Auction rules and contact</span>
          <SettingsForm initial={{ seller_fee: Number(s?.seller_fee ?? 7.5), pay_days: s?.pay_days ?? 3, timer_seconds: s?.timer_seconds ?? 180, lot_target: s?.lot_target ?? 100, cod_fee: Number((s as { cod_fee?: number } | null)?.cod_fee ?? 10), whatsapp: s?.whatsapp || "", instagram: s?.instagram || "", contact_email: s?.contact_email || "", bank_details: p?.bank_details || "" }} />
        </div>
        <div className="panel-card">
          <span className="k">Connections</span>
          <ul className="checklist">
            {checks.map(([label, okk, note]) => (
              <li key={label}><span className={okk ? "yes" : "no"}>{okk ? "✓" : "✗"}</span><span><b>{label}</b> <span className="fine">{note}</span></span></li>
            ))}
          </ul>
          <p className="fine">These come from your Vercel environment variables. Change them in Vercel, then redeploy.</p>
          <Connections />
          <p className="fine">Tamara webhook: in the Tamara partner portal add <span className="mono">{SITE_URL}/api/webhooks/tamara</span> for order approved, authorised and captured.</p>
        </div>
      </div>
    </div>
  );
}
