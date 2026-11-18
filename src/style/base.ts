// Punto's look for the coder's creations (Yury, 16.11): the hand-painted low-poly toy style of the front page's
// islands (src/splash/models/kit.ts), so a thing the coder draws itself looks like it belongs to Punto's world.
// Every facet its own colour, a little lighter or darker; slightly crooked hand-cut forms; one material for all.
//
//   const hill = toy(new ConeGeometry(0.3, 0.2, 7), topSide(PALETTE.grass, PALETTE.dirt), { rough: 0.02 });
//   const tree = roundTree(0.6);                    // a ready tree, one mesh
//   toyLook(myCarGroup);                            // a thing built the usual way, turned into the look
//   const scene = merge(group);                     // many painted pieces → one mesh (one draw call)
import { BufferGeometry, ConeGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Quaternion, Shape, CylinderGeometry, Group, IcosahedronGeometry, LatheGeometry, Vector2, InstancedMesh, Mesh, type Material, MeshStandardMaterial, type Object3D, SkinnedMesh, Vector3 } from '@iwsdk/core';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blob, type Edge, facets, glowMat, jitter, mix, paint, ringLoft, rng, taperedTube } from '../splash/models/kit.js';

export { blob, edgeGlow, glowMat, jitter, mix, paint, taperedTube } from '../splash/models/kit.js';

/** The colours of Punto's world (the front page's concept art): use them before inventing new ones. */
export const PALETTE = {
  grass: 0x5fb532, grassLight: 0x7cc83c, leaf: 0x4c9d30, leafDark: 0x3a8526, pine: 0x2f7d3a,
  dirt: 0xa06a3a, earth: 0x845331, earthDark: 0x5f3b24, bark: 0x7a4a2b, wood: 0xc98a4b, woodLight: 0xe1ad6a,
  rock: 0x9c9ca6, rockDark: 0x6e6870, sand: 0xe9c98a, snow: 0xf4f6fa, water: 0x3fa9ff, lava: 0xff6a1f,
  cream: 0xe9e2d2, plastic: 0x34363f, red: 0xe94b3c, orange: 0xff7a2f, yellow: 0xffc93a, green: 0x45d483,
  blue: 0x3a8cf0, violet: 0xb06cf0, pink: 0xff6fa8, cyan: 0x6ff3ff, gold: 0xf2b53a, white: 0xf6f3ec, black: 0x1d1e24,
  /** what the undersides sink into (`lit`, `shade`): the islands' deep violet-brown */
  shade: 0x2a1838,
};

/** A colour by which way a facet faces: its top, its sides, its underside (grass on top, earth on the sides). */
export const topSide = (top: number, side: number, bottom = side) => (_c: Vector3, n: Vector3) => (n.y > 0.5 ? top : n.y < -0.5 ? bottom : side);
/** A colour lit like the islands: the top as it is, the sides `dark` (0.2) darker, the underside darker still. */
export const lit = (color: number, dark = 0.2) => topSide(color, mix(color, PALETTE.shade, dark), mix(color, PALETTE.shade, dark * 1.75));
/**
 * A colour a little lighter or darker per flat face rather than per triangle: both triangles of one flat face (a die's
 * side, a domino, a card, a block) get the same shade, so a big face never shows a diagonal fold. Pass it to toy with
 * `vary: 0`. `color` may be a colour or another pick (lit, topSide…); `vary` 0.06.
 */
export const evenFaces = (color: number | ((c: Vector3, n: Vector3) => number), vary = 0.06, seed = 1) => (c: Vector3, n: Vector3) => {
  const base = typeof color === 'number' ? color : color(c, n);
  const h = Math.sin(Math.round(n.x * 20) * 12.9898 + Math.round(n.y * 20) * 78.233 + Math.round(n.z * 20) * 37.719 + seed * 4.1) * 43758.5453;
  const t = (h - Math.floor(h) - 0.5) * vary * 2;
  return t > 0 ? mix(base, 0xffffff, t) : mix(base, PALETTE.shade, -t);
};
/**
 * Broad horizontal bands of `colors` from bottom to top over the heights `from`..`to` (a planet's stripes, a striped
 * hat, a layered cake), their edges waving a little round the vertical axis (`wave`, a share of the height, 0.07).
 */
export function bands(colors: number[], from: number, to: number, options: { wave?: number; seed?: number } = {}): (c: Vector3) => number {
  const r = rng((options.seed ?? 1) * 7919 + 101), p = [r(), r(), r()].map((x) => x * Math.PI * 2), wave = options.wave ?? 0.07;
  return (c) => {
    const a = Math.atan2(c.z, c.x), t = (c.y - from) / (to - from) + (Math.sin(a * 3 + p[1]) * wave + Math.sin(a * 5 + p[2]) * wave * 0.6) / 2;
    return colors[Math.min(colors.length - 1, Math.max(0, Math.floor(t * colors.length)))];
  };
}
/** A flat ring between two radii lying in the XZ plane, `thickness` thick, cut in `sides` straight facets (18). */
export function ring(inner: number, outer: number, thickness: number, sides = 18): BufferGeometry {
  const t = thickness / 2, profile = [[inner, -t], [outer, -t], [outer, t], [inner, t], [inner, -t]];
  return new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), sides);
}
/**
 * Big lumps and hollows over a roughly round piece centred on the origin — a potato, an asteroid, a boulder, a cloud:
 * `count` broad swellings (and as many flattened sides), each up to `amount` of the radius (0.18). Call it before
 * `craters().press`; small hand-cut bumps are `jitter` / `blob`'s rough, these are the big shape.
 */
