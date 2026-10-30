// Seller fee scales: the fee depends on what the watch sold for. Each band covers prices up to its limit (the last one,
// with no limit, everything above) and charges a % of the hammer price, a fixed amount, or both. The band the sold price
// falls in sets the whole fee (it isn't worked out band by band). Pure (no database).

export type FeeBand = { upTo: number | null; pct: number; fixed: number };

const num = (v: unknown) => {
  const t = String(v ?? "").replace(/[^\d.-]/g, "");
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
};

/** A scale as stored ({ from, bands }, or just the bands): the bands and the first auction date it applies to. */
export function parseScale(raw: unknown): { bands: FeeBand[]; from: string | null } {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return { bands: [], from: null };
    }
  }
  if (v && !Array.isArray(v) && typeof v === "object") {
    const o = v as { bands?: unknown; from?: unknown };
    const from = typeof o.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.from) ? o.from : null;
    return { bands: cleanScale(o.bands), from };
  }
  return { bands: cleanScale(v), from: null };
}

/** Bands cleaned up: limits rising, the open-ended band last. Bad rows are dropped. */
export function cleanScale(raw: unknown): FeeBand[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const bands = v
    .map(b => ({ upTo: num((b as FeeBand)?.upTo), pct: num((b as FeeBand)?.pct) ?? 0, fixed: num((b as FeeBand)?.fixed) ?? 0 }))
    .filter(b => b.pct >= 0 && b.pct <= 100 && b.fixed >= 0 && (b.upTo == null || b.upTo > 0));
  const limited = bands.filter(b => b.upTo != null).sort((a, b) => a.upTo! - b.upTo!);
  const open = bands.find(b => b.upTo == null);
  // one band per limit
  const out: FeeBand[] = [];
  for (const b of limited) if (!out.length || out[out.length - 1].upTo !== b.upTo) out.push(b);
  if (open) out.push(open);
  return out;
}

/** Checks a scale typed on a form; returns the problem in words, or "". */
export function scaleProblem(bands: { upTo: string; pct: string; fixed: string }[]): string {
  if (!bands.length) return "";
  let prev = 0;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const last = i === bands.length - 1;
    const up = b.upTo.trim() === "" ? null : num(b.upTo);
    if (b.upTo.trim() !== "" && up == null) return `Band ${i + 1}: "${b.upTo}" isn't a price.`;
    if (up == null && !last) return `Band ${i + 1}: only the last band can be "and above" (leave its price blank).`;
    if (up != null && up <= prev) return `Band ${i + 1}: the prices must go up (each band starts where the one above ends).`;
    const pct = b.pct.trim() === "" ? 0 : num(b.pct);
    const fixed = b.fixed.trim() === "" ? 0 : num(b.fixed);
    if (pct == null || pct < 0 || pct > 100) return `Band ${i + 1}: the % must be between 0 and 100.`;
    if (fixed == null || fixed < 0) return `Band ${i + 1}: the fixed fee can't be negative.`;
    if (up != null) prev = up;
  }
  return "";
}

