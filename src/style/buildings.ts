// Punto's look (src/style.ts): buildings as tabletop dioramas, each brought to the islands' look one by one beside its
// concept (research/concepts/things/09-buildings.png). Built only on the base (src/style/base.ts). Each stands on its own grass
// tile (`{ ground: false }` to leave it off), its door to +Z; `size` is the tile's width in metres.
import { BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, type Object3D, Vector3 } from '@iwsdk/core';
import { blob, block, fire, glowMat, ground, lit, merge, mix, PALETTE, pineTree, ring, roundTree, slab, taperedTube, toy, turned, upright } from './base.js';

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);
/** Two-tone paint: `topColour` on the facets facing up, `c` on the sides, darker underneath. */
const tone = (c: number, topColour = c) => (_c: Vector3, n: Vector3) => (n.y > 0.55 ? topColour : n.y < -0.55 ? mix(c, PALETTE.shade, 0.35) : mix(c, PALETTE.shade, 0.1));
/** A window's warm light from inside. */
const LIT = 0xffc85a;

/**
 * A gable roof `width` wide (along X) over a `depth` deep house, `height` tall, its eaves at y = 0: a red ridge roof
 * with rows of tiles down both slopes, overhanging a little. One Group of toy pieces (merge it with the house).
 */
export function gableRoof(width: number, depth: number, height: number, color = 0xd8583a): Group {
  const g = new Group(), d = depth / 2;
  g.add(toy(upright(slab([[-d, 0], [d, 0], [0, height]], width, 0.005)), tone(color, mix(color, 0xffffff, 0.08)), { vary: 0.06 }));
  const slope = Math.atan2(height, d), rows = 4, len = Math.hypot(height, d);
  for (const side of [-1, 1]) for (let i = 0; i < rows; i++) {
    // a strip lying along the slope: its depth runs down the slope, lifted off the surface along the slope's normal
    const t = (i + 0.5) / rows, th = len * 0.04, tile = block(width * 1.01, th, (len / rows) * 1.02, [0, 0, 0], 0.3);
    tile.rotateX(side > 0 ? slope : Math.PI - slope);
    const nz = (side * height) / len, ny = d / len;
    tile.translate(0, height * (1 - t) + ny * th * 0.6, side * d * t + nz * th * 0.6);
    g.add(toy(tile, tone(i % 2 ? color : mix(color, 0x8a2a1a, 0.18)), { vary: 0.07 }));
  }
  return g;
}

/**
 * A cottage on a grass tile `size` metres wide (0.5) (research/concepts/things/09-buildings.png, House): cream walls with a
 * brown timber frame, a red tiled gable roof, a stone chimney, warm-lit windows in brown frames, a wooden door, a
 * little fence, a round tree and a stepping-stone path. 'Door' is its own mesh (hinged at its left edge).
 */
export function house(options: { size?: number; walls?: number; roof?: number; ground?: boolean } = {}): Group {
  const S = options.size ?? 0.5, cream = options.walls ?? 0xe8c486, wood = 0x8a5232, out = named(new Group(), 'House'), g = new Group();
  const W = 0.52 * S, D = 0.4 * S, H = 0.3 * S, z0 = -0.04 * S;
  if (options.ground !== false) g.add(ground(S, S * 0.86, { height: 0.07 * S, seed: 3 }));
  g.add(toy(block(W, H, D, [0, H / 2, z0], 0.04), lit(cream, 0.12), { vary: 0.06 }));
  // the timber frame: corner posts, a beam round the middle and one under the eaves
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(toy(block(0.025 * S, H, 0.025 * S, [sx * W / 2, H / 2, z0 + sz * D / 2]), lit(wood, 0.2), {}));
  for (const y of [H * 0.5, H - 0.012 * S]) {
    for (const sz of [-1, 1]) g.add(toy(block(W + 0.01 * S, 0.02 * S, 0.02 * S, [0, y, z0 + sz * (D / 2 + 0.003 * S)]), lit(wood, 0.2), {}));
    for (const sx of [-1, 1]) g.add(toy(block(0.02 * S, 0.02 * S, D + 0.01 * S, [sx * (W / 2 + 0.003 * S), y, z0]), lit(wood, 0.2), {}));
  }
  // the roof and the chimney
  // the ridge runs front to back, so the gable stands over the door
  const roof = gableRoof(D + 0.09 * S, W + 0.07 * S, 0.22 * S, options.roof ?? 0xd8583a);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, H, z0);
  g.add(roof);
  g.add(toy(block(0.06 * S, 0.16 * S, 0.06 * S, [W * 0.28, H + 0.14 * S, z0 - D * 0.18], 0.1), (c, n) => tone(0x9a9aa4)(c, n), { vary: 0.12 }));
  g.add(toy(block(0.075 * S, 0.02 * S, 0.075 * S, [W * 0.28, H + 0.225 * S, z0 - D * 0.18], 0.2), lit(0x7a7a84), {}));
  // windows: warm light in brown frames with a cross, two in front and one on each side
  const window = (x: number, y: number, z: number, side: boolean) => {
    const [w, d] = side ? [0.012 * S, 0.07 * S] : [0.07 * S, 0.012 * S];
    g.add(toy(block(w * (side ? 1 : 1.25), 0.085 * S, d * (side ? 1.25 : 1), [x, y, z], 0.1), lit(wood, 0.2), {}));
    g.add(toy(block(w, 0.065 * S, d, [x + (side ? Math.sign(x) * 0.003 * S : 0), y, z + (side ? 0 : 0.003 * S)]), LIT, { emissive: 0x6a4000 }));
    g.add(toy(block(side ? w * 1.1 : 0.008 * S, 0.07 * S, side ? 0.008 * S : d * 1.1, [x + (side ? Math.sign(x) * 0.005 * S : 0), y, z + (side ? 0 : 0.005 * S)]), lit(wood), {}));
  };
  window(-W * 0.28, H * 0.55, z0 + D / 2 + 0.004 * S, false);
  window(W * 0.3, H * 0.55, z0 + D / 2 + 0.004 * S, false);
  for (const sx of [-1, 1]) window(sx * (W / 2 + 0.004 * S), H * 0.55, z0, true);
  // a fence by the corner, a round tree, stepping stones to the door
  for (let i = 0; i < 4; i++) g.add(toy(block(0.015 * S, 0.06 * S, 0.015 * S, [-0.44 * S + i * 0.05 * S, 0.03 * S, 0.34 * S]), lit(wood, 0.2), {}));
  for (const y of [0.025, 0.045]) g.add(toy(block(0.17 * S, 0.01 * S, 0.01 * S, [-0.365 * S, y * S, 0.34 * S]), lit(wood, 0.2), {}));
  const tree = roundTree(0.32 * S, { seed: 4 });
  tree.position.set(0.38 * S, 0, -0.22 * S);
  g.add(tree);
  for (const [x, z] of [[0.0, 0.22], [0.03, 0.29], [-0.01, 0.36]]) g.add(toy(blob(0.025 * S, 7, 0, 0.1).scale(1.3, 0.3, 1).translate(x * S, 0.004 * S, z * S), lit(0xb4b4bc), {}));
  out.add(named(merge(g), 'Body'));
  const door = named(toy(block(0.07 * S, 0.13 * S, 0.012 * S, [0.035 * S, 0.065 * S, 0], 0.1), (c, n) => (n.z > 0.5 ? mix(wood, 0xffffff, 0.1) : wood), {}), 'Door');
  door.position.set(-0.035 * S, 0, z0 + D / 2 + 0.006 * S);
  out.add(door);
  return out;
}

