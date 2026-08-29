'use client';

import { useMemo, useState } from 'react';
import type { HabitMark, Project, TimeBlock } from '@/lib/types';
import {
  HABIT_DOW_LABELS,
  HABIT_RANGES,
  type HabitRangeId,
  activeHabitDays,
  buildHabitGrid,
  computeHabitStats,
  markForDay,
  markedDays,
  rangeMonths,
  rangeTitle,
  workedDaysFromBlocks
} from '@/lib/habits';
import { contrastColor, localDateKey, sameDay, startOfLocalDay } from '@/lib/time';

interface Props {
  project: Project | null;
  blocks: TimeBlock[];
  habitMarks: HabitMark[];
  range: HabitRangeId;
  onRangeChange: (range: HabitRangeId) => void;
  onToggleDay: (day: string) => void;
  onGoalChange: (goal: number | null) => void;
}

function fmtLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function HabitTracker({
  project,
  blocks,
  habitMarks,
  range,
  onRangeChange,
  onToggleDay,
  onGoalChange
}: Props) {
  const [goalDraft, setGoalDraft] = useState<string | null>(null);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = localDateKey(today);
  const monthsBack = rangeMonths(range);
  const grid = useMemo(() => buildHabitGrid(monthsBack, today), [monthsBack, today]);

  const worked = useMemo(
    () => (project ? workedDaysFromBlocks(blocks, project.id) : new Set<string>()),
    [blocks, project]
  );
  const marked = useMemo(
    () => (project ? markedDays(habitMarks, project.id) : new Set<string>()),
    [habitMarks, project]
  );
  const active = useMemo(
    () => (project ? activeHabitDays(blocks, habitMarks, project.id) : new Set<string>()),
    [blocks, habitMarks, project]
  );
  const stats = useMemo(() => computeHabitStats(active, today), [active, today]);

  const goal = project?.habitGoal ?? null;
  const goalValue = goalDraft ?? (goal != null ? String(goal) : '');
  const progress = goal && goal > 0 ? Math.min(100, Math.round((stats.total / goal) * 100)) : null;

  if (!project) {
    return (
      <div className="habit-view">
        <div className="habit-empty">
          <h2>No project selected</h2>
          <p>Pick a project to track days you showed up — like 100 days of posting.</p>
        </div>
      </div>
    );
  }

  const todayActive = active.has(todayKey);
  const todayMarked = !!markForDay(habitMarks, project.id, todayKey);
  const todayFromWork = worked.has(todayKey);

  return (
    <div className="habit-view">
      <header className="habit-head">
        <div className="habit-title-row">
          <h2>
            <span className="swatch" style={{ background: project.color }} />
            {project.name}
          </h2>
          <div className="habit-range" role="radiogroup" aria-label="Date range">
            {HABIT_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={range === r.id ? 'active' : ''}
                onClick={() => onRangeChange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <p className="habit-lede">
          Days you logged time light up automatically. Click any past day to check in without a time
          block — useful for streaks like 100 days of posting.
        </p>
      </header>

      <section className="habit-stats" aria-label="Habit stats">
        <div className="habit-stat">
          <span className="habit-stat-value">{stats.current}</span>
          <span className="habit-stat-label">Current streak</span>
        </div>
        <div className="habit-stat">
          <span className="habit-stat-value">{stats.longest}</span>
          <span className="habit-stat-label">Longest streak</span>
        </div>
        <div className="habit-stat">
          <span className="habit-stat-value">{stats.total}</span>
          <span className="habit-stat-label">{goal ? `of ${goal} days` : 'Days shown up'}</span>
        </div>
        <div className="habit-stat habit-goal-stat">
          <label>
            Goal
            <input
              type="number"
              min={1}
              max={10000}
              placeholder="100"
              value={goalValue}
              onChange={(e) => setGoalDraft(e.target.value)}
              onBlur={() => {
                const next = goalDraft === null ? goalValue : goalDraft;
                const n = next.trim() === '' ? null : Number(next);
                setGoalDraft(null);
                onGoalChange(Number.isFinite(n as number) ? (n as number) : null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
        </div>
        <button
          type="button"
          className={`habit-today-btn ${todayActive ? 'done' : 'primary'}`}
          onClick={() => onToggleDay(todayKey)}
          disabled={todayFromWork && !todayMarked}
          title={
            todayFromWork && !todayMarked
              ? 'Today already counts from logged time'
              : todayMarked
                ? 'Clear today’s check-in'
                : 'Mark today'
          }
        >
          {todayActive ? 'Today counted' : 'Mark today'}
        </button>
      </section>

      {goal && (
        <div className="habit-progress" aria-label={`${progress}% of goal`}>
          <div className="habit-progress-bar">
            <span style={{ width: `${progress ?? 0}%`, background: project.color }} />
          </div>
          <span className="habit-progress-label">
            {stats.total} / {goal}
            {stats.total >= goal ? ' — goal hit' : ''}
          </span>
        </div>
      )}

      <section className="habit-card">
        <h3>{rangeTitle(range)}</h3>
        <div className="habit-graph" style={{ '--habit-weeks': String(grid.weeks.length) } as React.CSSProperties}>
          <div className="habit-months">
            {grid.months.map((m) => (
              <span
                key={m.key}
                className="habit-month"
                style={{ gridColumn: `${m.weekIndex + 1} / span ${m.span}` }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="habit-weeks">
            {grid.weeks.map((week) => (
              <div key={localDateKey(week[0])} className="habit-week">
                {week.map((day) => {
                  const key = localDateKey(day);
                  const isFuture = day > today;
                  const isToday = sameDay(day, today);
                  const isActive = active.has(key);
                  const fromWork = worked.has(key);
                  const fromMark = marked.has(key);
                  const canToggle = !isFuture && !(fromWork && !fromMark);
                  const title = isFuture
                    ? fmtLong(day)
                    : `${fmtLong(day)}${fromWork ? ' · logged time' : ''}${fromMark ? ' · checked in' : ''}${!isActive ? ' · click to check in' : fromWork && !fromMark ? ' · from time logged' : ' · click to clear'}`;

                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        'habit-cell',
                        isActive ? 'active' : '',
                        isToday ? 'today' : '',
                        isFuture ? 'future' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={
                        isActive
                          ? {
                              background: project.color,
                              color: contrastColor(project.color)
                            }
                          : undefined
                      }
                      disabled={!canToggle}
                      title={title}
                      aria-label={title}
                      aria-pressed={isActive}
                      onClick={() => {
                        if (canToggle) onToggleDay(key);
                      }}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <ol className="habit-dows">
            {HABIT_DOW_LABELS.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
