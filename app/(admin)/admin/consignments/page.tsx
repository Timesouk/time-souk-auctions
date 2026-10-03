import Link from "next/link";
import { ConsignmentStatus } from "@/components/admin/SettingsForm";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW } from "@/lib/env";
import { num, stamp, waLink } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConsignmentsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to see consignment requests.</p>;
  const sp = await searchParams;
  let q = adminClient().from("consignments").select("*").order("created_at", { ascending: false }).limit(200);
  if (!sp.all) q = q.in("status", ["new", "contacted", "accepted"]);
  const { data } = await q;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <h1 className="disp">Consignments</h1>
        <Link className="btn sm" href={sp.all ? "/admin/consignments" : "/admin/consignments?all=1"}>{sp.all ? "Show open only" : "Show all"}</Link>
      </div>
      <p className="fine">Requests from the “Sell with us” page. Agree the estimate and reserve with the owner, then turn the request into a lot.</p>
      {data?.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Received</th><th>Watch</th><th>Owner</th><th className="n">Price in mind</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map(c => {
                const wa = waLink(c.phone, c.lang === "ar" ? `مرحباً ${c.name}، بخصوص ساعتك ${c.brand} ${c.model}` : `Hello ${c.name}, about your ${c.brand} ${c.model}`);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{stamp(c.created_at)}</td>
                    <td><b>{c.brand} {c.model}</b> <span className="ref">{c.reference} {c.year}</span><br /><span className="fine">{c.box_papers} · {c.condition}{c.notes ? ` · ${c.notes}` : ""}</span></td>
                    <td>{c.name}<br /><span className="mono" style={{ fontSize: 13 }}>{c.phone}</span>{c.email ? <><br /><span style={{ fontSize: 13 }}>{c.email}</span></> : null}</td>
                    <td className="n">{c.price_in_mind ? num(c.price_in_mind) : "—"}</td>
                    <td><ConsignmentStatus id={c.id} status={c.status} /></td>
                    <td className="n">
                      {wa ? <a className="btn sm" href={wa} target="_blank" rel="noopener">WhatsApp</a> : null}{" "}
                      {c.lot_id ? <Link className="btn sm" href={`/admin/lots/${c.lot_id}`}>Lot</Link> : <Link className="btn sm pri" href={`/admin/lots/new?consignment=${c.id}`}>Create lot</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="empty">No consignment requests.</p>}
    </div>
  );
}
