// Punto's look (src/style.ts): things on a haft — a handle and a head — built from shared parts, each brought to the
// islands' look one by one beside its concept (research/concepts/things/11-hafted.png). In the hand's axes (knowledge/hand.md):
// the grip at the origin, the haft along +Y, the head at the top; a blade's edge or a point faces forward (−Z), its
// flat sides look along X. Each comes in a theme (HAFT_THEMES): the same axe as a toy, in iron, in gold or in crystal.
// 'Handle' is the haft (grab it), 'Head' what strikes (strikeWith), an 'Edge' or 'Tip' Object3D marks the hit point.
import { type BufferGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Object3D, OctahedronGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import { blob, block, evenFaces, fire, jitter, lit, merge, mix, PALETTE, ring, slab, taperedTube, toy, turned, upright } from './base.js';

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);
type Paint = (c: Vector3, n: Vector3) => number;

/** A haft's colours: the haft, the head's main part, its edge or point, an accent (bindings, bands, gems). */
export type HaftColours = { haft: number; metal: number; edge: number; accent: number };
/**
 * The themes a hafted thing comes in: 'classic' as drawn (each thing its own colours), 'toy' bright plastic, 'iron'
 * dark wood and grey iron, 'gold' a royal purple haft with gold, 'crystal' a violet haft with a glowing crystal head.
 */
export const HAFT_THEMES = {
  toy: { haft: 0xffb21a, metal: 0x3a8cf0, edge: 0x9ad8ff, accent: 0xe94b3c },
  iron: { haft: 0x5a3a26, metal: 0x737a8c, edge: 0xc8d0dc, accent: 0x7a4a2c },
  gold: { haft: 0x5a2a7a, metal: 0xf2b53a, edge: 0xffe08a, accent: 0x3ac0d0 },
  crystal: { haft: 0x4a3ab0, metal: 0x6ad8f0, edge: 0xd0a8ff, accent: 0xf2b53a },
} satisfies Record<string, HaftColours>;
export type HaftTheme = 'classic' | keyof typeof HAFT_THEMES;
const colours = (theme: HaftTheme | undefined, classic: HaftColours): HaftColours => (!theme || theme === 'classic' ? classic : HAFT_THEMES[theme]);
/** A crystal head shimmers facet by facet in cyan, blue and violet; any other is lit as the islands. */
const headPaint = (theme: HaftTheme | undefined, colour: number): Paint => {
  if (theme !== 'crystal') return lit(colour, 0.25);
  const shimmer = [0x6ad8f0, 0x3a7ce0, 0xa65af0, 0x8ab0ff];
  return (_c, n) => shimmer[Math.floor(Math.abs(n.x * 3.1 + n.y * 2.3 + n.z * 1.7) * 2) % shimmer.length];
};

/**
 * A wooden haft from `bottom` to `top` (metres up Y from the grip at the origin), `r0` thick at the bottom tapering
 * to `r1`, bowed a little (`bow`, metres towards −Z at its middle; 0 straight), six-sided; a knob at its foot
 * (`knob`, 0 none). Shared by every hafted thing; also for a haft of your own (a flag pole, a staff, a halberd).
 */
export function haft(bottom: number, top: number, r0: number, r1: number, options: { bow?: number; knob?: number } = {}): BufferGeometry[] {
  const bow = options.bow ?? 0, h = top - bottom, at = (t: number) => new Vector3(0, bottom + h * t, -Math.sin(t * Math.PI) * bow);
  const parts = [taperedTube([at(0), at(0.33), at(0.66), at(1)], r0, r1, 6, 10)];
  const knob = options.knob ?? 0;
  if (knob) parts.push(turned([[0, bottom - knob * 0.6], [r0 + knob * 0.5, bottom - knob * 0.4], [r0 + knob * 0.5, bottom + knob * 0.2], [r0 * 0.9, bottom + knob * 0.6], [0, bottom + knob * 0.6]], 6));
  return parts;
}

