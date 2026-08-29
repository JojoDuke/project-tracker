import type { HabitMark, TimeBlock } from './types';
import { addDays, localDateKey, parseLocalDateKey, startOfLocalDay, weekStartOf } from './time';

export const HABIT_RANGES = [
  { id: '3m', label: '3 months', months: 3 },
  { id: '6m', label: '6 months', months: 6 },
  { id: '1y', label: '1 year', months: 12 }
] as const;

export type HabitRangeId = (typeof HABIT_RANGES)[number]['id'];

export const HABIT_DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function isHabitRangeId(v: unknown): v is HabitRangeId {
  return HABIT_RANGES.some((r) => r.id === v);
}

export function rangeMonths(id: HabitRangeId): number {
  return HABIT_RANGES.find((r) => r.id === id)?.months ?? 3;
}

export function rangeTitle(id: HabitRangeId): string {
  if (id === '6m') return 'Last 6 Months';
  if (id === '1y') return 'Last Year';
  return 'Last 3 Months';
}

/** Every local calendar day a block touches for a project. */
export function workedDaysFromBlocks(blocks: TimeBlock[], projectId: string): Set<string> {
  const days = new Set<string>();
  for (const b of blocks) {
    if (b.projectId !== projectId) continue;
    const start = startOfLocalDay(new Date(b.start));
    const end = startOfLocalDay(new Date(b.end));
    // A block ending exactly at midnight belongs to the previous day.
    const last =
      new Date(b.end).getTime() === end.getTime() ? addDays(end, -1) : end;
    for (let d = start; d <= last; d = addDays(d, 1)) {
      days.add(localDateKey(d));
    }
  }
  return days;
}

export function markedDays(marks: HabitMark[], projectId: string): Set<string> {
  const days = new Set<string>();
  for (const m of marks) {
    if (m.projectId === projectId) days.add(m.day);
  }
  return days;
}

export function activeHabitDays(
  blocks: TimeBlock[],
  marks: HabitMark[],
  projectId: string
): Set<string> {
  const days = workedDaysFromBlocks(blocks, projectId);
  for (const d of markedDays(marks, projectId)) days.add(d);
  return days;
}

export function markForDay(
  marks: HabitMark[],
  projectId: string,
  day: string
): HabitMark | undefined {
  return marks.find((m) => m.projectId === projectId && m.day === day);
}

export interface HabitStats {
  current: number;
  longest: number;
  total: number;
}

export function computeHabitStats(activeDays: Set<string>, today = new Date()): HabitStats {
  const keys = [...activeDays].sort();
  const total = keys.length;
  if (total === 0) return { current: 0, longest: 0, total: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = parseLocalDateKey(keys[i - 1]);
    const cur = parseLocalDateKey(keys[i]);
    if (localDateKey(addDays(prev, 1)) === localDateKey(cur)) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  const todayKey = localDateKey(startOfLocalDay(today));
  const yesterdayKey = localDateKey(addDays(startOfLocalDay(today), -1));
  let cursor: string | null = null;
  if (activeDays.has(todayKey)) cursor = todayKey;
  else if (activeDays.has(yesterdayKey)) cursor = yesterdayKey;

  let current = 0;
  while (cursor && activeDays.has(cursor)) {
    current += 1;
    cursor = localDateKey(addDays(parseLocalDateKey(cursor), -1));
  }

  return { current, longest, total };
}

export interface HabitMonthLabel {
  key: string;
  label: string;
  weekIndex: number;
  span: number;
}

export interface HabitGrid {
  weeks: Date[][];
  months: HabitMonthLabel[];
  today: Date;
}

export function buildHabitGrid(monthsBack: number, today = new Date()): HabitGrid {
  const todayStart = startOfLocalDay(today);
  const rangeStart = new Date(todayStart);
  rangeStart.setMonth(rangeStart.getMonth() - monthsBack);
  const start = weekStartOf(rangeStart);
  const end = weekStartOf(todayStart);

  const weeks: Date[][] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
  }

  const months: HabitMonthLabel[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const month = weeks[i][0].getMonth();
    const year = weeks[i][0].getFullYear();
    const last = months[months.length - 1];
    if (last && last.key === `${year}-${month}`) {
      last.span += 1;
    } else {
      months.push({
        key: `${year}-${month}`,
        label: weeks[i][0].toLocaleDateString(undefined, { month: 'short' }),
        weekIndex: i,
        span: 1
      });
    }
  }

  return { weeks, months, today: todayStart };
}
