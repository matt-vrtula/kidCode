// Runs kids' JavaScript in a Web Worker, so an endless loop never freezes the page:
// the main thread can always terminate the worker. Plain JS (served as-is from /public),
// because user code is loaded with importScripts, which only exists in classic workers.
'use strict';

const MAX_LOGS = 1000;
const native = {
  setTimeout: setTimeout.bind(self),
  clearTimeout: clearTimeout.bind(self),
  setInterval: setInterval.bind(self),
  clearInterval: clearInterval.bind(self),
};

let ctx = null;
let W = 0;
let H = 0;
let colors = {};
let logs = 0;
let mainDone = false;
let finished = false;
const active = new Set(); // pending timers/frames: the program is done only when none are left

const send = (msg, transfer) => postMessage(msg, transfer || []);

// ---- console ------------------------------------------------------------

function fmt(v, depth = 0) {
  if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
  if (typeof v === 'function') return `ƒ ${v.name || 'funkcia'}()`;
  if (typeof v === 'bigint') return `${v}n`;
  if (v === null || typeof v !== 'object') return String(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (depth > 2) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) {
    const items = v.slice(0, 100).map((x) => fmt(x, depth + 1));
    return `[${items.join(', ')}${v.length > 100 ? ', …' : ''}]`;
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  return `{ ${keys.slice(0, 50).map((k) => `${k}: ${fmt(v[k], depth + 1)}`).join(', ')}${keys.length > 50 ? ', …' : ''} }`;
}

function log(level, args) {
  logs++;
  if (logs > MAX_LOGS) {
    if (logs === MAX_LOGS + 1) send({ type: 'log', level: 'warn', text: `… viac ako ${MAX_LOGS} výpisov, ďalšie už neukážem` });
    return;
  }
  send({ type: 'log', level, text: args.map((a) => fmt(a)).join(' ') });
}

const kidConsole = {
  log: (...a) => log('log', a),
  info: (...a) => log('info', a),
  warn: (...a) => log('warn', a),
  error: (...a) => log('error', a),
  table: (...a) => log('log', a),
  clear: () => send({ type: 'clear' }),
};
Object.defineProperty(self, 'console', { value: kidConsole, writable: true, configurable: true });

// ---- lifecycle ----------------------------------------------------------

function lineOf(err) {
  // user code is loaded from a blob: URL wrapped in one extra line, see run()
  const m = /blob:[^\s)]*?:(\d+):(\d+)/.exec(String((err && err.stack) || ''));
  return m ? Number(m[1]) - 1 : null;
}

function fail(err) {
  if (finished) return;
  finished = true;
  flushWorld();
  const isError = err instanceof Error;
  send({
    type: 'error',
    name: isError ? err.name : 'Error',
    message: isError ? err.message : fmt(err),
    line: isError ? lineOf(err) : null,
  });
}

function checkDone() {
  if (mainDone && active.size === 0 && !finished) {
    finished = true;
    flushWorld();
    send({ type: 'done' });
  }
}

function guarded(fn, args) {
  if (finished) return;
  try {
    if (typeof fn === 'function') fn(...args);
  } catch (e) {
    fail(e);
  }
}

self.setTimeout = (fn, ms, ...args) => {
  const id = native.setTimeout(() => {
    active.delete(id);
    guarded(fn, args);
    checkDone();
  }, ms);
  active.add(id);
  return id;
};
self.clearTimeout = (id) => {
  active.delete(id);
  native.clearTimeout(id);
  checkDone();
};
self.setInterval = (fn, ms, ...args) => {
  const id = native.setInterval(() => guarded(fn, args), ms);
  active.add(id);
  return id;
};
self.clearInterval = (id) => {
  active.delete(id);
  native.clearInterval(id);
  checkDone();
};

const nativeRaf = self.requestAnimationFrame
  ? self.requestAnimationFrame.bind(self)
  : (fn) => native.setTimeout(() => fn(performance.now()), 16);
