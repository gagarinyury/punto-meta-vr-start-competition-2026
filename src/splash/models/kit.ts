// Shared kit of the splash showcase models (src/splash/models/model-*.ts, Yury 15.11): seeded randomness,
// hand-cut low poly (jittered vertices, a colour per facet), tapered tubes for roots and cables, faceted blobs.
// Every builder is deterministic: the same seed gives the same model.
import {
  AdditiveBlending,
  NormalBlending,
  BufferGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Shape,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';

export const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** One material for every painted facet model: the colour comes from the facets. */
export const facets = (extra: Partial<{ roughness: number; metalness: number; emissive: number; emissiveIntensity: number }> = {}) =>
  new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: extra.roughness ?? 0.88, metalness: extra.metalness ?? 0, emissive: extra.emissive ?? 0, emissiveIntensity: extra.emissiveIntensity ?? 1 });

/** Moves every vertex a little, the same at a seam (so the surface stays closed). */
export function jitter(geo: BufferGeometry, amount: number, seed: number, keep?: (v: Vector3) => boolean): BufferGeometry {
  const r = rng(seed), pos = geo.getAttribute('position'), seen = new Map<string, [number, number, number]>(), v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let d = seen.get(key);
    if (!d) { d = keep?.(v) ? [0, 0, 0] : [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]; seen.set(key, d); }
    pos.setXYZ(i, v.x + d[0], v.y + d[1], v.z + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A colour per triangle: pick(centre, normal) gives the base colour, and each facet is a little lighter or
 * darker (vary, 0..1), as a hand-painted low-poly model.
 */
export function paint(geo: BufferGeometry, pick: (centre: Vector3, normal: Vector3) => number, vary = 0.08, seed = 1): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position'), r = rng(seed), colors: number[] = [], c = new Color();
  const a = new Vector3(), b = new Vector3(), d = new Vector3(), centre = new Vector3(), n = new Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); d.fromBufferAttribute(pos, i + 2);
    centre.copy(a).add(b).add(d).divideScalar(3);
    n.copy(b).sub(a).cross(d.clone().sub(a)).normalize();
    c.setHex(pick(centre, n));
    c.offsetHSL(0, 0, (r() - 0.5) * vary);
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** A round faceted lump (a crown of leaves, a stone, a bush). */
export function blob(radius: number, seed: number, detail = 1, rough = 0.18, squash = 1): BufferGeometry {
  const geo = new IcosahedronGeometry(radius, detail);
  geo.scale(1, squash, 1);
  return jitter(geo, radius * rough, seed);
}

/** A tube along points that thins from r0 to r1 (roots, cables, vines). */
export function taperedTube(points: Vector3[], r0: number, r1: number, radial = 5, segments = 18): BufferGeometry {
  const curve = new CatmullRomCurve3(points);
  const geo = new TubeGeometry(curve, segments, 1, radial, false);
  const pos = geo.getAttribute('position'), p = new Vector3(), centre = new Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, r = r0 + (r1 - r0) * t;
    curve.getPointAt(t, centre);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, k).sub(centre).multiplyScalar(r).add(centre);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export const named = <T extends Object3D>(m: T, name: string, x = 0, y = 0, z = 0): T => {
  m.name = name;
  m.position.set(x, y, z);
  return m;
};

/** An island's outline: one direction and one radius factor per side (the cap and the rock share it). */
export type Edge = { a: number; k: number }[];
export type Ring = { s: number; y: number; wobble: number; dx?: number; dz?: number };
/**
 * Triangles between rings of an outline (each ring a scale of radius R and a height), closed by a point:
 * the earth under a floating island. endUp: the closing point is above the rings (a cap) instead of below.
 * rising: the rings go up (a cone standing on its base, a volcano) rather than down, so the sides turn the
 * other way round to face out.
 */
export function ringLoft(edge: Edge, rings: Ring[], end: Vector3, seed: number, endUp: boolean, R: number, rising = false): BufferGeometry {
  const r = rng(seed), n = edge.length;
  const pts = rings.map((ring) => edge.map(({ a, k }) => {
    const s = R * k * ring.s * (1 + (r() - 0.5) * ring.wobble);
    return new Vector3(Math.cos(a) * s + (ring.dx ?? 0), ring.y + (r() - 0.5) * ring.wobble * 0.3, -Math.sin(a) * s + (ring.dz ?? 0));
  }));
  const tri: number[] = [], push = (...v: Vector3[]) => v.forEach((p) => tri.push(p.x, p.y, p.z));
  for (let k = 0; k < pts.length - 1; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = pts[k][i], b = pts[k][j], c = pts[k + 1][i], d = pts[k + 1][j];
    if (rising) { push(a, b, c); push(b, d, c); } else { push(a, c, b); push(b, c, d); }
  }
  const last = pts[pts.length - 1];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; endUp ? push(end, last[i], last[j]) : push(end, last[j], last[i]); }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(tri, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A flat slab of a polygon [x, z][] with a chamfered rim (the base of a diorama), its top at y = top. */
export function flatSlab(points: [number, number][], depth: number, bevel: number, top: number): BufferGeometry {
  const shape = new Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, top - depth - bevel, 0);
  return geo;
}

/** A box w × h × d with chamfered edges r, centred: the soft toy-stone look of the concepts. */
export function bevelBox(w: number, h: number, d: number, r: number, segments = 1): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-w / 2 + r, -h / 2 + r);
  shape.lineTo(w / 2 - r, -h / 2 + r);
  shape.lineTo(w / 2 - r, h / 2 - r);
  shape.lineTo(-w / 2 + r, h / 2 - r);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: segments, curveSegments: 1 });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  return geo;
}

