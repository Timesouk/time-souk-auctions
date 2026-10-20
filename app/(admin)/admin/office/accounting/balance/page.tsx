import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { balanceSheet, type Row } from "@/lib/office/accounting";
import { m2 } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PrintButton } from "@/components/office/forms";
import { companyName, dateText } from "@/lib/office/messages";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { o, j } = data;
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(sp.as || "") ? sp.as! : o.today;
  const bs = balanceSheet(j, asOf);
  const Block = ({ title, rows, total }: { title: string; rows: Row[]; total: number }) => (
    <>
      <tr className="grp"><td colSpan={2}>{title}</td></tr>
      {rows.map(r => <tr key={r.code}><td><Link href={`/admin/office/accounting/ledger?account=${r.code}&to=${asOf}`}>{r.code} · {r.name}</Link></td><td className="n">{m2(r.amount)}</td></tr>)}
      <tr className="sub-tot"><td>Total {title.toLowerCase()}</td><td className="n">{m2(total)}</td></tr>
    </>
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Balance sheet</h1>
          <p className="fine">{companyName(o.data.settings)} · on {dateText(asOf, "EN")} · AED</p>
        </div>
        <div className="row no-print">
          <form className="inline-form" action="/admin/office/accounting/balance">
            <label className="k">On</label><input type="date" name="as" defaultValue={asOf} />
            <button className="btn sm">Show</button>
          </form>
          <PrintButton />
        </div>
      </div>
      <div className="tbl-wrap" style={{ maxWidth: 760 }}>
        <table className="report">
          <tbody>
            <Block title="What the business has (assets)" rows={bs.assets} total={bs.totalAssets} />
            <Block title="What it owes (liabilities)" rows={bs.liabilities} total={bs.totalLiabilities} />
            <tr className="grp"><td colSpan={2}>Owners&apos; equity</td></tr>
            {bs.equity.map(r => <tr key={r.code}><td><Link href={`/admin/office/accounting/ledger?account=${r.code}&to=${asOf}`}>{r.code} · {r.name}</Link></td><td className="n">{m2(r.amount)}</td></tr>)}
            {bs.earlierProfit ? <tr><td>Profit from earlier years</td><td className="n">{m2(bs.earlierProfit)}</td></tr> : null}
            <tr><td>Profit this year to date</td><td className="n">{m2(bs.yearProfit)}</td></tr>
            <tr className="sub-tot"><td>Total equity</td><td className="n">{m2(bs.totalEquity)}</td></tr>
            <tr className="tot"><td>Liabilities + equity</td><td className="n">{m2(bs.totalLiabilities + bs.totalEquity)}</td></tr>
          </tbody>
        </table>
      </div>
      {Math.abs(bs.difference) > 0.004 ? <p className="alert">The balance sheet is out by {m2(bs.difference)}. Please report this.</p> : <p className="fine ok-ink">Balances: assets equal liabilities plus equity.</p>}
    </div>
  );
}
