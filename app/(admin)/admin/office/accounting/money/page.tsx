import { loadAccounting } from "@/lib/office/load";
import { KIND_LABEL } from "@/lib/office/accounting";
import { acctOptions, m2 } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { JournalForm, MoneyForm, VoidButton } from "@/components/office/AcctForms";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function MoneyInOut() {
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const { acct, j } = data;
  const opts = acctOptions(acct.accounts);
  const bsOpts = opts.filter(a => a.type === "asset" || a.type === "liability" || a.type === "equity");
  const opening = ["1020", "1010", "1030", "1200", "2010", "2500", "3010"].filter(c => j.byCode.has(c)).map(c => ({ account_code: c, debit: "", credit: "", memo: "" }));
  const manual = acct.entries.slice().sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at)).slice(0, 60);
  const hasOpening = acct.entries.some(e => e.kind === "opening" && !e.void);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 className="disp">Money in &amp; out</h1>
        <p className="fine">Everything the back office can&apos;t see: expenses, watches bought for stock, payouts from Ziina, Tabby and Tamara, cash banked, the owners&apos; money. Auction money is booked automatically.</p>
      </div>
      <section className="panel-card">
        <MoneyForm accounts={opts} isAdmin={admin} />
      </section>
      {admin ? (
        <>
          <details className="panel-card" open={!hasOpening}>
            <summary><strong>Opening balances</strong> <span className="fine">(once, on the day the books start)</span></summary>
            <p className="fine">
              What the business had and owed on the start date: bank and cash balances, the cost of watches in stock, what you owe suppliers or the owners, the owners&apos; capital.
              Debit what you have (assets), credit what you owe. Press <b>Balance it</b> to put the difference in 3050 Opening balances. Buyers&apos; invoices and consignors from the workbook are already in the back office, so don&apos;t add them here.
            </p>
            <JournalForm accounts={bsOpts} kind="opening" preset={opening} />
          </details>
          <details className="panel-card">
            <summary><strong>Journal entry</strong> <span className="fine">(corrections, anything else)</span></summary>
            <JournalForm accounts={opts} />
          </details>
        </>
      ) : null}
      <section className="stack" style={{ gap: 8 }}>
        <h2 className="h-sec">Entries typed here</h2>
        {manual.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Date</th><th>Kind</th><th>Description</th><th>Lines</th><th className="n">Amount</th><th /></tr></thead>
              <tbody>
                {manual.map(e => {
                  const total = e.lines.reduce((t, l) => t + Number(l.debit), 0);
                  return (
                    <tr key={e.id} id={`m-${e.id}`} className={e.void ? "voided" : undefined}>
                      <td className="nowrap">{e.entry_date}</td>
                      <td>{KIND_LABEL[e.kind] || e.kind}</td>
                      <td>{e.memo}{e.payee ? <small className="sub">{e.payee}</small> : null}{e.reference ? <small className="sub">Ref. {e.reference}</small> : null}{e.void ? <small className="sub warn-ink">Voided: {e.void_reason}</small> : null}</td>
                      <td className="fine">{e.lines.map(l => `${Number(l.debit) ? "Dr" : "Cr"} ${l.account_code} ${m2(Number(l.debit) || Number(l.credit))}`).join(" · ")}</td>
                      <td className="n">{m2(total)}</td>
                      <td>{admin && !e.void ? <VoidButton id={e.id} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="fine">Nothing yet.</p>}
      </section>
    </div>
  );
}
