'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProjectKind, ProjectStatus, Ticket, TimeBlock } from '@/lib/types';
import { toLocalISO, parseLocalISO } from '@/lib/time';
import { projectPrefix } from './TicketsPanel';
import type { PomoSettings } from './TopBar';

// =======================================================================
// useNativeDialog: small helper to drive a <dialog> element imperatively.
// =======================================================================
function useNativeDialog(
  open: boolean,
  onClose?: () => void
): React.RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d || !onClose) return;
    const handler = (e: MouseEvent) => {
      if (e.target === d) onClose();
    };
    d.addEventListener('click', handler);
    return () => d.removeEventListener('click', handler);
  }, [onClose]);
  return ref;
}

// =======================================================================
// BlockDialog
// =======================================================================
interface BlockDialogProps {
  block: TimeBlock | null;
  projects: Project[];
  onClose: () => void;
  onSave: (id: string, patch: Partial<TimeBlock>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

export function BlockDialog({ block, projects, onClose, onSave, onDelete }: BlockDialogProps) {
  const open = !!block;
  const ref = useNativeDialog(open, onClose);
  const [projectId, setProjectId] = useState('');
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (!block) return;
    setProjectId(block.projectId);
    setNote(block.note || '');
    setStart(toLocalISO(new Date(block.start)));
    setEnd(toLocalISO(new Date(block.end)));
  }, [block]);

  return (
    <dialog
      ref={ref}
      onClose={() => onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
          if (!block) {
            onClose();
            return;
          }
          if (action === 'delete') {
            await onDelete(block.id);
          } else if (action === 'save') {
            await onSave(block.id, {
              projectId,
              note,
              start: parseLocalISO(start).toISOString(),
              end: parseLocalISO(end).toISOString()
            });
          }
          onClose();
        }}
      >
        <h2>Edit block</h2>
        <label>
          Project
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note
          <textarea
            rows={3}
            maxLength={500}
            placeholder="What did you do?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label>
          Start
          <input
            type="datetime-local"
            step={900}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          End
          <input
            type="datetime-local"
            step={900}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <menu>
          <button value="delete" type="submit" className="danger" formNoValidate>
            Delete
          </button>
          <span className="spacer" />
          <button value="cancel" type="submit" formNoValidate>
            Cancel
          </button>
          <button value="save" type="submit" className="primary">
            Save
          </button>
        </menu>
      </form>
    </dialog>
  );
}