/** A band of cord or leather wound round a haft of radius `r` at height `y`, `h` tall: a binding, a grip wrap. */
export const band = (y: number, r: number, h: number) => ring(r * 0.9, r * 1.28, h, 7).translate(0, y, 0);

/**
 * An axe `size` metres long (0.55), in the hand's axes (research/concepts/things/11-hafted.png, Axe): a bowed haft with a knob,
 * its top just showing above the head; a lumpy stone poll at the back, a broad blade forward (−Z) flaring into upper
 * and lower horns, thinning to a lighter chipped edge; a cord bound round the haft and crossed over the blade's root.
 * 'Handle', 'Head', 'Edge' at the middle of the edge. `theme` as HAFT_THEMES.
 */
export function axe(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 0.55) / 0.55, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0xa8583a, metal: 0xd86a6e, edge: 0xf2aaa4, accent: 0xd8323a });
  const out = named(new Group(), 'Axe'), hy = v(0.37), handle = new Group(), head = new Group();
  haft(v(-0.15), v(0.43), v(0.022), v(0.017), { bow: v(0.012), knob: v(0.026) }).forEach((geo, i) => handle.add(toy(geo, lit(i ? mix(c.haft, PALETTE.shade, 0.2) : c.haft, 0.3), { vary: 0.08 })));
  out.add(named(merge(handle), 'Handle'));
  // the poll: a lumpy stone behind the haft (the theme's metal, darker, when not classic)
  const pollColour = !theme || theme === 'classic' ? 0x8a90b0 : mix(c.metal, PALETTE.shade, 0.25);
  head.add(toy(blob(v(0.06), 7, 1, 0.2, 0.95).scale(0.8, 1.1, 0.95).translate(0, hy, v(0.03)), headPaint(theme, pollColour), { vary: 0.1 }));
  // the blade, drawn from the side (x forwards is −Z once stood upright), thinning towards its chipped edge
  const blade: [number, number][] = [[-0.015, 0.04], [-0.06, 0.05], [-0.1, 0.085], [-0.128, 0.072], [-0.142, 0.042], [-0.136, 0.008], [-0.152, -0.028], [-0.124, -0.076], [-0.092, -0.07], [-0.052, -0.044], [-0.015, -0.036]];
  // upright() turns the contour's x into +Z: x = z, so the blade reaches forwards to −Z
  const H = v(1.3), geo = upright(slab(blade.map(([z, y]) => [z * H, y * H] as [number, number]), v(0.034), 0.15));
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 - Math.min(1, Math.max(0, (-pos.getZ(i) - H * 0.015) / (H * 0.135))) * 0.55));
  geo.computeVertexNormals();
  head.add(toy(geo.translate(0, hy, 0), (p, n) => headPaint(theme, p.z < -H * 0.118 ? c.edge : c.metal)(p, n), { vary: 0.08 }));
  // the cord: round the haft under and over the head, crossed over the blade's root on both sides
  head.add(toy(band(hy - v(0.05), v(0.018), v(0.018)), lit(c.accent, 0.25), {}));
  for (const sx of [-1, 1]) for (const a of [-0.7, 0.7]) head.add(toy(block(v(0.009), v(0.09), v(0.014), [0, 0, 0], 0.2).rotateX(a).translate(sx * v(0.014), hy, -v(0.034)), lit(c.accent, 0.25), {}));
  out.add(named(merge(head), 'Head'));
  const edge = named(new Object3D(), 'Edge');
  edge.position.set(0, hy, -H * 0.15);
  out.add(edge);
  return out;
}

/**
 * A pickaxe `size` metres long (0.7), in the hand's axes (research/concepts/things/11-hafted.png, Pickaxe): a straight haft,
 * a metal collar round its top with the haft's end showing in an orange cap; two picks out of the collar, forwards
 * (−Z) and back, each flattened from the sides, tapering and curving down to a lighter point. 'Handle', 'Head', 'Tip'
 * at the front point.
 */
