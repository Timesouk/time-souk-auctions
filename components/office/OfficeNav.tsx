"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS: [string, string][] = [
  ["/admin/office", "Overview"],
  ["/admin/office/lots", "Lots"],
  ["/admin/office/invoices", "Invoices"],
  ["/admin/office/payments", "Payments"],
  ["/admin/office/buyers", "Buyers"],
  ["/admin/office/import", "Import workbook"]
];

/** The back office's own tabs. The chosen auction (?a=) carries over between them. */
export function OfficeNav() {
  const path = usePathname() || "";
  const sp = useSearchParams();
  const a = sp.get("a");
  return (
    <nav className="office-nav" aria-label="Back office">
      {LINKS.map(([href, label]) => {
        const on = href === "/admin/office" ? path === href : path.startsWith(href);
        const keep = a && !href.endsWith("/import") && !href.endsWith("/buyers") ? `?a=${a}` : "";
        return (
          <Link key={href} href={`${href}${keep}`} aria-current={on ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
