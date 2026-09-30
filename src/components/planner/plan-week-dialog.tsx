"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Flag, Loader2, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDuration, formatTime, startOfDay } from "@/lib/dates";
import { dueAt, isDeadline, shortTitle, type CalendarLayer, type Quest } from "@/lib/quests";
import { deadlineProgress, estimateNeed, scoreQuest, URGENCY_WINDOW_DAYS, type UrgencyContext } from "@/lib/urgency";
import {
  blockTitle,
  DEFAULT_PREFS,
  planWeek,
  type PlanPrefs,
  type PlannedBlock,
  type Shortfall,
  type Target,
} from "@/lib/week-planner";

const PREFS_KEY = "questlog:plan-prefs";
const LOOKAHEAD_DAYS = 21;

type Candidate = Target & { selected: boolean; alreadyPlanned: number; source: string };

function loadPrefs(): PlanPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

const planRef = (key: string) => `plan:${key}`;
const hoursLabel = (min: number) => formatDuration(Math.round(min / 15) * 15);

/**
 * Plan my week: pick deadlines/exams, then get study blocks fitted into free time around classes
 * and existing quests, and add the ones you want in one go.
 */
export function PlanWeekDialog({
  layers,
  urgency,
  onClose,
  onAdded,
}: {
  layers: Map<string, CalendarLayer>;
  urgency: UrgencyContext;
  onClose: () => void;
  onAdded: (ids: string[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [prefs, setPrefs] = useState<PlanPrefs>(loadPrefs);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busyTimes, setBusyTimes] = useState<{ start: number; end: number }[]>([]);
  const [plan, setPlan] = useState<{ blocks: (PlannedBlock & { keep: boolean })[]; shortfalls: Shortfall[] } | null>(null);
  const [custom, setCustom] = useState({ title: "", date: "", hours: 4 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load upcoming deadlines/exams, what's already planned, and busy time.
  useEffect(() => {
    const now = new Date();
    const until = addDays(startOfDay(now), LOOKAHEAD_DAYS);
    supabase
      .from("quests")
      .select("*")
      // From two weeks back, so work already done for a deadline counts too.
      .gte("start_at", addDays(startOfDay(now), -URGENCY_WINDOW_DAYS).toISOString())
      .lt("start_at", until.toISOString())
      .order("start_at")
      .then(({ data, error }) => {
        if (error) return setError(error.message);
        const visible = (q: Quest) => !q.calendar_id || layers.get(q.calendar_id)?.visible !== false;
        const all = ((data ?? []) as Quest[]).filter(visible);

        // Work already done or planned for each deadline: blocks from earlier plans, and any quest on the same subject.
        const planned = new Map(
          deadlineProgress(all, urgency, now).map((p) => [p.deadline.id, p.doneMinutes + p.plannedMinutes]),
        );

        const list: Candidate[] = [];
        for (const q of all) {
          const due = isDeadline(q) ? dueAt(q) : new Date(q.start_at);
          if (due <= now) continue;
          const guess = estimateNeed(q.title);
          // Due dates from calendars, plus exams you've put on your calendar yourself.
          if (!isDeadline(q) && !(guess.kind === "exam" && q.status === "planned")) continue;
          const already = planned.get(q.id) ?? 0;
          list.push({
            key: q.id,
            title: q.title,
            due,
            kind: guess.kind,
            minutes: Math.max(0, guess.minutes - already),
            alreadyPlanned: already,
            selected: due.getTime() - now.getTime() < 8 * 86_400_000 && guess.minutes - already > 0,
            source: q.calendar_id ? (layers.get(q.calendar_id)?.name ?? "Calendar") : "Your quest",
          });
        }
        setCandidates(list);
        setBusyTimes(
          all
            .filter((q) => q.kind !== "deadline" && q.status !== "failed" && new Date(q.start_at) >= startOfDay(now))
            .map((q) => {
              const start = new Date(q.start_at).getTime();
              return { start, end: start + q.duration_min * 60_000 };
            }),
        );
      });
  }, [supabase, layers, urgency]);

  function update(key: string, patch: Partial<Candidate>) {
    setCandidates((cs) => cs?.map((c) => (c.key === key ? { ...c, ...patch } : c)) ?? null);
  }

  function addCustom() {
    if (!custom.title.trim() || !custom.date) return;
    const due = new Date(`${custom.date}T23:59`);
    const guess = estimateNeed(custom.title);
    setCandidates((cs) => [
      ...(cs ?? []),
      {
        key: `own-${Date.now()}`,
        title: custom.title.trim(),
        due,
        kind: guess.kind,
        minutes: custom.hours * 60,
        alreadyPlanned: 0,
        selected: true,
        source: "Added by you",
      },
    ]);
    setCustom({ title: "", date: "", hours: 4 });
  }

  function suggest() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // not saved; fine
    }
    const targets = (candidates ?? []).filter((c) => c.selected && c.minutes > 0);
    const result = planWeek(targets, busyTimes, prefs);
    setPlan({ blocks: result.blocks.map((b) => ({ ...b, keep: true })), shortfalls: result.shortfalls });
  }

  const byKey = new Map((candidates ?? []).map((c) => [c.key, c]));
  const subjectOf = (key: string) => urgency.deadlines.find((d) => d.id === key)?.subject ?? null;
  const titleFor = (t: Candidate) => blockTitle(t, subjectOf(t.key));
  /** A block's rank and XP, including the deadline bonus it will get. */
  const scoreBlock = (t: Candidate, b: PlannedBlock) =>
    scoreQuest({ title: titleFor(t), notes: planRef(t.key), category: "study", durationMin: b.minutes, start: b.start }, urgency);

  async function addBlocks() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    const rows = plan.blocks
      .filter((b) => b.keep)
      .map((b) => {
        const target = byKey.get(b.targetKey)!;
        const title = titleFor(target);
        const { rank, xp } = scoreBlock(target, b);
        const due = target.due.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        return {
          title,
          category: "study",
          notes: `Planned for “${target.title}” (due ${due}). ${planRef(target.key)}`,
          start_at: b.start.toISOString(),
          duration_min: b.minutes,
          difficulty: rank,
          xp,
        };
      });
    const { data, error } = await supabase.from("quests").insert(rows).select("id");
    setSaving(false);
    if (error) return setError(error.message);
    onAdded((data ?? []).map((r) => r.id as string));
  }

  const kept = plan?.blocks.filter((b) => b.keep) ?? [];
  const keptXp = kept.reduce((sum, b) => {
    const t = byKey.get(b.targetKey);
    return sum + (t ? scoreBlock(t, b).xp : 0);
  }, 0);
  const groups = new Map<string, (PlannedBlock & { keep: boolean })[]>();
  for (const b of plan?.blocks ?? []) {
    const label = b.start.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
    groups.set(label, [...(groups.get(label) ?? []), b]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl border border-line bg-canvas shadow-xl sm:rounded-xl">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <CalendarRange size={16} className="text-accent" />
          <h2 className="flex-1 font-semibold">{plan ? "Suggested study blocks" : "Plan my week"}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && <p className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          {!plan ? (
            <>
              <p className="text-sm text-muted">
                Pick what you&apos;re preparing for. Study blocks are fitted into your free time around classes and quests, and
                finish before each due date.
              </p>

              {!candidates ? (
                <p className="flex items-center gap-2 py-6 text-sm text-muted">
                  <Loader2 size={14} className="animate-spin" /> Looking at your calendar…
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                  {candidates.length === 0 && (
                    <li className="px-3 py-4 text-sm text-faint">
                      No due dates or exams in the next 3 weeks. Add one below.
                    </li>
                  )}
                  {candidates.map((c) => (
                    <li key={c.key} className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) => update(c.key, { selected: e.target.checked })}
                        className="size-4 shrink-0 accent-[var(--color-accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <Flag size={12} className="shrink-0 text-muted" />
                          <span className="truncate" title={c.title}>{shortTitle(c.title)}</span>
                        </p>
                        <p className="text-xs text-muted">
                          Due {c.due.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                          {c.source}
                          {c.alreadyPlanned > 0 && ` · ${hoursLabel(c.alreadyPlanned)} already done or planned`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <StepButton label="Less" onClick={() => update(c.key, { minutes: Math.max(0, c.minutes - 60) })}>
                          <Minus size={12} />
                        </StepButton>
                        <span className="w-12 text-center text-sm tabular-nums">{c.minutes ? hoursLabel(c.minutes) : "0h"}</span>
                        <StepButton label="More" onClick={() => update(c.key, { minutes: c.minutes + 60 })}>
                          <Plus size={12} />
                        </StepButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-surface p-3">
                <label className="min-w-40 flex-1 text-xs text-muted">
                  Add your own (e.g. “MoC final exam”)
                  <input
                    value={custom.title}
                    onChange={(e) => setCustom((c) => ({ ...c, title: e.target.value }))}
                    placeholder="What are you preparing for?"
                    className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="text-xs text-muted">
                  Due
                  <input
                    type="date"
                    value={custom.date}
                    onChange={(e) => setCustom((c) => ({ ...c, date: e.target.value }))}
                    className="mt-1 block rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="text-xs text-muted">
                  Hours
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={custom.hours}
                    onChange={(e) => setCustom((c) => ({ ...c, hours: Math.max(1, Math.min(40, Number(e.target.value) || 1)) }))}
                    className="mt-1 block w-16 rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
                <button
                  onClick={addCustom}
                  disabled={!custom.title.trim() || !custom.date}
                  className="rounded-md border border-line bg-canvas px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              <details className="mt-3 rounded-lg border border-line px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Your limits{" "}
                  <span className="font-normal text-muted">
                    · {minutesToLabel(prefs.dayStart)}–{minutesToLabel(prefs.dayEnd)}, up to {hoursLabel(prefs.maxPerDay)}/day,{" "}
                    {hoursLabel(prefs.blockMinutes)} blocks
                  </span>
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <PrefSelect label="Start after" value={prefs.dayStart} onChange={(v) => setPrefs((p) => ({ ...p, dayStart: v }))}
                    options={range(6, 14).map((h) => [h * 60, minutesToLabel(h * 60)])} />
                  <PrefSelect label="Finish by" value={prefs.dayEnd} onChange={(v) => setPrefs((p) => ({ ...p, dayEnd: v }))}
                    options={range(16, 24).map((h) => [h * 60, minutesToLabel(h * 60)])} />
                  <PrefSelect label="Most per day" value={prefs.maxPerDay} onChange={(v) => setPrefs((p) => ({ ...p, maxPerDay: v }))}
                    options={range(1, 8).map((h) => [h * 60, `${h}h`])} />
                  <PrefSelect label="Block length" value={prefs.blockMinutes} onChange={(v) => setPrefs((p) => ({ ...p, blockMinutes: v }))}
                    options={[45, 60, 90, 120].map((m) => [m, formatDuration(m)])} />
                  <PrefSelect label="Plan ahead" value={prefs.days} onChange={(v) => setPrefs((p) => ({ ...p, days: v }))}
                    options={[[7, "1 week"], [14, "2 weeks"]]} />
                  <label className="flex items-center gap-2 self-end pb-1.5">
                    <input
                      type="checkbox"
                      checked={prefs.weekends}
                      onChange={(e) => setPrefs((p) => ({ ...p, weekends: e.target.checked }))}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    Include weekends
                  </label>
                </div>
              </details>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={suggest}
                  disabled={!candidates?.some((c) => c.selected && c.minutes > 0)}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  Suggest study blocks
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                <strong className="text-ink">{kept.length} blocks</strong> ·{" "}
                {hoursLabel(kept.reduce((s, b) => s + b.minutes, 0))} · <span className="text-xp">+{keptXp} XP</span>. Untick
                any you don&apos;t want.
              </p>

              {plan.shortfalls.map((s) => {
                const t = byKey.get(s.targetKey);
                return (
                  <p key={s.targetKey} className="mt-2 flex gap-1.5 rounded-md bg-gold-soft px-3 py-2 text-xs text-gold-ink">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                    Only {hoursLabel((t?.minutes ?? 0) - s.missingMinutes)} of {hoursLabel(t?.minutes ?? 0)} fit before “{t ? shortTitle(t.title) : ""}”.
                    Try longer days, more hours per day, or including weekends.
                  </p>
                );
              })}

              {plan.blocks.length === 0 ? (
                <p className="py-6 text-sm text-faint">No free time found. Adjust your limits and try again.</p>
              ) : (
                [...groups].map(([day, blocks]) => (
                  <div key={day} className="mt-4">
                    <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">{day}</h3>
                    <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
                      {blocks.map((b) => {
                        const t = byKey.get(b.targetKey)!;
                        const title = titleFor(t);
                        const { rank, xp } = scoreBlock(t, b);
                        return (
                          <li key={b.start.toISOString()} className="flex items-center gap-3 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={b.keep}
                              onChange={(e) =>
                                setPlan((p) => p && { ...p, blocks: p.blocks.map((x) => (x === b ? { ...x, keep: e.target.checked } : x)) })
                              }
                              className="size-4 shrink-0 accent-[var(--color-accent)]"
                            />
                            <span className="w-28 shrink-0 text-xs text-muted tabular-nums">
                              {formatTime(b.start)}–{formatTime(new Date(b.start.getTime() + b.minutes * 60_000))}
                            </span>
                            <span className={`min-w-0 flex-1 truncate text-sm ${b.keep ? "" : "text-faint line-through"}`}>{title}</span>
                            <span className="shrink-0 text-xs text-muted">
                              {rank} · <span className="text-xp">+{xp}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}

              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => setPlan(null)} className="text-sm text-muted hover:text-ink">
                  Back
                </button>
                <button
                  onClick={addBlocks}
                  disabled={saving || kept.length === 0}
                  className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Add {kept.length} block{kept.length === 1 ? "" : "s"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-md border border-line text-muted hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  );
}

function PrefSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: (readonly [number, string])[] | [number, string][];
}) {
  return (
    <label className="text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function minutesToLabel(min: number) {
  return formatTime(new Date(2000, 0, 1, Math.floor(min / 60), min % 60));
}
