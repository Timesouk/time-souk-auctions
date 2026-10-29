// A consignor's account with us, line by line, across every auction: what their sold watches earned them, what buyers
// paid them directly (for their own watches or anyone else's), what we paid them and what they paid us. Pure (no database).
import { pad3, r2, type LotView, type Office } from "./engine";
import { DIRECT } from "./types";

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
  for (const e of o.ledger) {
    if (e.kind !== "Payment" || e.method !== DIRECT || e.paid_to_seller_id !== sellerId || (!demoOk && e.demo)) continue;
    const inv = o.invoicesByNo.get(e.invoice_no);
    const theirs = inv ? inv.lots.filter(l => l.seller_id === sellerId).map(l => l.key) : [];
    const others = inv ? inv.lots.filter(l => l.seller_id !== sellerId).map(l => l.key) : [];
    const buyer = e.customer ? e.customer.code : "A buyer";
    raw.push({
      date: e.entry_date, kind: "direct", ref: e.invoice_no,
      what: `${buyer} paid you directly · invoice ${e.invoice_no}${others.length && !theirs.length ? ` (lot${others.length === 1 ? "" : "s"} ${others.join(", ")}, not yours: held for us)` : others.length ? ` (incl. lot${others.length === 1 ? "" : "s"} ${others.join(", ")}, not yours)` : ""}`,
      amount: -e.amount, note: e.reference
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

/** One payment a buyer made straight to the seller, for an invoice of this auction. */
export type DirectLine = { date: string; invoice: string; buyer: string; amount: number; reference: string; others: string[] };

/** One seller's figures for one auction: what their sold watches came to, and what's left after what they've had. */
export type AuctionFigures = {
  lots: LotView[];
  sold: LotView[];
  hammer: number;
  fees: number;
  vatFees: number;
  /** consignment: hammer less our fee and its VAT */
  net: number;
  /** what this auction's buyers paid the seller directly (for their watches or anyone else's) */
  direct: number;
  directs: DirectLine[];
  /** cash we paid them for this auction's lots (negative: they paid us when the lots were settled) */
  paidByUs: number;
  /** net − direct − paidByUs: + we still owe them for this auction, − they owe us */
  balance: number;
  /** part of a positive balance for lots whose buyer hasn't paid yet */
  waiting: number;
  /** invoices of this auction whose buyer paid this seller directly */
  directInvoices: Set<string>;
  /** own stock: who bought each sold lot and whether they've paid (e.g. "B0006 · Paid · to S001 directly") */
  buyer: Map<string, string>;
  /** own stock: cost of the watches sold, how many sold without a cost, and the profit */
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
  const lots = o.lots.filter(l => l.auction_id === auctionId && l.seller_id === sellerId);
  if (!lots.length) return null;
  const sold = lots.filter(l => l.sold);
  const sum = (f: (l: LotView) => number) => r2(sold.reduce((t, l) => t + f(l), 0));
  const prefix = `TS${pad3(auction.number)}-`;
  const directs: DirectLine[] = o.ledger
    .filter(e => e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id === sellerId && (e.invoice_no || "").toUpperCase().startsWith(prefix) && (seller.demo || !e.demo))
    .map(e => {
      const inv = o.invoicesByNo.get(e.invoice_no);
      return {
        date: e.entry_date, invoice: e.invoice_no, buyer: e.customer?.code || "", amount: r2(e.signed), reference: e.reference || "",
        others: inv ? inv.lots.filter(l => l.seller_id !== sellerId).map(l => l.key) : []
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.invoice.localeCompare(b.invoice));
  const direct = r2(directs.reduce((t, d) => t + d.amount, 0));
  const consigned = sold.filter(l => l.type === "Consignment");
  const net = r2(consigned.reduce((t, l) => t + l.net, 0));
  const paidByUs = r2(consigned.filter(l => l.payout === "Paid").reduce((t, l) => t + (l.payout_amount != null ? Number(l.payout_amount) : l.net), 0));
  const balance = r2(net - direct - paidByUs);
  const waitingNet = r2(consigned.filter(l => l.payout === "Wait – buyer not paid").reduce((t, l) => t + l.net, 0));
  const own = sold.filter(l => l.type === "Own stock");
  const buyer = new Map<string, string>();
  for (const l of own) {
    const inv = l.invoiceNo ? o.invoicesByNo.get(l.invoiceNo) : undefined;
    if (!inv) {
      buyer.set(l.id, "Buyer to choose");
      continue;
    }
    const to = [...new Set(o.ledger.filter(e => e.invoice_no === inv.no && e.kind === "Payment" && e.method === DIRECT && e.paid_to_seller_id).map(e => o.sellersById.get(e.paid_to_seller_id!)?.code || "a seller"))];
    buyer.set(l.id, `${inv.customer.code} · ${inv.status}${to.length ? ` · paid to ${to.join(", ")} directly` : ""}`);
  }
  return {
    lots, sold,
    hammer: sum(l => Number(l.hammer) || 0), fees: sum(l => l.fee), vatFees: sum(l => l.vatFee), net,
    direct, directs, paidByUs, balance,
    waiting: balance > 0 ? r2(Math.min(balance, waitingNet)) : 0,
    directInvoices: new Set(directs.map(d => d.invoice.toUpperCase())),
    buyer,
    cost: r2(own.reduce((t, l) => t + (Number(l.cost) || 0), 0)),
    costMissing: own.filter(l => !(Number(l.cost) > 0)).length,
    profit: r2(own.reduce((t, l) => t + l.profit, 0)),
    unpaidHammer: r2(own.filter(l => !l.invoiceNo || (o.invoicesByNo.get(l.invoiceNo)?.balance ?? 1) > 0.005).reduce((t, l) => t + (Number(l.hammer) || 0), 0))
  };
}
