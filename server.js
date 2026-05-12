import express from 'express';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'store.json');
const PORT = process.env.PORT || 5174;

const PROJECT_STATUSES = ['active', 'paused', 'inactive', 'done'];
function normalizeStatus(s) { return PROJECT_STATUSES.includes(s) ? s : 'active'; }

const DEFAULT_STATE = {
  projects: [
    { id: randomUUID(), name: 'Untitled Project', color: '#6aa9ff', archived: false, kind: 'personal', client: '', status: 'active', createdAt: new Date().toISOString() }
  ],
  blocks: [],
  tickets: []
};

function normalizeKind(k) { return k === 'client' ? 'client' : 'personal'; }

if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
if (!existsSync(DATA_FILE)) await writeFile(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2));

let writeQueue = Promise.resolve();
async function load() {
  const raw = await readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}
async function save(state) {
  writeQueue = writeQueue.then(async () => {
    const tmp = DATA_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, DATA_FILE);
  });
  return writeQueue;
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, 'public')));

app.get('/api/state', async (_req, res) => {
  const s = await load();
  if (!s.tickets) s.tickets = [];
  for (const p of s.projects) {
    if (!p.kind) p.kind = 'personal';
    if (p.client === undefined) p.client = '';
    if (!p.status) p.status = p.archived ? 'done' : 'active';
  }
  res.json(s);
});

app.post('/api/projects', async (req, res) => {
  const { name, color, kind, client, status } = req.body ?? {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  const state = await load();
  const project = {
    id: randomUUID(),
    name: name.trim(),
    color: color || pickColor(state.projects.length),
    archived: false,
    kind: normalizeKind(kind),
    client: client ? String(client).trim().slice(0, 120) : '',
    status: normalizeStatus(status),
    createdAt: new Date().toISOString()
  };
  state.projects.push(project);
  await save(state);
  res.json(project);
});

app.patch('/api/projects/:id', async (req, res) => {
  const state = await load();
  const project = state.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  const { name, color, archived, kind, client, status } = req.body ?? {};
  if (name !== undefined) project.name = String(name).trim();
  if (color !== undefined) project.color = color;
  if (archived !== undefined) project.archived = !!archived;
  if (kind !== undefined) project.kind = normalizeKind(kind);
  if (client !== undefined) project.client = String(client).trim().slice(0, 120);
  if (status !== undefined) project.status = normalizeStatus(status);
  await save(state);
  res.json(project);
});

app.delete('/api/projects/:id', async (req, res) => {
  const state = await load();
  state.projects = state.projects.filter(p => p.id !== req.params.id);
  state.blocks = state.blocks.filter(b => b.projectId !== req.params.id);
  state.tickets = (state.tickets || []).filter(t => t.projectId !== req.params.id);
  await save(state);
  res.json({ ok: true });
});

app.post('/api/tickets', async (req, res) => {
  const { projectId, title, description } = req.body ?? {};
  if (!projectId || !title) return res.status(400).json({ error: 'projectId and title required' });
  const state = await load();
  if (!state.tickets) state.tickets = [];
  if (!state.projects.find(p => p.id === projectId)) return res.status(400).json({ error: 'unknown project' });
  const projectTickets = state.tickets.filter(t => t.projectId === projectId);
  const number = projectTickets.reduce((m, t) => Math.max(m, t.number || 0), 0) + 1;
  const maxOrder = projectTickets.reduce((m, t) => Math.max(m, t.order || 0), 0);
  const ticket = {
    id: randomUUID(),
    projectId,
    number,
    title: String(title).trim().slice(0, 200),
    description: description ? String(description).slice(0, 2000) : '',
    done: false,
    doneAt: null,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  state.tickets.push(ticket);
  await save(state);
  res.json(ticket);
});

app.patch('/api/tickets/:id', async (req, res) => {
  const state = await load();
  if (!state.tickets) state.tickets = [];
  const ticket = state.tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });
  const { title, description, done, order, projectId } = req.body ?? {};
  if (title !== undefined) ticket.title = String(title).trim().slice(0, 200);
  if (description !== undefined) ticket.description = String(description).slice(0, 2000);
  if (done !== undefined) {
    ticket.done = !!done;
    ticket.doneAt = ticket.done ? new Date().toISOString() : null;
  }
  if (order !== undefined) ticket.order = Number(order);
  if (projectId !== undefined && state.projects.find(p => p.id === projectId)) ticket.projectId = projectId;
  await save(state);
  res.json(ticket);
});

app.delete('/api/tickets/:id', async (req, res) => {
  const state = await load();
  if (!state.tickets) state.tickets = [];
  state.tickets = state.tickets.filter(t => t.id !== req.params.id);
  await save(state);
  res.json({ ok: true });
});

app.post('/api/blocks', async (req, res) => {
  const { projectId, start, end, note } = req.body ?? {};
  if (!projectId || !start || !end) return res.status(400).json({ error: 'projectId, start, end required' });
  const state = await load();
  if (!state.projects.find(p => p.id === projectId)) return res.status(400).json({ error: 'unknown project' });
  const block = {
    id: randomUUID(),
    projectId,
    start,
    end,
    note: note ? String(note).slice(0, 500) : '',
    createdAt: new Date().toISOString()
  };
  state.blocks.push(block);
  await save(state);
  res.json(block);
});

app.patch('/api/blocks/:id', async (req, res) => {
  const state = await load();
  const block = state.blocks.find(b => b.id === req.params.id);
  if (!block) return res.status(404).json({ error: 'not found' });
  const { start, end, note, projectId } = req.body ?? {};
  if (start !== undefined) block.start = start;
  if (end !== undefined) block.end = end;
  if (note !== undefined) block.note = String(note).slice(0, 500);
  if (projectId !== undefined && state.projects.find(p => p.id === projectId)) block.projectId = projectId;
  await save(state);
  res.json(block);
});

app.delete('/api/blocks/:id', async (req, res) => {
  const state = await load();
  state.blocks = state.blocks.filter(b => b.id !== req.params.id);
  await save(state);
  res.json({ ok: true });
});

function pickColor(i) {
  const palette = ['#6aa9ff', '#ff8a5b', '#7ed957', '#c084fc', '#f5c542', '#ff6b9d', '#4ecdc4', '#ffa07a'];
  return palette[i % palette.length];
}

app.listen(PORT, () => {
  console.log(`project-tracker running at http://localhost:${PORT}`);
});
