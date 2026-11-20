export type SandboxMode = 'console' | 'draw' | 'world';

export const SANDBOX_MODES: SandboxMode[] = ['console', 'draw', 'world'];

export interface ApiDoc {
  name: string;
  args: string;
  /** Code to insert; each ${…} is a prefilled field the kid can Tab through (see toSnippet). */
  snippet: string;
  info: string;
  modes: SandboxMode[];
}

const ALL = SANDBOX_MODES;
const DRAW: SandboxMode[] = ['draw'];
const WORLD: SandboxMode[] = ['world'];

// Functions provided by public/sandbox-worker.js. Names are English on purpose: this is "real" JavaScript.
export const API_DOCS: ApiDoc[] = [
  { name: 'console.log', args: '(hodnota, …)', snippet: "console.log('${Ahoj}')", info: 'Vypíše text alebo čísla do konzoly.', modes: ALL },
  { name: 'random', args: '(min, max)', snippet: 'random(${1}, ${10})', info: 'Náhodné celé číslo od min po max (vrátane).', modes: ALL },
  { name: 'sleep', args: '(ms)', snippet: 'await sleep(${500})', info: 'Počká daný počet milisekúnd (1000 = 1 sekunda). Pred sleep píš await.', modes: ALL },
  { name: 'background', args: '(farba)', snippet: "background('${skyblue}')", info: 'Zafarbí celé plátno.', modes: DRAW },
  { name: 'clear', args: '()', snippet: 'clear()', info: 'Vymaže plátno.', modes: DRAW },
  { name: 'line', args: '(x1, y1, x2, y2, farba, hrúbka)', snippet: "line(${50}, ${50}, ${300}, ${200}, '${black}', ${4})", info: 'Čiara z bodu [x1, y1] do bodu [x2, y2].', modes: DRAW },
  { name: 'drawCircle', args: '(x, y, priemer, farba, hrúbka)', snippet: "drawCircle(${320}, ${240}, ${100}, '${red}', ${3})", info: 'Obrys kruhu so stredom [x, y].', modes: DRAW },
  { name: 'fillCircle', args: '(x, y, priemer, farba)', snippet: "fillCircle(${320}, ${240}, ${100}, '${red}')", info: 'Vyplnený kruh so stredom [x, y].', modes: DRAW },
  { name: 'drawRectangle', args: '(x, y, šírka, výška, farba, hrúbka)', snippet: "drawRectangle(${100}, ${100}, ${200}, ${120}, '${blue}', ${3})", info: 'Obrys obdĺžnika; [x, y] je ľavý horný roh.', modes: DRAW },
  { name: 'fillRectangle', args: '(x, y, šírka, výška, farba)', snippet: "fillRectangle(${100}, ${100}, ${200}, ${120}, '${blue}')", info: 'Vyplnený obdĺžnik; [x, y] je ľavý horný roh.', modes: DRAW },
  { name: 'drawEllipse', args: '(x, y, šírka, výška, farba, hrúbka)', snippet: "drawEllipse(${320}, ${240}, ${200}, ${100}, '${purple}', ${3})", info: 'Obrys elipsy so stredom [x, y].', modes: DRAW },
  { name: 'fillEllipse', args: '(x, y, šírka, výška, farba)', snippet: "fillEllipse(${320}, ${240}, ${200}, ${100}, '${purple}')", info: 'Vyplnená elipsa so stredom [x, y].', modes: DRAW },
  { name: 'drawTriangle', args: '(x1, y1, x2, y2, x3, y3, farba, hrúbka)', snippet: "drawTriangle(${320}, ${100}, ${220}, ${300}, ${420}, ${300}, '${green}', ${3})", info: 'Obrys trojuholníka s tromi vrcholmi.', modes: DRAW },
  { name: 'fillTriangle', args: '(x1, y1, x2, y2, x3, y3, farba)', snippet: "fillTriangle(${320}, ${100}, ${220}, ${300}, ${420}, ${300}, '${green}')", info: 'Vyplnený trojuholník s tromi vrcholmi.', modes: DRAW },
  { name: 'point', args: '(x, y, farba)', snippet: "point(${100}, ${100}, '${black}')", info: 'Jeden pixel.', modes: DRAW },
  { name: 'text', args: '(x, y, text, veľkosť, farba)', snippet: "text(${20}, ${20}, '${Ahoj!}', ${32}, '${black}')", info: 'Napíše text; [x, y] je ľavý horný roh.', modes: DRAW },
  { name: 'addBlock', args: '(x, y, z, kocka)', snippet: "addBlock(${0}, ${0}, ${0}, '${stone}')", info: 'Postaví kocku. y ide hore, y = 0 leží na tráve. Kocka je typ zo zoznamu nižšie alebo farba, napr. „red“.', modes: WORLD },
  { name: 'deleteBlock', args: '(x, y, z)', snippet: 'deleteBlock(${0}, ${0}, ${0})', info: 'Odstráni kocku.', modes: WORLD },
  { name: 'getBlock', args: '(x, y, z)', snippet: 'getBlock(${0}, ${0}, ${0})', info: 'Zistí, aká kocka je na mieste [x, y, z]. Ak tam nič nie je, vráti null.', modes: WORLD },
  { name: 'fill', args: '(x1, y1, z1, x2, y2, z2, kocka)', snippet: "fill(${0}, ${0}, ${0}, ${4}, ${2}, ${4}, '${brick}')", info: 'Vyplní celý kváder medzi dvoma rohmi. S kockou „air“ kváder vyprázdni.', modes: WORLD },
  { name: 'clearWorld', args: '()', snippet: 'clearWorld()', info: 'Odstráni všetky kocky.', modes: WORLD },
  { name: 'SIZE', args: '', snippet: 'SIZE', info: 'Veľkosť sveta: 256 kociek na každú stranu (súradnice 0 až 255).', modes: WORLD },
  { name: 'WIDTH', args: '', snippet: 'WIDTH', info: 'Šírka plátna (640).', modes: DRAW },
  { name: 'HEIGHT', args: '', snippet: 'HEIGHT', info: 'Výška plátna (480).', modes: DRAW },
];

