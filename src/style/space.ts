// Punto's look (src/style.ts): space — planets with bands, rings and craters, the sun, the moon, asteroids, a comet,
// a black hole, a rocket, a space station, a satellite and an astronaut (research/concepts/things/01-space.png).
// Things that float in space are centred on their origin; the rocket and the astronaut stand on y = 0. Front is +Z.
import { BoxGeometry, BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, LatheGeometry, Mesh, Vector2, Vector3 } from '@iwsdk/core';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bevelBox, rng } from '../splash/models/kit.js';
import { bands, blob, craters, glowMat, jitter, lit, lumps, slab, turned, merge, mix, PALETTE, ring, taperedTube, toy } from './base.js';

const UP = new Vector3(0, 1, 0);
const named = <T extends { name: string }>(o: T, name: string): T => ((o.name = name), o);
/** A seeded random that does not start near zero for a small seed (the kit's rng does). */
const random = (seed: number) => {
  const r = rng(seed * 7919 + 101);
  for (let i = 0; i < 4; i++) r();
  return r;
};
const lathe = (profile: [number, number][], sides: number) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), sides);

/**
 * A planet `radius` metres, centred: a faceted ball in broad horizontal bands of `colors` (one colour = plain), lit
 * like the islands — lighter on top, darker underneath — with `craters` (a count) and optional `rings` (Saturn-like,
 * tilted, chunky: each band a few straight facets). `detail` 1 (chunky) or 2 (finer, for big bodies). Named moving
 * parts: 'Body' (spin it round Y), 'Rings'. Presets: ringedPlanet, moon, asteroid.
 */
export function planet(options: { radius?: number; colors?: number[]; craters?: number; craterDepth?: number; rings?: boolean | { inner?: number; outer?: number; colors?: number[] }; tilt?: number; seed?: number; rough?: number; detail?: number } = {}): Group {
  const R = options.radius ?? 0.25, seed = options.seed ?? 4, colors = options.colors ?? [PALETTE.blue, PALETTE.green, PALETTE.blue];
  const out = named(new Group(), 'Planet'), g = new Group();
  // broad bands with waving edges; the lower half sinks into the islands' shade
  const body = blob(R, seed, options.detail ?? 2, options.rough ?? 0.04), striped = bands(colors, -R, R, { seed: seed + 9 });
  const pits = options.craters ? craters(options.craters, { seed: seed + 3, depth: options.craterDepth }) : null;
  g.add(toy(pits ? pits.press(body) : body, pits ? pits.paint(striped) : striped, { seed, vary: 0.07, shade: 0.35 }));
  if (pits) g.add(toy(pits.rims(R), lit(mix(colors[0], 0xffffff, 0.15)), { seed, vary: 0.08, shade: 0.3 }));
  out.add(named(merge(g), 'Body'));
  if (options.rings) {
    const o = typeof options.rings === 'object' ? options.rings : {};
    const ringColors = o.colors ?? [PALETTE.yellow, PALETTE.blue];
    const inner = (o.inner ?? 1.4) * R, outer = (o.outer ?? 2.05) * R, step = (outer - inner) / ringColors.length, rg = new Group();
    ringColors.forEach((c, i) => {
      // a band: 18 straight facets, cut a little crooked, lit like the islands; a gap between bands
      const band = jitter(ring(inner + i * step, inner + (i + 1) * step - R * 0.07, R * 0.09, 18), R * 0.025, seed + i);
      rg.add(toy(band, lit(c), { seed: seed + i, vary: 0.1 }));
    });
    const rings = named(merge(rg), 'Rings');
    rings.rotation.set(options.tilt ?? 0.38, 0, 0.22);
    out.add(rings);
  }
  return out;
}

/** A ringed planet: broad red, orange and sand bands, a yellow and a blue ring. ~0.25 m radius, centred. */
export const ringedPlanet = (options: Parameters<typeof planet>[0] = {}) =>
  planet({ colors: [0xc8442e, 0xff8a3a, 0xc8442e], rings: true, detail: 1, rough: 0.07, ...options });

