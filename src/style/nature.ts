// Punto's look (src/style.ts): nature — each thing brought to the islands' look one by one beside the island and its
// concept (research/concepts/things/05-nature.png, /research/stands/things.html?only=island,oak-tree&big). Built only on the base
// (src/style/base.ts). Real sizes in metres; everything stands on y = 0.
import { ConeGeometry, CylinderGeometry, Group, Mesh, Quaternion, Vector3 } from '@iwsdk/core';
import { blob, block, fire, flat, glowMat, jitter, leaf, lit, lumps, merge, mix, PALETTE, ribbon, slab, taperedTube, toy, turned } from './base.js';

/** A seeded random number from 0 to 1. */
const random = (seed: number) => () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);

/** Leaves lit like the islands: lime on top, green on the sides, dark green underneath. */
export const leaves = (top = 0x9ccf3e, side = 0x64a832, under = 0x3f7a26) => (_c: Vector3, n: Vector3) => (n.y > 0.45 ? top : n.y > -0.25 ? side : under);

/**
 * An oak tree `height` metres tall (1.2): a big curly crown of five faceted balls — lime on top, darker below — on a
 * thick red-brown trunk that flares at its foot, two short branches reaching into the crown. One mesh, 'Tree'.
 */
export function oakTree(height = 1.2, options: { seed?: number; leaves?: [number, number, number] } = {}): Group {
  const H = height, seed = options.seed ?? 3, g = new Group(), bark = 0x8a4a2c;
  const leafPaint = leaves(...(options.leaves ?? [0x9ccf3e, 0x64a832, 0x3f7a26]));
  g.add(toy(jitter(turned([[0.1 * H, 0], [0.07 * H, 0.05 * H], [0.055 * H, 0.25 * H], [0.05 * H, 0.46 * H], [0, 0.48 * H]], 7), 0.006 * H, seed), lit(bark, 0.25), { seed, vary: 0.08 }));
  for (const side of [-1, 1]) {
    const branch = taperedTube([new Vector3(0, 0.33 * H, 0), new Vector3(side * 0.06 * H, 0.42 * H, 0.02 * H), new Vector3(side * 0.13 * H, 0.5 * H, 0.05 * H)], 0.028 * H, 0.014 * H, 5, 4);
    g.add(toy(branch, lit(bark, 0.25), { seed }));
  }
  const balls: [number, number, number, number][] = [[0, 0.73, -0.03, 0.25], [-0.18, 0.56, 0.1, 0.19], [0.18, 0.56, 0.1, 0.19], [-0.2, 0.64, -0.13, 0.17], [0.21, 0.66, -0.1, 0.16]];
  balls.forEach(([x, y, z, r], i) => g.add(toy(blob(r * H, seed * 7 + i, 1, 0.12).translate(x * H, y * H, z * H), leafPaint, { seed: seed + i, vary: 0.1 })));
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Tree' }));
  return out;
}

/**
 * A palm tree `height` metres tall (1.4): a slightly curved trunk of stacked tan cups, each wider at its top, and a
 * crown of eight broad folded fronds rising and drooping all round, lime on top and darker underneath. One mesh, 'Tree'.
 */
export function palmTree(height = 1.4, options: { seed?: number; lean?: number } = {}): Group {
  const H = height, seed = options.seed ?? 4, lean = options.lean ?? 0.1, g = new Group(), tan = 0xc47c4a, n = 8;
  // the trunk: cups up a gentle curve, each a little narrower than the one below
  const at = (t: number) => new Vector3(lean * H * t * t, 0.66 * H * t, 0);
  for (let i = 0; i < n; i++) {
    const r = H * (0.06 - 0.018 * (i / n)), h = (0.66 * H) / n, p = at(i / n);
    const cup = turned([[r * 0.78, 0], [r, h * 0.82], [r * 0.92, h * 1.04], [0, h * 1.04]], 8);
    cup.rotateZ(-lean * 2 * (i / n) * 0.9);
    cup.translate(p.x, p.y, p.z);
    g.add(toy(cup, lit(i % 2 ? tan : mix(tan, 0xffffff, 0.06), 0.3), { seed: seed + i, vary: 0.07 }));
  }
  // the crown: fronds all round from the top of the trunk
  const top = at(1).add(new Vector3(0, 0.02 * H, 0));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.3, frond = leaf(H * (0.4 + (k % 2) * 0.06), H * 0.17, { rise: H * 0.13, droop: H * 0.16, fold: 0.35 });
    frond.rotateY(a);
    frond.translate(top.x, top.y, top.z);
    g.add(toy(frond, leaves(0x8cc83a, 0x5ea232, 0x3a7024), { seed: seed + 10 + k, vary: 0.08 }));
  }
  g.add(toy(blob(H * 0.05, seed, 1, 0.1).translate(top.x, top.y, top.z), lit(0x7a5a2a), { seed }));
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Tree' }));
  return out;
}

