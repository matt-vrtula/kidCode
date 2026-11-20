import { parse } from 'acorn';
import { basicSetup } from 'codemirror';
import { snippet, snippetCompletion, type CompletionContext } from '@codemirror/autocomplete';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { COLORS } from '../colors';
import {
  API_DOCS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SANDBOX_MODES,
  STARTER_CODE,
  explainError,
  explainSyntax,
  toSnippet,
  type SandboxMode,
} from './api';
import { AIR, BLOCKS, blockIds, swatch } from './voxel/blocks';
import { SIZE } from './voxel/grid';
import type { Target, WorldView } from './voxel/view';

export interface SandboxStore {
  load(mode: SandboxMode): string | undefined;
  save(mode: SandboxMode, code: string): void;
  /** Remembers which sandbox was open. */
  saveMode(mode: SandboxMode): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// File System Access API (Chrome, Edge); not in TypeScript's DOM types yet.
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ name: string; createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>;

// Slovak color names work too: fillCircle(100, 100, 50, 'červená')
const SLOVAK_COLORS = Object.fromEntries(COLORS.map((c) => [c.name, c.hex]));

// What the worker needs to know about the 3D world's blocks.
const WORLD_SETUP = {
  size: SIZE,
  ids: blockIds(),
  names: Object.fromEntries(BLOCKS.map((b) => [b.id, b.name])),
};

const OUTPUTS: Record<SandboxMode, string> = { console: 'console-out', draw: 'draw-out', world: 'world-out' };
const LOGS: Record<SandboxMode, string> = { console: 'console-out', draw: 'draw-log', world: 'world-log' };
const SAVE_NAMES: Record<SandboxMode, string> = { console: 'program.js', draw: 'kreslenie.js', world: 'svet.js' };

const setErrorLine = StateEffect.define<number | null>();
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    if (tr.docChanged) deco = Decoration.none;
    for (const e of tr.effects) {
      if (!e.is(setErrorLine)) continue;
      deco =
        e.value === null
          ? Decoration.none
          : Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(tr.state.doc.line(e.value).from)]);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '16px' },
  '.cm-scroller': { fontFamily: "Consolas, 'Courier New', monospace", lineHeight: '1.5' },
  '.cm-error-line': { backgroundColor: 'rgba(255, 70, 70, 0.22)' },
});

export class Sandbox {
  private mode: SandboxMode = 'console';
  private editors: Record<SandboxMode, EditorView>;
  private worker: Worker | null = null;
  // A finished worker is kept until the next run: terminating it right away
  // could drop the last drawn frame before the browser shows it.
  private lingering: Worker | null = null;
  private started = 0;
  private slowTimer = 0;
  // The 3D view needs three.js, a separate chunk loaded when the 🧱 tab is first opened.
  private view: WorldView | null = null;
  private viewLoading: Promise<WorldView | null> | null = null;

