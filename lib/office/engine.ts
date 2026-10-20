// The back office's rules: every number the auction workbook calculated, in one place.
// Pure functions (no database), so the same answers show on every page and the rules can be tested.
import {
  COD, UAE,
  type Adjustment, type CardLink, type Customer, type IntakeItem, type LedgerEntry, type OAuction, type OfficeData,
  type OfficeSettings, type OLot, type Seller, type SentLog
} from "./types";

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 || 0;
const n0 = (v: number | null | undefined) => Number(v) || 0;
export const pad3 = (n: number) => String(n).padStart(3, "0");
export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Today's date in Dubai (UTC+4 all year) as yyyy-mm-dd. */
export const dubaiDate = (ms: number) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10);

/** Lot IDs as the workbook writes them: auction 2, lot 5 → "2-05". */
export const lotKey = (auctionNo: number, lotNo: number) => `${auctionNo}-${pad2(lotNo)}`;
/** One invoice per buyer per auction: auction 2, buyer B0044 → "TS002-B0044". */
export const invoiceNo = (auctionNo: number, customerCode: string) => `TS${pad3(auctionNo)}-${customerCode}`;
export const normHandle = (h: string | null | undefined) => String(h || "").replace(/^@+/, "").replace(/[^A-Za-z0-9._]/g, "").toLowerCase();

/** The card fee as a fraction (3% → 0.03). */
export const cardRate = (s: OfficeSettings) => n0(s.card_fee_pct) / 100;

/** When an auction's payment clock runs out (ms): auction day at the clock time + hours to pay. */
export function auctionDue(a: OAuction | undefined, s: OfficeSettings): number | null {
  if (!a?.sale_date) return null;
  const clock = (a.pay_clock || s.pay_clock || "21:00").slice(0, 5);
  const start = Date.parse(`${a.sale_date}T${clock}:00+04:00`);
  return Number.isFinite(start) ? start + n0(s.hours_to_pay || 48) * 3600e3 : null;
}

// ───────────────────────────── lots ─────────────────────────────

export type LotStatus = "Sold" | "Sold – add buyer" | "Winner missing" | "Not scheduled" | "Upcoming" | "Open" | "Unsold" | "Withdrawn" | "Buyer defaulted" | "Returned by buyer";

export type LotView = OLot & {
  auction: OAuction | undefined;
  auctionNo: number;
  key: string;
  seller: Seller | undefined;
  /** "Own stock", "Consignment", or "" when there's no seller. */
  type: "Own stock" | "Consignment" | "";
  customer: Customer | undefined;
  sold: boolean;
  status: LotStatus;
  /** The invoice this lot is on (sold lots with a known buyer). */
  invoiceNo: string | null;
  /** The invoice it was on, even if it has since been withdrawn or returned. */
  invoiceKey: string | null;
  reserveCheck: "" | "Below reserve" | "No reserve set";
  feePct: number | null;
  feeFixed: number | null;
  fee: number;
  vatFee: number;
  net: number;
  profit: number;
  payout: "" | "Paid" | "Due to seller" | "Wait – buyer not paid";
};

