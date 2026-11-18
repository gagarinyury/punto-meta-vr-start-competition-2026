import {
  DepthOccludable,
  DistanceGrabbable,
  type Entity,
  Matrix4,
  type Mesh,
  type MeshPhysicalMaterial,
  type Object3D,
  OneHandGrabbable,
  PhysicsBody,
  Quaternion,
  TwoHandsGrabbable,
  Vector3,
  type World,
  XRAnchor,
} from '@iwsdk/core';
import { burnGhosts, leaveGhost } from './ghost.js';
import { styleGuard } from './styleguard.js';
import './sfx.js'; // loaded before any game: it replaces the leaking AudioUtils.createOneShot

/**
 * Live features. Every module in src/features/ is loaded into the running
 * world, and swapped in place when its file is added, edited or deleted:
 * the page does not reload and the XR session stays alive.
 *
 * A feature file looks like this:
 *
 *   import { feature } from '../live.js';
 *   feature(import.meta, (world) => { ...create entities, systems... });
 *   feature(import.meta, async (world) => { await AssetManager.loadGLTF(...); ... });  // also fine
 *   import.meta.hot?.accept();
 *
 * Everything it creates through `world` is removed before the next version
 * of the file runs. For anything else, return a cleanup function from the
 * callback; never call import.meta.hot.dispose() in a feature — Vite keeps
 * one dispose handler per module and it would replace this one.
 */
interface LiveState {
  world?: World;
  loaded: Set<string>;
  /** the page has started: made files that were already there were passed over (a page load starts clean) */
  started?: boolean;
  /** path -> how its first load ended: undefined while loading, null = fine, otherwise the error */
  results?: Map<string, unknown>;
  /** path -> the still running async setup of that feature (models being loaded, …) */
  settling?: Map<string, Promise<void>>;
  /** true on the viewer page (research/stands/view.html) */
  viewer?: boolean;
  /** feature path -> how many separate meshes its things draw right now (see drawnMeshes) */
  meshCounters?: Map<string, () => number>;
  /** feature path -> its entities and where its code put them (see nextReplaces) */
  placed?: Map<string, Placed[]>;
  /** feature path -> the player's moves of its things, kept when it unloads (see nextReplaces) */
  moves?: Map<string, Map<string, Move>>;
  /** what the next made feature replaces, and whether it takes the player's moves (see nextReplaces) */
  next?: { from?: string; keepMoves: boolean };
  /** made feature path -> the one it replaces, until it has loaded */
  replaces?: Map<string, string>;
  /** paths whose things were hidden and ghosted because a new version came (see showAgain) */
  hidden?: Set<string>;
  /** who hears of a thing a made game makes after it loaded (src/together.ts: a shot) */
  lateListeners?: Set<(entity: Entity, game: string) => void>;
  /** made feature path -> how to unload it, for the ones that came as code from the server (see runMade) */
  remote?: Map<string, () => void>;
}

interface Placed {
  entity: Entity;
  /** its object when it was made: the engine reuses a disposed entity for the next one made (elics' pool), so
   *  `entity.active` alone may be true for a stranger — another version's thing (16.11: the old shooting range,
   *  going, disposed the new one's cans; it crashed and the cans were gone) */
  object?: Object3D;
  /** the local matrix the code gave it, read once the feature has loaded */
  initial?: Matrix4;
}

const state: LiveState = import.meta.hot
  ? (import.meta.hot.data.state ??= { loaded: new Set<string>() })
  : { loaded: new Set<string>() };
const results = (state.results ??= new Map<string, unknown>());
// kept in the shared state: a hot update of this file must not split it from the running features
const settling = (state.settling ??= new Map<string, Promise<void>>());

/**
 * Resolves when the feature file `name` (src/features/<name>.ts) has been loaded into the scene
 * and its setup ran without an error; rejects with that error, or when the file has not come
 * within `seconds`.
 */
export async function whenLoaded(name: string, seconds = 10): Promise<void> {
  const path = `./features/${name}.ts`;
  for (const until = performance.now() + seconds * 1000; performance.now() < until; ) {
    const result = results.get(path);
    if (result === null) return;
    if (result !== undefined) throw result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`[live] ${path} did not load in ${seconds} s`);
}

