"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

export type MenuItem =
  | {
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { separator: true }
  | { custom: React.ReactNode }
  /** Opens a second menu beside this one (e.g. Jira statuses); `close` closes both. */
  | { label: string; icon?: React.ReactNode; hint?: string; submenu: (close: () => void) => React.ReactNode };

type Props = {
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
  onClose: () => void;
};

/** Right-click menu, positioned at the cursor and kept inside the window. */
export function ContextMenu({ x, y, title, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSub, setOpenSub] = useState<number | null>(null);
  // Second menus open to the right, or to the left when there's no room.
  const [subLeft, setSubLeft] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - width - 8);
    setPos({ left, top: Math.min(y, window.innerHeight - height - 8) });
    setSubLeft(left + width + 240 > window.innerWidth);
  }, [x, y]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[70] min-w-52 animate-[toast-in_120ms_ease-out] rounded-lg border border-line bg-canvas p-1 text-sm shadow-xl"
      style={pos}
    >
      {title && (
        <p className="truncate px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
          {title}
        </p>
      )}
      {items.map((item, i) => {
        if ("separator" in item) return <div key={i} className="my-1 h-px bg-line" />;
        if ("custom" in item) return <div key={i}>{item.custom}</div>;
        if ("submenu" in item) {
          const open = openSub === i;
          return (
            <div key={i} className="relative" onMouseEnter={() => setOpenSub(i)}>
              <button
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpenSub(open ? null : i)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink transition hover:bg-surface ${open ? "bg-surface" : ""}`}
              >
                <span className="grid w-4 place-items-center text-muted [&>svg]:size-3.5">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="max-w-24 truncate text-xs text-faint">{item.hint}</span>}
                <ChevronRight size={13} className="text-faint" />
              </button>
              {open && (
                <div
                  role="menu"
                  className={`absolute top-0 z-[71] w-56 rounded-lg border border-line bg-canvas p-1 shadow-xl ${
                    subLeft ? "right-full mr-1" : "left-full ml-1"
                  }`}
                >
                  {item.submenu(onClose)}
                </div>
              )}
            </div>
          );
        }
        return (
          <button
            key={i}
            role="menuitem"
            onMouseEnter={() => setOpenSub(null)}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition disabled:pointer-events-none disabled:opacity-40 ${
              item.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface"
            }`}
          >
            <span className="grid w-4 place-items-center text-muted [&>svg]:size-3.5">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-xs text-faint">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
