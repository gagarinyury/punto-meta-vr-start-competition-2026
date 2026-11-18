// Punto's look (src/style.ts): vehicles as table toys, each brought to the islands' look one by one beside its concept
// (research/concepts/things/08-vehicles.png). Built only on the base (src/style/base.ts). Wheels stand on y = 0, the nose points
// along −Z, `size` is the length in metres. 'Wheel…' parts roll (rollWheels), named moving parts turn.
import { CylinderGeometry, Group, IcosahedronGeometry, type Mesh, Object3D, Vector3 } from '@iwsdk/core';
import { blob, block, flat, forward, hull, lit, merge, mirrored, mix, PALETTE, ribbon, ring, slab, taperedTube, toy, turned, upright, wheel } from './base.js';

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);
/** Two-tone paint: `topColour` on the facets facing up, `c` on the sides, darker underneath. */
const tone = (c: number, topColour = c) => (_c: Vector3, n: Vector3) => (n.y > 0.55 ? topColour : n.y < -0.55 ? mix(c, PALETTE.shade, 0.35) : mix(c, PALETTE.shade, 0.1));
/** Window glass: a light sky blue, lighter where it faces up. */
const GLASS = 0x5a9ee0;

/** Four (or more) wheels: [x, z] spots, radius r, width w, each its own mesh named 'Wheel', standing on y = 0. */
function wheels(out: Group, spots: [number, number][], r: number, w: number, hub = 0xb4b8c4): Mesh[] {
  return spots.map(([x, z]) => {
    const m = wheel(r, w, { hub });
    m.position.set(x, r, z);
    out.add(m);
    return m;
  });
}
/** Turns every 'Wheel' of a vehicle by the distance it rolled (metres): call it as it moves. */
export function rollWheels(vehicle: Object3D, distance: number): void {
  vehicle.traverse((o) => {
    if (o.name !== 'Wheel') return;
    const r = ((o as Mesh).geometry.boundingSphere ?? ((o as Mesh).geometry.computeBoundingSphere(), (o as Mesh).geometry.boundingSphere!)).radius;
    o.rotation.x -= distance / Math.max(1e-4, r * 0.9);
  });
}

/**
 * A toy car `size` metres long (0.4), nose to −Z (research/concepts/things/08-vehicles.png, Car): a chunky red sedan — a
 * chamfered body, a cabin of sky-blue windows with red pillars and roof, yellow headlights, a dark grille, grey bumpers,
 * red tail lights, four dark wheels with grey hubs.
 */
export function car(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.4, red = options.color ?? 0xe0483e, out = named(new Group(), 'Car'), g = new Group();
  const r = 0.095 * L, y0 = r * 1.15, paint = tone(red, mix(red, 0xffffff, 0.1));
  g.add(toy(hull([[-0.5 * L, 0.18 * L, 0.05 * L, 0.06 * L], [-0.46 * L, 0.205 * L, 0.075 * L, 0.06 * L], [0.44 * L, 0.205 * L, 0.075 * L, 0.06 * L], [0.5 * L, 0.18 * L, 0.06 * L, 0.06 * L]], { shoulder: 0.9 }).translate(0, y0, 0), paint, { vary: 0.07 }));
  // the cabin: slanted front and back glass, windows down its sides parted by a red pillar, a red roof
  const cabin = hull([[-0.25 * L, 0.185 * L, 0.004 * L, 0.03 * L], [-0.1 * L, 0.17 * L, 0.15 * L, 0.03 * L], [0.15 * L, 0.17 * L, 0.15 * L, 0.03 * L], [0.27 * L, 0.185 * L, 0.004 * L, 0.03 * L]], { shoulder: 0.86 });
  cabin.translate(0, y0 + 0.1 * L, 0);
  g.add(toy(cabin, (c, n) => {
    if (n.y > 0.75) return mix(red, 0xffffff, 0.1);
    if (Math.abs(c.z - 0.03 * L) < 0.025 * L && Math.abs(n.x) > 0.5) return red;
    return n.y > 0.2 && Math.abs(n.z) > 0.3 ? mix(GLASS, 0xffffff, 0.2) : GLASS;
  }, { vary: 0.05 }));
  // a red pillar between the side windows, on both sides
  for (const side of [-1, 1]) {
    g.add(toy(block(0.014 * L, 0.15 * L, 0.04 * L, [0, 0, 0], 0.2).rotateZ(side * 0.16).translate(side * 0.166 * L, y0 + 0.175 * L, 0.025 * L), lit(red, 0.15), {}));
    g.add(toy(block(0.014 * L, 0.02 * L, 0.42 * L, [side * 0.172 * L, y0 + 0.105 * L, 0.01 * L], 0.2), lit(red, 0.15), {}));
  }
  // the front: a dark grille, yellow lamps, a grey bumper; the back: red lamps, a grey bumper
  g.add(toy(block(0.2 * L, 0.05 * L, 0.02 * L, [0, y0 + 0.01 * L, -0.5 * L], 0.2), lit(0x3a3c44), {}));
  for (const side of [-1, 1]) {
    g.add(toy(block(0.07 * L, 0.035 * L, 0.02 * L, [side * 0.14 * L, y0 + 0.02 * L, -0.5 * L], 0.2), lit(0xffd23a, 0.1), { emissive: 0x3a2a00 }));
    g.add(toy(block(0.06 * L, 0.03 * L, 0.02 * L, [side * 0.15 * L, y0 + 0.03 * L, 0.5 * L], 0.2), lit(0xc8282a, 0.1), {}));
  }
  for (const z of [-0.52, 0.52]) g.add(toy(block(0.42 * L, 0.04 * L, 0.04 * L, [0, y0 - 0.04 * L, z * L], 0.3), lit(0xb4b8c4, 0.2), {}));
  out.add(named(merge(g), 'Body'));
  wheels(out, [[-0.2 * L, -0.3 * L], [0.2 * L, -0.3 * L], [-0.2 * L, 0.3 * L], [0.2 * L, 0.3 * L]], r, 0.07 * L);
  return out;
}

/**
 * A toy pickup truck `size` metres long (0.42), nose to −Z (research/concepts/things/08-vehicles.png, Truck): a blue body lifted
 * on four big dark wheels under grey fender flares, a boxy cab with sky-blue windows and mirrors, a grey grille with
 * white headlamps and orange indicators, an open bed with a grey plank floor.
 */