/** Stone in two greys, the tops a little lighter. */
const stone = (c = 0x8a8a98) => tone(c, mix(c, 0xffffff, 0.12));
/** A random number from 0 to 1, seeded. */
const random = (seed: number) => () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);

/**
 * Battlements along the top of a wall `length` long (along X), `thickness` thick: merlons (teeth) `size` tall with
 * gaps between, standing on y = 0. A Group of toy pieces.
 */
export function battlements(length: number, thickness: number, size: number, color = 0x8a8a98): Group {
  const g = new Group(), n = Math.max(2, Math.round(length / (size * 1.6)));
  for (let i = 0; i < n; i++) g.add(toy(block(length / n * 0.6, size, thickness * 1.08, [-length / 2 + (i + 0.5) * (length / n), size / 2, 0], 0.12), stone(color), { vary: 0.08 }));
  return g;
}
/** Stones sticking a little out of a wall face: `count` small blocks in lighter and darker greys over a w × h face. */
function stonework(g: Group, w: number, h: number, at: [number, number, number], facing: 'x' | 'z', count: number, seed: number, color = 0x8a8a98): void {
  const r = random(seed);
  for (let i = 0; i < count; i++) {
    const a = (r() - 0.5) * w * 0.85, y = r() * h * 0.85 + h * 0.07, bw = w * (0.08 + r() * 0.06), bh = h * 0.05;
    const shade = mix(color, r() > 0.5 ? 0xffffff : 0x3a3a48, 0.15);
    g.add(toy(facing === 'z' ? block(bw, bh, w * 0.02, [at[0] + a, at[1] + y, at[2]]) : block(w * 0.02, bh, bw, [at[0], at[1] + y, at[2] + a]), stone(shade), {}));
  }
}
/** A pointed four-sided roof `width` across and `height` tall in `color`, an orange finial on top, its foot at y = 0. */
export function pyramidRoof(width: number, height: number, color = 0x4a6ad8): Group {
  const g = new Group();
  g.add(toy(new ConeGeometry(width * 0.74, height, 4).rotateY(Math.PI / 4).translate(0, height / 2, 0), tone(color, mix(color, 0xffffff, 0.12)), { vary: 0.08 }));
  g.add(toy(new ConeGeometry(width * 0.08, height * 0.25, 5).translate(0, height * 1.05, 0), lit(0xe8823a, 0.2), {}));
  return g;
}

/**
 * A castle on a grass tile `size` metres wide (0.6) (research/concepts/things/09-buildings.png, Castle): grey stone curtain walls
 * with battlements, three square towers with blue pointed roofs and orange finials, a tall keep, a gatehouse with an
 * arched wooden gate ('Gate', hinged on its left) and a sandy path, stones sticking out of every wall.
 */
export function castle(options: { size?: number; stone?: number; roof?: number; ground?: boolean } = {}): Group {
  const S = options.size ?? 0.6, grey = options.stone ?? 0x8a8a98, blue = options.roof ?? 0x4a6ad8, out = named(new Group(), 'Castle'), g = new Group();
  if (options.ground !== false) {
    g.add(ground(S * 0.78, S * 0.74, { height: 0.07 * S, seed: 5 }));
    g.add(toy(block(0.1 * S, 0.006 * S, 0.1 * S, [0, 0.003 * S, 0.32 * S], 0.2), lit(0xd8b88a, 0.15), {}));
  }
  const wallH = 0.17 * S, T = 0.05 * S, add = (geo: Group, x: number, y: number, z: number, ry = 0) => { geo.rotation.y = ry; geo.position.set(x, y, z); g.add(geo); };
  // the curtain walls round the yard, battlements on top, stonework on their faces
  const walls: [number, number, number, number][] = [[0, 0.2 * S, 0.5 * S, 0], [0, -0.2 * S, 0.5 * S, 0], [-0.25 * S, 0, 0.4 * S, Math.PI / 2], [0.25 * S, 0, 0.4 * S, Math.PI / 2]];
  walls.forEach(([x, z, len, ry], k) => {
    const w = new Group();
    w.add(toy(block(len, wallH, T, [0, wallH / 2, 0], 0.05), stone(grey), { vary: 0.06 }));
    w.add(battlements(len, T, 0.04 * S, grey).translateY(wallH));
    stonework(w, len, wallH, [0, 0, T / 2 + 0.004 * S], 'z', 7, k + 1, grey);
    add(w, x, 0, z, ry);
  });
  // the keep: tall, battlements, two dark windows
  const keep = new Group(), kh = 0.36 * S;
  keep.add(toy(block(0.2 * S, kh, 0.18 * S, [0, kh / 2, 0], 0.04), stone(grey), { vary: 0.06 }));
  keep.add(battlements(0.2 * S, 0.18 * S, 0.045 * S, grey).translateY(kh));
  for (const x of [-0.04, 0.05]) keep.add(toy(block(0.025 * S, 0.045 * S, 0.01 * S, [x * S, kh * 0.62, 0.091 * S], 0.2), 0x2a2a34, {}));
  stonework(keep, 0.2 * S, kh, [0, 0, 0.091 * S], 'z', 6, 11, grey);
  add(keep, 0.02 * S, 0, -0.06 * S);
  // three towers with blue pointed roofs
  for (const [x, z, h] of [[-0.25, 0.05, 0.36], [0.25, -0.02, 0.38], [0.0, -0.22, 0.44]]) {
    const t = new Group(), th = h * S, tw = 0.15 * S;
    t.add(toy(block(tw, th, tw, [0, th / 2, 0], 0.05), stone(grey), { vary: 0.06 }));
    t.add(toy(block(tw * 1.12, 0.025 * S, tw * 1.12, [0, th, 0], 0.15), stone(mix(grey, 0x3a3a48, 0.15)), {}));
    t.add(pyramidRoof(tw * 1.15, 0.17 * S, blue).translateY(th + 0.012 * S));
    for (const sx of [-1, 1]) t.add(toy(block(0.022 * S, 0.04 * S, 0.01 * S, [sx * 0.025 * S, th * 0.82, tw / 2 + 0.003 * S], 0.2), 0x2a2a34, {}));
    stonework(t, tw, th, [0, 0, tw / 2 + 0.004 * S], 'z', 4, Math.round(h * 100), grey);
    add(t, x * S, 0, z * S);
  }
  // the gatehouse in the middle of the front wall, an arched stone frame round the gate
  const gate = new Group(), gh = 0.22 * S;
  gate.add(toy(block(0.15 * S, gh, 0.09 * S, [0, gh / 2, 0], 0.05), stone(grey), { vary: 0.06 }));
  gate.add(battlements(0.15 * S, 0.09 * S, 0.04 * S, grey).translateY(gh));
  const arch: [number, number][] = [[-0.045 * S, 0], [0.045 * S, 0], [0.045 * S, 0.08 * S], [0.032 * S, 0.105 * S], [0, 0.115 * S], [-0.032 * S, 0.105 * S], [-0.045 * S, 0.08 * S]];
  gate.add(toy(slab(arch.map(([x, y]) => [x * 1.35, y * 1.15] as [number, number]), 0.012 * S, 0.2).translate(0, 0, 0.046 * S), stone(mix(grey, 0x3a3a48, 0.2)), {}));
  add(gate, 0, 0, 0.21 * S);
  out.add(named(merge(g), 'Walls'));
  const door = named(toy(slab(arch.map(([x, y]) => [x + 0.045 * S, y] as [number, number]), 0.014 * S, 0.15), (c, n) => (Math.abs(n.z) > 0.5 ? 0x9a6234 : 0x6a4224), { vary: 0.06 }), 'Gate');
  door.position.set(-0.045 * S, 0, 0.21 * S + 0.053 * S);
  out.add(door);
  return out;
}

