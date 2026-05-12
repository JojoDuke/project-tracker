const SLOT_MIN = 15;
const DAY_START = 6;
const DAY_END = 24;
const HOUR_H = 44;
const SLOT_H = HOUR_H / (60 / SLOT_MIN);

const UI_PREFS_KEY = 'ui.prefs';
function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch { return {}; }
}
function saveUiPrefs(patch) {
  const next = { ...loadUiPrefs(), ...patch };
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(next));
}

const uiPrefs = loadUiPrefs();
const state = {
  projects: [],
  blocks: [],
  tickets: [],
  activeProjectId: uiPrefs.activeProjectId ?? null,
  weekStart: uiPrefs.weekStart ? new Date(uiPrefs.weekStart) : weekStartOf(new Date()),
  showDoneTickets: uiPrefs.showDoneTickets ?? true
};

const api = {
  state: () => fetch('/api/state').then(r => r.json()),
  addProject: (body) => fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  updateProject: (id, body) => fetch('/api/projects/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  deleteProject: (id) => fetch('/api/projects/' + id, { method: 'DELETE' }).then(r => r.json()),
  addBlock: (body) => fetch('/api/blocks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  updateBlock: (id, body) => fetch('/api/blocks/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  deleteBlock: (id) => fetch('/api/blocks/' + id, { method: 'DELETE' }).then(r => r.json()),
  addTicket: (body) => fetch('/api/tickets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  updateTicket: (id, body) => fetch('/api/tickets/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  deleteTicket: (id) => fetch('/api/tickets/' + id, { method: 'DELETE' }).then(r => r.json())
};

function weekStartOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function fmtHour(h) {
  const ap = h >= 12 ? 'p' : 'a';
  const hh = ((h + 11) % 12) + 1;
  return hh + ap;
}
function toLocalISO(d) {
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 16);
}
function parseLocalISO(s) { return new Date(s); }
function snap(date) {
  const d = new Date(date);
  const min = d.getMinutes();
  d.setMinutes(Math.round(min / SLOT_MIN) * SLOT_MIN, 0, 0);
  return d;
}
function relTime(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.floor(hr / 24);
  if (d < 7) return d + 'd ago';
  const w = Math.floor(d / 7);
  return w + 'w ago';
}
function daysSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

async function refresh() {
  const s = await api.state();
  state.projects = s.projects;
  state.blocks = s.blocks;
  state.tickets = s.tickets || [];
  if (!state.activeProjectId && state.projects[0]) state.activeProjectId = state.projects[0].id;
  if (state.activeProjectId && !state.projects.find(p => p.id === state.activeProjectId)) {
    state.activeProjectId = state.projects[0]?.id ?? null;
  }
  saveUiPrefs({ activeProjectId: state.activeProjectId });
  renderAll();
}

function setActiveProject(id) {
  state.activeProjectId = id;
  saveUiPrefs({ activeProjectId: id });
}
function setWeekStart(d) {
  state.weekStart = d;
  saveUiPrefs({ weekStart: d.toISOString() });
}

function projectPrefix(project) {
  if (!project) return 'TKT';
  return (project.name || 'TKT').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X') || 'TKT';
}
function ticketBadge(ticket, project) {
  return `${projectPrefix(project)}-${ticket.number}`;
}

function lastTouched(projectId) {
  let latest = null;
  for (const b of state.blocks) {
    if (b.projectId !== projectId) continue;
    if (!latest || b.end > latest) latest = b.end;
  }
  return latest;
}

function renderAll() {
  renderSidebar();
  renderTickets();
  renderTopbar();
  renderGrid();
}

function renderTickets() {
  const list = document.getElementById('ticketList');
  const head = document.getElementById('ticketsProject');
  const counts = document.getElementById('ticketCounts');
  const project = state.projects.find(p => p.id === state.activeProjectId);
  list.innerHTML = '';
  document.getElementById('showDone').checked = state.showDoneTickets;
  if (!project) {
    head.textContent = 'No project';
    counts.textContent = '';
    list.innerHTML = '<div class="ticket-empty">Select a project to see tickets</div>';
    return;
  }
  head.textContent = project.name;
  const all = state.tickets.filter(t => t.projectId === project.id);
  const todo = all.filter(t => !t.done);
  const done = all.filter(t => t.done);
  counts.textContent = `${todo.length} open · ${done.length} done`;

  const visible = state.showDoneTickets ? all : todo;
  if (visible.length === 0) {
    const msg = all.length === 0 ? 'No tickets yet — add one above' : 'All done. Nice.';
    list.innerHTML = `<div class="ticket-empty">${msg}</div>`;
    return;
  }
  const sorted = [...visible].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.order || 0) - (b.order || 0);
  });
  for (const t of sorted) renderTicket(list, t, project);
}

