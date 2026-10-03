import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LOCALES = ["en", "ar"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split("/")[1] || "";
  const isApi = pathname.startsWith("/api");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  // Public pages always live under /en or /ar.
  if (!isApi && !isAdmin && !LOCALES.includes(first)) {
    const saved = req.cookies.get("ts_locale")?.value;
    const accept = (req.headers.get("accept-language") || "").toLowerCase();
    const locale = saved && LOCALES.includes(saved) ? saved : accept.startsWith("ar") ? "ar" : "en";
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  let res = NextResponse.next({ request: req });

  // Keep the Supabase sign-in session fresh (not needed for webhooks or scheduled jobs).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key && !pathname.startsWith("/api/webhooks") && !pathname.startsWith("/api/cron")) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: list => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        }
      }
    });
    await supabase.auth.getUser();
  }

  if (LOCALES.includes(first) && req.cookies.get("ts_locale")?.value !== first) {
    res.cookies.set("ts_locale", first, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"]
};
