// Saving recurring quests and creating their quests (browser only). Every change returns an
// undo function for the planner's Undo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assessQuest } from "./difficulty";
import type { Category, Quest } from "./quests";
import { formatDay, occurrences, parseDay, pendingRange, type QuestSeries, type Weekday } from "./recurrence";

type Undo = () => Promise<unknown>;
export type Scope = "this" | "future";

/** What the quest window hands over when repeating is set up or changed. */
export type RepeatDraft = {
  title: string;
  category: Category;
  notes: string;
  date: string; // "2026-10-01"
  time: string; // "18:30"
  duration: number;
  weekdays: Weekday[];
};

function questRow(s: QuestSeries, start: Date) {
  const { rank, xp } = assessQuest({ title: s.title, notes: s.notes, category: s.category, durationMin: s.duration_min });
  return {
    title: s.title,
    category: s.category,
    notes: s.notes,
    start_at: start.toISOString(),
    duration_min: s.duration_min,
    difficulty: rank,
    xp,
    recurrence_id: s.id,
  };
}

/** Every series; `ready` is false until 014_recurring_quests.sql has been run. */
export async function loadSeries(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("quest_series").select("*");
  return { series: (data ?? []) as QuestSeries[], ready: !error };
}

/** Creates the quests each series still needs, up to a few weeks ahead. Returns how many. */
export async function extendSeries(supabase: SupabaseClient, list: QuestSeries[], now = new Date()) {
  let added = 0;
  for (const s of list) {
    const range = pendingRange(s, now);
    if (!range) continue;
    const rows = occurrences(s, range.from, range.to)
      // Nothing that's already over (e.g. "every day at 7am" set up at 8pm).
      .filter((start) => start.getTime() + s.duration_min * 60_000 > now.getTime())
      .map((start) => questRow(s, start));
    if (rows.length) {
      const { error } = await supabase
        .from("quests")
        .upsert(rows, { onConflict: "recurrence_id,start_at", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    await supabase.from("quest_series").update({ generated_until: range.until }).eq("id", s.id);
    added += rows.length;
  }
  return added;
}

const seriesFields = (d: RepeatDraft) => ({
  title: d.title,
  category: d.category,
  notes: d.notes.trim() || null,
  start_time: d.time,
  duration_min: d.duration,
  weekdays: d.weekdays,
});

/**
 * Starts repeating. For a new quest the first one is on the chosen date (if it's one of the
 * days) or the next matching day; an existing quest becomes the first of the series.
 */
export async function startSeries(
  supabase: SupabaseClient,
  d: RepeatDraft,
  existingQuestId?: string,
): Promise<{ error?: string; undo?: Undo }> {
  const { data, error } = await supabase
    .from("quest_series")
    .insert({ ...seriesFields(d), starts_on: d.date, generated_until: existingQuestId ? d.date : null })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the repeat." };
  const series = data as QuestSeries;
  if (existingQuestId) await supabase.from("quests").update({ recurrence_id: series.id }).eq("id", existingQuestId);
  try {
    await extendSeries(supabase, [series]);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return {
    undo: async () => {
      let del = supabase.from("quests").delete().eq("recurrence_id", series.id).eq("status", "planned");
      if (existingQuestId) del = del.neq("id", existingQuestId);
      await del;
      if (existingQuestId) await supabase.from("quests").update({ recurrence_id: null }).eq("id", existingQuestId);
      await supabase.from("quest_series").delete().eq("id", series.id);
    },
  };
}

/** Copies the series and its upcoming planned quests, and returns a function that puts them back. */
async function snapshot(supabase: SupabaseClient, seriesId: string, fromIso: string, inclusive: boolean): Promise<Undo> {
  const [{ data: series }, { data: rows }] = await Promise.all([
    supabase.from("quest_series").select("*").eq("id", seriesId).single(),
    (inclusive
      ? supabase.from("quests").select("*").gte("start_at", fromIso)
      : supabase.from("quests").select("*").gt("start_at", fromIso)
    )
      .eq("recurrence_id", seriesId)
      .eq("status", "planned"),
  ]);
  return async () => {
    if (series) {
      const { id, ...fields } = series as QuestSeries & { user_id: string; created_at: string };
      await supabase.from("quest_series").update(fields).eq("id", id);
    }
    const del = supabase.from("quests").delete().eq("recurrence_id", seriesId).eq("status", "planned");
    await (inclusive ? del.gte("start_at", fromIso) : del.gt("start_at", fromIso));
    if (rows?.length) await supabase.from("quests").insert(rows as Quest[]);
  };
}

/**
 * "All upcoming": applies the edit to the series and rebuilds the quests after this one.
 * `weekdays: null` stops repeating after this quest.
 */
export async function changeUpcoming(
  supabase: SupabaseClient,
  series: QuestSeries,
  quest: Pick<Quest, "start_at">,
  d: Omit<RepeatDraft, "weekdays"> & { weekdays: Weekday[] | null },
): Promise<{ error?: string; undo?: Undo }> {
  const undo = await snapshot(supabase, series.id, quest.start_at, false);
  await supabase
    .from("quests")
    .delete()
    .eq("recurrence_id", series.id)
    .eq("status", "planned")
    .gt("start_at", quest.start_at);
  if (!d.weekdays) {
    const { error } = await supabase.from("quest_series").update({ ends_on: d.date }).eq("id", series.id);
    return error ? { error: error.message } : { undo };
  }
  const { data, error } = await supabase
    .from("quest_series")
    .update({ ...seriesFields({ ...d, weekdays: d.weekdays }), ends_on: null, generated_until: d.date })
    .eq("id", series.id)
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't update the repeat." };
  try {
    await extendSeries(supabase, [data as QuestSeries]);
  } catch (e) {
    return { error: (e as Error).message, undo };
  }
  return { undo };
}

/** Stops repeating: removes the upcoming planned quests from this one (or after it) on. */
export async function endSeries(
  supabase: SupabaseClient,
  series: QuestSeries,
  quest: Pick<Quest, "start_at">,
  includeThis: boolean,
): Promise<{ error?: string; undo?: Undo }> {
  const undo = await snapshot(supabase, series.id, quest.start_at, includeThis);
  const del = supabase.from("quests").delete().eq("recurrence_id", series.id).eq("status", "planned");
  const { error } = await (includeThis ? del.gte("start_at", quest.start_at) : del.gt("start_at", quest.start_at));
  if (error) return { error: error.message };
  const day = new Date(quest.start_at);
  const last = includeThis ? new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1) : day;
  // Ending before it started means nothing is left to repeat.
  const endsOn = last < parseDay(series.starts_on) ? series.starts_on : formatDay(last);
  await supabase.from("quest_series").update({ ends_on: endsOn }).eq("id", series.id);
  return { undo };
}