export function truck(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.42, blue = options.color ?? 0x3a62d0, out = named(new Group(), 'Truck'), g = new Group();
  const r = 0.13 * L, y0 = r * 1.45, paint = tone(blue, mix(blue, 0xffffff, 0.1)), grey = 0x8a8e9a;
  g.add(toy(block(0.44 * L, 0.13 * L, 0.96 * L, [0, y0, 0], 0.18), paint, { vary: 0.06 }));
  // the cab: a box with glass in front and down its sides, a blue roof; two mirrors
  const cy = y0 + 0.065 * L + 0.1 * L;
  g.add(toy(block(0.42 * L, 0.2 * L, 0.3 * L, [0, cy, -0.02 * L], 0.12), paint, { vary: 0.06 }));
  g.add(toy(block(0.36 * L, 0.11 * L, 0.02 * L, [0, cy + 0.02 * L, -0.172 * L], 0.15), lit(GLASS, 0.15), {}));
  for (const side of [-1, 1]) {
    g.add(toy(block(0.02 * L, 0.1 * L, 0.22 * L, [side * 0.212 * L, cy + 0.025 * L, -0.02 * L], 0.15), lit(GLASS, 0.15), {}));
    g.add(toy(block(0.05 * L, 0.04 * L, 0.03 * L, [side * 0.24 * L, cy, -0.16 * L], 0.2), paint, {}));
  }
  // the bed: three low walls round a grey plank floor
  for (const side of [-1, 1]) g.add(toy(block(0.03 * L, 0.08 * L, 0.36 * L, [side * 0.205 * L, y0 + 0.105 * L, 0.29 * L], 0.15), paint, {}));
  g.add(toy(block(0.44 * L, 0.08 * L, 0.03 * L, [0, y0 + 0.105 * L, 0.465 * L], 0.15), paint, {}));
  for (let i = 0; i < 4; i++) g.add(toy(block(0.085 * L, 0.012 * L, 0.33 * L, [(-0.135 + i * 0.09) * L, y0 + 0.068 * L, 0.29 * L], 0.2), lit(grey, 0.2), {}));
  // the front: a grey grille with dark slots, white lamps, orange indicators, a grey bumper
  g.add(toy(block(0.22 * L, 0.08 * L, 0.02 * L, [0, y0 + 0.01 * L, -0.485 * L], 0.15), lit(grey, 0.2), {}));
  for (let i = 0; i < 3; i++) g.add(toy(block(0.17 * L, 0.01 * L, 0.01 * L, [0, y0 + (0.035 - i * 0.022) * L, -0.497 * L]), 0x2a2c34, {}));
  for (const side of [-1, 1]) {
    g.add(toy(block(0.06 * L, 0.045 * L, 0.02 * L, [side * 0.16 * L, y0 + 0.02 * L, -0.485 * L], 0.2), lit(0xf4f4f0, 0.1), { emissive: 0x2a2a2a }));
    g.add(toy(block(0.05 * L, 0.02 * L, 0.02 * L, [side * 0.16 * L, y0 - 0.025 * L, -0.485 * L], 0.2), lit(0xf08a2a, 0.1), {}));
  }
  g.add(toy(block(0.46 * L, 0.04 * L, 0.05 * L, [0, y0 - 0.06 * L, -0.5 * L], 0.3), lit(grey, 0.2), {}));
  // grey fender flares over the wheels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(toy(block(0.07 * L, 0.035 * L, 0.32 * L, [sx * 0.235 * L, y0 + 0.03 * L, sz * 0.28 * L], 0.25), lit(grey, 0.2), {}));
  out.add(named(merge(g), 'Body'));
  wheels(out, [[-0.23 * L, -0.28 * L], [0.23 * L, -0.28 * L], [-0.23 * L, 0.28 * L], [0.23 * L, 0.28 * L]], r, 0.11 * L, 0x9a8a7a);
  return out;
}

/**
 * A toy school bus `size` metres long (0.55), nose to −Z (research/concepts/things/08-vehicles.png, Bus): a long yellow body with
 * a rounded roof and a short hood in front, a grey slatted grille, white lamps, a two-pane windscreen with red lights
 * above it, a row of side windows, two black stripes along its sides, black bumpers, mirrors on arms, four wheels.
 */
