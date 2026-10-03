import { randomBytes } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/staff";
import { fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const staff = await getStaff();
  if (!staff) return fail("Staff only", 403);
  const form = await req.formData();
  const lot = String(form.get("lot") || "");
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(lot) || !(file instanceof Blob)) return fail("Missing photo");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return fail("Use JPEG, PNG or WebP");
  if (file.size > 4 * 1024 * 1024) return fail("Photo too large (max 4 MB after resizing)");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${lot}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const db = adminClient();
  const { error } = await db.storage.from("lot-photos").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) return fail(error.message, 500);
  const { data } = db.storage.from("lot-photos").getPublicUrl(path);
  return json({ ok: true, url: data.publicUrl });
}