function renderTicket(list, t, project) {
  const li = document.createElement('li');
  li.className = 'ticket' + (t.done ? ' done' : '');
  li.style.setProperty('--ticket-color', project.color);
  li.innerHTML = `
    <input type="checkbox" class="ticket-checkbox" ${t.done ? 'checked' : ''} />
    <div class="ticket-body">
      <div class="ticket-meta"><span class="ticket-badge"></span></div>
      <div class="ticket-title"></div>
      <div class="ticket-desc"></div>
    </div>`;
  li.querySelector('.ticket-badge').textContent = ticketBadge(t, project);
  li.querySelector('.ticket-title').textContent = t.title;
  const descEl = li.querySelector('.ticket-desc');
  if (t.description) descEl.textContent = t.description; else descEl.remove();
  const cb = li.querySelector('.ticket-checkbox');
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', async () => {
    await api.updateTicket(t.id, { done: cb.checked });
    await refresh();
  });
  li.addEventListener('click', () => openTicketDialog(t));
  list.appendChild(li);
}

const STATUS_LABEL = { active: 'Active', paused: 'Paused', inactive: 'Inactive', done: 'Done' };
function projectStatus(p) {
  if (p.status && STATUS_LABEL[p.status]) return p.status;
  return p.archived ? 'done' : 'active';
}

function renderSidebar() {
  const activeUl = document.getElementById('projectList');
  const archivedUl = document.getElementById('archivedProjectList');
  const archivedSection = document.getElementById('archivedSection');
  const archivedCount = document.getElementById('archivedCount');
  activeUl.innerHTML = '';
  archivedUl.innerHTML = '';

  const sorted = [...state.projects].sort((a, b) => {
    const la = lastTouched(a.id) || a.createdAt;
    const lb = lastTouched(b.id) || b.createdAt;
    return lb.localeCompare(la);
  });

  let archivedN = 0;
  for (const p of sorted) {
    const status = projectStatus(p);
    const isArchived = status === 'inactive' || status === 'done';
    const li = buildProjectItem(p, status);
    if (isArchived) { archivedUl.appendChild(li); archivedN += 1; }
    else activeUl.appendChild(li);
  }

  archivedSection.hidden = archivedN === 0;
  archivedCount.textContent = archivedN ? String(archivedN) : '';
}

function buildProjectItem(p, status) {
  const li = document.createElement('li');
  const isArchived = status === 'inactive' || status === 'done';
  li.className = 'project-item status-' + status
    + (p.id === state.activeProjectId ? ' active' : '')
    + (isArchived ? ' dimmed' : '');
  const lt = lastTouched(p.id);
  const days = daysSince(lt);
  const stale = !isArchived && !!lt && days >= 3;
  const kind = p.kind || 'personal';
  const kindLabel = kind === 'client' ? (p.client ? p.client : 'Client') : 'Personal';
  const statusPill = status === 'active' ? '' : `<span class="status-pill ${status}"></span>`;
  li.innerHTML = `
    <span class="swatch" style="background:${p.color}"></span>
    <span class="meta">
      <span class="name"></span>
      <span class="tags"><span class="kind-pill ${kind}"></span>${statusPill}</span>
      <span class="last ${stale ? 'stale' : ''}">${stale ? '⚠ ' : ''}${relTime(lt)}</span>
    </span>
    <button class="edit" title="Edit project">⋯</button>`;
  li.querySelector('.name').textContent = p.name;
  li.querySelector('.kind-pill').textContent = kindLabel;
  const sp = li.querySelector('.status-pill');
  if (sp) sp.textContent = STATUS_LABEL[status];
  li.addEventListener('click', (e) => {
    if (e.target.closest('.edit')) return;
    setActiveProject(p.id);
    renderAll();
  });
  li.querySelector('.edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openProjectDialog(p);
  });
  return li;
}

