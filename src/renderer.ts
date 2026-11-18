import { isRaised, type Level, type Tile, type World } from './world';
import type { Point, Step } from './runner';
import { COLOR_BY_CHAR, COLOR_BY_NAME } from './colors';

const TEX = 8; // texture resolution in "pixels" per tile
const VARIANTS = 4;

const PAL = {
  grass: ['#5fa83a', '#5fa83a', '#6cb944', '#56993a', '#73c24b', '#4e8f33'],
  leaves: ['#2e6b1e', '#367a24', '#285e1a', '#3f8a2a', '#21501a', '#4a9a30'],
  stone: ['#8a8a8a', '#7b7b7b', '#969696', '#6e6e6e', '#8a8a8a', '#a3a3a3'],
  bedrock: ['#3b3b3b', '#2a2a2a', '#555555', '#1e1e1e', '#454545'],
  lava: ['#ff7a00', '#ff9500', '#e85d00', '#ffb12b', '#ff7a00', '#ffd25a'],
  water: ['#2e63d6', '#3a72e6', '#2856bd', '#4a85f0', '#2e63d6', '#6a9cf5'],
  portal: ['#7b2ff7', '#9b4dff', '#5a17c2', '#c27bff', '#7b2ff7', '#e0b0ff'],
};

const DIAMOND = [
  '........',
  '..cCCc..',
  '.cCwCCc.',
  'cCwCCCCc',
  '.cCCCCc.',
  '..cCCc..',
  '...cc...',
  '........',
];

const NEON = ['#9dff00', '#00e5ff', '#ff4fa3', '#ffd400', '#c27bff'];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

class Aborted extends Error {}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(x: number, y: number) {
  const h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  return [c, c.getContext('2d')!];
}

function noiseTex(pal: string[], seed: number) {
  const [c, g] = canvas();
  const r = rng(seed);
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      g.fillStyle = pal[Math.floor(r() * pal.length)];
      g.fillRect(x, y, 1, 1);
    }
  return c;
}

function spriteTex(rows: string[], colors: Record<string, string>) {
  const [c, g] = canvas();
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!colors[ch]) return;
      g.fillStyle = colors[ch];
      g.fillRect(x, y, 1, 1);
    }),
  );
  return c;
}

