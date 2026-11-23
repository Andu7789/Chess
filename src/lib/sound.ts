// Tiny synthesised sound effects (no audio files needed).
import { useProgress } from '../store/progress';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!useProgress.getState().settings.sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function knock(volume: number, freq: number, decay = 0.08) {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * decay);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
}

function tone(freqs: number[], dur = 0.12, type: OscillatorType = 'sine', vol = 0.12) {
  const c = ac();
  if (!c) return;
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    const t0 = c.currentTime + i * dur;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  });
}

export const sfx = {
  move: () => knock(1.4, 900),
  capture: () => {
    knock(1.8, 700, 0.12);
    setTimeout(() => knock(0.9, 1300, 0.06), 40);
  },
  check: () => tone([880, 660], 0.09, 'triangle', 0.1),
  success: () => tone([523, 659, 784, 1047], 0.09, 'triangle', 0.12),
  fail: () => tone([330, 247], 0.14, 'sawtooth', 0.05),
  win: () => tone([523, 659, 784, 1047, 1319], 0.12, 'triangle', 0.13),
  click: () => knock(0.5, 2000, 0.03),
};

export function playMoveSound(san: string) {
  if (san.includes('#') || san.includes('+')) sfx.check();
  else if (san.includes('x')) sfx.capture();
  else sfx.move();
}
