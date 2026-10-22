import { loadAccounting } from "@/lib/office/load";
import { vatSummary } from "@/lib/office/accounting";
import { m2, resolvePeriod } from "@/lib/office/acct-view";
import { SetupNeeded } from "@/components/office/bits";
import { PeriodPicker } from "@/components/office/Period";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";

export default async function VatPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const data = await loadAccounting().catch((e: Error) => e);
  if (data instanceof Error) return <SetupNeeded error={data.message} />;
  const { o, j } = data;
  const s = o.data.settings;
  const per = resolvePeriod(sp, o.today, "quarter");
  const v = vatSummary(j, per.from, per.to);
  const registered = s.vat_sales_pct > 0 || s.vat_fee_pct > 0;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">VAT</h1>
          <p className="fine">{per.label} · AED · figures to help prepare the VAT return; check them with your accountant before filing with the FTA.</p>
        </div>
        <PrintButton />
      </div>
      {!registered ? (
        <p className="alert info">
          VAT is set to 0% in Back office › Settings (VAT on buyer invoices and on seller fees), so no VAT is being charged. If the business registers for VAT, set the rates there from the registration date, add the TRN, and record VAT on expenses in Money in &amp; out.
        </p>
      ) : null}
      <PeriodPicker action="/admin/office/accounting/vat" current={per.key} from={per.from} to={per.to} list={per.list} />
      <div className="tbl-wrap" style={{ maxWidth: 760 }}>
        <table className="report">
          <tbody>
            <tr className="grp"><td colSpan={2}>Sales (output VAT)</td></tr>
            <tr><td>Invoices to buyers, before VAT (own stock, delivery and charges)</td><td className="n">{m2(v.salesValue)}</td></tr>
            <tr><td>VAT on invoices ({s.vat_sales_pct}%)</td><td className="n">{m2(v.outInvoices)}</td></tr>
            <tr><td>Seller fees (commission), before VAT</td><td className="n">{m2(v.feeValue)}</td></tr>
            <tr><td>VAT on seller fees ({s.vat_fee_pct}%)</td><td className="n">{m2(v.outFees)}</td></tr>
            {v.outOther ? <tr><td>Other output VAT (typed entries)</td><td className="n">{m2(v.outOther)}</td></tr> : null}
            <tr className="sub-tot"><td>Total output VAT</td><td className="n">{m2(v.output)}</td></tr>
            <tr className="grp"><td colSpan={2}>Expenses (input VAT)</td></tr>
            <tr><td>Expenses with VAT, before VAT</td><td className="n">{m2(v.expenseValue)}</td></tr>
            <tr className="sub-tot"><td>Total input VAT to recover</td><td className="n">{m2(v.input)}</td></tr>
            <tr className="tot"><td>{v.net >= 0 ? "VAT to pay" : "VAT to reclaim"}</td><td className="n">{m2(Math.abs(v.net))}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="fine">
        Pre-owned watches can sometimes use the UAE profit-margin scheme, and exports outside the UAE can be zero-rated. Neither is applied automatically here: ask your tax adviser which applies to your sales before relying on these figures.
      </p>
    </div>
  );
}