/**
 * A chunky daisy head `radius` metres across its petals, facing up (+Y), its middle at the origin: `petals` thick
 * rounded petals (7) of `color` round a fat button of `middle`. Add it to a group and tilt it as you like.
 */
export function blossom(radius: number, color: number, middle = PALETTE.yellow, petals = 7, seed = 1): Group {
  const g = new Group(), r = radius, oval: [number, number][] = [];
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; oval.push([r * 0.58 + Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.24]); }
  for (let k = 0; k < petals; k++) {
    const petal = flat(slab(oval, r * 0.2, 0.35));
    petal.rotateY((k / petals) * Math.PI * 2);
    g.add(toy(petal, lit(color, 0.2), { seed: seed + k, vary: 0.08 }));
  }
  g.add(toy(blob(r * 0.3, seed, 1, 0.08).scale(1, 0.55, 1).translate(0, r * 0.1, 0), lit(middle, 0.2), { seed, vary: 0.08 }));
  return g;
}

/**
 * A flower patch `size` metres across (0.35): seven chunky daisies in red, yellow, blue and purple on stems of
 * different heights, their heads turned up and out, over a rosette of broad folded leaves. One mesh, 'Flowers'.
 */
export function flowers(size = 0.35, options: { seed?: number; colors?: number[] } = {}): Group {
  const S = size, seed = options.seed ?? 5, g = new Group(), stem = 0x3f8a2e;
  const colours = options.colors ?? [PALETTE.red, PALETTE.yellow, 0x3a8cf0, 0x9a6ae0, PALETTE.red, PALETTE.yellow, 0x3a8cf0];
  const middles = [PALETTE.yellow, PALETTE.red, PALETTE.yellow, PALETTE.yellow, PALETTE.yellow, PALETTE.red, PALETTE.yellow];
  // the leaves: a rosette on the ground
  for (let k = 0; k < 11; k++) {
    const l = leaf(S * (0.3 + (k % 3) * 0.05), S * 0.17, { rise: S * 0.1, droop: S * 0.12, fold: 0.3, segments: 4 });
    l.rotateY((k / 11) * Math.PI * 2 + 0.2);
    l.rotateZ(k % 2 ? 0.15 : 0);
    l.translate(0, S * 0.02, 0);
    g.add(toy(l, leaves(0x4fa83a, 0x3a8a2e, 0x2a6422), { seed: seed + k, vary: 0.08 }));
  }
  // the flowers: [x, z, height, head radius]
  const spots: [number, number, number, number][] = [[-0.05, -0.1, 0.42, 0.12], [0.13, -0.05, 0.34, 0.09], [-0.22, -0.02, 0.28, 0.08], [0.02, -0.01, 0.31, 0.08], [-0.13, 0.1, 0.24, 0.095], [0.1, 0.1, 0.22, 0.095], [0.25, 0.02, 0.3, 0.1]];
  spots.forEach(([x, z, h, r], k) => {
    const top = new Vector3(x * S * 1.2, h * S, z * S);
    g.add(toy(taperedTube([new Vector3(x * S * 0.5, 0, z * S * 0.5), new Vector3(x * S * 0.9, h * S * 0.5, z * S * 0.8), top], S * 0.012, S * 0.009, 5, 4), lit(stem), { seed }));
    const head = blossom(r * S, colours[k % colours.length], middles[k % middles.length], 7 + (k % 2), seed + k * 10);
    head.rotation.set(0.5 + (k % 3) * 0.1, Math.atan2(x, z + 0.3), 0, 'YXZ');
    head.position.copy(top);
    g.add(head);
  });
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Flowers' }));
  return out;
}

/**
 * One mushroom `height` metres tall standing on y = 0: a cream stem, a faceted cap `cap` metres across in `color`
 * (`shape` 'dome' or 'flat'), its underside a cream rim, optional white dots on top (a fly agaric). A Group to place.
 */