function lotView(l: OLot, ctx: { auctions: Map<string, OAuction>; sellers: Map<string, Seller>; customers: Map<string, Customer>; s: OfficeSettings; today: string }): LotView {
  const auction = ctx.auctions.get(l.auction_id);
  const auctionNo = auction?.number || 0;
  const seller = l.seller_id ? ctx.sellers.get(l.seller_id) : undefined;
  const type: LotView["type"] = l.seller_id ? (seller?.kind === "own" ? "Own stock" : "Consignment") : "";
  const customer = l.winner_customer_id ? ctx.customers.get(l.winner_customer_id) : undefined;
  const hammer = n0(l.hammer);
  const hasWinner = !!(l.winner_customer_id || String(l.winner_text || "").trim());
  const sold = !l.exception && hasWinner && hammer > 0;
  const inv = customer ? invoiceNo(auctionNo, customer.code) : null;
  let status: LotStatus;
  if (l.exception) status = l.exception;
  else if (sold) status = customer ? "Sold" : "Sold – add buyer";
  else if (hammer > 0) status = "Winner missing";
  else if (!auction?.sale_date) status = "Not scheduled";
  else if (auction.sale_date > ctx.today) status = "Upcoming";
  else if (auction.sale_date === ctx.today) status = "Open";
  else status = "Unsold";
  const consign = type === "Consignment";
  const feePct = consign ? (l.seller_fee != null ? l.seller_fee : seller?.fee_pct != null ? seller.fee_pct : n0(ctx.s.fee_pct)) : null;
  const feeFixed = consign ? (l.fee_fixed != null ? l.fee_fixed : seller?.fee_fixed != null ? seller.fee_fixed : n0(ctx.s.fee_fixed)) : null;
  const fee = sold && consign ? Math.min(hammer, Math.max(r2((hammer * n0(feePct)) / 100) + n0(feeFixed), n0(ctx.s.fee_min))) : 0;
  const vatFee = r2((fee * n0(ctx.s.vat_fee_pct)) / 100);
  const net = sold && consign ? r2(hammer - fee - vatFee) : 0;
  const profit = sold ? (type === "Own stock" ? r2(hammer - n0(l.cost)) : fee) : 0;
  const reserve = n0(l.reserve);
  const reserveCheck: LotView["reserveCheck"] = sold && reserve > 0 && hammer < reserve ? "Below reserve" : consign && !reserve && !l.exception ? "No reserve set" : "";
  return {
    ...l, auction, auctionNo, key: lotKey(auctionNo, l.lot_number), seller, type, customer, sold, status,
    invoiceNo: sold ? inv : null,
    invoiceKey: hasWinner && hammer > 0 && customer ? inv : null,
    reserveCheck, feePct, feeFixed, fee, vatFee, net, profit,
    payout: "" // filled in once invoices are known
  };
}

// ───────────────────────────── money in ─────────────────────────────

export type LedgerView = LedgerEntry & {
  customer: Customer | undefined;
  /** Refunds count as money going out. */
  signed: number;
  /** The card fee inside a card payment (the full amount received includes it). */
  cardFee: number;
  auctionNo: number | null;
  /** "Open" (the invoice exists), "Cancelled" (its lots were all withdrawn or returned), "Not found", or "" (no invoice). */
  order: "" | "Open" | "Cancelled" | "Not found";
  check: string;
};

export type InvoiceStatus = "Paid" | "Paid – fee to add" | "Refund due" | "Deposit paid" | "Part paid" | "COD – collect" | "Unpaid";

export type InvoiceView = {
  no: string;
  auction: OAuction | undefined;
  auctionNo: number;
  customer: Customer;
  lots: LotView[];
  hammer: number;
  delivery: "Courier" | "Pickup";
  paysBy: string;
  country: string;
  /** null = overseas and the fee hasn't been typed yet. */
  deliveryFee: number | null;
  feeMissing: boolean;
  cod: number;
  extra: number;
  extraLabel: string;
  discount: number;
  vat: number;
  /** Card fees already charged on card payments to this invoice. */
  cardFee: number;
  total: number;
  /** Payments (minus refunds) made against this invoice. */
  paidDirect: number;
  depositApplied: number;
  paid: number;
  balance: number;
  due: number | null;
  status: InvoiceStatus;
  hoursOverdue: number | null;
  deliveryStatus: "Delivered" | "Collected" | "With courier" | "Part delivered" | "Packed" | "Not sent";
  nextStep: string;
  sentAt: string | null;
  lastReminder: string | null;
  reminders: number;
  /** What a card link for the balance would be, card fee included. */
  cardAmount: number;
  lang: "both" | "en" | "ar";
  tray: number | null;
  note: string;
  adjustment: Adjustment | undefined;
};

export type CustomerView = Customer & {
  lotsWon: number;
  bought: number;
  outstanding: number;
  depositsTaken: number;
  depositsRefunded: number;
  depositsUsed: number;
  depositHeld: number;
};

export type SellerView = Seller & {
  lotsEntered: number;
  lotsSold: number;
  hammer: number;
  fees: number;
  net: number;
  paidOut: number;
  owed: number;
  profit: number;
};