const nativeCaf = self.cancelAnimationFrame ? self.cancelAnimationFrame.bind(self) : native.clearTimeout;
self.requestAnimationFrame = (fn) => {
  const id = nativeRaf((t) => {
    active.delete(`raf${id}`);
    guarded(fn, [t]);
    checkDone();
  });
  active.add(`raf${id}`);
  return id;
};
self.cancelAnimationFrame = (id) => {
  active.delete(`raf${id}`);
  nativeCaf(id);
  checkDone();
};

// ---- helpers for both sandboxes -----------------------------------------

function nums(fname, names, values) {
  names.forEach((name, i) => {
    const v = values[i];
    if (typeof v !== 'number' || Number.isNaN(v)) {
      throw new Error(`${fname}: „${name}“ musí byť číslo, ale je ${v === undefined ? 'prázdne' : fmt(v, 1)}`);
    }
  });
}

self.sleep = (ms) => {
  nums('sleep', ['ms'], [ms]);
  return new Promise((resolve) => native.setTimeout(resolve, Math.max(0, ms)));
};

self.random = (min, max) => {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  nums('random', ['min', 'max'], [min, max]);
  return Math.floor(min + Math.random() * (Math.floor(max) - min + 1));
};

// ---- drawing --------------------------------------------------------------

function canvasFor(fname) {
  if (!ctx) throw new Error(`${fname}() funguje len na Plátne 🖌`);
  return ctx;
}

const color = (c, fallback) => (c === undefined || c === null ? fallback : colors[c] || String(c));

function strokePath(g, c, width) {
  g.strokeStyle = color(c, 'black');
  g.lineWidth = width === undefined ? 2 : width;
  g.stroke();
}

function fillPath(g, c) {
  g.fillStyle = color(c, 'black');
  g.fill();
}

