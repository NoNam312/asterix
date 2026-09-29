// The quest scorer: a linear model over extracted features, with weights learned by
// scripts/train-scorer.mjs from the labelled examples in training-data.ts.

import type { Category } from "../quests.ts";
import { extractFeatures, featureLabel, type QuestInput } from "./features.ts";
import { WEIGHTS } from "./weights.ts";

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";
export type Reason = { label: string; points: number };

export type Assessment = {
  score: number;
  rank: Rank;
  xp: number;
  reasons: Reason[];
  /** Category the quest most likely belongs to (e.g. "leg day" -> gym). */
  suggestedCategory?: Category;
};

const RANK_THRESHOLDS: [Rank, number][] = [
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

export function assessQuest(input: QuestInput): Assessment {
  const f = extractFeatures(input);
  const score = Math.round(Math.min(100, Math.max(0, predict(f.x))));

  // Group related features (e.g. area:has + area:difficulty) into one explained reason.
  const groups = new Map<string, { label: string; points: number }>();
  for (const [name, value] of Object.entries(f.x)) {
    if (name === "bias") continue;
    const key = name.split(":")[0] === "mod" || name.startsWith("task:") || name.startsWith("default:") ? name : name.split(":")[0];
    const label = featureLabel(name, f, input.durationMin);
    const g = groups.get(key) ?? { label, points: 0 };
    g.points += (WEIGHTS[name] ?? 0) * value;
    groups.set(key, g);
  }
  const reasons = [...groups.values()]
    .map((g) => ({ label: g.label, points: Math.round(g.points) }))
    .filter((r) => r.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  const xp = Math.max(5, Math.round(((score + 10) * Math.sqrt(input.durationMin / 60)) / 5) * 5);
  return { score, rank: rankFor(score), xp, reasons, suggestedCategory: f.suggestedCategory };
}
