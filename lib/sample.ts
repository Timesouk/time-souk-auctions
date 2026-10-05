// Example auction used in preview mode (no Supabase settings). Nothing here is saved anywhere.
import type { Auction, BidRow, Lot, Settings } from "./types";
import { addDays, dubaiInstant, nextSaturday, todayDubai } from "./format";

export const SAMPLE_SETTINGS: Settings = {
  seller_fee: 7.5,
  pay_days: 3,
  timer_seconds: 180,
  lot_target: 100,
  whatsapp: "",
  instagram: "",
  contact_email: "",
  cod_fee: 10
};

type Row = [string, string, string, string, string, string, string, string, string, string, string, string, boolean, boolean, string, number, number, number, boolean, string, number[]];
// brand, model, ref, year, size, case, dial, dial colour, bezel, shape, hands, bracelet, box, papers, condition, est lo, est hi, start, no reserve, notes, bids
const ROWS: Row[] = [
  ["Rolex", "Submariner Date", "126610LN", "2022", "41", "Oystersteel", "Black", "black", "diver", "round", "three", "Oyster bracelet", true, true, "Excellent", 48000, 54000, 40000, false, "Full set, warranty card dated March 2022. Light marks on the clasp only.", [40000, 41000, 42000, 43000]],
  ["Tudor", "Black Bay 58", "79030N", "2021", "39", "Steel", "Black, gilt", "black", "diver", "round", "three", "Steel riveted bracelet", true, true, "Very good", 11000, 13000, 8000, true, "Light wear to the bezel insert. Runs within chronometer specification.", [8000, 8250, 8500, 9000]],
  ["Omega", "Speedmaster Professional Moonwatch", "310.30.42.50.01.001", "2022", "42", "Steel", "Black", "black", "tachy", "round", "chrono", "Steel bracelet", true, true, "Excellent", 18000, 21000, 14000, false, "Hesalite crystal, Co-Axial Master Chronometer 3861. Full set.", [14000, 14500]],
  ["Rolex", "Datejust 41", "126334", "2021", "41", "Oystersteel and white gold", "Blue", "blue", "fluted", "round", "three", "Jubilee bracelet", true, true, "Excellent", 36000, 40000, 30000, false, "Fluted bezel, blue sunray dial. Hairlines on the bracelet from normal wear.", [30000, 31000, 32000, 33000]],
  ["Breitling", "Navitimer B01 Chronograph 43", "AB0138", "2021", "43", "Steel", "Black", "black", "fluted", "round", "chrono", "Black leather strap", true, true, "Very good", 20000, 23000, 15000, false, "Strap shows light creasing. Case unpolished.", []],
  ["Rolex", "GMT-Master II", "126710BLNR", "2023", "40", "Oystersteel", "Black", "black", "gmt-bb", "round", "gmt", "Jubilee bracelet", true, true, "Unworn", 68000, 75000, 58000, false, "Blue and black ceramic bezel. Unworn with all stickers.", [58000, 60500, 63000]],
  ["Zenith", "Chronomaster Sport", "03.3100.3600/69.M3100", "2022", "41", "Steel", "White", "white", "tachy", "round", "chrono", "Steel bracelet", true, true, "Excellent", 34000, 38000, 27000, false, "El Primero 3600, 1/10th second chronograph. Full set.", [27000]],
  ["Hermès", "H08", "W049431WW00", "2022", "39", "Titanium and graphene composite", "Black", "black", "smooth", "cushion", "three", "Black rubber strap", true, true, "Very good", 17000, 20000, 13000, false, "Comes with the original rubber strap and box.", []],
  ["Cartier", "Santos de Cartier Medium", "WSSA0029", "2021", "35", "Steel", "Silver", "silver", "smooth", "square", "three", "Steel bracelet", true, true, "Excellent", 22000, 25000, 17000, false, "QuickSwitch bracelet with SmartLink sizing. Full set.", []],
  ["Tudor", "Pelagos", "25600TB", "2020", "42", "Titanium", "Black", "black", "diver", "round", "three", "Titanium bracelet", true, true, "Very good", 12500, 14500, 9500, false, "Includes the rubber strap. Light marks on the case.", []],
  ["Omega", "Seamaster Diver 300M", "210.30.42.20.03.001", "2021", "42", "Steel", "Blue", "blue", "diver", "round", "three", "Steel bracelet", true, true, "Very good", 14000, 16000, 10500, true, "Blue wave dial and ceramic bezel. Serviced 2025.", [10500, 11000, 11500, 12000, 12500]],
  ["Rolex", "Explorer", "124270", "2022", "36", "Oystersteel", "Black", "black", "smooth", "round", "three", "Oyster bracelet", true, true, "Excellent", 26000, 29000, 21000, false, "36 mm, calibre 3230. Full set.", []],
  ["Grand Seiko", "Snowflake", "SBGA211", "2020", "41", "Titanium", "White, textured", "white", "smooth", "round", "three", "Titanium bracelet", true, true, "Very good", 16000, 19000, 12000, false, "Spring Drive 9R65. Light scratches on the bracelet.", [12000]],
  ["Breitling", "Superocean Automatic 42", "A17375", "2022", "42", "Steel", "Black", "black", "diver", "round", "three", "Black rubber strap", true, true, "Excellent", 10000, 12000, 7000, true, "Full set. Minimal signs of wear.", []],
  ["Rolex", "Cosmograph Daytona", "116500LN", "2019", "40", "Oystersteel", "White", "white", "tachy", "round", "chrono", "Oyster bracelet", true, true, "Very good", 98000, 110000, 85000, false, "White dial, black ceramic bezel. Full set, card dated 2019. Unpolished.", [85000, 87500, 90000, 92500, 95000]],
  ["Tudor", "Black Bay GMT", "79830RB", "2022", "41", "Steel", "Black", "black", "gmt-pr", "round", "gmt", "Steel riveted bracelet", true, true, "Excellent", 12500, 14500, 9000, false, "Red and blue bezel. Full set.", [9000]],
  ["Omega", "Seamaster Aqua Terra 150M", "220.10.41.21.03.001", "2021", "41", "Steel", "Blue", "blue", "smooth", "round", "three", "Steel bracelet", true, true, "Excellent", 15000, 17500, 11500, false, "Blue teak-pattern dial. Full set.", []],
  ["Cartier", "Tank Must Large", "WSTA0041", "2022", "34 × 26", "Steel", "Silver", "silver", "smooth", "rect", "three", "Black leather strap", true, true, "Excellent", 9500, 11000, 7000, true, "Quartz. Strap in good condition.", []],
  ["Rolex", "Oyster Perpetual 41", "124300", "2021", "41", "Oystersteel", "Green", "green", "smooth", "round", "three", "Oyster bracelet", true, true, "Excellent", 30000, 34000, 25000, false, "Green dial. Full set.", [25000, 26000, 27000]],
  ["TAG Heuer", "Monaco Calibre 11", "CAW211P", "2020", "39", "Steel", "Blue", "blue", "smooth", "square", "chrono", "Blue leather strap", true, true, "Very good", 14500, 17000, 10000, false, "Crown on the left, as issued. Strap shows light wear.", []],
  ["Rado", "Captain Cook Automatic", "R32505318", "2022", "42", "Steel", "Green", "green", "diver", "round", "three", "Steel bracelet", true, false, "Very good", 5000, 6500, 3500, true, "Box only, no papers. Green ceramic bezel insert.", [3500, 3600, 3700]],
  ["Rolex", "Air-King", "126900", "2023", "40", "Oystersteel", "Black", "black", "smooth", "round", "three", "Oyster bracelet", true, true, "Unworn", 26000, 29000, 21000, false, "Unworn with stickers. Full set.", []],
  ["Zenith", "Defy Skyline", "03.9300.3620/51.I001", "2022", "41", "Steel", "Blue", "blue", "smooth", "round", "three", "Steel bracelet", true, true, "Excellent", 21000, 24000, 16000, false, "Comes with the extra rubber strap.", []],
  ["Breitling", "Chronomat B01 42", "AB0134", "2021", "42", "Steel", "Blue", "blue", "smooth", "round", "chrono", "Rouleaux bracelet", true, true, "Very good", 19000, 22000, 14000, false, "Rouleaux bracelet. Light wear on the bezel.", []]
];
const RESERVES: Record<number, number> = { 1: 46000, 3: 17000, 4: 35000, 6: 64000, 7: 32000, 15: 95000, 19: 29000 };
const PADDLES = [112, 104, 118, 103, 109, 121, 117, 110, 122, 108, 128, 101, 119, 106, 113, 125, 102, 111];

