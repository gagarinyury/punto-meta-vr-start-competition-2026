// Effects in Punto's look (Yury, 17.11): made of the same faceted toy pieces as his things and islands — a boom is
// lumps of orange and grey that swell and pop, sparks are faceted needles, a flash is a faceted star — not soft smoke
// and glow shaders from another game. They are ordinary meshes, so an effect on a tabletop board shrinks with the
// board like everything on it, and its size is always "the size of what it happens to", in that place's own units.
//
//   import { boom, spawn, sizeOf } from '../toyfx.js';
//   spawn(world, boom({ size: sizeOf(zombie) }), zombie.position);          // in the room: metres
//   spawn(world, boom({ size: 1 }), tank.position, { parent: board.root }); // on a board: the board's units
//
// Any effect of your own is a few layers of pieces (toyEffect): what the pieces are, how many, where they fly, how
// they grow and go. The ready ones below are built that way; read them as examples.
import {
  BufferGeometry,
  Color,
  type Entity,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
  OctahedronGeometry,
  Quaternion,
  Shape,
  TetrahedronGeometry,
  Vector3,
  Box3,
  type World,
  Group,
} from '@iwsdk/core';
import { type Fx, play } from './fx/core.js';
import { blob, jitter } from './splash/models/kit.js';
import { chamferedBox, ring, toy } from './style/base.js';

/** What the pieces of a layer are: a ready shape, or your own geometry about 1 across, centred. */
export type PieceShape = 'lump' | 'shard' | 'needle' | 'star' | 'chip' | 'ring' | 'drop' | BufferGeometry;
type Range = number | [number, number];

/**
 * One layer of an effect: `count` pieces of one shape. Every length is a share of the effect's `size` (a piece of
 * `size: 0.3` is 30 % of the effect across), speeds are sizes a second, gravity sizes a second².
 */
export interface Layer {
  shape: PieceShape;
  /** one colour, or several: each piece takes one of them */
  color: number | number[];
  count: number;
  /** how big each piece is, a share of the effect's size */
  size: Range;
  /** where they go: 'all' every way, 'up' a fountain, 'out' a flat ring round the spot, 'forward' a cone along +Z
   *  (a shot, a spray: pass `toward` to spawn), 'none' they stay where they start */
  fly?: 'all' | 'up' | 'out' | 'forward' | 'none';
  speed?: Range;
  /** how wide the cone of 'up' and 'forward' opens, radians (0.5) */
  spread?: number;
  /** pull down, sizes a second² (a falling shard ~3, a rising smoke puff -0.5) */
  gravity?: number;
  /** slowing down in the air, per second (0..5) */
  drag?: number;
  /** how far from the centre they start, a share of the size (0) */
  start?: number;
  /** turning, radians a second */
  spin?: Range;
  /** how long each piece lives, seconds */
  life: Range;
  /** when each piece starts, seconds after the effect does */
  delay?: Range;
  /** how a piece grows and goes: 'pop' swells at once and shrinks away at the end (debris, stars); 'puff' swells
   *  slowly from small and pops (smoke, a boom's ball); 'flash' a blink, gone almost at once; 'shrink' starts full
   *  and only shrinks (sparks); 'wave' a ring that widens flat and thins (a shock wave) */
  grow?: 'pop' | 'puff' | 'flash' | 'shrink' | 'wave';
  /** pieces stretch along the way they fly by this much at full speed (sparks, a tracer: 2-6) */
  stretch?: number;
  /** they glow (fire, a flash, magic) — unlit, bright; otherwise lit like every toy piece */
  glow?: boolean;
  /** they land and bounce on the ground under the spot (shards, coins) */
  floor?: boolean;
}

