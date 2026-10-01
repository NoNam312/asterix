// Deadline urgency: work on a subject earns more XP as its due dates and exams get closer, and
// each upcoming deadline shows how much work is planned for it.
//
// Quests are linked to deadlines by subject. Canvas due dates only carry a course code
// ("Assignment 2 [COMP30026_2026_SM2]"), while quests usually use the subject's name
// ("Models of Computation revision"), so names are learnt from class titles that carry both
// ("Models of Computation (COMP30026_2026_SM2)" or "COMP30026 Models of Computation Lecture").
import { assessQuest, xpFor, type Assessment } from "./difficulty.ts";
import { dueAt, isDeadline, shortTitle, type Quest } from "./quests.ts";
import { classifyTarget, type TargetKind } from "./week-planner.ts";

const DAY = 86_400_000;
/** How far before a deadline work on its subject starts earning a bonus. */
export const URGENCY_WINDOW_DAYS = 14;

/** Bonus by how many days before the deadline the quest starts. */
const TIERS: { days: number; bonus: number }[] = [
  { days: 1, bonus: 0.5 },
  { days: 3, bonus: 0.3 },
  { days: 7, bonus: 0.15 },
  { days: URGENCY_WINDOW_DAYS, bonus: 0.05 },
];

type QuestLike = Pick<Quest, "id" | "title" | "notes" | "start_at" | "duration_min" | "status" | "category" | "calendar_id" | "kind" | "all_day"> & Partial<Pick<Quest, "worked_min">>;

export type Deadline = {
  id: string;
  title: string;
  /** "COMP30026 · Assignment 2" */
  label: string;
  due: Date;
  kind: TargetKind;
  /** Rough study time it needs, in minutes. */
  needMinutes: number;
  codes: Set<string>;
  /** Subject name, when known ("Models of Computation"). */
  subject: string | null;
  /** Words of a deadline that has no subject, for matching quests that name it. */
  nameTokens: string[];
  calendarId: string | null;
};

export type Subject = { code: string; name: string; tokens: string[]; area: string | null };

export type UrgencyContext = { deadlines: Deadline[]; subjects: Map<string, Subject> };

export type Urgency = { deadline: Deadline; daysLeft: number; bonus: number };

export const EMPTY_URGENCY: UrgencyContext = { deadlines: [], subjects: new Map() };

// ---------------------------------------------------------------------------------------------
// Subjects

const CODE = /(?<![A-Za-z])([A-Z]{4}\d{5})(?!\d)/g;
const CLASS_WORDS =
  /\s+(lecture|lec|tutorial|tute|tut|workshop|practical|prac|lab|seminar|class|studio|recording|stream)\b.*$/i;