export function mushroom(height: number, cap: number, color: number, options: { dots?: boolean; shape?: 'dome' | 'flat'; seed?: number } = {}): Group {
  const g = new Group(), seed = options.seed ?? 1, c = cap / 2, s = cap * 0.2, cream = 0xeedcc0, flatCap = options.shape === 'flat';
  g.add(toy(turned([[s * 1.35, 0], [s * 1.15, height * 0.1], [s * 0.92, height * 0.55], [s * 0.85, height], [0, height]], 8), lit(cream, 0.2), { seed, vary: 0.06 }));
  const dome: [number, number][] = flatCap
    ? [[s, 0], [c * 0.98, 0.02 * c], [c, 0.14 * c], [c * 0.8, 0.32 * c], [c * 0.4, 0.42 * c], [0, 0.44 * c]]
    : [[s, 0], [c * 0.97, 0.0], [c, 0.14 * c], [c * 0.86, 0.46 * c], [c * 0.52, 0.68 * c], [0, 0.74 * c]];
  const capGeo = turned(dome, 12).translate(0, height - 0.04 * c, 0);
  g.add(toy(capGeo, (cc, n) => (n.y < -0.3 ? mix(cream, PALETTE.shade, 0.08) : lit(color, 0.2)(cc, n)), { seed: seed + 1, vary: 0.08 }));
  if (options.dots) {
    const q = new Quaternion(), up = new Vector3(0, 1, 0);
    [[0.0, 0.0], [0.55, 0.3], [0.6, 2.2], [0.62, 4.1], [0.35, 1.2], [0.4, 3.3], [0.7, 5.3]].forEach(([t, a], k) => {
      const n = new Vector3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a));
      const dot = blob(c * 0.14, seed + k, 0, 0.08).scale(1, 0.3, 1);
      dot.applyQuaternion(q.setFromUnitVectors(up, n));
      dot.translate(n.x * c * 0.96, height + 0.06 * c + n.y * c * 0.66, n.z * c * 0.96);
      g.add(toy(dot, lit(0xfaf6ee, 0.1), { seed }));
    });
  }
  return g;
}

/**
 * A cluster of six mushrooms `size` metres across (0.3) on y = 0: a big red fly agaric with white dots in the middle,
 * a brown cep, an orange flat cap, a small fly agaric in front and two little brown ones. One mesh, 'Mushrooms'.
 */
export function mushrooms(size = 0.3, options: { seed?: number } = {}): Group {
  const S = size, seed = options.seed ?? 6, g = new Group();
  const parts: [number, number, number, number, number, boolean, 'dome' | 'flat'][] = [
    [0, -0.05, 0.48, 0.5, 0xd8403a, true, 'dome'], [-0.3, 0.05, 0.28, 0.38, 0xa04a2a, false, 'dome'], [0.3, 0.02, 0.3, 0.36, 0xd8743a, false, 'flat'],
    [0.08, 0.22, 0.17, 0.22, 0xd8403a, true, 'dome'], [-0.2, 0.25, 0.1, 0.14, 0xb8643a, false, 'dome'], [0.32, 0.22, 0.12, 0.17, 0xa8402a, false, 'dome'],
  ];
  parts.forEach(([x, z, h, c, color, dots, shape], k) => {
    const m = mushroom(h * S, c * S, color, { dots, shape, seed: seed + k * 10 });
    m.position.set(x * S, 0, z * S);
    m.rotation.set((z > 0.1 ? 0.12 : 0) * (k % 2 ? 1 : -1), k, x * -0.25);
    g.add(m);
  });
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Mushrooms' }));
  return out;
}

/**
 * A mountain `height` metres tall (0.6) on y = 0: a craggy faceted peak with two lower shoulders, its rock cool
 * blue-grey on one side and warm grey on the other, a jagged snow cap and snow lying in the high hollows. One mesh,
 * 'Mountain'.
 */
