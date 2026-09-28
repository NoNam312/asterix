"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { formatDuration } from "@/lib/dates";
import { CATEGORIES, CATEGORY_KEYS, type Category } from "@/lib/quests";

export type QuestDraft = {
  id?: string;
  title: string;
  category: Category;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  notes: string;
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

type Props = {
  draft: QuestDraft;
  onClose: () => void;
  onSave: (draft: QuestDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function QuestModal({ draft: initial, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
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
    await onSave({ ...draft, title: draft.title.trim() });
    setSaving(false);
  }

  const durationOptions = DURATIONS.includes(draft.duration)
    ? DURATIONS
    : [...DURATIONS, draft.duration].sort((a, b) => a - b);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/20 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-canvas p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">{isNew ? "New quest" : "Edit quest"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>

        <input
          autoFocus
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="What's the quest? e.g. Chemistry past paper"
          maxLength={200}
          className="mt-3 w-full border-none text-xl font-semibold outline-none placeholder:text-faint"
        />

        <div className="mt-4 flex flex-wrap gap-1.5">
          {CATEGORY_KEYS.map((key) => {
            const cat = CATEGORIES[key];
            const active = draft.category === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => set("category", key)}
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
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Labeled label="Date">
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

        <div className="mt-5 flex items-center gap-2">
          {!isNew && (
            <button
              type="button"
              onClick={() => onDelete(initial.id!)}
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !draft.title.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : isNew ? "Add quest" : "Save"}
          </button>
        </div>
      </form>
    </div>
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
