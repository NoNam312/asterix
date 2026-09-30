"use client";

import { useEffect, useRef, useState } from "react";
import {
  addMinutes,
  formatTime,
  isSameDay,
  minutesIntoDay,
  startOfDay,
} from "@/lib/dates";
import { CalendarDays, Check, Flag, X } from "lucide-react";
import type { Rank } from "@/lib/difficulty";
import { haptic } from "@/lib/haptics";
import { xpFor } from "@/lib/difficulty";
import { formatDuration } from "@/lib/dates";
import { CATEGORIES, isDeadline, type CalendarLayer, type Quest } from "@/lib/quests";
import { RankBadge } from "./rank-badge";

const HOUR_HEIGHT = 52; // px per hour
const SNAP = 15; // minutes
const DRAG_THRESHOLD = 6; // px before a mouse press counts as a drag instead of a click
const LONG_PRESS_MS = 450; // touch: hold this long to pick a quest up
const TOUCH_SLOP = 10; // touch: moving further than this before the hold completes means scrolling
const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Props = {
  days: Date[];
  quests: Quest[];
  onCreate: (start: Date) => void;
  onEdit: (quest: Quest) => void;
  onReschedule: (quest: Quest, start: Date, durationMin: number) => void;
  onQuestMenu: (quest: Quest, x: number, y: number) => void;
  onSlotMenu: (start: Date, x: number, y: number) => void;
  /** Subscribed calendar layers, for colouring imported events. */
  layers: Map<string, CalendarLayer>;
};