/** A blue-grey moon with craters pressed in (dark floors, light rims). ~0.2 m radius, centred; 'Body'. */
export const moon = (options: Parameters<typeof planet>[0] = {}) =>
  named(planet({ radius: 0.2, colors: [0x8a8ea6], craters: 8, craterDepth: 0.1, detail: 3, rough: 0.03, seed: 6, ...options }), 'Moon');

/** A lumpy brown asteroid with craters. `size` metres across (0.3), centred; 'Body' (tumble it). */
export function asteroid(options: { size?: number; color?: number; seed?: number } = {}): Group {
  const R = (options.size ?? 0.3) / 2, seed = options.seed ?? 8, color = options.color ?? 0x7a5e4c, g = new Group();
  const pits = craters(8, { size: 0.4, depth: 0.12, rim: 0.45, seed: seed + 2 });
  const rock = pits.press(lumps(blob(R, seed, 2, 0.07), 3, { amount: 0.34, seed }));
  const body = new Group().add(toy(rock, pits.paint(color), { seed, vary: 0.14, shade: 0.3 }), toy(pits.rims(R, rock), lit(color, 0.12), { seed, vary: 0.14, shade: 0.3 }));
  body.scale.set(1, 0.85, 0.92);
  g.add(body);
  const out = named(new Group(), 'Asteroid');
  out.add(named(merge(g), 'Body'));
  return out;
}

/**
 * A sun `radius` metres (0.3), centred: a chunky faceted ball in bands, orange below to yellow on top, and a crown of
 * sixteen fat faceted rays round it, long and short in turn, facing +Z (turn it to the player). Named: 'Body' (spin),
 * 'Rays' (turn round Z, pulse its scale).
 */
export function sun(options: { radius?: number; color?: number; rays?: boolean; seed?: number } = {}): Group {
  const R = options.radius ?? 0.3, seed = options.seed ?? 2, out = named(new Group(), 'Sun');
  const hot = options.color ?? 0xffb21a;
  out.add(named(toy(blob(R, seed, 1, 0.05), bands([0xff6a1a, 0xff8f1f, hot], -R, R, { seed }), { seed, vary: 0.1, shade: 0.2 }), 'Body'));
  if (options.rays !== false) {
    const g = new Group();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, len = R * (i % 2 ? 0.32 : 0.5);
      // a flat four-sided wedge pointing out, orange at its foot and yellow at the tip, a little gap from the ball
      const ray = new ConeGeometry(R * 0.15, len, 4);
      ray.scale(1, 1, 0.5);
      ray.translate(0, R * 1.14 + len / 2, 0);
      ray.rotateZ(a - Math.PI / 2);
      g.add(toy(ray, (c) => (Math.hypot(c.x, c.y) < R * 1.14 + len * 0.3 ? 0xff8f1f : hot), { seed: seed + i, vary: 0.1 }));
    }
    out.add(named(merge(g), 'Rays'));
  }
  return out;
}

/** A solar panel w × h lying in the XY plane: a light frame and a few big blue cells on both faces, matte. */
function panel(w: number, h: number, seed: number, colors: { frame?: number; cell?: number } = {}): Mesh {
  const g = new Group(), cols = Math.max(2, Math.round((w / h) * 1.5)), t = Math.min(w, h) * 0.08, tint = colors.cell ?? PALETTE.blue;
  g.add(toy(bevelBox(w, h, t, t * 0.35), lit(colors.frame ?? 0xd9dde4), { seed }));
  const cw = (w * 0.92) / cols;
  // cells on both faces: a real panel has them on one side only, but in the game it is seen from all round
  for (let i = 0; i < cols; i++) for (const side of [-1, 1]) {
    const cell = bevelBox(cw * 0.86, h * 0.78, t * 0.6, t * 0.2);
    cell.translate(-w * 0.46 + cw * (i + 0.5), 0, side * t * 0.35);
    g.add(toy(cell, (_c, n) => (Math.abs(n.z) > 0.5 ? tint : mix(tint, PALETTE.shade, 0.3)), { seed: seed + i + (side > 0 ? 0 : 50), vary: 0.12 }));
  }
  return merge(g);
}

