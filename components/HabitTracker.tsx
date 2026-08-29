'use client';

import { useMemo, useState } from 'react';
import type { HabitMark, Project, TimeBlock } from '@/lib/types';
import {
  HABIT_DOW_LABELS,
  activeHabitDays,
  buildHabitMonthGrid,
  computeHabitStats,
  isInHabitMonth,
  markForDay,
  markedDays,
  workedDaysFromBlocks
} from '@/lib/habits';
import { contrastColor, fmtMonth, localDateKey, sameDay, startOfLocalDay } from '@/lib/time';

interface Props {
  project: Project | null;
  blocks: TimeBlock[];
  habitMarks: HabitMark[];
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
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
  month,
  onPrevMonth,
  onNextMonth,
  onToggleDay,
  onGoalChange
}: Props) {
  const [goalDraft, setGoalDraft] = useState<string | null>(null);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = localDateKey(today);
  const grid = useMemo(() => buildHabitMonthGrid(month, today), [month, today]);

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
        </div>
        <p className="habit-lede">
          Days you logged time light up automatically. Click any past day to check in without a time
          block — useful for streaks like 100 days of posting.
        </p>
      </header>

      <div className="habit-toolbar">
        <div className="habit-board">
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
        <div className="habit-month-nav">
          <button type="button" onClick={onPrevMonth} title="Previous month ([)" aria-label="Previous month">
            ‹
          </button>
          <h3>{fmtMonth(grid.month)}</h3>
          <button type="button" onClick={onNextMonth} title="Next month (])" aria-label="Next month">
            ›
          </button>
        </div>
        <div className="habit-graph" style={{ '--habit-weeks': String(grid.weeks.length) } as React.CSSProperties}>
          <div className="habit-weeks">
            {grid.weeks.map((week) => (
              <div key={localDateKey(week[0])} className="habit-week">
                {week.map((day) => {
                  const key = localDateKey(day);
                  const inMonth = isInHabitMonth(day, grid.month);
                  const isFuture = day > today;
                  const isToday = sameDay(day, today);
                  const isActive = inMonth && active.has(key);
                  const fromWork = worked.has(key);
                  const fromMark = marked.has(key);
                  const canToggle = inMonth && !isFuture && !(fromWork && !fromMark);
                  const title = !inMonth
                    ? `${fmtLong(day)} · ${day < grid.month ? 'previous' : 'next'} month`
                    : isFuture
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
                        isFuture ? 'future' : '',
                        inMonth ? '' : 'outside'
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
      </div>
    </div>
  );
}
