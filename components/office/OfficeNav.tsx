"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS: [string, string][] = [
  ["/admin/office", "Overview"],
  ["/admin/office/lots", "Lots"],
  ["/admin/office/invoices", "Invoices"],
  ["/admin/office/payments", "Payments"],
  ["/admin/office/buyers", "Buyers"],
  ["/admin/office/sellers", "Sellers"],
  ["/admin/office/intake", "Intake"],
  ["/admin/office/statements", "Statements"],
  ["/admin/office/dispatch", "Dispatch"],
  ["/admin/office/runsheet", "Run sheet"],
  ["/admin/office/slips", "Slips"],
  ["/admin/office/cards", "Card links"],
  ["/admin/office/summary", "Summary"],
  ["/admin/office/sent", "Sent log"],
  ["/admin/office/settings", "Settings"],
  ["/admin/office/import", "Import"]
];
/** Pages that show one auction (the chosen one carries over). */
const PER_AUCTION = new Set(["/admin/office", "/admin/office/lots", "/admin/office/invoices", "/admin/office/statements", "/admin/office/dispatch", "/admin/office/runsheet", "/admin/office/slips"]);

/** The back office's own tabs. The chosen auction (?a=) carries over between them. */
export function OfficeNav() {
  const path = usePathname() || "";
  const sp = useSearchParams();
  const a = sp.get("a");
  return (
    <nav className="office-nav" aria-label="Back office">
      {LINKS.map(([href, label]) => {
        const on = href === "/admin/office" ? path === href : path.startsWith(href);
        const keep = a && PER_AUCTION.has(href) ? `?a=${a}` : "";
        return (
          <Link key={href} href={`${href}${keep}`} aria-current={on ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
