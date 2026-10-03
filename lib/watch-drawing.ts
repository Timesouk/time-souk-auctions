// Draws a stylised watch as SVG from a lot's description. Used until real photos are uploaded.
type DrawLot = {
  id: string;
  lot_number?: number;
  brand?: string;
  model?: string;
  case_material?: string;
  bracelet?: string;
  dial_colour?: string;
  bezel?: string;
  shape?: string;
  hands?: string;
};

type Trio = [string, string, string];

export const DIALS: Record<string, Trio> = {
  black: ["#141619", "#30353b", "#ecebe4"],
  blue: ["#15336a", "#2f5ca8", "#eef1f4"],
  green: ["#16462e", "#2e7a51", "#eef1e9"],
  white: ["#e3e4e0", "#fbfbf9", "#1c1e22"],
  silver: ["#b5b9bc", "#e3e5e6", "#1c1e22"],
  champagne: ["#c3a66e", "#e8d6a8", "#2a2418"],
  grey: ["#464c52", "#6c737a", "#eff0ed"],
  brown: ["#46301f", "#7b5537", "#f2e8d8"],
  salmon: ["#d38f74", "#f0c2ad", "#2a1c16"],
  turquoise: ["#1c8a86", "#46bbb3", "#f2f7f6"]
};
const METALS: Record<string, Trio> = {
  steel: ["#c2c6ca", "#f0f2f3", "#838a91"],
  gold: ["#c79d45", "#f2da92", "#8a6824"],
  twotone: ["#c2c6ca", "#f0f2f3", "#838a91"],
  titanium: ["#8d939a", "#c6cbcf", "#5b6167"],
  black: ["#2b2e33", "#4d535a", "#101214"]
};
export const DIAL_OPTIONS = Object.keys(DIALS);
export const BEZEL_OPTIONS: [string, string][] = [
  ["smooth", "Smooth / polished"],
  ["fluted", "Fluted"],
  ["diver", "Rotating diver"],
  ["tachy", "Tachymeter"],
  ["gmt-bb", "GMT blue / black"],
  ["gmt-pr", "GMT red / blue"]
];
export const SHAPE_OPTIONS: [string, string][] = [
  ["round", "Round"],
  ["square", "Square"],
  ["cushion", "Cushion"],
  ["rect", "Rectangular"]
];
export const HANDS_OPTIONS: [string, string][] = [
  ["three", "Three-hand"],
  ["chrono", "Chronograph"],
  ["gmt", "GMT"]
];

function metalOf(s?: string) {
  const v = String(s || "").toLowerCase();
  if (/two|rolesor|steel (and|&) gold|bicolou?r/.test(v)) return "twotone";
  if (/gold|everose|sedna|rose|moonshine/.test(v)) return "gold";
  if (/titan/.test(v)) return "titanium";
  if (/ceramic|black|dlc|carbon/.test(v)) return "black";
  return "steel";
}
function strapOf(s?: string) {
  const v = String(s || "").toLowerCase();
  if (/rubber|oysterflex|fkm|silicone/.test(v)) return "rubber";
  if (/leather|alligator|calf|croco|strap|fabric|nato/.test(v)) return "leather";
  if (/jubilee|president/.test(v)) return "jubilee";
  return "bracelet";
}
const PT = (a: number, r: number): [number, number] => {
  const t = (a * Math.PI) / 180;
  return [+(100 + r * Math.sin(t)).toFixed(2), +(120 - r * Math.cos(t)).toFixed(2)];
};
const ln = (a: number, r1: number, r2: number, col: string, w: number, op?: number) => {
  const [x1, y1] = PT(a, r1);
  const [x2, y2] = PT(a, r2);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}"${op ? ` stroke-opacity="${op}"` : ""}/>`;
};
const tri = (r1: number, r2: number, spread: number, fill: string) => {
  const a = PT(-spread, r1), b = PT(spread, r1), c = PT(0, r2);
  return `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}Z" fill="${fill}"/>`;
};