export interface EffectOptions {
  /** metres in the room, or the board's units on a board: the size of what it happens to (sizeOf) */
  size?: number;
  /** another throw of the dice: the same effect comes out a little different */
  seed?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// the pieces: built once, shared by every effect (never disposed)

const geometries = new Map<string, BufferGeometry>();
const starShape = (points: number, inner: number) => {
  const s = new Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? inner : 0.5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
};
function pieceGeometry(shape: PieceShape): BufferGeometry {
  if (typeof shape !== 'string') return shape;
  let geo = geometries.get(shape);
  if (geo) return geo;
  let raw: BufferGeometry;
  if (shape === 'lump') raw = blob(0.5, 3, 1, 0.22);
  else if (shape === 'shard') raw = jitter(new TetrahedronGeometry(0.55).scale(1, 0.45, 0.8), 0.06, 5);
  else if (shape === 'needle') raw = new OctahedronGeometry(0.5).scale(0.16, 0.16, 1);
  else if (shape === 'star') raw = new ExtrudeGeometry(starShape(5, 0.22), { depth: 0.14, bevelEnabled: false }).translate(0, 0, -0.07);
  else if (shape === 'chip') raw = chamferedBox(1, 0.22, 0.7, 0.05);
  else if (shape === 'ring') raw = ring(0.42, 0.5, 0.06, 18);
  else raw = new IcosahedronGeometry(0.5, 0).scale(0.8, 1.2, 0.8); // drop
  // painted white with the toy's facet-to-facet variation: each piece is tinted its colour (instance colour)
  geo = toy(raw.index ? raw.toNonIndexed() : raw, 0xffffff, { vary: 0.14 }).geometry;
  geometries.set(shape, geo);
  return geo;
}
const lit = toy(new IcosahedronGeometry(0.5, 0), 0xffffff).material as Material;
const glowing = new MeshBasicMaterial({ vertexColors: true });

// ---------------------------------------------------------------------------------------------------------------
// the engine

const pick = (range: Range | undefined, fallback: number, r: () => number) =>
  range === undefined ? fallback : typeof range === 'number' ? range : range[0] + (range[1] - range[0]) * r();
const random = (seed: number) => {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const _m = new Matrix4(), _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _v = new Vector3();
const Z = new Vector3(0, 0, 1);

/** The curve of a piece's size over its life (t 0..1). */
function growth(kind: Layer['grow'], t: number): number {
  switch (kind) {
    case 'puff': return t < 0.7 ? 0.35 + 0.75 * Math.sin((t / 0.7) * Math.PI / 2) : 1.1 * (1 - (t - 0.7) / 0.3) ** 0.6;
    case 'flash': return t < 0.25 ? t / 0.25 : (1 - (t - 0.25) / 0.75) ** 2;
    case 'shrink': return 1 - t;
    case 'wave': return 0.2 + t * 1.3;
    default: return t < 0.12 ? 1.15 * (t / 0.12) : t < 0.6 ? 1.15 - 0.15 * ((t - 0.12) / 0.48) : (1 - (t - 0.6) / 0.4) ** 0.8; // pop
  }
}

/**
 * Any effect: layers of toy pieces (see Layer). Returns an Fx for `spawn` (or fx.js `play`). One draw call a layer.
 */
export function toyEffect(layers: Layer[], options: EffectOptions = {}): Fx {
  const size = options.size ?? 1;
  const r = random(options.seed ?? Math.floor(Math.random() * 1e9));
  const object = new Group();
  object.name = 'ToyEffect';
  const runs = layers.map((layer) => {
    const mesh = new InstancedMesh(pieceGeometry(layer.shape), layer.glow ? glowing : lit, layer.count);
    mesh.castShadow = !layer.glow;
    mesh.frustumCulled = false;
    const colours = Array.isArray(layer.color) ? layer.color : [layer.color];
    const n = layer.count;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), axis = new Float32Array(n * 3);
    const spin = new Float32Array(n), life = new Float32Array(n), delay = new Float32Array(n), big = new Float32Array(n);
    const turn: Quaternion[] = [];
    const colour = new Color();
    for (let i = 0; i < n; i++) {
      // the way it flies
      const fly = layer.fly ?? 'all', spread = layer.spread ?? 0.5;
      if (fly === 'out') {
        const a = r() * Math.PI * 2;
        _v.set(Math.cos(a), (r() - 0.3) * 0.25, Math.sin(a));
      } else if (fly === 'up' || fly === 'forward') {
        const a = r() * Math.PI * 2, tilt = Math.sqrt(r()) * spread;
        _v.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
        if (fly === 'forward') _v.set(_v.x, _v.z, _v.y); // the cone along +Z
      } else if (fly === 'all') {
        _v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
        if (_v.lengthSq() < 1e-4) _v.set(0, 1, 0);
      } else _v.set(r() - 0.5, r() - 0.5, r() - 0.5);
      _v.normalize();
      const start = (layer.start ?? 0) * size * (0.5 + r() * 0.5);
      pos[i * 3] = _v.x * start; pos[i * 3 + 1] = _v.y * start; pos[i * 3 + 2] = _v.z * start;
      const speed = fly === 'none' ? 0 : pick(layer.speed, 1, r) * size;
      vel[i * 3] = _v.x * speed; vel[i * 3 + 1] = _v.y * speed; vel[i * 3 + 2] = _v.z * speed;
      _p.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      axis[i * 3] = _p.x; axis[i * 3 + 1] = _p.y; axis[i * 3 + 2] = _p.z;
      spin[i] = pick(layer.spin, 3, r) * (r() < 0.5 ? -1 : 1);
      life[i] = pick(layer.life, 0.6, r);
      delay[i] = pick(layer.delay, 0, r);
      big[i] = pick(layer.size, 0.2, r) * size;
      turn.push(new Quaternion().setFromAxisAngle(_p, r() * Math.PI * 2));
      mesh.setColorAt(i, colour.setHex(colours[Math.floor(r() * colours.length)]));
      mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    object.add(mesh);
    return { layer, mesh, pos, vel, axis, spin, life, delay, big, turn, end: Math.max(...Array.from(life, (l, i) => l + delay[i])) };
  });
  const end = Math.max(...runs.map((run) => run.end));
  const step = new Quaternion();
  return {
    object,
    pooled: true, // the pieces' geometry and material are shared: never freed with one effect
    update(delta, age) {
      for (const run of runs) {
        const { layer, mesh, pos, vel, axis, spin, life, delay, big, turn } = run;
        const gravity = (layer.gravity ?? 0) * size, drag = Math.max(0, 1 - (layer.drag ?? 0) * delta);
        for (let i = 0; i < layer.count; i++) {
          const t = (age - delay[i]) / life[i];
          if (t < 0 || t >= 1) {
            mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
            continue;
          }
          const k = i * 3;
          vel[k] *= drag; vel[k + 2] *= drag;
          vel[k + 1] = vel[k + 1] * drag - gravity * delta;
          pos[k] += vel[k] * delta; pos[k + 1] += vel[k + 1] * delta; pos[k + 2] += vel[k + 2] * delta;
          if (layer.floor && pos[k + 1] < 0) {
            pos[k + 1] = 0;
            vel[k + 1] *= -0.35; vel[k] *= 0.6; vel[k + 2] *= 0.6;
          }
          const s = growth(layer.grow, t) * big[i];
          _p.set(pos[k], pos[k + 1], pos[k + 2]);
          if (layer.grow === 'wave') {
            _q.identity();
            _s.set(s, big[i] * (1 - t) + 1e-4, s);
          } else if (layer.stretch) {
            // along the way it flies: the needle points where it goes, longer the faster
            _v.set(vel[k], vel[k + 1], vel[k + 2]);
            const speed = _v.length();
            if (speed > 1e-5) _q.setFromUnitVectors(Z, _v.divideScalar(speed));
            _s.set(s, s, s * (1 + layer.stretch * Math.min(1, speed / Math.max(1e-5, size * 2))));
          } else {
            turn[i].multiply(step.setFromAxisAngle(_v.set(axis[k], axis[k + 1], axis[k + 2]), spin[i] * delta));
            _q.copy(turn[i]);
            _s.setScalar(s);
          }
          mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = false;
      }
      return age < end;
    },
    dispose() {
      for (const run of runs) run.mesh.dispose(); // its own instance buffers only
    },
  };
}

/**
 * Shows an effect at a spot: a point (in `parent`'s space — on a board pass `parent: board.root` and a point in the
 * board's units), or a thing it follows (an Object3D or Entity: it rides along). `toward`: the way 'forward' layers
 * fly (a shot: shot.direction); `normal`: the surface it happens on (+Y out of it: a wall hit). Gone by itself.
 */
export function spawn(
  world: World,
  fx: Fx,
  at: Vector3 | Object3D | Entity,
  options: { parent?: Object3D | Entity; toward?: Vector3; normal?: Vector3 } = {},
): { stop(): void } {
  if (options.toward && options.toward.lengthSq() > 1e-8) fx.object.quaternion.setFromUnitVectors(Z, _v.copy(options.toward).normalize());
  if (options.parent && 'isVector3' in at) {
    const parent = 'isObject3D' in options.parent ? options.parent : options.parent.object3D;
    if (parent) {
      fx.object.position.copy(at);
      parent.add(fx.object);
      fx.object.userData.occlude = false;
      // driven by an empty follower so it is updated and removed like any other effect
      const holder = new Group();
      const shown = play(world, { object: holder, update: (d, a) => fx.update(d, a), pooled: true }, fx.object.position);
      return {
        stop() {
          shown.stop();
          fx.object.removeFromParent();
          fx.dispose?.();
        },
      };
    }
  }
  return play(world, fx, at as Vector3, options.normal);
}

/** How big a thing is: the longest side of its box, in its parent's units (metres in the room, units on a board). */
export function sizeOf(thing: Object3D): number {
  const box = new Box3();
  const parent = thing.parent;
  const inverse = parent ? new Matrix4().copy(parent.matrixWorld).invert() : undefined;
  thing.updateWorldMatrix(true, true);
  box.setFromObject(thing, true);
  if (inverse) box.applyMatrix4(inverse);
  const s = box.getSize(new Vector3());
  return Math.max(s.x, s.y, s.z) || 1;
}

// ---------------------------------------------------------------------------------------------------------------
// the ready ones: one line each in a game; read them to write your own

/** A boom: a swelling ball of glowing orange lumps, grey smoke lumps rising after it, debris and a shock ring. */
export const boom = (o: EffectOptions = {}) =>
  toyEffect([
    { shape: 'lump', color: [0xffb21a, 0xff7a2f, 0xffd040], glow: true, count: 9, size: [0.35, 0.55], fly: 'all', speed: [0.6, 1.2], drag: 4, start: 0.15, life: [0.35, 0.5], grow: 'puff' },
    { shape: 'lump', color: [0x6e6870, 0x9c9ca6, 0x4a4450], count: 8, size: [0.3, 0.5], fly: 'up', spread: 0.9, speed: [0.5, 0.9], drag: 2, gravity: -0.4, life: [0.7, 1.1], delay: [0.12, 0.25], grow: 'puff' },
    { shape: 'shard', color: [0x5f3b24, 0x845331, 0x6e6870], count: 10, size: [0.06, 0.12], fly: 'up', spread: 1.2, speed: [2, 3.2], gravity: 6, floor: true, spin: [6, 12], life: [0.8, 1.2], grow: 'pop' },
    { shape: 'ring', color: 0xffd040, glow: true, count: 1, size: 1.1, fly: 'none', life: 0.35, grow: 'wave' },
  ], o);

/** Something appears or vanishes: a ring of soft lumps puffing out, and stars. */
export const poof = (o: EffectOptions & { color?: number } = {}) =>
  toyEffect([
    { shape: 'lump', color: [o.color ?? 0xf6f3ec, 0xe9e2d2, 0xd8d0e8], count: 10, size: [0.25, 0.4], fly: 'out', speed: [0.6, 0.9], drag: 3.5, start: 0.2, life: [0.45, 0.6], grow: 'puff' },
    { shape: 'star', color: [0xffc93a, 0xffffff], glow: true, count: 5, size: [0.1, 0.16], fly: 'up', spread: 1, speed: [0.7, 1.1], drag: 2, spin: [3, 6], life: [0.5, 0.7], delay: [0, 0.1], grow: 'pop' },
  ], o);

/** A hit: faceted needles sparking out of the spot, and a few chips. `normal`: off a wall, pass it to spawn. */
export const hit = (o: EffectOptions & { color?: number } = {}) =>
  toyEffect([
    { shape: 'needle', color: [0xffd040, 0xffb21a, 0xffffff], glow: true, count: 12, size: [0.05, 0.09], fly: 'up', spread: 1.1, speed: [2.5, 4], drag: 3, gravity: 3, life: [0.18, 0.3], grow: 'shrink', stretch: 4 },
    { shape: 'chip', color: o.color ?? 0x9c9ca6, count: 5, size: [0.05, 0.09], fly: 'up', spread: 1, speed: [1.2, 2], gravity: 6, spin: [8, 14], life: [0.4, 0.6], grow: 'pop' },
  ], o);

/** A muzzle flash: a faceted star that blinks at the barrel's end, and a spit of sparks along +Z (toward: shot.direction). */
export const flash = (o: EffectOptions & { color?: number } = {}) =>
  toyEffect([
    { shape: 'star', color: [o.color ?? 0xffd040, 0xffffff], glow: true, count: 2, size: [0.7, 0.9], fly: 'none', spin: [0, 0.1], life: 0.08, grow: 'flash' },
    { shape: 'needle', color: [o.color ?? 0xffb21a, 0xffffff], glow: true, count: 5, size: [0.12, 0.2], fly: 'forward', spread: 0.25, speed: [4, 6], drag: 6, life: [0.08, 0.14], grow: 'shrink', stretch: 3 },
  ], o);

/** A shot you can see: one faceted needle racing along +Z (toward: shot.direction), `size` long. */
export const tracer = (o: EffectOptions & { color?: number } = {}) =>
  toyEffect([
    { shape: 'needle', color: o.color ?? 0xffd040, glow: true, count: 1, size: 0.12, fly: 'forward', spread: 0, speed: 30, life: 0.12, grow: 'shrink', stretch: 6 },
  ], o);

/** A thing breaks: its shards fly up, fall and bounce on the ground, then pop away. `color`: the thing's colour. */
export const shatter = (o: EffectOptions & { color?: number | number[] } = {}) =>
  toyEffect([
    { shape: 'shard', color: o.color ?? [0x3a8cf0, 0x6ff3ff], count: 14, size: [0.12, 0.22], fly: 'up', spread: 1.3, speed: [1.5, 2.6], gravity: 6, floor: true, spin: [5, 12], life: [1, 1.4], grow: 'pop' },
  ], o);

/** A win: confetti chips in every colour shooting up and tumbling down, with stars. */
export const confetti = (o: EffectOptions = {}) =>
  toyEffect([
    { shape: 'chip', color: [0xe94b3c, 0xffc93a, 0x45d483, 0x3a8cf0, 0xb06cf0, 0xff6fa8], count: 30, size: [0.05, 0.08], fly: 'up', spread: 0.6, speed: [2.5, 3.5], drag: 1.5, gravity: 3, spin: [6, 14], life: [1.2, 1.6], grow: 'pop' },
    { shape: 'star', color: [0xffc93a, 0xffffff], glow: true, count: 6, size: [0.07, 0.11], fly: 'up', spread: 0.8, speed: [2, 3], drag: 2, gravity: 1, spin: [3, 6], life: [0.8, 1.1], grow: 'pop' },
  ], o);

/** A splash: drops thrown up in a crown that fall back, and a ring on the surface. */
export const splash = (o: EffectOptions & { color?: number } = {}) =>
  toyEffect([
    { shape: 'drop', color: [o.color ?? 0x3fa9ff, 0x6ff3ff, 0xffffff], count: 14, size: [0.08, 0.13], fly: 'up', spread: 0.7, speed: [1.6, 2.4], gravity: 7, life: [0.5, 0.7], grow: 'shrink', stretch: 1 },
    { shape: 'ring', color: o.color ?? 0x6ff3ff, count: 1, size: 0.9, fly: 'none', life: 0.5, grow: 'wave' },
  ], o);

/** Smoke rising from a spot (a chimney, a burnt-out thing): grey lumps that float up, swell and pop. */
export const smoke = (o: EffectOptions = {}) =>
  toyEffect([
    { shape: 'lump', color: [0x9c9ca6, 0x6e6870, 0xc8c4cc], count: 8, size: [0.25, 0.4], fly: 'up', spread: 0.3, speed: [0.25, 0.4], gravity: -0.15, life: [1.2, 1.8], delay: [0, 1], grow: 'puff' },
  ], o);

/** Magic, healing, a level up: glowing stars and faceted sparks spiralling up. */
export const sparkle = (o: EffectOptions & { color?: number } = {}) =>
  toyEffect([
    { shape: 'star', color: [o.color ?? 0x6ff3ff, 0xffffff, 0xb06cf0], glow: true, count: 10, size: [0.08, 0.14], fly: 'up', spread: 0.5, speed: [0.5, 0.9], drag: 1, start: 0.3, spin: [2, 5], life: [0.7, 1], delay: [0, 0.3], grow: 'pop' },
    { shape: 'lump', color: o.color ?? 0x6ff3ff, glow: true, count: 6, size: [0.04, 0.07], fly: 'up', spread: 0.6, speed: [0.8, 1.2], start: 0.2, life: [0.5, 0.8], delay: [0, 0.3], grow: 'shrink' },
  ], o);

/** Every ready effect by name (the preview page shows them all). */
export const READY = { boom, poof, hit, flash, tracer, shatter, confetti, splash, smoke, sparkle } as const;
