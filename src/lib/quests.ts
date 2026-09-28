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
  created_at: string;
};

export type Profile = {
  username: string;
  total_xp: number;
  daily_xp_goal: number;
};

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
