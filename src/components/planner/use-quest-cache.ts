"use client";

import { useCallback, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, toDateInput } from "@/lib/dates";
import type { Quest } from "@/lib/quests";

const PAGE = 1000; // Supabase returns at most 1000 rows per request

export const dayKey = (d: Date) => toDateInput(d);
const questDay = (q: Pick<Quest, "start_at">) => dayKey(new Date(q.start_at));

/**
 * Quests cached by local day, so paging through the calendar shows days already seen
 * straight away (they're refreshed in the background) and nearby weeks can be preloaded.
 */
export function useQuestCache(supabase: SupabaseClient, onError: (message: string) => void) {
  const [byDay, setByDay] = useState<Record<string, Quest[]>>({});
  const loaded = useRef(new Set<string>());
  /** Days being fetched right now, so preloads don't ask for them twice. */
  const pending = useRef(new Set<string>());

  /** Replaces the cached days in [from, to) with `rows`. */
  const store = useCallback((from: Date, to: Date, rows: Quest[]) => {
    const keys: string[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) keys.push(dayKey(d));
    setByDay((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = [];
      for (const q of rows) (next[questDay(q)] ??= []).push(q);
      return next;
    });
    for (const k of keys) loaded.current.add(k);
  }, []);

  const isLoaded = useCallback((from: Date, to: Date) => {
    for (let d = from; d < to; d = addDays(d, 1)) if (!loaded.current.has(dayKey(d))) return false;
    return true;
  }, []);

  /** Fetches every quest starting in [from, to) and caches those days. */
  const load = useCallback(
    async (from: Date, to: Date) => {
      const keys: string[] = [];
      for (let d = from; d < to; d = addDays(d, 1)) keys.push(dayKey(d));
      for (const k of keys) pending.current.add(k);
      const done = () => keys.forEach((k) => pending.current.delete(k));
      const rows: Quest[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from("quests")
          .select("*")
          .gte("start_at", from.toISOString())
          .lt("start_at", to.toISOString())
          .order("start_at")
          .range(offset, offset + PAGE - 1);
        if (error) {
          done();
          onError(error.message);
          return;
        }
        rows.push(...((data ?? []) as Quest[]));
        if (!data || data.length < PAGE) break;
      }
      store(from, to, rows);
      done();
    },
    [supabase, onError, store],
  );

  /** Loads whatever part of [from, to) isn't cached yet, in one request. */
  const ensure = useCallback(
    async (from: Date, to: Date) => {
      let first: Date | null = null;
      let last: Date | null = null;
      for (let d = from; d < to; d = addDays(d, 1)) {
        if (loaded.current.has(dayKey(d)) || pending.current.has(dayKey(d))) continue;
        first ??= d;
        last = d;
      }
      if (first && last) await load(first, addDays(last, 1));
    },
    [load],
  );

  /** Changes cached quests in place (optimistic updates, new scores); moves them if their day changed. */
  const patch = useCallback((changes: Map<string, Partial<Quest>>) => {
    if (!changes.size) return;
    setByDay((prev) => {
      const moved: Quest[] = [];
      const next: Record<string, Quest[]> = {};
      for (const [k, qs] of Object.entries(prev)) {
        next[k] = [];
        for (const q of qs) {
          const change = changes.get(q.id);
          if (!change) next[k].push(q);
          else if (change.start_at && questDay(change as Quest) !== k) moved.push({ ...q, ...change });
          else next[k].push({ ...q, ...change });
        }
      }
      for (const q of moved) {
        const k = questDay(q);
        next[k] = [...(next[k] ?? []), q].sort(
          (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
        );
      }
      return next;
    });
  }, []);

  return { byDay, load, ensure, isLoaded, patch, store };
}
