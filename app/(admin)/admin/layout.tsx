import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "../../site.css";
import "../../admin.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Chrome } from "@/components/admin/Chrome";
import { AdminSignOut } from "@/components/admin/ui";
import { StaffSignIn } from "@/components/admin/Staff";
import { serverClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const metadata: Metadata = { title: "Back office · The Time Souk", robots: { index: false, follow: false } };
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
  const who = IS_PREVIEW ? "Preview: sample data" : staff ? `${staff.name} · ${staff.role === "admin" ? "Admin" : "Staff"}` : "";
  return (
    <html lang="en" dir="ltr">
      <body>
        {allowed ? (
          <div className="adm bo">
            <Suspense fallback={<aside className="bo-side no-print" />}>
              <Chrome isAdmin={IS_PREVIEW || staff?.role === "admin"} who={who} canSignOut={!!staff} />
            </Suspense>
            <div className="bo-main">
              {IS_PREVIEW ? <p className="bo-sample no-print">Sample data for a preview. Nothing you type is saved.</p> : null}
              <main className="adm-main">
                <div className="bo-page">{children}</div>
              </main>
            </div>
          </div>
        ) : (
          <div className="adm bo-out">
            <div className="bo-out-box">
              <Logo height={52} />
              <StaffSignIn signedInAs={other} />
              {other ? <p className="fine">Not you? <AdminSignOut /></p> : null}
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
