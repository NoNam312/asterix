"use client";

import { Check, Play, Repeat, X } from "lucide-react";
import { jiraKeyOf, withoutKey } from "@/lib/jira-issues";
import { JiraKeyBadge } from "./jira-key-badge";
import { formatDuration, formatTime } from "@/lib/dates";
import type { Rank } from "@/lib/difficulty";
import { CATEGORIES, type Quest, type QuestStatus } from "@/lib/quests";
import { RankBadge } from "./rank-badge";

type Props = {
  quests: Quest[];
  onOpen: (quest: Quest) => void;
  onStatus: (id: string, status: QuestStatus) => void;
  onNew: () => void;
};

/** Phone-friendly list of the selected day's quests, with big tap targets. */
export function MobileQuestList({ quests, onOpen, onStatus, onNew }: Props) {
  if (quests.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted">No quests planned for this day.</p>
        <button
          onClick={onNew}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Plan a quest
        </button>
      </div>
    );
  }

  return (
    <ul className="flex-1 divide-y divide-line overflow-y-auto">
      {quests.map((q) => {
        const cat = CATEGORIES[q.category];
        const done = q.status === "completed";
        const failed = q.status === "failed";
        const start = new Date(q.start_at);
        return (
          <li key={q.id} className="flex items-center gap-3 px-4 py-3">
            <button
              aria-label={done ? "Undo complete" : "Mark complete"}
              disabled={failed}
              onClick={() => onStatus(q.id, done ? "planned" : "completed")}
              className="grid size-8 shrink-0 place-items-center rounded-lg border-2 transition active:scale-90 disabled:opacity-40"
              style={{
                borderColor: failed ? "var(--color-danger)" : cat.color,
                background: done ? cat.color : failed ? "var(--color-danger-soft)" : "transparent",
              }}
            >
              {done && <Check size={16} strokeWidth={3} className="text-white" />}
              {failed && <X size={16} strokeWidth={3} className="text-danger" />}
            </button>

            <button onClick={() => onOpen(q)} className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-1.5">
                {q.difficulty && <RankBadge rank={q.difficulty as Rank} />}
                {jiraKeyOf(q.notes) && <JiraKeyBadge issueKey={jiraKeyOf(q.notes)!} />}
                <span className={`truncate font-medium ${done || failed ? "text-muted line-through" : ""}`}>
                  {jiraKeyOf(q.notes) ? withoutKey(q.title, jiraKeyOf(q.notes)!) : q.title}
                </span>
                {q.recurrence_id && <Repeat size={12} className="shrink-0 text-muted" aria-label="Repeats" />}

              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {formatTime(start)} · {formatDuration(q.duration_min)} ·{" "}
                <span className={failed ? "text-danger" : done ? "font-medium text-xp" : ""}>
                  {failed ? `−${q.xp_penalty}` : `${done ? "+" : ""}${q.xp}`} XP
                </span>
              </span>
            </button>

            {q.status === "planned" && (
              <button
                aria-label="Start quest"
                onClick={() => onStatus(q.id, "active")}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent active:scale-90"
              >
                <Play size={15} fill="currentColor" />
              </button>
            )}
            {q.status === "active" && (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[11px] font-semibold text-accent">
                Running
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
