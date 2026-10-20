import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { SOURCE_LABEL, type Source } from "@/lib/office/accounting";
import { m2, resolvePeriod } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PeriodPicker } from "@/components/office/Period";
import { VoidButton } from "@/components/office/AcctForms";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; source?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const { o, j } = data;
  const per = resolvePeriod(sp, o.today);
  const source = (Object.keys(SOURCE_LABEL) as Source[]).includes(sp.source as Source) ? (sp.source as Source) : null;
  const list = j.entries
    .filter(e => (!per.from || e.date >= per.from) && (!per.to || e.date <= per.to) && (!source || e.source === source))
    .slice()
    .reverse();
  const shown = list.slice(0, 400);
  const extra: Record<string, string> = source ? { source } : {};
  const q = (s: string) => {
    const p = new URLSearchParams(per.key === "custom" ? { from: per.from, to: per.to } : { p: per.key });
    if (s) p.set("source", s);
    return `/admin/office/accounting/journal?${p}`;
  };
  const name = (c: string) => j.byCode.get(c)?.name || c;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Journal</h1>
          <p className="fine">Every entry, newest first: the automatic ones from the back office and the ones typed under Money in &amp; out. {per.label}.</p>
        </div>
        <a className="btn sm no-print" href={`/admin/office/accounting/export?from=${per.from}&to=${per.to}`}>Download CSV</a>
      </div>
      <PeriodPicker action="/admin/office/accounting/journal" current={per.key} from={per.from} to={per.to} list={per.list} extra={extra} />
      <div className="chips no-print" style={{ marginTop: 0 }}>
        <Link className="chip" href={q("")} aria-pressed={!source}>Everything<small>{list.length}</small></Link>
        {(Object.keys(SOURCE_LABEL) as Source[]).map(s => <Link key={s} className="chip" href={q(s)} aria-pressed={source === s}>{SOURCE_LABEL[s]}</Link>)}
      </div>
      {shown.length === 0 ? <p className="empty">No entries in this period.</p> : (
        <div className="tbl-wrap">
          <table className="report journal">
            <thead><tr><th>Date</th><th>Entry</th><th>Account</th><th>Note</th><th className="n">Debit</th><th className="n">Credit</th></tr></thead>
            {shown.map(e => (
              <tbody key={e.id} id={e.manual ? `m-${e.manual.id}` : undefined}>
                {e.lines.map((l, i) => (
                  <tr key={l.key} className={i === 0 ? "first" : undefined}>
                    <td className="nowrap">{i === 0 ? e.date : ""}</td>
                    <td>
                      {i === 0 ? (
                        <>
                          <a href={e.href}>{e.title}</a>
                          <small className="sub">{SOURCE_LABEL[e.source]}{e.ref ? ` · ${e.ref}` : ""}</small>
                          {admin && e.manual ? <div style={{ marginTop: 4 }}><VoidButton id={e.manual.id} /></div> : null}
                        </>
                      ) : ""}
                    </td>
                    <td><Link href={`/admin/office/accounting/ledger?account=${l.account}`}>{l.account} · {name(l.account)}</Link></td>
                    <td className="fine">{l.memo}</td>
                    <td className="n">{l.debit ? m2(l.debit) : ""}</td>
                    <td className="n">{l.credit ? m2(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      {list.length > shown.length ? <p className="fine">Showing the newest {shown.length} of {list.length}. Choose a shorter period, or download the CSV.</p> : null}
    </div>
  );
}