function ellipsePath(fname, x, y, w, h) {
  nums(fname, ['x', 'y', 'šírka', 'výška'], [x, y, w, h]);
  const g = canvasFor(fname);
  g.beginPath();
  g.ellipse(x, y, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
  return g;
}

function trianglePath(fname, x1, y1, x2, y2, x3, y3) {
  nums(fname, ['x1', 'y1', 'x2', 'y2', 'x3', 'y3'], [x1, y1, x2, y2, x3, y3]);
  const g = canvasFor(fname);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
  return g;
}

Object.assign(self, {
  background(c = 'white') {
    const g = canvasFor('background');
    g.save();
    g.fillStyle = color(c, 'white');
    g.fillRect(0, 0, W, H);
    g.restore();
  },
  clear() {
    canvasFor('clear').clearRect(0, 0, W, H);
  },
  line(x1, y1, x2, y2, c, width) {
    nums('line', ['x1', 'y1', 'x2', 'y2'], [x1, y1, x2, y2]);
    const g = canvasFor('line');
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    strokePath(g, c, width);
  },
  drawCircle(x, y, diameter, c, width) {
    nums('drawCircle', ['priemer'], [diameter]);
    strokePath(ellipsePath('drawCircle', x, y, diameter, diameter), c, width);
  },
  fillCircle(x, y, diameter, c) {
    nums('fillCircle', ['priemer'], [diameter]);
    fillPath(ellipsePath('fillCircle', x, y, diameter, diameter), c);
  },
  drawEllipse(x, y, w, h, c, width) {
    strokePath(ellipsePath('drawEllipse', x, y, w, h), c, width);
  },
  fillEllipse(x, y, w, h, c) {
    fillPath(ellipsePath('fillEllipse', x, y, w, h), c);
  },
  drawRectangle(x, y, w, h, c, width) {
    nums('drawRectangle', ['x', 'y', 'šírka', 'výška'], [x, y, w, h]);
    const g = canvasFor('drawRectangle');
    g.beginPath();
    g.rect(x, y, w, h);
    strokePath(g, c, width);
  },
  fillRectangle(x, y, w, h, c) {
    nums('fillRectangle', ['x', 'y', 'šírka', 'výška'], [x, y, w, h]);
    const g = canvasFor('fillRectangle');
    g.fillStyle = color(c, 'black');
    g.fillRect(x, y, w, h);
  },
  drawTriangle(x1, y1, x2, y2, x3, y3, c, width) {
    strokePath(trianglePath('drawTriangle', x1, y1, x2, y2, x3, y3), c, width);
  },
  fillTriangle(x1, y1, x2, y2, x3, y3, c) {
    fillPath(trianglePath('fillTriangle', x1, y1, x2, y2, x3, y3), c);
  },
  point(x, y, c) {
    nums('point', ['x', 'y'], [x, y]);
    const g = canvasFor('point');
    g.fillStyle = color(c, 'black');
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  },
  text(x, y, value, size = 24, c) {
    nums('text', ['x', 'y', 'veľkosť'], [x, y, size]);
    const g = canvasFor('text');
    g.font = `bold ${size}px Nunito, system-ui, sans-serif`;
    g.textBaseline = 'top';
    g.fillStyle = color(c, 'black');
    g.fillText(fmt(value), x, y);
  },
});

// ---- 3D world -------------------------------------------------------------
// The worker keeps its own copy of the blocks, so getBlock() answers right away. Every change
// is also queued as an operation and sent to the page in batches (src/sandbox/voxel/grid.ts),
// which draws the world. The page keeps drawing even while this worker is busy or stopped.

const OP_SET = 1; // keep in sync with src/sandbox/voxel/grid.ts
const OP_FILL = 2;
const OP_CLEAR = 3;
const COLOR_FLAG = 0x8000;
const FLUSH_AT = 30000; // queued numbers; a long loop sends its blocks in parts

let world = null;

function setupWorld(w) {
  world = {
    size: w.size,
    ids: w.ids, // block name (English or Slovak) → id
    names: Object.assign({}, w.names), // id → name returned by getBlock()
    chunks: new Array((w.size / 16) ** 3).fill(null),
    ops: [],
    flushQueued: false,
    known: new Map(), // type string → id (cache)
  };
  self.SIZE = w.size;
}

function flushWorld() {
  if (!world || !world.ops.length) return;
  const ops = Int32Array.from(world.ops);
  world.ops.length = 0;
  send({ type: 'world', ops }, [ops.buffer]);
}

function queue(...nums) {
  const ops = world.ops;
  for (const n of nums) ops.push(n);
  if (ops.length >= FLUSH_AT) flushWorld();
  else if (!world.flushQueued) {
    // also send as soon as the program waits (await sleep, timers) or ends
    world.flushQueued = true;
    native.setTimeout(() => {
      world.flushQueued = false;
      flushWorld();
    }, 0);
  }
}

function worldFor(fname) {
  if (!world) throw new Error(`${fname}() funguje len v 3D svete 🧱`);
  return world;
}

const CHUNKS = 16; // chunks per axis (256 / 16)
const inWorld = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < world.size && y < world.size && z < world.size;
const chunkOf = (x, y, z) => (x >> 4) + (z >> 4) * CHUNKS + (y >> 4) * CHUNKS * CHUNKS;
const cellOf = (x, y, z) => (x & 15) + (z & 15) * 16 + (y & 15) * 256;

function getId(x, y, z) {
  if (!inWorld(x, y, z)) return 0;
  const c = world.chunks[chunkOf(x, y, z)];
  return c ? c[cellOf(x, y, z)] : 0;
}

/** Returns true when the cell changed. */
function setId(x, y, z, id) {
  if (!inWorld(x, y, z)) return false;
  const ci = chunkOf(x, y, z);
  let c = world.chunks[ci];
  if (!c) {
    if (id === 0) return false;
    c = world.chunks[ci] = new Uint16Array(4096);
  }
  const i = cellOf(x, y, z);
  if (c[i] === id) return false;
  c[i] = id;
  return true;
}

let colorCtx = null;

/** CSS color → [r, g, b], or null if it is not a color. */
function parseColor(s) {
  colorCtx = colorCtx || new OffscreenCanvas(1, 1).getContext('2d');
  colorCtx.fillStyle = '#010203';
  colorCtx.fillStyle = s;
  const v = colorCtx.fillStyle;
  if (v === '#010203' && s.replace(/\s/g, '').toLowerCase() !== '#010203') return null;
  if (v[0] === '#') return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Block type ('stone', 'kameň', 'red', 'červená', '#ff8800', 'air', null) → block id. */
function blockId(fname, type) {
  const w = worldFor(fname);
  if (type === undefined) return w.ids.stone;
  if (type === null) return 0;
  if (typeof type !== 'string') {
    throw new Error(`${fname}: typ kocky musí byť text v úvodzovkách, napríklad 'stone' alebo 'red', ale je ${fmt(type, 1)}`);
  }
  if (w.known.has(type)) return w.known.get(type);
  const key = type.trim().toLowerCase();
  let id = w.ids[key];
  if (id === undefined) {
    const rgb = parseColor(colors[key] || key);
    if (!rgb) {
      throw new Error(`${fname}: kocku „${type}“ nepoznám. Skús napríklad 'stone', 'brick', 'gold' alebo farbu ako 'red'.`);
    }
    id = COLOR_FLAG | ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3);
    if (!(id in w.names)) w.names[id] = type; // getBlock() returns the name used first
  }
  w.known.set(type, id);
  return id;
}

function coords(fname, names, values) {
  nums(fname, names, values);
  return values.map(Math.round);
}

Object.assign(self, {
  addBlock(x, y, z, type) {
    [x, y, z] = coords('addBlock', ['x', 'y', 'z'], [x, y, z]);
    const id = blockId('addBlock', type);
    if (setId(x, y, z, id)) queue(OP_SET, x, y, z, id);
  },
  deleteBlock(x, y, z) {
    worldFor('deleteBlock');
    [x, y, z] = coords('deleteBlock', ['x', 'y', 'z'], [x, y, z]);
    if (setId(x, y, z, 0)) queue(OP_SET, x, y, z, 0);
  },
  getBlock(x, y, z) {
    const w = worldFor('getBlock');
    [x, y, z] = coords('getBlock', ['x', 'y', 'z'], [x, y, z]);
    const id = getId(x, y, z);
    return id ? w.names[id] : null;
  },
  fill(x1, y1, z1, x2, y2, z2, type) {
    let c = coords('fill', ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'], [x1, y1, z1, x2, y2, z2]);
    const id = blockId('fill', type);
    const max = world.size - 1;
    const lo = (a, b) => Math.max(0, Math.min(a, b));
    const hi = (a, b) => Math.min(max, Math.max(a, b));
    c = [lo(c[0], c[3]), lo(c[1], c[4]), lo(c[2], c[5]), hi(c[0], c[3]), hi(c[1], c[4]), hi(c[2], c[5])];
    if (c[0] > c[3] || c[1] > c[4] || c[2] > c[5]) return; // completely outside the world
    for (let y = c[1]; y <= c[4]; y++) for (let z = c[2]; z <= c[5]; z++) for (let x = c[0]; x <= c[3]; x++) setId(x, y, z, id);
    queue(OP_FILL, ...c, id);
  },
  clearWorld() {
    const w = worldFor('clearWorld');
    w.chunks.fill(null);
    w.ops.length = 0; // nothing queued matters any more
    queue(OP_CLEAR);
  },
});

// ---- run ----------------------------------------------------------------

self.onmessage = (e) => {
  const m = e.data;
  if (m.type !== 'run') return;
  colors = m.colors || {};
  if (m.canvas) {
    ctx = m.canvas.getContext('2d');
    W = m.width;
    H = m.height;
    self.WIDTH = W;
    self.HEIGHT = H;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  if (m.world) setupWorld(m.world);
  // Wrapping in an async function lets kids use `await sleep(…)` anywhere.
  const src = `(async () => {\n${m.code}\n})().then(() => { self.__kuboMainDone(); }, (e) => { self.__kuboFail(e); });`;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  try {
    importScripts(url);
  } catch (err) {
    fail(err);
  }
};

self.__kuboMainDone = () => {
  mainDone = true;
  checkDone();
};
self.__kuboFail = fail;
