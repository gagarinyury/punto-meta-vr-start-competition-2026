// Punto's look for everything baked here (people and animals): the islands' rules taken from merci-start —
// facets() material (src/splash/models/kit.ts), lit() + evenFaces() (src/style/base.ts), the pale-pastel rule
// (src/styleguard.ts). A facet's colour: the pastel deepened, the top as it is, sides 20 % and undersides 35 % into
// the islands' violet shade, and each flat face a touch lighter or darker (both halves of one face alike).
import { THREE } from './figures-three.js';

export const SHADE = 0x2a1838;
/** One material for every figure: the colour is in the vertices. */
export const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 });
const WHITE = new THREE.Color(0xffffff), SHADE_C = new THREE.Color(SHADE), HSL = { h: 0, s: 0, l: 0 };
export const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).getHex();
/** styleguard.ts: a pale pastel gets deeper (lightness 0.7, saturation ×1.15); whites and greys stay. */
export function deepen(hex) {
  const c = new THREE.Color(hex); c.getHSL(HSL, THREE.SRGBColorSpace);
  const r = c.clone().convertLinearToSRGB(), chroma = Math.max(r.r, r.g, r.b) - Math.min(r.r, r.g, r.b);
  if (chroma > 0.15 && HSL.l > 0.78) c.setHSL(HSL.h, Math.min(1, HSL.s * 1.15), 0.7, THREE.SRGBColorSpace);
  return c.getHex();
}
/** The colour of one facet with normal `n` (unit) of a part numbered `seed`, written into `out` (a Color). */
export function facetColor(hex, n, seed, out) {
  const base = deepen(hex);
  out.setHex(n.y > 0.5 ? base : mix(base, SHADE, n.y < -0.5 ? 0.35 : 0.2));
  const h = Math.sin(Math.round(n.x * 20) * 12.9898 + Math.round(n.y * 20) * 78.233 + Math.round(n.z * 20) * 37.719 + (seed + 1) * 4.1) * 43758.5453;
  const t = (h - Math.floor(h) - 0.5) * 0.07 * 2;
  return out.lerp(t > 0 ? WHITE : SHADE_C, Math.abs(t));
}
