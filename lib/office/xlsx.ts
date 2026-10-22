// Reads an Excel workbook (.xlsx / .xlsm) in the browser, with no extra libraries:
// the file is a zip of XML parts, unzipped with the browser's own DecompressionStream.
// Only the values Excel last saved are read (formulas are not recalculated), and macros are never run.

export type Cell = string | number | boolean | null;
/** Rows of cell values; row 1 is index 1 and column A is index 1 (index 0 is unused). */
export type SheetRows = Cell[][];

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files inside a zip, by name (only the ones `want` accepts). */
export async function unzip(buf: ArrayBuffer | Uint8Array, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This isn't an Excel file (.xlsx or .xlsm).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("The workbook file looks damaged.");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(start, start + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error(`Unsupported compression in ${name}.`);
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function unescapeXml(s: string) {
  return s
    .replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]
    )
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** All the text inside <t> elements (rich text runs joined). */
function textOf(xml: string) {
  let s = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) s += m[1] ? unescapeXml(m[1]) : "";
  return s;
}

/** "AB12" → column 28 */
export function colNum(ref: string) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n;
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    // phonetic runs (<rPh>) are not part of the value
    out.push(m[1] ? textOf(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "")) : "");
  }
  return out;
}

/** One sheet's cell values. `maxCol` stops reading wide sheets early. */
export function parseSheet(xml: string, shared: string[], maxCol = 80): SheetRows {
  const rows: SheetRows = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm: RegExpExecArray | null;
  let autoRow = 0;
  while ((rm = rowRe.exec(xml))) {
    const rAttr = /\br="(\d+)"/.exec(rm[1]);
    const r = rAttr ? Number(rAttr[1]) : autoRow + 1;
    autoRow = r;
    const row: Cell[] = [];
    let cm: RegExpExecArray | null;
    let autoCol = 0;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[2]))) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
      const c = ref ? colNum(ref[1]) : autoCol + 1;
      autoCol = c;
      if (c > maxCol || !cm[2]) continue;
      const t = /\bt="(\w+)"/.exec(attrs)?.[1] || "n";
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2]);
      let val: Cell = null;
      if (t === "s") val = v ? shared[Number(v[1])] ?? "" : null;
      else if (t === "inlineStr") val = textOf(/<is>([\s\S]*?)<\/is>/.exec(cm[2])?.[1] || "");
      else if (t === "str") val = v ? unescapeXml(v[1]) : "";
      else if (t === "b") val = v ? v[1] === "1" : null;
      else if (t === "e") val = null;
      else if (v) {
        const x = Number(v[1]);
        val = Number.isFinite(x) ? x : unescapeXml(v[1]);
      }
      if (val !== null && val !== "") row[c] = val;
    }
    rows[r] = row;
  }
  return rows;
}

/** Sheet name → its XML part inside the zip. */
export function sheetParts(workbookXml: string, relsXml: string): Map<string, string> {
  const rels = new Map<string, string>();
  const relRe = /<Relationship\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(relsXml))) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const out = new Map<string, string>();
  const shRe = /<sheet\b([^>]*)\/?>/g;
  while ((m = shRe.exec(workbookXml))) {
    const name = /\bname="([^"]*)"/.exec(m[1])?.[1];
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1] || /\bid="([^"]+)"/.exec(m[1])?.[1];
    if (name && rid && rels.has(rid)) out.set(unescapeXml(name), rels.get(rid)!);
  }
  return out;
}

/** Reads the named sheets from a workbook file. Sheets that aren't there are left out. */
export async function readWorkbook(buf: ArrayBuffer | Uint8Array, names: string[]): Promise<Record<string, SheetRows>> {
  const dec = new TextDecoder();
  const base = await unzip(buf, n => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml");
  const wb = base.get("xl/workbook.xml");
  const rels = base.get("xl/_rels/workbook.xml.rels");
  if (!wb || !rels) throw new Error("This isn't an Excel workbook.");
  const parts = sheetParts(dec.decode(wb), dec.decode(rels));
  const wanted = new Map<string, string>();
  for (const n of names) {
    const part = parts.get(n);
    if (part) wanted.set(part, n);
  }
  const files = await unzip(buf, n => wanted.has(n));
  const ss = base.get("xl/sharedStrings.xml");
  const shared = ss ? parseSharedStrings(dec.decode(ss)) : [];
  const out: Record<string, SheetRows> = {};
  for (const [part, name] of wanted) {
    const data = files.get(part);
    if (data) out[name] = parseSheet(dec.decode(data), shared);
  }
  return out;
}

// ───────────────────────────── Excel values ─────────────────────────────

/** Excel's date serial (1 = 1 Jan 1900, with its 1900 leap-year quirk) → milliseconds, as wall-clock UTC. */
export const serialToMs = (n: number) => Math.round((n - 25569) * 86400e3);

/** A date cell as yyyy-mm-dd ("" if empty). Accepts a serial or typed text like 18/10/2026. */
export function cellDate(v: Cell): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v > 0 ? new Date(serialToMs(v)).toISOString().slice(0, 10) : "";
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

/** A time cell (fraction of a day, or "21:00") as "21:00" ("" if empty). */
export function cellTime(v: Cell): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const mins = Math.round((v - Math.floor(v)) * 1440) % 1440;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(String(v));
  if (!m) return "";
  let h = Number(m[1]) % 24;
  if (m[3]) h = (h % 12) + (/pm/i.test(m[3]) ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** A date-and-time cell (Dubai wall clock) as an ISO instant ("" if empty). */
export function cellInstant(v: Cell): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v > 0 ? new Date(serialToMs(v) - 4 * 3600e3).toISOString() : "";
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

export const cellText = (v: Cell) => (v == null ? "" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(v)) : String(v)).trim();

/** A number cell (null if empty or not a number). */
export function cellNum(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return null;
  const x = Number(String(v).replace(/[^\d.-]/g, ""));
  return String(v).trim() && Number.isFinite(x) ? x : null;
}
