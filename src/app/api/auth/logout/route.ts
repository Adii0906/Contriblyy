import { createSupabaseServer } from "@/lib/supabase/server";
import { fail, json, sameOrigin } from "@/lib/server/http";

/** Ends this browser's session and clears the auth cookies. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const supabase = await createSupabaseServer();
  if (!supabase) return json({ status: "signed-out" });
  await supabase.auth.signOut({ scope: "local" });
  return json({ status: "signed-out" });
}