const STOP = new Set(["and", "of", "the", "to", "in", "for", "a", "an", "on", "with", "&"]);

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** True if `needle` appears as a run of consecutive words in `hay`. */
function containsRun(hay: string[], needle: string[]) {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Subject code and name from a class title, if it has both. */
export function subjectFromTitle(title: string): { code: string; name: string } | null {
  // "Models of Computation (COMP30026_2026_SM2) [COMP30026_2026_SM2]"
  let m = title.match(/^(.+?)\s*\(\s*([A-Z]{4}\d{5})[^)]*\)/);
  if (m) return { code: m[2], name: m[1].trim() };
  // "COMP30026 Models of Computation Lecture 1", "COMP30026_2026_SM2 - Models of Computation"
  m = title.match(/^([A-Z]{4}\d{5})\S*\s*[-–:]?\s+(.+)$/);
  if (m) {
    const name = m[2].replace(/\s*[([].*$/, "").replace(CLASS_WORDS, "").replace(/\s+\d+$/, "").trim();
    if (tokens(name).length) return { code: m[1], name };
  }
  return null;
}

/** Subjects (code → name) learnt from class titles that carry both. */
export function buildSubjectIndex(titles: string[]) {
  const subjects = new Map<string, Subject>();
  for (const title of titles) {
    const s = subjectFromTitle(title);
    if (!s || subjects.has(s.code)) continue;
    subjects.set(s.code, { ...s, tokens: tokens(s.name), area: subjectArea(s.name) });
  }
  return subjects;
}

/** The subject a quest title is about: a known subject's name, a bare code, or null. */
export function subjectOfTitle(title: string, subjects: Map<string, Subject>) {
  const code = [...codesIn(title, subjects)][0];
  return code ? (subjects.get(code)?.name ?? code) : null;
}

function subjectArea(text: string) {
  return assessQuest({ title: text, category: "study", durationMin: 60 }).detected.find((d) => d.kind === "subject")?.label ?? null;
}

/** Subject codes a piece of text refers to: by code, by name, or by a subject area only one subject has. */
const codeCache = new WeakMap<Map<string, Subject>, Map<string, Set<string>>>();

function codesIn(text: string, subjects: Map<string, Subject>): Set<string> {
  let cache = codeCache.get(subjects);
  if (!cache) codeCache.set(subjects, (cache = new Map()));
  let found = cache.get(text);
  if (!found) cache.set(text, (found = findCodes(text, subjects)));
  return found;
}

function findCodes(text: string, subjects: Map<string, Subject>): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(CODE)) found.add(m[1]);
  if (found.size) return found;
  const words = tokens(text);
  for (const s of subjects.values()) if (containsRun(words, s.tokens)) found.add(s.code);
  if (found.size) return found;
  const area = subjectArea(text);
  if (area) {
    const same = [...subjects.values()].filter((s) => s.area === area);
    if (same.length === 1) found.add(same[0].code);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Deadlines

/** How much work a deadline needs. A weighting like "(50%)" in the title scales it. */
export function estimateNeed(title: string): { kind: TargetKind; minutes: number } {
  const t = title.toLowerCase();
  if (/\b(team member evaluation|peer (review|evaluation|assessment)|give feedback|feedback as group|reflection|survey|attendance|check-?in)\b/.test(t)) {
    return { kind: "other", minutes: 60 };
  }
  const guess = classifyTarget(title);
  const weight = title.match(/(\d{1,3})\s*%/);
  if (weight && guess.kind !== "quiz") {
    const pct = Math.min(100, Number(weight[1]));
    return { ...guess, minutes: Math.max(60, Math.round((pct * 18) / 30) * 30) }; // ~18 min per 1%
  }
  return guess;
}

/**
 * Builds the deadline list from loaded quests: calendar due dates, plus exams on the calendar
 * (imported or your own). `subjectTitles` are extra class titles, e.g. from skipped series.
 */
export function buildUrgencyContext(quests: QuestLike[], subjectTitles: string[] = []): UrgencyContext {
  const subjects = buildSubjectIndex([...subjectTitles, ...quests.filter((q) => q.calendar_id).map((q) => q.title)]);

  const deadlines: Deadline[] = [];
  for (const q of quests) {
    const guess = estimateNeed(q.title);
    const exam = !isDeadline(q) && guess.kind === "exam" && q.status === "planned";
    if (!isDeadline(q) && !exam) continue;
    const codes = codesIn(q.title, subjects);
    const code = [...codes][0];
    deadlines.push({
      id: q.id,
      title: q.title,
      label: shortTitle(q.title),
      due: exam ? new Date(q.start_at) : dueAt(q),
      kind: guess.kind,
      needMinutes: guess.minutes,
      codes,
      subject: code ? (subjects.get(code)?.name ?? null) : null,
      nameTokens: codes.size ? [] : tokens(q.title.replace(/\b(due|deadline|submission|submit)\b/gi, "")),
      calendarId: q.calendar_id ?? null,
    });
  }
  deadlines.sort((a, b) => a.due.getTime() - b.due.getTime());
  return { deadlines, subjects };
}

// ---------------------------------------------------------------------------------------------
// Linking quests to deadlines

/** Deadlines a quest counts towards, nearest first. A "plan:<id>" note links it to that one. */
function candidates(q: Pick<QuestLike, "id" | "title" | "notes">, start: Date, ctx: UrgencyContext) {
  const upcoming = ctx.deadlines.filter(
    (d) => d.id !== q.id && d.due > start && d.due.getTime() - start.getTime() <= URGENCY_WINDOW_DAYS * DAY,
  );
  if (!upcoming.length) return [];

  const planned = q.notes?.match(/plan:([\w-]+)/)?.[1];
  if (planned) return upcoming.filter((d) => d.id === planned);

  let codes = codesIn(q.title, ctx.subjects);
  if (!codes.size && q.notes) codes = codesIn(q.notes, ctx.subjects);
  const words = tokens(q.title);
  return upcoming.filter((d) =>
    d.codes.size ? [...d.codes].some((c) => codes.has(c)) : d.nameTokens.length >= 2 && containsRun(words, d.nameTokens),
  );
}

/** Quests that can earn the bonus: your own work, not imported classes, gym or chores. */
function eligible(q: Pick<QuestLike, "calendar_id" | "kind" | "category">) {
  return !q.calendar_id && q.kind !== "deadline" && q.category !== "gym" && q.category !== "chores";
}

export function urgencyFor(
  q: Pick<QuestLike, "id" | "title" | "notes" | "calendar_id" | "kind" | "category"> & { start: Date },
  ctx: UrgencyContext,
): Urgency | null {
  if (!eligible(q)) return null;
  const deadline = candidates(q, q.start, ctx)[0];
  if (!deadline) return null;
  const daysLeft = (deadline.due.getTime() - q.start.getTime()) / DAY;
  const bonus = TIERS.find((t) => daysLeft <= t.days)?.bonus ?? 0;
  return bonus > 0 ? { deadline, daysLeft, bonus } : null;
}

export type ScoredQuest = Assessment & { urgency: Urgency | null };

/** The quest scorer plus the deadline bonus. */
export function scoreQuest(
  input: {
    id?: string;
    title: string;
    notes?: string | null;
    category: Quest["category"];
    durationMin: number;
    start: Date;
    calendarId?: string | null;
    kind?: Quest["kind"];
  },
  ctx: UrgencyContext,
): ScoredQuest {
  const base = assessQuest({ title: input.title, notes: input.notes, category: input.category, durationMin: input.durationMin });
  const urgency = urgencyFor(
    {
      id: input.id ?? "",
      title: input.title,
      notes: input.notes ?? null,
      calendar_id: input.calendarId ?? null,
      kind: input.kind ?? "task",
      category: input.category,
      start: input.start,
    },
    ctx,
  );
  if (!urgency) return { ...base, urgency: null };
  const xpPerHour = Math.round(base.xpPerHour * (1 + urgency.bonus));
  return { ...base, xpPerHour, xp: xpFor(xpPerHour, input.durationMin), urgency };
}

// ---------------------------------------------------------------------------------------------
// Progress towards each deadline

export type DeadlineProgress = {
  deadline: Deadline;
  doneMinutes: number;
  plannedMinutes: number;
  /** Planned + done, as a share of what it needs (0–1). */
  share: number;
};

/** Work done and planned for each upcoming deadline. Each quest counts towards its nearest one. */
export function deadlineProgress(quests: QuestLike[], ctx: UrgencyContext, now = new Date()): DeadlineProgress[] {
  const byId = new Map<string, DeadlineProgress>();
  for (const d of ctx.deadlines) {
    if (d.due > now) byId.set(d.id, { deadline: d, doneMinutes: 0, plannedMinutes: 0, share: 0 });
  }
  for (const q of quests) {
    if (!eligible(q) || q.status === "failed") continue;
    const target = candidates(q, new Date(q.start_at), ctx).find((d) => byId.has(d.id));
    if (!target) continue;
    const p = byId.get(target.id)!;
    // Timed quests count the minutes actually worked.
    if (q.status === "completed") p.doneMinutes += q.worked_min ?? q.duration_min;
    else p.plannedMinutes += q.duration_min;
  }
  for (const p of byId.values()) {
    p.share = Math.min(1, (p.doneMinutes + p.plannedMinutes) / Math.max(1, p.deadline.needMinutes));
  }
  return [...byId.values()];
}

/** "3 days after" / "less than a day after" (a quest's start). */
export function describeDaysLeft(daysLeft: number) {
  if (daysLeft < 1) return "less than a day after";
  const d = Math.floor(daysLeft);
  return `${d} day${d === 1 ? "" : "s"} after`;
}
