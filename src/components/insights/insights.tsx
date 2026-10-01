"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Flame, Loader2, Snowflake, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDuration, startOfWeek } from "@/lib/dates";
import { computeAchievements, type Achievement } from "@/lib/achievements";
import { markSeen, unseenIds } from "@/lib/achievements-seen";
import { loadHistory, type History } from "@/lib/history";
import { overruns, weekStats, weeklyXp, type WeekStats } from "@/lib/insights";
import { CATEGORIES } from "@/lib/quests";
import { describeStreak, streakInfo } from "@/lib/streak";
import { AchievementCard } from "./achievement-badge";

const noopSubscribe = () => () => {};
const TREND_WEEKS = 8;
const OVERRUN_DAYS = 28;

/** Insights depend on the viewer's timezone, so they render only in the browser. */
export function Insights(props: { totalXp: number; goal: number }) {
  const inBrowser = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return inBrowser ? <InsightsView {...props} /> : <div className="min-h-screen bg-canvas" />;
}

const hours = (min: number) => (min ? formatDuration(Math.round(min / 15) * 15 || 15) : "0h");
const weekLabel = (start: Date) => {
  const fmt = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(addDays(start, 6))}`;
};

function InsightsView({ totalXp, goal }: { totalXp: number; goal: number }) {
  const supabase = useMemo(() => createClient(), []);
  const thisWeek = useMemo(() => startOfWeek(new Date()), []);
  const [week, setWeek] = useState(thisWeek);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadHistory(supabase, addDays(thisWeek, 7))
      .then(setHistory)
      .catch((e: Error) => setError(e.message));
  }, [supabase, thisWeek]);

  const stats = useMemo(() => history && weekStats(history.quests, week, history.subjects), [history, week]);
  const previous = useMemo(
    () => history && weekStats(history.quests, addDays(week, -7), history.subjects),
    [history, week],
  );
  // The trend ends this week, unless you've gone back further than it shows.
  const trendEnd = week > addDays(thisWeek, -7 * TREND_WEEKS) ? thisWeek : addDays(week, 7 * 3);
  const trendEndMs = trendEnd.getTime();
  const trend = useMemo(
    () => history && weeklyXp(history.quests, new Date(trendEndMs), TREND_WEEKS),
    [history, trendEndMs],
  );
  const timing = useMemo(
    () => history && overruns(history.quests, history.subjects, addDays(new Date(), -OVERRUN_DAYS)),
    [history],
  );
  const achievements = useMemo(
    () =>
      history &&
      computeAchievements({
        quests: history.quests,
        bonuses: history.bonuses,
        freezes: history.freezes,
        bosses: history.bosses,
        totalXp,
        subjects: history.subjects,
      }),
    [history, totalXp],
  );

  // Highlight badges earned since the last visit, then remember them.
  useEffect(() => {
    if (!achievements) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads what this device has seen before
    setFresh(unseenIds(achievements));
    markSeen(achievements);
  }, [achievements]);

  const streak = useMemo(() => {
    if (!history) return null;
    const latest = history.bonuses.at(-1) ?? null;
    const best = Math.max(0, ...history.bonuses.map((b) => b.streak));
    return streakInfo(latest, best, history.freezes.at(-1)?.day ?? null);
  }, [history]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-ink">
            <ArrowLeft size={15} /> <span className="hidden sm:inline">Planner</span>
          </Link>
          <h1 className="text-lg font-semibold">Insights</h1>
          <div className="ml-auto flex items-center gap-1">
            {week.getTime() !== thisWeek.getTime() && (
              <button
                onClick={() => setWeek(thisWeek)}
                className="mr-1 rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface"
              >
                This week
              </button>
            )}
            <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" className="rounded p-1 text-muted hover:bg-surface">
              <ChevronLeft size={18} />
            </button>
            <span className="w-32 text-center text-sm font-medium tabular-nums">{weekLabel(week)}</span>
            <button
              onClick={() => setWeek(addDays(week, 7))}
              disabled={week >= thisWeek}
              aria-label="Next week"
              className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-6">
        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {!history || !stats || !previous || !trend || !timing || !achievements || !streak ? (
          !error && (
            <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> Crunching your history…
            </p>
          )
        ) : (
          <>
            {!history.tracksTime && (
              <p className="flex gap-2 rounded-md bg-gold-soft px-3 py-2 text-xs text-gold-ink">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                Run supabase/013_insights_streak_freeze.sql in the Supabase SQL Editor to track time worked
                (for overruns) and turn on streak freezes.
              </p>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="XP earned" value={stats.xp.toLocaleString()} delta={change(stats.xp, previous.xp)} />
              <Stat label="Time on quests" value={hours(stats.minutes)} delta={change(stats.minutes, previous.minutes)} />
              <Stat
                label="Completion rate"
                value={stats.completion.rate === null ? "–" : `${Math.round(stats.completion.rate * 100)}%`}
                delta={
                  stats.completion.rate !== null && previous.completion.rate !== null
                    ? { text: `${points(stats.completion.rate - previous.completion.rate)} pts`, good: stats.completion.rate >= previous.completion.rate }
                    : null
                }
              />
              <div className="rounded-xl border border-line p-3" title={describeStreak(streak)}>
                <p className="text-xs text-muted">Streak</p>
                <p className="mt-1 flex items-center gap-1 text-2xl font-semibold">
                  <Flame size={20} className={streak.current ? "text-gold" : "text-faint"} /> {streak.current}
                  <span className="text-sm font-normal text-faint">{streak.current === 1 ? "day" : "days"}</span>
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                  <Snowflake size={11} className={streak.freezeReady ? "text-accent" : "text-faint"} />
                  {streak.needsFreeze
                    ? "Reach today's goal to use your freeze"
                    : streak.freezeReady
                      ? "Freeze ready"
                      : `Freeze back ${streak.freezeReadyOn?.toLocaleDateString([], { weekday: "short" }) ?? "soon"}`}
                  <span className="text-faint"> · best {streak.best}</span>
                </p>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Card title="XP per day" note={`Goal ${goal} XP`}>
                <DailyChart stats={stats} goal={goal} />
              </Card>
              <Card title="XP by week" note={`Last ${TREND_WEEKS} weeks`}>
                <TrendChart weeks={trend} selected={week} onSelect={setWeek} />
              </Card>
              <Card title="Time per subject" note="Completed quests">
                <Subjects stats={stats} />
              </Card>
              <Card title="Completion" note="Your own quests">
                <CompletionBar stats={stats} />
              </Card>
            </section>

            <Card title="Time vs plan" note={`Timed quests, last ${OVERRUN_DAYS / 7} weeks`}>
              <Overruns items={timing} tracking={history.tracksTime} />
            </Card>

            <Achievements list={achievements} fresh={fresh} />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function change(now: number, before: number) {
  if (!before) return now ? { text: "new this week", good: true } : null;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs last week`, good: pct >= 0 };
}
const points = (diff: number) => `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff * 100))}`;

