import { NextResponse } from 'next/server';
import { dbUpdateBlock, dbDeleteBlock } from '@/lib/storage';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { start, end, note, projectId } = body ?? {};

  try {
    const block = await dbUpdateBlock(id, {
      ...(start     !== undefined && { start }),
      ...(end       !== undefined && { end }),
      ...(note      !== undefined && { note: String(note).slice(0, 500) }),
      ...(projectId !== undefined && { projectId })
    });
    return NextResponse.json(block);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: 'not found' }, { status: 404 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await dbDeleteBlock(id);
  return NextResponse.json({ ok: true });
}