export function lumps(geo: BufferGeometry, count = 4, options: { amount?: number; seed?: number } = {}): BufferGeometry {
  const r = rng((options.seed ?? 1) * 7919 + 101), amount = options.amount ?? 0.18, bulges: { d: Vector3; k: number }[] = [];
  for (let i = 0; i < 4; i++) r();
  for (let i = 0; i < count * 2; i++) bulges.push({ d: new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), k: (i % 2 ? -0.7 : 1) * amount * (0.6 + r() * 0.4) });
  const pos = geo.getAttribute('position'), v = new Vector3(), n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    let k = 1;
    for (const b of bulges) k += b.k * Math.max(0, (n.dot(b.d) - 0.35) / 0.65) ** 2;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
/**
 * `count` craters over a roughly round piece centred on the origin (`size` radians, 0.45; `depth` share of radius, 0.08; `rim` height, 1).
 *
 * `press(geometry)` sinks each crater inside a low raised rim; `paint(color)` colours their floors dark and rims light;
 * `rims(radius, body?)` gives the low crooked walls round them (toy them in a lighter colour: they make a crater read).
 *   const c = craters(8, { seed: 3 });
 *   g.add(toy(c.press(blob(0.2, 3, 3, 0.03)), c.paint(0x8a8ea6), { shade: 0.3 }), toy(c.rims(0.2), lit(0xa8abbd)));
 */
export function craters(count: number, options: { size?: number; depth?: number; rim?: number; seed?: number } = {}) {
  const r = rng((options.seed ?? 1) * 7919 + 101), size = options.size ?? 0.45, depth = options.depth ?? 0.08, rim = options.rim ?? 1;
  for (let i = 0; i < 4; i++) r();
  const centres: { d: Vector3; a: number }[] = [], turn = r() * Math.PI * 2, n = new Vector3();
  for (let i = 0; i < count; i++) {
    // spread evenly (a golden-angle spiral), a little jostled; a few big, most middling, some small
    const y = 1 - (2 * (i + 0.5)) / count, w = Math.sqrt(1 - y * y), a = i * 2.39996 + turn;
    const d = new Vector3(Math.cos(a) * w + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.3, Math.sin(a) * w + (r() - 0.5) * 0.3).normalize();
    centres.push({ d, a: size * [1.25, 0.85, 0.65, 1.05, 0.55, 0.8][i % 6] * (0.85 + r() * 0.3) });
  }
  /** where a direction falls: < 1 inside the nearest crater (0 at its centre), 1–1.4 on its rim, more = outside */
  const place = (p: Vector3) => {
    n.copy(p).normalize();
    let best = 9;
    for (const c of centres) best = Math.min(best, n.angleTo(c.d) / c.a);
    return best;
  };
  return {
    press(geo: BufferGeometry): BufferGeometry {
      const pos = geo.getAttribute('position'), v = new Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const t = place(v), k = t < 1 ? 1 - depth * (1 - t * t) : t < 1.4 ? 1 + depth * 0.35 * Math.sin(((t - 1) / 0.4) * Math.PI) : 1;
        pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
      }
      geo.computeVertexNormals();
      return geo;
    },
    /**
     * Their raised rims for a ball of `radius`: a low crooked seven-sided ring round each crater, one geometry. Pass
     * the pressed `body` of a lumpy thing (an asteroid) and the rims sit on its real surface instead of the ball's.
     */
    rims(radius: number, body?: BufferGeometry): BufferGeometry {
      const parts: BufferGeometry[] = [], q = new Quaternion();
      centres.forEach((c, i) => {
        const ra = radius * Math.sin(c.a), h = radius * 0.06 * rim * (c.a / size), drop = (x: number) => (x * x - ra * ra) / (2 * radius);
        const profile = [[ra * 1.3, -h * 0.6 - drop(ra * 1.3)], [ra * 1.08, h - drop(ra * 1.08)], [ra * 0.9, h * 0.7 - drop(ra * 0.9)], [ra * 0.78, -h * 0.6 - drop(ra * 0.78)]];
        const geo = jitter(new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), 7), ra * 0.07, i + 1);
        geo.applyQuaternion(q.setFromUnitVectors(new Vector3(0, 1, 0), c.d));
        geo.translate(c.d.x * radius * Math.cos(c.a), c.d.y * radius * Math.cos(c.a), c.d.z * radius * Math.cos(c.a));
        parts.push(geo.index ? geo.toNonIndexed() : geo);
      });
      const out = mergeGeometries(parts);
      if (body) {
        // the body's own radius in each direction: from its nearest corners, weighted by how close they point
        const bp = body.getAttribute('position'), dirs: Vector3[] = [], lens: number[] = [], seen = new Set<string>(), v = new Vector3(), d = new Vector3();
        for (let i = 0; i < bp.count; i++) {
          v.fromBufferAttribute(bp, i);
          const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          lens.push(v.length());
          dirs.push(v.clone().normalize());
        }
        const pos = out.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          d.copy(v).normalize();
          let sum = 0, weight = 0;
          dirs.forEach((u, k) => {
            const w = Math.max(0, u.dot(d) - 0.9) ** 2;
            sum += w * lens[k];
            weight += w;
          });
          if (weight) v.setLength(v.length() - radius + sum / weight);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        out.computeVertexNormals();
      }
      return out;
    },
    paint(color: Pick): (c: Vector3, n: Vector3) => number {
      const pick = typeof color === 'number' ? () => color : color;
      return (c, nn) => {
        const t = place(c), base = pick(c, nn);
        return t < 0.8 ? mix(base, PALETTE.shade, 0.7) : t < 1 ? mix(base, PALETTE.shade, 0.4) : t < 1.2 ? mix(base, 0xffffff, 0.12) : base;
      };
    },
  };
}
/**
 * A turned body round the Y axis from a side profile of [radius, y] points, bottom to top — a rocket, a vase, a
 * bottle, a chess piece, a lamp, a tower: `sides` straight facets round it (10; 6–8 for small things). End the profile
 * at radius 0 to close a tip or a bottom.
 */
