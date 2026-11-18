// Punto's look (src/style.ts): spaceships, each brought to the islands' look one by one beside the island
// (/research/stands/things.html?only=island,fighter&big). Built only on the base (src/style/base.ts). A ship is centred, its nose to
// −Z; `size` is its length in metres. Static parts are one mesh ('Hull'); 'Engines' glow (flicker them for thrust);
// 'Muzzle' empties mark where shots leave.
import { type BufferGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { bevelBox } from '../splash/models/kit.js';
import { block, blob, exhaust, flat, forward, glowMat, hull, lit, merge, mirrored, mix, PALETTE, ring, slab, toy, turned, upright } from './base.js';

/** A ship's options: its length in metres, its main and accent colours, a seed. */
export interface ShipOptions { size?: number; color?: number; accent?: number; seed?: number }

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);
/** A seeded random number from 0 to 1. */
const random = (seed: number) => () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);

/**
 * A chunky sci-fi fighter `size` metres long (0.6), centred, nose to −Z (research/concepts/things/02-spaceships.png, Fighter):
 * an angular wedge hull, grey-blue on top and steel blue on the sides, a needle on the nose, an angular cockpit of
 * dark glass, dark air intakes on its flanks, swept wings with orange tip caps and orange blocks at their roots, three
 * engines at the back with glowing cyan thrust cones ('Engines'), a gun under each wing ('Muzzle').
 */
export function fighter(options: ShipOptions = {}): Group {
  const L = options.size ?? 0.6, seed = options.seed ?? 1, main = options.color ?? 0x4f78c0, accent = options.accent ?? PALETTE.orange;
  const top = 0xb8c4d8, glass = 0x24305a, g = new Group(), out = named(new Group(), 'Fighter');
  const paint = (c: number, topColour = c) => (_c: Vector3, n: Vector3) => (n.y > 0.55 ? topColour : n.y < -0.55 ? mix(c, PALETTE.shade, 0.35) : mix(c, PALETTE.shade, 0.12));
  // the hull: an angular wedge from the nose back to the engines
  g.add(toy(hull([[-0.5 * L, 0, 0, 0], [-0.33 * L, 0.075 * L, 0.055 * L, 0.04 * L], [-0.08 * L, 0.13 * L, 0.09 * L, 0.065 * L], [0.22 * L, 0.16 * L, 0.1 * L, 0.07 * L], [0.4 * L, 0.15 * L, 0.095 * L, 0.07 * L]]), paint(main, top), { seed, vary: 0.08 }));
  // a needle on the nose
  const needle = forward(new CylinderGeometry(0.004 * L, 0.008 * L, 0.1 * L, 5));
  needle.translate(0, 0, -0.52 * L);
  g.add(toy(needle, 0x6e737d, { seed }));
  // the cockpit: a smaller angular hull of dark glass sitting on the top, a light frame round its foot
  const cockpit = hull([[-0.26 * L, 0, 0, 0], [-0.14 * L, 0.06 * L, 0.05 * L, 0], [0.04 * L, 0.07 * L, 0.065 * L, 0], [0.12 * L, 0.065 * L, 0.045 * L, 0]], { shoulder: 0.55 });
  cockpit.translate(0, 0.085 * L, 0);
  g.add(toy(cockpit, (c, n) => (n.y > 0.35 || n.z < -0.4 ? glass : top), { seed: seed + 1, vary: 0.1 }));
  // a block behind the cockpit and dark intakes on the flanks
  const spine = bevelBox(0.1 * L, 0.05 * L, 0.18 * L, 0.01 * L);
  spine.translate(0, 0.12 * L, 0.2 * L);
  g.add(toy(spine, paint(main, top), { seed }));
  for (const side of [-1, 1]) {
    const intake = bevelBox(0.035 * L, 0.05 * L, 0.11 * L, 0.008 * L);
    intake.translate(side * 0.15 * L, 0.01 * L, 0.02 * L);
    g.add(toy(intake, glass, { seed }));
    // the wing: swept back, steel blue, an orange cap on its tip and an orange block at its root
    const wing: [number, number][] = [[0.12 * L, 0.04 * L], [0.42 * L, -0.13 * L], [0.42 * L, -0.24 * L], [0.12 * L, -0.3 * L]];
    const w = flat(slab(side > 0 ? wing : mirrored(wing), 0.05 * L));
    g.add(toy(w, paint(main, mix(main, top, 0.4)), { seed: seed + 2 + side, vary: 0.08 }));
    const cap = bevelBox(0.06 * L, 0.06 * L, 0.12 * L, 0.01 * L);
    cap.translate(side * 0.415 * L, 0, 0.18 * L);
    g.add(toy(cap, lit(accent), { seed }));
    const root = bevelBox(0.07 * L, 0.05 * L, 0.07 * L, 0.01 * L);
    root.translate(side * 0.19 * L, 0.05 * L, 0.12 * L);
    g.add(toy(root, lit(accent), { seed }));
    // a gun under the wing
    const gun = forward(new CylinderGeometry(0.012 * L, 0.016 * L, 0.14 * L, 6));
    gun.translate(side * 0.27 * L, -0.04 * L, -0.02 * L);
    g.add(toy(gun, lit(0x6e737d), { seed }));
    const muzzle = named(new Object3D(), 'Muzzle');
    muzzle.position.set(side * 0.27 * L, -0.04 * L, -0.09 * L);
    out.add(muzzle);
  }
  // three engines at the back: grey pods with a dark ring
  const pods: [number, number, number][] = [[0, 0.09 * L, 0.06 * L], [-0.12 * L, 0, 0.06 * L], [0.12 * L, 0, 0.06 * L]];
  for (const [x, y, r] of pods) {
    const pod = forward(turned([[0, -0.1 * L], [r * 0.8, -0.1 * L], [r, -0.06 * L], [r, 0.1 * L], [0, 0.1 * L]], 8));
    pod.translate(x, y, 0.38 * L);
    g.add(toy(pod, (c, n) => (c.z > 0.42 * L ? 0x3a3f4a : lit(0x8d96a8)(c, n)), { seed: seed + 5, vary: 0.08 }));
  }
  out.add(named(merge(g), 'Hull'));
  // the thrust: glowing cyan cones out of the engines — only these shine
  const engines = new Group();
  for (const [x, y, r] of pods) {
    const flame = new Mesh(new ConeGeometry(r * 0.85, 0.16 * L, 6), glowMat(0x9ff4ff));
    flame.rotation.x = -Math.PI / 2; // the point backwards (+Z)
    flame.position.set(x, y, 0.56 * L);
    engines.add(flame);
  }
  out.add(named(engines, 'Engines'));
  return out;
}

