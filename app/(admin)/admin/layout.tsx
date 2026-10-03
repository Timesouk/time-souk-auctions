import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "../../site.css";
import "../../admin.css";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Logo } from "@/components/Logo";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const metadata: Metadata = { title: "Admin · The Time Souk", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = IS_PREVIEW ? null : await getStaff();
  const allowed = IS_PREVIEW || !!staff;
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
              </span>
            </div>
          </div>
          {allowed ? <AdminNav /> : null}
          <main className="adm-main">
            <div className="wrap">
              {allowed ? children : (
                <div className="panel-card" style={{ maxWidth: 560 }}>
                  <h1 className="disp">Staff only</h1>
                  <p>Sign in with a staff account to use the admin.</p>
                  <div className="row">
                    <Link className="btn pri" href="/en/sign-in?next=/admin">Sign in</Link>
                  </div>
                  <p className="fine">To make someone staff, see “Make yourself an admin” in the setup guide.</p>
                </div>
              )}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
