// Pen colors for the drawing chapter (pixel-art wool palette). `ch` is the character used in level targets.
export interface PenColor {
  name: string;
  ch: string;
  hex: string;
  emoji: string;
}

export const COLORS: PenColor[] = [
  { name: 'čierna', ch: 'k', hex: '#1d1d21', emoji: '⬛' },
  { name: 'biela', ch: 'w', hex: '#f0f0f0', emoji: '⬜' },
  { name: 'červená', ch: 'r', hex: '#b02e26', emoji: '🟥' },
  { name: 'oranžová', ch: 'o', hex: '#f9801d', emoji: '🟧' },
  { name: 'žltá', ch: 'y', hex: '#fed83d', emoji: '🟨' },
  { name: 'zelená', ch: 'l', hex: '#80c71f', emoji: '🟩' },
  { name: 'tmavozelená', ch: 'g', hex: '#5e7c16', emoji: '🌲' },
  { name: 'svetlomodrá', ch: 'c', hex: '#3ab3da', emoji: '💎' },
  { name: 'modrá', ch: 'b', hex: '#3c44aa', emoji: '🟦' },
  { name: 'fialová', ch: 'p', hex: '#8932b8', emoji: '🟪' },
  { name: 'ružová', ch: 'm', hex: '#f38baa', emoji: '🌸' },
  { name: 'hnedá', ch: 'n', hex: '#835432', emoji: '🟫' },
];

export const DEFAULT_PEN = 'čierna';
export const COLOR_BY_NAME: Record<string, PenColor> = Object.fromEntries(COLORS.map((c) => [c.name, c]));
export const COLOR_BY_CHAR: Record<string, PenColor> = Object.fromEntries(COLORS.map((c) => [c.ch, c]));