// Made things are files here only while developing (the dev server writes them): a published build must not
// bake in whatever was made on this computer (14.11: a blue ball in the headset after every page load).
const modules = import.meta.env.DEV
  ? import.meta.glob('./features/*.ts')
  : import.meta.glob(['./features/*.ts', '!./features/made-*.ts']);

function loadNewFeatures(): void {
  // the viewer shows one file it picks itself: Punto and the games must not start there
  // (Punto's page-load clean-up took the game being made out of the scene, 12.11)
  if (!state.world || state.viewer) {
    return;
  }
  for (const path of state.loaded) {
    if (!(path in modules)) {
      state.loaded.delete(path);
    }
  }
  // A page load starts clean, while developing too (Yury, 14.11: «убери причину загрузки старой игры»): a made
  // file the dev server already had is not loaded; only what is made from now on comes in.
  const fresh = !state.started;
  state.started = true;
  for (const [path, load] of Object.entries(modules)) {
    if (!state.loaded.has(path)) {
      state.loaded.add(path);
      if (fresh && path.startsWith('./features/made-')) {
        console.info(`[live] ${path} is from before this page: not loaded`);
        continue;
      }
      results.delete(path);
      settle(path, load());
    }
  }
}

/** A feature's module ran (`running`): once its setup has ended too, it is in the scene, or it failed. */
function settle(path: string, running: Promise<unknown>): void {
  running.then(() => settling.get(path)).then(
    () => {
      results.set(path, null);
      if (path.startsWith('./features/made-')) {
        replaceNow(path); // the version it replaces hides and burns away over it
        burnGhosts(); // and any ghost still holding gives way
        anchorCreation(path); // and it holds on to the real room
      }
      for (const thing of placedByPath.get(path) ?? []) thing.initial ??= where(thing.entity);
      // in the log of every page, the headset's too: what each feature costs to draw
      setTimeout(() => console.info(`[live] ${path} draws ${meshCounters.get(path)?.() ?? 0} separate meshes`), 1000);
    },
    (error) => {
      results.set(path, error ?? new Error('failed'));
      console.error(`[live] ${path} failed`, error);
    },
  );
}

// ---- Made things that come as code (the published site, DEPLOY.md) ----
// There is no dev server to load a new file: the server's answer carries the made feature compiled
// to a string, and it runs here as if the file `src/features/<name>.ts` had come — the same path, so
// whenLoaded, the ghost, the player's moves, the anchors and the mesh budget all work unchanged.
// It goes when the server would delete its file (dropMade, next to every /api/unmake).
const remoteUnloads = (state.remote ??= new Map<string, () => void>());

/** Runs the made feature `name` from its compiled code `js` (the server's answer). */
export function runMade(name: string, js: string): void {
  const path = `./features/${name}.ts`;
  let unload: (() => void) | undefined;
  const meta = {
    url: new URL(`/src/features/${name}.ts`, location.origin).href,
    hot: {
      data: {},
      accept() {},
      dispose() {}, // feature() hands its clean-up to prune too: that one is used
      prune(callback: () => void) {
        unload = callback;
      },
      on() {},
      off() {},
      send() {},
      invalidate() {},
    },
  };
  results.delete(path);
  state.loaded.add(path);
  remoteUnloads.set(path, () => {
    unload?.();
    state.loaded.delete(path);
  });
  settle(path, import('./remote.js').then(({ runCompiled }) => runCompiled(js, meta)));
}

/**
 * Takes the made features that came as code out of the scene, as /api/unmake does with files:
 * `{ name }` that one, `{ keep }` all but that one, `{}` all of them. Nothing to do while developing.
 */
export function dropMade(which: { name?: string; keep?: string }): void {
  for (const [path, unload] of remoteUnloads) {
    const name = path.slice(11, -3);
    if (which.name !== undefined ? name !== which.name : name === which.keep) continue;
    remoteUnloads.delete(path);
    try {
      unload();
    } catch (error) {
      console.warn(`[live] ${path} did not unload cleanly`, error);
    }
  }
}

/** For the viewer page (research/stands/view.html): features get this world, but none is loaded by itself. */
export function useWorld(world: World): void {
  state.world = world;
  state.viewer = true;
}

/** True on the viewer page (research/stands/view.html): a flat page with no XR session and no room to read. */
export function onViewerPage(): boolean {
  return !!state.viewer;
}

export function startLive(world: World): void {
  state.world = world;
  loadNewFeatures();
}

