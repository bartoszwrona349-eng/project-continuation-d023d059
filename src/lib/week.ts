import { addDays, format, parseISO, startOfWeek } from "date-fns";

export const HOUR_START = 8;
export const HOUR_END = 22; // exclusive end of last slot

export function weekStartOf(d: Date) {
  return startOfWeek(d, { weekStartsOn: 1 });
}
export function parseWeek(week?: string) {
  return weekStartOf(week ? parseISO(week) : new Date());
}
export function weekKey(d: Date) {
  return format(weekStartOf(d), "yyyy-MM-dd");
}
export function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function slotStart(day: Date, hour: number) {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

/** Parses "startISO_endISO,startISO_endISO" into valid, sorted ranges (one request, many days). */
export function parseSlots(raw: string) {
  return raw
    .split(",")
    .map((p) => p.split("_"))
    .map(([a, b]) => ({ start: new Date(a ?? ""), end: new Date(b ?? "") }))
    .filter((x) => !isNaN(x.start.getTime()) && !isNaN(x.end.getTime()) && x.end > x.start)
    .sort((x, y) => x.start.getTime() - y.start.getTime());
}
