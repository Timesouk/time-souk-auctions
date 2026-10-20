import Link from "next/link";
import { loadAccounting } from "@/lib/office/load";
import { balances } from "@/lib/office/accounting";
import { m2, moneyAccounts } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { AccountRow, AcctSettingsForm, NewAccount } from "@/components/office/AcctForms";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";
import { PAY_METHODS } from "@/lib/office/types";

export const dynamic = "force-dynamic";

const TYPES: [string, string][] = [["asset", "Assets"], ["liability", "Liabilities"], ["equity", "Equity"], ["income", "Income"], ["expense", "Expenses"]];

export default async function ChartPage() {
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const staff = IS_PREVIEW ? null : await getStaff();
  const admin = IS_PREVIEW || staff?.role === "admin";
  const { o, acct, j } = data;
  const s = o.data.settings;
  const b = balances(j, "", "");
  const methods: Record<string, string> = {};
  for (const m of [...PAY_METHODS, "Card (website)", ...Object.keys(s.acct_methods)]) methods[m] = s.acct_methods[m] || "1900";
  const money = moneyAccounts(acct.accounts).map(a => ({ code: a.code, name: a.name, type: a.type, subtype: a.subtype }));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 className="disp">Chart of accounts &amp; settings</h1>
        <p className="fine">The accounts the books use. Rename any of them (e.g. your bank&apos;s name); accounts the automatic journal uses can&apos;t be switched off. Add your own for expenses you want to see separately.</p>
      </div>
      {admin ? (
        <section className="panel-card">
          <span className="k">Settings</span>
          <AcctSettingsForm methods={methods} payoutDefault={s.acct_payout_default} lockDate={s.acct_lock_date || ""} money={money} />
        </section>
      ) : null}
      {admin ? (
        <section className="panel-card">
          <span className="k">Add an account</span>
          <NewAccount />
        </section>
      ) : null}
      {TYPES.map(([t, label]) => (
        <section key={t} className="stack" style={{ gap: 6 }}>
          <h2 className="h-sec">{label}</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>{admin ? "In use" : ""}</th><th>{admin ? "Notes" : "Balance"}</th><th /></tr></thead>
              <tbody>
                {acct.accounts.filter(a => a.type === t).map(a =>
                  admin ? <AccountRow key={a.code} a={a} /> : (
                    <tr key={a.code}>
                      <td className="mono">{a.code}</td>
                      <td><Link href={`/admin/office/accounting/ledger?account=${a.code}`}>{a.name}</Link></td>
                      <td>{a.type}</td>
                      <td />
                      <td className="n">{m2(b.get(a.code)?.balance || 0)}</td>
                      <td />
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
