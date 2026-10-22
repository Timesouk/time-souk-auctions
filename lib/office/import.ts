// Turns the auction workbook (Time Souk Auction Manager .xlsm) into back-office records.
// Runs in the browser: only typed values are taken (never the calculated columns), and the
// Ziina API key on Settings is never read, so it can't leave the computer.
import {
  EXCEPTIONS, UAE,
  type Adjustment, type CardLink, type Customer, type IntakeItem, type LedgerEntry, type MessageOverrides, type OAuction, type OfficeData,
  type OfficeSettings, type OLot, type Seller, type SentLog
} from "./types";
import { DEFAULTS, MESSAGE_KEYS, OLD_DEFAULTS } from "./messages";
import { cellDate, cellInstant, cellNum, cellText, cellTime, type Cell, type SheetRows } from "./xlsx";
import { toE164 } from "../format";

export const SHEETS = ["Settings", "Auctions", "Lots", "Buyers", "Sellers", "Intake", "Payments", "Adjustments", "Sent Log", "Card Links", "Messages"];

export type ImportAuction = { number: number; sale_date: string; live_time: string; pay_clock: string; office_notes: string; lot_target: number | null };
export type ImportSeller = Omit<Seller, "id">;
export type ImportCustomer = Omit<Customer, "id" | "profile_id">;
export type ImportIntake = Omit<IntakeItem, "id" | "seller_id"> & { seller_code: string };
export type ImportLot = {
  auction_number: number;
  lot_number: number;
  brand: string;
  model: string;
  reference: string;
  year: string;
  condition: string;
  box_papers: string;
  serial: string;
  seller_code: string;
  intake_item: string;
  intake_date: string | null;
  start_price: number;
  reserve: number | null;
  cost: number | null;
  /** percent: 7.5 = 7.5% */
  fee_pct: number | null;
  fee_fixed: number | null;
  winner_text: string;
  winner_code: string;
  hammer: number | null;
  underbidder: string;
  underbid: number | null;
  exception: string | null;
  delivery_status: string;
  dispatched_on: string | null;
  courier: string;
  seller_paid_on: string | null;
  payout_ref: string;
  office_notes: string;
  tray: number | null;
  slip_printed_at: string | null;
};
export type ImportLedger = { import_ref: string; entry_date: string; kind: "Deposit" | "Payment" | "Refund"; customer_code: string; invoice_no: string; method: string; amount: number; reference: string; received_by: string; notes: string };
export type ImportSent = { import_ref: string; sent_at: string; ref: string; name: string; phone: string; total: number | null; balance: number | null; file: string; kind: string; link: string };
export type ImportCard = {
  import_ref: string; created_at: string; kind: "Invoice" | "Lot" | "Deposit"; invoice_no: string; lot_key: string; customer_code: string; name: string;
  amount: number; fee: number; card_amount: number; expires_at: string | null; ziina_id: string | null; url: string; status: string; checked_at: string | null;
};

