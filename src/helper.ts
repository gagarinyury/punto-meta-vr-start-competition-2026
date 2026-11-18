// Punto, the helper: a keycap with a screen, riding a mechanical key switch.
// Ported from research/stands/helper.html (the preview page). Sizes are metres; the screen
// looks along +Z. Six moods: idle, listen, think, build, happy, talk.
//
//   const punto = spawnPunto(world);          // floats in front of the player, watches the head
//   punto.setState('listen');                 // mood: pose, hands, colour, face
//   punto.setVoice(level);                    // 0..1 from the TTS audio; null = made-up syllables
import { roomHit } from './place.js';
import { onRayPress } from './ray.js';
import { playSound, sfx } from './sfx.js';
import type { Tool } from './blueprint.js';
import { TABLET_SCREEN } from './library/tablet.js';
import { type Key, puntoKeyboard } from './keyboard.js';
import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  createSystem,
  type Entity,
  Euler,
  FollowBehavior,
  Follower,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
  type World,
} from '@iwsdk/core';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type PuntoState = 'idle' | 'listen' | 'think' | 'build' | 'happy' | 'talk';

export interface Punto {
  /** Put this into the scene; its position is Punto's place. */
  object: Group;
  /** Moves inside `object`: flights, hops. */
  root: Group;
  /** `lookAt` is the point Punto watches, in the space of `object`. */
  update(dt: number, t: number, lookAt?: Vector3): void;
  setState(next: PuntoState): void;
  /** Loudness of Punto's own voice, 0..1; null = made-up syllables while talking. */
  setVoice(level: number | null): void;
  readonly state: PuntoState;
  /** The body is turned this much (radians) away from where Punto looks, so it reads as a solid thing, not a flat picture. */
  turn: number;
  /** Punto works at his little keyboard while it builds (on while waiting for a game; off when it makes things by hand). */
  showBuild: boolean;
  /** Where Punto's own little sounds go: key presses, typing, tapping, tickles, a start, joy. */
  setSound(play: (name: PuntoSound) => void): void;
  /** The coder's reply as it streams in, typed on the screen while Punto builds; null = the built-in sample. */
  setCode(text: string | null): void;
  /** A short burst of its pixels from a hand (0 = its left, 1 = its right) to a point in the room: "this part is from me". */
  sendPixels(to: Vector3, hand?: 0 | 1): void;
  /** His hands are on something (the tablet he carries or draws on): no pixels from them meanwhile. */
  busyHands?(): boolean;
  /** The player touched it: it is ticklish. */
  poke(): void;
  /** Something happened over there (a point in the space of `object`): it looks for a moment. */
  notice(point: Vector3, seconds?: number): void;
  /** Pops into the room and waves hello. */
  enter(): void;
  /** One of its little acts now: 'look' glances left and right, 'wave' waves, 'peek' looks down, 'scratch' scratches its head. */
  perform(name: 'look' | 'wave' | 'peek' | 'scratch' | 'strain' | 'reach' | 'fetch'): void;
  /** A hand (0 = its left, 1 = its right) holds on to a world point, turned by `r` (as the moods' hand poses); null lets go.
   *  The point is read every frame from the vector given, so a moving thing can be held. */
  grip(hand: 0 | 1, at: Vector3 | null, r?: [number, number, number], curl?: number): void;
  /** One finger of that hand strikes down, as on a key (0 index, 1 middle, 2 outer, 3 the thumb; none: one of the three). */
  tap(hand: 0 | 1, finger?: number): void;
  /** A holding hand turned as `q` (world), blended over grip()'s turn by `w` (0..1); null lets it be. */
  gripTurn(hand: 0 | 1, q: Quaternion | null, w?: number): void;
  /** One of its own little sounds, without moving. */
  chirp(name: PuntoSound): void;
  /** The power button low on the wide left bezel: what the ray hits to leave the room (on the flat page: to enter it). */
  power: Group;
  /** The power button dips like a pressed key and clicks. */
  pressPower(): void;
  /** Points at its own power button with the right hand for a few seconds ("press me right here"). */
  showPower(): void;
  /** Raises the left hand and points up at the bubble over its head ("let's go in!"), looking there too. */
  showWay(): void;
  /** The title's face (Yury, 15.11, after his concept art): > < eyes, no brows, dotted cheeks, a small smile. */
  joy?: boolean;
}

export type PuntoSound = 'key' | 'type' | 'tap' | 'poke' | 'wake' | 'glad';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

interface Pose { p: [number, number, number]; r: [number, number, number] }
interface Face { w: number; h: number; pupil: number; lid?: number; raise: [number, number]; tilt: [number, number] }
interface Mood { color: number; lean: [number, number]; hands: [Pose, Pose]; face: Face }

// Hands are written for the +X side; the other side is the mirror image.
// At rest the hands hang by the sides, at the lower third of the body, fingers down and a little
// forward, palms to the body — like a cartoon figure's arms, not two blobs under it.
// thumbs forward; fingers down and 45 degrees out from the body (seen from the front), so the hands read as his own, not tucked under
const REST: Pose = { p: [0.078, -0.022, 0.016], r: [0.681, -0.481, -2.224] };
const STATES: Record<PuntoState, Mood> = {
  idle:   { color: 0x35d8ff, lean: [0.00, 0.00],  hands: [REST, REST],
            face: { w: 66, h: 96, pupil: 0, raise: [0, 0],      tilt: [0, 0] } },
  listen: { color: 0xffc83d, lean: [0.10, -0.12], hands: [{ p: [0.080, 0.030, 0.034], r: [0.2, -0.5, -0.25] }, REST],
            face: { w: 74, h: 94, pupil: 1, raise: [0.6, 0.6],  tilt: [-0.25, -0.25] } },
  think:  { color: 0xb07cff, lean: [-0.07, 0.11], hands: [{ p: [0.026, -0.05, 0.068], r: [-0.3, 0, 0.5] }, { p: [0.072, -0.062, 0.03], r: [0, 0, 3.6] }],
            face: { w: 68, h: 86, pupil: 1, raise: [1.0, -0.3], tilt: [-0.1, 0.55] } },
  build:  { color: 0xff8a2a, lean: [0.14, 0.00],  hands: [{ p: [0.046, -0.05, 0.088], r: [1.35, 0, 0.25] }, { p: [0.046, -0.05, 0.088], r: [1.35, 0, 0.25] }],
            face: { w: 68, h: 88, pupil: 1, lid: 1, raise: [-0.5, -0.5], tilt: [0.9, 0.9] } },
  happy:  { color: 0x4dff8f, lean: [-0.08, 0.00], hands: [{ p: [0.092, 0.045, 0.01], r: [0, 0, -0.4] }, { p: [0.092, 0.045, 0.01], r: [0, 0, -0.4] }],
            face: { w: 62, h: 80, pupil: 0, raise: [0.7, 0.7],  tilt: [-0.3, -0.3] } },
  talk:   { color: 0x35d8ff, lean: [0.03, 0.04],  hands: [{ p: [0.086, -0.018, 0.05], r: [0.45, 0, -0.5] }, REST],
            face: { w: 66, h: 96, pupil: 0, raise: [0.25, 0.25], tilt: [-0.1, -0.1] } },
};
const NAMES = Object.keys(STATES) as PuntoState[];

// ---- the gloves (Yury, 15.11, after his concept art): one smooth body each — a stuffed palm, three cartoon fingers
// and a thumb, a rolled cuff right at the palm — blended as a signed distance field, turned into one surface by
// marching cubes and put on bones, so the fingers bend like a glove, with no seams at the joints. The stand it was
// drawn on: research/concepts/gloves/gloves.html. In the hand's frame the fingers point +Y, the palm faces +Z, the thumb is on -side X.
const FINGERS = [   // index, middle, outer, across the palm from the thumb: knuckle, radius, two joint lengths, fan
  { x: 0.0092, y: 0.0078, r: 0.0047, l: [0.0078, 0.0070], fan: 0.17 },
  { x: 0.0000, y: 0.0090, r: 0.0048, l: [0.0084, 0.0076], fan: 0.0 },
  { x: -0.0092, y: 0.0076, r: 0.0045, l: [0.0074, 0.0066], fan: -0.18 },
];
const THUMB = { at: [0.0120, -0.0030, 0.0024], turn: [0.35, 0, 0.82], r: 0.0049, l: [0.0060, 0.0058] };
const CUFF = { y: -0.0158, R: 0.0100, r: 0.0054 };
const GLOVE_SCALE = 0.85; // the concept's size is a little big for him: this keeps them near the old gloves
interface Chain { a: Vector3; b: Vector3; c: Vector3; r: number }
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** Distance to a capsule from a to b whose radius goes from ra to rb. */
function capsule(px: number, py: number, pz: number, a: Vector3, b: Vector3, ra: number, rb: number) {
  const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, qx = px - a.x, qy = py - a.y, qz = pz - a.z;
  const h = Math.min(1, Math.max(0, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(qx - bx * h, qy - by * h, qz - bz * h) - (ra + (rb - ra) * h);
}
/** The palm (a stuffed, well-rounded box) with the rolled cuff. */
function palmSdf(x: number, y: number, z: number) {
  const qx = Math.abs(x) - 0.0074, qy = Math.abs(y) - 0.0066, qz = Math.abs(z) - 0.0016;
  const palm = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.0070;
  const cuff = Math.hypot(Math.hypot(x, z) - CUFF.R, (y - CUFF.y) * 1.15) - CUFF.r;
  return smin(palm, cuff, 0.0018);
}
/** A hand's bones: the root (the palm), a first and a second joint for each finger and the thumb, the thumb's base. */
function gloveBones(side: number) {
  const root = new Bone(), k1: Bone[] = [], k2: Bone[] = [], bones: Bone[] = [root];
  for (const f of FINGERS) {
    const a = new Bone(); a.rotation.order = 'ZYX'; a.position.set(-side * f.x, f.y, -0.0004); a.rotation.z = side * f.fan; root.add(a);
    const b = new Bone(); b.position.y = f.l[0]; a.add(b);
    k1.push(a); k2.push(b); bones.push(a, b);
  }
  const k0 = new Bone(); k0.position.set(-side * THUMB.at[0], THUMB.at[1], THUMB.at[2]); k0.rotation.set(THUMB.turn[0], 0, side * THUMB.turn[2]); root.add(k0);
  const ta = new Bone(); ta.rotation.order = 'ZYX'; k0.add(ta);
  const tb = new Bone(); tb.position.y = THUMB.l[0]; ta.add(tb);
  k1.push(ta); k2.push(tb); bones.push(ta, tb, k0);
  root.updateMatrixWorld(true);
  const at = (o: Object3D, y = 0) => o.localToWorld(new Vector3(0, y, 0));
  const chains: Chain[] = [...FINGERS.map((f, j) => ({ a: at(k1[j]), b: at(k2[j]), c: at(k2[j], f.l[1]), r: f.r })),
    { a: at(ta), b: at(tb), c: at(tb, THUMB.l[1]), r: THUMB.r }];
  return { root, k1, k2, k0, bones, chains };
}
/** The glove's surface, skinned to gloveBones(side); made once for the left hand, the right one is its mirror. */
const gloveGeo = new Map<number, BufferGeometry>();
function gloveSurface(side: number): BufferGeometry {
  const have = gloveGeo.get(side);
  if (have) return have;
  let g: BufferGeometry;
  if (side < 0) {
    g = gloveSurface(1).clone();
    const P = g.attributes.position as BufferAttribute, N = g.attributes.normal as BufferAttribute, I = g.index!.array;
    for (let n = 0; n < P.count; n++) { P.setX(n, -P.getX(n)); N.setX(n, -N.getX(n)); }
    for (let n = 0; n < I.length; n += 3) { const t = I[n + 1]; I[n + 1] = I[n + 2]; I[n + 2] = t; }
  } else {
    const { bones, k1, k2, chains } = gloveBones(1);
    const RES = 72, HALF = 0.032, CY = 0.0055, mat = new MeshStandardMaterial();
    const mc = new MarchingCubes(RES, mat, false, false, 80000);
    mc.isolation = 0;
    for (let z = 0; z < RES; z++) for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
      const px = ((x - RES / 2) / (RES / 2)) * HALF, py = ((y - RES / 2) / (RES / 2)) * HALF + CY, pz = ((z - RES / 2) / (RES / 2)) * HALF;
      let f = Infinity;
      for (const c of chains) f = Math.min(f, capsule(px, py, pz, c.a, c.b, c.r, c.r * 0.98), capsule(px, py, pz, c.b, c.c, c.r * 0.98, c.r * 1.02));
      mc.field[x + y * RES + z * RES * RES] = -smin(palmSdf(px, py, pz), f, 0.0032) * 1000;
    }
    mc.update();
    const pos = mc.positionArray.slice(0, mc.count * 3);
    for (let n = 0; n < pos.length; n += 3) { pos[n] *= HALF; pos[n + 1] = pos[n + 1] * HALF + CY; pos[n + 2] *= HALF; }
    mc.geometry.dispose(); mat.dispose();
    g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3));
    g = mergeVertices(g, 1e-6);
    g.computeVertexNormals();
    // faces out: flip the winding if marching cubes gave them inward
    const P = g.attributes.position as BufferAttribute, N = g.attributes.normal as BufferAttribute;
    let out = 0;
    for (let n = 0; n < P.count; n += 7) out += N.getX(n) * P.getX(n) + N.getY(n) * (P.getY(n) - 0.003) + N.getZ(n) * P.getZ(n);
    if (out < 0) { const I = g.index!.array; for (let n = 0; n < I.length; n += 3) { const t = I[n + 1]; I[n + 1] = I[n + 2]; I[n + 2] = t; } g.computeVertexNormals(); }
    // skin: each vertex to the palm or the nearest finger, and along that finger to its first or second joint
    const si = new Uint16Array(P.count * 4), sw = new Float32Array(P.count * 4), ws = new Float32Array(bones.length);
    const order = [...ws.keys()], SIG = 0.0009, ds = new Float32Array(chains.length);
    for (let v = 0; v < P.count; v++) {
      const x = P.getX(v), y = P.getY(v), z = P.getZ(v);
      ws.fill(0);
      const dP = palmSdf(x, y, z);
      let m = dP;
      chains.forEach((c, j) => { ds[j] = Math.min(capsule(x, y, z, c.a, c.b, c.r, c.r), capsule(x, y, z, c.b, c.c, c.r, c.r)); m = Math.min(m, ds[j]); });
      ws[0] = Math.exp(-(dP - m) / SIG);
      chains.forEach((c, j) => {
        const w = Math.exp(-(ds[j] - m) / SIG);
        const dx = c.c.x - c.b.x, dy = c.c.y - c.b.y, dz = c.c.z - c.b.z;
        const along = ((x - c.b.x) * dx + (y - c.b.y) * dy + (z - c.b.z) * dz) / Math.hypot(dx, dy, dz);
        const t = Math.min(1, Math.max(0, (along + c.r * 0.55) / (c.r * 1.1))), s = t * t * (3 - 2 * t);
        ws[bones.indexOf(k1[j])] += w * (1 - s); ws[bones.indexOf(k2[j])] += w * s;
      });
      order.sort((p, q) => ws[q] - ws[p]);
      let sum = 0; for (let k = 0; k < 4; k++) sum += ws[order[k]];
      for (let k = 0; k < 4; k++) { si[v * 4 + k] = order[k]; sw[v * 4 + k] = ws[order[k]] / sum; }
    }
    g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
  }
  gloveGeo.set(side, g);
  return g;
}


