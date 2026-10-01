"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, GraduationCap, Loader2 } from "lucide-react";
import { markLabel, type CanvasCourse } from "@/lib/canvas-grades";

type State = { kind: "loading" } | { kind: "off" } | { kind: "error"; message: string } | { kind: "on"; courses: CanvasCourse[] };

/** Your marks per subject from Canvas: the running total, and each marked assignment. */
export function Grades() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/canvas")
      .then((r) => r.json())
      .then((res) =>
        setState(
          !res.connected
            ? { kind: "off" }
            : res.error
              ? { kind: "error", message: res.error }
              : { kind: "on", courses: (res.courses as CanvasCourse[]).filter((c) => c.assignments.length) },
        ),
      )
      .catch(() => setState({ kind: "error", message: "Couldn't reach Canvas." }));
  }, []);

  return (
    <section className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <GraduationCap size={15} className="text-accent" /> Grades
        </h2>
        <span className="text-[11px] text-faint">From Canvas</span>
      </div>
      {state.kind === "loading" && (
        <p className="flex items-center gap-2 py-4 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" /> Loading your marks…
        </p>
      )}
      {state.kind === "off" && (
        <p className="py-4 text-center text-xs text-faint">
          <Link href="/settings#canvas" className="text-accent hover:underline">
            Connect Canvas
          </Link>{" "}
          to see your marks here and against each boss you beat.
        </p>
      )}
      {state.kind === "error" && <p className="py-4 text-center text-xs text-danger">{state.message}</p>}
      {state.kind === "on" && (
        <ul className="divide-y divide-line">
          {state.courses.map((c) => {
            const marked = c.assignments.filter((a) => a.score !== null);
            const expanded = open === c.id;
            return (
              <li key={c.id} className="py-2">
                <button onClick={() => setOpen(expanded ? null : c.id)} className="flex w-full items-center gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.code}</span>
                    <span className="block truncate text-xs text-muted">{c.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {c.currentScore !== null ? `${Math.round(c.currentScore)}%` : "–"}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {c.currentGrade ?? `${marked.length} marked`}
                    </span>
                  </span>
                  <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {c.currentScore !== null && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full ${c.currentScore >= 80 ? "bg-xp" : c.currentScore >= 50 ? "bg-accent" : "bg-danger"}`}
                      style={{ width: `${Math.min(100, c.currentScore)}%` }}
                    />
                  </div>
                )}
                {expanded && (
                  <ul className="mt-2 space-y-1">
                    {c.assignments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-xs">
                        <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                          {a.name}
                        </a>
                        {a.weight ? <span className="shrink-0 text-faint">{a.weight}%</span> : null}
                        <span className={`shrink-0 tabular-nums ${a.score !== null ? "font-medium" : "text-faint"}`}>
                          {markLabel(a) ?? "not marked"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
