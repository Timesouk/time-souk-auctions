// Small pieces the back office pages share (server components).
import Link from "next/link";
import type { OAuction } from "@/lib/office/types";
import { dateText } from "@/lib/office/messages";
import { statusClass } from "@/lib/office/status";

/** Choose which auction a page shows (?a=2). */
export function AuctionPicker({ auctions, current, action, extra }: { auctions: OAuction[]; current: OAuction | null; action: string; extra?: Record<string, string> }) {
  if (!auctions.length) return null;
  return (
    <form className="inline-form no-print" action={action}>
      <label className="k" htmlFor="pick-a">Auction</label>
      <select id="pick-a" name="a" defaultValue={current ? String(current.number) : ""}>
        {auctions
          .slice()
          .sort((x, y) => y.number - x.number)
          .map(a => (
            <option key={a.id} value={a.number}>
              {a.number} · {dateText(a.sale_date, "EN")}
              {a.status === "draft" ? " · draft" : ""}
            </option>
          ))}
      </select>
      {Object.entries(extra || {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className="btn sm">Show</button>
    </form>
  );
}

export function SetupNeeded({ error }: { error: string }) {
  return (
    <div className="stack">
      <h1 className="disp">Back office</h1>
      <p className="alert">{error}</p>
      <p className="fine">
        Open Supabase › SQL Editor › New query, paste the whole of <code>supabase/migrations/0006_back_office.sql</code> from the website&apos;s code and press Run. Then reload this page.
      </p>
    </div>
  );
}

export function Pill({ s }: { s: string }) {
  return s ? <span className={`pill ${statusClass(s)}`}>{s}</span> : null;
}

export function Tile({ label, value, href, warn }: { label: string; value: React.ReactNode; href?: string; warn?: boolean }) {
  const body = (
    <>
      <span className="k">{label}</span>
      <b className={warn ? "warn-ink" : undefined}>{value}</b>
    </>
  );
  return <div>{href ? <Link href={href}>{body}</Link> : body}</div>;
}

/** Lot IDs that wrap between lots, never inside one ("2-05, 2-07"). */
export function LotKeys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k, i) => (
        <span key={k} className="nowrap">
          {k}
          {i < keys.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}
