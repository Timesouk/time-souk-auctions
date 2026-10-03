import type { Locale } from "./types";

export const TZ = "Asia/Dubai";

export const num = (n: number | null | undefined) => Math.round(Number(n) || 0).toLocaleString("en-US");

export function money(n: number | null | undefined, locale: Locale = "en") {
  return locale === "ar" ? `${num(n)} درهم` : `AED ${num(n)}`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const lotNo = (n: number) => pad2(n);

// Dates are built by hand (Dubai is UTC+4 all year) so the server and every browser print exactly the same text.
const WD = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
};
const MO = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
};

function dubai(d: Date | string | number) {
  const x = new Date(new Date(d).getTime() + 4 * 3600e3);
  return { y: x.getUTCFullYear(), mo: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), wd: x.getUTCDay() };
}

/** "Saturday 3 October" */
export function dayLong(d: Date | string | number, locale: Locale = "en") {
  const p = dubai(d);
  return `${WD[locale][p.wd]} ${p.d} ${MO[locale][p.mo]}`;
}

/** "Sat 3 Oct" */
export function dayShort(d: Date | string | number, locale: Locale = "en") {
  const p = dubai(d);
  return locale === "ar" ? `${WD.ar[p.wd]} ${p.d} ${MO.ar[p.mo]}` : `${WD.en[p.wd].slice(0, 3)} ${p.d} ${MO.en[p.mo].slice(0, 3)}`;
}

/** "4:00 pm" */
export function timeOf(d: Date | string | number, locale: Locale = "en") {
  const p = dubai(d);
  const h = ((p.h + 11) % 12) + 1;
  const am = p.h < 12;
  return `${h}:${pad2(p.mi)} ${locale === "ar" ? (am ? "ص" : "م") : am ? "am" : "pm"}`;
}

export const stamp = (d: Date | string | number, locale: Locale = "en") => `${dayShort(d, locale)}, ${timeOf(d, locale)}`;

/** A yyyy-mm-dd calendar date shown in words (no time-zone shift). */
export const dateLong = (ymd: string, locale: Locale = "en") => dayLong(`${ymd}T12:00:00+04:00`, locale);
export const dateShort = (ymd: string, locale: Locale = "en") => dayShort(`${ymd}T12:00:00+04:00`, locale);

/** Today's date in Dubai as yyyy-mm-dd. */
export function todayDubai(now = Date.now()) {
  const d = new Date(now + 4 * 3600e3);
  return d.toISOString().slice(0, 10);
}

/** A Dubai wall-clock date + time ("2026-10-03", "16:00") as an ISO instant. */
export const dubaiInstant = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+04:00`).toISOString();

/** Dubai wall-clock parts of an instant, for form inputs. */
export function dubaiParts(iso: string) {
  const d = new Date(Date.parse(iso) + 4 * 3600e3).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addWorkingDays(ymd: string, n: number) {
  let d = ymd;
  let c = 0;
  while (c < n) {
    d = addDays(d, 1);
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) c++;
  }
  return d;
}

export function nextSaturday(fromYmd: string) {
  let d = addDays(fromYmd, 1);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 6) d = addDays(d, 1);
  return d;
}

/** UAE mobile numbers: 05x xxx xxxx → +9715x xxx xxxx. Returns E.164 or "". */
export function toE164(raw: string) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (/^05\d{8}$/.test(d)) d = "+971" + d.slice(1);
  if (/^5\d{8}$/.test(d)) d = "+971" + d;
  if (!d.startsWith("+")) d = "+" + d;
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : "";
}

export const normIg = (h: string | null | undefined) => {
  const v = String(h || "").replace(/[^A-Za-z0-9._]/g, "").toLowerCase();
  return v || null;
};

export const waLink = (phone: string, text: string) => {
  const n = toE164(phone).replace("+", "");
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
};
