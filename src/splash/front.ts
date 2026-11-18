// The front page (Yury, 15.11): the poster scene before the game — the showcase models where the splash art draws
// their doubles, turned as drawn, their wire copies, the small things, the title (Punto types himself), the player
// who speaks, the background drawn in code (src/splash/backdrop.ts) — the scene round and round. Shown by the game
// (src/index.ts) until the player goes into XR, and by the stand /research/stands/splash.html (research/code/tools/splash-stand.ts).
import { AnimationMixer, Box3, createSystem, DirectionalLight, Group, HemisphereLight, InstancedMesh, LineSegments, LoopOnce, type Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, PMREMGenerator, type Texture, Vector3, type World } from '@iwsdk/core';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { wirePunto } from './props.js';
import { asGroup, wireCopy } from './wire.js';
import * as bits from './bits.js';
import { createTitle } from './title.js';
import { createBackdrop } from './backdrop.js';
import { burnable, burnUniforms } from '../ghost.js';
import { bake } from './bake.js';

type Module = { build: () => Group; idle?: (root: Group, time: number) => void };
const files = import.meta.glob<Module>('./models/model-*.ts', { eager: true });
const mods = new Map(Object.entries(files).map(([path, mod]) => [path.split('model-').pop()!.replace('.ts', ''), mod]));


export interface Front {
  /** The poster on (its light, its lens, its background; the level hidden) or off (all as the game had it). */
  show(on: boolean): void;
  /** Compile every material it will draw (the hidden ones too), so nothing stutters the first time it shows. */
  warm(): Promise<void>;
  readonly shown: boolean;
  /** The stand's live handles (window.__splash on /research/stands/splash.html). */
  debug: Record<string, unknown>;
}

/**
 * The front page: the poster scene in `world` (the game's or a stand's), shown at once. `params`: the stand's flags
 * (?still ?boy ?art ?concept ?onion ?grid ?bare); `dev`: the stand's buttons, hint, grid.
 */