export function pickaxe(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 0.7) / 0.7, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0x8a5a3a, metal: 0x3a6ad8, edge: 0x9ab8ff, accent: 0xe8823a });
  const out = named(new Group(), 'Pickaxe'), hy = v(0.44), handle = new Group(), head = new Group();
  for (const geo of haft(v(-0.22), v(0.47), v(0.026), v(0.022))) handle.add(toy(geo, lit(c.haft, 0.3), { vary: 0.08 }));
  out.add(named(merge(handle), 'Handle'));
  head.add(toy(turned([[0, hy - v(0.04)], [v(0.036), hy - v(0.04)], [v(0.042), hy - v(0.025)], [v(0.042), hy + v(0.022)], [v(0.034), hy + v(0.032)], [0, hy + v(0.032)]], 8), headPaint(theme, c.metal), { vary: 0.08 }));
  head.add(toy(turned([[0, hy + v(0.03)], [v(0.024), hy + v(0.03)], [v(0.022), hy + v(0.046)], [0, hy + v(0.05)]], 6), lit(c.accent, 0.2), {}));
  for (const s of [-1, 1]) {
    // a pick: a four-sided horn flattened from the sides, out of the collar and curving down to its point
    const pts = [[0, 0.03], [0.012, 0.11], [-0.008, 0.19], [-0.05, 0.25], [-0.085, 0.27]].map(([y, z]) => new Vector3(0, hy + v(y), s * v(z)));
    const pick = taperedTube(pts, v(0.03), v(0.008), 4, 10).scale(0.62, 1, 1);
    head.add(toy(pick, (p, n) => headPaint(theme, Math.abs(p.z) > v(0.2) ? c.edge : c.metal)(p, n), { vary: 0.08 }));
  }
  out.add(named(merge(head), 'Head'));
  const tip = named(new Object3D(), 'Tip');
  tip.position.set(0, hy - v(0.085), -v(0.27));
  out.add(tip);
  return out;
}

/**
 * A shovel `size` metres long (0.95), held by its D-grip at the origin (research/concepts/things/11-hafted.png, Shovel): a
 * yellow D-grip round a wooden crossbar (along X), a wooden haft up +Y, a silver socket running onto the blade's face,
 * and a pointed blade facing the player (+Z), yellow with a silvery point. 'Handle', 'Head' (the blade),
 * 'Edge' at its point.
 */
