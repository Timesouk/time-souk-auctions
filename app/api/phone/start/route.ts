import { serverClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { startVerification, verifyChannels, verifyReady } from "@/lib/notify/twilio";
import { toE164 } from "@/lib/format";
import { fail, json, limited } from "@/lib/http";

export async function POST(req: Request) {
  const sb = await serverClient();
  if (!sb) return fail("preview", 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail("sign_in_required", 401);
  if (!verifyReady()) return fail("not_configured", 503);
  const body = await req.json().catch(() => ({}));
  const phone = toE164(String(body.phone || ""));
  if (!phone) return fail("bad_phone");
  const channel = body.channel === "whatsapp" ? "whatsapp" : "sms";
  if (!verifyChannels().includes(channel)) return fail("channel_unavailable");
  if (limited(`phone:${user.id}`, 5, 10 * 60e3)) return fail("too_many", 429);

  const { data: taken } = await adminClient()
    .from("profiles").select("id").eq("phone", phone).not("phone_verified_at", "is", null).neq("id", user.id).maybeSingle();
  if (taken) return fail("phone_taken", 409);

  const r = await startVerification(phone, channel, body.locale === "ar" ? "ar" : "en");
  if (!r.ok) {
    // Twilio's own error code (for example 60605 = blocked country, 21608 = trial account) helps staff fix it.
    const ref = String(r.data.code || r.status);
    console.error("Phone code not sent", { ref, message: r.data.message, channel });
    return json({ ok: false, error: r.status === 429 ? "too_many" : "send_failed", ref }, r.status === 429 ? 429 : 502);
  }
  return json({ ok: true, phone });
}