/** A satellite dish of radius r opening towards +Y, its foot at the origin: a chunky eight-sided bowl. */
function dish(r: number, seed: number): Mesh {
  const g = new Group();
  const bowl = lathe([[0, 0], [r * 0.4, r * 0.06], [r, r * 0.4], [r * 0.9, r * 0.44], [r * 0.4, r * 0.18], [0, r * 0.12]], 8);
  bowl.translate(0, r * 0.25, 0);
  g.add(toy(jitter(bowl, r * 0.03, seed), (_c, n) => (n.y > 0.3 ? 0xf2efe6 : 0xb9bec8), { seed, vary: 0.1 }));
  const stem = new CylinderGeometry(r * 0.1, r * 0.14, r * 0.3, 6);
  stem.translate(0, r * 0.13, 0);
  g.add(toy(stem, 0x8d939e, { seed }));
  const mast = new CylinderGeometry(r * 0.04, r * 0.04, r * 0.55, 5);
  mast.translate(0, r * 0.55, 0);
  g.add(toy(mast, 0x8d939e, { seed }));
  const tip = new IcosahedronGeometry(r * 0.1, 0);
  tip.translate(0, r * 0.84, 0);
  g.add(toy(tip, PALETTE.red, { seed }));
  return merge(g);
}

/**
 * A toy satellite `size` metres across its panels (0.6), centred (research/concepts/variants/satellite.png, A): a chunky body —
 * a yellow middle between two blue ends — two orange solar panels in yellow frames on short teal arms ('Panels': turn
 * round X to face the sun), a red dish on the front with a teal feed ('Dish', aim it), a teal antenna with a ball on
 * top. Panels have cells on both faces.
 */
export function satellite(options: { size?: number; seed?: number } = {}): Group {
  const S = options.size ?? 0.6, seed = options.seed ?? 3, out = named(new Group(), 'Satellite'), body = new Group();
  const b = S * 0.2, w = b * 1.35, teal = 0x2fc6c0;
  body.add(toy(bevelBox(w, b, b, b * 0.12, 2), (c, n) => lit(Math.abs(c.x) > w * 0.17 ? PALETTE.blue : PALETTE.yellow)(c, n), { seed, vary: 0.1, shade: 0.2 }));
  // the antenna on top: a red foot, a teal stick, a teal ball
  const foot = turned([[b * 0.14, 0], [b * 0.14, b * 0.1], [0, b * 0.1]], 6);
  foot.translate(0, b / 2, 0);
  body.add(toy(foot, lit(PALETTE.red), { seed }));
  const stick = new CylinderGeometry(b * 0.04, b * 0.04, b * 0.55, 5);
  stick.translate(0, b / 2 + b * 0.36, 0);
  body.add(toy(stick, lit(teal), { seed }));
  const knob = new IcosahedronGeometry(b * 0.1, 0);
  knob.translate(0, b / 2 + b * 0.66, 0);
  body.add(toy(knob, lit(teal), { seed }));
  out.add(named(merge(body), 'Body'));
  const panels = named(new Group(), 'Panels');
  for (const s of [-1, 1]) {
    const arm = toy(new CylinderGeometry(b * 0.07, b * 0.07, S * 0.08, 6), lit(teal));
    arm.rotation.z = Math.PI / 2;
    arm.position.x = s * (w / 2 + S * 0.04);
    panels.add(arm);
    const p = panel(S * 0.32, S * 0.14, seed + (s > 0 ? 1 : 2), { frame: PALETTE.yellow, cell: PALETTE.orange });
    p.rotation.x = -0.35; // standing broad side to the player, tipped back a little
    p.position.x = s * (w / 2 + S * 0.08 + S * 0.16);
    panels.add(p);
  }
  out.add(panels);
  // the dish on the front: a red bowl opening forwards with a teal feed and ball
  const d = named(new Group(), 'Dish'), dg = new Group(), r = b * 0.55;
  const bowl = turned([[0, 0], [r * 0.45, r * 0.08], [r, r * 0.45], [r * 0.9, r * 0.5], [r * 0.42, r * 0.2], [0, r * 0.15]], 9);
  dg.add(toy(jitter(bowl, r * 0.03, seed), (_c, n) => (n.y > 0.3 ? PALETTE.red : mix(PALETTE.red, PALETTE.shade, 0.3)), { seed, vary: 0.1 }));
  const feed = new CylinderGeometry(r * 0.06, r * 0.06, r * 0.7, 5);
  feed.translate(0, r * 0.5, 0);
  dg.add(toy(feed, lit(teal), { seed }));
  const ball = new IcosahedronGeometry(r * 0.14, 0);
  ball.translate(0, r * 0.88, 0);
  dg.add(toy(ball, lit(teal), { seed }));
  d.add(merge(dg));
  d.rotation.x = Math.PI / 2;
  d.position.set(-w * 0.15, -b * 0.05, b / 2 - r * 0.05);
  out.add(d);
  return out;
}

