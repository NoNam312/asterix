// Achievements, worked out from your history (quests, goal days, streak freezes), so nothing
// extra is stored and badges you had already earned unlock straight away.
import type { Rank } from "./difficulty.ts";
import { minutesOf, subjectLabel, type InsightQuest } from "./insights.ts";
import { levelInfo, xpForLevel } from "./levels.ts";
import type { Subject } from "./urgency.ts";

export type AchievementGroup = "streak" | "goal" | "quests" | "rank" | "hours" | "level" | "special";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
  /** How hard it is to get, shown in the rank colours. */
  tier: Rank;
  unlocked: boolean;
  /** When it was earned, if that can be told from the history. */
  unlockedAt: Date | null;
  progress: { value: number; target: number };
};

export type AchievementInput = {
  quests: InsightQuest[];
  bonuses: { day: string; streak: number; xp: number }[];
  freezes: { day: string }[];
  /** Bosses beaten; optional so older callers keep working. */
  bosses?: { defeated_at: string }[];
  totalXp: number;
  subjects: Map<string, Subject>;
};

const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const doneAt = (q: InsightQuest) =>
  q.completed_at ? new Date(q.completed_at) : new Date(new Date(q.start_at).getTime() + q.duration_min * 60_000);
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

type Def = Omit<Achievement, "unlocked" | "unlockedAt" | "progress"> & {
  /** Progress value, and when the target was reached (if known). */
  measure: (target: number) => { value: number; at: Date | null };
  target: number;
};

/** The date the running total of `events` first reached `target`. */
function reachedAt(events: { at: Date; amount: number }[], target: number) {
  let sum = 0;
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    sum += e.amount;
    if (sum >= target) return { value: sum, at: e.at };
  }
  return { value: sum, at: null };
}

