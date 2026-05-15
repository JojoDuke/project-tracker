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
  contrastColor,
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
  onMoveBlock: (id: string, start: string, end: string) => Promise<void> | void;
}

// ── Drag state ────────────────────────────────────────────────────────────────

type CreateDrag = {
  kind: 'create';
  dayIndex: number;
  originY: number;
  currentY: number;
  ghostStart: Date;
  ghostEnd: Date;
};

type MoveDrag = {
  kind: 'move';
  block: TimeBlock;
  /** preserved throughout the move */
  duration: number;
  /** y offset inside the block where the user grabbed it */
  clickOffsetY: number;
  /** for move-vs-click threshold */
  originClientX: number;
  originClientY: number;
  /** current target day column */
  dayIndex: number;
  ghostStart: Date;
  ghostEnd: Date;
  hasMoved: boolean;
};

type DragState = CreateDrag | MoveDrag;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDayIndexAtX(
  colRefs: React.MutableRefObject<Array<HTMLDivElement | null>>,
  clientX: number
): number {
  for (let i = 0; i < 7; i++) {
    const col = colRefs.current[i];
    if (!col) continue;
    const rect = col.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) return i;
  }
  return -1;
}

function computeMovedTimes(
  colRefs: React.MutableRefObject<Array<HTMLDivElement | null>>,
  weekStart: Date,
  dayIndex: number,
  clientY: number,
  clickOffsetY: number,
  duration: number
): { start: Date; end: Date } {
  const col = colRefs.current[dayIndex];
  if (!col) return { start: new Date(), end: new Date() };
  const rect = col.getBoundingClientRect();
  const yRaw = clientY - rect.top - clickOffsetY;
  const maxY = rect.height - (duration / 3600000) * HOUR_H;
  const y = Math.max(0, Math.min(maxY > 0 ? maxY : 0, yRaw));
  const day = addDays(weekStart, dayIndex);
  const dayBase = new Date(day);
  dayBase.setHours(DAY_START, 0, 0, 0);
  const startMin = Math.round((y / HOUR_H) * 60 / SLOT_MIN) * SLOT_MIN;
  const start = new Date(dayBase.getTime());
  start.setMinutes(start.getMinutes() + startMin);
  const end = new Date(start.getTime() + duration);
  return { start, end };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeekGrid({
  weekStart,
  projects,
  blocks,
  activeProjectId,
  onCreateBlock,
  onOpenBlock,
  onDeleteBlock,
  onMoveBlock,
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

  // Global pointer tracking for both create and move drags
  useEffect(() => {
    if (!drag) return;

    const handleMove = (clientX: number, clientY: number) => {
      const d = dragRef.current;
      if (!d) return;

      if (d.kind === 'create') {
        const col = colRefs.current[d.dayIndex];
        if (!col) return;
        const rect = col.getBoundingClientRect();
        const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
        const day = addDays(weekStart, d.dayIndex);
        const { start, end } = yToTimes(day, d.originY, y);
        setDrag({ ...d, currentY: y, ghostStart: start, ghostEnd: end });
      } else {
        const distX = Math.abs(clientX - d.originClientX);
        const distY = Math.abs(clientY - d.originClientY);
        const hasMoved = d.hasMoved || distX > 4 || distY > 4;
        const targetDay = getDayIndexAtX(colRefs, clientX);
        const dayIndex = targetDay >= 0 ? targetDay : d.dayIndex;
        const { start, end } = computeMovedTimes(
          colRefs, weekStart, dayIndex, clientY, d.clickOffsetY, d.duration
        );
        setDrag({ ...d, dayIndex, ghostStart: start, ghostEnd: end, hasMoved });
      }
    };

    const handleUp = async (clientX: number, clientY: number) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);

      if (d.kind === 'create') {
        const col = colRefs.current[d.dayIndex];
        if (!col) return;
        const rect = col.getBoundingClientRect();
        const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
        const day = addDays(weekStart, d.dayIndex);
        const { start, end } = yToTimes(day, d.originY, y);
        if (end.getTime() - start.getTime() < 60000 * SLOT_MIN) return;
        await onCreateBlock(start, end);
      } else {
        if (!d.hasMoved) {
          // mousedown called preventDefault, so no click event fires — handle it here
          onOpenBlock(d.block);
          return;
        }
        const targetDay = getDayIndexAtX(colRefs, clientX);
        const dayIndex = targetDay >= 0 ? targetDay : d.dayIndex;
        const { start, end } = computeMovedTimes(
          colRefs, weekStart, dayIndex, clientY, d.clickOffsetY, d.duration
        );
        await onMoveBlock(d.block.id, start.toISOString(), end.toISOString());
      }
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp   = (e: MouseEvent) => handleUp(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = (e: TouchEvent) =>
      handleUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend',  onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend',  onTouchEnd);
    };
  }, [drag, weekStart, onCreateBlock, onMoveBlock]);

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
            <div key={i} className={'grid-header' + (isToday ? ' today' : '')}>
              <div className="dow">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div className="dom">{d.getDate()}</div>
            </div>
          );
        })}

        <div style={{ position: 'relative', gridColumn: '1', gridRow: '2' }}>
          {Array.from({ length: totalHours }).map((_, i) => (
            <div key={i} className="hour-label">{fmtHour(DAY_START + i)}</div>
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

          const createGhost = drag?.kind === 'create' && drag.dayIndex === i ? drag : null;
          const moveGhost   = drag?.kind === 'move'   && drag.dayIndex === i && drag.hasMoved ? drag : null;

          return (
            <div
              key={i}
              ref={(el) => { colRefs.current[i] = el; }}
              className={'day-col' + (isToday ? ' today' : '')}
              style={{ height: colHeight + 'px', gridColumn: String(i + 2), gridRow: '2' }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                if (!activeProjectId) { alert('Select or create a project first'); return; }
                const target = e.target as HTMLElement;
                if (target.closest('.block')) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const day = addDays(weekStart, i);
                const { start, end } = yToTimes(day, y, y);
                setDrag({ kind: 'create', dayIndex: i, originY: y, currentY: y, ghostStart: start, ghostEnd: end });
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
                setDrag({ kind: 'create', dayIndex: i, originY: y, currentY: y, ghostStart: start, ghostEnd: end });
                e.preventDefault();
              }}
            >
              {nowLineY !== null && <div className="now-line" style={{ top: nowLineY + 'px' }} />}

              {dayBlocks.map((b) => {
                const project = projects.find((p) => p.id === b.projectId);
                if (!project) return null;
                const bs = new Date(b.start);
                const be = new Date(b.end);
                const top    = Math.max(0, ((bs.getTime() - dayStart.getTime()) / 3600000) * HOUR_H);
                const bottom = Math.min(colHeight, ((be.getTime() - dayStart.getTime()) / 3600000) * HOUR_H);
                const dur = durationLabel(be.getTime() - bs.getTime());
                const textColor = contrastColor(project.color);
                const isBeingMoved = drag?.kind === 'move' && drag.block.id === b.id;

                return (
                  <div
                    key={b.id}
                    className={'block' + (isBeingMoved ? ' block-moving' : '')}
                    style={{
                      top: top + 'px',
                      height: Math.max(SLOT_H - 2, bottom - top) + 'px',
                      background: project.color,
                      color: textColor,
                    }}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      setDrag({
                        kind: 'move',
                        block: b,
                        duration: be.getTime() - bs.getTime(),
                        clickOffsetY: e.clientY - rect.top,
                        originClientX: e.clientX,
                        originClientY: e.clientY,
                        dayIndex: i,
                        ghostStart: bs,
                        ghostEnd: be,
                        hasMoved: false,
                      });
                      e.preventDefault();
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const touch = e.touches[0];
                      setDrag({
                        kind: 'move',
                        block: b,
                        duration: be.getTime() - bs.getTime(),
                        clickOffsetY: touch.clientY - rect.top,
                        originClientX: touch.clientX,
                        originClientY: touch.clientY,
                        dayIndex: i,
                        ghostStart: bs,
                        ghostEnd: be,
                        hasMoved: false,
                      });
                    }}
                  >
                    <button
                      className="block-delete"
                      title="Delete block"
                      style={{
                        background: textColor === '#1a1a1a' ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.40)',
                        color:      textColor === '#1a1a1a' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.95)',
                      }}
                      onClick={async (e) => {
                        e.stopPropagation();
                        await onDeleteBlock(b.id);
                      }}
                    >
                      ×
                    </button>
                    <div className="b-title">{project.name} · {dur}</div>
                    {b.note && <div className="b-note">{b.note}</div>}
                  </div>
                );
              })}

              {/* Ghost for create-drag */}
              {createGhost && (() => {
                const ds  = dayStartOf(addDays(weekStart, i));
                const startY = ((createGhost.ghostStart.getTime() - ds.getTime()) / 3600000) * HOUR_H;
                const endY   = ((createGhost.ghostEnd.getTime()   - ds.getTime()) / 3600000) * HOUR_H;
                const proj = projects.find((p) => p.id === activeProjectId);
                const dur  = durationLabel(createGhost.ghostEnd.getTime() - createGhost.ghostStart.getTime());
                return (
                  <div
                    className="block ghost"
                    style={{
                      top: startY + 'px',
                      height: Math.max(SLOT_H, endY - startY) + 'px',
                      background: proj?.color || '#666',
                    }}
                  >
                    <div className="b-title">New · {dur}</div>
                  </div>
                );
              })()}

              {/* Ghost for move-drag */}
              {moveGhost && (() => {
                const ds  = dayStartOf(addDays(weekStart, i));
                const startY = ((moveGhost.ghostStart.getTime() - ds.getTime()) / 3600000) * HOUR_H;
                const endY   = ((moveGhost.ghostEnd.getTime()   - ds.getTime()) / 3600000) * HOUR_H;
                const proj = projects.find((p) => p.id === moveGhost.block.projectId);
                const dur  = durationLabel(moveGhost.ghostEnd.getTime() - moveGhost.ghostStart.getTime());
                const tc   = proj ? contrastColor(proj.color) : '#fff';
                return (
                  <div
                    className="block ghost move-ghost"
                    style={{
                      top: startY + 'px',
                      height: Math.max(SLOT_H, endY - startY) + 'px',
                      background: proj?.color || '#666',
                      color: tc,
                    }}
                  >
                    <div className="b-title">{proj?.name ?? ''} · {dur}</div>
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