/** A small round low-poly tree: a short trunk and a faceted crown of two or three balls. */
export function roundTree(name: string, trunkH: number, crown: number, seed: number, greens = [0x6cc23e, 0x4c9d30, 0x3a8526]): Group {
  const g = new Group(), r = rng(seed);
  g.name = name;
  const trunk = jitter(new CylinderGeometry(crown * 0.14, crown * 0.22, trunkH, 6, 1), crown * 0.02, seed);
  trunk.translate(0, trunkH / 2 - 0.01, 0);
  g.add(named(new Mesh(paint(trunk, () => 0x7a4a2b, 0.08, seed), facets()), 'Trunk'));
  const top = trunkH + crown * 0.6;
  [[0, 0, 0, 1], [0.5, -0.3, 0.15, 0.6], [-0.45, -0.25, -0.2, 0.62]].slice(0, 2 + (seed % 2)).forEach(([x, y, z, s], i) => {
    const b = blob(crown * s, seed * 5 + i, 1, 0.2);
    b.translate(x * crown, top + y * crown, z * crown);
    g.add(named(new Mesh(paint(b, (c, n) => (n.y > 0.45 ? greens[0] : n.y > -0.2 ? greens[1] : greens[2]), 0.1, seed + i), facets()), `Crown${i}`));
  });
  g.rotation.y = r() * Math.PI * 2;
  return g;
}

/** A colour per vertex (blended across each facet): gradients, as a top lit warmer than the bottom. */
export function shade(geo: BufferGeometry, pick: (p: Vector3, normal: Vector3) => number): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), colors: number[] = [], c = new Color(), p = new Vector3(), n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    c.setHex(pick(p.fromBufferAttribute(pos, i), n.fromBufferAttribute(nor, i)));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}
/** A colour between two (hex), t 0..1. */
export const mix = (a: number, b: number, t: number) => new Color(a).lerp(new Color(b), Math.min(1, Math.max(0, t))).getHex();

/** Glowing lines along the sharp edges of a form (the concepts' cyan wire on glass and plastic). */
export function edgeGlow(geo: BufferGeometry, color = 0x7fefff, opacity = 0.6, angle = 20): LineSegments {
  const l = new LineSegments(new EdgesGeometry(geo, angle), new LineBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  l.name = 'EdgeGlow';
  return l;
}

/** A flat star of n points (outer radius ro, inner ri). */
export function starShape(n: number, ro: number, ri: number): Shape {
  const s = new Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** A glowing material that ignores light (lava, beams, sparks), optionally see-through and additive. */
export const glowMat = (color: number, opacity = 1) =>
  new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: opacity < 1 ? AdditiveBlending : NormalBlending, depthWrite: opacity >= 1, toneMapped: false });

/** Short glowing streaks flying out from a centre (sparks): count, distance range, within a cone of angles. */
export function streaks(count: number, centre: Vector3, from: number, to: number, color: number, seed: number, angles: [number, number][] = [[0, Math.PI * 2]]): Group {
  const g = new Group(), r = rng(seed), geo = new CylinderGeometry(0.004, 0.004, 1, 4), mat = glowMat(color);
  g.name = 'Sparks';
  for (let i = 0; i < count; i++) {
    const [a0, a1] = angles[i % angles.length], a = a0 + r() * (a1 - a0);
    const dir = new Vector3(Math.cos(a), Math.sin(a), (r() - 0.3) * 0.6).normalize();
    const m = new Mesh(geo, mat);
    m.name = `Spark${i}`;
    m.position.copy(centre).addScaledVector(dir, from + r() * (to - from));
    m.scale.set(1, 0.03 + r() * 0.05, 1);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    g.add(m);
  }
  return g;
}