export function turned(profile: [number, number][], sides = 10): BufferGeometry {
  return new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), sides);
}
/**
 * A thick flat piece cut out along a contour of [x, y] points (in the XY plane), `thickness` thick round z = 0, its
 * edges chamfered (`bevel`, a share of the thickness, 0.3) — a fin, a wing, a leaf, a sign, a blade, a star; `holes`
 * (contours inside it) make a frame, a ring, a pond's bank.
 */
export function slab(points: [number, number][], thickness: number, bevel = 0.3, holes: [number, number][][] = []): BufferGeometry {
  const shape = new Shape(), b = thickness * bevel;
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  for (const hole of holes) {
    const path = new Path();
    hole.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    shape.holes.push(path);
  }
  const geo = new ExtrudeGeometry(shape, { depth: Math.max(1e-4, thickness - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  geo.translate(0, 0, -(thickness - 2 * b) / 2);
  return geo;
}
/*
 * Laying pieces into a thing whose front is −Z (a ship, a plane, a car, a fish): build a body upright with `turned`
 * (its tip up, +Y) and lay it `forward`; draw a contour for `slab` with x across and y forwards and lay it `flat` (a
 * wing, a fin, a deck), or with x backwards and y up and stand it `upright` along the body (a tail fin, a crest).
 * `mirrored` gives the left side's contour from the right side's.
 */
/** A piece built upright (tip at +Y) laid along the thing, its tip forwards (−Z). */
export const forward = (geo: BufferGeometry) => geo.rotateX(-Math.PI / 2);
/** A slab drawn with y forwards laid flat (y becomes −Z): a wing, a fin, a deck. */
export const flat = (geo: BufferGeometry) => geo.rotateX(-Math.PI / 2);
/** A slab drawn with x backwards and y up stood upright along the thing (x becomes +Z): a tail fin, a crest. */
export const upright = (geo: BufferGeometry) => geo.rotateY(-Math.PI / 2);
/** The left side's contour from the right side's: x mirrored, the order reversed so the faces still look out. */
export const mirrored = (points: [number, number][]): [number, number][] => points.map(([x, y]) => [-x, y] as [number, number]).reverse();
/**
 * Angular faceted hull from cross-sections `[z, halfWidth, top, bottom]` along Z, front (−Z) first (width 0 = closed tip) — a ship, car, boat, fish.
 *
 * Each section is a six-sided ring: a flat top `top` above the axis, chamfered upper and lower sides, widest at y = 0,
 * a flat bottom `bottom` below it. Flat facets, ready for `toy`.
 *   const ship = toy(hull([[-0.3, 0, 0, 0], [-0.1, 0.06, 0.04, 0.03], [0.25, 0.09, 0.05, 0.03]]), lit(PALETTE.blue));
 */
export function hull(sections: [number, number, number, number][], options: { shoulder?: number } = {}): BufferGeometry {
  const k = options.shoulder ?? 0.6, rings = sections.map(([z, w, top, bottom]) => [
    new Vector3(-w * k, top, z), new Vector3(w * k, top, z), new Vector3(w, 0, z), new Vector3(w * k, -bottom, z), new Vector3(-w * k, -bottom, z), new Vector3(-w, 0, z),
  ]);
  const v: number[] = [], tri = (a: Vector3, b: Vector3, c: Vector3) => v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let j = 0; j < 6; j++) {
      const j2 = (j + 1) % 6;
      tri(a[j], a[j2], b[j2]);
      tri(a[j], b[j2], b[j]);
    }
  }
  // close both ends with a fan round the end's middle
  const cap = (r: Vector3[], flip: boolean) => {
    const m = new Vector3();
    r.forEach((p) => m.add(p));
    m.divideScalar(6);
    for (let j = 0; j < 6; j++) (flip ? tri(m, r[(j + 1) % 6], r[j]) : tri(m, r[j], r[(j + 1) % 6]));
  };
  cap(rings[0], true);
  cap(rings[rings.length - 1], false);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return ensureOutward(geo);
}
/** Turns any triangle whose face looks inwards (towards the piece's middle) to look out. */
function ensureOutward(geo: BufferGeometry): BufferGeometry {
  const pos = geo.getAttribute('position'), a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), mid = new Vector3();
  geo.computeBoundingBox();
  const centre = geo.boundingBox!.getCenter(new Vector3());
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.copy(b).sub(a).cross(c.clone().sub(a));
    mid.copy(a).add(b).add(c).divideScalar(3).sub(centre);
    mid.x *= 3; // the hull is long: judge mostly sideways and up/down, not along it
    mid.y *= 3;
    if (n.dot(mid) < 0) { pos.setXYZ(i + 1, c.x, c.y, c.z); pos.setXYZ(i + 2, b.x, b.y, b.z); }
  }
  geo.computeVertexNormals();
  return geo;
}
/** A chamfered block w × h × d set at `at` (its centre): a superstructure, a container, a pylon, a crate, a die. */
export function block(w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0], round = 0.14): BufferGeometry {
  return chamferedBox(w, h, d, Math.min(w, h, d) * round).translate(at[0], at[1], at[2]);
}
/**
 * A box w × h × d round the origin with all twelve edges chamfered the same (`r` metres) and each corner cut by a small
 * triangle — even from every side (an extruded bevel leaves the four edges along its depth sharp). Flat facets.
 */
