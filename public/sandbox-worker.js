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

const send = (msg) => postMessage(msg);

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
