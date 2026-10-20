"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/admin/office/accounting", "Overview"],
  ["/admin/office/accounting/money", "Money in & out"],
  ["/admin/office/accounting/pl", "Profit & loss"],
  ["/admin/office/accounting/balance", "Balance sheet"],
  ["/admin/office/accounting/trial", "Trial balance"],
  ["/admin/office/accounting/journal", "Journal"],
  ["/admin/office/accounting/ledger", "Account ledger"],
  ["/admin/office/accounting/reconcile", "Reconcile"],
  ["/admin/office/accounting/vat", "VAT"],
  ["/admin/office/accounting/aging", "Who owes what"],
  ["/admin/office/accounting/accounts", "Chart & settings"]
];

export function AcctNav() {
  const path = usePathname() || "";
  return (
    <div className="chips no-print" role="navigation" aria-label="Accounting">
      {LINKS.map(([href, label]) => (
        <Link key={href} className="chip" href={href} aria-pressed={href === "/admin/office/accounting" ? path === href : path.startsWith(href)}>
          {label}
        </Link>
      ))}
    </div>
  );
}
