// Digital Clock Tower (research/concepts/title/models-sheet-2.jpeg, bottom row, third): blocks of terracotta-mauve stacked a
// little off each other — a foot with two dark arches, a narrower middle with a gear, a glowing slot and a
// pipe looped round it, a wide top block with a round clock on the front and a gear on the side — under a
// pyramid roof with a pale peach tip. ~1.25 m tall. Origin: the middle of the foot, +Y up, the clock to +Z.
import { ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, TorusGeometry, Vector3 } from '@iwsdk/core';
import { bevelBox, facets, glowMat, mix, named, paint } from './kit.js';

export const model = { name: 'Digital Clock Tower', length: 1.3, parts: ['Foot', 'Middle', 'Top', 'Roof', 'Clock', 'Gears', 'Pipe'] };

const LIGHT = new Vector3(-0.5, 0.75, 0.5).normalize();
const clay = (n: Vector3) => mix(0x4a2c3a, 0xbf7c70, Math.max(0, n.dot(LIGHT)) * 0.85 + 0.2);
const steel = new MeshStandardMaterial({ color: 0x5a5868, roughness: 0.45, metalness: 0.4, flatShading: true });
const dark = new MeshStandardMaterial({ color: 0x241d2c, roughness: 1 });

/** A gear: n teeth round a ring, a hole in the middle, flat, facing +Z. */
function gear(r: number, n: number, thick: number): ExtrudeGeometry {
  const s = new Shape(), ri = r * 0.78;
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2, rad = i % 4 < 2 ? r : ri;
    i ? s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  s.closePath();
  const hole = new Shape();
  hole.absarc(0, 0, r * 0.32, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return new ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.2, bevelSize: thick * 0.2, bevelSegments: 1 });
}

