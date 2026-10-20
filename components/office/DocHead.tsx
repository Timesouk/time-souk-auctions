// The top of every printed document: both logos and the company details.
import "@/app/office.css";
import Image from "next/image";
import logo from "@/public/brand/logo.png";
import partner from "@/public/brand/dxb-watch.png";
import { companyName } from "@/lib/office/messages";
import type { OfficeSettings } from "@/lib/office/types";

export function DocHead({ s }: { s: OfficeSettings }) {
  const contact = [s.address, s.phone, s.email, s.instagram, s.website].filter(Boolean).join("  ·  ");
  return (
    <header className="doc-head">
      <div className="doc-logos">
        <Image src={logo} alt="The Time Souk" height={64} style={{ height: 64, width: "auto" }} />
        <span className="doc-x" aria-hidden>×</span>
        <Image src={partner} alt="DXB Watch" height={56} style={{ height: 56, width: "auto" }} />
      </div>
      <div className="doc-co">
        <strong>{companyName(s)}</strong>
        <span>{[s.legal_name, s.licence ? `Trade licence ${s.licence}` : "", s.trn ? `TRN ${s.trn}` : ""].filter(Boolean).join("  ·  ")}</span>
        <span>{contact}</span>
      </div>
    </header>
  );
}

/** "Thu 22 Oct 2026, 9:00 PM" (Dubai) */
export function dubaiStamp(ms: number) {
  const d = new Date(ms + 4 * 3600e3);
  const h = d.getUTCHours();
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
