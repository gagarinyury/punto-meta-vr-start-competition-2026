// Floating Forest Island (research/concepts/title/models-sheet-1.webp, the second tile): a flat grassy cap that hangs a
// little over its edge, an earth cone under it in layers (topsoil, darker earth, stone), roots hanging from it;
// on top three round faceted trees, a young one, bushes and stones. ~1.7 m across, ~2.1 m tall.
// Origin: the middle of the grass, +Y up, front +Z.
import { type BufferGeometry, CylinderGeometry, Group, Mesh, Vector3 } from '@iwsdk/core';
import { blob, type Edge, facets, jitter, named, paint, type Ring, rng, ringLoft, taperedTube } from './kit.js';

export const model = { name: 'Floating Forest Island', length: 2.3, parts: ['Grass', 'Earth', 'Roots', 'Trees', 'Bushes', 'Stones'] };

const R = 0.85, SIDES = 13;
const GRASS = [0x5fb532, 0x4fa52b, 0x7cc83c];

/** The outline of the island: one radius per side, so the cap and the earth meet on the same edge. */
function outline(seed: number) {
  const r = rng(seed);
  return Array.from({ length: SIDES }, (_, i) => ({ a: (i / SIDES) * Math.PI * 2 + (r() - 0.5) * 0.25, k: 0.88 + r() * 0.22 }));
}
const loft = (edge: Edge, rings: Ring[], end: Vector3, seed: number, endUp: boolean) => ringLoft(edge, rings, end, seed, endUp, R);

function tree(name: string, trunkH: number, crown: number, seed: number, lean: number): Group {
  const r = rng(seed), g = new Group();
  g.name = name;
  const trunk = jitter(new CylinderGeometry(crown * 0.13, crown * 0.22, trunkH, 7, 2), crown * 0.03, seed);
  trunk.translate(0, trunkH / 2 - 0.03, 0);
  g.add(named(new Mesh(paint(trunk, () => 0x7a4a2b, 0.1, seed), facets()), 'Trunk'));
  // the crown: a big faceted ball and two or three smaller ones pressed into it, light on top, darker below
  const crownGeo: BufferGeometry[] = [];
  const balls = [[0, 0, 0, 1], [0.55, -0.25, 0.2, 0.62], [-0.5, -0.2, -0.15, 0.66], [0.1, 0.35, -0.35, 0.55]];
  const top = trunkH + crown * 0.55;
  balls.slice(0, 3 + (seed % 2)).forEach(([x, y, z, s], i) => {
    const b = blob(crown * s, seed * 7 + i, 1, 0.22);
    b.translate(x * crown, top + y * crown, z * crown);
    crownGeo.push(b);
  });
  crownGeo.forEach((b, i) => g.add(named(new Mesh(paint(b, (c, n) => (n.y > 0.45 ? GRASS[2] : n.y > -0.2 ? GRASS[0] : 0x3a8526), 0.1, seed + i), facets()), `Crown${i}`)));
  g.rotation.set((r() - 0.5) * lean, r() * Math.PI * 2, (r() - 0.5) * lean);
  return g;
}

