import { serverClient } from "./supabase/server";
import { adminClient } from "./supabase/admin";

export type Staff = { id: string; name: string; email: string; role: "staff" | "admin" };

/** The signed-in staff member, or null. */
export async function getStaff(): Promise<Staff | null> {
  const sb = await serverClient();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await adminClient().from("profiles").select("full_name,email,role,suspended").eq("id", user.id).maybeSingle();
  if (!data || data.suspended || (data.role !== "staff" && data.role !== "admin")) return null;
  return { id: user.id, name: data.full_name || data.email, email: data.email, role: data.role };
}

export async function requireStaff(): Promise<Staff> {
  const s = await getStaff();
  if (!s) throw new Error("Staff only. Sign in with a staff account.");
  return s;
}

export async function requireAdmin(): Promise<Staff> {
  const s = await requireStaff();
  if (s.role !== "admin") throw new Error("Only the admin can do this.");
  return s;
}

/** Staff IDs: 3 to 30 lowercase letters or numbers (dots, dashes and underscores allowed). "" if invalid. */
export function normStaffLogin(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(s) ? s : "";
}

/**
 * The sign-in address behind a staff ID. Staff never see it and no email is ever sent to it; it sits on your
 * own domain (e.g. staff.ahmed@timesoukauctions.com) because Supabase accounts need an email address.
 */
export function staffEmail(login: string, siteUrl: string) {
  let host = "timesoukauctions.com";
  try {
    host = new URL(siteUrl).hostname.replace(/^(bid|www)\./, "") || host;
  } catch {
    /* keep the default */
  }
  return `staff.${login}@${host}`;
}
