import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { dbCreateProject, loadState } from '@/lib/storage';
import { normalizeHabitGoal, normalizeKind, normalizeStatus } from '@/lib/types';
import { pickColor } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, color, kind, client, status, habitGoal } = body ?? {};
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  // Need project count only for auto-color fallback
  const { projects } = await loadState();

  const project = await dbCreateProject({
    id: randomUUID(),
    name: name.trim(),
    color: color || pickColor(projects.length),
    archived: false,
    kind: normalizeKind(kind),
    client: client ? String(client).trim().slice(0, 120) : '',
    status: normalizeStatus(status),
    habitGoal: normalizeHabitGoal(habitGoal),
    createdAt: new Date().toISOString()
  });

  return NextResponse.json(project);
}