export function shovel(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 0.95) / 0.95, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0xb07a4a, metal: 0xf2c23a, edge: 0xe4e2dc, accent: 0xf2b81f });
  const steel = !theme || theme === 'classic' ? 0xc8ccd8 : mix(c.metal, 0xffffff, 0.35);
  const out = named(new Group(), 'Shovel'), handle = new Group(), head = new Group(), by = v(0.66);
  for (const geo of haft(v(0.12), v(0.64), v(0.022), v(0.02))) handle.add(toy(geo, lit(c.haft, 0.3), { vary: 0.08 }));
  // the D-grip: a socket on the haft's foot, two arms out to a wooden crossbar
  handle.add(toy(turned([[0, v(0.1)], [v(0.03), v(0.1)], [v(0.032), v(0.16)], [v(0.024), v(0.19)], [0, v(0.19)]], 8), lit(c.accent, 0.25), {}));
  for (const s of [-1, 1]) handle.add(toy(taperedTube([new Vector3(s * v(0.012), v(0.11), 0), new Vector3(s * v(0.05), v(0.05), 0), new Vector3(s * v(0.062), v(0.0), 0)], v(0.017), v(0.017), 6, 6), lit(c.accent, 0.25), {}));
  handle.add(toy(new CylinderGeometry(v(0.016), v(0.016), v(0.12), 6).rotateZ(Math.PI / 2), lit(mix(c.haft, PALETTE.shade, 0.1), 0.3), {}));
  for (const s of [-1, 1]) handle.add(toy(new CylinderGeometry(v(0.022), v(0.022), v(0.026), 6).rotateZ(Math.PI / 2).translate(s * v(0.068), 0, 0), lit(c.accent, 0.25), {}));
  out.add(named(merge(handle), 'Handle'));
  // the blade: a pointed spade facing the player, flat, in two plates (a band of colour is a plate of its own, never
  // paint across a big face): yellow below, the silvery point above; the silver socket running onto its face
  const plate = (pts: [number, number][], colour: number, z: number) => {
    const geo = slab(pts.map(([x, y]) => [v(x), v(y)] as [number, number]), v(0.014), 0.12).translate(0, by, z);
    head.add(toy(geo, theme === 'crystal' ? headPaint(theme, colour) : evenFaces(lit(colour, 0.25), 0.05), { vary: 0 }));
  };
  plate([[-0.098, 0], [0.098, 0], [0.114, 0.09], [0.116, 0.15], [-0.116, 0.15], [-0.114, 0.09]], c.metal, 0);
  plate([[-0.116, 0.15], [0.116, 0.15], [0.106, 0.2], [0.08, 0.24], [0.042, 0.268], [0, 0.28], [-0.042, 0.268], [-0.08, 0.24], [-0.106, 0.2]], c.edge, 0);
  head.add(toy(turned([[0, by - v(0.05)], [v(0.026), by - v(0.05)], [v(0.036), by], [v(0.034), by + v(0.08)], [v(0.02), by + v(0.13)], [0, by + v(0.145)]], 8).scale(1, 1, 0.7).translate(0, 0, v(0.012)), lit(steel, 0.2), { vary: 0.06 }));
  out.add(named(merge(head), 'Head'));
  const edge = named(new Object3D(), 'Edge');
  edge.position.set(0, by + v(0.28), 0);
  out.add(edge);
  return out;
}

/**
 * A garden rake `size` metres long (1.1), held near the foot of its haft at the origin (research/concepts/things/11-hafted.png,
 * Rake): a long wooden haft up +Y, a socket into a crossbar along X at the top, and seven tines forwards (−Z), their
 * ends hooked back. 'Handle', 'Head', 'Tip' at the middle of the tines' ends (rake the ground with it).
 */
export function rake(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 1.1) / 1.1, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0xc8743a, metal: 0x5ab84a, edge: 0x7ad86a, accent: 0x4a9a3a });
  const out = named(new Group(), 'Rake'), handle = new Group(), head = new Group(), hy = v(0.98);
  for (const geo of haft(v(-0.12), v(0.95), v(0.025), v(0.022))) handle.add(toy(geo, lit(c.haft, 0.3), { vary: 0.08 }));
  out.add(named(merge(handle), 'Handle'));
  head.add(toy(turned([[0, hy - v(0.075)], [v(0.026), hy - v(0.075)], [v(0.03), hy - v(0.06)], [v(0.032), hy], [0, hy]], 6), lit(c.accent, 0.25), {}));
  head.add(toy(block(v(0.3), v(0.044), v(0.05), [0, hy + v(0.014), 0], 0.18), headPaint(theme, c.metal), { vary: 0.07 }));
  for (let i = 0; i < 7; i++) {
    const x = v(-0.13 + i * (0.26 / 6));
    const tine = taperedTube([new Vector3(x, hy + v(0.012), -v(0.015)), new Vector3(x, hy + v(0.012), -v(0.07)), new Vector3(x, hy - v(0.002), -v(0.1)), new Vector3(x, hy - v(0.024), -v(0.108))], v(0.0135), v(0.009), 4, 6);
    head.add(toy(tine, (p, n) => headPaint(theme, p.z < -v(0.088) ? c.edge : c.metal)(p, n), { vary: 0.07 }));
  }
  out.add(named(merge(head), 'Head'));
  const tip = named(new Object3D(), 'Tip');
  tip.position.set(0, hy - v(0.024), -v(0.108));
  out.add(tip);
  return out;
}

