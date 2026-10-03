import { adminClient } from "@/lib/supabase/admin";
import { emailHtml, emailReady, sendEmail, staffEmails } from "@/lib/notify/email";
import { IS_PREVIEW, SITE_URL } from "@/lib/env";
import { clientIp, fail, json, limited } from "@/lib/http";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (b.company) return json({ ok: true }); // bots fill the hidden field
  const row = {
    name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 160),
    brand: clip(b.brand, 60), model: clip(b.model, 120), reference: clip(b.reference, 60), year: clip(b.year, 10),
    box_papers: clip(b.box_papers, 40), condition: clip(b.condition, 40),
    price_in_mind: Number(String(b.price || "").replace(/\D/g, "")) || null,
    notes: clip(b.notes, 2000), lang: b.lang === "ar" ? "ar" : "en"
  };
  if (!row.name || !row.phone || !row.brand || !row.model) return fail("missing");
  if (IS_PREVIEW) return json({ ok: true, preview: true });
  if (limited(`consign:${clientIp(req)}`, 5, 60 * 60e3)) return fail("too_many", 429);
  const { error } = await adminClient().from("consignments").insert(row);
  if (error) return fail("save_failed", 500);
  const to = staffEmails();
  if (to.length && emailReady()) {
    const lines = [`${row.brand} ${row.model} ${row.reference} ${row.year}`.trim(), `${row.box_papers} · ${row.condition}`, row.price_in_mind ? `Price in mind: AED ${row.price_in_mind.toLocaleString("en-US")}` : "", `${row.name} · ${row.phone}${row.email ? " · " + row.email : ""}`, row.notes].filter(Boolean);
    await sendEmail({
      to, subject: `New consignment: ${row.brand} ${row.model}`, text: lines.join("\n"),
      html: emailHtml({ lang: "en", heading: "New consignment request", blocks: lines, button: { label: "Open consignments", href: `${SITE_URL}/admin/consignments` }, footer: "The Time Souk admin" })
    });
  }
  return json({ ok: true });
}
