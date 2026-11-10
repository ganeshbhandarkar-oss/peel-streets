/** Tiny WebAudio synth: every sound is generated at runtime, no audio files. */
type Sfx = 'peel' | 'lift' | 'snap' | 'rotate' | 'flip' | 'solve' | 'jam' | 'click' | 'deny' | 'star' | 'coin';

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC() as AudioContext;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; to?: number; delay?: number; vol?: number } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, opts: { from?: number; to?: number; vol?: number; q?: number } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = opts.q ?? 2;
    f.frequency.setValueAtTime(opts.from ?? 800, t);
    f.frequency.exponentialRampToValueAtTime(opts.to ?? 4000, t + dur);
    const g = ctx.createGain();
    g.gain.value = opts.vol ?? 0.6;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  play(s: Sfx) {
    if (!this.enabled) return;
    switch (s) {
      case 'peel': // sticky rip: rising filtered noise
        this.noise(0.22, { from: 600, to: 5000, vol: 0.5, q: 1.5 });
        break;
      case 'lift':
        this.tone(420, 0.12, { to: 700, type: 'triangle', vol: 0.25 });
        break;
      case 'snap':
        this.tone(220, 0.09, { to: 140, type: 'square', vol: 0.18 });
        this.tone(880, 0.08, { type: 'triangle', vol: 0.25, delay: 0.02 });
        break;
      case 'rotate':
        this.tone(1200, 0.04, { type: 'triangle', vol: 0.2 });
        break;
      case 'flip':
        this.noise(0.1, { from: 2000, to: 600, vol: 0.35 });
        this.tone(600, 0.08, { to: 900, type: 'triangle', vol: 0.2 });
        break;
      case 'solve':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.09, vol: 0.35 }));
        break;
      case 'star':
        this.tone(1319, 0.15, { type: 'sine', vol: 0.3 });
        this.tone(1760, 0.18, { type: 'sine', vol: 0.2, delay: 0.05 });
        break;
      case 'jam':
        this.tone(330, 0.35, { to: 110, type: 'sawtooth', vol: 0.2 });
        break;
      case 'deny':
        this.tone(160, 0.12, { type: 'square', vol: 0.12 });
        break;
      case 'coin':
        this.tone(988, 0.08, { type: 'square', vol: 0.15 });
        this.tone(1319, 0.2, { type: 'square', vol: 0.15, delay: 0.08 });
        break;
      case 'click':
        this.tone(700, 0.035, { type: 'triangle', vol: 0.2 });
        break;
    }
  }
}

export const sfx = new Synth();

/** Haptic-style feedback where the device supports it (Android Chrome); silently ignored elsewhere. */
export function haptic(ms: number | number[] = 12) {
  try {
    (navigator as any).vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
