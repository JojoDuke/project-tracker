'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project, TimeBlock } from '@/lib/types';
import {
  DAY_END,
  DAY_START,
  HOUR_H,
  SLOT_H,
  SLOT_MIN,
  addDays,
  dayStartOf,
  durationLabel,
  fmtHour,
  sameDay,
  yToTimes
} from '@/lib/time';

interface Props {
  weekStart: Date;
  projects: Project[];
  blocks: TimeBlock[];
  activeProjectId: string | null;
  onCreateBlock: (start: Date, end: Date) => Promise<void> | void;
  onOpenBlock: (b: TimeBlock) => void;
  onDeleteBlock: (id: string) => Promise<void> | void;
}

interface DragState {
  dayIndex: number;
  originY: number;
  currentY: number;
  ghostStart: Date;
  ghostEnd: Date;
}

export default function WeekGrid({
  weekStart,
  projects,
  blocks,
  activeProjectId,
  onCreateBlock,
  onOpenBlock,
  onDeleteBlock
}: Props) {
  const totalHours = DAY_END - DAY_START;
  const colHeight = totalHours * HOUR_H;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const colRefs = useRef<Array<HTMLDivElement | null>>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Auto-scroll to show today when it's in the current week
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const todayIndex = Array.from({ length: 7 }).findIndex((_, i) =>
      sameDay(addDays(weekStart, i), new Date())
    );
    if (todayIndex < 0) return;
    const col = colRefs.current[todayIndex];
    if (!col) return;
    const scrollTarget = col.offsetLeft - grid.clientWidth / 2 + col.offsetWidth / 2;
    grid.scrollLeft = Math.max(0, scrollTarget);
  }, [weekStart]);

  useEffect(() => {
    if (!drag) return;

    const handleMove = (clientY: number) => {
      const d = dragRef.current;
      if (!d) return;
      const col = colRefs.current[d.dayIndex];
      if (!col) return;
      const rect = col.getBoundingClientRect();
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const day = addDays(weekStart, d.dayIndex);
      const { start, end } = yToTimes(day, d.originY, y);
      setDrag({ ...d, currentY: y, ghostStart: start, ghostEnd: end });
    };

    const handleUp = async (clientY: number) => {
      const d = dragRef.current;
      if (!d) return;
      const col = colRefs.current[d.dayIndex];
      setDrag(null);
      if (!col) return;
      const rect = col.getBoundingClientRect();
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const day = addDays(weekStart, d.dayIndex);
      const { start, end } = yToTimes(day, d.originY, y);
      if (end.getTime() - start.getTime() < 60000 * SLOT_MIN) return;
      await onCreateBlock(start, end);
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const onMouseUp = (e: MouseEvent) => handleUp(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientY);
    };
    const onTouchEnd = (e: TouchEvent) => handleUp(e.changedTouches[0].clientY);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [drag, weekStart, onCreateBlock]);

  const today = new Date();
  void nowTick;

  return (
    <div id="grid" ref={gridRef}>
      <div className="grid-inner" style={{ gridTemplateRows: `auto ${colHeight}px` }}>
        <div className="grid-corner" />
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDays(weekStart, i);
          const isToday = sameDay(d, today);
          return (
            <div
              key={i}
              className={'grid-header' + (isToday ? ' today' : '')}
            >
              <div className="dow">
                {d.toLocaleDateString(undefined, { weekday: 'short' })}
              </div>
              <div className="dom">{d.getDate()}</div>
            </div>
          );
        })}

        <div style={{ position: 'relative', gridColumn: '1', gridRow: '2' }}>
          {Array.from({ length: totalHours }).map((_, i) => (
            <div key={i} className="hour-label">
              {fmtHour(DAY_START + i)}
            </div>
          ))}
        </div>

        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDays(weekStart, i);
          const isToday = sameDay(d, today);
          const dayStart = new Date(d);
          dayStart.setHours(DAY_START, 0, 0, 0);
          const dayEnd = new Date(d);
          dayEnd.setHours(DAY_END, 0, 0, 0);
          const dayBlocks = blocks.filter((b) => {
            const bs = new Date(b.start);
            const be = new Date(b.end);
            return be > dayStart && bs < dayEnd;
          });

          let nowLineY: number | null = null;
          if (isToday) {
            const minsSince = (today.getHours() - DAY_START) * 60 + today.getMinutes();
            const y = (minsSince / 60) * HOUR_H;
            if (y >= 0 && y <= colHeight) nowLineY = y;
          }

          const ghost = drag && drag.dayIndex === i ? drag : null;

          return (
            <div
              key={i}
              ref={(el) => {
                colRefs.current[i] = el;
              }}
              className={'day-col' + (isToday ? ' today' : '')}
              style={{
                height: colHeight + 'px',
                gridColumn: String(i + 2),
                gridRow: '2'
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                if (!activeProjectId) {
                  alert('Select or create a project first');
                  return;
                }
                const target = e.target as HTMLElement;
                if (target.closest('.block')) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const day = addDays(weekStart, i);
                const { start, end } = yToTimes(day, y, y);
                setDrag({ dayIndex: i, originY: y, currentY: y, ghostStart: start, ghostEnd: end });
                e.preventDefault();
              }}
              onTouchStart={(e) => {
                if (!activeProjectId) return;
                const target = e.target as HTMLElement;
                if (target.closest('.block')) return;
                const touch = e.touches[0];
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = touch.clientY - rect.top;
                const day = addDays(weekStart, i);
                const { start, end } = yToTimes(day, y, y);
                setDrag({ dayIndex: i, originY: y, currentY: y, ghostStart: start, ghostEnd: end });
                e.preventDefault();
              }}
            >
              {nowLineY !== null && <div className="now-line" style={{ top: nowLineY + 'px' }} />}

              {dayBlocks.map((b) => {
                const project = projects.find((p) => p.id === b.projectId);
                if (!project) return null;
                const bs = new Date(b.start);
                const be = new Date(b.end);
                const top = Math.max(0, ((bs.getTime() - dayStart.getTime()) / 3600000) * HOUR_H);
                const bottom = Math.min(colHeight, ((be.getTime() - dayStart.getTime()) / 3600000) * HOUR_H);
                const dur = durationLabel(be.getTime() - bs.getTime());
                return (
                  <div
                    key={b.id}
                    className="block"
                    style={{
                      top: top + 'px',
                      height: Math.max(SLOT_H - 2, bottom - top) + 'px',
                      background: project.color
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBlock(b);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      className="block-delete"
                      title="Delete block"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await onDeleteBlock(b.id);
                      }}
                    >
                      ×
                    </button>
                    <div className="b-title">
                      {project.name} · {dur}
                    </div>
                    {b.note && <div className="b-note">{b.note}</div>}
                  </div>
                );
              })}

              {ghost && (() => {
                const day = addDays(weekStart, i);
                const ds = dayStartOf(day);
                const startY = ((ghost.ghostStart.getTime() - ds.getTime()) / 3600000) * HOUR_H;
                const endY = ((ghost.ghostEnd.getTime() - ds.getTime()) / 3600000) * HOUR_H;
                const proj = projects.find((p) => p.id === activeProjectId);
                const dur = durationLabel(ghost.ghostEnd.getTime() - ghost.ghostStart.getTime());
                return (
                  <div
                    className="block ghost"
                    style={{
                      top: startY + 'px',
                      height: Math.max(SLOT_H, endY - startY) + 'px',
                      background: proj?.color || '#666'
                    }}
                  >
                    <div className="b-title">New · {dur}</div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