export function bus(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.55, yellow = options.color ?? 0xf2b81f, out = named(new Group(), 'Bus'), g = new Group();
  const r = 0.075 * L, y0 = r * 1.2, paint = tone(yellow, mix(yellow, 0xffffff, 0.12)), black = 0x2a2c34, W = 0.36 * L;
  const bodyZ = 0.08 * L, bodyL = 0.8 * L, H = 0.34 * L, front = bodyZ - bodyL / 2;
  g.add(toy(block(W, H, bodyL, [0, y0 + H / 2, bodyZ], 0.22), paint, { vary: 0.06 }));
  g.add(toy(block(W * 0.86, 0.14 * L, 0.16 * L, [0, y0 + 0.07 * L, front - 0.07 * L], 0.18), paint, { vary: 0.06 }));
  // the front: a slatted grille, lamps, a two-pane windscreen, red lights above it, a bumper
  const nose = front - 0.15 * L;
  g.add(toy(block(0.18 * L, 0.1 * L, 0.02 * L, [0, y0 + 0.07 * L, nose], 0.15), lit(0x8a8e9a, 0.2), {}));
  for (let i = 0; i < 4; i++) g.add(toy(block(0.15 * L, 0.008 * L, 0.01 * L, [0, y0 + (0.105 - i * 0.022) * L, nose - 0.01 * L]), black, {}));
  for (const side of [-1, 1]) {
    g.add(toy(block(0.04 * L, 0.035 * L, 0.02 * L, [side * 0.12 * L, y0 + 0.05 * L, nose], 0.2), lit(0xf4f4f0, 0.1), { emissive: 0x2a2a2a }));
    g.add(toy(block(0.14 * L, 0.12 * L, 0.012 * L, [side * 0.082 * L, y0 + 0.22 * L, front - 0.004 * L], 0.15), lit(GLASS, 0.15), {}));
    g.add(toy(block(0.04 * L, 0.025 * L, 0.012 * L, [side * 0.1 * L, y0 + 0.31 * L, front - 0.004 * L], 0.2), lit(0xd8282a, 0.1), {}));
    // the side: a row of windows, two black stripes, a mirror on an arm
    for (let k = 0; k < 5; k++) g.add(toy(block(0.012 * L, 0.1 * L, 0.11 * L, [side * (W / 2 + 0.003 * L), y0 + 0.24 * L, front + (0.14 + k * 0.135) * L], 0.15), lit(GLASS, 0.15), {}));
    for (const y of [0.15, 0.115]) g.add(toy(block(0.01 * L, 0.014 * L, bodyL * 0.86, [side * (W / 2 + 0.003 * L), y0 + y * L, bodyZ + 0.03 * L]), black, {}));
    g.add(toy(block(0.05 * L, 0.01 * L, 0.01 * L, [side * (W / 2 + 0.025 * L), y0 + 0.2 * L, front - 0.01 * L]), black, {}));
    g.add(toy(block(0.015 * L, 0.06 * L, 0.03 * L, [side * (W / 2 + 0.05 * L), y0 + 0.18 * L, front - 0.01 * L], 0.2), black, {}));
  }
  g.add(toy(block(W * 0.95, 0.04 * L, 0.04 * L, [0, y0 - 0.005 * L, nose - 0.02 * L], 0.3), lit(black, 0.2), {}));
  g.add(toy(block(W * 0.95, 0.04 * L, 0.04 * L, [0, y0 - 0.005 * L, bodyZ + bodyL / 2 + 0.01 * L], 0.3), lit(black, 0.2), {}));
  out.add(named(merge(g), 'Body'));
  wheels(out, [[-0.17 * L, front - 0.04 * L], [0.17 * L, front - 0.04 * L], [-0.17 * L, bodyZ + 0.26 * L], [0.17 * L, bodyZ + 0.26 * L]], r, 0.07 * L, 0x9a7a6a);
  return out;
}

/**
 * A spoked wheel of radius `r` and width `w`, its axle along X, standing on nothing (place it): a rim, `spokes` spokes
 * and a hub, all in `color` (a train's, a cart's, a bicycle's). One mesh named 'Wheel' (rollWheels turns it).
 */
export function spokedWheel(r: number, w: number, options: { color?: number; spokes?: number } = {}): Mesh {
  const c = options.color ?? 0xa86a5a, n = options.spokes ?? 8, g = new Group();
  g.add(toy(ring(r * 0.78, r, w, 14).rotateZ(Math.PI / 2), lit(c, 0.25), { vary: 0.06 }));
  for (let k = 0; k < n; k++) g.add(toy(block(w * 0.5, r * 0.85, r * 0.1, [0, r * 0.42, 0]).rotateX((k / n) * Math.PI * 2), lit(c, 0.25), {}));
  g.add(toy(forward(turned([[r * 0.2, -w * 0.6], [r * 0.2, w * 0.6], [0, w * 0.6], [0, -w * 0.6]], 8)).rotateY(Math.PI / 2), lit(mix(c, PALETTE.shade, 0.2), 0.25), {}));
  return named(merge(g), 'Wheel');
}

/**
 * A toy steam locomotive `size` metres long (0.5), nose to −Z (research/concepts/things/08-vehicles.png, Train): a green boiler
 * with dark bands, a dark smokebox door with yellow lamps, a flared smokestack ('Stack', puff smoke from it) and a dome,
 * a green cab with a curved dark roof and blue windows, a dark frame, a slatted cow-catcher, copper spoked wheels
 * growing towards the back joined by a rod.
 */
export function train(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.5, green = options.color ?? 0x5aa83a, out = named(new Group(), 'Train'), g = new Group();
  const dark = 0x4a3a34, darkGreen = mix(green, PALETTE.shade, 0.35), paint = tone(green, mix(green, 0xffffff, 0.1));
  g.add(toy(block(0.26 * L, 0.06 * L, 0.86 * L, [0, 0.15 * L, 0.0], 0.15), lit(dark, 0.25), {}));
  // the boiler, laid along the engine, dark bands round it
  const by = 0.29 * L, br = 0.12 * L;
  g.add(toy(forward(turned([[0, -0.25 * L], [br, -0.25 * L], [br, 0.25 * L], [0, 0.25 * L]], 8)).translate(0, by, -0.17 * L), paint, { vary: 0.06 }));
  for (const z of [-0.36, -0.2, -0.04]) g.add(toy(forward(turned([[br * 1.04, -0.012 * L], [br * 1.04, 0.012 * L], [0, 0.012 * L], [0, -0.012 * L]], 8)).translate(0, by, z * L), lit(dark, 0.2), {}));
  g.add(toy(forward(turned([[0, -0.02 * L], [br * 1.02, -0.02 * L], [br * 0.9, 0.02 * L], [0, 0.02 * L]], 8)).translate(0, by, -0.43 * L), lit(0x2e3038, 0.2), {}));
  for (const side of [-1, 1]) g.add(toy(blob3(0.022 * L).translate(side * 0.1 * L, by - 0.08 * L, -0.44 * L), lit(0xffd23a, 0.1), { emissive: 0x3a2a00 }));
  // the stack and the dome on top
  g.add(toy(turned([[0.04 * L, 0], [0.034 * L, 0.08 * L], [0.055 * L, 0.13 * L], [0.06 * L, 0.15 * L], [0.04 * L, 0.15 * L], [0.03 * L, 0.12 * L]], 8).translate(0, by + br * 0.9, -0.34 * L), lit(0x3a3c44, 0.25), {}));
  g.add(toy(turned([[0.045 * L, 0], [0.045 * L, 0.04 * L], [0.03 * L, 0.07 * L], [0, 0.075 * L]], 8).translate(0, by + br * 0.9, -0.12 * L), lit(0x3a3c44, 0.25), {}));
  // the cab: green, blue windows, a curved dark green roof overhanging it
  g.add(toy(block(0.3 * L, 0.3 * L, 0.26 * L, [0, 0.33 * L, 0.26 * L], 0.1), paint, { vary: 0.06 }));
  g.add(toy(block(0.36 * L, 0.06 * L, 0.32 * L, [0, 0.5 * L, 0.26 * L], 0.45), lit(darkGreen, 0.2), { vary: 0.06 }));
  for (const side of [-1, 1]) {
    g.add(toy(block(0.012 * L, 0.08 * L, 0.08 * L, [side * 0.152 * L, 0.4 * L, 0.21 * L], 0.15), lit(0x4a8ae0, 0.15), {}));
    g.add(toy(block(0.08 * L, 0.07 * L, 0.012 * L, [side * 0.075 * L, 0.42 * L, 0.128 * L], 0.15), lit(0x4a8ae0, 0.15), {}));
  }
  // the cow-catcher: dark slats in a wedge at the front
  for (let i = 0; i < 5; i++) g.add(toy(upright(slab([[0, 0], [0.1 * L, 0], [0.0, 0.1 * L]], 0.02 * L, 0.2)).translate((i - 2) * 0.05 * L, 0.04 * L, -0.43 * L), lit(0x3a3c44, 0.2), {}));
  out.add(named(merge(g), 'Body'));
  const stack = named(new Group(), 'Stack');
  stack.position.set(0, by + br * 0.9 + 0.15 * L, -0.34 * L);
  out.add(stack);
  // the wheels: small in front, growing towards the cab, a rod joining the back two on each side
  const spots: [number, number][] = [[0.065, -0.3], [0.09, -0.08], [0.115, 0.18]];
  for (const side of [-1, 1]) {
    for (const [r, z] of spots) {
      const w = spokedWheel(r * L, 0.04 * L);
      w.position.set(side * 0.15 * L, r * L, z * L);
      out.add(w);
    }
    g.add(toy(block(0.015 * L, 0.02 * L, 0.27 * L, [side * 0.18 * L, 0.09 * L, 0.05 * L], 0.3), lit(0xb4b8c4, 0.2), {}));
  }
  out.getObjectByName('Body')!.removeFromParent();
  out.add(named(merge(g), 'Body'));
  return out;
}
/** A small faceted ball (a lamp, a rivet). */
const blob3 = (r: number) => new IcosahedronGeometry(r, 0);

