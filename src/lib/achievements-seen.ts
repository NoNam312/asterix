// Which achievements this device has already announced (browser only).
import type { Achievement } from "./achievements";

const KEY = "questlog:achievements-seen";

function read(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function write(ids: Iterable<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode: announcements may repeat; fine.
  }
}

/**
 * Unlocked achievements not announced on this device yet, and marks them as announced.
 * The first time, everything already earned is marked quietly so old badges don't flood in.
 */
export function takeNewAchievements(all: Achievement[]): Achievement[] {
  const unlocked = all.filter((a) => a.unlocked);
  const seen = read();
  write(unlocked.map((a) => a.id).concat(seen ? [...seen] : []));
  if (!seen) return [];
  return unlocked.filter((a) => !seen.has(a.id));
}

/** True once this device has recorded which achievements were already earned. */
export function achievementsSeeded() {
  return read() !== null;
}

/** Achievements unlocked since the Insights page was last opened (without marking them). */
export function unseenIds(all: Achievement[]): Set<string> {
  const seen = read();
  if (!seen) return new Set();
  return new Set(all.filter((a) => a.unlocked && !seen.has(a.id)).map((a) => a.id));
}

export function markSeen(all: Achievement[]) {
  const seen = read() ?? new Set<string>();
  for (const a of all) if (a.unlocked) seen.add(a.id);
  write(seen);
}
