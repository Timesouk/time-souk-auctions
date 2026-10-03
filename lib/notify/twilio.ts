// Twilio over plain HTTPS: Verify for phone codes, Messages for WhatsApp invoices.
const sid = () => process.env.TWILIO_ACCOUNT_SID || "";
const token = () => process.env.TWILIO_AUTH_TOKEN || "";
const auth = () => "Basic " + Buffer.from(`${sid()}:${token()}`).toString("base64");

export const twilioReady = () => !!(sid() && token());
export const verifyReady = () => twilioReady() && !!process.env.TWILIO_VERIFY_SERVICE_SID;
export const whatsappReady = () => twilioReady() && !!process.env.TWILIO_WHATSAPP_FROM;

export function verifyChannels(): ("whatsapp" | "sms")[] {
  const raw = (process.env.TWILIO_VERIFY_CHANNELS || "whatsapp,sms").toLowerCase();
  const list = raw.split(",").map(s => s.trim()).filter((s): s is "whatsapp" | "sms" => s === "whatsapp" || s === "sms");
  return list.length ? list : ["sms"];
}

async function post(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}

export async function startVerification(to: string, channel: "whatsapp" | "sms", locale: "en" | "ar") {
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  return post(`https://verify.twilio.com/v2/Services/${svc}/Verifications`, { To: to, Channel: channel, Locale: locale });
}

export async function checkVerification(to: string, code: string) {
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  const r = await post(`https://verify.twilio.com/v2/Services/${svc}/VerificationCheck`, { To: to, Code: code });
  return { ...r, approved: r.ok && r.data.status === "approved" };
}

/** Sends an approved WhatsApp template. Variables are numbered {{1}}, {{2}}… in the template. */
export async function sendWhatsAppTemplate(to: string, contentSid: string, vars: Record<string, string>) {
  if (!whatsappReady() || !contentSid) return { ok: false, error: "WhatsApp is not configured" };
  const from = process.env.TWILIO_WHATSAPP_FROM!.startsWith("whatsapp:") ? process.env.TWILIO_WHATSAPP_FROM! : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;
  const r = await post(`https://api.twilio.com/2010-04-01/Accounts/${sid()}/Messages.json`, {
    From: from,
    To: `whatsapp:${to}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(vars)
  });
  return r.ok ? { ok: true } : { ok: false, error: String(r.data.message || `Twilio error ${r.status}`) };
}