/* ------------------------------------------------------------ shared by the ships below */

/** Two-tone ship paint: `topColour` on the facets facing up, `c` on the sides, darker underneath. */
const tone = (c: number, topColour = c) => (_c: Vector3, n: Vector3) => (n.y > 0.55 ? topColour : n.y < -0.55 ? mix(c, PALETTE.shade, 0.35) : mix(c, PALETTE.shade, 0.12));
/** A ship: its static parts merged into 'Hull', its thrust cones in 'Engines', anything else added by `extra`. */
function ship(name: string, parts: (g: Group, engines: Group, out: Group) => void): Group {
  const g = new Group(), engines = named(new Group(), 'Engines'), out = named(new Group(), name);
  parts(g, engines, out);
  out.add(named(merge(g), 'Hull'), engines);
  return out;
}
const muzzleAt = (out: Group, x: number, y: number, z: number) => { const m = named(new Object3D(), 'Muzzle'); m.position.set(x, y, z); out.add(m); };
/** An engine pod laid along the ship, its back end at z: grey with a dark ring at the back, a thrust cone behind. */
function pod(g: Group, engines: Group, x: number, y: number, z: number, r: number, len: number, seed: number, colour = 0x8d96a8): void {
  const geo = forward(turned([[0, -len / 2], [r * 0.8, -len / 2], [r, -len * 0.3], [r, len / 2], [0, len / 2]], 8));
  geo.translate(x, y, z - len / 2);
  g.add(toy(geo, (c, n) => (c.z > z - len * 0.12 ? 0x3a3f4a : lit(colour)(c, n)), { seed, vary: 0.08 }));
  const e = exhaust(r * 0.85, r * 2.6);
  e.position.set(x, y, z);
  engines.add(e);
}

/**
 * A heavy bomber `size` metres long (0.7), nose to −Z (research/concepts/things/02-spaceships.png, Bomber): a boxy olive body
 * with a big brown plate on its back, a framed blue glass cockpit on the nose and a gun under it, long straight wings
 * with brown panels, yellow tips and dark pods under them, square yellow-framed intakes at the wing roots, small yellow
 * blocks on top, two boxy tail booms with brown stripes ending in tall fins with yellow tips, a tailplane between them.
 */
export function bomber(options: ShipOptions = {}): Group {
  const L = options.size ?? 0.7, seed = options.seed ?? 2, olive = options.color ?? 0x7c9a3c, yellow = options.accent ?? 0xe8c030;
  const brown = 0x8a5a36, glass = 0x3a5ab0, dark = 0x2a2e38;
  const olivePaint = tone(olive, mix(olive, 0xffffff, 0.08));
  return ship('Bomber', (g, engines, out) => {
    // the body: boxy, wide shoulders
    g.add(toy(hull([[-0.48 * L, 0.03 * L, 0.02 * L, 0.03 * L], [-0.42 * L, 0.075 * L, 0.06 * L, 0.07 * L], [-0.28 * L, 0.11 * L, 0.11 * L, 0.09 * L], [0.06 * L, 0.12 * L, 0.12 * L, 0.09 * L], [0.22 * L, 0.095 * L, 0.1 * L, 0.075 * L], [0.3 * L, 0.06 * L, 0.07 * L, 0.05 * L]], { shoulder: 0.82 }), olivePaint, { seed, vary: 0.08 }));
    // the cockpit: a smaller hull over the nose, blue panes on top and in front, olive frame round its foot
    const cockpit = hull([[-0.46 * L, 0, 0, 0], [-0.41 * L, 0.065 * L, 0.05 * L, 0], [-0.3 * L, 0.095 * L, 0.08 * L, 0], [-0.2 * L, 0.095 * L, 0.07 * L, 0]], { shoulder: 0.7 });
    cockpit.translate(0, 0.06 * L, 0);
    g.add(toy(cockpit, (c, n) => ((n.y > 0.25 || n.z < -0.35) && Math.abs(c.x) > 0.006 * L ? (n.y > 0.7 && c.x < 0 ? 0x6f9ae8 : glass) : olive), { seed: seed + 1, vary: 0.06 }));
    // the big brown plate on its back and two yellow blocks before it
    g.add(toy(block(0.19 * L, 0.035 * L, 0.32 * L, [0, 0.13 * L, 0.0]), tone(brown, mix(brown, 0xffffff, 0.08)), { seed: seed + 2 }));
    for (const side of [-1, 1]) g.add(toy(block(0.045 * L, 0.035 * L, 0.05 * L, [side * 0.075 * L, 0.135 * L, -0.19 * L]), lit(yellow), { seed }));
    // a gun under the nose
    g.add(toy(forward(new CylinderGeometry(0.007 * L, 0.01 * L, 0.1 * L, 5)).translate(0, -0.035 * L, -0.5 * L), lit(0x5a5f6a), { seed }));
    muzzleAt(out, 0, -0.035 * L, -0.55 * L);
    for (const side of [-1, 1]) {
      const x = (v: number) => side * v * L;
      // the wing: long and straight, brown panels on top, a yellow tip, a dark pod underneath
      const wing: [number, number][] = [[0.1 * L, 0.08 * L], [0.56 * L, 0.06 * L], [0.56 * L, -0.12 * L], [0.1 * L, -0.14 * L]];
      g.add(toy(flat(slab(side > 0 ? wing : mirrored(wing), 0.045 * L)).translate(0, 0.01 * L, 0), (c, n) => {
        const ax = Math.abs(c.x);
        return n.y > 0.5 && ((ax > 0.2 * L && ax < 0.28 * L) || (ax > 0.36 * L && ax < 0.5 * L)) && c.z > -0.09 * L && c.z < 0.04 * L ? mix(brown, 0xffffff, 0.06) : olivePaint(c, n);
      }, { seed: seed + 3 + side, vary: 0.07 }));
      g.add(toy(block(0.05 * L, 0.055 * L, 0.17 * L, [x(0.575), 0.01 * L, -0.02 * L]), lit(yellow), { seed }));
      g.add(toy(forward(turned([[0, -0.04 * L], [0.022 * L, -0.03 * L], [0.022 * L, 0.03 * L], [0, 0.04 * L]], 6)).translate(x(0.45), -0.03 * L, -0.04 * L), lit(dark), { seed }));
      // the intake at the wing root: a yellow frame round a dark square
      g.add(toy(block(0.1 * L, 0.1 * L, 0.12 * L, [x(0.15), 0.01 * L, -0.12 * L]), lit(yellow), { seed }));
      g.add(toy(block(0.07 * L, 0.07 * L, 0.02 * L, [x(0.15), 0.01 * L, -0.182 * L]), dark, { seed }));
      g.add(toy(block(0.04 * L, 0.03 * L, 0.05 * L, [x(0.17), 0.05 * L, 0.02 * L]), lit(yellow), { seed }));
      // the boom back from the wing, a brown stripe along its top, a tall fin with a yellow tip at its end
      g.add(toy(block(0.065 * L, 0.06 * L, 0.46 * L, [x(0.3), 0.02 * L, 0.24 * L]), olivePaint, { seed: seed + 5 }));
      g.add(toy(block(0.045 * L, 0.012 * L, 0.36 * L, [x(0.3), 0.055 * L, 0.22 * L]), tone(brown), { seed }));
      g.add(toy(upright(slab([[0.36 * L, 0], [0.5 * L, 0], [0.5 * L, 0.2 * L], [0.43 * L, 0.2 * L]], 0.04 * L)).translate(x(0.3), 0.04 * L, 0), olivePaint, { seed: seed + 6 }));
      g.add(toy(block(0.045 * L, 0.04 * L, 0.08 * L, [x(0.3), 0.25 * L, 0.465 * L]), lit(yellow), { seed }));
    }
    // the tailplane joining the booms, a brown stripe on it
    g.add(toy(block(0.6 * L, 0.035 * L, 0.08 * L, [0, 0.14 * L, 0.44 * L]), olivePaint, { seed: seed + 7 }));
    g.add(toy(block(0.4 * L, 0.01 * L, 0.04 * L, [0, 0.16 * L, 0.44 * L]), tone(brown), { seed }));
    // two small engines at the back of the body
    for (const side of [-1, 1]) {
      const e = exhaust(0.025 * L, 0.06 * L);
      e.position.set(side * 0.03 * L, 0.0, 0.3 * L);
      engines.add(e);
    }
  });
}

