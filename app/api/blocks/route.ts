import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { dbCreateBlock } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, start, end, note } = body ?? {};
  if (!projectId || !start || !end) {
    return NextResponse.json({ error: 'projectId, start, end required' }, { status: 400 });
  }

  // Verify project exists
  const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).single();
  if (!proj) return NextResponse.json({ error: 'unknown project' }, { status: 400 });

  const block = await dbCreateBlock({
    id: randomUUID(),
    projectId,
    start,
    end,
    note: note ? String(note).slice(0, 500) : '',
    createdAt: new Date().toISOString()
  });

  return NextResponse.json(block);
}