/** A cone roof of `tiers` overlapping tiled rings, `radius` at its eaves and `height` tall, `sides` facets round, a finial. */
export function tieredRoof(radius: number, height: number, color = 0xd8583a, sides = 8, tiers = 4): Group {
  const g = new Group();
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers, t1 = (i + 1.25) / tiers, r0 = radius * (1 - t0), r1 = Math.max(0, radius * (1 - t1));
    g.add(toy(turned([[r0 * 0.96, height * t0], [r0, height * t0 + height * 0.03], [r1, height * Math.min(1, t1)], [0, height * Math.min(1, t1)]], sides), tone(i % 2 ? color : mix(color, 0x8a2a1a, 0.15)), { vary: 0.07 }));
  }
  g.add(toy(new ConeGeometry(radius * 0.08, height * 0.2, 5).translate(0, height * 1.05, 0), lit(0xe8a83a, 0.2), {}));
  return g;
}

/**
 * A stone watchtower `size` metres across its base (0.35) (research/concepts/things/09-buildings.png, Tower): an eight-sided grey
 * tower narrowing a little upwards to a flared collar, round blue windows in stone rims, stones sticking out, an arched
 * wooden door ('Door'), a tiered red cone roof with a finial, on a ring of grass over a heap of sharp grey rocks.
 */
export function tower(options: { size?: number; stone?: number; roof?: number } = {}): Group {
  const S = options.size ?? 0.35, grey = options.stone ?? 0x8a8a98, out = named(new Group(), 'Tower'), g = new Group(), r = random(7);
  // the rocks and the grass ring they hold
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; g.add(toy(blob(S * (0.12 + r() * 0.05), k + 3, 0, 0.25).scale(1, 1.2, 1).translate(Math.cos(a) * S * 0.32, -S * 0.17, Math.sin(a) * S * 0.32), stone(0x9a9aa6), { vary: 0.1 })); }
  g.add(toy(blob(S * 0.3, 5, 1, 0.15).scale(1.25, 0.8, 1.25).translate(0, -S * 0.2, 0), stone(0x8a8a96), {}));
  g.add(toy(turned([[S * 0.42, 0], [S * 0.43, S * 0.04], [0, S * 0.04]], 8).translate(0, -S * 0.02, 0), lit(0x6abf3a, 0.2), {}));
  // the tower
  const H = S * 1.15, R = S * 0.3;
  g.add(toy(turned([[R, 0], [R * 0.84, H * 0.86], [R * 0.95, H * 0.9], [R * 0.95, H], [0, H]], 8).translate(0, S * 0.02, 0), stone(grey), { vary: 0.06 }));
  // round windows: blue glass in a stone rim, high up on four sides and one lower
  const port = (a: number, y: number, rad: number) => {
    const d = (R - (R * 0.16 * y) / H) * 0.98, x = Math.sin(a) * d, z = Math.cos(a) * d;
    g.add(toy(ring(rad * 0.65, rad, rad * 0.5, 8).rotateX(Math.PI / 2).rotateY(a).translate(x, y, z), stone(mix(grey, 0x3a3a48, 0.15)), {}));
    g.add(toy(new CylinderGeometry(rad * 0.66, rad * 0.66, rad * 0.3, 8).rotateX(Math.PI / 2).rotateY(a).translate(x, y, z), lit(0x4a8ae0, 0.15), {}));
  };
  for (const a of [0.4, 2.0, 3.6, 5.2]) port(a, H * 0.82, S * 0.06);
  port(0.6, H * 0.52, S * 0.05);
  // stones sticking out of the walls
  for (let k = 0; k < 10; k++) { const a = r() * Math.PI * 2, y = r() * H * 0.75 + H * 0.08, d = R * (1 - (0.16 * y) / H); g.add(toy(block(S * 0.07, S * 0.03, S * 0.02).rotateY(a).translate(Math.sin(a) * d, y, Math.cos(a) * d), stone(mix(grey, r() > 0.5 ? 0xffffff : 0x3a3a48, 0.15)), {})); }
  // the door's stone arch
  const arch: [number, number][] = [[-0.05 * S, 0], [0.05 * S, 0], [0.05 * S, 0.1 * S], [0.035 * S, 0.13 * S], [0, 0.14 * S], [-0.035 * S, 0.13 * S], [-0.05 * S, 0.1 * S]];
  g.add(toy(slab(arch.map(([x, y]) => [x * 1.35, y * 1.15] as [number, number]), 0.02 * S, 0.2).translate(0, S * 0.02, R * 0.97), stone(mix(grey, 0x3a3a48, 0.2)), {}));
  // the roof
  const roof = tieredRoof(R * 1.35, S * 0.5, options.roof ?? 0xd8583a);
  roof.position.y = S * 0.02 + H;
  g.add(roof);
  out.add(named(merge(g), 'Body'));
  const door = named(toy(slab(arch.map(([x, y]) => [x + 0.05 * S, y] as [number, number]), 0.02 * S, 0.15), (c, n) => (Math.abs(n.z) > 0.5 ? 0x9a6234 : 0x6a4224), {}), 'Door');
  door.position.set(-0.05 * S, S * 0.02, R * 0.99 + 0.006 * S);
  out.add(door);
  return out;
}