export type RefundDue = {
  source: "invoice" | "cancelled" | "deposit";
  ref: string;
  auctionNo: number | null;
  customer: Customer | undefined;
  why: string;
  amount: number;
  paidBy: string;
};

export type IntakeView = IntakeItem & {
  seller: Seller | undefined;
  lot: LotView | undefined;
  status: string;
};

export type AuctionSummary = {
  auction: OAuction;
  lots: number;
  sold: number;
  unsold: number;
  sellThrough: number | null;
  hammer: number;
  ownSales: number;
  ownCost: number;
  ownProfit: number;
  sellerFees: number;
  profit: number;
  invoices: number;
  billed: number;
  collected: number;
  outstanding: number;
  depositsApplied: number;
  owedToSellers: number;
  target: number;
};

export type Office = {
  data: OfficeData;
  today: string;
  lots: LotView[];
  lotsById: Map<string, LotView>;
  invoices: InvoiceView[];
  invoicesByNo: Map<string, InvoiceView>;
  ledger: LedgerView[];
  customers: CustomerView[];
  customersById: Map<string, CustomerView>;
  sellers: SellerView[];
  sellersById: Map<string, SellerView>;
  refunds: RefundDue[];
  /** Unpaid invoices from every auction (cash on delivery excluded), in invoice order. */
  owing: InvoiceView[];
  intake: IntakeView[];
  auctions: AuctionSummary[];
};

const lastSent = (sent: SentLog[], ref: string, kind: string) => {
  let best: string | null = null;
  let count = 0;
  for (const x of sent) {
    if (x.ref === ref && x.kind === kind) {
      count++;
      if (!best || x.sent_at > best) best = x.sent_at;
    }
  }
  return { best, count };
};