export function chamferedBox(w: number, h: number, d: number, r: number): BufferGeometry {
  const X = w / 2, Y = h / 2, Z = d / 2, k = Math.min(r, X * 0.99, Y * 0.99, Z * 0.99), v: number[] = [];
  const pz = (sx: number, sy: number, sz: number) => new Vector3(sx * (X - k), sy * (Y - k), sz * Z);
  const py = (sx: number, sy: number, sz: number) => new Vector3(sx * (X - k), sy * Y, sz * (Z - k));
  const px = (sx: number, sy: number, sz: number) => new Vector3(sx * X, sy * (Y - k), sz * (Z - k));
  const tri = (a: Vector3, b: Vector3, c: Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a)), m = a.clone().add(b).add(c);
    if (n.dot(m) < 0) [b, c] = [c, b]; // a convex box round the origin: every face looks away from it
    v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const quad = (a: Vector3, b: Vector3, c: Vector3, e: Vector3) => { tri(a, b, c); tri(a, c, e); };
  for (const s of [-1, 1]) {
    quad(pz(-1, -1, s), pz(1, -1, s), pz(1, 1, s), pz(-1, 1, s));
    quad(py(-1, s, -1), py(1, s, -1), py(1, s, 1), py(-1, s, 1));
    quad(px(s, -1, -1), px(s, 1, -1), px(s, 1, 1), px(s, -1, 1));
    for (const t of [-1, 1]) {
      quad(pz(-1, s, t), pz(1, s, t), py(1, s, t), py(-1, s, t)); // the edges along X
      quad(pz(s, -1, t), pz(s, 1, t), px(s, 1, t), px(s, -1, t)); // along Y
      quad(py(s, t, -1), py(s, t, 1), px(s, t, 1), px(s, t, -1)); // along Z
      for (const u of [-1, 1]) tri(px(s, t, u), py(s, t, u), pz(s, t, u));
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}
/**
 * A glowing thrust cone `length` long out of an engine of radius `r`, its narrow end at the origin and opening
 * backwards (+Z): put it at the engine's back end. One of the few things that may shine; flicker its scale for thrust.
 */
export function exhaust(r: number, length: number, color = 0x9ff4ff): Mesh {
  const geo = new ConeGeometry(r, length, 6);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, length / 2);
  const m = new Mesh(geo, glowMat(color));
  m.name = 'Exhaust';
  return m;
}
/**
 * A long leaf from the origin along +X — a palm frond, a banana leaf, a fern, a feather, a petal: `width` at its
 * widest, folded along its middle (`fold`, how far the edges hang below the crease, a share of the width, 0.25),
 * rising and then drooping (`rise` and `droop`, metres at its middle and its tip), cut in `segments` facets along it
 * (6), pointed at the tip. Both faces are closed; the top faces up.
 */