/**
 * A lighthouse `size` metres across its island (0.4) (research/concepts/things/09-buildings.png, Lighthouse): an eight-sided
 * tower in red and white bands on a white plinth, a gallery with a railing, a lantern room glowing yellow behind dark
 * posts ('Light': turn its beam or blink it), a red ring and a white dome, a door, on a sandy island over pale blue rock
 * with a wooden pier.
 */
export function lighthouse(options: { size?: number; color?: number } = {}): Group {
  const S = options.size ?? 0.4, red = options.color ?? 0xd8382e, white = 0xf2f0ea, wood = 0xa86a3a, out = named(new Group(), 'Lighthouse'), g = new Group();
  // the island: pale blue rock under a sandy top, a pier reaching out
  g.add(toy(blob(S * 0.42, 9, 1, 0.12).scale(1.2, 0.35, 1.2).translate(0, -S * 0.07, 0), (c, n) => (n.y > 0.5 ? 0xd8c8a8 : 0xa8c8e0), { vary: 0.1 }));
  g.add(toy(turned([[S * 0.4, 0], [S * 0.4, S * 0.03], [0, S * 0.03]], 9), lit(0xe0c49a, 0.2), { vary: 0.06 }));
  g.add(toy(block(S * 0.14, S * 0.02, S * 0.3, [S * 0.2, S * 0.025, S * 0.32], 0.15), lit(wood, 0.25), {}));
  for (const [x, z] of [[0.14, 0.45], [0.26, 0.45], [0.26, 0.25]]) g.add(toy(block(S * 0.025, S * 0.1, S * 0.025, [x * S, S * 0.0, z * S]), lit(mix(wood, PALETTE.shade, 0.2)), {}));
  // the plinth and the banded tower
  g.add(toy(turned([[S * 0.17, S * 0.03], [S * 0.17, S * 0.11], [S * 0.15, S * 0.12], [0, S * 0.12]], 8), lit(white, 0.15), {}));
  const bands = 6, y0 = S * 0.12, h = S * 0.68, r0 = S * 0.14, r1 = S * 0.095;
  for (let i = 0; i < bands; i++) {
    const a = i / bands, b = (i + 1) / bands, ra = r0 + (r1 - r0) * a, rb = r0 + (r1 - r0) * b;
    g.add(toy(turned([[ra, y0 + h * a], [rb, y0 + h * b], [0, y0 + h * b]], 8), lit(i % 2 ? white : red, 0.2), { vary: 0.05 }));
  }
  g.add(toy(block(S * 0.06, S * 0.1, S * 0.01, [0, S * 0.17, r0 * 0.98], 0.1), 0x3a2a24, {}));
  // the gallery and its railing
  const gy = y0 + h;
  g.add(toy(turned([[r1 * 0.95, gy], [r1 * 1.5, gy + S * 0.01], [r1 * 1.5, gy + S * 0.03], [0, gy + S * 0.03]], 8), lit(red, 0.2), {}));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.add(toy(block(S * 0.01, S * 0.06, S * 0.01, [Math.cos(a) * r1 * 1.42, gy + S * 0.06, Math.sin(a) * r1 * 1.42]), lit(0x3a3c44), {})); }
  g.add(toy(ring(r1 * 1.36, r1 * 1.48, S * 0.012, 8).translate(0, gy + S * 0.09, 0), lit(0x3a3c44), {}));
  // the lantern room: dark posts, then a red ring and a white dome on top
  const ly = gy + S * 0.03, lh = S * 0.12, lr = r1 * 0.85;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; g.add(toy(block(S * 0.012, lh, S * 0.012, [Math.cos(a) * lr, ly + lh / 2, Math.sin(a) * lr]), lit(0x3a3c44), {})); }
  g.add(toy(turned([[lr * 1.15, ly + lh], [lr * 1.15, ly + lh + S * 0.025], [0, ly + lh + S * 0.025]], 8), lit(red, 0.2), {}));
  g.add(toy(turned([[lr * 1.1, ly + lh + S * 0.025], [lr * 0.8, ly + lh + S * 0.07], [lr * 0.3, ly + lh + S * 0.1], [0, ly + lh + S * 0.105]], 8), lit(white, 0.15), {}));
  g.add(toy(new ConeGeometry(S * 0.012, S * 0.04, 5).translate(0, ly + lh + S * 0.12, 0), lit(0x3a3c44), {}));
  out.add(named(merge(g), 'Body'));
  const light = new Mesh(new CylinderGeometry(lr * 0.85, lr * 0.85, lh * 0.9, 8).translate(0, ly + lh / 2, 0), glowMat(0xfff0a0));
  out.add(named(light, 'Light'));
  return out;
}

/**
 * A windmill on a round grass tile `size` metres wide (0.45) (research/concepts/things/09-buildings.png, Windmill): an
 * eight-sided tower of brown planks with dark seams on a stone base with a door, a pointed wooden cap, and four
 * lattice sails on a hub at its front ('Sails': spin round Z).
 */
