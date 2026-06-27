'use client';

import { useMemo, useState } from 'react';
import type { Project, Ticket } from '@/lib/types';

function projectPrefix(project: Project | null): string {
  if (!project) return 'TKT';
  return (
    (project.name || 'TKT').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X') ||
    'TKT'
  );
}

function ticketBadge(ticket: Ticket, project: Project | null): string {
  return `${projectPrefix(project)}-${ticket.number}`;
}

interface Props {
  tickets: Ticket[];
  projects: Project[];
  activeProject: Project | null;
  showDone: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleShowDone: (v: boolean) => void;
  onAddTicket: (title: string) => Promise<void> | void;
  onOpenTicket: (t: Ticket) => void;
  onUpdateTicket: (id: string, patch: Partial<Ticket>) => Promise<void> | void;
  onDeleteTicket: (id: string) => Promise<void> | void;
}

export default function TicketsPanel({
  tickets,
  projects,
  activeProject,
  showDone,
  collapsed,
  onToggleCollapsed,
  onToggleShowDone,
  onAddTicket,
  onOpenTicket,
  onUpdateTicket,
  onDeleteTicket
}: Props) {
  const [draft, setDraft] = useState('');

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const all = tickets.filter((t) => projectById.has(t.projectId));
  const todo = all.filter((t) => !t.done);
  const done = all.filter((t) => t.done);
  const visible = showDone ? all : todo;
  const sorted = [...visible].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pa = projectById.get(a.projectId)?.name ?? '';
    const pb = projectById.get(b.projectId)?.name ?? '';
    if (pa !== pb) return pa.localeCompare(pb);
    return (a.order || 0) - (b.order || 0);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await onAddTicket(title);
  };

  if (collapsed) {
    return (
      <section id="tickets" className="collapsed">
        <button className="panel-expand-btn" onClick={onToggleCollapsed} data-tip="Expand">
          »
        </button>
      </section>
    );
  }

  const newTicketPlaceholder = activeProject
    ? `+ New ticket for ${activeProject.name}`
    : '+ New ticket — select a project first';

  return (
    <section id="tickets">
      <header className="tickets-head">
        <h1>
          Tickets
          <button className="panel-collapse-btn" onClick={onToggleCollapsed} data-tip="Collapse">
            «
          </button>
        </h1>
        <span id="ticketsProject">
          {all.length > 0 ? `${todo.length} open · ${done.length} done` : 'All projects'}
        </span>
      </header>
      <form id="newTicketForm" onSubmit={handleSubmit}>
        <input
          type="text"
          id="newTicketTitle"
          placeholder={newTicketPlaceholder}
          maxLength={200}
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!activeProject}
        />
      </form>
      <div className="tickets-toggle">
        <label>
          <input
            type="checkbox"
            id="showDone"
            checked={showDone}
            onChange={(e) => onToggleShowDone(e.target.checked)}
          />{' '}
          Show done
        </label>
      </div>
      <ul id="ticketList">
        {visible.length === 0 ? (
          <div className="ticket-empty">
            {all.length === 0
              ? 'No tickets yet — add one above'
              : showDone
                ? 'No tickets'
                : 'All done. Nice.'}
          </div>
        ) : (
          sorted.map((t) => {
            const project = projectById.get(t.projectId) ?? null;
            return (
              <li
                key={t.id}
                className={'ticket' + (t.done ? ' done' : '')}
                style={{ ['--ticket-color' as string]: project?.color ?? 'var(--accent)' }}
                onClick={() => onOpenTicket(t)}
              >
                <button
                  type="button"
                  className="ticket-delete"
                  aria-label="Delete ticket"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDeleteTicket(t.id);
                  }}
                >
                  ×
                </button>
                <input
                  type="checkbox"
                  className="ticket-checkbox"
                  checked={t.done}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onUpdateTicket(t.id, { done: e.target.checked });
                  }}
                />
                <div className="ticket-body">
                  <div className="ticket-meta">
                    <span className="ticket-badge">{ticketBadge(t, project)}</span>
                    {project && <span className="ticket-project">{project.name}</span>}
                  </div>
                  <div className="ticket-title">{t.title}</div>
                  {t.description && <div className="ticket-desc">{t.description}</div>}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

export { ticketBadge, projectPrefix };