function renderTopbar() {
  const ws = state.weekStart;
  const we = addDays(ws, 6);
  document.getElementById('weekLabel').textContent = fmtDate(ws) + ' – ' + fmtDate(we);
  const lbl = document.getElementById('activeProjectLabel');
  const p = state.projects.find(p => p.id === state.activeProjectId);
  if (p) {
    lbl.innerHTML = `<span class="swatch" style="background:${p.color}"></span>Active: <strong></strong>`;
    lbl.querySelector('strong').textContent = p.name;
  } else {
    lbl.textContent = 'No project selected';
  }
}

function renderGrid() {
  const root = document.getElementById('grid');
  const totalHours = DAY_END - DAY_START;
  const colHeight = totalHours * HOUR_H;

  const inner = document.createElement('div');
  inner.className = 'grid-inner';
  inner.style.gridTemplateRows = `auto ${colHeight}px`;

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  inner.appendChild(corner);

  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = addDays(state.weekStart, i);
    const head = document.createElement('div');
    head.className = 'grid-header' + (sameDay(d, today) ? ' today' : '');
    head.innerHTML = `<div class="dow">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div><div class="dom">${d.getDate()}</div>`;
    inner.appendChild(head);
  }

  const hourCol = document.createElement('div');
  hourCol.style.position = 'relative';
  hourCol.style.gridColumn = '1';
  hourCol.style.gridRow = '2';
  for (let h = DAY_START; h < DAY_END; h++) {
    const lbl = document.createElement('div');
    lbl.className = 'hour-label';
    lbl.textContent = fmtHour(h);
    hourCol.appendChild(lbl);
  }
  inner.appendChild(hourCol);

  for (let i = 0; i < 7; i++) {
    const d = addDays(state.weekStart, i);
    const col = document.createElement('div');
    col.className = 'day-col' + (sameDay(d, today) ? ' today' : '');
    col.style.height = colHeight + 'px';
    col.dataset.dayIndex = String(i);
    col.style.gridColumn = String(i + 2);
    col.style.gridRow = '2';
    attachDragHandlers(col, d);
    inner.appendChild(col);

    if (sameDay(d, today)) {
      const minsSince = (today.getHours() - DAY_START) * 60 + today.getMinutes();
      const y = (minsSince / 60) * HOUR_H;
      if (y >= 0 && y <= colHeight) {
        const nl = document.createElement('div');
        nl.className = 'now-line';
        nl.style.top = y + 'px';
        col.appendChild(nl);
      }
    }

    const dayStart = new Date(d); dayStart.setHours(DAY_START, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(DAY_END, 0, 0, 0);
    const blocks = state.blocks.filter(b => {
      const bs = new Date(b.start), be = new Date(b.end);
      return be > dayStart && bs < dayEnd;
    });
    for (const b of blocks) {
      const project = state.projects.find(p => p.id === b.projectId);
      if (!project) continue;
      const bs = new Date(b.start), be = new Date(b.end);
      const top = Math.max(0, ((bs - dayStart) / 3600000) * HOUR_H);
      const bottom = Math.min(colHeight, ((be - dayStart) / 3600000) * HOUR_H);
      const el = document.createElement('div');
      el.className = 'block';
      el.style.top = top + 'px';
      el.style.height = Math.max(SLOT_H - 2, bottom - top) + 'px';
      el.style.background = project.color;
      const mins = Math.round((be - bs) / 60000);
      const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ' ' + (mins % 60) + 'm' : ''}` : `${mins}m`;
      el.innerHTML = `<button class="block-delete" title="Delete block">×</button><div class="b-title"></div><div class="b-note"></div>`;
      el.querySelector('.b-title').textContent = `${project.name} · ${dur}`;
      el.querySelector('.b-note').textContent = b.note || '';
      el.addEventListener('click', (e) => { e.stopPropagation(); openBlockDialog(b); });
      el.querySelector('.block-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.deleteBlock(b.id);
        await refresh();
      });
      el.addEventListener('mousedown', (e) => e.stopPropagation());
      col.appendChild(el);
    }
  }

  root.innerHTML = '';
  root.appendChild(inner);
}

function attachDragHandlers(col, day) {
  let dragging = null;
  col.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!state.activeProjectId) { alert('Select or create a project first'); return; }
    const rect = col.getBoundingClientRect();
    const startY = e.clientY - rect.top;
    const ghost = document.createElement('div');
    ghost.className = 'block ghost';
    const proj = state.projects.find(p => p.id === state.activeProjectId);
    ghost.style.background = proj?.color || '#666';
    col.appendChild(ghost);
    dragging = { col, day, startY, ghost, originY: startY };
    placeGhost(dragging, startY);
    e.preventDefault();
  });
  col.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = col.getBoundingClientRect();
    placeGhost(dragging, e.clientY - rect.top);
  });
  window.addEventListener('mouseup', async (e) => {
    if (!dragging) return;
    const d = dragging; dragging = null;
    const rect = d.col.getBoundingClientRect();
    const endY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const { start, end } = yToTimes(d.day, d.originY, endY);
    d.ghost.remove();
    if (end - start < 60000 * SLOT_MIN) return;
    await api.addBlock({ projectId: state.activeProjectId, start: start.toISOString(), end: end.toISOString() });
    await refresh();
  });
}

function placeGhost(d, currentY) {
  const rect = d.col.getBoundingClientRect();
  const clamped = Math.max(0, Math.min(rect.height, currentY));
  const { start, end } = yToTimes(d.day, d.originY, clamped);
  const startY = ((start - dayStartOf(d.day)) / 3600000) * HOUR_H;
  const endY = ((end - dayStartOf(d.day)) / 3600000) * HOUR_H;
  d.ghost.style.top = startY + 'px';
  d.ghost.style.height = Math.max(SLOT_H, endY - startY) + 'px';
  const mins = Math.round((end - start) / 60000);
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ' ' + (mins % 60) + 'm' : ''}` : `${mins}m`;
  d.ghost.innerHTML = `<div class="b-title">New · ${dur}</div>`;
}

function dayStartOf(d) { const x = new Date(d); x.setHours(DAY_START, 0, 0, 0); return x; }
function yToTimes(day, y1, y2) {
  const ys = Math.min(y1, y2);
  const ye = Math.max(y1, y2);
  const startMin = Math.round((ys / HOUR_H) * 60 / SLOT_MIN) * SLOT_MIN;
  const endMin = Math.round((ye / HOUR_H) * 60 / SLOT_MIN) * SLOT_MIN;
  const start = dayStartOf(day); start.setMinutes(start.getMinutes() + startMin);
  const end = dayStartOf(day); end.setMinutes(end.getMinutes() + Math.max(endMin, startMin + SLOT_MIN));
  return { start, end };
}

const blockDialog = document.getElementById('blockDialog');
let editingBlockId = null;
function openBlockDialog(b) {
  editingBlockId = b.id;
  const sel = document.getElementById('dlgProject');
  sel.innerHTML = '';
  for (const p of state.projects) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if (p.id === b.projectId) opt.selected = true;
    sel.appendChild(opt);
  }
  document.getElementById('dlgNote').value = b.note || '';
  document.getElementById('dlgStart').value = toLocalISO(new Date(b.start));
  document.getElementById('dlgEnd').value = toLocalISO(new Date(b.end));
  blockDialog.showModal();
}
blockDialog.addEventListener('close', async () => {
  const v = blockDialog.returnValue;
  if (!editingBlockId) return;
  const id = editingBlockId; editingBlockId = null;
  if (v === 'delete') { await api.deleteBlock(id); await refresh(); return; }
  if (v === 'save') {
    const start = parseLocalISO(document.getElementById('dlgStart').value).toISOString();
    const end = parseLocalISO(document.getElementById('dlgEnd').value).toISOString();
    await api.updateBlock(id, {
      projectId: document.getElementById('dlgProject').value,
      note: document.getElementById('dlgNote').value,
      start, end
    });
    await refresh();
  }
});

