// The WhatsApp wording (English + Arabic), as on the workbook's Messages sheet, and the messages built from it.
// Staff can change any wording in Back office › Settings; their versions are stored in office_messages.
import { COD, UAE, type MessageOverrides, type OfficeSettings } from "./types";
import { aed, amt, cardRate, r2, type InvoiceView, type LotView } from "./engine";

export type L = "EN" | "AR";

/** key, where it's used, English, Arabic */
export const MESSAGES: [string, string, string, string][] = [
  ["greet", "Invoice: first line", "Hello {name},", "مرحباً {name}،"],
  ["thanks", "Invoice: second line", "thank you for buying at {company}!", "شكراً لشرائك من {company}!"],
  ["inv_head", "Invoice: heading", "*Invoice {invoice}*", "*الفاتورة رقم {invoice}*"],
  ["auction_line", "Invoice: auction and date", "Auction {auction}  ·  {date}", "المزاد {auction}  ·  {date}"],
  ["lot_line", "Invoice: one line per lot", "Lot {lot}  {watch}: AED {amount}", "القطعة {lot}  {watch}: {amount} درهم"],
  ["hammer_total", "Invoice: total of the lots", "Hammer total: AED {amount}", "مجموع أسعار القطع: {amount} درهم"],
  ["delivery", "Invoice: delivery fee", "Delivery ({country}): AED {amount}", "التوصيل ({country}): {amount} درهم"],
  ["delivery_pickup", "Invoice: pickup", "Delivery: pickup", "التوصيل: استلام شخصي"],
  ["delivery_tbc", "Invoice: overseas fee not added yet", "Delivery to {country}: to be confirmed", "التوصيل إلى {country}: سيتم تأكيده لاحقاً"],
  ["cod_charge", "Invoice: cash on delivery charge", "Cash on delivery charge: AED {amount}", "رسوم الدفع عند الاستلام: {amount} درهم"],
  ["other_charge", "Invoice: extra charge", "{label}: AED {amount}", "{label}: {amount} درهم"],
  ["discount", "Invoice: discount", "Discount: -AED {amount}", "الخصم: -{amount} درهم"],
  ["vat", "Invoice: VAT", "VAT: AED {amount}", "ضريبة القيمة المضافة: {amount} درهم"],
  ["card_fee_line", "Invoice: card fee already charged", "Card payment fee: AED {amount}", "رسوم الدفع بالبطاقة: {amount} درهم"],
  ["total", "Invoice: total", "*Total: AED {amount}*", "*الإجمالي: {amount} درهم*"],
  ["deposit", "Invoice: deposit", "Deposit received: -AED {amount}", "العربون المستلم: -{amount} درهم"],
  ["already_paid", "Invoice: payments already made", "Already paid: -AED {amount}", "المبلغ المدفوع: -{amount} درهم"],
  ["balance", "Invoice: amount still to pay", "*Balance due: AED {amount}*", "*المبلغ المستحق: {amount} درهم*"],
  ["balance_cod", "Invoice: after the balance, cash on delivery", "(cash to the courier on delivery)", "(نقداً للمندوب عند التسليم)"],
  ["paid_full", "Invoice: fully paid", "*Paid in full. Thank you!*", "*تم الدفع بالكامل. شكراً لك!*"],
  ["pay_by", "Invoice: payment deadline", "*Please pay by {due}* (within {hours} hours). Unpaid orders are cancelled after that.", "*يرجى الدفع قبل {due}* (خلال {hours} ساعة)، وإلا يتم إلغاء الطلب."],
  ["bank_head", "Payment: bank transfer heading", "*{n}Bank transfer: AED {amount}*", "*{n}تحويل بنكي: {amount} درهم*"],
  ["bank_name", "Payment: bank", "Bank: {bank}", "البنك: {bank}"],
  ["bank_account", "Payment: account name", "Account name: {account}", "اسم الحساب: {account}"],
  ["bank_iban", "Payment: IBAN", "IBAN: {iban}", "رقم الآيبان: {iban}"],
  ["bank_ref", "Payment: reference", "Reference: {invoice}", "المرجع: {invoice}"],
  ["card_head", "Payment: card heading", "*{n}Card: AED {amount}* (includes the {fee} card fee)", "*{n}الدفع بالبطاقة: {amount} درهم* (يشمل رسوم البطاقة {fee})"],
  ["link_request", "Payment: how to ask for a card link", "Reply LINK and we'll send you a secure card payment link.", "أرسل كلمة LINK وسنرسل لك رابط دفع آمن بالبطاقة."],
  ["tabby", "Payment: Tabby / Tamara", "Tabby or Tamara: reply TABBY or TAMARA and we'll set it up.", "للدفع عبر تابي أو تمارا: أرسل TABBY أو TAMARA وسنرتب لك ذلك."],
  ["pay_summary", "Arabic half of two-language messages (details are in the English half)",
    "To pay: bank transfer AED {amount}, or AED {cardamount} by card (includes the {fee} card fee). Bank details above.",
    "للدفع: تحويل بنكي بمبلغ {amount} درهم، أو {cardamount} درهم بالبطاقة (يشمل رسوم البطاقة {fee}). تفاصيل الحساب البنكي في الرسالة أعلاه."],
  ["inv_view", "Invoice: link to the invoice page", "Your invoice: {url}", "فاتورتك: {url}"],
  ["inv_end", "Invoice: last line", "Thank you for buying with {company}!", "شكراً لتعاملك مع {company}!"],
  ["win_title", "Winner: first line", "Congratulations! You won Lot {lot} at {company}:", "مبروك! لقد فزت بالقطعة رقم {lot} في {company}:"],
  ["win_price", "Winner: price", "*Hammer price: AED {amount}*", "*سعر الفوز بالمزاد: {amount} درهم*"],
  ["win_pay_by", "Winner: payment deadline", "You can pay now. *Please pay by {due}* (within {hours} hours). Unpaid lots are cancelled after that.", "يمكنك الدفع الآن. *يرجى الدفع قبل {due}* (خلال {hours} ساعة)، وإلا يتم إلغاء القطعة."],
  ["win_end", "Winner: last line", "Delivery charges, if any, are added to your final invoice ({invoice}), which follows after the auction. Thank you!", "تُضاف رسوم التوصيل، إن وجدت، إلى فاتورتك النهائية ({invoice}) التي ستصلك بعد المزاد. شكراً لك!"],
  ["link_title", "Card link: first line", "Hello {name}, here is your secure card payment link from {company} for {what}:", "مرحباً {name}، إليك رابط الدفع الآمن بالبطاقة من {company} مقابل {what}:"],
  ["link_lot", "Card link: one lot", "Lot {lot} ({watch})", "القطعة {lot} ({watch})"],
  ["link_lots", "Card link: several lots", "Lots {lots}", "القطع {lots}"],
  ["link_invoice", "Card link: an invoice", "invoice {invoice}", "الفاتورة {invoice}"],
  ["link_deposit", "Card link: a deposit", "your deposit", "العربون"],
  ["link_amount", "Card link: amount", "*AED {cardamount}* (includes the {fee} card fee)", "*{cardamount} درهم* (يشمل رسوم البطاقة {fee})"],
  ["link_end", "Card link: last line", "Please pay by {due}. Thank you!", "يرجى الدفع قبل {due}. شكراً لك!"],
  ["link_thanks", "Card link: last line when the deadline has passed", "Thank you!", "شكراً لك!"],
  ["rem_title", "Reminder: first line", "Hello {name}, a friendly reminder from {company}:", "مرحباً {name}، تذكير ودّي من {company}:"],
  ["rem_balance", "Reminder: what's still to pay", "*Invoice {invoice}*: *AED {amount}* still to pay (lots {lots}).", "*الفاتورة {invoice}*: المبلغ المتبقي *{amount} درهم* (القطع {lots})."],
  ["rem_due", "Reminder: before the deadline", "Please pay by *{due}*. Unpaid orders are cancelled after that.", "يرجى الدفع قبل *{due}*، وإلا يتم إلغاء الطلب."],
  ["rem_overdue", "Reminder: after the deadline", "Payment was due by *{due}*. Please pay today to keep your order.", "كان موعد الدفع *{due}*. يرجى الدفع اليوم للاحتفاظ بطلبك."],
  ["rem_end", "Reminder: last line", "Already paid? Please send us the transfer receipt and ignore this message. Thank you!", "إذا كنت قد دفعت، يرجى إرسال إيصال التحويل وتجاهل هذه الرسالة. شكراً لك!"],
  ["separator", "Line between the English and Arabic halves", "— — — — —", "— — — — —"],
  ["am", "Time in Arabic dates", "AM", "ص"],
  ["pm", "Time in Arabic dates", "PM", "م"],
  ["country:United Arab Emirates", "Country names", "UAE", "الإمارات"],
  ["country:Oman", "Country names", "Oman", "عُمان"],
  ["country:Saudi Arabia", "Country names", "Saudi Arabia", "السعودية"],
  ["country:Bahrain", "Country names", "Bahrain", "البحرين"],
  ["country:Kuwait", "Country names", "Kuwait", "الكويت"],
  ["country:Qatar", "Country names", "Qatar", "قطر"],
  ["paid_conf", "Payment received: first line", "Hello {name}, thank you! {company} has received *AED {amount}* for invoice {invoice}.", "مرحباً {name}، شكراً لك! استلمنا في {company} مبلغ *{amount} درهم* للفاتورة {invoice}."],
  ["paid_conf_rest", "Payment received: still to pay", "Still to pay: *AED {balance}*.", "المبلغ المتبقي: *{balance} درهم*."],
  ["paid_conf_full", "Payment received: paid in full", "Your invoice is now *paid in full*. We'll be in touch about delivery.", "تم سداد فاتورتك *بالكامل*. سنتواصل معك بخصوص التوصيل."],
  ["dep_conf", "Deposit received", "Hello {name}, thank you! {company} has received your deposit of *AED {amount}*. It will come off your invoice.", "مرحباً {name}، شكراً لك! استلمنا في {company} عربونك بمبلغ *{amount} درهم*، وسيُخصم من فاتورتك."],
  ["refund_msg", "Refund made: first line", "Hello {name}, {company} has refunded *AED {amount}* to you by {method}.", "مرحباً {name}، أعادت لك {company} مبلغ *{amount} درهم* عن طريق {method}."],
  ["refund_for", "Refund made: which invoice", "This is for invoice {invoice}.", "وذلك عن الفاتورة {invoice}."],
  ["refund_end", "Refund made: last line", "It can take a few days to reach you. Thank you!", "قد يستغرق وصول المبلغ بضعة أيام. شكراً لك!"],
  ["method:Bank transfer", "Payment method names", "bank transfer", "تحويل بنكي"],
  ["method:Cash", "Payment method names", "cash", "نقداً"],
  ["method:Card link (Ziina)", "Payment method names", "card", "البطاقة"],
  ["method:Tabby", "Payment method names", "Tabby", "تابي"],
  ["method:Tamara", "Payment method names", "Tamara", "تمارا"],
  ["method:Cash on delivery", "Payment method names", "cash on delivery", "الدفع عند الاستلام"],
  ["ir_title", "Intake receipt: first line", "Hello {name}, thank you for consigning with {company}.", "مرحباً {name}، شكراً لثقتك بـ {company} لبيع قطعك."],
  ["ir_head", "Intake receipt: receipt number and date", "*Consignment receipt {receipt}*  ·  {date}", "*إيصال استلام رقم {receipt}*  ·  {date}"],
  ["ir_count", "Intake receipt: before the list", "We have received {count} item(s) from you:", "استلمنا منك {count} قطعة:"],
  ["ir_ref", "Intake receipt: reference", "ref {ref}", "المرجع {ref}"],
  ["ir_serial", "Intake receipt: serial number", "serial {serial}", "الرقم التسلسلي {serial}"],
  ["ir_reserve", "Intake receipt: reserve", "reserve AED {amount}", "السعر الأدنى {amount} درهم"],
  ["ir_noreserve", "Intake receipt: no reserve", "no reserve", "بدون سعر أدنى"],
  ["ir_sellerfee", "Intake receipt: seller fee", "Seller fee: {fee}, only when an item sells.", "عمولة البيع: {fee}، فقط عند بيع القطعة."],
  ["fee_pct", "Seller fee: the percentage", "{pct} of the hammer price", "{pct} من سعر البيع في المزاد"],
  ["fee_fixed", "Seller fee: the fixed part", "AED {amount} per item sold", "{amount} درهم لكل قطعة مباعة"],
  ["ir_summary", "Arabic half of two-language intake receipts (the list is in the English half)", "We have received {count} item(s) from you; the list is above.", "استلمنا منك {count} قطعة، والتفاصيل في الرسالة أعلاه."],
  ["ir_view", "Intake receipt: link to the receipt page", "Your receipt: {url}", "الإيصال: {url}"],
  ["ir_end", "Intake receipt: last line", "We'll let you know which auction each piece goes into. Thank you!", "سنبلغك بموعد المزاد لكل قطعة. شكراً لك!"]
];

