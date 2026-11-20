// Small pieces the back office pages share (server components).
import Link from "next/link";
import { auctionState, type OAuction } from "@/lib/office/types";
import { dateText } from "@/lib/office/messages";
import { statusClass } from "@/lib/office/status";
import { AuctionPick, type PickItem } from "./AuctionPick";

/** Choose which auction a page shows (?a=2): the current one as a button, the others in a list under it. */
export function AuctionPicker({ auctions, current, action, extra }: { auctions: OAuction[]; current: OAuction | null; action: string; extra?: Record<string, string> }) {
  if (!auctions.length) return null;
  const items: PickItem[] = auctions
    .slice()
    .sort((x, y) => y.number - x.number)
    .map(a => ({ number: a.number, date: dateText(a.sale_date, "EN"), state: stateWord(a), tone: stateTone(a) }));
  return <AuctionPick items={items} current={current?.number ?? null} action={action} extra={extra} />;
}

/** The auction's state in a word or two ("Closed", "Draft", "Demo (training)"). */
function stateWord(a: OAuction) {
  const st = auctionState(a);
  return st === "Demo" ? "Demo (training)" : st;
}

function stateTone(a: OAuction) {
  const st = auctionState(a);
  return st === "Demo" ? "warn" : st === "Draft" ? "" : st === "Closed" ? "st-unsold" : "ok";
}

/** The auction's state as a small label, e.g. next to its number. */
export function AuctionState({ a }: { a: OAuction }) {
  return <span className={`pill ${stateTone(a)}`} style={{ marginInlineStart: 8 }}>{auctionState(a)}</span>;
}

/** Shown on every page of the demo auction. */
export function DemoNote() {
  return (
    <p className="alert info no-print">
      <b>Demo auction for training.</b> It never goes on the website and isn&apos;t in the accounts. It only takes demo buyers (type a new handle and it becomes one) and the demo sellers DEMO-C and DEMO-O.
      Card links are off. WhatsApp messages go to whatever number a demo buyer has, so use your own. The admin can reset it under <Link href="/admin/office/settings?tab=demo">Back office settings › Demo auction</Link>.
    </p>
  );
}

export function SetupNeeded({ error }: { error: string }) {
  return (
    <div className="stack">
      <h1 className="disp">Back office</h1>
      <p className="alert">{error}</p>
      <p className="fine">
        Open Supabase › SQL Editor › New query, paste the whole of the file named above (in <code>supabase/migrations</code> in the website&apos;s code) and press Run. Then reload this page.
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
