"use client";

import { useEffect } from "react";
import { CalendarDays, CalendarRange, Crown, ExternalLink, Flag, Plus, Swords, X } from "lucide-react";
import { bossOf } from "@/lib/boss";
import { BossBar, hpLabel } from "./boss-bar";
import { formatDuration, startOfDay } from "@/lib/dates";
import { dueAt, dueDay, shortTitle, type Quest } from "@/lib/quests";
import type { Deadline, DeadlineProgress } from "@/lib/urgency";

const DAY = 86_400_000;
const hours = (min: number) => formatDuration(Math.max(30, Math.round(min / 30) * 30));

/** Canvas puts the assignment details in the description and a link at the end ("🔗 …"). */
export function splitNotes(notes: string | null) {
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
  defeated,
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
  /** Its boss reward has already been claimed. */
  defeated: boolean;
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
  const upcoming = days >= 0;
  const boss = progress ? bossOf(progress, defeated) : null;
  const target = deadline?.subject ?? code ?? "this subject";

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

        {boss && (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              boss.defeated ? "border-xp/40 bg-xp-soft" : "border-danger/30 bg-danger-soft/50"
            }`}
          >
            <div className="flex items-center gap-2">
              {boss.defeated ? <Crown size={16} className="text-xp" /> : <Swords size={16} className="text-danger" />}
              <span className={`text-xs font-semibold uppercase tracking-wide ${boss.defeated ? "text-xp" : "text-danger"}`}>
                {boss.defeated ? "Boss defeated" : "Boss"}
              </span>
              <span className="ml-auto text-sm font-semibold tabular-nums">{hpLabel(boss)}</span>
            </div>
            <div className="mt-2">
              <BossBar boss={boss} size="lg" />
            </div>
            {boss.defeated ? (
              <p className="mt-2 text-sm">
                You beat it before the due date. <strong className="text-xp">+{boss.reward} XP</strong> earned.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink">
                  Every minute you study {target} deals 1 damage. Beat it before it&apos;s due for{" "}
                  <strong className="text-xp">+{boss.reward} XP</strong>.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Damage dealt", value: boss.damage },
                    { label: "Planned", value: boss.left - boss.leftAfterPlan },
                    { label: "Uncovered", value: boss.leftAfterPlan, warn: boss.leftAfterPlan > 0 && days <= 7 },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg bg-canvas/70 px-2 py-1.5">
                      <p className={`text-sm font-semibold tabular-nums ${stat.warn ? "text-danger" : ""}`}>
                        {stat.value ? hours(stat.value) : "0h"}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-3 rounded-lg bg-surface p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Due</p>
          <p className="mt-1 text-sm font-semibold">
            {due.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}
            {!quest.all_day && `, ${due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            <span className={`ml-2 text-xs font-normal ${upcoming && days <= 3 ? "font-medium text-danger" : "text-muted"}`}>{when}</span>
          </p>
        </div>

        {description ? (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Details</p>
            <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line break-words rounded-lg border border-line p-3 text-sm text-ink">
              <Linkified text={description} />
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

        {upcoming && !boss?.defeated && (
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

/** Text with its web links clickable (only http/https, opened in a new tab). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 hover:decoration-accent">
            {part.length > 60 ? `${part.slice(0, 57)}…` : part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