/**
 * A fast scout `size` metres long (0.5), nose to −Z (research/concepts/things/02-spaceships.png, Scout): a broad white delta
 * wing with a red band across each half, a raised red spine with white flanks, a framed cyan canopy, cyan sensor
 * blocks, gun prongs at the nose and wing tips, two tall antennas rising from the back, one round engine.
 */
export function scout(options: ShipOptions = {}): Group {
  const L = options.size ?? 0.5, seed = options.seed ?? 3, red = options.color ?? 0xe0453a, cyan = options.accent ?? 0x4fd8d0, white = 0xeeece6;
  return ship('Scout', (g, engines, out) => {
    // the delta wing: from just behind the nose out to wide tips at the back; a red band across each half on top
    const wing: [number, number][] = [[0.02 * L, 0.36 * L], [0.5 * L, -0.3 * L], [0.5 * L, -0.42 * L], [0.02 * L, -0.4 * L]];
    for (const side of [-1, 1]) {
      g.add(toy(flat(slab(side > 0 ? wing : mirrored(wing), 0.05 * L)), tone(white), { seed: seed + side, vary: 0.06 }));
      // the red band: its own thin plate lying on the wing, parallel to the swept leading edge
      const band: [number, number][] = [[0.17 * L, 0.1 * L], [0.45 * L, -0.28 * L], [0.3 * L, -0.28 * L], [0.04 * L, 0.06 * L], [0.04 * L, 0.1 * L]];
      g.add(toy(flat(slab(side > 0 ? band : mirrored(band), 0.014 * L, 0.2)).translate(0, 0.028 * L, 0), tone(red), { seed: seed + 2 + side, vary: 0.06 }));
      // a gun prong at the wing tip, a cyan sensor block on the wing
      g.add(toy(forward(new CylinderGeometry(0.009 * L, 0.012 * L, 0.16 * L, 5)).translate(side * 0.48 * L, 0, 0.24 * L), lit(0x8d939e), { seed }));
      muzzleAt(out, side * 0.48 * L, 0, 0.16 * L);
      g.add(toy(block(0.07 * L, 0.035 * L, 0.06 * L, [side * 0.24 * L, 0.035 * L, 0.2 * L]), (c, n) => (n.y > 0.5 ? cyan : tone(white)(c, n)), { seed }));
      // a tall antenna rising from the back, leaning back and out, a ball at its tip
      const ant = new CylinderGeometry(0.009 * L, 0.014 * L, 0.36 * L, 6);
      ant.translate(0, 0.18 * L, 0);
      ant.rotateX(0.55);
      ant.rotateZ(side * -0.18);
      ant.translate(side * 0.05 * L, 0.09 * L, 0.18 * L);
      g.add(toy(ant, lit(0x8d939e), { seed }));
    }
    // the spine: a raised hull, red on top, white on its flanks
    g.add(toy(hull([[-0.5 * L, 0, 0, 0], [-0.32 * L, 0.06 * L, 0.06 * L, 0.03 * L], [0.0, 0.1 * L, 0.1 * L, 0.04 * L], [0.3 * L, 0.11 * L, 0.1 * L, 0.04 * L], [0.4 * L, 0.09 * L, 0.08 * L, 0.04 * L]], { shoulder: 0.72 }), tone(white, red), { seed: seed + 3, vary: 0.06 }));
    // the canopy: an angular hull of cyan glass with a white frame round its foot
    const canopy = hull([[-0.28 * L, 0, 0, 0], [-0.17 * L, 0.05 * L, 0.05 * L, 0], [0.02 * L, 0.06 * L, 0.06 * L, 0], [0.08 * L, 0.05 * L, 0.03 * L, 0]], { shoulder: 0.55 });
    canopy.translate(0, 0.085 * L, 0);
    g.add(toy(canopy, (c, n) => (n.y > 0.2 || n.z < -0.4 ? (n.y > 0.7 && c.x < 0 ? 0xbff8f4 : 0x3fb8c0) : white), { seed: seed + 4, vary: 0.06 }));
    g.add(toy(block(0.05 * L, 0.025 * L, 0.05 * L, [0, 0.12 * L, 0.16 * L]), (c, n) => (n.y > 0.5 ? cyan : tone(white)(c, n)), { seed }));
    // a gun prong under the nose
    g.add(toy(forward(new CylinderGeometry(0.007 * L, 0.01 * L, 0.12 * L, 5)).translate(0, -0.01 * L, -0.52 * L), lit(0x8d939e), { seed }));
    // the engine: a round nozzle at the back of the spine
    pod(g, engines, 0, 0.04 * L, 0.48 * L, 0.07 * L, 0.14 * L, seed, 0x9a8a7a);
  });
}

