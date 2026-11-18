// Punto's look (src/style.ts): things held in the hand, each brought to the islands' look one by one beside its
// concept (research/concepts/things/06-in-hand.png). Built only on the base (src/style/base.ts), in the hand's axes
// (knowledge/hand.md): the handle at the origin along Y, +Y out of the top of the fist, −Z forward (a barrel, a tip).
// Real sizes in metres. 'Muzzle' marks where a shot leaves.
import { type BufferGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, Object3D, OctahedronGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import { blob, block, forward, glowMat, hull, lit, merge, mix, PALETTE, ribbon, ring, slab, taperedTube, toy, turned, upright } from './base.js';

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);
/** Two-tone paint: `topColour` on the facets facing up, `c` on the sides, darker underneath. */
const tone = (c: number, topColour = c) => (_c: Vector3, n: Vector3) => (n.y > 0.55 ? topColour : n.y < -0.55 ? mix(c, PALETTE.shade, 0.35) : mix(c, PALETTE.shade, 0.1));

/**
 * A chunky toy pistol `size` metres long (0.2) (research/concepts/things/06-in-hand.png, Pistol): a blue faceted slide with
 * grip serrations and sights, a big dark muzzle, a grey frame, a trigger in its guard, a screwed grip raked back below
 * the hand's origin. 'Muzzle' at the barrel's end.
 */
export function pistol(options: { size?: number; color?: number; frame?: number } = {}): Group {
  const L = options.size ?? 0.2, blue = options.color ?? 0x3f6fd0, grey = options.frame ?? 0x7a8096, g = new Group(), out = named(new Group(), 'Pistol');
  const k = L / 0.2; // the drawing is for a 20 cm pistol
  const v = (x: number) => x * k;
  // the slide: an angular hull along −Z, lighter on top, its front ending in a big dark muzzle
  g.add(toy(hull([[v(-0.172), v(0.028), v(0.024), v(0.02)], [v(-0.16), v(0.032), v(0.028), v(0.022)], [v(0.02), v(0.032), v(0.028), v(0.022)], [v(0.036), v(0.028), v(0.022), v(0.02)]], { shoulder: 0.82 }).translate(0, v(0.035), 0), tone(blue, mix(blue, 0xffffff, 0.22)), { vary: 0.08 }));
  for (let i = 0; i < 4; i++) g.add(toy(block(v(0.066), v(0.03), v(0.004), [0, v(0.04), v(0.0 + i * 0.008)]), tone(mix(blue, PALETTE.shade, 0.25)), {}));
  g.add(toy(ring(v(0.009), v(0.016), v(0.012), 8).rotateX(Math.PI / 2).translate(0, v(0.035), v(-0.176)), lit(grey), {}));
  g.add(toy(new CylinderGeometry(v(0.009), v(0.009), v(0.006), 8).rotateX(Math.PI / 2).translate(0, v(0.035), v(-0.175)), 0x1c1e26, {}));
  g.add(toy(block(v(0.01), v(0.01), v(0.012), [0, v(0.064), v(-0.155)]), lit(grey), {}));
  g.add(toy(block(v(0.03), v(0.01), v(0.01), [0, v(0.064), v(0.026)]), lit(grey), {}));
  // the frame under the slide, the trigger guard and the trigger
  g.add(toy(block(v(0.05), v(0.022), v(0.15), [0, v(0.006), v(-0.06)]), tone(grey, mix(grey, 0xffffff, 0.15)), {}));
  g.add(toy(block(v(0.04), v(0.01), v(0.05), [0, v(-0.032), v(-0.04)]), lit(grey), {}));
  g.add(toy(block(v(0.04), v(0.034), v(0.01), [0, v(-0.015), v(-0.068)]), lit(grey), {}));
  g.add(toy(block(v(0.012), v(0.024), v(0.008), [0, v(-0.012), v(-0.035)]), lit(0x4a4e5a), {}));
  // the grip, raked back, its panels ridged
  const grip = new Group();
  grip.add(toy(block(v(0.046), v(0.11), v(0.05), [0, v(-0.05), 0]), tone(grey, mix(grey, 0xffffff, 0.12)), {}));
  // a panel on each side of the grip, two screws in it
  for (const side of [-1, 1]) {
    grip.add(toy(block(v(0.006), v(0.075), v(0.036), [side * v(0.023), v(-0.052), 0]), tone(mix(grey, 0x8a6a5a, 0.35)), {}));
    for (const y of [-0.028, -0.078]) grip.add(toy(new CylinderGeometry(v(0.005), v(0.005), v(0.004), 6).rotateZ(Math.PI / 2).translate(side * v(0.027), v(y), 0), lit(0xb8bcc8), {}));
  }
  grip.add(toy(block(v(0.05), v(0.012), v(0.056), [0, v(-0.108), 0]), lit(mix(grey, PALETTE.shade, 0.2)), {}));
  grip.rotation.x = -0.28; // its bottom back towards the player (+Z): a positive turn about X throws it forward
  grip.position.set(0, v(0.0), v(0.01));
  g.add(grip);
  out.add(named(merge(g), 'Body'));
  const muzzle = named(new Object3D(), 'Muzzle');
  muzzle.position.set(0, v(0.035), v(-0.18));
  out.add(muzzle);
  return out;
}

