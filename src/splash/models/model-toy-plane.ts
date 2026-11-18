// Hovering Toy Plane / Rocket (research/concepts/title/models-sheet-1.webp, second row, fifth tile): a chunky faceted toy
// jet — a fat red fuselage with a blue nose, a dark blue faceted canopy, thick swept blue wings, a blue fin and
// tail planes, an engine pod under each wing glowing orange, a cyan jet trail out of the tail.
// ~1.2 m long. Origin: the fuselage's middle, +Y up, the nose to +Z. idle(): it banks and bobs a little.
import { AdditiveBlending, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Shape, SphereGeometry, Vector3 } from '@iwsdk/core';
import { facets, mix, named, paint } from './kit.js';
import { LoftSurface } from './hardsurface.js';

export const model = { name: 'Hovering Toy Plane', length: 1.4, parts: ['Fuselage', 'Canopy', 'Wings', 'Tail', 'Engines', 'Trail'] };

const LIGHT = new Vector3(-0.4, 0.8, 0.5).normalize();
const lit = (n: Vector3, dark: number, light: number) => mix(dark, light, Math.max(0, n.dot(LIGHT) * 0.85 + 0.25));
const RED = (n: Vector3) => lit(n, 0xa3232a, 0xff5a40), BLUE = (n: Vector3) => lit(n, 0x22337a, 0x5b7ff0);

/** A flat planform (points [x, z]) as a thick plate with a chamfered rim, lying in XZ. */
function plate(points: [number, number][], thick: number, bevel: number) {
  const s = new Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth: thick - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(thick - 2 * bevel) / 2, 0);
  return geo;
}

export function build(): Group {
  const root = new Group();
  root.name = 'ToyPlane';
  // a fat faceted body, 8 sides round: blue nose, red behind it, rising a little to the tail
  const sections = [
    { z: 0.6, halfW: 0.035, hUp: 0.035, hDown: 0.035, cy: -0.01 },
    { z: 0.52, halfW: 0.12, hUp: 0.12, hDown: 0.11, cy: -0.01 },
    { z: 0.38, halfW: 0.18, hUp: 0.18, hDown: 0.16 },
    { z: 0.12, halfW: 0.2, hUp: 0.2, hDown: 0.17 },
    { z: -0.2, halfW: 0.16, hUp: 0.17, hDown: 0.12, cy: 0.02 },
    { z: -0.42, halfW: 0.1, hUp: 0.11, hDown: 0.06, cy: 0.05 },
    { z: -0.52, halfW: 0.075, hUp: 0.08, hDown: 0.04, cy: 0.06 },
  ];
  const body = LoftSurface.tube(sections).build(sections.map((s) => s.z), 8, true);
  root.add(named(new Mesh(paint(body, (c, n) => (c.z > 0.5 ? BLUE(n) : RED(n)), 0.03, 1), facets({ roughness: 0.5 })), 'Fuselage'));

  // the canopy: a faceted half dome of dark blue glass, stretched along the body
  const dome = new SphereGeometry(0.12, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.85, 1.55);
  root.add(named(new Mesh(paint(dome, (c, n) => lit(n, 0x1d2a66, 0x6f8cf0), 0.03, 2), facets({ roughness: 0.2, metalness: 0.2 })), 'Canopy', 0, 0.15, 0.18));

  const wings = new Group();
  wings.name = 'Wings';
  const wing: [number, number][] = [[0.12, 0.22], [0.52, 0.0], [0.54, -0.14], [0.12, -0.17]];
  wings.add(named(new Mesh(paint(plate(wing, 0.085, 0.024), (c, n) => BLUE(n), 0.03, 3), facets({ roughness: 0.5 })), 'Wing_R', 0, -0.04, 0));
  wings.add(named(new Mesh(paint(plate(wing.map(([x, z]) => [-x, z] as [number, number]).reverse(), 0.085, 0.024), (c, n) => BLUE(n), 0.03, 4), facets({ roughness: 0.5 })), 'Wing_L', 0, -0.04, 0));
  root.add(wings);

  const tail = new Group();
  tail.name = 'Tail';
  const fin = new Shape();
  ([[-0.3, 0.05], [-0.52, 0.06], [-0.6, 0.4], [-0.48, 0.4]] as const).forEach(([z, y], i) => (i ? fin.lineTo(z, y) : fin.moveTo(z, y)));
  fin.closePath();
  const finGeo = new ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  finGeo.rotateY(-Math.PI / 2);
  finGeo.translate(0.015, 0, 0);
  tail.add(named(new Mesh(paint(finGeo, (c, n) => BLUE(n), 0.03, 5), facets({ roughness: 0.5 })), 'Fin'));
  const stab: [number, number][] = [[0.06, -0.36], [0.3, -0.48], [0.3, -0.56], [0.06, -0.52]];
  tail.add(named(new Mesh(paint(plate(stab, 0.04, 0.012), (c, n) => BLUE(n), 0.03, 6), facets({ roughness: 0.5 })), 'Stabiliser_R', 0, 0.07, 0));
  tail.add(named(new Mesh(paint(plate(stab.map(([x, z]) => [-x, z] as [number, number]).reverse(), 0.04, 0.012), (c, n) => BLUE(n), 0.03, 7), facets({ roughness: 0.5 })), 'Stabiliser_L', 0, 0.07, 0));
  root.add(tail);

  // engine pods under the wings, each with an orange glow out of the back
  const engines = new Group();
  engines.name = 'Engines';
  const pod = new CylinderGeometry(0.055, 0.065, 0.2, 8);
  pod.rotateX(Math.PI / 2);
  const fire = new MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const flame = new ConeGeometry(0.05, 0.14, 8);
  flame.rotateX(-Math.PI / 2);
  for (const [side, x] of [['R', 0.32], ['L', -0.32]] as const) {
    engines.add(named(new Mesh(paint(pod.clone(), (c, n) => lit(n, 0x3a3f66, 0x9aa6d8), 0.03, x > 0 ? 8 : 9), facets({ roughness: 0.4, metalness: 0.3 })), `Pod_${side}`, x, -0.11, -0.02));
    engines.add(named(new Mesh(flame, fire), `Flame_${side}`, x, -0.11, -0.18));
  }
  root.add(engines);

  // the jet trail: two glowing cyan cones out of the tail, the outer one fainter
  const trail = new Group();
  trail.name = 'Trail';
  trail.userData.iwsdkPreviewBounds = 'exclude';
  [[0.06, 0.32, 0.9], [0.1, 0.5, 0.35]].forEach(([r, len, op], i) => {
    const cone = new ConeGeometry(r, len, 10, 1, true);
    cone.rotateX(-Math.PI / 2);
    cone.translate(0, 0, -len / 2);
    trail.add(named(new Mesh(cone, new MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: op, blending: AdditiveBlending, depthWrite: false, toneMapped: false })), `Jet${i}`, 0, 0.07, -0.53));
  });
  root.add(trail);
  return root;
}

export function idle(root: Group, time: number): void {
  root.rotation.z = Math.sin(time * 0.9) * 0.08;
  root.rotation.x = Math.sin(time * 0.6) * 0.04;
  const trail = root.getObjectByName('Trail');
  if (trail) trail.scale.z = 1 + Math.sin(time * 14) * 0.08;
}