const projectDialog = document.getElementById('projectDialog');
let editingProjectId = null;
function openProjectDialog(p) {
  editingProjectId = p?.id ?? null;
  document.getElementById('pdlgTitle').textContent = p ? 'Edit project' : 'New project';
  document.getElementById('pdlgName').value = p?.name ?? '';
  document.getElementById('pdlgColor').value = p?.color ?? '#6aa9ff';
  document.getElementById('pdlgDelete').hidden = !p;
  const kind = p?.kind || 'personal';
  for (const r of projectDialog.querySelectorAll('input[name=pdlgKind]')) r.checked = (r.value === kind);
  document.getElementById('pdlgClient').value = p?.client ?? '';
  const status = p ? projectStatus(p) : 'active';
  for (const r of projectDialog.querySelectorAll('input[name=pdlgStatus]')) r.checked = (r.value === status);
  updateClientVisibility();
  projectDialog.showModal();
}

function updateClientVisibility() {
  const kind = projectDialog.querySelector('input[name=pdlgKind]:checked')?.value || 'personal';
  document.getElementById('pdlgClientWrap').hidden = kind !== 'client';
}
projectDialog.querySelectorAll('input[name=pdlgKind]').forEach(r => r.addEventListener('change', updateClientVisibility));
projectDialog.addEventListener('close', async () => {
  const v = projectDialog.returnValue;
  const id = editingProjectId; editingProjectId = null;
  if (v === 'delete' && id) {
    if (confirm('Delete this project and all its time blocks?')) {
      await api.deleteProject(id); await refresh();
    }
    return;
  }
  if (v === 'save') {
    const name = document.getElementById('pdlgName').value.trim();
    const color = document.getElementById('pdlgColor').value;
    const kind = projectDialog.querySelector('input[name=pdlgKind]:checked')?.value || 'personal';
    const client = kind === 'client' ? document.getElementById('pdlgClient').value.trim() : '';
    const status = projectDialog.querySelector('input[name=pdlgStatus]:checked')?.value || 'active';
    if (!name) return;
    const payload = { name, color, kind, client, status };
    if (id) await api.updateProject(id, payload);
    else {
      const p = await api.addProject(payload);
      setActiveProject(p.id);
    }
    await refresh();
  }
});