/**
 * A retro ray-gun blaster `size` metres long (0.24) (research/concepts/things/06-in-hand.png, Blaster): a bulbous orange faceted
 * body with a purple fin on top, a purple side panel with green glowing vents, a purple barrel through three orange
 * coils growing outwards and a purple ring, an orange ball at its tip, an orange grip with a purple insert.
 * 'Muzzle' at the ball; 'Vents' glow.
 */
export function blaster(options: { size?: number; color?: number; accent?: number } = {}): Group {
  const k = (options.size ?? 0.24) / 0.24, v = (x: number) => x * k, orange = options.color ?? 0xe8783a, purple = options.accent ?? 0x7a4ad0;
  const g = new Group(), out = named(new Group(), 'Blaster');
  // the body: a fat faceted egg along the barrel's line
  g.add(toy(forward(turned([[0, v(-0.075)], [v(0.03), v(-0.07)], [v(0.047), v(-0.035)], [v(0.048), v(0.02)], [v(0.036), v(0.05)], [v(0.02), v(0.064)], [0, v(0.068)]], 8)).translate(0, v(0.04), v(-0.01)), lit(orange, 0.25), { vary: 0.08 }));
  // the fin on top at the back, the side panels with green vents
  g.add(toy(upright(slab([[v(0.0), 0], [v(0.065), 0], [v(0.09), v(0.035)], [v(0.03), v(0.016)]], v(0.012))).translate(0, v(0.075), v(-0.01)), lit(purple, 0.25), {}));
  const vents = new Group();
  for (const side of [-1, 1]) {
    g.add(toy(block(v(0.008), v(0.03), v(0.05), [side * v(0.046), v(0.04), v(0.02)]), lit(purple, 0.2), {}));
    for (const z of [0.006, 0.02, 0.034]) {
      const bar = new Mesh(block(v(0.004), v(0.02), v(0.006), [side * v(0.051), v(0.04), v(z)]), glowMat(0x6aff8a));
      vents.add(bar);
    }
  }
  // the barrel: a purple tube, three orange coils growing outwards, a purple ring, an orange ball
  g.add(toy(forward(new CylinderGeometry(v(0.012), v(0.012), v(0.12), 8)).translate(0, v(0.04), v(-0.14)), lit(purple, 0.2), {}));
  [[0.024, -0.098], [0.029, -0.124], [0.034, -0.15]].forEach(([r, z]) => g.add(toy(ring(v(r) * 0.72, v(r), v(0.008), 10).rotateX(Math.PI / 2).translate(0, v(0.04), v(z)), lit(orange, 0.2), {})));
  g.add(toy(ring(v(0.022), v(0.036), v(0.01), 10).rotateX(Math.PI / 2).translate(0, v(0.04), v(-0.168)), lit(purple, 0.2), {}));
  g.add(toy(blob(v(0.016), 3, 1, 0.05).translate(0, v(0.04), v(-0.21)), lit(0xffb040, 0.15), { emissive: 0x3a1800 }));
  // the grip, raked back, a purple insert; the trigger in its guard
  const grip = new Group();
  grip.add(toy(block(v(0.042), v(0.09), v(0.046), [0, v(-0.04), 0]), lit(orange, 0.25), {}));
  for (const side of [-1, 1]) grip.add(toy(block(v(0.005), v(0.05), v(0.026), [side * v(0.022), v(-0.035), 0]), lit(purple, 0.2), {}));
  grip.rotation.x = -0.3; // its bottom back towards the player (+Z)
  grip.position.set(0, 0, v(0.02));
  g.add(grip);
  g.add(toy(ring(v(0.012), v(0.02), v(0.008), 8).rotateZ(Math.PI / 2).translate(0, v(-0.008), v(-0.03)), lit(orange, 0.25), {}));
  g.add(toy(block(v(0.008), v(0.018), v(0.006), [0, v(-0.006), v(-0.026)]), lit(purple), {}));
  out.add(named(merge(g), 'Body'), named(vents, 'Vents'));
  const muzzle = named(new Object3D(), 'Muzzle');
  muzzle.position.set(0, v(0.04), v(-0.23));
  out.add(muzzle);
  return out;
}

