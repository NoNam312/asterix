"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ChartColumnBig,
  CalendarArrowUp,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ListChecks,
  TriangleAlert,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CopyPlus,
  Flag,
  Flame,
  Snowflake,
  Lock,
  LockOpen,
  NotebookText,
  Settings,
  LogOut,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Square,
  Swords,
  Trash2,
} from "lucide-react";
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
import {
  buildUrgencyContext,
  deadlineProgress,
  EMPTY_URGENCY,
  scoreQuest,
  URGENCY_WINDOW_DAYS,
  type DeadlineProgress,
  type UrgencyContext,
} from "@/lib/urgency";
import { levelInfo } from "@/lib/levels";
import { computeAchievements, type Achievement } from "@/lib/achievements";
import { achievementsSeeded, takeNewAchievements } from "@/lib/achievements-seen";
import { loadHistory } from "@/lib/history";
import { describeStreak, streakInfo, type StreakInfo } from "@/lib/streak";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  dueAt,
  isDeadline,
  type CalendarLayer,
  type Category,
  type Profile,
  type Quest,
  type QuestStatus,
} from "@/lib/quests";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { ActiveQuestBar } from "./active-quest-bar";
import { CalendarGrid } from "./calendar-grid";
import { ContextMenu, type MenuItem } from "./context-menu";
import { DailySummary, type MissedNotice } from "./daily-summary";
import { MobileQuestList } from "./mobile-quest-list";
import { CalendarLayers, syncLayer } from "./calendar-layers";
import { useUndo } from "./use-undo";
import { PlanWeekDialog } from "./plan-week-dialog";
import { MiniCalendar } from "./mini-calendar";
import { DueSoon } from "./due-soon";
import { BadgeIcon } from "@/components/insights/achievement-badge";
import { QuestModal, type QuestDraft } from "./quest-modal";

type View = "day" | "week";

/** How far ahead the sidebar lists due dates. */
const DUE_SOON_DAYS = 21;

/** A saved quest, in the shape the scorer takes. */
const scoreInput = (q: Quest) => ({
  id: q.id,
  title: q.title,
  notes: q.notes,
  category: q.category,
  durationMin: q.duration_min,
  start: new Date(q.start_at),
  calendarId: q.calendar_id,
  kind: q.kind,
});

const noopSubscribe = () => () => {};

/**
 * The calendar depends on the viewer's timezone and locale, which the server
 * doesn't know, so it renders only in the browser.
 */
export function Planner({ profile }: { profile: Profile }) {
  const inBrowser = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return inBrowser ? <PlannerView profile={profile} /> : <div className="h-screen bg-canvas" />;
}

type Toast =
  | { xp: number; newLevel?: number; bonus?: number; streak?: number; froze?: boolean }
  | { failed: string; lost: number };


const SUMMARY_SEEN_KEY = "questlog:summary-seen";

type Menu =
  | { kind: "quest"; quest: Quest; x: number; y: number }
  | { kind: "slot"; start: Date; x: number; y: number };