const ticketDialog = document.getElementById('ticketDialog');
let editingTicketId = null;
function openTicketDialog(t) {
  editingTicketId = t.id;
  const project = state.projects.find(p => p.id === t.projectId);
  const badgeEl = document.getElementById('tdlgBadge');
  badgeEl.textContent = ticketBadge(t, project);
  badgeEl.style.setProperty('--ticket-color', project?.color || '#6aa9ff');
  document.getElementById('tdlgTitle').value = t.title;
  document.getElementById('tdlgDesc').value = t.description || '';
  document.getElementById('tdlgDone').checked = !!t.done;
  ticketDialog.showModal();
}
ticketDialog.addEventListener('close', async () => {
  const v = ticketDialog.returnValue;
  const id = editingTicketId; editingTicketId = null;
  if (!id) return;
  if (v === 'delete') {
    if (confirm('Delete this ticket?')) { await api.deleteTicket(id); await refresh(); }
    return;
  }
  if (v === 'save') {
    const title = document.getElementById('tdlgTitle').value.trim();
    if (!title) return;
    await api.updateTicket(id, {
      title,
      description: document.getElementById('tdlgDesc').value,
      done: document.getElementById('tdlgDone').checked
    });
    await refresh();
  }
});

document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newTicketTitle');
  const title = input.value.trim();
  if (!title) return;
  if (!state.activeProjectId) { alert('Select or create a project first'); return; }
  input.value = '';
  await api.addTicket({ projectId: state.activeProjectId, title });
  await refresh();
});

document.getElementById('showDone').addEventListener('change', (e) => {
  state.showDoneTickets = e.target.checked;
  saveUiPrefs({ showDoneTickets: state.showDoneTickets });
  renderTickets();
});

const quickDialog = document.getElementById('quickDialog');
function openQuick() {
  if (!state.projects.length) { openProjectDialog(null); return; }
  const sel = document.getElementById('qcProject');
  sel.innerHTML = '';
  for (const p of state.projects) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if (p.id === state.activeProjectId) opt.selected = true;
    sel.appendChild(opt);
  }
  document.getElementById('qcNote').value = '';
  quickDialog.showModal();
}
quickDialog.addEventListener('close', async () => {
  if (quickDialog.returnValue !== 'log') return;
  const projectId = document.getElementById('qcProject').value;
  const duration = parseInt(document.getElementById('qcDuration').value, 10);
  const endingRaw = document.getElementById('qcEnding').value;
  const note = document.getElementById('qcNote').value;
  const end = endingRaw === 'now' ? snap(new Date()) : snap(new Date(Date.now() - parseInt(endingRaw, 10) * 60000));
  const start = new Date(end.getTime() - duration * 60000);
  await api.addBlock({ projectId, start: start.toISOString(), end: end.toISOString(), note });
  await refresh();
});