/**
 * A sword `size` metres long (0.75), its grip's middle at the origin and its blade up +Y (research/concepts/things/06-in-hand.png,
 * Sword): a broad faceted steel blade of diamond section with a blue fuller and an angular tip, a pointed steel
 * crossguard with a square blue gem on both faces, a grip wrapped in brown leather, a diamond pommel. 'Blade' for
 * strikeWith.
 */
export function sword(options: { size?: number; steel?: number; gem?: number } = {}): Group {
  const k = (options.size ?? 0.75) / 0.75, v = (x: number) => x * k, steel = options.steel ?? 0xb4c6e4, gem = options.gem ?? 0x3a8ae8;
  const leather = 0x8a4a2c, g = new Group(), out = named(new Group(), 'Sword');
  const steelPaint = (c: Vector3, n: Vector3) => (n.x < -0.3 ? mix(steel, 0x4a6aa8, 0.5) : n.z > 0.3 ? mix(steel, 0xffffff, 0.3) : n.x > 0.3 ? mix(steel, 0x8aa0d0, 0.3) : steel);
  // the blade: a diamond-section hull from the guard up to the tip (hull runs along −Z: turned to run up +Y)
  const blade = hull([[v(-0.66), 0, 0, 0], [v(-0.57), v(0.052), v(0.017), v(0.017)], [v(-0.36), v(0.055), v(0.018), v(0.018)], [v(-0.34), v(0.048), v(0.017), v(0.017)], [0, v(0.056), v(0.019), v(0.019)]], { shoulder: 0.25 });
  blade.rotateX(Math.PI / 2).translate(0, v(0.09), 0);
  const bladeMesh = toy(blade, steelPaint, { vary: 0.07 });
  // the fuller: a blue groove up the middle of each face
  const fuller = new Group();
  for (const side of [-1, 1]) fuller.add(toy(block(v(0.018), v(0.42), v(0.004), [0, v(0.34), side * v(0.016)]), lit(gem, 0.2), {}));
  // the crossguard: pointed steel arms, a blue gem in a square setting on both faces
  const guard = slab([[v(-0.12), 0], [v(-0.07), v(-0.022)], [v(0.07), v(-0.022)], [v(0.12), 0], [v(0.07), v(0.03)], [v(-0.07), v(0.03)]], v(0.04), 0.3);
  g.add(toy(guard.translate(0, v(0.075), 0), steelPaint, {}));
  for (const side of [-1, 1]) {
    g.add(toy(block(v(0.05), v(0.05), v(0.012), [0, v(0.078), side * v(0.022)]), lit(mix(steel, 0x6a8ac0, 0.3)), {}));
    g.add(toy(new OctahedronGeometry(v(0.02)).scale(1, 1, 0.5).translate(0, v(0.078), side * v(0.03)), lit(gem, 0.15), { vary: 0.12 }));
  }
  // the grip: leather wrapped in bands; the pommel: a steel diamond
  g.add(toy(new CylinderGeometry(v(0.018), v(0.02), v(0.13), 6), lit(leather, 0.25), {}));
  for (const y of [-0.045, -0.015, 0.015, 0.045]) g.add(toy(new CylinderGeometry(v(0.022), v(0.022), v(0.01), 6).rotateY(0.3).translate(0, v(y), 0), lit(mix(leather, PALETTE.shade, 0.25)), {}));
  g.add(toy(new OctahedronGeometry(v(0.032)).scale(1, 1.2, 0.7).translate(0, v(-0.09), 0), steelPaint, {}));
  out.add(named(merge(g), 'Hilt'));
  const bladeGroup = named(new Group(), 'Blade');
  bladeGroup.add(merge(new Group().add(bladeMesh, ...fuller.children)));
  out.add(bladeGroup);
  return out;
}

/** A thin rod between two points (a bow string, a fishing line, an antenna): `r` thick, `sides` round. */
function rod(a: Vector3, b: Vector3, r: number, sides = 5) {
  const d = b.clone().sub(a), geo = new CylinderGeometry(r, r, d.length(), sides);
  geo.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()));
  return geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/**
 * A recurve bow `size` metres tall (0.8), held in the left hand: its grip at the origin, its limbs up and down bending
 * back towards the player and flicking forward at the tips (research/concepts/things/06-in-hand.png, Bow and Arrow): faceted
 * wooden limbs, two green leather wraps on the grip, wrapped tips, a light string ('String'), and an arrow on it
 * ('Arrow': a wooden shaft, a steel head, green fletching) pointing along −Z. 'Muzzle' at the arrow's head.
 */