/**
 * A cruiser `size` metres long (1.0), nose to −Z (research/concepts/things/02-spaceships.png, Cruiser): a stubby boxy navy
 * hull with a blunt dark-faced nose, two prongs and a chin plate under it, mauve armour bands across it with rivets,
 * pink windows along its flanks, purple hatches on its foredeck, a raised rear deck with a bridge — a cyan window strip
 * and a flat command plate with two antennas — big boxy engine pods on its flanks and round engines at the back.
 */
export function cruiser(options: ShipOptions = {}): Group {
  const L = options.size ?? 1, seed = options.seed ?? 4, navy = options.color ?? 0x3a4676, pink = options.accent ?? 0xd07ad8;
  const mauve = 0xa8909e, deep = 0x262c4a, cyan = 0x5ad8e0, metal = 0x8d939e;
  const navyPaint = tone(navy, mix(navy, 0xffffff, 0.12)), mauvePaint = tone(mauve, mix(mauve, 0xffffff, 0.1));
  return ship('Cruiser', (g, engines, out) => {
    // the hull: a blunt box, a dark face on its nose
    g.add(toy(hull([[-0.5 * L, 0.1 * L, 0.06 * L, 0.06 * L], [-0.42 * L, 0.13 * L, 0.1 * L, 0.09 * L], [0.3 * L, 0.14 * L, 0.11 * L, 0.09 * L], [0.38 * L, 0.13 * L, 0.1 * L, 0.09 * L]], { shoulder: 0.86 }), (c, n) => (n.z < -0.6 ? deep : navyPaint(c, n)), { seed, vary: 0.07 }));
    // two prongs and a mauve chin plate under the nose
    for (const x of [-0.05, 0.05]) g.add(toy(forward(new CylinderGeometry(0.008 * L, 0.012 * L, 0.12 * L, 5)).translate(x * L, -0.06 * L, -0.52 * L), lit(metal), { seed }));
    muzzleAt(out, 0, -0.06 * L, -0.58 * L);
    g.add(toy(block(0.18 * L, 0.03 * L, 0.14 * L, [0, -0.1 * L, -0.38 * L]), mauvePaint, { seed }));
    // mauve armour bands across the hull, a row of rivets on each
    for (const z of [-0.24, -0.1, 0.04]) {
      g.add(toy(block(0.3 * L, 0.21 * L, 0.07 * L, [0, 0.0, z * L]), mauvePaint, { seed: seed + 1 }));
      for (const side of [-1, 1]) for (const y of [-0.04, 0.04]) g.add(toy(blob(0.008 * L, seed, 0, 0.1).translate(side * 0.152 * L, y * L, z * L), lit(0xd8d0cc), { seed }));
    }
    // pink windows low along the flanks, purple hatches on the foredeck
    for (const side of [-1, 1]) {
      g.add(toy(block(0.03 * L, 0.06 * L, 0.2 * L, [side * 0.145 * L, -0.05 * L, 0.18 * L]), mauvePaint, { seed }));
      for (const z of [0.11, 0.16, 0.21, 0.26]) g.add(toy(block(0.01 * L, 0.025 * L, 0.03 * L, [side * 0.162 * L, -0.05 * L, z * L]), lit(pink), { seed }));
    }
    for (const [x, z] of [[-0.05, -0.36], [0.05, -0.36], [0, -0.3]]) g.add(toy(block(0.05 * L, 0.02 * L, 0.04 * L, [x * L, 0.11 * L, z * L]), lit(0x9a5ae0), { seed }));
    g.add(toy(block(0.16 * L, 0.02 * L, 0.1 * L, [0, 0.11 * L, -0.42 * L]), mauvePaint, { seed }));
    // the raised rear deck, the bridge on it: a cyan window strip, a flat command plate, two antennas
    g.add(toy(block(0.22 * L, 0.09 * L, 0.38 * L, [0, 0.14 * L, 0.14 * L]), navyPaint, { seed: seed + 2 }));
    for (const z of [0.0, 0.08]) g.add(toy(block(0.225 * L, 0.02 * L, 0.025 * L, [0, 0.17 * L, z * L]), lit(deep), { seed }));
    g.add(toy(block(0.13 * L, 0.07 * L, 0.14 * L, [0, 0.22 * L, 0.2 * L]), mauvePaint, { seed: seed + 3 }));
    g.add(toy(block(0.135 * L, 0.02 * L, 0.02 * L, [0, 0.23 * L, 0.13 * L]), lit(cyan), { seed }));
    const plate = flat(slab([[-0.09 * L, 0.06 * L], [0.09 * L, 0.06 * L], [0.07 * L, -0.06 * L], [-0.07 * L, -0.06 * L]], 0.025 * L));
    plate.translate(0, 0.27 * L, 0.22 * L);
    g.add(toy(plate, (c, n) => (n.y > 0.5 ? mix(mauve, 0xffffff, 0.15) : lit(cyan)(c, n)), { seed }));
    for (const x of [-0.04, 0.04]) g.add(toy(new CylinderGeometry(0.005 * L, 0.007 * L, 0.1 * L, 5).translate(x * L, 0.33 * L, 0.24 * L), lit(metal), { seed }));
    // big boxy engine pods on the flanks: navy, a mauve cap, a pink panel, a round engine at the back
    for (const side of [-1, 1]) {
      g.add(toy(block(0.13 * L, 0.13 * L, 0.3 * L, [side * 0.21 * L, 0.03 * L, 0.2 * L]), navyPaint, { seed: seed + 4 }));
      g.add(toy(block(0.135 * L, 0.135 * L, 0.05 * L, [side * 0.21 * L, 0.03 * L, 0.06 * L]), mauvePaint, { seed }));
      g.add(toy(block(0.01 * L, 0.04 * L, 0.12 * L, [side * 0.278 * L, 0.04 * L, 0.2 * L]), lit(pink), { seed }));
      pod(g, engines, side * 0.21 * L, 0.03 * L, 0.42 * L, 0.05 * L, 0.08 * L, seed + 5, 0xb08a9a);
    }
    for (const x of [-0.06, 0.06]) pod(g, engines, x * L, 0.02 * L, 0.44 * L, 0.05 * L, 0.1 * L, seed + 6, 0xb08a9a);
  });
}

/**
 * A mothership `size` metres long (1.4), nose to −Z (research/concepts/things/02-spaceships.png, Mothership): a ziggurat of
 * thin arrow-shaped layers — dark, gold and purple in turn, each smaller than the one below — rows of docking pads
 * sticking out of its flanks, pink glowing slots under the bottom layer, lavender deck panels, a stepped round bridge
 * with antennas on top, big purple engine domes at the back.
 */
