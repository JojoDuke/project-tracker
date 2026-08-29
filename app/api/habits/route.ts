import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { dbCreateHabitMark } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, day } = body ?? {};
  if (!projectId || typeof projectId !== 'string') {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  if (typeof day !== 'string' || !DAY_RE.test(day)) {
    return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  }

  const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).single();
  if (!proj) return NextResponse.json({ error: 'unknown project' }, { status: 400 });

  const { data: existing } = await supabase
    .from('habit_marks')
    .select('*')
    .eq('project_id', projectId)
    .eq('day', day)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      projectId: existing.project_id,
      day: String(existing.day).slice(0, 10),
      createdAt: existing.created_at
    });
  }

  const mark = await dbCreateHabitMark({
    id: randomUUID(),
    projectId,
    day,
    createdAt: new Date().toISOString()
  });

  return NextResponse.json(mark);
}
