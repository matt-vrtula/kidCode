// The 🧱 3D world on the screen: grass floor, a square sun, the blocks, and a flying camera.
// This module pulls in three.js, so the sandbox loads it only when the 3D tab is opened.

import * as THREE from 'three';
import { AIR, BLOCKS, COLOR_FLAG, LAYERS, TEX, colorOf, layerIndex, textureData } from './blocks';
import { CHUNK, CHUNKS, SIZE, VoxelGrid } from './grid';
import { meshChunk } from './mesher';

const SKY = new THREE.Color('#8ec9ff');
const FOG_NEAR = 180;
const FOG_FAR = 520;
/** Direction to the sun; matches the face shading in mesher.ts (+x, +y, +z faces are brighter). */
const SUN_DIR = new THREE.Vector3(0.45, 0.75, 0.5).normalize();
/** Where the camera starts: outside the corner of the world, looking at the blocks around [0, 0, 0]. */
const SPAWN = new THREE.Vector3(-9, 12, -11);
const SPAWN_TARGET = new THREE.Vector3(10, 1, 8);
/** The camera can fly a bit beyond the world, but not away for good. */
const MARGIN = 96;
const SLOW = 10; // blocks per second
const FAST = 45; // after holding a movement key for a while
/** Time spent rebuilding chunk meshes per frame, in ms; the rest waits for the next frame. */
const MESH_BUDGET = 8;
const REACH = 160; // how far the crosshair finds blocks

