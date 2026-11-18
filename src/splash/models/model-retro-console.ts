// Retro Game Console (research/concepts/title/models-sheet-1.webp, second row, second tile): a small arcade cabinet of
// pale mauve plastic with soft edges — a screen face leaning back with a pixel face on dark teal, below it a
// deck sloping forward with a dark cross pad and a green and a red button, slots on the side; orange sparks
// fly off it. ~0.5 m tall. Origin: the middle of its foot, +Y up, the screen to +Z.
import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, Vector3 } from '@iwsdk/core';
import { bevelBox, facets, mix, named, paint, rng } from './kit.js';

export const model = { name: 'Retro Game Console', length: 0.75, parts: ['Body', 'Screen', 'Deck', 'Vents', 'Sparks'] };

const W = 0.42;
// the side profile, (z, y): foot, deck front, deck top up to the screen, the screen face, the top, the back
const PROFILE: [number, number][] = [[-0.2, 0], [0.25, 0], [0.26, 0.12], [0.085, 0.205], [0.06, 0.5], [-0.19, 0.52]];
const LIGHT = new Vector3(-0.5, 0.8, 0.5).normalize();

export function build(): Group {
  const root = new Group();
  root.name = 'RetroConsole';
  const shape = new Shape();
  PROFILE.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const r = 0.03;
  const body = new ExtrudeGeometry(shape, { depth: W - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.8, bevelSegments: 3, curveSegments: 1 });
  body.rotateY(-Math.PI / 2); // the profile's x becomes +Z, the extrusion runs along -X
  body.translate(W / 2 - r, 0, 0);
  root.add(named(new Mesh(paint(body, (c, n) => mix(0x8a6d7c, 0xd4b6c0, (n.dot(LIGHT) + 0.3) / 1.2), 0.02, 1), facets({ roughness: 0.55 })), 'Body'));

  // the screen: a bezel on the face that leans back, a dark teal glass, a pixel face glowing cyan
  const [z0, y0] = PROFILE[3], [z1, y1] = PROFILE[4], tilt = Math.atan2(z0 - z1, y1 - y0);
  const screen = new Group();
  screen.name = 'Screen';
  screen.position.set(0, (y0 + y1) / 2 + 0.01, (z0 + z1) / 2 + r * 0.8);
  screen.rotation.x = -tilt;
  screen.add(named(new Mesh(bevelBox(W * 0.78, 0.25, 0.02, 0.008), new MeshStandardMaterial({ color: 0x7d6672, roughness: 0.6 })), 'Bezel'));
  screen.add(named(new Mesh(bevelBox(W * 0.66, 0.2, 0.012, 0.006), new MeshStandardMaterial({ color: 0x0d2a2f, roughness: 0.25, emissive: 0x06282c })), 'Glass', 0, 0, 0.008));
  const px = 0.018, pixel = bevelBox(px * 0.9, px * 0.9, 0.006, 0.001), on = new MeshStandardMaterial({ color: 0x7ff7e6, emissive: 0x4fe8d6, emissiveIntensity: 1.3 });
  // a happy pixel face: two eyes with a squint, a smile
  const face = ['.##.....##.', '#..#...#..#', '...........', '...........', '...#...#...', '....###....'];
  face.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '#') screen.add(named(new Mesh(pixel, on), `Pixel${j}_${i}`, (i - (row.length - 1) / 2) * px, (2.5 - j) * px + 0.005, 0.016));
  }));
  root.add(screen);

  // the deck sloping forward: a cross pad and two round buttons
  const [dz0, dy0] = PROFILE[2], [dz1, dy1] = PROFILE[3], slope = Math.atan2(dy1 - dy0, dz0 - dz1);
  const deck = new Group();
  deck.name = 'Deck';
  deck.position.set(0, (dy0 + dy1) / 2 + r * 0.75, (dz0 + dz1) / 2 + r * 0.3);
  deck.rotation.x = slope;
  const pad = new MeshStandardMaterial({ color: 0x4a4452, roughness: 0.5 });
  deck.add(named(new Mesh(bevelBox(0.1, 0.022, 0.032, 0.008), pad), 'PadAcross', -0.08, 0.008, 0));
  deck.add(named(new Mesh(bevelBox(0.032, 0.022, 0.1, 0.008), pad), 'PadAlong', -0.08, 0.008, 0));
  const button = new CylinderGeometry(0.021, 0.023, 0.022, 14);
  deck.add(named(new Mesh(button, new MeshStandardMaterial({ color: 0x5fcb58, roughness: 0.35 })), 'ButtonGreen', 0.07, 0.008, -0.022));
  deck.add(named(new Mesh(button, new MeshStandardMaterial({ color: 0xe8574d, roughness: 0.35 })), 'ButtonRed', 0.105, 0.008, 0.02));
  root.add(deck);

  // slots low on the left side
  const vents = new Group();
  vents.name = 'Vents';
  const slot = new MeshStandardMaterial({ color: 0x5d4f58, roughness: 0.8 });
  for (let i = 0; i < 3; i++) vents.add(named(new Mesh(bevelBox(0.008, 0.012, 0.09, 0.003), slot), `Slot${i}`, -W / 2 - 0.002, 0.05 + i * 0.026, 0.12));
  root.add(vents);

  // sparks: short glowing orange streaks pointing away from the cabinet
  const sparks = new Group();
  sparks.name = 'Sparks';
  const hot = new MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff6a10, emissiveIntensity: 0.9 });
  const streak = new CylinderGeometry(0.004, 0.004, 1, 4);
  const rr = rng(9), centre = new Vector3(0, 0.36, 0);
  for (let i = 0; i < 16; i++) {
    const right = i < 11, a = (right ? -0.9 : 2.3) + rr() * 1.6, dir = new Vector3(Math.cos(a), Math.sin(a) * 0.9, 0.2 + rr() * 0.3).normalize();
    const dist = 0.3 + rr() * 0.16, len = 0.03 + rr() * 0.05;
    const m = named(new Mesh(streak, hot), `Spark${i}`);
    m.position.copy(centre).addScaledVector(dir, dist);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    sparks.add(m);
  }
  root.add(sparks);
  return root;
}
