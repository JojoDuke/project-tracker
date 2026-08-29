import 'server-only';
import { supabase } from './supabase';
import type { AppState, HabitMark, Project, Ticket, TimeBlock } from './types';
import { normalizeHabitGoal, normalizeKind, normalizeStatus } from './types';

// ── Row mappers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    kind: normalizeKind(row.kind),
    client: row.client ?? '',
    status: normalizeStatus(row.status),
    archived: row.archived ?? false,
    habitGoal: normalizeHabitGoal(row.habit_goal),
    createdAt: row.created_at
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toHabitMark(row: any): HabitMark {
  return {
    id: row.id,
    projectId: row.project_id,
    day: String(row.day).slice(0, 10),
    createdAt: row.created_at
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTicket(row: any): Ticket {
  return {
    id: row.id,
    projectId: row.project_id,
    number: row.number,
    title: row.title,
    description: row.description ?? '',
    done: row.done,
    doneAt: row.done_at ?? null,
    order: row.order,
    priority: row.priority ?? false,
    createdAt: row.created_at
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBlock(row: any): TimeBlock {
  return {
    id: row.id,
    projectId: row.project_id,
    start: row.start,
    end: row.end,
    note: row.note ?? '',
    createdAt: row.created_at
  };
}

// ── Load full state (read-only, no side effects) ──────────────────────────────

export async function loadState(): Promise<AppState> {
  const [
    { data: projects, error: pe },
    { data: tickets, error: te },
    { data: blocks, error: be },
    { data: marks, error: he }
  ] = await Promise.all([
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('tickets').select('*').order('order'),
    supabase.from('blocks').select('*').order('created_at'),
    supabase.from('habit_marks').select('*').order('day')
  ]);

  if (pe) throw new Error(`projects load failed: ${pe.message}`);
  if (te) throw new Error(`tickets load failed: ${te.message}`);
  if (be) throw new Error(`blocks load failed: ${be.message}`);
  if (he && he.code !== '42P01' && !/habit_marks/.test(he.message)) {
    throw new Error(`habit marks load failed: ${he.message}`);
  }

  return {
    projects: (projects ?? []).map(toProject),
    tickets: (tickets ?? []).map(toTicket),
    blocks: (blocks ?? []).map(toBlock),
    habitMarks: he ? [] : (marks ?? []).map(toHabitMark)
  };
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function dbCreateProject(p: Project): Promise<Project> {
  const row: Record<string, unknown> = {
    id: p.id,
    name: p.name,
    color: p.color,
    kind: p.kind,
    client: p.client,
    status: p.status,
    archived: p.archived,
    created_at: p.createdAt
  };
  if (p.habitGoal != null) row.habit_goal = p.habitGoal;

  let { data, error } = await supabase.from('projects').insert(row).select().single();
  if (error && row.habit_goal !== undefined && /habit_goal/.test(error.message)) {
    delete row.habit_goal;
    const retry = await supabase.from('projects').insert(row).select().single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw new Error(`create project failed: ${error.message}`);
  return toProject(data);
}

export async function dbUpdateProject(
  id: string,
  patch: Partial<{
    name: string;
    color: string;
    kind: string;
    client: string;
    status: string;
    archived: boolean;
    habitGoal: number | null;
  }>
): Promise<Project> {
  const update: Record<string, unknown> = {};
  if (patch.name      !== undefined) update.name       = patch.name;
  if (patch.color     !== undefined) update.color      = patch.color;
  if (patch.kind      !== undefined) update.kind       = patch.kind;
  if (patch.client    !== undefined) update.client     = patch.client;
  if (patch.status    !== undefined) update.status     = patch.status;
  if (patch.archived  !== undefined) update.archived   = patch.archived;
  if (patch.habitGoal !== undefined) update.habit_goal = patch.habitGoal;

  let { data, error } = await supabase
    .from('projects')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error && update.habit_goal !== undefined && /habit_goal/.test(error.message)) {
    delete update.habit_goal;
    const retry = await supabase.from('projects').update(update).eq('id', id).select().single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw new Error(`update project failed: ${error.message}`);
  if (!data) throw new Error('project not found');
  return toProject(data);
}

export async function dbDeleteProject(id: string): Promise<void> {
  // Delete children first to respect FK constraints
  const [{ error: be }, { error: te }, { error: he }] = await Promise.all([
    supabase.from('blocks').delete().eq('project_id', id),
    supabase.from('tickets').delete().eq('project_id', id),
    supabase.from('habit_marks').delete().eq('project_id', id)
  ]);
  if (be) throw new Error(`delete project blocks failed: ${be.message}`);
  if (te) throw new Error(`delete project tickets failed: ${te.message}`);
  if (he) throw new Error(`delete project habit marks failed: ${he.message}`);

  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(`delete project failed: ${error.message}`);
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export async function dbCreateBlock(b: TimeBlock): Promise<TimeBlock> {
  const { data, error } = await supabase
    .from('blocks')
    .insert({
      id: b.id,
      project_id: b.projectId,
      start: b.start,
      end: b.end,
      note: b.note,
      created_at: b.createdAt
    })
    .select()
    .single();
  if (error) throw new Error(`create block failed: ${error.message}`);
  return toBlock(data);
}

export async function dbUpdateBlock(
  id: string,
  patch: Partial<{ start: string; end: string; note: string; projectId: string }>
): Promise<TimeBlock> {
  const update: Record<string, unknown> = {};
  if (patch.start     !== undefined) update.start      = patch.start;
  if (patch.end       !== undefined) update.end        = patch.end;
  if (patch.note      !== undefined) update.note       = patch.note;
  if (patch.projectId !== undefined) update.project_id = patch.projectId;

  const { data, error } = await supabase
    .from('blocks')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`update block failed: ${error.message}`);
  if (!data) throw new Error('block not found');
  return toBlock(data);
}

export async function dbDeleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('blocks').delete().eq('id', id);
  if (error) throw new Error(`delete block failed: ${error.message}`);
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export async function dbCreateTicket(t: Ticket): Promise<Ticket> {
  const { data, error } = await supabase
    .from('tickets')
    .insert({
      id: t.id,
      project_id: t.projectId,
      number: t.number,
      title: t.title,
      description: t.description,
      done: t.done,
      done_at: t.doneAt,
      order: t.order,
      priority: t.priority ?? false,
      created_at: t.createdAt
    })
    .select()
    .single();
  if (error) throw new Error(`create ticket failed: ${error.message}`);
  return toTicket(data);
}

export async function dbUpdateTicket(
  id: string,
  patch: Partial<{ title: string; description: string; done: boolean; doneAt: string | null; order: number; projectId: string; priority: boolean }>
): Promise<Ticket> {
  const update: Record<string, unknown> = {};
  if (patch.title       !== undefined) update.title       = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.done        !== undefined) update.done        = patch.done;
  if (patch.doneAt      !== undefined) update.done_at     = patch.doneAt;
  if (patch.order       !== undefined) update.order       = patch.order;
  if (patch.projectId   !== undefined) update.project_id  = patch.projectId;
  if (patch.priority    !== undefined) update.priority    = patch.priority;

  const { data, error } = await supabase
    .from('tickets')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`update ticket failed: ${error.message}`);
  if (!data) throw new Error('ticket not found');
  return toTicket(data);
}

export async function dbDeleteTicket(id: string): Promise<void> {
  const { error } = await supabase.from('tickets').delete().eq('id', id);
  if (error) throw new Error(`delete ticket failed: ${error.message}`);
}

// ── Habit marks ───────────────────────────────────────────────────────────────

export async function dbCreateHabitMark(m: HabitMark): Promise<HabitMark> {
  const { data, error } = await supabase
    .from('habit_marks')
    .insert({
      id: m.id,
      project_id: m.projectId,
      day: m.day,
      created_at: m.createdAt
    })
    .select()
    .single();
  if (error) throw new Error(`create habit mark failed: ${error.message}`);
  return toHabitMark(data);
}

export async function dbDeleteHabitMark(id: string): Promise<void> {
  const { error } = await supabase.from('habit_marks').delete().eq('id', id);
  if (error) throw new Error(`delete habit mark failed: ${error.message}`);
}

// ── Bulk import (only used by the import route) ───────────────────────────────

export async function replaceAllData(state: AppState): Promise<void> {
  // Delete children first, then projects
  await supabase.from('habit_marks').delete().neq('id', '');
  await supabase.from('blocks').delete().neq('id', '');
  await supabase.from('tickets').delete().neq('id', '');
  await supabase.from('projects').delete().neq('id', '');

  if (state.projects.length) {
    const { error } = await supabase.from('projects').insert(
      state.projects.map((p) => ({
        id: p.id, name: p.name, color: p.color, kind: p.kind,
        client: p.client, status: p.status, archived: p.archived ?? false,
        habit_goal: p.habitGoal ?? null,
        created_at: p.createdAt
      }))
    );
    if (error) throw new Error(`import projects failed: ${error.message}`);
  }
  if (state.tickets.length) {
    const { error } = await supabase.from('tickets').insert(
      state.tickets.map((t) => ({
        id: t.id, project_id: t.projectId, number: t.number, title: t.title,
        description: t.description, done: t.done, done_at: t.doneAt,
        order: t.order, priority: t.priority ?? false, created_at: t.createdAt
      }))
    );
    if (error) throw new Error(`import tickets failed: ${error.message}`);
  }
  if (state.blocks.length) {
    const { error } = await supabase.from('blocks').insert(
      state.blocks.map((b) => ({
        id: b.id, project_id: b.projectId, start: b.start,
        end: b.end, note: b.note, created_at: b.createdAt
      }))
    );
    if (error) throw new Error(`import blocks failed: ${error.message}`);
  }
  if (state.habitMarks?.length) {
    const { error } = await supabase.from('habit_marks').insert(
      state.habitMarks.map((m) => ({
        id: m.id, project_id: m.projectId, day: m.day, created_at: m.createdAt
      }))
    );
    if (error) throw new Error(`import habit marks failed: ${error.message}`);
  }
}