// Glass refraction (MeshPhysicalMaterial.transmission) does not compile in the Quest browser:
// the shader fails every frame and the scene freezes while the sound goes on (12.11, a
// generated "red cube"). A safety net under the coder's rule: plain transparency instead.
function noRefraction(object: Object3D): void {
  const materials = (object as Mesh).material;
  for (const material of Array.isArray(materials) ? materials : materials ? [materials] : []) {
    const glass = material as MeshPhysicalMaterial;
    if (glass.transmission > 0) {
      console.warn('[live] transmission replaced with transparency: the Quest browser cannot draw it');
      glass.opacity = Math.min(glass.opacity, 1 - glass.transmission * 0.6);
      glass.transmission = 0;
      glass.transparent = true;
    }
  }
}

// in the shared state too: a feature loaded before a hot update of this file still counts
const meshCounters = (state.meshCounters ??= new Map<string, () => number>());

/**
 * How many separate meshes (draw calls) the feature `name` draws now: visible Mesh, Line and Points
 * under every entity it made; an InstancedMesh counts once. A safety net under the coder's frame
 * budget: about 250 separate block meshes took the headset to 36 fps of 90 (13.11).
 */
export function drawnMeshes(name: string): number {
  return meshCounters.get(`./features/${name}.ts`)?.() ?? 0;
}

function countDrawn(object: Object3D): number {
  if (!object.visible) return 0;
  const drawn = object as Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean };
  let count = drawn.isMesh || drawn.isLine || drawn.isPoints ? 1 : 0;
  for (const child of object.children) count += countDrawn(child);
  return count;
}

// ---- The player's moves survive a change of the creation (13.11) ----
// A change is a new file: its code puts every thing back where the code says. The player's own
// move of a thing they can take (any grab component) is the difference between where the thing
// is and where its code put it; that difference goes to the thing of the same name in the next
// version, on top of where the new code puts it — so "raise it" after a move raises it from where
// the player left it. Things the game moves itself (no grab component) are not carried. The move
// is put on while the thing is created, so it never shows up at the old place first.
interface Move {
  shift: Vector3; // added to the position
  turn: Quaternion; // applied before the rotation
  stretch: Vector3; // multiplies the scale
}
const placedByPath = (state.placed ??= new Map<string, Placed[]>());
/** Still the very thing that was made (not disposed, not the same entity reused for another). */
function mine(p: { entity: Entity; object?: Object3D }): boolean {
  return p.entity.active && !!p.object && p.entity.object3D === p.object;
}
const movesByPath = (state.moves ??= new Map<string, Map<string, Move>>());
const parts = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };

// World matrices: a made thing is moved into the world anchor's group once it has loaded (see
// anchorCreation), so its local matrix changes meaning; where it is in the room does not.
function where(entity: Entity): Matrix4 | undefined {
  const object = entity.object3D;
  if (!object) return undefined;
  object.updateWorldMatrix(true, false);
  return object.matrixWorld.clone();
}
const nowPart = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };

function takeable(entity: Entity): boolean {
  return (
    entity.hasComponent(DistanceGrabbable) ||
    entity.hasComponent(OneHandGrabbable) ||
    entity.hasComponent(TwoHandsGrabbable)
  );
}

const lateListeners = (state.lateListeners ??= new Set());
/** Calls `handler` for every thing a made game makes after it has loaded (an arrow shot, a ball thrown in). */
export function onLateThing(handler: (entity: Entity, game: string) => void): () => void {
  lateListeners.add(handler);
  return () => lateListeners.delete(handler);
}

/**
 * Runs `build` with Math.random giving the same numbers for every player (16.11, playing together: a game that
 * lays its targets out at random lays them out alike in every room). Seeded by `name` — a made game's own name,
 * the same everywhere and new for every creation. Only while `build` runs: what the game draws later is its own.
 */
export function withGameRandom<T>(name: string, build: () => T): T {
  let seed = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) seed = Math.imul(seed ^ name.charCodeAt(i), 0x01000193);
  const own = Math.random;
  // mulberry32
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return build();
  } finally {
    Math.random = own;
  }
}

/** The names of the made features in the scene now. */
export function madeNow(): string[] {
  return [...placedByPath.keys()].filter((path) => path.startsWith('./features/made-')).map((path) => path.slice(11, -3));
}

