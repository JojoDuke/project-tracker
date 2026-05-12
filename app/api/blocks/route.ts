import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mutate } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, start, end, note } = body ?? {};
  if (!projectId || !start || !end) {
    return NextResponse.json({ error: 'projectId, start, end required' }, { status: 400 });
  }
  let created;
  let badProject = false;
  await mutate((state) => {
    if (!state.projects.find((p) => p.id === projectId)) {
      badProject = true;
      return;
    }
    created = {
      id: randomUUID(),
      projectId,
      start,
      end,
      note: note ? String(note).slice(0, 500) : '',
      createdAt: new Date().toISOString()
    };
    state.blocks.push(created);
  });
  if (badProject) return NextResponse.json({ error: 'unknown project' }, { status: 400 });
  return NextResponse.json(created);
}
