// "Books closed up to": once a month is closed, nothing dated on or before that day changes (server only).
import { adminClient } from "../supabase/admin";

export async function booksClosedUpTo(): Promise<string | null> {
  const { data, error } = await adminClient().from("office_settings").select("acct_lock_date").eq("id", 1).maybeSingle();
  if (error || !data?.acct_lock_date) return null;
  return String(data.acct_lock_date).slice(0, 10);
}

export const closedMessage = (lock: string) =>
  `The books are closed up to ${lock}. To change something dated on or before then, the admin can reopen them under Accounting › Chart & settings.`;
