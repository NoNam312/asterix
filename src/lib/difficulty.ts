// Quest difficulty: the trained scorer lives in src/lib/scorer (see scripts/train-scorer.mjs).
import type { Rank } from "./scorer/model.ts";

export {
  assessQuest,
  difficultyWord,
  RANK_THRESHOLDS,
  xpFor,
  type Assessment,
  type Detected,
  type FactorKind,
  type Rank,
  type Reason,
} from "./scorer/model.ts";

export const RANK_STYLES: Record<Rank, { color: string; soft: string }> = {
  E: { color: "#64748b", soft: "color-mix(in srgb, #64748b 16%, var(--color-canvas))" },
  D: { color: "#0e87b5", soft: "color-mix(in srgb, #0e87b5 16%, var(--color-canvas))" },
  C: { color: "#0f9f8f", soft: "color-mix(in srgb, #0f9f8f 16%, var(--color-canvas))" },
  B: { color: "#3b6fd8", soft: "color-mix(in srgb, #3b6fd8 16%, var(--color-canvas))" },
  A: { color: "#7c5cd6", soft: "color-mix(in srgb, #7c5cd6 16%, var(--color-canvas))" },
  S: { color: "#c27c0e", soft: "color-mix(in srgb, #c27c0e 16%, var(--color-canvas))" },
};
