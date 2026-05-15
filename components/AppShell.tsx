'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Project, ProjectStatus, Ticket, TimeBlock } from '@/lib/types';
import { api } from '@/lib/api';
import { addDays, snap, weekStartOf } from '@/lib/time';
import Sidebar from './Sidebar';
import TicketsPanel from './TicketsPanel';
import TopBar from './TopBar';
import WeekGrid from './WeekGrid';
import {
  BlockDialog,
  ConfirmDialog,
  ProjectDialog,
  QuickLogDialog,
  TicketDialog
} from './Dialogs';

const UI_PREFS_KEY = 'ui.prefs';

interface UiPrefs {
  activeProjectId?: string | null;
  weekStartISO?: string | null;
  showDoneTickets?: boolean;
  sidebarCollapsed?: boolean;
  ticketsCollapsed?: boolean;
}

function loadUiPrefs(): UiPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    return raw ? (JSON.parse(raw) as UiPrefs) : {};
  } catch {
    return {};
  }
}

function saveUiPrefs(patch: UiPrefs) {
  if (typeof window === 'undefined') return;
  const next = { ...loadUiPrefs(), ...patch };
  window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(next));
}

export default function AppShell() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [weekStart, setWeekStartState] = useState<Date | null>(null);
  const [showDoneTickets, setShowDoneTicketsState] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState(false);
  const [pomoActiveBlockSink, setPomoActiveBlockSink] = useState(0);

  const [blockEditing, setBlockEditing] = useState<TimeBlock | null>(null);
  const [projectEditing, setProjectEditing] = useState<Project | null | undefined>(undefined); // undefined=closed, null=new
  const [ticketEditing, setTicketEditing] = useState<Ticket | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [ticketsCollapsed, setTicketsCollapsedState] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'sidebar' | 'tickets'>('none');

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectIdState(id);
    saveUiPrefs({ activeProjectId: id });
  }, []);

  const setWeekStart = useCallback((d: Date) => {
    setWeekStartState(d);
    saveUiPrefs({ weekStartISO: d.toISOString() });
  }, []);

  const setShowDoneTickets = useCallback((v: boolean) => {
    setShowDoneTicketsState(v);
    saveUiPrefs({ showDoneTickets: v });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((v) => {
      saveUiPrefs({ sidebarCollapsed: !v });
      return !v;
    });
  }, []);

  const toggleTickets = useCallback(() => {
    setTicketsCollapsedState((v) => {
      saveUiPrefs({ ticketsCollapsed: !v });
      return !v;
    });
  }, []);

  const applyState = useCallback((s: AppState) => {
    setProjects(s.projects);
    setTickets(s.tickets);
    setBlocks(s.blocks);
    setActiveProjectIdState((prev) => {
      if (prev && s.projects.find((p) => p.id === prev)) return prev;
      return s.projects[0]?.id ?? null;
    });
  }, []);

  const refresh = useCallback(async () => {
    const s = await api.state();
    applyState(s);
  }, [applyState]);

  // Initial mount: hydrate from localStorage then fetch
  useEffect(() => {
    const prefs = loadUiPrefs();
    if (prefs.activeProjectId !== undefined) setActiveProjectIdState(prefs.activeProjectId);
    setWeekStartState(prefs.weekStartISO ? new Date(prefs.weekStartISO) : weekStartOf(new Date()));
    setShowDoneTicketsState(prefs.showDoneTickets ?? true);
    setSidebarCollapsedState(prefs.sidebarCollapsed ?? false);
    setTicketsCollapsedState(prefs.ticketsCollapsed ?? false);
    setHydrated(true);
    refresh().catch(() => {});
  }, [refresh]);

  // Persist active project once we know one
  useEffect(() => {
    if (!hydrated) return;
    saveUiPrefs({ activeProjectId });
  }, [activeProjectId, hydrated]);

  // Mobile detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileDrawer('none');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.matches('input, textarea, select')) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'n') {
        e.preventDefault();
        setProjectEditing(null);
      } else if (e.key === 'q') {
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.key === 'T') {
        e.preventDefault();
        const el = document.getElementById('newTicketTitle') as HTMLInputElement | null;
        el?.focus();
      } else if (e.key === '[') {
        if (weekStart) setWeekStart(addDays(weekStart, -7));
      } else if (e.key === ']') {
        if (weekStart) setWeekStart(addDays(weekStart, 7));
      } else if (e.key === 't') {
        setWeekStart(weekStartOf(new Date()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [weekStart, setWeekStart]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  // Pomodoro log-block sink: called by TopBar when a work phase completes
  const onPomoWorkBlock = useCallback(
    async (start: Date, end: Date) => {
      if (!activeProjectId) return;
      const tempId = 'tmp-' + Math.random().toString(36).slice(2);
      const optimistic: TimeBlock = {
        id: tempId,
        projectId: activeProjectId,
        start: start.toISOString(),
        end: end.toISOString(),
        note: 'Pomodoro',
        createdAt: new Date().toISOString()
      };
      setBlocks((bs) => [...bs, optimistic]);
      setPomoActiveBlockSink((n) => n + 1);
      try {
        const created = await api.addBlock({
          projectId: activeProjectId,
          start: start.toISOString(),
          end: end.toISOString(),
          note: 'Pomodoro'
        });
        setBlocks((bs) => bs.map((b) => (b.id === tempId ? created : b)));
      } catch {
        setBlocks((bs) => bs.filter((b) => b.id !== tempId));
        await refresh();
      }
    },
    [activeProjectId, refresh]
  );

  // Block actions
  const addBlock = useCallback(
    async (projectId: string, start: Date, end: Date) => {
      const tempId = 'tmp-' + Math.random().toString(36).slice(2);
      const optimistic: TimeBlock = {
        id: tempId,
        projectId,
        start: start.toISOString(),
        end: end.toISOString(),
        note: '',
        createdAt: new Date().toISOString()
      };
      setBlocks((bs) => [...bs, optimistic]);
      try {
        const created = await api.addBlock({
          projectId,
          start: start.toISOString(),
          end: end.toISOString()
        });
        setBlocks((bs) => bs.map((b) => (b.id === tempId ? created : b)));
      } catch {
        setBlocks((bs) => bs.filter((b) => b.id !== tempId));
        await refresh();
      }
    },
    [refresh]
  );

  const updateBlock = useCallback(
    async (id: string, patch: Partial<TimeBlock>) => {
      setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      try {
        await api.updateBlock(id, patch);
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  const deleteBlock = useCallback(
    async (id: string) => {
      setBlocks((bs) => bs.filter((b) => b.id !== id));
      try {
        await api.deleteBlock(id);
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  // Ticket actions
  const addTicket = useCallback(
    async (projectId: string, title: string) => {
      const tempId = 'tmp-' + Math.random().toString(36).slice(2);
      const optimistic: Ticket = {
        id: tempId,
        projectId,
        number: 0,
        title,
        description: '',
        done: false,
        doneAt: null,
        order: 999999,
        createdAt: new Date().toISOString()
      };
      setTickets((ts) => [...ts, optimistic]);
      try {
        const created = await api.addTicket({ projectId, title });
        setTickets((ts) => ts.map((t) => (t.id === tempId ? created : t)));
      } catch {
        setTickets((ts) => ts.filter((t) => t.id !== tempId));
        await refresh();
      }
    },
    [refresh]
  );

  const updateTicket = useCallback(
    async (id: string, patch: Partial<Ticket>) => {
      setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      try {
        await api.updateTicket(id, patch);
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  const deleteTicket = useCallback(
    async (id: string) => {
      setTickets((ts) => ts.filter((t) => t.id !== id));
      try {
        await api.deleteTicket(id);
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  // Project actions
  const upsertProject = useCallback(
    async (existingId: string | null, payload: { name: string; color: string; kind: 'personal' | 'client'; client: string; status: ProjectStatus }) => {
      if (existingId) {
        setProjects((ps) => ps.map((p) => (p.id === existingId ? { ...p, ...payload } : p)));
        try {
          await api.updateProject(existingId, payload);
        } catch {
          await refresh();
        }
      } else {
        const tempId = 'tmp-' + Math.random().toString(36).slice(2);
        const optimistic: Project = {
          id: tempId,
          name: payload.name,
          color: payload.color,
          kind: payload.kind,
          client: payload.client,
          status: payload.status,
          archived: false,
          createdAt: new Date().toISOString()
        };
        setProjects((ps) => [...ps, optimistic]);
        setActiveProjectId(tempId);
        try {
          const created = await api.addProject(payload);
          setProjects((ps) => ps.map((p) => (p.id === tempId ? created : p)));
          setActiveProjectId(created.id);
        } catch {
          setProjects((ps) => ps.filter((p) => p.id !== tempId));
          await refresh();
        }
      }
    },
    [refresh, setActiveProjectId]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      setProjects((ps) => ps.filter((p) => p.id !== id));
      setTickets((ts) => ts.filter((t) => t.projectId !== id));
      setBlocks((bs) => bs.filter((b) => b.projectId !== id));
      try {
        await api.deleteProject(id);
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  // Quick log
  const quickLog = useCallback(
    async (projectId: string, durationMin: number, endingMinAgo: number | 'now', note: string) => {
      const end = endingMinAgo === 'now' ? snap(new Date()) : snap(new Date(Date.now() - endingMinAgo * 60000));
      const start = new Date(end.getTime() - durationMin * 60000);
      const tempId = 'tmp-' + Math.random().toString(36).slice(2);
      const optimistic: TimeBlock = {
        id: tempId,
        projectId,
        start: start.toISOString(),
        end: end.toISOString(),
        note,
        createdAt: new Date().toISOString()
      };
      setBlocks((bs) => [...bs, optimistic]);
      try {
        const created = await api.addBlock({
          projectId,
          start: start.toISOString(),
          end: end.toISOString(),
          note
        });
        setBlocks((bs) => bs.map((b) => (b.id === tempId ? created : b)));
      } catch {
        setBlocks((bs) => bs.filter((b) => b.id !== tempId));
        await refresh();
      }
    },
    [refresh]
  );

  if (!hydrated || !weekStart) {
    return <div className="app-shell" />;
  }

  const shellClass = [
    'app-shell',
    mobileDrawer === 'sidebar' ? 'mobile-sidebar-open' : '',
    mobileDrawer === 'tickets' ? 'mobile-tickets-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={shellClass}
      data-sidebar-collapsed={sidebarCollapsed ? '' : undefined}
      data-tickets-collapsed={ticketsCollapsed ? '' : undefined}
    >
      <Sidebar
        projects={projects}
        blocks={blocks}
        activeProjectId={activeProjectId}
        collapsed={isMobile ? false : sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onSelectProject={(id) => { setActiveProjectId(id); if (isMobile) setMobileDrawer('none'); }}
        onEditProject={(p) => { setProjectEditing(p); if (isMobile) setMobileDrawer('none'); }}
        onDeleteProject={(p) => setConfirmDelete(p)}
        onNewProject={() => { setProjectEditing(null); if (isMobile) setMobileDrawer('none'); }}
        onQuickLog={() => { setQuickOpen(true); if (isMobile) setMobileDrawer('none'); }}
      />
      <TicketsPanel
        tickets={tickets}
        activeProject={activeProject}
        showDone={showDoneTickets}
        collapsed={isMobile ? false : ticketsCollapsed}
        onToggleCollapsed={toggleTickets}
        onToggleShowDone={setShowDoneTickets}
        onAddTicket={(title) => {
          if (!activeProjectId) {
            alert('Select or create a project first');
            return;
          }
          return addTicket(activeProjectId, title);
        }}
        onOpenTicket={(t) => { setTicketEditing(t); if (isMobile) setMobileDrawer('none'); }}
        onUpdateTicket={updateTicket}
      />
      <main id="main">
        <TopBar
          weekStart={weekStart}
          onPrev={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          onToday={() => setWeekStart(weekStartOf(new Date()))}
          activeProject={activeProject}
          onWorkBlockLogged={onPomoWorkBlock}
          hasActiveProject={!!activeProjectId}
        />
        <WeekGrid
          weekStart={weekStart}
          projects={projects}
          blocks={blocks}
          activeProjectId={activeProjectId}
          onCreateBlock={(start, end) => {
            if (!activeProjectId) {
              alert('Select or create a project first');
              return;
            }
            return addBlock(activeProjectId, start, end);
          }}
          onOpenBlock={(b) => setBlockEditing(b)}
          onDeleteBlock={deleteBlock}
          onMoveBlock={(id, start, end) => updateBlock(id, { start, end })}
        />
      </main>

      <BlockDialog
        block={blockEditing}
        projects={projects}
        onClose={() => setBlockEditing(null)}
        onSave={updateBlock}
        onDelete={deleteBlock}
      />

      <ProjectDialog
        // undefined => closed; null => new; Project => editing
        target={projectEditing}
        onClose={() => setProjectEditing(undefined)}
        onSave={upsertProject}
        onDelete={async (id) => {
          if (confirm('Delete this project and all its time blocks?')) {
            await deleteProject(id);
          }
        }}
      />

      <TicketDialog
        ticket={ticketEditing}
        project={ticketEditing ? projects.find((p) => p.id === ticketEditing.projectId) ?? null : null}
        onClose={() => setTicketEditing(null)}
        onSave={updateTicket}
        onDelete={async (id) => {
          if (confirm('Delete this ticket?')) await deleteTicket(id);
        }}
      />

      <QuickLogDialog
        open={quickOpen}
        projects={projects}
        defaultProjectId={activeProjectId}
        onClose={() => setQuickOpen(false)}
        onLog={quickLog}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete project?"
        message={confirmDelete ? `"${confirmDelete.name}" and all its time blocks will be permanently deleted.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target) void deleteProject(target.id);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Mobile: backdrop closes drawers on tap */}
      <div className="mobile-backdrop" onClick={() => setMobileDrawer('none')} />

      {/* Mobile: bottom navigation bar */}
      <nav className="mobile-nav">
        <button
          className={mobileDrawer === 'sidebar' ? 'active' : ''}
          onClick={() => setMobileDrawer(mobileDrawer === 'sidebar' ? 'none' : 'sidebar')}
        >
          <span className="nav-icon">◫</span>
          Projects
        </button>
        <button
          className={mobileDrawer === 'none' ? 'active' : ''}
          onClick={() => setMobileDrawer('none')}
        >
          <span className="nav-icon">⊞</span>
          Calendar
        </button>
        <button
          className={mobileDrawer === 'tickets' ? 'active' : ''}
          onClick={() => setMobileDrawer(mobileDrawer === 'tickets' ? 'none' : 'tickets')}
        >
          <span className="nav-icon">☑</span>
          Tickets
        </button>
      </nav>
    </div>
  );
}
