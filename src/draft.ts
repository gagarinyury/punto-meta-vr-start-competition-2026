import * as core from '@iwsdk/core';
import {
  AudioContext as SharedAudio,
  Bone,
  createSystem,
  type Entity,
  Group,
  InstancedMesh,
  Line,
  LineLoop,
  LineSegments,
  type Material,
  Mesh,
  Object3D,
  Points,
  Quaternion,
  SkinnedMesh,
  Sprite,
  Vector3,
  type World,
} from '@iwsdk/core';
import { burnable, burnUniforms, leaveGhost } from './ghost.js';
import { busy } from './perf.js';
import type { Punto } from './helper.js';
import { fitModel, takePart } from './models.js';
import { chosenPlace, inFrontOfPlayer, type Place, placeAsked, surfaceHit, surfaceNear } from './place.js';

/**
 * The thing being made shows up in the room part by part while the coder is still writing it
 * (research/notes/STREAM.md). The server sends drafts: the part of the file that is whole already, as code
 * (tools/draft.mjs). A draft is not run as a game. It runs against a stand-in world that makes
 * no entities, systems, physics or sound, and what it builds — plain three.js objects — is
 * shown on one stage entity. Each next draft is the same code and a little more: the objects
 * already shown stay; each new one appears on its place the way a replaced creation goes, run
 * backwards — out of noise, with the glowing cyan edge (src/ghost.ts) — while a burst of
 * Punto's pixels flies to it from a hand. When the real thing has loaded the stage burns away
 * over it.
 *
 * Which object is which between two drafts: by the variable that holds it (the draft hands
 * over a getter for every variable its body declares), and for the ones without a variable
 * by their place among the children of one that has. So a group built on its own and put
 * into another later stays the same group and does not fly in twice.
 */
export interface DraftStage {
  /** A build starts. `pointed`: the player shows the spot (nothing is shown before they have);
   *  `roomIsThePlace`: the thing fills the room itself, so nothing is moved before the player. */
  begin(options: { pointed: boolean; roomIsThePlace: boolean }): void;
  /** The newest draft of the file being written. */
  show(js: string): void;
  /** The build is over — the real thing is in, or nothing will come: the draft burns away. */
  end(): void;
}

const RUN_LIMIT_MS = 3000; // a draft waiting for a model longer than this shows what it has so far
const APPEAR_S = 0.55; // a part burning in on its place
const GHOST_MS = 1500; // the stage is disposed after its ghost has burnt (the ghost shares its geometry)

// ---- Stand-ins: what a draft gets instead of the things that must not happen yet ----

// what is built on a stand-in is not shown: nobody knows where it would be
const hollows = new WeakSet<object>();

/** `target` with every property it does not have answered by `nothing`. */
function hollow<T extends object>(target: T): T {
  const made = new Proxy(target, {
    get(inner, prop, receiver) {
      if (prop === 'then') return undefined; // not a promise: `await` takes it as it is
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop in inner) return Reflect.get(inner, prop, receiver);
      // three.js asks an object what it is (isMesh…) and keeps private fields (_listeners)
      if (typeof prop === 'string' && (/^is[A-Z]/.test(prop) || prop.startsWith('_'))) return undefined;
      return nothing;
    },
  });
  hollows.add(made);
  return made;
}

/** Anything at all: called, constructed or read, it does nothing and gives more of the same. */
const nothing: unknown = new Proxy(function () {}, {
  get(_inner, prop) {
    if (prop === 'then') return undefined;
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === Symbol.iterator) return function* () {};
    if (prop === 'length') return 0;
    if (typeof prop === 'string' && /^is[A-Z]/.test(prop)) return false;
    return nothing;
  },
  set: () => true,
  // an object three.js takes without complaint when the draft adds it to a group
  apply: () => hollow(new Object3D()),
  construct: () => hollow(new Object3D()),
});