// One mouth for every mood: half-width, how far it is open, smile (+) or frown (-), lopsidedness, how solid it is.
interface Mouth { w: number; open: number; curve: number; skew: number; fill: number }
const MOUTH: Record<PuntoState, Mouth> = {
  idle:   { w: 20, open: 0.00, curve: 0.25,  skew: 0,   fill: 0 },
  listen: { w: 12, open: 0.30, curve: 0.00,  skew: 0,   fill: 0 },
  think:  { w: 22, open: 0.00, curve: -0.50, skew: 0.5, fill: 0 },
  build:  { w: 26, open: 0.00, curve: 0.00,  skew: 0,   fill: 0 },
  happy:  { w: 36, open: 0.75, curve: 1.00,  skew: 0,   fill: 1 },
  talk:   { w: 27, open: 0.00, curve: 0.30,  skew: 0,   fill: 0 },
};

// A rounded rectangle as anchors; inset moves the outline inwards.
function outline(hw: number, hh: number, rc: number, inset: number, scale: number, n = 9): [number, number][] {
  const r = Math.max(rc - inset, 0.0015), ax = hw - inset - r, ay = hh - inset - r;
  const out: [number, number][] = [];
  for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, 0.5], [-1, -1, 1], [1, -1, 1.5]]) {
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (i / n) * 0.5) * Math.PI;
      out.push([(sx * ax + Math.cos(a) * r) * scale, (sy * ay + Math.sin(a) * r) * scale]);
    }
  }
  return out;
}

interface Station { inset: number; z: number; dx?: number; scale?: number }

// Skin stretched over outlines placed one after another from the screen's edge to the back.
function loft(hw: number, hh: number, rc: number, stations: Station[], backZ: number): BufferGeometry {
  const rings = stations.map((s) => outline(hw, hh, rc, s.inset, s.scale ?? 1)), P = rings[0].length;
  const pos: number[] = [], idx: number[] = [], uv: number[] = [];
  rings.forEach((ring, i) => ring.forEach(([x, y], j) => {
    pos.push(x + (stations[i].dx ?? 0), y, stations[i].z);
    uv.push((j / P) * 14, i * 0.55);
  }));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < P; j++) {
      const a = i * P + j, b = i * P + ((j + 1) % P), c = (i + 1) * P + ((j + 1) % P), d = (i + 1) * P + j;
      idx.push(a, c, b, a, d, c);
    }
  }
  const centre = pos.length / 3, last = (rings.length - 1) * P;
  pos.push(0, 0, backZ); uv.push(0, 0);
  for (let j = 0; j < P; j++) idx.push(centre, last + ((j + 1) % P), last + j);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** Builds Punto with Three.js only; no world, no systems. */
