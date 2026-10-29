// A consignor's account with us, line by line, across every auction: what their sold watches earned them, what buyers
// paid them directly (for their own watches or anyone else's), what we paid them and what they paid us. Pure (no database).
import { pad3, r2, type InvoiceView, type LotView, type Office } from "./engine";
import { COD, DIRECT } from "./types";

export type AccountLine = {
  date: string;
  /** "sale", "direct", "payout", "settlement" */
  kind: "sale" | "direct" | "payout" | "settlement";
  what: string;
  ref: string;
  /** + adds to what we owe them, − takes it off */
  amount: number;
  balance: number;
  note: string;
};

export type SellerAccount = {
  lines: AccountLine[];
  /** we owe them (+) or they owe us (−) */
  balance: number;
  /** part of the balance for lots whose buyer hasn't paid yet (payable once they do) */
  waiting: number;
};

const ORDER = { sale: 0, direct: 1, payout: 2, settlement: 3 } as const;
const money = (n: number) => `AED ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function sellerAccount(o: Office, sellerId: string): SellerAccount {
  const seller = o.sellersById.get(sellerId);
  const demoOk = !!seller?.demo;
  const raw: Omit<AccountLine, "balance">[] = [];
  const lots = o.lots.filter(l => l.seller_id === sellerId && l.sold && l.type === "Consignment" && (demoOk || !l.demo));
  for (const l of lots) {
    raw.push({
      date: l.auction?.sale_date || o.today, kind: "sale", ref: l.key,
      what: `Lot ${l.key} · ${`${l.brand} ${l.model}`.trim()} sold for ${money(Number(l.hammer) || 0)}, less our fee ${money(l.fee + l.vatFee)}`,
      amount: l.net, note: l.payout === "Wait – buyer not paid" ? "buyer hasn't paid yet" : ""
    });
  }
  const splitNote = new Map<string, string>();
  for (const e of o.ledger) {
    if (e.kind !== "Payment" || e.method !== DIRECT || e.paid_to_seller_id !== sellerId || (!demoOk && e.demo)) continue;
    const buyer = e.customer ? e.customer.code : "A buyer";
    // what the money was for: their share of their own watches, and what's ours (fee, delivery, other watches)
    if (e.invoice_no && !splitNote.has(e.invoice_no)) {
      const d = directSplit(o, e.invoice_no, sellerId);
      splitNote.set(e.invoice_no, d ? [d.yours > 0.005 ? `yours ${amtText(d.yours)}` : "", d.ours > 0.005 ? `ours ${amtText(d.ours)}: ${oursText(d)}` : ""].filter(Boolean).join("; ") : "");
    }
    raw.push({
      date: e.entry_date, kind: "direct", ref: e.invoice_no,
      what: `${buyer} paid you directly · invoice ${e.invoice_no}`,
      amount: -e.amount, note: [splitNote.get(e.invoice_no) || "", e.reference].filter(Boolean).join(" · ")
    });
  }
  // lot payouts: one line per payment (date, reference)
  const payouts = new Map<string, { date: string; ref: string; cash: number; lots: string[] }>();
  for (const l of lots) {
    if (!l.seller_paid_on) continue;
    const k = `${l.seller_paid_on}|${l.payout_ref}`;
    const p = payouts.get(k) || { date: l.seller_paid_on, ref: l.payout_ref, cash: 0, lots: [] };
    p.cash += l.payout_amount != null ? Number(l.payout_amount) : l.net;
    p.lots.push(l.key);
    payouts.set(k, p);
  }
  for (const p of payouts.values()) {
    const cash = r2(p.cash);
    raw.push({
      date: p.date, kind: "payout", ref: p.ref,
      what: cash >= 0 ? `Paid to you for lot${p.lots.length === 1 ? "" : "s"} ${p.lots.join(", ")}` : `You paid us, settling lot${p.lots.length === 1 ? "" : "s"} ${p.lots.join(", ")}`,
      amount: -cash, note: p.ref
    });
  }
  for (const x of o.data.settlements || []) {
    if (x.seller_id !== sellerId) continue;
    const amt = Number(x.amount) || 0;
    raw.push({ date: x.entry_date, kind: "settlement", ref: x.reference, what: amt > 0 ? "Paid to you on account" : "You paid us", amount: -amt, note: [x.reference, x.notes].filter(Boolean).join(" · ") });
  }
  raw.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind] || a.ref.localeCompare(b.ref));
  let run = 0;
  const lines = raw.map(l => {
    run = r2(run + l.amount);
    return { ...l, amount: r2(l.amount), balance: run };
  });
  return { lines, balance: run, waiting: r2(lots.filter(l => l.payout === "Wait – buyer not paid").reduce((t, l) => t + l.net, 0)) };
}

// ───────────────────────────── one auction ─────────────────────────────

const amtText = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const isPaid = (inv: InvoiceView | undefined) => !!inv && inv.balance <= 0.005;

/** How a lot's buyer has paid, in words a seller understands (no other buyer's amounts). */
export function buyerPaidText(o: Office, inv: InvoiceView | undefined, sellerId: string): string {
  if (!inv) return "Buyer to be chosen";
  const pays = o.ledger.filter(e => e.invoice_no === inv.no && e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id);
  const toThem = r2(pays.filter(e => e.paid_to_seller_id === sellerId).reduce((t, e) => t + e.signed, 0));
  const toOthers = [...new Set(pays.filter(e => e.paid_to_seller_id !== sellerId).map(e => o.sellersById.get(e.paid_to_seller_id!)?.code || "another seller"))];
  if (inv.balance <= 0.005) {
    const toUs = r2(inv.paid - inv.paidToSeller);
    if (toThem > 0.005 && toUs <= 0.005 && !toOthers.length) return "Paid to you directly";
    if (toThem > 0.005) return "Paid (part to you directly)";
    if (toOthers.length) return `Paid (part to ${toOthers.join(", ")} directly)`;
    return "Paid to us";
  }
  if (inv.paysBy === COD && inv.paid <= 0.005) return "Cash on delivery, not collected yet";
  if (inv.paid > 0.005) return toThem > 0.005 ? "Part paid (some to you directly)" : "Part paid";
  return "Not paid yet";
}

/** A lot on a statement: who bought it, whether they've paid, and when its money reaches the seller. */
export type StatementLot = {
  lot: LotView;
  buyer: string;
  /** e.g. "Paid to us", "Paid to you directly", "Not paid yet", "Cash on delivery, not collected yet" */
  buyerPaid: string;
  /** its buyer has paid in full, or it's already settled with the seller */
  ready: boolean;
  /** e.g. "Paid to you 28 Oct", "Due now", "When the buyer pays" */
  toYou: string;
};

/**
 * Money one buyer paid the seller directly, for one invoice, and what it was for. The seller keeps their share of their
 * own watches; the rest (our fee on those watches, delivery and other charges, other sellers' or our own watches) is ours.
 */
export type DirectSplit = {
  invoice: string;
  buyer: string;
  dates: string[];
  references: string[];
  /** paid to this seller on this invoice */
  received: number;
  /** what the buyer bought on the invoice */
  items: { label: string; amount: number; yours: boolean }[];
  total: number;
  paidToUs: number;
  paidToOtherSellers: number;
  stillToPay: number;
  /** the buyer has paid the whole invoice (to anyone) */
  ready: boolean;
  /** the seller's share of their own watches, out of what they received */
  yours: number;
  /** the rest is ours: our fee on their watches, delivery and charges, other watches */
  oursFee: number;
  oursCharges: number;
  oursOthers: number;
  ours: number;
};

const chargeItems = (inv: InvoiceView) =>
  [
    { label: inv.delivery === "Pickup" ? "" : "Delivery", amount: inv.feeMissing ? 0 : n(inv.deliveryFee) },
    { label: "Cash on delivery charge", amount: inv.cod },
    { label: inv.extraLabel || "Other charges", amount: inv.extra },
    { label: "Discount", amount: -inv.discount },
    { label: "VAT", amount: inv.vat },
    { label: "Card payment fee", amount: inv.cardFee }
  ].filter(x => x.label && Math.abs(x.amount) > 0.005);

const n = (v: number | null | undefined) => Number(v) || 0;

export function directSplit(o: Office, invoiceNo: string, sellerId: string): DirectSplit | null {
  const pays = o.ledger.filter(e => e.invoice_no === invoiceNo && e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id === sellerId);
  if (!pays.length) return null;
  const received = r2(pays.reduce((t, e) => t + e.signed, 0));
  const inv = o.invoicesByNo.get(invoiceNo);
  const base = {
    invoice: invoiceNo, buyer: pays[0].customer?.code || "", dates: [...new Set(pays.map(e => e.entry_date))].sort(),
    references: pays.map(e => e.reference).filter(Boolean), received
  };
  if (!inv) {
    // the order was cancelled: all of it is ours to refund or keep
    return { ...base, items: [], total: 0, paidToUs: 0, paidToOtherSellers: 0, stillToPay: 0, ready: true, yours: 0, oursFee: 0, oursCharges: 0, oursOthers: received, ours: received };
  }
  const own = inv.lots.filter(l => l.seller_id === sellerId);
  const others = inv.lots.filter(l => l.seller_id !== sellerId);
  const ownNet = r2(own.reduce((t, l) => t + l.net, 0));
  const ownHammer = r2(own.reduce((t, l) => t + n(l.hammer), 0));
  const charges = chargeItems(inv);
  const chargesTotal = r2(charges.reduce((t, c) => t + c.amount, 0));
  const yours = r2(Math.max(0, Math.min(received, ownNet)));
  let rest = r2(received - yours);
  const oursFee = r2(Math.max(0, Math.min(rest, ownHammer - ownNet)));
  rest = r2(rest - oursFee);
  const oursCharges = r2(Math.max(0, Math.min(rest, chargesTotal)));
  const oursOthers = r2(rest - oursCharges);
  const toOtherSellers = r2(o.ledger.filter(e => e.invoice_no === invoiceNo && e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id && e.paid_to_seller_id !== sellerId).reduce((t, e) => t + e.signed, 0));
  const owner = (l: LotView) => (l.type === "Own stock" ? "our own stock" : l.seller ? `seller ${l.seller.code}` : "another seller");
  return {
    ...base,
    items: [
      ...own.map(l => ({ label: `Lot ${l.key} · ${`${l.brand} ${l.model}`.trim()} (yours)`, amount: n(l.hammer), yours: true })),
      ...others.map(l => ({ label: `Lot ${l.key} · ${`${l.brand} ${l.model}`.trim()} (not yours: ${owner(l)})`, amount: n(l.hammer), yours: false })),
      ...charges.map(c => ({ ...c, yours: false }))
    ],
    total: inv.total,
    paidToUs: r2(inv.paid - inv.paidToSeller),
    paidToOtherSellers: toOtherSellers,
    stillToPay: r2(Math.max(0, inv.balance)),
    ready: isPaid(inv),
    yours, oursFee, oursCharges, oursOthers, ours: r2(oursFee + oursCharges + oursOthers)
  };
}

/** "AED 330 is ours: our fee on your watch (300) and delivery (30)" */
export function oursText(d: DirectSplit) {
  const charges = d.items.filter(i => !i.yours && !/^Lot /.test(i.label));
  const chargesLabel = charges.length === 1 ? charges[0].label.toLowerCase() : "delivery and charges";
  const parts = [
    d.oursFee > 0.005 ? `our fee on your watch${d.items.filter(i => i.yours).length === 1 ? "" : "es"} (${amtText(d.oursFee)})` : "",
    d.oursCharges > 0.005 ? `${chargesLabel} (${amtText(d.oursCharges)})` : "",
    d.oursOthers > 0.005 ? `watches that aren't yours (${amtText(d.oursOthers)})` : ""
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] || "";
}

