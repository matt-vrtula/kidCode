# Kubo kóduje

A playful, Slovak-language programming game for kids. Kubo, a neon cube, walks through a blocky pixel-art
world, and the player steers him with Blockly blocks. When kids are ready, they move on to real JavaScript
in the built-in editor.

**Play it:** https://matt-vrtula.github.io/kidCode/

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # checks every level is solvable
npm run build    # static site in dist/
```

Add `?odomkni` to the URL to unlock all levels.

## How it works

- `src/levels.ts`: the levels as ASCII maps, plus the toolbox, the block "par" and a reference solution for each.
- `src/blocks.ts`: the custom Slovak blocks and their JavaScript generators.
- `src/runner.ts`: runs the generated JS instantly against a simulated `World` and records each action
  as a step. It also catches infinite loops.
- `src/renderer.ts`: replays the recorded steps as a canvas animation. All textures are generated in code.
- Progress and each level's program are saved to `localStorage`.

Map tiles: `.` grass, `T` tree, `S` stone (mineable), `B` bedrock, `L` lava, `W` water, `D` diamond,
`G` portal, `^ > v <` start position and direction.

There are two chapters. In **Dobrodružstvo** (`chapter: 'maze'`) the goal is to reach the portal. In
**Kreslenie** (`chapter: 'draw'`), Kubo paints cells with `namaluj()` and `farba('…')` until the canvas matches
the level's `target` picture. Each target character is a color code from `src/colors.ts`.
A level with `free: true` has no target; it's for free drawing and can be exported as a PNG.

## JavaScript sandbox

The **💻 JavaScript** tab is for real typed code. It has a CodeMirror editor, a ▶ button, and an output
panel: either a console (**Konzola**) or a 640×480 canvas (**Plátno**).

- The code runs in a Web Worker ([public/sandbox-worker.js](public/sandbox-worker.js)), so an endless loop
  never freezes the page and the ■ button can always kill it. The code is wrapped in an async function,
  so `await sleep(100)` works anywhere (animations). The run counts as finished only after pending
  `setTimeout`/`setInterval`/`requestAnimationFrame` callbacks have run.
- In **Plátno**, drawing needs no setup: `fillCircle(x, y, diameter, color)`, `line(...)`, `drawRectangle(...)` …
  The full list, which also drives autocomplete and the clickable reference, is in
  [src/sandbox/api.ts](src/sandbox/api.ts). Colors can be CSS names or the Slovak names from `src/colors.ts`.
- Syntax errors are found with acorn before running. Runtime errors are mapped back to an editor line and
  explained in Slovak.

## License

[MIT](LICENSE). Bundled third-party code keeps its own license: Blockly (Apache 2.0), CodeMirror and acorn (MIT),
and the Nunito and Press Start 2P fonts (SIL Open Font License).
