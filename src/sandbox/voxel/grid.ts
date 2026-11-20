// The blocks of the 🧱 3D world, stored in 16×16×16 chunks that are allocated only when
// something is built in them (a full 256³ world would take 32 MB, most of it empty air).
// The kid's code runs in public/sandbox-worker.js, which keeps its own copy of the blocks
// (so getBlock() can answer right away) and sends every change here as a list of operations.

import { AIR } from './blocks';

export const SIZE = 256;
export const CHUNK = 16;
/** Chunks per axis. */
export const CHUNKS = SIZE / CHUNK;
const CHUNK_CELLS = CHUNK * CHUNK * CHUNK;

// Operation codes in the messages from the worker; keep in sync with sandbox-worker.js.
export const OP_SET = 1; // x, y, z, id
export const OP_FILL = 2; // x1, y1, z1, x2, y2, z2, id (inclusive, x1 <= x2 …, already inside the world)
export const OP_CLEAR = 3;

export const chunkIndex = (cx: number, cy: number, cz: number) => cx + cz * CHUNKS + cy * CHUNKS * CHUNKS;
export const cellIndex = (lx: number, ly: number, lz: number) => lx + lz * CHUNK + ly * CHUNK * CHUNK;
export const inWorld = (x: number, y: number, z: number) =>
  x >= 0 && y >= 0 && z >= 0 && x < SIZE && y < SIZE && z < SIZE;

export class VoxelGrid {
  readonly chunks: (Uint16Array | null)[] = new Array(CHUNKS ** 3).fill(null);
  /** Number of blocks per chunk. */
  readonly counts = new Uint16Array(CHUNKS ** 3);
  /** Chunks whose mesh must be rebuilt. */
  readonly dirty = new Set<number>();
  total = 0;

  get(x: number, y: number, z: number): number {
    if (!inWorld(x, y, z)) return AIR;
    const c = this.chunks[chunkIndex(x >> 4, y >> 4, z >> 4)];
    return c ? c[cellIndex(x & 15, y & 15, z & 15)] : AIR;
  }

  /** Returns false when nothing changed. Cells outside the world are ignored. */
  set(x: number, y: number, z: number, id: number): boolean {
    if (!inWorld(x, y, z)) return false;
    const ci = chunkIndex(x >> 4, y >> 4, z >> 4);
    let c = this.chunks[ci];
    if (!c) {
      if (id === AIR) return false;
      c = this.chunks[ci] = new Uint16Array(CHUNK_CELLS);
    }
    const i = cellIndex(x & 15, y & 15, z & 15);
    const old = c[i];
    if (old === id) return false;
    c[i] = id;
    this.count(ci, Number(id !== AIR) - Number(old !== AIR));
    this.markDirty(x, y, z, x, y, z);
    return true;
  }

  /** Fills a box (inclusive corners, in any order); the part outside the world is ignored. */
  fill(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, id: number) {
    const lo = (a: number, b: number) => Math.max(0, Math.min(a, b));
    const hi = (a: number, b: number) => Math.min(SIZE - 1, Math.max(a, b));
    [x1, x2] = [lo(x1, x2), hi(x1, x2)];
    [y1, y2] = [lo(y1, y2), hi(y1, y2)];
    [z1, z2] = [lo(z1, z2), hi(z1, z2)];
    if (x1 > x2 || y1 > y2 || z1 > z2) return;
    for (let cy = y1 >> 4; cy <= y2 >> 4; cy++)
      for (let cz = z1 >> 4; cz <= z2 >> 4; cz++)
        for (let cx = x1 >> 4; cx <= x2 >> 4; cx++) {
          const ci = chunkIndex(cx, cy, cz);
          let c = this.chunks[ci];
          if (!c) {
            if (id === AIR) continue;
            c = this.chunks[ci] = new Uint16Array(CHUNK_CELLS);
          }
          // the part of the box inside this chunk, in chunk-local coordinates
          const [ax, bx] = [Math.max(x1 - cx * CHUNK, 0), Math.min(x2 - cx * CHUNK, CHUNK - 1)];
          const [ay, by] = [Math.max(y1 - cy * CHUNK, 0), Math.min(y2 - cy * CHUNK, CHUNK - 1)];
          const [az, bz] = [Math.max(z1 - cz * CHUNK, 0), Math.min(z2 - cz * CHUNK, CHUNK - 1)];
          let delta = 0;
          for (let ly = ay; ly <= by; ly++)
            for (let lz = az; lz <= bz; lz++) {
              const row = cellIndex(0, ly, lz);
              for (let lx = ax; lx <= bx; lx++) {
                const old = c[row + lx];
                delta += Number(id !== AIR) - Number(old !== AIR);
                c[row + lx] = id;
              }
            }
          this.count(ci, delta);
        }
    this.markDirty(x1, y1, z1, x2, y2, z2);
  }

  clear() {
    this.chunks.forEach((c, ci) => {
      if (c) this.dirty.add(ci);
    });
    this.chunks.fill(null);
    this.counts.fill(0);
    this.total = 0;
  }

  /** Applies the operations sent by the worker. */
  apply(ops: Int32Array) {
    let i = 0;
    while (i < ops.length) {
      switch (ops[i]) {
        case OP_SET:
          this.set(ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4]);
          i += 5;
          break;
        case OP_FILL:
          this.fill(ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5], ops[i + 6], ops[i + 7]);
          i += 8;
          break;
        case OP_CLEAR:
          this.clear();
          i += 1;
          break;
        default:
          throw new Error(`Unknown world operation ${ops[i]}`);
      }
    }
  }

  isFull(cx: number, cy: number, cz: number) {
    return this.counts[chunkIndex(cx, cy, cz)] === CHUNK_CELLS;
  }

  private count(ci: number, delta: number) {
    this.counts[ci] += delta;
    this.total += delta;
    if (this.counts[ci] === 0) this.chunks[ci] = null;
  }

  /**
   * Marks the chunks touching a changed box, including neighbors one block away:
   * their hidden faces and corner shadows depend on the blocks next to them.
   */
  private markDirty(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    const from = (v: number) => Math.max(0, (v - 1) >> 4);
    const to = (v: number) => Math.min(CHUNKS - 1, (v + 1) >> 4);
    for (let cy = from(y1); cy <= to(y2); cy++)
      for (let cz = from(z1); cz <= to(z2); cz++)
        for (let cx = from(x1); cx <= to(x2); cx++) this.dirty.add(chunkIndex(cx, cy, cz));
  }
}
