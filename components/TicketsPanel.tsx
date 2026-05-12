'use client';

import { useState } from 'react';
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
  activeProject: Project | null;
  showDone: boolean;
  onToggleShowDone: (v: boolean) => void;
  onAddTicket: (title: string) => Promise<void> | void;
  onOpenTicket: (t: Ticket) => void;
  onUpdateTicket: (id: string, patch: Partial<Ticket>) => Promise<void> | void;
}

export default function TicketsPanel({
  tickets,
  activeProject,
  showDone,
  onToggleShowDone,
  onAddTicket,
  onOpenTicket,
  onUpdateTicket
}: Props) {
  const [draft, setDraft] = useState('');

  const all = activeProject ? tickets.filter((t) => t.projectId === activeProject.id) : [];
  const todo = all.filter((t) => !t.done);
  const done = all.filter((t) => t.done);
  const visible = showDone ? all : todo;
  const sorted = [...visible].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.order || 0) - (b.order || 0);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await onAddTicket(title);
  };

  return (
    <section id="tickets">
      <header className="tickets-head">
        <h1>Tickets</h1>
        <span id="ticketsProject">{activeProject ? activeProject.name : 'No project'}</span>
      </header>
      <form id="newTicketForm" onSubmit={handleSubmit}>
        <input
          type="text"
          id="newTicketTitle"
          placeholder="+ New ticket (enter)"
          maxLength={200}
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
        <span id="ticketCounts">
          {activeProject ? `${todo.length} open · ${done.length} done` : ''}
        </span>
      </div>
      <ul id="ticketList">
        {!activeProject ? (
          <div className="ticket-empty">Select a project to see tickets</div>
        ) : visible.length === 0 ? (
          <div className="ticket-empty">
            {all.length === 0 ? 'No tickets yet — add one above' : 'All done. Nice.'}
          </div>
        ) : (
          sorted.map((t) => (
            <li
              key={t.id}
              className={'ticket' + (t.done ? ' done' : '')}
              style={{ ['--ticket-color' as string]: activeProject.color }}
              onClick={() => onOpenTicket(t)}
            >
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
                  <span className="ticket-badge">{ticketBadge(t, activeProject)}</span>
                </div>
                <div className="ticket-title">{t.title}</div>
                {t.description && <div className="ticket-desc">{t.description}</div>}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export { ticketBadge, projectPrefix };