export async function startFront(world: World, params = new URLSearchParams(location.search), dev = false): Promise<Front> {
  const hint = document.getElementById('hint');
  // the art's light: a cool sky and violet below, a warm key from the upper right, a cyan rim from the left — its
  // own group, on only while the poster shows (the game keeps its own light)
  const lights = new Group();
  lights.name = 'FrontLights';
  lights.add(new HemisphereLight(0xcfe0ff, 0x2e2a58, 0.75));
  const key = new DirectionalLight(0xfff0d8, 2.7);
  key.position.set(2, 4, 3);
  const rim = new DirectionalLight(0x7fefff, 1.4);
  rim.position.set(-4, 1, -1);
  lights.add(key, rim);
  world.scene.add(lights);
  const posterEnv = new PMREMGenerator(world.renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // The player in place of the drawn boy (Meshy, ~/code/02_vr-projects/xr-player: a skeleton, Idle /
  // Talk_with_Right_Hand_Open / Wave_One_Hand, a «mouthOpen» morph). Loaded before the spots, so it is one of them.
  const playerGltf = params.has('boy') ? null : await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/splash/player-talk.glb').catch(() => null);

  // Where each double is in the art (pixels of the 2576 × 1438 picture), how wide the model's outline is there,
  // how far it floats, and how it is turned (radians, applied x then y then z to the model as built).
  const ART = { w: 2576, h: 1438 };
  // wire: drawn as a glowing wire copy of that colour (the art's «digital copies»); id: when one model is placed twice
  interface Spot { model: string; id?: string; make?: () => Group; fixed?: boolean; x: number; y: number; w: number; depth: number; pose: [number, number, number]; hide?: string[]; wire?: number }
  const SPOTS: Spot[] = [
    { model: 'forest-island', x: 262, y: 407, w: 356, depth: 3.2, pose: [0.6, 0.5, -0.62] },
    { model: 'rock-island', x: 918, y: 286, w: 255, depth: 3.8, pose: [0.38, -0.35, 0.05] },
    // the castle takes the bottom right, as in the art; turned to us, its ground tilted up so we see more of it
    { model: 'castle', x: 2215, y: 1120, w: 900, depth: 3, pose: [0.38, -0.3, 0] },
    { model: 'pine-trees', x: 1123, y: 973, w: 253, depth: 3.3, pose: [0, 0, 0] },
    { model: 'starry-orbit', x: 662, y: 140, w: 108, depth: 4.4, pose: [0.2, 0, 0.25], hide: ['Bits'], wire: 0xffa860 },
    { model: 'question-block', x: 1675, y: 144, w: 120, depth: 3.6, pose: [0.3, 0.6, -0.2], hide: ['Bits'] },
    { model: 'gamepad', x: 1690, y: 1059, w: 100, depth: 3, pose: [0.7, 0.1, -0.35] },
    { model: 'retro-console', x: 2272, y: 719, w: 180, depth: 3.4, pose: [0.5, 0.5, 0.2], wire: 0xffa860 },
    // the cyan wire copies: the island beside the grass one, the castle up by the window, Punto under the wave
    { model: 'forest-island', id: 'wire-island', x: 557, y: 307, w: 262, depth: 3.6, pose: [0.45, -0.3, -0.25], wire: 0x7fe9ff },
    // the wire castle: no island under it in the art, only the wall and towers, seen from the front
    { model: 'castle', id: 'wire-castle', x: 1816, y: 219, w: 356, depth: 4, pose: [-0.1, -0.15, 0], hide: ['Grass', 'Earth', 'Stream', 'Trees', 'Bushes'], wire: 0x7fe9ff },
    // the rest have no double in the art: in the free places round the title, Punto, the tagline and the boy
    { model: 'portal', x: 1470, y: 175, w: 190, depth: 4.4, pose: [0.1, 0.45, 0.05] },
    { model: 'antenna', x: 1225, y: 175, w: 145, depth: 4.6, pose: [0.35, 0.65, -0.32] },
    { model: 'ufo', x: 2405, y: 190, w: 210, depth: 3.8, pose: [0.3, 0, 0.08] },
    { model: 'generator', x: 2490, y: 470, w: 105, depth: 3.6, pose: [0.15, -0.4, -0.08] },
    { model: 'volcano', x: 200, y: 690, w: 190, depth: 3.6, pose: [0.3, 0.5, 0.06] },
    { model: 'crystals', x: 555, y: 690, w: 115, depth: 3.8, pose: [0.2, -0.3, -0.12] },
    { model: 'chest', x: 880, y: 1090, w: 150, depth: 3.2, pose: [0.35, -0.45, 0.06] },
    { model: 'clock-tower', x: 2530, y: 720, w: 100, depth: 3.4, pose: [0.1, -0.5, 0.18] },
    { model: 'toy-plane', x: 330, y: 560, w: 170, depth: 3.6, pose: [0.25, 1.35, -0.2] },
    // the small things (src/splash/bits.ts), read off the art at its own 2576 × 1438 scale
    { model: 'yellow-block', make: bits.twoTone(0xf5c542, 0x4f6fd8), x: 585, y: 755, w: 60, depth: 3.4, pose: [0.4, 0.6, 0.3] },
    { model: 'red-ball', make: bits.ball, x: 572, y: 600, w: 66, depth: 3.4, pose: [0.2, 0.8, 0] },
    { model: 'pebble-a', make: bits.pebble(1), x: 300, y: 612, w: 26, depth: 3.2, pose: [0.3, 0.2, 0.4] },
    { model: 'pebble-b', make: bits.pebble(2), x: 382, y: 650, w: 22, depth: 3.2, pose: [0.1, 1.2, 0.2] },
    { model: 'pebble-c', make: bits.pebble(3), x: 288, y: 572, w: 18, depth: 3.2, pose: [0.5, 0.4, 0.8] },
    { model: 'orb', make: bits.orb(0xff4fd8), x: 1645, y: 140, w: 72, depth: 3.8, pose: [0.2, 0, 0] },
    { model: 'wire-pyramid', make: bits.wirePyramid(0x7fe9ff), x: 275, y: 110, w: 115, depth: 3.8, pose: [0.4, 0.6, 0.2] },
    { model: 'wire-ball', make: bits.wireBall(0x7fe9ff), x: 215, y: 305, w: 95, depth: 3.4, pose: [0.2, 0.3, 0] },
    { model: 'cube-yellow', make: bits.cube(0xf5c542), x: 2245, y: 340, w: 55, depth: 3.6, pose: [0.5, 0.7, 0.2] },
    { model: 'cube-lime', make: bits.cube(0xc8d84a), x: 2025, y: 400, w: 48, depth: 3.6, pose: [0.3, 0.4, 0.5] },
    { model: 'cube-violet', make: bits.cube(0x9b6bd6), x: 2440, y: 265, w: 38, depth: 3.6, pose: [0.6, 0.3, 0.1] },
    { model: 'cube-orange', make: bits.cube(0xf6a34c), x: 2375, y: 467, w: 26, depth: 3.6, pose: [0.2, 0.9, 0.4] },
    { model: 'big-cube', make: bits.bigCube, x: 2475, y: 380, w: 210, depth: 3.4, pose: [0.45, 0.55, 0.15] },
    { model: 'gem-violet', make: bits.gem(0xb48cf2, 0x5a3ab8), x: 2392, y: 615, w: 42, depth: 3.4, pose: [0.3, 0.5, 0.4] },
    { model: 'cube-cyan', make: bits.cube(0x8fe3f0), x: 2440, y: 612, w: 58, depth: 3.4, pose: [0.4, 0.3, 0.6] },
    { model: 'cube-cyan-small', make: bits.cube(0x8fe3f0), x: 2500, y: 690, w: 34, depth: 3.4, pose: [0.7, 0.5, 0.2] },
    { model: 'cube-pink', make: bits.cube(0xc84a9a), x: 1790, y: 1350, w: 70, depth: 3, pose: [0.5, 0.6, 0.1] },
    { model: 'origami', make: bits.origami, x: 2330, y: 1300, w: 330, depth: 2.8, pose: [0.3, 0.6, 0.2] },
    { model: 'sign', make: bits.sign, x: 2365, y: 185, w: 210, depth: 3.6, pose: [0.15, -0.45, -0.18] },
    // the player, seen as the art draws the boy: from his front left, turned to the title
    // fixed: placed by his mouth and his head's size (placePlayer), not by an outline (a skinned mesh's stored
    // vertices are its rest pose, not what is drawn)
    ...(playerGltf ? [{ model: 'player', make: () => playerGltf.scene, x: 495, y: 945, w: 240, depth: 2.4, pose: [0, 1.0, 0] as [number, number, number], fixed: true }] : []),
    { model: 'wire-punto', x: 1398, y: 931, w: 218, depth: 3.4, pose: [0.25, -0.8, -0.1] },
  ];

  /** Every visible vertex of a model (instances too), through a matrix: the exact outline, not boxes. */
  const vtx = new Vector3(), inst = new Matrix4(), full = new Matrix4();
  function eachVertex(root: Object3D, through: Matrix4, visit: (v: Vector3) => void): void {
    root.updateWorldMatrix(true, true);
    root.traverseVisible((o) => {
      if (!(o instanceof Mesh) && !(o instanceof LineSegments)) return; // lines too: a wire copy may be only lines
      const pos = o.geometry.getAttribute('position');
      const n = o instanceof InstancedMesh ? o.count : 1;
      for (let k = 0; k < n; k++) {
        full.multiplyMatrices(through, o.matrixWorld);
        if (o instanceof InstancedMesh) { o.getMatrixAt(k, inst); full.multiply(inst); }
        for (let i = 0; i < pos.count; i++) visit(vtx.fromBufferAttribute(pos, i).applyMatrix4(full));
      }
    });
  }

  // the models Punto makes in the poster's scene (see below): their parts stay apart
  const MAKES = ['antenna', 'portal', 'ufo', 'generator', 'clock-tower', 'chest', 'crystals', 'volcano', 'toy-plane'];
  const bakeLog: [string, number, number][] = [];
  // holder (placed, faces the eye) → pose (the art's turn) → bob (floats) → the model, centred on its box
  interface Placed { spot: Spot; holder: Group; pose: Group; bob: Group; model: Group; idle?: Module['idle']; width: number; seed: number }
  const props = new Group();
  props.name = 'SplashProps';
  world.camera.add(props);
  const placed: Placed[] = SPOTS.filter((s) => mods.has(s.model) || s.make || s.model === 'wire-punto').map((spot, seed) => {
    spot.id ??= spot.model;
    const mod = mods.get(spot.model), built = spot.make ? spot.make() : mod ? mod.build() : wirePunto();
    const model = spot.wire ? asGroup(wireCopy(built, spot.wire)) : built;
    for (const name of spot.hide ?? []) { const o = model.getObjectByName(name); if (o) o.visible = false; }
    // its still parts merged, one draw per material (src/splash/bake.ts); a model Punto makes keeps its top-level
    // parts, each burns in on its own. The player (skinned, a glb) and Punto's wire copy stay as they are.
    if (!spot.fixed) bakeLog.push([spot.id, ...bake(model, !spot.wire && MAKES.includes(spot.id))]);
    const holder = new Group(), pose = new Group(), bob = new Group();
    holder.name = spot.id;
    holder.add(pose); pose.add(bob); bob.add(model); props.add(holder);
    const p: Placed = { spot, holder, pose, bob, model, idle: mod?.idle, width: 1, seed };
    fit(p);
    return p;
  });
  /** Centre the model on its visible box as posed, and measure its width on the page (the box's x). */
  function fit(p: Placed): void {
    p.pose.rotation.set(...p.spot.pose);
    p.bob.position.set(0, 0, 0);
    p.bob.rotation.set(0, 0, 0);
    p.model.position.set(0, 0, 0);
    p.holder.updateWorldMatrix(true, true); // the camera above it too: its matrix may not be set yet
    const box = new Box3(), inv = p.holder.matrixWorld.clone().invert();
    eachVertex(p.model, inv, (v) => box.expandByPoint(v));
    const centre = box.getCenter(new Vector3());
    // shift the model so the posed box is centred on the holder: move in the pose's frame
    const local = centre.clone().applyMatrix4(p.pose.matrix.clone().invert());
    p.model.position.copy(local).negate();
    p.width = box.getSize(new Vector3()).x;
  }

  // The art is laid as CSS «cover»: scaled to fill the page, centred, the overflow cut. A point of the art then
  // lands at a known pixel of the page, and that pixel, at a depth, is a known point in the camera's space.
  const FRONT = new Vector3(0, 0, 1), toEye = new Vector3();
  function layout(): void {
    const W = innerWidth, H = innerHeight, cam = world.camera;
    const s = Math.max(W / ART.w, H / ART.h), ox = (W - ART.w * s) / 2, oy = (H - ART.h * s) / 2;
    const tan = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    for (const p of placed) {
      const { spot } = p, px = ox + spot.x * s, py = oy + spot.y * s;
      const nx = (px / W) * 2 - 1, ny = 1 - (py / H) * 2, d = spot.depth;
      p.holder.position.set(nx * tan * cam.aspect * d, ny * tan * d, -d);
      // turned to the eye, as the art draws each thing from where it is seen; its width in the art as pixels
      // of the page, as metres at that depth
      p.holder.quaternion.setFromUnitVectors(FRONT, toEye.copy(p.holder.position).negate().normalize());
      p.holder.scale.setScalar((((spot.w * s) / H) * 2 * tan * d) / p.width);
    }
  }
  layout();

  /** The model's outline on the page, in CSS pixels: [left, top, right, bottom], from its projected vertices. */
  function pageRect(p: Placed): number[] {
    const r = [Infinity, Infinity, -Infinity, -Infinity], cam = world.camera;
    cam.updateMatrixWorld(true);
    const toClip = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    eachVertex(p.model, new Matrix4(), (v) => {
      v.applyMatrix4(toClip);
      const x = ((v.x + 1) / 2) * innerWidth, y = ((1 - v.y) / 2) * innerHeight;
      r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], y); r[2] = Math.max(r[2], x); r[3] = Math.max(r[3], y);
    });
    return r;
  }
  /**
   * Perspective makes a thing off the centre look a little bigger and pulls its outline: measure each on the
   * page and correct its scale and place, three times, so its outline is the drawn one's width at its centre.
   */
  function settle(): void {
    const W = innerWidth, H = innerHeight, cam = world.camera, s = Math.max(W / ART.w, H / ART.h), ox = (W - ART.w * s) / 2, oy = (H - ART.h * s) / 2;
    const tan = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    for (let pass = 0; pass < 3; pass++) for (const p of placed) {
      if (p.spot.fixed) continue;
      const r = pageRect(p), d = p.spot.depth, perPx = (2 * tan * d) / H;
      p.holder.scale.multiplyScalar((p.spot.w * s) / Math.max(1, r[2] - r[0]));
      const dx = ox + p.spot.x * s - (r[0] + r[2]) / 2, dy = oy + p.spot.y * s - (r[1] + r[3]) / 2;
      p.holder.position.x += dx * perPx;
      p.holder.position.y -= dy * perPx;
    }
  }
  const relayout = () => { layout(); settle(); placePlayer(); };
  addEventListener('resize', () => requestAnimationFrame(relayout));
  settle();

  // The background drawn in code (src/splash/backdrop.ts): the tunnel of grids, the window, the frames, the vortex,
  // the voice wave. A point of the art at a depth, in the camera's space, as layout() places things:
  function artPoint(x: number, y: number, depth: number): Vector3 {
    const W = innerWidth, H = innerHeight, cam = world.camera, s = Math.max(W / ART.w, H / ART.h), ox = (W - ART.w * s) / 2, oy = (H - ART.h * s) / 2;
    const tan = Math.tan(((cam.fov * Math.PI) / 180) / 2), nx = ((ox + x * s) / W) * 2 - 1, ny = 1 - ((oy + y * s) / H) * 2;
    return new Vector3(nx * tan * cam.aspect * depth, ny * tan * depth, -depth);
  }
  const backdrop = createBackdrop(artPoint);
  props.add(backdrop.root);
  addEventListener('resize', () => requestAnimationFrame(() => backdrop.place(artPoint)));
  // the poster's own background (no picture under it); ?art / ?concept: the splash art under it, to compare
  const POSTER_BG = params.has('concept') ? '#07090c url(/research/concepts/title/splash-concept.jpeg) center / cover no-repeat' : params.has('art') ? '#07090c url(/splash.jpg) center / cover no-repeat' : 'radial-gradient(ellipse at 47% 46%, #1a2350 0%, #0b1030 45%, #050818 100%)';
  // ?boy (or no player model): the boy lifted out of the art (research/code/tools/lift-subject.swift, Apple Vision), laid as the
  // art was («cover») and over the 3D, so the grids do not run across him
  const boy = !POSTER_BG || playerGltf ? null : document.createElement('div');
  if (boy) boy.style.cssText = 'position:fixed;inset:0;background:url(/splash-boy.png) center / cover no-repeat;pointer-events:none;z-index:3';

  // The title (src/splash/title.ts, the same as the game's): PUNTO with Punto as the O and the neon line, where the
  // art draws them; it types itself in once (or, with ?still, is shown done at once). x, y: the letters' middle in
  // the art's pixels; scale: of the logo as built (letters ~0.29 m tall).
  const TITLE = { x: 1326, y: 705, depth: 3, scale: 1.14, neonY: -0.78, neonX: -0.17, neonScale: 0.78, hold: 2 };
  const titleRoot = new Group();
  titleRoot.name = 'Title';
  props.add(titleRoot);
  // the O high enough over Punto's head to show, his screen over its lower part as drawn (0.05 hid it all)
  const title = await createTitle(world, { parent: titleRoot, place: false, effects: false, oRise: 0.22 });
  function placeTitle(): void {
    const W = innerWidth, H = innerHeight, cam = world.camera, s = Math.max(W / ART.w, H / ART.h), ox = (W - ART.w * s) / 2, oy = (H - ART.h * s) / 2;
    const tan = Math.tan(((cam.fov * Math.PI) / 180) / 2), nx = ((ox + TITLE.x * s) / W) * 2 - 1, ny = 1 - ((oy + TITLE.y * s) / H) * 2;
    titleRoot.position.set(nx * tan * cam.aspect * TITLE.depth, ny * tan * TITLE.depth, -TITLE.depth);
    titleRoot.quaternion.setFromUnitVectors(FRONT, toEye.copy(titleRoot.position).negate().normalize());
    titleRoot.scale.setScalar(TITLE.scale);
    // the neon line lower than the game's (-0.7 m): clear of the pines and the wire Punto under the letters
    title.neon.position.y = TITLE.neonY;
    // smaller than the game's and in the gap between the boy's hand and the castle: nothing over it
    title.neon.position.x = TITLE.neonX;
    title.neon.scale.setScalar(TITLE.neonScale);
  }
  placeTitle();
  addEventListener('resize', () => requestAnimationFrame(placeTitle));
  // the scene starts it (after the player has spoken and the loop has come); ?still: shown done at once
  if (params.has('still')) { title.start(); for (let i = 0; i < 300; i++) title.update(0.05, i * 0.05); }

  // The models with no double in the art come out of the player's words (Yury, 15.11): as he speaks each shows up as
  // a draft — the game's look while a thing is being written: its glowing cyan edges (src/splash/wire.ts) — one
  // after another; then Punto makes them, part by part, each part burning in out of noise with Punto's cyan rim
  // (the game's burn, src/ghost.ts) as his pixels fly to it from his hands; a model done, its draft goes. As he wipes
  // the title, they burn away.
  interface Part { node: Object3D; u: ReturnType<typeof burnUniforms>; lines: Object3D[]; from: number; to: number; at: number }
  interface Made { p: Placed; parts: Part[]; draft: Object3D; draftMats: { m: Material & { opacity: number }; base: number }[]; level: number; from: number; to: number; at: number }
  const PART_BURN = 0.45, DRAFT_FADE = 0.35;
  const made: Made[] = MAKES.map((id) => placed.find((q) => q.spot.id === id)).filter((p): p is Placed => !!p).map((p) => {
    // its parts: the model's own top-level pieces, each with its own burn (and its own copies of the materials)
    const parts: Part[] = p.model.children.map((node) => {
      const u = burnUniforms(1), lines: Object3D[] = [], copies = new Map<Material, Material>();
      const burn = (m: Material) => {
        let c = copies.get(m);
        if (!c) { c = burnable(m.clone(), u, false); c.needsUpdate = true; copies.set(m, c); }
        return c;
      };
      node.traverse((o) => {
        if (o instanceof Mesh) o.material = Array.isArray(o.material) ? o.material.map(burn) : burn(o.material);
        else if (o instanceof LineSegments || (o as { isPoints?: boolean }).isPoints) lines.push(o); // glows: on with it
      });
      return { node, u, lines, from: 1, to: 1, at: -1 };
    });
    // its draft: a fresh build of it as a wire copy, laid over it
    const draft = wireCopy(mods.get(p.spot.model)!.build(), 0x7fe9ff);
    bakeLog.push([`${p.spot.id} draft`, ...bake(draft, false, true)]); // it never moves: one fill and one set of lines
    draft.name = `${p.spot.id}Draft`;
    p.bob.add(draft);
    const draftMats: Made['draftMats'] = [];
    draft.traverse((o) => {
      const m = (o as Mesh).material as (Material & { opacity: number }) | undefined;
      if (m && !draftMats.some((d) => d.m === m)) draftMats.push({ m, base: m.opacity });
    });
    return { p, parts, draft, draftMats, level: 0, from: 0, to: 0, at: -1 };
  });
  function setMade(shown: boolean): void {
    for (const k of made) {
      for (const part of k.parts) { part.u.uBurn.value = shown ? 0 : 1; part.at = -1; for (const l of part.lines) l.visible = shown; }
      k.level = 0; k.at = -1;
    }
  }
  setMade(params.has('still'));
  /** The draft of a model fades to `to` (0..1) from time `at`. */
  const fadeDraft = (k: Made, to: number, at: number) => { k.from = k.level; k.to = to; k.at = at; };
  /** Its parts burn to `to` (0 = whole, 1 = gone), one after another from `at`, `gap` apart; whole ones send pixels. */
  function burnParts(k: Made, to: number, at: number, gap: number): number {
    k.parts.forEach((part, j) => { part.from = part.u.uBurn.value; part.to = to; part.at = at + j * gap; });
    return at + (k.parts.length - 1) * gap + PART_BURN;
  }

  /**
   * The player: his head as big as the drawn boy's (w: the head's height in the art's pixels, ~0.25 m), his mouth
   * where the drawn voice wave starts (x, y), turned as the pose says; the rest of him below the frame, as drawn.
   */
  function placePlayer(): void {
    const p = placed.find((q) => q.spot.id === 'player');
    if (!p || !mouth.parent) return;
    const { x, y, w, depth } = p.spot;
    const target = artPoint(x, y, depth), headPx = artPoint(x, y, depth).distanceTo(artPoint(x, y + w, depth));
    p.holder.quaternion.identity();
    // turned first, then leaned about his own shoulders' axis (YXZ): a lean forward is towards where he looks
    p.pose.rotation.order = 'YXZ';
    p.pose.rotation.set(...p.spot.pose);
    p.model.position.set(0, 0, 0);
    p.holder.scale.setScalar(headPx / 0.25);
    p.holder.position.copy(target);
    props.updateMatrixWorld(true);
    const m = props.worldToLocal(mouth.getWorldPosition(new Vector3()));
    p.holder.position.add(target.sub(m));
    // he looks at Punto: turned to him (not so far that his face is lost), his head a little back, as Punto is higher
    if (!looked) {
      looked = true;
      props.updateMatrixWorld(true);
      const at = props.worldToLocal(mouth.getWorldPosition(new Vector3())), to = props.worldToLocal(title.punto.object.getWorldPosition(new Vector3())).sub(at);
      const yaw = Math.min(1.35, Math.atan2(to.x, to.z) + FACE_OFFSET), up = Math.atan2(to.y, Math.hypot(to.x, to.z));
      void up;
      // the body a little forward, towards Punto (leaning back with his head up, his neck looked broken)
      p.spot.pose = [BODY_LEAN, yaw, 0];
      placePlayer();
      looked = false;
    }
  }
  // his model faces +X at a turn of ~1.75 rad (read off the showcase: 1.92 a profile to the right, 1.0 three quarters)
  const FACE_OFFSET = 0.18, BODY_LEAN = 0.1;
  let looked = false;

  // The player's life: talking (right-hand gestures, his mouth moving) while Punto types and wipes, a wave of the hand
  // at the ta-da, idle otherwise; the voice wave starts at his real mouth.
  const player = placed.find((p) => p.spot.id === 'player');
  const mixer = player && playerGltf ? new AnimationMixer(player.model) : null;
  // no root motion: the hips' moves and turns taken out of every clip (talking, the clip turned him round, his back to
  // us); his arms, spine and head still play
  for (const c of playerGltf?.animations ?? []) c.tracks = c.tracks.filter((tr) => !/Hips\.(position|quaternion)$/.test(tr.name));
  const clips = new Map((playerGltf?.animations ?? []).map((c) => [c.name, mixer!.clipAction(c)]));
  let clipNow: ReturnType<AnimationMixer['clipAction']> | null = null;
  function act(name: string, fade = 0.4): void {
    const next = clips.get(name);
    if (!next || next === clipNow) return;
    next.reset().play();
    if (clipNow) clipNow.crossFadeTo(next, fade, false);
    clipNow = next;
  }
  const handWave = clips.get('Wave_One_Hand');
  if (handWave) { handWave.setLoop(LoopOnce, 1); handWave.clampWhenFinished = true; }
  // a one-off clip (the wave) ended: back to idle — only if it is still the one playing (the scene may have moved
  // him on to talking before it ended; that must not be cut short)
  mixer?.addEventListener('finished', (e) => { if (e.action === clipNow) act('Idle', 0.5); });
  act('Idle', 0);
  const mouthMeshes: Mesh[] = [];
  player?.model.traverse((o) => { if (o instanceof Mesh && o.morphTargetDictionary && 'mouthOpen' in o.morphTargetDictionary) mouthMeshes.push(o); });
  // his mouth on his head bone, where talk.html found it (1.515 m up, 0.125 m forward in the model's rest pose)
  const mouth = new Object3D();
  if (player) {
    const head = player.model.getObjectByName('mixamorigHead') ?? player.model.getObjectByName('mixamorig:Head');
    if (head) { player.model.updateMatrixWorld(true); mouth.position.copy(head.worldToLocal(player.model.localToWorld(new Vector3(0, 1.515, 0.125)))); head.add(mouth); }
  }
  const mouthAt = new Vector3();
  // his head raised to Punto over whatever the animation does with it (each frame, after the mixer): the neck a
  // little, the head more; turns about the bones' own X (a nod), negative = up on this rig
  const neckBone = player?.model.getObjectByName('mixamorigNeck') ?? null;
  const headBone = player?.model.getObjectByName('mixamorigHead') ?? null;
  // the neck not bent back (it creased his nape into a dent, a hump over it): only the head looks up
  const LOOK_UP = { neck: 0, head: -0.4 };
  // his back held straight: the clips stoop and turn his spine and neck (he looked hunched, turned away, in every
  // phase); after each frame of them those bones go most of the way back to the model's own upright stance (its
  // rest pose, read before any clip plays), his arms still gesturing; then the head is raised to Punto
  const UPRIGHT = 0.8;
  const spineBones = ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2', 'mixamorigNeck', 'mixamorigHead']
    .map((n) => player?.model.getObjectByName(n)).filter((b): b is Object3D => !!b)
    .map((bone) => ({ bone, rest: bone.quaternion.clone() }));
  let lastPhase = '';
  let speakAt = -10;
  let scene: 'type' | 'wave' | 'speak' | 'loop' | 'build' | 'hold' | 'wipe' = 'type', sceneAt = -1, buildEnd = 0, waveEnd = 0, voice = 0, voiceTo = 0, loop = 0, loopTo = 0;
  const pixelTo = new Vector3();
  placePlayer();
  addEventListener('resize', () => requestAnimationFrame(placePlayer));

  // a little life: each floats on its own beat and sways a touch round its pose; the whole set turns a touch
  // after the mouse, so the 3D shows against the flat art
  let lookX = 0, lookY = 0, still = params.has('still');
  addEventListener('pointermove', (e) => { lookX = (e.clientX / innerWidth) * 2 - 1; lookY = (e.clientY / innerHeight) * 2 - 1; });
  world.registerSystem(
    class SplashLife extends createSystem({}) {
      update(delta: number, time: number): void {
        if (!shown) return;
        hideLate();
        for (const p of placed) {
          // the player stands still (his own animations are life enough; floating, he swung like a pendulum)
          const k = p.seed * 1.7, sway = still || p.spot.fixed ? 0 : 1;
          p.bob.position.y = (Math.sin(time * 0.9 + k) * 0.012 * sway) / Math.max(p.holder.scale.x, 0.001);
          p.bob.rotation.y = Math.sin(time * 0.5 + k) * 0.05 * sway;
          p.idle?.(p.model, still ? 0 : time);
        }
        if (!still) {
          title.update(delta, time);
          // the scene, round and round: Punto types himself; the player waves to catch his eye, then speaks; the loop
          // of streams grows and the drafts come out of his words; Punto makes them part by part; a breath; Punto
          // wipes it all with backspace, the models burn away, the loop fades; Punto types again
          const t = title.state();
          if (sceneAt < 0) { scene = 'type'; sceneAt = time; title.start(); act('Idle', 0.3); }
          if (scene === 'type' && t.phase === 'tada') {
            scene = 'wave'; sceneAt = time;
            act('Wave_One_Hand', 0.3);
            waveEnd = time + (handWave?.getClip().duration ?? 2.5) - 0.3;
          }
          if (scene === 'wave' && time > waveEnd) { scene = 'speak'; sceneAt = time; speakAt = time; act('Talk_with_Right_Hand_Open', 0.4); voiceTo = 1; }
          // he speaks ~2.8 s (halved, 15.11): the loop starts 0.6 s in, the drafts tick out 0.17 s apart
          if (scene === 'speak' && time > sceneAt + 0.6) {
            scene = 'loop'; sceneAt = time; loopTo = 1;
            made.forEach((k, i) => fadeDraft(k, 1, time + 0.5 + i * 0.17));
          }
          // he has said it: his voice dies away, and Punto sits down to his keyboard and types the things into being
          if (scene === 'loop' && voiceTo > 0 && time > sceneAt + 0.5 + made.length * 0.17 + 0.1) { voiceTo = 0; act('Idle', 0.6); }
          if (scene === 'loop' && time > sceneAt + 0.5 + made.length * 0.17 + 0.8) {
            scene = 'build'; sceneAt = time; buildEnd = time;
            made.forEach((k, i) => {
              const end = burnParts(k, 0, time + 0.5 + i * 0.5, 0.12);
              fadeDraft(k, 0, end);
              buildEnd = Math.max(buildEnd, end + DRAFT_FADE);
            });
            title.work(buildEnd - time);
          }
          if (scene === 'build' && time > buildEnd + 0.3) { scene = 'hold'; sceneAt = time; }
          if (scene === 'hold' && time > sceneAt + 1.8) {
            scene = 'wipe'; sceneAt = time;
            title.erase();
            loopTo = 0;
            [...made].reverse().forEach((k, i) => { burnParts(k, 1, time + 0.5 + i * 0.22, 0.03); fadeDraft(k, 0, time); });
          }
          if (scene === 'wipe' && t.phase === 'off') { scene = 'type'; sceneAt = time; title.start(); }
          for (const k of made) {
            for (const part of k.parts) {
              if (part.at < 0 || time < part.at) continue;
              if (part.to === 0 && part.u.uBurn.value === part.from && part.from > 0.99) {
                // a part starts: Punto's pixels fly to it from a hand
                title.punto.sendPixels(part.node.getWorldPosition(pixelTo), part.node.id % 2 as 0 | 1);
              }
              const e = Math.min(1, (time - part.at) / PART_BURN);
              part.u.uBurn.value = part.from + (part.to - part.from) * e - (part.to === 0 && e === 0 ? 1e-4 : 0);
              for (const l of part.lines) l.visible = part.u.uBurn.value < 0.6;
              if (e >= 1) part.at = -1;
            }
            if (k.at >= 0 && time >= k.at) {
              const e = Math.min(1, (time - k.at) / DRAFT_FADE);
              k.level = k.from + (k.to - k.from) * e;
              if (e >= 1) k.at = -1;
            }
            k.draft.position.copy(k.p.model.position);
            k.draft.visible = k.level > 0.002;
            for (const d of k.draftMats) d.m.opacity = d.base * k.level;
          }
        }
        // his mouth opens first; the wave flies out of it ~0.3 s later, growing out over ~0.6 s
        voice = voiceTo > voice ? Math.min(1, voice + delta * 8) : Math.max(0, voice - delta * 3);
        const flown = Math.min(1, Math.max(0, (time - speakAt - 0.3) / 0.6));
        backdrop.setVoice(still ? 1 : voice, still ? 1 : voiceTo > 0 ? flown : 1);
        // the loop grows along its path in ~1.6 s, and fades back the same way
        loop = loopTo > loop ? Math.min(loopTo, loop + delta / 1.6) : Math.max(loopTo, loop - delta / 1.2);
        backdrop.setLoop(still ? 1 : loop * loop * (3 - 2 * loop));
        mixer?.update(still ? 0 : delta);
        for (const { bone, rest } of spineBones) bone.quaternion.slerp(rest, UPRIGHT);
        neckBone?.rotateX(LOOK_UP.neck);
        headBone?.rotateX(LOOK_UP.head);
        // his mouth: open and shut with a made-up loudness while he talks
        // his mouth goes with his voice (the scene's loudness), syllables of a made-up rhythm
        // counted from when he starts, so the first syllable opens his mouth at once
        const said = time - speakAt;
        const open = still ? 0 : voice * Math.max(0, Math.sin(said * 11) * (0.8 + 0.2 * Math.cos(said * 4.3))) * 0.95;
        for (const m of mouthMeshes) m.morphTargetInfluences![m.morphTargetDictionary!.mouthOpen] = open;
        if (player && mouth.parent) backdrop.setMouth(props.worldToLocal(mouth.getWorldPosition(mouthAt)));
        backdrop.update(still ? 0 : time);
        // the eye shifts a little after the mouse (not a turn): near things slide more than far ones — depth
        const tx = still ? 0 : -lookX * 0.12, ty = still ? 0 : lookY * 0.07;
        props.position.x += (tx - props.position.x) * Math.min(1, delta * 3);
        props.position.y += (ty - props.position.y) * Math.min(1, delta * 3);
      }
    },
  );

  // clay: every solid in one grey, to judge the forms without colour
  const clay = new MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.8, flatShading: true });
  const own = new Map<Mesh, Material | Material[]>();
  props.traverse((o: Object3D) => { if (o instanceof Mesh) own.set(o, o.material); });
  let clayOn = false;
  const setClay = (on: boolean) => { clayOn = on; for (const [m, mat] of own) m.material = on ? clay : mat; };
  // onion: the 3D half see-through, to lay its outline on the drawn one
  const canvas = world.renderer.domElement;
  const setOnion = (on: boolean) => { canvas.style.opacity = on ? '0.55' : '1'; };
  if (dev) setOnion(params.has('onion'));

  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;z-index:10';
  const buttons: [string, () => void][] = [
    ['Картинка вкл/выкл', () => document.body.classList.toggle('no-art')],
    ['3D вкл/выкл', () => (props.visible = !props.visible)],
    ['Наложение', () => setOnion(canvas.style.opacity !== '0.55')],
    ['Глина', () => setClay(!clayOn)],
  ];
  for (const [label, act] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:600 14px system-ui;padding:8px 16px;border-radius:20px;border:0;cursor:pointer;background:#62e9f2;color:#04191c';
    b.onclick = act;
    bar.append(b);
  }
  if (dev && !params.has('bare')) document.body.append(bar);
  if (hint) hint.textContent = params.has('bare') || !dev ? '' : 'Нарисованное — фон, поверх — 3D-модели на местах своих двойников. «Наложение» — 3D полупрозрачно, сверить силуэты.';
  const debug = {
    spots: () => placed.map((p) => ({ model: p.spot.id, x: p.spot.x, y: p.spot.y, w: p.spot.w, depth: p.spot.depth, pose: p.spot.pose, width: p.width, scale: p.holder.scale.x })),
    /** The model's outline on the page, in CSS pixels: [left, top, right, bottom] (projected box corners). */
    rect: (model: string) => {
      const p = placed.find((q) => q.spot.id === model);
      return p ? pageRect(p).map(Math.round) : null;
    },
    set: (model: string, change: Partial<Spot>) => {
      const p = placed.find((q) => q.spot.id === model);
      if (!p) return 'no such model';
      Object.assign(p.spot, change);
      fit(p);
      relayout();
      return p.spot;
    },
    title: (change: Partial<typeof TITLE>) => { Object.assign(TITLE, change); placeTitle(); return { ...TITLE, phase: title.state().phase }; },
    replay: () => title.start(),
    backdrop: backdrop.root,
    mouth: () => ({ meshes: mouthMeshes.map((m) => [m.name, JSON.stringify(m.morphTargetDictionary), m.morphTargetInfluences?.map((v) => +v.toFixed(2))]), clip: clipNow?.getClip().name, morphs: (() => { const all: string[] = []; player?.model.traverse((o) => { if (o instanceof Mesh && o.morphTargetDictionary) all.push(o.name + ':' + Object.keys(o.morphTargetDictionary).join(',')); }); return all; })() }),
    tracks: () => (playerGltf?.animations ?? []).map((c) => [c.name, c.tracks.length, c.duration.toFixed(1)]),
    lookUp: (neck: number, head: number) => Object.assign(LOOK_UP, { neck, head }),
    scene: () => ({ scene, voice: +voice.toFixed(2), made: made.map((k) => [k.p.spot.id, +k.level.toFixed(2), +(k.parts.reduce((a, q) => a + q.u.uBurn.value, 0) / k.parts.length).toFixed(2)]) }),
    only: (model?: string) => placed.forEach((p) => (p.holder.visible = !model || p.spot.id === model)),
    art: (on: boolean) => document.body.classList.toggle('no-art', !on),
    props: (on: boolean) => (props.visible = on),
    onion: setOnion,
    clay: setClay,
  };

  // ?grid: a labelled grid of the art's own pixels and a ring at every spot, laid exactly as the background is
  // (an SVG «slice» is CSS «cover»), to read off where things are drawn and check where they are put
  if (dev && params.has('grid')) {
    let svg = `<svg viewBox="0 0 ${ART.w} ${ART.h}" preserveAspectRatio="xMidYMid slice" style="position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:5">`;
    for (let x = 0; x <= ART.w; x += 100) svg += `<line x1="${x}" y1="0" x2="${x}" y2="${ART.h}" stroke="${x % 500 ? '#ff5050' : '#ffff00'}" stroke-width="${x % 500 ? 2 : 5}"/><text x="${x + 4}" y="${x % 200 ? 80 : 40}" fill="#ffff00" font-size="30">${x}</text>`;
    for (let y = 0; y <= ART.h; y += 100) svg += `<line x1="0" y1="${y}" x2="${ART.w}" y2="${y}" stroke="${y % 500 ? '#ff5050' : '#ffff00'}" stroke-width="${y % 500 ? 2 : 5}"/><text x="6" y="${y - 6}" fill="#ffff00" font-size="30">${y}</text>`;
    for (const s of SPOTS) svg += `<circle cx="${s.x}" cy="${s.y}" r="${s.w / 2}" fill="none" stroke="#00ff88" stroke-width="5"/>`;
    document.body.insertAdjacentHTML('beforeend', `${svg}</svg>`);
  }

  // ---- the way in, spelled out (Yury, 15.11: «иначе люди не понимают»): a glowing pill in the empty middle of
  // the poster — a tap anywhere goes in too, but nobody guessed that. The game's page only (not the stand).
  const russian = new URLSearchParams(location.search).get('lang') === 'ru';
  const badge = dev ? null : document.createElement('button');
  if (badge) {
    badge.type = 'button';
    badge.className = 'punto-enter-xr';
    badge.innerHTML =
      `<span class="ring"></span><span class="pill"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M4 7h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4.2l-2-2.6a1 1 0 0 0-1.6 0l-2 2.6H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm3.5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm9 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>${russian ? 'Войти в XR' : 'Enter XR'}</span>` +
      `<span class="hint">${russian ? 'или нажми куда угодно' : 'or tap anywhere'}</span>`;
    const style = document.createElement('style');
    style.textContent = `
      .punto-enter-xr { position: fixed; left: 50%; top: 60%; transform: translate(-50%, -50%); z-index: 6; background: none; border: 0;
        padding: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 10px; font-family: PuntoNeon, PuntoTitle, system-ui, sans-serif; }
      .punto-enter-xr .pill { position: relative; display: flex; align-items: center; gap: 14px; padding: 16px 34px; border-radius: 999px;
        font-size: clamp(22px, 2.6vw, 38px); font-weight: 600; letter-spacing: 0.02em; color: #eafcff;
        background: radial-gradient(120% 140% at 50% 0%, #1d5a8a 0%, #0c2346 70%); border: 2px solid #6ff0ff;
        box-shadow: 0 0 18px #3fd8ff, 0 0 48px #1aa8ff88, inset 0 0 18px #3fd8ff55; text-shadow: 0 0 10px #6ff0ff;
        animation: punto-xr-pulse 1.8s ease-in-out infinite; }
      .punto-enter-xr .ring { position: absolute; left: 50%; top: 32%; width: 100%; height: 64%; transform: translate(-50%, -50%);
        border-radius: 999px; border: 2px solid #6ff0ff; opacity: 0; animation: punto-xr-ring 1.8s ease-out infinite; pointer-events: none; }
      .punto-enter-xr .hint { font: 500 clamp(13px, 1.2vw, 18px) system-ui, sans-serif; color: #bfeeff; opacity: 0.8; text-shadow: 0 0 8px #000; }
      .punto-enter-xr:hover .pill { background: radial-gradient(120% 140% at 50% 0%, #2a78b0 0%, #10305c 70%); }
      @keyframes punto-xr-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      @keyframes punto-xr-ring { 0% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.35, 1.8); } }`;
    document.head.append(style);
    badge.addEventListener('click', () => { if (!world.session) world.launchXR(); });
  }

  // ---- on and off: the poster's light, lens, background and the level's things switched as one
  let shown = false;
  const saved = { fov: world.camera.fov, env: null as Texture | null, envI: 1, bg: '', hidden: [] as Object3D[] };
  function show(on: boolean): void {
    if (on === shown) return;
    shown = on;
    const level = world.activeLevel.value?.object3D ?? world.scene;
    props.visible = lights.visible = on;
    // Off, it leaves the camera for good, not only hidden: three updates the matrices of hidden objects too, and its
    // 2231 objects were 72 % of the scene — every frame of the game spent ~8 ms on a poster nobody saw (15.11, the
    // headset's CPU profile: updateMatrixWorld/compose the dearest work, the browser at 40 frames a second of 90)
    if (on) world.camera.add(props);
    else props.removeFromParent();
    // the way in is this page while it shows (src/wayin.ts keeps quiet then)
    if (on) document.body.dataset.poster = '1';
    else delete document.body.dataset.poster;
    if (boy) on ? document.body.append(boy) : boy.remove();
    if (badge) on ? document.body.append(badge) : badge.remove();
    if (on) {
      saved.fov = world.camera.fov;
      saved.env = world.scene.environment;
      saved.envI = world.scene.environmentIntensity;
      saved.bg = document.body.style.background;
      // a narrower lens than the game's 70 degrees: a poster, not a wide angle
      world.camera.fov = 40;
      world.scene.environment = posterEnv;
      world.scene.environmentIntensity = 0.2;
      if (POSTER_BG) document.body.style.background = POSTER_BG;
      saved.hidden = level.children.filter((c) => c.visible && c !== lights);
      for (const c of saved.hidden) c.visible = false;
    } else {
      world.camera.fov = saved.fov;
      world.scene.environment = saved.env;
      world.scene.environmentIntensity = saved.envI;
      document.body.style.background = saved.bg;
      for (const c of saved.hidden) c.visible = true;
      saved.hidden = [];
    }
    world.camera.updateProjectionMatrix();
    // everything placed by the art's pixels depends on the lens: placed again
    if (on) { relayout(); backdrop.place(artPoint); placeTitle(); }
  }

  /**
   * The game may put its things on the level after the poster came up (it starts first now, so the game's Punto
   * would stand in the title): while it shows, they are hidden too, and given back with the rest.
   */
  function hideLate(): void {
    const level = world.activeLevel.value?.object3D ?? world.scene;
    for (const c of level.children) {
      if (!c.visible || c === lights) continue;
      // not the branch the poster hangs on (its parents walked up: a few steps, where getObjectById searched the whole
      // of every branch each frame)
      let mine = false;
      for (let o: Object3D | null = props; o; o = o.parent) if (o === c) { mine = true; break; }
      if (!mine) { c.visible = false; saved.hidden.push(c); }
    }
  }

  /**
   * Every material it will ever draw compiled now, the hidden ones too (the drafts, the letters not typed yet, the
   * burning parts): the headset compiles a shader the first time it draws it, and the poster would stutter then.
   */
  async function warm(): Promise<void> {
    const hidden: Object3D[] = [];
    props.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const r = world.renderer as typeof world.renderer & { compileAsync?: (s: Object3D, c: Object3D) => Promise<unknown> };
    try { await (r.compileAsync ? r.compileAsync(world.scene, world.camera) : r.compile(world.scene, world.camera)); } finally {
      for (const o of hidden) o.visible = false;
    }
  }

  {
    const [a, b] = bakeLog.reduce(([x, y], [, p, q]) => [x + p, y + q], [0, 0]);
    console.info(`[front] baked ${a} → ${b} draws (${bakeLog.filter(([, p, q]) => p !== q).map(([id, p, q]) => `${id} ${p}→${q}`).join(', ')})`);
  }
  show(true);
  return { show, warm, get shown() { return shown; }, debug };
}