export function bow(options: { size?: number; wood?: number; wrap?: number } = {}): Group {
  const k = (options.size ?? 0.8) / 0.8, v = (x: number) => x * k, wood = options.wood ?? 0x9a5a32, wrap = options.wrap ?? 0x6aa83a;
  const g = new Group(), out = named(new Group(), 'Bow');
  const tipY = v(0.4), tipZ = v(0.13);
  for (const side of [1, -1]) {
    const limb = taperedTube([new Vector3(0, side * v(0.05), 0), new Vector3(0, side * v(0.17), v(0.03)), new Vector3(0, side * v(0.29), v(0.085)), new Vector3(0, side * v(0.37), v(0.14)), new Vector3(0, side * tipY, tipZ)], v(0.03), v(0.016), 5, 8);
    // a flat wide limb, as a bow's is: half again as wide across as it is thick
    g.add(toy(limb.scale(1.45, 1, 0.85), lit(wood, 0.3), { vary: 0.08 }));
    g.add(toy(new CylinderGeometry(v(0.019), v(0.019), v(0.035), 6).translate(0, side * v(0.385), v(0.14)), lit(0xd8c49a, 0.2), {}));
    g.add(toy(new CylinderGeometry(v(0.046), v(0.046), v(0.065), 6).scale(1.1, 1, 0.85).translate(0, side * v(0.08), v(0.003)), lit(wrap, 0.25), { vary: 0.08 }));
  }
  g.add(toy(new CylinderGeometry(v(0.03), v(0.03), v(0.12), 6), lit(mix(wood, PALETTE.shade, 0.15), 0.25), {}));
  out.add(named(merge(g), 'Body'));
  out.add(named(toy(rod(new Vector3(0, tipY, tipZ), new Vector3(0, -tipY, tipZ), v(0.0045)), lit(0xdfe4ea), {}), 'String'));
  // the arrow resting on the bow, its nock on the string
  const arrow = new Group();
  arrow.add(toy(forward(new CylinderGeometry(v(0.012), v(0.012), v(0.5), 5)).translate(0, 0, v(-0.11)), lit(0xa86a3a, 0.25), {}));
  arrow.add(toy(new OctahedronGeometry(v(0.05)).scale(0.28, 0.8, 1.5).translate(0, 0, v(-0.4)), lit(0xc8d0dc, 0.3), {}));
  for (const a of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const feather = upright(slab([[v(0.0), 0], [v(0.12), 0], [v(0.15), v(0.062)], [v(0.05), v(0.045)]], v(0.008), 0.2));
    feather.translate(0, 0, v(0.04));
    feather.rotateZ(a);
    arrow.add(toy(feather, lit(wrap, 0.2), {}));
  }
  out.add(named(merge(arrow), 'Arrow'));
  const muzzle = named(new Object3D(), 'Muzzle');
  muzzle.position.set(0, 0, v(-0.475)); // the arrowhead's point
  out.add(muzzle);
  return out;
}

/**
 * A slingshot `size` metres tall (0.24), its handle at the origin and its fork up +Y (research/concepts/things/06-in-hand.png,
 * Slingshot): a thick faceted wooden Y with red wraps on its tips, dark red bands stretched back towards the player to
 * a pouch ('Pouch', pull it back along +Z) holding a glowing pale stone ('Stone'). 'Muzzle' between the tips.
 */
