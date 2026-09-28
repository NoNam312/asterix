import type { Category } from "./quests";

/**
 * Keyword-based difficulty scoring.
 *
 * score (0–100) = category base + task type + subject bonus + intensity − easing + duration
 * The score maps to a rank (E → S), and XP = (score + 10) × √hours, rounded to 5.
 * Tweak the word lists below to tune how quests are rated.
 */

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

export type Reason = { label: string; points: number };

export type Assessment = {
  score: number;
  rank: Rank;
  xp: number;
  reasons: Reason[];
};

const TASK_TIERS: { points: number; words: string[] }[] = [
  {
    points: 35,
    words: [
      "exam", "final", "finals", "midterm", "mock", "past paper", "past papers", "past exam",
      "thesis", "dissertation", "essay", "report", "lab report", "assignment", "project",
      "coursework", "presentation",
      // gym
      "leg day", "deadlift", "deadlifts", "squat", "squats", "hiit", "sprint", "sprints",
      "10k", "half marathon", "marathon", "crossfit", "intervals",
    ],
  },
  {
    points: 22,
    words: [
      "homework", "problem set", "problems", "practice", "exercises", "questions", "worksheet",
      "lecture", "chapter", "study", "revise", "revision", "research", "code", "coding",
      "program", "tutorial", "past questions",
      // gym
      "workout", "gym", "lift", "lifting", "push", "pull", "push day", "pull day", "run",
      "running", "5k", "swim", "swimming", "cycling", "training", "cardio",
    ],
  },
  {
    points: 10,
    words: [
      "review", "flashcards", "flashcard", "notes", "read", "reading", "skim", "summary",
      "summarise", "summarize", "organise", "organize", "plan", "email", "emails", "tidy",
      "clean", "laundry", "dishes",
      // gym
      "walk", "stretch", "stretching", "yoga", "mobility", "cooldown",
    ],
  },
];

const SUBJECT_WORDS = [
  "calculus", "physics", "chemistry", "organic", "maths", "math", "mathematics", "algebra",
  "statistics", "stats", "proof", "proofs", "theorem", "thermodynamics", "biochem",
  "biochemistry", "programming", "algorithms", "data structures", "economics", "accounting",
  "mechanics", "electromagnetism", "differential", "integration", "linear algebra",
];

const INTENSITY_WORDS = ["full", "entire", "whole", "all", "hard", "difficult", "advanced", "timed", "complete"];
const EASING_WORDS = ["quick", "easy", "light", "short", "brief", "simple", "casual"];

const CATEGORY_BASE: Record<Category, number> = {
  study: 10,
  gym: 10,
  chores: 5,
  personal: 5,
  other: 5,
};

/** Task-type points when no keyword matches, so plain titles like "Chemistry" still count. */
const DEFAULT_TASK_POINTS = 15;

const RANK_THRESHOLDS: [Rank, number][] = [
  ["S", 85],
  ["A", 70],
  ["B", 55],
  ["C", 40],
  ["D", 25],
  ["E", 0],
];

export const RANK_STYLES: Record<Rank, { color: string; soft: string }> = {
  E: { color: "#64748b", soft: "#eef1f5" },
  D: { color: "#0e87b5", soft: "#e2f2f9" },
  C: { color: "#0f9f8f", soft: "#e0f5f2" },
  B: { color: "#3b6fd8", soft: "#e8effc" },
  A: { color: "#7c5cd6", soft: "#efeafb" },
  S: { color: "#c27c0e", soft: "#fcf3e2" },
};

export function assessQuest(input: {
  title: string;
  notes?: string | null;
  category: Category;
  durationMin: number;
}): Assessment {
  const text = ` ${`${input.title} ${input.notes ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const has = (w: string) => text.includes(` ${w} `);
  const reasons: Reason[] = [];

  const base = CATEGORY_BASE[input.category];
  reasons.push({ label: `${capitalize(input.category)} quest`, points: base });

  let taskPoints = DEFAULT_TASK_POINTS;
  let taskWord: string | undefined;
  for (const tier of TASK_TIERS) {
    taskWord = tier.words.filter(has).sort((a, b) => b.length - a.length)[0];
    if (taskWord) {
      taskPoints = tier.points;
      break;
    }
  }
  reasons.push({ label: taskWord ? `"${taskWord}"` : "General task", points: taskPoints });

  const subject = SUBJECT_WORDS.filter(has).sort((a, b) => b.length - a.length)[0];
  const subjectPoints = subject ? 15 : 0;
  if (subject) reasons.push({ label: `Tough subject: "${subject}"`, points: subjectPoints });

  const intense = INTENSITY_WORDS.find(has);
  const intensePoints = intense ? 10 : 0;
  if (intense) reasons.push({ label: `"${intense}"`, points: intensePoints });

  const easy = EASING_WORDS.find(has);
  const easyPoints = easy ? -10 : 0;
  if (easy) reasons.push({ label: `"${easy}"`, points: easyPoints });

  const durationPoints = Math.round(Math.min(30, input.durationMin / 6));
  reasons.push({ label: `${input.durationMin} min time limit`, points: durationPoints });

  const score = clamp(base + taskPoints + subjectPoints + intensePoints + easyPoints + durationPoints, 0, 100);
  const rank = RANK_THRESHOLDS.find(([, min]) => score >= min)![0];
  const xp = Math.max(5, Math.round(((score + 10) * Math.sqrt(input.durationMin / 60)) / 5) * 5);

  return { score, rank, xp, reasons };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