export function mothership(options: ShipOptions = {}): Group {
  const L = options.size ?? 1.4, seed = options.seed ?? 5, gold = options.color ?? 0xd9a441, purple = options.accent ?? 0x6a3ab8;
  const dark = 0x2c2640, lavender = 0x9a8ac8;
  const arrow: [number, number][] = [[0, 0.5], [-0.18, 0.15], [-0.24, -0.3], [-0.2, -0.45], [0.2, -0.45], [0.24, -0.3], [0.18, 0.15]];
  return ship('Mothership', (g, engines, out) => {
    // the layers: [scale, thickness, height, colour], from the bottom up
    const layers: [number, number, number, number][] = [[1, 0.04, 0, dark], [0.97, 0.05, 0.045, gold], [0.86, 0.03, 0.085, purple], [0.8, 0.05, 0.123, gold], [0.64, 0.03, 0.161, dark], [0.58, 0.05, 0.199, gold], [0.42, 0.032, 0.238, purple]];
    layers.forEach(([k, t, y, colour], n) => {
      const layer = flat(slab(arrow.map(([x, z]) => [x * k * L, (z * k + (1 - k) * -0.08) * L] as [number, number]), t * L, 0.25));
      layer.translate(0, y * L, 0);
      g.add(toy(layer, tone(colour, mix(colour, 0xffffff, 0.12)), { seed: seed + n, vary: 0.06 }));
    });
    // lavender panels and purple blocks on the decks
    for (const [w, d, x, y, z] of [[0.16, 0.2, 0, 0.152, -0.14], [0.09, 0.08, -0.12, 0.152, 0.12], [0.09, 0.08, 0.12, 0.152, 0.12]]) g.add(toy(block(w * L, 0.012 * L, d * L, [x * L, y * L, z * L]), lit(lavender), { seed }));
    for (const x of [-0.1, -0.03, 0.04, 0.11]) g.add(toy(block(0.035 * L, 0.03 * L, 0.03 * L, [x * L, 0.24 * L, 0.06 * L]), lit(purple), { seed }));
    // docking pads along the flanks: gold frames with lavender tops, sticking out sideways
    for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
      const z = (-0.22 + k * 0.13) * L, x = side * (0.27 + (k > 1 ? 0.02 : 0)) * L, y = (k % 2 ? 0.065 : 0.02) * L;
      g.add(toy(block(0.12 * L, 0.022 * L, 0.065 * L, [x, y, z]), tone(gold), { seed: seed + k }));
      g.add(toy(block(0.09 * L, 0.01 * L, 0.045 * L, [x, y + 0.014 * L, z]), lit(lavender), { seed }));
    }
    // pink glowing slots under the bottom layer
    for (const x of [-0.12, -0.04, 0.04, 0.12]) engines.add(new Mesh(block(0.05 * L, 0.006 * L, 0.02 * L, [x * L, -0.018 * L, -0.12 * L]), glowMat(0xff8ad8)));
    // the bridge: stepped round tiers, dark windows in the middle one, two towers and an antenna
    [[0.12, 0.035, 0.27, gold], [0.1, 0.035, 0.305, dark], [0.08, 0.035, 0.34, purple], [0.06, 0.03, 0.375, gold]].forEach(([r, h, y, colour], n) => {
      const tier = turned([[r * L, 0], [r * L, h * L], [0, h * L]], 8);
      tier.translate(0, y * L, 0.14 * L);
      g.add(toy(tier, n === 1 ? (c: Vector3, nn: Vector3) => (Math.abs(nn.y) < 0.5 ? 0x24305a : dark) : tone(colour, mix(colour, 0xffffff, 0.12)), { seed: seed + 10 + n }));
    });
    for (const x of [-0.025, 0.025]) g.add(toy(block(0.03 * L, 0.05 * L, 0.03 * L, [x * L, 0.43 * L, 0.14 * L]), tone(dark), { seed }));
    g.add(toy(new CylinderGeometry(0.004 * L, 0.006 * L, 0.1 * L, 5).translate(0.03 * L, 0.49 * L, 0.15 * L), lit(0xb4b9c3), { seed }));
    // big purple engine domes at the back
    for (const x of [-0.13, 0.13]) {
      const dome = blob(0.085 * L, seed + 20, 1, 0.04);
      dome.scale(1, 1, 0.9);
      dome.translate(x * L, 0.1 * L, 0.42 * L);
      g.add(toy(dome, lit(purple, 0.25), { seed: seed + 20, vary: 0.08 }));
      const e = exhaust(0.05 * L, 0.12 * L, 0xd6a8ff);
      e.position.set(x * L, 0.1 * L, 0.5 * L);
      engines.add(e);
    }
    muzzleAt(out, 0, 0.02 * L, -0.5 * L);
  });
}

/**
 * An alien flying saucer `size` metres across (0.6), centred (research/concepts/things/02-spaceships.png, Alien Saucer): a thick
 * disc whose facets shimmer green, teal, lime and violet, a purple band round its rim, a faceted green dome in a purple
 * collar on top, a cluster of dark crystals hanging underneath round a teal glow ring.
 */
export function alienSaucer(options: ShipOptions = {}): Group {
  const D = options.size ?? 0.6, R = D / 2, seed = options.seed ?? 6, purple = options.accent ?? 0x8a4ad0;
  const shimmer = options.color ? [options.color, mix(options.color, 0xffffff, 0.2), mix(options.color, 0x3fc0b0, 0.4)] : [0x34c070, 0x22a8a0, 0x8ccf3a, 0x4a8ad8, 0x2fbf88];
  // each facet its own colour from the shimmer, by its angle round the disc and its height
  const iridescent = (c: Vector3, n: Vector3) => {
    const k = Math.floor(((Math.atan2(c.z, c.x) / Math.PI + 1) * 7 + c.y / R * 6) % shimmer.length + shimmer.length) % shimmer.length;
    return n.y < -0.3 ? mix(shimmer[k], PALETTE.shade, 0.35) : shimmer[k];
  };
  return ship('Alien Saucer', (g, engines) => {
    g.add(toy(turned([[0, -0.1 * R], [0.55 * R, -0.12 * R], [0.95 * R, -0.03 * R], [0.98 * R, 0.03 * R], [0.55 * R, 0.2 * R], [0.45 * R, 0.22 * R], [0, 0.22 * R]], 20), iridescent, { seed, vary: 0.1 }));
    g.add(toy(turned([[0.96 * R, -0.045 * R], [1.02 * R, -0.02 * R], [1.02 * R, 0.02 * R], [0.96 * R, 0.045 * R]], 20), lit(purple), { seed }));
    g.add(toy(turned([[0.48 * R, 0.19 * R], [0.48 * R, 0.27 * R], [0.38 * R, 0.27 * R]], 16), lit(purple), { seed }));
    g.add(toy(turned([[0.4 * R, 0.25 * R], [0.38 * R, 0.4 * R], [0.3 * R, 0.52 * R], [0.16 * R, 0.6 * R], [0, 0.62 * R]], 14), iridescent, { seed: seed + 1, vary: 0.1 }));
    // dark crystals hanging underneath, a teal glow ring among them
    const r = random(seed);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, d = k === 6 ? 0 : R * (0.28 + r() * 0.12), len = R * (k === 6 ? 0.55 : 0.32 + r() * 0.16);
      const crystal = new ConeGeometry(R * 0.11, len, 4);
      crystal.rotateX(Math.PI);
      crystal.translate(Math.cos(a) * d, -0.1 * R - len / 2, Math.sin(a) * d);
      g.add(toy(crystal, lit(0x23404a, 0.3), { seed: seed + k, vary: 0.12 }));
    }
    const glow = new Mesh(ring(R * 0.22, R * 0.3, R * 0.02, 14), glowMat(0x6ff3e0));
    glow.position.y = -0.13 * R;
    engines.add(glow);
  });
}

