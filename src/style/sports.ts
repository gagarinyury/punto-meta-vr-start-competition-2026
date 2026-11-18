// Punto's look (src/style.ts): targets and sports, each brought to the islands' look one by one beside its concept
// (research/concepts/things/07-targets-sports.png). Built only on the base (src/style/base.ts). Real sizes in metres, standing
// on y = 0. Every piece that is hit or knocked over is its own mesh, so physics can go on it (never on the group).
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, type Mesh, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { blob, block, flat, forward, island, lit, merge, mix, PALETTE, ring, slab, taperedTube, toy, turned, upright } from './base.js';

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);

/**
 * An archery target `size` metres across its face (0.6), on a wooden easel, its face looking +Z, its middle at
 * `height` (0.55) (research/concepts/things/07-targets-sports.png, Bullseye Target): a thick fourteen-sided face of stepped
 * rings — white, dark blue, light blue, red and a white bullseye — each standing a little proud of the one round it. 'Face' is
 * the face's own mesh (hit it); score a hit with `bullseyeRing`.
 */
export function bullseyeTarget(options: { size?: number; height?: number; colors?: number[] } = {}): Group {
  const R = (options.size ?? 0.6) / 2, H = options.height ?? 0.55, out = named(new Group(), 'Target'), face = new Group(), stand = new Group();
  const colours = options.colors ?? [0xf2f0ea, 0x2a4ac8, 0x6aa0e8, 0xe0382e, 0xf2f0ea];
  colours.forEach((c, i) => {
    const r = R * (1 - i * 0.2), t = R * (0.16 + i * 0.03);
    face.add(toy(turned([[r, 0], [r, t * 0.8], [r * 0.96, t], [0, t]], 14).rotateX(Math.PI / 2).translate(0, H, -t / 2 + R * 0.08), (cc, n) => (n.z > 0.5 ? c : mix(c, PALETTE.shade, 0.15)), { seed: i, vary: 0.05 }));
  });
  out.add(named(merge(face), 'Face'));
  out.userData.target = { centre: new Vector3(0, H, 0), radius: R, rings: colours.length };
  // the easel: two front legs spread wide, one leg behind
  const wood = 0xb8743e;
  for (const side of [-1, 1]) stand.add(toy(taperedTube([new Vector3(side * R * 0.4, H - R * 0.3, -R * 0.12), new Vector3(side * R * 0.95, 0, R * 0.15)], R * 0.1, R * 0.085, 4, 2), lit(wood, 0.3), {}));
  stand.add(toy(taperedTube([new Vector3(0, H - R * 0.2, -R * 0.15), new Vector3(0, 0, -R * 0.85)], R * 0.09, R * 0.075, 4, 2), lit(wood, 0.3), {}));
  out.add(named(merge(stand), 'Stand'));
  return out;
}

/** Which ring of a bullseyeTarget a hit at `point` (in the room) falls in: 0 the bullseye … rings − 1 the outer, −1 a miss. */
export function targetRing(target: Object3D, point: Vector3): number {
  const t = target.userData.target as { centre: Vector3; radius: number; rings: number };
  const local = target.worldToLocal(point.clone()), d = Math.hypot(local.x - t.centre.x, local.y - t.centre.y);
  return d > t.radius ? -1 : t.rings - 1 - Math.min(t.rings - 1, Math.floor((1 - d / t.radius) * t.rings));
}

/** Which ring of a bullseyeTarget a hit at `point` (in the room) falls in: 0 the bullseye … rings − 1 the outer, −1 a miss. */
export const bullseyeRing = targetRing;

/**
 * A tin can `height` metres tall (0.12), standing on y = 0: a ten-sided body in red and white bands, grey rims and a
 * grey lid. One mesh: put physics on it.
 */
export function can(options: { height?: number; color?: number; stripe?: number; seed?: number } = {}): Mesh {
  const h = options.height ?? 0.12, r = h * 0.3, red = options.color ?? 0xe0382e, white = options.stripe ?? 0xf2f0ea, g = new Group();
  const bands = 5, profile: [number, number][] = [[0, 0], [r * 0.96, 0], [r, h * 0.04]];
  for (let k = 1; k < bands; k++) profile.push([r, h * (0.04 + (0.92 * k) / bands)]);
  profile.push([r, h * 0.96], [r * 0.96, h], [0, h]);
  g.add(toy(turned(profile, 10), (c, n) => {
    if (c.y < h * 0.04 || c.y > h * 0.96 || n.y > 0.8) return 0xb4b8c4;
    return lit(Math.floor(((c.y - h * 0.04) / (h * 0.92)) * bands) % 2 ? white : red, 0.2)(c, n);
  }, { seed: options.seed ?? 1, vary: 0.06 }));
  g.add(toy(turned([[r * 1.04, h * 0.955], [r * 1.04, h * 1.0], [r * 0.9, h * 1.0], [r * 0.9, h * 0.955]], 10), lit(0xc0c4ce, 0.2), {}));
  return named(merge(g), 'Can');
}