export function mountain(height = 0.6, options: { seed?: number; snow?: boolean } = {}): Group {
  const H = height, R = H * 0.62, seed = options.seed ?? 7, g = new Group(), snow = options.snow ?? true;
  const r = random(seed);
  const rock = stone(H);
  const paint = (top: number) => (c: Vector3, n: Vector3) => {
    if (snow && (c.y > top + (Math.sin(Math.atan2(c.z, c.x) * 5 + seed) * 0.05 * H) || (n.y > 0.72 && c.y > top - 0.22 * H))) return n.y < 0 ? 0xd8dde6 : 0xf2f4f8;
    return rock(c, n);
  };
  // the main peak and two shoulders, each a crooked faceted cone
  const peak = (h: number, rr: number, x: number, z: number, k: number) => {
    const geo = jitter(turned([[rr, 0], [rr * 0.95, h * 0.14], [rr * 0.62, h * 0.48], [rr * 0.3, h * 0.78], [0, h]], 8), rr * 0.09, seed + k);
    geo.rotateY(r() * Math.PI);
    geo.translate(x, 0, z);
    g.add(toy(geo, paint(H * 0.7), { seed: seed + k, vary: 0.06 }));
  };
  peak(H, R, 0, 0, 0);
  peak(H * 0.62, R * 0.62, R * 0.55, R * 0.2, 1);
  peak(H * 0.5, R * 0.55, -R * 0.5, R * 0.3, 2);
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Mountain' }));
  return out;
}

/** Rock lit like the concepts' cliffs: warm rust where the light falls, dark grey-brown in the shade, lighter tops. */
export const cliff = (warm = 0xa8673f, cool = 0x5e4e48) => (_c: Vector3, n: Vector3) => (n.y > 0.6 ? mix(warm, 0xffffff, 0.08) : n.x - n.z * 0.3 > 0 ? warm : cool);

/**
 * A waterfall `height` metres tall (0.5) on y = 0, facing +Z: two cliffs of stacked chunky rocks, a thick blue sheet of
 * water with pale streaks curving over a lip between them and falling into a pool with ripples, white foam and spray
 * at its foot. 'Water' is its own mesh (scroll or flicker it); the rest is one mesh, 'Rocks'.
 */
export function waterfall(height = 0.5, options: { seed?: number } = {}): Group {
  const H = height, seed = options.seed ?? 8, rocks = new Group(), water = new Group(), blue = 0x3a92ea, pale = 0x8ad2ff;
  // the cliffs: chunky rocks stacked in steps, the right one taller
  const stone = (w: number, h: number, d: number, x: number, y: number, z: number, k: number) =>
    rocks.add(toy(jitter(block(w * H, h * H, d * H, [x * H, y * H, z * H], 0.18), H * 0.012, seed + k), cliff(), { seed: seed + k, vary: 0.06 }));
  [[0.24, 0.3, 0.3, -0.27, 0.15, -0.02], [0.2, 0.24, 0.26, -0.29, 0.42, -0.06], [0.16, 0.16, 0.2, -0.36, 0.08, 0.16], [0.14, 0.14, 0.16, -0.24, 0.62, -0.08]].forEach(([w, h, d, x, y, z], k) => stone(w, h, d, x, y, z, k));
  [[0.26, 0.4, 0.32, 0.27, 0.2, -0.02], [0.22, 0.34, 0.28, 0.29, 0.56, -0.06], [0.16, 0.16, 0.18, 0.3, 0.08, 0.2], [0.16, 0.14, 0.16, 0.2, 0.8, -0.1]].forEach(([w, h, d, x, y, z], k) => stone(w, h, d, x, y, z, k + 4));
  // the pool: a flat blue slab with a wavy edge, a stone rim behind
  const edge: [number, number][] = [];
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; edge.push([Math.cos(a) * H * (0.34 + Math.sin(a * 3) * 0.02), Math.sin(a) * H * (0.2 + Math.cos(a * 2) * 0.02) - H * 0.18]); }
  water.add(toy(flat(slab(edge, H * 0.06, 0.2)).translate(0, H * 0.03, 0), (c, n) => (n.y > 0.5 ? blue : mix(blue, PALETTE.shade, 0.25)), { seed, vary: 0.05 }));
  for (const [r, z] of [[0.14, 0.2], [0.1, 0.26]]) water.add(toy(flat(slab([[-r * H, 0], [r * H, 0], [r * H * 0.9, 0.012 * H], [-r * H * 0.9, 0.012 * H]], H * 0.008)).translate(0, H * 0.064, z * H), lit(pale), { seed }));
  // the fall: a thick sheet curving over the lip and down, pale streaks along it
  const path = [new Vector3(0, 0.88 * H, -0.2 * H), new Vector3(0, 0.9 * H, -0.08 * H), new Vector3(0, 0.84 * H, 0.0), new Vector3(0, 0.62 * H, 0.04 * H), new Vector3(0, 0.34 * H, 0.05 * H), new Vector3(0, 0.08 * H, 0.06 * H)];
  water.add(toy(ribbon(path, 0.26 * H, 0.05 * H, { across: 5 }), (c, n) => {
    const k = Math.round((c.x / (0.26 * H) + 0.5) * 5);
    return k === 1 || k === 4 ? pale : n.y < -0.5 ? mix(blue, PALETTE.shade, 0.2) : blue;
  }, { seed: seed + 1, vary: 0.05 }));
  // foam at its foot and a few drops of spray
  for (let k = 0; k < 7; k++) water.add(toy(blob(H * (0.045 + (k % 3) * 0.01), seed + k, 0, 0.15).scale(1, 0.6, 1).translate((k - 3) * 0.045 * H, 0.08 * H, (0.1 + (k % 2) * 0.03) * H), lit(0xf6f8fc, 0.1), { seed }));
  for (const [x, y] of [[-0.05, 0.2], [0.0, 0.24], [0.06, 0.2]]) water.add(toy(blob(H * 0.014, seed, 0, 0.1).translate(x * H, y * H, 0.12 * H), lit(0xf6f8fc, 0.1), { seed }));
  const out = new Group();
  out.add(Object.assign(merge(rocks), { name: 'Rocks' }), Object.assign(merge(water), { name: 'Water' }));
  return out;
}