function Stat({ label, value, delta }: { label: string; value: string; delta: { text: string; good: boolean } | null }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {delta && <p className={`mt-1 text-[11px] ${delta.good ? "text-xp" : "text-danger"}`}>{delta.text}</p>}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && <span className="text-[11px] text-faint">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function DailyChart({ stats, goal }: { stats: WeekStats; goal: number }) {
  const max = Math.max(goal * 1.25, ...stats.days.map((d) => d.xp));
  const today = new Date().toDateString();
  return (
    <div>
      <div className="relative flex h-40 items-end gap-2">
        {/* Goal line */}
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gold" style={{ bottom: `${(goal / max) * 100}%` }}>
          <span className="absolute -top-4 right-0 text-[10px] text-gold">goal</span>
        </div>
        {stats.days.map((d) => {
          const reached = d.xp >= goal;
          return (
            <div key={d.date.toISOString()} className="group relative flex h-full flex-1 flex-col justify-end">
              <span className="mb-0.5 text-center text-[10px] tabular-nums text-muted opacity-0 transition group-hover:opacity-100">
                {d.xp}
              </span>
              <div
                className={`w-full rounded-t-md ${reached ? "bg-xp" : "bg-accent/70"}`}
                style={{ height: `${Math.max(d.xp ? 3 : 0, (d.xp / max) * 100)}%` }}
                title={`${d.date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}: ${d.xp} XP · ${hours(d.minutes)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 border-t border-line pt-1">
        {stats.days.map((d) => (
          <span
            key={d.date.toISOString()}
            className={`flex-1 text-center text-[11px] ${d.date.toDateString() === today ? "font-semibold text-accent" : "text-muted"}`}
          >
            {d.date.toLocaleDateString([], { weekday: "narrow" })}
            {d.xp >= goal && <Flame size={10} className="ml-0.5 inline text-gold" />}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrendChart({
  weeks,
  selected,
  onSelect,
}: {
  weeks: { start: Date; xp: number }[];
  selected: Date;
  onSelect: (d: Date) => void;
}) {
  const max = Math.max(1, ...weeks.map((w) => w.xp));
  return (
    <div>
      <div className="flex h-40 items-end gap-2">
        {weeks.map((w) => {
          const active = w.start.getTime() === selected.getTime();
          return (
            <button
              key={w.start.toISOString()}
              onClick={() => onSelect(w.start)}
              className="group flex h-full flex-1 flex-col justify-end"
              title={`Week of ${w.start.toLocaleDateString([], { day: "numeric", month: "short" })}: ${w.xp} XP`}
            >
              <span className={`mb-0.5 text-center text-[10px] tabular-nums ${active ? "text-ink" : "text-muted opacity-0 group-hover:opacity-100"}`}>
                {w.xp}
              </span>
              <span
                className={`block w-full rounded-t-md transition ${active ? "bg-accent" : "bg-accent/30 group-hover:bg-accent/50"}`}
                style={{ height: `${Math.max(w.xp ? 3 : 0, (w.xp / max) * 100)}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 border-t border-line pt-1">
        {weeks.map((w) => (
          <span key={w.start.toISOString()} className="flex-1 text-center text-[10px] text-muted">
            {w.start.toLocaleDateString([], { day: "numeric", month: "numeric" })}
          </span>
        ))}
      </div>
    </div>
  );
}

function Subjects({ stats }: { stats: WeekStats }) {
  if (!stats.subjects.length) return <Empty>Nothing completed this week yet.</Empty>;
  const max = stats.subjects[0].minutes;
  return (
    <ul className="space-y-2">
      {stats.subjects.slice(0, 8).map((s) => (
        <li key={s.name} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate">{s.name}</span>
            <span className="shrink-0 tabular-nums text-muted">{hours(s.minutes)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full" style={{ width: `${(s.minutes / max) * 100}%`, background: CATEGORIES[s.category].color }} />
          </div>
        </li>
      ))}
      {stats.subjects.length > 8 && <li className="text-[11px] text-faint">+{stats.subjects.length - 8} more</li>}
    </ul>
  );
}

function CompletionBar({ stats }: { stats: WeekStats }) {
  const { done, failed, missed, rate } = stats.completion;
  const total = done + failed + missed;
  if (!total) return <Empty>No quests finished or due yet this week.</Empty>;
  const parts = [
    { label: "Done", n: done, cls: "bg-xp" },
    { label: "Failed", n: failed, cls: "bg-danger" },
    { label: "Missed", n: missed, cls: "bg-gold" },
  ];
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums">
        {Math.round((rate ?? 0) * 100)}%
        <span className="ml-2 text-sm font-normal text-muted">
          {done} of {total} quests done
        </span>
      </p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface">
        {parts.map((p) => p.n > 0 && <div key={p.label} className={p.cls} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <ul className="mt-2 flex gap-4 text-xs text-muted">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${p.cls}`} /> {p.label} {p.n}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-faint">Classes from calendar layers count only when you tick them off.</p>
    </div>
  );
}

function Overruns({ items, tracking }: { items: ReturnType<typeof overruns>; tracking: boolean }) {
  if (!items.length)
    return (
      <Empty>
        {tracking
          ? "Start quests with the timer (▶) and finish them to see which subjects take longer than planned."
          : "Time worked is recorded once 013_insights_streak_freeze.sql has been run."}
      </Empty>
    );
  return (
    <ul className="space-y-2.5">
      {items.map((o) => {
        const diff = o.ratio - 1;
        const over = diff > 0.1;
        const under = diff < -0.1;
        // Bar centred on "as planned"; ±100% fills one side.
        const width = Math.min(50, Math.abs(diff) * 50);
        return (
          <li key={o.name} className="grid grid-cols-[minmax(0,1fr)_8rem_6.5rem] items-center gap-3 text-xs sm:grid-cols-[minmax(0,1fr)_14rem_8rem]">
            <span className="truncate">
              {o.name} <span className="text-faint">· {o.count} timed</span>
            </span>
            <span className="relative h-2 rounded-full bg-surface">
              <span className="absolute inset-y-[-2px] left-1/2 w-px bg-faint" />
              <span
                className={`absolute inset-y-0 rounded-full ${over ? "bg-danger" : under ? "bg-xp" : "bg-muted"} ${diff >= 0 ? "left-1/2" : "right-1/2"}`}
                style={{ width: `${width}%` }}
              />
            </span>
            <span className={`text-right tabular-nums ${over ? "text-danger" : under ? "text-xp" : "text-muted"}`}>
              {over ? `${Math.round(diff * 100)}% over` : under ? `${Math.round(-diff * 100)}% under` : "on plan"}
              <span className="block text-[10px] text-faint">
                {hours(o.worked)} of {hours(o.planned)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Achievements({ list, fresh }: { list: Achievement[]; fresh: Set<string> }) {
  const unlocked = list.filter((a) => a.unlocked);
  // Earned first (newest first), then the ones closest to done.
  const sorted = [
    ...unlocked.sort((a, b) => (b.unlockedAt?.getTime() ?? 0) - (a.unlockedAt?.getTime() ?? 0)),
    ...list
      .filter((a) => !a.unlocked)
      .sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target),
  ];
  return (
    <section className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Achievements</h2>
        <span className="text-xs text-muted">
          {unlocked.length} of {list.length} earned
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((a) => (
          <AchievementCard key={a.id} achievement={a} isNew={fresh.has(a.id)} />
        ))}
      </ul>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs text-faint">{children}</p>;
}
