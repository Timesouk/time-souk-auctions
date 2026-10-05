"use server";
// Staff sign in to the admin with the staff ID and password the admin gave them.
import { headers } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { normStaffLogin } from "@/lib/staff";
import { limited } from "@/lib/http";

export async function staffSignIn(id: string, password: string): Promise<{ ok: boolean; message: string }> {
  const wrong = { ok: false, message: "Wrong staff ID or password." };
  const login = normStaffLogin(id);
  if (!login || !password) return wrong;
  const ip = ((await headers()).get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (limited(`staff-login:${ip}`, 10, 10 * 60e3) || limited(`staff-login:${login}`, 10, 10 * 60e3)) {
    return { ok: false, message: "Too many tries. Wait 10 minutes and try again." };
  }
  const { data: p } = await adminClient().from("profiles").select("email, role, suspended").eq("staff_login", login).maybeSingle();
  if (!p || p.suspended || (p.role !== "staff" && p.role !== "admin")) return wrong;
  const sb = await serverClient();
  if (!sb) return { ok: false, message: "Preview mode: connect Supabase first." };
  const { error } = await sb.auth.signInWithPassword({ email: p.email, password: String(password) });
  if (error) return wrong;
  return { ok: true, message: "Signed in." };
}
