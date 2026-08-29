import { NextResponse } from 'next/server';
import { dbDeleteHabitMark } from '@/lib/storage';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await dbDeleteHabitMark(id);
  return NextResponse.json({ ok: true });
}