document.getElementById('archivedToggle').addEventListener('click', () => {
  const list = document.getElementById('archivedProjectList');
  const btn = document.getElementById('archivedToggle');
  const collapsed = list.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.querySelector('.caret').textContent = collapsed ? '▸' : '▾';
});

document.getElementById('addProject').addEventListener('click', () => openProjectDialog(null));
document.getElementById('quickCapture').addEventListener('click', openQuick);
document.getElementById('prevWeek').addEventListener('click', () => { setWeekStart(addDays(state.weekStart, -7)); renderGrid(); renderTopbar(); });
document.getElementById('nextWeek').addEventListener('click', () => { setWeekStart(addDays(state.weekStart, 7)); renderGrid(); renderTopbar(); });
document.getElementById('todayBtn').addEventListener('click', () => { setWeekStart(weekStartOf(new Date())); renderGrid(); renderTopbar(); });

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'n') { e.preventDefault(); openProjectDialog(null); }
  else if (e.key === 'q') { e.preventDefault(); openQuick(); }
  else if (e.key === 'T') { e.preventDefault(); document.getElementById('newTicketTitle').focus(); }
  else if (e.key === 'p') { e.preventDefault(); pomoTogglePlay(); }
  else if (e.key === '[') { setWeekStart(addDays(state.weekStart, -7)); renderGrid(); renderTopbar(); }
  else if (e.key === ']') { setWeekStart(addDays(state.weekStart, 7)); renderGrid(); renderTopbar(); }
  else if (e.key === 't') { setWeekStart(weekStartOf(new Date())); renderGrid(); renderTopbar(); }
});

const POMO_DEFAULTS = {
  work: 25, rest: 5, longRest: 15, longEvery: 4,
  autoStart: false, sound: true, logBlocks: false
};
function loadPomoSettings() {
  try {
    const raw = localStorage.getItem('pomo.settings');
    if (!raw) return { ...POMO_DEFAULTS };
    return { ...POMO_DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...POMO_DEFAULTS }; }
}
function savePomoSettings(s) { localStorage.setItem('pomo.settings', JSON.stringify(s)); }

const pomo = {
  settings: loadPomoSettings(),
  phase: 'work',
  remaining: 0,
  running: false,
  cycles: 0,
  intervalId: null,
  phaseStartedAt: null
};
pomo.remaining = pomo.settings.work * 60;

function pomoPhaseDuration(phase) {
  if (phase === 'work') return pomo.settings.work * 60;
  if (phase === 'long-rest') return pomo.settings.longRest * 60;
  return pomo.settings.rest * 60;
}

