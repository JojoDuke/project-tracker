export type ProjectKind = 'personal' | 'client';
export type ProjectStatus = 'active' | 'paused' | 'inactive' | 'done';

export interface Project {
  id: string;
  name: string;
  color: string;
  kind: ProjectKind;
  client: string;
  status: ProjectStatus;
  archived?: boolean;
  habitGoal: number | null;
  createdAt: string;
}

export interface HabitMark {
  id: string;
  projectId: string;
  day: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string;
  done: boolean;
  doneAt: string | null;
  order: number;
  priority: boolean;
  createdAt: string;
}

export interface TimeBlock {
  id: string;
  projectId: string;
  start: string;
  end: string;
  note: string;
  createdAt: string;
}

export interface AppState {
  projects: Project[];
  tickets: Ticket[];
  blocks: TimeBlock[];
  habitMarks: HabitMark[];
}

export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'inactive', 'done'];

export function normalizeKind(k: unknown): ProjectKind {
  return k === 'client' ? 'client' : 'personal';
}

export function normalizeStatus(s: unknown): ProjectStatus {
  return typeof s === 'string' && (PROJECT_STATUSES as string[]).includes(s)
    ? (s as ProjectStatus)
    : 'active';
}

export function normalizeHabitGoal(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1) return null;
  return Math.min(rounded, 10000);
}
