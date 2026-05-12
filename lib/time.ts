export const SLOT_MIN = 15;
export const DAY_START = 6;
export const DAY_END = 24;
export const HOUR_H = 48;
export const SLOT_H = HOUR_H / (60 / SLOT_MIN);

export function weekStartOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtHour(h: number): string {
  const ap = h >= 12 ? 'p' : 'a';
  const hh = ((h + 11) % 12) + 1;
  return hh + ap;
}

export function toLocalISO(d: Date): string {
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 16);
}

export function parseLocalISO(s: string): Date {
  return new Date(s);
}

export function snap(date: Date): Date {
  const d = new Date(date);
  const min = d.getMinutes();
  d.setMinutes(Math.round(min / SLOT_MIN) * SLOT_MIN, 0, 0);
  return d;
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.floor(hr / 24);
  if (d < 7) return d + 'd ago';
  const w = Math.floor(d / 7);
  return w + 'w ago';
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function dayStartOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(DAY_START, 0, 0, 0);
  return x;
}

export function yToTimes(day: Date, y1: number, y2: number): { start: Date; end: Date } {
  const ys = Math.min(y1, y2);
  const ye = Math.max(y1, y2);
  const startMin = Math.round((ys / HOUR_H) * 60 / SLOT_MIN) * SLOT_MIN;
  const endMin = Math.round((ye / HOUR_H) * 60 / SLOT_MIN) * SLOT_MIN;
  const start = dayStartOf(day);
  start.setMinutes(start.getMinutes() + startMin);
  const end = dayStartOf(day);
  end.setMinutes(end.getMinutes() + Math.max(endMin, startMin + SLOT_MIN));
  return { start, end };
}

export function durationLabel(ms: number): string {
  const mins = Math.round(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ' ' + (mins % 60) + 'm' : ''}` : `${mins}m`;
}

export function pickColor(i: number): string {
  const palette = ['#6aa9ff', '#ff8a5b', '#7ed957', '#c084fc', '#f5c542', '#ff6b9d', '#4ecdc4', '#ffa07a'];
  return palette[i % palette.length];
}
