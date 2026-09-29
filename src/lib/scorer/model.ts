// The quest scorer: a linear model over extracted features, with weights learned by
// scripts/train-scorer.mjs from the labelled examples in training-data.ts.

import type { Category } from "../quests.ts";
import { extractFeatures, type Features, type QuestInput } from "./features.ts";
import { stem } from "./text.ts";
import { WEIGHTS } from "./weights.ts";

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

export type FactorKind = "time" | "subject" | "task" | "level" | "extra";

/** Something the scorer noticed about the quest, shown as a tag. */
export type Detected = { kind: FactorKind; label: string; hint?: string; difficulty?: number };

/** How much one aspect of the quest moved its score. */
export type Reason = { kind: FactorKind; label: string; points: number };

export type Assessment = {
  score: number;
  rank: Rank;
  xp: number;
  detected: Detected[];
  reasons: Reason[];
  /** Set when the title mixes signals, e.g. a study subject in a gym quest. */
  warning?: string;
  /** Set when the title is too vague to score fairly. */
  tip?: string;
  /** Category the quest most likely belongs to (e.g. "leg day" -> gym). */
  suggestedCategory?: Category;
};

/** Minimum score for each rank, highest first. */
export const RANK_THRESHOLDS: [Rank, number][] = [
  ["S", 85],
  ["A", 70],
  ["B", 55],
  ["C", 40],
  ["D", 25],
  ["E", 0],
];

export function rankFor(score: number): Rank {
  return RANK_THRESHOLDS.find(([, min]) => score >= min)![0];
}

/** Raw model output (unclamped) — used by the trainer. */
export function predict(x: Record<string, number>, weights: Record<string, number> = WEIGHTS) {
  let sum = 0;
  for (const [name, value] of Object.entries(x)) sum += (weights[name] ?? 0) * value;
  return sum;
}

export function difficultyWord(difficulty: number) {
  if (difficulty < 2) return "Easy";
  if (difficulty < 3) return "Moderate";
  if (difficulty < 4) return "Challenging";
  if (difficulty < 4.75) return "Hard";
  return "Very hard";
}

function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m";
}

/**
 * Shows the matched words only when they explain something: abbreviations, codes and topics
 * ("from “MoC”", "from “eigenvalues”"), not the subject's own name.
 */
function hintFor(name: string, matched: string) {
  const norm = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem).join(" ");
  const n = norm(name);
  const m = norm(matched);
  if (n === m || n.includes(m) || m.split(" ").length > 2) return undefined;
  return `from “${matched.length <= 4 ? matched.toUpperCase() : matched}”`;
}

/** Short words people write in capitals. */
const ACRONYMS = new Set(["sac", "hw", "ia", "cv", "gp", "bbq", "bjj", "hiit", "pe", "mcq", "ui", "api", "tv", "mvp", "sat", "act"]);

/** Words too vague to show on their own; the task type label is used instead. */
const GENERIC_TASK_WORDS = new Set(["subject", "subjects", "unit", "topic", "topics", "module", "study"]);

/** The words the user actually wrote for the task, e.g. "Lecture", "Tute", "SAC", "Leg day". */
function taskName(typeLabel: string, matched: string) {
  if (GENERIC_TASK_WORDS.has(matched) || / (with|on|for|to|up)$/.test(matched)) return typeLabel; // "coffee with", "subject"
  if (ACRONYMS.has(matched)) return matched.toUpperCase();
  return matched.charAt(0).toUpperCase() + matched.slice(1);
}

/** Which aspect of the quest a model feature describes. */
function kindOf(feature: string): FactorKind {
  if (feature.startsWith("duration") || feature === "multi") return "time";
  if (feature.startsWith("area")) return "subject";
  if (feature.startsWith("level")) return "level";
  if (feature.startsWith("mod")) return "extra";
  return "task";
}

function describe(f: Features, durationMin: number) {
  const detected: Detected[] = [];
  const labels: Record<FactorKind, string> = {
    time: `Time: ${formatDuration(durationMin)}${f.multi ? " (several parts)" : ""}`,
    subject: "Subject",
    task: "Type of work: general",
    level: "Level",
    extra: "Wording",
  };

  if (f.area) {
    const { area, phrase } = f.area;
    detected.push({ kind: "subject", label: area.name, hint: hintFor(area.name, phrase), difficulty: area.difficulty });
    labels.subject = `Subject: ${area.name}`;
  }
  if (f.task) {
    const name = f.task.remapped ? f.task.type.label : taskName(f.task.type.label, f.task.phrase);
    detected.push({ kind: "task", label: name });
    labels.task = `Type of work: ${name}`;
  } else if (f.x["task:general-study"]) {
    labels.task = "Type of work: study (unspecified)";
  }
  if (f.level) {
    detected.push({ kind: "level", label: f.level.label });
    labels.level = `Level: ${f.level.label}`;
  }
  if (f.modifiers.length) {
    detected.push({ kind: "extra", label: f.modifiers.map((m) => `“${m.phrase}”`).join(", ") });
    labels.extra = `Wording: ${f.modifiers.map((m) => m.label.toLowerCase()).join(", ")}`;
  }
  detected.push({ kind: "time", label: formatDuration(durationMin) });
  return { detected, labels };
}

const DOMAIN_WORDS: Partial<Record<NonNullable<Features["domain"]>, string>> = {
  fitness: "gym",
  chore: "chore",
  errand: "errand",
  admin: "admin",
  social: "social",
  selfcare: "self-care",
  hobby: "hobby",
};

export function assessQuest(input: QuestInput): Assessment {
  const f = extractFeatures(input);
  const score = Math.round(Math.min(100, Math.max(0, predict(f.x))));
  const { detected, labels } = describe(f, input.durationMin);

  // Sum each feature's contribution into one reason per aspect (time, subject, task, …).
  const totals = new Map<FactorKind, number>();
  for (const [name, value] of Object.entries(f.x)) {
    if (name === "bias") continue;
    const kind = kindOf(name);
    totals.set(kind, (totals.get(kind) ?? 0) + (WEIGHTS[name] ?? 0) * value);
  }
  const reasons = [...totals]
    .map(([kind, points]) => ({ kind, label: labels[kind], points: Math.round(points) }))
    .filter((r) => r.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  const xp = Math.max(5, Math.round(((score + 10) * Math.sqrt(input.durationMin / 60)) / 5) * 5);
  const kind = f.domain && DOMAIN_WORDS[f.domain];
  const warning =
    f.ignoredSubject && f.task && kind
      ? `“${f.ignoredSubject.phrase}” looks like a study subject, but “${f.task.phrase}” is a ${kind} task, so this is scored as ${kind}. Split it into two quests if you meant both.`
      : undefined;

  const tip = f.task
    ? undefined
    : f.x["task:general-study"]
      ? "Say what you're doing (lecture, tute, assignment, revision…). Vague quests get the lowest study rate."
      : "Add what kind of task this is for a fairer score. Vague quests get the lowest rate.";

  return { score, rank: rankFor(score), xp, detected, reasons, warning, tip, suggestedCategory: f.suggestedCategory };
}