/**
 * A pyramid of cans to knock down, on a little floating grass block (research/concepts/things/07-targets-sports.png, Can
 * Pyramid): `rows` rows (4), the bottom row in a ring, two more fallen beside it. Every can is its own mesh
 * (`userData.cans`; physics on each), the ground is 'Ground'.
 */
export function canPyramid(options: { rows?: number; height?: number; seed?: number } = {}): Group {
  const rows = options.rows ?? 4, h = options.height ?? 0.12, d = h * 0.62, out = named(new Group(), 'Can Pyramid'), cans: Mesh[] = [];
  out.add(named(island(d * (rows * 0.62 + 0.5), { seed: options.seed ?? 3, roots: false }), 'Ground'));
  for (let row = 0; row < rows; row++) for (let k = 0; k < rows - row; k++) {
    const c = can({ height: h, seed: row * 10 + k });
    c.position.set((k - (rows - row - 1) / 2) * d * 1.02, row * h * 1.01, 0);
    c.rotation.y = (row * 7 + k * 3) % 5;
    out.add(c);
    cans.push(c);
  }
  // two cans that have already fallen, lying on their sides
  [[d * (rows / 2 + 0.2), h * 0.3, d * 0.6, 0.4], [-d * (rows / 2 - 0.1), h * 0.3, d * 0.7, -0.9]].forEach(([x, y, z, a], k) => {
    const c = can({ height: h, seed: 90 + k });
    c.rotation.set(0, a, Math.PI / 2);
    c.position.set(x + h / 2 * Math.cos(a), y, z);
    out.add(c);
    cans.push(c);
  });
  out.userData.cans = cans;
  return out;
}

const DART_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
/** The dartboard's rings as shares of its radius: bull, outer bull, inner single, treble, outer single, double. */
const DART_RINGS = [0.04, 0.09, 0.56, 0.63, 0.92, 1];

/**
 * A dart `length` metres long (0.15), pointing along −Z with its tip at the origin: a steel point, a brass barrel, a
 * coloured shaft and three coloured flights. One mesh.
 */
export function dart(options: { length?: number; color?: number } = {}): Mesh {
  const L = options.length ?? 0.15, c = options.color ?? 0x3aa848, g = new Group();
  g.add(toy(forward(turned([[0, -L * 0.0], [L * 0.012, L * 0.02], [L * 0.012, L * 0.2], [0, L * 0.2]], 5)).rotateY(Math.PI), lit(0xc8ccd6), {}));
  g.add(toy(forward(turned([[0, 0], [L * 0.04, L * 0.04], [L * 0.045, L * 0.26], [L * 0.03, L * 0.32], [0, L * 0.32]], 8)).rotateY(Math.PI).translate(0, 0, L * 0.2), lit(0xd8a840, 0.2), { vary: 0.08 }));
  g.add(toy(forward(new CylinderGeometry(L * 0.018, L * 0.018, L * 0.36, 5)).translate(0, 0, L * 0.7), lit(c, 0.2), {}));
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const flight = upright(slab([[0, 0], [L * 0.22, 0], [L * 0.3, L * 0.13], [L * 0.1, L * 0.1]], L * 0.01, 0.2));
    flight.translate(0, 0, L * 0.68);
    flight.rotateZ(a);
    g.add(toy(flight, lit(c, 0.2), {}));
  }
  return named(merge(g), 'Dart');
}

/**
 * A dartboard `size` metres across (0.45), its face looking +Z, its middle at `height` (0.4) (research/concepts/things/07-targets-sports.png,
 * Dartboard): a thick dark twenty-sided body, twenty wedges of black and cream, red-and-green treble and double rings,
 * a green outer bull and a red bull, three darts stuck in it ('Darts'). 'Face' is its own mesh; score a hit with
 * `dartScore`.
 */
