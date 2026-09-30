// "Plan my week": fits study blocks for upcoming deadlines into free time around classes and
// existing quests. Pure functions (no app imports), so they can be tested directly in Node.

export type TargetKind = "exam" | "assignment" | "quiz" | "other";

export type Target = {
  /** Stable id: the deadline quest's id, or a generated id for a target the user typed. */
  key: string;
  title: string;
  due: Date;
  kind: TargetKind;
  /** Study time still needed, in minutes. */
  minutes: number;
};

export type Busy = { start: number; end: number };

export type PlanPrefs = {
  /** Study window each day, in minutes after midnight (e.g. 9:00 = 540). */
  dayStart: number;
  dayEnd: number;
  /** Most study planned per day, in minutes. */
  maxPerDay: number;
  /** Preferred length of one block, in minutes. */
  blockMinutes: number;
  weekends: boolean;
  /** How many days ahead to plan (starting today). */
  days: number;
};

export type PlannedBlock = { targetKey: string; start: Date; minutes: number };
export type Shortfall = { targetKey: string; missingMinutes: number };

export const DEFAULT_PREFS: PlanPrefs = {
  dayStart: 9 * 60,
  dayEnd: 22 * 60,
  maxPerDay: 4 * 60,
  blockMinutes: 90,
  weekends: true,
  days: 7,
};

const MIN_BLOCK = 30; // never suggest blocks shorter than this
const GAP = 10; // breathing room around classes and other quests
const MIN = 60_000;

/** Guess what kind of deadline a title is, and how much prep it usually needs. */
export function classifyTarget(title: string): { kind: TargetKind; minutes: number } {
  const t = title.toLowerCase();
  if (/\b(exam|final|midterm|mid-sem|midsem|sac|trial|test)\b/.test(t)) return { kind: "exam", minutes: 8 * 60 };
  if (/\b(quiz|mcq)\b/.test(t)) return { kind: "quiz", minutes: 2 * 60 };
  if (/\b(assignment|ass|project|essay|report|lab|coursework|submission|presentation|proposal)\b/.test(t)) {
    return { kind: "assignment", minutes: 6 * 60 };
  }
  return { kind: "other", minutes: 3 * 60 };
}

/**
 * Title for a suggested block, worded so the quest scorer recognises the subject and work type:
 * "Models of Computation · Assignment 2: assignment work".
 */
export function blockTitle(target: Pick<Target, "title" | "kind">, subject?: string | null) {
  const bare = target.title
    .replace(/\s*\[[^\]]*\]\s*/g, " ") // drop "[COMP30026_2026_SM2]"
    .replace(/\s+[-–]\s+due\b.*$/i, "") // drop "- due Week 10"
    .trim();
  const name = subject && !bare.toLowerCase().includes(subject.toLowerCase()) ? `${subject} · ${bare}` : bare;
  if (target.kind === "exam") return `${name}: exam revision`;
  if (target.kind === "quiz") return `${name}: quiz prep`;
  if (target.kind === "assignment") return `${name}: assignment work`;
  return `${name}: study session`;
}

const roundUp = (ms: number, step = 15) => Math.ceil(ms / (step * MIN)) * step * MIN;

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Subtracts busy times from [start, end), keeping gaps of at least MIN_BLOCK minutes. */
function freeIntervals(start: number, end: number, busy: Busy[]) {
  let free: Busy[] = [{ start, end }];
  for (const b of busy) {
    const s = b.start - GAP * MIN;
    const e = b.end + GAP * MIN;
    free = free.flatMap((f) => {
      if (e <= f.start || s >= f.end) return [f];
      const parts: Busy[] = [];
      if (s > f.start) parts.push({ start: f.start, end: s });
      if (e < f.end) parts.push({ start: roundUp(e), end: f.end });
      return parts;
    });
  }
  return free.filter((f) => f.end - f.start >= MIN_BLOCK * MIN);
}

type Day = { index: number; free: Busy[]; used: number };

/**
 * Plans study blocks: earliest deadline first, spreading each target across the days before it's
 * due (the day with the least of that target and the most room goes first), within daily limits.
 */
export function planWeek(targets: Target[], busy: Busy[], prefs: PlanPrefs, now = new Date()) {
  const today = startOfDay(now);
  const earliest = roundUp(now.getTime() + 15 * MIN);
  const days: Day[] = [];
  for (let i = 0; i < prefs.days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const weekday = d.getDay();
    if (!prefs.weekends && (weekday === 0 || weekday === 6)) continue;
    // Set clock times directly (not midnight + minutes), so daylight-saving days stay correct.
    const at = (minutes: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
    const start = Math.max(at(prefs.dayStart), earliest);
    const end = at(prefs.dayEnd);
    if (end - start < MIN_BLOCK * MIN) continue;
    days.push({ index: i, free: freeIntervals(start, end, busy), used: 0 });
  }

  const blocks: PlannedBlock[] = [];
  const shortfalls: Shortfall[] = [];

  for (const target of [...targets].sort((a, b) => a.due.getTime() - b.due.getTime())) {
    let need = target.minutes;
    const perDay = new Map<number, number>();
    const due = target.due.getTime() - 30 * MIN; // finish at least 30 min before it's due

    for (let guard = 0; need >= MIN_BLOCK && guard < 200; guard++) {
      // Candidate days: room left today, and a free gap that starts before the deadline.
      const options = days
        .map((day) => {
          const room = prefs.maxPerDay - day.used;
          const gap = day.free.find((f) => Math.min(f.end, due) - f.start >= MIN_BLOCK * MIN);
          return { day, room, gap };
        })
        .filter((o) => o.room >= MIN_BLOCK && o.gap);
      if (!options.length) break;

      options.sort(
        (a, b) =>
          (perDay.get(a.day.index) ?? 0) - (perDay.get(b.day.index) ?? 0) || // spread the target out
          b.room - a.room || // prefer lighter days
          a.day.index - b.day.index, // then earlier days
      );
      const { day, room, gap } = options[0];
      const available = (Math.min(gap!.end, due) - gap!.start) / MIN;
      let length = Math.min(prefs.blockMinutes, need, room, available);
      length = Math.floor(length / 15) * 15;
      if (length < MIN_BLOCK) break;

      const start = gap!.start;
      blocks.push({ targetKey: target.key, start: new Date(start), minutes: length });
      need -= length;
      day.used += length;
      perDay.set(day.index, (perDay.get(day.index) ?? 0) + length);
      // Take the block (plus a short break) out of the free time.
      day.free = day.free.flatMap((f) =>
        f === gap
          ? [{ start: roundUp(start + (length + GAP) * MIN), end: f.end }].filter((x) => x.end - x.start >= MIN_BLOCK * MIN)
          : [f],
      );
    }
    if (need >= 15) shortfalls.push({ targetKey: target.key, missingMinutes: need });
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { blocks, shortfalls };
}