/**
 * A volcano `height` metres tall (0.5) on y = 0: a blunt faceted cone of brown-grey rock, an orange lava cap with
 * tongues running down its sides, a glowing crater ('Lava') and a column of grey faceted smoke ('Smoke', drift it up).
 * The rock and the lava cap are one mesh, 'Volcano'.
 */
export function volcano(height = 0.5, options: { seed?: number } = {}): Group {
  const H = height, R = H * 0.62, seed = options.seed ?? 9, g = new Group(), lava = 0xff7a1f, top = 0.8 * H, rTop = 0.3 * R;
  const rock = (c: Vector3, n: Vector3) => mix(n.x - n.z * 0.3 > 0 ? 0x8a6a58 : 0x5e5058, PALETTE.shade, Math.max(0, 0.3 - c.y / H) * 0.5);
  g.add(toy(turned([[0, 0], [R, 0], [R * 0.97, 0.07 * H], [rTop, top], [rTop * 0.75, top], [rTop * 0.6, top - 0.06 * H], [0, top - 0.06 * H]], 10), rock, { seed, vary: 0.06 }));
  // the lava cap: a shell over the top of the cone
  const radiusAt = (y: number) => R * 0.97 + (rTop - R * 0.97) * ((y - 0.07 * H) / (top - 0.07 * H));
  g.add(toy(turned([[radiusAt(0.62 * H) * 1.03, 0.62 * H], [rTop * 1.05, top + 0.005 * H], [rTop * 0.72, top + 0.005 * H]], 10), lit(lava, 0.2), { seed: seed + 1, vary: 0.08 }));
  // tongues of lava running down the sides, a round drop at each end
  const r = random(seed);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r() * 0.4, end = (0.3 + r() * 0.18) * H, pts: Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const y = 0.64 * H + (end - 0.64 * H) * (i / 4), rr = radiusAt(y) * 1.015;
      pts.push(new Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    const tongue = ribbon(pts, R * (0.2 + r() * 0.06), 0.025 * H, { side: new Vector3(-Math.sin(a), 0, Math.cos(a)) });
    g.add(toy(tongue, lit(lava, 0.2), { seed: seed + 2 + k, vary: 0.08 }));
    g.add(toy(blob(R * 0.1, seed + k, 0, 0.1).scale(1, 0.8, 1).translate(pts[4].x, pts[4].y, pts[4].z), lit(lava, 0.2), { seed }));
  }
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Volcano' }));
  // the glowing crater and the smoke
  const glow = new Mesh(new CylinderGeometry(rTop * 0.72, rTop * 0.6, 0.01 * H, 10), glowMat(0xffc040));
  glow.position.y = top - 0.02 * H;
  glow.name = 'Lava';
  out.add(glow);
  const smoke = new Group();
  [[0, 0.9, 0, 0.07], [0.03, 1.0, 0.01, 0.085], [-0.01, 1.11, -0.01, 0.1], [0.04, 1.23, 0.02, 0.11], [0.02, 1.35, 0.0, 0.12]].forEach(([x, y, z, rr], k) =>
    smoke.add(toy(blob(rr * H, seed + 20 + k, 1, 0.12).translate(x * H, y * H, z * H), lit(0x9a9eaa, 0.25), { seed: seed + 20 + k, vary: 0.08 })));
  out.add(Object.assign(merge(smoke), { name: 'Smoke' }));
  return out;
}