export function createPunto(): Punto {
  const object = new Group();   // put this into the scene
  const root = new Group();     // move this: Punto's place in the air
  const rig = new Group();      // turns, leans, bobs
  const cap = new Group();      // the keycap: it travels on the switch like a pressed key
  object.name = 'Punto';
  rig.rotation.order = 'YXZ';
  object.add(root); root.add(rig); rig.add(cap);

  const accent = new Color(STATES.idle.color), accentTo = new Color(STATES.idle.color);
  const tinted: SpriteMaterial[] = [];
  const glowMap = glowTexture();
  const glowSprite = (size: number, opacity: number) => {
    const m = new SpriteMaterial({ map: glowMap, color: accent, transparent: true, opacity, depthWrite: false });
    tinted.push(m);
    const s = new Sprite(m); s.scale.setScalar(size);
    s.raycast = () => {};                // a glow is decoration: a Sprite needs a camera to be ray-tested and throws without one
    return s;
  };

  // ---- shell: a soft cube that narrows to the back, with a sunken screen ----
  const HW = 0.056, HH = 0.052, RC = 0.026, ZF = 0.05, ZB = -0.064, RF = 0.006, RB = 0.03, SCREEN_IN = 0.0125, SCREEN_Z = ZF - 0.005, DX = 0.005;
  const stations: Station[] = [
    { inset: SCREEN_IN, z: SCREEN_Z, dx: DX }, { inset: SCREEN_IN - 0.0017, z: ZF - 0.0012, dx: DX }, { inset: SCREEN_IN - 0.0027, z: ZF - 0.0002, dx: DX },
    { inset: SCREEN_IN - 0.0037, z: ZF, dx: DX }, { inset: RF, z: ZF },
  ];
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; stations.push({ inset: RF * (1 - Math.sin(a)), z: ZF - RF * (1 - Math.cos(a)) }); }
  const sideFrom = ZF - RF, sideTo = ZB + RB, taper = (t: number) => 1 - 0.17 * Math.pow(t, 1.4);
  for (let i = 1; i <= 8; i++) { const t = i / 8; stations.push({ inset: 0, z: mix(sideFrom, sideTo, t), scale: taper(t) }); }
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; stations.push({ inset: RB * (1 - Math.cos(a)), z: sideTo - RB * Math.sin(a), scale: taper(1) }); }
  const grain = document.createElement('canvas'); grain.width = grain.height = 128;
  {
    const g = grain.getContext('2d')!, d = g.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = 110 + Math.random() * 90; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  const grainMap = new CanvasTexture(grain); grainMap.wrapS = grainMap.wrapT = RepeatWrapping;
  const plastic = new MeshPhysicalMaterial({ color: 0xbcb7ad, roughness: 0.72, bumpMap: grainMap, bumpScale: 0.8, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new Color(0xfff4e0) });
  cap.add(new Mesh(loft(HW, HH, RC, stations, ZB), plastic));

  // ---- screen: dark glass that bulges a little; the face is drawn on a canvas ----
  const CW = 512, CH = 464;
  const faceCanvas = document.createElement('canvas'); faceCanvas.width = CW; faceCanvas.height = CH;
  const ctx = faceCanvas.getContext('2d')!;
  const faceMap = new CanvasTexture(faceCanvas); faceMap.colorSpace = SRGBColorSpace; faceMap.anisotropy = 4;
  const SW = HW - SCREEN_IN, SH = HH - SCREEN_IN;
  {
    const edge = outline(HW, HH, RC, SCREEN_IN, 1), P = edge.length, RINGS = 6;
    const pos = [DX, 0, SCREEN_Z + 0.0036], uv = [0.5, 0.5], idx: number[] = [];
    for (let r = 1; r <= RINGS; r++) {
      const f = r / RINGS;
      for (const [x, y] of edge) { pos.push(x * f + DX, y * f, SCREEN_Z + 0.0036 * (1 - f * f)); uv.push((x * f) / (2 * SW) + 0.5, (y * f) / (2 * SH) + 0.5); }
    }
    for (let j = 0; j < P; j++) idx.push(0, 1 + j, 1 + ((j + 1) % P));
    for (let r = 1; r < RINGS; r++) for (let j = 0; j < P; j++) {
      const a = 1 + (r - 1) * P + j, b = 1 + r * P + j, c = 1 + r * P + ((j + 1) % P), d = 1 + (r - 1) * P + ((j + 1) % P);
      idx.push(a, b, c, a, c, d);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    const nor: number[] = [], n = new Vector3();
    for (let i = 0; i < pos.length; i += 3) { n.set((pos[i] - DX) * 8, pos[i + 1] * 8, 1).normalize(); nor.push(n.x, n.y, n.z); }
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    cap.add(new Mesh(g, new MeshPhysicalMaterial({
      color: 0x08090b, roughness: 0.5, specularIntensity: 0.12, envMapIntensity: 0.25,
      emissive: 0xffffff, emissiveMap: faceMap, emissiveIntensity: 1.7,
    })));
  }

  // ---- the light (the power button's ⏻, below) and vents at the back ----
  const lampMat = new MeshStandardMaterial({ color: 0x1a1a1a, emissive: accent, emissiveIntensity: 2, roughness: 0.35 });
  const dark = new MeshStandardMaterial({ color: 0x35322e, roughness: 0.8 });
  // (the lamp that sat over the power button is gone: the button's ⏻ is the light now)
  // ---- power button: in the wide bezel column left of the screen, low, like a monitor's ----
  // The cap is the shell's plastic, the ring is the vents' dark, the ⏻ is Punto's light: mood colour, pulse.
  const power = new Group(); power.name = 'PuntoPower';
  const powerCap = new Group();
  {
    const PX = -0.0458, PY = -0.024, R = 0.0048;
    power.position.set(PX, PY, ZF);
    const ring = new Mesh(new TorusGeometry(R + 0.0004, 0.0007, 8, 32), dark);
    const body = new Mesh(new CylinderGeometry(R, R + 0.0003, 0.0022, 32), plastic);
    body.rotation.x = Math.PI / 2; body.position.z = 0.0011;
    const GAP = 1.1;  // the opening at the top of the ⏻
    const arc = new Mesh(new TorusGeometry(0.0022, 0.0006, 8, 28, Math.PI * 2 - GAP), lampMat);
    arc.rotation.z = Math.PI / 2 + GAP / 2; arc.position.z = 0.0026;
    const bar = new Mesh(new BoxGeometry(0.0012, 0.0028, 0.0008), lampMat);
    bar.position.set(0, 0.0019, 0.0026);
    powerCap.add(body, arc, bar);
    power.add(ring, powerCap);
    cap.add(power);
  }
  let powerDip = 0, powerV = 0;
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const slot = new Mesh(new BoxGeometry(0.003, 0.0028, 0.02), dark);
      slot.position.set(side * 0.0482, 0.022 - i * 0.008, -0.022); slot.rotation.y = side * 0.15;
      cap.add(slot);
    }
  }

  // ---- the key switch under the keycap ----
  const grey = (hex: number, rough = 0.5) => new MeshStandardMaterial({ color: hex, roughness: rough });
  const box = (parent: Object3D, mat: MeshStandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
  };
  const stemMat = grey(0x8a5a3c);   // a brown switch, of course
  box(cap, stemMat, 0.014, 0.012, 0.0045, 0, -0.057, 0);
  box(cap, stemMat, 0.0045, 0.012, 0.014, 0, -0.057, 0);
  const sw = new Group(); rig.add(sw);
  const upper = grey(0x9b9c9d, 0.45), lower = grey(0x5d6064, 0.55);
  box(sw, upper, 0.05, 0.012, 0.05, 0, -0.066, 0);
  box(sw, grey(0xb9b9b8, 0.4), 0.06, 0.0022, 0.06, 0, -0.0728, 0);
  box(sw, lower, 0.054, 0.012, 0.054, 0, -0.0795, 0);
  for (const x of [-0.013, 0.013]) box(sw, dark, 0.011, 0.007, 0.002, x, -0.0655, 0.0252);
  const post = new Mesh(new CylinderGeometry(0.009, 0.0075, 0.009, 24), lower); post.position.y = -0.09; sw.add(post);
  const gold = new MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.3 });
  for (const [x, z] of [[-0.017, 0.006], [0.011, -0.013]]) {
    const pin = new Mesh(new CylinderGeometry(0.0012, 0.0012, 0.012, 8), gold); pin.position.set(x, -0.0915, z); sw.add(pin);
  }
  sw.scale.set(0.84, 1, 0.84);

  // ---- white gloves ----
  const white = new MeshPhysicalMaterial({ color: 0xf6f5f2, roughness: 0.5, sheen: 0.5, sheenColor: new Color(0xffffff) });
  const SIDES = [1, -1];
  /** Each hand's joints: first and second for index, middle, outer, then the thumb; k0 turns the thumb out. */
  const joints: { k1: Bone[]; k2: Bone[]; k0: Bone }[] = [];
  const hands = SIDES.map((side) => {
    const hand = new Group(); hand.name = side > 0 ? 'PuntoHandLeft' : 'PuntoHandRight';   // Punto's own left is +X
    const rig = gloveBones(side);
    const skin = new SkinnedMesh(gloveSurface(side), white);
    skin.scale.setScalar(GLOVE_SCALE);
    skin.raycast = () => {};    // a ray test of a skinned body each frame is dear: the pinch is for Punto itself
    skin.add(rig.root); hand.add(skin);
    hand.updateMatrixWorld(true);
    skin.bind(new Skeleton(rig.bones));
    joints.push({ k1: rig.k1, k2: rig.k2, k0: rig.k0 });
    hand.position.set(side * REST.p[0], REST.p[1], REST.p[2]);
    root.add(hand);
    return hand;
  });
  // finger taps (one key press each: index, middle, outer, thumb), seconds since; how far each hand's fingers curl
  // when it holds something (grip()), and the last finger that pressed
  const tapT = [new Float32Array(4).fill(9), new Float32Array(4).fill(9)];
  const gripCurl = [0.5, 0.5], lastTap = [0, 1], TAP = 0.13, PICK = [0, 0, 1, 1, 2];
  const tapFinger = (i: number, f?: number) => {
    let n = f ?? -1;
    if (n < 0) { do n = PICK[Math.floor(Math.random() * PICK.length)]; while (n === lastTap[i]); }
    lastTap[i] = n; tapT[i][n] = 0;
  };

  // ---- building: he works at his little keyboard (Yury, 15.11: the title's keyboard, src/keyboard.ts, instead of the
  // little cubes that clicked together in the air). It sits under his hands in the build pose; each finger tap of the
  // typing presses a key on that hand's side, which goes down and lights up ----
  const PALETTE = [0x2ec4b6, 0xff9f1c, 0xe84855, 0x5c6b73, 0xfdf0d5].map((h) => new Color(h));
  const kit = puntoKeyboard();
  const kbKeys = [...kit.keys.values()];
  const kbSide = [kbKeys.filter((key) => key.x >= 0), kbKeys.filter((key) => key.x < 0)]; // hand 0 is on his +X side
  const kbPressed = new Map<Key, number>(kbKeys.map((key) => [key, -9]));
  kit.group.scale.setScalar(0.001);
  kit.group.visible = false;
  rig.add(kit.group);
  const STEP = 0.16, CYCLE = 22 * STEP + 1.4; // the face's progress bar: its old pace (22 cubes)

  // ---- pixels: while it builds, a stream flies from both hands into the little cubes ----
  const N = 160;
  const pPos = new Float32Array(N * 3), pCol = new Float32Array(N * 3), pSize = new Float32Array(N), pAlpha = new Float32Array(N);
  const pVel = new Float32Array(N * 3), pLife = new Float32Array(N), pMax = new Float32Array(N);
  const pGeo = new BufferGeometry();
  pGeo.setAttribute('position', new BufferAttribute(pPos, 3));
  pGeo.setAttribute('aColor', new BufferAttribute(pCol, 3));
  pGeo.setAttribute('aSize', new BufferAttribute(pSize, 1));
  pGeo.setAttribute('aAlpha', new BufferAttribute(pAlpha, 1));
  const pMat = new ShaderMaterial({
    uniforms: { uPx: { value: 900 } }, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uPx;
      varying float vA; varying vec3 vC;
      void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPx / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vC;
      void main(){ vec2 q = abs(gl_PointCoord - 0.5) * 2.0; float m = max(q.x, q.y);
        gl_FragColor = vec4(vC, (m > 0.62 ? 1.0 : 0.22) * step(m, 0.98) * vA); }`,
  });
  const points = new Points(pGeo, pMat);
  points.frustumCulled = false;
  points.raycast = () => {};              // decoration: the pinch is for Punto itself
  object.add(points);
  let pNext = 0;
  const spawn = (p: Vector3, vx: number, vy: number, vz: number, c: Color, size: number, life: number) => {
    const i = pNext, j = i * 3; pNext = (pNext + 1) % N;
    pPos[j] = p.x; pPos[j + 1] = p.y; pPos[j + 2] = p.z;
    pVel[j] = vx; pVel[j + 1] = vy; pVel[j + 2] = vz;
    pCol[j] = c.r; pCol[j + 1] = c.g; pCol[j + 2] = c.b;
    pSize[i] = size; pLife[i] = pMax[i] = life;
  };


  // ---- the face ----
  const dots = document.createElement('canvas'); dots.width = dots.height = 6;
  { const d = dots.getContext('2d')!; d.fillStyle = 'rgba(0,0,0,0.3)'; d.fillRect(0, 4, 6, 2); d.fillRect(4, 0, 2, 6); }
  const grid = ctx.createPattern(dots, 'repeat')!;
  const F = { ...STATES.idle.face, lid: 0, raise: [0, 0] as [number, number], tilt: [0, 0] as [number, number] };
  const FACE_COLOR = 0x62e9f2, GLAD_COLOR = 0x4dff8f, faceCol = new Color(FACE_COLOR), faceTo = new Color(FACE_COLOR);
  let faceMode: PuntoState = 'idle';
  const Mo: Mouth = { ...MOUTH.idle };
  let progress = 0;
  // ---- the code it is writing: typed on the screen behind the face ----
  const COLS = 50, ROWS = 21, LINE = 17.5;
  const WORD = /(\/\/.*$|'[^']*'|"[^"]*"|`[^`]*`|\b(?:const|let|function|import|from|return|new|if|else|for|class|export|await|async)\b)/g;
  const SAMPLE = `import { Mesh, SphereGeometry, Vector3 } from '@iwsdk/core';
import { holdInHand } from '../hand.js';
import { openPortals } from '../outside.js';
import { feature } from '../live.js';

// monsters crawl out of the walls
feature(import.meta, (world) => {
  const score = { value: 0 };
  const monsters = [];
  const aim = new Vector3();

  openPortals(world, [{ wall: 'front', color: 0x7a3cff }], (portal) => {
    for (let i = 0; i < 6; i++) {
      const body = new Mesh(new SphereGeometry(0.12, 24, 16), skin);
      body.position.copy(portal.centre);
      monsters.push(world.createTransformEntity(body));
    }
  });

  holdInHand(world, pistol, {
    side: 'right',
    aimed: true,
    onUse: () => {
      const hit = monsters.find((m) => aim.distanceTo(m.object3D.position) < 0.15);
      if (hit) { hit.dispose(); score.value += 10; }
    },
  });
});

import.meta.hot?.accept();
`;

  let codeLines: string[] = [], codeStart: number[] = [], codePos = 0, codeOwn = true, codeLength = 0;
  function loadCode(text: string) {
    codeLines = []; codeStart = []; codeLength = 0;
    for (const raw of text.split('\n')) {
      for (let at = 0; at === 0 || at < raw.length; at += COLS) {      // long lines wrap
        codeLines.push(raw.slice(at, at + COLS)); codeStart.push(codeLength); codeLength += Math.min(COLS, raw.length - at) + 1;
      }
    }
  }
  loadCode(SAMPLE);
  function drawCode(t: number, css: string, strong: string) {
    let last = 0;
    while (last + 1 < codeLines.length && codeStart[last + 1] <= codePos) last++;
    ctx.font = '14px ui-monospace, Menlo, Consolas, monospace'; ctx.textBaseline = 'top'; ctx.shadowBlur = 0;
    const step = ctx.measureText('M').width, first = Math.max(0, last - ROWS + 1);
    for (let n = first; n <= last; n++) {
      const text = n === last ? codeLines[n].slice(0, Math.max(0, Math.floor(codePos) - codeStart[n])) : codeLines[n];
      const y = 34 + (n - first) * LINE;
      let x = 36;
      for (const piece of text.split(WORD)) {
        if (!piece) continue;
        const kind = piece.startsWith('//') ? 0 : /^['"`]/.test(piece) ? 2 : WORD.test(piece) ? 1 : 3;
        WORD.lastIndex = 0;
        ctx.globalAlpha = W.build * [0.22, 0.75, 0.6, 0.42][kind];
        ctx.fillStyle = kind === 2 ? strong : kind === 1 ? '#ffffff' : css;
        ctx.fillText(piece, x, y); x += piece.length * step;
      }
      if (n === last && t % 0.5 < 0.3) { ctx.globalAlpha = W.build * 0.8; ctx.fillStyle = css; ctx.fillRect(x + 1, y, step, 15); }
    }
    ctx.globalAlpha = 1;
  }

  function drawFace(t: number, open: number, gx: number, gy: number, voice: number) {
    const css = `#${faceCol.getHexString()}`;
    const bg = `rgb(${Math.round(8 + faceCol.r * 10)},${Math.round(10 + faceCol.g * 12)},${Math.round(12 + faceCol.b * 14)})`;
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
    if (W.build > 0.02) {
      drawCode(t, css, `#${accent.getHexString()}`);
      // the code fades out behind the face, so the eyes stay easy to read
      const shade = ctx.createRadialGradient(CW / 2, 228, 40, CW / 2, 228, 215);
      shade.addColorStop(0, bg); shade.addColorStop(0.55, bg); shade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = W.build * 0.9; ctx.fillStyle = shade; ctx.fillRect(0, 0, CW, CH); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = css; ctx.shadowBlur = 14; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(CW / 2, 215); ctx.scale(1.4, 1.4); ctx.translate(-CW / 2, -205);
    const cy = 205 - gy * 12;
    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      const cx = CW / 2 + side * 78 + gx * 13;
      if (o.eyes === 'squeeze') {          // > <  : tickled
        ctx.lineWidth = 17; ctx.beginPath();
        ctx.moveTo(cx + side * 27, cy - 30); ctx.lineTo(cx - side * 23, cy); ctx.lineTo(cx + side * 27, cy + 30); ctx.stroke();
      } else if (faceMode === 'happy') {   // ^ ^
        ctx.lineWidth = 19; ctx.beginPath(); ctx.arc(cx, cy + 20, 38, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      } else {
        const h = F.h * Math.max(open, 0.1);
        ctx.beginPath(); ctx.roundRect(cx - F.w / 2, cy - h / 2, F.w, h, Math.min(F.w, h) * 0.46); ctx.fill();
        if (F.pupil > 0.02 && open > 0.5) {
          ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = bg;
          ctx.beginPath(); ctx.arc(cx + gx * 13, cy - gy * 14, F.w * 0.25 * F.pupil, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        if (F.lid > 0.02) {                // a slanted lid: it concentrates
          const topY = cy - h / 2, inner = cx - side * (F.w / 2 + 8), outer = cx + side * (F.w / 2 + 8);
          ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = bg; ctx.beginPath();
          ctx.moveTo(inner, topY - 10); ctx.lineTo(outer, topY - 10); ctx.lineTo(outer, topY + h * 0.14 * F.lid); ctx.lineTo(inner, topY + h * 0.5 * F.lid);
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
      if (api.joy) {                       // dotted cheeks under the eyes, no brows
        const bx = cx + side * 26, byc = cy + 62;
        for (let d = 0; d < 6; d++) { const a = (d / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * 13, byc + Math.sin(a) * 10, 4.5, 0, Math.PI * 2); ctx.fill(); }
        continue;
      }
      // brow: the inner end drops when it concentrates
      const by = cy - 70 - F.raise[i] * 14, tilt = F.tilt[i] * 13;
      ctx.lineWidth = 13; ctx.beginPath();
      ctx.moveTo(cx - side * 30, by + tilt); ctx.quadraticCurveTo(cx, by - 12, cx + side * 30, by - tilt); ctx.stroke();
    }
    const mx = CW / 2 + gx * 10, my = 300 - gy * 8;
    const corner = my - Mo.curve * 7, middle = my + Mo.curve * 9;
    ctx.beginPath();
    const left = corner + Mo.skew * 8, right = corner - Mo.skew * 6, gape = clamp(Mo.open, 0, 1.2);
    const top = middle - gape * 10, bottom = middle + gape * 52, jaw = Mo.w * mix(0.45, 1, Math.min(gape * 2, 1));
    ctx.moveTo(mx - Mo.w, left);
    ctx.bezierCurveTo(mx - Mo.w * 0.45, top, mx + Mo.w * 0.45, top, mx + Mo.w, right);
    ctx.bezierCurveTo(mx + jaw, bottom, mx - jaw, bottom, mx - Mo.w, left);
    ctx.closePath();
    if (Mo.fill > 0.02) { ctx.globalAlpha = Mo.fill; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.lineWidth = 10; ctx.stroke();
    if (W.build > 0.05) {                  // the tip of the tongue sticks out: it is enjoying the work
      ctx.globalAlpha = W.build; ctx.beginPath(); ctx.arc(mx + Mo.w * 0.5, middle + 2, 9, 0, Math.PI); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (o.zzz > 0.02) {                    // asleep
      ctx.lineWidth = 6;
      for (let n = 0; n < 3; n++) {
        const ph = (t * 0.45 + n / 3) % 1, x = 372 + ph * 50, y = 132 - ph * 80, z = 10 + ph * 16;
        ctx.globalAlpha = o.zzz * Math.sin(ph * Math.PI);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + z, y); ctx.lineTo(x, y + z); ctx.lineTo(x + z, y + z); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // the bottom line of the screen says what is going on
    ctx.shadowBlur = 12;
    if (faceMode === 'idle') {             // a prompt with a blinking cursor
      ctx.globalAlpha = 0.85; ctx.lineWidth = 7; ctx.beginPath();
      ctx.moveTo(58, 46); ctx.lineTo(74, 58); ctx.lineTo(58, 70); ctx.stroke();
      if (t % 1.1 < 0.6) ctx.fillRect(88, 44, 16, 28);
    } else if (faceMode === 'listen') {    // the voice
      for (let b = -5; b <= 5; b++) {
        const h = 6 + 38 * voice * Math.abs(Math.sin(t * 11 + b * 1.7)) * (1 - Math.abs(b) / 8);
        ctx.fillRect(CW / 2 + b * 24 - 7, 426 - h / 2, 14, h);
      }
    } else if (faceMode === 'think') {     // ...
      for (let b = -1; b <= 1; b++) {
        ctx.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * 5 - b * 1.1));
        ctx.beginPath(); ctx.arc(CW / 2 + b * 30, 426, 8, 0, Math.PI * 2); ctx.fill();
      }
    } else if (faceMode === 'build') {     // how far the work has got
      ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(CW / 2 - 150, 415, 300, 22, 11); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(CW / 2 - 144, 421, 288 * clamp(progress, 0.04, 1), 10, 5); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.fillStyle = grid; ctx.fillRect(0, 0, CW, CH);
    faceMap.needsUpdate = true;
  }

  // ---- life ----
  let state: PuntoState = 'idle', stateT = 0, blinkT = 1, nextBlink = 2, keyY = 0, keyV = 0, buildT = 0;
  let faceClock = 1;                       // the face is redrawn ~30 times a second, not every frame
  const W: Record<PuntoState, number> = { idle: 1, listen: 0, think: 0, build: 0, happy: 0, talk: 0 };
  let voiceLevel: number | null = null, said = 0, saidTo = 0, wide = 1, wideTo = 1, syllable = 0, syllables = 3;
  const prev = new Vector3(), vel = new Vector3(), velS = new Vector3(), tmp = new Vector3(), spot = new Vector3();
  const qTo = new Quaternion(), qHand = new Quaternion(), qAct = new Quaternion(), euler = new Euler(), UP = new Vector3(0, 1, 0);
  const blendLean = (axis: number) => { let s = 0; for (const n of NAMES) s += W[n] * STATES[n].lean[axis]; return s; };
  const blendHand = (i: number, axis: number) => { let s = 0; for (const n of NAMES) s += W[n] * STATES[n].hands[i].p[axis]; return s; };

  // Springs: nothing alive stops dead, it overshoots a little and settles.
  interface Spring { x: number; v: number }
  const springTo = (s: Spring, to: number, stiff: number, damp: number, dt: number) => { s.v += ((to - s.x) * stiff - s.v * damp) * dt; s.x += s.v * dt; return s.x; };
  const sq: Spring = { x: 0, v: 0 }, leanX: Spring = { x: 0, v: 0 }, leanZ: Spring = { x: 0, v: 0 };
  const yawS: Spring = { x: 0, v: 0 }, pitchS: Spring = { x: 0, v: 0 }, appear: Spring = { x: 1, v: 0 };
  const handV = [new Vector3(), new Vector3()];
  // holding on to something (grip): the world point each hand holds, how it is turned, how far it has got there
  const gripAt: [Vector3 | null, Vector3 | null] = [null, null];
  const gripR: [number, number, number][] = [[0, 0, 0], [0, 0, 0]];
  const gripW = [0, 0], gripTmp = new Vector3();
  const gripTW: [{ q: Quaternion; w: number } | null, { q: Quaternion; w: number } | null] = [null, null];
  const qWorld = new Quaternion();
  let sound: (name: PuntoSound) => void = () => {};
  let landed = true, startleT = 0, eyeX = 0, eyeY = 0, jitX = 0, jitY = 0, nextJit = 0.5, noticeT = 0;
  const noticeAt = new Vector3();
  // A key press: the cap dips on its switch, the body squashes, the switch clicks.
  const press = (force = 0.16, name: PuntoSound = 'key') => { keyV = -force; sq.v -= force * 7; sound(name); };
  const startle = () => { press(0.2, 'wake'); sq.v += 4.2; blinkT = 0; startleT = 0.45; };

  // Attention: where the eyes want to be, as an offset from the player (radians). It jumps, it does not glide.
  const gaze = { kind: 'player' as 'player' | 'away' | 'work' | 'hand', x: 0, y: 0, hold: 1.5 };
  const look = (kind: typeof gaze.kind, x: number, y: number, hold: number) => {
    if (Math.abs(x - gaze.x) > 0.4 && Math.random() < 0.6) blinkT = 0;   // eyes blink on a big jump
    gaze.kind = kind; gaze.x = x; gaze.y = y; gaze.hold = hold;
  };
  function attend(dt: number) {
    gaze.hold -= dt;
    if (gaze.hold > 0) return;
    const r = Math.random(), side = Math.random() < 0.5 ? -1 : 1;
    if (state === 'think') look('away', side * (0.35 + Math.random() * 0.35), 0.55 + Math.random() * 0.3, 0.6 + Math.random() * 1.2);
    else if (state === 'build') { if (gaze.kind === 'work' && r < 0.35) look('player', 0, 0, 0.5 + Math.random() * 0.6); else look('work', 0.3, -0.6, 1.5 + Math.random() * 2.5); }
    else if (state === 'listen' || state === 'happy') look('player', 0, 0, 1);
    // calm (Yury, 15.11: «голова поворачивается» all the time): mostly on the player, long; now and then a small glance
    else if (gaze.kind !== 'player' || r < 0.75) look('player', 0, 0, (state === 'talk' ? 3 : 4) + Math.random() * 6);
    else if (r < 0.93) look('away', side * (0.2 + Math.random() * 0.2), (Math.random() - 0.35) * 0.25, 0.8 + Math.random() * 0.8);
    else look('hand', side * 0.3, -0.4, 0.8 + Math.random() * 0.6);
  }

  // Little numbers it performs when nobody asks anything. Each one only fills in `o` for the
  // current frame, through the reusable mouth and hand poses below (nothing new each frame).
  interface HandPose { p: [number, number, number]; r: [number, number, number]; w: number; point: number }
  const oMouth: Mouth = { w: 0, open: 0, curve: 0, skew: 0, fill: 0 };
  const oHands: [HandPose, HandPose] = [{ p: [0, 0, 0], r: [0, 0, 0], w: 0, point: 0 }, { p: [0, 0, 0], r: [0, 0, 0], w: 0, point: 0 }];
  const o = {
    gx: 0, gy: 0, gw: 0, lean: [0, 0], dy: 0, eye: 1, eyes: null as 'squeeze' | null, brow: 0,
    mouth: null as Mouth | null, zzz: 0, stretch: 0, hands: [null, null] as [HandPose | null, HandPose | null],
  };
  const mouth = (w: number, open: number, curve: number, skew = 0) => { oMouth.w = w; oMouth.open = open; oMouth.curve = curve; oMouth.skew = skew; oMouth.fill = 0; o.mouth = oMouth; };
  const hand = (i: number, px: number, py: number, pz: number, rx: number, ry: number, rz: number, w: number) => {
    const h = oHands[i]; h.p[0] = px; h.p[1] = py; h.p[2] = pz; h.r[0] = rx; h.r[1] = ry; h.r[2] = rz; h.w = w; h.point = 0; o.hands[i] = h;
  };
  const bump = (u: number, a = 0.15, b = 0.2) => sstep(0, a, u) * sstep(1, 1 - b, u);
  type Act = 'look' | 'tap' | 'peek' | 'doze' | 'yawn' | 'wave' | 'scratch' | 'poked' | 'showPower' | 'showWay' | 'strain' | 'reach' | 'fetch';
  let act: Act | null = null, actT = 0, nextAct = 12, lastAct: Act | '' = '', tapBeat = 0, woke = false;
  const ACTS: Record<Act, { dur: number; run: (u: number) => void }> = {
    look: { dur: 2.2, run(u) { o.gw = bump(u); o.gx = u < 0.48 ? -1 : 1; o.gy = 0.1; o.brow = 0.4 * o.gw; } },
    tap: { dur: 2.4, run(u) {              // drums its fingers on its own head
      const w = bump(u, 0.2, 0.2), beat = Math.floor(u * 7);
      hand(0, 0.03, 0.07 + Math.abs(Math.sin(u * Math.PI * 7)) * 0.012, 0.012, 0.5, 0, 3.0, w);
      if (beat !== tapBeat && beat > 0 && beat < 6) press(0.05, 'tap');
      tapBeat = beat;
      o.gw = w; o.gx = 0.35; o.gy = 0.9; mouth(16, 0, -0.15);
    } },
    peek: { dur: 2.6, run(u) {             // what is that under me?
      const w = bump(u, 0.3, 0.25);
      o.lean[0] = 0.7 * w; o.dy = 0.012 * w; o.gw = w; o.gy = -1; o.brow = 0.5 * w;
      hand(0, 0.105, -0.01, 0.03, 0, 0, 2.5, w); hand(1, 0.105, -0.01, 0.03, 0, 0, 2.5, w);
    } },
    doze: { dur: 7.5, run(u) {             // nods off, then wakes with a start and pretends it did not
      if (u < 0.74) {
        const s = sstep(0, 1, u / 0.74);
        o.eye = 1 - 0.82 * s; o.dy = -0.016 * s + Math.sin(u * 46) * 0.0015 * s; o.lean[0] = 0.24 * s; o.lean[1] = 0.12 * s;
        mouth(9, 0.22 * s, 0); o.zzz = sstep(0.35, 0.6, u / 0.74);
      } else {
        if (!woke) { woke = true; startle(); }
        const w = sstep(1, 0.86, u);
        o.brow = w; o.gw = w; o.gx = Math.sin(u * 70) > 0 ? 0.8 : -0.8;
        mouth(14, 0.3 * w, 0);
      }
    } },
    yawn: { dur: 2.8, run(u) {
      const w = bump(u, 0.3, 0.3);
      o.eye = 1 - 0.92 * w; mouth(18, 1.05 * w, 0); o.lean[0] = -0.22 * w; o.stretch = 0.1 * w;
      hand(0, 0.105, 0.055, -0.005, 0, 0, -0.8, w); hand(1, 0.105, 0.055, -0.005, 0, 0, -0.8, w);
    } },
    wave: { dur: 1.9, run(u) {
      const w = bump(u, 0.2, 0.25);
      hand(0, 0.098, 0.052, 0.02, 0, 0, -0.35 + Math.sin(u * Math.PI * 8) * 0.5, w);
      mouth(28, 0.3 * w, 1); o.brow = 0.5 * w; o.lean[1] = -0.1 * w;
    } },
    scratch: { dur: 3.0, run(u) {         // scratches the top of its head: the hand comes up round the side, unhurried
      const w = bump(u, 0.2, 0.2);
      hand(1, 0.052 + Math.sin(u * 55) * 0.004, 0.064, 0, 0.3, 0, 2.7, w);
      o.gw = w; o.gx = -0.6; o.gy = 0.7; o.brow = 0.3 * w; mouth(18, 0, -0.3, 0.6);
    } },
    showPower: { dur: 3.2, run(u) {        // "press me right here": the right hand comes up beside the bezel and points
      const w = bump(u, 0.12, 0.18);         // the index finger in at the power button, thumb up; two little jabs; it glances there
      const jab = u > 0.3 && u < 0.63 ? Math.max(0, Math.sin((u - 0.3) * Math.PI * 6)) * 0.006 : 0;
      hand(1, 0.074 - jab, -0.024, 0.06, Math.PI, 0, Math.PI / 2, w);   // fingers along -X (mirrored: in at the button)
      oHands[1].point = 1;
      o.gw = w; o.gx = -0.7; o.gy = -0.45; mouth(24, 0.25 * w, 0.9);
    } },
    showWay: { dur: 2.6, run(u) {          // "let's go in!": the left hand, raised by the head, points at the bubble over it
      const w = bump(u, 0.1, 0.2);
      hand(0, 0.07, 0.075, 0.045, -2.892, 0.268, 1.868, w);   // fingers at the bubble's button, thumb up
      o.gw = w; o.gx = 0.15; o.gy = 0.8; o.brow = 0.5 * w; mouth(26, 0.35 * w, 0.9);
    } },
    strain: { dur: 1.6, run(u) {           // stuck in a hole: eyes shut tight, palms pressed to the wall either side, shoving
      const w = bump(u, 0.1, 0.15), shove = Math.abs(Math.sin(u * Math.PI * 4)) * 0.01;
      o.eyes = 'squeeze'; mouth(24, 0.15 + Math.abs(Math.sin(u * 31)) * 0.12, -0.75, Math.sin(u * 17) * 0.5);
      hand(0, 0.122, 0.006, 0.07 - shove, -0.5, 0, -0.25, w); hand(1, 0.122, 0.006, 0.07 - shove, -0.5, 0, -0.25, w);
      o.lean[1] = Math.sin(u * 40) * 0.06 * w; o.dy = Math.sin(u * 55) * 0.002;
    } },
    reach: { dur: 2.4, run(u) {            // "help!": one hand out in front, through the hole, waving
      const w = bump(u, 0.15, 0.2);
      hand(1, 0.02, 0.025, 0.105, 0, 0, -0.35 + Math.sin(u * Math.PI * 9) * 0.55, w);
      mouth(22, 0.7 * w, -0.35); o.brow = 0.7 * w;
    } },
    fetch: { dur: 0.45, run(u) {           // reaches behind its back for something: both hands round the back, a glance over the shoulder
      const w = bump(u, 0.25, 0.1);
      hand(0, 0.1, 0.0, -0.075, 0.4, 0, -0.9, w); hand(1, 0.1, 0.0, -0.075, 0.4, 0, -0.9, w);
      o.gw = w; o.gx = 0.9; o.gy = 0.2; o.brow = 0.4 * w; mouth(20, 0, 0.4, 0.5); o.lean[1] = 0.08 * w;
    } },
    poked: { dur: 0.9, run(u) {            // touched: it is ticklish
      const w = bump(u, 0.1, 0.3);
      o.eyes = u < 0.65 ? 'squeeze' : null; mouth(28, 0.45 * w, 1);
      hand(0, 0.098, 0.02, 0.035, 0, 0, -0.7, w); hand(1, 0.098, 0.02, 0.035, 0, 0, -0.7, w);
      o.lean[1] = Math.sin(u * 28) * 0.16 * (1 - u);
    } },
  };
  const BORED: Act[] = ['look', 'tap', 'peek', 'doze', 'yawn', 'scratch', 'wave'];
  const startAct = (name: Act) => { act = name; actT = 0; tapBeat = 0; woke = false; lastAct = name; };

  function setState(next: PuntoState) {
    if (!STATES[next] || next === state) return;
    const dozing = act === 'doze' && !woke;
    act = null; nextAct = 10 + Math.random() * 6; gaze.hold = 0;
    state = next; stateT = 0; blinkT = 0; accentTo.set(STATES[next].color);
    // every change of mind is a key press; a soft one, but for listening and joy (Yury, 15.11: «навязчиво прыгает»)
    if (dozing) startle(); else press(next === 'listen' || next === 'happy' ? 0.16 : 0.05);
    if (next === 'listen') startleT = 0.35;
    if (next === 'build') { buildT = 0; if (codeOwn) codePos = 0; }
    if (next === 'happy') { landed = false; sq.v -= 2.2; sound('glad'); }   // crouch, then jump
  }

  function update(dt: number, t: number, lookAt?: Vector3) {
    dt = Math.min(dt, 0.05);
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    vel.copy(root.position).sub(prev).divideScalar(Math.max(dt, 1e-4)); prev.copy(root.position);
    velS.lerp(vel, k(6));
    for (const n of NAMES) W[n] += ((n === state ? 1 : 0) - W[n]) * k(7);
    accent.lerp(accentTo, k(6));
    for (const m of tinted) m.color.copy(accent);
    lampMat.emissive.copy(accent);
    stateT += dt;
    const voice = 0.25 + 0.75 * Math.abs(Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1.3));   // stands in for the microphone

    // what it does on its own
    o.gx = o.gy = o.gw = o.dy = o.brow = o.zzz = o.stretch = 0; o.lean[0] = o.lean[1] = 0; o.eye = 1; o.eyes = null; o.mouth = null; o.hands[0] = o.hands[1] = null;
    if (act) {
      actT += dt;
      if (actT >= ACTS[act].dur) { act = null; nextAct = 12 + Math.random() * 12; } else ACTS[act].run(actT / ACTS[act].dur);
    } else if (state === 'idle' && !api.joy) {
      nextAct -= dt;
      if (nextAct <= 0) { let pick: Act; do { pick = BORED[Math.floor(Math.random() * BORED.length)]; } while (pick === lastAct); startAct(pick); }
    }
    if (api.joy) { o.eyes = 'squeeze'; mouth(26, 0.05, 1.3); }
    startleT = Math.max(0, startleT - dt);
    const wideEyes = clamp(startleT / 0.15, 0, 1);

    // attention: the eyes jump to the new spot at once, the head follows and takes part of the turn
    attend(dt);
    nextJit -= dt;
    if (nextJit < 0) { nextJit = 0.25 + Math.random() * 0.9; jitX = (Math.random() - 0.5) * 0.16; jitY = (Math.random() - 0.5) * 0.1; }
    noticeT = Math.max(0, noticeT - dt);
    const seen = noticeT > 0 ? noticeAt : lookAt;
    let baseYaw = 0, basePitch = 0;
    if (seen) {
      tmp.copy(seen).sub(root.position);
      baseYaw = clamp(Math.atan2(tmp.x, tmp.z), -0.75, 0.75);
      basePitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.4, 0.4);
    }
    const lookX = mix(gaze.x, o.gx * 0.7, o.gw), lookY = mix(gaze.y, o.gy * 0.6, o.gw), share = gaze.kind === 'player' ? 1 : 0.5;
    // the head follows without overshooting (critically damped: 2·√24 ≈ 9.8): it turned like a spring before (15.11)
    springTo(yawS, baseYaw + lookX * share, 24, 9.8, dt);
    springTo(pitchS, clamp(basePitch + lookY * share, -0.45, 0.45), 24, 9.8, dt);
    // the body is turned by api.turn; the eyes make up for it
    eyeX += (clamp((baseYaw + lookX - yawS.x - api.turn) * 2.6, -1, 1) + jitX - eyeX) * k(32);
    eyeY += (clamp((basePitch + lookY - pitchS.x) * 2.6, -1, 1) + jitY - eyeY) * k(32);

    // body: it never hangs still and never moves like a pendulum
    let hop = 0;
    if (state === 'happy') {
      hop = stateT > 0.14 ? Math.sin(Math.min((stateT - 0.14) / 0.5, 1) * Math.PI) * 0.038 : 0;
      if (!landed && stateT > 0.64) { landed = true; press(0.14); }
    }
    rig.position.set(
      (Math.sin(t * 0.53) + Math.sin(t * 0.91 + 2) * 0.6) * 0.0035,
      Math.sin(t * 1.7) * 0.004 + Math.sin(t * 0.63 + 1) * 0.003 + Math.sin(t * 2.9) * 0.001 + hop + o.dy,
      Math.sin(t * 0.41 + 4) * 0.004,
    );
    rig.rotation.set(
      springTo(leanX, -pitchS.x * 0.6 + blendLean(0) + clamp(velS.z * 0.9, -0.3, 0.3) + o.lean[0], 70, 9, dt),
      yawS.x + api.turn,
      springTo(leanZ, blendLean(1) + clamp(-velS.x * 0.9, -0.3, 0.3) + o.lean[1]
        + Math.sin(t * 0.9) * 0.02 + Math.sin(t * 0.37 + 1) * 0.015 + Math.sin(t * 9) * 0.07 * W.happy, 70, 9, dt),
    );
    // the keycap rides its spring; while building it rattles like fast typing
    if (W.build > 0.5 && Math.random() < dt * 9) {
      keyV -= 0.05; sound('type');
      // a free hand types (one holding the tablet or the pencil does not)
      const hand = gripW[0] > 0.5 ? 1 : gripW[1] > 0.5 ? 0 : Math.random() < 0.5 ? 0 : 1;
      tapFinger(hand);
      const side = kbSide[SIDES[hand] > 0 ? 0 : 1];
      kbPressed.set(side[Math.floor(Math.random() * side.length)], t); // the key under that hand goes down
    }
    keyV += (-keyY * 520 - keyV * 20) * dt;
    keyY = clamp(keyY + keyV * dt, -0.0055, 0.003);
    // squash and stretch: the bottom of the cap stays on the switch
    const s = clamp(springTo(sq, Math.sin(t * 1.3) * 0.008 + o.stretch + clamp(velS.y * 0.3, -0.08, 0.08), 170, 10, dt), -0.22, 0.25);
    cap.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    cap.position.y = keyY + s * 0.052;
    root.scale.setScalar(Math.max(0.001, springTo(appear, 1, 120, 12, dt)));

    // hands: each on its own spring, so they trail and overshoot
    for (let i = 0; i < 2; i++) {
      const h = hands[i], side = SIDES[i], ov = o.hands[i];
      tmp.set(blendHand(i, 0), blendHand(i, 1), blendHand(i, 2));
      if (ov) {
        tmp.set(mix(tmp.x, ov.p[0], ov.w), mix(tmp.y, ov.p[1], ov.w), mix(tmp.z, ov.p[2], ov.w));
        // on the way the hand swings out and round, as if the arm turned at a shoulder; at either end it is where it should be
        const swing = Math.sin(Math.PI * ov.w) * 0.026;
        tmp.x += swing; tmp.z += swing * 0.35;
      }
      tmp.x *= side;
      tmp.x += Math.sin(t * 7 + side) * 0.006 * W.build;                               // typing: the hands wander over the keys
      tmp.y += Math.abs(Math.sin(t * 15 + (side > 0 ? 0 : 1.6))) * 0.009 * W.build;   // and tap in turn
      tmp.y += Math.sin(t * (i ? 1.3 : 1.7) + side) * 0.004 + (i === 0 ? said * 0.01 * W.talk : 0);
      tmp.applyQuaternion(rig.quaternion).add(rig.position);
      // holding on: the hand goes to the held point and stays on it (a stiffer spring: it rides a moving thing)
      gripW[i] += ((gripAt[i] ? 1 : 0) - gripW[i]) * k(14);
      const g = gripW[i] > 0.002 ? gripW[i] : 0;
      if (g && gripAt[i]) { gripTmp.copy(gripAt[i]!); root.worldToLocal(gripTmp); tmp.lerp(gripTmp, g); }
      const hv = handV[i], stiff = mix(i ? 115 : 150, 900, g), damp = mix(17, 60, g);
      hv.x += ((tmp.x - h.position.x) * stiff - hv.x * damp) * dt;
      hv.y += ((tmp.y - h.position.y) * stiff - hv.y * damp) * dt;
      hv.z += ((tmp.z - h.position.z) * stiff - hv.z * damp) * dt;
      h.position.addScaledVector(hv, dt);
      // a hand that holds is on the held point itself, as on the stand: a spring would trail behind a thing
      // swung fast and sink into it (measured 14.11)
      if (g && gripAt[i]) { h.position.lerp(gripTmp, g); hv.multiplyScalar(1 - g); }
      // the hand turns from its mood's pose to the number's pose as far as the number has come, never in one jump
      const happyWag = Math.sin(t * 11) * 0.4 * W.happy, idleWag = Math.sin(t * 1.3 + side) * 0.05;
      const r = STATES[state].hands[i].r;
      qHand.setFromEuler(euler.set(r[0], side * r[1], side * (r[2] + happyWag) + idleWag));
      if (ov && ov.w > 0) {
        qAct.setFromEuler(euler.set(ov.r[0], side * ov.r[1], side * (ov.r[2] + happyWag) + idleWag));
        qHand.slerp(qAct, ov.w);
      }
      if (g) {
        const gr = gripR[i];
        qAct.setFromEuler(euler.set(gr[0], side * gr[1], side * gr[2]));
        // a turn given in the world (drawing on the tablet: src/helper.ts sketch): into the rig's space
        const tw = gripTW[i];
        if (tw && tw.w > 0) {
          root.getWorldQuaternion(qWorld).multiply(rig.quaternion).invert().multiply(tw.q);
          qAct.slerp(qWorld, tw.w);
        }
        qHand.slerp(qAct, g);
      }
      h.quaternion.slerp(qTo.copy(rig.quaternion).multiply(qHand), k(10));
      // fingers: relaxed a little and never quite still; pointing: the index (next to the thumb) stays out, the
      // others curl into the palm; holding: all round the edge (as far as grip() asked); glad: open and spread;
      // typing: a quick ripple over them, and each key press a finger striking down
      const point = ov ? ov.point * ov.w : 0;
      const open = Math.max(W.happy, g * Math.max(0, 1 - gripCurl[i] / 0.25));
      const J = joints[i], taps = tapT[i];
      for (let j = 0; j < 4; j++) {
        taps[j] += dt;
        // a hand that holds something (the tablet's frame, the pencil) types no keys: Yury, 16.11 — the hand holding
        // the tablet flicked its fingers while he drew
        const strike = taps[j] < TAP ? Math.sin(Math.PI * taps[j] / TAP) * (1 - g) : 0;
        const thumb = j === 3;
        let c = (thumb ? 0.12 : 0.2 + j * 0.05) + Math.sin(t * 1.1 + j * 0.9 + side) * 0.05;
        c = mix(c, thumb ? 0 : j ? 1.15 : 0, point);
        c = mix(c, gripCurl[i] * (thumb ? 0.5 : 1), g);
        c = mix(c, -0.05, open);
        // (not a holding hand: drawing on the tablet, the pencil hand's fingers rippled as if typing — Yury, 16.11)
        if (!thumb) c += W.build * (1 - g) * (0.2 + 0.25 * Math.max(0, Math.sin(t * 17 - j * 1.7 + side)));
        c += strike * (thumb ? 0.5 : 0.75);
        J.k1[j].rotation.x = c * (thumb ? 0.7 : 1.05) - strike * 0.1;
        J.k2[j].rotation.x = c * (thumb ? 0.8 : 1.3);
        if (!thumb) J.k1[j].rotation.z = side * FINGERS[j].fan * (1 + open * 1.6 - point * 0.5);
      }
      J.k0.rotation.z = side * (THUMB.turn[2] + open * 0.3 - point * 0.2);
    }

    // lamp
    const pulse = W.idle * Math.sin(t * 2) * 0.25 + W.listen * voice * 1.8 + W.think * (Math.sin(t * 9) > 0 ? 1.2 : -0.8) + W.build * 0.8 + W.happy + W.talk * said * 1.5;
    lampMat.emissiveIntensity = 2 + pulse;
    powerV += (-powerDip * 900 - powerV * 40) * dt; powerDip = clamp(powerDip + powerV * dt, -0.0016, 0.0004);
    powerCap.position.z = powerDip;

    // face
    nextBlink -= dt;
    if (nextBlink < 0) { nextBlink = Math.random() < 0.18 ? 0.2 : 1.6 + Math.random() * 3.8; blinkT = 0; }   // now and then a double blink
    const before = blinkT; blinkT += dt;
    if (before < 0.075 && blinkT >= 0.075) faceMode = state;   // the face changes behind a blink
    const f = STATES[state].face, kf = k(9);
    F.w += (f.w - F.w) * kf; F.pupil += (f.pupil - F.pupil) * kf; F.lid += ((f.lid ?? 0) - F.lid) * kf;
    F.h += (f.h * (1 + 0.22 * wideEyes) - F.h) * k(wideEyes > 0 ? 30 : 9);
    faceCol.lerp(faceTo.set(state === 'happy' ? GLAD_COLOR : FACE_COLOR), k(6));
    for (let i = 0; i < 2; i++) { F.raise[i] += (f.raise[i] + o.brow + wideEyes * 0.9 - F.raise[i]) * k(14); F.tilt[i] += (f.tilt[i] - F.tilt[i]) * kf; }
    // speech: a real level from setVoice(), or made-up syllables and pauses until there is a voice
    if (state === 'talk' && voiceLevel === null) {
      syllable -= dt;
      if (syllable <= 0) {
        if (syllables > 0) { syllables--; saidTo = Math.random() < 0.2 ? 0.12 : 0.35 + Math.random() * 0.65; wideTo = 0.6 + Math.random() * 0.7; syllable = 0.07 + Math.random() * 0.12; }
        else { saidTo = 0; wideTo = 1; syllable = 0.14 + Math.random() * 0.3; syllables = 2 + Math.floor(Math.random() * 6); }
      }
    } else if (state === 'talk') {
      saidTo = clamp(voiceLevel ?? 0, 0, 1);
      syllable -= dt;
      if (syllable <= 0) { wideTo = 0.6 + Math.random() * 0.7; syllable = 0.12; }
    } else if (voiceLevel !== null && voiceLevel > 0.02) {
      // his voice is heard while he builds, listens or rejoices (Live answers whenever it answers): the mouth goes with it
      saidTo = clamp(voiceLevel, 0, 1); wideTo = 1;
    } else { saidTo = 0; wideTo = 1; }
    said += (saidTo - said) * k(saidTo > said ? 38 : 24); wide += (wideTo - wide) * k(16);
    const mo = o.mouth ?? MOUTH[state], km = k(14);
    Mo.w += (mo.w * (state === 'talk' && !o.mouth ? wide : 1) - Mo.w) * km;
    Mo.open += (mo.open + said + (state === 'listen' ? voice * 0.15 : 0) - Mo.open) * k(30);
    Mo.curve += (mo.curve - Mo.curve) * km; Mo.skew += (mo.skew - Mo.skew) * km; Mo.fill += (mo.fill - Mo.fill) * km;
    F.raise[0] += said * 0.04; F.raise[1] += said * 0.04;
    faceClock += dt;
    // not while he is hidden (behind the wall, while the title's Punto stands in for him): a face nobody sees
    // costs the same canvas work (audit 15.11); the first frame he is back draws it at once
    if (faceClock >= 1 / 30 && object.visible) {
      faceClock = 0;
      // while it codes the eyes run along the lines
      drawFace(t, (1 - clamp(1 - Math.abs(blinkT / 0.075 - 1), 0, 1)) * o.eye, eyeX + Math.sin(t * 2.3) * 0.28 * W.build, eyeY, voice);
    }

    // the code runs across the screen: its own sample, or the real text given through setCode()
    if (state === 'build') {
      codePos = Math.min(codeLength, codePos + dt * Math.max(70, (codeLength - codePos) * (codeOwn ? 0 : 1.5)));
      if (codeOwn && codePos >= codeLength && buildT < 0.2) codePos = 0;     // the sample starts over with every new thing
    }

    // the thing being built
    buildT = state === 'build' ? (buildT + dt) % CYCLE : buildT;
    progress = clamp(buildT / (22 * STEP), 0, 1);
    // the keyboard comes up under his hands as he starts, and goes as he stops; a pressed key down 90 ms, lit a moment longer
    kit.group.visible = api.showBuild && W.build > 0.02;
    kit.group.scale.setScalar(kit.group.visible ? Math.max(0.001, W.build) : 0.001);
    if (kit.group.visible) {
      for (const [key, at] of kbPressed) {
        const since = t - at;
        key.mesh.position.y = kit.CAP_Y - (since < 0.09 ? kit.PRESS_DEPTH : 0);
        key.mesh.material = since < 0.21 ? kit.litMat : kit.capMat;
      }
    }

    pMat.uniforms.uPx.value = 900 * object.scale.x; // the points are sized in Punto's own units
    for (let i = 0; i < N; i++) {
      if (pLife[i] <= 0) { pAlpha[i] = 0; continue; }
      pLife[i] -= dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pAlpha[i] = Math.min(1, Math.sin(clamp(pLife[i] / pMax[i], 0, 1) * Math.PI) * 2);
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.aColor.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = pGeo.attributes.aAlpha.needsUpdate = true;
  }

  const api: Punto = {
    object, root, update, setState,
    setVoice: (level) => { voiceLevel = level; },
    setSound: (play) => { sound = play; },
    setCode(text) {
      if (text === null) { codeOwn = true; loadCode(SAMPLE); codePos = 0; return; }
      codeOwn = false; loadCode(text); codePos = Math.min(codePos, codeLength);
    },
    sendPixels(to, hand = 0) {
      // the points live in `object`'s own space
      spot.copy(hands[hand].position).add(root.position);
      tmp.copy(to); object.worldToLocal(tmp); tmp.sub(spot);
      for (let n = 0; n < 6; n++) {
        const life = 0.22 + Math.random() * 0.12;
        spawn(spot, tmp.x / life + (Math.random() - 0.5) * 0.08, tmp.y / life + (Math.random() - 0.5) * 0.08, tmp.z / life + (Math.random() - 0.5) * 0.08,
          PALETTE[Math.floor(Math.random() * PALETTE.length)], 0.005 + Math.random() * 0.004, life);
      }
    },
    poke() { if (act === 'doze' && !woke) startle(); startAct('poked'); sq.v -= 3.5; sound('poke'); },
    notice(point, seconds = 1.5) { noticeAt.copy(point); noticeT = seconds; gaze.kind = 'player'; gaze.x = gaze.y = 0; gaze.hold = seconds; blinkT = 0; },
    enter() { appear.x = 0.01; appear.v = 0; startAct('wave'); sound('glad'); },
    perform(name) { startAct(name); },
    grip(i, at, r, curl = 0.5) {
      gripAt[i] = at; gripCurl[i] = curl;
      if (r) { gripR[i][0] = r[0]; gripR[i][1] = r[1]; gripR[i][2] = r[2]; }
    },
    gripTurn(i, q, w = 1) {
      if (!q) { gripTW[i] = null; return; }
      const tw = (gripTW[i] ??= { q: new Quaternion(), w: 0 });
      tw.q.copy(q);
      tw.w = w;
    },
    chirp(name) { sound(name); },
    tap: tapFinger,
    power,
    pressPower() { powerV = -0.12; sound('key'); },
    showPower() { startAct('showPower'); },
    showWay() { if (act === 'doze' && !woke) startle(); startAct('showWay'); press(0.1, 'tap'); },
    get state() { return state; },
    turn: 0.3,
    showBuild: true,
  };
  return api;
}

/** Where Punto hangs relative to the player's head (metres: right, up, ahead is -Z). */
const SPOTS = {
  // Quest 3S sees about 96 degrees across (±48); Punto stays well inside it, to the left.
  // 16.11, Yury: «отнести на половину дистанции дальше … слишком близко к лицу» — all ×1.5 (the same angles)
  front: [-0.75, -0.3, -2.25],  // ~18 degrees left of where the player looks: greeting, showing things
  side: [-1.2, -0.3, -2.0],     // ~31 degrees left, out of the way while the player creates
  near: [-0.63, -0.24, -1.7],   // spoken to: it comes a little closer, then drifts back (Yury, 15.11: «подтянулся»)
} satisfies Record<string, [number, number, number]>;
export type PuntoSpot = keyof typeof SPOTS;

export interface SpawnedPunto extends Punto {
  entity: Entity;
  /** performance.now() of the last press on the power button: a press there is not talking. */
  readonly poweredAt: number;
  /** Front of the face or off to the side; Punto flies there and keeps that place as the head turns. */
  stay(spot: PuntoSpot): void;
  /** Leaves the player and flies to a world point, turning to `face`; resolves on arrival. */
  flyTo(to: Vector3, face: Vector3): Promise<void>;
  /** Leaves the player and stands at a world point at once, turned to `face` (no flight). */
  placeAt(at: Vector3, face: Vector3): void;
  /** Flies back to its place by the player; resolves on arrival. */
  comeBack(): Promise<void>;
  /** One quick jab forward, the way the screen faces; resolves when the fist lands. */
  punch(): Promise<void>;
  /** Something happened at this world point: Punto looks there for a moment. */
  noticeWorld(point: Vector3, seconds?: number): void;
  /**
   * Pulls `thing` out from behind its back: it grows over Punto's head, then — whoosh — flies, held at
   * two edges, to `at` turned as `q` (world), and Punto stays behind its top-left corner (as the player
   * sees it), peeking out and holding on. The thing stands still there: Punto holds it, not the other
   * way round. `size` is its width and height in metres, its front (+Z) faces the player. Resolves on
   * arrival. Punto lets go on putAway, on any other flight, or when `held()` turns true (the player took it).
   */
  bring(thing: Object3D, size: [number, number], at: Vector3, q: Quaternion, options?: { seconds?: number; held?: () => boolean }): Promise<void>;
  /** The other way: the thing shrinks over Punto's head and goes behind its back (then hidden); Punto flies back. */
  putAway(thing: Object3D, seconds?: number): Promise<void>;
  /**
   * Holding the tablet (`bring` first), Punto goes round its right edge to its front side — whoosh — his back to
   * the player, three quarters; his left hand keeps the frame from behind, his right takes a pencil and draws the
   * plan on the screen, `paper.draw(t)` saying where the pencil or the eraser is (src/blueprint.ts). Resolves once
   * he is round; he draws until endSketch. Yury, 15.11 (research/code/tools/tablet-stand.ts is the stand for it).
   */
  sketch(thing: Object3D, paper: { draw(t: number): Tool | null; started: number }): Promise<void>;
  /** Back round behind the tablet, holding it as before (then putAway). Resolves when he is there. */
  endSketch(): Promise<void>;
}

// Punto's own sounds from the CC0 library (src/sfx.ts), quiet: they come often.
const SOUNDS: Record<PuntoSound, [string, number]> = {
  key: ['switch', 0.35],
  type: ['click', 0.2],
  tap: ['tick', 0.3],
  poke: ['pepSound', 0.6],
  wake: ['phaserUp', 0.5],
  glad: ['powerUp', 0.45],
};

const FOLLOW = {
  behavior: FollowBehavior.PivotY,         // stays upright and turns its screen to the player
  maxAngle: 44,                            // above Punto's own angle off the gaze (or it chases the head), below the edge of view
  tolerance: 0.6,                          // far from the head, a small turn moves the place a lot; he stays put more (15.11)
  // The Follower only decides WHERE Punto belongs; it does not move him (speed 0). Its own move is an
  // exponential lerp that leaves at full speed the moment the head passes maxAngle: Punto jerked after
  // every turn of the head (Yury, 14.11). PuntoSystem moves him there on a spring instead (FOLLOW_SPRING).
  speed: 0,
};
/** Punto catching up with the head: a critically damped spring, ~2 s from start to rest, eased both ends, never fast:
 *  he drifts over rather than runs (Yury, 15.11: «чтобы он плавненько подплывал … чтобы это не раздражало»). */
const FOLLOW_SPRING = { stiffness: 5, maxSpeed: 0.6 }; // 1/s², m/s
const FLY_SPEED = 1.2;                     // metres a second
const SIZE = 2.7;                          // Punto as drawn is 15 cm tall: ~40 cm reads well across a room

/**
 * Puts Punto into the room and keeps it with the player using IWSDK's own
 * Follower (lazy follow): it holds its place next to the head, and when the
 * player turns more than maxAngle away or moves, it flies smoothly back to
 * that place. Entering XR, recentring and the first frames without a head
 * pose are handled the same way: the place moved, so Punto follows.
 * While it is with the player it drifts from side to side, never quite still.
 */
export function spawnPunto(
  world: World,
  options: { spot?: PuntoSpot; /** loudness of Punto's speech, 0..1, read every frame */ voice?: () => number } = {},
): SpawnedPunto {
  const { voice } = options;
  let spot = options.spot ?? 'front';
  const punto = createPunto();
  punto.object.scale.setScalar(SIZE);
  punto.object.userData.occlude = false;   // floats in front of the player; custom shaders must stay as they are
  const entity = world.createTransformEntity(punto.object);
  const follow = (sync: boolean) => {
    entity.addComponent(Follower, { ...FOLLOW, target: world.camera, needsPositionSync: sync });
    entity.getVectorView(Follower, 'offsetPosition').set(SPOTS[spot]);
  };
  follow(true);
  punto.setSound((name) => {
    const [group, volume] = SOUNDS[name];
    sfx(world, group, punto.object.getWorldPosition(new Vector3()), volume);
  });

  const look = new Vector3(), drift = new Vector3(), face = new Vector3(), from = new Vector3(), to = new Vector3();
  const facing = new Quaternion(), probe = new Object3D();
  const followV = new Vector3(), tmpV = new Vector3();
  // Inside the room (Yury, 18.11: «чтобы он был внутри комнаты всегда и в объекты не врезался»): the place next to
  // the head is pulled in along the line from the head when a real wall or piece of furniture is on it, so Punto stays
  // ROOM_GAP in front of it. Looked up five times a second, not every frame (roomHit raycasts the room).
  const ROOM_GAP = 0.3, ROOM_EVERY = 0.2;
  const eyeW = new Vector3(), wantW = new Vector3(), rayDir = new Vector3(), safeW = new Vector3();
  let roomCheckIn = 0, pulledIn = false;
  const insideRoom = (target: Vector3, delta: number): Vector3 => {
    roomCheckIn -= delta;
    const parent = punto.object.parent;
    if (!parent) return target;
    if (roomCheckIn <= 0) {
      roomCheckIn = ROOM_EVERY;
      world.camera.getWorldPosition(eyeW);
      parent.localToWorld(wantW.copy(target));
      const far = rayDir.subVectors(wantW, eyeW).length();
      const hit = far > 0.01 ? roomHit(world, eyeW, rayDir.normalize(), far + ROOM_GAP) : undefined;
      const wasPulled = pulledIn;
      pulledIn = Boolean(hit);
      if (hit) {
        const room = eyeW.distanceTo(hit.point);
        safeW.copy(eyeW).addScaledVector(rayDir, Math.max(0.35, room - ROOM_GAP));
        parent.worldToLocal(safeW);
      }
      if (pulledIn !== wasPulled) console.info(`[punto] ${pulledIn ? `kept inside the room: a ${hit!.surface} ahead` : 'free again'}`);
    }
    return pulledIn ? safeW : target;
  };
  let flight: { t: number; duration: number; arrived: () => void } | undefined;
  let returning: (() => void) | undefined;
  let jab: { t: number; landed?: () => void } | undefined;
  const JAB = 0.28; // seconds: out and back

  // ---- carrying a thing (Punto's tablet): from behind its back to the player, and back ----
  interface Carry { thing: Object3D; w: number; h: number; t: number; dur: number; out: boolean; flown: boolean; grips: boolean; done: () => void; held?: () => boolean; started: boolean }
  let carry: Carry | undefined;
  let holding: { thing: Object3D; w: number; h: number; held?: () => boolean } | undefined;
  const cFrom = new Vector3(), cTo = new Vector3(), cQ = new Quaternion();
  const cPeek = new Vector3(), cHead = new Vector3(), cAt = new Vector3();
  const gripPts = [new Vector3(), new Vector3()];
  const gripQ = new Quaternion(), gripOff = new Vector3();
  // where the hands hold, in the thing's own space (+Z faces the player, +X is the player's right):
  // one hand on each side edge, up near the top. The palm stays outside the edge and leans back behind
  // it, the thumb points up, and only the fingers come round onto the front of the rim (Yury, 14.11:
  // «большие пальцы вверху», «чуть-чуть наклонить их назад», «чтобы только пальчики держали»).
  // Hand 0 is Punto's left (+X): facing the player, it is on the player's right.
  const GRIP_OUT = 0.05, GRIP_BACK = 0; // m: the palm's centre beside the edge, level with the face: nothing of the hand inside the rim (measured, 14.11)
  const GRIP_LEAN = 0.85; // rad: how far the fingers come forward round the edge (the hand tilted back)
  /** The hand's turn (as grip() takes it, in Punto's frame) so its fingers point `fingers` and its thumb up. */
  const gripTurn = (side: number, fingers: Vector3): [number, number, number] => {
    const y = fingers.clone().normalize();
    const x = new Vector3(0, -side, 0); // the thumb sits on the hand's -side*X: that side goes up
    x.addScaledVector(y, -x.dot(y)).normalize();
    const z = new Vector3().crossVectors(x, y);
    const e = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
    return [e.x, side * e.y, side * e.z]; // grip() multiplies y and z by side again
  };
  const GRIP_R: [number, number, number][] = [
    gripTurn(1, new Vector3(-Math.cos(GRIP_LEAN), 0, Math.sin(GRIP_LEAN))),
    gripTurn(-1, new Vector3(Math.cos(GRIP_LEAN), 0, Math.sin(GRIP_LEAN))),
  ];
  /** Both hands on the edges, or only `only` (the other one free). */
  const holdEdges = (thing: Object3D, w: number, h: number, only?: 0 | 1) => {
    thing.updateWorldMatrix(true, false);
    thing.getWorldQuaternion(gripQ);
    // the edge scales with the thing; the palm's own room beside it does not (a small thing is not swallowed)
    gripPts[0].set(w / 2, h / 2 - 0.085, 0).applyMatrix4(thing.matrixWorld).add(gripOff.set(GRIP_OUT, 0, GRIP_BACK).applyQuaternion(gripQ));
    gripPts[1].set(-w / 2, h / 2 - 0.075, 0).applyMatrix4(thing.matrixWorld).add(gripOff.set(-GRIP_OUT, 0, GRIP_BACK).applyQuaternion(gripQ));
    punto.grip(0, only === 1 ? null : gripPts[0], GRIP_R[0]);
    punto.grip(1, only === 0 ? null : gripPts[1], GRIP_R[1]);
  };

  // ---- the draw: like a cartoon sword from behind the back (Yury, 14.11; research/code/tools/tablet-stand.ts) ----
  // 0 .. DRAW_REACH     his hands go behind his back (the 'fetch' act); the thing is not out yet
  // .. DRAW_LAND        out it comes, tiny and upright, its back to the player, his right hand on its lower
  //                     edge like a hilt; a small arc from behind him out to his side (the player's left) and
  //                     on to the front, turning flat and round to its face, growing; whoosh to its place
  // .. 1                it lands with a thump and pops to full size; the other hand takes the right edge
  // Putting it away is the same played backwards.
  const DRAW_REACH = 0.22, DRAW_LAND = 0.78;
  const DRAW_R = 0.36; // m: from the middle of his body to the thing's place, where the arc ends
  const cHome = new Vector3();
  /** Where Punto draws it from, as on the stand: straight behind its spot `at` (turned `q`), DRAW_R back. */
  const drawFrom = (at: Vector3, q: Quaternion) => {
    dTo.copy(at); dBase.copy(q);
    dPivot.set(0, 0, -DRAW_R).applyQuaternion(q).add(at);
    cHome.copy(dPivot).y += 0.08; // his origin: his body hangs below it
  };
  /** Seconds for Punto to get to cHome from where he is (0 when he is there). */
  const toHome = () => {
    const d = punto.object.getWorldPosition(cAt).distanceTo(cHome);
    return d < 0.05 ? 0 : clamp(d / 2.4, 0.25, 0.6);
  };
  const dPivot = new Vector3(), dBase = new Quaternion(), dTo = new Vector3(), dSpin = new Quaternion(), dRoll = new Quaternion();
  const AXIS_Y = new Vector3(0, 1, 0), AXIS_Z = new Vector3(0, 0, 1);
  /** The thing where the draw has it at `t` (0..1), round dPivot (Punto) facing dBase, landing at dTo. */
  const drawPose = (c: Carry, t: number) => {
    if (t <= DRAW_REACH) {
      setWorld(c.thing, dPivot, 0.001); // behind his back, not out yet
      c.thing.quaternion.copy(dBase);
      punto.grip(0, null); punto.grip(1, null);
      return;
    }
    const b = Math.min(1, (t - DRAW_REACH) / (DRAW_LAND - DRAW_REACH));
    const swing = b ** 1.6; // slow out of the back, fast at the end
    const around = -Math.PI * (1 - swing); // -PI behind him, -PI/2 at his right side, 0 in front
    const r = mix(0.28, DRAW_R, swing); // wide enough to pass round his body, not through it (measured, 14.11)
    cAt.set(Math.sin(around) * r, Math.sin(Math.PI * b) * 0.06, Math.cos(around) * r).applyQuaternion(dBase).add(dPivot);
    const land = (t - DRAW_LAND) / (1 - DRAW_LAND);
    if (land > 0) cAt.y -= Math.sin(Math.PI * Math.min(1, land * 1.6)) * 0.025; // the thump
    setWorld(c.thing, cAt, land <= 0 ? mix(0.06, 0.85, b ** 1.5) : mix(0.85, 1, backOut(Math.min(1, land))));
    const upright = (Math.PI / 2) * (1 - sstep(0, 1, b * 1.15));
    c.thing.quaternion.copy(dBase).multiply(dSpin.setFromAxisAngle(AXIS_Y, around)).multiply(dRoll.setFromAxisAngle(AXIS_Z, upright));
    if (c.out && !c.grips) release(); // the player had taken it: he does not grab at it
    // drawing it, one hand holds it like a hilt; putting it away, both stay on it till it is behind his back
    // (a hand let go on the way back springs home straight through it)
    else holdEdges(c.thing, c.w, c.h, land > 0 || c.out ? undefined : 1);
  };
  const release = () => { punto.grip(0, null); punto.grip(1, null); punto.gripTurn(0, null); punto.gripTurn(1, null); };

  // ---- the sketch: drawing the plan on the tablet he holds (Yury, 15.11; research/code/tools/tablet-stand.ts) ----
  interface Sketch {
    paintIn?: number; // seconds to the next paint of the plan (it is painted 20 times a second)
    thing: Object3D; w: number; h: number; paper: { draw(t: number): Tool | null; started: number };
    t: number; m: number; goal: 0 | 1; turned?: () => void; ended?: () => void;
    heard: number; rub: number; flip: number; tool: Tool; peekQ: Quaternion; smooth: Vector3; fresh: boolean;
  }
  let sk: Sketch | undefined;
  const PENCIL = 0.16; // long: the hand holds its far end, beside the line, not over it
  const pencil = new Group();
  {
    const stick = new Mesh(new CylinderGeometry(0.0055, 0.0055, PENCIL * 0.78, 12), new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }));
    const nib = new Mesh(new ConeGeometry(0.0055, PENCIL * 0.14, 12), new MeshStandardMaterial({ color: 0x23282b, roughness: 0.6 }));
    nib.position.y = -PENCIL * 0.46; nib.rotation.x = Math.PI;
    const rubber = new Mesh(new CylinderGeometry(0.0058, 0.0058, PENCIL * 0.1, 12), new MeshStandardMaterial({ color: 0xf08aa0, roughness: 0.8 }));
    rubber.position.y = PENCIL * 0.44;
    pencil.add(stick, nib, rubber);
    pencil.visible = false;
    pencil.userData.occlude = false; // in the air in front of the player, like Punto
  }
  let pencilIn = false;
  /** A glove's turn in the tablet's frame: its fingers along `fingers`, its thumb towards `thumb` (as the stand). */
  const handTurn = (fingers: Vector3, thumb: Vector3) => {
    const y = fingers.clone().normalize();
    const x = thumb.clone().addScaledVector(y, -thumb.dot(y)).normalize();
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y)));
  };
  // the drawing hand: along the screen towards the point, the mitten three quarters to the player, thumb up; the
  // holding hand: on the frame at its right edge from the back, fingers round the back (all tuned with Yury, 15.11)
  // the holding hand turned 180 degrees round the fingers, thumb up (Yury, 16.11); the pencil hand as it was (turned,
  // its fingers looked broken)
  const DRAW_TURN = handTurn(new Vector3(0.75, -0.45, -0.4), new Vector3(-0.2, 0.6, 0.75));
  const HOLD_TURN = handTurn(new Vector3(-1, 0.1, -0.35), new Vector3(0, -1, 0));
  const PENCIL_LEAN = new Vector3(-0.75, 0.45, 0.8).normalize(); // out of the screen, up, to the left of the point
  const skA = new Vector3(), skB = new Vector3(), skTool = new Vector3(), skN = new Vector3(), skGrip = new Vector3();
  const skQ = new Quaternion(), skHand = new Quaternion(), skSide = new Quaternion(), skUp = new Vector3(0, -1, 0), skFlipQ = new Quaternion();
  const skAt = (x: number, y: number, z: number, out: Vector3) => out.set(x, y, z).applyQuaternion(cQ).add(cTo); // on the tablet at rest
  const skPeek = new Vector3(), skArc = new Vector3(), skEnd = new Vector3(), skMid = new Vector3();
  function stepSketch(delta: number) {
    const c = sk;
    if (!c) return;
    if (!holding || holding.thing !== c.thing) { endNow(); return; } // the tablet was taken or put away
    const dt = Math.min(delta, 0.05);
    c.m = c.goal ? Math.min(1, c.m + dt / 0.55) : Math.max(0, c.m - dt / 0.45);
    const s = sstep(0, 1, c.m);
    // whoosh: from peeking over its top round its right edge to its front side, his back to the player
    skAt(0.17, c.h / 2 + 0.07, -0.19, skPeek);
    skAt(c.w / 2 + 0.3, 0.05, -0.05, skArc);
    skAt(0.1, -0.3, 0.3, skEnd); // low, in front of the screen's lower part: under the player's line of sight to it
    const a = 1 - s;
    skA.copy(skPeek).multiplyScalar(a * a).addScaledVector(skArc, 2 * a * s).addScaledVector(skEnd, s * s);
    const object = punto.object;
    object.position.copy(skA);
    object.parent?.worldToLocal(object.position);
    // he turns the way the player looks at him — his back to the player, wherever the tablet hangs (Yury, 15.11: he
    // stood half turned, his face between the player and the board); upright
    world.camera.getWorldPosition(skMid);
    skMid.sub(skEnd).setY(0).normalize().negate().add(skEnd);
    probe.position.copy(skEnd);
    probe.lookAt(skMid);
    skSide.copy(probe.quaternion);
    if (object.parent) skSide.premultiply(object.parent.getWorldQuaternion(skQ).invert()); // into his parent's space
    object.quaternion.slerpQuaternions(c.peekQ, skSide, s);
    // the plan: drawn once he is round, the pencil scratching, the eraser rubbing
    if (c.goal && c.m >= 1) {
      c.turned?.(); c.turned = undefined;
      c.t += dt;
      // the plan's picture is painted 20 times a second, not every frame: each paint uploads the whole canvas to the
      // GPU (18.11: ~20 frames a second lost while the plan was drawn); the hand still moves every frame
      c.paintIn = (c.paintIn ?? 0) - dt;
      if (c.paintIn <= 0) {
        c.paintIn = 0.05;
        c.tool = c.paper.draw(c.t) ?? { ...c.tool, down: false };
      }
      if (c.paper.started > c.heard) { c.heard = c.paper.started; playSound(world, './audio/kit/scratch.ogg', skTool, 0.12); }
      if (c.tool.eraser && c.tool.down && (c.rub -= dt) <= 0) { c.rub = 0.16; sfx(world, 'cloth', skTool, 0.12); }
    }
    // the tool's point on the screen (above it between strokes, well off it when the hand goes aside)
    const thing = c.thing;
    thing.updateWorldMatrix(true, false);
    thing.localToWorld(skTool.set(
      TABLET_SCREEN.x + (c.tool.u - 0.5) * TABLET_SCREEN.w, (0.5 - c.tool.v) * TABLET_SCREEN.h,
      TABLET_SCREEN.z + (c.tool.down ? 0.001 : c.tool.away ? 0.06 : 0.018),
    ));
    if (c.fresh) { c.smooth.copy(skTool); c.fresh = false; }
    c.smooth.lerp(skTool, Math.min(1, dt * (c.tool.away ? 9 : 30))); // going aside is a move; drawing follows the line
    skTool.copy(c.smooth);
    thing.getWorldQuaternion(skQ);
    skN.copy(PENCIL_LEAN).applyQuaternion(skQ);
    c.flip += ((c.tool.eraser ? 1 : 0) - c.flip) * Math.min(1, dt * 14); // he turns the pencil over for the eraser
    pencil.quaternion.setFromUnitVectors(skUp, skB.copy(skN).negate()).multiply(skFlipQ.setFromAxisAngle(AXIS_X, Math.PI * c.flip));
    pencil.position.copy(skTool).addScaledVector(skN, PENCIL * 0.46);
    pencil.parent?.worldToLocal(pencil.position);
    pencil.visible = c.m > 0.5;
    skGrip.copy(skTool).addScaledVector(skN, PENCIL * 0.82); // he holds it near its far end
    // his right hand (1) leaves the left edge for the pencil; his left (0) goes to the frame's back at the right edge
    const hold = sstep(0.25, 0.75, c.m);
    skA.copy(gripPts[1]).lerp(skGrip, hold);
    skB.copy(gripPts[0]).lerp(thing.localToWorld(skMid.set(c.w / 2 + 0.012, -0.01, -0.028)), hold);
    holdPts[1].copy(skA); holdPts[0].copy(skB);
    punto.grip(1, holdPts[1], GRIP_R[1]);
    punto.grip(0, holdPts[0], GRIP_R[0]);
    punto.gripTurn(1, skHand.copy(skQ).multiply(DRAW_TURN), hold);
    punto.gripTurn(0, skHand.copy(skQ).multiply(HOLD_TURN), hold);
    face.copy(skTool); // he watches the pencil
    if (!c.goal && c.m <= 0) endNow();
  }
  const holdPts = [new Vector3(), new Vector3()];
  const AXIS_X = new Vector3(1, 0, 0);
  /** The sketch ends here and now: the pencil goes, the hands hold the edges again. */
  function endNow() {
    const c = sk;
    if (!c) return;
    sk = undefined;
    pencil.visible = false;
    punto.gripTurn(0, null); punto.gripTurn(1, null);
    c.turned?.();
    c.ended?.();
  }
  // the tablet in his hands is never quite still (Yury, 15.11: «совсем-немножечко колыхался»)
  const swayP = new Vector3(), swayX = new Vector3(), swayQ = new Quaternion(), swayE = new Euler();
  function sway(thing: Object3D) {
    const w = performance.now() / 1000;
    swayP.copy(cTo).addScaledVector(swayX.set(1, 0, 0).applyQuaternion(cQ), Math.sin(w * 1.3) * 0.003);
    swayP.y += Math.sin(w * 1.9 + 1) * 0.004;
    setWorld(thing, swayP, 1);
    thing.quaternion.copy(cQ).multiply(swayQ.setFromEuler(swayE.set(Math.sin(w * 1.1 + 2) * 0.012, Math.sin(w * 0.8) * 0.015, Math.sin(w * 1.5 + 0.5) * 0.01)));
  }
  const setWorld = (thing: Object3D, at: Vector3, scale: number) => {
    thing.position.copy(at);
    thing.parent?.worldToLocal(thing.position);
    thing.scale.setScalar(Math.max(0.001, scale));
  };
  const backOut = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2; // past 1 a little, then back
  /** A bring in flight lands at once, a putAway ends at once: a new carry never leaves one half done. */
  const finishCarry = () => {
    const c = carry;
    if (!c) return;
    carry = undefined;
    if (c.out) { c.thing.visible = false; release(); }
    else { setWorld(c.thing, cTo, 1); c.thing.quaternion.copy(cQ); holding = { thing: c.thing, w: c.w, h: c.h, held: c.held }; }
    c.done();
  };
  const letGo = () => {
    endNow();
    if (carry && !carry.out) finishCarry();
    if (!holding) return;
    holding = undefined;
    release();
  };
  function stepCarry(delta: number) {
    if (holding && !carry) {
      const { thing, w, h, held } = holding;
      if (!thing.parent || !thing.visible || held?.()) { letGo(); goBack(); }
      else { sway(thing); holdEdges(thing, w, h); }
    }
    const c = carry;
    if (!c) return;
    c.t = Math.min(1, c.t + delta / c.dur);
    const u = c.t;
    if (u < 0) {
      // the run-up: Punto is still on his way to his place behind the thing's spot; it is not out yet
      if (!c.out) drawPose(c, 0);
      else if (c.grips) holdEdges(c.thing, c.w, c.h);
      return;
    }
    if (!c.started) {
      c.started = true;
      if (!c.out) { punto.perform('fetch'); sfx(world, 'cloth', cHome, 0.5); }
      else playSound(world, './audio/kit/minimize.ogg', dTo, 0.45);
    }
    if (!c.out) {
      drawPose(c, u);
      if (!c.flown && u > DRAW_REACH + (DRAW_LAND - DRAW_REACH) * 0.55) {
        c.flown = true;
        playSound(world, './audio/kit/maximize.ogg', cAt, 0.5); // whoosh
      }
      // once it has landed he goes round behind it and peeks over the top
      if (u >= DRAW_LAND && !flight && punto.object.getWorldPosition(cAt).distanceTo(cPeek) > 0.02) fly(cPeek, cHead, c.dur * (1 - u) + 0.05);
    } else {
      drawPose(c, 1 - u);
      if (1 - u < DRAW_REACH && c.grips) { c.grips = false; punto.perform('fetch'); }
    }
    if (u >= 1) {
      const out = c.out;
      finishCarry();
      if (out) goBack();
    }
  }
  // A hard rule (Yury, 14.11): Punto never goes through the thing he carries. He may turn about behind it;
  // whatever the flight or the draw says, his origin stays at least CLEAR behind its back while he is
  // anywhere over it (its outline, grown by his own size). His front is ~0.18 m ahead of his origin.
  const CLEAR = 0.19;
  const kAt = new Vector3(), kQ = new Quaternion(), kP = new Vector3();
  function keepBehind() {
    const c = carry ?? holding;
    // putting it away he stays put and it goes round him: pushing him then would have it chase him; drawing on it
    // he is in front of it on purpose (the sketch)
    if (!c || sk || carry?.out || !c.thing.visible || !c.thing.parent) return;
    const s = c.thing.scale.x;
    if (s < 0.05) return;
    c.thing.updateWorldMatrix(true, false);
    c.thing.getWorldPosition(kAt);
    c.thing.getWorldQuaternion(kQ).invert();
    punto.object.getWorldPosition(kP).sub(kAt).applyQuaternion(kQ);   // in its frame, unscaled
    const over = Math.abs(kP.x) < (s * c.w) / 2 + 0.18 && kP.y > (-s * c.h) / 2 - 0.05 && kP.y < (s * c.h) / 2 + 0.3;
    // only from behind: he is never in front of it while it is out, so he is never pushed through it either
    if (!over || kP.z <= -CLEAR || kP.z > 0.1) return;
    kP.z = -CLEAR;
    kP.applyQuaternion(kQ.invert()).add(kAt);
    punto.object.position.copy(kP);
    punto.object.parent?.worldToLocal(punto.object.position);
  }
  const goBack = () => {
    if (entity.hasComponent(Follower)) return;
    returning = undefined;
    flight = undefined;
    if (!entity.hasComponent(Follower)) follow(false);
  };
  // A flight's end kept clear of the real room too (Yury, 18.11: «врезался в стол»): checked from the head (the spot
  // itself must not be inside a wall or a piece of furniture) and from where Punto is (nothing on the way): it stops
  // ROOM_GAP short of the first thing hit.
  const flyFrom = new Vector3(), flyDir = new Vector3(), flyEnd = new Vector3();
  function clearOfRoom(target: Vector3): Vector3 {
    flyEnd.copy(target);
    for (const origin of [world.camera.getWorldPosition(flyFrom).clone(), punto.object.getWorldPosition(flyFrom).clone()]) {
      const far = flyDir.subVectors(flyEnd, origin).length();
      if (far < 0.05) continue;
      const hit = roomHit(world, origin, flyDir.normalize(), far + ROOM_GAP);
      if (!hit) continue;
      const room = origin.distanceTo(hit.point);
      flyEnd.copy(origin).addScaledVector(flyDir, Math.max(0.2, room - ROOM_GAP));
      console.info(`[punto] flight kept clear: a ${hit.surface} on the way`);
    }
    return flyEnd;
  }
  function fly(target: Vector3, toward: Vector3, seconds?: number): Promise<void> {
    if (entity.hasComponent(Follower)) entity.removeComponent(Follower);
    const parent = punto.object.parent!;
    from.copy(punto.object.position);
    to.copy(clearOfRoom(target)); parent.worldToLocal(to);
    face.copy(toward);
    const duration = seconds ?? Math.min(2, Math.max(0.4, from.distanceTo(to) / FLY_SPEED));
    return new Promise<void>((arrived) => { flight = { t: 0, duration, arrived }; });
  }

  world.registerSystem(
    class PuntoSystem extends createSystem({}) {
      update(delta: number, time: number): void {
        const object = punto.object;
        stepCarry(delta);
        stepSketch(delta);
        if (flight) {
          // ease out of the player's side, across, into place; the screen turns to the work
          flight.t = Math.min(1, flight.t + delta / flight.duration);
          const s = flight.t * flight.t * (3 - 2 * flight.t);
          object.position.lerpVectors(from, to, s);
          probe.position.copy(object.position);
          probe.lookAt(face);
          object.quaternion.slerp(facing.copy(probe.quaternion), 1 - Math.exp(-delta * 6));
          if (flight.t >= 1) { const { arrived } = flight; flight = undefined; arrived(); }
        }
        keepBehind();
        if (returning && entity.hasComponent(Follower)) {
          const target = entity.getVectorView(Follower, '_followTarget');
          if (object.position.distanceTo(look.fromArray(target)) < 0.03) { const done = returning; returning = undefined; done(); }
        }
        // keeping up with the player: eased towards the place the Follower picked, never a jerk
        if (entity.hasComponent(Follower) && !flight) {
          const target = insideRoom(look.fromArray(entity.getVectorView(Follower, '_followTarget')), delta);
          const k = FOLLOW_SPRING.stiffness, damp = 2 * Math.sqrt(k), dt = Math.min(delta, 0.05);
          followV.addScaledVector(tmpV.copy(target).sub(object.position), k * dt).addScaledVector(followV, -damp * dt);
          if (followV.length() > FOLLOW_SPRING.maxSpeed) followV.setLength(FOLLOW_SPRING.maxSpeed);
          object.position.addScaledVector(followV, dt);
        } else {
          followV.set(0, 0, 0);
        }
        // drift side to side while by the player; hold still on a job
        const away = !entity.hasComponent(Follower);
        if (away) drift.set(0, 0, 0);
        // in Punto's own units: divided by its size, so the drift stays ±6 cm in the room
        else drift.set(Math.sin(time * 0.3) * 0.035, Math.sin(time * 0.8) * 0.01, Math.sin(time * 0.5) * 0.015).divideScalar(SIZE);
        punto.root.position.lerp(drift, 1 - Math.exp(-delta * 1.5));
        if (jab) {
          // the keycap lunges at what it faces and springs back
          jab.t += delta;
          punto.root.position.z += Math.sin(Math.PI * Math.min(1, jab.t / JAB)) * 0.09;
          if (jab.landed && jab.t >= JAB / 2) { jab.landed(); jab.landed = undefined; }
          if (jab.t >= JAB) jab = undefined;
        }
        // watch the player, or the work when away
        if (away) look.copy(face); else this.world.camera.getWorldPosition(look);
        object.worldToLocal(look);
        if (voice) punto.setVoice(voice());
        punto.update(delta, time, look);
      }
    },
  );

  // The power button: in the room it takes the player out, on the flat page it takes them in.
  // The ray hits Punto's entity; the press counts when the very mesh hit is part of the button.
  onRayPress(world, entity, (hit) => {
    let part: Object3D | null = hit.object;
    while (part && part !== punto.power) part = part.parent;
    if (!part) return;
    (punto as Punto & { poweredAt: number }).poweredAt = performance.now();
    console.info('[punto] power button');
    punto.pressPower();
    setTimeout(() => (world.session ? world.exitXR() : world.launchXR()), 180);   // let the click be seen and heard
  });

  return Object.assign(punto, {
    entity,
    poweredAt: -Infinity,
    stay(next: PuntoSpot) {
      spot = next;
      if (entity.hasComponent(Follower)) entity.getVectorView(Follower, 'offsetPosition').set(SPOTS[spot]);
    },
    flyTo(target: Vector3, toward: Vector3) {
      letGo();
      return fly(target, toward);
    },
    placeAt(at: Vector3, toward: Vector3) {
      letGo();
      flight = undefined;
      returning = undefined;
      if (entity.hasComponent(Follower)) entity.removeComponent(Follower);
      const object = punto.object;
      object.position.copy(at);
      object.parent!.worldToLocal(object.position);
      face.copy(toward);
      object.lookAt(toward);
    },
    noticeWorld(point: Vector3, seconds?: number) {
      punto.notice(punto.object.worldToLocal(point.clone()), seconds);
    },
    punch() {
      return new Promise<void>((landed) => { jab = { t: 0, landed }; });
    },
    bring(thing: Object3D, size: [number, number], at: Vector3, q: Quaternion, options: { seconds?: number; held?: () => boolean } = {}) {
      letGo();
      finishCarry();
      cTo.copy(at); cQ.copy(q);
      // where Punto ends up: behind it, the face over the top edge right of centre (concepts h1/h2, the stand);
      // his body hangs ~0.01-0.14 m below his own origin, his front ~0.18 m ahead of it: 0.19 m back keeps
      // it clear of the thing's back (measured in the emulator, 14.11)
      cPeek.set(0.17, size[1] / 2 + 0.07, -0.19).applyQuaternion(q).add(at);
      world.camera.getWorldPosition(cHead);
      drawFrom(at, q);
      const dur = options.seconds ?? 1.1;
      // first he flies to his place straight behind the thing's spot, then draws it round himself
      const runUp = toHome();
      if (runUp) fly(cHome, cHead, runUp);
      thing.quaternion.copy(q);
      setWorld(thing, cHome, 0.001);
      thing.visible = true;
      return new Promise<void>((done) => {
        carry = { thing, w: size[0], h: size[1], t: -runUp / dur, dur, out: false, flown: false, grips: false, done, held: options.held, started: false };
      });
    },
    putAway(thing: Object3D, seconds = 0.6) {
      finishCarry(); // a bring still on its way lands first: then he is holding it
      const held = holding?.thing === thing ? holding : undefined;
      holding = undefined;
      thing.updateWorldMatrix(true, false);
      thing.getWorldPosition(cFrom);
      thing.getWorldQuaternion(cQ);
      world.camera.getWorldPosition(cHead);
      // the draw backwards: he goes to his place straight behind it, and it swings round him behind his back
      drawFrom(cFrom, cQ);
      const runUp = toHome();
      if (runUp) fly(cHome, cHead, runUp);
      return new Promise<void>((done) => {
        carry = { thing, w: held?.w ?? 0, h: held?.h ?? 0, t: -runUp / seconds, dur: seconds, out: true, flown: true, grips: Boolean(held), done, started: false };
      });
    },
    busyHands: () => Boolean(sk || carry || holding),
    sketch(thing: Object3D, paper: { draw(t: number): Tool | null; started: number }) {
      if (!holding || holding.thing !== thing) return Promise.resolve();
      endNow();
      flight = undefined; // the last of the bring's flight round behind it: the sketch moves him from here
      if (!pencilIn) { world.createTransformEntity(pencil); pencilIn = true; }
      const object = punto.object;
      sk = {
        thing, w: holding.w, h: holding.h, paper, t: 0, m: 0, goal: 1, heard: 0, rub: 0, flip: 0,
        tool: { u: 0.5, v: 0.5, eraser: false, down: false }, peekQ: object.quaternion.clone(), smooth: new Vector3(), fresh: true,
      };
      playSound(world, './audio/kit/maximize.ogg', cTo, 0.45); // whoosh
      return new Promise<void>((turned) => { if (sk) sk.turned = turned; });
    },
    endSketch() {
      if (!sk) return Promise.resolve();
      sk.goal = 0;
      sk.turned?.(); sk.turned = undefined;
      playSound(world, './audio/kit/minimize.ogg', cTo, 0.35);
      return new Promise<void>((ended) => { if (sk) sk.ended = ended; else ended(); });
    },
    comeBack() {
      letGo();
      flight = undefined;
      // needsPositionSync false: the Follower flies it back instead of jumping
      if (!entity.hasComponent(Follower)) follow(false);
      return new Promise<void>((done) => { returning = done; });
    },
  }) as SpawnedPunto;
}
