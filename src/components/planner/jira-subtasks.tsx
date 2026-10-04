"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatTime, startOfDay } from "@/lib/dates";
import { JIRA_DRAG_TYPE, type JiraIssue, type JiraTransition } from "@/lib/jira-issues";
import { JiraStatusList, STATUS_COLORS } from "./jira-status";

/**
 * Your subtasks of an issue, folded behind "2 subtasks". Tap one to plan it as a quest, drag it
 * onto the calendar (laptop), or tap its dot to change its status.
 */
export function JiraSubtasks({
  subtasks,
  planned,
  large,
  draggable,
  startOpen,
  onPlan,
  onStatusChanged,
  onStatusFailed,
}: {
  subtasks: JiraIssue[];
  planned: Map<string, Date>;
  large?: boolean;
  draggable?: boolean;
  /** Open from the start (e.g. under a parent that isn't yours, where they're all there is). */
  startOpen?: boolean;
  onPlan: (issue: JiraIssue) => void;
  onStatusChanged: (key: string, to: JiraTransition) => void;
  onStatusFailed?: (message: string) => void;
}) {
  const [open, setOpen] = useState(!!startOpen);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  if (!subtasks.length) return null;
  const today = startOfDay(new Date());

  return (
    <div className={`min-w-0 basis-full overflow-hidden ${large ? "pl-9" : "pl-3"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1 text-muted hover:text-ink ${large ? "py-1 text-xs" : "py-1 text-[11px]"}`}
      >
        <ChevronRight size={large ? 14 : 12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {subtasks.length} subtask{subtasks.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className={`mb-1.5 ml-1 border-l border-line pl-1 ${large ? "" : "space-y-0.5"}`}>
          {subtasks.map((sub) => {
            const planAt = planned.get(sub.key);
            const next = planAt && planAt >= today ? planAt : undefined;
            return (
              <li
                key={sub.key}
                draggable={draggable}
                onDragStart={(e) => {
                  e.dataTransfer.setData(JIRA_DRAG_TYPE, JSON.stringify(sub));
                  e.dataTransfer.setData("text/plain", `${sub.key}: ${sub.summary}`);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="flex min-w-0 flex-wrap items-center gap-x-1 rounded-md hover:bg-surface-hover"
              >
                <button
                  type="button"
                  onClick={() => setStatusFor((k) => (k === sub.key ? null : sub.key))}
                  aria-label={`Change status of ${sub.key} (${sub.status})`}
                  title={`${sub.status} · change status`}
                  className={`grid shrink-0 place-items-center rounded-full hover:bg-surface ${large ? "size-7" : "size-4"}`}
                >
                  <span
                    className={`rounded-full ${large ? "size-2" : "size-1.5"}`}
                    style={{ background: STATUS_COLORS[sub.statusCategory] ?? STATUS_COLORS.new }}
                  />
                </button>
                <button
                  onClick={() => onPlan(sub)}
                  title={`${sub.key}: ${sub.summary}\n${sub.status}`}
                  className={`min-w-0 flex-1 text-left ${large ? "py-1.5 text-sm" : "py-1 text-xs"}`}
                >
                  {/* Two lines for the title: the sidebar is narrow. */}
                  <span className="flex items-start gap-1.5">
                    <span className="shrink-0 text-muted">{sub.key}</span>
                    <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{sub.summary}</span>
                  </span>
                  {next && (
                    <span className="block truncate text-[10px] text-xp">
                      Planned {next.toLocaleDateString([], { weekday: "short" })} {formatTime(next)}
                    </span>
                  )}
                </button>
                {statusFor === sub.key && (
                  <div className="mb-1 basis-full rounded-md border border-line bg-canvas p-1 shadow-sm">
                    <JiraStatusList
                      issueKey={sub.key}
                      status={sub.status}
                      statusCategory={sub.statusCategory}
                      transitions={sub.transitions}
                      large={large}
                      onFailed={onStatusFailed}
                      onChanged={(to) => {
                        setStatusFor(null);
                        onStatusChanged(sub.key, to);
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
