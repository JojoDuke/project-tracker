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
