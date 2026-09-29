"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Flag, Loader2, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LAYER_COLORS, type CalendarLayer } from "@/lib/quests";

type SeriesChoice = {
  key: string;
  title: string;
  when: string;
  count: number;
  next?: string;
  isDeadline?: boolean;
};

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function previewFeed(url: string): Promise<{ name?: string; series: SeriesChoice[] }> {
  const res = await fetch("/api/calendars/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, tz: timeZone() }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Couldn't read that calendar.");
  return body;
}

export async function syncLayer(id: string) {
  const res = await fetch(`/api/calendars/${id}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tz: timeZone() }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Sync failed.");
  return body as { added: number; updated: number; removed: number };
}

/** Sidebar list of subscribed calendars: show/hide each layer, add or manage them. */
export function CalendarLayers({ layers, onChanged }: { layers: CalendarLayer[]; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<CalendarLayer | null>(null);

  async function toggle(layer: CalendarLayer) {
    await supabase.from("calendars").update({ visible: !layer.visible }).eq("id", layer.id);
    onChanged();
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">Calendars</h3>
        <button
          onClick={() => setAdding(true)}
          title="Subscribe to a calendar"
          className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-ink"
        >
          <CalendarPlus size={14} />
        </button>
      </div>
      {layers.length === 0 ? (
        <button onClick={() => setAdding(true)} className="px-1 pt-1 text-left text-xs text-faint hover:text-accent">
          + Add your timetable or Canvas
        </button>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {layers.map((layer) => (
            <li key={layer.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-surface-hover">
              <button
                aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                onClick={() => toggle(layer)}
                className="grid size-4 shrink-0 place-items-center rounded border-2"
                style={{ borderColor: layer.color, background: layer.visible ? layer.color : "transparent" }}
              >
                {layer.visible && <Check size={10} strokeWidth={3} className="text-white" />}
              </button>
              <button onClick={() => setManaging(layer)} className="min-w-0 flex-1 truncate text-left text-xs">
                {layer.name}
              </button>
              {layer.last_error && (
                <span title={layer.last_error}>
                  <TriangleAlert size={12} className="text-danger" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddCalendarDialog
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
      {managing && (
        <ManageCalendarDialog
          layer={managing}
          onClose={() => setManaging(null)}
          onChanged={() => {
            setManaging(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ---------- dialogs ----------

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-canvas shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-2">
      {LAYER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          onClick={() => onChange(c)}
          className={`size-6 rounded-full transition ${value === c ? "ring-2 ring-offset-2" : ""}`}
          style={{ background: c, ["--tw-ring-color" as string]: c }}
        />
      ))}
    </div>
  );
}

/** Checklist of repeating classes, one-off events and deadlines found in a feed. */
function SeriesPicker({
  series,
  kept,
  onChange,
}: {
  series: SeriesChoice[];
  kept: Set<string>;
  onChange: (kept: Set<string>) => void;
}) {
  const toggle = (key: string) => {
    const next = new Set(kept);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };
  const classes = series.filter((s) => !s.key.startsWith("__"));
  const extras = series.filter((s) => s.key.startsWith("__"));

  return (
    <div>
      {classes.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Weekly classes</p>
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-accent hover:underline" onClick={() => onChange(new Set(series.map((s) => s.key)))}>
                Keep all
              </button>
              <button type="button" className="text-muted hover:underline" onClick={() => onChange(new Set(extras.map((s) => s.key)))}>
                None
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-faint">Untick the classes you skip. You can change this any time.</p>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {classes.map((s) => (
              <SeriesRow key={s.key} s={s} checked={kept.has(s.key)} onToggle={() => toggle(s.key)} />
            ))}
          </ul>
        </>
      )}
      {extras.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {extras.map((s) => (
            <SeriesRow key={s.key} s={s} checked={kept.has(s.key)} onToggle={() => toggle(s.key)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SeriesRow({ s, checked, onToggle }: { s: SeriesChoice; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
        <input type="checkbox" checked={checked} onChange={onToggle} className="size-4 accent-[var(--color-accent)]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {s.isDeadline && <Flag size={12} className="text-muted" />}
            <span className="truncate">{s.title}</span>
          </span>
          <span className="block text-xs text-muted">
            {s.when}
            {!s.key.startsWith("__") && ` · ${s.count} weeks`}
            {s.next && ` · next ${s.next}`}
            {s.isDeadline && " · shown as markers, no XP"}
          </span>
        </span>
      </label>
    </li>
  );
}

function AddCalendarDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(LAYER_COLORS[0]);
  const [series, setSeries] = useState<SeriesChoice[] | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("Reading calendar…");
    try {
      const result = await previewFeed(url);
      setSeries(result.series);
      setKept(new Set(result.series.map((s) => s.key)));
      setName((n) => n || result.name || (/canvas|instructure/i.test(url) ? "Canvas" : "Timetable"));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  }

  async function save() {
    if (!series) return;
    setError(null);
    setBusy("Importing…");
    const { data: cal, error: insertError } = await supabase
      .from("calendars")
      .insert({ name: name.trim() || "Calendar", url: url.trim(), color })
      .select("id")
      .single();
    if (insertError || !cal) {
      setError(insertError?.message ?? "Couldn't save the calendar.");
      setBusy(null);
      return;
    }
    await supabase.from("calendar_series").insert(
      series.map((s) => ({ calendar_id: cal.id, series_key: s.key, title: s.title.slice(0, 200), kept: kept.has(s.key) })),
    );
    try {
      await syncLayer(cal.id);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <Dialog title="Subscribe to a calendar" onClose={onClose}>
      {!series ? (
        <form onSubmit={preview} className="space-y-3">
          <p className="text-sm text-muted">
            Paste a calendar feed link (.ics or webcal://): your class timetable, Canvas (Calendar → Calendar Feed),
            Google Calendar, Outlook, or any other. It stays a separate layer you can hide or remove in one click.
          </p>
          <input
            autoFocus
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="webcal://… or https://….ics"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <p className="text-[11px] text-faint">
            These links are private keys to your calendar. QuestLog stores it only for your account and never shows it again.
          </p>
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <button
              disabled={!!busy}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ?? "Next: choose classes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Layer name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="mt-1 w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <SeriesPicker series={series} kept={kept} onChange={setKept} />
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex items-center justify-between">
            <button onClick={() => setSeries(null)} className="text-sm text-muted hover:text-ink">
              Back
            </button>
            <button
              onClick={save}
              disabled={!!busy}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ?? "Add calendar"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ManageCalendarDialog({
  layer,
  onClose,
  onChanged,
}: {
  layer: CalendarLayer;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(layer.name);
  const [color, setColor] = useState(layer.color);
  const [series, setSeries] = useState<SeriesChoice[] | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(layer.last_error);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await task();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  }

  const saveDetails = () =>
    run("Saving…", async () => {
      const { error } = await supabase.from("calendars").update({ name: name.trim() || layer.name, color }).eq("id", layer.id);
      if (error) throw error;
      onChanged();
    });

  const syncNow = () =>
    run("Syncing…", async () => {
      const r = await syncLayer(layer.id);
      setMessage(`Synced: ${r.added} added, ${r.updated} updated, ${r.removed} removed.`);
    });

  const chooseClasses = () =>
    run("Reading calendar…", async () => {
      const [{ data: cal }, { data: rows }] = await Promise.all([
        supabase.from("calendars").select("url").eq("id", layer.id).single(),
        supabase.from("calendar_series").select("series_key, kept").eq("calendar_id", layer.id),
      ]);
      if (!cal) throw new Error("Calendar not found.");
      const result = await previewFeed(cal.url);
      const saved = new Map((rows ?? []).map((r) => [r.series_key as string, r.kept as boolean]));
      setSeries(result.series);
      setKept(new Set(result.series.filter((s) => saved.get(s.key) ?? true).map((s) => s.key)));
    });

  const saveClasses = () =>
    run("Updating…", async () => {
      if (!series) return;
      const { error } = await supabase.from("calendar_series").upsert(
        series.map((s) => ({ calendar_id: layer.id, series_key: s.key, title: s.title.slice(0, 200), kept: kept.has(s.key) })),
        { onConflict: "calendar_id,series_key" },
      );
      if (error) throw error;
      await syncLayer(layer.id);
      onChanged();
    });

  const remove = () =>
    run("Removing…", async () => {
      const { error } = await supabase.from("calendars").delete().eq("id", layer.id);
      if (error) throw error;
      onChanged();
    });

  return (
    <Dialog title={layer.name} onClose={onClose}>
      {series ? (
        <div className="space-y-4">
          <SeriesPicker series={series} kept={kept} onChange={setKept} />
          <div className="flex items-center justify-between">
            <button onClick={() => setSeries(null)} className="text-sm text-muted hover:text-ink">
              Back
            </button>
            <button
              onClick={saveClasses}
              disabled={!!busy}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ?? "Save choices"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Layer name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="mt-1 w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {(name !== layer.name || color !== layer.color) && (
            <button onClick={saveDetails} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
              Save name and colour
            </button>
          )}

          <div className="rounded-lg bg-surface p-3 text-sm">
            <p className="text-muted">
              {layer.last_synced_at
                ? `Last synced ${new Date(layer.last_synced_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}. Syncs automatically every few hours.`
                : "Not synced yet."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={syncNow}
                disabled={!!busy}
                className="flex items-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-60"
              >
                <RefreshCw size={13} className={busy === "Syncing…" ? "animate-spin" : ""} /> Sync now
              </button>
              <button
                onClick={chooseClasses}
                disabled={!!busy}
                className="rounded-md border border-line bg-canvas px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-60"
              >
                Choose which classes to keep
              </button>
            </div>
          </div>

          {message && <p className="rounded-md bg-xp-soft px-3 py-2 text-sm text-xp">{message}</p>}
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          {busy && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> {busy}</p>}

          <div className="border-t border-line pt-4">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Remove this layer and all its events from your calendar? XP you already earned stays.</span>
                <button onClick={remove} className="rounded-md bg-danger px-3 py-1.5 font-medium text-white">
                  Remove
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-muted">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm text-danger hover:underline"
              >
                <Trash2 size={13} /> Remove this calendar layer
              </button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