/** Earlier default wording (the workbook's, and older versions of it). Imported text that matches one of these
 *  isn't a customisation, so the current default is used instead. */
export const OLD_DEFAULTS: Record<string, { en: string; ar: string }[]> = {
  inv_end: [{ en: "Your PDF invoice is attached. Thank you for buying with {company}!", ar: "مرفق لك الفاتورة بصيغة PDF. شكراً لتعاملك مع {company}!" }],
  ir_end: [{ en: "Your receipt is attached as a PDF. We'll let you know which auction each piece goes into. Thank you!", ar: "مرفق لك الإيصال بصيغة PDF، وسنبلغك بموعد المزاد لكل قطعة. شكراً لك!" }],
  link_title: [{ en: "Hello {name}, here is your secure card payment link for {what}:", ar: "مرحباً {name}، إليك رابط الدفع الآمن بالبطاقة مقابل {what}:" }],
  paid_conf: [{ en: "Hello {name}, thank you! We've received *AED {amount}* for invoice {invoice}.", ar: "مرحباً {name}، شكراً لك! استلمنا *{amount} درهم* للفاتورة {invoice}." }],
  dep_conf: [{ en: "Hello {name}, thank you! We've received your deposit of *AED {amount}*. It will come off your invoice.", ar: "مرحباً {name}، شكراً لك! استلمنا عربونك بمبلغ *{amount} درهم*، وسيُخصم من فاتورتك." }],
  refund_msg: [{ en: "Hello {name}, we've refunded *AED {amount}* to you by {method}.", ar: "مرحباً {name}، أعدنا لك مبلغ *{amount} درهم* عن طريق {method}." }],
  refund_end: [{ en: "It can take a few days to reach you. Thank you, {company}.", ar: "قد يستغرق وصول المبلغ بضعة أيام. شكراً لك، {company}." }]
};

