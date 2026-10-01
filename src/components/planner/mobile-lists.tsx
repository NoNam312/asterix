"use client";

import { useState } from "react";
import { CalendarRange, Crown, ExternalLink, Swords } from "lucide-react";
import { formatTime, startOfDay } from "@/lib/dates";
import { bossOf } from "@/lib/boss";
import { dueDate, withoutKey, type JiraIssue, type JiraTransition } from "@/lib/jira-issues";
import { dueDay, isDeadline, type Quest } from "@/lib/quests";
import type { DeadlineProgress } from "@/lib/urgency";
import { BossBar, hpLabel } from "./boss-bar";
import { JiraKeyBadge } from "./jira-key-badge";
import { JiraStatusList, STATUS_COLORS } from "./jira-status";

// Phone versions of the Due and Jira lists, laid out like the Quests list (full-width rows).

const DAY = 86_400_000;

function daysFromToday(day: Date) {
  return Math.round((day.getTime() - startOfDay(new Date()).getTime()) / DAY);
}

function inDays(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

export function MobileBossList({
  items,
  defeated,
  onOpen,
  onPlan,
}: {
  items: (DeadlineProgress & { quest: Quest })[];
  defeated: Set<string>;
  onOpen: (q: Quest) => void;
  onPlan: () => void;
}) {
  if (!items.length) {
    return <p className="px-6 py-16 text-center text-sm text-faint">No due dates in the next 3 weeks.</p>;
  }
  const behind = items.some((p) => p.share < 1 && !defeated.has(p.deadline.id));
  return (
    <div>
      <ul className="divide-y divide-line">
        {items.map((p) => {
          const { deadline, quest } = p;
          const boss = bossOf(p, defeated.has(deadline.id));
          const days = daysFromToday(isDeadline(quest) ? dueDay(quest) : startOfDay(new Date(quest.start_at)));
          const [code, ...rest] = deadline.label.includes(" · ") ? deadline.label.split(" · ") : ["", deadline.label];
          return (
            <li key={deadline.id}>
              <button onClick={() => onOpen(quest)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface">
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                    boss.defeated ? "bg-xp-soft text-xp" : "bg-danger-soft text-danger"
                  }`}
                >
                  {boss.defeated ? <Crown size={16} /> : <Swords size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${boss.defeated ? "text-muted line-through" : ""}`}>
                    {rest.join(" · ")}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {code && `${code} · `}
                    <span className={days <= 2 && !boss.defeated ? "font-medium text-danger" : ""}>{inDays(days)}</span>
                    {" · "}
                    <span className={boss.defeated ? "font-medium text-xp" : ""}>
                      {boss.defeated ? `Defeated · +${boss.reward} XP` : hpLabel(boss)}
                    </span>
                  </span>
                  <span className="mt-1.5 block">
                    <BossBar boss={boss} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {behind && (
        <button
          onClick={onPlan}
          className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-lg border border-line py-2.5 text-sm font-medium text-accent active:bg-surface"
        >
          <CalendarRange size={16} /> Plan study time for these
        </button>
      )}
      <p className="px-6 pt-3 text-center text-xs text-faint">
        Each due date is a boss. Study its subject to deal damage, and beat it in time for bonus XP.
      </p>
    </div>
  );
}

export function MobileJiraList({
  issues,
  error,
  planned,
  onPlan,
  onStatusChanged,
  onStatusFailed,
}: {
  issues: JiraIssue[];
  error?: string;
  planned: Map<string, Date>;
  onPlan: (issue: JiraIssue) => void;
  onStatusChanged: (key: string, to: JiraTransition) => void;
  onStatusFailed?: (message: string) => void;
}) {
  const [statusFor, setStatusFor] = useState<string | null>(null);
  if (error) return <p className="px-6 py-16 text-center text-sm text-danger">{error}</p>;
  if (!issues.length) return <p className="px-6 py-16 text-center text-sm text-faint">Nothing assigned to you. Nice.</p>;
  const sorted = [...issues].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.key.localeCompare(b.key));
  const today = startOfDay(new Date());

  return (
    <div>
      <ul className="divide-y divide-line">
        {sorted.map((issue) => {
          const planAt = planned.get(issue.key);
          const next = planAt && planAt >= today ? planAt : undefined;
          const days = issue.due ? daysFromToday(dueDate(issue.due)) : null;
          const open = statusFor === issue.key;
          return (
            <li key={issue.key} className="flex flex-wrap items-center gap-x-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setStatusFor(open ? null : issue.key)}
                aria-label={`Change status of ${issue.key} (${issue.status})`}
                aria-expanded={open}
                className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 transition active:scale-90 ${
                  open ? "border-accent" : "border-line"
                }`}
              >
                <span className="size-3 rounded-full" style={{ background: STATUS_COLORS[issue.statusCategory] ?? STATUS_COLORS.new }} />
              </button>
              <button onClick={() => onPlan(issue)} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1.5">
                  <JiraKeyBadge issueKey={issue.key} />
                  <span className="truncate font-medium">{withoutKey(issue.summary, issue.key)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {issue.status}
                  {days !== null && (
                    <>
                      {" · "}
                      <span className={days <= 2 ? "font-medium text-danger" : ""}>{inDays(days)}</span>
                    </>
                  )}
                  {next && (
                    <span className="text-xp">
                      {" · "}planned {next.toLocaleDateString([], { weekday: "short" })} {formatTime(next)}
                    </span>
                  )}
                </span>
              </button>
              <a href={issue.url} target="_blank" rel="noreferrer" aria-label={`Open ${issue.key} in Jira`} className="shrink-0 p-1.5 text-faint">
                <ExternalLink size={16} />
              </a>
              {open && (
                <div className="mt-2 basis-full rounded-lg border border-line bg-canvas p-1">
                  <JiraStatusList
                    issueKey={issue.key}
                    status={issue.status}
                    statusCategory={issue.statusCategory}
                    transitions={issue.transitions}
                    large
                    onFailed={onStatusFailed}
                    onChanged={(to) => {
                      setStatusFor(null);
                      onStatusChanged(issue.key, to);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-6 pt-3 text-center text-xs text-faint">Tap an issue to plan it · tap the square to change its status.</p>
    </div>
  );
}
