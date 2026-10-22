// The demo auction for training staff: made-up watches, two demo sellers and three demo buyers.
// Every name here is fictional. The demo auction never goes on the website and is kept out of the accounts.

export const DEMO_SELLERS = [
  { code: "DEMO-C", name: "Demo consignor (training)", kind: "consignment" as const, fee_pct: 7.5, notes: "Training only." },
  { code: "DEMO-O", name: "Demo own stock (training)", kind: "own" as const, fee_pct: null, notes: "Training only." }
];

/** Starter demo buyers. Staff add their own WhatsApp number to one to see the messages arrive. */
export const DEMO_BUYERS = [
  { instagram: "demo.buyer.one", full_name: "Demo Buyer One", area: "Dubai", country: "", delivery: "" },
  { instagram: "demo.buyer.two", full_name: "Demo Buyer Two", area: "Sharjah", country: "", delivery: "Pickup" },
  { instagram: "demo.buyer.three", full_name: "Demo Buyer Three", area: "Muscat", country: "Oman", delivery: "" }
];

/** brand, model, reference, year, box & papers, condition, start, reserve (null = none), seller code, cost (own stock) */
export const DEMO_WATCHES: [string, string, string, string, string, string, number, number | null, string, number | null][] = [
  ["Rolex", "Datejust 36", "126200", "2021", "Full set", "Excellent", 22000, 26000, "DEMO-C", null],
  ["Omega", "Speedmaster Moonwatch", "310.30.42", "2022", "Full set", "Excellent", 17000, null, "DEMO-O", 15500],
  ["Tudor", "Black Bay Fifty-Eight", "79030N", "2020", "Watch + box", "Very good", 8000, 9500, "DEMO-C", null],
  ["Cartier", "Santos Medium", "WSSA0029", "2021", "Full set", "Excellent", 18000, 21000, "DEMO-C", null],
  ["Seiko", "Prospex Alpinist", "SPB121", "2021", "Watch only", "Good", 1000, null, "DEMO-O", 900],
  ["Longines", "HydroConquest 41", "L3.781.4", "2019", "Full set", "Very good", 2500, 3000, "DEMO-C", null],
  ["TAG Heuer", "Carrera Chronograph", "CBN2A1B", "2022", "Full set", "Unworn", 11000, 13000, "DEMO-C", null],
  ["Tissot", "PRX Powermatic 80", "T137.407", "2023", "Full set", "Unworn", 1500, null, "DEMO-O", 1300],
  ["Oris", "Aquis Date", "01 733 7766", "2020", "Watch + papers", "Very good", 3500, 4000, "DEMO-C", null],
  ["Hamilton", "Khaki Field Mechanical", "H69439931", "2022", "Full set", "Excellent", 1200, null, "DEMO-O", 1000]
];
