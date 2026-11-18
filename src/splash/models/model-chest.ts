// Treasure Chest (research/concepts/title/models-sheet-2.jpeg, top row, fourth): a wooden chest of brown planks bound in
// orange-gold — bands on every corner and edge, two straps down the front — its barrel lid thrown open on the
// hinge, a gold lock plate with a dark keyhole on the lid's front; gold light glows inside and glowing cubes
// rise out of it. ~0.75 m wide. Origin: the middle of the bottom, +Y up, the front to +Z. idle(): cubes rise.
import { CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, Vector3 } from '@iwsdk/core';
import { bevelBox, facets, glowMat, mix, named, paint, rng } from './kit.js';

export const model = { name: 'Treasure Chest', length: 0.95, parts: ['Body', 'Trim', 'Lid', 'Glow', 'Cubes'] };

const W = 0.7, D = 0.46, H = 0.36, LIGHT = new Vector3(-0.5, 0.8, 0.5).normalize();
const wood = (n: Vector3) => mix(0x4a2416, 0x9c5a38, Math.max(0, n.dot(LIGHT)) * 0.9 + 0.2);
const gold = (n: Vector3) => mix(0x9a4f12, 0xffc04a, Math.max(0, n.dot(LIGHT)) * 0.9 + 0.2);

export function build(): Group {
  const root = new Group();
  root.name = 'Chest';
  const woodMat = facets({ roughness: 0.75 }), goldMat = facets({ roughness: 0.35, metalness: 0.35 }), groove = new MeshStandardMaterial({ color: 0x2e140c, roughness: 1 });
  root.add(named(new Mesh(paint(bevelBox(W, H, D, 0.015), (c, n) => wood(n), 0.06, 1), woodMat), 'Body', 0, H / 2, 0));
  // planks: dark grooves across the front and the sides
  for (let i = 1; i < 3; i++) {
    const y = (H * i) / 3;
    root.add(named(new Mesh(bevelBox(W - 0.02, 0.008, 0.006, 0.002), groove), `GrooveFront${i}`, 0, y, D / 2 + 0.001));
    root.add(named(new Mesh(bevelBox(0.006, 0.008, D - 0.02, 0.002), groove), `GrooveLeft${i}`, -W / 2 - 0.001, y, 0));
    root.add(named(new Mesh(bevelBox(0.006, 0.008, D - 0.02, 0.002), groove), `GrooveRight${i}`, W / 2 + 0.001, y, 0));
  }
  const trim = new Group();
  trim.name = 'Trim';
  const band = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, seed: number) =>
    trim.add(named(new Mesh(paint(bevelBox(w, h, d, Math.min(w, h, d) * 0.25), (c, n) => gold(n), 0.04, seed), goldMat), name, x, y, z));
  const t = 0.045;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => band(`Corner${i}`, t, H + 0.01, t, (sx * (W - t)) / 2 + sx * 0.004, H / 2, (sz * (D - t)) / 2 + sz * 0.004, i));
  band('RimFront', W + 0.01, t * 0.8, t * 0.6, 0, H - t * 0.4, D / 2 - 0.004, 10);
  band('RimBack', W + 0.01, t * 0.8, t * 0.6, 0, H - t * 0.4, -D / 2 + 0.004, 11);
  band('FootFront', W + 0.01, t * 0.8, t * 0.6, 0, t * 0.4, D / 2 - 0.004, 12);
  band('FootBack', W + 0.01, t * 0.8, t * 0.6, 0, t * 0.4, -D / 2 + 0.004, 13);
  band('StrapLeft', t, H, t * 0.5, -W * 0.22, H / 2, D / 2 + 0.006, 14);
  band('StrapRight', t, H, t * 0.5, W * 0.22, H / 2, D / 2 + 0.006, 15);
  root.add(trim);
  // the treasure's light, filling the open top
  root.add(named(new Mesh(new CircleGeometry(1, 4).rotateX(-Math.PI / 2).rotateY(Math.PI / 4).scale((W - 0.06) / Math.SQRT2, 1, (D - 0.06) / Math.SQRT2), glowMat(0xffb24a)), 'Glow', 0, H + 0.003, 0));

  // the lid: a half barrel on the back edge's hinge, open ~70 degrees
  const lid = new Group();
  lid.name = 'Lid';
  lid.position.set(0, H, -D / 2);
  lid.rotation.x = -1.2;
  const barrel = new CylinderGeometry(D / 2, D / 2, W, 10, 1, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2); // its axis along X, the round half up
  barrel.translate(0, 0, D / 2);
  lid.add(named(new Mesh(paint(barrel, (c, n) => wood(n), 0.06, 20), woodMat), 'Barrel'));
  // the lid's flat underside, darker wood (it shows now that the lid is open)
  lid.add(named(new Mesh(paint(bevelBox(W, 0.02, D, 0.006), (c, n) => (n.y < -0.5 ? 0x5a2e1c : wood(n)), 0.05, 22), woodMat), 'Underside', 0, 0.01, D / 2));
  for (const [name, x] of [['LidBandLeft', -W / 2 + 0.02], ['LidBandRight', W / 2 - 0.02], ['LidStrapLeft', -W * 0.22], ['LidStrapRight', W * 0.22]] as const) {
    const ring = new CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, name.includes('Strap') ? 0.04 : 0.05, 10, 1, false, 0, Math.PI);
    ring.rotateZ(Math.PI / 2);
    ring.translate(x, 0, D / 2);
    lid.add(named(new Mesh(paint(ring, (c, n) => gold(n), 0.04, 21), goldMat), name));
  }
  // the lock plate hangs from the lid's front edge
  const plate = named(new Mesh(paint(bevelBox(0.11, 0.13, 0.025, 0.008), (c, n) => gold(n), 0.04, 30), goldMat), 'LockPlate', 0, -0.045, D + 0.01);
  const hole = new Shape();
  hole.absarc(0, 0.015, 0.016, 0, Math.PI * 2, false);
  const slot = new Shape();
  slot.moveTo(-0.008, 0.01); slot.lineTo(0.008, 0.01); slot.lineTo(0.013, -0.035); slot.lineTo(-0.013, -0.035); slot.closePath();
  plate.add(named(new Mesh(new ExtrudeGeometry([hole, slot], { depth: 0.004, bevelEnabled: false }), groove), 'Keyhole', 0, 0, 0.012));
  lid.add(plate);
  root.add(lid);

  const cubes = new Group();
  cubes.name = 'Cubes';
  const r = rng(6);
  for (let i = 0; i < 9; i++) {
    const s = 0.025 + r() * 0.03;
    cubes.add(named(new Mesh(bevelBox(s, s, s, s * 0.15), glowMat(i % 3 ? 0xffd27a : 0xfff0b8)), `Cube${i}`, (r() - 0.5) * W * 0.8, H + 0.08 + r() * 0.35, (r() - 0.5) * D * 0.6));
  }
  root.add(cubes);
  return root;
}

export function idle(root: Group, time: number): void {
  root.getObjectByName('Cubes')?.children.forEach((c, i) => {
    const k = (time * 0.18 + i * 0.137) % 1;
    c.position.y = H + 0.04 + k * 0.45;
    c.scale.setScalar(Math.sin(k * Math.PI) * 1.2 + 0.1);
    c.rotation.set(time + i, time * 0.7 + i, 0);
  });
}
