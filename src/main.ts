// Fonts are bundled with the app instead of loaded from Google, so visitors' IPs
// never reach a third party (GDPR). Latin + Latin Extended cover all Slovak letters.
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-ext-600.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-ext-800.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/latin-ext-400.css';
import './style.css';
import * as Blockly from 'blockly';
import * as Sk from 'blockly/msg/sk';
import { countBlocks, generateCode, registerBlocks, theme, toolboxFor } from './blocks';
import { LEVELS } from './levels';
import { exportProgress, importProgress, loadProgress, saveProgress } from './progress';
import { Renderer } from './renderer';
import { runProgram, type RunResult } from './runner';
import { Sandbox } from './sandbox/sandbox';
import { World, type Chapter, type Level } from './world';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

Blockly.setLocale(Sk as unknown as Record<string, string>);
registerBlocks();

const CHAPTERS: { id: Chapter; title: string }[] = [
  { id: 'maze', title: '🧭 Dobrodružstvo' },
  { id: 'draw', title: '🎨 Kreslenie' },
];

const progress = loadProgress();
// Add ?odomkni to the URL to unlock every level (handy for parents).
const unlockAll = new URLSearchParams(location.search).has('odomkni');
let levelIndex = Math.min(progress.level, LEVELS.length - 1);
let running = false;
let loading = false;

const ws = Blockly.inject($('blockly'), {
  toolbox: toolboxFor(LEVELS[levelIndex].toolbox),
  renderer: 'zelos',
  theme,
  media: 'blockly-media/',
  trashcan: true,
  sounds: false,
  zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.4 },
  move: { scrollbars: true, drag: true, wheel: false },
  grid: { spacing: 28, length: 3, colour: '#2c3448', snap: true },
});
ws.addChangeListener(Blockly.Events.disableOrphans);
ws.addChangeListener((e) => {
  if (e.isUiEvent || loading) return;
  onProgramChanged();
});
window.addEventListener('resize', () => Blockly.svgResize(ws));

const renderer = new Renderer($<HTMLCanvasElement>('game'));

const sandbox = new Sandbox({
  load: (mode) => progress.code[mode],
  save: (mode, code) => {
    progress.code[mode] = code;
    saveProgress(progress);
  },
  saveMode: (mode) => {
    progress.codeMode = mode;
    saveProgress(progress);
  },
});

/** Switches between the block game and the JavaScript sandbox. */
function showView(view: 'game' | 'code') {
  progress.view = view;
  saveProgress(progress);
  $('game-view').hidden = view !== 'game';
  $('code-view').hidden = view !== 'code';
  if (view === 'code') {
    stopRun();
    sandbox.show(progress.codeMode);
  } else {
    sandbox.stop();
    Blockly.svgResize(ws);
  }
  renderLevelBar();
}

const level = () => LEVELS[levelIndex];
const inChapter = (c: Chapter) => LEVELS.filter((l) => l.chapter === c);
const numberInChapter = (lv: Level) => inChapter(lv.chapter).indexOf(lv) + 1;
const resetStage = () => renderer.load(World.fromLevel(level()), level());

function isUnlocked(i: number) {
  const lv = LEVELS[i];
  if (unlockAll || lv.free) return true;
  const list = inChapter(lv.chapter);
  const k = list.indexOf(lv);
  return k === 0 || (progress.stars[list[k - 1].id] ?? 0) > 0;
}

function nextInChapter(): number | null {
  const next = LEVELS[levelIndex + 1];
  return next && next.chapter === level().chapter ? levelIndex + 1 : null;
}

/** Number of actions the reference solution needs; the "no wasted steps" star in drawing levels. */
const bestSteps = new Map<string, number>();
function optimalSteps(lv: Level) {
  if (!bestSteps.has(lv.id)) bestSteps.set(lv.id, runProgram(lv.solution, lv).steps.length);
  return bestSteps.get(lv.id)!;
}

/** Slovak plurals: 1 blok, 2–4 bloky, 5+ blokov. */
const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const blocksWord = (n: number) => plural(n, 'blok', 'bloky', 'blokov');
const stepsWord = (n: number) => plural(n, 'krok', 'kroky', 'krokov');

function renderLevelBar() {
  const inGame = progress.view === 'game';
  const current = level().chapter;
  const tab = (title: string, active: boolean, onclick: () => void) => {
    const b = document.createElement('button');
    b.className = 'tab' + (active ? ' current' : '');
    b.textContent = title;
    b.onclick = onclick;
    return b;
  };
  const tabs = [
    ...CHAPTERS.map((c) => tab(c.title, inGame && c.id === current, () => openChapter(c.id))),
    tab('💻 JavaScript', !inGame, () => showView('code')),
  ];
  const buttons = LEVELS.flatMap((lv, i) => {
    // a chapter with a single level (free drawing) needs no level buttons
    if (!inGame || lv.chapter !== current || inChapter(current).length < 2) return [];
    const b = document.createElement('button');
    const stars = progress.stars[lv.id] ?? 0;
    const label = lv.free ? '🎨' : isUnlocked(i) ? numberInChapter(lv) : '🔒';
    b.className = 'lvl' + (i === levelIndex ? ' current' : '') + (stars ? ' done' : '');
    b.disabled = !isUnlocked(i);
    b.title = isUnlocked(i) ? lv.title : 'Najprv dokonči predchádzajúcu úroveň';
    b.innerHTML = `<span>${label}</span><span class="st">${'★'.repeat(stars)}</span>`;
    b.onclick = () => loadLevel(i);
    return [b];
  });
  const tabBox = document.createElement('div');
  tabBox.className = 'tabs';
  tabBox.append(...tabs);
  $('levels').replaceChildren(tabBox, ...buttons);
}

