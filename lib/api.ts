import type { AppState, Project, Ticket, TimeBlock } from './types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  state: (): Promise<AppState> => fetch('/api/state').then((r) => json<AppState>(r)),

  addProject: (body: Partial<Project>): Promise<Project> =>
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => json<Project>(r)),

  updateProject: (id: string, body: Partial<Project>): Promise<Project> =>
    fetch('/api/projects/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => json<Project>(r)),

  deleteProject: (id: string): Promise<{ ok: true }> =>
    fetch('/api/projects/' + id, { method: 'DELETE' }).then((r) => json(r)),

  addBlock: (body: Partial<TimeBlock>): Promise<TimeBlock> =>
    fetch('/api/blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => json<TimeBlock>(r)),

  updateBlock: (id: string, body: Partial<TimeBlock>): Promise<TimeBlock> =>
    fetch('/api/blocks/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => json<TimeBlock>(r)),

  deleteBlock: (id: string): Promise<{ ok: true }> =>
    fetch('/api/blocks/' + id, { method: 'DELETE' }).then((r) => json(r)),

  addTicket: (body: Partial<Ticket>): Promise<Ticket> =>
    fetch('/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => json<Ticket>(r)),

  updateTicket: (id: string, body: Partial<Ticket>): Promise<Ticket> =>
    fetch('/api/tickets/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then((r) => json<Ticket>(r)),

  deleteTicket: (id: string): Promise<{ ok: true }> =>
    fetch('/api/tickets/' + id, { method: 'DELETE' }).then((r) => json(r))
};
