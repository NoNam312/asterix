// Server-only: the "am I locked?" check behind the iPhone Shortcuts lock.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export type LockStatus = {
  goal: number;
  earned: number;
  quests_left: number;
  unlocked: boolean;
  unlocked_until: string | null;
};

/** Start and end of "today" in the given timezone, as UTC instants. */
function todayIn(timeZone: string) {
  let tz = "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    tz = timeZone;
  } catch {
    // fall back to UTC
  }
  const now = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, Number(x.value)]),
  );
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(now.getTime() / 1000) * 1000;
  const start = Date.UTC(p.year, p.month - 1, p.day) - offset;
  return { start: new Date(start), end: new Date(start + 86_400_000) };
}

/** null when the token is unknown. */
export async function getLockStatus(token: string, timeZone: string): Promise<LockStatus | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { start, end } = todayIn(timeZone);
  const { data, error } = await supabase.rpc("lock_status", {
    p_token: token,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
  if (error || !data) return null;
  return data as LockStatus;
}