const variants = (pal: string[], seed: number) => Array.from({ length: VARIANTS }, (_, i) => noiseTex(pal, seed + i * 97));

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export class Renderer {
  speed = 1;

  private ctx: CanvasRenderingContext2D;
  private tex = {
    grass: variants(PAL.grass, 1),
    leaves: variants(PAL.leaves, 2),
    stone: variants(PAL.stone, 3),
    bedrock: variants(PAL.bedrock, 4),
    lava: variants(PAL.lava, 5),
    water: variants(PAL.water, 6),
    portal: variants(PAL.portal, 7),
    diamond: spriteTex(DIAMOND, { c: '#1aa6b7', C: '#4ee6f0', w: '#ffffff' }),
  };

  private wool = new Map<string, HTMLCanvasElement[]>();

  private tiles: Tile[][] = [];
  // drawing chapter: target picture (hex per cell), painted color names, current pen
  private drawMode = false;
  private target: (string | null)[][] | null = null;
  private paint: (string | null)[][] = [];
  private pen = '';
  private pops = new Map<string, number>();
  private wrong: Point[] = [];
  private cols = 1;
  private rows = 1;
  // player state (tile units / radians)
  private px = 0;
  private py = 0;
  private ox = 0;
  private oy = 0;
  private dirAngle = 0;
  private spin = 0;
  private hop = 0;
  private scale = 1;

  private cracks = new Map<string, number>();
  private particles: Particle[] = [];
  private shake = 0;
  private flash = { color: '255,60,60', a: 0 };
  private bannerText = '';
  private bannerT = 0;
  private gen = 0; // bumped on every reset; running animations abort when it changes
  private last = 0;
  private now = 0;
  private ts = 32;
  private offX = 0;
  private offY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    requestAnimationFrame(this.frame);
  }

  load(w: World, level: Level) {
    this.gen++;
    this.tiles = w.tiles.map((r) => [...r]);
    this.drawMode = level.chapter === 'draw';
    this.target = level.target?.map((row) => [...row].map((ch) => COLOR_BY_CHAR[ch]?.hex ?? null)) ?? null;
    this.paint = w.paint.map((r) => [...r]);
    this.pen = w.pen;
    this.pops.clear();
    this.wrong = [];
    this.cols = w.width;
    this.rows = w.height;
    this.px = w.x;
    this.py = w.y;
    this.ox = this.oy = 0;
    this.dirAngle = (w.dir * Math.PI) / 2;
    this.spin = 0;
    this.hop = 0;
    this.scale = 1;
    this.cracks.clear();
    this.particles = [];
    this.shake = 0;
    this.flash.a = 0;
  }

  stop() {
    this.gen++;
  }

  banner(text: string) {
    this.bannerText = text;
    this.bannerT = 1.6;
  }

  /** Plays the steps; resolves to false if it was interrupted. */
  async play(steps: Step[], onStep: (s: Step) => void): Promise<boolean> {
    const gen = this.gen;
    try {
      for (const s of steps) {
        onStep(s);
        await this.animate(s);
        await this.tween(this.d(50), () => {});
      }
      return gen === this.gen;
    } catch (e) {
      if (e instanceof Aborted) return false;
      throw e;
    }
  }

  /** Outlines cells that differ from the target picture, until the next reset. */
  markWrong(cells: Point[]) {
    this.wrong = cells;
  }

  /** The painting as a PNG data URL (transparent where nothing is painted). */
  exportPng(): string {
    const px = 32;
    const c = document.createElement('canvas');
    c.width = this.cols * px;
    c.height = this.rows * px;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    this.paint.forEach((row, y) =>
      row.forEach((name, x) => {
        if (name) g.drawImage(this.woolTex(name, x, y), x * px, y * px, px, px);
      }),
    );
    return c.toDataURL('image/png');
  }

  celebrate() {
    this.flash = { color: '157,255,0', a: 0.8 };
    for (let k = 0; k < 4; k++) setTimeout(() => this.burst(this.px, this.py, NEON, 40, 7), k * 160);
  }

  // ---- animation -------------------------------------------------------

  private d(ms: number) {
    return ms / this.speed;
  }

  private tween(ms: number, fn: (t: number) => void): Promise<void> {
    const gen = this.gen;
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        if (gen !== this.gen) return reject(new Aborted());
        const t = ms <= 0 ? 1 : Math.min(1, (performance.now() - start) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  private async animate(s: Step) {
    switch (s.kind) {
      case 'move': {
        const spin0 = this.spin;
        await this.tween(this.d(340), (t) => {
          const e = easeInOut(t);
          this.px = s.from.x + (s.to.x - s.from.x) * e;
          this.py = s.from.y + (s.to.y - s.from.y) * e;
          this.spin = spin0 + (e * Math.PI) / 2;
          this.hop = Math.sin(Math.PI * t);
          this.trail();
        });
        this.px = s.to.x;
        this.py = s.to.y;
        this.spin = (spin0 + Math.PI / 2) % (Math.PI * 2);
        this.hop = 0;
        if (s.collected) {
          this.tiles[s.to.y][s.to.x] = '.';
          this.burst(s.to.x, s.to.y, ['#4ee6f0', '#ffffff', '#1aa6b7'], 24, 4);
        }
        break;
      }
      case 'turn': {
        const a0 = this.dirAngle;
        await this.tween(this.d(220), (t) => {
          this.dirAngle = a0 + s.delta * (Math.PI / 2) * easeInOut(t);
        });
        this.dirAngle = a0 + s.delta * (Math.PI / 2);
        break;
      }
      case 'mine': {
        const dx = s.at.x - this.px;
        const dy = s.at.y - this.py;
        const key = `${s.at.x},${s.at.y}`;
        const swings = s.hit ? 3 : 1;
        for (let i = 0; i < swings; i++) {
          await this.tween(this.d(170), (t) => {
            const k = Math.sin(Math.PI * t) * 0.2;
            this.ox = dx * k;
            this.oy = dy * k;
            if (s.hit) this.cracks.set(key, (i + t) / swings);
          });
        }
        this.ox = this.oy = 0;
        if (s.hit) {
          this.cracks.delete(key);
          this.tiles[s.at.y][s.at.x] = '.';
          this.burst(s.at.x, s.at.y, PAL.stone, 26, 4);
        }
        break;
      }
      case 'bump': {
        const dx = s.at.x - this.px;
        const dy = s.at.y - this.py;
        await this.tween(this.d(150), (t) => {
          this.ox = dx * t * 0.32;
          this.oy = dy * t * 0.32;
        });
        this.shake = 1;
        this.flash = { color: '255,60,60', a: 1 };
        await this.tween(this.d(260), (t) => {
          this.ox = dx * (1 - t) * 0.32;
          this.oy = dy * (1 - t) * 0.32;
        });
        break;
      }
      case 'fall': {
        await this.tween(this.d(300), (t) => {
          this.px = s.from.x + (s.to.x - s.from.x) * t;
          this.py = s.from.y + (s.to.y - s.from.y) * t;
          this.hop = Math.sin(Math.PI * t) * 0.6;
        });
        this.hop = 0;
        const lava = s.into === 'L';
        this.burst(s.to.x, s.to.y, lava ? PAL.lava : PAL.water, 30, 3);
        this.flash = { color: lava ? '255,120,0' : '60,120,255', a: 0.8 };
        const spin0 = this.spin;
        await this.tween(this.d(450), (t) => {
          this.scale = 1 - t;
          this.spin = spin0 + t * Math.PI * 2;
        });
        break;
      }
      case 'paint': {
        const key = `${s.at.x},${s.at.y}`;
        this.paint[s.at.y][s.at.x] = s.color;
        this.burst(s.at.x, s.at.y, [COLOR_BY_NAME[s.color].hex, '#ffffff'], 10, 2.5);
        await this.tween(this.d(160), (t) => {
          this.pops.set(key, t);
          this.hop = Math.sin(Math.PI * t) * 0.4;
        });
        this.pops.delete(key);
        this.hop = 0;
        break;
      }
      case 'color': {
        this.pen = s.color;
        await this.tween(this.d(200), (t) => {
          this.scale = 1 + Math.sin(Math.PI * t) * 0.25;
        });
        this.scale = 1;
        break;
      }
    }
  }

  private woolTex(name: string, x: number, y: number) {
    let set = this.wool.get(name);
    if (!set) {
      const hex = COLOR_BY_NAME[name].hex;
      set = variants([hex, hex, hex, shade(hex, 14), shade(hex, -14), shade(hex, -24)], name.length * 31);
      this.wool.set(name, set);
    }
    return set[hash(x, y) % VARIANTS];
  }

  private burst(x: number, y: number, colors: string[], n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * speed;
      const life = 0.4 + Math.random() * 0.6;
      this.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        max: life,
        color: colors[i % colors.length],
        size: 0.06 + Math.random() * 0.09,
      });
    }
  }

  private trail() {
    this.particles.push({
      x: this.px + 0.5 + (Math.random() - 0.5) * 0.2,
      y: this.py + 0.5 + (Math.random() - 0.5) * 0.2,
      vx: 0,
      vy: 0,
      life: 0.35,
      max: 0.35,
      color: Math.random() < 0.7 ? '#9dff00' : '#00e5ff',
      size: 0.1,
    });
  }

  // ---- drawing ---------------------------------------------------------

  private frame = (t: number) => {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    this.now = t;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    const drag = Math.pow(0.03, dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.flash.a = Math.max(0, this.flash.a - dt * 1.5);
    this.bannerT = Math.max(0, this.bannerT - dt);
  }

  private animFrame(x: number, y: number, ms: number) {
    return (Math.floor(this.now / ms) + hash(x, y)) % VARIANTS;
  }

  private draw() {
    const c = this.canvas;
    const g = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0e16';
    g.fillRect(0, 0, w, h);
    if (!this.tiles.length) return;

    const ts = Math.floor(Math.min(w / this.cols, h / (this.rows + 0.3)));
    this.ts = ts;
    this.offX = Math.floor((w - ts * this.cols) / 2);
    this.offY = Math.floor((h - ts * this.rows) / 2 + ts * 0.1);
    g.imageSmoothingEnabled = false;

    g.save();
    if (this.shake > 0) {
      const k = this.shake * ts * 0.15;
      g.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) this.drawFloor(this.tiles[y][x], x, y);
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) this.drawRaised(this.tiles[y][x], x, y);
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) if (this.tiles[y][x] === 'D') this.drawDiamond(x, y);
    if (this.drawMode) this.drawPainting();
    this.drawPlayer();
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      const s = p.size * ts;
      g.fillRect(this.offX + p.x * ts - s / 2, this.offY + p.y * ts - s / 2, s, s);
    }
    g.globalAlpha = 1;
    g.restore();

    if (this.flash.a > 0) {
      g.fillStyle = `rgba(${this.flash.color},${this.flash.a * 0.35})`;
      g.fillRect(0, 0, w, h);
    }
    if (this.bannerT > 0) {
      g.globalAlpha = Math.min(1, this.bannerT / 0.4);
      g.font = `${Math.round(Math.min(w, h * 1.4) * 0.05)}px "Press Start 2P", monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = Math.max(3, w * 0.006);
      g.strokeStyle = '#000';
      g.fillStyle = '#fff';
      const ty = h * 0.12 - (1.6 - this.bannerT) * h * 0.02;
      g.strokeText(this.bannerText, w / 2, ty);
      g.fillText(this.bannerText, w / 2, ty);
      g.globalAlpha = 1;
    }
  }

  private drawFloor(t: Tile, x: number, y: number) {
    const g = this.ctx;
    const ts = this.ts;
    const sx = this.offX + x * ts;
    const sy = this.offY + y * ts;
    if (this.drawMode) {
      g.fillStyle = (x + y) % 2 ? '#9aa1b3' : '#8f97aa';
      return g.fillRect(sx, sy, ts, ts);
    }
    if (t === 'L') return g.drawImage(this.tex.lava[this.animFrame(x, y, 320)], sx, sy, ts, ts);
    if (t === 'W') return g.drawImage(this.tex.water[this.animFrame(x, y, 480)], sx, sy, ts, ts);
    g.drawImage(this.tex.grass[hash(x, y) % VARIANTS], sx, sy, ts, ts);
    if (t === 'G') {
      const pulse = 0.5 + 0.5 * Math.sin(this.now / 250);
      g.fillStyle = `rgba(194,123,255,${0.25 + 0.25 * pulse})`;
      g.fillRect(sx, sy, ts, ts);
      g.fillStyle = '#1a0f2e';
      g.fillRect(sx + ts * 0.1, sy + ts * 0.1, ts * 0.8, ts * 0.8);
      g.drawImage(this.tex.portal[Math.floor(this.now / 140) % VARIANTS], sx + ts * 0.2, sy + ts * 0.2, ts * 0.6, ts * 0.6);
    }
  }

  private drawRaised(t: Tile, x: number, y: number) {
    if (!isRaised(t)) return;
    const g = this.ctx;
    const ts = this.ts;
    const sx = this.offX + x * ts;
    const sy = this.offY + y * ts;
    const lift = Math.round(ts * 0.18);
    const set = t === 'T' ? this.tex.leaves : t === 'S' ? this.tex.stone : this.tex.bedrock;
    const img = set[hash(x, y) % VARIANTS];
    // front face, then the top face lifted up for a chunky 3/4 view
    g.drawImage(img, sx, sy + ts - lift, ts, lift);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(sx, sy + ts - lift, ts, lift);
    g.drawImage(img, sx, sy - lift, ts, ts);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(sx, sy - lift, ts, Math.max(1, ts / TEX / 2));

    const crack = this.cracks.get(`${x},${y}`);
    if (crack) {
      const r = rng(hash(x, y));
      const px = ts / TEX;
      g.fillStyle = 'rgba(0,0,0,0.75)';
      for (let i = 0; i < Math.floor(crack * 18); i++) {
        g.fillRect(sx + Math.floor(r() * TEX) * px, sy - lift + Math.floor(r() * TEX) * px, px, px);
      }
    }
  }

  /** Target picture as faint ghosts, then the painted wool blocks, then markers for wrong cells. */
  private drawPainting() {
    const g = this.ctx;
    const ts = this.ts;
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        const sx = this.offX + x * ts;
        const sy = this.offY + y * ts;
        const ghost = this.target?.[y][x];
        if (ghost) {
          g.globalAlpha = 0.4;
          g.fillStyle = ghost;
          g.fillRect(sx + ts * 0.2, sy + ts * 0.2, ts * 0.6, ts * 0.6);
          g.globalAlpha = 1;
          g.strokeStyle = ghost;
          g.lineWidth = Math.max(1, ts * 0.04);
          g.setLineDash([ts * 0.08, ts * 0.06]);
          g.strokeRect(sx + ts * 0.08, sy + ts * 0.08, ts * 0.84, ts * 0.84);
          g.setLineDash([]);
        }
        const name = this.paint[y][x];
        if (name) {
          const pop = this.pops.get(`${x},${y}`);
          const k = pop === undefined ? 1 : 0.3 + 0.7 * pop;
          const s = ts * k;
          const ox = sx + (ts - s) / 2;
          const oy = sy + (ts - s) / 2;
          g.drawImage(this.woolTex(name, x, y), ox, oy, s, s);
          g.strokeStyle = 'rgba(0,0,0,0.3)';
          g.lineWidth = Math.max(1, ts * 0.03);
          g.strokeRect(ox, oy, s, s);
        }
      }
    if (this.wrong.length) {
      const pulse = 0.6 + 0.4 * Math.sin(this.now / 150);
      g.strokeStyle = `rgba(255,40,40,${pulse})`;
      g.lineWidth = Math.max(2, ts * 0.08);
      for (const p of this.wrong) {
        g.strokeRect(this.offX + p.x * ts + ts * 0.06, this.offY + p.y * ts + ts * 0.06, ts * 0.88, ts * 0.88);
      }
    }
  }

  private drawDiamond(x: number, y: number) {
    const g = this.ctx;
    const ts = this.ts;
    const sx = this.offX + x * ts;
    const sy = this.offY + y * ts;
    const bob = Math.sin(this.now / 300 + x + y) * ts * 0.05;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(sx + ts / 2, sy + ts * 0.82, ts * 0.22, ts * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(this.tex.diamond, sx + ts * 0.15, sy + ts * 0.08 + bob, ts * 0.7, ts * 0.7);
  }

  /** The hero: a neon cube with a white arrow showing where it faces. */
  private drawPlayer() {
    if (this.scale <= 0.01) return;
    const g = this.ctx;
    const ts = this.ts;
    const cx = this.offX + (this.px + this.ox + 0.5) * ts;
    const cy = this.offY + (this.py + this.oy + 0.5) * ts;
    const s = ts * (this.drawMode ? 0.5 : 0.64) * this.scale * (1 + this.hop * 0.15);
    const lift = this.hop * ts * 0.22;

    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(cx, cy + ts * 0.3, s * 0.5 * (1 - this.hop * 0.3), s * 0.15, 0, 0, Math.PI * 2);
    g.fill();

    g.save();
    g.translate(cx, cy - lift);
    g.rotate(this.spin);
    const b = Math.max(2, s * 0.08);
    const i = s * 0.25;
    g.fillStyle = '#000';
    g.fillRect(-s / 2, -s / 2, s, s);
    g.fillStyle = '#9dff00';
    g.fillRect(-s / 2 + b, -s / 2 + b, s - 2 * b, s - 2 * b);
    g.fillStyle = '#000';
    g.fillRect(-i - b / 2, -i - b / 2, 2 * i + b, 2 * i + b);
    // in drawing mode the cube's face shows the current pen color
    g.fillStyle = this.drawMode ? COLOR_BY_NAME[this.pen].hex : '#00e5ff';
    g.fillRect(-i, -i, 2 * i, 2 * i);
    g.fillStyle = '#000';
    g.fillRect(-i * 0.75, -i * 0.6, i * 0.45, i * 0.45);
    g.fillRect(i * 0.3, -i * 0.6, i * 0.45, i * 0.45);
    g.fillRect(-i * 0.6, i * 0.3, i * 1.2, i * 0.25);
    g.restore();

    g.save();
    g.translate(cx, cy - lift);
    g.rotate(this.dirAngle);
    const r = s * 0.5 + ts * 0.05;
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = Math.max(2, ts * 0.035);
    g.beginPath();
    g.moveTo(0, -r - ts * 0.16);
    g.lineTo(ts * 0.13, -r);
    g.lineTo(-ts * 0.13, -r);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