/**
 * A broom `size` metres long (0.92), held near the foot of its stick at the origin (research/concepts/things/11-hafted.png,
 * Broom): a crooked wooden stick up +Y, a bundle of straw bound with a dark cord where it meets the stick, its strands
 * flaring out to ragged ends of different lengths (lighter at the tips). 'Handle', 'Head' (sweep with it), 'Tip' at
 * the middle of the strands' ends.
 */
export function broom(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 0.92) / 0.92, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0x8a5a3a, metal: 0xf08a2a, edge: 0xffb24a, accent: 0x6a3a2a });
  const out = named(new Group(), 'Broom'), handle = new Group(), head = new Group(), by = v(0.56);
  for (const geo of haft(v(-0.1), by + v(0.06), v(0.027), v(0.023), { bow: v(0.022) })) handle.add(toy(geo, lit(c.haft, 0.3), { vary: 0.08 }));
  out.add(named(merge(handle), 'Handle'));
  // the bound neck: a short collar of straw round the stick, the cord over it
  head.add(toy(turned([[0, by], [v(0.03), by], [v(0.038), by + v(0.03)], [v(0.042), by + v(0.07)], [0, by + v(0.07)]], 8), lit(c.metal, 0.25), { vary: 0.08 }));
  head.add(toy(band(by + v(0.045), v(0.036), v(0.022)), lit(c.accent, 0.25), {}));
  // the bundle: a solid flaring cone of straw, and strands round it running out to ragged ends of different lengths
  head.add(toy(turned([[0, by + v(0.06)], [v(0.042), by + v(0.07)], [v(0.075), by + v(0.16)], [v(0.1), by + v(0.25)], [0, by + v(0.25)]], 10).scale(1, 1, 0.8), lit(c.metal, 0.25), { vary: 0.08 }));
  let sd = 31;
  const r = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + r() * 0.3, reach = v(0.27 + r() * 0.07), wide = v(0.1 + r() * 0.025);
    const end = new Vector3(Math.cos(a) * wide, by + reach, Math.sin(a) * wide * 0.8);
    const strand = taperedTube([new Vector3(Math.cos(a) * v(0.03), by + v(0.08), Math.sin(a) * v(0.024)), new Vector3(end.x * 0.7, by + reach * 0.62, end.z * 0.7), end], v(0.024), v(0.03), 4, 6);
    head.add(toy(strand, (p, n) => headPaint(theme, p.y > by + v(0.27) ? c.edge : c.metal)(p, n), { vary: 0.09, seed: i }));
  }
  out.add(named(merge(head), 'Head'));
  const tip = named(new Object3D(), 'Tip');
  tip.position.set(0, by + v(0.3), 0);
  out.add(tip);
  return out;
}

/**
 * A spear `size` metres long (1.2), held at its balance point at the origin (research/concepts/things/11-hafted.png, Spear): a
 * long wooden haft up +Y, a steel collar, and a big leaf-shaped steel point, four-faceted and flattened from front to
 * back, lighter towards its tip. 'Handle', 'Head', 'Tip' at the point (stab or throw with it).
 */
export function spear(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 1.2) / 1.2, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0xa8603a, metal: 0xb8bece, edge: 0xeef0f6, accent: 0x7a8090 });
  const out = named(new Group(), 'Spear'), handle = new Group(), head = new Group(), hy = v(0.74);
  for (const geo of haft(v(-0.4), hy + v(0.02), v(0.022), v(0.019))) handle.add(toy(geo, lit(c.haft, 0.3), { vary: 0.08 }));
  out.add(named(merge(handle), 'Handle'));
  head.add(toy(turned([[0, hy - v(0.03)], [v(0.026), hy - v(0.03)], [v(0.03), hy - v(0.012)], [v(0.03), hy + v(0.018)], [v(0.022), hy + v(0.03)], [0, hy + v(0.03)]], 8), lit(c.accent, 0.25), {}));
  // the point: a four-sided leaf turned on Y, flattened from front to back, its upper half a lighter plate of colour
  const leaf = turned([[0, hy + v(0.02)], [v(0.026), hy + v(0.04)], [v(0.072), hy + v(0.12)], [v(0.058), hy + v(0.185)], [0, hy + v(0.28)]], 4).rotateY(Math.PI / 4).scale(1, 1, 0.42);
  head.add(toy(leaf, (p, n) => headPaint(theme, p.y > hy + v(0.15) ? c.edge : c.metal)(p, n), { vary: 0.06 }));
  out.add(named(merge(head), 'Head'));
  const tip = named(new Object3D(), 'Tip');
  tip.position.set(0, hy + v(0.28), 0);
  out.add(tip);
  return out;
}