/**
 * A space station `size` metres across its panels (1.0), centred: white modules with blue end rings crossed in a plus,
 * a dish, and four solar panels on a truss. Named: 'Body', 'Panels' (turn round X), 'Dish'.
 */
export function spaceStation(options: { size?: number; seed?: number } = {}): Group {
  const S = options.size ?? 1, seed = options.seed ?? 5, out = named(new Group(), 'Space Station'), g = new Group();
  const r = S * 0.1;
  /** A module: a fat white drum with rounded ends and a blue ring at each end, a grey docking port, `len` along Y. */
  const module = (len: number, x: number, y: number, z: number, rot: [number, number, number], i: number) => {
    const m = new Group(), h = len / 2;
    m.add(toy(turned([[0, -h], [r * 0.7, -h], [r, -h + r * 0.35], [r, h - r * 0.35], [r * 0.7, h], [0, h]], 10), lit(PALETTE.white), { seed: seed + i, vary: 0.06, shade: 0.2 }));
    for (const s of [-1, 1]) {
      const band = turned([[r * 0.95, -len * 0.06], [r * 1.12, -len * 0.05], [r * 1.12, len * 0.05], [r * 0.95, len * 0.06]], 10);
      band.translate(0, s * (h - r * 0.55), 0);
      m.add(toy(band, lit(PALETTE.blue), { seed: seed + i + s, vary: 0.08 }));
      const port = turned([[r * 0.62, 0], [r * 0.55, r * 0.22], [r * 0.4, r * 0.25], [0, r * 0.25]], 8);
      if (s < 0) port.rotateX(Math.PI);
      port.translate(0, s * (h - r * 0.03), 0);
      m.add(toy(port, lit(0x9aa0aa), { seed }));
    }
    m.position.set(x, y, z);
    m.rotation.set(...rot);
    g.add(m);
  };
  module(S * 0.5, 0, 0, 0, [0, 0, 0], 1); // the core, upright
  module(S * 0.4, 0, 0, 0, [0, 0, Math.PI / 2], 2); // across
  module(S * 0.26, 0, S * 0.02, S * 0.13, [Math.PI / 2, 0, 0], 3); // towards the player
  g.add(toy(blob(r * 1.35, seed, 1, 0.05), lit(PALETTE.white), { seed, vary: 0.06 }));
  out.add(named(merge(g), 'Body'));
  // a thick truss over the top with four chunky panels: smaller than the body, so it stays a station
  const panels = named(new Group(), 'Panels');
  const truss = toy(bevelBox(S * 0.86, r * 0.42, r * 0.42, r * 0.1), lit(0x9aa0aa), { seed });
  truss.position.y = S * 0.2;
  panels.add(truss);
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    const p = panel(S * 0.22, S * 0.11, seed + s * 3 + t);
    p.position.set(s * S * 0.31, S * 0.2 + t * S * 0.07, 0);
    panels.add(p);
  }
  out.add(panels);
  // the dish on top of the core, tipped towards the player
  const d = named(dish(r * 1.1, seed + 7), 'Dish');
  d.position.set(0, S * 0.25 + r * 0.2, 0);
  d.rotation.set(0.45, 0, 0);
  out.add(d);
  return out;
}