function PlannerView({ profile: initialProfile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState(initialProfile);
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [layers, setLayers] = useState<CalendarLayer[]>([]);
  const [dueSoon, setDueSoon] = useState<(DeadlineProgress & { quest: Quest })[]>([]);
  const [urgency, setUrgency] = useState<UrgencyContext>(EMPTY_URGENCY);
  const layerMap = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const [streak, setStreak] = useState<StreakInfo>(() => streakInfo(null, 0, null));
  const [badge, setBadge] = useState<Achievement | null>(null);
  const [summary, setSummary] = useState<{ day: Date; notice?: MissedNotice } | null>(null);
  const missedCheckDone = useRef(false);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [preferredView, setView] = useState<View>("week");
  const isMobile = useIsMobile();
  // Week view is too cramped on a phone, so phones always use the day view.
  const view: View = isMobile ? "day" : preferredView;
  const [mobileTab, setMobileTab] = useState<"calendar" | "quests">("calendar");
  const extensionInstalled = useExtensionInstalled();
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

  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const refresh = useCallback(async () => {
    const today = startOfDay(new Date());
    // Deadlines and the work around them, for the deadline bonus and the "Due soon" list.
    const nearFrom = Math.min(rangeStart.getTime(), addDays(today, -URGENCY_WINDOW_DAYS).getTime());
    const nearTo = Math.max(rangeEnd.getTime(), addDays(today, DUE_SOON_DAYS).getTime()) + (URGENCY_WINDOW_DAYS + 1) * 86_400_000;
    const [range, todays, active, latestBonus, bestBonus, calendars, near, series, lastFreeze] = await Promise.all([
      fetchRange(rangeStart, rangeEnd),
      fetchRange(today, addDays(today, 1)),
      supabase.from("quests").select("*").eq("status", "active").limit(1).maybeSingle(),
      supabase.from("daily_bonuses").select("day, streak").order("day", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("daily_bonuses").select("streak").order("streak", { ascending: false }).limit(1).maybeSingle(),
      // Never load feed URLs into the page; the manage dialog fetches one only when needed.
      supabase
        .from("calendars")
        .select("id, name, color, visible, last_synced_at, last_error")
        .order("created_at"),
      supabase
        .from("quests")
        .select("*")
        .gte("start_at", new Date(nearFrom).toISOString())
        .lt("start_at", new Date(nearTo).toISOString())
        .order("start_at")
        .limit(3000),
      supabase.from("calendar_series").select("title"),
      // Errors (and so counts as none) until 013_insights_streak_freeze.sql is run.
      supabase.from("streak_freezes").select("day").order("day", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const layerList = (calendars.data ?? []) as CalendarLayer[];
    const hidden = new Set(layerList.filter((l) => !l.visible).map((l) => l.id));
    const shown = (qs: Quest[]) => qs.filter((q) => !q.calendar_id || !hidden.has(q.calendar_id));
    setLayers(layerList);
    const nearby = shown((near.data ?? []) as Quest[]);
    const ctx = buildUrgencyContext(nearby, ((series.data ?? []) as { title: string }[]).map((r) => r.title));
    setUrgency(ctx);
    const nearbyById = new Map(nearby.map((q) => [q.id, q]));
    const soon = addDays(today, DUE_SOON_DAYS).getTime();
    setDueSoon(
      deadlineProgress(nearby, ctx)
        .filter((p) => p.deadline.due.getTime() < soon && nearbyById.has(p.deadline.id))
        .slice(0, 5)
        .map((p) => ({ ...p, quest: nearbyById.get(p.deadline.id)! })),
    );
    // Unfinished quests follow the latest scorer (and deadline bonus); finished ones keep the XP
    // they were settled with.
    const rescored = new Map<string, Pick<Quest, "difficulty" | "xp">>();
    for (const q of [...range, ...todays]) {
      if (rescored.has(q.id) || isDeadline(q) || (q.status !== "planned" && q.status !== "active")) continue;
      const { rank, xp } = scoreQuest(scoreInput(q), ctx);
      if (rank !== q.difficulty || xp !== q.xp) rescored.set(q.id, { difficulty: rank, xp });
    }
    if (rescored.size) {
      await Promise.all(
        [...rescored].map(([id, patch]) => supabase.from("quests").update(patch).eq("id", id)),
      );
    }
    const withScores = (qs: Quest[]) => qs.map((q) => ({ ...q, ...rescored.get(q.id) }));
    setQuests(shown(withScores(range)));
    setTodayQuests(shown(withScores(todays)).filter((q) => !isDeadline(q)));
    setActiveQuest((active.data as Quest | null) ?? null);

    // The streak is alive if the goal was reached today or yesterday (or a freeze can cover yesterday).
    setStreak(
      streakInfo(
        latestBonus.data as { day: string; streak: number } | null,
        (bestBonus.data as { streak: number } | null)?.streak ?? 0,
        (lastFreeze.data as { day: string } | null)?.day ?? null,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the range timestamps below
  }, [supabase, fetchRange, rangeStartMs, rangeEndMs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data for the visible range
    refresh();
  }, [refresh]);

  // Once per visit: re-sync calendar layers not synced in the last 6 hours.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current || !layers.length) return;
    autoSynced.current = true;
    const stale = layers.filter(
      (l) => !l.last_synced_at || Date.now() - new Date(l.last_synced_at).getTime() > 6 * 3_600_000,
    );
    if (!stale.length) return;
    (async () => {
      for (const l of stale) await syncLayer(l.id).catch(() => undefined);
      refresh();
    })();
  }, [layers, refresh]);

  // Once per visit: fail quests left unfinished on previous days, then show yesterday's report.
  useEffect(() => {
    if (missedCheckDone.current) return;
    missedCheckDone.current = true;
    (async () => {
      const today = startOfDay(new Date());
      const yesterday = addDays(today, -1);
      const { data } = await supabase.rpc("fail_missed_quests", { cutoff: today.toISOString() });
      const res = data as { missed: number; xp_lost: number; total_xp: number } | null;
      const seenToday = readStorage(SUMMARY_SEEN_KEY) === toDateInput(today);
      writeStorage(SUMMARY_SEEN_KEY, toDateInput(today));

      if (res && res.missed > 0) {
        setProfile((p) => ({ ...p, total_xp: res.total_xp }));
        setSummary({ day: yesterday, notice: { missed: res.missed, xpLost: res.xp_lost } });
        refresh();
        return;
      }
      if (seenToday) return;
      const { count } = await supabase
        .from("quests")
        .select("id", { count: "exact", head: true })
        .gte("start_at", yesterday.toISOString())
        .lt("start_at", today.toISOString());
      if (count) setSummary({ day: yesterday });
    })();
  }, [supabase, refresh]);

  // Once per device: note the achievements already earned, so only new ones get announced.
  useEffect(() => {
    if (achievementsSeeded()) return;
    loadHistory(supabase, addDays(new Date(), 1))
      .then((history) => takeNewAchievements(computeAchievements({ ...history, totalXp: initialProfile.total_xp })))
      .catch(() => undefined);
  }, [supabase, initialProfile.total_xp]);

  // ---------- undo (Ctrl/⌘+Z or the Undo button) ----------
  const { pushUndo, undoLast, undoNotice } = useUndo(refresh);
  const nowMs = useNowMs();

  function findQuest(id: string) {
    return [...quests, ...todayQuests, activeQuest].find((q) => q?.id === id) ?? undefined;
  }


  function step(dir: number) {
    setDate((d) => addDays(d, dir * (view === "day" ? 1 : 7)));
  }

  // ---------- swipe between days (touch) and weeks/days (trackpad) ----------
  const swipeArea = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const wheel = useRef({ sum: 0, last: 0, quietUntil: 0 });

  /** Step to the next/previous day (or week) with a short slide so the direction is clear. */
  function go(dir: number) {
    step(dir);
    swipeArea.current?.animate(
      [
        { transform: `translateX(${dir * 36}px)`, opacity: 0.35 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 200, easing: "ease-out" },
    );
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    // Holding and dragging a quest is not a swipe.
    if (!start || document.documentElement.dataset.questDragging) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // A quick, mostly sideways flick: right-to-left = next, left-to-right = previous.
    if (Date.now() - start.t < 700 && Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }

  function onWheel(e: React.WheelEvent) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const w = wheel.current;
    const now = Date.now();
    // Trackpads keep sending sideways "momentum" after a swipe; wait for it to die down.
    if (now < w.quietUntil) {
      w.quietUntil = now + 250;
      return;
    }
    if (now - w.last > 250) w.sum = 0;
    w.last = now;
    w.sum += e.deltaX;
    if (Math.abs(w.sum) > 120) {
      go(w.sum > 0 ? 1 : -1);
      w.sum = 0;
      w.quietUntil = now + 400;
    }
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
    // All-day due dates show as due at the end of that day.
    const start = isDeadline(q) ? dueAt(q) : new Date(q.start_at);
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
      penalty: q.xp_penalty,
      kind: q.kind,
      source: q.calendar_id ? (layerMap.get(q.calendar_id)?.name ?? "a calendar") : undefined,
    });
  }

  /** Untick a class series: its upcoming events disappear and future syncs skip it. */
  async function stopImporting(q: Quest) {
    if (!q.calendar_id || !q.series_key) return;
    await supabase
      .from("calendar_series")
      .update({ kept: false })
      .eq("calendar_id", q.calendar_id)
      .eq("series_key", q.series_key);
    await supabase
      .from("quests")
      .delete()
      .eq("calendar_id", q.calendar_id)
      .eq("series_key", q.series_key)
      .eq("status", "planned");
    const { calendar_id, series_key } = q;
    pushUndo(`Stopped importing “${q.title}”`, async () => {
      await supabase.from("calendar_series").update({ kept: true }).eq("calendar_id", calendar_id).eq("series_key", series_key);
      await syncLayer(calendar_id).catch(() => undefined);
    });
    refresh();
  }

  async function save(d: QuestDraft) {
    const finished = d.status === "completed" || d.status === "failed";
    const { rank, xp } = scoreQuest(
      {
        id: d.id,
        title: d.title,
        notes: d.notes,
        category: d.category,
        durationMin: d.duration,
        start: fromInputs(d.date, d.time),
        calendarId: d.id ? findQuest(d.id)?.calendar_id : null,
        kind: d.kind,
      },
      urgency,
    );
    const row = {
      title: d.title,
      category: d.category,
      notes: d.notes.trim() || null,
      start_at: fromInputs(d.date, d.time).toISOString(),
      duration_min: d.duration,
      // A finished quest keeps the XP it was completed with.
      ...(finished ? {} : { difficulty: rank, xp }),
    };
    const before = d.id ? findQuest(d.id) : undefined;
    const { data: saved, error } = d.id
      ? await supabase.from("quests").update(row).eq("id", d.id).select("id").single()
      : await supabase.from("quests").insert(row).select("id").single();
    if (error) return error.message;
    if (before) {
      const { title, category, notes, start_at, duration_min, difficulty, xp } = before;
      pushUndo("Quest edited", () =>
        supabase.from("quests").update({ title, category, notes, start_at, duration_min, difficulty, xp }).eq("id", before.id),
      );
    } else if (saved) {
      pushUndo("Quest added", () => supabase.from("quests").delete().eq("id", saved.id));
    }
    setDraft(null);
    refresh();
  }

  async function remove(id: string) {
    const before = findQuest(id);
    const { error } = await supabase.from("quests").delete().eq("id", id);
    if (error) return error.message;
    if (before) pushUndo(`Deleted “${before.title}”`, () => supabase.from("quests").insert(before));
    setDraft(null);
    refresh();
  }

  async function setStatus(id: string, status: QuestStatus, recordUndo = true) {
    const quest = [...quests, ...todayQuests, activeQuest].find((q) => q?.id === id);
    const previous = quest?.status;
    let questXp = quest?.xp ?? 0;
    // Quests made before the quest engine existed have no rank yet; score them first.
    if (quest && !quest.difficulty) {
      const { rank, xp } = scoreQuest(scoreInput(quest), urgency);
      const { error } = await supabase.from("quests").update({ difficulty: rank, xp }).eq("id", id);
      if (error) return error.message;
      questXp = xp;
    }

    const { data, error } = await supabase.rpc("set_quest_status", {
      quest_id: id,
      new_status: status,
    });
    if (error) return error.message;
    if (recordUndo && previous && previous !== status) {
      const label = { completed: "Completed", failed: "Failed", active: "Started", planned: "Reset" }[status];
      pushUndo(`${label} “${quest!.title}”`, () => setStatus(id, previous, false));
    }
    let newTotal = data as number;
    // What completing actually paid (timed quests pay for time worked).
    const earned = newTotal - profile.total_xp;

    // Completing a quest may push its day over the goal: claim the streak bonus.
    let bonus: { bonus: number; streak: number; froze?: boolean } | undefined;
    if (status === "completed" && quest) {
      const day = startOfDay(new Date(quest.start_at));
      const { data: claim } = await supabase.rpc("claim_daily_bonus", {
        p_day: toDateInput(day),
        p_start: day.toISOString(),
        p_end: addDays(day, 1).toISOString(),
      });
      if (claim) {
        bonus = claim as { bonus: number; streak: number; total_xp: number; froze?: boolean };
        newTotal = (claim as { total_xp: number }).total_xp;
      }
    }

    const before = levelInfo(profile.total_xp).level;
    const after = levelInfo(newTotal).level;
    const lost = profile.total_xp - newTotal;
    setProfile((p) => ({ ...p, total_xp: newTotal }));
    if (status === "completed") {
      showToast({
        xp: earned > 0 ? earned : questXp,
        newLevel: after > before ? after : undefined,
        bonus: bonus?.bonus,
        streak: bonus?.streak,
        froze: bonus?.froze,
      });
      announceAchievements();
    } else if (status === "failed" && quest) {
      showToast({ failed: quest.title, lost });
    }
    setDraft(null);
    refresh();
  }

  /** After completing a quest: show any achievement it unlocked (one at a time). */
  async function announceAchievements() {
    try {
      const history = await loadHistory(supabase, addDays(new Date(), 1));
      const { data: p } = await supabase.from("profiles").select("total_xp").single();
      const earned = takeNewAchievements(
        computeAchievements({ ...history, totalXp: (p as { total_xp: number } | null)?.total_xp ?? profile.total_xp }),
      );
      earned.forEach((a, i) =>
        setTimeout(() => {
          setBadge(a);
          setTimeout(() => setBadge((cur) => (cur === a ? null : cur)), 5000);
        }, 1500 + i * 5500),
      );
    } catch {
      // Achievements are a bonus; never block completing a quest.
    }
  }

  function showToast(t: Toast) {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), "bonus" in t && t.bonus ? 5000 : 3500);
  }

  function runStatus(id: string, status: QuestStatus) {
    setStatus(id, status).then((err) => err && setError(err));
  }

  /** Copies a quest to a new start time as a fresh, planned quest. */
  async function duplicate(q: Quest, start: Date) {
    const { data: copy, error } = await supabase.from("quests").insert({
      title: q.title,
      category: q.category,
      notes: q.notes,
      start_at: start.toISOString(),
      duration_min: q.duration_min,
      difficulty: q.difficulty,
      xp: q.xp,
    }).select("id").single();
    if (error) setError(error.message);
    if (copy) pushUndo(`Copied “${q.title}”`, () => supabase.from("quests").delete().eq("id", copy.id));
    refresh();
  }

  async function changeCategory(q: Quest, category: Category) {
    const finished = q.status === "completed" || q.status === "failed";
    const { rank, xp } = scoreQuest({ ...scoreInput(q), category }, urgency);
    const { error } = await supabase
      .from("quests")
      .update({ category, ...(finished ? {} : { difficulty: rank, xp }) })
      .eq("id", q.id);
    if (error) setError(error.message);
    else
      pushUndo(`Changed category of “${q.title}”`, () =>
        supabase.from("quests").update({ category: q.category, difficulty: q.difficulty, xp: q.xp }).eq("id", q.id),
      );
    refresh();
  }

  function questMenuItems(q: Quest): MenuItem[] {
    const start = new Date(q.start_at);
    const finished = q.status === "completed" || q.status === "failed";
    if (isDeadline(q)) return [{ label: "Open", icon: <Pencil />, onSelect: () => openEdit(q) }];
    if (q.calendar_id) {
      // Imported classes follow their feed: status actions only, plus dropping the whole series.
      return [
        { label: "Open", icon: <Pencil />, onSelect: () => openEdit(q) },
        { separator: true },
        ...(q.status === "planned"
          ? [{ label: "Start", icon: <Play />, onSelect: () => runStatus(q.id, "active") }]
          : []),
        ...(!finished
          ? [{ label: "Mark complete", icon: <Check />, onSelect: () => runStatus(q.id, "completed") }]
          : [{ label: "Undo", icon: <RotateCcw />, onSelect: () => runStatus(q.id, "planned") }]),
        ...(q.series_key && !q.series_key.startsWith("__")
          ? [
              { separator: true as const },
              {
                label: "Stop importing this class",
                icon: <CalendarOff />,
                danger: true,
                onSelect: () => stopImporting(q),
              },
            ]
          : []),
      ];
    }
    return [
      { label: "Open", icon: <Pencil />, onSelect: () => openEdit(q) },
      { separator: true },
      ...(q.status === "planned"
        ? [{ label: "Start quest", icon: <Play />, onSelect: () => runStatus(q.id, "active") }]
        : []),
      ...(q.status === "active"
        ? [{ label: "Stop timer", icon: <Square />, onSelect: () => runStatus(q.id, "planned") }]
        : []),
      ...(!finished
        ? [
            { label: "Mark complete", icon: <Check />, onSelect: () => runStatus(q.id, "completed") },
            { label: "Fail quest", icon: <Flag />, onSelect: () => runStatus(q.id, "failed") },
          ]
        : [
            {
              label: q.status === "completed" ? "Undo complete" : "Undo fail",
              icon: <RotateCcw />,
              onSelect: () => runStatus(q.id, "planned"),
            },
          ]),
      { separator: true },
      {
        label: "Duplicate",
        icon: <Copy />,
        onSelect: () => duplicate(q, addMinutes(start, q.duration_min)),
      },
      { label: "Copy to tomorrow", icon: <CopyPlus />, onSelect: () => duplicate(q, addDays(start, 1)) },
      {
        label: "Move to tomorrow",
        icon: <CalendarArrowUp />,
        disabled: q.status !== "planned",
        onSelect: () => reschedule(q, addDays(start, 1), q.duration_min),
      },
      { separator: true },
      {
        custom: (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <span className="mr-auto text-xs text-muted">Category</span>
            {CATEGORY_KEYS.map((key) => (
              <button
                key={key}
                title={CATEGORIES[key].label}
                onClick={() => {
                  closeMenu();
                  if (key !== q.category) changeCategory(q, key);
                }}
                className="grid size-5 place-items-center rounded-full transition hover:scale-110"
                style={{ background: CATEGORIES[key].soft }}
              >
                <span
                  className={`rounded-full ${key === q.category ? "size-3" : "size-2"}`}
                  style={{ background: CATEGORIES[key].color }}
                />
              </button>
            ))}
          </div>
        ),
      },
      { separator: true },
      { label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => remove(q.id).then((e) => e && setError(e)) },
    ];
  }

  function slotMenuItems(start: Date): MenuItem[] {
    return [
      { label: `New quest at ${formatTime(start)}`, icon: <Plus />, shortcut: "N", onSelect: () => openNew(start) },
    ];
  }

  async function reschedule(q: Quest, start: Date, duration: number) {
    const patch = { start_at: start.toISOString(), duration_min: duration };
    // Optimistic update so the block doesn't snap back while saving.
    setQuests((qs) => qs.map((x) => (x.id === q.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("quests").update(patch).eq("id", q.id);
    if (error) setError(error.message);
    else {
      const moved = start.getTime() !== new Date(q.start_at).getTime();
      pushUndo(`${moved ? "Moved" : "Resized"} “${q.title}”`, () =>
        supabase.from("quests").update({ start_at: q.start_at, duration_min: q.duration_min }).eq("id", q.id),
      );
    }
    refresh();
  }

  // Keyboard shortcuts: T = today, N = new quest, arrows = previous/next, Ctrl/⌘+Z = undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLast();
        return;
      }
      if (e.key === "t") setDate(startOfDay(new Date()));
      if (e.key === "n") openNew(nextHalfHour());
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const earnedToday = todayQuests
    .filter((q) => q.status === "completed")
    .reduce((sum, q) => sum + q.xp, 0);
  const lvl = levelInfo(profile.total_xp);
  const emergencyUntil = profile.unlocked_until ? new Date(profile.unlocked_until) : null;
  // Same rule as the extension and iPhone lock (supabase/011_lock_modes.sql).
  const lockMode = profile.lock_mode ?? "during_quests";
  const lockCategories = profile.lock_categories ?? ["study", "other"];
  const unfinished = todayQuests.filter(
    (q) => (q.status === "planned" || q.status === "active") && lockCategories.includes(q.category),
  );
  const questsLeft = unfinished.filter((q) => new Date(q.start_at).getTime() + q.duration_min * 60_000 > nowMs).length;
  const questNow = unfinished.find(
    (q) =>
      q.status === "active" ||
      (nowMs >= new Date(q.start_at).getTime() && nowMs < new Date(q.start_at).getTime() + q.duration_min * 60_000),
  );
  const scheduleFree =
    lockMode === "during_quests" ? !questNow : lockMode === "until_done" ? questsLeft === 0 : false;
  const sitesUnlocked =
    earnedToday >= profile.daily_xp_goal || scheduleFree || (emergencyUntil !== null && emergencyUntil > new Date());

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-5 border-r border-line bg-surface p-4 md:flex">
        <div className="flex items-center gap-2 px-1 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-ink text-canvas">
            <Swords size={14} />
          </span>
          QuestLog
        </div>

        <div className="rounded-lg bg-canvas p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{profile.username}</span>
            <span className="flex items-center gap-1">
              <span
                title={describeStreak(streak)}
                className={`flex items-center gap-0.5 rounded px-1.5 text-xs font-semibold ${
                  streak.current ? "bg-gold-soft text-gold" : "bg-surface text-faint"
                }`}
              >
                <Flame size={12} /> {streak.current}
              </span>
              <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent">
                Lv {lvl.level}
              </span>
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
            <span>{streak.todayDone ? "Goal reached ✓" : "Today's goal"}</span>
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
          <button
            onClick={() => setSummary({ day: new Date() })}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-line py-1 text-xs text-muted hover:bg-surface hover:text-ink"
          >
            <NotebookText size={12} /> Daily summary
          </button>
        </div>

        <Link
          href="/settings"
          title="Focus lock settings"
          className={`-mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition hover:brightness-95 ${
            sitesUnlocked ? "bg-xp-soft text-xp" : "bg-accent-soft text-accent"
          }`}
        >
          {sitesUnlocked ? <LockOpen size={14} /> : <Lock size={14} />}
          <span className="flex-1">
            <span className="font-semibold">{sitesUnlocked ? "Sites unlocked" : "Sites locked"}</span>
            <span className="block opacity-80">
              {sitesUnlocked
                ? earnedToday >= profile.daily_xp_goal
                  ? "Goal reached. Enjoy your break!"
                  : scheduleFree
                    ? lockMode === "during_quests"
                      ? "No quest right now"
                      : "No quests left today"
                    : `Emergency unlock until ${formatTime(emergencyUntil!)}`
                : questNow
                  ? `During “${questNow.title}”`
                  : `${profile.daily_xp_goal - earnedToday} XP to unlock today`}
            </span>
          </span>
        </Link>

        {extensionInstalled === false && (
          <Link
            href="/settings#extension"
            className="-mt-3 flex items-start gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted hover:text-ink"
          >
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-gold" />
            <span>
              Focus lock isn&apos;t installed in this browser profile.{" "}
              <span className="font-medium text-accent">Set it up →</span>
            </span>
          </Link>
        )}

        <MiniCalendar selected={date} onSelect={(d) => setDate(startOfDay(d))} />

        <CalendarLayers layers={layers} onChanged={refresh} />

        <DueSoon items={dueSoon} layers={layerMap} onOpen={openEdit} onPlan={() => setPlanOpen(true)} />

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
                  <li
                    key={q.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ kind: "quest", quest: q, x: e.clientX, y: e.clientY });
                    }}
                    className="flex items-center gap-1.5 rounded-md px-1 hover:bg-surface-hover"
                  >
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

        <div>
          <Link
            href="/insights"
            className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-ink"
          >
            <ChartColumnBig size={14} /> Insights &amp; achievements
          </Link>
          <Link
            href="/settings"
            className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-ink"
          >
            <Settings size={14} /> Settings
          </Link>
          <form action={signOut}>
            <button className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-ink">
              <LogOut size={14} /> Log out
            </button>
          </form>
        </div>
      </aside>

      {/* Main calendar */}
      <main className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {/* Buttons come before the date so they stay put while the date's width changes. */}
          <button
            onClick={() => setDate(startOfDay(new Date()))}
            disabled={days.some((d) => isSameDay(d, new Date()))}
            className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-surface disabled:text-faint disabled:hover:bg-transparent"
          >
            Today
          </button>
          <div className="flex items-center">
            <IconButton label="Previous" onClick={() => go(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton label="Next" onClick={() => go(1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight md:flex-none md:text-lg">
            {view === "day"
              ? date.toLocaleDateString([], {
                  weekday: isMobile ? "short" : "long",
                  month: isMobile ? "short" : "long",
                  day: "numeric",
                })
              : rangeLabel(days[0], days[6])}
          </h1>

          <div className="hidden flex-1 md:block" />

          <div className="hidden grid-cols-2 rounded-lg bg-surface p-0.5 text-sm md:grid">
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
            onClick={() => setPlanOpen(true)}
            title="Plan my week: study blocks for upcoming deadlines"
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm hover:bg-surface"
          >
            <CalendarRange size={15} className="text-accent" />
            <span className="hidden sm:inline">Plan week</span>
          </button>
          <button
            onClick={() => openNew(nextHalfHour(date))}
            className="hidden items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover md:flex"
          >
            <Plus size={15} /> New quest
          </button>
        </header>

        {/* Phone: level, streak and today's XP (the sidebar is hidden on phones) */}
        <button
          onClick={() => setSummary({ day: new Date() })}
          className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 text-left md:hidden"
        >
          <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent">
            Lv {lvl.level}
          </span>
          <span
            className={`flex items-center gap-0.5 rounded px-1.5 text-xs font-semibold ${
              streak.current ? "bg-gold-soft text-gold" : "bg-canvas text-faint"
            }`}
          >
            <Flame size={12} /> {streak.current}
          </span>
          <span className="flex-1">
            <span className="block h-1.5 overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full bg-xp transition-all"
                style={{ width: `${Math.min(100, (earnedToday / profile.daily_xp_goal) * 100)}%` }}
              />
            </span>
          </span>
          <span className="text-xs text-muted">
            <span className="font-semibold text-xp">{earnedToday}</span>/{profile.daily_xp_goal} XP
          </span>
        </button>

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

        <div
          ref={swipeArea}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          // Stops the browser treating a sideways trackpad swipe as Back/Forward.
          style={{ overscrollBehaviorX: "none" }}
          className="flex min-h-0 flex-1 flex-col"
        >
        {isMobile && mobileTab === "quests" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <MobileQuestList
              quests={quests.filter((q) => !isDeadline(q))}
              onOpen={openEdit}
              onStatus={runStatus}
              onNew={() => openNew(nextHalfHour(date))}
            />
            {dueSoon.length > 0 && (
              <div className="border-t border-line px-3 py-3">
                <DueSoon items={dueSoon} layers={layerMap} onOpen={openEdit} onPlan={() => setPlanOpen(true)} />
              </div>
            )}
          </div>
        ) : (
          <CalendarGrid
            days={days}
            quests={quests}
            onCreate={openNew}
            onEdit={openEdit}
            onReschedule={reschedule}
            onQuestMenu={(quest, x, y) => setMenu({ kind: "quest", quest, x, y })}
            onSlotMenu={(start, x, y) => setMenu({ kind: "slot", start, x, y })}
            layers={layerMap}
          />
        )}
        </div>
      </main>

      {/* Phone bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-5 items-center">
          <NavItem
            label="Calendar"
            active={mobileTab === "calendar"}
            onClick={() => setMobileTab("calendar")}
          >
            <CalendarDays size={20} />
          </NavItem>
          <NavItem label="Quests" active={mobileTab === "quests"} onClick={() => setMobileTab("quests")}>
            <ListChecks size={20} />
          </NavItem>
          <button
            aria-label="New quest"
            onClick={() => openNew(nextHalfHour(date))}
            className="mx-auto -mt-6 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 active:scale-95"
          >
            <Plus size={26} />
          </button>
          <Link
            href="/insights"
            className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-muted"
          >
            <ChartColumnBig size={20} />
            Insights
          </Link>
          <Link
            href="/settings"
            className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-muted"
          >
            <Settings size={20} />
            Settings
          </Link>
        </div>
      </nav>

      {draft && (
        <QuestModal
          key={draft.id ?? `${draft.date}T${draft.time}`}
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={save}
          onDelete={remove}
          onStatus={setStatus}
          urgency={urgency}
        />
      )}

      {summary && (
        <DailySummary
          initialDay={summary.day}
          goal={profile.daily_xp_goal}
          missedNotice={summary.notice}
          onClose={() => setSummary(null)}
        />
      )}

      {planOpen && (
        <PlanWeekDialog
          layers={layerMap}
          urgency={urgency}
          onClose={() => setPlanOpen(false)}
          onAdded={(ids) => {
            setPlanOpen(false);
            pushUndo(`Added ${ids.length} study block${ids.length === 1 ? "" : "s"}`, () =>
              supabase.from("quests").delete().in("id", ids),
            );
            refresh();
          }}
        />
      )}

      {menu && (
        <ContextMenu
          key={`${menu.x},${menu.y}`}
          x={menu.x}
          y={menu.y}
          title={menu.kind === "quest" ? menu.quest.title : undefined}
          items={menu.kind === "quest" ? questMenuItems(menu.quest) : slotMenuItems(menu.start)}
          onClose={closeMenu}
        />
      )}

      {undoNotice && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100%-2rem)] -translate-x-1/2 animate-[toast-in_200ms_ease-out] items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-canvas shadow-xl md:bottom-6">
          <span className="truncate">{undoNotice.label}</span>
          <button onClick={undoLast} className="shrink-0 font-semibold text-accent hover:underline">
            Undo
          </button>
          <span className="hidden shrink-0 text-xs text-canvas/60 md:inline">Ctrl+Z</span>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[60] animate-[toast-in_300ms_ease-out] rounded-xl border border-line bg-canvas px-4 py-3 shadow-xl sm:inset-x-auto sm:right-6 sm:top-6">
          {"failed" in toast ? (
            <>
              <p className="text-2xl font-bold text-danger">−{toast.lost} XP</p>
              <p className="max-w-56 truncate text-xs text-muted">Quest failed · {toast.failed}</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-xp">+{toast.xp} XP</p>
              <p className="text-xs text-muted">Quest complete!</p>
              {toast.bonus && (
                <p className="mt-2 flex items-center gap-1 rounded-md bg-gold-soft px-2 py-1 text-sm font-semibold text-gold">
                  <Flame size={14} /> Daily goal reached! +{toast.bonus} XP · {toast.streak}-day streak
                </p>
              )}
              {toast.froze && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-accent">
                  <Snowflake size={12} /> Streak freeze covered yesterday — streak saved
                </p>
              )}
              {toast.newLevel && (
                <p className="mt-1 text-sm font-semibold text-accent">
                  Level up! You&apos;re now Lv {toast.newLevel} 🎉
                </p>
              )}
            </>
          )}
        </div>
      )}

      {badge && (
        <Link
          href="/insights"
          className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex animate-[toast-in_300ms_ease-out] items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3 shadow-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-80"
        >
          <BadgeIcon achievement={badge} size={44} />
          <span className="min-w-0">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-gold">Achievement unlocked</span>
            <span className="block truncate text-sm font-semibold">{badge.title}</span>
            <span className="block truncate text-xs text-muted">{badge.description}</span>
          </span>
        </Link>
      )}
    </div>
  );
}

function NavItem({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 text-[10px] font-medium ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(MOBILE_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

/**
 * The QuestLog extension marks <html data-questlog-extension>. Returns true/false in desktop
 * Chromium browsers (where the extension can run) and null elsewhere, e.g. on phones.
 */
function useExtensionInstalled() {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-questlog-extension"],
      });
      return () => observer.disconnect();
    },
    () => {
      const ua = navigator.userAgent;
      const desktopChromium = /Chrome|Chromium|Edg\//.test(ua) && !/Mobile|Android/.test(ua);
      if (!desktopChromium) return null;
      return document.documentElement.dataset.questlogExtension !== undefined;
    },
    () => null,
  );
}

/** The current time, refreshed every 30 seconds (for "is a quest happening now?"). */
function useNowMs() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode); the report may just show again.
  }
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
