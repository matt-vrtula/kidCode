import { COLOR_BY_CHAR, COLOR_BY_NAME } from './colors';
import { World, isPath, type Dir, type Level, type Tile } from './world';

export type Point = { x: number; y: number };

export type Step =
  | { kind: 'move'; blockId: string | null; from: Point; to: Point; collected: boolean }
  | { kind: 'turn'; blockId: string | null; delta: -1 | 1 }
  | { kind: 'mine'; blockId: string | null; at: Point; hit: boolean }
  | { kind: 'bump'; blockId: string | null; at: Point }
  | { kind: 'fall'; blockId: string | null; from: Point; to: Point; into: 'L' | 'W' }
  | { kind: 'paint'; blockId: string | null; at: Point; color: string }
  | { kind: 'color'; blockId: string | null; color: string };

export type Outcome =
  | 'won'
  | 'notThere'
  | 'crashed'
  | 'burned'
  | 'drowned'
  | 'tooLong'
  | 'error'
  /** Drawing level finished, but the picture differs from the target. */
  | 'wrongPicture'
  /** Free drawing level finished. */
  | 'drawn';

export interface RunResult {
  steps: Step[];
  outcome: Outcome;
  diamonds: number;
  totalDiamonds: number;
  crashedInto?: Tile;
  error?: string;
  /** Cells that differ from the target picture. */
  wrongCells?: Point[];
}

/** Functions the kid's program can call. Names are Slovak so the generated JS reads naturally. */
export const API_NAMES = [
  'chodDopredu',
  'otocVlavo',
  'otocVpravo',
  'vykop',
  'jeCestaVpredu',
  'jeCestaVlavo',
  'jeCestaVpravo',
  'jeKamenVpredu',
  'somVCieli',
  'namaluj',
  'farba',
] as const;

const MAX_STEPS = 1500;
const MAX_LOOPS = 5000;

class Stop extends Error {}

function diffPicture(w: World, target: string[]): Point[] {
  const wrong: Point[] = [];
  w.paint.forEach((row, y) =>
    row.forEach((painted, x) => {
      const want = COLOR_BY_CHAR[target[y]?.[x] ?? '.']?.name ?? null;
      if (painted !== want) wrong.push({ x, y });
    }),
  );
  return wrong;
}

/**
 * Runs the program instantly against a simulated world and records every action.
 * The renderer then replays the recorded steps as an animation.
 */
export function runProgram(code: string, level: Level): RunResult {
  const w = World.fromLevel(level);
  const st = {
    steps: [] as Step[],
    blockId: null as string | null,
    outcome: null as Outcome | null,
    crashedInto: undefined as Tile | undefined,
    error: undefined as string | undefined,
    loops: 0,
  };

  const finish = (o: Outcome): never => {
    st.outcome = o;
    throw new Stop();
  };
  const push = (s: Step) => {
    if (st.steps.length >= MAX_STEPS) finish('tooLong');
    st.steps.push(s);
  };
  const turn = (delta: -1 | 1) => {
    w.dir = ((w.dir + delta + 4) % 4) as Dir;
    push({ kind: 'turn', blockId: st.blockId, delta });
  };

  const api: Record<(typeof API_NAMES)[number], (arg?: unknown) => unknown> = {
    chodDopredu: () => {
      const from = { x: w.x, y: w.y };
      const to = w.ahead();
      const t = w.tile(to.x, to.y);
      if (t === 'L' || t === 'W') {
        push({ kind: 'fall', blockId: st.blockId, from, to, into: t });
        finish(t === 'L' ? 'burned' : 'drowned');
      }
      if (!isPath(t)) {
        st.crashedInto = t;
        push({ kind: 'bump', blockId: st.blockId, at: to });
        finish('crashed');
      }
      w.x = to.x;
      w.y = to.y;
      const collected = t === 'D';
      if (collected) {
        w.set(to.x, to.y, '.');
        w.diamonds++;
      }
      push({ kind: 'move', blockId: st.blockId, from, to, collected });
      if (t === 'G') finish('won');
    },
    otocVlavo: () => turn(-1),
    otocVpravo: () => turn(1),
    vykop: () => {
      const at = w.ahead();
      const hit = w.tile(at.x, at.y) === 'S';
      if (hit) w.set(at.x, at.y, '.');
      push({ kind: 'mine', blockId: st.blockId, at, hit });
    },
    jeCestaVpredu: () => isPath(w.aheadTile(0)),
    jeCestaVlavo: () => isPath(w.aheadTile(-1)),
    jeCestaVpravo: () => isPath(w.aheadTile(1)),
    jeKamenVpredu: () => w.aheadTile(0) === 'S',
    somVCieli: () => w.tile(w.x, w.y) === 'G',
    namaluj: () => {
      w.paint[w.y][w.x] = w.pen;
      push({ kind: 'paint', blockId: st.blockId, at: { x: w.x, y: w.y }, color: w.pen });
    },
    farba: (color) => {
      if (typeof color !== 'string' || !COLOR_BY_NAME[color]) throw new Error(`Neznáma farba: ${String(color)}`);
      w.pen = color;
      push({ kind: 'color', blockId: st.blockId, color });
    },
  };

  try {
    const fn = new Function(...API_NAMES, 'highlightBlock', 'loopTrap', `"use strict";\n${code}`);
    fn(
      ...API_NAMES.map((n) => api[n]),
      (id: string) => {
        st.blockId = id;
      },
      () => {
        if (++st.loops > MAX_LOOPS) finish('tooLong');
      },
    );
  } catch (e) {
    if (!(e instanceof Stop)) {
      st.outcome = 'error';
      st.error = e instanceof Error ? e.message : String(e);
    }
  }

  let wrongCells: Point[] | undefined;
  if (!st.outcome && level.chapter === 'draw') {
    if (level.free) {
      st.outcome = 'drawn';
    } else {
      wrongCells = diffPicture(w, level.target ?? []);
      st.outcome = wrongCells.length ? 'wrongPicture' : 'won';
    }
  }

  return {
    steps: st.steps,
    wrongCells,
    outcome: st.outcome ?? 'notThere',
    diamonds: w.diamonds,
    totalDiamonds: w.totalDiamonds,
    crashedInto: st.crashedInto,
    error: st.error,
  };
}