/** A propeller of `blades` grey blades with yellow tips round a spinner, spinning round Z; `r` its radius. 'Propeller'. */
function propeller(r: number, blades = 3, spinner = 0xd83a32): Mesh {
  const g = new Group();
  g.add(toy(forward(turned([[0, -r * 0.18], [r * 0.16, -r * 0.1], [r * 0.16, r * 0.1], [0, r * 0.1]], 8)), lit(spinner, 0.2), {}));
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2;
    g.add(toy(block(r * 0.14, r * 0.85, r * 0.03, [0, r * 0.52, 0]).rotateZ(a), lit(0x8a8e9a, 0.2), {}));
    g.add(toy(block(r * 0.15, r * 0.14, r * 0.035, [0, r * 0.9, 0]).rotateZ(a), lit(0xf2c21f, 0.15), {}));
  }
  return named(merge(g), 'Propeller');
}

/**
 * A toy airplane `size` metres long (0.5), nose to −Z, standing on its wheels (research/concepts/things/08-vehicles.png,
 * Airplane): a white fuselage with a red nose and belly and blue windows, straight white wings with red tips carrying two
 * red engine nacelles, a white fin with a red band and a tailplane, two wheels on struts; three propellers
 * ('Propeller': spin each round its own Z).
 */
export function airplane(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.5, red = options.color ?? 0xd83a32, white = 0xf2f0ec, out = named(new Group(), 'Airplane'), g = new Group();
  const y0 = 0.16 * L;
  g.add(toy(hull([[-0.5 * L, 0.075 * L, 0.075 * L, 0.075 * L], [-0.42 * L, 0.125 * L, 0.13 * L, 0.115 * L], [-0.15 * L, 0.135 * L, 0.14 * L, 0.115 * L], [0.2 * L, 0.1 * L, 0.105 * L, 0.07 * L], [0.48 * L, 0.035 * L, 0.06 * L, 0.015 * L]], { shoulder: 0.75 }).translate(0, y0, 0), (c, n) => (c.z < -0.36 * L || n.y < -0.35 ? red : lit(white, 0.15)(c, n)), { vary: 0.06 }));
  // the cockpit glass and a row of side windows
  g.add(toy(hull([[-0.34 * L, 0, 0, 0], [-0.28 * L, 0.07 * L, 0.04 * L, 0], [-0.18 * L, 0.075 * L, 0.05 * L, 0], [-0.1 * L, 0.07 * L, 0.02 * L, 0]], { shoulder: 0.7 }).translate(0, y0 + 0.1 * L, 0), (c, n) => (n.y > 0.85 ? white : 0x4ac0e8), {}));
  for (const side of [-1, 1]) for (const z of [-0.06, 0.02, 0.1]) g.add(toy(block(0.01 * L, 0.04 * L, 0.05 * L, [side * 0.124 * L, y0 + 0.05 * L, z * L], 0.2), lit(0x4ac0e8, 0.1), {}));
  // the wings: straight, white with red tips, a red nacelle on each
  const wing: [number, number][] = [[0.07 * L, 0.06 * L], [0.6 * L, 0.06 * L], [0.6 * L, -0.12 * L], [0.07 * L, -0.12 * L]];
  for (const side of [-1, 1]) {
    g.add(toy(flat(slab(side > 0 ? wing : mirrored(wing), 0.035 * L)).translate(0, y0 + 0.04 * L, -0.02 * L), lit(white, 0.15), { vary: 0.05 }));
    g.add(toy(block(0.13 * L, 0.038 * L, 0.185 * L, [side * 0.54 * L, y0 + 0.04 * L, 0.01 * L], 0.2), lit(red, 0.15), {}));
    g.add(toy(forward(turned([[0, -0.1 * L], [0.05 * L, -0.08 * L], [0.055 * L, 0.04 * L], [0.03 * L, 0.1 * L], [0, 0.1 * L]], 8)).translate(side * 0.27 * L, y0 + 0.02 * L, -0.06 * L), (c, n) => (c.z < -0.1 * L ? lit(red, 0.15)(c, n) : lit(white, 0.15)(c, n)), {}));
    // landing gear: a strut and a wheel under each nacelle
    g.add(toy(block(0.015 * L, 0.1 * L, 0.02 * L, [side * 0.2 * L, y0 - 0.06 * L, -0.12 * L]), lit(0x8a8e9a), {}));
  }
  // the tail: a white fin with a red band, a tailplane
  g.add(toy(upright(slab([[0.3 * L, 0], [0.5 * L, 0], [0.5 * L, 0.2 * L], [0.43 * L, 0.2 * L]], 0.03 * L)).translate(0, y0 + 0.03 * L, 0), (c, n) => (c.y > y0 + 0.13 * L && c.y < y0 + 0.19 * L ? red : lit(white, 0.15)(c, n)), {}));
  g.add(toy(upright(slab([[0.385 * L, 0.11 * L], [0.5 * L, 0.11 * L], [0.5 * L, 0.16 * L], [0.415 * L, 0.16 * L]], 0.034 * L, 0.1)).translate(0, y0 + 0.03 * L, 0), lit(red, 0.15), {}));
  const tail: [number, number][] = [[0.0, -0.36 * L], [0.2 * L, -0.42 * L], [0.2 * L, -0.48 * L], [0.0, -0.48 * L]];
  for (const side of [-1, 1]) g.add(toy(flat(slab(side > 0 ? tail : mirrored(tail), 0.025 * L)).translate(0, y0 + 0.04 * L, 0), lit(white, 0.15), {}));
  out.add(named(merge(g), 'Body'));
  wheels(out, [[-0.2 * L, -0.12 * L], [0.2 * L, -0.12 * L]], 0.05 * L, 0.035 * L);
  // the propellers: one in the nose, one on each nacelle
  const nose = propeller(0.2 * L);
  nose.position.set(0, y0, -0.54 * L);
  out.add(nose);
  for (const side of [-1, 1]) {
    const p = propeller(0.1 * L, 3, red);
    p.position.set(side * 0.27 * L, y0 + 0.02 * L, -0.17 * L);
    out.add(p);
  }
  return out;
}

