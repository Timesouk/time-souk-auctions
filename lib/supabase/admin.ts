import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../env";

let admin: SupabaseClient | null = null;

/** Full-access Supabase client for server code only (webhooks, payments, scheduled jobs, staff actions). */
export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("Supabase is not configured (SUPABASE_SERVICE_ROLE_KEY missing).");
  if (!admin) admin = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