export function sampleAuction(now = Date.now()): { auction: Auction; lots: Lot[] } {
  const today = todayDubai(now);
  const sat = new Date(`${today}T00:00:00Z`).getUTCDay() === 6 ? today : nextSaturday(today);
  const liveStarts = dubaiInstant(sat, "16:00");
  const auction: Auction = {
    id: "sample-auction",
    number: 1,
    sale_date: sat,
    prebid_opens_at: dubaiInstant(addDays(sat, -5), "12:00"),
    live_starts_at: liveStarts,
    status: "published",
    block_lot_id: null,
    timer_seconds: null
  };
  // DEMO_LIVE=1: lot 4 live with its timer running. DEMO_LIVE=block: lot 4 on the block, waiting for Start.
  const demoLive = process.env.DEMO_LIVE === "1" || process.env.DEMO_LIVE === "block" || process.env.DEMO_LIVE === "sold";
  const lots: Lot[] = ROWS.map((r, i) => {
    const no = i + 1;
    const bids = r[20];
    const price = bids.length ? bids[bids.length - 1] : null;
    const reserve = RESERVES[no];
    return {
      id: `sample-${no}`,
      auction_id: auction.id,
      lot_number: no,
      brand: r[0], model: r[1], reference: r[2], year: r[3], case_size: r[4], case_material: r[5], dial: r[6],
      dial_colour: r[7], bezel: r[8], shape: r[9], hands: r[10], bracelet: r[11], has_box: r[12], has_papers: r[13], condition: r[14],
      notes_en: r[19], notes_ar: "",
      estimate_low: r[15], estimate_high: r[16], start_price: r[17], no_reserve: r[18],
      reserve_met: !!(price && reserve && price >= reserve), made_pure: false,
      photos: [],
      current_bid: price,
      leader_paddle: price ? PADDLES[(i * 7 + bids.length) % PADDLES.length] : null,
      leader_via: price ? (i % 3 === 0 ? "instagram" : "web") : null,
      bid_count: bids.length,
      ends_at: null
    };
  });
  if (demoLive) {
    auction.live_starts_at = new Date(now - 20 * 60e3).toISOString();
    const cycle = Math.floor(now / 1000) % 150;
    [0, 1, 2].forEach(i => {
      lots[i].ends_at = new Date(now - (600 - i * 180) * 1000).toISOString();
    });
    lots[1].current_bid = 9000;
    lots[3].ends_at =
      process.env.DEMO_LIVE === "block" ? null :
      process.env.DEMO_LIVE === "sold" ? new Date(now - 8000).toISOString() :
      new Date(now + Math.max(5, 140 - cycle) * 1000).toISOString();
    if (process.env.DEMO_LIVE === "sold") lots[3].made_pure = true;
    lots[3].leader_paddle = null;
    lots[3].leader_via = "instagram";
    auction.block_lot_id = lots[3].id;
  }
  return { auction, lots };
}

export function sampleHistory(lot: Lot): BidRow[] {
  const row = ROWS[lot.lot_number - 1];
  if (!row) return [];
  const bids = row[20];
  const base = Date.parse(lot.ends_at || new Date().toISOString()) - 3 * 3600e3;
  return bids
    .map((amount, i) => ({
      amount,
      paddle: i === bids.length - 1 ? lot.leader_paddle : PADDLES[(lot.lot_number * 3 + i) % PADDLES.length],
      via: i === bids.length - 1 ? lot.leader_via || "web" : i % 2 ? "instagram" : "web",
      is_auto: false,
      created_at: new Date(base + i * 7.3 * 60e3).toISOString()
    }))
    .map(b => (b.via === "instagram" && b.paddle && b.amount === bids[bids.length - 1] && lot.leader_paddle == null ? { ...b, paddle: null } : b))
    .reverse();
}
