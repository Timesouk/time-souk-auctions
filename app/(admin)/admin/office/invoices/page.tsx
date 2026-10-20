import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { aed, amt, type InvoiceView } from "@/lib/office/engine";
import { dateText } from "@/lib/office/messages";
import { hoursSince, invoiceMessages } from "@/lib/office/view";
import { COD } from "@/lib/office/types";
import { AuctionPicker, LotKeys, Pill, SetupNeeded } from "@/components/office/bits";
import { WaButton } from "@/components/office/Wa";

export const dynamic = "force-dynamic";

const SHOWS: [string, string][] = [
  ["", "All"],
  ["unpaid", "Unpaid"],
  ["overdue", "Overdue"],
  ["unsent", "Not sent"],
  ["fee", "Need delivery fee"],
  ["ready", "Ready to ship"],
  ["refund", "Refund due"]
];

const pick = (show: string, i: InvoiceView) => {
  switch (show) {
    case "unpaid": return i.balance > 0 && i.paysBy !== COD;
    case "overdue": return (i.hoursOverdue || 0) > 0;
    case "unsent": return !i.sentAt;
    case "fee": return i.feeMissing;
    case "ready": return /^Ready/.test(i.nextStep);
    case "refund": return i.balance < -0.005;
    default: return true;
  }
};

export default async function OfficeInvoices({ searchParams }: { searchParams: Promise<{ a?: string; show?: string; all?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const all = sp.all === "1";
  const a = all ? null : pickAuction(o, sp.a);
  const show = SHOWS.some(([k]) => k === sp.show) ? sp.show || "" : "";
  const s = o.data.settings;
  const base = all ? o.invoices : o.invoices.filter(i => i.auction?.id === a?.id);
  const list = base.filter(i => pick(show, i));
  const gap = s.remind_gap_hours || 12;
  const href = (k: string, everything = all) => `/admin/office/invoices?${everything ? "all=1" : `a=${a?.number ?? ""}`}${k ? `&show=${k}` : ""}`;
  const totals = list.reduce((t, i) => ({ total: t.total + i.total, paid: t.paid + i.paid, bal: t.bal + Math.max(0, i.balance) }), { total: 0, paid: 0, bal: 0 });
  const remindable = list.filter(i => i.balance > 0 && i.paysBy !== COD);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Invoices{a ? ` · auction ${a.number}` : " · every auction"}</h1>
          <p className="fine">One invoice per buyer per auction, every lot they won combined. They update as results and payments are typed.</p>
        </div>
        <div className="row">
          {!all ? <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office/invoices" extra={show ? { show } : {}} /> : null}
          <Link className="btn sm" href={all ? `/admin/office/invoices${show ? `?show=${show}` : ""}` : href(show, true)}>{all ? "One auction" : "Every auction"}</Link>
        </div>
      </div>
      <div className="chips">
        {SHOWS.map(([k, label]) => {
          const n = base.filter(i => pick(k, i)).length;
          return <Link key={k} className="chip" href={href(k)} aria-pressed={k === show}>{label}<small>{n}</small></Link>;
        })}
      </div>
      <div className="stats">
        <div><span className="k">Invoices</span><b>{list.length}</b></div>
        <div><span className="k">Billed</span><b>{aed(totals.total)}</b></div>
        <div><span className="k">Paid</span><b>{aed(totals.paid)}</b></div>
        <div><span className="k">Still to collect</span><b className={totals.bal > 0 ? "warn-ink" : undefined}>{aed(totals.bal)}</b></div>
      </div>
      {show === "unpaid" || show === "overdue" ? (
        <p className="fine">
          Reminders: press <b>Remind</b> on each row; WhatsApp opens with the reminder typed in. Buyers reminded in the last {gap} hours show the time instead. Cash on delivery isn&apos;t listed.
          {remindable.length ? ` ${remindable.filter(i => (hoursSince(i.lastReminder, o.data.now) ?? 999) >= gap).length} to remind now.` : ""}
        </p>
      ) : null}
      {list.length === 0 ? (
        <p className="empty">No invoices here{base.length ? " with this filter" : " yet: they appear when lots are sold with a buyer"}.</p>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th><th>Buyer</th><th>Lots</th><th className="n">Total</th><th className="n">Paid</th><th className="n">Balance</th>
                <th>Status</th><th>Due</th><th>Sent</th><th>Next step</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map(i => {
                const m = invoiceMessages(o, i);
                const since = hoursSince(i.lastReminder, o.data.now);
                const recent = since != null && since < gap;
                const who = i.customer.full_name || (i.customer.instagram ? `@${i.customer.instagram}` : i.customer.code);
                return (
                  <tr key={i.no}>
                    <td className="mono nowrap"><Link href={`/admin/office/invoices/${i.no}`}>{i.no}</Link></td>
                    <td>
                      <Link href={`/admin/office/buyers/${i.customer.code}`}>{who}</Link>
                      {i.customer.flag !== "OK" ? <> <span className="pill warn">{i.customer.flag}</span></> : null}
                      {i.customer.instagram && i.customer.full_name ? <small className="sub">@{i.customer.instagram}</small> : null}
                    </td>
                    <td className="mono"><LotKeys keys={i.lots.map(l => l.key)} /></td>
                    <td className="n">{amt(i.total)}{i.feeMissing ? <small className="sub">+ delivery</small> : null}</td>
                    <td className="n">{amt(i.paid)}</td>
                    <td className="n"><b>{amt(i.balance)}</b></td>
                    <td><Pill s={i.status} /></td>
                    <td className="nowrap">
                      {i.balance > 0 && i.paysBy !== COD && i.due ? (i.hoursOverdue ? <span className="warn-ink">{i.hoursOverdue}h overdue</span> : dateText(new Date(i.due + 4 * 3600e3).toISOString().slice(0, 10), "EN")) : ""}
                    </td>
                    <td className="nowrap fine">{i.sentAt ? dateText(new Date(Date.parse(i.sentAt) + 4 * 3600e3).toISOString().slice(0, 10), "EN").slice(4) : "–"}</td>
                    <td className="fine">{i.nextStep}</td>
                    <td className="nowrap">
                      <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <WaButton label={i.sentAt ? "Resend" : "Send"} phone={i.customer.phone} text={m.invoice} mode={s.wa_mode}
                          log={{ ref: i.no, name: who, total: i.total, balance: i.balance, kind: "Invoice", link: "" }} />
                        {i.balance > 0 && i.paysBy !== COD ? (
                          recent ? <span className="fine ok-ink" title="Reminded recently">{since}h ago</span> : (
                            <WaButton label="Remind" phone={i.customer.phone} text={m.reminder} mode={s.wa_mode}
                              log={{ ref: i.no, name: who, total: i.total, balance: i.balance, kind: "Reminder", link: "" }} />
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
