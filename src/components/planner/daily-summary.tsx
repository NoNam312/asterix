"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Circle, Flame, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatTime, isSameDay, startOfDay, toDateInput } from "@/lib/dates";
import type { Rank } from "@/lib/difficulty";
import { CATEGORIES, type Quest } from "@/lib/quests";
import { RankBadge } from "./rank-badge";

export type MissedNotice = { missed: number; xpLost: number };

type Bonus = { xp: number; streak: number } | null;

type Props = {
  initialDay: Date;
  goal: number;
  missedNotice?: MissedNotice;
  onClose: () => void;
};

/** Report card for one day: XP vs goal, completed/failed quests, penalties and bonus. */
export function DailySummary({ initialDay, goal, missedNotice, onClose }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [day, setDay] = useState(() => startOfDay(initialDay));
  const [data, setData] = useState<{ quests: Quest[]; bonus: Bonus } | null>(null);
  const today = startOfDay(new Date());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase
        .from("quests")
        .select("*")
        .gte("start_at", day.toISOString())
        .lt("start_at", addDays(day, 1).toISOString())
        .order("start_at"),
      supabase.from("daily_bonuses").select("xp, streak").eq("day", toDateInput(day)).maybeSingle(),
    ]).then(([quests, bonus]) => {
      if (cancelled) return;
      const list = ((quests.data ?? []) as Quest[]).filter((q) => q.kind !== "deadline");
      setData({ quests: list, bonus: bonus.data as Bonus });
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, day]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const quests = data?.quests ?? [];
  const completed = quests.filter((q) => q.status === "completed");
  const failed = quests.filter((q) => q.status === "failed");
  const earned = completed.reduce((s, q) => s + q.xp, 0);
  const lost = failed.reduce((s, q) => s + q.xp_penalty, 0);
  const bonus = data?.bonus;
  const net = earned + (bonus?.xp ?? 0) - lost;
  const isToday = isSameDay(day, today);
  const isYesterday = isSameDay(day, addDays(today, -1));
  const showNotice = missedNotice && missedNotice.missed > 0 && isSameDay(day, initialDay);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl border border-line bg-canvas pb-[env(safe-area-inset-bottom)] shadow-xl sm:rounded-xl sm:pb-0">
        <div className="flex items-center gap-1 border-b border-line px-5 py-3">
          <div className="flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {isToday ? "Today so far" : isYesterday ? "Yesterday's report" : "Daily report"}
            </p>
            <h2 className="font-semibold">
              {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </h2>
          </div>
          <button
            aria-label="Previous day"
            onClick={() => setDay((d) => addDays(d, -1))}
            className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Next day"
            disabled={isToday}
            onClick={() => setDay((d) => addDays(d, 1))}
            className="rounded p-1 text-muted hover:bg-surface hover:text-ink disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          <button onClick={onClose} className="ml-1 rounded p-1 text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {showNotice && (
            <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {missedNotice.missed} unfinished quest{missedNotice.missed === 1 ? " was" : "s were"}{" "}
              counted as failed: <strong>−{missedNotice.xpLost} XP</strong>
            </p>
          )}

          {!data ? (
            <p className="py-8 text-center text-sm text-faint">Loading…</p>
          ) : (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold tabular-nums">
                    {earned}
                    <span className="text-base font-medium text-muted"> / {goal} XP</span>
                  </p>
                  <p className="text-xs text-muted">
                    {earned >= goal ? "Daily goal reached 🎉" : `${goal - earned} XP short of the goal`}
                  </p>
                </div>
                {bonus && (
                  <span className="flex items-center gap-1 rounded-full bg-[#fcf3e2] px-2.5 py-1 text-xs font-semibold text-[#c27c0e]">
                    <Flame size={13} /> {bonus.streak}-day streak
                  </span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-xp"
                  style={{ width: `${Math.min(100, (earned / goal) * 100)}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <Stat label="Completed" value={completed.length} />
                <Stat label="Failed" value={failed.length} tone={failed.length ? "danger" : undefined} />
                <Stat label="Bonus" value={bonus ? `+${bonus.xp}` : "—"} tone={bonus ? "xp" : undefined} />
                <Stat label="Net XP" value={`${net >= 0 ? "+" : ""}${net}`} tone={net >= 0 ? "xp" : "danger"} />
              </div>

              <h3 className="mt-5 text-[11px] font-medium uppercase tracking-wide text-muted">Quests</h3>
              {quests.length === 0 ? (
                <p className="py-3 text-sm text-faint">No quests on this day.</p>
              ) : (
                <ul className="mt-1 divide-y divide-line">
                  {quests.map((q) => (
                    <li key={q.id} className="flex items-center gap-2 py-2 text-sm">
                      <StatusIcon status={q.status} color={CATEGORIES[q.category].color} />
                      {q.difficulty && <RankBadge rank={q.difficulty as Rank} />}
                      <span
                        className={`flex-1 truncate ${q.status === "failed" ? "text-muted line-through" : ""}`}
                      >
                        {q.title}
                      </span>
                      <span className="text-xs text-faint">{formatTime(new Date(q.start_at))}</span>
                      <span
                        className={`w-14 text-right text-xs font-medium tabular-nums ${
                          q.status === "completed"
                            ? "text-xp"
                            : q.status === "failed"
                              ? "text-danger"
                              : "text-faint"
                        }`}
                      >
                        {q.status === "completed"
                          ? `+${q.xp}`
                          : q.status === "failed"
                            ? `−${q.xp_penalty}`
                            : `${q.xp}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "xp" | "danger";
}) {
  return (
    <div className="rounded-lg bg-surface px-2 py-2">
      <p
        className={`text-lg font-semibold tabular-nums ${
          tone === "xp" ? "text-xp" : tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function StatusIcon({ status, color }: { status: Quest["status"]; color: string }) {
  if (status === "completed")
    return (
      <span className="grid size-4 place-items-center rounded" style={{ background: color }}>
        <Check size={11} strokeWidth={3} className="text-white" />
      </span>
    );
  if (status === "failed")
    return (
      <span className="grid size-4 place-items-center rounded bg-danger-soft">
        <X size={11} strokeWidth={3} className="text-danger" />
      </span>
    );
  return <Circle size={16} className="text-faint" />;
}