/** One seller's figures for one auction, now (buyers who have paid) and once every buyer has paid. */
export type AuctionFigures = {
  lots: LotView[];
  sold: LotView[];
  rows: StatementLot[];
  hammer: number;
  fees: number;
  vatFees: number;
  /** consignment: their share (hammer less our fee and its VAT), all sold lots / lots whose buyer has paid (or settled) */
  net: number;
  netReady: number;
  /** what buyers paid the seller directly on this auction's invoices: all / on invoices paid in full */
  direct: number;
  directReady: number;
  splits: DirectSplit[];
  /** cash we paid them for this auction's lots (negative: they paid us when the lots were settled) */
  paidByUs: number;
  /** + we owe them, − they owe us: now (only buyers who have paid count) and once every buyer has paid */
  balanceNow: number;
  balance: number;
  /** lots still waiting for their buyer, and the seller's share of them */
  waitingRows: StatementLot[];
  waiting: number;
  /** own stock: who bought each sold lot and whether they've paid */
  buyer: Map<string, string>;
  cost: number;
  costMissing: number;
  profit: number;
  /** own stock: hammer of sold lots whose buyer hasn't paid in full yet */
  unpaidHammer: number;
};

export function auctionFigures(o: Office, auctionId: string, sellerId: string): AuctionFigures | null {
  const auction = o.data.auctions.find(a => a.id === auctionId);
  const seller = o.sellersById.get(sellerId);
  if (!auction || !seller) return null;
  const lots = o.lots.filter(l => l.auction_id === auctionId && l.seller_id === sellerId && (seller.demo || !l.demo));
  const sold = lots.filter(l => l.sold);
  const sum = (ls: LotView[], f: (l: LotView) => number) => r2(ls.reduce((t, l) => t + f(l), 0));
  const cashOf = (l: LotView) => (l.payout_amount != null ? Number(l.payout_amount) : l.net);
  const dm = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
  const rows: StatementLot[] = sold.map(l => {
    const inv = l.invoiceNo ? o.invoicesByNo.get(l.invoiceNo) : undefined;
    const settled = l.type === "Consignment" && !!l.seller_paid_on;
    const ready = settled || isPaid(inv);
    const cash = settled ? cashOf(l) : 0;
    const toYou = l.type !== "Consignment" ? "" : settled ? (cash > 0.005 ? `Paid to you ${dm(l.seller_paid_on)}` : `Settled ${dm(l.seller_paid_on)}`) : ready ? "Due now" : "When the buyer pays";
    return { lot: l, buyer: inv?.customer.code || l.customer?.code || "", buyerPaid: buyerPaidText(o, inv, sellerId), ready, toYou };
  });
  const consigned = rows.filter(r => r.lot.type === "Consignment");
  const prefix = `TS${pad3(auction.number)}-`;
  const invoices = [...new Set(o.ledger
    .filter(e => e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id === sellerId && (e.invoice_no || "").toUpperCase().startsWith(prefix) && (seller.demo || !e.demo))
    .map(e => e.invoice_no))];
  const splits = invoices.map(no => directSplit(o, no, sellerId)).filter((x): x is DirectSplit => !!x).sort((a, b) => (a.dates[0] || "").localeCompare(b.dates[0] || "") || a.invoice.localeCompare(b.invoice));
  // nothing of theirs in this auction (no lots, and no buyer paid them for anything in it)
  if (!lots.length && !splits.length) return null;
  const direct = r2(splits.reduce((t, d) => t + d.received, 0));
  const directReady = r2(splits.filter(d => d.ready).reduce((t, d) => t + d.received, 0));
  const net = sum(consigned.map(r => r.lot), l => l.net);
  const netReady = sum(consigned.filter(r => r.ready).map(r => r.lot), l => l.net);
  const paidByUs = sum(consigned.filter(r => r.lot.payout === "Paid").map(r => r.lot), cashOf);
  const waitingRows = consigned.filter(r => !r.ready);
  const own = rows.filter(r => r.lot.type === "Own stock");
  return {
    lots, sold, rows,
    hammer: sum(sold, l => n(l.hammer)), fees: sum(sold, l => l.fee), vatFees: sum(sold, l => l.vatFee),
    net, netReady, direct, directReady, splits, paidByUs,
    balanceNow: r2(netReady - directReady - paidByUs),
    balance: r2(net - direct - paidByUs),
    waitingRows, waiting: sum(waitingRows.map(r => r.lot), l => l.net),
    buyer: new Map(own.map(r => [r.lot.id, `${r.buyer ? `${r.buyer} · ` : ""}${r.buyerPaid}`])),
    cost: sum(own.map(r => r.lot), l => n(l.cost)),
    costMissing: own.filter(r => !(n(r.lot.cost) > 0)).length,
    profit: sum(own.map(r => r.lot), l => l.profit),
    unpaidHammer: sum(own.filter(r => !r.ready).map(r => r.lot), l => n(l.hammer))
  };
}