/**
 * A toy helicopter `size` metres long (0.55), nose to −Z, standing on its skids (research/concepts/things/08-vehicles.png,
 * Helicopter): a plump orange body with a big faceted blue canopy and a side window, a tapering tail boom up to an
 * orange fin, grey skids on struts; the main rotor of four broad grey blades ('Rotor': spin round Y) and the tail rotor
 * ('TailRotor': spin round X).
 */
export function helicopter(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.55, orange = options.color ?? 0xf08a2a, out = named(new Group(), 'Helicopter'), g = new Group();
  const y0 = 0.22 * L, grey = 0x9aa0b0, glass = 0x5aa8e0;
  g.add(toy(forward(turned([[0, -0.2 * L], [0.1 * L, -0.18 * L], [0.15 * L, -0.06 * L], [0.15 * L, 0.08 * L], [0.1 * L, 0.18 * L], [0, 0.2 * L]], 9)).scale(0.95, 1, 1).translate(0, y0, 0.02 * L), lit(orange, 0.25), { vary: 0.08 }));
  g.add(toy(blob(0.14 * L, 3, 1, 0.03).scale(0.95, 0.92, 1.05).translate(0, y0 + 0.01 * L, -0.11 * L), (c, n) => (n.y < -0.3 ? orange : n.y > 0.5 && c.x < 0 ? mix(glass, 0xffffff, 0.35) : lit(glass, 0.2)(c, n)), { vary: 0.12 }));
  for (const side of [-1, 1]) g.add(toy(block(0.012 * L, 0.08 * L, 0.09 * L, [side * 0.143 * L, y0 + 0.02 * L, 0.05 * L], 0.2), lit(glass, 0.15), {}));
  // the tail: a boom tapering up to a fin
  g.add(toy(taperedTube([new Vector3(0, y0 + 0.04 * L, 0.15 * L), new Vector3(0, y0 + 0.08 * L, 0.36 * L), new Vector3(0, y0 + 0.11 * L, 0.56 * L)], 0.065 * L, 0.03 * L, 6, 4), lit(orange, 0.25), {}));
  g.add(toy(upright(slab([[0.5 * L, 0], [0.6 * L, 0], [0.62 * L, 0.18 * L], [0.56 * L, 0.18 * L]], 0.03 * L)).translate(0, y0 + 0.07 * L, 0), lit(orange, 0.25), {}));
  // the mast and hub on top
  g.add(toy(turned([[0.03 * L, 0], [0.025 * L, 0.06 * L], [0.04 * L, 0.07 * L], [0, 0.08 * L]], 6).translate(0, y0 + 0.14 * L, 0.0), lit(0x4a5060, 0.2), {}));
  // the skids: two long runners on struts
  for (const side of [-1, 1]) {
    g.add(toy(block(0.03 * L, 0.025 * L, 0.5 * L, [side * 0.14 * L, 0.0125 * L, 0.0], 0.45), lit(grey, 0.2), {}));
    g.add(toy(block(0.03 * L, 0.025 * L, 0.07 * L, [0, 0, 0], 0.45).rotateX(0.6).translate(side * 0.14 * L, 0.03 * L, -0.27 * L), lit(grey, 0.2), {}));
    for (const z of [-0.12, 0.1]) g.add(toy(block(0.02 * L, 0.1 * L, 0.02 * L, [0, 0, 0]).rotateZ(side * -0.35).translate(side * 0.12 * L, 0.06 * L, z * L), lit(grey, 0.2), {}));
  }
  out.add(named(merge(g), 'Body'));
  const rotor = new Group();
  for (let k = 0; k < 4; k++) rotor.add(toy(block(0.07 * L, 0.012 * L, 0.48 * L, [0, 0, 0.26 * L], 0.3).rotateY((k * Math.PI) / 2 + 0.4), lit(grey, 0.2), {}));
  rotor.add(toy(new IcosahedronGeometry(0.035 * L, 0), lit(0x4a5060), {}));
  const main = named(merge(rotor), 'Rotor');
  main.position.set(0, y0 + 0.22 * L, 0);
  out.add(main);
  const tail = new Group();
  for (let k = 0; k < 2; k++) tail.add(toy(block(0.012 * L, 0.16 * L, 0.03 * L).rotateX((k * Math.PI) / 2), lit(grey, 0.2), {}));
  const tr = named(merge(tail), 'TailRotor');
  tr.position.set(0.03 * L, y0 + 0.17 * L, 0.6 * L);
  out.add(tr);
  return out;
}

