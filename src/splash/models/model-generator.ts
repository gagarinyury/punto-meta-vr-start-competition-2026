// Futuristic Power Generator (research/concepts/title/models-sheet-2.jpeg, bottom right): an upright capsule — a stepped
// eight-sided foot and cap of lilac-grey metal traced with cyan edges, between them a glass cylinder glowing
// mint, a pool of green light in its bottom and a lightning bolt floating inside; orange sparks fly off it.
// ~0.85 m tall. Origin: the middle of the foot, +Y up.
import { CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, TorusGeometry, Vector3 } from '@iwsdk/core';
import { edgeGlow, facets, glowMat, mix, named, paint, streaks } from './kit.js';

export const model = { name: 'Futuristic Power Generator', length: 1.0, parts: ['Foot', 'Glass', 'Charge', 'Bolt', 'Cap', 'Sparks'] };

const LIGHT = new Vector3(-0.5, 0.75, 0.5).normalize();
const metal = (n: Vector3) => mix(0x3e3852, 0xaaa0c2, Math.max(0, n.dot(LIGHT)) * 0.85 + 0.2);

export function build(): Group {
  const root = new Group();
  root.name = 'Generator';
  const mat = facets({ roughness: 0.4, metalness: 0.3 });
  const step = (group: Group, name: string, rt: number, rb: number, h: number, y: number, seed: number) => {
    const geo = new CylinderGeometry(rt, rb, h, 8, 1);
    geo.rotateY(Math.PI / 8);
    group.add(named(new Mesh(paint(geo, (c, n) => metal(n), 0.03, seed), mat), name, 0, y, 0));
    group.add(named(edgeGlow(geo, 0x8ff2ff, 0.4), `${name}Edges`, 0, y, 0));
  };
  const foot = new Group();
  foot.name = 'Foot';
  step(foot, 'Plinth', 0.27, 0.29, 0.06, 0.03, 1);
  step(foot, 'Base', 0.22, 0.25, 0.1, 0.11, 2);
  step(foot, 'Collar', 0.21, 0.21, 0.04, 0.18, 3);
  root.add(foot);

  const y0 = 0.2, y1 = 0.62;
  const glass = new CylinderGeometry(0.18, 0.18, y1 - y0, 20, 1, true);
  root.add(named(new Mesh(glass, new MeshStandardMaterial({ color: 0x9ff8ea, emissive: 0x2fbfa8, emissiveIntensity: 0.35, roughness: 0.05, transparent: true, opacity: 0.32, side: DoubleSide, depthWrite: false })), 'Glass', 0, (y0 + y1) / 2, 0));
  root.add(named(new Mesh(new CylinderGeometry(0.17, 0.17, 0.1, 20), glowMat(0x3fe0a0, 0.75)), 'Charge', 0, y0 + 0.05, 0));
  // glowing rings where the glass meets the metal
  for (const [name, y] of [['RingLow', y0], ['RingHigh', y1]] as const) {
    const ring = new TorusGeometry(0.185, 0.008, 4, 32);
    ring.rotateX(Math.PI / 2);
    root.add(named(new Mesh(ring, glowMat(0x8ff6ff)), name, 0, y, 0));
  }
  const bolt = new Shape();
  ([[0.03, 0.13], [-0.055, -0.005], [0.0, -0.005], [-0.035, -0.13], [0.06, 0.025], [0.005, 0.025], [0.04, 0.13]] as const).forEach(([x, y], i) => (i ? bolt.lineTo(x, y) : bolt.moveTo(x, y)));
  bolt.closePath();
  const boltGeo = new ExtrudeGeometry(bolt, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1 });
  boltGeo.center();
  root.add(named(new Mesh(boltGeo, glowMat(0xd8fff2)), 'Bolt', 0, (y0 + y1) / 2 + 0.02, 0));

  const cap = new Group();
  cap.name = 'Cap';
  step(cap, 'CapCollar', 0.21, 0.21, 0.04, y1 + 0.02, 4);
  step(cap, 'CapBody', 0.2, 0.24, 0.1, y1 + 0.09, 5);
  step(cap, 'CapTop', 0.15, 0.19, 0.06, y1 + 0.17, 6);
  const lens = new CylinderGeometry(0.1, 0.1, 0.012, 16);
  cap.add(named(new Mesh(lens, glowMat(0x7ff3e0)), 'Lens', 0, y1 + 0.205, 0));
  root.add(cap);
  root.add(streaks(18, new Vector3(0, 0.42, 0), 0.26, 0.42, 0xff9a2a, 7, [[-0.7, 0.9], [2.2, 3.9]]));
  return root;
}

export function idle(root: Group, time: number): void {
  const bolt = root.getObjectByName('Bolt'), charge = root.getObjectByName('Charge');
  if (bolt) { bolt.rotation.y = time * 1.2; bolt.scale.setScalar(1 + Math.sin(time * 6) * 0.06); }
  if (charge) charge.scale.y = 1 + Math.sin(time * 2) * 0.25;
}