export function dartboard(options: { size?: number; height?: number; darts?: boolean } = {}): Group {
  const R = (options.size ?? 0.45) / 2, H = options.height ?? 0.4, T = R * 0.18, out = named(new Group(), 'Dartboard');
  const body = turned([[0, -T], [R * 1.12, -T], [R * 1.18, -T * 0.6], [R * 1.18, T * 0.4], [R * 1.12, T * 0.55], [0, T * 0.55]], 20).rotateX(Math.PI / 2);
  // the face: small flat pieces, sector by sector and ring by ring, coloured by where they lie
  const v: number[] = [], z = T * 0.56, n = 20, step = (Math.PI * 2) / n;
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI / 2 - (k + 0.5) * step, a1 = a0 + step;
    for (let i = 1; i < DART_RINGS.length; i++) {
      const r0 = DART_RINGS[i - 1] * R, r1 = DART_RINGS[i] * R, p = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r, z];
      v.push(...p(r0, a0), ...p(r1, a0), ...p(r1, a1), ...p(r0, a0), ...p(r1, a1), ...p(r0, a1));
    }
    v.push(0, 0, z, ...[Math.cos(a0) * DART_RINGS[0] * R, Math.sin(a0) * DART_RINGS[0] * R, z], ...[Math.cos(a1) * DART_RINGS[0] * R, Math.sin(a1) * DART_RINGS[0] * R, z]);
  }
  const face = new BufferGeometry();
  face.setAttribute('position', new Float32BufferAttribute(v, 3));
  face.computeVertexNormals();
  const paint = (c: Vector3) => {
    const r = Math.hypot(c.x, c.y) / R, k = Math.floor(((Math.PI / 2 - Math.atan2(c.y, c.x) + step / 2 + Math.PI * 4) % (Math.PI * 2)) / step), odd = k % 2 === 1;
    if (r < DART_RINGS[0]) return 0xd83a32;
    if (r < DART_RINGS[1]) return 0x3a9a4a;
    if ((r > DART_RINGS[2] && r < DART_RINGS[3]) || r > DART_RINGS[4]) return odd ? 0x3a9a4a : 0xd83a32;
    return odd ? 0xf2e6c8 : 0x2a2a30;
  };
  const g = new Group();
  g.add(toy(body, lit(0x4a3228, 0.25), { vary: 0.07 }));
  g.add(toy(face, paint, { vary: 0.04 }));
  const faceMesh = named(merge(g), 'Face');
  faceMesh.position.y = H;
  out.add(faceMesh);
  out.userData.dartboard = { centre: new Vector3(0, H, 0), radius: R };
  if (options.darts !== false) {
    const darts = new Group();
    [[0.42, 0.45, 0x3aa848, -0.3], [0.55, 0.02, 0x3a6ae0, 0.0], [0.38, -0.45, 0xd83a32, 0.3]].forEach(([r, a, c, tilt]) => {
      const d = dart({ length: R * 0.75, color: c });
      d.rotation.set(tilt * 0.4, 0.5, 0);
      d.position.set(Math.cos(a) * R * r, H + Math.sin(a) * R * r, z + R * 0.02);
      darts.add(d);
    });
    out.add(named(darts, 'Darts'));
  }
  return out;
}

/** The score of a dart stuck at `point` (in the room) in a dartboard: 50 the bull, 25 the outer bull, × 3 / × 2 rings, 0 a miss. */
export function dartScore(board: Object3D, point: Vector3): number {
  const b = board.userData.dartboard as { centre: Vector3; radius: number }, p = board.worldToLocal(point.clone()).sub(b.centre);
  const r = Math.hypot(p.x, p.y) / b.radius, step = (Math.PI * 2) / 20;
  if (r > 1) return 0;
  if (r < DART_RINGS[0]) return 50;
  if (r < DART_RINGS[1]) return 25;
  const k = Math.floor(((Math.PI / 2 - Math.atan2(p.y, p.x) + step / 2 + Math.PI * 4) % (Math.PI * 2)) / step), base = DART_ORDER[k];
  return base * (r > DART_RINGS[2] && r < DART_RINGS[3] ? 3 : r > DART_RINGS[4] ? 2 : 1);
}

/** A thin rod between two points (a net's cord, a chain link, a pole): `r` thick. */
function rod(a: Vector3, b: Vector3, r: number, sides = 5) {
  const d = b.clone().sub(a), geo = new CylinderGeometry(r, r, d.length(), sides);
  geo.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()));
  return geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/**
 * A basketball hoop, its rim `height` metres up (1.6) and reaching towards +Z (research/concepts/things/07-targets-sports.png,
 * Basketball Hoop): a grey-blue post, a backboard in a thick blue frame with a pale panel and an orange square, an
 * orange rim on a bracket ('Rim', its own mesh) and a white diamond net hanging under it ('Net'). `userData.rim` gives
 * the rim's centre and radius, to count a basket.
 */
