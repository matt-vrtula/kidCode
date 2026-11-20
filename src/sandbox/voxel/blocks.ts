// Block types of the 🧱 3D world and their pixel-art textures, all generated in code.
// No three.js here: the sandbox also uses this file for the block swatches in the reference.

/** Texture resolution in pixels per block face. */
export const TEX = 16;

/** Block id 0 is an empty cell. */
export const AIR = 0;
/** Ids with this bit set are plain colored blocks; the low 15 bits are the color as RGB 5-5-5. */
export const COLOR_FLAG = 0x8000;

export interface BlockType {
  id: number;
  name: string;
  /** Slovak alias, works in addBlock too. */
  sk: string;
  /** Texture layers: top, bottom, sides. */
  top: Layer;
  bottom: Layer;
  side: Layer;
  /** Glows: no face shading, no shadows in corners. */
  emissive?: boolean;
}

type Layer = (typeof LAYERS)[number];

export const LAYERS = [
  'grass_top',
  'grass_side',
  'dirt',
  'stone',
  'planks',
  'log_side',
  'log_top',
  'leaves',
  'sand',
  'brick',
  'bedrock',
  'gold',
  'diamond',
  'lava',
  'water',
  'snow',
  'lamp',
  'portal',
  'glass',
  'wool',
] as const;

export const layerIndex = (l: Layer) => LAYERS.indexOf(l);

const all = (l: Layer) => ({ top: l, bottom: l, side: l });

export const BLOCKS: BlockType[] = [
  { id: 1, name: 'grass', sk: 'tráva', top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
  { id: 2, name: 'dirt', sk: 'hlina', ...all('dirt') },
  { id: 3, name: 'stone', sk: 'kameň', ...all('stone') },
  { id: 4, name: 'planks', sk: 'dosky', ...all('planks') },
  { id: 5, name: 'wood', sk: 'drevo', top: 'log_top', bottom: 'log_top', side: 'log_side' },
  { id: 6, name: 'leaves', sk: 'lístie', ...all('leaves') },
  { id: 7, name: 'sand', sk: 'piesok', ...all('sand') },
  { id: 8, name: 'brick', sk: 'tehla', ...all('brick') },
  { id: 9, name: 'bedrock', sk: 'skala', ...all('bedrock') },
  { id: 10, name: 'gold', sk: 'zlato', ...all('gold') },
  { id: 11, name: 'diamond', sk: 'diamant', ...all('diamond') },
  { id: 12, name: 'lava', sk: 'láva', ...all('lava'), emissive: true },
  { id: 13, name: 'water', sk: 'voda', ...all('water') },
  { id: 14, name: 'snow', sk: 'sneh', ...all('snow') },
  { id: 15, name: 'lamp', sk: 'lampa', ...all('lamp'), emissive: true },
  { id: 16, name: 'portal', sk: 'portál', ...all('portal'), emissive: true },
  // not see-through, just drawn to look like glass
  { id: 17, name: 'glass', sk: 'sklo', ...all('glass') },
];

export const DEFAULT_BLOCK = 'stone';

/** Names (English and Slovak) → id, for the worker. 'air' clears a cell. */
export function blockIds(): Record<string, number> {
  const ids: Record<string, number> = { air: AIR, vzduch: AIR };
  for (const b of BLOCKS) ids[b.name] = ids[b.sk] = b.id;
  return ids;
}

const BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));

export interface Look {
  /** Texture layer per face: top, bottom, sides. */
  layers: [number, number, number];
  emissive: boolean;
  /** Color multiplier, 0–255 per channel. */
  tint: [number, number, number];
}

const looks = new Map<number, Look>();
const WHITE: [number, number, number] = [255, 255, 255];

/** How a block id is drawn. Unknown ids are drawn as stone. */
export function lookOf(id: number): Look {
  let look = looks.get(id);
  if (look) return look;
  if (id & COLOR_FLAG) {
    const wool = layerIndex('wool');
    look = { layers: [wool, wool, wool], emissive: false, tint: colorOf(id) };
  } else {
    const b = BY_ID.get(id) ?? BY_ID.get(3)!;
    look = { layers: [layerIndex(b.top), layerIndex(b.bottom), layerIndex(b.side)], emissive: !!b.emissive, tint: WHITE };
  }
  looks.set(id, look);
  return look;
}