export type ImportPlan = {
  settings: Partial<OfficeSettings>;
  messages: { key: string; en: string | null; ar: string | null }[];
  auctions: ImportAuction[];
  sellers: ImportSeller[];
  customers: ImportCustomer[];
  intake: ImportIntake[];
  lots: ImportLot[];
  adjustments: Adjustment[];
  ledger: ImportLedger[];
  sent: ImportSent[];
  cards: ImportCard[];
  warnings: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Finds a table by one of its headings and gives its columns by heading (a heading matches by its start). */
function table(rows: SheetRows | undefined, anchor: string, scan = 8) {
  if (!rows) return null;
  for (let r = 1; r <= scan; r++) {
    const row = rows[r] || [];
    const heads = Array.from(row, v => (v == null ? "" : norm(String(v))));
    if (!heads.some(h => h === norm(anchor))) continue;
    const col = (...starts: string[]) => {
      for (const st of starts) {
        const want = norm(st);
        const i = heads.findIndex(h => h === want);
        if (i > 0) return i;
      }
      for (const st of starts) {
        const want = norm(st);
        const i = heads.findIndex(h => h.startsWith(want));
        if (i > 0) return i;
      }
      return 0;
    };
    return { header: r, col, rows };
  }
  return null;
}

type Getter = (c: number) => Cell;

function eachRow(t: NonNullable<ReturnType<typeof table>>, keyCol: number, fn: (get: Getter, r: number) => void) {
  for (let r = t.header + 1; r < t.rows.length; r++) {
    const row = t.rows[r];
    if (!row || !keyCol) continue;
    const get: Getter = c => (c ? row[c] ?? null : null);
    if (cellText(get(keyCol)) === "") continue;
    fn(get, r);
  }
}

const yes = (v: Cell) => /^(y|yes|true|1|نعم)$/i.test(cellText(v));
const langOf = (v: Cell): "" | "both" | "en" | "ar" => {
  const s = cellText(v).toLowerCase();
  if (!s) return "";
  if (s.includes("+") || s.includes("both") || (s.includes("english") && s.includes("arabic"))) return "both";
  if (s.startsWith("ar")) return "ar";
  if (s.startsWith("en")) return "en";
  return "";
};
/** A workbook fraction (0.075) as a percent (7.5); a typed "7.5%" or 7.5 stays 7.5. */
const pct = (v: Cell) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round((Math.abs(v) <= 1 ? v * 100 : v) * 1000) / 1000;
  const n = cellNum(v);
  return n == null ? null : n;
};
const money = (v: Cell) => {
  const n = cellNum(v);
  return n == null ? null : Math.round(n * 100) / 100;
};
const phone = (v: Cell) => {
  const t = cellText(v);
  return t ? toE164(t) || t : "";
};
const nullIfBlank = (s: string) => (s ? s : null);

const SETTINGS: [string, keyof OfficeSettings, "text" | "num" | "pct" | "time" | "lang" | "wamode" | "linkmode"][] = [
  ["Trading name", "trading_name", "text"],
  ["Legal name", "legal_name", "text"],
  ["Trade licence no.", "licence", "text"],
  ["Address", "address", "text"],
  ["Phone / WhatsApp", "phone", "text"],
  ["Email", "email", "text"],
  ["Instagram", "instagram", "text"],
  ["Website", "website", "text"],
  ["VAT TRN", "trn", "text"],
  ["Name shown to customers", "brand_name", "text"],
  ["Bank name", "bank_name", "text"],
  ["Account name", "bank_account", "text"],
  ["IBAN", "bank_iban", "text"],
  ["SWIFT / BIC", "bank_swift", "text"],
  ["Seller fee (default)", "fee_pct", "pct"],
  ["Minimum seller fee (AED)", "fee_min", "num"],
  ["VAT on seller fee", "vat_fee_pct", "pct"],
  ["VAT on buyer invoices", "vat_sales_pct", "pct"],
  ["Hours to pay", "hours_to_pay", "num"],
  ["Standard UAE delivery (AED)", "uae_fee", "num"],
  ["Cash on delivery charge (AED)", "cod_fee", "num"],
  ["Cash payment alert (AED)", "cash_alert", "num"],
  ["Lots per auction (target)", "lot_target", "num"],
  ["Seller fixed fee per sold lot (AED)", "fee_fixed", "num"],
  ["Line under the lots on invoices", "inv_note", "text"],
  ["Invoice terms (small print)", "inv_terms", "text"],
  ["Seller declaration (statements)", "seller_terms", "text"],
  ["Line at the bottom of the slip", "slip_note", "text"],
  ["WhatsApp opens in", "wa_mode", "wamode"],
  ["WhatsApp language", "wa_lang", "lang"],
  ["Payment clock starts at (auction day)", "pay_clock", "time"],
  ["Card payment fee", "card_fee_pct", "pct"],
  ["Card payment links", "link_mode", "linkmode"],
  ["Remind again after (hours)", "remind_gap_hours", "num"],
  ["Intake receipt declaration", "intake_terms", "text"]
];

