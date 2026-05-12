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
    const ticket = state.tickets.find((t) => t.id === id);
    if (!ticket) {
      notFound = true;
      return;
    }
    const { title, description, done, order, projectId } = body ?? {};
    if (title !== undefined) ticket.title = String(title).trim().slice(0, 200);
    if (description !== undefined) ticket.description = String(description).slice(0, 2000);
    if (done !== undefined) {
      ticket.done = !!done;
      ticket.doneAt = ticket.done ? new Date().toISOString() : null;
    }
    if (order !== undefined) ticket.order = Number(order);
    if (projectId !== undefined && state.projects.find((p) => p.id === projectId)) {
      ticket.projectId = projectId;
    }
    result = ticket;
  });
  if (notFound) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await mutate((state) => {
    state.tickets = state.tickets.filter((t) => t.id !== id);
  });
  return NextResponse.json({ ok: true });
}