export function build(): Group {
  const root = new Group();
  root.name = 'ForestIsland';
  const edge = outline(7);

  // the cap: a low dome of grass, its rim drooping over the edge and tucked back to the earth
  const cap = loft(edge, [
    { s: 0.5, y: 0.045, wobble: 0.1 },
    { s: 1, y: 0, wobble: 0.04 },
    { s: 1.05, y: -0.07, wobble: 0.04 },
    { s: 0.98, y: -0.13, wobble: 0 },
  ], new Vector3(0, 0.06, 0), 11, true);
  // the cap's rings were made top-down with the centre on top: flip so it faces out
  root.add(named(new Mesh(paint(cap, (c, n) => (n.y > 0.5 ? GRASS[c.x > 0.2 ? 2 : 0] : 0x5ea534), 0.12, 3), facets()), 'Grass'));

  // the earth: the same edge, stepping in down to a crooked point; topsoil, a ledge, dark earth, stone
  const earth = loft(edge, [
    { s: 0.98, y: -0.13, wobble: 0 },
    { s: 0.95, y: -0.27, wobble: 0.06 },
    { s: 0.85, y: -0.32, wobble: 0.08 },
    { s: 0.74, y: -0.5, wobble: 0.12, dx: 0.03 },
    { s: 0.55, y: -0.7, wobble: 0.16, dx: 0.05, dz: 0.03 },
    { s: 0.34, y: -0.9, wobble: 0.2, dx: 0.07 },
    { s: 0.15, y: -1.06, wobble: 0.25, dx: 0.09, dz: -0.03 },
  ], new Vector3(0.11, -1.22, -0.02), 13, false);
  const stone = rng(5);
  root.add(named(new Mesh(paint(earth, (c) => {
    if (c.y > -0.29) return 0xa06a3a;
    if (c.y > -0.52) return stone() < 0.15 ? 0x8d7a68 : 0x845331;
    return stone() < 0.3 ? 0x6e6058 : 0x5f3b24;
  }, 0.1, 9), facets()), 'Earth'));

  // roots: thin dark tubes out of the lower earth, hanging and curling
  const roots = new Group();
  roots.name = 'Roots';
  const rr = rng(21), rootMat = facets();
  for (let i = 0; i < 11; i++) {
    // out of the earth's lower half, where its radius (by the rings above) is s: a little inside it
    const a = (i / 11) * Math.PI * 2 + rr() * 0.4, depth = -0.55 - rr() * 0.5;
    const s = R * Math.max(0.12, 0.66 + (depth + 0.55) * 1.1);
    const start = new Vector3(Math.cos(a) * s * 0.85 + 0.05, depth, -Math.sin(a) * s * 0.85);
    const len = 0.3 + rr() * 0.55, pts = [start];
    for (let k = 1; k <= 4; k++) pts.push(new Vector3(start.x + Math.cos(a) * 0.05 * k + (rr() - 0.5) * 0.08, start.y - (len * k) / 4, start.z - Math.sin(a) * 0.05 * k + (rr() - 0.5) * 0.08));
    roots.add(named(new Mesh(paint(taperedTube(pts, 0.026, 0.004, 5, 14), () => 0x4b2f1f, 0.08, i), rootMat), `Root${i}`));
  }
  root.add(roots);

  const trees = new Group();
  trees.name = 'Trees';
  const place = (g: Group, x: number, z: number) => { g.position.set(x, 0.035, z); trees.add(g); };
  place(tree('TreeBig', 0.42, 0.42, 3, 0.15), -0.24, -0.18);
  place(tree('TreeRight', 0.34, 0.33, 8, 0.2), 0.38, -0.04);
  place(tree('TreeBack', 0.4, 0.29, 5, 0.2), 0.14, -0.5);
  place(tree('TreeYoung', 0.2, 0.19, 12, 0.25), -0.02, 0.4);
  root.add(trees);

  const bushes = new Group();
  bushes.name = 'Bushes';
  ([[-0.55, 0.22, 0.13], [0.56, 0.34, 0.1], [-0.24, 0.52, 0.085], [0.58, -0.4, 0.11], [-0.5, -0.5, 0.09]] as const).forEach(([x, z, s], i) => {
    const b = blob(s, 40 + i, 1, 0.25, 0.75);
    b.translate(x, 0.035 + s * 0.5, z);
    bushes.add(named(new Mesh(paint(b, (c, n) => (n.y > 0.3 ? GRASS[1] : 0x4f9a32), 0.12, i), facets()), `Bush${i}`));
  });
  root.add(bushes);

  const stones = new Group();
  stones.name = 'Stones';
  ([[0.3, 0.52, 0.07], [-0.62, -0.18, 0.09], [0.4, 0.42, 0.045]] as const).forEach(([x, z, s], i) => {
    const b = blob(s, 60 + i, 0, 0.3, 0.7);
    b.translate(x, 0.03 + s * 0.3, z);
    stones.add(named(new Mesh(paint(b, () => 0x9c9ca6, 0.12, i), facets()), `Stone${i}`));
  });
  root.add(stones);
  return root;
}