function strapSVG(kind: string, x: number, w: number, y: number, h: number, M: Trio, mt: string, l: DrawLot) {
  let o = "";
  if (kind === "leather") {
    const s = String(l.bracelet || "").toLowerCase();
    const c = /black/.test(s) ? "#1e1e21" : /blue|navy/.test(s) ? "#22324f" : /green/.test(s) ? "#27402f" : /grey|gray/.test(s) ? "#4a4e53" : "#6b4228";
    o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c}"/><rect x="${x + 5}" y="${y - 3}" width="${w - 10}" height="${h + 6}" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="1" stroke-dasharray="3 3"/>`;
  } else if (kind === "rubber") {
    o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#1c1e21"/>`;
    for (let yy = y + 5; yy < y + h; yy += 9) o += `<rect x="${x + 9}" y="${yy}" width="${w - 18}" height="3" rx="1.5" fill="#30343a"/>`;
  } else {
    const jub = kind === "jubilee";
    const cols = jub ? [0.22, 0.18, 0.2, 0.18, 0.22] : [0.32, 0.36, 0.32];
    const step = jub ? 9 : 12;
    for (let yy = y; yy < y + h; yy += step) {
      let cx = x;
      cols.forEach((fr, i) => {
        const cw = w * fr;
        const mid = jub ? i % 2 === 1 : i === 1;
        const fill = mid ? (mt === "twotone" ? METALS.gold[1] : M[1]) : M[0];
        o += `<rect x="${(cx + 0.6).toFixed(1)}" y="${(yy + 0.6).toFixed(1)}" width="${(cw - 1.2).toFixed(1)}" height="${step - 1.2}" rx="${jub ? 2.5 : 1.5}" fill="${fill}" stroke="${M[2]}" stroke-width=".7"/>`;
        cx += cw;
      });
    }
  }
  return o;
}

function bezelSVG(l: DrawLot, M: Trio, mt: string) {
  const b = l.bezel || "smooth";
  const bm = mt === "twotone" ? METALS.gold : M;
  let o = "";
  if (b === "fluted") {
    o += `<circle cx="100" cy="120" r="57" fill="none" stroke="${bm[0]}" stroke-width="12"/>`;
    for (let a = 0; a < 360; a += 5) o += ln(a, 51.5, 62.5, bm[2], 1.1);
    o += `<circle cx="100" cy="120" r="51.2" fill="none" stroke="${bm[1]}" stroke-width="1"/>`;
  } else if (b === "diver" || b === "tachy") {
    const col = b === "tachy" ? "#141619" : l.dial_colour === "blue" ? "#1a3468" : l.dial_colour === "green" ? "#1b4c31" : "#141619";
    o += `<circle cx="100" cy="120" r="57" fill="none" stroke="${col}" stroke-width="12"/>`;
    for (let i = 1; i < 60; i++) {
      const major = i % 5 === 0;
      if (b === "diver" && !major && i > 15) continue;
      o += ln(i * 6, major ? 52.5 : 55, 61.5, "#dedcd2", major ? 1.8 : 0.8);
    }
    o += b === "diver" ? tri(61.5, 52.5, 5.5, "#ecebe2") : ln(0, 52.5, 61.5, "#dedcd2", 1.8);
  } else if (b === "gmt-bb" || b === "gmt-pr") {
    const [top, bot] = b === "gmt-bb" ? ["#1f3f8f", "#16181b"] : ["#b3282c", "#1f3f8f"];
    o += `<path d="M43 120A57 57 0 0 1 157 120" fill="none" stroke="${top}" stroke-width="12"/><path d="M157 120A57 57 0 0 1 43 120" fill="none" stroke="${bot}" stroke-width="12"/>`;
    for (let i = 1; i < 24; i++) o += ln(i * 15, i % 2 ? 55.5 : 53, 61.5, "#e6e4da", i % 2 ? 0.9 : 1.8);
    o += tri(61.5, 52.5, 5.5, "#ecebe2");
  } else {
    o += `<circle cx="100" cy="120" r="59" fill="none" stroke="${bm[1]}" stroke-width="5"/><circle cx="100" cy="120" r="56" fill="none" stroke="${bm[2]}" stroke-width="1"/>`;
  }
  return o + `<circle cx="100" cy="120" r="63.3" fill="none" stroke="${bm[2]}" stroke-width="1"/>`;
}