/**
 * A cargo hauler `size` metres long (0.9), nose to −Z (research/concepts/things/02-spaceships.png, Cargo Hauler): one chunky
 * rust-brown ship — an angular cab with a blue-grey visor and two yellow lamps, a keel along its length, grey frame
 * rings dividing two bays of ribbed orange and slate containers, a big rear block with orange side panels, engine
 * boxes on its flanks, and a little tower with a teal window, vents and an antenna.
 */
export function cargoHauler(options: ShipOptions = {}): Group {
  const L = options.size ?? 0.9, seed = options.seed ?? 7, brown = options.color ?? 0x9a6e54, orange = options.accent ?? 0xd8783a;
  const tan = 0xb89070, grey = 0x8a8e9a, slate = 0x56688a, teal = 0x4fc8c0, visor = 0x6a8aa8, dark = 0x2e3038;
  const brownPaint = tone(brown, tan);
  return ship('Cargo Hauler', (g, engines, out) => {
    // the keel under everything
    g.add(toy(block(0.2 * L, 0.06 * L, 0.72 * L, [0, -0.08 * L, 0.03 * L]), brownPaint, { seed }));
    // the cab: angular, a blue-grey visor across its front, two yellow lamps low down
    g.add(toy(hull([[-0.5 * L, 0.09 * L, 0.05 * L, 0.08 * L], [-0.45 * L, 0.13 * L, 0.1 * L, 0.1 * L], [-0.26 * L, 0.14 * L, 0.11 * L, 0.1 * L]], { shoulder: 0.85 }), (c, n) => (n.z < -0.35 && c.y > -0.01 * L ? visor : brownPaint(c, n)), { seed: seed + 1, vary: 0.07 }));
    g.add(toy(block(0.18 * L, 0.025 * L, 0.16 * L, [0, 0.12 * L, -0.36 * L]), tone(tan), { seed }));
    for (const x of [-0.07, 0.07]) g.add(toy(block(0.03 * L, 0.02 * L, 0.02 * L, [x * L, -0.06 * L, -0.5 * L]), lit(0xffc93a), { seed }));
    muzzleAt(out, 0, -0.04 * L, -0.52 * L);
    // grey frame rings dividing the bays
    for (const z of [-0.25, -0.03, 0.19]) g.add(toy(block(0.3 * L, 0.26 * L, 0.04 * L, [0, 0.01 * L, z * L]), tone(grey, mix(grey, 0xffffff, 0.15)), { seed: seed + 2 }));
    // two bays of ribbed containers: two on top, one low on each flank
    const crate = (x: number, y: number, z: number, colour: number, k: number) => {
      g.add(toy(block(0.12 * L, 0.095 * L, 0.18 * L, [x, y, z]), tone(colour, mix(colour, 0xffffff, 0.12)), { seed: seed + k, vary: 0.08 }));
      for (let r = -2; r <= 2; r++) g.add(toy(block(0.124 * L, 0.099 * L, 0.008 * L, [x, y, z + r * 0.035 * L]), tone(mix(colour, PALETTE.shade, 0.25)), { seed }));
    };
    [-0.14, 0.08].forEach((z, b) => {
      crate(-0.065 * L, 0.07 * L, z * L, b ? slate : orange, b * 4);
      crate(0.065 * L, 0.07 * L, z * L, b ? orange : slate, b * 4 + 1);
      crate(-0.085 * L, -0.03 * L, z * L, b ? orange : slate, b * 4 + 2);
      crate(0.085 * L, -0.03 * L, z * L, b ? slate : orange, b * 4 + 3);
    });
    // the rear block: brown, orange side panels, engine boxes on its flanks
    g.add(toy(block(0.26 * L, 0.22 * L, 0.26 * L, [0, 0.02 * L, 0.34 * L]), brownPaint, { seed: seed + 3 }));
    for (const side of [-1, 1]) {
      g.add(toy(block(0.02 * L, 0.12 * L, 0.18 * L, [side * 0.135 * L, 0.03 * L, 0.33 * L]), lit(orange), { seed }));
      g.add(toy(block(0.09 * L, 0.13 * L, 0.2 * L, [side * 0.19 * L, 0.0, 0.38 * L]), tone(grey, mix(grey, 0xffffff, 0.15)), { seed: seed + 4 }));
      g.add(toy(block(0.07 * L, 0.1 * L, 0.02 * L, [side * 0.19 * L, 0.0, 0.485 * L]), dark, { seed }));
      const e = exhaust(0.035 * L, 0.1 * L);
      e.position.set(side * 0.19 * L, 0.0, 0.49 * L);
      engines.add(e);
    }
    // the tower on top: a teal window strip, dark vent slots, an antenna
    g.add(toy(block(0.14 * L, 0.08 * L, 0.14 * L, [0, 0.17 * L, 0.33 * L]), brownPaint, { seed: seed + 5 }));
    g.add(toy(block(0.1 * L, 0.025 * L, 0.02 * L, [0, 0.185 * L, 0.258 * L]), lit(teal), { seed }));
    for (const x of [-0.03, 0, 0.03]) g.add(toy(block(0.012 * L, 0.04 * L, 0.01 * L, [x * L + 0.04 * L, 0.17 * L, 0.405 * L]), dark, { seed }));
    g.add(toy(new CylinderGeometry(0.005 * L, 0.007 * L, 0.1 * L, 5).translate(-0.03 * L, 0.26 * L, 0.33 * L), lit(0xb4b9c3), { seed }));
  });
}