export const DEFAULTS = new Map(MESSAGES.map(([k, , en, ar]) => [k, { en, ar }]));
export const MESSAGE_KEYS = new Set(DEFAULTS.keys());

/** The people-facing name: "DXB Watch × The Time Souk" (or the trading name). */
export const companyName = (s: Pick<OfficeSettings, "brand_name" | "trading_name">) => (s.brand_name || "").trim() || s.trading_name || "The Time Souk";

/** Builds messages with the office's settings and edited wording. */
export class Wording {
  constructor(readonly s: OfficeSettings, private overrides: MessageOverrides = {}) {}

  t(key: string, l: L): string {
    const o = this.overrides[key];
    const own = l === "AR" ? o?.ar : o?.en;
    if (own != null && own !== "") return own;
    const d = DEFAULTS.get(key);
    return d ? (l === "AR" ? d.ar : d.en) : "";
  }

  get company() {
    return companyName(this.s);
  }

  get rate() {
    return cardRate(this.s);
  }

  get feeText() {
    return pctText(this.rate);
  }

  country(c: string, l: L) {
    return this.t(`country:${c || UAE}`, l) || c || UAE;
  }

  method(m: string, l: L) {
    return this.t(`method:${m}`, l) || m;
  }

  /** "Thu 22 Oct, 9 PM" / "22/10/2026 9:00 م" (Dubai time). */
  due(ms: number, l: L) {
    const d = new Date(ms + 4 * 3600e3);
    const h24 = d.getUTCHours();
    const mi = d.getUTCMinutes();
    const h = ((h24 + 11) % 12) + 1;
    const pm = h24 >= 12;
    if (l === "AR") return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()} ${h}:${String(mi).padStart(2, "0")} ${this.t(pm ? "pm" : "am", "AR")}`;
    return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}, ${h}${mi ? `:${String(mi).padStart(2, "0")}` : ""} ${pm ? "PM" : "AM"}`;
  }

  /** The two halves joined, or one language. */
  both(code: Code, en: () => string, ar: () => string) {
    if (code === "AR") return ar();
    if (code === "EN") return en();
    return `${en()}\n\n${this.t("separator", "EN")}\n\n${ar()}`;
  }

  /** "1) Bank transfer … 2) Card … link … Tabby" */
  paySection(l: L, bankAmt: number, cardAmt: number, ref: string, link: string) {
    const s = this.s;
    let out = "";
    let n = "";
    if (s.bank_iban.trim()) {
      out = fill(this.t("bank_head", l), { n: "1) ", amount: amt(bankAmt) }) + "\n" + fill(this.t("bank_name", l), { bank: s.bank_name });
      if (s.bank_account.trim()) out += "\n" + fill(this.t("bank_account", l), { account: s.bank_account });
      out += "\n" + fill(this.t("bank_iban", l), { iban: s.bank_iban.trim() }) + "\n" + fill(this.t("bank_ref", l), { invoice: ref }) + "\n\n";
      n = "2) ";
    }
    return out + fill(this.t("card_head", l), { n, amount: amt(cardAmt), fee: this.feeText }) + "\n" + this.linkText(link, l) + "\n\n" + this.t("tabby", l);
  }

  linkText(link: string, l: L) {
    return link || this.t("link_request", l);
  }

  /** {name} filled with the first name, or dropped when there's no name. */
  hello(tpl: string, fullName: string) {
    const first = firstName(fullName);
    return first ? tpl.split("{name}").join(first) : tpl.split(" {name}").join("").split("{name}").join("");
  }
}

