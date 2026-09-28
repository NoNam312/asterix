// Small date helpers (all in the user's local timezone). Weeks start on Monday.

export const MINUTE = 60_000;

export function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMinutes(d: Date, n: number) {
  return new Date(d.getTime() + n * MINUTE);
}

export function startOfWeek(d: Date) {
  const r = startOfDay(d);
  return addDays(r, -((r.getDay() + 6) % 7));
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function minutesIntoDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-09-28" — for <input type="date"> */
export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "14:30" — for <input type="time"> */
export function toTimeInput(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputs(date: string, time: string) {
  return new Date(`${date}T${time}`);
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
