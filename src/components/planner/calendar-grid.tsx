"use client";

import { useEffect, useRef, useState } from "react";
import {
  addMinutes,
  formatTime,
  isSameDay,
  minutesIntoDay,
  startOfDay,
} from "@/lib/dates";
import { Check, X } from "lucide-react";
import type { Rank } from "@/lib/difficulty";
import { CATEGORIES, type Quest } from "@/lib/quests";
import { RankBadge } from "./rank-badge";

const HOUR_HEIGHT = 52; // px per hour
const SNAP = 15; // minutes
const DRAG_THRESHOLD = 4; // px before a press counts as a drag instead of a click
const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Props = {
  days: Date[];
  quests: Quest[];
  onCreate: (start: Date) => void;
  onEdit: (quest: Quest) => void;
  onReschedule: (quest: Quest, start: Date, durationMin: number) => void;
  onQuestMenu: (quest: Quest, x: number, y: number) => void;
  onSlotMenu: (start: Date, x: number, y: number) => void;
};

type Drag = {
  quest: Quest;
  mode: "move" | "resize";
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  colWidth: number; // measured when the drag starts
};

export function CalendarGrid({
  days,
  quests,
  onCreate,
  onEdit,
  onReschedule,
  onQuestMenu,
  onSlotMenu,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
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
        onEdit(d.quest);
        return;
      }
      const { start, duration } = preview(d);
      if (start.getTime() !== new Date(d.quest.start_at).getTime() || duration !== d.quest.duration_min) {
        onReschedule(d.quest, start, duration);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners read the latest drag via dragRef
  }, [drag?.quest.id]);

  function startDrag(e: React.PointerEvent, quest: Quest, mode: Drag["mode"]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const colWidth = (columnsRef.current?.clientWidth ?? 1) / days.length;
    const d = { quest, mode, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, colWidth };
    dragRef.current = d;
    setDrag(d);
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

  // Apply the in-progress drag so the block follows the pointer.
  const shown = quests.map((q) => {
    if (drag?.quest.id !== q.id) return q;
    const { start, duration } = preview(drag);
    return { ...q, start_at: start.toISOString(), duration_min: duration };
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
              const dayQuests = shown.filter((q) => isSameDay(new Date(q.start_at), day));
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

                  {dayQuests.map((q) => (
                    <QuestBlock
                      key={q.id}
                      quest={q}
                      col={layout.get(q.id)!}
                      dragging={drag?.quest.id === q.id}
                      onPointerDown={(e, mode) => startDrag(e, q, mode)}
                      onContextMenu={(e) => {
                        e.preventDefault();
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
  col,
  dragging,
  onPointerDown,
  onContextMenu,
}: {
  quest: Quest;
  col: { index: number; count: number };
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent, mode: Drag["mode"]) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const start = new Date(quest.start_at);
  const end = addMinutes(start, quest.duration_min);
  const cat = CATEGORIES[quest.category];
  const height = Math.max((quest.duration_min / 60) * HOUR_HEIGHT - 2, 18);
  const compact = height < 40;
  const done = quest.status === "completed";
  const failed = quest.status === "failed";
  const active = quest.status === "active";

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, "move")}
      onContextMenu={onContextMenu}
      className={`group absolute z-10 cursor-grab touch-none overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-xs transition-shadow ${
        dragging ? "z-30 shadow-lg ring-1 ring-black/5" : "hover:shadow-md"
      } ${done || failed ? "opacity-60" : ""} ${active ? "ring-2 ring-offset-1" : ""}`}
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
          {!compact && quest.xp > 0 && (
            <span className={done ? "font-medium text-xp" : ""}> · {done ? "+" : ""}{quest.xp} XP</span>
          )}
        </span>
      </div>
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

