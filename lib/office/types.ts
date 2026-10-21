// Back office (the auction workbook, inside the admin): the stored records, as they come from the database.

export type Lang3 = "both" | "en" | "ar";

export type OfficeSettings = {
  trading_name: string;
  legal_name: string;
  licence: string;
  address: string;
  phone: string;
  email: string;
  instagram: string;
  website: string;
  trn: string;
  /** The name customers see: "DXB Watch × The Time Souk". Blank = the trading name. */
  brand_name: string;
  bank_name: string;
  bank_account: string;
  bank_iban: string;
  bank_swift: string;
  /** Percentages are stored as percent: 7.5 = 7.5%. */
  fee_pct: number;
  fee_fixed: number;
  fee_min: number;
  vat_fee_pct: number;
  vat_sales_pct: number;
  hours_to_pay: number;
  /** "21:00" or "21:00:00": when the payment clock starts on auction day. */
  pay_clock: string;
  uae_fee: number;
  cod_fee: number;
  card_fee_pct: number;
  /** Payment methods that carry the card fee (the full amount received includes it). */
  card_fee_methods: string[];
  cash_alert: number;
  remind_gap_hours: number;
  lot_target: number;
  wa_lang: Lang3;
  wa_mode: "app" | "web";
  link_mode: "ask" | "always";
  inv_note: string;
  inv_terms: string;
  seller_terms: string;
  intake_terms: string;
  slip_note: string;
  /** Accounting: the account each payment method lands in ("Cash" → "1010"). */
  acct_methods: Record<string, string>;
  /** Accounting: the account sellers are paid from unless a payout says otherwise. */
  acct_payout_default: string;
  /** Accounting: books closed up to this date (yyyy-mm-dd), or null. */
  acct_lock_date: string | null;
};

export const DEFAULT_ACCT_METHODS: Record<string, string> = {
  "Bank transfer": "1020", Cash: "1010", "Card link (Ziina)": "1030", "Card (website)": "1030", Tabby: "1040", Tamara: "1050", "Cash on delivery": "1060", Other: "1900"
};

/** The defaults, as in the database (0006). */
export const DEFAULT_SETTINGS: OfficeSettings = {
  trading_name: "The Time Souk", legal_name: "The TS for Online Selling", licence: "", address: "Dubai, United Arab Emirates",
  phone: "+971 50 696 9080", email: "", instagram: "@thetimesouk", website: "timesoukauctions.com", trn: "",
  brand_name: "DXB Watch × The Time Souk", bank_name: "", bank_account: "", bank_iban: "", bank_swift: "",
  fee_pct: 7.5, fee_fixed: 0, fee_min: 0, vat_fee_pct: 0, vat_sales_pct: 0, hours_to_pay: 48, pay_clock: "21:00",
  uae_fee: 30, cod_fee: 10, card_fee_pct: 3, card_fee_methods: ["Card link (Ziina)"], cash_alert: 55000, remind_gap_hours: 12,
  lot_target: 100, wa_lang: "both", wa_mode: "app", link_mode: "ask", inv_note: "No buyer's premium: you pay the hammer price.",
  inv_terms: "", seller_terms: "", intake_terms: "", slip_note: "Your invoice follows on WhatsApp. Thank you!",
  acct_methods: { ...DEFAULT_ACCT_METHODS },
  acct_payout_default: "1020",
  acct_lock_date: null
};

export type OAuction = {
  id: string;
  number: number;
  /** yyyy-mm-dd (Dubai) */
  sale_date: string;
  live_starts_at: string;
  status: "draft" | "published" | "closed";
  /** "20:00:00", or null for the Settings time */
  pay_clock: string | null;
  office_notes: string;
  lot_target: number | null;
  /** Published for the Instagram live (the website shows it only when status is "published"). */
  instagram?: boolean;
  /** The training auction: never on the website, kept out of the accounts and totals. */
  demo?: boolean;
};

/** Where an auction is: what staff see next to its number. */
export type AuctionState = "Demo" | "Draft" | "Instagram only" | "Website + Instagram" | "Closed";
export function auctionState(a: Pick<OAuction, "status" | "instagram" | "demo">): AuctionState {
  if (a.demo) return "Demo";
  if (a.status === "closed") return "Closed";
  if (a.status === "published") return "Website + Instagram";
  return a.instagram ? "Instagram only" : "Draft";
}

/** The training auction's number (lots 999-01…, invoices TS999-D0001). */
export const DEMO_AUCTION_NO = 999;

export const EXCEPTIONS = ["Withdrawn", "Buyer defaulted", "Returned by buyer"] as const;
export type LotException = (typeof EXCEPTIONS)[number];

export const DELIVERY_STATUSES = ["Packed", "With courier", "Delivered", "Collected", "Returned to seller", "Back in stock", "Relisted"] as const;
export const BOX_PAPERS = ["Full set", "Watch + box", "Watch + papers", "Watch only"] as const;
export const CONDITIONS = ["Unworn", "Excellent", "Very good", "Good", "Fair"] as const;
export const PAY_METHODS = ["Bank transfer", "Cash", "Card link (Ziina)", "Tabby", "Tamara", "Cash on delivery", "Other"] as const;
/** A buyer who paid the consignor straight to their account: counts as paid on the invoice, and as money the seller has already had. */
export const DIRECT = "Paid to seller directly";
export const COD = "Cash on delivery";
export const UAE = "United Arab Emirates";
export const COUNTRIES = [UAE, "Oman", "Saudi Arabia", "Bahrain", "Kuwait", "Qatar", "Other"] as const;