function readSettings(rows: SheetRows | undefined, warnings: string[]) {
  const out: Partial<OfficeSettings> = {};
  if (!rows) {
    warnings.push("No Settings sheet: company details were left as they are.");
    return out;
  }
  const byLabel = new Map<string, Cell>();
  let methodsCol = 0;
  let methodsHead = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const label = cellText(row[2] ?? null);
    // Never read anything about Ziina (the API key lives there).
    if (label && !/ziina|api key/i.test(label)) byLabel.set(norm(label), row[3] ?? null);
    for (let c = 1; c < row.length; c++) {
      if (!methodsCol && norm(cellText(row[c] ?? null)) === "card fee applies to") {
        methodsCol = c;
        methodsHead = r;
      }
    }
  }
  const s = out as Record<string, unknown>;
  for (const [label, key, kind] of SETTINGS) {
    if (!byLabel.has(norm(label))) continue;
    const v = byLabel.get(norm(label)) ?? null;
    if (kind === "text") s[key] = cellText(v);
    else if (kind === "num") {
      const n = cellNum(v);
      if (n != null) s[key] = n;
    } else if (kind === "pct") {
      const n = pct(v);
      if (n != null) s[key] = n;
    } else if (kind === "time") {
      const t = cellTime(v);
      if (t) s[key] = t;
    } else if (kind === "lang") s[key] = langOf(v) || "both";
    else if (kind === "wamode") s[key] = /web/i.test(cellText(v)) ? "web" : "app";
    else if (kind === "linkmode") s[key] = /every/i.test(cellText(v)) ? "always" : "ask";
  }
  if (methodsCol) {
    const list: string[] = [];
    for (let r = methodsHead + 1; r < rows.length; r++) {
      const t = cellText(rows[r]?.[methodsCol] ?? null);
      if (t) list.push(t);
    }
    if (list.length) out.card_fee_methods = list;
  }
  return out;
}

function readMessages(rows: SheetRows | undefined) {
  const out: ImportPlan["messages"] = [];
  const t = table(rows, "Key (don't change)");
  if (!t) return out;
  const cKey = t.col("Key");
  const cEn = t.col("English");
  const cAr = t.col("Arabic");
  eachRow(t, cKey, get => {
    const key = cellText(get(cKey));
    if (!MESSAGE_KEYS.has(key)) return;
    const d = DEFAULTS.get(key)!;
    const old = OLD_DEFAULTS[key] || [];
    const en = cellText(get(cEn));
    const ar = cellText(get(cAr));
    const ownEn = en && en !== d.en && !old.some(o => o.en === en) ? en : null;
    const ownAr = ar && ar !== d.ar && !old.some(o => o.ar === ar) ? ar : null;
    if (ownEn || ownAr) out.push({ key, en: ownEn, ar: ownAr });
  });
  return out;
}

