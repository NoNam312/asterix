// Server-only: fetches a calendar feed (.ics / webcal), expands its events and groups
// repeating classes into series ("Models of Computation Lecture 1 · Tue 11:00").
import "server-only";
import ical, { type ParameterValue, type VEvent } from "node-ical";

export const ONEOFFS_KEY = "__oneoffs";
export const DEADLINES_KEY = "__deadlines";

const MAX_BYTES = 5_000_000;
const DAY = 86_400_000;

export type FeedEvent = {
  uid: string;
  seriesKey: string;
  title: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  isDeadline: boolean;
};

export type SeriesSummary = {
  key: string;
  title: string;
  /** e.g. "Tue 11:00–12:00" (or "One-off events" / "Due dates") */
  when: string;
  count: number;
  next?: string;
  isDeadline?: boolean;
};

export class FeedError extends Error {}

// ---------- fetching (with protections, since the URL comes from a user) ----------

function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new FeedError("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FeedError("Use an https:// or webcal:// link.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host) ||
    host === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host);
  if (privateHost) throw new FeedError("That address isn't reachable from the internet.");
  return url;
}

export async function fetchFeed(rawUrl: string): Promise<string> {
  let url = assertPublicUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "QuestLog calendar sync" },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      throw new FeedError("Couldn't reach that calendar. Check the link and try again.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new FeedError(`The calendar server answered ${res.status}. Is the link still valid?`);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new FeedError("That calendar is too large to import.");
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new FeedError("That calendar is too large to import.");
    if (!text.includes("BEGIN:VCALENDAR")) throw new FeedError("That link isn't a calendar feed (.ics).");
    return text;
  }
  throw new FeedError("Too many redirects.");
}

// ---------- parsing ----------

const text = (v: ParameterValue | undefined) =>
  (typeof v === "string" ? v : typeof v === "object" && v && "val" in v ? String(v.val) : "").trim();

function localParts(date: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { weekday: parts.weekday as string, time: `${parts.hour}:${parts.minute}` };
}

/** "Graphics Lecture (Week 3)" -> "Graphics Lecture": the name shown for a whole series. */
function displayTitle(title: string) {
  return title.replace(/\s*[([]?\b(week|wk)\s*\d+\b[)\]]?/gi, "").replace(/\s+/g, " ").trim() || title;
}

/** "COMP30026 Lecture (Week 3)" and "... (Week 4)" belong to the same series. */
function seriesTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/\b(week|wk|w)\s*\d+\b/g, "")
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, "")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDeadlineEvent(title: string, start: Date, end: Date, allDay: boolean) {
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (allDay) return true;
  if (minutes <= 0) return true;
  return minutes <= 15 && /\b(due|deadline|submission|submit)\b/i.test(title);
}

/** All events from now-ish up to ~4 months ahead, with repeating ones expanded. */
export function parseFeed(ics: string, tz: string) {
  const data = ical.sync.parseICS(ics);
  const from = new Date(Date.now() - DAY);
  const to = new Date(Date.now() + 120 * DAY);
  const events: FeedEvent[] = [];

  for (const [key, component] of Object.entries(data)) {
    if (key === "vcalendar" || !component || (component as VEvent).type !== "VEVENT") continue;
    const ev = component as VEvent;
    if ((ev as { status?: string }).status === "CANCELLED") continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(ev, { from, to });
    } catch {
      continue;
    }
    for (const inst of instances) {
      const title = text(inst.summary) || "Untitled event";
      const start = new Date(inst.start);
      const end = inst.end ? new Date(inst.end) : new Date(start);
      if (end < from || start > to) continue;
      const allDay = inst.isFullDay;
      const isDeadline = isDeadlineEvent(title, start, end, allDay);
      const { weekday, time } = localParts(start, tz);
      const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
      events.push({
        uid: inst.isRecurring ? `${ev.uid}|${start.toISOString()}` : ev.uid,
        seriesKey: isDeadline ? DEADLINES_KEY : `${seriesTitle(title)}|${weekday}|${time}|${minutes}`,
        title,
        location: text(inst.event.location as ParameterValue | undefined) || undefined,
        start,
        end,
        allDay,
        isDeadline,
      });
    }
  }

  // A "series" that happens only once is a one-off event.
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.seriesKey, (counts.get(e.seriesKey) ?? 0) + 1);
  for (const e of events) {
    if (!e.isDeadline && counts.get(e.seriesKey) === 1) e.seriesKey = ONEOFFS_KEY;
  }

  const name = text((data.vcalendar as { "WR-CALNAME"?: ParameterValue } | undefined)?.["WR-CALNAME"]);
  return { name: name || undefined, events: events.sort((a, b) => a.start.getTime() - b.start.getTime()) };
}

/** Groups events into the choices shown to the user. */
export function summariseSeries(events: FeedEvent[], tz: string): SeriesSummary[] {
  const groups = new Map<string, FeedEvent[]>();
  for (const e of events) groups.set(e.seriesKey, [...(groups.get(e.seriesKey) ?? []), e]);
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);

  const out: SeriesSummary[] = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const upcoming = list.find((e) => e.start.getTime() > Date.now()) ?? first;
    if (key === ONEOFFS_KEY) {
      out.push({ key, title: "One-off events", when: `${list.length} single events`, count: list.length, next: fmtDate(upcoming.start) });
    } else if (key === DEADLINES_KEY) {
      out.push({ key, title: "Due dates and all-day events", when: `${list.length} dates`, count: list.length, next: fmtDate(upcoming.start), isDeadline: true });
    } else {
      const s = localParts(first.start, tz);
      const e = localParts(first.end, tz);
      out.push({ key, title: displayTitle(first.title), when: `${s.weekday} ${s.time}–${e.time}`, count: list.length, next: fmtDate(upcoming.start) });
    }
  }
  const order = (s: SeriesSummary) => (s.key === DEADLINES_KEY ? 2 : s.key === ONEOFFS_KEY ? 1 : 0);
  return out.sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
}
