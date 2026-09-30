"use client";

import { useState } from "react";
import { ExternalLink, GripVertical } from "lucide-react";
import { formatTime, startOfDay } from "@/lib/dates";
import { dueDate, JIRA_DRAG_TYPE, type JiraIssue } from "@/lib/jira-issues";

const DAY = 86_400_000;
const STATUS_COLORS: Record<string, string> = {
  new: "var(--color-faint)",
  indeterminate: "var(--color-accent)",
  done: "var(--color-xp)",
};

function dueLabel(due: string | null) {
  if (!due) return { text: "", urgent: false };
  const days = Math.round((dueDate(due).getTime() - startOfDay(new Date()).getTime()) / DAY);
  if (days < 0) return { text: `${-days}d late`, urgent: true };
  if (days === 0) return { text: "today", urgent: true };
  if (days === 1) return { text: "tmrw", urgent: true };
  return { text: `${days}d`, urgent: days <= 3 };
}

/**
 * Jira issues assigned to you, soonest due first. Drag one onto the calendar to plan it at that
 * time, or click it to choose a time in the quest window.
 */
export function JiraPanel({
  issues,
  error,
  planned,
  onPlan,
  draggable = true,
}: {
  issues: JiraIssue[];
  error?: string;
  /** When each issue is next planned as a quest. */
  planned: Map<string, Date>;
  onPlan: (issue: JiraIssue) => void;
  draggable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...issues].sort(
    (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.key.localeCompare(b.key),
  );
  const shown = expanded ? sorted : sorted.slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <h3
          className="text-[11px] font-medium uppercase tracking-wide text-muted"
          title={draggable ? "Drag an issue onto the calendar to plan it, or click to pick a time" : "Tap an issue to plan it"}
        >
          Jira
        </h3>
        {issues.length > 0 && <span className="text-[10px] text-faint">{issues.length} open</span>}
      </div>
      {error && <p className="px-1 pt-1 text-[11px] text-danger">{error}</p>}
      {!error && issues.length === 0 && <p className="px-1 pt-1 text-[11px] text-faint">Nothing assigned to you. Nice.</p>}
      <ul className="mt-1 space-y-0.5">
        {shown.map((issue) => {
          const due = dueLabel(issue.due);
          const planAt = planned.get(issue.key);
          // Only upcoming plans; yesterday's unfinished quest doesn't count.
          const next = planAt && planAt >= startOfDay(new Date()) ? planAt : undefined;
          return (
            <li
              key={issue.key}
              draggable={draggable}
              onDragStart={(e) => {
                e.dataTransfer.setData(JIRA_DRAG_TYPE, JSON.stringify(issue));
                e.dataTransfer.setData("text/plain", `${issue.key}: ${issue.summary}`);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="group flex items-center gap-1 rounded-md px-1 hover:bg-surface-hover"
            >
              {draggable && <GripVertical size={11} className="shrink-0 cursor-grab text-faint opacity-0 group-hover:opacity-100" />}
              <button
                onClick={() => onPlan(issue)}
                title={`${issue.key}: ${issue.summary}\n${issue.status}${issue.due ? ` · due ${dueDate(issue.due).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}` : ""}${next ? `\nPlanned ${next.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}`}
                className="min-w-0 flex-1 py-1 text-left text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[issue.statusCategory] ?? STATUS_COLORS.new }} />
                  <span className="shrink-0 font-medium text-muted">{issue.key}</span>
                  <span className="min-w-0 flex-1 truncate">{issue.summary}</span>
                  {due.text && (
                    <span className={`shrink-0 text-[11px] tabular-nums ${due.urgent ? "font-medium text-danger" : "text-faint"}`}>
                      {due.text}
                    </span>
                  )}
                </span>
                {next && (
                  <span className="block truncate pl-3 text-[10px] text-xp">
                    Planned {next.toLocaleDateString([], { weekday: "short" })} {formatTime(next)}
                  </span>
                )}
              </button>
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                title="Open in Jira"
                className="shrink-0 rounded p-0.5 text-faint opacity-0 hover:text-ink group-hover:opacity-100"
              >
                <ExternalLink size={11} />
              </a>
            </li>
          );
        })}
      </ul>
      {sorted.length > 5 && (
        <button onClick={() => setExpanded((x) => !x)} className="mt-0.5 px-1 text-[11px] text-accent hover:underline">
          {expanded ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}
