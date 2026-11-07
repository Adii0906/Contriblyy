import { createSupabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth/session";
import { json } from "@/lib/server/http";
import { clientKey } from "@/lib/server/rate-limit";

/** Who is signed in. Never returns tokens. */
export async function GET(req: Request) {
  const supabase = await createSupabaseServer(clientKey(req));
  if (!supabase) return json({ configured: false, user: null });
  const user = await currentUser(supabase);
  return json({ configured: true, user });
}
