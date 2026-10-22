import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { accountLedger, SOURCE_LABEL } from "@/lib/office/accounting";
import { m2, resolvePeriod } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PeriodPicker } from "@/components/office/Period";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

export default async function AccountLedgerPage({ searchParams }: { searchParams: Promise<{ account?: string; p?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { o, j } = data;
  const code = j.byCode.has(sp.account || "") ? sp.account! : "1020";
  const per = resolvePeriod(sp, o.today, "all");
  const led = accountLedger(j, code, per.from, per.to);
  const a = led.account!;
  const rows = led.rows.slice().reverse();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">{a.code} · {a.name}</h1>
          <p className="fine">{a.type}{a.notes ? ` · ${a.notes}` : ""} · {per.label} · newest first · AED</p>
        </div>
        <div className="row no-print">
          <form className="inline-form" action="/admin/office/accounting/ledger">
            <select name="account" defaultValue={code} aria-label="Account">
              {j.accounts.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}
            </select>
            {per.key === "custom" ? <><input type="hidden" name="from" value={per.from} /><input type="hidden" name="to" value={per.to} /></> : <input type="hidden" name="p" value={per.key} />}
            <button className="btn sm">Show</button>
          </form>
          {["bank", "cash", "clearing"].includes(a.subtype) ? <Link className="btn sm" href={`/admin/office/accounting/reconcile?account=${code}`}>Reconcile</Link> : null}
          <PrintButton />
        </div>
      </div>
      <PeriodPicker action="/admin/office/accounting/ledger" current={per.key} from={per.from} to={per.to} list={per.list} extra={{ account: code }} />
      <div className="stats">
        <div><span className="k">Opening balance</span><b>{m2(led.opening)}</b></div>
        <div><span className="k">In (debits)</span><b>{m2(led.rows.reduce((t, r) => t + r.debit, 0))}</b></div>
        <div><span className="k">Out (credits)</span><b>{m2(led.rows.reduce((t, r) => t + r.credit, 0))}</b></div>
        <div><span className="k">Closing balance</span><b>{m2(led.closing)}</b></div>
      </div>
      {rows.length === 0 ? <p className="empty">No entries for this account in the period.</p> : (
        <div className="tbl-wrap">
          <table className="report">
            <thead><tr><th>Date</th><th>Entry</th><th>Note</th><th className="n">Debit</th><th className="n">Credit</th><th className="n">Balance</th></tr></thead>
            <tbody>
              {rows.slice(0, 1000).map(r => (
                <tr key={r.key}>
                  <td className="nowrap">{r.date}</td>
                  <td><a href={r.href}>{r.title}</a><small className="sub">{SOURCE_LABEL[r.source]}</small></td>
                  <td className="fine">{r.memo}</td>
                  <td className="n">{r.debit ? m2(r.debit) : ""}</td>
                  <td className="n">{r.credit ? m2(r.credit) : ""}</td>
                  <td className="n"><b>{m2(r.running)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
