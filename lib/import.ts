// Turns rows pasted from Excel or Google Sheets (tab-separated, with a header row) into lots.
export const HEAD_COLS = [
  "Brand", "Model", "Ref", "Year", "Size mm", "Case", "Dial", "Dial colour", "Bezel", "Shape", "Hands", "Bracelet",
  "Box", "Papers", "Condition", "Est low", "Est high", "Start bid", "No reserve", "Reserve", "Source", "Cost",
  "Consignor", "Consignor phone", "Seller fee %", "Photo link", "Notes"
];

const KEYS: Record<string, string> = {
  brand: "brand", make: "brand", model: "model", ref: "ref", reference: "ref", "ref.": "ref", year: "year",
  "size mm": "size", size: "size", case: "caseMat", "case material": "caseMat", material: "caseMat", dial: "dial",
  "dial colour": "dc", "dial color": "dc", bezel: "bezel", shape: "shape", hands: "style", style: "style", complication: "style",
  bracelet: "bracelet", strap: "bracelet", box: "box", papers: "papers", condition: "cond",
  "est low": "lo", "estimate low": "lo", "low estimate": "lo", "est high": "hi", "estimate high": "hi", "high estimate": "hi",
  "start bid": "start", start: "start", "starting bid": "start", "no reserve": "nr", reserve: "reserve", source: "src",
  cost: "cost", "cost price": "cost", consignor: "consignor", "consignor phone": "phone", "seller fee %": "fee", "seller fee": "fee",
  "commission %": "fee", commission: "fee", "photo link": "photo", photos: "photo", notes: "notes", "condition report": "notes"
};
const DIALS = ["black", "blue", "green", "white", "silver", "champagne", "grey", "brown", "salmon", "turquoise"];
const CONDS = ["Unworn", "Excellent", "Very good", "Good", "Fair"];

export type ImportedLot = {
  pub: {
    brand: string; model: string; reference: string; year: string; case_size: string; case_material: string; dial: string;
    dial_colour: string; bezel: string; shape: string; hands: string; bracelet: string; has_box: boolean; has_papers: boolean;
    condition: string; notes_en: string; estimate_low: number; estimate_high: number; start_price: number; no_reserve: boolean; photos: string[];
  };
  priv: { reserve: number | null; source: "stock" | "consign"; cost: number | null; consignor_name: string; consignor_phone: string; seller_fee: number | null };
};

const toNum = (v: string | undefined) => {
  const x = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const yes = (v: string | undefined) => /^(y|yes|true|1|✓|x)$/i.test(String(v || "").trim());

function normDial(v: string) {
  const s = v.toLowerCase();
  return DIALS.find(k => s.includes(k)) || (s.includes("gray") ? "grey" : s.includes("gold") ? "champagne" : "black");
}
function normBezel(v: string) {
  const s = v.toLowerCase();
  if (/flut/.test(s)) return "fluted";
  if (/batman|blnr|blue.?black/.test(s)) return "gmt-bb";
  if (/pepsi|blro|red.?blue/.test(s)) return "gmt-pr";
  if (/tachy/.test(s)) return "tachy";
  if (/div|rotat|ceramic insert/.test(s)) return "diver";
  return "smooth";
}

export function parsePaste(text: string): { lots: ImportedLot[]; skipped: number[] } {
  const rows = String(text || "").replace(/\r/g, "").split("\n").filter(r => r.trim()).map(r => r.split("\t"));
  if (!rows.length) return { lots: [], skipped: [] };
  const norm = (h: string) => String(h || "").trim().toLowerCase().replace(/\s+/g, " ");
  let map = rows[0].map(h => KEYS[norm(h)] || null);
  let body = rows.slice(1);
  if (!map.includes("brand") || !map.includes("model")) {
    map = HEAD_COLS.map(h => KEYS[norm(h)]);
    body = rows;
  }
  const lots: ImportedLot[] = [];
  const skipped: number[] = [];
  body.forEach((r, i) => {
    const o: Record<string, string> = {};
    map.forEach((k, j) => {
      if (k) o[k] = (r[j] || "").trim();
    });
    if (!o.brand || !o.model) {
      skipped.push(i + 2);
      return;
    }
    const lo = toNum(o.lo);
    const hi = toNum(o.hi) || lo;
    let start = toNum(o.start);
    if (!start) start = Math.max(500, Math.round((lo * 0.7) / 500) * 500);
    const style = /chrono/i.test(o.style || "") ? "chrono" : /gmt/i.test(o.style || "") ? "gmt" : o.style ? "three"
      : /chrono|daytona|speedmaster|navitimer|monaco|chronomat|el primero/i.test(o.model) ? "chrono" : /gmt/i.test(o.model) ? "gmt" : "three";
    const shape = /square/i.test(o.shape || "") ? "square" : /cushion|tonneau/i.test(o.shape || "") ? "cushion" : /rect|tank/i.test(o.shape || "") ? "rect" : "round";
    const nr = yes(o.nr);
    const photo = /^https?:\/\//i.test(o.photo || "") ? [o.photo] : [];
    lots.push({
      pub: {
        brand: o.brand, model: o.model, reference: o.ref || "", year: o.year || "", case_size: o.size || "", case_material: o.caseMat || "Steel",
        dial: o.dial || (o.dc ? o.dc[0].toUpperCase() + o.dc.slice(1) : ""), dial_colour: normDial(o.dc || o.dial || ""), bezel: normBezel(o.bezel || ""),
        shape, hands: style, bracelet: o.bracelet || "", has_box: o.box === undefined ? true : yes(o.box), has_papers: o.papers === undefined ? true : yes(o.papers),
        condition: CONDS.find(c => c.toLowerCase() === String(o.cond || "").toLowerCase()) || o.cond || "Excellent",
        notes_en: o.notes || "", estimate_low: lo, estimate_high: hi, start_price: start, no_reserve: nr, photos: photo
      },
      priv: {
        reserve: nr ? null : toNum(o.reserve) || null,
        source: /consign/i.test(o.src || "") ? "consign" : "stock",
        cost: toNum(o.cost) || null,
        consignor_name: o.consignor || "",
        consignor_phone: o.phone || "",
        seller_fee: o.fee ? toNum(o.fee) : null
      }
    });
  });
  return { lots, skipped };
}
