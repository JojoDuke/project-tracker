import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mutate } from '@/lib/storage';
import { normalizeKind, normalizeStatus } from '@/lib/types';
import { pickColor } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, color, kind, client, status } = body ?? {};
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  let created;
  await mutate((state) => {
    created = {
      id: randomUUID(),
      name: name.trim(),
      color: color || pickColor(state.projects.length),
      archived: false,
      kind: normalizeKind(kind),
      client: client ? String(client).trim().slice(0, 120) : '',
      status: normalizeStatus(status),
      createdAt: new Date().toISOString()
    };
    state.projects.push(created);
  });
  return NextResponse.json(created);
}
