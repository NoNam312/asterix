"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Clock, GraduationCap, Hammer, Sparkles, TriangleAlert } from "lucide-react";
import {
  difficultyWord,
  RANK_STYLES,
  RANK_THRESHOLDS,
  type Assessment,
  type FactorKind,
} from "@/lib/difficulty";
import { RankBadge } from "./rank-badge";

const ICONS: Record<FactorKind, typeof Clock> = {
  subject: BookOpen,
  task: Hammer,
  level: GraduationCap,
  time: Clock,
  extra: Sparkles,
};

/** Rank segments along a 0–100 scale, lowest first: [rank, start, end]. */
const SEGMENTS = [...RANK_THRESHOLDS]
  .reverse()
  .map(([rank, min], i, all) => [rank, min, all[i + 1]?.[1] ?? 100] as const);

/**
 * Shows how hard a quest is: rank, XP, where it sits on the E–S scale,
 * what the scorer recognised, and (on request) how each part moved the score.
 */
export function ScorePanel({
  assessment,
  xpLabel,
  minutes,
}: {
  assessment: Assessment;
  xpLabel: React.ReactNode;
  minutes: number;
}) {
  const [open, setOpen] = useState(false);
  const { rank, score, detected, reasons } = assessment;
  const maxPoints = Math.max(10, ...reasons.map((r) => Math.abs(r.points)));

  return (
    <div className="mt-3 rounded-lg bg-surface p-3">
      <div className="flex items-center gap-3">
        <RankBadge rank={rank} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Rank {rank} quest · {xpLabel}
          </p>
          <p className="text-[11px] text-muted">
            {assessment.xpPerHour} XP per hour × {formatMinutes(minutes)}
            <span className="text-faint"> · timed quests pay for the time you actually work</span>
          </p>
          <ScoreScale score={score} />
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {detected.map((d) => {
          const Icon = ICONS[d.kind];
          return (
            <li
              key={`${d.kind}-${d.label}`}
              className="flex items-center gap-1 rounded-md bg-canvas px-2 py-1 text-xs text-ink"
            >
              <Icon size={12} className="shrink-0 text-muted" />
              {d.label}
              {d.difficulty !== undefined && <DifficultyLabel difficulty={d.difficulty} />}
              {d.hint && <span className="text-faint">{d.hint}</span>}
            </li>
          );
        })}
      </ul>

      {assessment.warning && (
        <p className="mt-2 flex gap-1.5 rounded-md bg-[#fcf3e2] px-2 py-1.5 text-xs text-[#8a5a0a]">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          {assessment.warning}
        </p>
      )}

      {assessment.tip && !assessment.warning && (
        <p className="mt-2 text-[11px] text-muted">💡 {assessment.tip}</p>
      )}

      {reasons.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-ink"
          >
            <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            How it&apos;s scored
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {reasons.map((r) => (
                <li key={r.kind} className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-2 text-xs">
                  <span className="truncate text-muted">{r.label}</span>
                  {/* Bar grows right for points added, left for points taken away. */}
                  <span className="relative h-1.5 rounded-full bg-line">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-faint" />
                    <span
                      className={`absolute inset-y-0 rounded-full ${r.points >= 0 ? "left-1/2 bg-xp" : "right-1/2 bg-danger"}`}
                      style={{ width: `${(Math.abs(r.points) / maxPoints) * 50}%` }}
                    />
                  </span>
                  <span className={`text-right font-medium tabular-nums ${r.points >= 0 ? "text-xp" : "text-danger"}`}>
                    {r.points > 0 ? "+" : "−"}
                    {Math.abs(r.points)}
                  </span>
                </li>
              ))}
              <li className="pt-1 text-[11px] text-faint">
                Difficulty score {score} / 100 → {assessment.xpPerHour} XP per hour. Length doesn&apos;t change
                the rank; it multiplies the XP.
              </li>
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
}

/** "Very hard" in the colour of the rank it tends to produce. */
function DifficultyLabel({ difficulty }: { difficulty: number }) {
  const rank = difficulty < 2 ? "E" : difficulty < 3 ? "C" : difficulty < 4 ? "B" : difficulty < 4.75 ? "A" : "S";
  const style = RANK_STYLES[rank];
  return (
    <span className="rounded px-1 text-[10px] font-semibold" style={{ background: style.soft, color: style.color }}>
      {difficultyWord(difficulty)}
    </span>
  );
}

/** A 0–100 bar split into rank bands, with a marker at the quest's score. */
function ScoreScale({ score }: { score: number }) {
  return (
    <div className="mt-1.5">
      <div className="relative flex h-2 overflow-hidden rounded-full">
        {SEGMENTS.map(([rank, from, to]) => (
          <span
            key={rank}
            className="h-full"
            style={{ width: `${to - from}%`, background: RANK_STYLES[rank].soft }}
          />
        ))}
        <span
          className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${Math.min(99, Math.max(1, score))}%` }}
        />
      </div>
      <div className="mt-0.5 flex text-[9px] font-semibold text-faint">
        {SEGMENTS.map(([rank, from, to]) => (
          <span key={rank} className="text-center" style={{ width: `${to - from}%` }}>
            {rank}
          </span>
        ))}
      </div>
    </div>
  );
}
