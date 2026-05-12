import { NextResponse } from 'next/server';
import { mutate } from '@/lib/storage';

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
    const block = state.blocks.find((b) => b.id === id);
    if (!block) {
      notFound = true;
      return;
    }
    const { start, end, note, projectId } = body ?? {};
    if (start !== undefined) block.start = start;
    if (end !== undefined) block.end = end;
    if (note !== undefined) block.note = String(note).slice(0, 500);
    if (projectId !== undefined && state.projects.find((p) => p.id === projectId)) {
      block.projectId = projectId;
    }
    result = block;
  });
  if (notFound) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await mutate((state) => {
    state.blocks = state.blocks.filter((b) => b.id !== id);
  });
  return NextResponse.json({ ok: true });
}
