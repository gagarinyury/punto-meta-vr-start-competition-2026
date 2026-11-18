// Floating Pines (the splash art, under the voice wave, and research/concepts/title/models-sheet-1.webp): three small pines
// adrift in weightlessness, each turned its own way, some with a round sandy clod of earth still on the trunk,
// and loose clods floating by; chunky faceted tiers lit from the upper left. ~1.2 m across the group.
// Origin: the middle of the group. idle(): each drifts and turns slowly on its own.
import { ConeGeometry, CylinderGeometry, Group, Mesh, Vector3 } from '@iwsdk/core';
import { blob, facets, jitter, mix, named, paint } from './kit.js';

export const model = { name: 'Floating Pines', length: 1.3, parts: ['Pines', 'Clods'] };

const LIGHT = new Vector3(-0.5, 0.8, 0.45).normalize();
const lit = (n: Vector3, dark: number, light: number) => mix(dark, light, Math.max(0, n.dot(LIGHT)) ** 0.8);
const sand = (n: Vector3) => lit(n, 0x8a6a3e, 0xf0cf8e);

function clod(name: string, r: number, seed: number): Mesh {
  return named(new Mesh(paint(blob(r, seed, 0, 0.22), (c, n) => sand(n), 0.05, seed), facets({ roughness: 0.8 })), name);
}

function pine(name: string, h: number, seed: number, withClod: boolean): Group {
  const g = new Group();
  g.name = name;
  const trunk = new CylinderGeometry(h * 0.045, h * 0.06, h * 0.3, 6);
  trunk.translate(0, h * 0.1, 0);
  g.add(named(new Mesh(paint(trunk, (c, n) => lit(n, 0x4a2a18, 0x9a6038), 0.05, seed), facets()), 'Trunk'));
  // three broad tiers, each a wide 6-sided cone, chunky like the art
  for (let i = 0; i < 3; i++) {
    const w = h * (0.36 - i * 0.085), th = h * (0.42 - i * 0.05);
    const cone = jitter(new ConeGeometry(w, th, 6, 1), w * 0.08, seed * 3 + i, (v) => v.y > th * 0.4);
    cone.rotateY(i * 0.5);
    cone.translate(0, h * (0.42 + i * 0.22), 0);
    g.add(named(new Mesh(paint(cone, (c, n) => (n.y < -0.5 ? 0x2f6e27 : lit(n, 0x2f7a2c, 0x86d052)), 0.05, seed + i), facets()), `Tier${i}`));
  }
  if (withClod) {
    const c = clod('Clod', h * 0.16, seed + 40);
    c.position.y = -h * 0.06;
    g.add(c);
  }
  return g;
}

// [name, height, position, turn (x, y, z), with a clod] — laid out as the splash art draws them, seen from the
// front: a tall one on the right leaning left on its clod, a middle one leaning further, a small one almost lying
const PINES: [string, number, [number, number, number], [number, number, number], boolean][] = [
  ['PineTall', 0.75, [0.5, -0.05, 0], [0.12, 0.4, 0.27], true],
  ['PineMiddle', 0.52, [0.05, -0.27, 0.08], [-0.1, 1.2, 0.42], false],
  ['PineLying', 0.38, [-0.33, -0.45, 0.12], [0.15, 2.0, 1.0], false],
];

export function build(): Group {
  const root = new Group();
  root.name = 'FloatingPines';
  const pines = new Group();
  pines.name = 'Pines';
  PINES.forEach(([name, h, p, t, c], i) => {
    const g = pine(name, h, 3 + i * 4, c);
    g.position.set(...p);
    // turned on its own axis first, then leaned: the lean stays in the picture's plane, as drawn
    g.rotation.order = 'ZYX';
    g.rotation.set(...t);
    pines.add(g);
  });
  root.add(pines);
  const clods = new Group();
  clods.name = 'Clods';
  ([[0.33, -0.35, 0.1, 0.1], [-0.36, -0.58, 0.05, 0.09]] as const).forEach(([x, y, z, r], i) => {
    const c = clod(`Loose${i}`, r, 60 + i);
    c.position.set(x, y, z);
    clods.add(c);
  });
  root.add(clods);
  return root;
}

export function idle(root: Group, time: number): void {
  root.getObjectByName('Pines')?.children.forEach((p, i) => {
    const [, , pos, turn] = PINES[i];
    p.position.y = pos[1] + Math.sin(time * 0.7 + i * 1.9) * 0.025;
    p.rotation.z = turn[2] + Math.sin(time * 0.5 + i) * 0.08;
    p.rotation.y = turn[1] + time * 0.15 * (i % 2 ? 1 : -1);
  });
  root.getObjectByName('Clods')?.children.forEach((c, i) => { c.rotation.set(time * 0.4 + i, time * 0.3, 0); });
}
