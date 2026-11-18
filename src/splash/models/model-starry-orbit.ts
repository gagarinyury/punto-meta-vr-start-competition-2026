// Sci-Fi Starry Orbit (research/concepts/title/models-sheet-1.webp, second row, fourth tile): a faceted planet, blue-lilac
// on top running to warm peach below, specks of starlight on it, a thick soft peach ring round it, tilted;
// round them float two five-point stars, a lilac spiky star, small cubes and twinkles. ~1.4 m across the ring.
// Origin: the planet's centre. idle(): the planet turns, the bits drift round.
import { ExtrudeGeometry, Group, IcosahedronGeometry, LatheGeometry, Mesh, MeshStandardMaterial, OctahedronGeometry, Shape, Vector2, Vector3 } from '@iwsdk/core';
import { bevelBox, facets, jitter, mix, named, paint, rng } from './kit.js';

export const model = { name: 'Sci-Fi Starry Orbit', length: 1.5, parts: ['Planet', 'Ring', 'Bits'] };

const LIGHT = new Vector3(-0.5, 0.75, 0.5).normalize();

/** A star of n points as a flat shape (outer radius ro, inner ri). */
function star(n: number, ro: number, ri: number): Shape {
  const s = new Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export function build(): Group {
  const root = new Group();
  root.name = 'StarryOrbit';
  const tilted = new Group();
  tilted.name = 'Tilt';
  tilted.rotation.set(0.12, 0, -0.3);
  root.add(tilted);

  const R = 0.36;
  const ball = jitter(new IcosahedronGeometry(R, 2), R * 0.025, 3);
  const planet = named(new Mesh(paint(ball, (c, n) => {
    const base = mix(0xf19a62, 0x5d6fd0, (c.y / R + 0.5) / 1.3);
    return mix(mix(base, 0x231f50, 0.55), base, Math.max(0, n.dot(LIGHT)) * 0.9 + 0.25);
  }, 0.04, 5), facets({ roughness: 0.7 })), 'Planet');
  tilted.add(planet);
  // specks: tiny bright crystals pressed into the surface
  const speck = new OctahedronGeometry(0.009, 0), white = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfe8ff, emissiveIntensity: 1.2 });
  const r = rng(17);
  for (let i = 0; i < 22; i++) {
    const v = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(R * 1.005);
    planet.add(named(new Mesh(speck, white), `Speck${i}`, v.x, v.y, v.z));
  }

  // the ring: a rounded band turned round the axis (a lathe), lighter on top
  const ri = 0.48, ro = 0.63, t = 0.045, profile: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = Math.cos(a), y = Math.sin(a);
    // a stadium: flat top and bottom, round inner and outer edges
    profile.push(new Vector2((ri + ro) / 2 + Math.sign(x) * ((ro - ri) / 2 - t / 2) + x * (t / 2), y * (t / 2)));
  }
  const ring = new LatheGeometry(profile, 40);
  tilted.add(named(new Mesh(paint(ring, (c, n) => (n.y > 0.5 ? 0xf6c19a : n.y < -0.5 ? 0xb9765a : 0xe39b74), 0.04, 7), facets({ roughness: 0.55 })), 'Ring'));

  const bits = new Group();
  bits.name = 'Bits';
  const starGeo = new ExtrudeGeometry(star(5, 0.075, 0.034), { depth: 0.025, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 });
  starGeo.center();
  const spiky = new ExtrudeGeometry(star(8, 0.075, 0.035), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1 });
  spiky.center();
  const add = (m: Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.rotation.set(r() * 0.8, r() * 0.8, r() * 3); bits.add(m); };
  add(named(new Mesh(paint(starGeo, (c, n) => (n.z > 0.5 ? 0xf7c48f : 0xd98d62), 0.04, 1), facets({ roughness: 0.5 })), 'StarA'), -0.18, 0.62, 0.05);
  add(named(new Mesh(paint(starGeo.clone(), (c, n) => (n.z > 0.5 ? 0xf7c48f : 0xd98d62), 0.04, 2), facets({ roughness: 0.5 })), 'StarB'), 0.55, -0.42, 0.1);
  add(named(new Mesh(paint(spiky, (c, n) => (n.z > 0.5 ? 0xb39bf2 : 0x7a5fd0), 0.04, 3), facets({ roughness: 0.5 })), 'Spiky'), 0.32, -0.55, 0.2);
  ([[0.06, 0xa996ef, 0.5, 0.48, -0.1], [0.05, 0x8fb4f2, -0.62, 0.05, 0.15], [0.04, 0xa996ef, -0.52, -0.38, -0.1], [0.045, 0xc6b4f6, 0.2, 0.62, -0.2]] as const)
    .forEach(([s, c, x, y, z], i) => add(named(new Mesh(paint(bevelBox(s, s, s, s * 0.12), (p, n) => (n.y > 0.5 ? mix(c, 0xffffff, 0.3) : c), 0.04, i), facets({ roughness: 0.5 })), `Cube${i}`), x, y, z));
  // twinkles: a thin glowing plus
  const glow = new MeshStandardMaterial({ color: 0xd8ccff, emissive: 0xb9a8ff, emissiveIntensity: 1.1 });
  ([[0.66, 0.15, 0], [-0.45, 0.45, 0.1], [-0.3, -0.55, 0.1]] as const).forEach(([x, y, z], i) => {
    const plus = new Group();
    plus.name = `Twinkle${i}`;
    plus.add(new Mesh(bevelBox(0.07, 0.016, 0.016, 0.004), glow), new Mesh(bevelBox(0.016, 0.07, 0.016, 0.004), glow));
    plus.position.set(x, y, z);
    bits.add(plus);
  });
  root.add(bits);
  return root;
}

export function idle(root: Group, time: number): void {
  const planet = root.getObjectByName('Planet'), bits = root.getObjectByName('Bits');
  if (planet) planet.rotation.y = time * 0.3;
  if (bits) bits.rotation.z = Math.sin(time * 0.4) * 0.08;
}
