import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { aed, amt } from "@/lib/office/engine";
import { pctText } from "@/lib/office/messages";
import { SetupNeeded } from "@/components/office/bits";
import { NewSeller } from "@/components/office/forms2";
import { sellerNowAndLater } from "@/lib/office/seller-account";
import { feeRule } from "@/lib/office/fees";

export const dynamic = "force-dynamic";

export default async function OfficeSellers() {
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const s = o.data.settings;
  const list = o.sellers.slice().sort((a, b) => (a.kind === b.kind ? a.code.localeCompare(b.code) : a.kind === "own" ? -1 : 1));
  const owed = o.sellers.filter(x => !x.demo).reduce((t, x) => t + Math.max(0, x.owed), 0);
  const nowOf = new Map(o.sellers.filter(x => x.kind !== "own").map(x => [x.id, sellerNowAndLater(o, x.id).now]));
  const dueNow = o.sellers.filter(x => !x.demo).reduce((t, x) => t + Math.max(0, nowOf.get(x.id) || 0), 0);
  const feeShort = (x: (typeof list)[number]) => {
    const r = feeRule(null, x, s);
    if (r.scale) return r.from === "seller scale" ? "own scale" : "standard scale";
    return `${pctText(r.pct / 100)}${r.fixed ? ` + ${amt(r.fixed)}` : ""}`;
  };
  const bal = (n: number) => (n > 0.005 ? <b>{amt(n)}</b> : n < -0.005 ? <b className="warn-ink" title="Buyers paid this seller directly more than their share">owes us {amt(-n)}</b> : "0");
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Sellers</h1>
          <p className="fine">Consignors and your own stock (TS). Standard fee: {s.fee_scale.length ? <Link href="/admin/office/settings#fee-scale">fee scale by sold price</Link> : <>{pctText(s.fee_pct / 100)}{s.fee_fixed ? ` + AED ${amt(s.fee_fixed)} per sold lot` : ""}</>}. Due to sellers now (their buyers have paid): {aed(dueNow)} · once every buyer has paid: {aed(owed)}.</p>
        </div>
        <div className="row">
          <Link className="btn sm pri" href="/admin/office/sellers/payouts">Pay a whole auction</Link>
          <Link className="btn sm" href="/admin/office/intake">Intake</Link>
          <Link className="btn sm" href="/admin/office/statements">Statements</Link>
        </div>
      </div>
      <NewSeller />
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Type</th><th>WhatsApp</th><th>Fee</th><th className="n">Lots</th><th className="n">Sold</th><th className="n">Hammer</th><th className="n">Fees</th><th className="n">Net to seller</th><th className="n">Paid out</th><th className="n">Due now</th><th className="n">Once buyers pay</th><th className="n">Our profit</th></tr>
          </thead>
          <tbody>
            {list.map(x => (
              <tr key={x.id}>
                <td className="mono"><Link href={`/admin/office/sellers/${x.code}`}>{x.code}</Link></td>
                <td>{x.name}</td>
                <td>{x.kind === "own" ? "Own stock" : "Consignment"}{x.demo ? <small className="sub">demo</small> : null}</td>
                <td className="mono nowrap">{x.phone}</td>
                <td className="nowrap">{x.kind === "own" ? "" : feeShort(x)}</td>
                <td className="n">{x.lotsEntered}</td>
                <td className="n">{x.lotsSold}</td>
                <td className="n">{amt(x.hammer)}</td>
                <td className="n">{amt(x.fees)}</td>
                <td className="n">{amt(x.net)}</td>
                <td className="n">{amt(x.paidOut)}</td>
                <td className="n">{x.kind === "own" ? "" : bal(nowOf.get(x.id) || 0)}</td>
                <td className="n">{x.kind === "own" ? "" : bal(x.owed)}</td>
                <td className="n">{amt(x.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