/** Opens the first unfinished level of a chapter. */
function openChapter(c: Chapter) {
  if (progress.view !== 'game') {
    showView('game');
    if (level().chapter === c) return;
  }
  const list = inChapter(c);
  const target = list.find((lv) => !lv.free && !progress.stars[lv.id] && isUnlocked(LEVELS.indexOf(lv))) ?? list[0];
  loadLevel(LEVELS.indexOf(target));
}

function loadLevel(i: number) {
  stopRun();
  hideMessage();
  levelIndex = i;
  progress.level = i;
  saveProgress(progress);
  const lv = level();

  loading = true;
  Blockly.Events.disable();
  try {
    ws.clear();
    ws.updateToolbox(toolboxFor(lv.toolbox));
    const saved = progress.programs[lv.id];
    if (saved) Blockly.serialization.workspaces.load(saved, ws);
    if (!ws.getBlocksByType('start', false).length) {
      const start = ws.newBlock('start');
      start.initSvg();
      start.render();
      start.moveBy(40, 30);
    }
  } finally {
    Blockly.Events.enable();
    loading = false;
  }

  $('level-title').textContent = lv.free ? lv.title : `${numberInChapter(lv)}. ${lv.title}`;
  $('level-hint').textContent = lv.hint;
  $('picture').hidden = lv.chapter !== 'draw';
  resetStage();
  renderLevelBar();
  onProgramChanged();
}

function onProgramChanged() {
  const lv = level();
  progress.programs[lv.id] = Blockly.serialization.workspaces.save(ws);
  saveProgress(progress);

  const n = countBlocks(ws);
  const blocksGoal = `🧩 Použi najviac ${lv.par} ${blocksWord(lv.par)} <span class="${n > lv.par ? 'over' : ''}">(teraz: ${n})</span>`;
  let goals: string[];
  if (lv.free) {
    goals = ['🎨 Nakresli, čo chceš!', '🖼 Hotový obrázok si stiahni tlačidlom „Obrázok“.'];
  } else if (lv.chapter === 'draw') {
    const steps = optimalSteps(lv);
    goals = ['🖼 Namaľuj obrázok podľa svetlej predlohy', blocksGoal, `👣 Kubo urobí najviac ${steps} ${stepsWord(steps)}`];
  } else {
    const diamonds = World.fromLevel(lv).totalDiamonds;
    goals = ['🟪 Dostaň Kuba do portálu'];
    if (diamonds) goals.push(`💎 Zober ${diamonds === 1 ? 'diamant' : `všetky diamanty (${diamonds})`}`);
    goals.push(blocksGoal);
  }
  $('level-goals').innerHTML = goals.map((g) => `<li>${g}</li>`).join('');
}

function setRunning(r: boolean) {
  running = r;
  const btn = $('run');
  btn.textContent = r ? '■ Stop' : '▶ Spusti';
  btn.classList.toggle('stop', r);
}

function stopRun() {
  renderer.stop();
  ws.highlightBlock(null);
  setRunning(false);
}

async function run() {
  if (running) {
    stopRun();
    resetStage();
    return;
  }
  const lv = level();
  hideMessage();
  const result = runProgram(generateCode(ws, true), lv);
  const attempt = (progress.attempts[lv.id] ?? 0) + 1;
  progress.attempts[lv.id] = attempt;
  saveProgress(progress);

  resetStage();
  renderer.banner(`POKUS ${attempt}`);
  setRunning(true);
  const finished = await renderer.play(result.steps, (s) => ws.highlightBlock(s.blockId));
  if (!finished) return;
  ws.highlightBlock(null);
  setRunning(false);

  if (result.outcome === 'won') {
    renderer.celebrate();
    setTimeout(() => showWin(result), 900);
  } else if (result.outcome === 'drawn') {
    renderer.celebrate();
    showMessage('Krásny obrázok! 🎨 Stiahni si ho tlačidlom „🖼 Obrázok“.', true);
  } else {
    showFail(result);
  }
}

