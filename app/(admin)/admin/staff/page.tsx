import { CreateStaff, StaffMember, type StaffRow } from "@/components/admin/Staff";
import { adminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW, SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to manage staff.</p>;
  const me = await getStaff();
  if (me?.role !== "admin") return <p className="alert">Only the admin can manage staff.</p>;
  const { data } = await adminClient()
    .from("profiles").select("id, full_name, email, role, suspended, staff_login, created_at")
    .in("role", ["staff", "admin"]).order("role").order("created_at");
  const rows: StaffRow[] = (data || []).map(p => ({
    id: p.id, name: p.full_name, login: p.staff_login, email: p.email, role: p.role, suspended: !!p.suspended, created_at: p.created_at, you: p.id === me.id
  }));
  const admins = rows.filter(r => r.role === "admin").length;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="adm-head"><h1 className="disp">Staff</h1></div>
      <div className="panel-card">
        <span className="k">Create a staff login</span>
        <p className="fine">Staff sign in at <span className="mono">{SITE_URL}/admin</span> with the staff ID and password you choose here. No email or phone code needed. They can run the live console and manage lots, bidders and payments. Only you can change settings, manage staff and reset auctions.</p>
        <CreateStaff site={SITE_URL} />
      </div>
      <div className="panel-card">
        <span className="k">Staff and admin · {rows.length}</span>
        {admins > 1 ? <p className="alert">There is more than one admin. Press “Make staff” on the others so you’re the only admin.</p> : null}
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>Signs in with</th><th>Role</th><th /></tr></thead>
            <tbody>{rows.map(s => <StaffMember key={s.id} s={s} />)}</tbody>
          </table>
        </div>
        <p className="fine">Forgotten password: type a new one (or press Make one), Save password, and send it to them. Someone leaving: Turn off access.</p>
      </div>
    </div>
  );
}
