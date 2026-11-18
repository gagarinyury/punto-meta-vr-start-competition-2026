// The kit of the playable instruments (Yury, 16.11; the look of research/concepts/instruments/i1-splash.png): what every
// instrument is made of — notes and their order, the toy-like lacquer, wood, metal and rubber, bevelled blocks,
// a piano keyboard of any range, rows of tuned bars, pipes between two points, stands, knobs and cymbals.
// Real sizes in metres, so a key or a bar is played with a real finger. Origin of every instrument: the middle of
// the floor or table under it, +Y up, the player in front of it at +Z.
// Every playable piece is a Mesh named by its note ('C4', 'snare') with userData { note, sound } and listed in
// the instrument's `parts`: what the coder's touch handler plays.
import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { alignSpan, bevelBox } from '../splash/models/hardsurface.js';

/** What the host can sound (src/music.ts), as a part names it. */
export type Sound = 'piano' | 'upright piano' | 'xylophone' | 'marimba' | 'glockenspiel' | 'vibraphone' | 'tubular bells' | 'kalimba' | 'drums';

/** One playable piece: the mesh a finger or a stick touches, the note ('C4') or drum ('snare') it plays, and with what. */
export interface Part {
  mesh: Mesh;
  note: string;
  sound: Sound;
}

/** A made instrument: the model to place, and its playable pieces. */
export interface Built {
  object: Group;
  parts: Part[];
}

