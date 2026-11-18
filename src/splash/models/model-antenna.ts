// Radio Antenna Tower (research/concepts/title/models-sheet-2.jpeg, top row, second): a stepped round concrete foot, a
// rust-red lattice tower (four tapering legs, X braces), a platform, a big peach dish drawn with a grid and a
// feed arm, tilted up, a small dish on a side arm; glowing signal arcs, cyan and violet, either side.
// ~1.3 m tall. Origin: the middle of the foot's bottom, +Y up, the dish looking to +Z.
import { CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, SphereGeometry, TorusGeometry, Vector2, Vector3 } from '@iwsdk/core';
import { alignSpan } from './hardsurface.js';
import { edgeGlow, facets, glowMat, mix, named, paint } from './kit.js';

export const model = { name: 'Radio Antenna Tower', length: 1.4, parts: ['Foot', 'Lattice', 'Platform', 'Dish', 'SmallDish', 'Signal'] };

const LIGHT = new Vector3(-0.5, 0.8, 0.5).normalize();
const lit = (n: Vector3, dark: number, light: number) => mix(dark, light, Math.max(0, n.dot(LIGHT) * 0.85 + 0.25));

/** A parabolic dish of radius r and depth d (a lathe, open), its axis +Y, rim at y = d. */
function dish(r: number, d: number, rings = 6) {
  const pts: Vector2[] = [];
  for (let i = 0; i <= rings; i++) { const x = (i / rings) * r; pts.push(new Vector2(x, (x / r) ** 2 * d)); }
  pts.push(new Vector2(r * 1.04, d * 1.02));
  return new LatheGeometry(pts, 20);
}

export function build(): Group {
  const root = new Group();
  root.name = 'Antenna';
  const concrete = (n: Vector3) => lit(n, 0x655a74, 0xb9acbb);
  const foot = new Group();
  foot.name = 'Foot';
  ([[0.34, 0.36, 0.1, 0.05], [0.25, 0.27, 0.1, 0.15]] as const).forEach(([rt, rb, h, y], i) => {
    foot.add(named(new Mesh(paint(new CylinderGeometry(rt, rb, h, 12), (c, n) => concrete(n), 0.03, i), facets({ roughness: 0.8 })), `Step${i}`, 0, y, 0));
  });
  root.add(foot);

  // the lattice: legs from the foot's top to under the platform, an X of braces on each side, three bays
  const lattice = new Group();
  lattice.name = 'Lattice';
  const rust = facets({ roughness: 0.7 }), beam = (r: number) => paint(new CylinderGeometry(r, r, 1, 5), (c, n) => lit(n, 0x6e2f22, 0xc8694a), 0.04, 1);
  const legGeo = beam(0.016), braceGeo = beam(0.008);
  const y0 = 0.2, y1 = 0.86, b0 = 0.16, b1 = 0.075, at = (sx: number, sz: number, t: number) => new Vector3(sx * (b0 + (b1 - b0) * t), y0 + (y1 - y0) * t, sz * (b0 + (b1 - b0) * t));
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const span = (name: string, geo: typeof legGeo, a: Vector3, b: Vector3) => { const m = named(new Mesh(geo, rust), name); m.scale.y = alignSpan(m, a, b); lattice.add(m); };
  corners.forEach(([sx, sz], i) => span(`Leg${i}`, legGeo, at(sx, sz, 0), at(sx, sz, 1)));
  for (let bay = 0; bay < 3; bay++) {
    const t0 = bay / 3, t1 = (bay + 1) / 3;
    corners.forEach(([sx, sz], i) => {
      const [nx, nz] = corners[(i + 1) % 4];
      span(`Brace${bay}_${i}a`, braceGeo, at(sx, sz, t0), at(nx, nz, t1));
      span(`Brace${bay}_${i}b`, braceGeo, at(nx, nz, t0), at(sx, sz, t1));
      span(`Ring${bay}_${i}`, braceGeo, at(sx, sz, t1), at(nx, nz, t1));
    });
  }
  root.add(lattice);
  root.add(named(new Mesh(paint(new CylinderGeometry(0.15, 0.13, 0.05, 10), (c, n) => concrete(n), 0.03, 4), facets({ roughness: 0.8 })), 'Platform', 0, y1 + 0.02, 0));

  // the big dish on a short mast, looking up and to the front
  const big = new Group();
  big.name = 'Dish';
  big.position.set(0, y1 + 0.2, 0.02);
  big.rotation.set(0.75, 0, 0.55); // its +Y axis turned forward and to the right
  root.add(named(new Mesh(paint(new CylinderGeometry(0.03, 0.035, 0.18, 6), (c, n) => lit(n, 0x6e2f22, 0xc8694a), 0.03, 5), rust), 'Mast', 0, y1 + 0.12, 0));
  const bowl = dish(0.23, 0.1);
  const dishMat = facets({ roughness: 0.6 });
  dishMat.side = DoubleSide; // the dish is a shell: both its faces show
  big.add(named(new Mesh(paint(bowl, (c, n) => lit(n.clone().negate(), 0x9a4c38, 0xeea07c), 0.03, 6), dishMat), 'Bowl'));
  big.add(named(edgeGlow(dish(0.23, 0.1, 4), 0x7a3426, 0.9, 1), 'Grid', 0, 0.002, 0));
  const arm = named(new Mesh(new CylinderGeometry(0.008, 0.01, 1, 5), rust), 'FeedArm');
  arm.scale.y = alignSpan(arm, new Vector3(0, 0, 0), new Vector3(0, 0.2, 0));
  big.add(arm);
  big.add(named(new Mesh(paint(new SphereGeometry(0.03, 8, 6), (c, n) => lit(n, 0x6e2f22, 0xc8694a), 0.03, 8), rust), 'Feed', 0, 0.21, 0));
  root.add(big);

  const small = new Group();
  small.name = 'SmallDish';
  small.position.set(-0.25, 0.64, 0.04);
  small.rotation.set(0.9, 0, 0.7);
  small.add(named(new Mesh(paint(dish(0.11, 0.05), (c, n) => lit(n.clone().negate(), 0x8a6a74, 0xe2d4dc), 0.03, 7), dishMat), 'Bowl'));
  root.add(small);
  const sarm = named(new Mesh(legGeo, rust), 'SmallArm');
  sarm.scale.y = alignSpan(sarm, at(-1, 1, 0.65), new Vector3(-0.22, 0.66, 0.02));
  root.add(sarm);

  // the signal: three arcs each side of the dish, cyan and violet
  const signal = new Group();
  signal.name = 'Signal';
  signal.position.set(0, y1 + 0.26, 0.05);
  [0.34, 0.44, 0.54].forEach((rad, i) => {
    for (const side of [0, Math.PI]) {
      const arc = new TorusGeometry(rad, 0.012, 5, 18, 0.9);
      arc.rotateZ(side - 0.45 + (side ? 0 : 0.2));
      signal.add(named(new Mesh(arc, glowMat(i === 1 ? 0xb07cff : 0x7ff1ff)), `Arc${i}${side ? 'L' : 'R'}`));
    }
  });
  root.add(signal);
  return root;
}

export function idle(root: Group, time: number): void {
  const signal = root.getObjectByName('Signal');
  if (!signal) return;
  signal.children.forEach((arc, i) => { const k = (time * 1.2 + Math.floor(i / 2) * 0.33) % 1; arc.scale.setScalar(0.85 + k * 0.3); });
}