/** Works everything out from the stored records. */
export function compute(data: OfficeData): Office {
  const s = data.settings;
  const today = dubaiDate(data.now);
  const auctions = new Map(data.auctions.map(a => [a.id, a]));
  const sellers = new Map(data.sellers.map(x => [x.id, x]));
  const customers = new Map(data.customers.map(c => [c.id, c]));
  const byCode = new Map(data.customers.map(c => [c.code.toUpperCase(), c]));
  const rate = cardRate(s);
  const feeMethods = new Set((s.card_fee_methods || []).map(m => m.toLowerCase()));

  // Lots, in auction then lot order.
  const lots = data.lots
    .map(l => lotView(l, { auctions, sellers, customers, s, today }))
    .sort((a, b) => a.auctionNo - b.auctionNo || a.lot_number - b.lot_number);

  // Invoice keys that ever existed (lots later withdrawn or returned included), for cancelled orders.
  const everInvoiced = new Set(lots.map(l => l.invoiceKey).filter(Boolean) as string[]);

  // Payments: signed amounts and the card fee inside card payments.
  const ledgerBase = data.ledger
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map(e => ({
      ...e,
      signed: e.kind === "Refund" ? -n0(e.amount) : n0(e.amount),
      cardFee: e.kind !== "Refund" && feeMethods.has(String(e.method || "").toLowerCase()) ? r2((n0(e.amount) * rate) / (1 + rate)) : 0
    }));

  // Group sold lots into one invoice per buyer per auction, in the order buyers first won.
  const groups = new Map<string, LotView[]>();
  for (const l of lots) {
    if (!l.invoiceNo) continue;
    const g = groups.get(l.invoiceNo);
    if (g) g.push(l);
    else groups.set(l.invoiceNo, [l]);
  }
  const adjBy = new Map(data.adjustments.map(a => [a.invoice_no, a]));
  const byInvoice = new Map<string, typeof ledgerBase>();
  for (const e of ledgerBase) {
    if (!e.invoice_no) continue;
    const arr = byInvoice.get(e.invoice_no);
    if (arr) arr.push(e);
    else byInvoice.set(e.invoice_no, [e]);
  }

  // A buyer's deposit pool: deposits (less their card fee) minus deposits refunded.
  const pool = new Map<string, number>();
  for (const e of ledgerBase) {
    if (!e.customer_id) continue;
    if (e.kind === "Deposit") pool.set(e.customer_id, (pool.get(e.customer_id) || 0) + e.signed - e.cardFee);
    else if (e.kind === "Refund" && !e.invoice_no) pool.set(e.customer_id, (pool.get(e.customer_id) || 0) + e.signed);
  }

  type Draft = Omit<InvoiceView, "depositApplied" | "paid" | "balance" | "status" | "hoursOverdue" | "nextStep" | "cardAmount"> & { toCover: number };
  const drafts: Draft[] = [];
  for (const [no, ls] of groups) {
    const first = ls[0];
    const customer = first.customer!;
    const adj = adjBy.get(no);
    const country = customer.country || UAE;
    const delivery = (adj?.delivery || customer.delivery || "Courier") as "Courier" | "Pickup";
    const paysBy = adj?.pays_by || customer.usual_pay || "Bank transfer";
    const hammer = r2(ls.reduce((t, l) => t + n0(l.hammer), 0));
    const std = country === UAE ? n0(s.uae_fee) : null;
    const deliveryFee = delivery === "Pickup" ? 0 : adj && adj.delivery_fee != null ? n0(adj.delivery_fee) : std;
    const cod = paysBy === COD && country === UAE && delivery !== "Pickup" ? n0(s.cod_fee) : 0;
    const extra = n0(adj?.extra);
    const discount = n0(adj?.discount);
    const vat = r2(((hammer + n0(deliveryFee) + cod + extra - discount) * n0(s.vat_sales_pct)) / 100);
    const pays = (byInvoice.get(no) || []).filter(e => e.kind !== "Deposit");
    const cardFee = r2(pays.reduce((t, e) => t + e.cardFee, 0));
    const total = r2(hammer + n0(deliveryFee) + cod + extra - discount + vat + cardFee);
    const paidDirect = r2(pays.reduce((t, e) => t + e.signed, 0));
    const sentInv = lastSent(data.sent, no, "Invoice");
    const rem = lastSent(data.sent, no, "Reminder");
    const delivered = (st: string) => ls.filter(l => l.delivery_status === st).length;
    const done = delivered("Delivered") + delivered("Collected");
    const deliveryStatus: InvoiceView["deliveryStatus"] =
      done === ls.length ? (delivery === "Pickup" ? "Collected" : "Delivered")
        : delivered("With courier") > 0 ? "With courier"
          : done > 0 ? "Part delivered"
            : delivered("Packed") > 0 ? "Packed" : "Not sent";
    const trays = ls.map(l => n0(l.tray)).filter(t => t > 0);
    drafts.push({
      no, auction: first.auction, auctionNo: first.auctionNo, customer, lots: ls, hammer, delivery, paysBy, country,
      deliveryFee, feeMissing: deliveryFee === null, cod, extra, extraLabel: adj?.extra_label || "", discount, vat, cardFee, total, paidDirect,
      toCover: Math.max(0, r2(total - paidDirect)),
      due: auctionDue(first.auction, s),
      deliveryStatus, sentAt: sentInv.best, lastReminder: rem.best, reminders: rem.count,
      lang: (customer.lang || s.wa_lang || "both") as InvoiceView["lang"],
      tray: trays.length ? Math.max(...trays) : null,
      note: adj?.note || "", adjustment: adj
    });
  }

  // Deposits go to a buyer's invoices oldest auction first.
  const invoices: InvoiceView[] = drafts.map(d => {
    const earlier = drafts.filter(x => x.customer.id === d.customer.id && x.auctionNo < d.auctionNo).reduce((t, x) => t + x.toCover, 0);
    const depositApplied = Math.max(0, Math.min(d.toCover, r2((pool.get(d.customer.id) || 0) - earlier)));
    const paid = r2(d.paidDirect + depositApplied);
    const balance = r2(d.total - paid);
    let status: InvoiceStatus;
    if (balance <= 0) status = d.feeMissing ? "Paid – fee to add" : balance < -0.005 ? "Refund due" : "Paid";
    else if (paid > 0) status = d.paidDirect <= 0 ? "Deposit paid" : "Part paid";
    else status = d.paysBy === COD ? "COD – collect" : "Unpaid";
    const hoursOverdue = d.due && balance > 0 && d.paysBy !== COD && data.now > d.due ? Math.round((data.now - d.due) / 3600e3) : null;
    let nextStep: string;
    if (d.deliveryStatus === "Delivered" || d.deliveryStatus === "Collected") nextStep = "Done";
    else if (d.feeMissing) nextStep = "Add delivery fee";
    else if (d.paysBy === COD && (d.country !== UAE || d.delivery === "Pickup")) nextStep = "Check: COD is for UAE courier only";
    else if (balance <= 0 || d.paysBy === COD) nextStep = d.delivery === "Pickup" ? "Ready for pickup" : "Ready to ship";
    else if (hoursOverdue && hoursOverdue > 0) nextStep = "Overdue: cancel the order?";
    else nextStep = "Wait for payment";
    const { toCover: _drop, ...rest } = d;
    void _drop;
    return { ...rest, depositApplied, paid, balance, status, hoursOverdue, nextStep, cardAmount: balance <= 0 ? 0 : r2(balance * (1 + rate)) };
  });
  const invoicesByNo = new Map(invoices.map(i => [i.no, i]));

  // Seller payout state, now that invoices are known.
  for (const l of lots) {
    if (!l.sold || l.type !== "Consignment") continue;
    if (l.seller_paid_on) l.payout = "Paid";
    else if (!l.invoiceNo) l.payout = "Wait – buyer not paid";
    else l.payout = (invoicesByNo.get(l.invoiceNo)?.balance ?? 1) <= 0 ? "Due to seller" : "Wait – buyer not paid";
  }

  // The payments list with its checks.
  const ledger: LedgerView[] = ledgerBase.map(e => {
    const customer = e.customer_id ? customers.get(e.customer_id) : undefined;
    let order: LedgerView["order"] = "";
    let auctionNo: number | null = null;
    if (e.invoice_no) {
      const inv = invoicesByNo.get(e.invoice_no);
      if (inv) {
        order = "Open";
        auctionNo = inv.auctionNo;
      } else {
        const code = e.invoice_no.split("-").slice(1).join("-").toUpperCase();
        order = everInvoiced.has(e.invoice_no) || byCode.has(code) ? "Cancelled" : "Not found";
        if (order === "Cancelled") auctionNo = Number(e.invoice_no.slice(2, 5)) || null;
      }
    }
    const held = e.invoice_no ? r2((byInvoice.get(e.invoice_no) || []).reduce((t, x) => t + (x.kind === "Deposit" ? 0 : x.signed), 0)) : 0;
    let check = "";
    if (e.kind === "Payment" && !e.invoice_no) check = "A payment needs an invoice no. (before invoicing, record a deposit)";
    else if (order === "Not found") check = "Invoice not found";
    else if (order === "Cancelled" && held > 0.005) check = `Order cancelled: AED ${held.toFixed(2)} to refund`;
    else if (e.kind === "Refund" && order === "Open" && (invoicesByNo.get(e.invoice_no)?.balance || 0) > 0.005) check = "Refund leaves this invoice unpaid: check";
    else if (!e.customer_id && !e.invoice_no) check = "Choose the buyer";
    else if (String(e.method).toLowerCase() === "cash" && n0(e.amount) >= n0(s.cash_alert) && n0(s.cash_alert) > 0) check = "Cash at or above the alert: check reporting";
    return { ...e, customer, auctionNo, order, check };
  });

  // Buyers: what they won, owe, and the deposit they still hold.
  const customersOut: CustomerView[] = data.customers.map(c => {
    const won = lots.filter(l => l.sold && l.winner_customer_id === c.id);
    const mine = invoices.filter(i => i.customer.id === c.id);
    const deps = ledgerBase.filter(e => e.customer_id === c.id && e.kind === "Deposit");
    const depositsTaken = r2(deps.reduce((t, e) => t + n0(e.amount) - e.cardFee, 0));
    const depositsRefunded = r2(ledgerBase.filter(e => e.customer_id === c.id && e.kind === "Refund" && !e.invoice_no).reduce((t, e) => t + n0(e.amount), 0));
    const depositsUsed = r2(mine.reduce((t, i) => t + i.depositApplied, 0));
    return {
      ...c, lotsWon: won.length, bought: r2(won.reduce((t, l) => t + n0(l.hammer), 0)), outstanding: r2(mine.reduce((t, i) => t + i.balance, 0)),
      depositsTaken, depositsRefunded, depositsUsed, depositHeld: r2(depositsTaken - depositsRefunded - depositsUsed)
    };
  });
  const customersById = new Map(customersOut.map(c => [c.id, c]));

  // Sellers: what sold, what they're owed.
  const sellersOut: SellerView[] = data.sellers.map(x => {
    const mine = lots.filter(l => l.seller_id === x.id);
    const sold = mine.filter(l => l.sold);
    const net = r2(mine.reduce((t, l) => t + l.net, 0));
    const paidOut = r2(mine.filter(l => l.payout === "Paid").reduce((t, l) => t + l.net, 0));
    return {
      ...x, lotsEntered: mine.length, lotsSold: sold.length, hammer: r2(sold.reduce((t, l) => t + n0(l.hammer), 0)),
      fees: r2(mine.reduce((t, l) => t + l.fee, 0)), net, paidOut, owed: r2(net - paidOut), profit: r2(mine.reduce((t, l) => t + l.profit, 0))
    };
  });
  const sellersById = new Map(sellersOut.map(x => [x.id, x]));

  // Money to give back.
  const lastMethod = (pred: (e: (typeof ledgerBase)[number]) => boolean) => {
    const m = ledgerBase.filter(pred);
    return m.length ? m[m.length - 1].method : "";
  };
  const refunds: RefundDue[] = [];
  for (const i of invoices) {
    if (i.balance < -0.005) {
      refunds.push({ source: "invoice", ref: i.no, auctionNo: i.auctionNo, customer: i.customer, why: "Paid more than the invoice (lot returned or overpaid)", amount: r2(-i.balance), paidBy: lastMethod(e => e.invoice_no === i.no && e.kind !== "Refund") });
    }
  }
  const seenCancelled = new Set<string>();
  for (const e of ledger) {
    if (e.order !== "Cancelled" || seenCancelled.has(e.invoice_no)) continue;
    seenCancelled.add(e.invoice_no);
    const held = r2((byInvoice.get(e.invoice_no) || []).reduce((t, x) => t + (x.kind === "Deposit" ? 0 : x.signed), 0));
    if (held > 0.005) {
      const code = e.invoice_no.split("-").slice(1).join("-").toUpperCase();
      refunds.push({ source: "cancelled", ref: e.invoice_no, auctionNo: e.auctionNo, customer: e.customer || byCode.get(code), why: "Order cancelled after payment (lots withdrawn or returned)", amount: held, paidBy: lastMethod(x => x.invoice_no === e.invoice_no && x.kind !== "Refund") });
    }
  }
  for (const c of customersOut) {
    if (c.depositHeld > 0.005) refunds.push({ source: "deposit", ref: "Deposit", auctionNo: null, customer: c, why: "Deposit held, not used on an invoice", amount: c.depositHeld, paidBy: lastMethod(e => e.customer_id === c.id && e.kind === "Deposit") });
  }

  // Intake: where each consigned watch is now (its latest lot).
  const latestLot = new Map<string, LotView>();
  for (const l of lots) if (l.intake_item_id) latestLot.set(l.intake_item_id, l);
  const intake: IntakeView[] = data.intake
    .slice()
    .sort((a, b) => a.receipt_no.localeCompare(b.receipt_no) || a.position - b.position || a.item_id.localeCompare(b.item_id))
    .map(it => {
      const lot = latestLot.get(it.id);
      let status: string;
      if (it.returned_on) status = "Returned to seller";
      else if (!lot) status = "In stock";
      else if (lot.delivery_status === "Returned to seller") status = "Returned to seller";
      else if (lot.status === "Sold" || lot.status === "Sold – add buyer") status = lot.payout === "Paid" ? "Sold · seller paid" : "Sold";
      else if (["Upcoming", "Open", "Not scheduled", "Winner missing"].includes(lot.status)) status = `In auction ${lot.auctionNo}`;
      else status = `${lot.status}: in stock`;
      return { ...it, seller: it.seller_id ? sellers.get(it.seller_id) : undefined, lot, status };
    });

  // Auction by auction.
  const summaries: AuctionSummary[] = data.auctions
    .slice()
    .sort((a, b) => b.number - a.number)
    .map(a => {
      const ls = lots.filter(l => l.auction_id === a.id);
      const inCat = ls.filter(l => l.exception !== "Withdrawn");
      const sold = ls.filter(l => l.sold);
      const own = sold.filter(l => l.type === "Own stock");
      const invs = invoices.filter(i => i.auction?.id === a.id);
      const ownSales = r2(own.reduce((t, l) => t + n0(l.hammer), 0));
      const ownCost = r2(own.reduce((t, l) => t + n0(l.cost), 0));
      const billed = r2(invs.reduce((t, i) => t + i.total, 0));
      const collected = r2(invs.reduce((t, i) => t + i.paid, 0));
      return {
        auction: a, lots: inCat.length, sold: sold.length, unsold: inCat.length - sold.length,
        sellThrough: inCat.length ? sold.length / inCat.length : null,
        hammer: r2(sold.reduce((t, l) => t + n0(l.hammer), 0)), ownSales, ownCost, ownProfit: r2(ownSales - ownCost),
        sellerFees: r2(ls.reduce((t, l) => t + l.fee, 0)), profit: r2(ls.reduce((t, l) => t + l.profit, 0)),
        invoices: invs.length, billed, collected, outstanding: r2(billed - collected),
        depositsApplied: r2(invs.reduce((t, i) => t + i.depositApplied, 0)),
        owedToSellers: r2(ls.filter(l => l.payout !== "Paid").reduce((t, l) => t + l.net, 0)),
        target: a.lot_target || n0(s.lot_target) || 100
      };
    });

  return {
    data, today, lots, lotsById: new Map(lots.map(l => [l.id, l])), invoices, invoicesByNo, ledger,
    customers: customersOut, customersById, sellers: sellersOut, sellersById, refunds,
    owing: invoices.filter(i => i.balance > 0 && i.paysBy !== COD),
    intake, auctions: summaries
  };
}

