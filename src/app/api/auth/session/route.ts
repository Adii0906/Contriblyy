import { createSupabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth/session";
import { json } from "@/lib/server/http";

/** Who is signed in. Never returns tokens. */
export async function GET() {
  const supabase = await createSupabaseServer();
  if (!supabase) return json({ configured: false, user: null });
  const user = await currentUser(supabase);
  return json({ configured: true, user });
}