/** RGB of a colored block id (5 bits per channel, scaled back to 0–255). */
export function colorOf(id: number): [number, number, number] {
  const ch = (shift: number) => {
    const v = (id >> shift) & 31;
    return (v << 3) | (v >> 2);
  };
  return [ch(10), ch(5), ch(0)];
}

// ---- textures -------------------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Painter = (g: CanvasRenderingContext2D, r: () => number) => void;

const px = (g: CanvasRenderingContext2D, x: number, y: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(x, y, 1, 1);
};
const pick = (r: () => number, pal: string[]) => pal[Math.floor(r() * pal.length)];

const noise =
  (pal: string[]): Painter =>
  (g, r) => {
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) px(g, x, y, pick(r, pal));
  };

/** Noise with a darker frame: individual blocks stay visible in a big wall of the same block. */
const framed =
  (pal: string[], edge: string): Painter =>
  (g, r) => {
    noise(pal)(g, r);
    for (let i = 0; i < TEX; i++) {
      px(g, i, 0, edge);
      px(g, i, TEX - 1, edge);
      px(g, 0, i, edge);
      px(g, TEX - 1, i, edge);
    }
  };

const PAL = {
  grass: ['#5fa83a', '#5fa83a', '#6cb944', '#56993a', '#73c24b', '#4e8f33'],
  dirt: ['#8a5a32', '#7a4e2a', '#966640', '#6e4524', '#a0703f', '#8a5a32'],
  stone: ['#8a8a8a', '#7b7b7b', '#969696', '#6e6e6e', '#8a8a8a', '#a3a3a3'],
  leaves: ['#2e6b1e', '#367a24', '#285e1a', '#3f8a2a', '#21501a', '#4a9a30'],
  sand: ['#e3d29b', '#d9c78c', '#ecdcaa', '#d2bd80', '#e3d29b'],
  bedrock: ['#3b3b3b', '#2a2a2a', '#555555', '#1e1e1e', '#454545'],
  lava: ['#ff7a00', '#ff9500', '#e85d00', '#ffb12b', '#ff7a00', '#ffd25a'],
  water: ['#2e63d6', '#3a72e6', '#2856bd', '#4a85f0', '#2e63d6', '#6a9cf5'],
  snow: ['#f4f8fb', '#e8eef3', '#ffffff', '#dfe7ee', '#f4f8fb'],
  portal: ['#7b2ff7', '#9b4dff', '#5a17c2', '#c27bff', '#7b2ff7', '#e0b0ff'],
  wool: ['#ffffff', '#f4f4f4', '#ebebeb', '#f8f8f8', '#e2e2e2'],
};