// =======================================================================
// ProjectDialog
// =======================================================================
interface ProjectDialogProps {
  target: Project | null | undefined; // undefined=closed, null=new, Project=edit
  onClose: () => void;
  onSave: (
    existingId: string | null,
    payload: { name: string; color: string; kind: ProjectKind; client: string; status: ProjectStatus }
  ) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

export function ProjectDialog({ target, onClose, onSave, onDelete }: ProjectDialogProps) {
  const open = target !== undefined;
  const ref = useNativeDialog(open, onClose);
  const isEdit = !!target;
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6aa9ff');
  const [kind, setKind] = useState<ProjectKind>('personal');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');

  useEffect(() => {
    if (target === undefined) return;
    if (target) {
      setName(target.name ?? '');
      setColor(target.color ?? '#6aa9ff');
      setKind(target.kind ?? 'personal');
      setClient(target.client ?? '');
      setStatus(target.status ?? (target.archived ? 'done' : 'active'));
    } else {
      setName('');
      setColor('#6aa9ff');
      setKind('personal');
      setClient('');
      setStatus('active');
    }
  }, [target]);

  return (
    <dialog
      ref={ref}
      onClose={() => onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
          if (action === 'delete' && target) {
            await onDelete(target.id);
            onClose();
            return;
          }
          if (action === 'save') {
            const trimmed = name.trim();
            if (!trimmed) return;
            await onSave(target ? target.id : null, {
              name: trimmed,
              color,
              kind,
              client: kind === 'client' ? client.trim() : '',
              status
            });
          }
          onClose();
        }}
      >
        <h2>{isEdit ? 'Edit project' : 'New project'}</h2>
        <label>
          Name
          <input
            type="text"
            maxLength={80}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="field-group">
          <span className="field-label">Type</span>
          <div className="segmented" role="radiogroup">
            <label>
              <input
                type="radio"
                name="pdlgKind"
                value="personal"
                checked={kind === 'personal'}
                onChange={() => setKind('personal')}
              />
              <span>Personal</span>
            </label>
            <label>
              <input
                type="radio"
                name="pdlgKind"
                value="client"
                checked={kind === 'client'}
                onChange={() => setKind('client')}
              />
              <span>Client</span>
            </label>
          </div>
        </div>
        {kind === 'client' && (
          <label>
            Client name
            <input
              type="text"
              maxLength={120}
              placeholder="e.g. Acme Corp"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </label>
        )}
        <div className="field-group">
          <span className="field-label">Status</span>
          <div className="segmented cols-4" role="radiogroup">
            {(['active', 'paused', 'inactive', 'done'] as ProjectStatus[]).map((s) => (
              <label key={s}>
                <input
                  type="radio"
                  name="pdlgStatus"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                <span>{s[0].toUpperCase() + s.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field-group">
          <span className="field-label">Color</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <menu>
          {isEdit && (
            <button value="delete" type="submit" className="danger" formNoValidate>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button value="cancel" type="submit" formNoValidate>
            Cancel
          </button>
          <button value="save" type="submit" className="primary">
            Save
          </button>
        </menu>
      </form>
    </dialog>
  );
}

// =======================================================================
// TicketDialog
// =======================================================================
interface TicketDialogProps {
  ticket: Ticket | null;
  project: Project | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Ticket>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

export function TicketDialog({ ticket, project, onClose, onSave, onDelete }: TicketDialogProps) {
  const open = !!ticket;
  const ref = useNativeDialog(open, onClose);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ticket) return;
    setTitle(ticket.title);
    setDescription(ticket.description || '');
    setDone(!!ticket.done);
  }, [ticket]);

  const badge = useMemo(() => {
    if (!ticket) return '';
    return `${projectPrefix(project)}-${ticket.number}`;
  }, [ticket, project]);

  return (
    <dialog
      ref={ref}
      onClose={() => onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
          if (!ticket) {
            onClose();
            return;
          }
          if (action === 'delete') {
            await onDelete(ticket.id);
          } else if (action === 'save') {
            const trimmed = title.trim();
            if (!trimmed) return;
            await onSave(ticket.id, { title: trimmed, description, done });
          }
          onClose();
        }}
      >
        <h2>Edit ticket</h2>
        <div
          className="ticket-badge-large"
          style={{ ['--ticket-color' as string]: project?.color || '#6aa9ff' }}
        >
          {badge}
        </div>
        <label>
          Title
          <input
            type="text"
            maxLength={200}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="row">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> Done
        </label>
        <menu>
          <button value="delete" type="submit" className="danger" formNoValidate>
            Delete
          </button>
          <span className="spacer" />
          <button value="cancel" type="submit" formNoValidate>
            Cancel
          </button>
          <button value="save" type="submit" className="primary">
            Save
          </button>
        </menu>
      </form>
    </dialog>
  );
}

// =======================================================================
// QuickLogDialog
// =======================================================================
interface QuickLogDialogProps {
  open: boolean;
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onLog: (projectId: string, durationMin: number, endingMinAgo: number | 'now', note: string) => Promise<void> | void;
}

export function QuickLogDialog({ open, projects, defaultProjectId, onClose, onLog }: QuickLogDialogProps) {
  const ref = useNativeDialog(open, onClose);
  const [projectId, setProjectId] = useState('');
  const [duration, setDuration] = useState(60);
  const [ending, setEnding] = useState<string>('now');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setProjectId(defaultProjectId ?? projects[0]?.id ?? '');
    setDuration(60);
    setEnding('now');
    setNote('');
  }, [open, defaultProjectId, projects]);

  return (
    <dialog
      ref={ref}
      onClose={() => onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
          if (action === 'log' && projectId) {
            const endingValue: number | 'now' = ending === 'now' ? 'now' : parseInt(ending, 10);
            await onLog(projectId, duration, endingValue, note);
          }
          onClose();
        }}
      >
        <h2>Quick log</h2>
        <p className="hint">Log time you already spent</p>
        <label>
          Project
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duration
          <select value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))}>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
          </select>
        </label>
        <label>
          Ending
          <select value={ending} onChange={(e) => setEnding(e.target.value)}>
            <option value="now">Just now</option>
            <option value="15">15 min ago</option>
            <option value="30">30 min ago</option>
            <option value="60">1 hour ago</option>
            <option value="120">2 hours ago</option>
          </select>
        </label>
        <label>
          Note
          <input
            type="text"
            placeholder="Optional"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <menu>
          <button value="cancel" type="submit" formNoValidate>
            Cancel
          </button>
          <button value="log" type="submit" className="primary">
            Log
          </button>
        </menu>
      </form>
    </dialog>
  );
}

