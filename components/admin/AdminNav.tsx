"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The third value marks admin-only pages.
const LINKS: [string, string, boolean?][] = [
  ["/admin/live", "Live console"],
  ["/admin/auctions", "Auctions & lots"],
  ["/admin/bidders", "Bidders"],
  ["/admin/payments", "Winners & payments"],
  ["/admin/consignments", "Consignments"],
  ["/admin/staff", "Staff", true],
  ["/admin/settings", "Settings", true]
];

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname() || "";
  return (
    <nav className="adm-nav" aria-label="Admin">
      <div className="wrap">
        {LINKS.filter(([, , adminOnly]) => isAdmin || !adminOnly).map(([href, label]) => (
          <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>{label}</Link>
        ))}
      </div>
    </nav>
  );
}