export function windmill(options: { size?: number; wood?: number; ground?: boolean } = {}): Group {
  const S = options.size ?? 0.45, wood = options.wood ?? 0xb06a3a, cream = 0xe8d8b8, out = named(new Group(), 'Windmill'), g = new Group();
  if (options.ground !== false) {
    g.add(ground(S, S, { round: true, height: 0.08 * S, seed: 7 }));
    for (const [x, z] of [[-0.3, 0.1], [0.25, 0.25], [0.1, -0.32]]) for (let k = 0; k < 3; k++) g.add(toy(slab([[-S * 0.012, 0], [S * 0.012, 0], [0, S * (0.05 + k * 0.015)]], S * 0.01, 0.2).rotateY(k * 1.1).rotateZ((k - 1) * 0.3).translate(x * S + (k - 1) * S * 0.012, 0, z * S), lit(0x4aa83a), {}));
  }
  // the stone base with its door, the plank tower with dark seams, the cap
  g.add(toy(turned([[S * 0.2, 0], [S * 0.19, S * 0.12], [0, S * 0.12]], 8), stone(0xc8b8a4), { vary: 0.08 }));
  const r0 = S * 0.175, r1 = S * 0.12, h = S * 0.5, y0 = S * 0.12;
  g.add(toy(turned([[r0, y0], [r1, y0 + h], [0, y0 + h]], 8), tone(wood, mix(wood, 0xffffff, 0.1)), { vary: 0.1 }));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.PI / 16, seam = block(S * 0.006, h * 0.98, S * 0.006);
    seam.rotateX(Math.atan2(r0 - r1, h) * 0).rotateY(a);
    const rm = (r0 + r1) / 2 * Math.cos(Math.PI / 8) * 1.0;
    g.add(toy(seam.translate(Math.sin(a) * rm, y0 + h / 2, Math.cos(a) * rm), mix(wood, PALETTE.shade, 0.35), {}));
  }
  g.add(toy(turned([[r1 * 1.12, y0 + h], [r1 * 1.1, y0 + h + S * 0.06], [r1 * 0.7, y0 + h + S * 0.14], [0, y0 + h + S * 0.2]], 8), tone(mix(wood, 0x7a4a2c, 0.3), wood), { vary: 0.08 }));
  g.add(toy(block(S * 0.08, S * 0.1, S * 0.012, [0, S * 0.05, S * 0.19], 0.1), (c, n) => (n.z > 0.5 ? 0x7a4a2c : 0x5a3a24), {}));
  out.add(named(merge(g), 'Body'));
  // the sails: four lattice arms on a hub
  const sails = new Group(), L = S * 0.52, w = S * 0.15;
  for (let k = 0; k < 4; k++) {
    const arm = new Group();
    arm.add(toy(block(S * 0.018, L, S * 0.015, [0, L / 2, 0]), lit(cream, 0.15), {}));
    for (const x of [w / 2, 0]) arm.add(toy(block(S * 0.012, L * 0.75, S * 0.012, [x + w / 2 + S * 0.01, L * 0.6, 0]), lit(cream, 0.15), {}));
    for (let i = 0; i <= 5; i++) arm.add(toy(block(w, S * 0.01, S * 0.01, [w / 2 + S * 0.01, L * 0.225 + (i * L * 0.75) / 5, 0]), lit(cream, 0.15), {}));
    arm.rotation.z = (k * Math.PI) / 2;
    sails.add(arm);
  }
  sails.add(toy(new CylinderGeometry(S * 0.03, S * 0.03, S * 0.05, 8).rotateX(Math.PI / 2), lit(0x8a6a4a), {}));
  const sailMesh = named(merge(sails), 'Sails');
  sailMesh.position.set(0, y0 + h * 0.92, r1 + S * 0.04);
  sailMesh.rotation.z = 0.5;
  out.add(sailMesh);
  return out;
}

/**
 * A stone arch bridge over a river on a grass tile `size` metres wide (0.6), the river running along Z and the bridge
 * across X (research/concepts/things/09-buildings.png, Bridge): a curved stone arch with an opening over the water, a deck paved
 * in tan and grey stones, parapets of stone blocks with posts at the ends, trees on both banks. 'Water' is its own mesh.
 */
export function bridge(options: { size?: number; stone?: number } = {}): Group {
  const S = options.size ?? 0.6, grey = options.stone ?? 0x9a96a0, out = named(new Group(), 'Bridge'), g = new Group(), r = random(3);
  // the banks: two grass tiles with the river between them, a brown bed under the water
  for (const side of [-1, 1]) {
    const bank = ground(S * 0.34, S * 0.75, { height: 0.08 * S, seed: 4 + side });
    bank.position.x = side * 0.33 * S;
    g.add(bank);
  }
  g.add(toy(block(S * 0.32, S * 0.04, S * 0.75, [0, -0.07 * S, 0], 0.1), lit(0x8a5a36, 0.2), {}));
  // the arch: a stone span with a curved top and an opening underneath, as wide as the deck
  const span = 0.42 * S, rise = 0.2 * S, hole = 0.15 * S, W = 0.27 * S, arch: [number, number][] = [];
  for (let k = 0; k <= 10; k++) { const t = k / 10, x = -span + 2 * span * t; arch.push([x, 0.06 * S + rise * Math.sin(Math.PI * t) * 0.75]); }
  arch.push([span, -0.02 * S]);
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; arch.push([Math.cos(a) * hole, -0.02 * S + Math.sin(a) * hole * 0.9]); }
  arch.push([-span, -0.02 * S]);
  g.add(toy(slab(arch, W, 0.008), stone(grey), { vary: 0.1 }));
  // the deck: pavers in tan and grey along the arch's top
  const top = (x: number) => 0.06 * S + rise * Math.sin(Math.PI * ((x + span) / (2 * span))) * 0.75;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
    const x = -span * 0.9 + (i + 0.5) * (span * 1.8) / 9, slope = Math.atan2(top(x + 0.01 * S) - top(x - 0.01 * S), 0.02 * S);
    const p = block(span * 0.18, 0.012 * S, W * 0.28, [0, 0, 0], 0.2);
    p.rotateZ(slope);
    p.translate(x, top(x) + 0.006 * S, (j - 1) * W * 0.3);
    g.add(toy(p, lit(r() > 0.5 ? 0xd8b888 : 0xa8a4b0, 0.15), {}));
  }
  // the parapets: blocks along both edges following the curve, bigger posts at the four ends
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const x = -span * 0.75 + (i + 0.5) * (span * 1.5) / 7, slope = Math.atan2(top(x + 0.01 * S) - top(x - 0.01 * S), 0.02 * S);
      const b = block(span * 0.21, 0.05 * S, 0.04 * S, [0, 0, 0], 0.15);
      b.rotateZ(slope);
      b.translate(x, top(x) + 0.03 * S, side * (W / 2 - 0.0 * S));
      g.add(toy(b, stone(mix(grey, r() > 0.5 ? 0xd8b888 : 0x6a6a78, 0.2)), {}));
    }
    for (const end of [-1, 1]) g.add(toy(block(0.05 * S, 0.09 * S, 0.05 * S, [end * span * 0.92, 0.1 * S, side * W / 2], 0.12), stone(mix(grey, 0xd8b888, 0.25)), {}));
  }
  // trees on the banks
  const t1 = roundTree(0.3 * S, { seed: 2 }); t1.position.set(-0.42 * S, 0, -0.22 * S); g.add(t1);
  const t2 = roundTree(0.26 * S, { seed: 5 }); t2.position.set(0.42 * S, 0, -0.24 * S); g.add(t2);
  const t3 = pineTree(0.36 * S, { seed: 6 }); t3.position.set(-0.26 * S, 0.0, -0.3 * S); g.add(t3);
  out.add(named(merge(g), 'Body'));
  out.add(named(toy(block(S * 0.32, S * 0.03, S * 0.74, [0, -0.04 * S, 0], 0.1), (c, n) => (n.y > 0.5 ? 0x3a8ae0 : 0x2a68b0), { vary: 0.05 }), 'Water'));
  return out;
}

