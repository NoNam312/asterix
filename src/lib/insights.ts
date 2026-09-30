// Insights: weekly XP, hours per subject, completion rate and overruns. Pure functions over
// quests loaded by the Insights page.
import { assessQuest } from "./difficulty.ts";
import { CATEGORIES, isDeadline, type Category, type Quest } from "./quests.ts";
import { subjectOfTitle, type Subject } from "./urgency.ts";

export type InsightQuest = Pick<
  Quest,
  | "id"
  | "title"
  | "category"
  | "start_at"
  | "duration_min"
  | "status"
  | "xp"
  | "difficulty"
  | "calendar_id"
  | "kind"
  | "completed_at"
  | "worked_min"
>;

const DAY = 86_400_000;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const questEnd = (q: InsightQuest) => new Date(q.start_at).getTime() + q.duration_min * 60_000;

/** Minutes a completed quest counts for: time actually worked when timed, else its length. */
export const minutesOf = (q: InsightQuest) => q.worked_min ?? q.duration_min;

/**
 * What a quest was about, for grouping: a subject you take ("Models of Computation"), a study
 * area the scorer recognised ("Computer graphics"), or the category ("Gym").
 */
export function subjectLabel(q: Pick<InsightQuest, "title" | "category">, subjects: Map<string, Subject>) {
  if (q.category !== "study" && q.category !== "other") return CATEGORIES[q.category].label;
  const subject = subjectOfTitle(q.title, subjects);
  if (subject) return subject;
  const area = assessQuest({ title: q.title, category: q.category, durationMin: 60 }).detected.find(
    (d) => d.kind === "subject",
  )?.label;
  return area ?? CATEGORIES[q.category].label;
}

export type DayStat = { date: Date; xp: number; minutes: number };
export type SubjectStat = { name: string; minutes: number; category: Category };
export type Completion = { done: number; failed: number; missed: number; rate: number | null };

export type WeekStats = {
  start: Date;
  days: DayStat[];
  xp: number;
  minutes: number;
  completion: Completion;
  subjects: SubjectStat[];
};

/** Stats for the 7 days from `start` (a Monday). */
export function weekStats(
  quests: InsightQuest[],
  start: Date,
  subjects: Map<string, Subject>,
  now = new Date(),
): WeekStats {
  const from = start.getTime();
  const to = addDays(start, 7).getTime();
  const inWeek = quests.filter((q) => {
    const t = new Date(q.start_at).getTime();
    return t >= from && t < to && !isDeadline(q);
  });

  const days: DayStat[] = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), xp: 0, minutes: 0 }));
  const bySubject = new Map<string, SubjectStat>();
  const completion = { done: 0, failed: 0, missed: 0 };

  for (const q of inWeek) {
    // Round, not floor: a day is 23 or 25 hours long when daylight saving changes.
    const i = Math.round((dayStart(new Date(q.start_at)).getTime() - from) / DAY);
    const day = days[Math.min(6, Math.max(0, i))];
    if (q.status === "completed") {
      day.xp += q.xp;
      day.minutes += minutesOf(q);
      const name = subjectLabel(q, subjects);
      const s = bySubject.get(name) ?? { name, minutes: 0, category: q.category };
      s.minutes += minutesOf(q);
      bySubject.set(name, s);
    }
    // Imported classes are never auto-failed, so they'd skew the rate; count only your own quests.
    if (q.calendar_id) {
      if (q.status === "completed") completion.done++;
      continue;
    }
    if (q.status === "completed") completion.done++;
    else if (q.status === "failed") completion.failed++;
    else if (questEnd(q) < now.getTime()) completion.missed++;
  }

  const attempted = completion.done + completion.failed + completion.missed;
  return {
    start,
    days,
    xp: days.reduce((s, d) => s + d.xp, 0),
    minutes: days.reduce((s, d) => s + d.minutes, 0),
    completion: { ...completion, rate: attempted ? completion.done / attempted : null },
    subjects: [...bySubject.values()].sort((a, b) => b.minutes - a.minutes),
  };
}

/** XP per week for the `count` weeks ending with the week starting `lastStart`. */
export function weeklyXp(quests: InsightQuest[], lastStart: Date, count: number) {
  const weeks = Array.from({ length: count }, (_, i) => ({ start: addDays(lastStart, -7 * (count - 1 - i)), xp: 0 }));
  const first = weeks[0].start.getTime();
  for (const q of quests) {
    if (q.status !== "completed") continue;
    const t = new Date(q.start_at).getTime();
    const i = Math.floor((t - first) / (7 * DAY));
    // Weeks shift by an hour around daylight saving; check the neighbours too.
    for (const j of [i, i - 1, i + 1]) {
      const w = weeks[j];
      if (w && t >= w.start.getTime() && t < addDays(w.start, 7).getTime()) {
        w.xp += q.xp;
        break;
      }
    }
  }
  return weeks;
}

export type Overrun = { name: string; count: number; planned: number; worked: number; ratio: number };

/** How long timed quests really took compared with their time limit, per subject. */
export function overruns(quests: InsightQuest[], subjects: Map<string, Subject>, since: Date): Overrun[] {
  const by = new Map<string, Overrun>();
  for (const q of quests) {
    if (q.status !== "completed" || q.worked_min == null || new Date(q.start_at) < since) continue;
    const name = subjectLabel(q, subjects);
    const o = by.get(name) ?? { name, count: 0, planned: 0, worked: 0, ratio: 1 };
    o.count++;
    o.planned += q.duration_min;
    o.worked += q.worked_min;
    by.set(name, o);
  }
  for (const o of by.values()) o.ratio = o.worked / Math.max(1, o.planned);
  return [...by.values()].sort((a, b) => b.ratio - a.ratio);
}