/**
 * A trident `size` metres long (1.15), held at its balance point at the origin (research/concepts/things/11-hafted.png,
 * Trident): a blue haft with a gold spike at its foot and a gold collar; a gold fork of three prongs spread across
 * (along X, facing the player) — the middle one straight up, the outer two curving out and up — each ending in a barbed
 * arrowhead; a blue gem at the fork, seen from both sides. 'Handle', 'Head', 'Tip' at the middle point.
 */
export function trident(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 1.15) / 1.15, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0x2a62c8, metal: 0xf2b53a, edge: 0xffd86a, accent: 0x3ab0f0 });
  const out = named(new Group(), 'Trident'), handle = new Group(), head = new Group(), fy = v(0.66);
  for (const geo of haft(v(-0.36), fy, v(0.021), v(0.019))) handle.add(toy(geo, lit(c.haft, 0.3), { vary: 0.08 }));
  handle.add(toy(turned([[0, v(-0.44)], [v(0.026), v(-0.38)], [v(0.026), v(-0.35)], [0, v(-0.35)]], 6), headPaint(theme, c.metal), {}));
  out.add(named(merge(handle), 'Handle'));
  const gold = (p: Vector3, n: Vector3) => headPaint(theme, p.y > fy + v(0.16) ? c.edge : c.metal)(p, n);
  head.add(toy(turned([[0, fy - v(0.05)], [v(0.026), fy - v(0.05)], [v(0.032), fy - v(0.03)], [v(0.032), fy + v(0.01)], [v(0.024), fy + v(0.03)], [0, fy + v(0.03)]], 8), gold, {}));
  // the prongs: the middle one straight, the outer ones out along a yoke and up
  head.add(toy(taperedTube([new Vector3(0, fy, 0), new Vector3(0, fy + v(0.1), 0), new Vector3(0, fy + v(0.2), 0)], v(0.018), v(0.014), 6, 4), gold, {}));
  for (const s of [-1, 1]) head.add(toy(taperedTube([new Vector3(0, fy + v(0.01), 0), new Vector3(s * v(0.06), fy + v(0.03), 0), new Vector3(s * v(0.088), fy + v(0.09), 0), new Vector3(s * v(0.092), fy + v(0.16), 0)], v(0.017), v(0.013), 6, 8), gold, {}));
  // a barbed arrowhead on each prong, flat across like the fork
  const point: [number, number][] = [[0, 0.075], [0.032, 0.006], [0.014, 0.016], [0.012, -0.008], [-0.012, -0.008], [-0.014, 0.016], [-0.032, 0.006]];
  for (const [x, y] of [[0, 0.2], [-0.092, 0.16], [0.092, 0.16]]) head.add(toy(slab(point.map(([a, b]) => [v(a), v(b)] as [number, number]), v(0.02), 0.2).translate(v(x), fy + v(y), 0), gold, { vary: 0.06 }));
  // the fork drawn a third bigger than the haft's scale, round the fork itself (merge keeps the wrapper's scale)
  const F = 1.35, fork = new Group();
  head.scale.setScalar(F);
  head.position.y = fy * (1 - F);
  fork.add(head);
  out.add(named(merge(fork), 'Head'));
  // the gem at the fork, through from front to back
  out.add(named(toy(new OctahedronGeometry(v(0.03), 0).scale(1, 1.35, 1.75).translate(0, fy + v(0.075), 0), lit(c.accent, 0.15), { vary: 0.1, emissive: 0x0a2a4a }), 'Gem'));
  const tip = named(new Object3D(), 'Tip');
  tip.position.set(0, fy + v(0.275) * F, 0);
  out.add(tip);
  return out;
}