/**
 * A camping tent on a grass tile `size` metres wide (0.5), its open front to +Z (research/concepts/things/09-buildings.png,
 * Tent): a ridge tent striped green and tan down its slopes, crossed poles standing above the ridge at both ends, guy
 * ropes to pegs, an open flap over a dark doorway, a little campfire in front ('Fire', flicker it), a pile of logs and
 * a patch of bare earth.
 */
export function tent(options: { size?: number; colors?: [number, number]; ground?: boolean } = {}): Group {
  const S = options.size ?? 0.5, [green, tan] = options.colors ?? [0x5a8a3a, 0xd8b884], wood = 0x9a6234, out = named(new Group(), 'Tent'), g = new Group();
  if (options.ground !== false) {
    g.add(ground(S, S * 0.9, { height: 0.07 * S, seed: 9 }));
    g.add(toy(blob(S * 0.12, 4, 1, 0.1).scale(1.3, 0.05, 1).translate(-S * 0.08, 0.002 * S, S * 0.25), lit(0xc8a87a, 0.1), {}));
  }
  const w = S * 0.31, h = S * 0.36, d = S * 0.27, zc = -S * 0.07, len = Math.hypot(w, h), slope = Math.atan2(h, w), strips = 6;
  // the two slopes, each of strips running down from the ridge, green and tan in turn
  for (const side of [-1, 1]) for (let i = 0; i < strips; i++) {
    const strip = block(len, S * 0.012, (2 * d) / strips * 1.01, [0, 0, 0], 0.2);
    strip.rotateZ(side * -slope);
    strip.translate(side * w / 2, h / 2, zc - d + ((i + 0.5) * 2 * d) / strips);
    g.add(toy(strip, tone(i % 2 ? tan : green), { vary: 0.06 }));
  }
  // the back wall, the dark doorway, the open flap folded back on one side
  g.add(toy(slab([[-w, 0], [w, 0], [0, h]], S * 0.01, 0.1).translate(0, 0, zc - d), lit(green, 0.2), {}));
  g.add(toy(slab([[-w * 0.6, 0], [w * 0.6, 0], [0, h * 0.62]], S * 0.005, 0.1).translate(0, 0, zc + d - S * 0.02), 0x1e2a1a, {}));
  g.add(toy(slab([[-w, 0], [-w * 0.05, 0], [0, h]], S * 0.01, 0.1).translate(0, 0, zc + d), lit(tan, 0.2), {}));
  g.add(toy(slab([[w * 0.55, 0], [w, 0], [w * 0.2, h * 0.82]], S * 0.01, 0.1).translate(0, 0, zc + d + 0.005 * S), lit(green, 0.2), {}));
  // crossed poles at both ends sticking above the ridge, guy ropes down to pegs
  for (const z of [zc - d - 0.01 * S, zc + d + 0.012 * S]) {
    for (const side of [-1, 1]) g.add(toy(taperedTube([new Vector3(side * w * 0.42, 0, z), new Vector3(-side * w * 0.2, h + 0.08 * S, z)], 0.012 * S, 0.01 * S, 5, 1), lit(wood, 0.25), {}));
    const zp = z + Math.sign(z - zc) * 0.12 * S;
    g.add(toy(taperedTube([new Vector3(0, h + 0.03 * S, z), new Vector3(0, 0.01 * S, zp)], 0.0025 * S, 0.0025 * S, 4, 1), lit(0xd8d0c0), {}));
    g.add(toy(block(0.012 * S, 0.03 * S, 0.012 * S, [0, 0.012 * S, zp]), lit(wood), {}));
  }
  // a pile of logs by the side
  for (const [y, x, z] of [[0.02, -0.38, 0.05], [0.02, -0.38, 0.11], [0.055, -0.38, 0.08]]) g.add(toy(new CylinderGeometry(0.03 * S, 0.03 * S, 0.17 * S, 6).rotateZ(Math.PI / 2).translate(x * S, y * S, z * S), (c, n) => (Math.abs(n.x) > 0.8 ? 0xe8c08a : lit(wood, 0.25)(c, n)), {}));
  // the campfire's logs
  for (const a of [0.4, -0.4 + Math.PI / 2]) g.add(toy(new CylinderGeometry(0.018 * S, 0.018 * S, 0.14 * S, 6).rotateZ(Math.PI / 2).rotateY(a).translate(0.12 * S, 0.015 * S, 0.3 * S), lit(wood, 0.25), {}));
  out.add(named(merge(g), 'Body'));
  const flame = fire(0.13 * S, { seed: 5 });
  flame.position.set(0.12 * S, 0.02 * S, 0.3 * S);
  out.add(flame);
  return out;
}

/**
 * A market stall `size` metres wide (0.5), its counter facing +Z, standing on y = 0 without a tile unless `ground: true`
 * (research/concepts/things/09-buildings.png, Market Stall): a wooden frame of four posts with braces, a counter with three
 * crates of red, purple and green produce, a red-and-white striped awning sloping forwards with scalloped edges.
 */