export function slingshot(options: { size?: number; wood?: number; band?: number } = {}): Group {
  const k = (options.size ?? 0.24) / 0.24, v = (x: number) => x * k, wood = options.wood ?? 0xc8683a, band = options.band ?? 0xa82a2a;
  const g = new Group(), out = named(new Group(), 'Slingshot');
  g.add(toy(taperedTube([new Vector3(0, v(-0.11), 0), new Vector3(0, v(-0.04), v(0.004)), new Vector3(0, v(0.02), 0)], v(0.02), v(0.018), 6, 3), lit(wood, 0.3), { vary: 0.08 }));
  const tips: Vector3[] = [];
  for (const side of [-1, 1]) {
    const tip = new Vector3(side * v(0.06), v(0.115), 0);
    tips.push(tip);
    g.add(toy(taperedTube([new Vector3(0, v(0.01), 0), new Vector3(side * v(0.025), v(0.05), 0), new Vector3(side * v(0.05), v(0.085), 0), tip], v(0.018), v(0.016), 6, 4), lit(wood, 0.3), { vary: 0.08 }));
    g.add(toy(new CylinderGeometry(v(0.02), v(0.02), v(0.022), 6).rotateZ(side * -0.3).translate(side * v(0.055), v(0.1), 0), lit(band, 0.2), {}));
  }
  out.add(named(merge(g), 'Body'));
  // the bands back to the pouch, the pouch, the stone
  const pouchAt = new Vector3(0, v(0.07), v(0.17)), bands = new Group();
  for (const tip of tips) bands.add(toy(ribbon([tip.clone().add(new Vector3(0, v(0.004), v(0.005))), tip.clone().lerp(pouchAt, 0.5), pouchAt], v(0.012), v(0.005), { side: new Vector3(0, 1, 0) }), lit(band, 0.2), {}));
  bands.add(toy(blob(v(0.02), 4, 1, 0.1).scale(1.3, 1, 0.7).translate(pouchAt.x, pouchAt.y, pouchAt.z), lit(mix(band, PALETTE.shade, 0.2), 0.2), {}));
  out.add(named(merge(bands), 'Pouch'));
  out.add(named(toy(blob(v(0.021), 7, 1, 0.08).translate(pouchAt.x, pouchAt.y + v(0.006), pouchAt.z - v(0.012)), lit(0xfff4d8, 0.1), { emissive: 0xb09048 }), 'Stone'));
  const muzzle = named(new Object3D(), 'Muzzle');
  muzzle.position.set(0, v(0.11), 0);
  out.add(muzzle);
  return out;
}

/**
 * A round shield `size` metres across (0.5), held in the left hand: its handle at the origin, its face looking along −Z
 * (research/concepts/things/06-in-hand.png, Shield): a thick twelve-sided stone-tan rim, a domed green faceted face, a gold
 * cross with pointed arms, a stepped gold boss in the middle. 'Face' for strikeWith (a block).
 */
export function shield(options: { size?: number; field?: number; metal?: number } = {}): Group {
  const R = (options.size ?? 0.5) / 2, field = options.field ?? 0x5fae3a, gold = options.metal ?? 0xe8b030, rim = 0xb4a496;
  const g = new Group(), out = named(new Group(), 'Shield'), front = -0.05 * R / 0.25; // the face sits a hand's breadth in front of the grip
  const toFront = (geo: BufferGeometry, z: number) => geo.rotateX(-Math.PI / 2).translate(0, 0, front - z);
  g.add(toy(ring(R * 0.84, R, R * 0.16, 12).rotateX(Math.PI / 2).translate(0, 0, front), lit(rim, 0.25), { vary: 0.07 }));
  g.add(toy(toFront(turned([[0, 0], [R * 0.86, 0], [R * 0.85, R * 0.06], [R * 0.5, R * 0.17], [0, R * 0.2]], 12), 0), (c, n) => lit(field, 0.2)(c, n), { vary: 0.14 }));
  // the gold cross: four pointed arms
  for (let k = 0; k < 4; k++) {
    const arm = slab([[R * 0.18, -R * 0.08], [R * 0.6, -R * 0.07], [R * 0.76, 0], [R * 0.6, R * 0.07], [R * 0.18, R * 0.08]], R * 0.07, 0.3);
    arm.rotateZ((k * Math.PI) / 2);
    arm.translate(0, 0, front - R * 0.15 + (k % 2) * 0.001);
    g.add(toy(arm, lit(gold, 0.25), { vary: 0.08 }));
  }
  // the boss: an octagonal step and a faceted gold dome
  g.add(toy(toFront(turned([[R * 0.32, 0], [R * 0.32, R * 0.12], [R * 0.26, R * 0.16], [0, R * 0.16]], 8), R * 0.12), lit(gold, 0.25), { vary: 0.08 }));
  g.add(toy(toFront(turned([[R * 0.22, 0], [R * 0.18, R * 0.08], [R * 0.1, R * 0.13], [0, R * 0.15]], 8), R * 0.26), lit(gold, 0.3), { vary: 0.12 }));
  // the handle behind the face, where the hand grips
  g.add(toy(block(R * 0.12, R * 0.6, R * 0.1, [0, 0, front + R * 0.12]), lit(0x7a4a2c, 0.25), {}));
  out.add(named(merge(g), 'Face'));
  return out;
}

