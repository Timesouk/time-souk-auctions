import { BidderRow, type BidderRowData } from "@/components/admin/BidderRow";
import { adminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function BiddersPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to see bidders.</p>;
  const sp = await searchParams;
  const qv = String(sp.q || "").trim();
  const me = await getStaff();
  const db = adminClient();
  let query = db.from("profiles").select("id, paddle, full_name, email, phone, phone_verified_at, country, address, city, instagram, instagram_confirmed, role, suspended, terms_accepted_at, created_at").is("staff_login", null).order("paddle", { ascending: false }).limit(300);
  if (qv) {
    const safe = qv.replace(/[,()%]/g, "");
    query = /^\d+$/.test(safe)
      ? query.or(`paddle.eq.${safe},phone.ilike.%${safe}%`)
      : query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,instagram.ilike.%${safe.replace(/^@/, "")}%`);
  }
  if (sp.filter === "unverified") query = query.is("phone_verified_at", null);
  if (sp.filter === "instagram") query = query.not("instagram", "is", null).eq("instagram_confirmed", false);
  const { data: profiles } = await query;
  const ids = (profiles || []).map(p => p.id);
  const [{ data: notes }, { data: invs }, { data: users }] = await Promise.all([
    ids.length ? db.from("profile_notes").select("profile_id, notes, id_checked").in("profile_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("invoices").select("bidder_id, status").in("bidder_id", ids).neq("status", "void") : Promise.resolve({ data: [] }),
    db.auth.admin.listUsers({ perPage: 1000 })
  ]);
  const nb = new Map((notes || []).map(n => [n.profile_id, n]));
  const emailOk = new Set((users?.users || []).filter(u => u.email_confirmed_at).map(u => u.id));
  const rows: BidderRowData[] = (profiles || []).map(p => ({
    id: p.id, paddle: p.paddle, full_name: p.full_name, email: p.email, phone: p.phone, phone_verified: !!p.phone_verified_at, email_verified: emailOk.has(p.id),
    country: p.country, address: [p.address, p.city].filter(Boolean).join(", "), instagram: p.instagram, instagram_confirmed: p.instagram_confirmed, role: p.role, suspended: p.suspended, terms: !!p.terms_accepted_at,
    created_at: p.created_at, notes: nb.get(p.id)?.notes || "", id_checked: !!nb.get(p.id)?.id_checked,
    wins: (invs || []).filter(i => i.bidder_id === p.id).length, unpaid: (invs || []).filter(i => i.bidder_id === p.id && i.status !== "paid").length
  }));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <h1 className="disp">Bidders</h1>
        <form className="inline-form" action="/admin/bidders">
          <input name="q" defaultValue={qv} placeholder="Name, email, phone, paddle or @handle" style={{ minWidth: 280 }} />
          <select name="filter" defaultValue={sp.filter || ""}>
            <option value="">Everyone</option>
            <option value="unverified">Phone not verified</option>
            <option value="instagram">Instagram handle to confirm</option>
          </select>
          <button className="btn sm" type="submit">Search</button>
        </form>
      </div>
      <p className="fine">Bidders register themselves on the website and verify their email and mobile with codes. Here you confirm Instagram handles, suspend non-payers and give staff access.</p>
      {rows.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Paddle</th><th>Name</th><th>Contact</th><th>Instagram</th><th>Status</th><th className="n">Wins</th><th /></tr></thead>
            <tbody>{rows.map(b => <BidderRow key={b.id} b={b} canRole={me?.role === "admin"} />)}</tbody>
          </table>
        </div>
      ) : <p className="empty">No bidders found.</p>}
    </div>
  );
}