/** The whole workbook, as records ready to save. */
export function planImport(sheets: Record<string, SheetRows>): ImportPlan {
  const warnings: string[] = [];
  const plan: ImportPlan = {
    settings: readSettings(sheets["Settings"], warnings),
    messages: readMessages(sheets["Messages"]),
    auctions: [], sellers: [], customers: [], intake: [], lots: [], adjustments: [], ledger: [], sent: [], cards: [], warnings
  };

  // Auctions
  const au = table(sheets["Auctions"], "Auction no.");
  if (au) {
    const c = { n: au.col("Auction no."), d: au.col("Date"), live: au.col("Live starts"), clock: au.col("Payment clock"), notes: au.col("Notes"), target: au.col("Lot target") };
    eachRow(au, c.n, get => {
      const number = cellNum(get(c.n));
      if (!number || number < 1) return;
      const sale_date = cellDate(get(c.d));
      if (!sale_date) return; // the sheet lists auction numbers ahead; only dated ones are real
      plan.auctions.push({ number, sale_date, live_time: cellTime(get(c.live)) || "21:00", pay_clock: cellTime(get(c.clock)), office_notes: cellText(get(c.notes)), lot_target: cellNum(get(c.target)) });
    });
  } else warnings.push("No Auctions sheet found.");
  const auctionNos = new Set(plan.auctions.map(a => a.number));

  // Sellers
  const se = table(sheets["Sellers"], "Seller ID");
  if (se) {
    const c = {
      id: se.col("Seller ID"), name: se.col("Name"), type: se.col("Type"), phone: se.col("Phone"), ig: se.col("Instagram"), email: se.col("Email"),
      idc: se.col("ID checked"), fee: se.col("Fee % (blank"), bank: se.col("Bank"), iban: se.col("IBAN"), notes: se.col("Notes"), fixed: se.col("Fixed fee per sold lot")
    };
    eachRow(se, c.id, get => {
      if (!cellText(get(c.name)) && !cellText(get(c.phone)) && !cellText(get(c.ig)) && !cellText(get(c.email))) return; // IDs listed ahead
      plan.sellers.push({
        code: cellText(get(c.id)).toUpperCase(), name: cellText(get(c.name)), kind: /own/i.test(cellText(get(c.type))) ? "own" : "consignment",
        phone: phone(get(c.phone)), instagram: cellText(get(c.ig)), email: cellText(get(c.email)), id_checked: cellText(get(c.idc)),
        fee_pct: pct(get(c.fee)), fee_fixed: money(get(c.fixed)), bank: cellText(get(c.bank)), iban: cellText(get(c.iban)), notes: cellText(get(c.notes))
      });
    });
  }
  const sellerCodes = new Set(plan.sellers.map(s => s.code));

  // Buyers
  const bu = table(sheets["Buyers"], "Buyer ID");
  if (bu) {
    const c = {
      id: bu.col("Buyer ID"), ig: bu.col("Instagram handle"), name: bu.col("Full name"), phone: bu.col("Phone"), email: bu.col("Email"), addr: bu.col("Delivery address"),
      area: bu.col("Area / city"), country: bu.col("Country"), delivery: bu.col("Delivery"), pay: bu.col("Usually pays by"), idc: bu.col("ID checked"),
      flag: bu.col("Flag"), notes: bu.col("Notes"), lang: bu.col("WhatsApp language")
    };
    eachRow(bu, c.id, get => {
      if (!cellText(get(c.ig)) && !cellText(get(c.name)) && !cellText(get(c.phone)) && !cellText(get(c.email))) return; // IDs listed ahead
      const flag = cellText(get(c.flag));
      const delivery = cellText(get(c.delivery));
      const country = cellText(get(c.country));
      plan.customers.push({
        code: cellText(get(c.id)).toUpperCase(), instagram: cellText(get(c.ig)).replace(/^@+/, "") || null, full_name: cellText(get(c.name)), phone: phone(get(c.phone)),
        email: cellText(get(c.email)), address: cellText(get(c.addr)), area: cellText(get(c.area)), country: country === UAE ? "" : country,
        delivery: delivery === "Pickup" || delivery === "Courier" ? delivery : "", usual_pay: cellText(get(c.pay)), id_checked: yes(get(c.idc)),
        flag: flag === "Watch" || flag === "Blocked" ? flag : "OK", notes: cellText(get(c.notes)), lang: langOf(get(c.lang))
      });
    });
  } else warnings.push("No Buyers sheet found.");
  const buyerCodes = new Set(plan.customers.map(b => b.code));
  const byHandle = new Map(plan.customers.filter(b => b.instagram).map(b => [b.instagram!.toLowerCase(), b.code]));
  const resolveBuyer = (typed: string, calc: string) => {
    const code = calc.toUpperCase();
    if (code && buyerCodes.has(code)) return code;
    const t = typed.trim();
    if (!t) return "";
    if (buyerCodes.has(t.toUpperCase())) return t.toUpperCase();
    return byHandle.get(t.replace(/^@+/, "").toLowerCase()) || "";
  };

  // Intake
  const it = table(sheets["Intake"], "Receipt no.");
  if (it) {
    const c = {
      rc: it.col("Receipt no."), date: it.col("Date received"), seller: it.col("Seller ID"), brand: it.col("Brand"), model: it.col("Model"), ref: it.col("Reference"),
      serial: it.col("Serial no."), year: it.col("Year"), bp: it.col("Box & papers"), cond: it.col("Condition"), notes: it.col("Notes"), reserve: it.col("Reserve"),
      start: it.col("Start price"), fee: it.col("Fee % (blank"), fixed: it.col("Fixed fee"), by: it.col("Received by"), ret: it.col("Returned to seller on"), item: it.col("Item ID")
    };
    const pos = new Map<string, number>();
    eachRow(it, c.rc, get => {
      if (!`${cellText(get(c.brand))}${cellText(get(c.model))}${cellText(get(c.ref))}${cellText(get(c.serial))}`) return;
      const receipt_no = cellText(get(c.rc)).toUpperCase();
      const position = (pos.get(receipt_no) || 0) + 1;
      pos.set(receipt_no, position);
      const item_id = cellText(get(c.item)).toUpperCase() || `${receipt_no}-${String(position).padStart(2, "0")}`;
      const seller_code = cellText(get(c.seller)).toUpperCase();
      if (seller_code && !sellerCodes.has(seller_code)) warnings.push(`Intake ${item_id}: seller ${seller_code} isn't on Sellers.`);
      plan.intake.push({
        receipt_no, item_id, position, received_on: nullIfBlank(cellDate(get(c.date))), seller_code,
        brand: cellText(get(c.brand)), model: cellText(get(c.model)), reference: cellText(get(c.ref)), serial: cellText(get(c.serial)), year: cellText(get(c.year)),
        box_papers: cellText(get(c.bp)), condition: cellText(get(c.cond)), notes: cellText(get(c.notes)), reserve: money(get(c.reserve)), start_price: money(get(c.start)),
        fee_pct: pct(get(c.fee)), fee_fixed: money(get(c.fixed)), received_by: cellText(get(c.by)), returned_on: nullIfBlank(cellDate(get(c.ret)))
      });
    });
  }

  // Lots
  const lo = table(sheets["Lots"], "Lot ID");
  if (lo) {
    const c = {
      a: lo.col("Auction no."), n: lo.col("Lot no."), brand: lo.col("Brand"), model: lo.col("Model"), ref: lo.col("Reference"), year: lo.col("Year"), bp: lo.col("Box & papers"),
      cond: lo.col("Condition"), serial: lo.col("Serial no."), seller: lo.col("Seller ID"), idate: lo.col("Intake date"), start: lo.col("Start price"), reserve: lo.col("Reserve"),
      cost: lo.col("Cost"), fee: lo.col("Fee % (blank"), win: lo.col("Winner"), hammer: lo.col("Hammer price"), ub: lo.col("Underbidder"), ubv: lo.col("Underbid (AED)", "Underbid ("),
      exc: lo.col("Exception"), buyer: lo.col("Buyer ID"), ds: lo.col("Delivery status"), disp: lo.col("Dispatch"), courier: lo.col("Courier"), spaid: lo.col("Seller paid on"),
      pref: lo.col("Payout reference"), notes: lo.col("Notes"), tray: lo.col("Tray"), slip: lo.col("Slip printed"), item: lo.col("Item ID"), fixed: lo.col("Fixed fee AED")
    };
    const seen = new Set<string>();
    eachRow(lo, c.a, (get, r) => {
      const auction_number = cellNum(get(c.a));
      const lot_number = cellNum(get(c.n));
      const brand = cellText(get(c.brand));
      const model = cellText(get(c.model));
      if (!auction_number || !lot_number) return;
      if (!brand && !model && !cellText(get(c.win)) && cellNum(get(c.hammer)) == null) return;
      if (!auctionNos.has(auction_number)) {
        warnings.push(`Lots row ${r}: auction ${auction_number} isn't on the Auctions sheet (with a date): skipped.`);
        return;
      }
      const k = `${auction_number}-${lot_number}`;
      if (seen.has(k)) {
        warnings.push(`Lots row ${r}: lot ${k} appears twice: the second one was skipped.`);
        return;
      }
      seen.add(k);
      const seller_code = cellText(get(c.seller)).toUpperCase();
      if (seller_code && !sellerCodes.has(seller_code)) warnings.push(`Lot ${k}: seller ${seller_code} isn't on Sellers.`);
      const winner_text = cellText(get(c.win));
      const winner_code = resolveBuyer(winner_text, cellText(get(c.buyer)));
      const hammer = money(get(c.hammer));
      if (winner_text && !winner_code && (hammer || 0) > 0) warnings.push(`Lot ${k}: winner "${winner_text}" isn't on Buyers (add them, then choose the buyer on the lot).`);
      const exc = cellText(get(c.exc));
      plan.lots.push({
        auction_number, lot_number, brand: brand || "Watch", model, reference: cellText(get(c.ref)), year: cellText(get(c.year)), condition: cellText(get(c.cond)),
        box_papers: cellText(get(c.bp)), serial: cellText(get(c.serial)), seller_code, intake_item: cellText(get(c.item)).toUpperCase(),
        intake_date: nullIfBlank(cellDate(get(c.idate))), start_price: Math.max(0, Math.round(cellNum(get(c.start)) || 0)),
        reserve: money(get(c.reserve)), cost: money(get(c.cost)), fee_pct: pct(get(c.fee)), fee_fixed: money(get(c.fixed)), winner_text, winner_code, hammer,
        underbidder: cellText(get(c.ub)), underbid: money(get(c.ubv)), exception: (EXCEPTIONS as readonly string[]).includes(exc) ? exc : null,
        delivery_status: cellText(get(c.ds)), dispatched_on: nullIfBlank(cellDate(get(c.disp))), courier: cellText(get(c.courier)),
        seller_paid_on: nullIfBlank(cellDate(get(c.spaid))), payout_ref: cellText(get(c.pref)), office_notes: cellText(get(c.notes)),
        tray: cellNum(get(c.tray)), slip_printed_at: nullIfBlank(cellInstant(get(c.slip)))
      });
    });
  } else warnings.push("No Lots sheet found.");

  // Adjustments
  const ad = table(sheets["Adjustments"], "Invoice no.");
  if (ad) {
    const c = { inv: ad.col("Invoice no."), del: ad.col("Delivery (this"), pay: ad.col("Pays by (this"), fee: ad.col("Delivery fee"), disc: ad.col("Discount"), extra: ad.col("Extra charge (AED)"), label: ad.col("Extra charge label"), note: ad.col("Note printed") };
    eachRow(ad, c.inv, get => {
      const row: Adjustment = {
        invoice_no: cellText(get(c.inv)).toUpperCase(), delivery: (["Courier", "Pickup"].includes(cellText(get(c.del))) ? cellText(get(c.del)) : "") as Adjustment["delivery"],
        pays_by: cellText(get(c.pay)), delivery_fee: money(get(c.fee)), discount: money(get(c.disc)), extra: money(get(c.extra)), extra_label: cellText(get(c.label)), note: cellText(get(c.note))
      };
      if (row.delivery || row.pays_by || row.delivery_fee != null || row.discount != null || row.extra != null || row.extra_label || row.note) plan.adjustments.push(row);
    });
  }

  // Payments, deposits and refunds
  const pa = table(sheets["Payments"], "Invoice no.");
  if (pa) {
    const c = { d: pa.col("Date"), t: pa.col("Type"), who: pa.col("Buyer (Instagram"), inv: pa.col("Invoice no."), m: pa.col("Method"), amt: pa.col("Amount"), ref: pa.col("Reference"), by: pa.col("Received by"), notes: pa.col("Notes"), bid: pa.col("Buyer ID") };
    eachRow(pa, c.amt, (get, r) => {
      const amount = money(get(c.amt));
      if (!amount || amount <= 0) return;
      const typ = cellText(get(c.t));
      const kind = /refund/i.test(typ) ? "Refund" : /deposit/i.test(typ) ? "Deposit" : "Payment";
      const invoice_no = cellText(get(c.inv)).toUpperCase();
      let customer_code = resolveBuyer(cellText(get(c.who)), cellText(get(c.bid)));
      if (!customer_code && invoice_no) {
        const code = invoice_no.split("-").slice(1).join("-");
        if (buyerCodes.has(code)) customer_code = code;
      }
      if (!customer_code) warnings.push(`Payments row ${r}: AED ${amount} has no known buyer: imported without one.`);
      plan.ledger.push({
        import_ref: `wb:pay:${r}`, entry_date: cellDate(get(c.d)) || plan.auctions[plan.auctions.length - 1]?.sale_date || "", kind, customer_code,
        invoice_no: kind === "Deposit" ? "" : invoice_no, method: cellText(get(c.m)), amount, reference: cellText(get(c.ref)), received_by: cellText(get(c.by)), notes: cellText(get(c.notes))
      });
    });
  }

  // Sent log
  const sl = table(sheets["Sent Log"], "Sent at");
  if (sl) {
    const c = { at: sl.col("Sent at"), ref: sl.col("Invoice no."), name: sl.col("Buyer"), ph: sl.col("WhatsApp number"), tot: sl.col("Total"), bal: sl.col("Balance due"), file: sl.col("PDF file"), kind: sl.col("Message"), link: sl.col("Card payment link") };
    eachRow(sl, c.at, (get, r) => {
      const sent_at = cellInstant(get(c.at));
      if (!sent_at) return;
      plan.sent.push({
        import_ref: `wb:sent:${r}`, sent_at, ref: cellText(get(c.ref)).toUpperCase(), name: cellText(get(c.name)), phone: cellText(get(c.ph)),
        total: money(get(c.tot)), balance: money(get(c.bal)), file: cellText(get(c.file)), kind: cellText(get(c.kind)), link: cellText(get(c.link))
      });
    });
  }

  // Card links
  const cl = table(sheets["Card Links"], "Ziina ID");
  if (cl) {
    const c = {
      at: cl.col("Created at"), f: cl.col("For"), inv: cl.col("Invoice no."), lot: cl.col("Lot"), bid: cl.col("Buyer ID"), name: cl.col("Buyer"), due: cl.col("Amount due"),
      fee: cl.col("Card fee"), link: cl.col("Link amount"), exp: cl.col("Expires"), zid: cl.col("Ziina ID"), url: cl.col("Payment link"), st: cl.col("Status"), chk: cl.col("Last checked")
    };
    eachRow(cl, c.at, (get, r) => {
      const f = cellText(get(c.f));
      plan.cards.push({
        import_ref: `wb:card:${r}`, created_at: cellInstant(get(c.at)) || new Date().toISOString(), kind: /deposit/i.test(f) ? "Deposit" : /lot/i.test(f) ? "Lot" : "Invoice",
        invoice_no: cellText(get(c.inv)).toUpperCase(), lot_key: cellText(get(c.lot)), customer_code: resolveBuyer("", cellText(get(c.bid))), name: cellText(get(c.name)),
        amount: money(get(c.due)) || 0, fee: money(get(c.fee)) || 0, card_amount: money(get(c.link)) || 0, expires_at: nullIfBlank(cellInstant(get(c.exp))),
        ziina_id: cellText(get(c.zid)) || null, url: cellText(get(c.url)), status: cellText(get(c.st)), checked_at: nullIfBlank(cellInstant(get(c.chk)))
      });
    });
  }

  return plan;
}