export function basketballHoop(options: { height?: number; frame?: number } = {}): Group {
  const H = options.height ?? 1.6, blue = options.frame ?? 0x3a62d0, orange = 0xe8742a, out = named(new Group(), 'Basketball Hoop');
  const W = 0.9, B = 0.62, boardZ = -0.05, rimR = 0.21, rimZ = boardZ + 0.33, g = new Group();
  g.add(toy(block(0.09, H + 0.45, 0.09, [0, (H + 0.45) / 2, boardZ - 0.12]), lit(0x6a7aa8, 0.25), {}));
  g.add(toy(block(0.07, 0.07, 0.14, [0, H + 0.2, boardZ - 0.07]), lit(0x6a7aa8, 0.25), {}));
  const frame: [number, number][] = [[-W / 2, 0], [W / 2, 0], [W / 2, B], [-W / 2, B]], hole: [number, number][] = [[-W / 2 + 0.06, 0.06], [W / 2 - 0.06, 0.06], [W / 2 - 0.06, B - 0.06], [-W / 2 + 0.06, B - 0.06]];
  g.add(toy(slab(frame, 0.07, 0.25, [hole]).translate(0, H - 0.12, boardZ), lit(blue, 0.25), { vary: 0.06 }));
  g.add(toy(block(W - 0.1, B - 0.1, 0.03, [0, H - 0.12 + B / 2, boardZ]), (c, n) => (Math.abs(n.z) > 0.5 ? 0xc0d0e8 : 0x9ab0d0), { vary: 0.05 }));
  g.add(toy(slab([[-0.17, 0], [0.17, 0], [0.17, 0.24], [-0.17, 0.24]], 0.012, 0.2, [[[-0.14, 0.03], [0.14, 0.03], [0.14, 0.21], [-0.14, 0.21]]]).translate(0, H + 0.02, boardZ + 0.02), lit(orange, 0.2), {}));
  g.add(toy(block(0.12, 0.05, 0.13, [0, H, boardZ + 0.08]), lit(orange, 0.25), {}));
  out.add(named(merge(g), 'Board'));
  out.add(named(toy(ring(rimR, rimR + 0.025, 0.03, 14).translate(0, H, rimZ), lit(orange, 0.2), { vary: 0.06 }), 'Rim'));
  // the net: cords zigzagging down from the rim, narrowing, in diamonds
  const net = new Group(), n = 12, at = (k: number, y: number, r: number) => new Vector3(Math.cos((k / n) * Math.PI * 2) * r, H - y, rimZ + Math.sin((k / n) * Math.PI * 2) * r);
  const levels: [number, number][] = [[0.0, rimR], [0.12, rimR * 0.82], [0.24, rimR * 0.66], [0.34, rimR * 0.55]];
  for (let k = 0; k < n; k++) for (let i = 0; i + 1 < levels.length; i++) {
    const [y0, r0] = levels[i], [y1, r1] = levels[i + 1], shift = i % 2 ? 0.5 : 0;
    net.add(toy(rod(at(k + shift, y0, r0), at(k + shift + 0.5, y1, r1), 0.005), lit(0xf2f4f8, 0.1), {}));
    net.add(toy(rod(at(k + shift + 1, y0, r0), at(k + shift + 0.5, y1, r1), 0.005), lit(0xf2f4f8, 0.1), {}));
  }
  out.add(named(merge(net), 'Net'));
  out.userData.rim = { centre: new Vector3(0, H, rimZ), radius: rimR };
  return out;
}

/** A bowling pin `height` metres tall (0.38), standing on y = 0: white, faceted, two red stripes round its neck. One mesh. */
export function bowlingPin(options: { height?: number; stripe?: number; seed?: number } = {}): Mesh {
  const k = (options.height ?? 0.38) / 0.38, red = options.stripe ?? 0xd8382e;
  const profile: [number, number][] = [[0, 0], [0.028, 0], [0.042, 0.04], [0.06, 0.13], [0.056, 0.2], [0.034, 0.255], [0.029, 0.268], [0.027, 0.278], [0.025, 0.288], [0.023, 0.298], [0.023, 0.31], [0.029, 0.34], [0.026, 0.368], [0, 0.38]];
  const geo = turned(profile.map(([r, y]) => [r * k * 1.3, y * k] as [number, number]), 10);
  return named(toy(geo, (c, n) => {
    const y = c.y / k;
    return (y > 0.268 && y < 0.278) || (y > 0.288 && y < 0.298) ? red : lit(0xf4f2ee, 0.15)(c, n);
  }, { seed: options.seed ?? 1, vary: 0.05 }), 'Pin');
}

/**
 * Ten bowling pins in a triangle on the end of a wooden lane (research/concepts/things/07-targets-sports.png, Bowling Pins),
 * the head pin nearest +Z: every pin its own mesh (`userData.pins`, physics on each), the lane 'Lane' with its
 * planks running along it.
 */
export function bowlingPins(options: { height?: number } = {}): Group {
  const h = options.height ?? 0.38, gap = h * 0.78, out = named(new Group(), 'Bowling Pins'), pins: Mesh[] = [], lane = new Group();
  const W = gap * 3.7, D = gap * 3.9, T = h * 0.2, planks = 6;
  for (let i = 0; i < planks; i++) lane.add(toy(block(W / planks, T, D, [-W / 2 + (i + 0.5) * (W / planks), -T / 2, 0], 0.06), (c, n) => (n.y > 0.5 ? (i % 2 ? 0xd8a060 : 0xc8884a) : 0x9a6a3a), { seed: i, vary: 0.05 }));
  out.add(named(merge(lane), 'Lane'));
  let k = 0;
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) {
    const pin = bowlingPin({ height: h, seed: k++ });
    pin.position.set((i - row / 2) * gap, 0, gap * 1.3 - row * gap * 0.87);
    out.add(pin);
    pins.push(pin);
  }
  out.userData.pins = pins;
  return out;
}

