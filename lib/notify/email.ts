// Email through Resend's HTTP API.
export const emailReady = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string; text: string; replyTo?: string }) {
  if (!emailReady()) return { ok: false, error: "Email is not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: opts.replyTo || undefined
    }),
    cache: "no-store"
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: String((data as { message?: string }).message || `Resend error ${res.status}`) };
}

export const staffEmails = () => (process.env.STAFF_EMAIL || "").split(",").map(s => s.trim()).filter(Boolean);

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain, bold email layout matching the site. `blocks` are paragraphs; a button is optional. */
export function emailHtml(opts: { lang: "en" | "ar"; heading: string; blocks: string[]; button?: { label: string; href: string }; footer: string }) {
  const dir = opts.lang === "ar" ? "rtl" : "ltr";
  const align = dir === "rtl" ? "right" : "left";
  const font = opts.lang === "ar" ? "Tahoma, Arial, sans-serif" : "Helvetica, Arial, sans-serif";
  return `<!doctype html><html lang="${opts.lang}" dir="${dir}"><body style="margin:0;background:#f3f4f1;font-family:${font};color:#121417">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:3px solid #121417;text-align:${align}" dir="${dir}">
<tr><td style="background:#121417;padding:14px 22px;font-family:'Arial Black',Arial,sans-serif;font-size:18px;letter-spacing:1px"><span style="color:#FFD23F">THE</span> <span style="color:#1E9BD7">TIME</span> <span style="color:#E23B2E">SOUK</span></td></tr>
<tr><td style="padding:24px 22px 8px"><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25">${esc(opts.heading)}</h1>
${opts.blocks.map(b => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;white-space:pre-line">${esc(b)}</p>`).join("")}
${opts.button ? `<p style="margin:18px 0 8px"><a href="${esc(opts.button.href)}" style="display:inline-block;background:#FFD23F;color:#121417;border:2px solid #121417;padding:13px 22px;font-weight:bold;font-size:17px;text-decoration:none">${esc(opts.button.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:14px 22px 20px;border-top:2px solid #d4d8d1;font-size:12.5px;color:#51575f">${esc(opts.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
