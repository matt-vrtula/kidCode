import { describe, expect, it } from 'vitest';
import { AIR, COLOR_FLAG, colorOf, lookOf } from './blocks';
import { CHUNK, OP_CLEAR, OP_FILL, OP_SET, SIZE, VoxelGrid, chunkIndex } from './grid';
import { meshChunk } from './mesher';

const STONE = 3;
const LAMP = 15;
const faces = (m: ReturnType<typeof meshChunk>) => (m ? m.indices.length / 6 : 0);

describe('VoxelGrid', () => {
  it('stores blocks and counts them', () => {
    const g = new VoxelGrid();
    expect(g.get(5, 0, 5)).toBe(AIR);
    expect(g.set(5, 0, 5, STONE)).toBe(true);
    expect(g.set(5, 0, 5, STONE)).toBe(false);
    expect(g.get(5, 0, 5)).toBe(STONE);
    expect(g.total).toBe(1);
    g.set(5, 0, 5, AIR);
    expect(g.total).toBe(0);
    expect(g.chunks[chunkIndex(0, 0, 0)]).toBeNull(); // empty chunks are freed
  });

  it('ignores blocks outside the world', () => {
    const g = new VoxelGrid();
    expect(g.set(0, -1, 0, STONE)).toBe(false);
    expect(g.set(SIZE, 0, 0, STONE)).toBe(false);
    expect(g.total).toBe(0);
  });

  it('fills a box in any corner order and clips it to the world', () => {
    const g = new VoxelGrid();
    g.fill(3, 2, 3, -5, -4, 0, STONE); // x -5..3, y -4..2, z 0..3
    expect(g.total).toBe(4 * 3 * 4);
    expect(g.get(0, 0, 0)).toBe(STONE);
    expect(g.get(3, 2, 3)).toBe(STONE);
    g.fill(0, 0, 0, SIZE + 10, SIZE + 10, SIZE + 10, AIR);
    expect(g.total).toBe(0);
  });

  it('fills across chunk borders', () => {
    const g = new VoxelGrid();
    g.fill(10, 10, 10, 40, 20, 33, STONE);
    expect(g.total).toBe(31 * 11 * 24);
    expect(g.get(40, 20, 33)).toBe(STONE);
    expect(g.get(41, 20, 33)).toBe(AIR);
  });

  it('marks neighbor chunks dirty when a block is on a chunk border', () => {
    const g = new VoxelGrid();
    g.set(CHUNK - 1, 0, 5, STONE);
    expect(g.dirty).toEqual(new Set([chunkIndex(0, 0, 0), chunkIndex(1, 0, 0)]));
  });

  it('applies operations from the worker', () => {
    const g = new VoxelGrid();
    g.apply(new Int32Array([OP_SET, 1, 2, 3, STONE, OP_FILL, 0, 0, 0, 1, 1, 1, LAMP]));
    expect(g.get(1, 2, 3)).toBe(STONE);
    expect(g.get(1, 1, 1)).toBe(LAMP);
    expect(g.total).toBe(9);
    g.apply(new Int32Array([OP_CLEAR, OP_SET, 7, 7, 7, STONE]));
    expect(g.total).toBe(1);
  });
});

describe('meshChunk', () => {
  it('hides the bottom face of a block standing on the grass', () => {
    const g = new VoxelGrid();
    g.set(5, 0, 5, STONE);
    expect(faces(meshChunk(g, 0, 0, 0))).toBe(5);
  });

  it('draws all 6 faces of a floating block', () => {
    const g = new VoxelGrid();
    g.set(5, 3, 5, STONE);
    expect(faces(meshChunk(g, 0, 0, 0))).toBe(6);
  });

  it('hides faces between neighbors, also across chunks', () => {
    const g = new VoxelGrid();
    g.set(CHUNK - 1, 3, 5, STONE);
    g.set(CHUNK, 3, 5, STONE);
    expect(faces(meshChunk(g, 0, 0, 0))).toBe(5);
    expect(faces(meshChunk(g, 1, 0, 0))).toBe(5);
  });

  it('skips empty chunks and chunks buried under other full chunks', () => {
    const g = new VoxelGrid();
    expect(meshChunk(g, 0, 0, 0)).toBeNull();
    g.fill(0, 0, 0, 3 * CHUNK - 1, 2 * CHUNK - 1, 3 * CHUNK - 1, STONE);
    expect(meshChunk(g, 1, 0, 1)).toBeNull(); // floor below, full chunks on every side and on top
    expect(meshChunk(g, 1, 1, 1)).not.toBeNull(); // its top is open
    expect(meshChunk(g, 0, 0, 0)).not.toBeNull(); // at the edge of the world
  });

  it('darkens corners next to other blocks, but not glowing blocks', () => {
    const g = new VoxelGrid();
    g.set(5, 0, 5, STONE);
    const m = meshChunk(g, 0, 0, 0)!;
    // side faces: the corners touching the grass are darker than the top ones
    const lights = [...m.light];
    const ys = [...m.positions].filter((_, i) => i % 3 === 1);
    const bottom = lights.filter((_, i) => ys[i] === 0);
    const top = lights.filter((_, i) => ys[i] === 1);
    expect(Math.max(...bottom)).toBeLessThan(Math.min(...top.filter((l) => l < 1)));

    g.set(5, 0, 5, LAMP);
    expect(new Set(meshChunk(g, 0, 0, 0)!.light)).toEqual(new Set([1]));
  });

  it('tints colored blocks', () => {
    const red = COLOR_FLAG | (31 << 10);
    expect(colorOf(red)).toEqual([255, 0, 0]);
    expect(lookOf(red).tint).toEqual([255, 0, 0]);
    const g = new VoxelGrid();
    g.set(1, 1, 1, red);
    expect([...meshChunk(g, 0, 0, 0)!.tint.slice(0, 3)]).toEqual([255, 0, 0]);
  });
});
