// Floating Rock Island (research/concepts/title/models-sheet-1.webp, the third tile): a thick rounded slab of grass with
// a soft edge on a thin band of soil, under it a tall faceted rock in lavender greys with a crooked point;
// on top a voxel tree (a thin forked trunk, a blocky canopy of small cubes in a pastel pink-mint-blue
// gradient), two pines at the edges, a big boulder and a smaller one, a few tufts. ~1.6 m across.
// Origin: the top of the grass at its middle, +Y up, front +Z.
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Shape, Vector3 } from '@iwsdk/core';
import { blob, type Edge, facets, jitter, named, paint, ringLoft, rng, taperedTube } from './kit.js';

export const model = { name: 'Floating Rock Island', length: 2.7, parts: ['Grass', 'Soil', 'Rock', 'VoxelTree', 'Pines', 'Boulders', 'Tufts'] };

const R = 0.8, SIDES = 14;

/** A rounded square, turned a little and a little uneven: the concept's slab is neither round nor square. */
function outline(seed: number): Edge {
  const r = rng(seed), p = 3.2;
  return Array.from({ length: SIDES }, (_, i) => {
    const a = (i / SIDES) * Math.PI * 2 + (r() - 0.5) * 0.12, t = a - 0.35;
    const sq = 1 / Math.pow(Math.pow(Math.abs(Math.cos(t)), p) + Math.pow(Math.abs(Math.sin(t)), p), 1 / p);
    return { a, k: sq * 0.86 * (0.95 + r() * 0.08) };
  });
}
/** The outline as a flat slab with a rounded (bevelled) rim, its top at y = top. */
function slab(edge: Edge, scale: number, depth: number, bevel: number, top: number) {
  const shape = new Shape();
  edge.forEach(({ a, k }, i) => {
    const x = Math.cos(a) * R * k * scale, y = Math.sin(a) * R * k * scale;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  });
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, top - depth - bevel, 0);
  return geo;
}

function pine(name: string, h: number, seed: number): Group {
  const g = new Group();
  g.name = name;
  const trunk = new CylinderGeometry(h * 0.04, h * 0.06, h * 0.3, 6);
  trunk.translate(0, h * 0.13, 0);
  g.add(named(new Mesh(paint(trunk, () => 0x7a4a2b, 0.08, seed), facets()), 'Trunk'));
  for (let i = 0; i < 3; i++) {
    const w = h * (0.3 - i * 0.07), cone = jitter(new ConeGeometry(w, h * 0.36, 7, 1), w * 0.08, seed + i, (v) => v.y > h * 0.17);
    cone.translate(0, h * (0.36 + i * 0.2), 0);
    g.add(named(new Mesh(paint(cone, (c, n) => (n.y > 0.55 ? 0x4fae4c : 0x34873b), 0.08, seed + i), facets()), `Tier${i}`));
  }
  return g;
}

/** The canopy: voxels in a few overlapping blocks, a gap between them drawn as the grid, a pastel gradient. */
function voxelCanopy(v: number): InstancedMesh {
  const blocks = [[-4, 4, 1, 4, -3, 3], [-6, -3, -1, 2, -2, 2], [3, 6, 0, 2, -2, 3], [-2, 2, 5, 5, -2, 1]];
  const cells: [number, number, number][] = [], r = rng(77), seen = new Set<string>();
  for (const [x0, x1, y0, y1, z0, z1] of blocks) for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    // a few corner cells left out, so the blocks are not perfect boxes
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1) && (y === y0 || y === y1);
    if (corner && r() < 0.6) continue;
    seen.add(key);
    cells.push([x, y, z]);
  }
  const mat = new MeshStandardMaterial({ roughness: 0.7, flatShading: true });
  const mesh = new InstancedMesh(new BoxGeometry(v * 0.9, v * 0.9, v * 0.9), mat, cells.length);
  mesh.name = 'Canopy';
  const m = new Matrix4(), c = new Color(), pink = new Color(0xe57fb6), mint = new Color(0x6fd99a), blue = new Color(0x6ea5ee), lilac = new Color(0x9f82e3);
  cells.forEach(([x, y, z], i) => {
    m.makeTranslation(x * v, y * v, z * v);
    mesh.setMatrixAt(i, m);
    // pink on the left, mint on the top right, blue on the front right, lilac underneath
    const tx = (x + 6) / 12, ty = (y + 1) / 6, tz = (z + 3) / 6;
    c.copy(pink).lerp(mint, Math.min(1, tx * 0.8 + ty * 0.5)).lerp(blue, Math.max(0, tz - 0.4) * tx * 1.4).lerp(lilac, Math.max(0, 0.45 - ty) * 1.3);
    c.offsetHSL(0, 0, (r() - 0.5) * 0.05);
    mesh.setColorAt(i, c);
  });
  return mesh;
}