/**
 * Converts ${value} fields to CodeMirror's numbered ${n:value} form;
 * CodeMirror would otherwise read ${320} as an empty field number 320.
 */
export function toSnippet(template: string) {
  let n = 0;
  return template.replace(/\$\{([^}]*)\}/g, (_, value) => `\${${++n}:${value}}`);
}

export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 480;

export const STARTER_CODE: Record<SandboxMode, string> = {
  console: `// Ahoj! Toto je skutočný JavaScript.
// Napíš program a stlač ▶ (alebo Ctrl+Enter).

console.log('Ahoj, svet!');

for (let i = 1; i <= 5; i++) {
  console.log('Kubo skočil ' + i + '-krát');
}
`,
  world: `// 3D svet má 256 × 256 × 256 kociek. x a z idú po tráve, y ide hore.
// Kocka [0, 0, 0] leží na tráve pri farebných šípkach.
// Klikni do sveta a lietaj: W A S D, medzerník = hore, Shift = dole, Esc = koniec.

// Domček
fill(2, 0, 2, 8, 3, 8, 'planks');   // plný kváder z dosiek…
fill(3, 0, 3, 7, 3, 7, 'air');      // …a vnútro vyprázdnime
fill(5, 0, 2, 5, 1, 2, 'air');      // dvere
addBlock(2, 2, 5, 'lamp');          // okno, ktoré svieti

// Strecha: každá vrstva je menšia
for (let i = 0; i < 4; i++) {
  fill(1 + i, 4 + i, 1 + i, 9 - i, 4 + i, 9 - i, 'brick');
}

// Strom
fill(12, 4, 3, 16, 5, 7, 'leaves');
addBlock(14, 6, 5, 'leaves');
for (let y = 0; y < 5; y++) {
  addBlock(14, y, 5, 'wood');
}

// Dúhová veža sa stavia pomaly
const farby = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
for (let y = 0; y < 12; y++) {
  addBlock(20, y, 6, farby[y % farby.length]);
  await sleep(150);
}
`,
  draw: `// Plátno má veľkosť 640 × 480. Bod [0, 0] je vľavo hore.
// Zmeň čísla alebo farby a stlač ▶ (alebo Ctrl+Enter).

background('skyblue');
fillCircle(520, 90, 100, 'yellow');
fillRectangle(0, 380, WIDTH, 100, 'green');
fillRectangle(220, 220, 200, 160, 'white');
fillTriangle(200, 220, 440, 220, 320, 120, 'red');
fillRectangle(295, 300, 50, 80, 'brown');
text(20, 20, 'Môj dom', 36, 'navy');
`,
};

/** Translates the most common JS error messages into kid-friendly Slovak hints. */
export function explainError(name: string, message: string): string {
  let m: RegExpMatchArray | null;
  if ((m = message.match(/^(\S+) is not defined$/))) return `„${m[1]}“ nepoznám. Nie je to preklep? Pozor aj na veľké a malé písmená.`;
  if ((m = message.match(/^(\S+) is not a function$/))) return `„${m[1]}“ nie je funkcia, takže sa nedá zavolať so zátvorkami ().`;
  if ((m = message.match(/^Cannot read propert(?:y|ies) of (undefined|null)/))) return `Snažíš sa niečo čítať z hodnoty ${m[1]} (je prázdna).`;
  if (/^Assignment to constant variable/.test(message)) return 'Do premennej vytvorenej cez const sa nedá znova zapisovať. Použi let.';
  if ((m = message.match(/^Cannot access '(\S+)' before initialization/))) return `Premennú „${m[1]}“ používaš skôr, ako si ju vytvoril.`;
  if (/Maximum call stack size exceeded/.test(message)) return 'Funkcia volá sama seba donekonečna.';
  return name && name !== 'Error' ? `${name}: ${message}` : message;
}

const SYNTAX_HINTS: [RegExp, string][] = [
  [/^Unterminated string constant/, 'Neukončený text – chýba úvodzovka na konci.'],
  [/^Unterminated template/, 'Neukončený text – chýba spätná úvodzovka `.'],
  [/^Unexpected token/, 'Tu je niečo navyše alebo niečo chýba (zátvorka, čiarka, úvodzovka…).'],
  [/^Unexpected character/, 'Tento znak JavaScript nepozná.'],
  [/^Identifier '(.+)' has already been declared/, 'Premennú s týmto menom už máš.'],
];

export function explainSyntax(message: string): string {
  for (const [re, hint] of SYNTAX_HINTS) if (re.test(message)) return `${hint} (${message})`;
  return message;
}