/** The outermost things of the made feature `name` (what stands in the room on its own). */
export function rootsOf(name: string): Entity[] {
  const things = (placedByPath.get(`./features/${name}.ts`) ?? []).filter(mine);
  const objects = new Set(things.map(({ object }) => object));
  return things
    .filter(({ object }) => {
      for (let up = object!.parent; up; up = up.parent) if (objects.has(up)) return false;
      return true;
    })
    .map(({ entity }) => entity);
}

/** name -> the player's move, for the takeable things of a loaded feature that are not where their code put them */
function movesOf(path: string): Map<string, Move> {
  const moves = new Map<string, Move>();
  for (const thing of placedByPath.get(path) ?? []) {
    const { entity, initial } = thing;
    if (!initial || !mine(thing) || !takeable(entity)) continue;
    const object = entity.object3D!;
    initial.decompose(parts.position, parts.quaternion, parts.scale);
    where(entity)!.decompose(nowPart.position, nowPart.quaternion, nowPart.scale);
    const move: Move = {
      shift: nowPart.position.clone().sub(parts.position),
      turn: nowPart.quaternion.clone().multiply(parts.quaternion.invert()),
      stretch: nowPart.scale.clone().divide(parts.scale),
    };
    if (move.shift.length() > 1e-4 || 1 - Math.abs(move.turn.w) > 1e-6 || move.stretch.distanceTo(ONE) > 1e-4) {
      moves.set(object.name, move);
    }
  }
  return moves;
}
const ONE = new Vector3(1, 1, 1);

// The new thing is put on before it has a parent: its local transform is where it is in the room
// (the level root sits at the origin).
function putOn(object: Object3D, move: Move): void {
  object.position.add(move.shift);
  object.quaternion.premultiply(move.turn);
  object.scale.multiply(move.stretch);
}

const replacesByPath = (state.replaces ??= new Map<string, string>());
const hiddenPaths = (state.hidden ??= new Set<string>());

/**
 * The next creation that loads replaces `from` (a feature name, or nothing). The moment it is in,
 * the things of `from` hide and burn away as a ghost (src/ghost.ts); its file goes later. With
 * `keepMoves` (a change of `from`), its things take the player's moves of the same-named things.
 */
export function nextReplaces(from: string | undefined, keepMoves: boolean): void {
  state.next = { from, keepMoves };
}

/** The new version failed: the hidden things of `name` show again (its file never went away). */
export function showAgain(name: string): void {
  const path = `./features/${name}.ts`;
  if (!hiddenPaths.delete(path)) return;
  for (const thing of placedByPath.get(path) ?? []) if (mine(thing)) thing.object!.visible = true;
  for (const [held, from] of heldHidden) if (from === path) (held.visible = true), heldHidden.delete(held);
}

// ---- Made things hold on to the real room (13.11) ----
// Without an anchor a thing stays where it is in the session's coordinates: when the Quest
// re-centres (a new room set up, the Meta button held) the whole session shifts against the real
// walls, and a board hung on a wall follows the player's view instead. IWSDK keeps one persistent
// world anchor; an entity with XRAnchor is moved into its group and from then on is held by the
// real room. A thing with a physics body is left out: physics reads local positions (AGENT-NOTES).
// Off since 18.11 (Yury: «стол выделяется правильно, а объект ставится дальше»): IWSDK attaches an anchored thing to
// one group held by a persistent world anchor (its id kept in localStorage from an earlier session), and that group's
// pose arrives a moment later — every made thing then jumped away from the spot it was built on, a tank battle off
// its table. Without it a thing stays where it was put; a re-centre of the headset moves it (rare). ?anchor=1 brings
// it back.
const ANCHOR = new URLSearchParams(location.search).get('anchor') === '1';
function anchorCreation(path: string): void {
  if (!ANCHOR) return;
  const things = (placedByPath.get(path) ?? []).filter(mine);
  const objects = new Set(things.map(({ object }) => object));
  for (const { entity, object } of things) {
    if (!object || entity.hasComponent(XRAnchor) || entity.hasComponent(PhysicsBody)) continue;
    let inner = false; // only the outermost things: the inner ones go with them
    for (let up = object.parent; up; up = up.parent) if (objects.has(up)) inner = true;
    if (!inner) entity.addComponent(XRAnchor);
  }
}

// The new version is in: the one it replaces hides and leaves its ghost burning over it.
function replaceNow(newPath: string): void {
  const from = replacesByPath.get(newPath);
  replacesByPath.delete(newPath);
  if (from) hide(`./features/${from}.ts`);
}