export type Code = "EN" | "AR" | "BOTH";
export const langCode = (lang: string | null | undefined): Code => {
  const v = String(lang || "").toLowerCase();
  return v === "ar" || v === "arabic" ? "AR" : v === "en" || v === "english" ? "EN" : "BOTH";
};

export const firstName = (full: string) => String(full || "").trim().split(/\s+/)[0] || "";

export function fill(t: string, kv: Record<string, string | number>) {
  let out = t;
  for (const [k, v] of Object.entries(kv)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** 0.03 → "3%", 0.075 → "7.5%" */
export function pctText(rate: number) {
  const p = Math.round(rate * 100 * 100) / 100;
  return `${Number.isInteger(p) ? p : p.toString()}%`;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sun 18 Oct 2026" / "18/10/2026" for a yyyy-mm-dd date. */
export function dateText(ymd: string | null | undefined, l: L) {
  if (!ymd) return "";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return l === "AR" ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}` : `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const watchOf = (l: Pick<LotView, "brand" | "model">) => `${l.brand || ""} ${l.model || ""}`.trim();

// ───────────────────────────── the messages ─────────────────────────────

/** The invoice, as the workbook's Invoice sheet wrote it. In two-language messages the Arabic half is a summary. */
export function invoiceMessage(w: Wording, inv: InvoiceView, opts: { link?: string; url?: string; code?: Code } = {}) {
  const code = opts.code || langCode(inv.lang);
  const link = opts.link || "";
  const unpaidCard = inv.balance <= 0 || inv.paysBy === COD;
  const greet = (l: L) => w.hello(w.t("greet", l), inv.customer.full_name) + "\n" + fill(w.t("thanks", l), { company: w.company });
  const balLine = (l: L) =>
    inv.balance <= 0 ? w.t("paid_full", l) : fill(w.t("balance", l), { amount: amt(inv.balance) }) + (inv.paysBy === COD ? " " + w.t("balance_cod", l) : "");
  const payBy = (l: L) => (inv.due ? fill(w.t("pay_by", l), { due: w.due(inv.due, l), hours: hoursToPay(w) }) : "");
  const end = (l: L) => {
    let s = "";
    if (opts.url) s += "\n\n" + fill(w.t("inv_view", l), { url: opts.url });
    const e = w.t("inv_end", l);
    if (e) s += (opts.url ? "\n" : "\n\n") + fill(e, { company: w.company });
    return s;
  };
  const full = (l: L) => {
    const head = fill(w.t("inv_head", l), { invoice: inv.no }) + "\n" + fill(w.t("auction_line", l), { auction: inv.auctionNo, date: dateText(inv.auction?.sale_date, l) });
    const lines = inv.lots.map(x => "• " + fill(w.t("lot_line", l), { lot: x.key, watch: watchOf(x), amount: amt(x.hammer) })).join("\n");
    const totals = [
      inv.lots.length > 1 ? fill(w.t("hammer_total", l), { amount: amt(inv.hammer) }) : "",
      inv.delivery === "Pickup" ? w.t("delivery_pickup", l)
        : inv.feeMissing ? fill(w.t("delivery_tbc", l), { country: w.country(inv.country, l) })
          : (inv.deliveryFee || 0) > 0 ? fill(w.t("delivery", l), { country: w.country(inv.country, l), amount: amt(inv.deliveryFee) }) : "",
      inv.cod > 0 ? fill(w.t("cod_charge", l), { amount: amt(inv.cod) }) : "",
      inv.extra > 0 ? fill(w.t("other_charge", l), { label: inv.extraLabel || "Other charges", amount: amt(inv.extra) }) : "",
      inv.discount > 0 ? fill(w.t("discount", l), { amount: amt(inv.discount) }) : "",
      inv.vat > 0 ? fill(w.t("vat", l), { amount: amt(inv.vat) }) : "",
      inv.cardFee > 0 ? fill(w.t("card_fee_line", l), { amount: amt(inv.cardFee) }) : "",
      fill(w.t("total", l), { amount: amt(inv.total) }),
      inv.depositApplied > 0 ? fill(w.t("deposit", l), { amount: amt(inv.depositApplied) }) : "",
      inv.paidDirect > 0 ? fill(w.t("already_paid", l), { amount: amt(inv.paidDirect) }) : "",
      balLine(l)
    ].filter(Boolean).join("\n");
    const pay = unpaidCard ? "" : "\n\n" + (payBy(l) ? payBy(l) + "\n\n" : "") + w.paySection(l, inv.balance, inv.cardAmount, inv.no, link);
    return greet(l) + "\n\n" + head + "\n\n" + lines + "\n\n" + totals + pay + end(l);
  };
  const summary = (l: L) => {
    const pay = unpaidCard ? "" : "\n" + (payBy(l) ? payBy(l) + "\n" : "") + fill(w.t("pay_summary", l), { amount: amt(inv.balance), cardamount: amt(inv.cardAmount), fee: w.feeText }) + "\n" + w.linkText(link, l);
    return greet(l) + "\n\n" + fill(w.t("inv_head", l), { invoice: inv.no }) + "\n" + balLine(l) + pay + end(l);
  };
  return w.both(code, () => full("EN"), () => (code === "AR" ? full("AR") : summary("AR")));
}

const hoursToPay = (w: Wording) => String(w.s.hours_to_pay || 48);

/** "Congratulations! You won Lot 2-05…", sent during the live. */
export function winnerMessage(w: Wording, lot: LotView, due: number | null, opts: { link?: string; code?: Code } = {}) {
  const code = opts.code || langCode(lot.customer?.lang || w.s.wa_lang);
  const hammer = Number(lot.hammer) || 0;
  const cardAmt = r2(hammer * (1 + w.rate));
  const inv = lot.invoiceNo || "";
  const link = opts.link || "";
  const build = (l: L, summaryOnly: boolean) => {
    let s = fill(w.t("win_title", l), { lot: lot.key, company: w.company }) + "\n" + watchOf(lot) + "\n" + fill(w.t("win_price", l), { amount: amt(hammer) });
    if (due) s += "\n\n" + fill(w.t("win_pay_by", l), { due: w.due(due, l), hours: hoursToPay(w) });
    s += summaryOnly
      ? "\n" + fill(w.t("pay_summary", l), { amount: amt(hammer), cardamount: amt(cardAmt), fee: w.feeText }) + "\n" + w.linkText(link, l)
      : "\n\n" + w.paySection(l, hammer, cardAmt, inv, link);
    return s + "\n\n" + fill(w.t("win_end", l), { invoice: inv });
  };
  return w.both(code, () => build("EN", false), () => build("AR", code !== "AR"));
}

/** The card payment link message (SEND CARD LINK). */
export function cardLinkMessage(
  w: Wording,
  p: { code: Code; name: string; kind: "Invoice" | "Lot" | "Deposit"; invoice: string; lots: string; watch: string; nLots: number; cardAmount: number; link: string; due: number | null; now: number }
) {
  const build = (l: L) => {
    const what =
      p.kind === "Invoice" ? fill(w.t("link_invoice", l), { invoice: p.invoice })
        : p.kind === "Deposit" ? w.t("link_deposit", l)
          : p.nLots === 1 ? fill(w.t("link_lot", l), { lot: p.lots, watch: p.watch }).replace(" ()", "")
            : fill(w.t("link_lots", l), { lots: p.lots });
    let s = fill(w.hello(w.t("link_title", l), p.name), { what, company: w.company }) + "\n\n" + fill(w.t("link_amount", l), { cardamount: amt(p.cardAmount), fee: w.feeText }) + "\n" + p.link + "\n\n";
    s += p.due && p.due > p.now ? fill(w.t("link_end", l), { due: w.due(p.due, l) }) : w.t("link_thanks", l);
    return s;
  };
  return w.both(p.code, () => build("EN"), () => build("AR"));
}

/** A payment reminder for an unpaid invoice. */
export function reminderMessage(w: Wording, inv: InvoiceView, now: number, opts: { link?: string; code?: Code } = {}) {
  const code = opts.code || langCode(inv.lang);
  const link = opts.link || "";
  const lots = inv.lots.map(l => l.key).join(", ");
  const build = (l: L, summaryOnly: boolean) => {
    let s = fill(w.hello(w.t("rem_title", l), inv.customer.full_name), { company: w.company }) + "\n\n" + fill(w.t("rem_balance", l), { invoice: inv.no, amount: amt(inv.balance), lots });
    if (inv.due) s += "\n" + fill(w.t(now > inv.due ? "rem_overdue" : "rem_due", l), { due: w.due(inv.due, l) });
    s += summaryOnly
      ? "\n\n" + fill(w.t("pay_summary", l), { amount: amt(inv.balance), cardamount: amt(inv.cardAmount), fee: w.feeText }) + "\n" + w.linkText(link, l)
      : "\n\n" + w.paySection(l, inv.balance, inv.cardAmount, inv.no, link);
    return s + "\n\n" + w.t("rem_end", l);
  };
  return w.both(code, () => build("EN", false), () => build("AR", code !== "AR"));
}

/** "Thank you! … has received AED x for invoice …" */
export function paidMessage(w: Wording, code: Code, name: string, invoice: string, paid: number, balance: number) {
  const build = (l: L) =>
    fill(w.hello(w.t("paid_conf", l), name), { amount: amt(paid), invoice, company: w.company }) +
    "\n" + (balance > 0.005 ? fill(w.t("paid_conf_rest", l), { balance: amt(balance) }) : w.t("paid_conf_full", l));
  return w.both(code, () => build("EN"), () => build("AR"));
}

export function depositMessage(w: Wording, code: Code, name: string, amount: number) {
  const build = (l: L) => fill(w.hello(w.t("dep_conf", l), name), { amount: amt(amount), company: w.company });
  return w.both(code, () => build("EN"), () => build("AR"));
}

export function refundMessage(w: Wording, code: Code, name: string, invoice: string, amount: number, method: string) {
  const build = (l: L) => {
    let s = fill(w.hello(w.t("refund_msg", l), name), { amount: amt(amount), method: w.method(method, l), company: w.company });
    if (invoice) s += " " + fill(w.t("refund_for", l), { invoice });
    return s + "\n\n" + fill(w.t("refund_end", l), { company: w.company });
  };
  return w.both(code, () => build("EN"), () => build("AR"));
}

/** "7.5% of the hammer price + AED 50 per item sold" */
export function sellerFeeText(w: Wording, l: L, pct: number, fixed: number) {
  const parts: string[] = [];
  if (pct > 0) parts.push(fill(w.t("fee_pct", l), { pct: pctText(pct / 100) }));
  if (fixed > 0) parts.push(fill(w.t("fee_fixed", l), { amount: amt(fixed) }));
  return parts.join(" + ");
}

export type ReceiptItem = { brand: string; model: string; reference: string; serial: string; reserve: number | null };

/** The consignment intake receipt, for the seller. */
export function receiptMessage(
  w: Wording,
  p: { code: Code; receipt: string; date: string | null; name: string; items: ReceiptItem[]; feePct: number; feeFixed: number; url?: string }
) {
  const items = p.items.filter(i => `${i.brand}${i.model}${i.reference}${i.serial}`.trim());
  const head = (l: L) => {
    const d = p.date ? (l === "AR" ? dateText(p.date, "AR") : dateText(p.date, "EN").slice(4)) : "";
    let h = w.t("ir_head", l);
    if (!d) h = h.replace("  ·  {date}", "");
    return fill(w.hello(w.t("ir_title", l), p.name), { company: w.company }) + "\n\n" + fill(h, { receipt: p.receipt, date: d });
  };
  const line = (l: L, n: number, i: ReceiptItem) => {
    let s = `${n}. ${`${i.brand || ""} ${i.model || ""}`.trim()}`;
    if (i.reference?.trim()) s += "  ·  " + fill(w.t("ir_ref", l), { ref: i.reference.trim() });
    if (i.serial?.trim()) s += "  ·  " + fill(w.t("ir_serial", l), { serial: i.serial.trim() });
    s += "  ·  " + ((i.reserve || 0) > 0 ? fill(w.t("ir_reserve", l), { amount: amt(i.reserve) }) : w.t("ir_noreserve", l));
    return s;
  };
  const fee = (l: L) => (p.feePct > 0 || p.feeFixed > 0 ? "\n\n" + fill(w.t("ir_sellerfee", l), { fee: sellerFeeText(w, l, p.feePct, p.feeFixed) }) : "");
  const end = (l: L) => (p.url ? "\n\n" + fill(w.t("ir_view", l), { url: p.url }) + "\n" : "\n\n") + w.t("ir_end", l);
  const full = (l: L) => head(l) + "\n" + fill(w.t("ir_count", l), { count: items.length }) + items.map((it, i) => "\n" + line(l, i + 1, it)).join("") + fee(l) + end(l);
  const short = (l: L) => head(l) + "\n" + fill(w.t("ir_summary", l), { count: items.length }) + fee(l) + end(l);
  return w.both(p.code, () => full("EN"), () => (p.code === "AR" ? full("AR") : short("AR")));
}

/** One line a page can show above a message: "AED 1,250 · Unpaid". */
export const invoiceBrief = (inv: InvoiceView) => `${aed(inv.balance)} · ${inv.status}`;