export function leaf(length: number, width: number, options: { fold?: number; rise?: number; droop?: number; segments?: number } = {}): BufferGeometry {
  const n = options.segments ?? 6, fold = (options.fold ?? 0.25) * width, rise = options.rise ?? length * 0.15, droop = options.droop ?? length * 0.35;
  const station = (k: number) => {
    const s = k / n, x = length * s, y = rise * Math.sin(Math.PI * s * 0.8) - droop * s * s, w = (width / 2) * Math.sin(Math.PI * Math.min(1, s * 1.05 + 0.05)) * (s < 1 ? 1 : 0);
    return [new Vector3(x, y - fold * (w / (width / 2)), -w), new Vector3(x, y + fold * 0.3, 0), new Vector3(x, y - fold * (w / (width / 2)), w)];
  };
  const v: number[] = [], tri = (a: Vector3, b: Vector3, c: Vector3) => v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k < n; k++) {
    const a = station(k), b = station(k + 1);
    for (const j of [0, 1]) {
      tri(a[j], b[j + 1], a[j + 1]); tri(a[j], b[j], b[j + 1]); // the top
      tri(a[j], a[j + 1], b[j + 1]); tri(a[j], b[j + 1], b[j]); // the underside
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}
/**
 * A thick band along a path of points — a waterfall, a river, a road, a scarf, a banner: `width` across (along `side`,
 * +X by default, which must not run along the path), `thickness` through, `across` facets side to side (1; more to
 * paint stripes along it). Its top faces away from `side` × the path; both ends are closed.
 */
export function ribbon(points: Vector3[], width: number, thickness: number, options: { across?: number; side?: Vector3 } = {}): BufferGeometry {
  const m = options.across ?? 1, side = (options.side ?? new Vector3(1, 0, 0)).clone().normalize(), rows: Vector3[][] = [];
  points.forEach((p, i) => {
    const t = points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    const normal = new Vector3().crossVectors(side, t).normalize();
    const row: Vector3[] = [];
    for (let k = 0; k <= m; k++) row.push(p.clone().addScaledVector(side, (k / m - 0.5) * width).addScaledVector(normal, thickness / 2));
    for (let k = m; k >= 0; k--) row.push(p.clone().addScaledVector(side, (k / m - 0.5) * width).addScaledVector(normal, -thickness / 2));
    rows.push(row);
  });
  const v: number[] = [], tri = (a: Vector3, b: Vector3, c: Vector3) => v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z), n = rows[0].length;
  for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < n; k++) {
    const a = rows[i][k], b = rows[i][(k + 1) % n], c = rows[i + 1][(k + 1) % n], d = rows[i + 1][k];
    tri(a, c, b); tri(a, d, c);
  }
  for (const [row, flip] of [[rows[0], false], [rows[rows.length - 1], true]] as const) {
    const mid = new Vector3();
    row.forEach((p) => mid.add(p));
    mid.divideScalar(n);
    for (let k = 0; k < n; k++) (flip ? tri(mid, row[k], row[(k + 1) % n]) : tri(mid, row[(k + 1) % n], row[k]));
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}
/**
 * A fire `height` metres tall standing on y = 0 — a campfire, a torch, a candle, a fireplace: a few faceted tongues of
 * flame, orange outside and yellow inside, that glow (their facets still show). One mesh, 'Fire': flicker its scale.
 */
