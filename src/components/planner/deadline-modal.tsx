"use client";

import { useEffect } from "react";
import { CalendarDays, CalendarRange, ExternalLink, Flag, Plus, X } from "lucide-react";
import { formatDuration, startOfDay } from "@/lib/dates";
import { dueAt, dueDay, shortTitle, type Quest } from "@/lib/quests";
import type { Deadline, DeadlineProgress } from "@/lib/urgency";

const DAY = 86_400_000;
const hours = (min: number) => formatDuration(Math.max(30, Math.round(min / 30) * 30));

/** Canvas puts the assignment details in the description and a link at the end ("🔗 …"). */
function splitNotes(notes: string | null) {
  const lines = (notes ?? "").split("\n");
  const url = lines.find((l) => l.startsWith("🔗 "))?.slice(3).trim();
  const description = lines
    .filter((l) => !l.startsWith("🔗 ") && !l.startsWith("📍 "))
    .join("\n")
    .trim();
  return { url: url && /^https?:\/\//.test(url) ? url : undefined, description };
}

/**
 * A due date from Canvas (or another calendar): what it is, when it's due, how much work is
 * planned for it, and buttons to plan study time.
 */
export function DeadlineModal({
  quest,
  source,
  color,
  deadline,
  progress,
  onPlanWeek,
  onAddSession,
  onClose,
}: {
  quest: Quest;
  /** Calendar layer it came from. */
  source?: string;
  color?: string;
  /** What the deadline bonus knows about it (subject, estimated work). */
  deadline?: Deadline;
  progress?: DeadlineProgress;
  onPlanWeek: () => void;
  onAddSession: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = shortTitle(quest.title);
  const [code, ...rest] = label.includes(" · ") ? label.split(" · ") : [null, label];
  const name = rest.join(" · ");
  const due = dueAt(quest);
  const days = Math.round((dueDay(quest).getTime() - startOfDay(new Date()).getTime()) / DAY);
  const when = days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const { url, description } = splitNotes(quest.notes);
  const covered = progress ? progress.doneMinutes + progress.plannedMinutes : 0;
  const need = deadline?.needMinutes ?? 0;
  const share = need ? Math.min(1, covered / need) : 0;
  const upcoming = days >= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-canvas p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-xl sm:pb-5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: `${color ?? "#64748b"}1f`, color }}>
            <Flag size={12} /> Due date
          </span>
          {code && <span className="text-xs font-medium text-muted">{code}</span>}
          <button onClick={onClose} aria-label="Close" className="ml-auto rounded p-1 text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>

        <h2 className="mt-3 text-xl font-semibold leading-snug">{name}</h2>
        {deadline?.subject && <p className="mt-0.5 text-sm text-muted">{deadline.subject}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Due</p>
            <p className="mt-1 text-sm font-semibold">
              {due.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
              {!quest.all_day && `, ${due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            </p>
            <p className={`text-xs ${upcoming && days <= 3 ? "font-medium text-danger" : "text-muted"}`}>{when}</p>
          </div>
          <div className="rounded-lg bg-surface p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Work planned</p>
            {need ? (
              <>
                <p className="mt-1 text-sm font-semibold">
                  {covered ? hours(covered) : "0h"} <span className="font-normal text-muted">of ~{hours(need)}</span>
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${share >= 1 ? "bg-xp" : days <= 7 && share < 0.5 ? "bg-danger" : "bg-accent"}`}
                    style={{ width: `${Math.max(3, share * 100)}%` }}
                  />
                </div>
                {progress && progress.doneMinutes > 0 && (
                  <p className="mt-1 text-[11px] text-muted">{hours(progress.doneMinutes)} done already</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">—</p>
            )}
          </div>
        </div>

        {description ? (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Details</p>
            <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line rounded-lg border border-line p-3 text-sm text-ink">
              {description}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-faint">No details in the calendar feed for this one.</p>
        )}

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <CalendarDays size={12} /> From {source ?? "a calendar"}
          </span>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
              Open in Canvas <ExternalLink size={11} />
            </a>
          )}
        </p>

        {upcoming && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              onClick={onPlanWeek}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <CalendarRange size={14} /> Plan study time
            </button>
            <button
              onClick={onAddSession}
              className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-ink"
            >
              <Plus size={14} /> Add one session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
