"use client";

import { Check, ExternalLink, GripVertical } from "lucide-react";
import { formatTime, startOfDay } from "@/lib/dates";
import { TASK_APPS, TASK_DRAG_TYPE, type ExternalTask, type TaskProvider } from "@/lib/task-apps";
import { TaskBadge } from "./task-badge";

const DAY = 86_400_000;

function dueIn(due: string | null) {
  if (!due) return null;
  const [y, m, d] = due.split("-").map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - startOfDay(new Date()).getTime()) / DAY);
  return { days, text: days < 0 ? `${-days}d late` : days === 0 ? "today" : days === 1 ? "tmrw" : `${days}d` };
}

const sortTasks = (tasks: ExternalTask[]) =>
  [...tasks].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title));

type Props = {
  tasks: ExternalTask[];
  errors: Partial<Record<TaskProvider, string>>;
  /** When each task is next planned as a quest, by "provider:id". */
  planned: Map<string, Date>;
  onPlan: (task: ExternalTask) => void;
  onDone: (task: ExternalTask) => void;
  /** Phones: bigger rows and no dragging. */
  large?: boolean;
};

/** Tasks from connected apps (Todoist, GitHub, Trello…), soonest due first. */
export function TaskList({ tasks, errors, planned, onPlan, onDone, large }: Props) {
  const today = startOfDay(new Date());
  const errorList = Object.entries(errors) as [TaskProvider, string][];
  return (
    <div>
      {errorList.map(([p, e]) => (
        <p key={p} className={`text-danger ${large ? "px-4 py-2 text-sm" : "px-1 pt-1 text-[11px]"}`}>
          {TASK_APPS[p].name}: {e}
        </p>
      ))}
      <ul className={large ? "divide-y divide-line" : "mt-1 space-y-0.5"}>
        {sortTasks(tasks).map((t) => {
          const due = dueIn(t.due);
          const planAt = planned.get(`${t.provider}:${t.id}`);
          const next = planAt && planAt >= today ? planAt : undefined;
          return (
            <li
              key={`${t.provider}:${t.id}`}
              draggable={!large}
              onDragStart={(e) => {
                e.dataTransfer.setData(TASK_DRAG_TYPE, JSON.stringify(t));
                e.dataTransfer.setData("text/plain", t.title);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`group flex items-center ${large ? "gap-3 px-4 py-3" : "gap-1 rounded-md px-1 hover:bg-surface-hover"}`}
            >
              {!large && <GripVertical size={11} className="shrink-0 cursor-grab text-faint opacity-0 group-hover:opacity-100" />}
              <button
                type="button"
                onClick={() => onDone(t)}
                title={`Mark done in ${TASK_APPS[t.provider].name}`}
                aria-label={`Mark “${t.title}” done in ${TASK_APPS[t.provider].name}`}
                className={`grid shrink-0 place-items-center border-2 border-line text-transparent transition hover:border-xp hover:text-xp active:scale-90 ${
                  large ? "size-8 rounded-lg" : "size-4 rounded"
                }`}
              >
                <Check size={large ? 16 : 10} strokeWidth={3} />
              </button>
              <button onClick={() => onPlan(t)} className={`min-w-0 flex-1 text-left ${large ? "" : "py-1 text-xs"}`}>
                <span className="flex items-center gap-1.5">
                  <TaskBadge provider={t.provider} label={t.ref} />
                  <span className={`min-w-0 flex-1 truncate ${large ? "font-medium" : ""}`}>{t.title}</span>
                  {due && !large && (
                    <span className={`shrink-0 text-[11px] tabular-nums ${due.days <= 2 ? "font-medium text-danger" : "text-faint"}`}>{due.text}</span>
                  )}
                </span>
                {(large || next) && (
                  <span className={`block truncate ${large ? "mt-0.5 text-xs text-muted" : "pl-1 text-[10px] text-xp"}`}>
                    {large && [t.where, t.status, due && `due ${due.text === "tmrw" ? "tomorrow" : due.text}`].filter(Boolean).join(" · ")}
                    {next && (
                      <span className="text-xp">
                        {large ? " · " : ""}planned {next.toLocaleDateString([], { weekday: "short" })} {formatTime(next)}
                      </span>
                    )}
                  </span>
                )}
              </button>
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                title={`Open in ${TASK_APPS[t.provider].name}`}
                className={`shrink-0 text-faint hover:text-ink ${large ? "p-1.5" : "rounded p-0.5 opacity-0 group-hover:opacity-100"}`}
              >
                <ExternalLink size={large ? 16 : 11} />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
