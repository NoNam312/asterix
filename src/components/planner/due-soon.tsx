"use client";

import { CalendarRange, Check, Flag } from "lucide-react";
import { formatDuration, startOfDay } from "@/lib/dates";
import { dueDay, isDeadline, type CalendarLayer, type Quest } from "@/lib/quests";
import type { DeadlineProgress } from "@/lib/urgency";

type Item = DeadlineProgress & { quest: Quest };

const DAY = 86_400_000;
const hours = (min: number) => formatDuration(Math.max(30, Math.round(min / 30) * 30));

/** Whole calendar days from today until the due date. */
function daysUntil(q: Quest) {
  const day = isDeadline(q) ? dueDay(q) : startOfDay(new Date(q.start_at));
  return Math.round((day.getTime() - startOfDay(new Date()).getTime()) / DAY);
}

/** "today", "tmrw", "9d" */
function shortDue(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "tmrw";
  return `${days}d`;
}

function dueLabel(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * Upcoming due dates and exams, each with how much work is done or planned for it compared with
 * roughly what it needs ("Assignment 2 · in 3 days · only 1h of ~6h planned").
 */
export function DueSoon({
  items,
  layers,
  onOpen,
  onPlan,
  hideTitle,
}: {
  items: Item[];
  layers: Map<string, CalendarLayer>;
  onOpen: (q: Quest) => void;
  onPlan: () => void;
  /** Inside the sidebar tabs the tab already says "Due". */
  hideTitle?: boolean;
}) {
  if (!items.length) return null;
  const behind = items.some((p) => p.share < 1 && daysUntil(p.quest) <= 7);

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <h3
          className={`text-[11px] font-medium uppercase tracking-wide text-muted ${hideTitle ? "invisible" : ""}`}
          title="Work on a subject earns up to +50% XP as its due date gets close."
        >
          Due soon
        </h3>
        {behind && (
          <button
            onClick={onPlan}
            title="Plan study time for these"
            className="flex items-center gap-1 rounded px-1 text-[11px] font-medium text-accent hover:bg-surface-hover"
          >
            <CalendarRange size={11} /> Plan
          </button>
        )}
      </div>
      <ul className="mt-1 space-y-0.5">
        {items.map((p) => {
          const { deadline, quest } = p;
          const days = daysUntil(quest);
          const covered = p.doneMinutes + p.plannedMinutes;
          const urgent = days <= 7 && p.share < 0.5;
          const color = layers.get(quest.calendar_id ?? "")?.color ?? "var(--color-muted)";
          const status =
            p.share >= 1
              ? `${hours(covered)} planned`
              : covered === 0
                ? `nothing planned · needs ~${hours(deadline.needMinutes)}`
                : `${urgent ? "only " : ""}${hours(covered)} of ~${hours(deadline.needMinutes)} planned`;
          const due = deadline.due.toLocaleString([], { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
          return (
            <li key={deadline.id}>
              <button
                onClick={() => onOpen(quest)}
                title={`${deadline.title}
Due ${due} (${dueLabel(days)})
${status}`}
                className="w-full rounded-md px-1 py-1 text-left text-xs hover:bg-surface-hover"
              >
                <span className="flex items-center gap-2">
                  <Flag size={11} className="shrink-0" style={{ color }} />
                  <span className="min-w-0 flex-1 truncate">{deadline.label}</span>
                  <span className={`shrink-0 text-[11px] tabular-nums ${days <= 2 ? "font-medium text-danger" : "text-faint"}`}>
                    {shortDue(days)}
                  </span>
                </span>
                <span className="mt-1 ml-[19px] flex items-center gap-1.5">
                  <span className="block h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className={`block h-full rounded-full ${p.share >= 1 ? "bg-xp" : urgent ? "bg-danger" : "bg-accent"}`}
                      style={{ width: `${Math.max(3, p.share * 100)}%` }}
                    />
                  </span>
                  {p.share >= 1 && <Check size={10} className="shrink-0 text-xp" />}
                </span>
                {/* Only spell it out when it needs attention. */}
                {urgent && <span className="mt-0.5 block truncate pl-[19px] text-[11px] text-danger">{status}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
