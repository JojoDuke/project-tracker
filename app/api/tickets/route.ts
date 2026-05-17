import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { dbCreateTicket } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, title, description } = body ?? {};
  if (!projectId || !title) {
    return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
  }

  // Verify project exists
  const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).single();
  if (!proj) return NextResponse.json({ error: 'unknown project' }, { status: 400 });

  // Compute next ticket number and order for this project
  const { data: existing } = await supabase
    .from('tickets')
    .select('number, order')
    .eq('project_id', projectId);

  const number   = (existing ?? []).reduce((m, t) => Math.max(m, t.number || 0), 0) + 1;
  const maxOrder = (existing ?? []).reduce((m, t) => Math.max(m, t.order  || 0), 0);

  const ticket = await dbCreateTicket({
    id: randomUUID(),
    projectId,
    number,
    title: String(title).trim().slice(0, 200),
    description: description ? String(description).slice(0, 2000) : '',
    done: false,
    doneAt: null,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  });

  return NextResponse.json(ticket);
}