function showFail(r: RunResult) {
  const lv = level();
  const canMine = lv.toolbox.includes('vykop');
  const into = { T: 'do stromu 🌳', S: 'do kameňa', B: 'do skaly' } as Record<string, string>;
  const wrong = r.wrongCells?.length ?? 0;
  const messages: Record<string, string> = {
    notThere: 'Kubo sa zastavil, ale ešte nie je v portáli. Pridaj ďalšie bloky!',
    crashed:
      lv.chapter === 'draw'
        ? 'Pozor! Kubo by vypadol z plátna. Pozri sa, kam smeruje biela šípka.'
        : `Bum! Kubo narazil ${into[r.crashedInto ?? 'B'] ?? 'do steny'}. Pozri sa, kam smeruje biela šípka.` +
          (r.crashedInto === 'S' && canMine ? ' Tip: kameň môžeš vykopať ⛏' : ''),
    burned: 'Au! Kubo spadol do lávy 🔥. Skús inú cestu.',
    drowned: 'Šplech! Kubo spadol do vody 🌊. Skús inú cestu.',
    tooLong: 'Program beží príliš dlho – asi sa točí dookola 🔁. Skontroluj opakovanie.',
    error: `Niečo sa pokazilo: ${r.error}`,
    wrongPicture: `Obrázok ešte nesedí: ${wrong} ${plural(wrong, 'políčko je', 'políčka sú', 'políčok je')} inak, než na predlohe. Červené rámčeky ukazujú kde.`,
  };
  if (r.outcome === 'wrongPicture') renderer.markWrong(r.wrongCells ?? []);
  showMessage(messages[r.outcome]);
}

function showMessage(text: string, ok = false) {
  const box = $('message');
  box.textContent = text;
  box.classList.toggle('ok', ok);
  box.hidden = false;
}

function hideMessage() {
  $('message').hidden = true;
}

function showWin(r: RunResult) {
  const lv = level();
  const n = countBlocks(ws);
  const short = n <= lv.par;
  const checks: string[] = [];
  let bonus: boolean;
  if (lv.chapter === 'draw') {
    const best = optimalSteps(lv);
    bonus = r.steps.length <= best;
    checks.push('✅ Obrázok je hotový');
    checks.push(`${bonus ? '✅' : '❌'} Najviac ${best} ${stepsWord(best)} (Kubo urobil ${r.steps.length})`);
  } else {
    bonus = r.diamonds === r.totalDiamonds;
    checks.push('✅ Kubo je v portáli');
    if (r.totalDiamonds) checks.push(`${bonus ? '✅' : '❌'} Diamanty: ${r.diamonds} z ${r.totalDiamonds}`);
  }
  checks.push(
    `${short ? '✅' : '❌'} Najviac ${lv.par} ${blocksWord(lv.par)} (máš ${n})` + (short ? '' : ' – dá sa to kratšie?'),
  );
  const stars = 1 + Number(bonus) + Number(short);
  progress.stars[lv.id] = Math.max(progress.stars[lv.id] ?? 0, stars);
  saveProgress(progress);
  renderLevelBar();

  const next = nextInChapter();
  $('modal-title').textContent = next === null ? 'VŠETKO HOTOVÉ! 🏆' : 'ÚROVEŇ SPLNENÁ!';
  $('modal-stars').innerHTML = [0, 1, 2]
    .map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${i * 0.18}s">★</span>`)
    .join('');
  $('modal-checks').innerHTML = checks.map((c) => `<li>${c}</li>`).join('');
  $('modal-next').hidden = next === null;
  $('modal').hidden = false;
}

$('run').onclick = run;
$('reset').onclick = () => {
  stopRun();
  hideMessage();
  resetStage();
};
$('picture').onclick = () => {
  const a = document.createElement('a');
  a.href = renderer.exportPng();
  a.download = `kubo-obrazok-${level().id}.png`;
  a.click();
};
$<HTMLInputElement>('speed').oninput = (e) => {
  renderer.speed = Number((e.target as HTMLInputElement).value);
};
const closeAbout = () => ($('about').hidden = true);
$('about-btn').onclick = () => {
  $('about').hidden = false;
  $('about-close').focus();
};
$('about-close').onclick = closeAbout;
$('about').onclick = (e) => {
  if (e.target === e.currentTarget) closeAbout(); // click on the dimmed backdrop
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('about').hidden) closeAbout();
});

let toastTimer = 0;
function toast(text: string, error = false) {
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('error', error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 3500);
}

$('save').onclick = () => {
  exportProgress(progress);
  toast('💾 Postup je uložený v súbore. Nájdeš ho v priečinku Stiahnuté.');
};
$('load').onclick = () => $('load-file').click();
$<HTMLInputElement>('load-file').onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    Object.assign(progress, await importProgress(file));
    saveProgress(progress);
    const index = Math.min(progress.level, LEVELS.length - 1);
    loadLevel(isUnlocked(index) ? index : 0);
    sandbox.reload();
    showView(progress.view);
    const stars = Object.values(progress.stars).reduce((a, b) => a + b, 0);
    toast(`📂 Postup načítaný! Máš ${stars} ★ a pokračuješ úrovňou „${level().title}“.`);
  } catch (err) {
    toast(err instanceof SyntaxError ? 'Tento súbor sa nedá prečítať.' : (err as Error).message, true);
  }
};

$('modal-retry').onclick = () => {
  $('modal').hidden = true;
  resetStage();
};
$('modal-next').onclick = () => {
  $('modal').hidden = true;
  const next = nextInChapter();
  if (next !== null) loadLevel(next);
};

loadLevel(isUnlocked(levelIndex) ? levelIndex : 0);
showView(progress.view);
