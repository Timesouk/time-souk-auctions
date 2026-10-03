import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IS_PREVIEW, SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

/** Supabase as the signed-in visitor (row security applies), or null in preview mode. */
export async function serverClient(): Promise<SupabaseClient | null> {
  if (IS_PREVIEW) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a server component: the middleware refreshes the session instead.
        }
      }
    }
  });
}