/**
 * A drone `size` metres across its rotors (0.5), centred, front to −Z (research/concepts/things/02-spaceships.png, Drone): a
 * long faceted orange body with a white panel on top, a dark camera with a cyan lens in front, two dark legs under
 * it, four fat beige rotor rings close round it on short dark brackets, a four-bladed rotor in each ('Rotors': spin
 * each child round Y).
 */
export function drone(options: ShipOptions = {}): Group {
  const S = options.size ?? 0.5, seed = options.seed ?? 8, body = options.color ?? 0xe8823a, beige = options.accent ?? 0xd8b89c, dark = 0x3e424c;
  const spots: [number, number][] = [[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.16], [0.2, 0.16]];
  const out = ship('Drone', (g, engines) => {
    g.add(toy(hull([[-0.24 * S, 0.05 * S, 0.035 * S, 0.035 * S], [-0.19 * S, 0.075 * S, 0.06 * S, 0.05 * S], [0.17 * S, 0.075 * S, 0.06 * S, 0.05 * S], [0.22 * S, 0.055 * S, 0.04 * S, 0.035 * S]], { shoulder: 0.7 }), tone(body, mix(body, 0xffffff, 0.12)), { seed, vary: 0.07 }));
    g.add(toy(block(0.08 * S, 0.02 * S, 0.17 * S, [0, 0.065 * S, -0.02 * S], 0.3), lit(0xf2efe8), { seed }));
    // the camera in front, a cyan lens
    g.add(toy(block(0.07 * S, 0.06 * S, 0.05 * S, [0, -0.01 * S, -0.25 * S], 0.25), lit(dark), { seed }));
    const lens = new Mesh(new CylinderGeometry(0.02 * S, 0.02 * S, 0.012 * S, 8).rotateX(Math.PI / 2), glowMat(0x6ff3ff));
    lens.position.set(0, -0.01 * S, -0.277 * S);
    engines.add(lens);
    // two dark legs, each a strut and a foot
    for (const z of [-0.1, 0.1]) {
      g.add(toy(block(0.015 * S, 0.06 * S, 0.015 * S, [0.0, -0.07 * S, z * S]), lit(dark), { seed }));
      g.add(toy(block(0.1 * S, 0.015 * S, 0.02 * S, [0, -0.1 * S, z * S]), lit(dark), { seed }));
    }
    // the rotor rings: fat beige rings close round the body, each on a short dark bracket
    for (const [x, z] of spots) {
      g.add(toy(turned([[0.085 * S, 0.0], [0.1 * S, -0.022 * S], [0.12 * S, -0.012 * S], [0.126 * S, 0.014 * S], [0.11 * S, 0.03 * S], [0.09 * S, 0.026 * S], [0.085 * S, 0.0]], 14).translate(x * S, 0.0, z * S), lit(beige), { seed: seed + 1, vary: 0.08 }));
      g.add(toy(block(Math.abs(x) * 0.5 * S, 0.025 * S, 0.03 * S, [x * 0.6 * S, 0.0, z * 0.75 * S]), lit(dark), { seed }));
    }
  });
  // the rotors: four dark blades and a hub in each ring, their own meshes so they can spin
  const rotors = named(new Group(), 'Rotors');
  for (const [x, z] of spots) {
    const r = new Group(), blades = new Group();
    for (const a of [0, Math.PI / 2]) blades.add(toy(block(0.17 * S, 0.008 * S, 0.026 * S, [0, 0, 0], 0.3).rotateY(a + 0.4), lit(dark), { seed }));
    blades.add(toy(new CylinderGeometry(0.018 * S, 0.018 * S, 0.02 * S, 6), lit(0x2a2d34), { seed }));
    r.add(merge(blades));
    r.position.set(x * S, 0.005 * S, z * S);
    rotors.add(r);
  }
  out.add(rotors);
  return out;
}

/**
 * A space battleship `size` metres long (1.2), nose to −Z (research/concepts/things/02-spaceships.png, Battleship): a wide hull
 * with charcoal upper sides, a red deck and a red lower hull, a tall stepped charcoal tower with a cyan window strip,
 * light vents and a mast with a yard, three charcoal turrets with three light barrels each — two forward, one raised
 * over the other, and one aft — hatches along the deck, engines glowing at the stern.
 */
export function battleship(options: ShipOptions = {}): Group {
  const L = options.size ?? 1.2, seed = options.seed ?? 9, red = options.color ?? 0xb8343a, charcoal = options.accent ?? 0x3c3e4a;
  const light = 0xb4b8c4, cyan = 0x5ad8e0;
  const coal = tone(charcoal, mix(charcoal, 0xffffff, 0.12));
  return ship('Battleship', (g, engines, out) => {
    // the hull: wide with a flat red deck, charcoal sides, a red stripe low along them
    const sections: [number, number, number, number][] = [[-0.5 * L, 0.0, 0.06 * L, 0.0], [-0.36 * L, 0.09 * L, 0.065 * L, 0.06 * L], [-0.12 * L, 0.13 * L, 0.065 * L, 0.08 * L], [0.34 * L, 0.13 * L, 0.065 * L, 0.08 * L], [0.44 * L, 0.11 * L, 0.06 * L, 0.07 * L]];
    g.add(toy(hull(sections, { shoulder: 0.92 }), (c, n) => (n.y > 0.55 ? red : coal(c, n)), { seed, vary: 0.07 }));
    // the red lower hull: its own slightly wider hull below the waterline
    g.add(toy(hull(sections.map(([z, w, , b]) => [z, w * 1.02, 0.004 * L, b * 1.03] as [number, number, number, number]), { shoulder: 0.92 }), tone(mix(red, PALETTE.shade, 0.15)), { seed: seed + 1, vary: 0.07 }));
    // the tower: four charcoal steps, a cyan window strip on the third, light vents, a mast with a yard
    [[0.17, 0.06, 0.24, 0.095], [0.13, 0.06, 0.17, 0.155], [0.1, 0.05, 0.11, 0.21], [0.06, 0.04, 0.06, 0.255]].forEach(([w, h, d, y], k) =>
      g.add(toy(block(w * L, h * L, d * L, [0, y * L, 0.03 * L]), coal, { seed: seed + k })));
    g.add(toy(block(0.102 * L, 0.014 * L, 0.02 * L, [0, 0.215 * L, -0.026 * L]), lit(cyan), { seed }));
    for (const side of [-1, 1]) for (const z of [-0.02, 0.02, 0.06]) g.add(toy(block(0.006 * L, 0.025 * L, 0.012 * L, [side * 0.067 * L, 0.155 * L, z * L]), lit(light), { seed }));
    g.add(toy(new CylinderGeometry(0.005 * L, 0.007 * L, 0.13 * L, 5).translate(0, 0.33 * L, 0.04 * L), lit(light), { seed }));
    g.add(toy(block(0.06 * L, 0.008 * L, 0.008 * L, [0, 0.36 * L, 0.04 * L]), lit(light), { seed }));
    // turrets: charcoal drums with three light barrels; the second forward one raised on a barbette
    const turret = (z: number, y: number, back: boolean) => {
      g.add(toy(turned([[0.055 * L, 0], [0.05 * L, 0.04 * L], [0.03 * L, 0.05 * L], [0, 0.05 * L]], 8).translate(0, y, z), coal, { seed }));
      for (const x of [-0.02, 0, 0.02]) g.add(toy(forward(new CylinderGeometry(0.006 * L, 0.007 * L, 0.11 * L, 5)).translate(x * L, y + 0.025 * L, z + (back ? 0.07 : -0.07) * L), lit(light), { seed }));
      if (!back) muzzleAt(out, 0, y + 0.025 * L, z - 0.13 * L);
    };
    turret(-0.32 * L, 0.065 * L, false);
    g.add(toy(turned([[0.05 * L, 0], [0.05 * L, 0.035 * L], [0, 0.035 * L]], 8).translate(0, 0.065 * L, -0.18 * L), coal, { seed }));
    turret(-0.18 * L, 0.1 * L, false);
    turret(0.26 * L, 0.065 * L, true);
    // hatches along the deck
    for (const side of [-1, 1]) for (const z of [-0.06, 0.14]) g.add(toy(block(0.04 * L, 0.02 * L, 0.06 * L, [side * 0.1 * L, 0.075 * L, z * L]), coal, { seed }));
    for (const x of [-0.06, 0, 0.06]) pod(g, engines, x * L, -0.01 * L, 0.5 * L, 0.04 * L, 0.1 * L, seed + 4, 0x5a5c68);
  });
}

