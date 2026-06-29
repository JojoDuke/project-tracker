import type { Project, TimeBlock } from './types';
import { durationLabel } from './time';

const PREFS_KEY = 'blockNotify.prefs';
const FIRED_KEY = 'blockNotify.fired';
export const BLOCK_NOTIFY_CHECK_MS = 30_000;

export type BlockNotifyEvent = 'start' | 'end';

export interface BlockNotifyPrefs {
  enabled: boolean;
}

export interface DueBlockEvent {
  block: TimeBlock;
  event: BlockNotifyEvent;
  projectName: string;
}

function firedKey(blockId: string, event: BlockNotifyEvent): string {
  return `${blockId}:${event}`;
}

export function loadBlockNotifyPrefs(): BlockNotifyPrefs {
  if (typeof window === 'undefined') return { enabled: false };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { enabled: false };
    const parsed = JSON.parse(raw) as Partial<BlockNotifyPrefs>;
    return { enabled: !!parsed.enabled };
  } catch {
    return { enabled: false };
  }
}

export function saveBlockNotifyPrefs(prefs: BlockNotifyPrefs): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function loadFired(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FIRED_KEY, JSON.stringify([...fired]));
}

export function isBlockEventFired(blockId: string, event: BlockNotifyEvent): boolean {
  return loadFired().has(firedKey(blockId, event));
}

export function markBlockEventFired(blockId: string, event: BlockNotifyEvent): void {
  const fired = loadFired();
  fired.add(firedKey(blockId, event));
  saveFired(fired);
}

export function clearBlockFiredKeys(blockId: string): void {
  const fired = loadFired();
  fired.delete(firedKey(blockId, 'start'));
  fired.delete(firedKey(blockId, 'end'));
  saveFired(fired);
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

function withinWindow(targetMs: number, nowMs: number, windowMs: number): boolean {
  return targetMs <= nowMs && targetMs > nowMs - windowMs;
}

export function checkDueBlocks(
  blocks: TimeBlock[],
  projects: Project[],
  now: Date = new Date(),
  windowMs = BLOCK_NOTIFY_CHECK_MS
): DueBlockEvent[] {
  const nowMs = now.getTime();
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const due: DueBlockEvent[] = [];

  for (const block of blocks) {
    const project = projectById.get(block.projectId);
    if (!project) continue;

    const startMs = new Date(block.start).getTime();
    const endMs = new Date(block.end).getTime();

    if (withinWindow(startMs, nowMs, windowMs) && !isBlockEventFired(block.id, 'start')) {
      due.push({ block, event: 'start', projectName: project.name });
    }
    if (withinWindow(endMs, nowMs, windowMs) && !isBlockEventFired(block.id, 'end')) {
      due.push({ block, event: 'end', projectName: project.name });
    }
  }

  return due;
}

export function showBlockNotification(
  event: BlockNotifyEvent,
  block: TimeBlock,
  projectName: string
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const start = new Date(block.start);
  const end = new Date(block.end);
  const dur = durationLabel(end.getTime() - start.getTime());
  const title = event === 'start' ? 'Block starting' : 'Block ended';
  let body = `${projectName} · ${dur}`;
  if (block.note) body += ` — ${block.note}`;

  try {
    new Notification(title, {
      body,
      tag: `${block.id}:${event}`
    });
  } catch {
    /* noop */
  }
}
