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