// The player and the camera are read (where is the head?), never changed: adding to them is ignored.
const STRUCTURE = new Set(['add', 'remove', 'attach', 'clear', 'removeFromParent']);
const views = new WeakMap<object, object>();
function view<T extends object>(target: T): T {
  let seen = views.get(target) as T | undefined;
  if (!seen) {
    const made: T = new Proxy(target, {
      get(inner, prop) {
        const isObject = (inner as { isObject3D?: boolean }).isObject3D;
        if (isObject && typeof prop === 'string' && STRUCTURE.has(prop)) return () => made;
        const value: unknown = Reflect.get(inner, prop, inner);
        if (value && typeof value === 'object') {
          const plain = Object.getPrototypeOf(value) === Object.prototype || Array.isArray(value);
          if (plain || (value as { isObject3D?: boolean }).isObject3D) return view(value);
        }
        return value;
      },
    });
    views.set(target, (seen = made));
  }
  return seen;
}

// ---- What is shown ----

// Only plain three.js objects are shown: lights would light the room, sounds would play, and UI
// panels (UIKit) need their own system.
const SHOWN: unknown[] = [Object3D, Group, Mesh, InstancedMesh, SkinnedMesh, Bone, Line, LineSegments, LineLoop, Points, Sprite];
const showable = (object: Object3D): boolean => !hollows.has(object) && SHOWN.includes(object.constructor);

type Drawn = Object3D & {
  isMesh?: boolean;
  isSkinnedMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  isInstancedMesh?: boolean;
  geometry?: { type: string };
};

// A part with a look of its own comes in its turn; a skinned mesh follows its bones, so it is just there.
const appears = (object: Drawn): boolean => !!((object.isMesh && !object.isSkinnedMesh) || object.isLine || object.isPoints || object.isSprite);

