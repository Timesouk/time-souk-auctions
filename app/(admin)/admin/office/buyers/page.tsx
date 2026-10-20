import Link from "next/link";
import { loadOffice } from "@/lib/office/load";
import { aed, amt } from "@/lib/office/engine";
import { SetupNeeded } from "@/components/office/bits";
import { NewBuyer } from "@/components/office/NewBuyer";

export const dynamic = "force-dynamic";

export default async function OfficeBuyers({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const q = String(sp.q || "").trim().toLowerCase().replace(/^@/, "");
  const show = sp.show || "";
  const list = o.customers
    .filter(c => !q || `${c.code} ${c.instagram || ""} ${c.full_name} ${c.phone} ${c.email} ${c.area}`.toLowerCase().includes(q))
    .filter(c => (show === "owing" ? c.outstanding > 0.005 : show === "deposit" ? c.depositHeld > 0.005 : show === "flagged" ? c.flag !== "OK" : show === "nophone" ? !c.phone : true))
    .sort((a, b) => b.code.localeCompare(a.code));
  const chips: [string, string, number][] = [
    ["", "Everyone", o.customers.length],
    ["owing", "Owe money", o.customers.filter(c => c.outstanding > 0.005).length],
    ["deposit", "Deposit held", o.customers.filter(c => c.depositHeld > 0.005).length],
    ["nophone", "No WhatsApp number", o.customers.filter(c => !c.phone).length],
    ["flagged", "Flagged", o.customers.filter(c => c.flag !== "OK").length]
  ];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Buyers</h1>
          <p className="fine">Everyone who has won a lot, from Instagram or the website. Each has a buyer code (B0001) used on invoices.</p>
        </div>
        <form className="inline-form" action="/admin/office/buyers">
          {show ? <input type="hidden" name="show" value={show} /> : null}
          <input name="q" defaultValue={sp.q || ""} placeholder="@handle, name, phone, code…" aria-label="Find a buyer" />
          <button className="btn sm">Find</button>
        </form>
      </div>
      <NewBuyer />
      <div className="chips">
        {chips.map(([k, label, n]) => (
          <Link key={k} className="chip" href={`/admin/office/buyers${k ? `?show=${k}` : ""}`} aria-pressed={k === show}>{label}<small>{n}</small></Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="empty">No buyers found.</p>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Code</th><th>Instagram</th><th>Name</th><th>WhatsApp</th><th>Country</th><th className="n">Lots won</th><th className="n">Bought</th><th className="n">Owes</th><th className="n">Deposit held</th><th>Flag</th></tr>
            </thead>
            <tbody>
              {list.slice(0, 500).map(c => (
                <tr key={c.id}>
                  <td className="mono"><Link href={`/admin/office/buyers/${c.code}`}>{c.code}</Link></td>
                  <td>{c.instagram ? `@${c.instagram}` : ""}</td>
                  <td>{c.full_name}</td>
                  <td className="mono nowrap">{c.phone || <span className="warn-ink">missing</span>}</td>
                  <td>{c.country || "UAE"}</td>
                  <td className="n">{c.lotsWon || ""}</td>
                  <td className="n">{c.bought ? amt(c.bought) : ""}</td>
                  <td className="n">{c.outstanding > 0.005 ? <b className="warn-ink">{amt(c.outstanding)}</b> : ""}</td>
                  <td className="n">{c.depositHeld > 0.005 ? amt(c.depositHeld) : ""}</td>
                  <td>{c.flag !== "OK" ? <span className="pill warn">{c.flag}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 500 ? <p className="fine">Showing the newest 500 of {list.length}. Search to find others.</p> : null}
      <p className="fine">Total owed by buyers: {aed(o.customers.reduce((t, c) => t + Math.max(0, c.outstanding), 0))}.</p>
    </div>
  );
}