/**
 * A chunky toy rocket `height` metres (0.6), standing on its fins at y = 0, the nose up: a fat white body lit like the
 * islands, a red nose, a red collar low down, a big blue porthole, four thick red fins, a grey nozzle. 'Flame' hangs
 * below the nozzle (y < 0): hide it on the pad, show and flicker it in flight.
 */
export function rocket(options: { height?: number; color?: number; body?: number; flame?: boolean; seed?: number } = {}): Group {
  const H = options.height ?? 0.6, seed = options.seed ?? 7, red = options.color ?? PALETTE.red, white = options.body ?? PALETTE.white;
  const out = named(new Group(), 'Rocket'), g = new Group(), R = H * 0.19, base = H * 0.1;
  // the body: a fat ogive from the nozzle up to the nose; the top a red cap
  const body = turned([[R * 0.72, 0], [R * 0.95, H * 0.07], [R, H * 0.24], [R * 0.97, H * 0.42], [R * 0.84, H * 0.56], [R * 0.6, H * 0.67], [R * 0.28, H * 0.76], [0, H * 0.81]], 10);
  body.translate(0, base, 0);
  g.add(toy(body, (c, n) => lit(c.y > base + H * 0.56 ? red : white)(c, n), { seed, vary: 0.07, shade: 0.3 }));
  // a red collar low down: its own thick ring round the body
  const collar = turned([[R * 0.9, 0], [R * 1.06, H * 0.01], [R * 1.07, H * 0.06], [R * 0.95, H * 0.07]], 10);
  collar.translate(0, base + H * 0.11, 0);
  g.add(toy(collar, lit(red), { seed: seed + 1, vary: 0.08 }));
  const nozzle = turned([[R * 0.42, 0], [R * 0.78, -H * 0.03], [R * 0.66, H * 0.05], [R * 0.45, H * 0.07]], 8);
  nozzle.translate(0, base - H * 0.03, 0);
  g.add(toy(nozzle, lit(0x8d939e), { seed }));
  // the porthole on the front: a fat blue ring and dark glass with a lighter facet where the light catches it
  const ringGeo = ring(R * 0.24, R * 0.4, R * 0.14, 10), glass = new CylinderGeometry(R * 0.26, R * 0.26, R * 0.08, 10);
  for (const [geo, color] of [[ringGeo, lit(PALETTE.blue)], [glass, (c: Vector3) => (c.x < -R * 0.05 && c.z < -R * 0.05 ? 0x6f9fe0 : 0x23335e)]] as const) {
    const m = toy(geo, color, { seed, vary: 0.08 });
    m.rotation.x = Math.PI / 2;
    m.position.set(0, base + H * 0.38, R * 0.95);
    g.add(m);
  }
  // four thick swept fins round the bottom, chamfered
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = toy(slab([[0, H * 0.3], [R * 1.0, H * 0.12], [R * 1.05, 0], [0, H * 0.06]], R * 0.24), lit(red), { seed: seed + i, vary: 0.08, shade: 0.25 });
    m.position.set(Math.cos(a) * R * 0.7, 0, Math.sin(a) * R * 0.7);
    m.rotation.y = -a;
    g.add(m);
  }
  out.add(named(merge(g), 'Body'));
  const flame = flameCone(R * 0.55, H * 0.26);
  flame.position.y = base - H * 0.05;
  flame.visible = options.flame ?? true;
  out.add(flame);
  return out;
}

