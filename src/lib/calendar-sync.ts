// Server-only: brings a calendar layer's quests in line with its feed.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assessQuest } from "@/lib/difficulty";
import { fetchFeed, FeedError, parseFeed, type FeedEvent } from "@/lib/calendar-feed";

export type SyncResult = { added: number; updated: number; removed: number };

/** A usable IANA timezone from the browser, or UTC. */
export function safeTimeZone(tz: unknown) {
  if (typeof tz !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Location, then (for due dates) the details and link from the calendar, e.g. a Canvas assignment. */
function eventNotes(e: FeedEvent) {
  const parts = [
    e.location && `📍 ${e.location}`,
    e.isDeadline && e.description,
    e.isDeadline && e.url && `🔗 ${e.url}`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n").slice(0, 2000) : null;
}

function toQuestRow(e: FeedEvent, calendarId: string) {
  const minutes = Math.min(1440, Math.max(5, Math.round((e.end.getTime() - e.start.getTime()) / 60_000)));
  const base = {
    calendar_id: calendarId,
    external_uid: e.uid,
    series_key: e.seriesKey,
    title: e.title.slice(0, 200),
    notes: eventNotes(e),
    category: "study" as const,
    start_at: e.start.toISOString(),
    all_day: e.allDay,
  };
  if (e.isDeadline) return { ...base, kind: "deadline", duration_min: 5, difficulty: null, xp: 0 };
  const { rank, xp } = assessQuest({ title: e.title, category: "study", durationMin: minutes });
  return { ...base, kind: "task", duration_min: minutes, difficulty: rank, xp };
}

type ExistingQuest = {
  id: string;
  external_uid: string;
  status: string;
  title: string;
  start_at: string;
  duration_min: number;
  notes: string | null;
};

export async function syncCalendar(supabase: SupabaseClient, calendarId: string, tz: string): Promise<SyncResult> {
  const { data: cal } = await supabase.from("calendars").select("id, url").eq("id", calendarId).single();
  if (!cal) throw new FeedError("Calendar not found.");

  try {
    const { events } = parseFeed(await fetchFeed(cal.url), tz);

    // Which series the user keeps. Series that appear later in the feed are kept by default.
    const { data: seriesRows } = await supabase
      .from("calendar_series")
      .select("series_key, kept")
      .eq("calendar_id", calendarId);
    const kept = new Map((seriesRows ?? []).map((r) => [r.series_key as string, r.kept as boolean]));
    const newSeries = new Map<string, string>();
    for (const e of events) if (!kept.has(e.seriesKey) && !newSeries.has(e.seriesKey)) newSeries.set(e.seriesKey, e.title);
    if (newSeries.size) {
      await supabase.from("calendar_series").insert(
        [...newSeries].map(([series_key, title]) => ({ calendar_id: calendarId, series_key, title: title.slice(0, 200), kept: true })),
      );
    }
    const wanted = events.filter((e) => kept.get(e.seriesKey) ?? true);

    const { data: existingRows } = await supabase
      .from("quests")
      .select("id, external_uid, status, title, start_at, duration_min, notes")
      .eq("calendar_id", calendarId);
    const existing = new Map(((existingRows ?? []) as ExistingQuest[]).map((q) => [q.external_uid, q]));

    const inserts = [];
    const updates = [];
    for (const e of wanted) {
      const row = toQuestRow(e, calendarId);
      const old = existing.get(e.uid);
      if (!old) inserts.push(row);
      else if (
        old.status === "planned" &&
        (old.title !== row.title ||
          new Date(old.start_at).getTime() !== e.start.getTime() ||
          old.duration_min !== row.duration_min ||
          old.notes !== row.notes)
      ) {
        updates.push({ id: old.id, row });
      }
    }

    // Remove planned events that left the feed or belong to series the user dropped.
    // Anything already started, completed or failed stays as history.
    const wantedUids = new Set(wanted.map((e) => e.uid));
    const cutoff = Date.now() - 86_400_000;
    const removals = [...existing.values()]
      .filter((q) => q.status === "planned" && !wantedUids.has(q.external_uid) && new Date(q.start_at).getTime() >= cutoff)
      .map((q) => q.id);

    for (let i = 0; i < inserts.length; i += 200) {
      const { error } = await supabase.from("quests").insert(inserts.slice(i, i + 200));
      if (error) throw new FeedError(error.message);
    }
    for (let i = 0; i < updates.length; i += 20) {
      await Promise.all(updates.slice(i, i + 20).map((u) => supabase.from("quests").update(u.row).eq("id", u.id)));
    }
    for (let i = 0; i < removals.length; i += 200) {
      await supabase.from("quests").delete().in("id", removals.slice(i, i + 200));
    }

    await supabase
      .from("calendars")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", calendarId);
    return { added: inserts.length, updated: updates.length, removed: removals.length };
  } catch (err) {
    const message = err instanceof FeedError ? err.message : "Sync failed. Try again later.";
    await supabase.from("calendars").update({ last_error: message }).eq("id", calendarId);
    throw new FeedError(message);
  }
}
