import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { del, list, put } from '@vercel/blob';
import type { AppState } from './types';

const BLOB_KEY = 'store.json';
const LOCAL_DATA_DIR = join(process.cwd(), 'data');
const LOCAL_DATA_FILE = join(LOCAL_DATA_DIR, 'store.json');

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

function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

let writeQueue: Promise<unknown> = Promise.resolve();

async function loadLocal(): Promise<AppState> {
  if (!existsSync(LOCAL_DATA_FILE)) {
    await mkdir(LOCAL_DATA_DIR, { recursive: true });
    await writeFile(LOCAL_DATA_FILE, JSON.stringify(defaultState(), null, 2));
  }
  const raw = await readFile(LOCAL_DATA_FILE, 'utf8');
  return JSON.parse(raw) as AppState;
}

async function saveLocal(state: AppState): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(LOCAL_DATA_FILE), { recursive: true });
    const tmp = LOCAL_DATA_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, LOCAL_DATA_FILE);
  });
  await writeQueue;
}

async function loadBlob(): Promise<AppState> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    const blob = blobs.find((b) => b.pathname === BLOB_KEY);
    if (!blob) throw new Error('blob not found');
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) throw new Error('blob fetch failed');
    return (await res.json()) as AppState;
  } catch {
    const seed = defaultState();
    await saveBlob(seed);
    return seed;
  }
}

async function saveBlob(state: AppState): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const { blobs } = await list({ prefix: BLOB_KEY });
    const existing = blobs.find((b) => b.pathname === BLOB_KEY);
    if (existing) await del(existing.url);
    await put(BLOB_KEY, JSON.stringify(state, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false
    });
  });
  await writeQueue;
}

export async function loadState(): Promise<AppState> {
  const s = useBlob() ? await loadBlob() : await loadLocal();
  if (!s.tickets) s.tickets = [];
  if (!s.blocks) s.blocks = [];
  for (const p of s.projects) {
    if (!p.kind) p.kind = 'personal';
    if (p.client === undefined) p.client = '';
    if (!p.status) p.status = p.archived ? 'done' : 'active';
  }
  return s;
}

export async function saveState(state: AppState): Promise<void> {
  if (useBlob()) await saveBlob(state);
  else await saveLocal(state);
}

export async function mutate(fn: (s: AppState) => void | Promise<void>): Promise<AppState> {
  const state = await loadState();
  await fn(state);
  await saveState(state);
  return state;
}