export function computeAchievements(input: AchievementInput): Achievement[] {
  const quests = input.quests.filter((q) => q.kind !== "deadline");
  const done = quests.filter((q) => q.status === "completed");
  const bonuses = [...input.bonuses].sort((a, b) => a.day.localeCompare(b.day));

  const count = (list: InsightQuest[]) => (target: number) =>
    reachedAt(list.map((q) => ({ at: doneAt(q), amount: 1 })), target);
  const firstWhere = (pred: (q: InsightQuest) => boolean) => () => {
    const hit = done.filter(pred).sort((a, b) => doneAt(a).getTime() - doneAt(b).getTime())[0];
    return { value: hit ? 1 : 0, at: hit ? doneAt(hit) : null };
  };
  const studyMinutes = done
    .filter((q) => q.category === "study")
    .map((q) => ({ at: doneAt(q), amount: minutesOf(q) }));
  const hours = (target: number) => {
    const r = reachedAt(studyMinutes, target * 60);
    return { value: Math.floor(r.value / 60), at: r.at };
  };
  const streak = (target: number) => {
    const hit = bonuses.find((b) => b.streak >= target);
    return { value: Math.max(0, ...bonuses.map((b) => b.streak)), at: hit ? parseDay(hit.day) : null };
  };
  const goalDays = (target: number) => reachedAt(bonuses.map((b) => ({ at: parseDay(b.day), amount: 1 })), target);
  // XP over time is approximate (penalties aren't dated), so the level itself comes from total XP.
  const xpEvents = [
    ...done.map((q) => ({ at: doneAt(q), amount: q.xp })),
    ...bonuses.map((b) => ({ at: parseDay(b.day), amount: b.xp })),
  ];
  const level = (target: number) => {
    const current = levelInfo(input.totalXp).level;
    const r = reachedAt(xpEvents, xpForLevel(target));
    return { value: current, at: current >= target ? r.at : null };
  };

  // Days where you planned at least 3 of your own quests and finished every one.
  const flawless = () => {
    const days = new Map<string, InsightQuest[]>();
    for (const q of quests) {
      if (q.calendar_id) continue;
      const k = dayKey(new Date(q.start_at));
      days.set(k, [...(days.get(k) ?? []), q]);
    }
    const perfect = [...days.values()]
      .filter((qs) => qs.length >= 3 && qs.every((q) => q.status === "completed"))
      .map((qs) => Math.max(...qs.map((q) => doneAt(q).getTime())))
      .sort((a, b) => a - b);
    return { value: perfect.length ? 1 : 0, at: perfect.length ? new Date(perfect[0]) : null };
  };

  const weekend = () => {
    const days = new Set(bonuses.map((b) => b.day));
    for (const b of bonuses) {
      const d = parseDay(b.day);
      if (d.getDay() !== 0) continue; // a Sunday, with the Saturday before it
      const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
      const satKey = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, "0")}-${String(sat.getDate()).padStart(2, "0")}`;
      if (days.has(satKey)) return { value: 1, at: d };
    }
    return { value: 0, at: null };
  };

  const specialist = (target: number) => {
    const by = new Map<string, { at: Date; amount: number }[]>();
    for (const q of done) {
      if (q.category !== "study") continue;
      const name = subjectLabel(q, input.subjects);
      by.set(name, [...(by.get(name) ?? []), { at: doneAt(q), amount: minutesOf(q) }]);
    }
    let best = { value: 0, at: null as Date | null };
    for (const events of by.values()) {
      const r = reachedAt(events, target * 60);
      const value = Math.floor(r.value / 60);
      if (r.at && (!best.at || r.at < best.at)) best = { value, at: r.at };
      else if (!best.at && value > best.value) best = { value, at: null };
    }
    return best;
  };

  const freeze = () => {
    const first = [...input.freezes].sort((a, b) => a.day.localeCompare(b.day))[0];
    return { value: first ? 1 : 0, at: first ? parseDay(first.day) : null };
  };

  const bossKills = (target: number) =>
    reachedAt((input.bosses ?? []).map((b) => ({ at: new Date(b.defeated_at), amount: 1 })), target);

  const startsAt = (q: InsightQuest) => new Date(q.start_at);
  const defs: Def[] = [
    { id: "first-quest", group: "quests", tier: "E", title: "First steps", description: "Complete your first quest", target: 1, measure: count(done) },
    { id: "quests-10", group: "quests", tier: "D", title: "Adventurer", description: "Complete 10 quests", target: 10, measure: count(done) },
    { id: "quests-50", group: "quests", tier: "C", title: "Veteran", description: "Complete 50 quests", target: 50, measure: count(done) },
    { id: "quests-100", group: "quests", tier: "B", title: "Centurion", description: "Complete 100 quests", target: 100, measure: count(done) },
    { id: "quests-500", group: "quests", tier: "S", title: "Legend", description: "Complete 500 quests", target: 500, measure: count(done) },

    { id: "goal-1", group: "goal", tier: "E", title: "Goal getter", description: "Reach your daily XP goal", target: 1, measure: goalDays },
    { id: "goal-10", group: "goal", tier: "C", title: "Dependable", description: "Reach your daily goal on 10 days", target: 10, measure: goalDays },
    { id: "goal-50", group: "goal", tier: "A", title: "Machine", description: "Reach your daily goal on 50 days", target: 50, measure: goalDays },

    { id: "streak-3", group: "streak", tier: "D", title: "On a roll", description: "3-day streak", target: 3, measure: streak },
    { id: "streak-7", group: "streak", tier: "C", title: "Week warrior", description: "7-day streak", target: 7, measure: streak },
    { id: "streak-14", group: "streak", tier: "B", title: "Fortnight of focus", description: "14-day streak", target: 14, measure: streak },
    { id: "streak-30", group: "streak", tier: "A", title: "Unbreakable", description: "30-day streak", target: 30, measure: streak },
    { id: "streak-100", group: "streak", tier: "S", title: "Eternal flame", description: "100-day streak", target: 100, measure: streak },

    { id: "hours-10", group: "hours", tier: "D", title: "Getting started", description: "10 hours studied", target: 10, measure: hours },
    { id: "hours-50", group: "hours", tier: "C", title: "Scholar", description: "50 hours studied", target: 50, measure: hours },
    { id: "hours-100", group: "hours", tier: "B", title: "Hundred hours", description: "100 hours studied", target: 100, measure: hours },
    { id: "hours-250", group: "hours", tier: "A", title: "Sage", description: "250 hours studied", target: 250, measure: hours },
    { id: "specialist-20", group: "hours", tier: "B", title: "Specialist", description: "20 hours on one subject", target: 20, measure: specialist },

    { id: "rank-a", group: "rank", tier: "A", title: "Ace", description: "Complete an A-rank quest", target: 1, measure: firstWhere((q) => q.difficulty === "A" || q.difficulty === "S") },
    { id: "rank-s", group: "rank", tier: "S", title: "S-rank slayer", description: "Complete your first S-rank quest", target: 1, measure: firstWhere((q) => q.difficulty === "S") },

    { id: "level-5", group: "level", tier: "C", title: "Level 5", description: "Reach level 5", target: 5, measure: level },
    { id: "level-10", group: "level", tier: "A", title: "Level 10", description: "Reach level 10", target: 10, measure: level },
    { id: "level-20", group: "level", tier: "S", title: "Level 20", description: "Reach level 20", target: 20, measure: level },

    { id: "boss-1", group: "special", tier: "B", title: "Giant slayer", description: "Beat a boss before its due date", target: 1, measure: bossKills },
    { id: "boss-5", group: "special", tier: "A", title: "Boss hunter", description: "Beat 5 bosses", target: 5, measure: bossKills },

    { id: "early-bird", group: "special", tier: "C", title: "Early bird", description: "Complete a quest that starts before 7 am", target: 1, measure: firstWhere((q) => startsAt(q).getHours() < 7) },
    { id: "night-owl", group: "special", tier: "D", title: "Night owl", description: "Complete a quest that starts at 10 pm or later", target: 1, measure: firstWhere((q) => startsAt(q).getHours() >= 22) },
    { id: "marathon", group: "special", tier: "B", title: "Marathon", description: "Complete a single quest of 3 hours or more", target: 1, measure: firstWhere((q) => minutesOf(q) >= 180) },
    { id: "gym-10", group: "special", tier: "C", title: "Gym regular", description: "Complete 10 gym quests", target: 10, measure: count(done.filter((q) => q.category === "gym")) },
    { id: "flawless", group: "special", tier: "B", title: "Flawless day", description: "Finish every quest on a day with 3 or more", target: 1, measure: flawless },
    { id: "weekend", group: "special", tier: "B", title: "Weekend warrior", description: "Reach your goal on a Saturday and the Sunday after", target: 1, measure: weekend },
    { id: "freeze", group: "special", tier: "D", title: "Saved by the freeze", description: "A streak freeze covers a missed day", target: 1, measure: freeze },
  ];

  return defs.map(({ measure, target, ...def }) => {
    const { value, at } = measure(target);
    const unlocked = value >= target;
    return {
      ...def,
      unlocked,
      unlockedAt: unlocked ? at : null,
      progress: { value: Math.min(value, target), target },
    };
  });
}
