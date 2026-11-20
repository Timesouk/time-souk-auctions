// The admin's pages, grouped the way a week runs: watches come in, the sale, then invoices, payments and paying sellers.
// One list feeds the sidebar and quick search, so a page is named the same everywhere.

export type NavLink = {
  href: string;
  label: string;
  /** Only admins see it. */
  admin?: boolean;
  /** The page shows one auction, so the chosen auction (?a=) carries over. */
  perAuction?: boolean;
  /** Other words quick search should match. */
  keywords?: string;
  /** Only this exact path counts as "here" (not pages under it). */
  exact?: boolean;
};

export type NavGroup = { label: string | null; links: NavLink[] };

export const NAV: NavGroup[] = [
  { label: null, links: [{ href: "/admin/office", label: "Home", perAuction: true, exact: true, keywords: "overview dashboard this week to do" }] },
  {
    label: "Before the sale",
    links: [
      { href: "/admin/office/intake", label: "Intake", keywords: "receive consigned watches receipt seller drop off" },
      { href: "/admin/consignments", label: "Consignment requests", keywords: "sell with us website form" },
      { href: "/admin/auctions", label: "Auctions & lots", keywords: "catalogue new auction publish date timer photos" },
      { href: "/admin/office/runsheet", label: "Run sheet", perAuction: true, keywords: "order of lots presenter" }
    ]
  },
  {
    label: "Sale day",
    links: [
      { href: "/admin/live", label: "Live console", keywords: "bids on the block timer instagram" },
      { href: "/admin/office/lots", label: "Lots & results", perAuction: true, keywords: "hammer winner results grid" },
      { href: "/admin/office/slips", label: "Sold slips", perAuction: true, keywords: "print label" }
    ]
  },
  {
    label: "After the sale",
    links: [
      { href: "/admin/office/invoices", label: "Invoices", perAuction: true, keywords: "bill buyer send remind print" },
      { href: "/admin/office/payments", label: "Payments", keywords: "money received bank cash refund record" },
      { href: "/admin/office/cards", label: "Card links", keywords: "ziina payment link" },
      { href: "/admin/payments", label: "Website winners", keywords: "online payments tabby tamara send invoice" },
      { href: "/admin/office/dispatch", label: "Dispatch", perAuction: true, keywords: "delivery courier pickup collected packed" }
    ]
  },
  {
    label: "Sellers",
    links: [
      { href: "/admin/office/sellers", label: "Sellers", keywords: "consignors" },
      { href: "/admin/office/sellers/payouts", label: "Pay sellers", keywords: "payouts settle owed" },
      { href: "/admin/office/statements", label: "Statements", perAuction: true, keywords: "seller statement print" }
    ]
  },
  {
    label: "Buyers",
    links: [
      { href: "/admin/office/buyers", label: "Buyers", keywords: "customers clients" },
      { href: "/admin/bidders", label: "Website bidders", keywords: "accounts registered suspend instagram handle" }
    ]
  },
  {
    label: "Reports",
    links: [
      { href: "/admin/office/summary", label: "Auction summary", keywords: "results profit every auction" },
      { href: "/admin/office/accounting", label: "Accounting", keywords: "profit loss balance sheet vat journal ledger reconcile" },
      { href: "/admin/office/sent", label: "Messages sent", keywords: "whatsapp log" }
    ]
  },
  {
    label: "Setup",
    links: [
      { href: "/admin/office/settings", label: "Back office settings", keywords: "company bank fees messages demo" },
      { href: "/admin/settings", label: "Website settings", admin: true, keywords: "timer payments keys" },
      { href: "/admin/staff", label: "Staff", admin: true, keywords: "employees access admin" },
      { href: "/admin/office/import", label: "Import workbook", keywords: "excel xlsx upload" }
    ]
  }
];

/** Every link the person can see. */
export function navLinks(isAdmin: boolean): NavLink[] {
  return NAV.flatMap(g => g.links).filter(l => isAdmin || !l.admin);
}

/** The link for the page you're on: the longest one the path starts with. */
export function currentLink(path: string, links: NavLink[]): NavLink | undefined {
  let best: NavLink | undefined;
  for (const l of links) {
    const hit = l.exact ? path === l.href : path === l.href || path.startsWith(`${l.href}/`);
    if (hit && (!best || l.href.length > best.href.length)) best = l;
  }
  // pages without their own link: a lot's page belongs to Auctions & lots, and so on
  if (!best && /^\/admin\/lots\//.test(path)) best = links.find(l => l.href === "/admin/auctions");
  return best;
}

/** A link's address, carrying the chosen auction over to pages that show one auction. */
export function hrefFor(l: NavLink, auction: string | null) {
  return auction && l.perAuction ? `${l.href}?a=${encodeURIComponent(auction)}` : l.href;
}
