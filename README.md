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
- In **🧱 3D svet**, code builds with blocks in a 256×256×256 world: `addBlock(x, y, z, 'brick')`, `deleteBlock`,
  `getBlock`, `fill(x1, y1, z1, x2, y2, z2, type)`, `clearWorld()`. y points up and y = 0 is the layer on the grass.
  Blocks outside the world (including below the grass) are ignored. A block type is a name from
  [src/sandbox/voxel/blocks.ts](src/sandbox/voxel/blocks.ts) (English or Slovak) or any color (`'red'`, `'červená'`, `'#ff8800'`).
  Every run starts with an empty world. Click into the view to fly: W A S D, mouse, Space up, Shift down, Esc to stop.
- Syntax errors are found with acorn before running. Runtime errors are mapped back to an editor line and
  explained in Slovak.

### How the 3D world works

The kid's code still runs in the worker, which keeps its own copy of the blocks (so `getBlock` answers instantly)
and sends every change to the page in batches. The page owns the three.js scene
([src/sandbox/voxel/view.ts](src/sandbox/voxel/view.ts)), so you can keep flying around while a program is
busy, and after ■ stops it. Blocks are stored in 16³ chunks ([grid.ts](src/sandbox/voxel/grid.ts)), allocated only
where something is built. Each changed chunk is turned into triangles ([mesher.ts](src/sandbox/voxel/mesher.ts)):
only faces next to an empty cell are drawn, with fixed shading per side and darker corners. three.js is a separate
chunk, downloaded only when the 3D tab is first opened.

## License

[MIT](LICENSE). Bundled third-party code keeps its own license: Blockly (Apache 2.0), CodeMirror, acorn and three.js (MIT),
and the Nunito and Press Start 2P fonts (SIL Open Font License).
