import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mutate } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, title, description } = body ?? {};
  if (!projectId || !title) {
    return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
  }
  let created;
  let badProject = false;
  await mutate((state) => {
    if (!state.projects.find((p) => p.id === projectId)) {
      badProject = true;
      return;
    }
    const projectTickets = state.tickets.filter((t) => t.projectId === projectId);
    const number = projectTickets.reduce((m, t) => Math.max(m, t.number || 0), 0) + 1;
    const maxOrder = projectTickets.reduce((m, t) => Math.max(m, t.order || 0), 0);
    created = {
      id: randomUUID(),
      projectId,
      number,
      title: String(title).trim().slice(0, 200),
      description: description ? String(description).slice(0, 2000) : '',
      done: false,
      doneAt: null,
      order: maxOrder + 1,
      createdAt: new Date().toISOString()
    };
    state.tickets.push(created);
  });
  if (badProject) return NextResponse.json({ error: 'unknown project' }, { status: 400 });
  return NextResponse.json(created);
}