/**
 * A magic wand `size` metres long (0.36), aimed: its grip at the origin, the shaft running forward along −Z
 * (research/concepts/things/06-in-hand.png, Magic Wand): a six-sided purple faceted shaft with gold collars, a small crystal at
 * its butt, a cluster of three crystals shimmering cyan, blue and violet at its tip ('Tip': make it glow brighter when
 * casting). 'Muzzle' at the big crystal's point.
 */
export function wand(options: { size?: number; shaft?: number; metal?: number } = {}): Group {
  const k = (options.size ?? 0.36) / 0.36, v = (x: number) => x * k, shaft = options.shaft ?? 0x5a3ac8, gold = options.metal ?? 0xe8a838;
  const g = new Group(), out = named(new Group(), 'Wand'), shimmer = [0x3ac0f0, 0x3a62e0, 0x9a42e0, 0x5a8af8];
  const crystalPaint = (c: Vector3, n: Vector3) => shimmer[Math.floor(Math.abs(n.x * 3.1 + n.y * 2.3 + n.z * 1.7) * 2) % shimmer.length];
  g.add(toy(hull([[v(-0.26), v(0.019), v(0.016), v(0.016)], [v(0.07), v(0.024), v(0.021), v(0.021)]], { shoulder: 0.5 }), (c, n) => lit(mix(shaft, 0x8a5af0, Math.max(0, -c.z / v(0.26)) * 0.4), 0.25)(c, n), { vary: 0.1 }));
  for (const z of [-0.255, 0.065]) g.add(toy(forward(turned([[v(0.028), v(-0.014)], [v(0.031), 0], [v(0.028), v(0.014)], [0, v(0.014)], [0, v(-0.014)]], 6)).translate(0, 0, v(z)), lit(gold, 0.25), {}));
  g.add(toy(new OctahedronGeometry(v(0.026)).scale(1, 1, 1.6).translate(0, 0, v(0.105)), crystalPaint, {}));
  out.add(named(merge(g), 'Shaft'));
  // the crystal cluster at the tip
  const tip = new Group();
  tip.add(toy(new OctahedronGeometry(v(0.04)).scale(1, 1, 2.5).translate(0, 0, v(-0.34)), crystalPaint, { emissive: 0x2a1a6a }));
  for (const side of [-1, 1]) {
    const small = new OctahedronGeometry(v(0.025)).scale(1, 1, 2.4);
    small.rotateY(side * 0.5);
    small.translate(side * v(0.036), v(0.012), v(-0.285));
    tip.add(toy(small, crystalPaint, { emissive: 0x2a1a6a }));
  }
  out.add(named(merge(tip, { emissive: 0x2a1a6a }), 'Tip'));
  const muzzle = named(new Object3D(), 'Muzzle');
  muzzle.position.set(0, 0, v(-0.44));
  out.add(muzzle);
  return out;
}

/**
 * A war hammer `size` metres long (0.45), its handle at the origin and its head up +Y (research/concepts/things/06-in-hand.png,
 * Hammer): a big chamfered head of blue-grey stone with warm light on it and octagonal faces, a copper plate on top, a
 * wooden handle tapering up to it, a grey pommel cap. 'Head' for strikeWith.
 */
export function hammer(options: { size?: number; head?: number; wood?: number } = {}): Group {
  const k = (options.size ?? 0.45) / 0.45, v = (x: number) => x * k, wood = options.wood ?? 0x7a4a2c;
  const cool = options.head ?? 0x7484a8, warm = 0xb8a0a0;
  const stonePaint = (c: Vector3, n: Vector3) => (n.y > 0.6 ? mix(warm, 0xffffff, 0.1) : n.x > 0.4 ? warm : n.x < -0.4 ? mix(cool, PALETTE.shade, 0.15) : cool);
  const g = new Group(), head = new Group(), out = named(new Group(), 'Hammer');
  g.add(toy(turned([[v(0.022), v(-0.115)], [v(0.02), v(0.1)], [v(0.017), v(0.27)], [0, v(0.27)]], 6), lit(wood, 0.3), { vary: 0.08 }));
  g.add(toy(turned([[0, v(-0.15)], [v(0.026), v(-0.15)], [v(0.03), v(-0.135)], [v(0.03), v(-0.11)], [v(0.024), v(-0.1)], [0, v(-0.1)]], 8), lit(0x8a8e9a, 0.25), {}));
  out.add(named(merge(g), 'Handle'));
  // the head: an octagonal block laid across the handle, a copper plate on top
  head.add(toy(forward(turned([[0, v(-0.125)], [v(0.068), v(-0.125)], [v(0.08), v(-0.108)], [v(0.08), v(0.108)], [v(0.068), v(0.125)], [0, v(0.125)]], 8)).rotateY(Math.PI / 2).translate(0, v(0.31), 0), stonePaint, { vary: 0.1 }));
  head.add(toy(turned([[v(0.024), 0], [v(0.024), v(0.012)], [0, v(0.014)]], 6).rotateY(0.3).translate(v(0.045), v(0.39), 0), lit(0xc8743a, 0.25), {}));
  out.add(named(merge(head), 'Head'));
  return out;
}

