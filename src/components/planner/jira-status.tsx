"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import type { JiraTransition as Transition } from "@/lib/jira-issues";

export const STATUS_COLORS: Record<string, string> = {
  new: "var(--color-faint)",
  indeterminate: "var(--color-accent)",
  done: "var(--color-xp)",
};

/**
 * An issue's current status and the statuses Jira's workflow lets it move to. Picking one
 * changes it in Jira. Used by the Jira list and the right-click menus.
 */
export function JiraStatusList({
  issueKey,
  status,
  statusCategory,
  large,
  transitions,
  onChanged,
  onFailed,
}: {
  issueKey: string;
  /** Current status, if known ("To Do"). */
  status?: string;
  statusCategory?: string;
  large?: boolean;
  /** Already loaded with the issue list: no waiting for Jira. */
  transitions?: Transition[];
  /** Called straight away (the change is sent to Jira in the background). */
  onChanged: (to: Transition) => void;
  /** Jira refused or couldn't be reached. */
  onFailed?: (message: string) => void;
}) {
  const [fetched, setFetched] = useState<Transition[] | null>(null);
  const options = transitions ?? fetched;
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    if (transitions) return;
    fetch(`/api/jira/transitions?key=${encodeURIComponent(issueKey)}`)
      .then((r) => r.json())
      .then((res) => (res.error ? setError(res.error) : setFetched(res.transitions)))
      .catch(() => setError("Couldn't reach Jira."));
  }, [issueKey, transitions]);

  function move(t: Transition) {
    setMoving(t.id);
    onChanged(t);
    fetch("/api/jira/transitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: issueKey, id: t.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: "Couldn't reach Jira." }))
      .then((res) => {
        if (res.error) onFailed?.(res.error);
      });
  }

  const row = large ? "py-2" : "py-1.5";
  return (
    <div className={large ? "text-sm" : "text-sm"}>
      {status && (
        <div className={`flex items-center gap-2 px-2 ${row}`}>
          <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[statusCategory ?? "new"] }} />
          <span className="flex-1 font-medium">{status}</span>
          <Check size={13} className="text-muted" />
        </div>
      )}
      {status && <div className="my-1 h-px bg-line" />}
      {error && <p className={`px-2 text-danger ${row}`}>{error}</p>}
      {!options && !error && (
        <p className={`flex items-center gap-1.5 px-2 text-muted ${row}`}>
          <Loader2 size={12} className="animate-spin" /> Loading statuses…
        </p>
      )}
      {options
        ?.filter((t) => t.to !== status)
        .map((t) => (
          <button
            key={t.id}
            type="button"
            role="menuitem"
            disabled={!!moving}
            onClick={() => move(t)}
            className={`flex w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface disabled:opacity-50 ${row}`}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[t.toCategory] ?? STATUS_COLORS.new }} />
            <span className="flex-1">{t.to}</span>
            {t.name !== t.to && <span className="text-[11px] text-faint">{t.name}</span>}
            {moving === t.id && <Loader2 size={12} className="animate-spin text-muted" />}
          </button>
        ))}
      {options?.length === 0 && <p className={`px-2 text-muted ${row}`}>No status changes available.</p>}
    </div>
  );
}
