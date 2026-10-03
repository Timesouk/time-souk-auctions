export type Locale = "en" | "ar";

export type Settings = {
  seller_fee: number;
  pay_days: number;
  timer_seconds: number;
  lot_target: number;
  whatsapp: string;
  instagram: string;
  contact_email: string;
};

export type Auction = {
  id: string;
  number: number;
  sale_date: string; // yyyy-mm-dd (Dubai)
  prebid_opens_at: string;
  live_starts_at: string;
  status: "draft" | "published" | "closed";
  block_lot_id: string | null;
  timer_seconds?: number | null; // this auction's timer per lot; empty = the default in Settings
};

export type Lot = {
  id: string;
  auction_id: string;
  lot_number: number;
  brand: string;
  model: string;
  reference: string;
  year: string;
  case_size: string;
  case_material: string;
  dial: string;
  bracelet: string;
  dial_colour: string;
  bezel: string;
  shape: string;
  hands: string;
  has_box: boolean;
  has_papers: boolean;
  condition: string;
  notes_en: string;
  notes_ar: string;
  estimate_low: number;
  estimate_high: number;
  start_price: number;
  no_reserve: boolean;
  reserve_met: boolean;
  made_pure: boolean;
  photos: string[];
  current_bid: number | null;
  leader_paddle: number | null;
  leader_via: string | null;
  bid_count: number;
  ends_at: string | null;
  timer_seconds?: number | null; // this lot's own timer, set from the live console
};

export type BidRow = {
  amount: number;
  paddle: number | null;
  via: string;
  is_auto: boolean;
  created_at: string;
};

export type LotStatus = "preview" | "open" | "block" | "live" | "sold" | "unsold";

export type MyStatus = {
  paddle: number;
  full_name: string;
  email: string;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  terms_accepted: boolean;
  country: string;
  instagram: string | null;
  lang: Locale;
  role: "bidder" | "staff" | "admin";
  suspended: boolean;
  verified: boolean;
};

export type LotPrivate = {
  lot_id: string;
  reserve: number | null;
  source: "stock" | "consign";
  cost: number | null;
  consignor_name: string;
  consignor_phone: string;
  consignor_email: string;
  seller_fee: number | null;
};

export type Invoice = {
  id: string;
  number: string;
  lot_id: string;
  auction_id: string;
  bidder_id: string | null;
  ig_handle: string | null;
  amount: number;
  due_date: string;
  status: "unpaid" | "processing" | "paid" | "void";
  method: "card" | "tabby" | "tamara" | "bank" | "cash" | null;
  paid_at: string | null;
  pay_token: string;
  notified_at: string | null;
  notify_error: string | null;
  reminded_at: string | null;
  transfer_claimed_at: string | null;
  payout_paid_at: string | null;
  created_at: string;
};