/**
 * A flashlight `size` metres long (0.24), aimed: its grip at the origin, its lens forward along −Z
 * (research/concepts/things/06-in-hand.png, Flashlight): a yellow octagonal body with a dark switch, a black rubber end cap, a
 * flared black head with an orange rim round a glowing warm lens, and a soft beam `reach` metres long ('Beam': show or
 * hide it; 'Lens').
 * 'Muzzle' at the lens.
 */
export function flashlight(options: { size?: number; color?: number; beam?: number; reach?: number } = {}): Group {
  const k = (options.size ?? 0.24) / 0.24, v = (x: number) => x * k, yellow = options.color ?? 0xf2b81f, black = 0x2e3038;
  const g = new Group(), out = named(new Group(), 'Flashlight');
  g.add(toy(forward(turned([[0, v(-0.07)], [v(0.026), v(-0.07)], [v(0.028), v(-0.06)], [v(0.028), v(0.09)], [v(0.032), v(0.1)], [0, v(0.1)]], 8)), lit(yellow, 0.25), { vary: 0.08 }));
  g.add(toy(forward(turned([[0, v(-0.1)], [v(0.026), v(-0.1)], [v(0.031), v(-0.09)], [v(0.031), v(-0.065)], [v(0.026), v(-0.06)], [0, v(-0.06)]], 8)), lit(black, 0.25), {}));
  g.add(toy(forward(turned([[0, v(0.095)], [v(0.031), v(0.095)], [v(0.044), v(0.14)], [v(0.046), v(0.16)], [0, v(0.16)]], 8)), lit(black, 0.25), {}));
  g.add(toy(ring(v(0.036), v(0.048), v(0.01), 8).rotateX(Math.PI / 2).translate(0, 0, v(-0.163)), lit(0xe8823a, 0.2), {}));
  g.add(toy(block(v(0.014), v(0.014), v(0.03), [0, v(0.028), v(-0.03)], 0.25), lit(black, 0.2), {}));
  out.add(named(merge(g), 'Body'));
  const lens = new Mesh(new CylinderGeometry(v(0.036), v(0.036), v(0.006), 8).rotateX(Math.PI / 2), glowMat(0xfff2c0));
  lens.position.z = v(-0.162);
  out.add(named(lens, 'Lens'));
  // the beam: a soft cone of warm light opening forwards
  const reach = options.reach ?? v(0.3);
  const beamGeo = new ConeGeometry(reach * 0.32, reach, 12, 1, true);
  beamGeo.rotateX(Math.PI / 2).translate(0, 0, v(-0.165) - reach / 2);
  const beam = new Mesh(beamGeo, glowMat(options.beam ?? 0xfff0b0, 0.18));
  out.add(named(beam, 'Beam'));
  const muzzle = named(new Object3D(), 'Muzzle');
  muzzle.position.set(0, 0, v(-0.17));
  out.add(muzzle);
  return out;
}

/**
 * A fishing rod `size` metres long (1.0), its grip at the origin and the rod up +Y bending forward
 * (research/concepts/things/06-in-hand.png, Fishing Rod): a red grip, a tapering wooden rod with white line guides, a grey reel
 * with a crank and an orange knob ('Reel', turn it), the line running up through the guides and hanging from the tip
 * ('Line') to a red-and-white bobber ('Bobber') with a hook under it.
 */
