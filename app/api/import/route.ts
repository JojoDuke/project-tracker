import { NextResponse } from 'next/server';
import { saveState } from '@/lib/storage';
import type { AppState } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const token = req.headers.get('x-import-token');
  if (!process.env.IMPORT_TOKEN || token !== process.env.IMPORT_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as AppState | null;
  if (!body || !Array.isArray(body.projects)) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  const state: AppState = {
    projects: body.projects,
    tickets: Array.isArray(body.tickets) ? body.tickets : [],
    blocks: Array.isArray(body.blocks) ? body.blocks : []
  };
  await saveState(state);
  return NextResponse.json({ ok: true, counts: {
    projects: state.projects.length,
    tickets: state.tickets.length,
    blocks: state.blocks.length
  }});
}