export function marketStall(options: { size?: number; colors?: [number, number]; ground?: boolean } = {}): Group {
  const S = options.size ?? 0.5, [red, white] = options.colors ?? [0xd8302a, 0xf4f0ea], wood = 0xb06a36, out = named(new Group(), 'Market Stall'), g = new Group();
  if (options.ground === true) g.add(ground(S * 1.2, S, { height: 0.06 * S, seed: 2 }));
  const W = S, D = S * 0.5, back = -D / 2, front = D / 2, hb = S * 0.78, hf = S * 0.66, post = S * 0.04, woodPaint = lit(wood, 0.25);
  for (const x of [-W / 2, W / 2]) {
    g.add(toy(block(post, hb, post, [x, hb / 2, back], 0.1), woodPaint, {}));
    g.add(toy(block(post, hf, post, [x, hf / 2, front], 0.1), woodPaint, {}));
    g.add(toy(block(post * 0.7, post * 0.7, D, [x, S * 0.5, 0], 0.1), woodPaint, {}));
  }
  g.add(toy(block(W, post * 0.7, post * 0.7, [0, S * 0.5, back], 0.1), woodPaint, {}));
  // the counter: a thick top on a front board, three crates of produce on it
  const cy = S * 0.32;
  g.add(toy(block(W * 0.96, S * 0.035, D * 0.8, [0, cy, D * 0.05], 0.15), tone(wood, mix(wood, 0xffffff, 0.12)), {}));
  g.add(toy(block(W * 0.92, S * 0.12, S * 0.02, [0, cy - S * 0.08, front - S * 0.04], 0.15), woodPaint, {}));
  [[-0.28, 0xd8382e], [0.0, 0x8a3ab8], [0.28, 0x5ab83a]].forEach(([x, c], k) => {
    const cx = x * W, cz = D * 0.08, cw = W * 0.24, cd = D * 0.5, ch = S * 0.06, base = cy + S * 0.018;
    for (const sz of [-1, 1]) g.add(toy(block(cw, ch, S * 0.012, [cx, base + ch / 2, cz + sz * cd / 2], 0.1), lit(mix(wood, 0xffffff, 0.15)), {}));
    for (const sx of [-1, 1]) g.add(toy(block(S * 0.012, ch, cd, [cx + sx * cw / 2, base + ch / 2, cz], 0.1), lit(mix(wood, 0xffffff, 0.15)), {}));
    for (let i = 0; i < 6; i++) g.add(toy(blob(S * 0.03, k * 10 + i, 1, 0.12).translate(cx + ((i % 3) - 1) * cw * 0.28, base + ch * 0.8, cz + (Math.floor(i / 3) - 0.5) * cd * 0.45), lit(c, 0.2), { vary: 0.1 }));
  });
  // the awning: stripes sloping from the back down to the front, a scalloped flap at the front
  const n = 6, sw = (W + post * 2) / n, rise = hb - hf, depth = D + S * 0.08, len = Math.hypot(depth, rise), tilt = Math.atan2(rise, depth);
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? white : red, x = -W / 2 - post + (i + 0.5) * sw;
    g.add(toy(block(sw * 1.01, S * 0.015, len, [0, 0, 0], 0.15).rotateX(tilt).translate(x, (hb + hf) / 2 + S * 0.02, 0), tone(c, mix(c, 0xffffff, 0.05)), {}));
    const scallop: [number, number][] = [[-sw / 2, 0]];
    for (let k = 0; k <= 6; k++) { const a = Math.PI + (k / 6) * Math.PI; scallop.push([Math.cos(a) * sw / 2, Math.sin(a) * sw * 0.42]); }
    g.add(toy(slab(scallop, S * 0.012, 0.1).translate(x, hf + S * 0.01, front + S * 0.04), lit(c, 0.15), {}));
  }
  out.add(named(merge(g), 'Body'));
  return out;
}

/**
 * A sandstone temple on a sand tile `size` metres wide (0.5), its front to +Z (research/concepts/things/09-buildings.png,
 * Temple): a stepped base, faceted columns with bases and capitals all round, an inner wall with a dark doorway, an
 * entablature with dentils, a pediment and a gable roof.
 */
export function temple(options: { size?: number; stone?: number; ground?: boolean } = {}): Group {
  const S = options.size ?? 0.5, sand = options.stone ?? 0xd8985a, out = named(new Group(), 'Temple'), g = new Group(), paint = tone(sand, mix(sand, 0xffffff, 0.15));
  if (options.ground !== false) g.add(ground(S, S * 0.92, { height: 0.07 * S, grass: 0xe8c890, earth: 0xc89050, seed: 4 }));
  // the stepped base
  [[0.86, 0.72, 0.03], [0.8, 0.66, 0.06], [0.74, 0.6, 0.09]].forEach(([w, d, y]) => g.add(toy(block(w * S, 0.03 * S, d * S, [0, y * S - 0.015 * S, 0], 0.08), paint, { vary: 0.06 })));
  const W = 0.68 * S, D = 0.54 * S, y0 = 0.09 * S, H = 0.3 * S;
  // the inner wall and its dark doorway
  g.add(toy(block(W * 0.62, H, D * 0.62, [0, y0 + H / 2, -0.02 * S], 0.04), paint, { vary: 0.06 }));
  g.add(toy(block(0.12 * S, 0.19 * S, 0.02 * S, [0, y0 + 0.095 * S, D * 0.31 - 0.015 * S], 0.1), mix(sand, PALETTE.shade, 0.25), {}));
  g.add(toy(block(0.09 * S, 0.17 * S, 0.02 * S, [0, y0 + 0.085 * S, D * 0.31 - 0.005 * S], 0.1), 0x2a1e1a, {}));
  // the columns: four along the front and the back, two more down each side
  const column = (x: number, z: number) => {
    g.add(toy(block(0.07 * S, 0.025 * S, 0.07 * S, [x, y0 + 0.012 * S, z], 0.15), paint, {}));
    g.add(toy(turned([[0.037 * S, 0], [0.032 * S, H - 0.05 * S], [0, H - 0.05 * S]], 8).translate(x, y0 + 0.025 * S, z), paint, { vary: 0.06 }));
    g.add(toy(block(0.07 * S, 0.03 * S, 0.07 * S, [x, y0 + H - 0.01 * S, z], 0.15), paint, {}));
  };
  for (const z of [-D / 2, D / 2]) for (let i = 0; i < 4; i++) column(-W / 2 + (i * W) / 3, z);
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 6, D / 6]) column(x, z);
  // the entablature with a row of dentils, the pediment and the roof
  const ey = y0 + H + 0.005 * S;
  g.add(toy(block(W + 0.09 * S, 0.05 * S, D + 0.09 * S, [0, ey + 0.025 * S, 0], 0.1), paint, { vary: 0.06 }));
  for (let i = 0; i < 12; i++) for (const z of [-1, 1]) g.add(toy(block(0.025 * S, 0.018 * S, 0.012 * S, [-W / 2 + (i * W) / 11, ey + 0.005 * S, z * (D / 2 + 0.05 * S)]), mix(sand, PALETTE.shade, 0.2), {}));
  const roof = gableRoof(W + 0.1 * S, D + 0.1 * S, 0.14 * S, mix(sand, 0xc87a40, 0.25));
  roof.rotation.y = Math.PI / 2;
  roof.position.y = ey + 0.05 * S;
  g.add(roof);
  out.add(named(merge(g), 'Body'));
  return out;
}