export function fishingRod(options: { size?: number; grip?: number; wood?: number } = {}): Group {
  const k = (options.size ?? 1) / 1, v = (x: number) => x * k, red = options.grip ?? 0xc83a32, wood = options.wood ?? 0xa86a3a;
  const g = new Group(), out = named(new Group(), 'Fishing Rod'), white = 0xeef0f4;
  const along = [new Vector3(0, v(0.1), 0), new Vector3(0, v(0.4), v(-0.012)), new Vector3(0, v(0.7), v(-0.05)), new Vector3(0, v(0.96), v(-0.13))];
  g.add(toy(turned([[0, v(-0.13)], [v(0.027), v(-0.13)], [v(0.031), v(-0.11)], [v(0.031), v(0.08)], [v(0.022), v(0.11)], [0, v(0.11)]], 6), lit(red, 0.25), { vary: 0.08 }));
  g.add(toy(taperedTube(along, v(0.023), v(0.01), 6, 10), lit(wood, 0.3), { vary: 0.08 }));
  // the guides: rings on short legs under the rod (+Z, the side that hangs down when it casts forwards)
  const guides = [0.3, 0.52, 0.72, 0.88].map((t) => {
    const i = Math.min(2, Math.floor(t * 3)), p = along[i].clone().lerp(along[i + 1], t * 3 - i), at = p.clone().add(new Vector3(0, 0, v(0.036)));
    g.add(toy(rod(p, at.clone().add(new Vector3(0, 0, -v(0.008))), v(0.003), 4), lit(white, 0.15), {}));
    g.add(toy(ring(v(0.006), v(0.011), v(0.003), 8).translate(at.x, at.y, at.z), lit(white, 0.15), {}));
    return at;
  });
  out.add(named(merge(g), 'Rod'));
  // the reel hangs under the rod just above the grip on a foot: grey cheeks with the white line wound between them,
  // a crank with an orange knob on its right (+X)
  const R = v(0.046), W = v(0.05), seat = new Vector3(0, v(0.15), v(0.016)), hub = new Vector3(0, v(0.15), v(0.016) + v(0.03) + R);
  const reel = new Group();
  reel.add(toy(block(v(0.012), v(0.05), v(0.008), [0, seat.y, seat.z + v(0.004)]), lit(0x8a8e9a, 0.25), {}));
  reel.add(toy(block(v(0.01), v(0.012), v(0.034), [0, seat.y, seat.z + v(0.02)]), lit(0x8a8e9a, 0.25), {}));
  for (const sx of [-1, 1]) reel.add(toy(new CylinderGeometry(R, R, v(0.007), 12).rotateZ(Math.PI / 2).translate(sx * (W / 2), hub.y, hub.z), (c, n) => (Math.abs(n.x) > 0.6 ? 0xb4b8c4 : lit(0x8a8e9a, 0.25)(c, n)), { vary: 0.06 }));
  reel.add(toy(new CylinderGeometry(R * 0.78, R * 0.78, W - v(0.006), 12).rotateZ(Math.PI / 2).translate(0, hub.y, hub.z), lit(0xf2f2ee, 0.15), { vary: 0.05 }));
  reel.add(toy(new CylinderGeometry(v(0.008), v(0.008), v(0.012), 6).rotateZ(Math.PI / 2).translate(W / 2 + v(0.008), hub.y, hub.z), lit(0x8a8e9a, 0.25), {}));
  reel.add(toy(block(v(0.008), v(0.045), v(0.01), [W / 2 + v(0.016), hub.y - v(0.018), hub.z]), lit(0x7a4a2c, 0.25), {}));
  reel.add(toy(new CylinderGeometry(v(0.009), v(0.009), v(0.022), 6).rotateZ(Math.PI / 2).translate(W / 2 + v(0.03), hub.y - v(0.038), hub.z), lit(0xf08a2a, 0.2), {}));
  out.add(named(merge(reel), 'Reel'));
  // the line leaves the wound spool at its front top, runs up through every guide to the tip, and hangs to the bobber
  const tip = along[3], bob = new Vector3(0, v(0.55), v(-0.16)), line = new Group();
  const points = [new Vector3(0, hub.y + R * 0.55, hub.z - R * 0.6), ...guides, tip, bob];
  for (let i = 0; i + 1 < points.length; i++) line.add(toy(rod(points[i], points[i + 1], v(0.0022)), lit(white, 0.1), {}));
  out.add(named(merge(line), 'Line'));
  const bobber = new Group();
  bobber.add(toy(turned([[0, v(-0.042)], [v(0.03), v(-0.028)], [v(0.036), 0], [v(0.03), v(0.028)], [0, v(0.042)]], 8).translate(bob.x, bob.y - v(0.03), bob.z), (c, n) => lit(c.y > bob.y - v(0.03) ? red : white, 0.2)(c, n), { vary: 0.06 }));
  bobber.add(toy(taperedTube([new Vector3(0, -v(0.06), 0), new Vector3(0, -v(0.1), 0), new Vector3(0, -v(0.125), v(0.012)), new Vector3(0, -v(0.115), v(0.03)), new Vector3(0, -v(0.098), v(0.03))].map((p) => p.add(bob)), v(0.004), v(0.003), 5, 6), lit(0x9aa0aa, 0.2), {}));
  out.add(named(merge(bobber), 'Bobber'));
  return out;
}
