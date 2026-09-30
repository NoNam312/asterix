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
}: {
  items: Item[];
  layers: Map<string, CalendarLayer>;
  onOpen: (q: Quest) => void;
  onPlan: () => void;
}) {
  if (!items.length) return null;
  const behind = items.some((p) => p.share < 1 && daysUntil(p.quest) <= 7);

  return (
    <div>
      <h3 className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted">Due soon</h3>
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
          return (
            <li key={deadline.id}>
              <button
                onClick={() => onOpen(quest)}
                title={`${deadline.title}\nDue ${deadline.due.toLocaleString([], { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${p.doneMinutes ? `\n${hours(p.doneMinutes)} done` : ""}${p.plannedMinutes ? `\n${hours(p.plannedMinutes)} still to do` : ""}`}
                className="w-full rounded-md px-1 py-1 text-left text-xs hover:bg-surface-hover"
              >
                <span className="flex items-center gap-2">
                  <Flag size={11} className="shrink-0" style={{ color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{deadline.label}</span>
                </span>
                <span className="mt-0.5 block truncate pl-[19px] text-[11px]">
                  <span className={days <= 2 ? "font-medium text-danger" : "text-muted"}>Due {dueLabel(days)}</span>
                  <span className={urgent ? "text-danger" : "text-faint"}>
                    {" · "}
                    {p.share >= 1 && <Check size={10} className="mr-0.5 inline text-xp" />}
                    {status}
                  </span>
                </span>
                <span className="mt-1 ml-[19px] block h-1 overflow-hidden rounded-full bg-line">
                  <span
                    className={`block h-full rounded-full ${p.share >= 1 ? "bg-xp" : urgent ? "bg-danger" : "bg-accent"}`}
                    style={{ width: `${Math.max(3, p.share * 100)}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {behind && (
        <button
          onClick={onPlan}
          className="mt-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] font-medium text-accent hover:bg-surface-hover"
        >
          <CalendarRange size={12} />
          Plan study time for these
        </button>
      )}
      <p className="mt-1 px-1 text-[10px] leading-snug text-faint">
        Work on a subject earns up to +50% XP as its due date gets close.
      </p>
    </div>
  );
}
