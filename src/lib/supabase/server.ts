import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;

  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        list.forEach(({ name, value, options }) => store.set(name, value, options));
      },
    },
  });
}

// Bypasses RLS. Server-only: webhooks and the public pay page.
export const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createAdmin(url, serviceRoleKey);
};

export async function currentPlatformAdmin() {
  const sb = await supabaseServer();
  if (!sb) return { sb: null, user: null, isAdmin: false };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { sb, user: null, isAdmin: false };
  const { data } = await sb.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return { sb, user, isAdmin: Boolean(data) };
}