export function fire(height: number, options: { seed?: number; outer?: number; inner?: number } = {}): Mesh {
  const H = height, seed = options.seed ?? 1, r = rng(seed * 7919 + 101), g = new Group();
  // a tongue: a faceted teardrop, fat low down, its tip bending over to one side
  const tongue = (h: number, w: number, x: number, z: number, lean: number, colour: number, glow: number, k: number) => {
    const geo = new LatheGeometry([[0, 0], [w * 0.75, h * 0.1], [w, h * 0.28], [w * 0.78, h * 0.52], [w * 0.38, h * 0.78], [0, h]].map(([a, b]) => new Vector2(a, b)), 6);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / h; pos.setX(i, pos.getX(i) + lean * h * y * y); }
    jitter(geo, w * 0.08, seed + k);
    geo.translate(x, 0, z);
    g.add(toy(geo, colour, { seed: seed + k, vary: 0.1, emissive: glow }));
  };
  const outer = options.outer ?? 0xff8a1f, inner = options.inner ?? 0xffd040;
  tongue(H, H * 0.3, 0, 0, 0.12, outer, 0x8a3000, 0);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + r(); tongue(H * (0.5 + r() * 0.2), H * 0.17, Math.cos(a) * H * 0.17, Math.sin(a) * H * 0.17, Math.cos(a) * 0.35, outer, 0x8a3000, k + 1); }
  tongue(H * 0.6, H * 0.2, 0, H * 0.16, -0.15, inner, 0xa06000, 9);
  tongue(H * 0.4, H * 0.13, H * 0.1, H * 0.15, 0.25, inner, 0xa06000, 10);
  const m = merge(g, { emissive: 0x8a3000 });
  m.name = 'Fire';
  return m;
}
/** A colour by height: [y, colour] stops from low to high, blended between (a mountain: rock, then snow). */
export function byHeight(stops: [number, number][]): (c: Vector3) => number {
  return (c) => {
    if (c.y <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (c.y <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (c.y - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    return stops[stops.length - 1][1];
  };
}

type Pick = number | ((centre: Vector3, normal: Vector3) => number);
type Finish = { vary?: number; rough?: number; seed?: number; roughness?: number; metalness?: number; emissive?: number; shade?: number };

/**
 * Any geometry as a hand-painted toy piece: each facet coloured by `color` (a colour, or a function of the
 * facet's centre and normal, as lit / topSide / bands / byHeight), a little lighter or darker (`vary`, 0.08); `rough`
 * (metres) bends its corners a little, as cut by hand; `shade` (0–1, ~0.3) sinks its lower part into shade. One Mesh with the shared toy material.
 */
export function toy(geo: BufferGeometry, color: Pick, finish: Finish = {}): Mesh {
  const seed = finish.seed ?? 1;
  const shaped = finish.rough ? jitter(geo, finish.rough, seed) : geo;
  const pick = typeof color === 'number' ? () => color : color;
  let shadedPick = pick;
  if (finish.shade) {
    // the islands' light: the lower a facet sits in the piece, the deeper it sinks into PALETTE.shade
    shaped.computeBoundingBox();
    const lo = shaped.boundingBox!.min.y, h = Math.max(1e-6, shaped.boundingBox!.max.y - lo), k = finish.shade;
    shadedPick = (c, n) => mix(pick(c, n), PALETTE.shade, k * (1 - (c.y - lo) / h));
  }
  const mesh = new Mesh(paint(shaped, shadedPick, finish.vary ?? 0.08, seed), material(finish));
  mesh.castShadow = true;
  return mesh;
}

const materials = new Map<string, MeshStandardMaterial>();
/** The toy material: colours from the facets, flat shaded; one per finish, shared by every piece. */
function material(f: Finish): MeshStandardMaterial {
  const key = `${f.roughness ?? 0.85}|${f.metalness ?? 0}|${f.emissive ?? 0}`;
  return materials.get(key) ?? materials.set(key, facets({ roughness: f.roughness ?? 0.85, metalness: f.metalness ?? 0, emissive: f.emissive ?? 0 })).get(key)!;
}

/**
 * Turns a thing built the usual way (meshes with MeshStandardMaterial colours) into the toy look in place:
 * facets painted in each material's colour with a little variation, flat shading. Textured, transparent,
 * glowing and skinned meshes are left as they are. Call it once, after building.
 */
export function toyLook(object: Object3D, finish: { vary?: number } = {}): void {
  const done = new Map<BufferGeometry, Map<number, BufferGeometry>>();
  let i = 0;
  object.traverse((o) => {
    if (!(o instanceof Mesh) || o instanceof SkinnedMesh || Array.isArray(o.material)) return;
    const m = o.material as Material & Partial<MeshStandardMaterial>;
    if (!(m instanceof MeshStandardMaterial) || m.map || m.transparent || m.vertexColors || (m.emissiveIntensity && m.emissive?.getHex())) return;
    // an instanced mesh keeps its own colour per instance: its facets are painted white and tinted by it
    const hex = o instanceof InstancedMesh && o.instanceColor ? 0xffffff : m.color.getHex();
    const byColor = done.get(o.geometry) ?? done.set(o.geometry, new Map()).get(o.geometry)!;
    o.geometry = byColor.get(hex) ?? byColor.set(hex, paint(cut(o.geometry, ++i), () => hex, finish.vary ?? 0.12, i)).get(hex)!;
    o.material = material({ roughness: m.roughness, metalness: m.metalness });
  });
}

/** The toy form of a plain primitive: a box with chamfered edges, a ball cut in facets; others as they are. */
function cut(geo: BufferGeometry, seed: number): BufferGeometry {
  const p = (geo as BufferGeometry & { parameters?: Record<string, number> }).parameters;
  if (geo.type === 'BoxGeometry' && p) return chamferedBox(p.width, p.height, p.depth, Math.min(p.width, p.height, p.depth) * 0.14);
  if (geo.type === 'SphereGeometry' && p) return jitter(new IcosahedronGeometry(p.radius, p.radius > 0.15 ? 2 : 1), p.radius * 0.05, seed);
  return geo.clone();
}

/**
 * All the toy pieces in `root` (toy, the ready shapes, toyLook) as ONE mesh: a whole tree, island or village is a
 * single draw call (the frame budget counts meshes). Keeps their places; the pieces must not move on their own
 * afterwards. Pieces of other materials are left out (keep them as they are).
 */
export function merge(root: Object3D, finish: Finish = {}): Mesh {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), parts: BufferGeometry[] = [];
  root.traverse((o) => {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh || !o.geometry.getAttribute('color')) return;
    const g = new BufferGeometry();
    for (const name of ['position', 'normal', 'color']) g.setAttribute(name, o.geometry.getAttribute(name).clone());
    g.applyMatrix4(o.matrixWorld.clone().premultiply(inverse));
    parts.push(g);
  });
  const mesh = new Mesh(parts.length ? mergeGeometries(parts) : new BufferGeometry(), material(finish));
  mesh.castShadow = true;
  mesh.name = root.name;
  return mesh;
}

/* ------------------------------------------------------------------ ready shapes */

/** A round leafy tree `height` metres tall: a crooked trunk and a crown of 3–4 faceted balls. One mesh, base at y = 0. */
export function roundTree(height = 0.6, options: { seed?: number; leaves?: number[] } = {}): Mesh {
  const seed = options.seed ?? 3, r = rng(seed), g = new Group();
  const greens = options.leaves ?? [PALETTE.grassLight, PALETTE.grass, PALETTE.leafDark];
  const crown = height * 0.36, trunkH = height - crown * 1.5;
  const trunk = jitter(new CylinderGeometry(crown * 0.13, crown * 0.22, trunkH, 7, 2), crown * 0.03, seed);
  trunk.translate(0, trunkH / 2 - 0.01, 0);
  g.add(toy(trunk, PALETTE.bark, { seed }));
  const balls = [[0, 0, 0, 1], [0.55, -0.25, 0.2, 0.62], [-0.5, -0.2, -0.15, 0.66], [0.1, 0.35, -0.35, 0.55]];
  balls.slice(0, 3 + (seed % 2)).forEach(([x, y, z, s], i) => {
    const b = blob(crown * s, seed * 7 + i, 1, 0.22);
    b.translate(x * crown, trunkH + crown * 0.55 + y * crown, z * crown);
    g.add(toy(b, (_c, n) => (n.y > 0.45 ? greens[0] : n.y > -0.2 ? greens[1] : greens[2]), { seed: seed + i, vary: 0.1 }));
  });
  g.rotation.set((r() - 0.5) * 0.15, r() * Math.PI * 2, (r() - 0.5) * 0.15);
  return named(merge(wrap(g)), 'Tree');
}

/** A pine `height` metres tall: three or four stacked crooked cones on a short trunk. One mesh, base at y = 0. */
export function pineTree(height = 0.8, options: { seed?: number; color?: number } = {}): Mesh {
  const seed = options.seed ?? 5, g = new Group(), w = height * 0.32, color = options.color ?? PALETTE.pine;
  const trunk = new CylinderGeometry(w * 0.12, w * 0.16, height * 0.2, 6);
  trunk.translate(0, height * 0.1, 0);
  g.add(toy(trunk, PALETTE.bark, { seed }));
  const tiers = 3 + (seed % 2);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, s = 1 - t * 0.55, h = (height * 0.85) / tiers * 1.5;
    const cone = jitter(new ConeGeometry(w * s, h, 7, 1), w * 0.06, seed + i);
    cone.translate(0, height * 0.16 + t * height * 0.62 + h / 2, 0);
    g.add(toy(cone, (_c, n) => (n.y > 0.55 ? mix(color, PALETTE.grassLight, 0.35) : n.y < -0.3 ? mix(color, 0x000000, 0.3) : color), { seed: seed + i * 3 }));
  }
  return named(merge(g), 'Pine');
}

