// Medieval Castle (research/concepts/title/models-sheet-1.webp, the fourth tile): a diorama — a chamfered slab of grass
// on a band of earth; on it a castle of soft grey-lilac stone: crenellated curtain walls round a court, an
// arched gate in the front wall, three corner towers with overhanging crenellated tops, a tall keep at the
// back right with a red pennant, dark arched windows; a stream runs from the gate and falls over the edge;
// round trees and block bushes on the grass. ~1.8 m across. Origin: the top of the grass, +Y up, front +Z.
import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, ShapeGeometry, Vector3 } from '@iwsdk/core';
import { bevelBox, facets, flatSlab, named, paint, roundTree } from './kit.js';

export const model = { name: 'Medieval Castle', length: 1.9, parts: ['Grass', 'Earth', 'Castle', 'Stream', 'Trees', 'Bushes'] };

const STONE = 0x7d7994, STONE_TOP = 0x9592aa, DARK = 0x24212f;
const stone = (geo: ReturnType<typeof bevelBox>, seed: number, top = STONE_TOP) => paint(geo, (c, n) => (n.y > 0.6 ? top : n.y < -0.6 ? 0x5d5a72 : STONE), 0.05, seed);
const stoneMat = facets({ roughness: 0.85 });

/** Merlons along a line from a to b (in the XZ plane) at height y: the teeth on top of a wall. */
function merlons(g: Group, a: Vector3, b: Vector3, y: number, size: number, thick: number, seed: number, name: string, fromCorner = false) {
  const len = a.distanceTo(b), n = Math.max(2, Math.round(len / (size * 1.85))), yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
  for (let i = 0; i < n; i++) {
    const t = fromCorner ? i / n : (i + 0.5) / n, m = new Mesh(stone(bevelBox(size, size * 0.9, thick, size * 0.12), seed + i), stoneMat);
    m.name = `${name}${i}`;
    m.position.set(a.x + (b.x - a.x) * t, y + size * 0.45, a.z + (b.z - a.z) * t);
    m.rotation.y = yaw;
    g.add(m);
  }
}

/** An arched opening (or window) shape: width w, height h, a round top. */
function arch(w: number, h: number): Shape {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.closePath();
  return s;
}

/** A dark arched window on a face: the face's outward direction is the yaw (0 = +Z). */
function windowOn(g: Group, x: number, y: number, z: number, yaw: number, w: number, h: number, name: string) {
  const geo = new ExtrudeGeometry(arch(w, h), { depth: 0.012, bevelEnabled: false });
  const m = named(new Mesh(geo, new MeshStandardMaterial({ color: DARK, roughness: 1 })), name, x, y, z);
  m.rotation.y = yaw;
  g.add(m);
}

/** A square tower: a shaft, an overhanging top on a corbel step, merlons round its rim. */
function tower(name: string, size: number, h: number, seed: number): Group {
  const g = new Group();
  g.name = name;
  g.add(named(new Mesh(stone(bevelBox(size, h, size, 0.018), seed), stoneMat), 'Shaft', 0, h / 2, 0));
  const cap = size * 1.22, capH = size * 0.3;
  g.add(named(new Mesh(stone(bevelBox(size * 1.1, capH * 0.4, size * 1.1, 0.012), seed + 1), stoneMat), 'Corbel', 0, h + capH * 0.1, 0));
  g.add(named(new Mesh(stone(bevelBox(cap, capH, cap, 0.016), seed + 2), stoneMat), 'Top', 0, h + capH * 0.6, 0));
  const y = h + capH * 1.1, e = cap / 2 - 0.022, m = size * 0.27;
  const c = [new Vector3(-e, 0, e), new Vector3(e, 0, e), new Vector3(e, 0, -e), new Vector3(-e, 0, -e)];
  for (let i = 0; i < 4; i++) merlons(g, c[i], c[(i + 1) % 4], y, m, 0.04, seed + 10 + i * 5, `Merlon${i}_`, true);
  return g;
}

const BASE: [number, number][] = [[-0.85, 0.2], [-0.55, 0.72], [0.25, 0.78], [0.9, 0.35], [0.85, -0.45], [0.2, -0.8], [-0.6, -0.7], [-0.92, -0.25]];