// =======================================================================
// PomoSettingsDialog
// =======================================================================
interface PomoSettingsDialogProps {
  open: boolean;
  settings: PomoSettings;
  onClose: () => void;
  onSave: (s: PomoSettings) => void;
}

export function PomoSettingsDialog({ open, settings, onClose, onSave }: PomoSettingsDialogProps) {
  const ref = useNativeDialog(open, onClose);
  const [work, setWork] = useState(settings.work);
  const [rest, setRest] = useState(settings.rest);
  const [longRest, setLongRest] = useState(settings.longRest);
  const [longEvery, setLongEvery] = useState(settings.longEvery);
  const [autoStart, setAutoStart] = useState(settings.autoStart);
  const [sound, setSound] = useState(settings.sound);
  const [logBlocks, setLogBlocks] = useState(settings.logBlocks);

  useEffect(() => {
    if (!open) return;
    setWork(settings.work);
    setRest(settings.rest);
    setLongRest(settings.longRest);
    setLongEvery(settings.longEvery);
    setAutoStart(settings.autoStart);
    setSound(settings.sound);
    setLogBlocks(settings.logBlocks);
  }, [open, settings]);

  const clamp = (v: number, lo: number, hi: number, def: number) => {
    if (Number.isNaN(v)) return def;
    return Math.min(hi, Math.max(lo, v));
  };

  return (
    <dialog
      ref={ref}
      onClose={() => onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
          if (action === 'save') {
            onSave({
              work: clamp(work, 1, 180, 25),
              rest: clamp(rest, 1, 60, 5),
              longRest: clamp(longRest, 1, 120, 15),
              longEvery: clamp(longEvery, 2, 12, 4),
              autoStart,
              sound,
              logBlocks
            });
          }
          onClose();
        }}
      >
        <h2>Pomodoro settings</h2>
        <label>
          Work duration (minutes)
          <input
            type="number"
            min={1}
            max={180}
            step={1}
            value={work}
            onChange={(e) => setWork(parseInt(e.target.value, 10))}
          />
        </label>
        <label>
          Rest duration (minutes)
          <input
            type="number"
            min={1}
            max={60}
            step={1}
            value={rest}
            onChange={(e) => setRest(parseInt(e.target.value, 10))}
          />
        </label>
        <label>
          Long rest (minutes)
          <input
            type="number"
            min={1}
            max={120}
            step={1}
            value={longRest}
            onChange={(e) => setLongRest(parseInt(e.target.value, 10))}
          />
        </label>
        <label>
          Long rest after every
          <input
            type="number"
            min={2}
            max={12}
            step={1}
            value={longEvery}
            onChange={(e) => setLongEvery(parseInt(e.target.value, 10))}
          />
          work cycles
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
          />{' '}
          Auto-start next phase
        </label>
        <label className="row">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />{' '}
          Sound on phase start and end
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={logBlocks}
            onChange={(e) => setLogBlocks(e.target.checked)}
          />{' '}
          Log completed work to active project as a time block
        </label>
        <menu>
          <span className="spacer" />
          <button value="cancel" type="submit" formNoValidate>
            Cancel
          </button>
          <button value="save" type="submit" className="primary">
            Save
          </button>
        </menu>
      </form>
    </dialog>
  );
}

// =======================================================================
// ConfirmDialog
// =======================================================================
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const ref = useNativeDialog(open, onCancel);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onClose={onCancel}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2>{title}</h2>
      <p className="confirm-message">{message}</p>
      <menu>
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="danger-btn" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </menu>
    </dialog>
  );
}