/** A lot: the website's public fields plus the staff-only workbook fields (lot_private). */
export type OLot = {
  id: string;
  auction_id: string;
  lot_number: number;
  brand: string;
  model: string;
  reference: string;
  year: string;
  condition: string;
  start_price: number;
  has_box: boolean;
  has_papers: boolean;
  // website bidding (when the lot ran in the live console)
  current_bid: number | null;
  ends_at: string | null;
  no_reserve: boolean;
  reserve_met: boolean;
  made_pure: boolean;
  leader_id: string | null;
  leader_ig: string | null;
  // staff-only
  reserve: number | null;
  cost: number | null;
  /** The lot's own fee % (blank = the seller's). */
  seller_fee: number | null;
  fee_fixed: number | null;
  seller_id: string | null;
  intake_item_id: string | null;
  serial: string;
  box_papers: string;
  intake_date: string | null;
  winner_customer_id: string | null;
  /** What staff typed in the winner box (an @handle or a buyer code). */
  winner_text: string;
  hammer: number | null;
  underbidder: string;
  underbid: number | null;
  exception: LotException | null;
  delivery_status: string;
  dispatched_on: string | null;
  courier: string;
  seller_paid_on: string | null;
  payout_ref: string;
  /** The account the seller was paid from ("" = the default payout account). */
  payout_account: string;
  office_notes: string;
  tray: number | null;
  slip_printed_at: string | null;
  /** Cash that moved when the seller was settled (+ we paid them, − they paid us); null = the lot's net. */
  payout_amount?: number | null;
};

export type Customer = {
  id: string;
  code: string;
  instagram: string | null;
  full_name: string;
  phone: string;
  email: string;
  address: string;
  area: string;
  /** "" = United Arab Emirates */
  country: string;
  /** "" = Courier */
  delivery: "" | "Courier" | "Pickup";
  usual_pay: string;
  id_checked: boolean;
  flag: "OK" | "Watch" | "Blocked";
  notes: string;
  /** "" = Settings */
  lang: "" | Lang3;
  profile_id: string | null;
  /** A demo buyer (training): only wins lots in the demo auction. */
  demo?: boolean;
};

export type Seller = {
  id: string;
  code: string;
  name: string;
  kind: "consignment" | "own";
  phone: string;
  instagram: string;
  email: string;
  id_checked: string;
  fee_pct: number | null;
  fee_fixed: number | null;
  bank: string;
  iban: string;
  notes: string;
  /** A demo seller (training). */
  demo?: boolean;
};

export type IntakeItem = {
  id: string;
  receipt_no: string;
  item_id: string;
  position: number;
  received_on: string | null;
  seller_id: string | null;
  brand: string;
  model: string;
  reference: string;
  serial: string;
  year: string;
  box_papers: string;
  condition: string;
  notes: string;
  reserve: number | null;
  start_price: number | null;
  fee_pct: number | null;
  fee_fixed: number | null;
  received_by: string;
  returned_on: string | null;
};

export type Adjustment = {
  invoice_no: string;
  delivery: "" | "Courier" | "Pickup";
  pays_by: string;
  delivery_fee: number | null;
  discount: number | null;
  extra: number | null;
  extra_label: string;
  note: string;
};

export type LedgerKind = "Deposit" | "Payment" | "Refund";
export type LedgerEntry = {
  id: string;
  seq: number;
  entry_date: string;
  kind: LedgerKind;
  customer_id: string | null;
  invoice_no: string;
  method: string;
  amount: number;
  reference: string;
  received_by: string;
  notes: string;
  created_at: string;
  /** The consignor who received this payment straight from the buyer (method DIRECT). */
  paid_to_seller_id?: string | null;
};

export type SentLog = {
  id: number;
  sent_at: string;
  ref: string;
  name: string;
  phone: string;
  total: number | null;
  balance: number | null;
  file: string;
  kind: string;
  link: string;
};

export type CardLink = {
  id: string;
  created_at: string;
  kind: "Invoice" | "Lot" | "Deposit";
  invoice_no: string;
  lot_key: string;
  customer_id: string | null;
  name: string;
  amount: number;
  fee: number;
  card_amount: number;
  expires_at: string | null;
  ziina_id: string | null;
  url: string;
  status: string;
  checked_at: string | null;
  ledger_id: string | null;
};

export type MessageOverrides = Record<string, { en?: string | null; ar?: string | null }>;

/** Everything the back office works from. */
export type OfficeData = {
  settings: OfficeSettings;
  auctions: OAuction[];
  lots: OLot[];
  customers: Customer[];
  sellers: Seller[];
  intake: IntakeItem[];
  adjustments: Adjustment[];
  ledger: LedgerEntry[];
  sent: SentLog[];
  cards: CardLink[];
  messages: MessageOverrides;
  /** "Now" in milliseconds, so every page computes against the same clock. */
  now: number;
};

// ───────────────────────────── accounting ─────────────────────────────

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type Account = { code: string; name: string; type: AccountType; subtype: string; system: boolean; active: boolean; notes: string };
export type ManualLine = { id: number; account_code: string; debit: number; credit: number; memo: string };
export type ManualKind = "expense" | "income" | "purchase" | "transfer" | "owner" | "opening" | "journal";
export type ManualEntry = {
  id: string; entry_date: string; kind: ManualKind; memo: string; payee: string; reference: string; void: boolean; void_reason: string; created_at: string; lines: ManualLine[];
};
export type Cleared = { key: string; account_code: string; cleared_on: string; reconciliation_id: string | null };
export type Reconciliation = { id: string; account_code: string; statement_date: string; statement_balance: number; cleared_balance: number; created_at: string };
export type AcctData = { accounts: Account[]; entries: ManualEntry[]; cleared: Cleared[]; recons: Reconciliation[] };