/** How many of each, for the confirmation screen. */
export const planCounts = (p: ImportPlan) => ({
  auctions: p.auctions.length, lots: p.lots.length, buyers: p.customers.length, sellers: p.sellers.length, intake: p.intake.length,
  payments: p.ledger.length, adjustments: p.adjustments.length, messagesSent: p.sent.length, cardLinks: p.cards.length, wording: p.messages.length
});

/** The plan as back-office data (made-up ids), to preview totals before saving, and for tests. */
export function planToData(plan: ImportPlan, base: OfficeSettings, now: number): OfficeData {
  const settings = { ...base, ...plan.settings } as OfficeSettings;
  const auctions: OAuction[] = plan.auctions.map(a => ({
    id: `a:${a.number}`, number: a.number, sale_date: a.sale_date, live_starts_at: `${a.sale_date}T${a.live_time}:00+04:00`, status: "draft",
    pay_clock: a.pay_clock || null, office_notes: a.office_notes, lot_target: a.lot_target
  }));
  const sellers: Seller[] = plan.sellers.map(s => ({ ...s, id: `s:${s.code}` }));
  const customers: Customer[] = plan.customers.map(c => ({ ...c, id: `c:${c.code}`, profile_id: null }));
  const intake: IntakeItem[] = plan.intake.map(({ seller_code, ...i }) => ({ ...i, id: `i:${i.item_id}`, seller_id: seller_code ? `s:${seller_code}` : null }));
  const sid = new Set(sellers.map(s => s.id));
  const cid = new Set(customers.map(c => c.id));
  const iid = new Set(intake.map(i => i.id));
  const lots: OLot[] = plan.lots.map(l => ({
    id: `l:${l.auction_number}-${l.lot_number}`, auction_id: `a:${l.auction_number}`, lot_number: l.lot_number, brand: l.brand, model: l.model, reference: l.reference,
    year: l.year, condition: l.condition, start_price: l.start_price, has_box: /box|full/i.test(l.box_papers), has_papers: /papers|full/i.test(l.box_papers),
    current_bid: null, ends_at: null, no_reserve: !l.reserve, reserve_met: false, made_pure: false, leader_id: null, leader_ig: null,
    reserve: l.reserve, cost: l.cost, seller_fee: l.fee_pct, fee_fixed: l.fee_fixed,
    seller_id: l.seller_code && sid.has(`s:${l.seller_code}`) ? `s:${l.seller_code}` : null,
    intake_item_id: l.intake_item && iid.has(`i:${l.intake_item}`) ? `i:${l.intake_item}` : null,
    serial: l.serial, box_papers: l.box_papers, intake_date: l.intake_date,
    winner_customer_id: l.winner_code && cid.has(`c:${l.winner_code}`) ? `c:${l.winner_code}` : null, winner_text: l.winner_text, hammer: l.hammer,
    underbidder: l.underbidder, underbid: l.underbid, exception: l.exception as OLot["exception"], delivery_status: l.delivery_status, dispatched_on: l.dispatched_on,
    courier: l.courier, seller_paid_on: l.seller_paid_on, payout_ref: l.payout_ref, payout_account: "", office_notes: l.office_notes, tray: l.tray, slip_printed_at: l.slip_printed_at
  }));
  const ledger: LedgerEntry[] = plan.ledger.map((e, i) => ({
    id: e.import_ref, seq: i + 1, entry_date: e.entry_date, kind: e.kind, customer_id: e.customer_code ? `c:${e.customer_code}` : null, invoice_no: e.invoice_no,
    method: e.method, amount: e.amount, reference: e.reference, received_by: e.received_by, notes: e.notes, created_at: new Date(now).toISOString()
  }));
  const sent: SentLog[] = plan.sent.map((x, i) => ({ id: i + 1, sent_at: x.sent_at, ref: x.ref, name: x.name, phone: x.phone, total: x.total, balance: x.balance, file: x.file, kind: x.kind, link: x.link }));
  const cards: CardLink[] = plan.cards.map(x => ({
    id: x.import_ref, created_at: x.created_at, kind: x.kind, invoice_no: x.invoice_no, lot_key: x.lot_key, customer_id: x.customer_code ? `c:${x.customer_code}` : null,
    name: x.name, amount: x.amount, fee: x.fee, card_amount: x.card_amount, expires_at: x.expires_at, ziina_id: x.ziina_id, url: x.url, status: x.status, checked_at: x.checked_at, ledger_id: null
  }));
  const messages: MessageOverrides = {};
  for (const m of plan.messages) messages[m.key] = { en: m.en, ar: m.ar };
  return { settings, auctions, lots, customers, sellers, intake, adjustments: plan.adjustments, ledger, sent, cards, messages, now };
}
