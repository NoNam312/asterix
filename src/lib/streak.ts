// Streak status, including the streak freeze (one missed day per week, see
// supabase/013_insights_streak_freeze.sql). Mirrors the rules in claim_daily_bonus.
import { addDays, startOfDay, toDateInput } from "./dates.ts";

export type StreakInfo = {
  current: number;
  best: number;
  todayDone: boolean;
  /** Yesterday was missed, but reaching today's goal lets a freeze cover it. */
  needsFreeze: boolean;
  /** A freeze is available for a day missed today. */
  freezeReady: boolean;
  /** When the next freeze becomes available, if one was used this week. */
  freezeReadyOn: Date | null;
};

const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** A freeze can cover `missed` if none was used in the 7 days up to and including it. */
const canFreeze = (missed: Date, lastFreeze: Date | null) => !lastFreeze || lastFreeze < addDays(missed, -6);

export function streakInfo(
  latest: { day: string; streak: number } | null,
  best: number,
  lastFreezeDay: string | null,
  now = new Date(),
): StreakInfo {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const lastFreeze = lastFreezeDay ? parseDay(lastFreezeDay) : null;
  const day = latest?.day;

  let current = 0;
  let needsFreeze = false;
  if (latest && (day === toDateInput(today) || day === toDateInput(yesterday))) current = latest.streak;
  else if (latest && day === toDateInput(addDays(today, -2)) && canFreeze(yesterday, lastFreeze)) {
    current = latest.streak;
    needsFreeze = true;
  }

  const freezeReady = canFreeze(needsFreeze ? yesterday : today, lastFreeze);
  return {
    current,
    best,
    todayDone: day === toDateInput(today),
    needsFreeze,
    freezeReady,
    freezeReadyOn: !freezeReady && lastFreeze ? addDays(lastFreeze, 7) : null,
  };
}

export function describeStreak(s: StreakInfo) {
  const parts = [`${s.current}-day streak (best: ${s.best})`];
  if (s.needsFreeze) parts.push("You missed yesterday: reach today's goal and a streak freeze keeps your streak going.");
  else if (s.freezeReady) parts.push("Streak freeze ready: one missed day a week won't break your streak.");
  else if (s.freezeReadyOn)
    parts.push(`Streak freeze used this week; ready again ${s.freezeReadyOn.toLocaleDateString([], { weekday: "long" })}.`);
  return parts.join("\n");
}
