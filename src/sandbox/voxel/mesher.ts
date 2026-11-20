// Turns one 16×16×16 chunk of the world into triangles. Only faces next to an empty cell
// are drawn, so a solid wall costs only its surface. Each vertex gets a brightness made of
// a fixed shade per face direction (the sun is static) and a small "ambient occlusion"
// darkening in corners, which makes blocks easy to tell apart. No three.js here, so it can be unit-tested.

import { AIR, lookOf } from './blocks';
import { CHUNK, CHUNKS, SIZE, type VoxelGrid } from './grid';

export interface ChunkMesh {
  /** x, y, z per vertex */
  positions: Float32Array;
  /** u, v, texture layer per vertex */
  uvl: Float32Array;
  /** brightness per vertex (0–1) */
  light: Float32Array;
  /** r, g, b per vertex (0–255) */
  tint: Uint8Array;
  indices: Uint16Array;
}

type V3 = readonly [number, number, number];

interface Face {
  normal: V3;
  /** u direction along the face */
  t: V3;
  /** v direction along the face */
  b: V3;
  /** corner of the unit cube where u = 0 and v = 0 */
  origin: V3;
  /** 0 = top, 1 = bottom, 2 = side (index into Look.layers) */
  layer: 0 | 1 | 2;
  shade: number;
}

// t × b = normal, so the corners (0,0) (1,0) (1,1) (0,1) go counter-clockwise seen from outside.
// The sun shines from +x, +y, +z, so those faces are brighter.
export const FACES: Face[] = [
  { normal: [1, 0, 0], t: [0, 0, -1], b: [0, 1, 0], origin: [1, 0, 1], layer: 2, shade: 0.86 },
  { normal: [-1, 0, 0], t: [0, 0, 1], b: [0, 1, 0], origin: [0, 0, 0], layer: 2, shade: 0.66 },
  { normal: [0, 1, 0], t: [1, 0, 0], b: [0, 0, -1], origin: [0, 1, 1], layer: 0, shade: 1 },
  { normal: [0, -1, 0], t: [1, 0, 0], b: [0, 0, 1], origin: [0, 0, 0], layer: 1, shade: 0.5 },
  { normal: [0, 0, 1], t: [1, 0, 0], b: [0, 1, 0], origin: [0, 0, 1], layer: 2, shade: 0.78 },
  { normal: [0, 0, -1], t: [-1, 0, 0], b: [0, 1, 0], origin: [1, 0, 0], layer: 2, shade: 0.6 },
];

const CORNERS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** Brightness by the number of blocks around a corner: 0 (open) … 3 (deep corner). */
const AO = [1, 0.8, 0.66, 0.52];

/** Below the world is the grass floor; it hides bottom faces and casts corner shadows. */
function solid(grid: VoxelGrid, x: number, y: number, z: number) {
  if (y < 0) return x >= 0 && z >= 0 && x < SIZE && z < SIZE;
  return grid.get(x, y, z) !== AIR;
}

/** Builds the mesh of chunk [cx, cy, cz]; null if it has no visible face. */
export function meshChunk(grid: VoxelGrid, cx: number, cy: number, cz: number): ChunkMesh | null {
  if (!grid.counts[cx + cz * CHUNKS + cy * CHUNKS * CHUNKS]) return null;
  if (isBuriedChunk(grid, cx, cy, cz)) return null;

  const positions: number[] = [];
  const uvl: number[] = [];
  const light: number[] = [];
  const tint: number[] = [];
  const indices: number[] = [];

  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const z0 = cz * CHUNK;
  for (let y = y0; y < y0 + CHUNK; y++)
    for (let z = z0; z < z0 + CHUNK; z++)
      for (let x = x0; x < x0 + CHUNK; x++) {
        const id = grid.get(x, y, z);
        if (id === AIR) continue;
        const look = lookOf(id);
        for (const f of FACES) {
          const [nx, ny, nz] = f.normal;
          if (solid(grid, x + nx, y + ny, z + nz)) continue;

          const ao = CORNERS.map(([cu, cv]) => {
            if (look.emissive) return 0;
            // the cells just outside the face, around this corner
            const su = cu ? 1 : -1;
            const sv = cv ? 1 : -1;
            const ox = x + nx;
            const oy = y + ny;
            const oz = z + nz;
            const side1 = solid(grid, ox + f.t[0] * su, oy + f.t[1] * su, oz + f.t[2] * su);
            const side2 = solid(grid, ox + f.b[0] * sv, oy + f.b[1] * sv, oz + f.b[2] * sv);
            if (side1 && side2) return 3;
            const corner = solid(
              grid,
              ox + f.t[0] * su + f.b[0] * sv,
              oy + f.t[1] * su + f.b[1] * sv,
              oz + f.t[2] * su + f.b[2] * sv,
            );
            return Number(side1) + Number(side2) + Number(corner);
          });

          const base = positions.length / 3;
          CORNERS.forEach(([cu, cv], k) => {
            positions.push(
              x + f.origin[0] + f.t[0] * cu + f.b[0] * cv,
              y + f.origin[1] + f.t[1] * cu + f.b[1] * cv,
              z + f.origin[2] + f.t[2] * cu + f.b[2] * cv,
            );
            uvl.push(cu, cv, look.layers[f.layer]);
            light.push(look.emissive ? 1 : f.shade * AO[ao[k]]);
            tint.push(...look.tint);
          });
          // split the quad along the diagonal that keeps the corner shadows smooth
          if (ao[0] + ao[2] > ao[1] + ao[3]) indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }

  if (!indices.length) return null;
  return {
    positions: new Float32Array(positions),
    uvl: new Float32Array(uvl),
    light: new Float32Array(light),
    tint: new Uint8Array(tint),
    indices: new Uint16Array(indices),
  };
}

/** A full chunk surrounded by full chunks (or the floor) has no visible face; skip it quickly. */
function isBuriedChunk(grid: VoxelGrid, cx: number, cy: number, cz: number) {
  const full = (x: number, y: number, z: number) => {
    if (y < 0) return true;
    if (x < 0 || z < 0 || x >= CHUNKS || y >= CHUNKS || z >= CHUNKS) return false;
    return grid.isFull(x, y, z);
  };
  return (
    full(cx, cy, cz) &&
    full(cx + 1, cy, cz) &&
    full(cx - 1, cy, cz) &&
    full(cx, cy + 1, cz) &&
    full(cx, cy - 1, cz) &&
    full(cx, cy, cz + 1) &&
    full(cx, cy, cz - 1)
  );
}
