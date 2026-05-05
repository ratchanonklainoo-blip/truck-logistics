import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieOption = { name: string; value: string; options: Record<string, unknown> };

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieOption[]) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookiesToSet.forEach(({ name, value, options }) => (cookieStore as any).set(name, value, options));
          } catch {
            // Server Component — ignore
          }
        },
      },
    },
  );
}
