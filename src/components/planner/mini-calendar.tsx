"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, isSameDay, startOfMonth, startOfWeek } from "@/lib/dates";

export function MiniCalendar({
  selected,
  onSelect,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(selected));
  const [shownFor, setShownFor] = useState(selected);
  // Follow the main calendar when it navigates to another month.
  if (!isSameDay(shownFor, selected)) {
    setShownFor(selected);
    setMonth(startOfMonth(selected));
  }

  const gridStart = startOfWeek(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  return (
    <div className="select-none text-xs">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="font-medium">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </span>
        <div className="flex">
          <NavButton onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={14} />
          </NavButton>
          <NavButton onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={14} />
          </NavButton>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="py-1 text-[10px] text-faint">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isSelected = isSameDay(d, selected);
          const isToday = isSameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelect(d)}
              className={`mx-auto grid size-6 place-items-center rounded-full transition ${
                isSelected
                  ? "bg-ink text-canvas"
                  : isToday
                    ? "font-semibold text-accent hover:bg-surface-hover"
                    : inMonth
                      ? "text-ink hover:bg-surface-hover"
                      : "text-faint hover:bg-surface-hover"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-ink" />;
}
