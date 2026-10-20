import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { balances, profitLoss, SOURCE_LABEL } from "@/lib/office/accounting";
import { m2, moneyAccounts, resolvePeriod } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PeriodPicker } from "@/components/office/Period";

export const dynamic = "force-dynamic";

export default async function AccountingHome({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { o, j } = data;
  const per = resolvePeriod(sp, o.today);
  const pl = profitLoss(j, per.from, per.to);
  const now = balances(j, "", "");
  const bal = (c: string) => now.get(c)?.balance || 0;
  const money = moneyAccounts(j.accounts);
  const recent = j.entries.filter(e => e.source === "manual").slice(-8).reverse();
  const lock = o.data.settings.acct_lock_date;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Accounting</h1>
          <p className="fine">
            Double-entry books. Auction sales, seller fees, cost of own stock, payments, deposits, refunds and seller payouts are booked automatically from the back office.
            Record everything else under <Link href="/admin/office/accounting/money">Money in &amp; out</Link>.
            {lock ? ` Books closed up to ${lock}.` : ""}
          </p>
        </div>
        <Link className="btn pri" href="/admin/office/accounting/money">Record an expense</Link>
      </div>
      <PeriodPicker action="/admin/office/accounting" current={per.key} from={per.from} to={per.to} list={per.list} />
      <section className="stack" style={{ gap: 8 }}>
        <h2 className="h-sec">{per.label}</h2>
        <div className="stats">
          <div><span className="k">Income</span><b>{m2(pl.totalIncome)}</b></div>
          <div><span className="k">Cost of sales</span><b>{m2(pl.totalCogs)}</b></div>
          <div><span className="k">Gross profit</span><b>{m2(pl.grossProfit)}</b></div>
          <div><span className="k">Expenses</span><b>{m2(pl.totalExpenses)}</b></div>
          <div><Link href={`/admin/office/accounting/pl?${new URLSearchParams(per.key === "custom" ? { from: per.from, to: per.to } : { p: per.key })}`}><span className="k">Net profit</span><b className={pl.netProfit < 0 ? "warn-ink" : undefined}>{m2(pl.netProfit)}</b></Link></div>
        </div>
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <h2 className="h-sec">Money today (AED)</h2>
        <div className="stats">
          {money.map(a => (
            <div key={a.code}><Link href={`/admin/office/accounting/ledger?account=${a.code}`}><span className="k">{a.name}</span><b className={bal(a.code) < 0 ? "warn-ink" : undefined}>{m2(bal(a.code))}</b></Link></div>
          ))}
        </div>
        <div className="stats">
          <div><Link href="/admin/office/accounting/aging"><span className="k">Buyers owe us</span><b>{m2(bal("1100"))}</b></Link></div>
          <div><Link href="/admin/office/accounting/aging"><span className="k">Owed to consignors</span><b>{m2(bal("2100"))}</b></Link></div>
          <div><Link href="/admin/office/accounting/ledger?account=2200"><span className="k">Buyers&apos; deposits held</span><b>{m2(bal("2200"))}</b></Link></div>
          <div><Link href="/admin/office/accounting/ledger?account=1200"><span className="k">Watches in stock (cost)</span><b className={bal("1200") < 0 ? "warn-ink" : undefined}>{m2(bal("1200"))}</b></Link></div>
          <div><Link href="/admin/office/accounting/vat"><span className="k">VAT to pay (net)</span><b>{m2(bal("2300") - bal("1300"))}</b></Link></div>
        </div>
        {bal("1200") < 0 ? <p className="fine warn-ink">Watches in stock is below zero: own-stock watches have been sold with a cost, but their purchase (or opening stock) isn&apos;t recorded yet. Record it under Money in &amp; out › Stock bought, or the opening balances.</p> : null}
        {bal("1900") ? <p className="fine warn-ink">AED {m2(bal("1900"))} is in Suspense: <Link href="/admin/office/accounting/ledger?account=1900">sort it out</Link>.</p> : null}
      </section>
      {j.warnings.length ? (
        <section className="panel-card">
          <span className="k">Worth a look ({j.warnings.length})</span>
          <ul className="plain fine">{j.warnings.slice(0, 30).map(w => <li key={w}>{w}</li>)}</ul>
        </section>
      ) : null}
      <section className="panel-card">
        <span className="k">Recent entries typed here</span>
        {recent.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Date</th><th>What</th><th>Lines</th></tr></thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id}>
                    <td className="nowrap">{e.date}</td>
                    <td><a href={e.href}>{e.title}</a>{e.manual?.payee ? <small className="sub">{e.manual.payee}</small> : null}</td>
                    <td className="fine">{e.lines.map(l => `${l.debit ? "Dr" : "Cr"} ${l.account} ${m2(l.debit || l.credit)}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="fine">None yet. Start with the opening balances (Money in &amp; out), then record expenses as they happen.</p>}
        <p className="fine">Automatic entries so far: {Object.entries(j.entries.reduce<Record<string, number>>((t, e) => ({ ...t, [e.source]: (t[e.source] || 0) + 1 }), {})).filter(([k]) => k !== "manual").map(([k, n]) => `${n} ${SOURCE_LABEL[k as keyof typeof SOURCE_LABEL].toLowerCase()}`).join(" · ") || "none"}.</p>
      </section>
    </div>
  );
}
