// Quest difficulty: the trained scorer lives in src/lib/scorer (see scripts/train-scorer.mjs).
import type { Rank } from "./scorer/model.ts";

export {
  assessQuest,
  difficultyWord,
  RANK_THRESHOLDS,
  type Assessment,
  type Detected,
  type FactorKind,
  type Rank,
  type Reason,
} from "./scorer/model.ts";

export const RANK_STYLES: Record<Rank, { color: string; soft: string }> = {
  E: { color: "#64748b", soft: "#eef1f5" },
  D: { color: "#0e87b5", soft: "#e2f2f9" },
  C: { color: "#0f9f8f", soft: "#e0f5f2" },
  B: { color: "#3b6fd8", soft: "#e8effc" },
  A: { color: "#7c5cd6", soft: "#efeafb" },
  S: { color: "#c27c0e", soft: "#fcf3e2" },
};
