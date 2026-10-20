import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { months, profitLoss, type ProfitLoss, type Row } from "@/lib/office/accounting";
import { m2, resolvePeriod } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PeriodPicker } from "@/components/office/Period";
import { PrintButton } from "@/components/office/forms";
import { companyName } from "@/lib/office/messages";

export const dynamic = "force-dynamic";

export default async function ProfitAndLoss({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; by?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { o, j } = data;
  const per = resolvePeriod(sp, o.today, "year");
  const byMonth = sp.by === "month";
  const firstDate = j.lines.reduce((m, l) => (m && m < l.date ? m : l.date), "") || o.today;
  const cols: { label: string; pl: ProfitLoss }[] = byMonth
    ? months(per.from || firstDate, per.to && per.to < o.today ? per.to : o.today).map(([f, t]) => ({ label: f.slice(0, 7), pl: profitLoss(j, f, t) }))
    : [];
  const total = profitLoss(j, per.from, per.to);
  const extra: Record<string, string> = byMonth ? { by: "month" } : {};
  const toggle = new URLSearchParams(per.key === "custom" ? { from: per.from, to: per.to } : { p: per.key });
  if (!byMonth) toggle.set("by", "month");
  const codes = (pick: (p: ProfitLoss) => Row[]) => [...new Set([total, ...cols.map(c => c.pl)].flatMap(p => pick(p).map(r => r.code)))].sort();
  const name = (code: string) => j.byCode.get(code)?.name || code;
  const val = (p: ProfitLoss, pick: (p: ProfitLoss) => Row[], code: string) => pick(p).find(r => r.code === code)?.amount || 0;
  const Section = ({ title, pick, totalOf }: { title: string; pick: (p: ProfitLoss) => Row[]; totalOf: (p: ProfitLoss) => number }) => (
    <>
      <tr className="grp"><td colSpan={cols.length + 2}>{title}</td></tr>
      {codes(pick).map(c => (
        <tr key={c}>
          <td><Link href={`/admin/office/accounting/ledger?account=${c}&from=${per.from}&to=${per.to}`}>{c} · {name(c)}</Link></td>
          {cols.map(col => <td key={col.label} className="n">{val(col.pl, pick, c) ? m2(val(col.pl, pick, c)) : "–"}</td>)}
          <td className="n">{m2(val(total, pick, c))}</td>
        </tr>
      ))}
      <tr className="sub-tot"><td>Total {title.toLowerCase()}</td>{cols.map(col => <td key={col.label} className="n">{m2(totalOf(col.pl))}</td>)}<td className="n">{m2(totalOf(total))}</td></tr>
    </>
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Profit &amp; loss</h1>
          <p className="fine">{companyName(o.data.settings)} · {per.label} · AED</p>
        </div>
        <div className="row no-print">
          <Link className="btn sm" href={`/admin/office/accounting/pl?${toggle}`}>{byMonth ? "One column" : "Month by month"}</Link>
          <PrintButton />
        </div>
      </div>
      <PeriodPicker action="/admin/office/accounting/pl" current={per.key} from={per.from} to={per.to} list={per.list} extra={extra} />
      <div className="tbl-wrap">
        <table className="report">
          <thead><tr><th>Account</th>{cols.map(c => <th key={c.label} className="n">{c.label}</th>)}<th className="n">{byMonth ? "Total" : "Amount"}</th></tr></thead>
          <tbody>
            <Section title="Income" pick={p => p.income} totalOf={p => p.totalIncome} />
            <Section title="Cost of sales" pick={p => p.cogs} totalOf={p => p.totalCogs} />
            <tr className="tot"><td>Gross profit</td>{cols.map(c => <td key={c.label} className="n">{m2(c.pl.grossProfit)}</td>)}<td className="n">{m2(total.grossProfit)}</td></tr>
            <Section title="Expenses" pick={p => p.expenses} totalOf={p => p.totalExpenses} />
            <tr className="tot"><td>Net profit</td>{cols.map(c => <td key={c.label} className="n">{m2(c.pl.netProfit)}</td>)}<td className="n">{m2(total.netProfit)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="fine">
        Consigned watches aren&apos;t income: only the seller fee is. Own-stock watches count their hammer price as sales and their cost as cost of sales. Discounts reduce income.
      </p>
    </div>
  );
}