/** All-day due dates are drawn under the date; they don't have a time. */
const allDayDate = (q: Quest) => {
  const d = new Date(q.start_at);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

type Drag = {
  quest: Quest;
  mode: "move" | "resize";
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  colWidth: number; // measured when the drag starts
  touch: boolean; // started by a long-press on a touch screen
};

export function CalendarGrid({
  days,
  quests,
  onCreate,
  onEdit,
  onReschedule,
  onQuestMenu,
  onSlotMenu,
  layers,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const cancelPressRef = useRef<(() => void) | null>(null);
  const lastPointerRef = useRef<string>("mouse");
  const now = useNow();

  // Start scrolled to ~7am so the working day is visible.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT - 12 });
  }, []);

  function preview(d: Drag) {
    const start = new Date(d.quest.start_at);
    const deltaMin = Math.round((d.dy / HOUR_HEIGHT) * (60 / SNAP)) * SNAP;
    if (d.mode === "resize") {
      const maxDur = 24 * 60 - minutesIntoDay(start);
      return { start, duration: clamp(d.quest.duration_min + deltaMin, SNAP, maxDur) };
    }
    const deltaDays = days.length > 1 ? Math.round(d.dx / d.colWidth) : 0;
    const dayIndex = clamp(days.findIndex((day) => isSameDay(day, start)) + deltaDays, 0, days.length - 1);
    const minutes = clamp(minutesIntoDay(start) + deltaMin, 0, 24 * 60 - d.quest.duration_min);
    return { start: addMinutes(startOfDay(days[dayIndex]), minutes), duration: d.quest.duration_min };
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d, dx: e.clientX - d.x0, dy: e.clientY - d.y0 };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (Math.abs(d.dx) < DRAG_THRESHOLD && Math.abs(d.dy) < DRAG_THRESHOLD) {
        // Mouse click opens the quest; a touch hold released in place opens the quick menu.
        if (d.touch) onQuestMenu(d.quest, d.x0, d.y0);
        else onEdit(d.quest);
        return;
      }
      const { start, duration } = preview(d);
      if (start.getTime() !== new Date(d.quest.start_at).getTime() || duration !== d.quest.duration_min) {
        onReschedule(d.quest, start, duration);
      }
    };
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
    };
    // While a touch drag is active, stop the page from scrolling under the finger.
    const blockScroll = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    if (drag.touch) document.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", blockScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners read the latest drag via dragRef
  }, [drag?.quest.id]);

  useEffect(() => () => cancelPressRef.current?.(), []);

  function beginDrag(d: Drag) {
    dragRef.current = d;
    setDrag(d);
  }

  // Lets the day-swipe gesture (planner.tsx) ignore touches that moved a quest.
  useEffect(() => {
    if (drag) {
      document.documentElement.dataset.questDragging = "1";
      return;
    }
    const t = setTimeout(() => delete document.documentElement.dataset.questDragging, 50);
    return () => clearTimeout(t);
  }, [drag]);

  function startDrag(e: React.PointerEvent, quest: Quest, mode: Drag["mode"]) {
    lastPointerRef.current = e.pointerType;
    // Imported events follow their calendar feed, so they open on click instead of dragging.
    if (quest.calendar_id) {
      e.stopPropagation();
      return;
    }
    const colWidth = (columnsRef.current?.clientWidth ?? 1) / days.length;
    const base = { quest, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, colWidth };

    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      beginDrag({ ...base, mode, touch: false });
      return;
    }

    // Touch: tap opens the quest, swipe scrolls, press-and-hold picks it up.
    e.stopPropagation();
    cancelPressRef.current?.();
    const timer = window.setTimeout(() => {
      cleanup();
      haptic();
      beginDrag({ ...base, mode: "move", touch: true });
    }, LONG_PRESS_MS);
    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - base.x0, ev.clientY - base.y0) > TOUCH_SLOP) cleanup();
    };
    const onUp = () => {
      cleanup();
      onEdit(quest);
    };
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      cancelPressRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
    cancelPressRef.current = cleanup;
  }

  function slotAt(e: React.MouseEvent<HTMLDivElement>, day: Date) {
    const minutes = clamp(Math.floor((e.nativeEvent.offsetY / HOUR_HEIGHT) * 2) * 30, 0, 23 * 60 + 30);
    return addMinutes(startOfDay(day), minutes);
  }

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, day: Date) {
    if (e.target !== e.currentTarget) return;
    onCreate(slotAt(e, day));
  }

  function handleColumnMenu(e: React.MouseEvent<HTMLDivElement>, day: Date) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    onSlotMenu(slotAt(e, day), e.clientX, e.clientY);
  }

  function layerColor(q: Quest) {
    return (q.calendar_id && layers.get(q.calendar_id)?.color) || "#64748b";
  }

  // Apply the in-progress drag so the block follows the pointer.
  const shown = quests.map((q) => {
    if (drag?.quest.id !== q.id) return q;
    const { start, duration } = preview(drag);
    // XP is the quest's hourly rate × length, so it can be updated live while resizing.
    const unfinished = q.status === "planned" || q.status === "active";
    const xp = unfinished ? xpFor((q.xp * 60) / q.duration_min, duration) : q.xp;
    return { ...q, start_at: start.toISOString(), duration_min: duration, xp };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers */}
      <div className="flex overflow-y-hidden border-b border-line" style={{ scrollbarGutter: "stable" }}>
        <div className="w-16 shrink-0" />
        {days.map((day) => {
          const today = isSameDay(day, now);
          return (
            <div key={day.toISOString()} className="flex-1 border-l border-line py-2 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {day.toLocaleDateString([], { weekday: "short" })}
              </div>
              <div
                className={`mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-sm font-semibold ${
                  today ? "bg-accent text-white" : "text-ink"
                }`}
              >
                {day.getDate()}
              </div>
              {quests
                .filter((q) => isDeadline(q) && q.all_day && isSameDay(allDayDate(q), day))
                .map((q) => (
                  <button
                    key={q.id}
                    onClick={() => onEdit(q)}
                    title={q.title}
                    className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium"
                    style={{ background: `${layerColor(q)}1f`, color: layerColor(q) }}
                  >
                    <Flag size={10} className="shrink-0" />
                    <span className="truncate">{q.title}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="relative w-16 shrink-0">
            {HOURS.slice(1).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 whitespace-nowrap text-[11px] text-faint"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {formatTime(new Date(2000, 0, 1, h))}
              </span>
            ))}
          </div>

          <div ref={columnsRef} className={`flex flex-1 ${drag ? "cursor-grabbing select-none" : ""}`}>
            {days.map((day) => {
              const onDay = shown.filter((q) => isSameDay(new Date(q.start_at), day));
              const dayQuests = onDay.filter((q) => !isDeadline(q));
              const deadlines = onDay.filter((q) => isDeadline(q) && !q.all_day);
              const layout = layoutOverlaps(dayQuests);
              return (
                <div
                  key={day.toISOString()}
                  onClick={(e) => handleColumnClick(e, day)}
                  onContextMenu={(e) => handleColumnMenu(e, day)}
                  className="relative flex-1 cursor-cell border-l border-line"
                >
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-line/70"
                      style={{ top: h * HOUR_HEIGHT }}
                    />
                  ))}

                  {isSameDay(day, now) && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      style={{ top: (minutesIntoDay(now) / 60) * HOUR_HEIGHT }}
                    >
                      <span className="-ml-1 size-2 rounded-full bg-danger" />
                      <span className="h-px flex-1 bg-danger" />
                    </div>
                  )}

                  {deadlines.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => onEdit(q)}
                      title={`${q.title} · due ${formatTime(new Date(q.start_at))}`}
                      className="absolute inset-x-0.5 z-20 flex -translate-y-1/2 items-center gap-1 truncate rounded border border-dashed bg-canvas px-1.5 py-0.5 text-left text-[11px] font-medium shadow-sm"
                      style={{
                        top: (minutesIntoDay(new Date(q.start_at)) / 60) * HOUR_HEIGHT,
                        borderColor: layerColor(q),
                        color: layerColor(q),
                      }}
                    >
                      <Flag size={11} className="shrink-0" />
                      <span className="truncate">{q.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] opacity-80">{formatTime(new Date(q.start_at))}</span>
                    </button>
                  ))}

                  {dayQuests.map((q) => (
                    <QuestBlock
                      key={q.id}
                      layer={q.calendar_id ? layers.get(q.calendar_id) : undefined}
                      onOpen={() => onEdit(q)}
                      quest={q}
                      col={layout.get(q.id)!}
                      dragging={drag?.quest.id === q.id}
                      lifted={drag?.quest.id === q.id && drag.touch}
                      onPointerDown={(e, mode) => startDrag(e, q, mode)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        // Touch screens use press-and-hold instead (handled above).
                        if (lastPointerRef.current !== "mouse") return;
                        onQuestMenu(q, e.clientX, e.clientY);
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestBlock({
  quest,
  layer,
  onOpen,
  col,
  dragging,
  lifted,
  onPointerDown,
  onContextMenu,
}: {
  quest: Quest;
  /** Set for events imported from a calendar layer: drawn in the layer's colour. */
  layer?: CalendarLayer;
  onOpen: () => void;
  col: { index: number; count: number };
  dragging: boolean;
  lifted: boolean;
  onPointerDown: (e: React.PointerEvent, mode: Drag["mode"]) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const start = new Date(quest.start_at);
  const end = addMinutes(start, quest.duration_min);
  const cat = layer ? { color: layer.color, soft: `${layer.color}1f` } : CATEGORIES[quest.category];
  const height = Math.max((quest.duration_min / 60) * HOUR_HEIGHT - 2, 18);
  const compact = height < 40;
  const done = quest.status === "completed";
  const failed = quest.status === "failed";
  const active = quest.status === "active";

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, "move")}
      onClick={layer ? onOpen : undefined}
      onContextMenu={onContextMenu}
      className={`no-callout group absolute z-10 cursor-grab overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-xs transition-[box-shadow,transform] ${
        dragging ? "z-30 shadow-lg ring-1 ring-black/5" : "hover:shadow-md"
      } ${lifted ? "scale-[1.04] shadow-xl" : ""} ${done || failed ? "opacity-60" : ""} ${active ? "ring-2 ring-offset-1" : ""}`}
      style={{
        top: (minutesIntoDay(start) / 60) * HOUR_HEIGHT + 1,
        height,
        left: `calc(${(col.index / col.count) * 100}% + 2px)`,
        width: `calc(${100 / col.count}% - 4px)`,
        background: failed ? "var(--color-danger-soft)" : cat.soft,
        borderColor: failed ? "var(--color-danger)" : cat.color,
        ["--tw-ring-color" as string]: cat.color,
      }}
    >
      <div className={`flex items-baseline gap-1.5 ${compact ? "" : "flex-col gap-0"}`}>
        <span className="flex min-w-0 items-center gap-1">
          {layer && <CalendarDays size={11} className="shrink-0" style={{ color: layer.color }} />}
          {done && <Check size={12} className="shrink-0 text-xp" />}
          {failed && <X size={12} className="shrink-0 text-danger" />}
          {quest.difficulty && !done && !failed && <RankBadge rank={quest.difficulty as Rank} />}
          <span className={`truncate font-medium text-ink ${done || failed ? "line-through" : ""}`}>
            {quest.title}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-muted">
          {formatTime(start)}
          {!compact && ` – ${formatTime(end)}`}
          {!compact && failed && (
            <span className="font-medium text-danger"> · −{quest.xp_penalty} XP</span>
          )}
          {!compact && !failed && quest.xp > 0 && (
            <span className={done ? "font-medium text-xp" : ""}> · {done ? "+" : ""}{quest.xp} XP</span>
          )}
        </span>
      </div>
      {/* Live readout while moving or resizing: length and the XP it will be worth. */}
      {dragging && !done && !failed && (
        <span className="pointer-events-none absolute bottom-2.5 right-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-canvas shadow">
          {formatDuration(quest.duration_min)} · +{quest.xp} XP
        </span>
      )}
      <div
        onPointerDown={(e) => onPointerDown(e, "resize")}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
      >
        <div className="mx-auto mt-0.5 h-0.5 w-6 rounded-full" style={{ background: cat.color }} />
      </div>
    </div>
  );
}

/** Places overlapping quests side by side, like Google Calendar. */
function layoutOverlaps(quests: Quest[]) {
  const result = new Map<string, { index: number; count: number }>();
  const sorted = [...quests].sort((a, b) => a.start_at.localeCompare(b.start_at));
  let cluster: Quest[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = 0;

  const flush = () => {
    cluster.forEach((q) => (result.get(q.id)!.count = columnEnds.length));
    cluster = [];
    columnEnds = [];
  };

  for (const q of sorted) {
    const start = new Date(q.start_at).getTime();
    const end = start + q.duration_min * 60_000;
    if (cluster.length && start >= clusterEnd) flush();
    let index = columnEnds.findIndex((colEnd) => colEnd <= start);
    if (index === -1) index = columnEnds.push(end) - 1;
    else columnEnds[index] = end;
    result.set(q.id, { index, count: 1 });
    cluster.push(q);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

