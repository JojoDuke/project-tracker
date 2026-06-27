type PomoPhase = 'work' | 'rest' | 'long-rest';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

/** Shared context — must be resumed from a user gesture before timer-end sounds work. */
class PomoAudioEngine {
  private ctx: AudioContext | null = null;

  /** Call on play button click so timer-end alarms are allowed to play. */
  unlock(): void {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = getAudioContext();
      }
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      /* noop */
    }
  }

  private async ready(): Promise<AudioContext | null> {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return null;
      }
    }
    return ctx.state === 'running' ? ctx : null;
  }

  private tone(
    ctx: AudioContext,
    frequency: number,
    startAt: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine'
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  }

  /** Short chime when a phase starts (work or break). */
  async playStart(phase: PomoPhase): Promise<void> {
    const ctx = await this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (phase === 'work') {
      this.tone(ctx, 523.25, t, 0.12, 0.35); // C5
      this.tone(ctx, 659.25, t + 0.1, 0.18, 0.4); // E5
    } else {
      this.tone(ctx, 392, t, 0.14, 0.3); // G4
      this.tone(ctx, 523.25, t + 0.12, 0.2, 0.32); // C5
    }
  }

  /** Strong repeating alarm when a phase ends. */
  async playComplete(endedPhase: PomoPhase): Promise<void> {
    const ctx = await this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = endedPhase === 'work' ? 880 : 740;
    const repeats = endedPhase === 'work' ? 6 : 4;
    const gap = 0.28;

    for (let i = 0; i < repeats; i++) {
      const at = t + i * gap;
      this.tone(ctx, base, at, 0.16, 0.55, 'square');
      this.tone(ctx, base * 1.25, at + 0.04, 0.12, 0.25, 'sine');
    }
  }
}

export const pomoAudio = new PomoAudioEngine();

export type { PomoPhase };
