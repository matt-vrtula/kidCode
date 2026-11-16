import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { runProgram } from './runner';

describe('levels', () => {
  it('have unique ids', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    it(`${level.id} ${level.title} is solvable`, () => {
      const r = runProgram(level.solution, level);
      expect(r.error).toBeUndefined();
      expect(r.wrongCells ?? []).toEqual([]);
      expect(r.outcome).toBe(level.free ? 'drawn' : 'won');
      expect(r.diamonds).toBe(r.totalDiamonds);
    });

    it(`${level.id} has a rectangular map with one start`, () => {
      const width = level.map[0].length;
      expect(level.map.every((row) => row.length === width)).toBe(true);
      expect(level.map.join('').match(/[\^>v<]/g)).toHaveLength(1);
      if (level.chapter === 'maze') expect(level.map.join('').match(/G/g)).toHaveLength(1);
      if (level.target) {
        expect(level.target).toHaveLength(level.map.length);
        expect(level.target.every((row) => row.length === width)).toBe(true);
      }
    });
  }
});

describe('runner outcomes', () => {
  const [l1, , , l4] = LEVELS;
  const d1 = LEVELS.find((l) => l.id === 'd1')!;

  it('stops short of the goal', () => {
    expect(runProgram('chodDopredu();', l1).outcome).toBe('notThere');
  });

  it('crashes into stone', () => {
    const r = runProgram('chodDopredu(); chodDopredu();', l4);
    expect(r.outcome).toBe('crashed');
    expect(r.crashedInto).toBe('S');
  });

  it('falls into lava', () => {
    expect(runProgram('otocVlavo(); chodDopredu();', l4).outcome).toBe('burned');
  });

  it('catches an infinite loop without actions', () => {
    expect(runProgram('while (true) { loopTrap(); }', l1).outcome).toBe('tooLong');
  });

  it('catches an infinite loop of turning', () => {
    expect(runProgram('while (!somVCieli()) { loopTrap(); otocVlavo(); }', l1).outcome).toBe('tooLong');
  });

  it('reports which cells of a drawing are wrong', () => {
    const r = runProgram("farba('červená'); namaluj(); chodDopredu(); namaluj();", d1);
    expect(r.outcome).toBe('wrongPicture');
    // 2 painted red instead of black, 2 black cells missing
    expect(r.wrongCells).toHaveLength(4);
  });

  it('cannot walk off the canvas', () => {
    expect(runProgram('for (let i = 0; i < 9; i++) chodDopredu();', d1).outcome).toBe('crashed');
  });

  it('rejects an unknown color', () => {
    const r = runProgram("farba('zlatá');", d1);
    expect(r.outcome).toBe('error');
    expect(r.error).toContain('zlatá');
  });
});
