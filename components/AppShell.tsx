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
    setHydrated(true);
    refresh().catch(() => {});
  }, [refresh]);

  // Persist active project once we know one
  useEffect(() => {
    if (!hydrated) return;
    saveUiPrefs({ activeProjectId });
  }, [activeProjectId, hydrated]);

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
      await api.addBlock({
        projectId: activeProjectId,
        start: start.toISOString(),
        end: end.toISOString(),
        note: 'Pomodoro'
      });
      setPomoActiveBlockSink((n) => n + 1);
      await refresh();
    },
    [activeProjectId, refresh]
  );

  // Block actions
  const addBlock = useCallback(
    async (projectId: string, start: Date, end: Date) => {
      await api.addBlock({
        projectId,
        start: start.toISOString(),
        end: end.toISOString()
      });
      await refresh();
    },
    [refresh]
  );

  const updateBlock = useCallback(
    async (id: string, patch: Partial<TimeBlock>) => {
      await api.updateBlock(id, patch);
      await refresh();
    },
    [refresh]
  );

  const deleteBlock = useCallback(
    async (id: string) => {
      await api.deleteBlock(id);
      await refresh();
    },
    [refresh]
  );

  // Ticket actions
  const addTicket = useCallback(
    async (projectId: string, title: string) => {
      await api.addTicket({ projectId, title });
      await refresh();
    },
    [refresh]
  );

  const updateTicket = useCallback(
    async (id: string, patch: Partial<Ticket>) => {
      await api.updateTicket(id, patch);
      await refresh();
    },
    [refresh]
  );

  const deleteTicket = useCallback(
    async (id: string) => {
      await api.deleteTicket(id);
      await refresh();
    },
    [refresh]
  );

  // Project actions
  const upsertProject = useCallback(
    async (existingId: string | null, payload: { name: string; color: string; kind: 'personal' | 'client'; client: string; status: ProjectStatus }) => {
      if (existingId) {
        await api.updateProject(existingId, payload);
      } else {
        const created = await api.addProject(payload);
        setActiveProjectId(created.id);
      }
      await refresh();
    },
    [refresh, setActiveProjectId]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await api.deleteProject(id);
      await refresh();
    },
    [refresh]
  );

  // Quick log
  const quickLog = useCallback(
    async (projectId: string, durationMin: number, endingMinAgo: number | 'now', note: string) => {
      const end = endingMinAgo === 'now' ? snap(new Date()) : snap(new Date(Date.now() - endingMinAgo * 60000));
      const start = new Date(end.getTime() - durationMin * 60000);
      await api.addBlock({
        projectId,
        start: start.toISOString(),
        end: end.toISOString(),
        note
      });
      await refresh();
    },
    [refresh]
  );

  if (!hydrated || !weekStart) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        blocks={blocks}
        activeProjectId={activeProjectId}
        onSelectProject={(id) => setActiveProjectId(id)}
        onEditProject={(p) => setProjectEditing(p)}
        onDeleteProject={(p) => setConfirmDelete(p)}
        onNewProject={() => setProjectEditing(null)}
        onQuickLog={() => setQuickOpen(true)}
      />
      <TicketsPanel
        tickets={tickets}
        activeProject={activeProject}
        showDone={showDoneTickets}
        onToggleShowDone={setShowDoneTickets}
        onAddTicket={(title) => {
          if (!activeProjectId) {
            alert('Select or create a project first');
            return;
          }
          return addTicket(activeProjectId, title);
        }}
        onOpenTicket={(t) => setTicketEditing(t)}
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
        onConfirm={async () => {
          if (confirmDelete) await deleteProject(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