const vertexShader = /* glsl */ `
  attribute vec3 uvl;
  attribute float light;
  attribute vec3 tint;
  varying vec3 vUvl;
  varying float vLight;
  varying vec3 vTint;
  varying float vDist;
  void main() {
    vUvl = uvl;
    vLight = light;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2DArray map;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vUvl;
  varying float vLight;
  varying vec3 vTint;
  varying float vDist;
  void main() {
    // texture rows go top to bottom, v goes up
    vec4 tex = texture(map, vec3(vUvl.x, 1.0 - vUvl.y, vUvl.z));
    vec3 color = tex.rgb * vTint * vLight;
    color = mix(color, fogColor, smoothstep(fogNear, fogFar, vDist));
    // everything here is plain sRGB, like the colors kids type; no color management
    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface Target {
  x: number;
  y: number;
  z: number;
  /** Block id, or AIR when the crosshair points at the floor (then y is 0: the free cell above it). */
  id: number;
}

export class WorldView {
  readonly grid = new VoxelGrid();
  /** Called when the crosshair moves to another block, and when the camera moves. */
  onInfo: (target: Target | null, position: THREE.Vector3) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 4 / 3, 0.05, 2000);
  private material: THREE.ShaderMaterial;
  private meshes = new Map<number, THREE.Mesh>();
  private sun = new THREE.Group();
  private highlight: THREE.LineSegments;
  private crosshair: HTMLElement;
  private hint: HTMLElement;

  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private moveTime = 0;
  private mouse: { x: number; y: number } | null = null;
  private frame = 0;
  private last = 0;
  private lastInfo = '';

  constructor(private holder: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.tabIndex = -1;
    holder.append(canvas);

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'world-crosshair';
    this.hint = document.createElement('div');
    this.hint.className = 'world-hint';
    this.hint.innerHTML =
      '<b>Klikni sem a lietaj!</b><br>W A S D – pohyb, myš – rozhliadanie<br>medzerník – hore, Shift – dole, Esc – koniec';
    holder.append(this.crosshair, this.hint);

    this.scene.background = SKY;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        map: { value: createTextures() },
        fogColor: { value: srgb(SKY) },
        fogNear: { value: FOG_NEAR },
        fogFar: { value: FOG_FAR },
      },
    });

    this.scene.add(this.createFloor(), this.createAxes(), this.sun);
    this.createSun();
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
      new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.7 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.resetCamera();
    this.bindInput(canvas);
    new ResizeObserver(() => this.resize()).observe(holder);
  }

  /** Starts drawing frames (when the 3D tab is shown). */
  start() {
    if (this.frame) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame = requestAnimationFrame(loop);
      this.tick(Math.min((now - this.last) / 1000, 0.1));
      this.last = now;
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** Stops drawing frames (when another tab is shown). */
  pause() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  apply(ops: Int32Array) {
    this.grid.apply(ops);
  }

  clear() {
    this.grid.clear();
  }

  resetCamera() {
    this.camera.position.copy(SPAWN);
    this.camera.rotation.order = 'YXZ';
    this.camera.lookAt(SPAWN_TARGET);
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;
  }

  toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.holder.requestFullscreen?.();
  }

  // ---- scene ----------------------------------------------------------------

  /** A 1 block thick slab of grass under the whole world, so you can see where the world ends. */
  private createFloor() {
    const grassTop = layerIndex('grass_top');
    const grassSide = layerIndex('grass_side');
    const dirt = layerIndex('dirt');
    const S = SIZE;
    // quads: 4 corners each, counter-clockwise from outside; uv repeats once per block
    const quads: { p: number[][]; uv: number[][]; layer: number; light: number }[] = [
      { p: [[0, 0, S], [S, 0, S], [S, 0, 0], [0, 0, 0]], uv: [[0, 0], [S, 0], [S, S], [0, S]], layer: grassTop, light: 1 },
      { p: [[0, -1, 0], [S, -1, 0], [S, -1, S], [0, -1, S]], uv: [[0, 0], [S, 0], [S, S], [0, S]], layer: dirt, light: 0.5 },
      { p: [[0, -1, S], [S, -1, S], [S, 0, S], [0, 0, S]], uv: [[0, 0], [S, 0], [S, 1], [0, 1]], layer: grassSide, light: 0.78 },
      { p: [[S, -1, 0], [0, -1, 0], [0, 0, 0], [S, 0, 0]], uv: [[0, 0], [S, 0], [S, 1], [0, 1]], layer: grassSide, light: 0.6 },
      { p: [[S, -1, S], [S, -1, 0], [S, 0, 0], [S, 0, S]], uv: [[0, 0], [S, 0], [S, 1], [0, 1]], layer: grassSide, light: 0.86 },
      { p: [[0, -1, 0], [0, -1, S], [0, 0, S], [0, 0, 0]], uv: [[0, 0], [S, 0], [S, 1], [0, 1]], layer: grassSide, light: 0.66 },
    ];
    const positions: number[] = [];
    const uvl: number[] = [];
    const light: number[] = [];
    const indices: number[] = [];
    quads.forEach((q, i) => {
      q.p.forEach((p, k) => {
        positions.push(...p);
        uvl.push(q.uv[k][0], q.uv[k][1], q.layer);
        light.push(q.light);
      });
      indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uvl', new THREE.Float32BufferAttribute(uvl, 3));
    geometry.setAttribute('light', new THREE.Float32BufferAttribute(light, 1));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute(new Array(positions.length).fill(1), 3));
    geometry.setIndex(indices);
    return new THREE.Mesh(geometry, this.material);
  }

  /** Red x, green y and blue z arrows at [0, 0, 0], so kids can see which way the coordinates grow. */
  private createAxes() {
    const group = new THREE.Group();
    const axes: [string, string, THREE.Vector3][] = [
      ['x', '#ff3b3b', new THREE.Vector3(1, 0, 0)],
      ['y', '#2ee66b', new THREE.Vector3(0, 1, 0)],
      ['z', '#3b8bff', new THREE.Vector3(0, 0, 1)],
    ];
    const LEN = 5;
    for (const [name, color, dir] of axes) {
      const material = new THREE.MeshBasicMaterial({ color, fog: false });
      const size = (v: number) => (v ? LEN : 0.08);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(size(dir.x), size(dir.y), size(dir.z)), material);
      bar.position.copy(dir).multiplyScalar(LEN / 2).add(new THREE.Vector3(0, 0.04, 0));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 12), material);
      tip.position.copy(dir).multiplyScalar(LEN + 0.25).add(new THREE.Vector3(0, 0.04, 0));
      tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const label = textSprite(name, color);
      label.position.copy(dir).multiplyScalar(LEN + 1).add(new THREE.Vector3(0, 0.5, 0));
      group.add(bar, tip, label);
    }
    return group;
  }

  /** A blocky sun: a glowing square that always faces the camera and stays infinitely far away. */
  private createSun() {
    const square = (size: number, color: string, opacity: number) =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ color, fog: false, transparent: opacity < 1, opacity, depthWrite: false }),
      );
    const core = square(190, '#ffe766', 1);
    core.position.z = 1; // in front of the glow
    this.sun.add(square(300, '#fff3a0', 0.35), core);
  }

  // ---- input ----------------------------------------------------------------

  private get locked() {
    return document.pointerLockElement === this.renderer.domElement;
  }

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('click', () => {
      if (!this.locked) void canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.keys.clear();
      this.holder.classList.toggle('locked', this.locked);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.yaw -= e.movementX * 0.0025;
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * 0.0025));
      } else {
        const r = canvas.getBoundingClientRect();
        this.mouse = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
      }
    });
    canvas.addEventListener('mouseleave', () => (this.mouse = null));
    document.addEventListener('keydown', (e) => {
      if (!this.locked || e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      e.preventDefault(); // no page scrolling with the space bar
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private move(dt: number) {
    const k = this.keys;
    const forward = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    const right = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const up = Number(k.has('Space')) - Number(k.has('ShiftLeft') || k.has('ShiftRight'));
    if (!forward && !right && !up) {
      this.moveTime = 0;
      return;
    }
    // the longer you fly, the faster you go
    this.moveTime += dt;
    const speed = SLOW + (FAST - SLOW) * Math.min(1, Math.max(0, this.moveTime - 0.8) / 1.5);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const v = new THREE.Vector3(-sin * forward + cos * right, up, -cos * forward - sin * right);
    if (v.lengthSq() > 1) v.normalize();
    const p = this.camera.position.addScaledVector(v, speed * dt);
    p.x = Math.max(-MARGIN, Math.min(SIZE + MARGIN, p.x));
    p.z = Math.max(-MARGIN, Math.min(SIZE + MARGIN, p.z));
    p.y = Math.max(0.3, Math.min(SIZE + MARGIN, p.y));
  }

  // ---- frame ----------------------------------------------------------------

  private tick(dt: number) {
    if (this.locked) this.move(dt);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this.sun.position.copy(this.camera.position).addScaledVector(SUN_DIR, 1500);
    this.sun.lookAt(this.camera.position);
    this.rebuildMeshes();
    this.updateTarget();
    this.renderer.render(this.scene, this.camera);
  }

  /** Rebuilds changed chunks, nearest to the camera first, within a time budget per frame. */
  private rebuildMeshes() {
    const dirty = this.grid.dirty;
    if (!dirty.size) return;
    const p = this.camera.position;
    const centerDist = (ci: number) => {
      const cx = ci % CHUNKS;
      const cz = Math.floor(ci / CHUNKS) % CHUNKS;
      const cy = Math.floor(ci / CHUNKS / CHUNKS);
      return (cx * CHUNK + 8 - p.x) ** 2 + (cy * CHUNK + 8 - p.y) ** 2 + (cz * CHUNK + 8 - p.z) ** 2;
    };
    const order = [...dirty].sort((a, b) => centerDist(a) - centerDist(b));
    const start = performance.now();
    for (const ci of order) {
      if (performance.now() - start > MESH_BUDGET) break;
      dirty.delete(ci);
      this.rebuildChunk(ci);
    }
  }

  private rebuildChunk(ci: number) {
    const cx = ci % CHUNKS;
    const cz = Math.floor(ci / CHUNKS) % CHUNKS;
    const cy = Math.floor(ci / CHUNKS / CHUNKS);
    const old = this.meshes.get(ci);
    if (old) {
      old.geometry.dispose();
      this.scene.remove(old);
      this.meshes.delete(ci);
    }
    const data = meshChunk(this.grid, cx, cy, cz);
    if (!data) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('uvl', new THREE.BufferAttribute(data.uvl, 3));
    geometry.setAttribute('light', new THREE.BufferAttribute(data.light, 1));
    geometry.setAttribute('tint', new THREE.BufferAttribute(data.tint, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const half = CHUNK / 2;
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(cx * CHUNK + half, cy * CHUNK + half, cz * CHUNK + half),
      half * Math.sqrt(3),
    );
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    this.meshes.set(ci, mesh);
  }

  /** Finds the block under the crosshair (or under the mouse when not flying) and reports it. */
  private updateTarget() {
    let dir: THREE.Vector3 | null = null;
    if (this.locked) dir = this.camera.getWorldDirection(new THREE.Vector3());
    else if (this.mouse)
      dir = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const target = dir ? this.raycast(this.camera.position, dir) : null;

    this.highlight.visible = !!target;
    if (target) this.highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

    const p = this.camera.position;
    const key = target ? `${target.x},${target.y},${target.z},${target.id}` : '';
    const info = `${key}|${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
    if (info !== this.lastInfo) {
      this.lastInfo = info;
      this.onInfo(target, p);
    }
  }

  /** Walks the ray through the grid cell by cell (Amanatides & Woo). */
  private raycast(origin: THREE.Vector3, dir: THREE.Vector3): Target | null {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const step = [Math.sign(dir.x), Math.sign(dir.y), Math.sign(dir.z)];
    const o = [origin.x, origin.y, origin.z];
    const d = [dir.x, dir.y, dir.z];
    const cell = [x, y, z];
    const tMax = [0, 0, 0];
    const tDelta = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      tDelta[i] = d[i] ? Math.abs(1 / d[i]) : Infinity;
      const boundary = step[i] > 0 ? cell[i] + 1 : cell[i];
      tMax[i] = d[i] ? (boundary - o[i]) / d[i] : Infinity;
    }
    let t = 0;
    while (t <= REACH) {
      [x, y, z] = cell;
      if (y < 0) {
        // went through the floor: the free cell above it
        const inside = x >= 0 && z >= 0 && x < SIZE && z < SIZE;
        return inside ? { x, y: 0, z, id: AIR } : null;
      }
      const id = this.grid.get(x, y, z);
      if (id !== AIR) return { x, y, z, id };
      const i = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      t = tMax[i];
      tMax[i] += tDelta[i];
      cell[i] += step[i];
    }
    return null;
  }

  private resize() {
    const w = this.holder.clientWidth;
    const h = this.holder.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

/** The block textures as one texture array; every layer gets its own mipmaps, so far blocks don't flicker. */
function createTextures() {
  const texture = new THREE.DataArrayTexture(textureData(), TEX, TEX, LAYERS.length);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function srgb(color: THREE.Color) {
  const c = color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function textSprite(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 48px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#000';
  g.strokeText(text, 32, 34);
  g.fillStyle = color;
  g.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false }));
  sprite.scale.set(1.2, 1.2, 1);
  return sprite;
}

/** The Slovak or English name of a block id, for the crosshair label. */
export function blockLabel(id: number) {
  if (id & COLOR_FLAG) {
    const hex = colorOf(id)
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    return `farebná kocka #${hex}`;
  }
  const b = BLOCKS.find((b) => b.id === id);
  return b ? `${b.name} (${b.sk})` : 'kocka';
}