/** A football `radius` metres (0.11): a white faceted ball with black pentagon patches. One mesh: physics on it. */
export function soccerBall(options: { radius?: number } = {}): Mesh {
  const R = options.radius ?? 0.11, corners = new IcosahedronGeometry(1, 0).getAttribute('position'), dirs: Vector3[] = [];
  for (let i = 0; i < corners.count; i++) {
    const d = new Vector3().fromBufferAttribute(corners, i).normalize();
    if (!dirs.some((e) => e.distanceTo(d) < 0.01)) dirs.push(d);
  }
  const n = new Vector3();
  return named(toy(new IcosahedronGeometry(R, 2), (c) => (dirs.some((d) => n.copy(c).normalize().angleTo(d) < 0.3) ? 0x22242c : 0xf4f4f0), { vary: 0.05 }), 'Ball');
}

/**
 * A football goal `width` metres wide (1.5), its mouth facing +Z (research/concepts/things/07-targets-sports.png, Soccer Goal):
 * a green frame of square posts, a crossbar and a back frame, a white square net on its back, top and sides, a ball
 * in front ('Ball', its own mesh). `userData.mouth` is the box a goal is scored in (centre, size).
 */
export function soccerGoal(options: { width?: number; ball?: boolean } = {}): Group {
  const W = options.width ?? 1.5, H = W * 0.6, D = W * 0.42, t = W * 0.045, green = 0x3aa84a, out = named(new Group(), 'Soccer Goal'), frame = new Group(), net = new Group();
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => frame.add(toy(block(w, h, d, [x, y, z], 0.15), lit(green, 0.25), {}));
  for (const side of [-1, 1]) {
    bar(t, H, t, side * W / 2, H / 2, 0);
    bar(t, t, D, side * W / 2, t / 2, -D / 2);
    bar(t, H * 0.85, t, side * W / 2, H * 0.425, -D);
  }
  bar(W + t, t, t, 0, H, 0);
  bar(W + t, t, t, 0, H * 0.85, -D);
  bar(W + t, t, t, 0, t / 2, -D);
  out.add(named(merge(frame), 'Frame'));
  // the net: thin white cords in squares on the back, the top and both sides
  const cord = W * 0.008, step = W * 0.075, white = lit(0xf2f4f8, 0.1);
  for (let x = -W / 2 + step; x < W / 2; x += step) {
    net.add(toy(block(cord, H * 0.85, cord, [x, H * 0.425, -D]), white, {}));
    net.add(toy(rod(new Vector3(x, H * 0.85, -D), new Vector3(x, H, 0), cord * 0.6, 4), white, {}));
  }
  for (let y = step; y < H * 0.85; y += step) net.add(toy(block(W, cord, cord, [0, y, -D]), white, {}));
  for (let z = -D + step; z < 0; z += step) net.add(toy(block(W, cord, cord, [0, H * 0.85 + (H * 0.15) * (1 + z / D), z]), white, {}));
  for (const side of [-1, 1]) {
    for (let z = -D + step; z < 0; z += step) net.add(toy(block(cord, H * (0.85 + 0.15 * (1 + z / D)), cord, [side * W / 2, H * (0.85 + 0.15 * (1 + z / D)) / 2, z]), white, {}));
    for (let y = step; y < H; y += step) net.add(toy(block(cord, cord, D, [side * W / 2, y, -D / 2]), white, {}));
  }
  out.add(named(merge(net), 'Net'));
  if (options.ball !== false) {
    const ball = soccerBall({ radius: W * 0.075 });
    ball.position.set(W * 0.1, W * 0.075, D * 0.7);
    out.add(ball);
  }
  out.userData.mouth = { centre: new Vector3(0, H / 2, -D / 2), size: new Vector3(W, H, D) };
  return out;
}

/**
 * A table-tennis paddle `size` metres long (0.26), its handle at the origin and its blade up +Y (in the hand's axes:
 * hold it with holdInHand): a round blade with `color` rubber on both faces and a wooden edge, a wooden handle. 'Blade'
 * for strikeWith.
 */
export function paddle(options: { size?: number; color?: number } = {}): Group {
  const k = (options.size ?? 0.26) / 0.26, r = 0.075 * k, red = options.color ?? 0xd83a32, out = named(new Group(), 'Paddle');
  const blade = turned([[0, -0.008 * k], [r, -0.008 * k], [r, 0.008 * k], [0, 0.008 * k]], 14).rotateX(Math.PI / 2).translate(0, 0.17 * k, 0);
  out.add(named(toy(blade, (_c, n) => (Math.abs(n.z) > 0.5 ? red : 0xc8945a), { vary: 0.05 }), 'Blade'));
  out.add(named(toy(block(0.028 * k, 0.11 * k, 0.022 * k, [0, 0.045 * k, 0], 0.3), lit(0xb8783e, 0.25), {}), 'Handle'));
  return out;
}

