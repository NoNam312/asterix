"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Flag, Play, RotateCcw, Trash2, X } from "lucide-react";
import { formatDuration } from "@/lib/dates";
import { assessQuest } from "@/lib/difficulty";
import { CATEGORIES, CATEGORY_KEYS, type Category, type QuestStatus } from "@/lib/quests";
import { ScorePanel } from "./score-panel";

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
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

type Props = {
  draft: QuestDraft;
  onClose: () => void;
  /** Resolves to an error message if saving failed. */
  onSave: (draft: QuestDraft) => Promise<string | undefined>;
  onDelete: (id: string) => Promise<string | undefined>;
  onStatus: (id: string, status: QuestStatus) => Promise<string | undefined>;
};

export function QuestModal({ draft: initial, onClose, onSave, onDelete, onStatus }: Props) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // New quests pick their category from the title until you choose one yourself.
  const [categoryPicked, setCategoryPicked] = useState(!!initial.id);
  const [autoCategory, setAutoCategory] = useState(false);
  const isNew = !initial.id;
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
    setError(await onSave({ ...draft, title: draft.title.trim() }));
    setSaving(false);
  }

  async function changeStatus(status: QuestStatus) {
    setSaving(true);
    setError(await onStatus(initial.id!, status));
    setSaving(false);
  }

  const finished = initial.status === "completed" || initial.status === "failed";
  const assessment = assessQuest({
    title: draft.title,
    notes: draft.notes,
    category: draft.category,
    durationMin: draft.duration,
  });

  // Imported calendar events follow their feed, so their details are read-only.
  const imported = !!initial.source;
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

        <input
          autoFocus={!imported}
          readOnly={imported}
          value={draft.title}
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
          className="mt-3 w-full border-none text-xl font-semibold outline-none placeholder:text-faint"
        />

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
        <div className="mt-4 flex flex-wrap gap-1.5">
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
                className="rounded-full border px-2.5 py-1 text-xs font-medium transition"
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
          {autoCategory && <span className="self-center text-[11px] text-faint">auto-detected</span>}
          {!autoCategory &&
            draft.title.trim() &&
            assessment.suggestedCategory &&
            assessment.suggestedCategory !== draft.category && (
              <button
                type="button"
                onClick={() => set("category", assessment.suggestedCategory!)}
                className="self-center text-[11px] text-accent hover:underline"
              >
                Looks like {CATEGORIES[assessment.suggestedCategory].label} · switch
              </button>
            )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Labeled label="Date" className="col-span-2 sm:col-span-1">
            <input
              type="date"
              required
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
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

        <Labeled label="Notes" className="mt-3">
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            placeholder="Chapters, goals, links…"
            className={`${inputClass} resize-none`}
          />
        </Labeled>
        </>
        )}

        {!isNew && !deadline && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
            {initial.status === "planned" && (
              <>
                <ActionButton onClick={() => changeStatus("active")} disabled={saving} tone="accent">
                  <Play size={13} /> Start quest
                </ActionButton>
                <ActionButton onClick={() => changeStatus("completed")} disabled={saving} tone="xp">
                  <Check size={14} /> Mark complete
                </ActionButton>
                <ActionButton onClick={() => changeStatus("failed")} disabled={saving} tone="danger">
                  <Flag size={13} /> Fail (−{failPenalty(assessment.xp)} XP)
                </ActionButton>
              </>
            )}
            {initial.status === "active" && (
              <>
                <ActionButton onClick={() => changeStatus("completed")} disabled={saving} tone="xp">
                  <Check size={14} /> Complete
                </ActionButton>
                <ActionButton onClick={() => changeStatus("failed")} disabled={saving} tone="danger">
                  <Flag size={13} /> Fail
                </ActionButton>
              </>
            )}
            {finished && (
              <ActionButton onClick={() => changeStatus("planned")} disabled={saving} tone="muted">
                <RotateCcw size={13} /> Undo ({initial.status === "completed" ? "removes the XP" : "back to planned"})
              </ActionButton>
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
              onClick={async () => setError(await onDelete(initial.id!))}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-danger hover:bg-danger-soft"
            >
              <Trash2 size={14} /> Delete
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
            {saving ? "Saving…" : isNew ? "Add quest" : "Save"}
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

const inputClass =
  "w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

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