/**
 * An escape pod `size` metres tall (0.45), centred, front to −Z (research/concepts/things/02-spaceships.png, Escape Pod): a
 * white faceted dome wide at the bottom, a thick blue band round its foot, a small blue cap on top, a grey hatch with a
 * dark window and a blue panel on its sides, two big grey thruster bells with orange rims tipped up out of its back.
 */
export function escapePod(options: ShipOptions = {}): Group {
  const H = options.size ?? 0.45, R = H * 0.55, seed = options.seed ?? 10, blue = options.color ?? 0x3a7ae0, orange = options.accent ?? PALETTE.orange;
  const grey = 0x8d96a8, dark = 0x2a3044;
  return ship('Escape Pod', (g, engines) => {
    g.add(toy(turned([[0, -0.42 * H], [0.97 * R, -0.42 * H], [R, -0.26 * H], [0.92 * R, -0.02 * H], [0.68 * R, 0.2 * H], [0.36 * R, 0.33 * H], [0, 0.35 * H]], 12),
      (c, n) => lit(c.y < -0.24 * H ? blue : 0xeceef2, 0.18)(c, n), { seed, vary: 0.07, shade: 0.15 }));
    g.add(toy(turned([[0.31 * R, 0.32 * H], [0.31 * R, 0.38 * H], [0, 0.39 * H]], 10), lit(blue), { seed }));
    // a hatch with a dark window on the front-left, a blue panel on the front-right: each set on the sloping side
    const onSide = (geo: BufferGeometry, a: number, y: number) => {
      const m = toy(geo, (_c, n) => (n.z > 0.5 ? geo.userData.face : geo.userData.edge), { seed });
      m.rotation.set(0, a, 0, 'YXZ');
      m.rotateX(-0.3);
      m.position.set(Math.sin(a) * R * 0.97, y, Math.cos(a) * R * 0.97);
      g.add(m);
    };
    const hatch = block(0.36 * R, 0.44 * H, 0.05 * R);
    hatch.userData = { face: mix(grey, 0xffffff, 0.1), edge: grey };
    onSide(hatch, Math.PI + 0.55, -0.04 * H);
    const window = block(0.18 * R, 0.16 * H, 0.03 * R).translate(0, 0.06 * H, 0.035 * R);
    window.userData = { face: dark, edge: dark };
    onSide(window, Math.PI + 0.55, -0.04 * H);
    const panel = block(0.26 * R, 0.2 * H, 0.04 * R);
    panel.userData = { face: blue, edge: mix(blue, PALETTE.shade, 0.2) };
    onSide(panel, Math.PI - 0.75, 0.0);
    // two big thruster bells tipped up out of the back, orange rims, thrust out of their mouths
    const dir = new Vector3(0, 0.5, 0.86).normalize(), up = new Vector3(0, 1, 0), q = new Quaternion().setFromUnitVectors(up, dir);
    for (const x of [-0.27, 0.27]) {
      const at = new Vector3(x * R, 0.08 * H, 0.72 * R);
      const bell = turned([[0.1 * R, 0], [0.14 * R, 0.12 * R], [0.24 * R, 0.3 * R], [0.31 * R, 0.44 * R], [0.25 * R, 0.44 * R], [0.12 * R, 0.3 * R], [0, 0.3 * R]], 10);
      bell.applyQuaternion(q).translate(at.x, at.y, at.z);
      g.add(toy(bell, lit(grey, 0.3), { seed: seed + 1, vary: 0.08 }));
      const rim = ring(0.27 * R, 0.33 * R, 0.05 * R, 10).translate(0, 0.44 * R, 0);
      rim.applyQuaternion(q).translate(at.x, at.y, at.z);
      g.add(toy(rim, lit(orange), { seed }));
      const e = exhaust(0.22 * R, 0.4 * R);
      e.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir);
      e.position.copy(at).addScaledVector(dir, 0.44 * R);
      engines.add(e);
    }
  });
}

/** Every kind by name, for `spaceship({ kind })`. */
export const SHIP_KINDS = { fighter, bomber, scout, cruiser, mothership, alienSaucer, cargoHauler, drone, battleship, escapePod };
/** A ship of the named kind, with the same options. */
export const spaceship = (options: ShipOptions & { kind: keyof typeof SHIP_KINDS }) => SHIP_KINDS[options.kind](options);

/** Every 'Muzzle' of a ship: where its shots leave. */
export const muzzlesOf = (ship: Object3D): Object3D[] => {
  const found: Object3D[] = [];
  ship.traverse((o) => { if (o.name === 'Muzzle') found.push(o); });
  return found;
};