/** A glowing flame pointing down from y = 0: an orange outer cone and a yellow core. One mesh named 'Flame'. */
function flameCone(r: number, len: number): Mesh {
  const outer = new ConeGeometry(r, len, 6, 1, true), core = new ConeGeometry(r * 0.55, len * 0.6, 6, 1, true);
  outer.rotateX(Math.PI); outer.translate(0, -len / 2, 0);
  core.rotateX(Math.PI); core.translate(0, -len * 0.3, 0);
  const m = new Mesh(mergeGeometries([outer, core]), glowMat(0xffa63a, 0.85));
  m.name = 'Flame';
  return m;
}

/**
 * A comet `size` metres long (0.6), its icy faceted head at the origin flying towards −Z and a chunky faceted tail
 * streaming back along +Z in a few tongues, in bands: near-white at the head, ice blue, then deep blue at the ends,
 * with a few ice chips along it. Matte, like the islands. Named: 'Head' (tumble it), 'Tail' (wobble its scale).
 */
export function comet(options: { size?: number; color?: number; seed?: number } = {}): Group {
  const S = options.size ?? 0.6, seed = options.seed ?? 12, out = named(new Group(), 'Comet'), r = S * 0.15;
  const ice = options.color ?? 0x6fc6f0;
  // the head: a lumpy faceted lump of ice, lit like the islands
  out.add(named(toy(lumps(blob(r * 1.2, seed, 1, 0.08), 3, { amount: 0.2, seed }), lit(0xe6f6ff, 0.25), { seed, vary: 0.12, shade: 0.25 }), 'Head'));
  // the tail: three fat tongues fanning back, in bands — near-white at the head, ice blue, deep blue at the ends
  const band = (c: Vector3) => (c.z < S * 0.35 ? 0xbfe6fb : c.z < S * 0.9 ? ice : PALETTE.blue);
  const rnd = random(seed + 1), tail = new Group();
  [[0, 0, 0.72, 1.5], [2.1, 0.32, 0.48, 1.05], [4.2, 0.32, 0.46, 0.95]].forEach(([a, spread, thick, long], i) => {
    const L = S * long, pts: Vector3[] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, w = r * spread * (1 + t * 1.6);
      pts.push(new Vector3(Math.cos(a) * w, Math.sin(a) * w + S * 0.08 * t * t, r * 0.2 + L * t));
    }
    tail.add(toy(jitter(taperedTube(pts, r * thick, r * 0.06, 6, 6), r * 0.05, seed + i), band, { seed: seed + i, vary: 0.1 }));
  });
  // a few ice chips flying along it
  for (let i = 0; i < 3; i++) {
    const chip = toy(blob(r * (0.16 + rnd() * 0.08), seed + 30 + i, 0, 0.15), lit(0xdff4ff), { seed: seed + 30 + i });
    chip.position.set((rnd() - 0.5) * r * 3, (rnd() - 0.3) * r * 2.4, S * (0.35 + i * 0.3));
    tail.add(chip);
  }
  out.add(named(merge(tail), 'Tail'));
  return out;
}

/**
 * A black hole `size` metres across its mouth (0.7) (research/concepts/variants/black-hole.png, A): a whirlpool funnel of fat
 * faceted rings in violets and indigos, wide at the top and narrowing down to a twisting tip, a dark hole deep inside
 * its mouth, tipped with the mouth towards the player (+Z). The mouth's centre is the origin, the tip below.
 * Named: 'Funnel' (spin it round its own Y), 'Hole'.
 */
