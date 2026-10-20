"use client";
// Reads the auction workbook in this browser, shows what's in it and what the invoices add up to, then saves it.
import { useState } from "react";
import { Msg, useAction } from "@/components/admin/ui";
import { importWorkbook } from "@/app/(admin)/admin/office/actions";
import { readWorkbook } from "@/lib/office/xlsx";
import { SHEETS, planCounts, planImport, planToData, type ImportPlan } from "@/lib/office/import";
import { aed, compute } from "@/lib/office/engine";
import type { OfficeSettings } from "@/lib/office/types";

export function ImportWorkbook({ settings }: { settings: OfficeSettings }) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [file, setFile] = useState("");
  const [err, setErr] = useState("");
  const [reading, setReading] = useState(false);
  const { pending, msg, run } = useAction();

  const read = async (f: File | undefined) => {
    setPlan(null);
    setErr("");
    if (!f) return;
    if (!/\.xls[xm]$/i.test(f.name)) {
      setErr("Choose the workbook itself: a .xlsm (or .xlsx) file.");
      return;
    }
    setFile(f.name);
    setReading(true);
    try {
      const sheets = await readWorkbook(await f.arrayBuffer(), SHEETS);
      if (!sheets["Lots"] && !sheets["Buyers"]) throw new Error("This doesn't look like the Time Souk Auction Manager: there's no Lots or Buyers sheet.");
      setPlan(planImport(sheets));
    } catch (e) {
      setErr((e as Error).message || "Couldn't read that file.");
    } finally {
      setReading(false);
    }
  };

  const preview = plan ? compute(planToData(plan, settings, Date.now())) : null;
  const counts = plan ? planCounts(plan) : null;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <label className="drop">
        <input type="file" accept=".xlsm,.xlsx" hidden onChange={e => read(e.target.files?.[0])} />
        <b>{reading ? "Reading…" : file || "Choose the workbook (.xlsm)"}</b>
        <span className="fine" style={{ display: "block" }}>It&apos;s read here in your browser. The Ziina key on Settings is never read or sent.</span>
      </label>
      {err ? <p className="alert">{err}</p> : null}
      {plan && counts && preview ? (
        <>
          <div className="stats">
            <div><span className="k">Auctions</span><b>{counts.auctions}</b></div>
            <div><span className="k">Lots</span><b>{counts.lots}</b></div>
            <div><span className="k">Buyers</span><b>{counts.buyers}</b></div>
            <div><span className="k">Sellers</span><b>{counts.sellers}</b></div>
            <div><span className="k">Intake items</span><b>{counts.intake}</b></div>
            <div><span className="k">Payments</span><b>{counts.payments}</b></div>
            <div><span className="k">Sent messages</span><b>{counts.messagesSent}</b></div>
            <div><span className="k">Card links</span><b>{counts.cardLinks}</b></div>
          </div>
          <div className="panel-card">
            <span className="k">Check before importing: the invoices this makes</span>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Auction</th><th className="n">Lots</th><th className="n">Sold</th><th className="n">Invoices</th><th className="n">Billed</th><th className="n">Collected</th><th className="n">Outstanding</th></tr></thead>
                <tbody>
                  {preview.auctions.map(a => (
                    <tr key={a.auction.id}>
                      <td>{a.auction.number} · {a.auction.sale_date}</td>
                      <td className="n">{a.lots}</td>
                      <td className="n">{a.sold}</td>
                      <td className="n">{a.invoices}</td>
                      <td className="n">{aed(a.billed)}</td>
                      <td className="n">{aed(a.collected)}</td>
                      <td className="n">{aed(a.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fine">These should match the Auctions sheet in Excel. Refunds to make: {preview.refunds.length} ({aed(preview.refunds.reduce((t, r) => t + r.amount, 0))}).</p>
            {plan.messages.length ? <p className="fine">Your own WhatsApp wording is kept for: {plan.messages.map(m => m.key).join(", ")}.</p> : null}
          </div>
          {plan.warnings.length ? (
            <div className="panel-card">
              <span className="k">Notes ({plan.warnings.length})</span>
              <ul className="plain fine">{plan.warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          ) : null}
          <div className="row">
            <button type="button" className="btn pri" disabled={pending} onClick={() => run(() => importWorkbook(plan))}>
              {pending ? "Importing…" : "Import into the back office"}
            </button>
            <span className="fine">Safe to repeat with a newer copy: records are matched and updated, not doubled.</span>
          </div>
          <Msg r={msg} />
        </>
      ) : null}
    </div>
  );
}
