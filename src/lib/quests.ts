export type Category = "study" | "work" | "gym" | "chores" | "personal" | "other";
export type QuestStatus = "planned" | "active" | "completed" | "failed";

export type Quest = {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  notes: string | null;
  start_at: string;
  duration_min: number;
  status: QuestStatus;
  difficulty: string | null;
  xp: number;
  xp_penalty: number;
  started_at: string | null;
  created_at: string;
  /** Set for events imported from a subscribed calendar layer. */
  calendar_id?: string | null;
  external_uid?: string | null;
  series_key?: string | null;
  /** "deadline" = a due-date marker from a calendar (no XP), otherwise a normal quest. */
  kind?: "task" | "deadline";
  all_day?: boolean;
  /** When it was marked complete (from 013_insights_streak_freeze.sql). */
  completed_at?: string | null;
  /** Minutes actually worked, for quests completed with the timer running. */
  worked_min?: number | null;
  /** The repeating quest (quest_series) this was created from, if any. */
  recurrence_id?: string | null;
};

/** A subscribed calendar feed shown as its own layer. */
export type CalendarLayer = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

/** Layer colours: warm tones, so classes stand apart from the cool quest categories. */
export const LAYER_COLORS = ["#c27c0e", "#d9467a", "#ea580c", "#16a34a", "#5b5bd6", "#475569"];

export const isDeadline = (q: Pick<Quest, "kind">) => q.kind === "deadline";

/** The date a deadline falls on, as local midnight. All-day dates are stored as UTC midnight. */
export function dueDay(q: Pick<Quest, "start_at" | "all_day">) {
  const d = new Date(q.start_at);
  return q.all_day
    ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** When a deadline is actually due: its time, or the end of the day for all-day ones. */
export function dueAt(q: Pick<Quest, "start_at" | "all_day">) {
  if (!q.all_day) return new Date(q.start_at);
  const d = dueDay(q);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
}

/** Subject code in a title, e.g. "COMP30019" from Canvas's "[COMP30019_2026_SM2]" tag or "MAST20009 Lecture". */
export function courseCode(title: string) {
  return title.match(/(?<![A-Za-z])([A-Z]{4}\d{5})(?!\d)/)?.[1] ?? null;
}

/** Title without Canvas's "[COMP30019_2026_SM2]" tag, led by the subject code: "COMP30019 · Project 2". */
export function shortTitle(title: string) {
  const tag = title.match(/\s*\[([A-Z]{2,5}\d{3,5})[^\]]*\]\s*/);
  if (!tag) return title;
  // Canvas titles often repeat the due week: "Project 2 (Milestone 1) - due Week 10".
  const rest = title.replace(tag[0], " ").replace(/\s+[-–]\s+due\b.*$/i, "").trim();
  return `${tag[1]} · ${rest}`;
}

export type Profile = {
  username: string;
  total_xp: number;
  daily_xp_goal: number;
  blocked_sites?: string[];
  /** End of an emergency unlock bought in the extension. */
  unlocked_until?: string | null;
  /** When apps are locked (see supabase/011_lock_modes.sql). */
  lock_mode?: LockMode;
  /** Quest categories that lock apps (see supabase/012_lock_categories.sql). */
  lock_categories?: Category[];
};

export type LockMode = "during_quests" | "until_done" | "all_day";

/** Cool-toned palette so categories stay distinguishable on a gray/white UI. */
export const CATEGORIES: Record<Category, { label: string; color: string; soft: string }> = {
  study: { label: "Study", color: "#3b6fd8", soft: "color-mix(in srgb, #3b6fd8 14%, var(--color-canvas))" },
  work: { label: "Work", color: "#b5651d", soft: "color-mix(in srgb, #b5651d 14%, var(--color-canvas))" },
  gym: { label: "Gym", color: "#0f9f8f", soft: "color-mix(in srgb, #0f9f8f 14%, var(--color-canvas))" },
  chores: { label: "Chores", color: "#7c5cd6", soft: "color-mix(in srgb, #7c5cd6 14%, var(--color-canvas))" },
  personal: { label: "Personal", color: "#0e87b5", soft: "color-mix(in srgb, #0e87b5 14%, var(--color-canvas))" },
  other: { label: "Other", color: "#64748b", soft: "color-mix(in srgb, #64748b 14%, var(--color-canvas))" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function questEnd(q: Pick<Quest, "start_at" | "duration_min">) {
  return new Date(new Date(q.start_at).getTime() + q.duration_min * 60_000);
}