/** A small ball `radius` metres (0.02, a table-tennis ball): white, faceted. One mesh: physics on it. */
export function smallBall(options: { radius?: number; color?: number } = {}): Mesh {
  return named(toy(new IcosahedronGeometry(options.radius ?? 0.02, 1), lit(options.color ?? 0xf6f6f2, 0.15), { vary: 0.05 }), 'Ball');
}

/**
 * A table-tennis table `length` metres long (2.2) along Z, its top at 0.76 m (research/concepts/things/07-targets-sports.png,
 * Ping-Pong Table): a green top ('Top', bounce balls on it) with white edge lines and a centre line, a white net between
 * dark posts ('Net'), dark square legs with braces, two paddles (red and black) and two balls lying on it.
 */
export function pingPongTable(options: { length?: number; extras?: boolean } = {}): Group {
  const L = options.length ?? 2.2, W = L * 0.56, H = 0.76, T = 0.04, green = 0x2f8a4a, out = named(new Group(), 'Ping-Pong Table');
  const top = new Group(), legs = new Group(), net = new Group(), white = lit(0xf2f4f8, 0.1), dark = lit(0x4a3a34, 0.25);
  top.add(toy(block(W, T, L, [0, H - T / 2, 0], 0.15), (c, n) => (n.y > 0.5 ? green : mix(green, PALETTE.shade, 0.3)), { vary: 0.04 }));
  const line = 0.018;
  for (const side of [-1, 1]) {
    top.add(toy(block(line, 0.004, L - 0.01, [side * (W / 2 - line), H + 0.001, 0]), white, {}));
    top.add(toy(block(W - 0.01, 0.004, line, [0, H + 0.001, side * (L / 2 - line)]), white, {}));
  }
  top.add(toy(block(line * 0.6, 0.004, L - 0.04, [0, H + 0.001, 0]), white, {}));
  out.add(named(merge(top), 'Top'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.add(toy(block(0.06, H - T, 0.06, [sx * (W / 2 - 0.08), (H - T) / 2, sz * (L / 2 - 0.12)]), dark, {}));
  for (const sz of [-1, 1]) legs.add(toy(block(W - 0.16, 0.04, 0.04, [0, H * 0.35, sz * (L / 2 - 0.12)]), dark, {}));
  for (const sx of [-1, 1]) legs.add(toy(block(0.04, 0.04, L - 0.24, [sx * (W / 2 - 0.08), H * 0.35, 0]), dark, {}));
  out.add(named(merge(legs), 'Legs'));
  // the net: posts at both ends, a white mesh between them, a white band along its top
  const nh = 0.15;
  for (const side of [-1, 1]) net.add(toy(block(0.025, nh + 0.02, 0.025, [side * (W / 2 + 0.03), H + nh / 2, 0]), lit(0x2a2c34), {}));
  for (let x = -W / 2; x <= W / 2 + 1e-6; x += 0.04) net.add(toy(block(0.004, nh, 0.004, [x, H + nh / 2, 0]), white, {}));
  for (let y = 0.03; y < nh; y += 0.035) net.add(toy(block(W, 0.004, 0.004, [0, H + y, 0]), white, {}));
  net.add(toy(block(W + 0.04, 0.02, 0.012, [0, H + nh, 0]), white, {}));
  out.add(named(merge(net), 'Net'));
  if (options.extras !== false) {
    [[0xd83a32, -0.1, L * 0.25, 0.6], [0x2a2c34, 0.12, -L * 0.28, -2.4]].forEach(([c, x, z, a]) => {
      const p = paddle({ color: c });
      p.rotation.set(-Math.PI / 2, 0, a);
      p.position.set(x * W * 2, H + 0.012, z);
      out.add(p);
    });
    [[0.15, L * 0.18], [-0.22, -L * 0.15]].forEach(([x, z]) => {
      const b = smallBall();
      b.position.set(x * W * 2, H + 0.02, z);
      out.add(b);
    });
  }
  return out;
}

/**
 * A golf green `size` metres across (0.8) on y = 0 (research/concepts/things/07-targets-sports.png, Golf Flag): a plump uneven
 * patch of bright grass over dark earth ('Green'), a dark hole in it, a white flagstick with a ball on top and a yellow
 * pennant ('Flag': wave it), a few tufts of grass. `userData.hole` gives the hole's centre and radius.
 */
export function golfHole(options: { size?: number; flag?: number; seed?: number } = {}): Group {
  const R = (options.size ?? 0.8) / 2, seed = options.seed ?? 5, out = named(new Group(), 'Golf Hole'), green = new Group();
  const hole = new Vector3(-R * 0.1, 0, R * 0.05), hr = R * 0.15, edge: [number, number][] = [], gap: [number, number][] = [];
  for (let k = 0; k < 13; k++) { const a = (k / 13) * Math.PI * 2; edge.push([Math.cos(a) * R * (1 + Math.sin(a * 3 + seed) * 0.06), Math.sin(a) * R * 0.8 * (1 + Math.cos(a * 2 + seed) * 0.06)]); }
  for (let k = 0; k < 10; k++) { const a = -(k / 10) * Math.PI * 2; gap.push([hole.x + Math.cos(a) * hr, -hole.z + Math.sin(a) * hr]); }
  const T = R * 0.16, E = R * 0.14;
  green.add(toy(flat(slab(edge.map(([x, y]) => [x * 0.96, y * 0.96] as [number, number]), E, 0.15)).translate(0, E / 2, 0), (c, n) => (n.y > 0.5 ? 0x5a8a3a : mix(0x6a4a34, PALETTE.shade, 0.3)), { seed, vary: 0.07 }));
  green.add(toy(flat(slab(edge, T, 0.45, [gap])).translate(0, E + T / 2, 0), lit(0x8acc3c, 0.2), { seed: seed + 1, vary: 0.08 }));
  green.add(toy(new CylinderGeometry(hr * 0.99, hr * 0.99, T * 0.9, 10).translate(hole.x, E + T * 0.45, hole.z), (c, n) => (n.y > 0.5 ? 0x141c14 : 0x2a3a24), {}));
  for (const [x, z] of [[0.45, -0.4], [0.3, 0.45], [-0.45, 0.35]]) for (let k = 0; k < 3; k++) {
    const blade = slab([[-R * 0.02, 0], [R * 0.02, 0], [0, R * (0.1 + k * 0.03)]], R * 0.015, 0.2);
    blade.rotateY(k * 1.2).rotateZ((k - 1) * 0.3).translate(x * R + (k - 1) * R * 0.02, E + T, z * R);
    green.add(toy(blade, lit(0x5ab83a, 0.2), {}));
  }
  out.add(named(merge(green), 'Green'));
  const top = E + T, poleH = R * 1.3, pole = new Vector3(hole.x - hr * 0.35, 0, hole.z - hr * 0.35);
  out.add(named(toy(new CylinderGeometry(R * 0.018, R * 0.018, poleH, 6).translate(pole.x, top + poleH / 2 - T * 0.5, pole.z), lit(0xeeeef2, 0.15), {}), 'Pole'));
  out.add(toy(new IcosahedronGeometry(R * 0.035, 1).translate(pole.x, top + poleH - T * 0.5, pole.z), lit(0xf4f4f6, 0.1), {}));
  const flag = slab([[0, 0], [R * 0.4, -R * 0.08], [R * 0.33, -R * 0.14], [R * 0.42, -R * 0.24], [0, -R * 0.26]], R * 0.02, 0.2);
  flag.translate(pole.x + R * 0.015, top + poleH - T * 0.5 - R * 0.04, pole.z);
  out.add(named(toy(flag, lit(options.flag ?? 0xf2c21f, 0.2), { vary: 0.06 }), 'Flag'));
  out.userData.hole = { centre: new Vector3(hole.x, top, hole.z), radius: hr };
  return out;
}

/**
 * A boxing glove `size` metres long (0.28), its cuff at the origin and the fist up +Y (in the hand's axes): a fat red
 * faceted fist with a thumb, a blue cuff. One mesh, 'Glove'.
 */
export function boxingGlove(options: { size?: number; color?: number; cuff?: number; seed?: number } = {}): Mesh {
  const k = (options.size ?? 0.28) / 0.28, red = options.color ?? 0xd83a32, blue = options.cuff ?? 0x3a58c8, g = new Group(), seed = options.seed ?? 2;
  g.add(toy(blob(0.075 * k, seed, 1, 0.08).scale(1, 1.2, 0.95).translate(0, 0.16 * k, 0.005 * k), lit(red, 0.25), { vary: 0.08 }));
  g.add(toy(blob(0.035 * k, seed + 1, 1, 0.08).scale(1, 1.4, 1).translate(0.06 * k, 0.13 * k, 0.03 * k), lit(red, 0.25), { vary: 0.08 }));
  g.add(toy(turned([[0, 0], [0.055 * k, 0], [0.06 * k, 0.03 * k], [0.058 * k, 0.07 * k], [0, 0.07 * k]], 8), lit(blue, 0.25), { vary: 0.08 }));
  return named(merge(g), 'Glove');
}

/** A short chain of links from `a` down to `b`, each link turned a quarter from the last. */
function chain(a: Vector3, b: Vector3, link: number): Group {
  const g = new Group(), n = Math.max(1, Math.round(a.distanceTo(b) / (link * 0.8))), d = b.clone().sub(a), q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
  for (let i = 0; i < n; i++) {
    const r = ring(link * 0.22, link * 0.4, link * 0.12, 6).scale(1, 1, 1.6).rotateX(Math.PI / 2).rotateY(i % 2 ? Math.PI / 2 : 0);
    r.applyQuaternion(q);
    const p = a.clone().lerp(b, (i + 0.5) / n);
    g.add(toy(r.translate(p.x, p.y, p.z), lit(0xa8acb8, 0.2), {}));
  }
  return g;
}

/**
 * A punching bag `size` metres tall (0.9) hanging from the top of its chain at the origin, everything below it
 * (research/concepts/things/07-targets-sports.png, Punching Bag): an octagonal red bag with thick blue bands and a blue cap, a
 * dark strap on its front, four chains up to one, two red gloves hanging on laces at its sides. 'Bag' is its own mesh:
 * swing it (a pendulum from the origin) when hit.
 */
export function punchingBag(options: { size?: number; color?: number; band?: number } = {}): Group {
  const H = options.size ?? 0.9, R = H * 0.22, red = options.color ?? 0xd83a32, blue = options.band ?? 0x3a58c8, out = named(new Group(), 'Punching Bag');
  const top = -H * 0.45, bag = new Group();
  bag.add(toy(turned([[0, top - H], [R * 0.94, top - H], [R, top - H * 0.96], [R * 1.02, top - H * 0.82], [R, top - H * 0.8], [R, top - H * 0.2], [R * 1.02, top - H * 0.18], [R, top - H * 0.04], [R * 0.94, top], [0, top]], 8), (c, n) => {
    const y = (c.y - (top - H)) / H;
    return n.y > 0.6 ? blue : lit(y < 0.18 || y > 0.82 ? blue : red, 0.25)(c, n);
  }, { vary: 0.07 }));
  bag.add(toy(block(R * 0.18, H * 0.14, R * 0.06, [0, top - H * 0.17, R * 1.0]), lit(0x2a2c34), {}));
  // the chains: four from the cap's edge up to a ring, one from the ring up to the origin
  const hub = new Vector3(0, top + H * 0.22, 0);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; bag.add(chain(new Vector3(Math.cos(a) * R * 0.75, top, Math.sin(a) * R * 0.75), hub, H * 0.06)); }
  bag.add(chain(hub, new Vector3(0, 0, 0), H * 0.06));
  // two gloves hanging on laces from the cap
  for (const side of [-1, 1]) {
    const lace = new Vector3(side * R * 0.9, top - H * 0.02, R * 0.2), at = new Vector3(side * R * 1.45, top - H * 0.32, R * 0.25);
    bag.add(toy(taperedTube([lace, at], H * 0.004, H * 0.004, 4, 1), lit(0xf2f2f2), {}));
    const glove = boxingGlove({ size: H * 0.3, seed: side + 3 });
    glove.rotation.set(Math.PI, side * 0.3, side * 0.15);
    glove.position.copy(at);
    bag.add(glove);
  }
  out.add(named(merge(bag), 'Bag'));
  return out;
}

/**
 * A trophy `size` metres tall (0.35) on y = 0 (research/concepts/things/07-targets-sports.png, Trophy): a faceted gold cup with a
 * thick rim, open at the top, on a slim stem with a knob and a foot, two looping gold handles, on a dark red wooden
 * base with a gold plate in front. One mesh, 'Trophy'.
 */
export function trophy(options: { size?: number; gold?: number; base?: number } = {}): Group {
  const k = (options.size ?? 0.35) / 0.35, v = (x: number) => x * k, gold = options.gold ?? 0xf2b830, wood = options.base ?? 0x6a2a24, g = new Group();
  g.add(toy(block(v(0.2), v(0.08), v(0.16), [0, v(0.04), 0], 0.12), lit(wood, 0.3), { vary: 0.06 }));
  g.add(toy(block(v(0.09), v(0.035), v(0.008), [0, v(0.04), v(0.082)], 0.15), lit(gold, 0.2), {}));
  const profile: [number, number][] = [[0, 0.08], [0.07, 0.08], [0.07, 0.095], [0.045, 0.112], [0.02, 0.13], [0.017, 0.16], [0.034, 0.17], [0.017, 0.182], [0.03, 0.2], [0.07, 0.235], [0.09, 0.29], [0.096, 0.335], [0.104, 0.345], [0.104, 0.355], [0.086, 0.355], [0.08, 0.3], [0.058, 0.25], [0, 0.245]];
  g.add(toy(turned(profile.map(([r, y]) => [v(r), v(y)] as [number, number]), 10), (c, n) => (n.y > 0.6 && c.y < v(0.3) ? mix(gold, 0x8a5a10, 0.35) : lit(gold, 0.25)(c, n)), { vary: 0.1 }));
  for (const side of [-1, 1]) {
    const pts = [[0.088, 0.325], [0.15, 0.315], [0.165, 0.27], [0.135, 0.225], [0.085, 0.22], [0.072, 0.235]].map(([x, y]) => new Vector3(side * v(x), v(y), 0));
    g.add(toy(taperedTube(pts, v(0.013), v(0.011), 6, 10), lit(gold, 0.25), { vary: 0.08 }));
  }
  const out = new Group();
  out.add(named(merge(g), 'Trophy'));
  return out;
}
