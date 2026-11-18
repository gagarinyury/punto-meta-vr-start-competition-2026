// Crystal Cluster (research/concepts/title/models-sheet-2.jpeg, top row, third): a flat faceted slab of taupe stone and on
// it a cluster of six-sided crystals with pointed tips, violet at the root running to sky blue at the tip, a
// tall one in the middle leaning back, the others fanning out; pebbles; four-point sparkles round it, pink,
// cyan and gold. ~1.2 m tall. Origin: the slab's top at its middle, +Y up.
import { ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import { blob, facets, glowMat, jitter, mix, named, paint, rng, shade, starShape } from './kit.js';

export const model = { name: 'Crystal Cluster', length: 1.2, parts: ['Slab', 'Crystals', 'Pebbles', 'Sparkles'] };

const LIGHT = new Vector3(-0.5, 0.8, 0.5).normalize();

/** One crystal: a six-sided prism with a pyramid tip (a child), its root at the origin, growing up +Y. */
function crystal(name: string, r: number, h: number): Mesh {
  const total = h + r * 1.6;
  // violet at the root to sky blue at the tip, lit facets paler, the shadowed ones deep
  const colour = (p: Vector3, n: Vector3) => {
    const base = mix(0x6a2fd0, 0x4fb8ff, (p.y / total) * 1.1);
    return mix(mix(base, 0x1d1048, 0.55), mix(base, 0xffffff, 0.12), Math.max(0, n.dot(LIGHT)) * 0.9 + 0.15);
  };
  const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.15, metalness: 0.1, emissive: 0x3a1a90, emissiveIntensity: 0.7 });
  const prism = new CylinderGeometry(r, r * 0.92, h, 6, 1);
  prism.translate(0, h / 2, 0);
  const tip = new ConeGeometry(r, r * 1.6, 6, 1);
  tip.translate(0, h + r * 0.8, 0);
  const mesh = named(new Mesh(shade(prism, colour), mat), name);
  mesh.add(named(new Mesh(shade(tip, colour), mat), 'Tip'));
  return mesh;
}

export function build(): Group {
  const root = new Group();
  root.name = 'Crystals';
  // the slab: a low eight-sided stone, wider on top, its rim chipped
  const slab = jitter(new CylinderGeometry(0.46, 0.38, 0.16, 8, 1), 0.05, 3);
  slab.translate(0, -0.08, 0);
  root.add(named(new Mesh(paint(slab, (c, n) => (n.y > 0.6 ? 0xa3948e : mix(0x4f4250, 0x8a7a76, Math.max(0, n.dot(LIGHT)) + 0.2)), 0.05, 2), facets({ roughness: 0.85 })), 'Slab'));

  const crystals = new Group();
  crystals.name = 'Crystals';
  // [name, radius, height, x, z, lean forward/back (x rot), lean sideways (z rot)]
  ([['Tall', 0.13, 0.72, 0.0, -0.05, -0.12, 0.05], ['Left', 0.1, 0.48, -0.2, 0.0, 0.05, 0.5], ['Right', 0.105, 0.55, 0.2, -0.02, -0.05, -0.45],
    ['Back', 0.07, 0.34, 0.08, -0.22, -0.45, -0.15], ['Front', 0.06, 0.16, 0.12, 0.2, 0.5, -0.3], ['Small', 0.05, 0.12, -0.24, 0.22, 0.4, 0.5]] as const)
    .forEach(([name, r, h, x, z, rx, rz], i) => {
      const c = crystal(`Crystal${name}`, r, h);
      c.position.set(x, -0.03, z);
      c.rotation.set(rx, i * 0.7, rz);
      crystals.add(c);
    });
  root.add(crystals);

  const pebbles = new Group();
  pebbles.name = 'Pebbles';
  ([[0.34, 0.16, 0.06], [-0.32, -0.2, 0.05], [0.3, -0.24, 0.04]] as const).forEach(([x, z, s], i) => {
    const b = blob(s, 30 + i, 0, 0.3, 0.6);
    b.translate(x, s * 0.25, z);
    pebbles.add(named(new Mesh(paint(b, (c, n) => (n.y > 0.4 ? 0xb0a29b : 0x6f6168), 0.05, i), facets({ roughness: 0.8 })), `Pebble${i}`));
  });
  root.add(pebbles);

  const sparkles = new Group();
  sparkles.name = 'Sparkles';
  const r = rng(8);
  ([[0xff9ad8, -0.45, 0.62, 0.07], [0x9ff3ff, 0.12, 0.98, 0.05], [0xb79bff, 0.5, 0.7, 0.06], [0xffd56a, -0.42, 0.25, 0.04], [0xffd56a, 0.4, 0.95, 0.035], [0x9ff3ff, 0.48, 0.2, 0.04]] as const)
    .forEach(([c, x, y, s], i) => {
      const geo = new ExtrudeGeometry(starShape(4, s, s * 0.22), { depth: 0.006, bevelEnabled: false });
      geo.center();
      const m = named(new Mesh(geo, glowMat(c)), `Sparkle${i}`, x, y, (r() - 0.5) * 0.3);
      sparkles.add(m);
    });
  root.add(sparkles);
  return root;
}

export function idle(root: Group, time: number): void {
  root.getObjectByName('Sparkles')?.children.forEach((s, i) => s.scale.setScalar(0.75 + 0.35 * Math.sin(time * 2.2 + i * 1.3)));
}
