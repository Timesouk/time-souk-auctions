import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "../../site.css";
import "../../admin.css";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminSignOut } from "@/components/admin/ui";
import { StaffSignIn } from "@/components/admin/Staff";
import { serverClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const metadata: Metadata = { title: "Admin · The Time Souk", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = IS_PREVIEW ? null : await getStaff();
  const allowed = IS_PREVIEW || !!staff;
  // Signed in, but not as staff (e.g. a bidder account): say so on the sign-in box.
  let other: string | null = null;
  if (!allowed) {
    const sb = await serverClient();
    const { data } = sb ? await sb.auth.getUser() : { data: { user: null } };
    other = data.user?.email || null;
  }
  return (
    <html lang="en" dir="ltr">
      <body>
        <div className="adm">
          <div className="adm-top">
            <div className="wrap">
              <Link href="/admin" aria-label="Admin home"><Logo height={40} /></Link>
              <strong className="mono" style={{ color: "var(--yellow)" }}>ADMIN</strong>
              <span className="who">
                {IS_PREVIEW ? "Preview mode: sample data, nothing is saved" : staff ? `${staff.name} · ${staff.role}` : "Not signed in"} · <Link href="/en">View site</Link>
                {staff || other ? <> · <AdminSignOut /></> : null}
              </span>
            </div>
          </div>
          {allowed ? <AdminNav isAdmin={IS_PREVIEW || staff?.role === "admin"} /> : null}
          <main className="adm-main">
            <div className="wrap">
              {allowed ? children : <StaffSignIn signedInAs={other} />}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
