// Interactive Question Block (research/concepts/title/models-sheet-1.webp, the fifth tile): a golden block with soft
// rounded edges, yellow on top running to orange below, a rivet in each corner of each side, a glowing cream
// «?» raised on all four sides; round it float small cubes, two faceted gems and sparks. ~0.6 m block.
// Origin: the block's centre. idle(): the bits orbit and turn.
import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Shape, Vector3 } from '@iwsdk/core';
import { bevelBox, facets, mix, named, paint, rng, shade } from './kit.js';

export const model = { name: 'Interactive Question Block', length: 1.3, parts: ['Block', 'Faces', 'Bits'] };

const S = 0.6;

/** The «?»: a thick hook (a ring sector into a neck and a stem) and a square dot, in units of the face. */
function questionShapes(): Shape[] {
  const cx = 0, cy = 0.12, ro = 0.17, ri = 0.075, a1 = (165 * Math.PI) / 180, a2 = (-58 * Math.PI) / 180;
  const hook = new Shape();
  hook.moveTo(cx + ro * Math.cos(a1), cy + ro * Math.sin(a1));
  hook.absarc(cx, cy, ro, a1, a2, true);
  hook.lineTo(0.05, -0.065);
  hook.lineTo(0.05, -0.15);
  hook.lineTo(-0.05, -0.15);
  hook.lineTo(-0.05, -0.035);
  hook.lineTo(cx + ri * Math.cos(a2), cy + ri * Math.sin(a2));
  hook.absarc(cx, cy, ri, a2, a1, false);
  hook.closePath();
  const dot = new Shape();
  dot.moveTo(-0.05, -0.32); dot.lineTo(0.05, -0.32); dot.lineTo(0.05, -0.22); dot.lineTo(-0.05, -0.22); dot.closePath();
  return [hook, dot];
}

export function build(): Group {
  const root = new Group();
  root.name = 'QuestionBlock';
  const block = new Group();
  block.name = 'Block';
  // the gold: lighter at the top edge, warm orange at the bottom, the top face the palest
  const body = shade(bevelBox(S, S, S, S * 0.09, 3), (p, n) => (n.y > 0.7 ? 0xffdf5c : mix(0xf29a26, 0xffcf45, (p.y + S / 2) / S)));
  block.add(named(new Mesh(body, new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.15, emissive: 0x3a1c00, flatShading: true })), 'Gold'));

  // the four sides: a «?» and four rivets on each
  const faces = new Group();
  faces.name = 'Faces';
  const glow = new MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffe9b0, emissiveIntensity: 0.9, roughness: 0.4, flatShading: true });
  const markGeo = new ExtrudeGeometry(questionShapes(), { depth: 0.02 * S, bevelEnabled: true, bevelThickness: 0.012 * S, bevelSize: 0.01 * S, bevelSegments: 2, curveSegments: 10 });
  markGeo.scale(S * 1.25, S * 1.25, 1);
  const rivetGeo = new CylinderGeometry(S * 0.028, S * 0.032, S * 0.02, 10);
  rivetGeo.rotateX(Math.PI / 2);
  const rivetMat = new MeshStandardMaterial({ color: 0x8c4a1a, roughness: 0.5, metalness: 0.3 });
  for (let f = 0; f < 4; f++) {
    // each side face: a frame turned round Y, its +Z out of the face
    const face = new Group();
    face.name = `Face${f}`;
    face.rotation.y = (f * Math.PI) / 2;
    face.add(named(new Mesh(markGeo, glow), `Mark${f}`, 0, S * 0.02, S / 2 - 0.004));
    const e = S * 0.38;
    [[-e, e], [e, e], [-e, -e], [e, -e]].forEach(([x, y], i) => face.add(named(new Mesh(rivetGeo, rivetMat), `Rivet${f}_${i}`, x, y, S / 2 + 0.002)));
    faces.add(face);
  }
  block.add(faces);
  root.add(block);

  // the bits: pastel cubes, two two-tone gems, sparks
  const bits = new Group();
  bits.name = 'Bits';
  const r = rng(5);
  const cube = (size: number, color: number, i: number) => named(new Mesh(paint(bevelBox(size, size, size, size * 0.12), (c, n) => (n.y > 0.5 ? mix(color, 0xffffff, 0.25) : color), 0.05, i), facets({ roughness: 0.5 })), `Cube${i}`);
  ([[0.11, 0xb7a0ea, -0.62, 0.32, 0.1], [0.08, 0xf6a64c, -0.55, -0.3, 0.25], [0.07, 0x7fe7ff, 0.5, 0.48, -0.1], [0.06, 0xf6c04c, 0.62, 0.1, 0.2], [0.05, 0xb7a0ea, 0.2, 0.55, 0.3]] as const)
    .forEach(([s, c, x, y, z], i) => { const m = cube(s, c, i); m.position.set(x, y, z); m.rotation.set(r() * 3, r() * 3, r() * 3); bits.add(m); });
  ([[0.13, 0x6fd8f5, 0x3d8fd8, 0.6, -0.32, 0.1], [0.11, 0xa98af0, 0x6a4fc4, -0.48, 0.55, -0.15]] as const).forEach(([s, top, bottom, x, y, z], i) => {
    const gem = paint(new OctahedronGeometry(s, 0), (c, n) => (n.y > 0 ? top : bottom), 0.08, i + 20);
    const m = named(new Mesh(gem, facets({ roughness: 0.3, metalness: 0.1 })), `Gem${i}`, x, y, z);
    m.scale.set(1, 1.15, 1);
    m.rotation.set(0.3, r() * 3, 0.2);
    bits.add(m);
  });
  const spark = bevelBox(0.024, 0.024, 0.024, 0.004);
  const sparkMats = [0xffe28a, 0x9ff3ff, 0xffb35c].map((c) => new MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4 }));
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, rad = 0.45 + r() * 0.35, y = (r() - 0.5) * 1.0;
    const m = named(new Mesh(spark, sparkMats[i % 3]), `Spark${i}`, Math.cos(a) * rad, y, Math.sin(a) * rad * 0.6);
    m.scale.setScalar(0.5 + r() * 1.1);
    bits.add(m);
  }
  root.add(bits);
  return root;
}

const axis = new Vector3(0.1, 1, 0.05).normalize();
/** The bits slowly orbit the block and each turns on its own. */
export function idle(root: Group, time: number): void {
  const bits = root.getObjectByName('Bits');
  if (!bits) return;
  bits.setRotationFromAxisAngle(axis, time * 0.25);
  bits.children.forEach((b, i) => { if (!b.name.startsWith('Spark')) b.rotation.y = time * (0.6 + (i % 3) * 0.3); });
}
