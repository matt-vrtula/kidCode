import { DEFAULT_PEN } from './colors';

// Tiles: . grass, T tree, S stone (can be mined), B bedrock, L lava, W water, D diamond, G goal portal
export type Tile = '.' | 'T' | 'S' | 'B' | 'L' | 'W' | 'D' | 'G';
// 0 = north (up), 1 = east, 2 = south, 3 = west
export type Dir = 0 | 1 | 2 | 3;

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export type Chapter = 'maze' | 'draw';

export interface Level {
  id: string;
  chapter: Chapter;
  title: string;
  hint: string;
  /** Rows of tiles. The player start is one of ^ > v < (standing on grass). */
  map: string[];
  /** Block types offered in the toolbox. */
  toolbox: string[];
  /** Max number of blocks (excluding the start block) for the "short program" star. */
  par: number;
  /** Reference solution, used by tests to prove the level is solvable. */
  solution: string;
  /** Drawing levels: the picture to paint, one color char per cell (see colors.ts), '.' = empty. */
  target?: string[];
  /** Drawing level with no target picture: just draw for fun. */
  free?: boolean;
}

const START_DIRS: Record<string, Dir> = { '^': 0, '>': 1, v: 2, '<': 3 };

export const isPath = (t: Tile) => t === '.' || t === 'D' || t === 'G';
export const isRaised = (t: Tile) => t === 'T' || t === 'S' || t === 'B';

export class World {
  diamonds = 0;
  /** Painted color name per cell (drawing chapter). */
  paint: (string | null)[][];
  pen = DEFAULT_PEN;

  constructor(
    public tiles: Tile[][],
    public x: number,
    public y: number,
    public dir: Dir,
    public totalDiamonds: number,
  ) {
    this.paint = tiles.map((row) => row.map(() => null));
  }

  static fromLevel(level: Level): World {
    let x = 0;
    let y = 0;
    let dir: Dir = 1;
    let total = 0;
    const tiles = level.map.map((row, ry) =>
      [...row].map((ch, rx): Tile => {
        if (ch in START_DIRS) {
          x = rx;
          y = ry;
          dir = START_DIRS[ch];
          return '.';
        }
        if (ch === 'D') total++;
        return ch as Tile;
      }),
    );
    return new World(tiles, x, y, dir, total);
  }

  get width() {
    return this.tiles[0].length;
  }

  get height() {
    return this.tiles.length;
  }

  tile(x: number, y: number): Tile {
    return this.tiles[y]?.[x] ?? 'B';
  }

  set(x: number, y: number, t: Tile) {
    this.tiles[y][x] = t;
  }

  /** The cell next to the player; turn -1 = left, 0 = ahead, 1 = right. */
  ahead(turn = 0) {
    const d = (this.dir + turn + 4) % 4;
    return { x: this.x + DX[d], y: this.y + DY[d] };
  }

  aheadTile(turn = 0): Tile {
    const p = this.ahead(turn);
    return this.tile(p.x, p.y);
  }
}