/**
 * A mace `size` metres long (0.62), its grip at the origin (research/concepts/things/11-hafted.png, Mace): a metal shaft with
 * a leather-wrapped grip and a pointed pommel, a collar, and a faceted ball head studded with twelve pyramid spikes
 * lighter at their points. 'Handle', 'Head' (strikeWith).
 */
export function mace(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 0.62) / 0.62, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0x6a6a9a, metal: 0x6a5ab8, edge: 0xd890c0, accent: 0x4a3a6a });
  const out = named(new Group(), 'Mace'), handle = new Group(), head = new Group(), hy = v(0.42);
  for (const geo of haft(v(-0.12), hy - v(0.04), v(0.02), v(0.018))) handle.add(toy(geo, lit(c.haft, 0.25), { vary: 0.07 }));
  for (let i = 0; i < 5; i++) handle.add(toy(band(v(-0.085 + i * 0.04), v(0.02), v(0.03)), lit(c.accent, 0.25), { vary: 0.06, seed: i }));
  handle.add(toy(turned([[0, v(-0.2)], [v(0.012), v(-0.17)], [v(0.03), v(-0.135)], [v(0.03), v(-0.115)], [0, v(-0.115)]], 6), lit(c.haft, 0.25), {}));
  out.add(named(merge(handle), 'Handle'));
  head.add(toy(turned([[0, hy - v(0.07)], [v(0.026), hy - v(0.07)], [v(0.034), hy - v(0.05)], [v(0.03), hy - v(0.03)], [0, hy - v(0.03)]], 8), lit(c.haft, 0.25), {}));
  const R = v(0.09);
  head.add(toy(jitter(new IcosahedronGeometry(R, 1), R * 0.04, 5).translate(0, hy + v(0.035), 0), headPaint(theme, c.metal), { vary: 0.1 }));
  // the spikes, one out of each corner of an icosahedron round the ball
  const corners = new IcosahedronGeometry(1, 0).getAttribute('position'), seen = new Set<string>(), up = new Vector3(0, 1, 0);
  for (let i = 0; i < corners.count; i++) {
    const d = new Vector3().fromBufferAttribute(corners, i).normalize(), key = d.toArray().map((x) => x.toFixed(2)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const spike = new ConeGeometry(v(0.028), v(0.062), 4).translate(0, R + v(0.022), 0).applyQuaternion(new Quaternion().setFromUnitVectors(up, d)).translate(0, hy + v(0.035), 0);
    head.add(toy(spike, headPaint(theme, c.edge), { vary: 0.08, seed: i }));
  }
  out.add(named(merge(head), 'Head'));
  return out;
}

/**
 * A scythe `size` metres long (0.85), its grip at the origin (research/concepts/things/11-hafted.png, Scythe): a dark crooked
 * snath up +Y, a red socket at the top, and a crescent blade reaching forwards (−Z) and curving down to its point, its
 * inner cutting edge a lighter band (a plate of its own, a little thicker, so it never flickers through). 'Handle',
 * 'Head', 'Edge' at the middle of the cutting edge, 'Tip' at the point.
 */