function pomoBeep() {
  if (!pomo.settings.sound) return;
  try {
    const Ctx = window.AudioContext || window['webkitAudioContext'];
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

function pomoPhaseLabel(phase) {
  if (phase === 'long-rest') return 'Long rest';
  if (phase === 'work') return 'Work';
  return 'Rest';
}

function renderPomo() {
  const root = document.getElementById('pomodoro');
  const mm = String(Math.floor(pomo.remaining / 60)).padStart(2, '0');
  const ss = String(pomo.remaining % 60).padStart(2, '0');
  document.getElementById('pomoTime').textContent = `${mm}:${ss}`;
  const phaseEl = document.getElementById('pomoPhase');
  phaseEl.className = 'pomo-phase ' + pomo.phase;
  phaseEl.textContent = pomoPhaseLabel(pomo.phase);
  document.getElementById('pomoPlay').textContent = pomo.running ? '⏸' : '▶';
  document.getElementById('pomoCycles').textContent = String(pomo.cycles);
  root.classList.toggle('running', pomo.running);
  root.classList.toggle('rest-phase', pomo.phase !== 'work');
  document.title = pomo.running ? `${mm}:${ss} · ${pomoPhaseLabel(pomo.phase)}` : 'project-tracker';
}

async function pomoComplete() {
  pomoBeep();
  pomoStop();
  if (pomo.phase === 'work') {
    pomo.cycles += 1;
    if (pomo.settings.logBlocks && state.activeProjectId && pomo.phaseStartedAt) {
      const end = new Date();
      const start = new Date(pomo.phaseStartedAt);
      await api.addBlock({
        projectId: state.activeProjectId,
        start: start.toISOString(),
        end: end.toISOString(),
        note: 'Pomodoro'
      });
      await refresh();
    }
    const nextIsLong = pomo.cycles > 0 && pomo.cycles % pomo.settings.longEvery === 0;
    pomo.phase = nextIsLong ? 'long-rest' : 'rest';
  } else {
    pomo.phase = 'work';
  }
  pomo.remaining = pomoPhaseDuration(pomo.phase);
  renderPomo();
  if (pomo.settings.autoStart) {
    setTimeout(() => { pomoBeep(); pomoStart(); }, 700);
  }
}

function pomoStart() {
  if (pomo.running) return;
  pomo.running = true;
  pomo.phaseStartedAt = pomo.phaseStartedAt || new Date().toISOString();
  pomo.intervalId = setInterval(() => {
    pomo.remaining -= 1;
    if (pomo.remaining <= 0) { pomoComplete(); return; }
    renderPomo();
  }, 1000);
  renderPomo();
}
function pomoStop() {
  pomo.running = false;
  if (pomo.intervalId) { clearInterval(pomo.intervalId); pomo.intervalId = null; }
  renderPomo();
}
function pomoReset() {
  pomoStop();
  pomo.phase = 'work';
  pomo.cycles = 0;
  pomo.phaseStartedAt = null;
  pomo.remaining = pomoPhaseDuration('work');
  renderPomo();
}
function pomoTogglePlay() {
  if (pomo.running) pomoStop();
  else {
    if (pomo.remaining <= 0) pomo.remaining = pomoPhaseDuration(pomo.phase);
    if (!pomo.intervalId) pomo.phaseStartedAt = new Date().toISOString();
    pomoBeep();
    pomoStart();
  }
}

document.getElementById('pomoPlay').addEventListener('click', pomoTogglePlay);
document.getElementById('pomoReset').addEventListener('click', pomoReset);
document.getElementById('pomoSettings').addEventListener('click', () => {
  document.getElementById('pomoWork').value = pomo.settings.work;
  document.getElementById('pomoRest').value = pomo.settings.rest;
  document.getElementById('pomoLongRest').value = pomo.settings.longRest;
  document.getElementById('pomoLongEvery').value = pomo.settings.longEvery;
  document.getElementById('pomoAutoStart').checked = pomo.settings.autoStart;
  document.getElementById('pomoSound').checked = pomo.settings.sound;
  document.getElementById('pomoLogBlocks').checked = pomo.settings.logBlocks;
  document.getElementById('pomoDialog').showModal();
});
document.getElementById('pomoDialog').addEventListener('close', () => {
  if (document.getElementById('pomoDialog').returnValue !== 'save') return;
  const clamp = (v, lo, hi, def) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  };
  pomo.settings = {
    work: clamp(document.getElementById('pomoWork').value, 1, 180, 25),
    rest: clamp(document.getElementById('pomoRest').value, 1, 60, 5),
    longRest: clamp(document.getElementById('pomoLongRest').value, 1, 120, 15),
    longEvery: clamp(document.getElementById('pomoLongEvery').value, 2, 12, 4),
    autoStart: document.getElementById('pomoAutoStart').checked,
    sound: document.getElementById('pomoSound').checked,
    logBlocks: document.getElementById('pomoLogBlocks').checked
  };
  savePomoSettings(pomo.settings);
  if (!pomo.running) {
    pomo.remaining = pomoPhaseDuration(pomo.phase);
  }
  renderPomo();
});

renderPomo();

setInterval(() => {
  const todayCol = document.querySelector('.day-col.today');
  if (!todayCol) return;
  const now = new Date();
  const minsSince = (now.getHours() - DAY_START) * 60 + now.getMinutes();
  const y = (minsSince / 60) * HOUR_H;
  let nl = todayCol.querySelector('.now-line');
  if (!nl) {
    nl = document.createElement('div');
    nl.className = 'now-line';
    todayCol.appendChild(nl);
  }
  nl.style.top = y + 'px';
}, 60000);

refresh();