// The same object in the next draft: the same kind of thing with the same kind of shape.
function alike(shown: Drawn, next: Drawn): boolean {
  if (shown.type !== next.type || shown.geometry?.type !== next.geometry?.type) return false;
  if (!shown.isInstancedMesh) return true;
  return (shown as unknown as InstancedMesh).instanceMatrix.count === (next as unknown as InstancedMesh).instanceMatrix.count;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// Copies that all still sit on one spot (their loop has not been written yet, or a system places
// them later) would show as one lump: such a mesh waits.
function spread(object: Drawn): boolean {
  if (!object.isInstancedMesh) return true;
  const mesh = object as unknown as InstancedMesh;
  if (mesh.count < 2) return true;
  const matrices = mesh.instanceMatrix.array;
  for (let i = 0; i < 32; i++) if (matrices[i] !== IDENTITY[i % 16]) return true;
  return false;
}

const finite = (v: { x: number; y: number; z: number; w?: number }): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && (v.w === undefined || Number.isFinite(v.w));

interface Part {
  key: string;
  object: Object3D;
  /** where its code puts it, in its parent */
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  /** visible, as far as its code says */
  shown: boolean;
  state: 'held' | 'queued' | 'appearing' | 'there' | 'gone';
  /** how far it has appeared: 0..1 */
  t: number;
  /** while it appears: its materials are burning copies, the real ones wait here */
  burn?: { level: { value: number }; real: Material | Material[]; own: Material[] };
  /** it is gliding to a new place its code gave it */
  easing: boolean;
  /** the last draft it was in */
  seen: number;
}

interface Outcome {
  roots: Object3D[];
  names: Map<Object3D, string>;
  /** given to the world by the code (createTransformEntity, scene.add): its place is its own */
  handed: Set<Object3D>;
  /** the draft ran to its end */
  complete: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // a major pentatonic over two octaves, in semitones

/** The stage for the builds of one page. `onFirstPart`: the first part of a build has left Punto's hand. */
export function draftStage(world: World, punto: Punto, onFirstPart: () => void): DraftStage {
  let stage: Group | undefined;
  let stageEntity: Entity | undefined;
  let build = 0; // changes with every begin() and end(): a draft that finishes after that is dropped
  let pointed = false;
  let roomIsThePlace = false;
  let spot: Place | undefined; // where the thing goes while its code has not said
  let tick = 0;
  let first = true;
  let drafts = 0;
  let skipped = 0;
  let trouble = '';
  const parts = new Map<string, Part>();
  const queue: Part[] = [];
  const appearing: Part[] = [];
  const moving: Part[] = [];
  const places = new Map<string, Place>(); // what the draft was told once is told again: the head moves, the thing must not
  let waited = 0;
  let hand: 0 | 1 = 0;
  let notes = 0;
  let lastNote = 0;
  const target = new Vector3();

  const place = (): Place => (spot ??= (pointed ? chosenPlace() : undefined) ?? inFrontOfPlayer(world, { distance: 0.8 }));
  const told = (key: string, find: () => Place): Place => {
    let found = places.get(key);
    if (!found) places.set(key, (found = find()));
    const copied: Place = { point: found.point.clone(), normal: found.normal.clone(), surface: found.surface, facing: found.facing.clone() };
    if (found.size) copied.size = { ...found.size };
    return copied;
  };

  // ---- the stand-in host modules ----
  const placeModule = hollow({
    inFrontOfPlayer: (_world: unknown, options?: { distance?: number; below?: number }) =>
      told(`front ${JSON.stringify(options ?? {})}`, () => inFrontOfPlayer(world, options)),
    // the real one waits for the pinch; a draft is not run before the spot is known (see pump)
    wantedPlace: () => Promise.resolve(told('wanted', () => chosenPlace() ?? inFrontOfPlayer(world))),
    chosenPlace,
    surfaceNear,
    surfaceHit,
    placeAsked: () => false,
  });
  const modelsModule = hollow({ fitModel, takePart });
  // A game on a table (src/tabletop.ts) builds everything in its ready(board) callback, in the game's own units. The
  // draft does not look for the real table: its board stands before the player, ~0.5 m across, 1 m ahead, and the parts grow on
  // it as they are written; the real game then comes on the real table and the draft burns away there — a teleport
  // (Yury, 15.11: «писать это перед человеком, а потом … сжигание, а там построение»).
  let board: Group | undefined; // the board of the draft being run now
  let boardSize = { width: 10, depth: 10 };
  /** The draft's board: made once per run, as soon as the game is known to use a table (before its tabletop() call
   *  is written: a group it fills first, in the board's units, goes on the board, not before the player in metres). */
  const boardOf = (standWorld: { createTransformEntity(object: Object3D): unknown }) => {
    if (board) return board;
    const { width, depth } = boardSize, unit = 0.5 / Math.max(width, depth, 1e-3);
    const spot = told('board', () => inFrontOfPlayer(world, { distance: 1, below: 0.5 }));
    board = new Group();
    board.position.copy(spot.point);
    board.quaternion.copy(spot.facing);
    board.scale.setScalar(unit);
    board.userData.root = standWorld.createTransformEntity(board);
    return board;
  };
  const tabletopModule = hollow({
    tabletop(standWorld: { createTransformEntity(object: Object3D): unknown }, options?: { width?: number; depth?: number }, ready?: (board: unknown) => void) {
      if (typeof ready !== 'function') return;
      const width = options?.width ?? boardSize.width, depth = options?.depth ?? boardSize.depth;
      const made = boardOf(standWorld);
      ready({ root: made.userData.root, width, depth, unit: made.scale.x, onTable: false, metres: { width: width * made.scale.x, depth: depth * made.scale.x } });
    },
  });

  function standInWorld(): { world: unknown; made: Object3D[]; scene: Group } {
    const made: Object3D[] = [];
    const scene = new Group();
    const entityOf = (object?: Object3D) =>
      hollow({
        object3D: object,
        active: true,
        addComponent() {
          return this;
        },
        removeComponent() {
          return this;
        },
        setValue() {
          return this;
        },
        getValue: () => undefined,
        getVectorView: () => new Float32Array(4),
        hasComponent: () => false,
        dispose() {},
        destroy() {},
      });
    const stand: unknown = new Proxy(
      {},
      {
        get(_inner, prop) {
          switch (prop) {
            case 'createTransformEntity':
              return (object?: unknown, second?: { object3D?: unknown; parent?: { object3D?: unknown } }) => {
                const thing = object === undefined ? new Object3D() : object;
                if (!(thing instanceof Object3D) || hollows.has(thing)) return entityOf();
                const parent = second?.object3D ?? second?.parent?.object3D;
                if (parent instanceof Object3D && !hollows.has(parent)) parent.add(thing);
                else made.push(thing);
                return entityOf(thing);
              };
            case 'createEntity':
              return () => entityOf();
            case 'registerSystem':
            case 'unregisterSystem':
              return () => stand;
            case 'scene':
              return scene;
            case 'player':
              return view(world.player);
            case 'camera':
              return view(world.camera);
            case 'then':
              return undefined;
            default:
              return nothing;
          }
        },
      },
    );
    return { world: stand, made, scene };
  }

  /** Runs one draft and gathers what it built. */
  async function run(js: string): Promise<Outcome> {
    const got: { setup?: (world: unknown) => unknown; getters: Record<string, () => unknown> } = { getters: {} };
    const live = hollow({
      feature(_meta: unknown, setup: (world: unknown) => unknown) {
        got.setup = setup;
      },
    });
    const require = (name: string): unknown =>
      name === '@iwsdk/core' ? core : name === '../live.js' ? live : name === '../place.js' ? placeModule : name === '../models.js' ? modelsModule
        : name === '../tabletop.js' ? tabletopModule : nothing;
    board = undefined;
    // a game on a table: its board's size from its tabletop(world, { width, depth }) call, if written yet
    const usesTable = js.includes("require('../tabletop.js')");
    const size = /tabletop\.call\(void 0, \w+, \{ width: ([\d.]+), depth: ([\d.]+)/.exec(js);
    boardSize = { width: Number(size?.[1] ?? 10), depth: Number(size?.[2] ?? 10) };
    const inner: Record<string, () => unknown> = {};
    const meta = {
      url: `${location.origin}/src/features/draft.ts`,
      draft(getters: Record<string, () => unknown>) {
        got.getters = getters;
      },
      // the variables made so far inside a callback being written (tools/draft.mjs opened(): tabletop's board)
      draftInner(getters: Record<string, () => unknown>) {
        Object.assign(inner, getters);
      },
    };
    new Function('require', 'exports', 'module', '__meta', js)(require, {}, { exports: {} }, meta);
    if (!got.setup) throw new Error('no feature() in the draft');
    const stand = standInWorld();
    if (usesTable) boardOf(stand.world as { createTransformEntity(object: Object3D): unknown });
    let complete = false;
    const setup = got.setup;
    const ran = (async () => setup(stand.world))().then(
      () => {
        complete = true;
      },
      (error) => {
        // a draft may stop half-way (a helper it has no stand-in for): what it built so far is shown
        const why = String(error).slice(0, 200);
        if (why !== trouble) console.debug(`[draft] a draft stopped half-way: ${why}`);
        trouble = why;
      },
    );
    await Promise.race([ran, sleep(RUN_LIMIT_MS)]);

    const names = new Map<Object3D, string>();
    const onBoard = board as Group | undefined; // set by the stand-in tabletop while the draft ran
    for (const [name, get] of Object.entries(inner)) {
      try {
        const value = get();
        if (!(value instanceof Object3D) || names.has(value)) continue;
        names.set(value, name);
        // a group being filled in the board's callback, not given to the world yet: it is for the board
        if (onBoard && !value.parent && value.children.length) onBoard.add(value);
      } catch {
        /* not reached yet */
      }
    }
    for (const [name, get] of Object.entries(got.getters)) {
      try {
        const value = get();
        if (value instanceof Object3D && !names.has(value)) names.set(value, name);
      } catch {
        /* not reached yet */
      }
    }
    const handed = new Set<Object3D>();
    const roots: Object3D[] = [];
    const root = (object: Object3D) => {
      if (!object.parent && !roots.includes(object)) roots.push(object);
    };
    for (const object of stand.made) {
      handed.add(object);
      root(object);
    }
    for (const object of stand.scene.children.slice()) {
      stand.scene.remove(object);
      handed.add(object);
      root(object);
    }
    // a group being filled that its code has not given to the world yet: on the board in a game on a table (its
    // units are the board's), else before the player
    for (const object of names.keys()) {
      if (!object.children.length || object.parent) continue;
      if (onBoard) onBoard.add(object);
      else root(object);
    }
    return { roots, names, handed, complete };
  }

  // ---- the stage ----

  /** Reads where the draft's `source` puts the object into `part`. */
  function read(part: Part, source: Object3D, outcome: Outcome, isRoot: boolean): void {
    const sound = finite(source.position) && finite(source.quaternion) && finite(source.scale);
    part.shown = source.visible;
    if (sound) {
      part.position.copy(source.position);
      part.quaternion.copy(source.quaternion);
      part.scale.copy(source.scale);
    } else {
      part.position.set(0, 0, 0);
      part.quaternion.identity();
      part.scale.set(1, 1, 1);
    }
    // A thing its code has not placed yet stands where it most likely will: on the spot the
    // player chose, or before them. Once the code places it, it glides there.
    // A root given to the world too (18.11: the bare coder leaves its root at exactly 0,0,0 and gives it to the world
    // for the host to put — the draft grew under the player's feet, at the world's origin, until the real thing came).
    const untouched = !sound || (source.position.lengthSq() === 0 && source.quaternion.w === 1);
    if (isRoot && untouched && !roomIsThePlace) {
      const at = place();
      part.position.copy(at.point);
      part.quaternion.copy(at.facing);
    }
  }

  function settle(part: Part): void {
    part.object.position.copy(part.position);
    part.object.quaternion.copy(part.quaternion);
    part.object.scale.copy(part.scale);
  }

  // The part's own materials come back; the burning copies go.
  function unburn(part: Part): void {
    if (!part.burn) return;
    (part.object as Mesh).material = part.burn.real;
    // a draft's material can be a stand-in with no dispose (18.11: «material.dispose is not a function» failed a game
    // that had compiled clean): a draft's leftovers must never fail the real thing
    for (const material of part.burn.own) if (typeof (material as { dispose?: unknown }).dispose === 'function') material.dispose();
    part.burn = undefined;
  }

  function drop(part: Part): void {
    unburn(part);
    part.state = 'gone';
    part.object.removeFromParent();
    parts.delete(part.key);
  }

  function copyInstances(shown: Drawn, next: Drawn): void {
    if (!shown.isInstancedMesh || !next.isInstancedMesh) return;
    const a = shown as unknown as InstancedMesh;
    const b = next as unknown as InstancedMesh;
    a.count = b.count;
    a.instanceMatrix.array.set(b.instanceMatrix.array);
    a.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) {
      if (a.instanceColor?.count === b.instanceColor.count) a.instanceColor.array.set(b.instanceColor.array);
      else a.instanceColor = b.instanceColor;
      a.instanceColor.needsUpdate = true;
    }
    a.boundingSphere = null; // measured again for the copies' new places
    a.boundingBox = null;
  }

  /** Takes one object of the new draft: the one already shown stays (and learns its new place), a new one comes in. */
  function visit(source: Object3D, key: string, parent: Part | undefined, outcome: Outcome): void {
    if (!stage || !showable(source)) return;
    const kids = source.children.slice();
    const home = parent ? parent.object : stage;
    let part = parts.get(key);
    if (part && !alike(part.object, source)) {
      drop(part);
      part = undefined;
    }
    if (!part) {
      // its children come in one by one below, each under its own key
      for (const kid of kids) source.remove(kid);
      part = {
        key,
        object: source,
        position: new Vector3(),
        quaternion: new Quaternion(),
        scale: new Vector3(1, 1, 1),
        shown: true,
        state: 'there',
        t: 0,
        easing: false,
        seen: tick,
      };
      read(part, source, outcome, !parent);
      settle(part);
      if (appears(source)) part.state = spread(source) ? 'queued' : 'held';
      source.visible = part.state === 'there' && part.shown;
      source.raycast = () => {}; // rays pass through a draft: the pinch is for Punto and the room
      home.add(source);
      parts.set(key, part);
      if (part.state === 'queued') queue.push(part);
    } else {
      if (part.object.parent !== home) home.add(part.object);
      read(part, source, outcome, !parent);
      copyInstances(part.object, source);
      if (part.state === 'held' && spread(part.object)) {
        part.state = 'queued';
        queue.push(part);
      }
      if (part.state === 'there') {
        part.object.visible = part.shown;
        if (!part.easing && !inPlace(part)) {
          part.easing = true;
          moving.push(part);
        }
      } else {
        settle(part); // not seen yet, or burning in: it simply is where its code puts it
      }
    }
    part.seen = tick;
    for (let index = 0; index < kids.length; index++) {
      visit(kids[index], outcome.names.get(kids[index]) ?? `${key}/${index}`, part, outcome);
    }
  }

  const inPlace = (part: Part): boolean =>
    part.object.position.distanceToSquared(part.position) < 1e-10 &&
    Math.abs(part.object.quaternion.dot(part.quaternion)) > 1 - 1e-8 &&
    part.object.scale.distanceToSquared(part.scale) < 1e-10;

  function apply(outcome: Outcome): void {
    tick++;
    let unnamed = 0;
    for (const root of outcome.roots) visit(root, outcome.names.get(root) ?? `#${unnamed++}`, undefined, outcome);
    // what the code took out again goes; a draft that stopped half-way says nothing about the rest
    if (outcome.complete) for (const part of [...parts.values()]) if (part.seen !== tick) drop(part);
  }

  // ---- drafts come faster than they run: only the newest waits ----
  let pending: string | undefined;
  let pumping = false;
  async function pump(): Promise<void> {
    pumping = true;
    try {
      while (pending !== undefined && stage) {
        // the player is still to show the spot: nothing is built somewhere else meanwhile
        if (pointed && placeAsked()) {
          await sleep(150);
          continue;
        }
        const js = pending;
        pending = undefined;
        const mine = build;
        try {
          const running = busy('draft run');
          const outcome = await run(js).finally(running);
          if (mine === build && stage) {
            const applying = busy('draft apply');
            apply(outcome);
            applying();
            drafts++;
          }
        } catch (error) {
          skipped++;
          console.debug(`[draft] a draft was skipped: ${String(error).slice(0, 200)}`);
        }
      }
    } finally {
      pumping = false;
    }
  }

  // ---- parts appear ----

  function note(): void {
    try {
      const ctx = SharedAudio.getContext() as unknown as AudioContext;
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (now - lastNote < 0.06) return;
      lastNote = now;
      const tone = ctx.createOscillator();
      const loud = ctx.createGain();
      tone.type = 'triangle';
      tone.frequency.value = 523.25 * 2 ** (SCALE[notes++ % SCALE.length] / 12);
      loud.gain.setValueAtTime(0.0001, now);
      loud.gain.exponentialRampToValueAtTime(0.05, now + 0.008);
      loud.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      tone.connect(loud).connect(ctx.destination);
      tone.start(now);
      tone.stop(now + 0.12);
    } catch {
      /* no sound: the build goes on */
    }
  }

  function launch(part: Part): void {
    const parent = part.object.parent;
    if (part.state !== 'queued' || !parent) return;
    parent.updateWorldMatrix(true, false);
    target.copy(part.position).applyMatrix4(parent.matrixWorld);
    punto.sendPixels(target, hand); // "this one is from me"
    part.state = 'appearing';
    part.t = 0;
    settle(part);
    // Burns in: its materials are swapped for burning copies of their own (materials are shared
    // between parts, and each part appears at its own time). Only plain mesh materials: a
    // shader of the coder's own, a line or a sprite has no place for the burn and just grows in.
    const mesh = part.object as Mesh & Drawn;
    const real = mesh.isMesh ? mesh.material : undefined;
    const list = Array.isArray(real) ? real : real ? [real] : [];
    if (real && list.length && list.every((material) => !(material as { isShaderMaterial?: boolean }).isShaderMaterial)) {
      const uniforms = burnUniforms(1);
      const own = list.map((material) => burnable(material.clone(), uniforms, false));
      mesh.material = Array.isArray(real) ? own : own[0];
      part.burn = { level: uniforms.uBurn, real, own };
    } else {
      part.object.scale.multiplyScalar(0.02);
    }
    part.object.visible = part.shown;
    appearing.push(part);
    hand = hand ? 0 : 1;
    note();
    if (first) {
      first = false;
      onFirstPart();
    }
  }

  function step(delta: number): void {
    if (!stage) return;
    // the more parts wait, the faster they leave the hand
    const gap = queue.length > 40 ? 0.015 : queue.length > 12 ? 0.045 : 0.11;
    waited = queue.length ? waited + delta : Math.min(waited + delta, gap);
    for (let left = 6; left > 0 && queue.length && waited >= gap; left--) {
      waited -= gap;
      launch(queue.shift()!);
    }
    for (let i = appearing.length - 1; i >= 0; i--) {
      const part = appearing[i];
      if (part.state === 'appearing') {
        part.t = Math.min(1, part.t + delta / APPEAR_S);
        const u = part.t - 1;
        if (part.burn) {
          part.burn.level.value = 1 - part.t;
          // a breath of size as it comes: a touch larger, then its own
          part.object.scale.copy(part.scale).multiplyScalar(1 + 0.08 * Math.sin(part.t * Math.PI));
        } else {
          // no burn for it: it grows a little past its size and settles
          part.object.scale.copy(part.scale).multiplyScalar(Math.max(0.02, 1 + 2.4 * u * u * u + 1.4 * u * u));
        }
        if (part.t < 1) continue;
        unburn(part);
        settle(part);
        part.state = 'there';
      }
      appearing[i] = appearing[appearing.length - 1];
      appearing.pop();
    }
    const near = 1 - Math.exp(-delta * 10);
    for (let i = moving.length - 1; i >= 0; i--) {
      const part = moving[i];
      if (part.state === 'there') {
        part.object.position.lerp(part.position, near);
        part.object.quaternion.slerp(part.quaternion, near);
        part.object.scale.lerp(part.scale, near);
        if (!inPlace(part)) continue;
        settle(part);
      }
      part.easing = false;
      moving[i] = moving[moving.length - 1];
      moving.pop();
    }
  }
  // Between drafts the work goes on: Punto keeps sending his pixels to the parts already there, one hand then the
  // other, until the real thing comes (Yury, 15.11: «переставал кодить … штучки летели в сторону кода до момента,
  // пока это не переместится»). Not while he holds the tablet (src/helper.ts sketch): his hands are busy then.
  let streamT = 0;
  const shownParts: Part[] = [];
  function stream(delta: number): void {
    if (!stage || !parts.size) return;
    if ((streamT -= delta) > 0) return;
    streamT = 0.16 + Math.random() * 0.12;
    shownParts.length = 0;
    for (const part of parts.values()) if (part.state !== 'queued' && part.object.parent && part.object.visible) shownParts.push(part);
    if (!shownParts.length || punto.busyHands?.()) return;
    const part = shownParts[Math.floor(Math.random() * shownParts.length)];
    part.object.updateWorldMatrix(true, false);
    part.object.getWorldPosition(target);
    punto.sendPixels(target, hand);
    hand = hand ? 0 : 1;
  }
  world.registerSystem(
    class DraftParts extends createSystem({}) {
      update(delta: number): void {
        step(delta);
        stream(delta);
      }
    },
  );

  function end(): void {
    build++;
    pending = undefined;
    if (!stage) return;
    const old = stage;
    const entity = stageEntity;
    stage = undefined;
    stageEntity = undefined;
    console.info(`[draft] ${parts.size} objects shown from ${drafts} drafts (${skipped} skipped)`);
    for (const part of parts.values()) unburn(part); // the ghost copies the real materials
    parts.clear();
    queue.length = appearing.length = moving.length = 0;
    try {
      if (old.children.length) leaveGhost(world.scene, [old], true);
    } catch (error) {
      console.warn('[draft] the ghost failed', error);
    }
    old.visible = false;
    setTimeout(() => {
      if (entity?.active) entity.dispose();
    }, GHOST_MS);
  }

  return {
    begin(options) {
      end();
      pointed = options.pointed;
      roomIsThePlace = options.roomIsThePlace;
      spot = undefined;
      places.clear();
      tick = drafts = skipped = notes = waited = 0;
      first = true;
      trouble = '';
      hand = 0;
      stage = new Group();
      stage.name = 'draft';
      stage.userData.occlude = false; // DepthOccludable rewrites materials for good; a draft lives seconds
      stageEntity = world.createTransformEntity(stage);
    },
    show(js) {
      if (!stage) return;
      pending = js;
      if (!pumping) void pump();
    },
    end,
  };
}