/** The band a sold price falls in (prices above the last limit use the last band). */
export function bandFor(scale: FeeBand[], hammer: number): FeeBand | null {
  if (!scale.length) return null;
  return scale.find(b => b.upTo == null || hammer <= b.upTo) || scale[scale.length - 1];
}

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pctT = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(2).replace(/0+$/, "")}%`;

/** "7.5%", "AED 300", "5% + AED 100" (and the Arabic). */
export function bandFeeText(b: FeeBand, lang: "EN" | "AR" = "EN") {
  const parts: string[] = [];
  if (b.pct > 0) parts.push(lang === "AR" ? `${pctT(b.pct)} من سعر البيع` : pctT(b.pct));
  if (b.fixed > 0) parts.push(lang === "AR" ? `${money(b.fixed)} درهم` : `AED ${money(b.fixed)}`);
  return parts.join(" + ") || (lang === "AR" ? "بدون عمولة" : "no fee");
}

/** "up to AED 5,000: AED 300; over 5,000 up to 20,000: 7.5%; over 20,000: 5%" */
export function scaleText(scale: FeeBand[], lang: "EN" | "AR" = "EN") {
  let prev: number | null = null;
  const parts = scale.map(b => {
    let range: string;
    if (lang === "AR") {
      range = b.upTo == null ? (prev == null ? "أي سعر" : `أكثر من ${money(prev)}`) : prev == null ? `حتى ${money(b.upTo)} درهم` : `من ${money(prev)} إلى ${money(b.upTo)}`;
    } else {
      range = b.upTo == null ? (prev == null ? "any price" : `over ${money(prev)}`) : prev == null ? `up to AED ${money(b.upTo)}` : `over ${money(prev)} up to ${money(b.upTo)}`;
    }
    if (b.upTo != null) prev = b.upTo;
    return `${range}: ${bandFeeText(b, lang)}`;
  });
  const lastBand = scale[scale.length - 1];
  if (lastBand && lastBand.upTo != null) parts.push(lang === "AR" ? `أكثر من ${money(lastBand.upTo)}: ${bandFeeText(lastBand, lang)}` : `over ${money(lastBand.upTo)}: ${bandFeeText(lastBand, lang)}`);
  return parts.join("; ");
}

type Flat = { fee_pct: number | null; fee_fixed: number | null };
type SellerLike = Flat & { fee_scale?: FeeBand[] | null; fee_scale_from?: string | null };
type SettingsLike = { fee_pct: number; fee_fixed: number; fee_scale?: FeeBand[]; fee_scale_from?: string | null };

/** A scale counts for an auction on or after its start date (no date: always; no auction date: from now on). */
const applies = (bands: FeeBand[] | null | undefined, from: string | null | undefined, saleDate?: string | null) =>
  !!bands?.length && (!from || !saleDate || saleDate >= from);

/**
 * Which fee applies to a consigned lot: its own % / fixed fee typed on the lot (or intake), else the seller's own scale,
 * else the seller's own % / fixed fee, else the standard scale (Settings), else the standard % / fixed fee.
 */
export function feeRule(lot: { seller_fee: number | null; fee_fixed: number | null } | null, seller: SellerLike | null | undefined, s: SettingsLike, saleDate?: string | null):
  { scale: FeeBand[] | null; pct: number; fixed: number; from: "lot" | "seller scale" | "seller" | "scale" | "default" } {
  const n0 = (v: number | null | undefined) => Number(v) || 0;
  const sellerPct = seller?.fee_pct != null ? seller.fee_pct : null;
  const sellerFixed = seller?.fee_fixed != null ? seller.fee_fixed : null;
  if (lot && (lot.seller_fee != null || lot.fee_fixed != null)) {
    return {
      scale: null, from: "lot",
      pct: n0(lot.seller_fee != null ? lot.seller_fee : sellerPct != null ? sellerPct : s.fee_pct),
      fixed: n0(lot.fee_fixed != null ? lot.fee_fixed : sellerFixed != null ? sellerFixed : s.fee_fixed)
    };
  }
  if (applies(seller?.fee_scale, seller?.fee_scale_from, saleDate)) return { scale: seller!.fee_scale!, pct: 0, fixed: 0, from: "seller scale" };
  if (sellerPct != null || sellerFixed != null) return { scale: null, pct: n0(sellerPct ?? s.fee_pct), fixed: n0(sellerFixed ?? s.fee_fixed), from: "seller" };
  if (applies(s.fee_scale, s.fee_scale_from, saleDate)) return { scale: s.fee_scale!, pct: 0, fixed: 0, from: "scale" };
  return { scale: null, pct: n0(s.fee_pct), fixed: n0(s.fee_fixed), from: "default" };
}

/** A rule in words, for documents: the scale, or "7.5% of the hammer price + AED 50 per item sold". */
export function ruleText(rule: ReturnType<typeof feeRule>, lang: "EN" | "AR" = "EN") {
  if (rule.scale) return scaleText(rule.scale, lang);
  const parts: string[] = [];
  if (rule.pct > 0) parts.push(lang === "AR" ? `${pctT(rule.pct)} من سعر البيع في المزاد` : `${pctT(rule.pct)} of the hammer price`);
  if (rule.fixed > 0) parts.push(lang === "AR" ? `${money(rule.fixed)} درهم لكل قطعة مباعة` : `AED ${money(rule.fixed)} per item sold`);
  return parts.join(" + ") || (lang === "AR" ? "بدون عمولة" : "none");
}
