// Private links buyers and sellers can open without an account: an invoice or an intake receipt.
// The link carries a signature, so nobody can open another buyer's invoice by changing the number.
import { createHmac, timingSafeEqual } from "crypto";
import { SITE_URL } from "../env";

const secret = () => process.env.OFFICE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "preview-only";
const sig = (ref: string) => createHmac("sha256", secret()).update(`office:${ref}`).digest("base64url").slice(0, 16);

/** "TS002-B0044" → "TS002-B0044.k3J…" */
export const signRef = (ref: string) => `${ref}.${sig(ref)}`;

/** The reference inside a signed token, or null if the signature doesn't match. */
export function verifyRef(token: string): string | null {
  const t = decodeURIComponent(String(token || ""));
  const i = t.lastIndexOf(".");
  if (i < 1) return null;
  const ref = t.slice(0, i);
  const a = Buffer.from(t.slice(i + 1));
  const b = Buffer.from(sig(ref));
  return a.length === b.length && timingSafeEqual(a, b) ? ref : null;
}

export const invoiceUrl = (no: string, lang: "en" | "ar" = "en") => `${SITE_URL}/${lang}/invoice/${signRef(no)}`;
export const receiptUrl = (receipt: string, lang: "en" | "ar" = "en") => `${SITE_URL}/${lang}/receipt/${signRef(receipt)}`;