/** things in the player's hands hidden with the creation they came from (back with showAgain) */
const heldHidden = new Map<Object3D, string>();

function hide(fromPath: string): void {
  const things = placedByPath.get(fromPath);
  if (!things || hiddenPaths.has(fromPath)) return;
  const objects = things.filter(mine).map(({ object }) => object!);
  try {
    leaveGhost(state.world!.scene, objects, true);
  } catch (error) {
    console.warn('[live] the ghost failed', error);
  }
  for (const object of objects) object.visible = false;
  // what it put into the player's hands goes too (holdInHand hangs it on the hand, not in the room: 16.11, the
  // drumsticks stayed in the hands through the next game)
  const player = state.world?.player;
  if (player) {
    for (const space of [player.gripSpaces.left, player.gripSpaces.right, player.raySpaces.left, player.raySpaces.right]) {
      for (const held of space.children) {
        if (!held.userData.heldInHand || !held.visible) continue;
        held.visible = false;
        heldHidden.set(held, fromPath);
      }
    }
  }
  hiddenPaths.add(fromPath);
}

/**
 * The thing that replaces the creation `name` has begun to show in the room, part by part
 * (src/draft.ts): `name` hides and burns away now instead of when the new one has loaded, so the
 * two never stand in each other. showAgain() brings it back if nothing comes of the new one.
 */
export function hideForNext(name: string): void {
  hide(`./features/${name}.ts`);
}

// the world a feature was given -> its list of things to undo// the world a feature was given -> its list of things to undo
const undoLists = new WeakMap<World, (() => void)[]>();

/** Runs `undo` when the feature that was given this `world` is unloaded or reloaded (host helpers use it). */
export function onUnload(world: World, undo: () => void): void {
  undoLists.get(world)?.push(undo);
}

