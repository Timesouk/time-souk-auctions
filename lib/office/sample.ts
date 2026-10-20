// Made-up records for preview mode (no Supabase): every name, number and handle here is fictional.
import { DEFAULT_CHART } from "./chart";
import { DEFAULT_SETTINGS, type Customer, type IntakeItem, type LedgerEntry, type OAuction, type OfficeData, type OLot, type Seller } from "./types";

const day = (now: number, offset: number) => new Date(now + 4 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

export function sampleOffice(now = Date.now()): OfficeData {
  const past = day(now, -3);
  const next = day(now, 4);
  const auctions: OAuction[] = [
    { id: "a1", number: 1, sale_date: past, live_starts_at: `${past}T21:00:00+04:00`, status: "closed", pay_clock: null, office_notes: "", lot_target: 100 },
    { id: "a2", number: 2, sale_date: next, live_starts_at: `${next}T21:00:00+04:00`, status: "draft", pay_clock: null, office_notes: "", lot_target: 100 }
  ];
  const sellers: Seller[] = [
    { id: "sTS", code: "TS", name: "The Time Souk (own stock)", kind: "own", phone: "", instagram: "", email: "", id_checked: "", fee_pct: null, fee_fixed: null, bank: "", iban: "", notes: "" },
    { id: "sS1", code: "S001", name: "Sample Consignor One", kind: "consignment", phone: "+971500000201", instagram: "sample.consignor", email: "", id_checked: "Emirates ID", fee_pct: 7.5, fee_fixed: null, bank: "Sample Bank", iban: "AE00 0000 0000 0000 0000 001", notes: "" },
    { id: "sS2", code: "S002", name: "Sample Consignor Two", kind: "consignment", phone: "+971500000202", instagram: "", email: "", id_checked: "Passport", fee_pct: 10, fee_fixed: 50, bank: "", iban: "", notes: "" }
  ];
  const people: [string, string, string, string, Partial<Customer>][] = [
    ["B0001", "demo.collector", "Rashid Demo", "+971500000101", {}],
    ["B0002", "watchfan.sample", "Layla Example", "+971500000102", { usual_pay: "Card link (Ziina)", lang: "en" }],
    ["B0003", "test.horology", "Karim Placeholder", "+971500000103", { delivery: "Pickup" }],
    ["B0004", "fictional.buyer", "Noor Sample", "+96890000104", { country: "Oman" }],
    ["B0005", "preview.bidder", "Sami Mock", "+971500000105", { usual_pay: "Cash on delivery", lang: "ar" }],
    ["B0006", "made.up.handle", "Hana Testcase", "+971500000106", {}]
  ];
  const customers: Customer[] = people.map(([code, ig, name, phone, x]) => ({
    id: `c${code}`, code, instagram: ig, full_name: name, phone, email: "", address: "Sample Street 1", area: x.country ? "Muscat" : "Dubai", country: "", delivery: "",
    usual_pay: "", id_checked: true, flag: "OK", notes: "", lang: "", profile_id: null, ...x
  }));
  const watches: [string, string, string, string, number, number | null, string, string | null, number | null][] = [
    // brand, model, ref, seller, start, reserve, box & papers, winner, hammer
    ["Rolex", "Oyster Perpetual 36", "126000", "sS1", 12000, 15000, "Full set", "cB0001", 17500],
    ["Omega", "Seamaster Diver 300M", "210.30.42", "sTS", 9000, null, "Full set", "cB0002", 11000],
    ["Tudor", "Black Bay 58", "79030N", "sS2", 7000, 8500, "Watch + box", "cB0003", 9200],
    ["Cartier", "Tank Must", "WSTA0041", "sTS", 6000, null, "Full set", "cB0004", 7400],
    ["Seiko", "Prospex Alpinist", "SPB121", "sS1", 1200, 1500, "Watch only", "cB0005", 1650],
    ["Longines", "HydroConquest", "L3.781.4", "sS2", 2500, 3000, "Full set", "cB0001", 3100],
    ["TAG Heuer", "Carrera Chronograph", "CBN2A1B", "sS1", 9000, 12000, "Full set", null, null],
    ["Oris", "Aquis Date", "01 733 7766", "sTS", 3500, null, "Watch + papers", "cB0006", 3900]
  ];
  const lots: OLot[] = [];
  const mk = (a: OAuction, i: number, w: (typeof watches)[number], played: boolean): OLot => ({
    id: `l${a.number}-${i + 1}`, auction_id: a.id, lot_number: i + 1, brand: w[0], model: w[1], reference: w[2], year: "", condition: "Excellent", start_price: w[4],
    has_box: /box|Full/.test(w[6]), has_papers: /papers|Full/.test(w[6]), current_bid: null, ends_at: null, no_reserve: !w[5], reserve_met: false, made_pure: false,
    leader_id: null, leader_ig: null, reserve: w[5], cost: w[3] === "sTS" ? Math.round(w[4] * 0.8) : null, seller_fee: null, fee_fixed: null, seller_id: w[3], intake_item_id: null,
    serial: "", box_papers: w[6], intake_date: null, winner_customer_id: played ? w[7] : null, winner_text: played && w[7] ? customers.find(c => c.id === w[7])!.instagram! : "",
    hammer: played ? w[8] : null, underbidder: "", underbid: null, exception: null, delivery_status: "", dispatched_on: null, courier: "", seller_paid_on: null,
    payout_ref: "", payout_account: "", office_notes: "", tray: null, slip_printed_at: null
  });
  watches.forEach((w, i) => lots.push(mk(auctions[0], i, w, true)));
  watches.slice(0, 5).forEach((w, i) => lots.push(mk(auctions[1], i, w, false)));
  lots[1].delivery_status = "Delivered";
  lots[3].delivery_status = "Packed";
  const intake: IntakeItem[] = [
    { id: "i1", receipt_no: "CR-0001", item_id: "CR-0001-01", position: 1, received_on: past, seller_id: "sS1", brand: "IWC", model: "Pilot's Watch Mark XVIII", reference: "IW327001", serial: "", year: "2020", box_papers: "Full set", condition: "Very good", notes: "Light desk-diving marks on the clasp", reserve: 14000, start_price: 10000, fee_pct: null, fee_fixed: null, received_by: "Front desk", returned_on: null },
    { id: "i2", receipt_no: "CR-0001", item_id: "CR-0001-02", position: 2, received_on: past, seller_id: "sS1", brand: "Breitling", model: "Navitimer 41", reference: "AB0139", serial: "", year: "2021", box_papers: "Watch + papers", condition: "Excellent", notes: "", reserve: 18000, start_price: 14000, fee_pct: null, fee_fixed: null, received_by: "Front desk", returned_on: null }
  ];
  const at = (d: string) => `${d}T12:00:00+04:00`;
  const ledger: LedgerEntry[] = [
    { id: "p1", seq: 1, entry_date: past, kind: "Payment", customer_id: "cB0002", invoice_no: "TS001-B0002", method: "Bank transfer", amount: 11030, reference: "Sample transfer", received_by: "", notes: "", created_at: at(past) },
    { id: "p2", seq: 2, entry_date: past, kind: "Deposit", customer_id: "cB0001", invoice_no: "", method: "Cash", amount: 5000, reference: "", received_by: "", notes: "", created_at: at(past) },
    { id: "p3", seq: 3, entry_date: past, kind: "Payment", customer_id: "cB0003", invoice_no: "TS001-B0003", method: "Card link (Ziina)", amount: 9476, reference: "", received_by: "", notes: "", created_at: at(past) }
  ];
  return {
    settings: { ...DEFAULT_SETTINGS, bank_name: "Sample Bank", bank_account: "SAMPLE ACCOUNT NAME", bank_iban: "AE00 0000 0000 0000 0000 000" },
    auctions, lots, customers, sellers, intake,
    adjustments: [{ invoice_no: "TS001-B0004", delivery: "", pays_by: "", delivery_fee: 60, discount: null, extra: null, extra_label: "", note: "" }],
    ledger,
    sent: [{ id: 1, sent_at: at(past), ref: "TS001-B0002", name: "Layla Example", phone: "+971500000102", total: 11030, balance: 11030, file: "", kind: "Invoice", link: "" }],
    cards: [], messages: {}, now
  };
}

/** Made-up accounting entries for preview mode: opening balances, an expense, a Ziina payout, owners' drawings. */
export function sampleAccounting(now = Date.now()): import("./types").AcctData {
  const d = (offset: number) => new Date(now + 4 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
  const e = (id: string, entry_date: string, kind: import("./types").ManualKind, memo: string, payee: string, lines: [string, number, number][]) => ({
    id, entry_date, kind, memo, payee, reference: "", void: false, void_reason: "", created_at: `${entry_date}T10:00:00+04:00`,
    lines: lines.map(([account_code, debit, credit], i) => ({ id: Number(id.replace(/\D/g, "")) * 10 + i, account_code, debit, credit, memo: "" }))
  });
  return {
    accounts: DEFAULT_CHART,
    entries: [
      e("s1", d(-40), "opening", "Opening balances", "", [["1020", 60000, 0], ["1010", 3000, 0], ["1200", 45000, 0], ["3050", 0, 108000]]),
      e("s2", d(-5), "expense", "Instagram ads", "Meta", [["6100", 700, 0], ["1020", 0, 700]]),
      e("s3", d(-2), "transfer", "Ziina payout", "Ziina", [["1020", 9200, 0], ["6020", 276, 0], ["1030", 0, 9476]]),
      e("s4", d(-1), "expense", "Courier for auction 1", "Courier", [["6010", 150, 0], ["1010", 0, 150]])
    ],
    cleared: [],
    recons: []
  };
}