export function blackHole(options: { size?: number; seed?: number } = {}): Group {
  const S = options.size ?? 0.7, R = S / 2, seed = options.seed ?? 9, out = named(new Group(), 'Black Hole'), g = new Group();
  const colours = [0x7e4cd0, 0x5e36b0, 0x6e44c8, 0x4a2e98, 0x5a3aa8, 0x3c2a86, 0x4a3a98, 0x34287a, 0x3e3290, 0x2a2066];
  const n = colours.length, H = S * 0.95;
  for (let i = 0; i < n; i++) {
    // each ring fatter at the top; they shrink and drift a little sideways as they go down, like a twisting tornado
    const t = i / (n - 1), r = R * (1 - 0.82 * t ** 0.8), half = R * 0.16 * (1 - 0.5 * t), y = -H * t ** 1.15;
    const ringGeo = jitter(turned([[r - half * 1.1, 0], [r, -half], [r + half * 0.55, 0], [r, half], [r - half * 1.1, 0]], 12), R * 0.02, seed + i);
    ringGeo.translate(Math.sin(i * 1.3) * R * 0.05 * t, y, Math.cos(i * 1.3) * R * 0.05 * t);
    g.add(toy(ringGeo, lit(colours[i], 0.3), { seed: seed + i, vary: 0.12 }));
  }
  // tipped with its mouth towards the player (+Z), so the dark hole inside shows at eye level
  const tilt = new Group();
  tilt.rotation.x = 0.5;
  out.add(tilt);
  tilt.add(named(merge(g), 'Funnel'));
  // the hole: a dark cone inside the mouth, seen from above as a deep pit
  const hole = turned([[R * 0.86, 0], [R * 0.3, -H * 0.45], [0, -H * 0.62]], 12);
  tilt.add(named(toy(hole, (_c, n) => (n.y > 0.2 ? 0x150d26 : 0x0c0716), { seed, vary: 0.1 }), 'Hole'));
  return out;
}

/**
 * A chunky toy astronaut `height` metres tall (1.7), standing on y = 0, facing +Z: a big round white helmet with a
 * matte gold faceted visor, a rounded padded suit, a backpack, a chest panel with coloured buttons, round orange gloves, chunky orange boots, an orange belt.
 * Moving parts pivot at their joints: 'Head' (neck), 'ArmLeft' / 'ArmRight' (shoulders, hanging down −Y),
 * 'LegLeft' / 'LegRight' (hips).
 */
