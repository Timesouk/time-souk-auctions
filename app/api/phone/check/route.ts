import { serverClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { checkVerification, verifyReady } from "@/lib/notify/twilio";
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
  const code = String(body.code || "").replace(/\D/g, "");
  if (!phone || code.length < 4) return fail("bad_code");
  if (limited(`check:${user.id}`, 10, 10 * 60e3)) return fail("too_many", 429);

  const r = await checkVerification(phone, code);
  if (!r.ok) console.error("Phone code check failed", { ref: String(r.data.code || r.status), message: r.data.message });
  if (!r.approved) return fail("bad_code");

  const { error } = await adminClient()
    .from("profiles").update({ phone, phone_verified_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return fail(error.code === "23505" ? "phone_taken" : "save_failed", error.code === "23505" ? 409 : 500);
  return json({ ok: true });
}
