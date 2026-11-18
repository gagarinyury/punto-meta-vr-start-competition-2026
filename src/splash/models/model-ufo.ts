// Hovering UFO (research/concepts/title/models-sheet-2.jpeg, bottom row, fourth): a faceted saucer of lilac-mauve, a raised
// collar under a glass dome of glowing cyan, warm lights round its rim, a pink glowing stripe on its edge, a
// light under it and a pale cyan tractor beam reaching down with motes in it. ~1 m across.
// Origin: the saucer's middle, +Y up. idle(): it turns and bobs, the motes rise in the beam.
import { AdditiveBlending, ConeGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3 } from '@iwsdk/core';
import { bevelBox, facets, glowMat, mix, named, paint, rng } from './kit.js';

export const model = { name: 'Hovering UFO', length: 1.2, parts: ['Saucer', 'Collar', 'Dome', 'Lights', 'Stripe', 'Beam'] };

const LIGHT = new Vector3(-0.5, 0.75, 0.5).normalize();
const lilac = (n: Vector3) => mix(0x5a4668, 0xd8c4dc, Math.max(0, n.dot(LIGHT)) * 0.85 + 0.2);

export function build(): Group {
  const root = new Group();
  root.name = 'UFO';
  const ship = new Group();
  ship.name = 'Ship';
  root.add(ship);
  // the saucer's profile from the middle of its belly out to the rim and back over its top
  const profile = [[0, -0.07], [0.16, -0.085], [0.38, -0.05], [0.5, -0.012], [0.52, 0.01], [0.47, 0.045], [0.3, 0.085], [0.2, 0.1], [0, 0.1]].map(([x, y]) => new Vector2(x, y));
  ship.add(named(new Mesh(paint(new LatheGeometry(profile.reverse(), 16), (c, n) => lilac(n), 0.03, 1), facets({ roughness: 0.5 })), 'Saucer'));
  ship.add(named(new Mesh(paint(new CylinderGeometry(0.25, 0.27, 0.05, 16), (c, n) => mix(0x4a3a58, 0xb8a4c4, Math.max(0, n.dot(LIGHT)) + 0.15), 0.03, 2), facets({ roughness: 0.5 })), 'Collar', 0, 0.12, 0));
  const dome = new SphereGeometry(0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  ship.add(named(new Mesh(dome, new MeshStandardMaterial({ color: 0x5fd0e8, emissive: 0x1a6a88, emissiveIntensity: 0.6, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, flatShading: true })), 'Dome', 0, 0.14, 0));
  // a highlight on the dome: a soft white patch
  const shine = new SphereGeometry(0.212, 8, 4, 2.2, 0.6, 0.35, 0.4);
  ship.add(named(new Mesh(shine, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })), 'Shine', 0, 0.14, 0));

  const lights = new Group();
  lights.name = 'Lights';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lights.add(named(new Mesh(new SphereGeometry(0.026, 10, 6), glowMat(0xffe7a0)), `Light${i}`, Math.cos(a) * 0.4, 0.052, Math.sin(a) * 0.4));
  }
  ship.add(lights);
  const stripe = new TorusGeometry(0.505, 0.011, 4, 48);
  stripe.rotateX(Math.PI / 2);
  ship.add(named(new Mesh(stripe, glowMat(0xff5fae)), 'Stripe', 0, -0.018, 0));
  ship.add(named(new Mesh(new CylinderGeometry(0.11, 0.13, 0.03, 16), glowMat(0xc8fbff)), 'Emitter', 0, -0.085, 0));

  // the beam: a see-through cone of cyan light, brighter in its core, motes rising in it
  const beam = new Group();
  beam.name = 'Beam';
  beam.userData.iwsdkPreviewBounds = 'exclude';
  [[0.32, 0.18], [0.2, 0.22]].forEach(([r, op], i) => {
    const cone = new ConeGeometry(r, 0.75, 24, 1, true);
    cone.translate(0, -0.475, 0); // its tip under the ship, widening downward
    beam.add(named(new Mesh(cone, new MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: op, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })), `Cone${i}`));
  });
  const r = rng(3);
  for (let i = 0; i < 14; i++) {
    const s = 0.012 + r() * 0.012;
    beam.add(named(new Mesh(bevelBox(s, s, s, s * 0.2), glowMat(0xe6fdff)), `Mote${i}`, (r() - 0.5) * 0.3, -0.2 - r() * 0.6, (r() - 0.5) * 0.3));
  }
  root.add(beam);
  return root;
}

export function idle(root: Group, time: number): void {
  const ship = root.getObjectByName('Ship');
  if (ship) { ship.rotation.y = time * 0.5; ship.position.y = Math.sin(time * 1.3) * 0.02; ship.rotation.z = Math.sin(time * 0.9) * 0.04; }
  root.getObjectByName('Beam')?.children.forEach((m, i) => {
    if (!m.name.startsWith('Mote')) return;
    const k = (time * 0.2 + i * 0.071) % 1;
    m.position.y = -0.85 + k * 0.7;
    m.scale.setScalar(Math.sin(k * Math.PI) + 0.1);
  });
}
