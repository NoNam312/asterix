"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronLeft, ChevronRight, LogOut, Plus, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  addDays,
  addMinutes,
  formatTime,
  fromInputs,
  isSameDay,
  startOfDay,
  startOfWeek,
  toDateInput,
  toTimeInput,
} from "@/lib/dates";
import { assessQuest } from "@/lib/difficulty";
import { levelInfo } from "@/lib/levels";
import { CATEGORIES, type Profile, type Quest, type QuestStatus } from "@/lib/quests";
import { signOut } from "@/app/login/actions";
import { ActiveQuestBar } from "./active-quest-bar";
import { CalendarGrid } from "./calendar-grid";
import { MiniCalendar } from "./mini-calendar";
import { QuestModal, type QuestDraft } from "./quest-modal";

type View = "day" | "week";

const noopSubscribe = () => () => {};

/**
 * The calendar depends on the viewer's timezone and locale, which the server
 * doesn't know, so it renders only in the browser.
 */
export function Planner({ profile }: { profile: Profile }) {
  const inBrowser = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return inBrowser ? <PlannerView profile={profile} /> : <div className="h-screen bg-canvas" />;
}

type Toast = { xp: number; newLevel?: number } | { failed: string };

function PlannerView({ profile: initialProfile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState(initialProfile);
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [quests, setQuests] = useState<Quest[]>([]);
  const [todayQuests, setTodayQuests] = useState<Quest[]>([]);
  const [draft, setDraft] = useState<QuestDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(
    () =>
      view === "day"
        ? [date]
        : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)),
    [view, date],
  );
  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  const fetchRange = useCallback(
    async (from: Date, to: Date) => {
      const { data, error } = await supabase
        .from("quests")
        .select("*")
        .gte("start_at", from.toISOString())
        .lt("start_at", to.toISOString())
        .order("start_at");
      if (error) setError(error.message);
      return (data ?? []) as Quest[];
    },
    [supabase],
  );

  const refresh = useCallback(async () => {
    const today = startOfDay(new Date());
    const [range, todays, active] = await Promise.all([
      fetchRange(rangeStart, rangeEnd),
      fetchRange(today, addDays(today, 1)),
      supabase.from("quests").select("*").eq("status", "active").limit(1).maybeSingle(),
    ]);
    setQuests(range);
    setTodayQuests(todays);
    setActiveQuest((active.data as Quest | null) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the range timestamps below
  }, [supabase, fetchRange, rangeStart.getTime(), rangeEnd.getTime()]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data for the visible range
    refresh();
  }, [refresh]);

  // Keyboard shortcuts: T = today, N = new quest, arrows = previous/next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "t") setDate(startOfDay(new Date()));
      if (e.key === "n") openNew(nextHalfHour());
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function step(dir: number) {
    setDate((d) => addDays(d, dir * (view === "day" ? 1 : 7)));
  }

  function openNew(start: Date) {
    setDraft({
      title: "",
      category: "study",
      date: toDateInput(start),
      time: toTimeInput(start),
      duration: 60,
      notes: "",
      status: "planned",
    });
  }

  function openEdit(q: Quest) {
    const start = new Date(q.start_at);
    setDraft({
      id: q.id,
      title: q.title,
      category: q.category,
      date: toDateInput(start),
      time: toTimeInput(start),
      duration: q.duration_min,
      notes: q.notes ?? "",
      status: q.status,
      xp: q.xp,
    });
  }

  async function save(d: QuestDraft) {
    const finished = d.status === "completed" || d.status === "failed";
    const { rank, xp } = assessQuest({
      title: d.title,
      notes: d.notes,
      category: d.category,
      durationMin: d.duration,
    });
    const row = {
      title: d.title,
      category: d.category,
      notes: d.notes.trim() || null,
      start_at: fromInputs(d.date, d.time).toISOString(),
      duration_min: d.duration,
      // A finished quest keeps the XP it was completed with.
      ...(finished ? {} : { difficulty: rank, xp }),
    };
    const { error } = d.id
      ? await supabase.from("quests").update(row).eq("id", d.id)
      : await supabase.from("quests").insert(row);
    if (error) return error.message;
    setDraft(null);
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("quests").delete().eq("id", id);
    if (error) return error.message;
    setDraft(null);
    refresh();
  }

  async function setStatus(id: string, status: QuestStatus) {
    const quest = [...quests, ...todayQuests, activeQuest].find((q) => q?.id === id);
    let questXp = quest?.xp ?? 0;
    // Quests made before the quest engine existed have no rank yet; score them first.
    if (quest && !quest.difficulty) {
      const { rank, xp } = assessQuest({
        title: quest.title,
        notes: quest.notes,
        category: quest.category,
        durationMin: quest.duration_min,
      });
      const { error } = await supabase.from("quests").update({ difficulty: rank, xp }).eq("id", id);
      if (error) return error.message;
      questXp = xp;
    }

    const { data, error } = await supabase.rpc("set_quest_status", {
      quest_id: id,
      new_status: status,
    });
    if (error) return error.message;
    const newTotal = data as number;

    const before = levelInfo(profile.total_xp).level;
    const after = levelInfo(newTotal).level;
    setProfile((p) => ({ ...p, total_xp: newTotal }));
    if (status === "completed") {
      showToast({ xp: questXp, newLevel: after > before ? after : undefined });
    } else if (status === "failed" && quest) {
      showToast({ failed: quest.title });
    }
    setDraft(null);
    refresh();
  }

  function showToast(t: Toast) {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3500);
  }

  function runStatus(id: string, status: QuestStatus) {
    setStatus(id, status).then((err) => err && setError(err));
  }

  async function reschedule(q: Quest, start: Date, duration: number) {
    const patch = { start_at: start.toISOString(), duration_min: duration };
    // Optimistic update so the block doesn't snap back while saving.
    setQuests((qs) => qs.map((x) => (x.id === q.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("quests").update(patch).eq("id", q.id);
    if (error) setError(error.message);
    refresh();
  }

  const earnedToday = todayQuests
    .filter((q) => q.status === "completed")
    .reduce((sum, q) => sum + q.xp, 0);
  const lvl = levelInfo(profile.total_xp);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-5 border-r border-line bg-surface p-4 md:flex">
        <div className="flex items-center gap-2 px-1 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-ink text-white">
            <Swords size={14} />
          </span>
          QuestLog
        </div>

        <div className="rounded-lg bg-canvas p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{profile.username}</span>
            <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent">
              Lv {lvl.level}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${lvl.progress * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-faint">
            {lvl.intoLevel} / {lvl.levelSize} XP to Lv {lvl.level + 1}
          </p>
          <div className="mt-3 flex justify-between text-[11px] text-muted">
            <span>Today&apos;s goal</span>
            <span>
              <span className="font-semibold text-xp">{earnedToday}</span> / {profile.daily_xp_goal} XP
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-xp transition-all"
              style={{ width: `${Math.min(100, (earnedToday / profile.daily_xp_goal) * 100)}%` }}
            />
          </div>
        </div>

        <MiniCalendar selected={date} onSelect={(d) => setDate(startOfDay(d))} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <h3 className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            Today&apos;s quests
          </h3>
          {todayQuests.length === 0 ? (
            <p className="px-1 pt-2 text-xs text-faint">Nothing planned yet.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {todayQuests.map((q) => {
                const done = q.status === "completed";
                const failed = q.status === "failed";
                const color = CATEGORIES[q.category].color;
                return (
                  <li key={q.id} className="flex items-center gap-1.5 rounded-md px-1 hover:bg-surface-hover">
                    <button
                      title={done ? "Undo" : "Mark complete"}
                      disabled={failed}
                      onClick={() => runStatus(q.id, done ? "planned" : "completed")}
                      className="grid size-4 shrink-0 place-items-center rounded border transition disabled:opacity-40"
                      style={{ borderColor: color, background: done ? color : "transparent" }}
                    >
                      {done && <Check size={11} className="text-white" strokeWidth={3} />}
                    </button>
                    <button
                      onClick={() => openEdit(q)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-xs"
                    >
                      <span
                        className={`flex-1 truncate ${done ? "text-muted line-through" : ""} ${failed ? "text-danger line-through" : ""}`}
                      >
                        {q.title}
                      </span>
                      <span className="text-faint">{formatTime(new Date(q.start_at))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form action={signOut}>
          <button className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-ink">
            <LogOut size={14} /> Log out
          </button>
        </form>
      </aside>

      {/* Main calendar */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h1 className="mr-2 text-lg font-semibold tracking-tight">
            {view === "day"
              ? date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
              : rangeLabel(days[0], days[6])}
          </h1>
          <div className="flex items-center">
            <IconButton label="Previous" onClick={() => step(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton label="Next" onClick={() => step(1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <button
            onClick={() => setDate(startOfDay(new Date()))}
            disabled={days.some((d) => isSameDay(d, new Date()))}
            className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-surface disabled:text-faint disabled:hover:bg-transparent"
          >
            Today
          </button>

          <div className="flex-1" />

          <div className="grid grid-cols-2 rounded-lg bg-surface p-0.5 text-sm">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 capitalize transition ${
                  view === v ? "bg-canvas font-medium shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => openNew(nextHalfHour(date))}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus size={15} /> New quest
          </button>
        </header>

        {activeQuest && (
          <ActiveQuestBar
            quest={activeQuest}
            onComplete={() => runStatus(activeQuest.id, "completed")}
            onFail={() => runStatus(activeQuest.id, "failed")}
            onStop={() => runStatus(activeQuest.id, "planned")}
          />
        )}

        {error && (
          <div className="flex items-center justify-between bg-danger-soft px-4 py-2 text-sm text-danger">
            {error}
            <button onClick={() => setError(null)} className="text-xs underline">
              Dismiss
            </button>
          </div>
        )}

        <CalendarGrid
          days={days}
          quests={quests}
          onCreate={openNew}
          onEdit={openEdit}
          onReschedule={reschedule}
        />
      </main>

      {draft && (
        <QuestModal
          key={draft.id ?? `${draft.date}T${draft.time}`}
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={save}
          onDelete={remove}
          onStatus={setStatus}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed right-6 top-6 z-[60] animate-[toast-in_300ms_ease-out] rounded-xl border border-line bg-canvas px-4 py-3 shadow-xl">
          {"failed" in toast ? (
            <p className="text-sm">
              <span className="font-semibold text-danger">Quest failed</span>
              <span className="text-muted"> · {toast.failed}</span>
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold text-xp">+{toast.xp} XP</p>
              <p className="text-xs text-muted">Quest complete!</p>
              {toast.newLevel && (
                <p className="mt-1 text-sm font-semibold text-accent">
                  Level up! You&apos;re now Lv {toast.newLevel} 🎉
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  ...props
}: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
    />
  );
}

/** Next half-hour slot, on the given day (defaults to now). */
function nextHalfHour(day: Date = new Date()) {
  const now = new Date();
  const base = isSameDay(day, now) ? now : addMinutes(startOfDay(day), 9 * 60 - 30);
  const d = new Date(base);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

function rangeLabel(a: Date, b: Date) {
  const sameMonth = a.getMonth() === b.getMonth();
  const left = a.toLocaleDateString([], { month: "short", day: "numeric" });
  const right = b.toLocaleDateString([], sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${left} – ${right}, ${b.getFullYear()}`;
}