/** A flat disc of radius r in the XY plane facing +Z, cut in `rings` × `segments` small facets (a portal, a clock face). */
function facetedDisc(r: number, rings = 6, segments = 24): BufferGeometry {
  const v: number[] = [], p = (rr: number, a: number) => [Math.cos(a) * rr, Math.sin(a) * rr, 0];
  for (let i = 0; i < rings; i++) for (let k = 0; k < segments; k++) {
    const r0 = (r * i) / rings, r1 = (r * (i + 1)) / rings, a0 = (k / segments) * Math.PI * 2, a1 = ((k + 1) / segments) * Math.PI * 2;
    if (i === 0) v.push(0, 0, 0, ...p(r1, a0), ...p(r1, a1));
    else v.push(...p(r0, a0), ...p(r1, a0), ...p(r1, a1), ...p(r0, a0), ...p(r1, a1), ...p(r0, a1));
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A portal gate `size` metres wide (0.5), facing +Z (research/concepts/things/09-buildings.png, Portal Gate): an arch of dark
 * violet stone — two square pillars with bases and an arch of wedge blocks — set with glowing orange runes, a swirling
 * blue and violet vortex inside it ('Portal': spin it round Z), on a platform of flagstones with a round dais.
 */
export function portalGate(options: { size?: number; stone?: number; swirl?: number[] } = {}): Group {
  const S = options.size ?? 0.5, dark = options.stone ?? 0x5a4a6e, out = named(new Group(), 'Portal Gate'), g = new Group(), r = random(11);
  // the platform: flagstones a little uneven, a round dais in the middle
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
    const c = mix(0xb8a890, r() > 0.5 ? 0xffffff : 0x6a5a4a, 0.15);
    g.add(toy(block(S * 0.19, S * (0.05 + r() * 0.015), S * 0.19, [(-0.4 + i * 0.2) * S, S * 0.025, (-0.3 + j * 0.2) * S], 0.15), tone(c), {}));
  }
  g.add(toy(turned([[S * 0.24, 0], [S * 0.24, S * 0.025], [0, S * 0.025]], 12).translate(0, S * 0.055, 0.0), tone(0xa89a88), {}));
  // the pillars, their bases and caps, runes glowing in them
  const px = S * 0.24, ph = S * 0.42, base = S * 0.06;
  for (const side of [-1, 1]) {
    g.add(toy(block(S * 0.13, S * 0.05, S * 0.13, [side * px, base + S * 0.025, 0], 0.12), tone(dark, mix(dark, 0xffffff, 0.15)), {}));
    g.add(toy(block(S * 0.1, ph, S * 0.1, [side * px, base + ph / 2, 0], 0.06), tone(dark, mix(dark, 0xffffff, 0.12)), { vary: 0.08 }));
    g.add(toy(block(S * 0.12, S * 0.03, S * 0.12, [side * px, base + ph, 0], 0.12), tone(dark), {}));
    for (const y of [0.2, 0.36]) g.add(toy(block(S * 0.03, S * 0.06, S * 0.01, [side * px, base + y * S, S * 0.051], 0.2), lit(0xffa040, 0.1), { emissive: 0x8a3a00 }));
  }
  // the arch: wedge blocks round a half circle springing from the pillar tops
  const archR = px, ay = base + ph, n = 7;
  for (let k = 0; k < n; k++) {
    const a = Math.PI * ((k + 0.5) / n), bw = (Math.PI * archR) / n * 0.95;
    const wedge = block(bw, S * 0.1, S * 0.1, [0, 0, 0], 0.1);
    wedge.rotateZ(a - Math.PI / 2);
    wedge.translate(Math.cos(a) * archR, ay + Math.sin(a) * archR * 0.85, 0);
    g.add(toy(wedge, tone(mix(dark, r() > 0.5 ? 0xffffff : 0x1a1428, 0.12)), { vary: 0.08 }));
    if (k === 2 || k === 4) g.add(toy(block(S * 0.025, S * 0.04, S * 0.01).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * archR, ay + Math.sin(a) * archR * 0.85, S * 0.052), lit(0xffa040, 0.1), { emissive: 0x8a3a00 }));
  }
  out.add(named(merge(g), 'Gate'));
  // the vortex: a faceted disc filling the arch, coloured in a spiral of blues and violets, glowing
  const swirl = options.swirl ?? [0x4ab8f8, 0x7a5ae8, 0x2a6ad8, 0xa880f0];
  const vortex = facetedDisc(px * 0.86, 7, 28);
  vortex.scale(1, 1.25, 1);
  const paintSwirl = (c: Vector3) => {
    const rr = Math.hypot(c.x, c.y / 1.25) / (px * 0.86), a = Math.atan2(c.y / 1.25, c.x);
    if (rr < 0.15) return 0xe0f4ff;
    const k = Math.floor((((a + rr * 7) / (Math.PI * 2)) * 4 % 4 + 4) % 4);
    return swirl[k];
  };
  // both faces swirl: the gate is walked round
  const portal = named(merge(new Group().add(toy(vortex, paintSwirl, { emissive: 0x2a2a6a, vary: 0.06 }), toy(vortex.clone().rotateY(Math.PI), paintSwirl, { emissive: 0x2a2a6a, vary: 0.06 })), { emissive: 0x2a2a6a }), 'Portal');
  portal.position.set(0, base + ph * 0.72, 0);
  out.add(portal);
  return out;
}