// ───────────────────────────── small helpers for pages ─────────────────────────────

/** "AED 1,250" / "AED 1,250.50" */
export const aed = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return `AED ${v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
};
/** "1,250" / "1,250.50" */
export const amt = (n: number | null | undefined) => aed(n).slice(4);

/** The next buyer code (B0001, B0002, …). */
export function nextCustomerCode(customers: Pick<Customer, "code">[]) {
  let max = 0;
  for (const c of customers) {
    const m = /^B(\d+)$/i.exec(c.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `B${String(max + 1).padStart(4, "0")}`;
}

/** The next consignment receipt number (CR-0001, …) and item IDs (CR-0001-01, …). */
export function nextReceiptNo(items: Pick<IntakeItem, "receipt_no">[]) {
  let max = 0;
  for (const it of items) {
    const m = /^CR-(\d+)$/i.exec(it.receipt_no);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CR-${String(max + 1).padStart(4, "0")}`;
}
export function nextItemId(items: Pick<IntakeItem, "item_id">[], receipt: string) {
  let max = 0;
  const pre = `${receipt.toUpperCase()}-`;
  for (const it of items) {
    if (it.item_id.toUpperCase().startsWith(pre)) max = Math.max(max, Number(it.item_id.slice(pre.length)) || 0);
  }
  return `${receipt}-${pad2(max + 1)}`;
}

/** Finds a buyer from what staff type: an @handle, a buyer code, or a phone number. */
export function findCustomer(customers: Customer[], typed: string): Customer | undefined {
  const t = String(typed || "").trim();
  if (!t) return undefined;
  const code = t.toUpperCase();
  const byCode = customers.find(c => c.code.toUpperCase() === code);
  if (byCode) return byCode;
  const h = normHandle(t);
  if (h) {
    const byIg = customers.find(c => normHandle(c.instagram) === h);
    if (byIg) return byIg;
  }
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 8) return customers.find(c => c.phone.replace(/\D/g, "").endsWith(digits.slice(-9)));
  return undefined;
}

export type { Adjustment, CardLink, Customer, IntakeItem, LedgerEntry, OAuction, OfficeData, OfficeSettings, OLot, Seller, SentLog };