/** Mountain rock: cool blue-grey on one side, warm mauve-grey on the other, darker low down. */
export const stone = (height: number, cool = 0x5c6b8c, warm = 0x8a7880) => (c: Vector3, n: Vector3) => mix(n.x + n.z * 0.4 < 0 ? cool : warm, PALETTE.shade, Math.max(0, 0.35 - c.y / height) * 0.6);

/**
 * A cave `size` metres across (0.6) on y = 0, its mouth facing +Z: a big lumpy dome of rock, cool blue-grey on one
 * side and warm mauve-grey on the other, a dark arched mouth with a thick crooked rocky rim. One mesh, 'Cave'.
 */
export function cave(size = 0.6, options: { seed?: number } = {}): Group {
  const R = size / 2, seed = options.seed ?? 10, g = new Group(), H = R * 0.85;
  // the dome: a lumpy ball, squashed and cut flat at the ground
  const dome = lumps(blob(R, seed, 2, 0.06), 4, { amount: 0.14, seed });
  dome.scale(1.05, 0.95, 0.9);
  const pos = dome.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
  dome.computeVertexNormals();
  const rock = stone(H, 0x4a5878, 0x7a6670);
  g.add(toy(dome, rock, { seed, vary: 0.06 }));
  // the mouth: a dark arch set into the front, a thick rocky rim round it
  const arch: [number, number][] = [];
  const mw = R * 0.36, mh = R * 0.56, mx = R * 0.18;
  for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); arch.push([mx + Math.cos(a) * mw, Math.sin(a) * mh * (0.85 + 0.15 * Math.sin(a * 3))]); }
  const mouth = slab(arch, R * 0.5, 0.05);
  mouth.translate(0, 0, R * 0.62);
  g.add(toy(mouth, (_c, n) => (n.z > 0.5 ? 0x15141e : 0x24222e), { seed }));
  const rim: Vector3[] = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); rim.push(new Vector3(mx + Math.cos(a) * mw * 1.08, Math.sin(a) * mh * 1.05, R * 0.86 - Math.sin(a) * R * 0.1)); }
  g.add(toy(jitter(taperedTube(rim, R * 0.1, R * 0.09, 6, 10), R * 0.025, seed), rock, { seed: seed + 1, vary: 0.06 }));
  for (const side of [-1, 1]) g.add(toy(blob(R * 0.14, seed + side, 1, 0.15).scale(1, 0.75, 1).translate(mx + side * mw * 1.1, R * 0.07, R * 0.84), rock, { seed }));
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Cave' }));
  return out;
}

/**
 * A campfire `size` metres across (0.4) on y = 0: a ring of nine lumpy grey stones, crossed logs with pale cut ends, a
 * big flame ('Fire', flicker it) and a few sparks ('Sparks', drift them up). Stones and logs are one mesh, 'Campfire'.
 */
export function campfire(size = 0.4, options: { seed?: number } = {}): Group {
  const S = size, seed = options.seed ?? 11, g = new Group(), r = random(seed);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, rr = S * (0.065 + r() * 0.02);
    g.add(toy(blob(rr, seed + k, 1, 0.18).scale(1.2, 0.75, 1).translate(Math.cos(a) * S * 0.38, rr * 0.6, Math.sin(a) * S * 0.38), stone(S * 0.3, 0x6e7290, 0x8e8290), { seed: seed + k, vary: 0.06 }));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI + 0.3, log = new CylinderGeometry(S * 0.035, S * 0.04, S * 0.46, 6);
    log.rotateZ(Math.PI / 2 - 0.22);
    log.rotateY(a);
    log.translate(0, S * 0.06, 0);
    g.add(toy(log, (_c, n) => (Math.abs(n.y) > 0.9 ? 0xe8c08a : lit(0xa0522d, 0.25)(_c, n)), { seed: seed + 20 + k, vary: 0.08 }));
  }
  const out = new Group();
  out.add(Object.assign(merge(g), { name: 'Campfire' }));
  const flame = fire(S * 0.6, { seed });
  flame.position.y = S * 0.05;
  out.add(flame);
  const sparks = new Group();
  for (const [x, y, z] of [[-0.06, 0.75, 0.02], [0.03, 0.85, -0.02], [0.1, 0.7, 0.04]]) {
    const spark = new Mesh(new ConeGeometry(S * 0.012, S * 0.04, 4), glowMat(0xffa030));
    spark.position.set(x * S, y * S, z * S);
    sparks.add(spark);
  }
  out.add(Object.assign(sparks, { name: 'Sparks' }));
  return out;
}

