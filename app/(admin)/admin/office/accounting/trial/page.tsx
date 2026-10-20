import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { trialBalance } from "@/lib/office/accounting";
import { m2 } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PrintButton } from "@/components/office/forms";
import { dateText } from "@/lib/office/messages";

export const dynamic = "force-dynamic";

export default async function TrialBalance({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { o, j } = data;
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(sp.as || "") ? sp.as! : o.today;
  const tb = trialBalance(j, asOf);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Trial balance</h1>
          <p className="fine">Every account&apos;s balance on {dateText(asOf, "EN")}. Debits and credits must be equal. AED.</p>
        </div>
        <div className="row no-print">
          <form className="inline-form" action="/admin/office/accounting/trial">
            <label className="k">On</label><input type="date" name="as" defaultValue={asOf} />
            <button className="btn sm">Show</button>
          </form>
          <a className="btn sm" href={`/admin/office/accounting/export?to=${asOf}`}>Download the journal (CSV)</a>
          <PrintButton />
        </div>
      </div>
      <div className="tbl-wrap" style={{ maxWidth: 900 }}>
        <table className="report">
          <thead><tr><th>Account</th><th>Type</th><th className="n">Debit</th><th className="n">Credit</th></tr></thead>
          <tbody>
            {tb.rows.map(r => (
              <tr key={r.code}>
                <td><Link href={`/admin/office/accounting/ledger?account=${r.code}&to=${asOf}`}>{r.code} · {r.name}</Link></td>
                <td>{r.type}</td>
                <td className="n">{r.debit ? m2(r.debit) : ""}</td>
                <td className="n">{r.credit ? m2(r.credit) : ""}</td>
              </tr>
            ))}
            <tr className="tot"><td colSpan={2}>Totals</td><td className="n">{m2(tb.debit)}</td><td className="n">{m2(tb.credit)}</td></tr>
          </tbody>
        </table>
      </div>
      {Math.abs(tb.debit - tb.credit) > 0.004 ? <p className="alert">Debits and credits differ by {m2(tb.debit - tb.credit)}. Please report this.</p> : null}
    </div>
  );
}
