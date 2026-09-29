export type Category = "study" | "gym" | "chores" | "personal" | "other";
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

export type Profile = {
  username: string;
  total_xp: number;
  daily_xp_goal: number;
  blocked_sites?: string[];
  /** End of an emergency unlock bought in the extension. */
  unlocked_until?: string | null;
  /** When apps are locked (see supabase/011_lock_modes.sql). */
  lock_mode?: LockMode;
};

export type LockMode = "during_quests" | "until_done" | "all_day";

/** Cool-toned palette so categories stay distinguishable on a gray/white UI. */
export const CATEGORIES: Record<Category, { label: string; color: string; soft: string }> = {
  study: { label: "Study", color: "#3b6fd8", soft: "#e8effc" },
  gym: { label: "Gym", color: "#0f9f8f", soft: "#e0f5f2" },
  chores: { label: "Chores", color: "#7c5cd6", soft: "#efeafb" },
  personal: { label: "Personal", color: "#0e87b5", soft: "#e2f2f9" },
  other: { label: "Other", color: "#64748b", soft: "#eef1f5" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function questEnd(q: Pick<Quest, "start_at" | "duration_min">) {
  return new Date(new Date(q.start_at).getTime() + q.duration_min * 60_000);
}