export function build(): Group {
  const root = new Group();
  root.name = 'Castle';
  root.add(named(new Mesh(paint(flatSlab(BASE, 0.04, 0.022, 0), (c, n) => (n.y > 0.6 ? (c.x + c.z > 0.5 ? 0x74c23e : 0x63b434) : 0x4a9a2e), 0.06, 2), facets()), 'Grass'));
  const earthPts = BASE.map(([x, z]) => [x * 0.985, z * 0.985] as [number, number]);
  root.add(named(new Mesh(paint(flatSlab(earthPts, 0.17, 0.02, -0.07), (c) => (c.y > -0.15 ? 0x9a6338 : 0x7a4b2b), 0.08, 3), facets()), 'Earth'));

  const castle = new Group();
  castle.name = 'Keep';
  const X = 0.42, ZF = 0.22, ZB = -0.42, HW = 0.3, TW = 0.08;
  // the front wall, its gate cut out of it as an arch
  const L = 2 * X, aw = 0.15, ah = 0.2, wall = new Shape();
  wall.moveTo(-L / 2, 0); wall.lineTo(-aw / 2, 0); wall.lineTo(-aw / 2, ah - aw / 2);
  wall.absarc(0, ah - aw / 2, aw / 2, Math.PI, 0, true);
  wall.lineTo(aw / 2, 0); wall.lineTo(L / 2, 0); wall.lineTo(L / 2, HW); wall.lineTo(-L / 2, HW); wall.closePath();
  const front = new ExtrudeGeometry(wall, { depth: TW - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 });
  front.translate(0, 0, -(TW - 0.02) / 2);
  castle.add(named(new Mesh(stone(front, 40), stoneMat), 'FrontWall', 0, 0, ZF));
  castle.add(named(new Mesh(new BoxGeometry(aw, ah, 0.02), new MeshStandardMaterial({ color: DARK, roughness: 1 })), 'GateDark', 0, ah / 2, ZF - TW / 2 - 0.012));
  castle.add(named(new Mesh(stone(bevelBox(L, HW, TW, 0.012), 41), stoneMat), 'BackWall', 0, HW / 2, ZB));
  castle.add(named(new Mesh(stone(bevelBox(TW, HW, ZF - ZB, 0.012), 42), stoneMat), 'LeftWall', -X, HW / 2, (ZF + ZB) / 2));
  castle.add(named(new Mesh(stone(bevelBox(TW, HW, ZF - ZB, 0.012), 43), stoneMat), 'RightWall', X, HW / 2, (ZF + ZB) / 2));
  const o = TW / 2 - 0.022, M = 0.066;
  merlons(castle, new Vector3(-X, 0, ZF + o), new Vector3(X, 0, ZF + o), HW, M, 0.04, 50, 'FrontMerlon');
  merlons(castle, new Vector3(-X, 0, ZB - o), new Vector3(X, 0, ZB - o), HW, M, 0.04, 60, 'BackMerlon');
  merlons(castle, new Vector3(-X - o, 0, ZF), new Vector3(-X - o, 0, ZB), HW, M, 0.04, 70, 'LeftMerlon');
  merlons(castle, new Vector3(X + o, 0, ZF), new Vector3(X + o, 0, ZB), HW, M, 0.04, 80, 'RightMerlon');

  const towers: [string, number, number, number, number][] = [['TowerFrontLeft', -X, ZF, 0.28, 0.58], ['TowerFrontRight', X, ZF, 0.26, 0.46], ['TowerBackLeft', -X, ZB, 0.26, 0.5], ['TowerKeep', 0.4, -0.4, 0.34, 0.92]];
  towers.forEach(([name, x, z, size, h], i) => {
    const t = tower(name, size, h, 100 + i * 40);
    t.position.set(x, 0, z);
    castle.add(t);
    // windows: one high on the front, one on the outer side
    windowOn(castle, x, h * 0.6, z + size / 2 - 0.004, 0, size * 0.22, size * 0.42, `${name}WindowFront`);
    windowOn(castle, x + (x < 0 ? -1 : 1) * (size / 2 - 0.004), h * 0.45, z, x < 0 ? -Math.PI / 2 : Math.PI / 2, size * 0.2, size * 0.38, `${name}WindowSide`);
  });
  // the pennant on the keep
  const poleTop = 0.92 + 0.34 * 0.3 * 1.1 + 0.26;
  castle.add(named(new Mesh(new CylinderGeometry(0.007, 0.009, 0.3, 6), new MeshStandardMaterial({ color: 0x5a4a44, roughness: 0.6 })), 'FlagPole', 0.4, poleTop - 0.15, -0.4));
  const pennant = new Shape();
  pennant.moveTo(0, 0); pennant.lineTo(0.17, 0.005); pennant.lineTo(0.12, 0.042); pennant.lineTo(0.17, 0.08); pennant.lineTo(0, 0.08); pennant.closePath();
  const flag = new ShapeGeometry(pennant);
  const fp = flag.getAttribute('position');
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 22) * 0.012);
  flag.computeVertexNormals();
  castle.add(named(new Mesh(flag, new MeshStandardMaterial({ color: 0xe0504a, roughness: 0.6, side: DoubleSide, flatShading: true })), 'Flag', 0.405, poleTop - 0.09, -0.4));
  root.add(castle);

  // the stream: a ribbon from the gate over the grass to the edge, then a fall down the slab's side
  const water = new MeshStandardMaterial({ color: 0x8eaae6, emissive: 0x1d2c55, roughness: 0.3, flatShading: true });
  const path = [new Vector3(0, 0, 0.26), new Vector3(-0.03, 0, 0.4), new Vector3(-0.13, 0, 0.53), new Vector3(-0.22, 0, 0.66), new Vector3(-0.27, 0, 0.765)];
  const tri: number[] = [], wv = 0.055;
  const side = (i: number) => { const d = path[Math.min(i + 1, path.length - 1)].clone().sub(path[Math.max(i - 1, 0)]).normalize(); return new Vector3(-d.z, 0, d.x).multiplyScalar(wv); };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], sa = side(i), sb = side(i + 1), y = 0.004;
    const p = [a.clone().add(sa), a.clone().sub(sa), b.clone().add(sb), b.clone().sub(sb)].map((v) => v.setY(y));
    for (const v of [p[0], p[2], p[1], p[1], p[2], p[3]]) tri.push(v.x, v.y, v.z);
  }
  const ribbon = new BufferGeometry();
  ribbon.setAttribute('position', new Float32BufferAttribute(tri, 3));
  ribbon.computeVertexNormals();
  const stream = new Group();
  stream.name = 'Stream';
  stream.add(named(new Mesh(ribbon, water), 'Brook'));
  const fall = named(new Mesh(new PlaneGeometry(wv * 2, 0.26), water), 'Fall', -0.27, -0.13, 0.766);
  fall.rotation.y = -0.075;
  stream.add(fall);
  root.add(stream);

  const trees = new Group();
  trees.name = 'Trees';
  ([['TreeLeft', 0.16, 0.13, 3, -0.72, 0.12], ['TreeLeftSmall', 0.12, 0.1, 8, -0.64, 0.36], ['TreeRight', 0.18, 0.13, 5, 0.66, 0.4], ['TreeFront', 0.1, 0.08, 12, 0.22, 0.5], ['TreeBack', 0.16, 0.12, 7, -0.3, -0.6]] as const)
    .forEach(([name, h, c, seed, x, z]) => { const t = roundTree(name, h, c, seed); t.position.set(x, 0, z); trees.add(t); });
  root.add(trees);
  const bushes = new Group();
  bushes.name = 'Bushes';
  ([[-0.48, 0.58, 0.1], [0.45, 0.5, 0.08], [0.62, -0.3, 0.09]] as const).forEach(([x, z, s], i) => {
    bushes.add(named(new Mesh(paint(bevelBox(s, s * 0.8, s, s * 0.15), (c, n) => (n.y > 0.5 ? 0x7cc83c : 0x4c9d30), 0.06, i), facets()), `Bush${i}`, x, s * 0.4, z));
  });
  root.add(bushes);
  return root;
}