export function feature(
  meta: ImportMeta,
  setup: (world: World) => void | (() => void) | Promise<void | (() => void)>,
): void {
  const hot = meta.hot;
  // '/src/features/x.ts' -> './features/x.ts', the key import.meta.glob uses
  const path = `.${new URL(meta.url).pathname.replace(/^\/src/, '')}`;
  const world = state.world;
  if (!world) {
    throw new Error('[live] feature() ran before startLive(world)');
  }
  const cleanups: (() => void)[] = [];
  const made: Placed[] = []; // its entities, for drawnMeshes()
  const placed: Placed[] = []; // the same, with where the code put them, for nextReplaces()
  placedByPath.set(path, placed);
  // a change of the creation in the room: the player's moves of its things, to put on as they come
  let carrying: Map<string, Move> | undefined;
  if (state.next && path.startsWith('./features/made-')) {
    const { from, keepMoves } = state.next;
    state.next = undefined;
    if (from) {
      replacesByPath.set(path, from);
      const fromPath = `./features/${from}.ts`;
      if (keepMoves) carrying = placedByPath.has(fromPath) ? movesOf(fromPath) : movesByPath.get(fromPath);
    }
  }
  meshCounters.set(path, () => {
    let count = 0;
    for (const thing of made) if (mine(thing)) count += countDrawn(thing.object!);
    return count;
  });
  // a game the coder made (a file, the server's compiled answer, or a shared link ?g=, which runs as remote.ts)
  // VITE_NO_STYLEGUARD=1 at the dev server's start: the made things are shown as their code built them (18.11, the bare
  // coder's copy: «модель рисует сама» — the guard cut its smooth molecules into facets)
  const byCoder = import.meta.env.VITE_NO_STYLEGUARD !== '1' && (path.startsWith('./features/made-') || path === './features/remote.ts');
  // pieces a made game adds later to its things (a shot, a shard) get the look too, a second or so after
  if (byCoder) {
    const guard = setInterval(() => {
      for (const thing of made) if (thing.object && mine(thing)) styleGuard(thing.object);
    }, 1000);
    cleanups.push(() => clearInterval(guard));
  }
  // The IWSDK trap, closed by the host (Yury, 18.11: «а в хосте нельзя исправить»): createTransformEntity(object,
  // parent) hangs the object under `parent`, tearing it out of the group its code had put it in — a planet's holder
  // left its orbit group, and the planets stood in a line while the empty orbits turned. Here an object that already
  // sits deeper inside an entity is made an entity under the group it really sits in; that group, if it is no entity
  // yet, first becomes one (and so on up). What the code built stays as it built it.
  const entityOf = new WeakMap<Object3D, Entity>();
  const realParent = (target: World, object: Object3D, named: Entity | undefined): Entity | undefined => {
    const holder = object.parent;
    if (!holder || holder === named?.object3D) return named;
    // the nearest ancestor that is an entity of this feature
    let up: Object3D | null = holder;
    let top: Object3D = holder;
    while (up && !entityOf.has(up)) (top = up), (up = up.parent);
    // not inside any of its entities: as asked — unless the group it sits in is in no scene yet (a root group the
    // code filled and never made an entity: 18.11, the Sun was torn out of the solar system's root, the root stayed
    // nowhere): that group becomes an entity first
    if (!up && (named || top.type === 'Scene' || top === target.scene)) return named;
    if (named && !isInside(holder, named.object3D)) return named; // asked to go elsewhere on purpose
    return entityOf.get(holder) ?? create(target, holder, realParent(target, holder, named));
  };
  const isInside = (object: Object3D, ancestor: Object3D | undefined) => {
    for (let up: Object3D | null = object; up; up = up.parent) if (up === ancestor) return true;
    return false;
  };
  let create: (target: World, object: Object3D, parent?: Entity) => Entity = () => {
    throw new Error('not ready');
  };
  const tracked = new Proxy(world, {
    get(target, prop) {
      // the real world under this feature's wrapper, for what belongs to the whole app (src/sfx.ts)
      if (prop === Symbol.for('punto.rootWorld')) return target;
      if (prop === 'createTransformEntity') {
        return (...args: Parameters<World['createTransformEntity']>) => {
          const object = args[0];
          // already an entity (the host made it one for a child made first, see realParent): the same entity, never a
          // second one on one object (18.11: a DNA root got two, and the host's placing went twice — to the ceiling)
          const already = object && entityOf.get(object);
          if (already) return already;
          // only a thing made without a parent: its own transform is where it is in the room
          const move = object?.name && !args[1] ? carrying?.get(object.name) : undefined;
          // where its code put it, read before the player's move goes on (a thing placed later in setup is read at load)
          const initial = move ? (object!.updateMatrix(), object!.matrix.clone()) : undefined;
          if (move) {
            putOn(object!, move);
            carrying!.delete(object!.name);
            console.info(`[live] ${object!.name} stays where the player moved it`);
          }
          // a made game's things come out in Punto's look, however its code built them (styleguard.ts)
          if (object && byCoder) styleGuard(object);
          if (object) args[1] = realParent(target, object, args[1] as Entity | undefined) as (typeof args)[1];
          const entity: Entity = target.createTransformEntity(...args);
          if (entity.object3D) entityOf.set(entity.object3D, entity);
          const own: Placed = { entity, object: entity.object3D };
          made.push(own);
          // made after the feature loaded (a tabletop that came later): its code has placed it now
          const late = results.get(path) === null;
          placed.push({ entity, object: entity.object3D, initial: initial ?? (late ? where(entity) : undefined) });
          if (late && path.startsWith('./features/made-')) {
            queueMicrotask(() => anchorCreation(path));
            for (const listener of lateListeners) listener(entity, path.slice(11, -3));
          }
          // Hides behind real furniture. Opt out BEFORE creating the entity with
          // `object.userData.occlude = false` (things behind a real wall): the
          // component rewrites materials, removing it later does not undo that.
          if (args[0]?.userData.occlude !== false) {
            entity.addComponent(DepthOccludable);
          }
          entity.object3D?.traverse((object) => {
            object.castShadow = true; // the room's planes catch it (room.ts)
            noRefraction(object);
          });
          cleanups.push(() => {
            if (mine(own)) {
              // with its ghost burning it goes without its resources: the ghost still draws them, and
              // let go now they were uploaded again and never freed (audit item 25)
              entity.dispose(ghosted ? { disposeResources: false } : undefined);
            }
          });
          return entity;
        };
      }
      if (prop === 'registerSystem') {
        return (...args: Parameters<World['registerSystem']>) => {
          // A made game's system that throws must not stop the whole world (one failing update
          // stops every system after it, 13.11): it is logged once and switched off.
          if (path.startsWith('./features/made-')) {
            const proto = (args[0] as unknown as { prototype: { update?: (...a: unknown[]) => void } }).prototype;
            const update = proto.update;
            if (update && !(update as { guarded?: boolean }).guarded) {
              const guarded = function (this: unknown, ...a: unknown[]) {
                try {
                  update.apply(this, a);
                } catch (error) {
                  console.error(`[live] ${path}: a system failed and is switched off`, error);
                  queueMicrotask(() => {
                    try {
                      target.unregisterSystem(args[0]);
                    } catch {
                      /* already gone */
                    }
                  });
                  proto.update = () => {};
                }
              };
              (guarded as { guarded?: boolean }).guarded = true;
              proto.update = guarded;
            }
          }
          target.registerSystem(...args);
          cleanups.push(() => target.unregisterSystem(args[0]));
          return tracked;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  create = (_target, object, parent) => tracked.createTransformEntity(object, parent as never); // the made in-between groups are this feature's too
  undoLists.set(tracked, cleanups);
  let gone = false; // unloaded: anything an async setup makes after that is undone at once
  let ghosted = false; // its ghost was left at unload: the ghost lets go of the resources (src/ghost.ts)
  const cleanup = () => {
    // a made creation leaves its ghost: no blink while the next version loads (src/ghost.ts)
    // a made creation that goes on its own (cleared, failed) leaves its ghost (src/ghost.ts);
    // one already replaced has burnt as it hid
    // never let the ghost stop the clean-up: a throw here once left every old version in the scene
    try {
      if (!gone && path.startsWith('./features/made-') && !hiddenPaths.delete(path)) {
        ghosted = leaveGhost(world.scene, made.filter(mine).map(({ object }) => object!), false);
      }
    } catch (error) {
      console.warn('[live] the ghost failed, the clean-up goes on', error);
    }
    // the player's moves outlive this version: the next one may take them (nextReplaces)
    if (placedByPath.get(path) === placed) {
      const moves = movesOf(path);
      if (moves.size) movesByPath.set(path, moves);
      placedByPath.delete(path);
    }
    gone = true;
    for (const undo of cleanups.splice(0).reverse()) {
      undo();
    }
  };
  hot?.dispose(cleanup);
  hot?.prune(() => {
    cleanup();
    state.loaded.delete(path); // so the same file name can come back
  });
  // Its shaders compiled before it is drawn (Yury, 18.11: «когда загружается, всё подвисает» — every new thing stopped
  // a frame 60–250 ms compiling its materials): its objects go on a layer no camera sees, three compiles them in
  // parallel (compileAsync), then they come back. A thing a game makes later is not held.
  const prewarm = () => {
    if (!path.startsWith('./features/made-')) return;
    const objects = made.filter(mine).map(({ object }) => object).filter((o): o is Object3D => !!o);
    if (!objects.length) return;
    const masks = new Map<Object3D, number>();
    // each object's own layers once: a part that is an entity inside another is met twice, and the second time its
    // «own» layer was already the hidden one — the xylophone's bars stayed hidden for good (18.11)
    for (const object of objects) object.traverse((o) => { if (!masks.has(o)) masks.set(o, o.layers.mask); o.layers.set(31); });
    const back = () => { for (const [o, mask] of masks) o.layers.mask = mask; };
    const started = performance.now();
    Promise.all(objects.map((object) => world.renderer.compileAsync(object, world.camera, world.scene)))
      .then(() => console.info(`[perf] ${path.slice(11, -3)} shaders ready in ${Math.round(performance.now() - started)} ms`))
      .catch(() => {})
      .finally(back);
    setTimeout(back, 1500); // never kept hidden longer
  };
  try {
    // a made game draws the same random numbers for every player while it builds (src/together.ts)
    const extra = path.startsWith('./features/made-') ? withGameRandom(path, () => setup(tracked)) : setup(tracked);
    if (!(extra instanceof Promise)) prewarm();
    if (extra instanceof Promise) {
      // an async setup (it waits for its models): the feature counts as loaded when it ends
      settling.set(
        path,
        extra.then(
          (late) => {
            settling.delete(path);
            prewarm();
            if (late) cleanups.push(late);
            if (gone) cleanup();
          },
          (error) => {
            settling.delete(path);
            cleanup();
            throw error;
          },
        ),
      );
    } else if (extra) {
      cleanups.push(extra);
    }
  } catch (error) {
    cleanup();
    throw error;
  }
}

if (import.meta.hot) {
  import.meta.hot.accept();
  loadNewFeatures();
}
