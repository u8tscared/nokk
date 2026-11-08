// Sons générés (Web Audio) + vibrations. Très bas : l'app doit se sentir, pas crier.
import { settings } from './store.js';

let ctx = null;
let master = null;
let touched = false;

function ensure() {
  if (!touched) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() {
  if (touched) return;
  touched = true;
  ensure();
}
if (typeof window !== 'undefined') {
  const once = () => { unlockAudio(); window.removeEventListener('pointerdown', once, true); window.removeEventListener('keydown', once, true); };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

// Timbre Nokk : sinus doux + un peu de triangle, comme une cloche de bois.
function note(freq, at, dur = 0.12, { type = 'sine', vol = 1, glide = 0 } = {}) {
  const c = ctx;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(at, dur, from, to, vol = 0.5) {
  const c = ctx;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master);
  src.start(at);
}

const SOUNDS = {
  tap: (t) => note(1900, t, 0.03, { vol: 0.25 }),
  tick: (t) => note(2600, t, 0.015, { vol: 0.15 }),
  ok: (t) => { note(660, t, 0.12, { type: 'triangle', vol: 0.6 }); note(990, t + 0.075, 0.18, { type: 'triangle', vol: 0.6 }); },
  done: (t) => {
    [523, 659, 784, 1047].forEach((f, i) => note(f, t + i * 0.07, 0.22, { type: 'triangle', vol: 0.55 }));
    noise(t + 0.28, 0.25, 6000, 9000, 0.12);
  },
  scan: (t) => { note(1320, t, 0.06, { vol: 0.5 }); note(1320, t + 0.1, 0.06, { vol: 0.5 }); },
  err: (t) => { note(440, t, 0.13, { type: 'triangle', vol: 0.6 }); note(330, t + 0.11, 0.2, { type: 'triangle', vol: 0.6 }); },
  sheet: (t) => noise(t, 0.2, 500, 1800, 0.35),
  close: (t) => noise(t, 0.18, 1800, 500, 0.3),
  print: (t) => { for (let i = 0; i < 6; i++) noise(t + i * 0.07, 0.06, 900, 700, 0.25); note(880, t + 0.5, 0.2, { type: 'triangle', vol: 0.5 }); },
};

const VIBES = { tap: 5, ok: 8, done: [8, 40, 8], scan: 8, err: [12, 30, 20], sheet: 4, close: 6 };

export function feel(kind = 'tap') {
  const s = settings.value;
  if (s.sound && ensure() && SOUNDS[kind]) {
    try { SOUNDS[kind](ctx.currentTime + 0.005); } catch {}
  }
  if (s.haptics && touched && VIBES[kind] && navigator.vibrate) {
    try { navigator.vibrate(VIBES[kind]); } catch {}
  }
}