/**
 * A toy motor boat `size` metres long (0.5), its bow to −Z, its waterline at y = 0 (research/concepts/things/08-vehicles.png,
 * Boat): a blue hull with a pointed bow, a white gunwale round a sandy deck, a cream cabin with teal windows under an
 * overhanging blue roof, an antenna, a dark outboard motor on the stern ('Motor': tilt or wobble it).
 */
export function boat(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.5, blue = options.color ?? 0x2f5ec8, out = named(new Group(), 'Boat'), g = new Group();
  const top = 0.15 * L, outline: [number, number][] = [[0, 0.5 * L], [-0.15 * L, 0.25 * L], [-0.19 * L, 0], [-0.18 * L, -0.42 * L], [0.18 * L, -0.42 * L], [0.19 * L, 0], [0.15 * L, 0.25 * L]];
  g.add(toy(hull([[-0.5 * L, 0, 0.0, 0.0], [-0.36 * L, 0.13 * L, 0.0, 0.1 * L], [0.0, 0.185 * L, 0.0, 0.14 * L], [0.42 * L, 0.175 * L, 0.0, 0.12 * L]], { shoulder: 0.85 }).translate(0, top, 0), tone(blue, blue), { vary: 0.06 }));
  const inner = outline.map(([x, y]) => [x * 0.84, y * 0.86 - 0.02 * L] as [number, number]);
  g.add(toy(flat(slab(outline.map(([x, y]) => [x * 1.02, y * 1.01] as [number, number]), 0.035 * L, 0.25, [inner])).translate(0, top + 0.012 * L, 0), lit(0xf2f0ea, 0.15), { vary: 0.05 }));
  g.add(toy(flat(slab(inner, 0.02 * L, 0.1)).translate(0, top + 0.002 * L, 0), lit(0xdcb88a, 0.15), { vary: 0.06 }));
  // the cabin: cream walls, teal glass in front and down the sides, an overhanging blue roof, an antenna
  const cz = 0.02 * L, cy = top + 0.08 * L;
  g.add(toy(block(0.24 * L, 0.15 * L, 0.2 * L, [0, cy, cz], 0.12), lit(0xf0e6d6, 0.15), { vary: 0.05 }));
  g.add(toy(block(0.19 * L, 0.07 * L, 0.012 * L, [0, cy + 0.025 * L, cz - 0.102 * L], 0.15), lit(0x4ab8c8, 0.1), {}));
  for (const side of [-1, 1]) g.add(toy(block(0.012 * L, 0.06 * L, 0.12 * L, [side * 0.122 * L, cy + 0.025 * L, cz], 0.15), lit(0x4ab8c8, 0.1), {}));
  g.add(toy(block(0.3 * L, 0.03 * L, 0.27 * L, [0, cy + 0.09 * L, cz + 0.01 * L], 0.25), tone(blue, mix(blue, 0xffffff, 0.15)), {}));
  g.add(toy(new IcosahedronGeometry(1, 0).scale(0.006 * L, 0.11 * L, 0.006 * L).rotateX(0.35).translate(0.04 * L, cy + 0.19 * L, cz + 0.04 * L), lit(0x9aa0aa), {}));
  out.add(named(merge(g), 'Hull'));
  const motor = new Group();
  motor.add(toy(block(0.08 * L, 0.1 * L, 0.09 * L, [0, top + 0.08 * L, 0], 0.25), lit(0x4a5878, 0.25), {}));
  motor.add(toy(block(0.025 * L, 0.14 * L, 0.03 * L, [0, top - 0.03 * L, 0.01 * L], 0.2), lit(0x3a4258, 0.2), {}));
  const m = named(merge(motor), 'Motor');
  m.position.z = 0.44 * L;
  out.add(m);
  return out;
}

/**
 * A toy submarine `size` metres long (0.5), bow to −Z, floating centred (research/concepts/things/08-vehicles.png, Submarine): a
 * yellow faceted capsule, an angular conning tower with a bent periscope ('Periscope') and a pipe, three portholes on
 * each side with copper rims and teal glass, cross fins at the tail and a propeller ('Screw': spin round Z).
 */
export function submarine(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.5, yellow = options.color ?? 0xf2b81f, out = named(new Group(), 'Submarine'), g = new Group();
  const R = 0.16 * L, copper = 0xa8705a, teal = 0x6ad0d8, paint = lit(yellow, 0.25);
  g.add(toy(forward(turned([[0, -0.5 * L], [R * 0.55, -0.47 * L], [R * 0.9, -0.38 * L], [R, -0.2 * L], [R, 0.12 * L], [R * 0.75, 0.3 * L], [R * 0.4, 0.42 * L], [0, 0.45 * L]], 10)), paint, { vary: 0.08 }));
  g.add(toy(hull([[-0.16 * L, 0.05 * L, 0.0, 0.0], [-0.1 * L, 0.075 * L, 0.11 * L, 0.0], [0.06 * L, 0.075 * L, 0.11 * L, 0.0], [0.12 * L, 0.05 * L, 0.02 * L, 0.0]], { shoulder: 0.8 }).translate(0, R * 0.85, 0), paint, { vary: 0.08 }));
  g.add(toy(new CylinderGeometry(0.01 * L, 0.012 * L, 0.06 * L, 6).translate(0.03 * L, R * 0.85 + 0.11 * L + 0.03 * L, 0.03 * L), lit(0x9a8a9a), {}));
  // portholes down each side
  for (const side of [-1, 1]) for (const z of [-0.12, 0.0, 0.12]) {
    g.add(toy(ring(0.026 * L, 0.04 * L, 0.02 * L, 10).rotateZ(Math.PI / 2).translate(side * R * 0.96, -0.01 * L, z * L), lit(copper, 0.2), {}));
    g.add(toy(new CylinderGeometry(0.027 * L, 0.027 * L, 0.012 * L, 10).rotateZ(Math.PI / 2).translate(side * R * 0.95, -0.01 * L, z * L), lit(teal, 0.1), {}));
  }
  // cross fins at the tail
  const fin: [number, number][] = [[0.28 * L, 0], [0.45 * L, 0], [0.47 * L, 0.11 * L], [0.38 * L, 0.11 * L]];
  for (const up of [1, -1]) g.add(toy(upright(slab(fin, 0.025 * L)).scale(1, up, 1).translate(0, up * R * 0.4, 0), paint, {}));
  for (const side of [-1, 1]) g.add(toy(upright(slab(fin, 0.025 * L)).rotateZ(side * Math.PI / 2).translate(side * R * 0.4, 0, 0), paint, {}));
  out.add(named(merge(g), 'Hull'));
  const peri = new Group();
  peri.add(toy(taperedTube([new Vector3(0, 0, 0), new Vector3(0, 0.08 * L, 0), new Vector3(0, 0.1 * L, -0.02 * L), new Vector3(0, 0.1 * L, -0.05 * L)], 0.016 * L, 0.016 * L, 6, 6), lit(0x9a8a9a, 0.2), {}));
  peri.add(toy(new CylinderGeometry(0.018 * L, 0.018 * L, 0.01 * L, 8).rotateX(Math.PI / 2).translate(0, 0.1 * L, -0.055 * L), lit(0x4a9ae0, 0.1), {}));
  const p = named(merge(peri), 'Periscope');
  p.position.set(-0.02 * L, R * 0.85 + 0.1 * L, -0.06 * L);
  out.add(p);
  const screw = propeller(0.1 * L, 3, 0x9a8a9a);
  screw.position.z = 0.48 * L;
  screw.rotation.y = Math.PI;
  out.add(named(screw, 'Screw'));
  return out;
}