/**
 * A pond `size` metres across (0.6) on y = 0: an uneven bank of grass over brown earth round sunken blue water with a
 * pale sandy edge, five lily pads ('Water' holds them, with the water) and two tufts of reeds. The bank is 'Bank'.
 */
export function pond(size = 0.6, options: { seed?: number } = {}): Group {
  const R = size / 2, seed = options.seed ?? 12, r = random(seed), bank = new Group(), water = new Group();
  const outer: [number, number][] = [], inner: [number, number][] = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, wob = 1 + Math.sin(a * 2 + seed) * 0.08 + (r() - 0.5) * 0.06;
    outer.push([Math.cos(a) * R * wob, Math.sin(a) * R * 0.78 * wob]);
    inner.push([Math.cos(a) * R * 0.72 * wob, Math.sin(a) * R * 0.52 * wob]);
  }
  const grassT = R * 0.05, earthT = R * 0.13, top = grassT + earthT;
  bank.add(toy(flat(slab(outer, earthT, 0.08, [inner])).translate(0, earthT / 2, 0), lit(0x8a5a36, 0.25), { seed, vary: 0.06 }));
  bank.add(toy(flat(slab(outer.map(([x, y]) => [x * 1.01, y * 1.01] as [number, number]), grassT, 0.3, [inner.map(([x, y]) => [x * 0.99, y * 0.99] as [number, number])])).translate(0, earthT + grassT / 2, 0), lit(0x7cc23c, 0.2), { seed: seed + 1, vary: 0.07 }));
  // the water, sunk a little below the grass, a pale sandy edge round it
  bank.add(toy(flat(slab(inner.map(([x, y]) => [x * 1.02, y * 1.02] as [number, number]), R * 0.02, 0.2)).translate(0, top - R * 0.035, 0), lit(0xe8dcb8, 0.15), { seed }));
  water.add(toy(flat(slab(inner.map(([x, y]) => [x * 0.96, y * 0.96] as [number, number]), R * 0.02, 0.2)).translate(0, top - R * 0.03, 0), (c, n) => (n.y > 0.5 ? 0x2a88e0 : 0x1f68b0), { seed, vary: 0.04 }));
  // lily pads: flat green discs with a notch
  const pad = (rr: number): [number, number][] => { const p: [number, number][] = [[0, 0]]; for (let k = 0; k <= 9; k++) { const a = 0.5 + (k / 9) * (Math.PI * 2 - 1); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
  [[-0.25, 0.1, 0.08], [-0.1, -0.08, 0.055], [-0.05, 0.14, 0.05], [0.2, -0.12, 0.075], [0.3, 0.02, 0.045]].forEach(([x, z, rr], k) => {
    const p = flat(slab(pad(rr * R * 1.6), R * 0.015, 0.2));
    p.rotateY(k * 1.7);
    p.translate(x * R * 1.6, top - R * 0.012, z * R * 1.6);
    water.add(toy(p, lit(0x5ab83a, 0.2), { seed: seed + k, vary: 0.06 }));
  });
  // two tufts of reeds on the bank
  for (const [x, z] of [[-0.62, -0.42], [0.55, 0.5]]) for (let k = 0; k < 3; k++) {
    const blade = slab([[-R * 0.025, 0], [R * 0.025, 0], [0, R * (0.2 + k * 0.05)]], R * 0.02, 0.2);
    blade.rotateY(k * 1.1);
    blade.rotateZ((k - 1) * 0.2);
    blade.translate(x * R + (k - 1) * R * 0.03, top, z * R);
    bank.add(toy(blade, lit(0x4aa83a, 0.2), { seed }));
  }
  const out = new Group();
  out.add(Object.assign(merge(bank), { name: 'Bank' }), Object.assign(merge(water), { name: 'Water' }));
  return out;
}