/**
 * A consignor's whole balance, every auction: now (only buyers who have paid count) and once every buyer has paid
 * (= what the seller's page calls owed). + we owe them, − they owe us.
 */
export function sellerNowAndLater(o: Office, sellerId: string) {
  const seller = o.sellersById.get(sellerId);
  let now = 0;
  let later = 0;
  for (const a of o.data.auctions) {
    if (a.demo && !seller?.demo) continue;
    const f = auctionFigures(o, a.id, sellerId);
    if (!f) continue;
    now += f.balanceNow;
    later += f.balance;
  }
  const settled = (o.data.settlements || []).filter(x => x.seller_id === sellerId).reduce((t, x) => t + (Number(x.amount) || 0), 0);
  return { now: r2(now - settled), later: r2(later - settled) };
}

/** Sellers with something in this auction: lots, or a buyer of it who paid them directly. */
export function sellersInAuction(o: Office, auctionId: string): string[] {
  const auction = o.data.auctions.find(a => a.id === auctionId);
  if (!auction) return [];
  const prefix = `TS${pad3(auction.number)}-`;
  const ids = new Set(o.lots.filter(l => l.auction_id === auctionId && l.seller_id).map(l => l.seller_id!));
  for (const e of o.ledger) if (e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id && (e.invoice_no || "").toUpperCase().startsWith(prefix)) ids.add(e.paid_to_seller_id);
  return [...ids];
}