function markersRound(l: DrawLot, mk: string, hasDate: boolean) {
  const dot = ["diver", "gmt-bb", "gmt-pr"].includes(l.bezel || "");
  let o = "";
  for (let i = 0; i < 60; i++) if (i % 5) o += ln(i * 6, 45.6, 47.6, mk, 0.7, 0.55);
  for (let i = 0; i < 12; i++) {
    const a = i * 30;
    if (i === 3 && hasDate) continue;
    if (dot) {
      if (i === 0) o += tri(45, 35.5, 6, mk);
      else if (i % 3 === 0) o += ln(a, 35, 45, mk, 5);
      else {
        const [x, y] = PT(a, 40.5);
        o += `<circle cx="${x}" cy="${y}" r="3.4" fill="${mk}"/>`;
      }
    } else if (i === 0) {
      o += ln(-2.6, 35, 45, mk, 2.6) + ln(2.6, 35, 45, mk, 2.6);
    } else o += ln(a, 36, 45, mk, 3.1);
  }
  return o;
}

function subdialsSVG(light: boolean, dial: Trio, mk: string) {
  const fill = light ? "#202328" : dial[1];
  const hand = light ? "#f1f1ec" : mk;
  return ([[78, 120, 5, -7], [122, 120, -3, -8], [100, 142, 6, 4]] as const)
    .map(([x, y, dx, dy]) => `<circle cx="${x}" cy="${y}" r="10.5" fill="${fill}" stroke="${mk}" stroke-opacity=".5" stroke-width=".8"/><line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${hand}" stroke-width="1.2"/>`)
    .join("");
}

function handsSVG(l: DrawLot, hc: string, s: number) {
  let o = `<g transform="translate(100 120) scale(${s}) translate(-100 -120)">`;
  if (l.hands === "gmt") o += `<g transform="rotate(140 100 120)"><rect x="99.3" y="79" width="1.4" height="41" fill="#d23b2c"/><path d="M100 71L95.2 80.5L104.8 80.5Z" fill="#d23b2c"/></g>`;
  o += `<g transform="rotate(305 100 120)"><rect x="97.2" y="95" width="5.6" height="29" rx="2.4" fill="${hc}" stroke="#0e0f11" stroke-opacity=".35" stroke-width=".6"/></g>`;
  o += `<g transform="rotate(60 100 120)"><rect x="98.1" y="80" width="3.8" height="44" rx="1.8" fill="${hc}" stroke="#0e0f11" stroke-opacity=".35" stroke-width=".6"/></g>`;
  o += `<g transform="rotate(200 100 120)"><rect x="99.45" y="77" width="1.1" height="54" fill="#d23b2c"/></g>`;
  return o + `<circle cx="100" cy="120" r="3.6" fill="${hc}"/><circle cx="100" cy="120" r="1.5" fill="#d23b2c"/></g>`;
}