const PAINTERS: Record<Layer, Painter> = {
  grass_top: noise(PAL.grass),
  grass_side: (g, r) => {
    noise(PAL.dirt)(g, r);
    for (let x = 0; x < TEX; x++) {
      const depth = 3 + Math.floor(r() * 3);
      for (let y = 0; y < depth; y++) px(g, x, y, pick(r, PAL.grass));
    }
  },
  dirt: noise(PAL.dirt),
  stone: (g, r) => {
    noise(PAL.stone)(g, r);
    // a few cracks
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(r() * TEX);
      let y = Math.floor(r() * TEX);
      for (let k = 0; k < 4; k++) {
        px(g, x, y, '#5f5f5f');
        x = (x + (r() < 0.5 ? 1 : 0)) % TEX;
        y = (y + 1) % TEX;
      }
    }
  },
  planks: (g, r) => {
    const wood = ['#b8945a', '#a6834d', '#c4a066', '#ae8b53'];
    noise(wood)(g, r);
    for (let board = 0; board < 4; board++) {
      const y = board * 4 + 3;
      for (let x = 0; x < TEX; x++) px(g, x, y, '#7a5a30');
      const seam = (board * 7 + 3) % TEX; // the end of a board
      for (let k = 0; k < 3; k++) px(g, seam, board * 4 + k, '#8a6838');
    }
  },
  log_side: (g, r) => {
    const bark = ['#6b4a2a', '#5a3d22', '#7a5634', '#4e351d'];
    for (let x = 0; x < TEX; x++) {
      const base = pick(r, bark);
      for (let y = 0; y < TEX; y++) px(g, x, y, r() < 0.75 ? base : pick(r, bark));
    }
  },
  log_top: (g, r) => {
    const rings = ['#c49a5c', '#a87f45'];
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        px(g, x, y, d > 6.5 ? pick(r, ['#6b4a2a', '#5a3d22']) : rings[Math.floor(d) % 2]);
      }
  },
  leaves: (g, r) => {
    noise(PAL.leaves)(g, r);
    for (let i = 0; i < 10; i++) px(g, Math.floor(r() * TEX), Math.floor(r() * TEX), '#1a3f12');
  },
  sand: noise(PAL.sand),
  brick: (g, r) => {
    const red = ['#a8452f', '#b5513a', '#9a3d29', '#b04a33'];
    noise(red)(g, r);
    const mortar = '#c9c0b0';
    for (let row = 0; row < 4; row++) {
      const y = row * 4 + 3;
      for (let x = 0; x < TEX; x++) px(g, x, y, mortar);
      const offset = row % 2 ? 0 : 4;
      for (let x = offset; x < TEX; x += 8) for (let k = 0; k < 3; k++) px(g, x, row * 4 + k, mortar);
    }
  },
  bedrock: noise(PAL.bedrock),
  gold: (g, r) => {
    framed(['#f5c518', '#ffd83b', '#e8b800', '#ffe066'], '#b8860b')(g, r);
    for (let i = 0; i < 6; i++) px(g, 2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), '#fff6b0');
  },
  diamond: (g, r) => {
    framed(['#4ee6f0', '#2fc7d4', '#7ff3f8', '#3ad8e4'], '#1a8a99')(g, r);
    for (let i = 0; i < 6; i++) px(g, 2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), '#ffffff');
  },
  lava: noise(PAL.lava),
  water: (g, r) => {
    noise(PAL.water)(g, r);
    // light wave crests
    for (let row = 0; row < 4; row++) {
      const y = row * 4 + 1;
      const start = Math.floor(r() * TEX);
      for (let k = 0; k < 6; k++) {
        const x = (start + k) % TEX;
        px(g, x, y + (k === 0 || k === 5 ? 1 : 0), k === 0 || k === 5 ? '#6a9cf5' : '#a8c8ff');
      }
    }
  },
  snow: noise(PAL.snow),
  lamp: (g, r) => {
    noise(['#ffe9a0', '#ffd25a', '#fff6d0', '#ffdf80'])(g, r);
    for (let i = 0; i < TEX; i++) {
      for (const k of [0, 15]) {
        px(g, i, k, '#8a6a2a');
        px(g, k, i, '#8a6a2a');
      }
      px(g, i, 7, '#e0b040');
      px(g, 7, i, '#e0b040');
    }
  },
  portal: noise(PAL.portal),
  glass: (g, r) => {
    framed(['#a8e2f7', '#b4e8fa', '#9cdcf3', '#afe5f8'], '#5f9fba')(g, r);
    // inner frame and two diagonal glints
    for (let i = 1; i < TEX - 1; i++) {
      px(g, i, 1, '#f4fbfd');
      px(g, 1, i, '#f4fbfd');
    }
    for (let k = 0; k < 5; k++) {
      px(g, 4 + k, 9 - k, '#ffffff');
      px(g, 5 + k, 9 - k, '#ffffff');
      px(g, 9 + k, 12 - k, '#ffffff');
    }
  },
  wool: framed(PAL.wool, '#d4d4d4'),
};

/** Draws one texture layer onto a fresh TEX×TEX canvas. */
export function paintLayer(index: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d')!;
  PAINTERS[LAYERS[index]](g, rng(index * 7919 + 13));
  return c;
}

/** All texture layers stacked into one RGBA buffer (for a WebGL texture array). */
export function textureData(): Uint8Array {
  const layerBytes = TEX * TEX * 4;
  const data = new Uint8Array(layerBytes * LAYERS.length);
  LAYERS.forEach((_, i) => {
    const pixels = paintLayer(i).getContext('2d')!.getImageData(0, 0, TEX, TEX).data;
    data.set(pixels, i * layerBytes);
  });
  return data;
}

/** A small preview image of a block's side, for the reference panel. */
export function swatch(b: BlockType): string {
  return paintLayer(layerIndex(b.side)).toDataURL();
}
