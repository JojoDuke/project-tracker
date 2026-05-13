'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProjectStatus, TimeBlock } from '@/lib/types';
import { daysSince, relTime } from '@/lib/time';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  inactive: 'Inactive',
  done: 'Done'
};

function projectStatus(p: Project): ProjectStatus {
  if (p.status && STATUS_LABEL[p.status]) return p.status;
  return p.archived ? 'done' : 'active';
}

interface Props {
  projects: Project[];
  blocks: TimeBlock[];
  activeProjectId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectProject: (id: string) => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  onNewProject: () => void;
  onQuickLog: () => void;
}

export default function Sidebar({
  projects,
  blocks,
  activeProjectId,
  collapsed,
  onToggleCollapsed,
  onSelectProject,
  onEditProject,
  onDeleteProject,
  onNewProject,
  onQuickLog
}: Props) {
  const [archiveCollapsed, setArchiveCollapsed] = useState(false);

  const lastTouched = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of blocks) {
      const cur = map.get(b.projectId);
      if (!cur || b.end > cur) map.set(b.projectId, b.end);
    }
    return map;
  }, [blocks]);

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      const la = lastTouched.get(a.id) || a.createdAt;
      const lb = lastTouched.get(b.id) || b.createdAt;
      return lb.localeCompare(la);
    });
  }, [projects, lastTouched]);

  const active: Project[] = [];
  const archived: Project[] = [];
  for (const p of sorted) {
    const s = projectStatus(p);
    if (s === 'inactive' || s === 'done') archived.push(p);
    else active.push(p);
  }

  if (collapsed) {
    return (
      <aside id="sidebar" className="collapsed">
        <button className="panel-expand-btn" onClick={onToggleCollapsed} data-tip="Expand">
          »
        </button>
      </aside>
    );
  }

  return (
    <aside id="sidebar">
      <header className="sidebar-head">
        <h1>
          Projects
          <button className="panel-collapse-btn" onClick={onToggleCollapsed} data-tip="Collapse">
            «
          </button>
        </h1>
        <button onClick={onNewProject} title="Add project (n)">
          +
        </button>
      </header>
      <ul id="projectList">
        {active.map((p) => (
          <ProjectItem
            key={p.id}
            project={p}
            isActive={p.id === activeProjectId}
            lastTouched={lastTouched.get(p.id) ?? null}
            onSelect={() => onSelectProject(p.id)}
            onEdit={() => onEditProject(p)}
            onDelete={() => onDeleteProject(p)}
          />
        ))}
      </ul>
      {archived.length > 0 && (
        <div id="archivedSection" className="archived-section">
          <button
            id="archivedToggle"
            className="archived-toggle"
            type="button"
            aria-expanded={!archiveCollapsed}
            onClick={() => setArchiveCollapsed((v) => !v)}
          >
            <span className="caret">{archiveCollapsed ? '▸' : '▾'}</span>{' '}
            <span className="archived-label">Archive</span>{' '}
            <span id="archivedCount" className="archived-count">
              {archived.length}
            </span>
          </button>
          <ul id="archivedProjectList" className={archiveCollapsed ? 'collapsed' : ''}>
            {archived.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                isActive={p.id === activeProjectId}
                lastTouched={lastTouched.get(p.id) ?? null}
                onSelect={() => onSelectProject(p.id)}
                onEdit={() => onEditProject(p)}
                onDelete={() => onDeleteProject(p)}
              />
            ))}
          </ul>
        </div>
      )}
      <footer className="sidebar-foot">
        <button onClick={onQuickLog} title="Quick capture (q)">
          + Log time
        </button>
        <p className="hint">
          Drag on grid to block · click block to edit · hover block + × to delete · n: new project · T: new ticket · q: quick log · p: pomodoro · [ ]: week nav · t: today
        </p>
      </footer>
    </aside>
  );
}

interface ItemProps {
  project: Project;
  isActive: boolean;
  lastTouched: string | null;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProjectItem({ project: p, isActive, lastTouched, onSelect, onEdit, onDelete }: ItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const status = projectStatus(p);
  const isArchived = status === 'inactive' || status === 'done';
  const days = daysSince(lastTouched);
  const stale = !isArchived && !!lastTouched && days >= 3;
  const kind = p.kind || 'personal';
  const kindLabel = kind === 'client' ? (p.client ? p.client : 'Client') : 'Personal';
  const cls = [
    'project-item',
    'status-' + status,
    isActive ? 'active' : '',
    isArchived ? 'dimmed' : '',
    menuOpen ? 'menu-open' : ''
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <li
      className={cls}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.edit-menu')) return;
        onSelect();
      }}
    >
      <span className="swatch" style={{ background: p.color }} />
      <span className="meta">
        <span className="name">{p.name}</span>
        <span className="tags">
          <span className={`kind-pill ${kind}`}>{kindLabel}</span>
          {status !== 'active' && <span className={`status-pill ${status}`}>{STATUS_LABEL[status]}</span>}
        </span>
        <span className={`last ${stale ? 'stale' : ''}`}>
          {stale ? '⚠ ' : ''}
          {relTime(lastTouched)}
        </span>
      </span>
      <div className="edit-menu" ref={menuRef}>
        <button
          className="edit"
          title="Project options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="edit-dropdown">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onEdit();
              }}
            >
              Edit
            </button>
            <button
              className="danger"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