export function watchSVG(l: DrawLot, prefix = "w") {
  const id = prefix + String(l.id).replace(/[^\w-]/g, "");
  const dial = DIALS[l.dial_colour || ""] || DIALS.black;
  const mt = metalOf(l.case_material);
  const M = METALS[mt];
  const shape = l.shape || "round";
  const light = ["white", "silver", "champagne", "salmon"].includes(l.dial_colour || "");
  const hc = light ? "#1c1e22" : mt === "gold" ? "#f0d894" : dial[2];
  const mk = light ? "#1c1e22" : mt === "gold" ? "#e9cd80" : dial[2];
  const st = strapOf(l.bracelet);
  const bw = shape === "rect" ? 50 : 58;
  const bx = 100 - bw / 2;
  const hasDate = /\bdate|datejust/i.test(l.model || "") && l.hands !== "chrono";
  let o = `<svg class="watch" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
  o += `<defs><linearGradient id="m${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${M[1]}"/><stop offset=".5" stop-color="${M[0]}"/><stop offset="1" stop-color="${M[2]}"/></linearGradient><radialGradient id="d${id}" cx=".38" cy=".32" r=".85"><stop offset="0" stop-color="${dial[1]}"/><stop offset="1" stop-color="${dial[0]}"/></radialGradient></defs>`;
  o += strapSVG(st, bx, bw, 0, 62, M, mt, l) + strapSVG(st, bx, bw, 178, 62, M, mt, l);
  let hs = 1;
  if (shape === "round") {
    o += `<rect x="${bx - 5}" y="46" width="${bw + 10}" height="148" rx="12" fill="url(#m${id})" stroke="${M[2]}" stroke-width=".8"/>`;
    o += `<rect x="163" y="111" width="10" height="18" rx="2.5" fill="url(#m${id})" stroke="${M[2]}" stroke-width=".8"/>`;
    o += `<circle cx="100" cy="120" r="65" fill="url(#m${id})" stroke="${M[2]}" stroke-width="1"/>`;
    o += bezelSVG(l, M, mt);
    o += `<circle cx="100" cy="120" r="49" fill="url(#d${id})"/>`;
    o += markersRound(l, mk, hasDate);
  } else {
    const isRect = shape === "rect";
    const c = isRect ? { x: 60, y: 58, w: 80, h: 124, r: 7 } : { x: 42, y: 62, w: 116, h: 116, r: shape === "cushion" ? 34 : 18 };
    const d = isRect ? { x: 70, y: 70, w: 60, h: 100, r: 3 } : { x: 57, y: 77, w: 86, h: 86, r: shape === "cushion" ? 22 : 9 };
    o += `<rect x="${bx - 5}" y="48" width="${bw + 10}" height="144" rx="10" fill="url(#m${id})" stroke="${M[2]}" stroke-width=".8"/>`;
    const crx = c.x + c.w - 2;
    o += `<rect x="${crx}" y="111" width="9" height="18" rx="2" fill="url(#m${id})" stroke="${M[2]}" stroke-width=".8"/>`;
    if (/cartier/i.test(l.brand || "")) o += `<circle cx="${crx + 10}" cy="120" r="4" fill="#2848a8"/>`;
    o += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${c.r}" fill="url(#m${id})" stroke="${M[2]}" stroke-width="1"/>`;
    if (!isRect) o += `<rect x="${c.x + 7}" y="${c.y + 7}" width="${c.w - 14}" height="${c.h - 14}" rx="${Math.max(c.r - 6, 4)}" fill="none" stroke="${M[1]}" stroke-width="2.4"/>`;
    if (!isRect && /santos/i.test(l.model || "")) {
      [[50, 70], [100, 68], [150, 70], [152, 120], [150, 170], [100, 172], [50, 170], [48, 120]].forEach(([x, y]) => {
        o += `<circle cx="${x}" cy="${y}" r="2.3" fill="${M[1]}" stroke="${M[2]}" stroke-width=".7"/>`;
      });
    }
    o += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${d.r}" fill="url(#d${id})"/>`;
    const rx = isRect ? 24 : 34;
    const ry = isRect ? 42 : 34;
    for (let i = 0; i < 12; i++) {
      if (i === 3 && hasDate) continue;
      const t = (i * Math.PI) / 6, sx = Math.sin(t), cy = -Math.cos(t);
      o += `<line x1="${(100 + sx * rx).toFixed(1)}" y1="${(120 + cy * ry).toFixed(1)}" x2="${(100 + sx * (rx - 6)).toFixed(1)}" y2="${(120 + cy * (ry - 6)).toFixed(1)}" stroke="${mk}" stroke-width="${i === 0 ? 3.4 : 2.4}"/>`;
    }
    if (isRect) o += `<rect x="${d.x + 5}" y="${d.y + 5}" width="${d.w - 10}" height="${d.h - 10}" fill="none" stroke="${mk}" stroke-opacity=".45" stroke-width=".7"/>`;
    hs = isRect ? 0.7 : 0.78;
  }
  if (l.hands === "chrono") o += subdialsSVG(light, dial, mk);
  if (hasDate) o += `<rect x="126" y="114.5" width="15" height="11" fill="#f7f6f0" stroke="${M[2]}" stroke-width=".8"/>`;
  o += handsSVG(l, hc, hs);
  return o + "</svg>";
}