function voxelTree(): Group {
  const g = new Group();
  g.name = 'VoxelTree';
  const bark = facets(), brown = () => 0x7b4c2c;
  // a thin trunk leaning a little, forking under the canopy into three branches
  const fork = new Vector3(0.03, 0.5, 0);
  g.add(named(new Mesh(paint(taperedTube([new Vector3(0, -0.02, 0), new Vector3(0.05, 0.2, 0.01), new Vector3(-0.01, 0.38, 0), fork], 0.05, 0.032, 6, 14), brown, 0.08, 1), bark), 'Trunk'));
  ([[-0.3, 0.74, 0.03], [0.26, 0.78, -0.02], [0.02, 0.8, 0.14]] as const).forEach(([x, y, z], i) => {
    const mid = fork.clone().lerp(new Vector3(x, y, z), 0.5).add(new Vector3(0, -0.04, 0));
    g.add(named(new Mesh(paint(taperedTube([fork, mid, new Vector3(x, y, z)], 0.026, 0.014, 5, 8), brown, 0.08, 2 + i), bark), `Branch${i}`));
  });
  const v = 0.082, canopy = voxelCanopy(v);
  canopy.position.set(-0.02, 0.8, 0);
  g.add(canopy);
  return g;
}

export function build(): Group {
  const root = new Group();
  root.name = 'RockIsland';
  const edge = outline(19);

  // a thick slab of grass with a soft rim, a darker green round its side; under it a thin band of soil
  root.add(named(new Mesh(paint(slab(edge, 1, 0.1, 0.055, 0), (c, n) => (n.y > 0.6 ? (c.x - c.z > 0.4 ? 0x8fd451 : 0x7cc845) : 0x62ad3a), 0.07, 4), facets()), 'Grass'));
  root.add(named(new Mesh(paint(slab(edge, 0.96, 0.06, 0.025, -0.2), () => 0x8a5a36, 0.08, 5), facets()), 'Soil'));

  // the rock: big flat facets in lavender greys (a brown one now and then near the top), down to a crooked point
  const rock = ringLoft(edge, [
    { s: 0.96, y: -0.26, wobble: 0 },
    { s: 0.9, y: -0.42, wobble: 0.08 },
    { s: 0.72, y: -0.74, wobble: 0.14, dx: -0.03 },
    { s: 0.46, y: -1.04, wobble: 0.18, dx: 0.02, dz: 0.04 },
    { s: 0.2, y: -1.3, wobble: 0.22, dx: 0.07 },
  ], new Vector3(0.1, -1.52, 0.04), 23, false, R);
  const tone = rng(31), greys = [0x726d88, 0x625e78, 0x7f7a94, 0x56536b, 0x6a6580];
  root.add(named(new Mesh(paint(rock, (c) => (c.y > -0.5 && tone() < 0.6 ? 0x7d5a42 : greys[Math.floor(tone() * greys.length)]), 0.05, 7), facets({ roughness: 0.8 })), 'Rock'));

  const tree = voxelTree();
  tree.position.set(-0.2, 0, -0.08);
  root.add(tree);

  const pines = new Group();
  pines.name = 'Pines';
  const left = pine('PineLeft', 0.55, 3), right = pine('PineRight', 0.6, 9);
  left.position.set(-0.6, -0.01, -0.12);
  right.position.set(0.6, -0.01, -0.22);
  pines.add(left, right);
  root.add(pines);

  const boulders = new Group();
  boulders.name = 'Boulders';
  ([[0.26, -0.12, 0.28, 0.72], [0.08, 0.12, 0.13, 0.8], [0.45, 0.12, 0.08, 0.75]] as const).forEach(([x, z, s, squash], i) => {
    const b = blob(s, 90 + i, 1, 0.16, squash);
    b.translate(x, s * squash * 0.72, z);
    boulders.add(named(new Mesh(paint(b, (c, n) => (n.y > 0.5 ? 0x9a96ad : 0x7a7590), 0.05, i), facets({ roughness: 0.75 })), `Boulder${i}`));
  });
  root.add(boulders);

  // tufts: three thin blades each, here and there on the grass
  const tufts = new Group();
  tufts.name = 'Tufts';
  const tr = rng(55);
  ([[-0.35, 0.3], [0.05, 0.42], [0.5, 0.38], [-0.62, 0.15], [0.32, 0.5]] as const).forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) {
      const blade = new ConeGeometry(0.012, 0.07 + tr() * 0.04, 3);
      blade.translate(0, 0.04, 0);
      blade.rotateZ((k - 1) * 0.45);
      blade.translate(x + (k - 1) * 0.012, 0, z + (tr() - 0.5) * 0.02);
      tufts.add(named(new Mesh(paint(blade, () => 0x4fa83a, 0.08, i * 3 + k), facets()), `Tuft${i}_${k}`));
    }
  });
  root.add(tufts);
  return root;
}
