import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { amt } from "@/lib/office/engine";
import { SetupNeeded } from "@/components/office/bits";
import { dubaiStamp } from "@/components/office/DocHead";

export const dynamic = "force-dynamic";

/** Every WhatsApp message opened from the back office: invoices, winners, reminders, links, confirmations. */
export default async function OfficeSent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const q = String(sp.q || "").trim().toLowerCase();
  const list = o.data.sent
    .filter(x => !q || `${x.ref} ${x.name} ${x.phone} ${x.kind}`.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
    .slice(0, 500);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Sent log</h1>
          <p className="fine">A row for every message opened in WhatsApp from here (and from the workbook, once imported).</p>
        </div>
        <form className="inline-form" action="/admin/office/sent">
          <input name="q" defaultValue={sp.q || ""} placeholder="Invoice, name, number, type…" aria-label="Find" />
          <button className="btn sm">Find</button>
        </form>
      </div>
      {list.length === 0 ? <p className="empty">Nothing sent yet.</p> : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Sent</th><th>For</th><th>Name</th><th>WhatsApp</th><th>Message</th><th className="n">Total</th><th className="n">Balance then</th><th>Link</th></tr></thead>
            <tbody>
              {list.map(x => (
                <tr key={x.id}>
                  <td className="nowrap fine">{dubaiStamp(Date.parse(x.sent_at))}</td>
                  <td className="mono">{/^TS\d/.test(x.ref) ? <Link href={`/admin/office/invoices/${x.ref}`}>{x.ref}</Link> : /^CR-/.test(x.ref) ? <Link href={`/admin/office/intake/${x.ref}`}>{x.ref}</Link> : x.ref}</td>
                  <td>{x.name}</td>
                  <td className="mono nowrap">{x.phone}</td>
                  <td>{x.kind}</td>
                  <td className="n">{x.total != null ? amt(x.total) : ""}</td>
                  <td className="n">{x.balance != null ? amt(x.balance) : ""}</td>
                  <td>{x.link ? <a href={x.link} target="_blank" rel="noreferrer">link</a> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