/** Camouflage in big patches of `colours` (light, dark, olive), each facet one of them by where it lies. */
const camo = (colours: number[], scale: number) => (c: Vector3, n: Vector3) => {
  const k = (Math.sin(c.x * scale * 1.3 + 0.7) + Math.sin(c.z * scale - 1.1) + Math.sin((c.x + c.z) * scale * 0.7 + c.y * scale * 2) + 3) / 6;
  return tone(colours[k < 0.42 ? 0 : k < 0.62 ? 1 : 2])(c, n);
};
/** A hull's cross-sections repeated along its middle, so its long sides are cut into many facets (for camouflage). */
const sliced = (front: [number, number, number, number], back: [number, number, number, number], n: number): [number, number, number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [front[0] + ((back[0] - front[0]) * i) / n, front[1], front[2], front[3]] as [number, number, number, number]);

/**
 * A toy tank `size` metres long (0.5), its gun to −Z (research/concepts/things/08-vehicles.png, Tank): a wide angular hull and
 * an angular turret in green camouflage, a hatch, a long gun with a muzzle brake ('Barrel', 'Muzzle'), a vent grille on
 * the back deck, dark tracks with copper road wheels on each side. 'Turret' turns round Y.
 */
export function tank(options: { size?: number; colors?: number[] } = {}): Group {
  const L = options.size ?? 0.5, colours = options.colors ?? [0x8ab83a, 0x4f7a2e, 0xb8b850], skin = camo(colours, 28 / L), out = named(new Group(), 'Tank'), g = new Group();
  const y0 = 0.17 * L;
  // the tracks: dark belts with copper road wheels
  for (const side of [-1, 1]) {
    g.add(toy(block(0.11 * L, 0.13 * L, 0.88 * L, [side * 0.2 * L, 0.07 * L, 0], 0.45), lit(0x5a4234, 0.25), { vary: 0.08 }));
    for (let k = 0; k < 5; k++) g.add(toy(new CylinderGeometry(0.045 * L, 0.045 * L, 0.02 * L, 8).rotateZ(Math.PI / 2).translate(side * 0.258 * L, 0.06 * L, (-0.3 + k * 0.15) * L), (c, n) => (Math.abs(n.x) > 0.6 ? 0x9a6a54 : 0x6a4434), {}));
  }
  // the hull: wide and angular, cut in many facets along its sides for the camouflage
  g.add(toy(hull([[-0.48 * L, 0.2 * L, 0.02 * L, 0.02 * L], ...sliced([-0.36 * L, 0.25 * L, 0.07 * L, 0.04 * L], [0.38 * L, 0.25 * L, 0.07 * L, 0.04 * L], 7), [0.46 * L, 0.22 * L, 0.05 * L, 0.03 * L]], { shoulder: 0.9 }).translate(0, y0, 0), skin, { vary: 0.05 }));
  for (const side of [-1, 1]) g.add(toy(block(0.07 * L, 0.035 * L, 0.12 * L, [side * 0.17 * L, y0 + 0.08 * L, 0.18 * L], 0.2), skin, {}));
  g.add(toy(block(0.14 * L, 0.015 * L, 0.1 * L, [0, y0 + 0.075 * L, 0.36 * L], 0.15), lit(0x3a4a2e), {}));
  for (let k = 0; k < 4; k++) g.add(toy(block(0.12 * L, 0.006 * L, 0.012 * L, [0, y0 + 0.084 * L, (0.325 + k * 0.022) * L]), lit(0x8a9a6a), {}));
  out.add(named(merge(g), 'Hull'));
  // the turret: angular, a hatch on top, the gun out of its front
  const t = new Group(), ty = y0 + 0.085 * L;
  t.add(toy(hull([[-0.22 * L, 0.12 * L, 0.04 * L, 0.01 * L], ...sliced([-0.14 * L, 0.16 * L, 0.13 * L, 0.01 * L], [0.14 * L, 0.16 * L, 0.13 * L, 0.01 * L], 4), [0.2 * L, 0.13 * L, 0.06 * L, 0.01 * L]], { shoulder: 0.78 }), skin, { vary: 0.05 }));
  t.add(toy(turned([[0.06 * L, 0], [0.06 * L, 0.025 * L], [0.04 * L, 0.04 * L], [0, 0.04 * L]], 8).translate(0.02 * L, 0.12 * L, 0.03 * L), skin, {}));
  const barrel = new Group();
  barrel.add(toy(forward(new CylinderGeometry(0.022 * L, 0.026 * L, 0.36 * L, 8)).translate(0, 0, -0.18 * L), skin, {}));
  barrel.add(toy(forward(new CylinderGeometry(0.034 * L, 0.034 * L, 0.06 * L, 8)).translate(0, 0, -0.37 * L), lit(colours[1], 0.25), {}));
  const b = named(merge(barrel), 'Barrel');
  b.position.set(0, 0.06 * L, -0.18 * L);
  const muzzle = named(new Object3D(), 'Muzzle');
  muzzle.position.set(0, 0, -0.41 * L);
  b.add(muzzle);
  const turret = named(new Group(), 'Turret');
  turret.add(named(merge(t), 'TurretBody'), b);
  turret.position.y = ty;
  out.add(turret);
  return out;
}

