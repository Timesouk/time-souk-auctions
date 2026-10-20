import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { m2, moneyAccounts } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { Reconcile, type RecLine } from "@/components/office/AcctForms";
import { debitNormal } from "@/lib/office/accounting";

export const dynamic = "force-dynamic";

/** Bank reconciliation: tick what's on the statement until the ticked balance equals the statement's. */
export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { acct, j } = data;
  const money = moneyAccounts(j.accounts);
  const code = money.some(a => a.code === sp.account) ? sp.account! : money.find(a => a.subtype === "bank")?.code || "1020";
  const a = j.byCode.get(code)!;
  const cleared = new Map(acct.cleared.map(c => [c.key, c]));
  const byEntry = new Map(j.entries.map(e => [e.id, e]));
  const lines: RecLine[] = j.lines
    .filter(l => l.account === code)
    .map(l => ({
      key: l.key, date: l.date, title: byEntry.get(l.entry)?.title || "", memo: l.memo,
      amount: Math.round((debitNormal(a.type) ? l.debit - l.credit : l.credit - l.debit) * 100) / 100, cleared: cleared.has(l.key)
    }));
  const last = acct.recons.filter(r => r.account_code === code).sort((x, y) => y.statement_date.localeCompare(x.statement_date))[0];
  // lines cleared on or before the last finished reconciliation are settled: keep them out of the list
  const settled = last ? lines.filter(l => l.cleared && (cleared.get(l.key)?.cleared_on || "") <= last.statement_date) : [];
  const settledKeys = new Set(settled.map(l => l.key));
  const open = lines.filter(l => !settledKeys.has(l.key));
  const openingCleared = Math.round(settled.reduce((t, l) => t + l.amount, 0) * 100) / 100;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Reconcile · {a.name}</h1>
          <p className="fine">
            Open the bank (or Ziina, Tabby, Tamara) statement. Tick every line below that appears on it. When the ticked balance equals the statement&apos;s closing balance, save the ticks and finish.
            Something on the statement that isn&apos;t here (bank charges, a payout fee, a transfer)? Record it under <Link href="/admin/office/accounting/money">Money in &amp; out</Link> first.
          </p>
        </div>
        <form className="inline-form" action="/admin/office/accounting/reconcile">
          <select name="account" defaultValue={code} aria-label="Account">{money.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select>
          <button className="btn sm">Show</button>
        </form>
      </div>
      {last ? <p className="fine">Last reconciled to {last.statement_date} at AED {m2(last.statement_balance)}.</p> : <p className="fine">Not reconciled yet.</p>}
      <Reconcile account={code} lines={open} openingCleared={openingCleared} />
    </div>
  );
}
