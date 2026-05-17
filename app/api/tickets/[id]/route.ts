import { NextResponse } from 'next/server';
import { dbUpdateTicket, dbDeleteTicket } from '@/lib/storage';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { title, description, done, order, projectId } = body ?? {};

  try {
    const ticket = await dbUpdateTicket(id, {
      ...(title       !== undefined && { title: String(title).trim().slice(0, 200) }),
      ...(description !== undefined && { description: String(description).slice(0, 2000) }),
      ...(done        !== undefined && {
        done: !!done,
        doneAt: done ? new Date().toISOString() : null
      }),
      ...(order     !== undefined && { order: Number(order) }),
      ...(projectId !== undefined && { projectId })
    });
    return NextResponse.json(ticket);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: 'not found' }, { status: 404 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await dbDeleteTicket(id);
  return NextResponse.json({ ok: true });
}