/** A faceted stone `size` metres across, sitting on y = 0. */
export function rock(size = 0.2, options: { seed?: number; color?: number } = {}): Mesh {
  const geo = blob(size / 2, options.seed ?? 7, 0, 0.3, 0.7);
  geo.translate(0, size * 0.25, 0);
  return named(toy(geo, options.color ?? PALETTE.rock, { seed: options.seed, vary: 0.12 }), 'Rock');
}

/** A soft white cloud of a few lumps, `size` metres long, centred on the origin. One mesh. */
export function cloud(size = 0.6, options: { seed?: number; color?: number } = {}): Mesh {
  const seed = options.seed ?? 9, r = rng(seed), g = new Group();
  for (let i = 0; i < 5; i++) {
    const s = size * (0.18 + r() * 0.12), b = blob(s, seed + i, 1, 0.12, 0.75);
    b.translate((i / 4 - 0.5) * size * 0.75, (r() - 0.3) * s * 0.6, (r() - 0.5) * s * 0.6);
    g.add(toy(b, (_c, n) => (n.y > 0 ? options.color ?? PALETTE.white : mix(options.color ?? PALETTE.white, 0x9fb3c8, 0.35)), { seed: seed + i, vary: 0.04 }));
  }
  return named(merge(g), 'Cloud');
}

/**
 * A floating island `radius` metres across its grass: a grass cap hanging over its edge, an earth cone below in
 * layers (topsoil, earth, stone), roots hanging from it. The grass top is at y = 0: stand things on it. One mesh.
 */
export function island(radius = 0.5, options: { seed?: number; grass?: number; roots?: boolean } = {}): Mesh {
  const seed = options.seed ?? 7, R = radius, r = rng(seed), sides = 13, grass = options.grass ?? PALETTE.grass;
  const edge: Edge = Array.from({ length: sides }, (_, i) => ({ a: (i / sides) * Math.PI * 2 + (r() - 0.5) * 0.25, k: 0.88 + r() * 0.22 }));
  const k = R / 0.85, g = new Group();
  const cap = ringLoft(edge, [
    { s: 0.5, y: 0.045 * k, wobble: 0.1 }, { s: 1, y: 0, wobble: 0.04 }, { s: 1.05, y: -0.07 * k, wobble: 0.04 }, { s: 0.98, y: -0.13 * k, wobble: 0 },
  ], new Vector3(0, 0.06 * k, 0), seed + 4, true, R);
  g.add(toy(cap, (c, n) => (n.y > 0.5 ? (c.x > 0.2 * k ? PALETTE.grassLight : grass) : mix(grass, PALETTE.dirt, 0.2)), { seed: seed + 1, vary: 0.12 }));
  const earth = ringLoft(edge, [
    { s: 0.98, y: -0.13 * k, wobble: 0 }, { s: 0.95, y: -0.27 * k, wobble: 0.06 }, { s: 0.85, y: -0.32 * k, wobble: 0.08 },
    { s: 0.74, y: -0.5 * k, wobble: 0.12, dx: 0.03 * k }, { s: 0.55, y: -0.7 * k, wobble: 0.16, dx: 0.05 * k },
    { s: 0.34, y: -0.9 * k, wobble: 0.2, dx: 0.07 * k }, { s: 0.15, y: -1.06 * k, wobble: 0.25, dx: 0.09 * k },
  ], new Vector3(0.11 * k, -1.22 * k, -0.02 * k), seed + 6, false, R);
  const stone = rng(seed + 2);
  g.add(toy(earth, (c) => (c.y > -0.29 * k ? PALETTE.dirt : c.y > -0.52 * k ? (stone() < 0.15 ? 0x8d7a68 : PALETTE.earth) : stone() < 0.3 ? 0x6e6058 : PALETTE.earthDark), { seed: seed + 3, vary: 0.1 }));
  if (options.roots !== false) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.4, depth = (-0.55 - r() * 0.4) * k, s = R * Math.max(0.12, 0.66 + (depth / k + 0.55) * 1.1);
      const start = new Vector3(Math.cos(a) * s * 0.85, depth, -Math.sin(a) * s * 0.85), len = (0.3 + r() * 0.5) * k, pts = [start];
      for (let j = 1; j <= 4; j++) pts.push(new Vector3(start.x + Math.cos(a) * 0.05 * k * j + (r() - 0.5) * 0.08 * k, start.y - (len * j) / 4, start.z - Math.sin(a) * 0.05 * k * j));
      g.add(toy(taperedTube(pts, 0.026 * k, 0.004 * k, 5, 12), PALETTE.earthDark, { seed: i }));
    }
  }
  return named(merge(g), 'Island');
}

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);
/** A group inside a group, so the inner one's own turn is kept by merge. */
const wrap = (g: Group) => new Group().add(g) as Group;

