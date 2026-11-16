const KEY = 'kidcode.v1';

export interface Progress {
  /** Best star count per level id. */
  stars: Record<string, number>;
  attempts: Record<string, number>;
  /** Saved Blockly workspace per level id. */
  programs: Record<string, object>;
  muted: boolean;
  level: number;
  /** Which part of the app was open last: the block game or the JavaScript sandbox. */
  view: 'game' | 'code';
  codeMode: 'console' | 'draw';
  /** Saved JavaScript per sandbox mode. */
  code: Record<string, string>;
}

const defaults = (): Progress => ({
  stars: {},
  attempts: {},
  programs: {},
  muted: false,
  level: 0,
  view: 'game',
  codeMode: 'console',
  code: {},
});

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    // storage unavailable or corrupted: start fresh
  }
  return defaults();
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore: progress just won't persist
  }
}

const FILE_FORMAT = 'kubo-koduje';

/** Downloads the progress as a JSON file, so it can be backed up or moved to another computer. */
export function exportProgress(p: Progress) {
  const data = JSON.stringify({ format: FILE_FORMAT, version: 1, savedAt: new Date().toISOString(), progress: p }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `kubo-postup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a file made by exportProgress; throws if it is not one. */
export async function importProgress(file: File): Promise<Progress> {
  const parsed = JSON.parse(await file.text());
  const p = parsed?.progress;
  if (parsed?.format !== FILE_FORMAT || typeof p !== 'object' || typeof p.stars !== 'object') {
    throw new Error('Toto nie je súbor s postupom z Kubo kóduje.');
  }
  return { ...defaults(), ...p };
}