/* ------------------------------------------------------------------ notes */

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C4' → 60, 'F#3' / 'Gb3' → 54; a number is passed through. */
export function midiOf(note: string | number): number {
  if (typeof note === 'number') return note;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(note.trim());
  if (!m) throw new Error(`not a note: ${note}`);
  return LETTER[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}
/** 60 → 'C4', 61 → 'C#4'. */
export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
export const isSharp = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
/** Every note from..to; `sharps: false` keeps only the white ones. */
export function notes(from: string | number, to: string | number, sharps = true): number[] {
  const out: number[] = [];
  for (let m = midiOf(from); m <= midiOf(to); m++) if (sharps || !isSharp(m)) out.push(m);
  return out;
}

/* ------------------------------------------------------------------ materials */

const std = (color: number, roughness: number, metalness = 0, extra: Partial<{ emissive: number; emissiveIntensity: number }> = {}) =>
  new MeshStandardMaterial({ color, roughness, metalness, emissive: extra.emissive ?? 0, emissiveIntensity: extra.emissiveIntensity ?? 1 });

/** The concept's surfaces: glossy toy lacquer, warm wood, chrome, brass, soft rubber, a glow. */
export const paint = {
  lacquer: (color: number) => std(color, 0.32),
  wood: (color: number) => std(color, 0.55),
  chrome: () => std(0xe4e8ee, 0.22, 1),
  steel: () => std(0xb9c0c8, 0.35, 1),
  brass: () => std(0xd9a441, 0.3, 1),
  rubber: (color: number) => std(color, 0.85),
  plastic: (color: number) => std(color, 0.5),
  ivory: () => std(0xf6f1e7, 0.35),
  ebony: () => std(0x17171b, 0.3),
  glow: (color: number, strength = 1.6) => std(color, 0.4, 0, { emissive: color, emissiveIntensity: strength }),
};
/** Each part of a row a touch darker or lighter, as real wood: the same seed gives the same instrument. */
export function vary(color: number, i: number, amount = 0.06): number {
  const k = 1 + (((Math.sin(i * 12.9898) * 43758.5453) % 1) - 0.5) * 2 * amount;
  const ch = (s: number) => Math.min(255, Math.max(0, Math.round(((color >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/* ------------------------------------------------------------------ shapes */

/** A soft-edged block w × h × d centred on the origin (x wide, y tall, z deep). */
export const block = (w: number, h: number, d: number, bevel = Math.min(w, h, d) * 0.18) => bevelBox(w, h, d, bevel, bevel * 1.4, 3);

/** A mesh with a name, at a place; `rx/ry/rz` turn it. */
export function put<T extends Object3D>(o: T, name: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  o.name = name;
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}
export const mesh = (geo: BufferGeometry, mat: Material, name: string, x = 0, y = 0, z = 0) => put(new Mesh(geo, mat), name, x, y, z);

/** A round rod of radius r from a to b (a leg, a pipe, a stick, a string). */
export function rod(a: Vector3, b: Vector3, r: number, mat: Material, name: string, r2 = r, sides = 10): Mesh {
  const m = new Mesh(new CylinderGeometry(r2, r, a.distanceTo(b), sides, 1), mat);
  m.name = name;
  alignSpan(m, a, b);
  return m;
}
export const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** A solid of revolution round +Y from a profile [radius, height][]. */
export const lathe = (profile: [number, number][], sides = 32) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), sides);

/** A playable piece: named by its note, carrying it in userData, listed in parts. */
export function playable(m: Mesh, note: string, sound: Sound, parts: Part[]): Mesh {
  m.name = note;
  m.userData = { note, sound };
  parts.push({ mesh: m, note, sound });
  return m;
}

/** A knob: a dark collar, a coloured cap, a white tick; its base at y = 0. */
export function knob(r: number, color: number, name: string, turn = 0): Group {
  const g = new Group();
  g.name = name;
  g.add(mesh(lathe([[0, 0], [r * 1.18, 0], [r * 1.18, r * 0.25], [0, r * 0.25]], 20), paint.plastic(0x2a2c33), 'Collar'));
  const cap = mesh(lathe([[0, 0], [r, 0], [r, r * 0.9], [r * 0.88, r * 1.05], [0, r * 1.08]], 20), paint.lacquer(color), 'Cap', 0, r * 0.2, 0);
  g.add(cap);
  const tick = mesh(block(r * 0.18, r * 0.06, r * 0.75, r * 0.02), paint.ivory(), 'Tick', 0, r * 1.3, -r * 0.45);
  g.add(tick);
  g.rotation.y = turn;
  return g;
}

/** A ball-headed mallet lying from `a` (the end of the handle) to the head at `b`. */
export function mallet(a: Vector3, b: Vector3, headR: number, headColor: number, name: string): Group {
  const g = new Group();
  g.name = name;
  g.add(rod(a, b, headR * 0.22, paint.wood(0xe0b47a), 'Handle'));
  g.add(mesh(new SphereGeometry(headR, 20, 14), paint.rubber(headColor), 'Head', b.x, b.y, b.z));
  return g;
}

/** A cymbal of diameter d: a thin brass dish with a bell in the middle, its centre at the origin. */
export function cymbal(d: number, name: string): Mesh {
  const r = d / 2;
  const profile: [number, number][] = [[0, 0.03 * r], [0.16 * r, 0.03 * r], [0.2 * r, 0.006], [0.98 * r, -0.03 * r], [r, -0.036 * r], [0.98 * r, -0.044 * r], [0.2 * r, -0.004], [0.16 * r, 0.02 * r], [0, 0.02 * r]];
  return mesh(lathe(profile, 40), paint.brass(), name);
}

/** A three-legged stand: feet on the floor round (x, z), a pipe up to `top`. Returns the stand group. */
export function tripod(x: number, z: number, top: number, spread: number, name: string, mat = paint.chrome()): Group {
  const g = new Group();
  g.name = name;
  const hub = v(x, Math.min(0.32, top * 0.4), z);
  g.add(rod(v(x, 0.02, z), v(x, top, z), 0.011, mat, 'Pipe'));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const foot = v(x + Math.cos(a) * spread, 0.012, z + Math.sin(a) * spread);
    g.add(rod(hub, foot, 0.008, mat, `Leg${i}`));
    g.add(mesh(new SphereGeometry(0.014, 10, 8), paint.rubber(0x222222), `Foot${i}`, foot.x, foot.y, foot.z));
  }
  return g;
}

/** A flat outline seen from above ([x, z][], or a Shape with x right and y = -z), extruded up by h from y = 0. */
export function lying(outline: [number, number][] | Shape, h: number, bevel = 0.005, holes: [number, number][][] = []): ExtrudeGeometry {
  const toShape = (pts: [number, number][]) => {
    const s = new Shape();
    pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    return s;
  };
  const shape = Array.isArray(outline) ? toShape(outline) : outline;
  for (const hole of holes) shape.holes.push(toShape(hole));
  const geo = new ExtrudeGeometry(shape, { depth: Math.max(0.001, h - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  return geo;
}

/** How a row of tuned bars is laid out (metres). */
export interface BarLayout {
  width: number;
  gap: number;
  /** the lowest bar's length and the highest's: the lengths between run geometrically, as real bars do */
  longest: number;
  shortest: number;
  thick: number;
  /** how much higher the sharps' row lies */
  rise?: number;
}
/** One laid bar: its note, centre and length. */
export interface BarPlace {
  midi: number;
  x: number;
  z: number;
  y: number;
  length: number;
  sharp: boolean;
}
/**
 * Where the bars of from..to go: the naturals in one row, the sharps (if any) in a row behind them, raised, each
 * between its two neighbours as on a piano; the two rows meet in the middle (z = 0) and spread to a trapezoid.
 * Without sharps one row centred on z = 0. Also the node lines under each row, where the bars rest on felt.
 */
export function layBars(midis: number[], o: BarLayout): { bars: BarPlace[]; span: [number, number]; rails: [Vector3, Vector3][] } {
  const twoRows = midis.some(isSharp), lo = midis[0], hi = midis[midis.length - 1];
  const length = (m: number) => o.longest * Math.pow(o.shortest / o.longest, hi > lo ? (m - lo) / (hi - lo) : 0);
  const step = o.width + o.gap, naturals = midis.filter((m) => !isSharp(m)).length;
  const x0 = -((naturals - 1) * step) / 2;
  let i = 0;
  const bars = midis.map((m) => {
    const sharp = isSharp(m), len = length(m), x = sharp ? x0 + (i - 0.5) * step : x0 + i++ * step;
    const z = !twoRows ? 0 : sharp ? -(len / 2 + 0.008) : len / 2 + 0.008;
    return { midi: m, x, z, y: sharp ? (o.rise ?? 0.012) : 0, length: len, sharp };
  });
  const rails: [Vector3, Vector3][] = [];
  for (const row of twoRows ? [false, true] : [false]) {
    const own = bars.filter((b) => b.sharp === row);
    if (!own.length) continue;
    const a = own[0], b = own[own.length - 1];
    for (const side of [-1, 1]) {
      const node = (p: BarPlace) => p.z + side * p.length * 0.276;
      rails.push([new Vector3(a.x - o.width, a.y, node(a)), new Vector3(b.x + o.width, b.y, node(b))]);
    }
  }
  return { bars, span: [x0 - o.width / 2, x0 + (naturals - 1) * step + o.width / 2], rails };
}