export function astronaut(options: { height?: number; suit?: number; visor?: number; seed?: number } = {}): Group {
  const H = options.height ?? 1.7, k = H / 1.7, seed = options.seed ?? 21, suit = options.suit ?? PALETTE.white, grey = 0xb4b9c3;
  const out = named(new Group(), 'Astronaut');
  const hip = 0.6 * k, torsoH = 0.5 * k, torsoW = 0.5 * k, depth = 0.36 * k;
  // the torso: a soft rounded block, a padded belt, the backpack, the chest panel
  const torso = new Group();
  const t = bevelBox(torsoW, torsoH, depth, 0.13 * k, 3);
  t.translate(0, hip + torsoH / 2, 0);
  torso.add(toy(t, lit(suit), { seed, vary: 0.05 }));
  const belt = bevelBox(torsoW * 1.04, 0.08 * k, depth * 1.04, 0.035 * k, 2);
  belt.translate(0, hip + 0.05 * k, 0);
  torso.add(toy(belt, lit(PALETTE.orange), { seed }));
  const pack = bevelBox(torsoW * 0.82, torsoH * 0.9, 0.17 * k, 0.06 * k, 2);
  pack.translate(0, hip + torsoH * 0.55, -depth / 2 - 0.075 * k);
  torso.add(toy(pack, (_c, n) => (n.z < -0.5 ? 0xd9dce2 : suit), { seed }));
  const chest = bevelBox(0.22 * k, 0.13 * k, 0.05 * k, 0.018 * k, 2);
  chest.translate(0, hip + torsoH * 0.6, depth / 2);
  torso.add(toy(chest, 0x8d939e, { seed }));
  [PALETTE.red, PALETTE.blue, PALETTE.yellow].forEach((c, i) => {
    const b = new CylinderGeometry(0.017 * k, 0.017 * k, 0.02 * k, 8);
    b.rotateX(Math.PI / 2);
    b.translate((i - 1) * 0.055 * k, hip + torsoH * 0.6, depth / 2 + 0.03 * k);
    torso.add(toy(b, c, { seed: i }));
  });
  out.add(named(merge(torso), 'Body'));
  // the head: a big round helmet, a dark-blue visor on its front, a rounded collar
  const neck = hip + torsoH;
  const head = named(new Group(), 'Head');
  head.position.y = neck;
  const hg = new Group(), hr = 0.3 * k;
  const helmet = new IcosahedronGeometry(hr, 2);
  helmet.translate(0, hr * 0.88, 0);
  hg.add(toy(helmet, lit(suit), { seed: seed + 1, vary: 0.05 }));
  const collar = lathe([[hr * 0.9, 0], [hr * 0.92, 0.06 * k], [hr * 0.8, 0.09 * k], [hr * 0.6, 0.08 * k], [hr * 0.62, 0]], 12);
  collar.translate(0, -0.03 * k, 0);
  hg.add(toy(collar, grey, { seed }));
  head.add(merge(hg));
  // the visor: a faceted gold window on the helmet's front, matte (no mirror), a lighter facet or two where the light catches it
  const visor = new IcosahedronGeometry(hr * 0.8, 1);
  visor.scale(1.05, 0.78, 0.55);
  visor.translate(0, hr * 0.92, hr * 0.62);
  const v = toy(visor, (c, n) => (n.y > 0.4 && c.x < 0 ? 0xffe08a : options.visor ?? 0xe0a030), { seed: seed + 2, vary: 0.12 });
  v.name = 'Visor';
  head.add(v);
  out.add(head);
  // padded limbs: two rounded capsules with a grey ring between, a round glove or a chunky boot at the end
  const limb = (len: number, r: number, s: number, foot: boolean) => {
    const g = new Group(), seg = len * 0.46;
    const upper = new CapsuleGeometry(r, seg - r, 3, 8);
    upper.translate(0, -seg / 2, 0);
    g.add(toy(upper, lit(suit), { seed: seed + s, vary: 0.05 }));
    const ring = new CylinderGeometry(r * 1.08, r * 1.08, len * 0.07, 8);
    ring.translate(0, -seg - len * 0.02, 0);
    g.add(toy(ring, grey, { seed }));
    const lower = new CapsuleGeometry(r * 0.95, seg - r, 3, 8);
    lower.translate(0, -seg * 1.55, 0);
    g.add(toy(lower, lit(suit), { seed: seed + s + 1, vary: 0.05 }));
    if (foot) {
      const boot = bevelBox(r * 2.3, 0.12 * k, r * 3.1, 0.045 * k, 2);
      boot.translate(0, -len + 0.06 * k, r * 0.45);
      g.add(toy(boot, lit(PALETTE.orange), { seed }));
      const sole = bevelBox(r * 2.4, 0.03 * k, r * 3.2, 0.01 * k);
      sole.translate(0, -len + 0.015 * k, r * 0.45);
      g.add(toy(sole, 0x6e737d, { seed }));
    } else {
      const glove = new IcosahedronGeometry(r * 1.25, 1);
      glove.scale(1, 1.1, 0.95);
      glove.translate(0, -len - r * 0.2, 0);
      g.add(toy(glove, lit(PALETTE.orange), { seed, vary: 0.06 }));
    }
    return merge(g);
  };
  for (const s of [-1, 1]) {
    const arm = named(new Group(), s < 0 ? 'ArmLeft' : 'ArmRight');
    arm.position.set(s * (torsoW / 2 + 0.05 * k), neck - 0.09 * k, 0);
    arm.rotation.z = s * 0.2;
    arm.add(limb(0.42 * k, 0.075 * k, s, false));
    out.add(arm);
    const leg = named(new Group(), s < 0 ? 'LegLeft' : 'LegRight');
    leg.position.set(s * torsoW * 0.25, hip + 0.02 * k, 0);
    leg.add(limb(hip + 0.02 * k, 0.095 * k, s + 4, true));
    out.add(leg);
  }
  return out;
}