export function build(): Group {
  const root = new Group();
  root.name = 'ClockTower';
  const mat = facets({ roughness: 0.7 }), block = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, seed: number) =>
    root.add(named(new Mesh(paint(bevelBox(w, h, d, 0.02, 2), (c, n) => clay(n), 0.03, seed), mat), name, x, y, z));
  block('Foot', 0.36, 0.32, 0.34, 0, 0.16, 0, 1);
  block('FootCap', 0.4, 0.05, 0.38, 0, 0.345, 0, 2);
  block('Middle', 0.3, 0.36, 0.3, 0.015, 0.55, 0, 3);
  block('MiddleCap', 0.34, 0.05, 0.34, 0.015, 0.755, 0, 4);
  block('Top', 0.42, 0.38, 0.4, 0, 0.97, 0, 5);
  block('TopCap', 0.46, 0.04, 0.44, 0, 1.18, 0, 6);
  const roof = new ConeGeometry(0.3, 0.26, 4, 1);
  roof.rotateY(Math.PI / 4);
  root.add(named(new Mesh(paint(roof, (c, n) => clay(n), 0.03, 7), mat), 'Roof', 0, 1.33, 0));
  const tip = new ConeGeometry(0.075, 0.1, 4, 1);
  tip.rotateY(Math.PI / 4);
  root.add(named(new Mesh(paint(tip, (c, n) => mix(0xc0805c, 0xffd2a8, Math.max(0, n.dot(LIGHT)) + 0.2), 0.03, 8), mat), 'RoofTip', 0, 1.43, 0));

  // the clock: a beige rim, a pale glowing face, twelve ticks, two hands at ten past… nine
  const clock = new Group();
  clock.name = 'Clock';
  clock.position.set(0.03, 0.97, 0.2);
  const rim = new CylinderGeometry(0.145, 0.145, 0.04, 24);
  rim.rotateX(Math.PI / 2);
  clock.add(named(new Mesh(paint(rim, (c, n) => mix(0xa8927e, 0xf2e2cc, Math.max(0, n.dot(LIGHT)) + 0.2), 0.02, 9), facets({ roughness: 0.5 })), 'Rim', 0, 0, 0.01));
  const dial = new CylinderGeometry(0.12, 0.12, 0.02, 24);
  dial.rotateX(Math.PI / 2);
  clock.add(named(new Mesh(dial, new MeshStandardMaterial({ color: 0xd9f6f8, emissive: 0x9fe6ee, emissiveIntensity: 0.45, roughness: 0.3 })), 'Dial', 0, 0, 0.026));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, tick = named(new Mesh(bevelBox(0.008, i % 3 ? 0.014 : 0.024, 0.006, 0.002), dark), `Tick${i}`, Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0.038);
    tick.rotation.z = -a;
    clock.add(tick);
  }
  const hand = (name: string, len: number, a: number) => {
    const h = named(new Mesh(bevelBox(0.012, len, 0.006, 0.003), dark), name, Math.sin(a) * len / 2, Math.cos(a) * len / 2, 0.042);
    h.rotation.z = -a;
    clock.add(h);
  };
  hand('HourHand', 0.06, Math.PI * 1.5);
  hand('MinuteHand', 0.09, 0);
  clock.add(named(new Mesh(new CylinderGeometry(0.012, 0.012, 0.012, 10).rotateX(Math.PI / 2), dark), 'Pin', 0, 0, 0.046));
  root.add(clock);

  const gears = new Group();
  gears.name = 'Gears';
  const big = named(new Mesh(gear(0.11, 8, 0.03), steel), 'GearSide', -0.212, 0.99, 0);
  big.rotation.y = -Math.PI / 2;
  big.add(named(new Mesh(new CylinderGeometry(0.03, 0.03, 0.05, 8).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: 0xd8484a, roughness: 0.4 })), 'Hub', 0, 0, 0.02));
  gears.add(big);
  gears.add(named(new Mesh(gear(0.075, 7, 0.025), steel), 'GearFront', 0.08, 0.5, 0.155));
  root.add(gears);
  // a glowing slot on the middle's front, a pipe looped round its left side
  root.add(named(new Mesh(bevelBox(0.045, 0.12, 0.02, 0.006), dark), 'Slot', -0.07, 0.58, 0.152));
  root.add(named(new Mesh(bevelBox(0.018, 0.09, 0.012, 0.004), glowMat(0x6ff2ff)), 'SlotLight', -0.07, 0.58, 0.162));
  const pipe = new TorusGeometry(0.1, 0.02, 6, 16, Math.PI * 1.25);
  pipe.rotateY(Math.PI / 2);
  pipe.rotateX(-Math.PI * 0.12);
  root.add(named(new Mesh(paint(pipe, (c, n) => mix(0x8a2c3c, 0xf07484, Math.max(0, n.dot(LIGHT)) + 0.2), 0.03, 11), facets({ roughness: 0.4 })), 'Pipe', -0.16, 0.6, 0.02));
  // the foot's two dark arches
  const arch = new Shape();
  arch.moveTo(-0.04, 0); arch.lineTo(0.04, 0); arch.lineTo(0.04, 0.08); arch.absarc(0, 0.08, 0.04, 0, Math.PI, false); arch.closePath();
  const archGeo = new ExtrudeGeometry(arch, { depth: 0.01, bevelEnabled: false });
  root.add(named(new Mesh(archGeo, dark), 'ArchLeft', -0.075, 0.03, 0.168));
  root.add(named(new Mesh(archGeo, dark), 'ArchRight', 0.075, 0.03, 0.168));
  return root;
}

export function idle(root: Group, time: number): void {
  const side = root.getObjectByName('GearSide'), front = root.getObjectByName('GearFront'), minute = root.getObjectByName('MinuteHand');
  if (side) side.rotation.z = time * 0.6;
  if (front) front.rotation.z = -time * 0.85;
  if (minute) { const a = time * 0.5; minute.rotation.z = -a; minute.position.set(Math.sin(a) * 0.045, Math.cos(a) * 0.045, 0.042); }
}
