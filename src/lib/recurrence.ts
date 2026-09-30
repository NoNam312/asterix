// Recurring quests (supabase/014_recurring_quests.sql): the rules and the dates they fall on.
// Pure functions, so they can be tested directly in Node.
import type { Category } from "./quests.ts";

/** Days of the week, 0 = Sunday … 6 = Saturday (like Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type QuestSeries = {
  id: string;
  title: string;
  category: Category;
  notes: string | null;
  /** Local start time, "18:30". */
  start_time: string;
  duration_min: number;
  weekdays: Weekday[];
  /** First day it can happen, "2026-10-01". */
  starts_on: string;
  /** Quests have been created up to this day. */
  generated_until: string | null;
  /** Last day it repeats; null = keeps going. */
  ends_on: string | null;
};

/** How far ahead repeats are created. */
export const HORIZON_DAYS = 28;

export const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
/** Monday-first order for pickers. */
export const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const same = (a: Weekday[], b: Weekday[]) => a.length === b.length && b.every((d) => a.includes(d));

export function repeatPreset(days: Weekday[] | null): "none" | "daily" | "weekdays" | "custom" {
  if (!days?.length) return "none";
  if (same(days, EVERY_DAY)) return "daily";
  if (same(days, WEEKDAYS)) return "weekdays";
  return "custom";
}

/** "Every day", "Weekdays", "Every Monday", "Mon, Wed, Fri". */
export function describeRepeat(days: Weekday[]) {
  const preset = repeatPreset(days);
  if (preset === "daily") return "Every day";
  if (preset === "weekdays") return "Every weekday";
  const names = WEEK_ORDER.filter((d) => days.includes(d)).map((d) =>
    new Date(2026, 0, 4 + d).toLocaleDateString("en-AU", { weekday: days.length === 1 ? "long" : "short" }),
  );
  if (same(days, [0, 6])) return "Weekends";
  return days.length === 1 ? `Every ${names[0]}` : names.join(", ");
}

export const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const formatDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Start times of a series' quests on local days in [from, to). */
export function occurrences(series: Pick<QuestSeries, "weekdays" | "start_time">, from: Date, to: Date) {
  const [h, m] = series.start_time.split(":").map(Number);
  const out: Date[] = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d < to; d = addDays(d, 1)) {
    // Set the clock time directly so daylight-saving days keep the right time.
    if (series.weekdays.includes(d.getDay() as Weekday)) out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m));
  }
  return out;
}

/**
 * Which days to create quests for now: after what's already been made (never in the past,
 * so time away doesn't pile up missed quests), up to the horizon.
 */
export function pendingRange(
  series: Pick<QuestSeries, "starts_on" | "generated_until" | "ends_on">,
  now = new Date(),
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const after = series.generated_until ? addDays(parseDay(series.generated_until), 1) : parseDay(series.starts_on);
  const from = new Date(Math.max(after.getTime(), parseDay(series.starts_on).getTime(), today.getTime()));
  let to = addDays(today, HORIZON_DAYS + 1);
  if (series.ends_on) to = new Date(Math.min(to.getTime(), addDays(parseDay(series.ends_on), 1).getTime()));
  return from < to ? { from, to, until: formatDay(addDays(to, -1)) } : null;
}
