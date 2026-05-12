'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/types';
import { addDays, fmtDate } from '@/lib/time';
import { PomoSettingsDialog } from './Dialogs';

interface Props {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  activeProject: Project | null;
  onWorkBlockLogged: (start: Date, end: Date) => Promise<void> | void;
  hasActiveProject: boolean;
}

interface PomoSettings {
  work: number;
  rest: number;
  longRest: number;
  longEvery: number;
  autoStart: boolean;
  sound: boolean;
  logBlocks: boolean;
}

const POMO_DEFAULTS: PomoSettings = {
  work: 25,
  rest: 5,
  longRest: 15,
  longEvery: 4,
  autoStart: false,
  sound: true,
  logBlocks: false
};

type PomoPhase = 'work' | 'rest' | 'long-rest';

function loadPomoSettings(): PomoSettings {
  if (typeof window === 'undefined') return { ...POMO_DEFAULTS };
  try {
    const raw = window.localStorage.getItem('pomo.settings');
    if (!raw) return { ...POMO_DEFAULTS };
    return { ...POMO_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...POMO_DEFAULTS };
  }
}

function savePomoSettings(s: PomoSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('pomo.settings', JSON.stringify(s));
}

function pomoPhaseLabel(phase: PomoPhase): string {
  if (phase === 'long-rest') return 'Long rest';
  if (phase === 'work') return 'Work';
  return 'Rest';
}

function beep() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* noop */
  }
}

export default function TopBar({
  weekStart,
  onPrev,
  onNext,
  onToday,
  activeProject,
  onWorkBlockLogged,
  hasActiveProject
}: Props) {
  const [settings, setSettings] = useState<PomoSettings>(POMO_DEFAULTS);
  const [phase, setPhase] = useState<PomoPhase>('work');
  const [remaining, setRemaining] = useState(POMO_DEFAULTS.work * 60);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const phaseStartedAt = useRef<Date | null>(null);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);
  const hydrated = useRef(false);

  // hydrate settings client-side once
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const loaded = loadPomoSettings();
    setSettings(loaded);
    setRemaining(loaded.work * 60);
  }, []);

  const phaseDuration = useCallback(
    (p: PomoPhase) => {
      if (p === 'work') return settings.work * 60;
      if (p === 'long-rest') return settings.longRest * 60;
      return settings.rest * 60;
    },
    [settings]
  );

  // doc title
  useEffect(() => {
    if (running) {
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
      const ss = String(remaining % 60).padStart(2, '0');
      document.title = `${mm}:${ss} · ${pomoPhaseLabel(phase)}`;
    } else {
      document.title = 'project-tracker';
    }
  }, [running, remaining, phase]);

  const stop = useCallback(() => {
    setRunning(false);
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
  }, []);

  const complete = useCallback(async () => {
    if (settings.sound) beep();
    stop();
    if (phase === 'work') {
      const newCycles = cycles + 1;
      setCycles(newCycles);
      if (settings.logBlocks && phaseStartedAt.current) {
        const start = phaseStartedAt.current;
        const end = new Date();
        await onWorkBlockLogged(start, end);
      }
      const nextIsLong = newCycles > 0 && newCycles % settings.longEvery === 0;
      const nextPhase: PomoPhase = nextIsLong ? 'long-rest' : 'rest';
      setPhase(nextPhase);
      setRemaining(nextIsLong ? settings.longRest * 60 : settings.rest * 60);
    } else {
      setPhase('work');
      setRemaining(settings.work * 60);
    }
    phaseStartedAt.current = null;
    if (settings.autoStart) {
      setTimeout(() => {
        if (settings.sound) beep();
        start();
      }, 700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, phase, cycles, stop, onWorkBlockLogged]);

  const start = useCallback(() => {
    setRunning((wasRunning) => {
      if (wasRunning) return wasRunning;
      phaseStartedAt.current = phaseStartedAt.current ?? new Date();
      intervalId.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            if (intervalId.current) {
              clearInterval(intervalId.current);
              intervalId.current = null;
            }
            // schedule completion outside the setState
            queueMicrotask(() => {
              void complete();
            });
            return 0;
          }
          return r - 1;
        });
      }, 1000);
      return true;
    });
  }, [complete]);

  const togglePlay = useCallback(() => {
    if (running) {
      stop();
    } else {
      setRemaining((r) => (r <= 0 ? phaseDuration(phase) : r));
      if (!intervalId.current) phaseStartedAt.current = new Date();
      if (settings.sound) beep();
      start();
    }
  }, [running, phase, phaseDuration, settings.sound, start, stop]);

  const reset = useCallback(() => {
    stop();
    setPhase('work');
    setCycles(0);
    phaseStartedAt.current = null;
    setRemaining(phaseDuration('work'));
  }, [phaseDuration, stop]);

  // keyboard: p toggles
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.matches('input, textarea, select')) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'p') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  // cleanup
  useEffect(() => () => {
    if (intervalId.current) clearInterval(intervalId.current);
  }, []);

  const we = addDays(weekStart, 6);
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <header id="topbar">
      <button onClick={onPrev} title="Previous week ([)">
        ‹
      </button>
      <button onClick={onToday} title="Today (t)">
        Today
      </button>
      <button onClick={onNext} title="Next week (])">
        ›
      </button>
      <span id="weekLabel">
        {fmtDate(weekStart)} – {fmtDate(we)}
      </span>
      <span className="spacer" />
      <div
        id="pomodoro"
        className={
          (running ? 'running' : '') + (phase !== 'work' ? ' rest-phase' : '')
        }
      >
        <span className={`pomo-phase ${phase}`}>{pomoPhaseLabel(phase)}</span>
        <span id="pomoTime">
          {mm}:{ss}
        </span>
        <button onClick={togglePlay} title="Start/pause (p)">
          {running ? '⏸' : '▶'}
        </button>
        <button onClick={reset} title="Reset">
          ↺
        </button>
        <button onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙
        </button>
        <span id="pomoCycles" title="Completed work cycles">
          {cycles}
        </span>
      </div>
      <span className="spacer" />
      <span id="activeProjectLabel">
        {activeProject ? (
          <>
            <span className="swatch" style={{ background: activeProject.color }} />
            Active: <strong>{activeProject.name}</strong>
          </>
        ) : (
          'No project selected'
        )}
      </span>

      <PomoSettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(s) => {
          setSettings(s);
          savePomoSettings(s);
          if (!running) setRemaining(s.work * 60);
        }}
      />
    </header>
  );
}

export type { PomoSettings };
