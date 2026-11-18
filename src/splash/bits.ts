// The small things of the splash art (Yury, 15.11): cubes, gems, a ball, pebbles, glowing wire shapes, the big
// cyan cube, the origami rock by the castle, the «>_<» sign. Each a parentless Group about 1 unit across, front
// +Z; the stand (research/code/tools/splash-stand.ts) sizes and turns them as drawn.
import { CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, OctahedronGeometry, TetrahedronGeometry, Vector3 } from '@iwsdk/core';
import { bevelBox, blob, facets, glowMat, mix, named, paint } from './models/kit.js';
import { wireCopy } from './wire.js';

const LIGHT = new Vector3(-0.4, 0.8, 0.5).normalize();
const lit = (n: Vector3, color: number) => mix(mix(color, 0x1a1640, 0.55), mix(color, 0xffffff, 0.2), Math.max(0, n.dot(LIGHT)) * 0.9 + 0.15);
const group = (name: string, ...children: Mesh[]) => { const g = new Group(); g.name = name; g.add(...children); return g; };

/** A soft-edged cube of one colour. */
export const cube = (color: number) => () => group('Cube', named(new Mesh(paint(bevelBox(1, 1, 1, 0.1, 2), (c, n) => lit(n, color), 0.03, 1), facets({ roughness: 0.5 })), 'Body'));

/** A cube whose top is one colour and sides another (the art's yellow-and-blue block). */
export const twoTone = (top: number, side: number) => () =>
  group('TwoTone', named(new Mesh(paint(bevelBox(1, 1, 1, 0.08, 1), (c, n) => lit(n, n.y > 0.5 ? top : side), 0.03, 2), facets({ roughness: 0.5 })), 'Body'));

/** A faceted gem (a stretched octahedron), light on top, deep below. */
export const gem = (top: number, bottom: number) => () => {
  const g = new OctahedronGeometry(0.5, 0);
  g.scale(1, 1.25, 1);
  return group('Gem', named(new Mesh(paint(g, (c, n) => lit(n, n.y > 0 ? top : bottom), 0.03, 3), facets({ roughness: 0.3, metalness: 0.1 })), 'Body'));
};

/** The red-and-black ball: a faceted sphere, red on one side, near black on the other. */
export const ball = () => group('Ball', named(new Mesh(paint(new IcosahedronGeometry(0.5, 1), (c, n) => (c.x + c.y * 0.4 > 0 ? lit(n, 0xe0302c) : lit(n, 0x2a2430)), 0.04, 4), facets({ roughness: 0.4 })), 'Body'));

/** A small brown pebble, as fall from under the islands. */
export const pebble = (seed: number) => () => group('Pebble', named(new Mesh(paint(blob(0.5, seed, 0, 0.35, 0.8), (c, n) => lit(n, 0x8a5a36), 0.05, seed), facets({ roughness: 0.8 })), 'Body'));

/** Glowing wire shapes: a ball, a pyramid. */
export const wireBall = (color: number) => () => wireCopy(group('WireBall', named(new Mesh(new IcosahedronGeometry(0.5, 1), facets()), 'Body')), color) as Group;
export const wirePyramid = (color: number) => () => wireCopy(group('WirePyramid', named(new Mesh(new TetrahedronGeometry(0.5, 0), facets()), 'Body')), color) as Group;
/** A glowing ring-ball: a magenta wire sphere with a soft light inside. */
export const orb = (color: number) => () => {
  const g = wireCopy(group('Orb', named(new Mesh(new IcosahedronGeometry(0.5, 2), facets()), 'Body')), color) as Group;
  g.add(named(new Mesh(new IcosahedronGeometry(0.3, 1), glowMat(color, 0.35)), 'Core'));
  return g;
};

/** The big pale-cyan cube at the right, with small violet cubes stuck on its faces. */
export const bigCube = () => {
  const g = group('BigCube', named(new Mesh(paint(bevelBox(1, 1, 1, 0.04, 1), (c, n) => lit(n, 0x8fe3f0), 0.03, 5), facets({ roughness: 0.35 })), 'Body'));
  ([[0.2, 0.3, 0.5, 0.18], [-0.15, 0.05, 0.5, 0.14], [0.5, -0.2, 0.25, 0.16], [0.35, 0.5, -0.1, 0.12]] as const).forEach(([x, y, z, s], i) =>
    g.add(named(new Mesh(paint(bevelBox(s, s, s, s * 0.1), (c, n) => lit(n, 0x8a5fd8), 0.03, 6 + i), facets({ roughness: 0.4 })), `Cubelet${i}`, x, y, z)));
  return g;
};

/** The big origami rock by the castle: a few large flat facets, orange on the lit side, navy in the shade. */
export const origami = () => {
  const geo = new DodecahedronGeometry(0.5, 0);
  geo.scale(1.2, 0.9, 1);
  return group('Origami', named(new Mesh(paint(geo, (c, n) => (n.dot(LIGHT) > 0.15 ? mix(0xd88a3a, 0xf6b45a, n.dot(LIGHT)) : mix(0x1c2350, 0x34407a, n.dot(LIGHT) + 0.6)), 0.04, 9), facets({ roughness: 0.6 })), 'Body'));
};

/** The «>_<» sign: a pale rounded box with a dark glass face and the glowing glyphs. */
export const sign = () => {
  const g = group('Sign', named(new Mesh(paint(bevelBox(1, 0.4, 0.22, 0.06, 2), (c, n) => lit(n, 0xd8cfc4), 0.02, 10), facets({ roughness: 0.5 })), 'Body'));
  g.add(named(new Mesh(bevelBox(0.82, 0.28, 0.02, 0.02), new MeshStandardMaterial({ color: 0x14202a, roughness: 0.3 })), 'Glass', 0, 0, 0.11));
  const px = 0.035, on = glowMat(0x7ff7e6);
  // the glyphs, pixel by pixel: «>», «_», «<»
  const glyphs = ['#.......#', '.#.....#.', '..#...#..', '.#.....#.', '#...#.#.#'];
  glyphs.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '#') g.add(named(new Mesh(bevelBox(px * 0.85, px * 0.85, 0.01, 0.003), on), `Px${j}_${i}`, (i - 4) * px * 2.1, (2 - j) * px, 0.125));
  }));
  g.add(named(new Mesh(new CylinderGeometry(0.03, 0.03, 0.02, 10).rotateX(Math.PI / 2), glowMat(0x9ff3ff)), 'Led', 0.43, 0.13, 0.115));
  return g;
};