  constructor(private store: SandboxStore) {
    this.editors = Object.fromEntries(SANDBOX_MODES.map((m) => [m, this.createEditor(m, $(`editor-${m}`))])) as Record<
      SandboxMode,
      EditorView
    >;
    $('play').onclick = () => this.toggle();
    $('code-save').onclick = () => void this.saveToFile();
    $('code-open').onclick = () => $('code-file').click();
    $<HTMLInputElement>('code-file').onchange = (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) void this.openFile(file);
    };
    document.querySelectorAll<HTMLButtonElement>('.ctab').forEach((b) => {
      b.onclick = () => this.show(b.dataset.mode as SandboxMode);
    });
    $('world-full').onclick = () => this.view?.toggleFullscreen();
    $('world-home').onclick = () => this.view?.resetCamera();
    this.replaceCanvas();
    this.trackMouse();
  }

  get currentMode() {
    return this.mode;
  }

  show(mode: SandboxMode) {
    this.stop();
    this.mode = mode;
    this.store.saveMode(mode);
    document.querySelectorAll<HTMLButtonElement>('.ctab').forEach((b) => b.classList.toggle('current', b.dataset.mode === mode));
    for (const m of SANDBOX_MODES) {
      $(`editor-${m}`).hidden = m !== mode;
      $(OUTPUTS[m]).hidden = m !== mode;
    }
    this.renderReference();
    this.editors[mode].focus();
    if (mode === 'world') void this.loadView().then((v) => this.mode === 'world' && v?.start());
    else this.view?.pause();
  }

  /** Called when the whole JavaScript view is hidden. */
  hide() {
    this.stop();
    this.view?.pause();
  }

  /** Reloads both editors from the store (after progress was imported from a file). */
  reload() {
    this.stop();
    for (const mode of SANDBOX_MODES) {
      const editor = this.editors[mode];
      const doc = this.store.load(mode) ?? STARTER_CODE[mode];
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: doc } });
    }
  }

  stop() {
    if (!this.worker) return;
    this.worker.terminate();
    this.finish();
    this.print('info', '■ Program zastavený.');
  }

  private createEditor(mode: SandboxMode, parent: HTMLElement) {
    const completions = API_DOCS.filter((d) => d.modes.includes(mode)).map((d) =>
      snippetCompletion(toSnippet(d.snippet), { label: d.name, detail: d.args, info: d.info, type: d.args ? 'function' : 'constant' }),
    );
    let saveTimer = 0;
    return new EditorView({
      parent,
      state: EditorState.create({
        doc: this.store.load(mode) ?? STARTER_CODE[mode],
        extensions: [
          basicSetup,
          javascript(),
          javascriptLanguage.data.of({
            autocomplete: (ctx: CompletionContext) => {
              const word = ctx.matchBefore(/[\w.]+/);
              if (!word || (word.from === word.to && !ctx.explicit)) return null;
              return { from: word.from, options: completions, validFor: /^[\w.]*$/ };
            },
          }),
          oneDark,
          editorTheme,
          errorLineField,
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (this.toggle(), true) }])),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => this.store.save(mode, u.state.doc.toString()), 300);
          }),
        ],
      }),
    });
  }

  /** Saves the current editor's code as a .js file; uses a real "Save as" dialog where the browser has one. */
  private async saveToFile() {
    const code = this.editors[this.mode].state.doc.toString();
    const suggestedName = SAVE_NAMES[this.mode];
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName,
          types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();
        this.print('info', `💾 Kód je uložený v súbore ${handle.name}.`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') this.print('error', `❌ Kód sa nepodarilo uložiť: ${(e as Error).message}`);
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.print('info', `💾 Kód je uložený ako ${suggestedName} v priečinku Stiahnuté.`);
  }

  /** Replaces the current editor's code with a file's content (Ctrl+Z brings the old code back). */
  private async openFile(file: File) {
    this.stop();
    const editor = this.editors[this.mode];
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: await file.text() } });
    editor.focus();
    this.output().replaceChildren();
    this.print('info', `📂 Otvorený súbor ${file.name}. Spusti ho tlačidlom ▶.`);
  }

  private toggle() {
    if (this.worker) this.stop();
    else this.run();
  }

  private run() {
    const mode = this.mode;
    if (mode === 'world' && !this.view) {
      // the first run can come before three.js is downloaded
      void this.loadView().then((v) => v && this.mode === 'world' && !this.worker && this.run());
      return;
    }
    const editor = this.editors[mode];
    const code = editor.state.doc.toString();
    editor.dispatch({ effects: setErrorLine.of(null) });
    this.output().replaceChildren();

    try {
      parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
    } catch (e) {
      const err = e as SyntaxError & { loc?: { line: number } };
      this.showError(explainSyntax(err.message.replace(/\s*\(\d+:\d+\)$/, '')), err.loc?.line ?? null);
      return;
    }

    this.lingering?.terminate();
    this.lingering = null;
    let canvas: OffscreenCanvas | undefined;
    if (mode === 'draw') canvas = this.replaceCanvas().transferControlToOffscreen();
    if (mode === 'world') this.view?.clear(); // every run starts with an empty world

    const worker = new Worker('sandbox-worker.js');
    this.worker = worker;
    worker.onmessage = (e) => this.onMessage(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      this.showError(e.message, null);
      worker.terminate();
      this.finish();
    };
    worker.postMessage(
      {
        type: 'run',
        code,
        colors: SLOVAK_COLORS,
        canvas,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        world: mode === 'world' ? WORLD_SETUP : undefined,
      },
      canvas ? [canvas] : [],
    );
    this.started = performance.now();
    this.setPlaying(true);
    this.slowTimer = window.setTimeout(() => {
      if (this.worker === worker) this.print('info', '⏳ Program stále beží… Zastavíš ho tlačidlom ■.');
    }, 5000);
  }

  private onMessage(msg: {
    type: string;
    level?: string;
    text?: string;
    name?: string;
    message?: string;
    line?: number | null;
    ops?: Int32Array;
  }) {
    switch (msg.type) {
      case 'world':
        if (msg.ops) this.view?.apply(msg.ops);
        break;
      case 'log':
        this.print(msg.level ?? 'log', msg.text ?? '');
        break;
      case 'clear':
        this.output().replaceChildren();
        break;
      case 'error':
        this.showError(explainError(msg.name ?? '', msg.message ?? ''), msg.line ?? null);
        this.finish(true);
        break;
      case 'done': {
        const secs = ((performance.now() - this.started) / 1000).toFixed(2);
        this.finish(true);
        if (this.mode === 'world') this.print('done', `✔ Hotovo (${secs} s). Kociek vo svete: ${this.view?.grid.total ?? 0}`);
        else if (this.mode === 'console' || this.output().childElementCount) this.print('done', `✔ Hotovo (${secs} s)`);
        break;
      }
    }
  }

  private finish(keepFrame = false) {
    if (keepFrame) this.lingering = this.worker;
    this.worker = null;
    clearTimeout(this.slowTimer);
    this.setPlaying(false);
  }

  private setPlaying(playing: boolean) {
    const btn = $('play');
    btn.textContent = playing ? '■' : '▶';
    btn.title = playing ? 'Zastaviť (Ctrl+Enter)' : 'Spustiť (Ctrl+Enter)';
    btn.classList.toggle('stop', playing);
  }

  private output() {
    return $(LOGS[this.mode]);
  }

  private print(level: string, text: string) {
    const out = this.output();
    const line = document.createElement('div');
    line.className = `out-line ${level}`;
    line.textContent = text;
    out.append(line);
    out.scrollTop = out.scrollHeight;
    return line;
  }

  private showError(message: string, line: number | null) {
    const editor = this.editors[this.mode];
    const valid = line !== null && line >= 1 && line <= editor.state.doc.lines;
    const el = this.print('error', valid ? `❌ Chyba na riadku ${line}: ${message}` : `❌ Chyba: ${message}`);
    if (!valid) return;
    const jump = () => {
      const pos = editor.state.doc.line(line).from;
      editor.dispatch({ selection: { anchor: pos }, effects: [setErrorLine.of(line), EditorView.scrollIntoView(pos, { y: 'center' })] });
      editor.focus();
    };
    el.classList.add('clickable');
    el.title = 'Klikni a ukážem ti to miesto v kóde';
    el.onclick = jump;
    jump();
  }

  /** A canvas can be handed to a worker only once, so every run gets a fresh one. */
  private replaceCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    $('canvas-holder').replaceChildren(canvas);
    return canvas;
  }

  private trackMouse() {
    const holder = $('canvas-holder');
    const coords = $('coords');
    holder.onmousemove = (e) => {
      const r = holder.getBoundingClientRect();
      const x = Math.round(((e.clientX - r.left) / r.width) * CANVAS_WIDTH);
      const y = Math.round(((e.clientY - r.top) / r.height) * CANVAS_HEIGHT);
      coords.textContent = `x: ${x}, y: ${y}`;
    };
    holder.onmouseleave = () => (coords.textContent = 'Ukáž myšou na plátno a uvidíš súradnice.');
    holder.onmouseleave(new MouseEvent('mouseleave'));
  }

  private loadView(): Promise<WorldView | null> {
    this.viewLoading ??= import('./voxel/view').then(
      ({ WorldView, blockLabel }) => {
        try {
          const view = new WorldView($('world-holder'));
          view.onInfo = (target, p) => ($('world-info').textContent = describeTarget(target, p, blockLabel));
          this.view = view;
          return view;
        } catch (e) {
          console.error(e);
          this.print('error', '❌ Tento prehliadač nevie zobraziť 3D svet (nemá zapnuté WebGL). Skús iný prehliadač.');
          return null;
        }
      },
      () => {
        this.viewLoading = null; // allow a retry, e.g. after the connection comes back
        this.print('error', '❌ 3D svet sa nepodarilo načítať. Skontroluj pripojenie a skús to znova.');
        return null;
      },
    );
    return this.viewLoading;
  }

  private renderReference() {
    const items: HTMLElement[] = API_DOCS.filter((d) => d.modes.includes(this.mode)).map((d) => {
      const item = document.createElement('button');
      item.className = 'ref-item';
      item.innerHTML = `<code><b>${d.name}</b>${d.args}</code><span>${d.info}</span>`;
      item.title = 'Klikni a vloží sa do kódu';
      item.onclick = () => this.insert(d.snippet);
      return item;
    });
    if (this.mode === 'world') items.push(this.blockPalette());
    $('reference-list').replaceChildren(...items);
  }

  /** The block types as clickable swatches; a click types the block's name into the code. */
  private blockPalette() {
    const box = document.createElement('div');
    box.className = 'ref-blocks';
    const title = document.createElement('p');
    title.innerHTML =
      "<b>Kocky</b> – klikni a vloží sa jej meno. Funguje aj slovenský názov alebo hocijaká farba: <code>'red'</code>, <code>'červená'</code>, <code>'#ff8800'</code>.";
    box.append(title);
    for (const b of BLOCKS) {
      const chip = document.createElement('button');
      chip.className = 'block-chip';
      chip.title = `${b.name} (${b.sk})`;
      chip.innerHTML = `<img src="${swatch(b)}" alt=""><code>${b.name}</code>`;
      chip.onclick = () => this.typeText(`'${b.name}'`);
      box.append(chip);
    }
    return box;
  }

  /** Types text at the cursor, replacing the selection (e.g. a selected block name). */
  private typeText(text: string) {
    const editor = this.editors[this.mode];
    editor.dispatch(editor.state.replaceSelection(text));
    editor.focus();
  }

  /** Inserts a snippet on a new line below the cursor. */
  private insert(template: string) {
    const editor = this.editors[this.mode];
    const line = editor.state.doc.lineAt(editor.state.selection.main.head);
    const prefix = line.text.trim() ? '\n' : '';
    const indent = /^\s*/.exec(line.text)![0];
    editor.dispatch({ selection: { anchor: line.to } });
    const isConstant = /^[A-Z]+$/.test(template);
    snippet(prefix + (prefix ? indent : '') + toSnippet(template) + (isConstant ? '' : ';'))(
      editor,
      null,
      line.to,
      line.to,
    );
    editor.focus();
  }
}

function describeTarget(target: Target | null, p: { x: number; y: number; z: number }, label: (id: number) => string) {
  const where = `📍 Si na x: ${Math.floor(p.x)}, y: ${Math.floor(p.y)}, z: ${Math.floor(p.z)}`;
  if (!target) return `${where}. Ukáž myšou na kocku a uvidíš jej súradnice.`;
  const at = `🎯 x: ${target.x}, y: ${target.y}, z: ${target.z}`;
  return `${at} – ${target.id === AIR ? 'voľné miesto na tráve' : label(target.id)} · ${where}`;
}
