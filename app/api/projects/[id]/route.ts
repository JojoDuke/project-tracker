import { NextResponse } from 'next/server';
import { mutate } from '@/lib/storage';
import { normalizeKind, normalizeStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  let result;
  let notFound = false;
  await mutate((state) => {
    const project = state.projects.find((p) => p.id === id);
    if (!project) {
      notFound = true;
      return;
    }
    const { name, color, archived, kind, client, status } = body ?? {};
    if (name !== undefined) project.name = String(name).trim();
    if (color !== undefined) project.color = color;
    if (archived !== undefined) project.archived = !!archived;
    if (kind !== undefined) project.kind = normalizeKind(kind);
    if (client !== undefined) project.client = String(client).trim().slice(0, 120);
    if (status !== undefined) project.status = normalizeStatus(status);
    result = project;
  });
  if (notFound) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await mutate((state) => {
    state.projects = state.projects.filter((p) => p.id !== id);
    state.blocks = state.blocks.filter((b) => b.projectId !== id);
    state.tickets = state.tickets.filter((t) => t.projectId !== id);
  });
  return NextResponse.json({ ok: true });
}