export function scythe(options: { size?: number; theme?: HaftTheme } = {}): Group {
  const k = (options.size ?? 0.85) / 0.85, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0x4a2a3a, metal: 0xd8323a, edge: 0xf29a9a, accent: 0xa8202a });
  const out = named(new Group(), 'Scythe'), handle = new Group(), head = new Group(), hy = v(0.44);
  const snath = [[-0.32, 0.0], [-0.06, 0.012], [0.14, -0.03], [0.26, 0.02], [0.44, 0]].map(([y, z]) => new Vector3(0, v(y), v(z)));
  handle.add(toy(taperedTube(snath, v(0.022), v(0.018), 6, 14), lit(c.haft, 0.3), { vary: 0.08 }));
  out.add(named(merge(handle), 'Handle'));
  head.add(toy(block(v(0.05), v(0.06), v(0.075), [0, hy, -v(0.01)], 0.15), lit(c.accent, 0.25), {}));
  head.add(toy(turned([[0, hy + v(0.03)], [v(0.02), hy + v(0.03)], [v(0.018), hy + v(0.045)], [0, hy + v(0.048)]], 6), lit(c.accent, 0.25), {}));
  // the blade from the side: its back from the socket over and down to the point, its cutting edge back underneath
  const back: [number, number][] = [[-0.02, 0.022], [-0.09, 0.032], [-0.165, 0.004], [-0.222, -0.066], [-0.252, -0.156], [-0.258, -0.245]];
  const cut: [number, number][] = [[-0.238, -0.17], [-0.205, -0.094], [-0.145, -0.04], [-0.075, -0.018], [-0.02, -0.022]];
  const side = (pts: [number, number][], thick: number) => upright(slab(pts.map(([z, y]) => [v(z), v(y)] as [number, number]), thick, 0.12)).translate(0, hy, 0);
  head.add(toy(side([...back, ...cut], v(0.016)), headPaint(theme, c.metal), { vary: 0.07 }));
  const band = cut.map(([z, y]) => [z, y + 0.024] as [number, number]).reverse();
  head.add(toy(side([[-0.258, -0.245], ...cut, ...band], v(0.019)), headPaint(theme, c.edge), { vary: 0.06 }));
  out.add(named(merge(head), 'Head'));
  const edge = named(new Object3D(), 'Edge'), tip = named(new Object3D(), 'Tip');
  edge.position.set(0, hy - v(0.07), -v(0.2));
  tip.position.set(0, hy - v(0.245), -v(0.258));
  out.add(edge, tip);
  return out;
}

/**
 * A torch `size` metres long (0.5), its grip at the origin (research/concepts/things/11-hafted.png, Torch): a wooden stick
 * widening up +Y, wrapped in cloth at the top under a dark cup, and a flame of glowing faceted tongues ('Fire': hide it
 * to put the torch out, flicker its scale while it burns; add your own PointLight at 'Tip' for light in the room).
 * 'Handle', 'Head', 'Tip' at the flame's base.
 */
export function torch(options: { size?: number; theme?: HaftTheme; lit?: boolean } = {}): Group {
  const k = (options.size ?? 0.5) / 0.5, v = (x: number) => x * k, theme = options.theme;
  const c = colours(theme, { haft: 0x8a5a3a, metal: 0x8a7a9a, edge: 0x4a3a5a, accent: 0x6a5a7a });
  const out = named(new Group(), 'Torch'), handle = new Group(), head = new Group(), ty = v(0.3);
  for (const geo of haft(v(-0.16), v(0.24), v(0.018), v(0.03))) handle.add(toy(geo, lit(c.haft, 0.3), { vary: 0.08 }));
  out.add(named(merge(handle), 'Handle'));
  for (let i = 0; i < 3; i++) head.add(toy(band(v(0.205 + i * 0.025), v(0.029 + i * 0.003), v(0.026)).rotateZ((i - 1) * 0.05), lit(i % 2 ? c.accent : c.metal, 0.25), { vary: 0.08, seed: i }));
  head.add(toy(turned([[0, v(0.26)], [v(0.032), v(0.26)], [v(0.046), ty], [v(0.04), ty + v(0.008)], [0, ty]], 8), lit(c.edge, 0.25), {}));
  out.add(named(merge(head), 'Head'));
  if (options.lit ?? true) {
    const flame = fire(v(0.17), { seed: 4 });
    flame.position.y = ty - v(0.005);
    out.add(flame);
  }
  const tip = named(new Object3D(), 'Tip');
  tip.position.set(0, ty + v(0.05), 0);
  out.add(tip);
  return out;
}
