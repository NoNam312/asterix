"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GripVertical, Loader2 } from "lucide-react";
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
  hideTitle,
  onStatusChanged,
}: {
  issues: JiraIssue[];
  error?: string;
  /** When each issue is next planned as a quest. */
  planned: Map<string, Date>;
  onPlan: (issue: JiraIssue) => void;
  draggable?: boolean;
  /** Inside the sidebar tabs: no heading, and every issue is listed (the tab scrolls). */
  hideTitle?: boolean;
  /** After the status was changed in Jira. */
  onStatusChanged: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  const sorted = [...issues].sort(
    (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.key.localeCompare(b.key),
  );
  const shown = expanded || hideTitle ? sorted : sorted.slice(0, 5);

  return (
    <div>
      <div className={`flex items-center justify-between px-1 ${hideTitle ? "hidden" : ""}`}>
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
              className="group flex flex-wrap items-center gap-x-1 rounded-md px-1 hover:bg-surface-hover"
            >
              {draggable && <GripVertical size={11} className="shrink-0 cursor-grab text-faint opacity-0 group-hover:opacity-100" />}
              <button
                type="button"
                onClick={() => setStatusFor((k) => (k === issue.key ? null : issue.key))}
                title={`${issue.status} · change status`}
                aria-label={`Change status of ${issue.key} (${issue.status})`}
                aria-expanded={statusFor === issue.key}
                className={`grid shrink-0 place-items-center rounded-full hover:bg-surface ${draggable ? "size-4" : "size-7"}`}
              >
                <span
                  className={`rounded-full ${draggable ? "size-1.5" : "size-2.5"} ${statusFor === issue.key ? "ring-2 ring-accent-soft" : ""}`}
                  style={{ background: STATUS_COLORS[issue.statusCategory] ?? STATUS_COLORS.new }}
                />
              </button>
              <button
                onClick={() => onPlan(issue)}
                title={`${issue.key}: ${issue.summary}\n${issue.status}${issue.due ? ` · due ${dueDate(issue.due).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}` : ""}${next ? `\nPlanned ${next.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}`}
                // Phones (no dragging) get bigger rows for thumbs.
                className={`min-w-0 flex-1 text-left ${draggable ? "py-1 text-xs" : "py-2.5 text-sm"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="shrink-0 font-medium text-muted">{issue.key}</span>
                  <span className="min-w-0 flex-1 truncate">{issue.summary}</span>
                  {due.text && (
                    <span className={`shrink-0 text-[11px] tabular-nums ${due.urgent ? "font-medium text-danger" : "text-faint"}`}>
                      {due.text}
                    </span>
                  )}
                </span>
                {next && (
                  <span className="block truncate text-[10px] text-xp">
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
              {statusFor === issue.key && (
                <StatusMenu
                  issue={issue}
                  large={!draggable}
                  onDone={(changed) => {
                    setStatusFor(null);
                    if (changed) onStatusChanged(issue.key);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      {sorted.length > 5 && !hideTitle && (
        <button onClick={() => setExpanded((x) => !x)} className="mt-0.5 px-1 text-[11px] text-accent hover:underline">
          {expanded ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

type Transition = { id: string; name: string; to: string; toCategory: string };

/** The statuses an issue can move to (from Jira's workflow), shown under its row. */
function StatusMenu({ issue, large, onDone }: { issue: JiraIssue; large: boolean; onDone: (changed: boolean) => void }) {
  const [options, setOptions] = useState<Transition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/jira/transitions?key=${encodeURIComponent(issue.key)}`)
      .then((r) => r.json())
      .then((res) => (res.error ? setError(res.error) : setOptions(res.transitions)))
      .catch(() => setError("Couldn't reach Jira."));
  }, [issue.key]);

  async function move(t: Transition) {
    setMoving(t.id);
    const res = await fetch("/api/jira/transitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: issue.key, id: t.id }),
    }).then((r) => r.json()).catch(() => ({ error: "Couldn't reach Jira." }));
    setMoving(null);
    if (res.error) return setError(res.error);
    onDone(true);
  }

  return (
    <div className={`mb-1 basis-full rounded-md border border-line bg-canvas p-1 shadow-sm ${large ? "text-sm" : "text-xs"}`}>
      <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
        {issue.key} is {issue.status || "open"} · move to
      </p>
      {error && <p className="px-1.5 py-1 text-danger">{error}</p>}
      {!options && !error && (
        <p className="flex items-center gap-1.5 px-1.5 py-1 text-muted">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </p>
      )}
      {options?.filter((t) => t.to !== issue.status).map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={!!moving}
          onClick={() => move(t)}
          className={`flex w-full items-center gap-2 rounded px-1.5 text-left hover:bg-surface disabled:opacity-50 ${large ? "py-2" : "py-1"}`}
        >
          <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[t.toCategory] ?? STATUS_COLORS.new }} />
          <span className="flex-1">{t.to}</span>
          {t.name !== t.to && <span className="text-[10px] text-faint">{t.name}</span>}
          {moving === t.id && <Loader2 size={12} className="animate-spin text-muted" />}
        </button>
      ))}
      {options?.length === 0 && <p className="px-1.5 py-1 text-muted">No status changes available.</p>}
    </div>
  );
}
