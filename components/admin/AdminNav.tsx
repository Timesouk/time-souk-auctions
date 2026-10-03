"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/admin/live", "Live console"],
  ["/admin/auctions", "Auctions & lots"],
  ["/admin/bidders", "Bidders"],
  ["/admin/payments", "Winners & payments"],
  ["/admin/consignments", "Consignments"],
  ["/admin/settings", "Settings"]
];

export function AdminNav() {
  const path = usePathname() || "";
  return (
    <nav className="adm-nav" aria-label="Admin">
      <div className="wrap">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>{label}</Link>
        ))}
      </div>
    </nav>
  );
}