/* ------------------------------------------------------------------ shared parts (the hundred things' sheets) */

/**
 * Cartoon eyes for a creature, a person or a robot: two glossy black ovals with a white glint, `spacing` apart
 * (centre to centre), each `size` tall; `whites: true` puts each on a white eyeball. Centred between the eyes,
 * looking along +Z: put it on the front of a head. One mesh.
 */
export function eyes(spacing: number, size: number, options: { whites?: boolean; color?: number } = {}): Mesh {
  const g = new Group(), r = size / 2;
  for (const s of [-1, 1]) {
    if (options.whites) {
      const white = new IcosahedronGeometry(r * 1.45, 1);
      white.scale(1, 1.1, 0.55);
      white.translate((s * spacing) / 2, 0, -r * 0.2);
      g.add(toy(white, PALETTE.white, { vary: 0.02, roughness: 0.3 }));
    }
    const pupil = new IcosahedronGeometry(r, 1);
    pupil.scale(0.85, 1.1, 0.5);
    pupil.translate((s * spacing) / 2, 0, options.whites ? r * 0.35 : 0);
    g.add(toy(pupil, options.color ?? PALETTE.black, { vary: 0.02, roughness: 0.25 }));
    const glint = new IcosahedronGeometry(r * 0.28, 0);
    glint.translate((s * spacing) / 2 - r * 0.3, r * 0.4, (options.whites ? r * 0.35 : 0) + r * 0.45);
    g.add(toy(glint, PALETTE.white, { vary: 0, roughness: 0.3, emissive: 0 }));
  }
  return named(merge(g, { roughness: 0.3 }), 'Eyes');
}

/**
 * A toy wheel of radius r and width w on an axle along X (as a car's wheel stands): a dark chunky tyre with
 * rounded shoulders, a coloured hub and a cap. One mesh centred on its axle: spin it with rotation.x.
 */
export function wheel(r: number, w: number, options: { hub?: number; tyre?: number } = {}): Mesh {
  const g = new Group(), tyre = options.tyre ?? 0x2a2b31, hub = options.hub ?? PALETTE.white;
  const profile = [[r * 0.58, -w / 2], [r * 0.9, -w / 2], [r, -w * 0.28], [r, w * 0.28], [r * 0.9, w / 2], [r * 0.58, w / 2]];
  const shape = new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), 14);
  g.add(toy(shape, tyre, { vary: 0.1 }));
  g.add(toy(new CylinderGeometry(r * 0.6, r * 0.6, w * 0.82, 10), hub, { vary: 0.06 }));
  g.add(toy(new CylinderGeometry(r * 0.22, r * 0.26, w * 0.98, 8), mix(hub, 0x000000, 0.25), { vary: 0.04 }));
  const m = merge(g);
  m.geometry.rotateZ(Math.PI / 2);
  return named(m, 'Wheel');
}

/**
 * A grass ground tile, the base of a little diorama (a house, a golf hole, a can pyramid): w × d, `height` thick,
 * grass on top hanging a little over its earth sides, chamfered; `round: true` makes it a disc of diameter w.
 * Its top is at y = 0. One mesh.
 */
export function ground(w: number, d: number, options: { height?: number; grass?: number; earth?: number; round?: boolean; seed?: number } = {}): Mesh {
  const h = options.height ?? Math.max(0.03, Math.min(w, d) * 0.1), grass = options.grass ?? PALETTE.grass, earth = options.earth ?? PALETTE.dirt;
  const seed = options.seed ?? 11, g = new Group();
  const body = options.round ? new CylinderGeometry(w / 2, w / 2 * 0.94, h, 14) : chamferedBox(w, h, d, h * 0.25);
  body.translate(0, -h / 2 - h * 0.12, 0);
  g.add(toy(body, (c, n) => (n.y > 0.5 ? grass : c.y > -h * 0.45 ? mix(earth, 0xffffff, 0.08) : mix(earth, 0x000000, 0.15)), { seed, vary: 0.1, rough: h * 0.06 }));
  const lip = options.round ? new CylinderGeometry(w / 2 + h * 0.08, w / 2 + h * 0.04, h * 0.28, 14) : chamferedBox(w + h * 0.16, h * 0.28, d + h * 0.16, h * 0.1);
  lip.translate(0, -h * 0.14, 0);
  g.add(toy(lip, (c, n) => (n.y > 0.5 ? grass : mix(grass, 0x000000, 0.18)), { seed: seed + 1, vary: 0.12, rough: h * 0.04 }));
  return named(merge(g), 'Ground');
}

