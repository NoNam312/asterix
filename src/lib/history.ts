// Loads your full history for Insights and achievements (browser only).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InsightQuest } from "./insights";
import { buildSubjectIndex, type Subject } from "./urgency";

export type History = {
  quests: InsightQuest[];
  bonuses: { day: string; streak: number; xp: number }[];
  freezes: { day: string }[];
  subjects: Map<string, Subject>;
  /** False until supabase/013_insights_streak_freeze.sql has been run. */
  tracksTime: boolean;
};

const PAGE = 1000; // Supabase returns at most 1000 rows per request

/** Every quest up to `until`, oldest first. `select("*")` so it works before 013 is run. */
async function allQuests(supabase: SupabaseClient, until: Date) {
  const rows: InsightQuest[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .lt("start_at", until.toISOString())
      .order("start_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as InsightQuest[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function loadHistory(supabase: SupabaseClient, until: Date): Promise<History> {
  const [quests, bonuses, freezes, series] = await Promise.all([
    allQuests(supabase, until),
    supabase.from("daily_bonuses").select("day, streak, xp").order("day"),
    supabase.from("streak_freezes").select("day").order("day"),
    supabase.from("calendar_series").select("title"),
  ]);
  const titles = [
    ...((series.data ?? []) as { title: string }[]).map((r) => r.title),
    ...quests.filter((q) => q.calendar_id).map((q) => q.title),
  ];
  return {
    quests: quests.filter((q) => q.kind !== "deadline"),
    bonuses: (bonuses.data ?? []) as History["bonuses"],
    freezes: freezes.error ? [] : ((freezes.data ?? []) as History["freezes"]),
    subjects: buildSubjectIndex(titles),
    tracksTime: !freezes.error,
  };
}
