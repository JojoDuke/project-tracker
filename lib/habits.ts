import type { HabitMark, TimeBlock } from './types';
import {
  addDays,
  localDateKey,
  monthStartOf,
  parseLocalDateKey,
  sameMonth,
  startOfLocalDay,
  weekStartOf
} from './time';

export const HABIT_DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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

export interface HabitGrid {
  weeks: Date[][];
  month: Date;
  today: Date;
}

export function buildHabitMonthGrid(month: Date, today = new Date()): HabitGrid {
  const todayStart = startOfLocalDay(today);
  const first = monthStartOf(month);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const start = weekStartOf(first);
  const end = weekStartOf(last);

  const weeks: Date[][] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
  }

  return { weeks, month: first, today: todayStart };
}

export function isInHabitMonth(day: Date, month: Date): boolean {
  return sameMonth(day, month);
}
