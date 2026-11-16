// Tiny 8-bit style sound effects made with WebAudio, so there are no audio files to ship.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  slide?: number;
}

function tone(freq: number, dur: number, { type = 'square', vol = 0.06, delay = 0, slide }: ToneOpts = {}) {
  if (muted) return;
  const c = ac();
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number) {
  if (muted) return;
  const c = ac();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  g.gain.value = vol;
  src.connect(g).connect(c.destination);
  src.start();
}

const arpeggio = (freqs: number[], gap: number, opts: ToneOpts = {}) =>
  freqs.forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.07, ...opts, delay: i * gap }));

export const sfx = {
  move: () => tone(500 + Math.random() * 80, 0.07, { vol: 0.04 }),
  turn: () => tone(330, 0.05, { type: 'triangle', vol: 0.05 }),
  hit: () => noise(0.05, 0.12),
  mine: () => noise(0.2, 0.2),
  paint: () => tone(700 + Math.random() * 200, 0.07, { type: 'triangle', vol: 0.06 }),
  color: () => arpeggio([660, 990], 0.05, { vol: 0.05 }),
  diamond: () => arpeggio([1047, 1319, 1568], 0.06),
  bump: () => tone(150, 0.25, { type: 'sawtooth', vol: 0.07, slide: 60 }),
  fall: () => tone(600, 0.5, { type: 'sawtooth', vol: 0.06, slide: 50 }),
  win: () => arpeggio([523, 659, 784, 1047, 1319, 1568], 0.08),
  nope: () => arpeggio([392, 294], 0.15),
  setMuted: (m: boolean) => {
    muted = m;
  },
};
