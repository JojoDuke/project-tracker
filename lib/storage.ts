import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabase } from './supabase';
import type { AppState, Project, Ticket, TimeBlock } from './types';
import { normalizeKind, normalizeStatus } from './types';

function defaultState(): AppState {
  return {
    projects: [
      {
        id: randomUUID(),
        name: 'Untitled Project',
        color: '#6aa9ff',
        kind: 'personal',
        client: '',
        status: 'active',
        archived: false,
        createdAt: new Date().toISOString()
      }
    ],
    tickets: [],
    blocks: []
  };
}

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

export async function loadState(): Promise<AppState> {
  const [{ data: projects, error: pe }, { data: tickets, error: te }, { data: blocks, error: be }] =
    await Promise.all([
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('tickets').select('*').order('order'),
      supabase.from('blocks').select('*').order('created_at')
    ]);

  if (pe) throw new Error(`projects load failed: ${pe.message}`);
  if (te) throw new Error(`tickets load failed: ${te.message}`);
  if (be) throw new Error(`blocks load failed: ${be.message}`);

  if (!projects?.length && !tickets?.length && !blocks?.length) {
    const seed = defaultState();
    await saveState(seed);
    return seed;
  }

  return {
    projects: (projects ?? []).map(toProject),
    tickets: (tickets ?? []).map(toTicket),
    blocks: (blocks ?? []).map(toBlock)
  };
}

export async function saveState(state: AppState): Promise<void> {
  // Delete in order to respect any FK constraints (children first)
  const delResults = await Promise.all([
    supabase.from('blocks').delete().neq('id', ''),
    supabase.from('tickets').delete().neq('id', '')
  ]);
  for (const { error } of delResults) {
    if (error) throw new Error(`delete failed: ${error.message}`);
  }
  const { error: pe } = await supabase.from('projects').delete().neq('id', '');
  if (pe) throw new Error(`delete projects failed: ${pe.message}`);

  // Re-insert current state
  if (state.projects.length) {
    const { error } = await supabase.from('projects').insert(
      state.projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        kind: p.kind,
        client: p.client,
        status: p.status,
        archived: p.archived ?? false,
        created_at: p.createdAt
      }))
    );
    if (error) throw new Error(`insert projects failed: ${error.message}`);
  }

  if (state.tickets.length) {
    const { error } = await supabase.from('tickets').insert(
      state.tickets.map((t) => ({
        id: t.id,
        project_id: t.projectId,
        number: t.number,
        title: t.title,
        description: t.description,
        done: t.done,
        done_at: t.doneAt,
        order: t.order,
        created_at: t.createdAt
      }))
    );
    if (error) throw new Error(`insert tickets failed: ${error.message}`);
  }

  if (state.blocks.length) {
    const { error } = await supabase.from('blocks').insert(
      state.blocks.map((b) => ({
        id: b.id,
        project_id: b.projectId,
        start: b.start,
        end: b.end,
        note: b.note,
        created_at: b.createdAt
      }))
    );
    if (error) throw new Error(`insert blocks failed: ${error.message}`);
  }
}

export async function mutate(fn: (s: AppState) => void | Promise<void>): Promise<AppState> {
  const state = await loadState();
  await fn(state);
  await saveState(state);
  return state;
}
