"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ExternalLink, Flag, Play, Repeat, RotateCcw, Trash2, X } from "lucide-react";
import { RankBadge } from "./rank-badge";
import { JiraKeyBadge } from "./jira-key-badge";
import { jiraKeyOf, joinJiraNotes, splitJiraNotes } from "@/lib/jira-issues";
import { splitTaskNotes, TASK_APPS } from "@/lib/task-apps";
import { TaskBadge } from "./task-badge";
import { formatDuration } from "@/lib/dates";
import { assessQuest } from "@/lib/difficulty";
import { CATEGORIES, CATEGORY_KEYS, failRevisableUntil, type Category, type QuestStatus } from "@/lib/quests";
import { ScorePanel } from "./score-panel";
import { scoreQuest, type UrgencyContext } from "@/lib/urgency";
import {
  describeRepeat,
  EVERY_DAY,
  repeatPreset,
  WEEK_ORDER,
  WEEKDAYS,
  type Weekday,
} from "@/lib/recurrence";
import type { Scope } from "@/lib/recurring";

export type QuestDraft = {
  id?: string;
  title: string;
  category: Category;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  notes: string;
  status: QuestStatus;
  /** XP already locked in for a finished quest. */
  xp?: number;
  /** XP lost when this quest failed. */
  penalty?: number;
  /** Name of the calendar layer this was imported from (read-only when set). */
  source?: string;
  kind?: "task" | "deadline";
  /** Days it repeats on (null = doesn't repeat). */
  repeat?: Weekday[] | null;
  /** The series this quest belongs to, if it repeats. */
  recurrenceId?: string | null;
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

type Props = {
  draft: QuestDraft;
  onClose: () => void;
  /** Resolves to an error message if saving failed. */
  onSave: (draft: QuestDraft, scope: Scope) => Promise<string | undefined>;
  onDelete: (id: string, scope: Scope) => Promise<string | undefined>;
  onStatus: (id: string, status: QuestStatus) => Promise<string | undefined>;
  /** Upcoming deadlines, for the deadline bonus. */
  urgency: UrgencyContext;
  /** False until 014_recurring_quests.sql has been run. */
  canRepeat: boolean;
};

export function QuestModal({ draft: initial, onClose, onSave, onDelete, onStatus, urgency, canRepeat }: Props) {
  const [draft, setDraft] = useState(initial);
  // The title box grows to fit its text.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.title]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // New quests pick their category from the title until you choose one yourself.
  const [categoryPicked, setCategoryPicked] = useState(!!initial.id);
  const [autoCategory, setAutoCategory] = useState(false);
  const isNew = !initial.id;
  const [repeatMode, setRepeatMode] = useState(() =>
    repeatPreset(initial.repeat ?? null, new Date(`${initial.date}T12:00`).getDay() as Weekday),
  );
  const questWeekday = new Date(`${draft.date}T12:00`).getDay() as Weekday;
  const [pickedScope, setScope] = useState<Scope>("this");
  // Kept out of the way until wanted: the full score breakdown, and repeat & notes.
  const [showScore, setShowScore] = useState(false);
  const [showMore, setShowMore] = useState(
    !!initial.recurrenceId ||
      !!initial.repeat ||
      !!(splitJiraNotes(initial.notes ?? "").jira ? splitJiraNotes(initial.notes ?? "") : splitTaskNotes(initial.notes ?? "")).body,
  );
  const repeating = !!initial.recurrenceId;
  const repeatChanged =
    (initial.repeat ?? []).length !== (draft.repeat ?? []).length ||
    (draft.repeat ?? []).some((d) => !(initial.repeat ?? []).includes(d));
  // Changing how it repeats always affects the upcoming ones.
  const scope: Scope = repeating && repeatChanged ? "future" : pickedScope;
  const set = <K extends keyof QuestDraft>(key: K, value: QuestDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    setError(await onSave({ ...draft, title: draft.title.trim() }, scope));
    setSaving(false);
  }

  async function changeStatus(status: QuestStatus) {
    setSaving(true);
    setError(await onStatus(initial.id!, status));
    setSaving(false);
  }

  const finished = initial.status === "completed" || initial.status === "failed";
  // A failed quest can be changed until 9am the morning after its day.
  const failOpen = new Date() < failRevisableUntil({ start_at: new Date(`${initial.date}T${initial.time}`).toISOString() });
  // Jira quests: the issue's lines are shown as a Jira row; the notes box holds only the user's text.
  const jiraParts = splitJiraNotes(draft.notes);
  const taskParts = jiraParts.jira ? null : splitTaskNotes(draft.notes);
  // Either kind of linked task: its lines are kept, only the user's own text is editable.
  const notesParts = {
    jira: jiraParts.jira ?? (taskParts?.task ? { ...taskParts.task } : null),
    body: jiraParts.jira ? jiraParts.body : (taskParts?.body ?? draft.notes),
  };
  const appTask = taskParts?.task ?? null;
  const jiraKey = notesParts.jira ? jiraKeyOf(draft.notes) : null;
  // Imported calendar events follow their feed, so their details are read-only.
  const imported = !!initial.source;
  const assessment = scoreQuest(
    {
      id: initial.id,
      title: draft.title,
      notes: draft.notes,
      category: draft.category,
      durationMin: draft.duration,
      start: new Date(`${draft.date}T${draft.time}`),
      calendarId: imported ? "imported" : null,
      kind: draft.kind,
    },
    urgency,
  );
  const deadline = initial.kind === "deadline";
  const when = new Date(`${draft.date}T${draft.time}`);

  const durationOptions = DURATIONS.includes(draft.duration)
    ? DURATIONS
    : [...DURATIONS, draft.duration].sort((a, b) => a - b);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-canvas p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-xl sm:pb-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">
            {deadline ? "Due date" : imported ? "Class" : isNew ? "New quest" : "Edit quest"}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>

        {/* A textarea so long titles (e.g. Jira issues) wrap instead of being cut off. */}
        <textarea
          ref={titleRef}
          rows={1}
          autoFocus={!imported}
          readOnly={imported}
          value={draft.title}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          onChange={(e) => {
            const title = e.target.value;
            if (categoryPicked) return set("title", title);
            const suggested = assessQuest({
              title,
              notes: draft.notes,
              category: draft.category,
              durationMin: draft.duration,
            }).suggestedCategory;
            setAutoCategory(!!suggested);
            setDraft((d) => ({ ...d, title, category: suggested ?? d.category }));
          }}
          placeholder="What's the quest? e.g. Chemistry past paper"
          maxLength={200}
          className="input-large mt-2 block w-full resize-none overflow-hidden border-none bg-transparent text-lg font-semibold leading-snug outline-none placeholder:text-faint"
        />

        {appTask && (
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <TaskBadge provider={appTask.provider} />
            <span className="min-w-0 flex-1 truncate">{appTask.summary}</span>
            {appTask.url && (
              <a href={appTask.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-accent">
                Open in {TASK_APPS[appTask.provider].name} <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}

        {jiraKey && notesParts.jira && (
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <JiraKeyBadge issueKey={jiraKey} />
            <span className="min-w-0 flex-1 truncate">{notesParts.jira.summary.replace(/ · due .*/, "")}</span>
            {notesParts.jira.url && (
              <a href={notesParts.jira.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-accent">
                Open in Jira <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}

        {imported && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-surface px-3 py-2 text-xs text-muted">
            <CalendarDays size={13} className="mt-0.5 shrink-0" />
            <span>
              {deadline ? "Due " : ""}
              {when.toLocaleString([], { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              {!deadline && ` · ${formatDuration(draft.duration)}`}. From <strong>{initial.source}</strong>, synced
              automatically.{" "}
              {deadline
                ? "Due dates are markers with no XP; plan quests before it to earn XP."
                : "To stop importing this class every week, right-click it (or hold it on a phone) → Stop importing."}
            </span>
          </p>
        )}
        {draft.notes && imported && <p className="mt-2 text-sm text-muted">{draft.notes}</p>}

        {draft.title.trim() && !deadline && (
          <button
            type="button"
            onClick={() => setShowScore((v) => !v)}
            aria-expanded={showScore}
            className="mt-3 flex w-full items-center gap-2 rounded-lg bg-surface px-3 py-2 text-left text-sm hover:bg-surface-hover"
          >
            <RankBadge rank={assessment.rank} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                Rank {assessment.rank} ·{" "}
                {initial.status === "failed" ? (
                  <span className="text-danger">−{initial.penalty ?? 0} XP</span>
                ) : (
                  <span className="text-xp">+{finished && initial.xp !== undefined ? initial.xp : assessment.xp} XP</span>
                )}
                {assessment.urgency && (
                  <span className="ml-1.5 text-xs font-medium text-accent">+{Math.round(assessment.urgency.bonus * 100)}% due soon</span>
                )}
              </span>
              <span className="block truncate text-xs text-muted">
                {assessment.detected
                  .filter((d) => d.kind === "subject" || d.kind === "task")
                  .map((d) => d.label)
                  .join(" · ") || "Tap to see how it's scored"}
              </span>
            </span>
            <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${showScore ? "rotate-180" : ""}`} />
          </button>
        )}
        {draft.title.trim() && !deadline && !showScore && assessment.warning && (
          <p className="mt-2 text-xs text-gold-ink">⚠ {assessment.warning}</p>
        )}
        {draft.title.trim() && !deadline && showScore && (
          <ScorePanel
            assessment={assessment}
            minutes={draft.duration}
            xpLabel={
              initial.status === "failed" ? (
                <span className="text-danger">
                  −{initial.penalty ?? 0} XP <span className="text-xs font-normal text-muted">(failed)</span>
                </span>
              ) : (
                <span className="text-xp">
                  +{finished && initial.xp !== undefined ? initial.xp : assessment.xp} XP
                  {finished && <span className="ml-1 text-xs font-normal text-muted">(earned)</span>}
                </span>
              )
            }
          />
        )}

        {!imported && (
        <>
        <div className="-mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORY_KEYS.map((key) => {
            const cat = CATEGORIES[key];
            const active = draft.category === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  set("category", key);
                  setCategoryPicked(true);
                  setAutoCategory(false);
                }}
                className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition"
                style={
                  active
                    ? { background: cat.soft, borderColor: cat.color, color: cat.color }
                    : { borderColor: "var(--color-line)", color: "var(--color-muted)" }
                }
              >
                {cat.label}
              </button>
            );
          })}
        </div>
        {/* Under the chips, so it never runs off the end of the scrolling row. */}
        {autoCategory && <p className="mt-1 text-[11px] text-faint">Category picked from the title</p>}
        {!autoCategory &&
          draft.title.trim() &&
          assessment.suggestedCategory &&
          assessment.suggestedCategory !== draft.category && (
            <button
              type="button"
              onClick={() => set("category", assessment.suggestedCategory!)}
              className="mt-1 text-[11px] text-accent hover:underline"
            >
              Looks like {CATEGORIES[assessment.suggestedCategory].label} · switch
            </button>
          )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Labeled label="Date" className="col-span-2 sm:col-span-1">
            <input
              type="date"
              required
              value={draft.date}
              onChange={(e) => {
                const date = e.target.value;
                // "Every week" follows the quest's day.
                const day = new Date(`${date}T12:00`).getDay() as Weekday;
                setDraft((d) => ({ ...d, date, ...(repeatMode === "weekly" && !Number.isNaN(day) ? { repeat: [day] } : {}) }));
              }}
              className={inputClass}
            />
          </Labeled>
          <Labeled label="Start">
            <input
              type="time"
              required
              step={300}
              value={draft.time}
              onChange={(e) => set("time", e.target.value)}
              className={inputClass}
            />
          </Labeled>
          <Labeled label="Time limit">
            <select
              value={draft.duration}
              onChange={(e) => set("duration", Number(e.target.value))}
              className={inputClass}
            >
              {durationOptions.map((d) => (
                <option key={d} value={d}>
                  {formatDuration(d)}
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="mt-3 flex w-full items-center gap-2 rounded-md py-1 text-left text-xs font-medium uppercase tracking-wide text-muted hover:text-ink"
        >
          <Repeat size={12} /> Repeat &amp; notes
          {!showMore && (draft.repeat || draft.notes) && (
            <span className="truncate font-normal normal-case tracking-normal text-faint">
              {[draft.repeat && describeRepeat(draft.repeat), notesParts.body && "notes added"].filter(Boolean).join(" · ")}
            </span>
          )}
          <ChevronDown size={14} className={`ml-auto shrink-0 transition-transform ${showMore ? "rotate-180" : ""}`} />
        </button>

        {showMore && canRepeat && (
          <div className="mt-2">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Repeat
            </span>
            <select
              value={repeatMode}
              onChange={(e) => {
                const mode = e.target.value as typeof repeatMode;
                setRepeatMode(mode);
                const weekday = new Date(`${draft.date}T12:00`).getDay() as Weekday;
                set(
                  "repeat",
                  mode === "none"
                    ? null
                    : mode === "weekly"
                      ? [weekday]
                      : mode === "daily"
                      ? EVERY_DAY
                      : mode === "weekdays"
                        ? WEEKDAYS
                        : draft.repeat?.length
                          ? draft.repeat
                          : [weekday],
                );
              }}
              className={inputClass}
            >
              <option value="none">Doesn&apos;t repeat</option>
              <option value="weekly">
                Every week on {new Date(2026, 0, 4 + questWeekday).toLocaleDateString([], { weekday: "long" })}
              </option>
              <option value="daily">Every day</option>
              <option value="weekdays">Every weekday (Mon–Fri)</option>
              <option value="custom">Custom days…</option>
            </select>
            {repeatMode === "custom" && (
              <div className="mt-2 flex gap-1">
                {WEEK_ORDER.map((d) => {
                  const on = draft.repeat?.includes(d) ?? false;
                  const day = new Date(2026, 0, 4 + d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      title={day.toLocaleDateString([], { weekday: "long" })}
                      onClick={() => {
                        const next = on ? (draft.repeat ?? []).filter((x) => x !== d) : [...(draft.repeat ?? []), d];
                        if (next.length) set("repeat", next);
                      }}
                      className={`grid size-8 place-items-center rounded-full text-xs font-semibold transition ${
                        on ? "bg-accent text-white" : "border border-line text-muted hover:bg-surface"
                      }`}
                    >
                      {day.toLocaleDateString([], { weekday: "narrow" })}
                    </button>
                  );
                })}
              </div>
            )}
            {draft.repeat && (
              <p className="mt-1 text-[11px] text-faint">
                {describeRepeat(draft.repeat)} at {draft.time}. Upcoming ones are added 4 weeks ahead, and each
                can still be moved or deleted on its own.
              </p>
            )}
            {repeating && !isNew && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-muted">Apply to</span>
                <div className="flex rounded-md border border-line p-0.5">
                  {(["this", "future"] as const).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      disabled={repeatChanged && sc === "this"}
                      onClick={() => setScope(sc)}
                      className={`rounded px-2 py-0.5 transition disabled:opacity-40 ${
                        scope === sc ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"
                      }`}
                    >
                      {sc === "this" ? "This quest" : "This & upcoming"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {showMore && (
        <Labeled label="Notes" className="mt-3">
          <textarea
            value={notesParts.body}
            onChange={(e) =>
              set("notes", notesParts.jira ? joinJiraNotes(e.target.value, notesParts.jira.lines) : e.target.value)
            }
            rows={3}
            placeholder="Chapters, goals, links…"
            className="block w-full resize-none rounded-md border border-line bg-canvas px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
        </Labeled>
        )}
        </>
        )}

        {!isNew && !deadline && (
          <div className="mt-4 grid auto-cols-fr grid-flow-col gap-2 border-t border-line pt-4 [&>button]:justify-center [&>button]:whitespace-nowrap [&>button]:py-2.5">
            {initial.status === "planned" && (
              <>
                <ActionButton onClick={() => changeStatus("active")} disabled={saving} tone="accent">
                  <Play size={15} /> Start
                </ActionButton>
                <ActionButton onClick={() => changeStatus("completed")} disabled={saving} tone="xp">
                  <Check size={16} /> Complete
                </ActionButton>
              </>
            )}
            {initial.status === "active" && (
              <>
                <ActionButton onClick={() => changeStatus("completed")} disabled={saving} tone="xp">
                  <Check size={16} /> Complete
                </ActionButton>
              </>
            )}
            {/* Did it after all: refunds the penalty and pays the quest's XP in one step (until 9am next morning). */}
            {initial.status === "failed" && failOpen && (
              <ActionButton onClick={() => changeStatus("completed")} disabled={saving} tone="xp">
                <Check size={16} /> I did it · complete
              </ActionButton>
            )}
            {finished && (initial.status === "completed" || failOpen) && (
              <ActionButton onClick={() => changeStatus("planned")} disabled={saving} tone="muted">
                <RotateCcw size={13} /> {initial.status === "completed" ? "Undo (removes the XP)" : "Back to planned"}
              </ActionButton>
            )}
            {initial.status === "failed" && !failOpen && (
              <p className="text-xs text-muted">
                This fail is final: failed quests can only be changed until 9am the morning after.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="mt-5 flex items-center gap-2">
          {!isNew && !imported && (
            <button
              type="button"
              onClick={async () => setError(await onDelete(initial.id!, scope))}
              title={repeating && scope === "future" ? "Delete this and upcoming repeats" : "Delete quest"}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-danger hover:bg-danger-soft"
            >
              <Trash2 size={15} />
              {repeating && scope === "future" ? "This & upcoming" : <span className="sr-only">Delete</span>}
            </button>
          )}
          {(initial.status === "planned" || initial.status === "active") && !isNew && !deadline && (
            <button
              type="button"
              onClick={() => changeStatus("failed")}
              disabled={saving}
              className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Flag size={14} /> Fail{initial.status === "planned" && ` (−${failPenalty(assessment.xp)} XP)`}
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface"
          >
            {imported ? "Close" : "Cancel"}
          </button>
          {!imported && (
          <button
            type="submit"
            disabled={saving || !draft.title.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : isNew ? (draft.repeat ? "Add repeating quest" : "Add quest") : "Save"}
          </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Mirrors the penalty rule in supabase/004_penalties_streaks.sql. */
function failPenalty(xp: number) {
  return Math.max(5, Math.round((xp * 0.5) / 5) * 5);
}

const TONES = {
  accent: "bg-accent text-white hover:bg-accent-hover",
  xp: "bg-xp text-white hover:brightness-95",
  danger: "border border-line text-danger hover:bg-danger-soft",
  muted: "border border-line text-muted hover:text-ink",
};

function ActionButton({
  tone,
  ...props
}: { tone: keyof typeof TONES } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition disabled:opacity-50 ${TONES[tone]}`}
    />
  );
}

// Same height for every field; date and time drop iOS's own styling so they fit their column,
// while selects keep their arrow so they still look tappable.
const inputClass =
  "block h-[42px] w-full min-w-0 rounded-md border border-line bg-canvas px-2 py-2 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft [&[type=date]]:appearance-none [&[type=time]]:appearance-none";

function Labeled({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
