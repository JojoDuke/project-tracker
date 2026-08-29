import { NextResponse } from 'next/server';
import { dbUpdateProject, dbDeleteProject } from '@/lib/storage';
import { normalizeHabitGoal, normalizeKind, normalizeStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, color, archived, kind, client, status, habitGoal } = body ?? {};

  try {
    const project = await dbUpdateProject(id, {
      ...(name      !== undefined && { name: String(name).trim() }),
      ...(color     !== undefined && { color }),
      ...(archived  !== undefined && { archived: !!archived }),
      ...(kind      !== undefined && { kind: normalizeKind(kind) }),
      ...(client    !== undefined && { client: String(client).trim().slice(0, 120) }),
      ...(status    !== undefined && { status: normalizeStatus(status) }),
      ...(habitGoal !== undefined && { habitGoal: normalizeHabitGoal(habitGoal) })
    });
    return NextResponse.json(project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: 'not found' }, { status: 404 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await dbDeleteProject(id);
  return NextResponse.json({ ok: true });
}