/**
 * A toy cruiser motorcycle `size` metres long (0.42), its front wheel to −Z (research/concepts/things/08-vehicles.png,
 * Motorcycle): two dark wheels under red fenders, a red tank, a stepped black seat, a grey V engine, chrome exhaust
 * pipes, a raked fork up to swept handlebars ('Handlebar': steer it) and a round headlamp.
 */
export function motorcycle(options: { size?: number; color?: number } = {}): Group {
  const L = options.size ?? 0.42, red = options.color ?? 0xd8382e, out = named(new Group(), 'Motorcycle'), g = new Group();
  const r = 0.1 * L, front = -0.33 * L, back = 0.31 * L, chrome = 0xc0c4ce, dark = 0x2e3038;
  // the fenders: red bands arching over each wheel
  const arc = (z: number, rr: number, a0: number, a1: number) => Array.from({ length: 7 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / 6; return new Vector3(0, r + Math.sin(a) * rr, z - Math.cos(a) * rr); });
  g.add(toy(ribbon(arc(front, r * 1.2, 0.4, 2.4), 0.085 * L, 0.018 * L), lit(red, 0.2), {}));
  g.add(toy(ribbon(arc(back, r * 1.22, 0.2, 2.8), 0.1 * L, 0.02 * L), lit(red, 0.2), {}));
  // the frame, the engine, the tank and the seat
  g.add(toy(taperedTube([new Vector3(0, 0.36 * L, -0.24 * L), new Vector3(0, 0.2 * L, -0.12 * L), new Vector3(0, 0.15 * L, 0.06 * L), new Vector3(0, r, back)], 0.014 * L, 0.012 * L, 5, 6), lit(dark), {}));
  for (const [a, x] of [[-0.45, -0.02], [0.45, 0.02]]) g.add(toy(block(0.06 * L, 0.1 * L, 0.06 * L, [0, 0, 0], 0.25).rotateX(a).translate(x * L, 0.2 * L, (-0.05 + a * 0.06) * L), lit(0x8a8e9a, 0.25), {}));
  g.add(toy(block(0.08 * L, 0.05 * L, 0.14 * L, [0, 0.15 * L, -0.03 * L], 0.25), lit(0x6a6e7a, 0.25), {}));
  g.add(toy(hull([[-0.21 * L, 0.04 * L, 0.03 * L, 0.03 * L], [-0.16 * L, 0.07 * L, 0.06 * L, 0.045 * L], [0.02 * L, 0.065 * L, 0.06 * L, 0.045 * L], [0.07 * L, 0.045 * L, 0.035 * L, 0.03 * L]], { shoulder: 0.8 }).translate(0, 0.31 * L, 0), tone(red, mix(red, 0xffffff, 0.12)), {}));
  g.add(toy(block(0.11 * L, 0.045 * L, 0.13 * L, [0, 0.31 * L, 0.12 * L], 0.3), lit(dark, 0.2), {}));
  g.add(toy(block(0.1 * L, 0.08 * L, 0.12 * L, [0, 0.24 * L, 0.12 * L], 0.25), lit(red, 0.2), {}));
  g.add(toy(block(0.1 * L, 0.06 * L, 0.09 * L, [0, 0.35 * L, 0.21 * L], 0.3), lit(dark, 0.2), {}));
  // the exhaust: two chrome pipes back along the right side, a silencer
  for (const y of [0.13, 0.17]) g.add(toy(taperedTube([new Vector3(0.04 * L, 0.2 * L, -0.06 * L), new Vector3(0.07 * L, y * L, 0.05 * L), new Vector3(0.07 * L, y * L, 0.25 * L)], 0.015 * L, 0.015 * L, 6, 6), lit(chrome, 0.2), {}));
  g.add(toy(forward(turned([[0, -0.07 * L], [0.022 * L, -0.06 * L], [0.022 * L, 0.06 * L], [0.016 * L, 0.07 * L], [0, 0.07 * L]], 6)).translate(0.07 * L, 0.15 * L, 0.3 * L), lit(chrome, 0.2), {}));
  // the fork: two chrome legs raked back from the front axle
  for (const x of [-0.03, 0.03]) g.add(toy(taperedTube([new Vector3(x * L, r, front), new Vector3(x * L, 0.4 * L, -0.24 * L)], 0.012 * L, 0.012 * L, 5, 2), lit(chrome, 0.2), {}));
  out.add(named(merge(g), 'Body'));
  // the handlebar and the lamp turn with the fork
  const bar = new Group();
  bar.add(toy(taperedTube([new Vector3(-0.13 * L, 0.035 * L, 0.05 * L), new Vector3(-0.07 * L, 0.0, 0.0), new Vector3(0.07 * L, 0.0, 0.0), new Vector3(0.13 * L, 0.035 * L, 0.05 * L)], 0.009 * L, 0.009 * L, 5, 8), lit(chrome, 0.2), {}));
  for (const side of [-1, 1]) bar.add(toy(new CylinderGeometry(0.013 * L, 0.013 * L, 0.04 * L, 6).rotateZ(Math.PI / 2).translate(side * 0.14 * L, 0.04 * L, 0.055 * L), lit(dark), {}));
  bar.add(toy(forward(turned([[0, -0.03 * L], [0.04 * L, -0.025 * L], [0.045 * L, 0.02 * L], [0, 0.02 * L]], 8)).translate(0, -0.04 * L, -0.04 * L), (c, n) => (n.z < -0.6 ? 0xf4f2e0 : lit(chrome, 0.2)(c, n)), {}));
  const handlebar = named(merge(bar), 'Handlebar');
  handlebar.position.set(0, 0.42 * L, -0.24 * L);
  out.add(handlebar);
  wheels(out, [[0, front], [0, back]], r, 0.06 * L, 0x9aa0aa);
  return out;
}
