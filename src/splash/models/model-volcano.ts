// Polygonal Volcano (research/concepts/title/models-sheet-2.jpeg, bottom left): a broad faceted cone of dark brown rock on
// an uneven base, a crater rim with a pool of glowing lava, thick lava tongues running down the sides each
// ending in a round drip; embers rise above. ~1.3 m across, ~0.9 m tall. Origin: the middle of the base.
import { CircleGeometry, Group, Mesh, SphereGeometry, Vector3 } from '@iwsdk/core';
import { type Edge, facets, glowMat, mix, named, paint, ringLoft, rng, taperedTube } from './kit.js';

export const model = { name: 'Polygonal Volcano', length: 1.4, parts: ['Rock', 'Pool', 'Flows', 'Embers'] };

const R = 0.65, SIDES = 11, LIGHT = new Vector3(-0.5, 0.75, 0.5).normalize();
// the cone's profile: [scale of R, height]; the crater dips in at the top
const PROFILE: [number, number][] = [[1, 0], [0.82, 0.2], [0.58, 0.42], [0.38, 0.62], [0.27, 0.74], [0.2, 0.72]];

/** A point on the slope at angle a and profile position t (0 = foot, PROFILE.length - 2 = rim), raised by lift. */
function onSlope(a: number, t: number, lift: number): Vector3 {
  const i = Math.min(Math.floor(t), PROFILE.length - 2), f = t - i, [s0, y0] = PROFILE[i], [s1, y1] = PROFILE[i + 1];
  const s = (s0 + (s1 - s0) * f) * R + lift, y = y0 + (y1 - y0) * f + lift * 0.6;
  return new Vector3(Math.cos(a) * s, y, -Math.sin(a) * s);
}

export function build(): Group {
  const root = new Group();
  root.name = 'Volcano';
  const r = rng(5);
  const edge: Edge = Array.from({ length: SIDES }, (_, i) => ({ a: (i / SIDES) * Math.PI * 2 + (r() - 0.5) * 0.2, k: 1 }));
  const rock = ringLoft(edge, PROFILE.map(([s, y], i) => ({ s, y, wobble: i === 0 ? 0.12 : i < 4 ? 0.1 : 0.05 })), new Vector3(0, 0.66, 0), 9, true, R, true);
  root.add(named(new Mesh(paint(rock, (c, n) => (n.y < -0.5 ? 0x3a2624 : mix(0x3a2430, 0x9a6458, Math.max(0, n.dot(LIGHT)) * 0.9 + 0.1)), 0.05, 3), facets({ roughness: 0.85 })), 'Rock'));
  // the base's underside: a dark flat bottom
  const pool = new CircleGeometry(R * 0.2, 10).rotateX(-Math.PI / 2);
  root.add(named(new Mesh(pool, glowMat(0xffa23a)), 'Pool', 0, 0.705, 0));

  // the flows: from the rim down the front half (angle -π/2 is the front, +Z), thick and tapering, each ending in a drip
  const flows = new Group();
  flows.name = 'Flows';
  const lava = glowMat(0xff8a2a), hot = glowMat(0xffc25a);
  ([[-0.85, 1.6], [-1.35, 2.3], [-1.8, 1.3], [-2.3, 2.0], [2.8, 1.9]] as const).forEach(([a, reach], i) => {
    const top = PROFILE.length - 1.6, pts: Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = top - (k / 5) * reach * 1.4;
      pts.push(onSlope(a + Math.sin(k * 1.3 + i) * 0.06, t, 0.012));
    }
    flows.add(named(new Mesh(taperedTube(pts, 0.05, 0.03, 7, 18), i % 2 ? lava : hot), `Flow${i}`));
    const end = pts[pts.length - 1];
    flows.add(named(new Mesh(new SphereGeometry(0.042, 8, 6), lava), `Drip${i}`, end.x, end.y - 0.01, end.z));
  });
  root.add(flows);

  const embers = new Group();
  embers.name = 'Embers';
  for (let i = 0; i < 12; i++) {
    const s = 0.012 + r() * 0.016;
    embers.add(named(new Mesh(new SphereGeometry(s, 6, 4), glowMat(i % 3 ? 0xffb347 : 0xffe08a)), `Ember${i}`, (r() - 0.5) * 0.35, 0.85 + r() * 0.4, (r() - 0.5) * 0.25));
  }
  root.add(embers);
  return root;
}

export function idle(root: Group, time: number): void {
  root.getObjectByName('Embers')?.children.forEach((e, i) => {
    const k = (time * 0.25 + i * 0.083) % 1;
    e.position.y = 0.78 + k * 0.5;
    e.scale.setScalar(1 - k * 0.7);
  });
}
