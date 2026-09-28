"use client";

import { useEffect, useState } from "react";
import { Check, Flag, Square } from "lucide-react";
import type { Rank } from "@/lib/difficulty";
import { CATEGORIES, type Quest } from "@/lib/quests";
import { RankBadge } from "./rank-badge";

type Props = {
  quest: Quest;
  onComplete: () => void;
  onFail: () => void;
  onStop: () => void;
};

/** Banner with a live countdown for the quest that's currently running. */
export function ActiveQuestBar({ quest, onComplete, onFail, onStop }: Props) {
  const now = useTicker();
  const started = new Date(quest.started_at ?? quest.start_at).getTime();
  const totalMs = quest.duration_min * 60_000;
  const remainingMs = started + totalMs - now;
  const overtime = remainingMs <= 0;
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
  const cat = CATEGORIES[quest.category];

  return (
    <div className="border-b border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex size-2.5">
          <span
            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
            style={{ background: overtime ? "var(--color-danger)" : cat.color }}
          />
          <span
            className="relative inline-flex size-2.5 rounded-full"
            style={{ background: overtime ? "var(--color-danger)" : cat.color }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {overtime ? "Time's up! Did you finish?" : "Quest in progress"}
          </p>
          <p className="flex items-center gap-2 truncate font-semibold">
            {quest.difficulty && <RankBadge rank={quest.difficulty as Rank} />}
            {quest.title}
            <span className="text-sm font-medium text-xp">+{quest.xp} XP</span>
          </p>
        </div>
        <span
          className={`font-mono text-2xl font-semibold tabular-nums ${overtime ? "text-danger" : "text-ink"}`}
        >
          {overtime && "+"}
          {formatClock(Math.abs(remainingMs))}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onComplete}
            className="flex items-center gap-1 rounded-md bg-xp px-3 py-1.5 text-sm font-medium text-white hover:brightness-95"
          >
            <Check size={15} /> Complete
          </button>
          <button
            onClick={onFail}
            className="flex items-center gap-1 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-danger hover:bg-danger-soft"
          >
            <Flag size={14} /> Fail
          </button>
          <button
            onClick={onStop}
            title="Stop the timer and put the quest back to planned"
            className="flex items-center gap-1 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-muted hover:text-ink"
          >
            <Square size={12} /> Stop
          </button>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${progress * 100}%`,
            background: overtime ? "var(--color-danger)" : cat.color,
          }}
        />
      </div>
    </div>
  );
}

function useTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
