// The style guard: whatever a made game puts into the room comes out in Punto's look (the islands', src/style.ts),
// even when its code built it the plain Three.js way. The host runs it on every thing a made game creates
// (live.ts, createTransformEntity) and again now and then for pieces it adds later.
//
// It changes things in place and never swaps a material: games keep references to their materials and recolour
// them (a target turning red when hit, a button lighting up), and that must keep working. So:
//  - smooth primitives get the toy cut: a ball cut in facets, a cylinder, cone or ring of few sides (the geometry is
//    replaced, the material kept); a box stays as it is, sharp-edged (Yury, 18.11: the chamfer spoilt more than it gave);
//  - their materials go flat-shaded and matte, with no metal shine;
//  - a pale pastel colour gets deeper (the islands' colours are strong: yellow is 0xffb21a, not cream);
//  - the islands' light goes into the material's shader: tops as they are, sides and undersides sunk towards the
//    islands' violet shade, each flat face a little lighter or darker (islandsLight below).
// Left as they are: what our own helpers made (vertex colours), glowing, see-through and textured pieces, skinned
// meshes, sprites and lines, and anything marked `userData.keepLook = true`.
import { Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Mesh, type BufferGeometry, type Material, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, type Object3D, SkinnedMesh, SRGBColorSpace, TorusGeometry } from '@iwsdk/core';
import { jitter } from './style/base.js';
import { lightOnly } from './blend.js';

type Params = Record<string, number>;
const cut = new WeakMap<BufferGeometry, BufferGeometry>(); // a plain geometry -> its toy cut (shared, like the original)
const seen = new WeakSet<Material>();
const hsl = { h: 0, s: 0, l: 0 };

/** The toy cut of a smooth primitive, or the geometry itself when it is something else. */
function toyCut(geo: BufferGeometry): BufferGeometry {
  const done = cut.get(geo);
  if (done) return done;
  const p = (geo as BufferGeometry & { parameters?: Params }).parameters;
  let out = geo;
  if (p) {
    const sides = (r: number) => (r > 0.25 ? 10 : 8);
    if (geo.type === 'SphereGeometry') out = jitter(new IcosahedronGeometry(p.radius, p.radius > 0.15 ? 2 : 1), p.radius * 0.04, 3);
    else if (geo.type === 'CylinderGeometry' && p.radialSegments > 10) out = new CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, sides(Math.max(p.radiusTop, p.radiusBottom)), 1, p.openEnded as unknown as boolean, p.thetaStart, p.thetaLength);
    else if (geo.type === 'ConeGeometry' && p.radialSegments > 10) out = new ConeGeometry(p.radius, p.height, sides(p.radius), 1, p.openEnded as unknown as boolean, p.thetaStart, p.thetaLength);
    else if (geo.type === 'TorusGeometry' && (p.radialSegments > 8 || p.tubularSegments > 18)) out = new TorusGeometry(p.radius, p.tube, 6, 16, p.arc);
  }
  cut.set(geo, out);
  return out;
}

/** Matte, flat-shaded, no metal; a pale pastel colour deepened. Once per material. */
function toyMaterial(m: Material): void {
  if (seen.has(m)) return;
  seen.add(m);
  if (m instanceof MeshStandardMaterial) {
    m.metalness = 0;
    m.roughness = Math.max(m.roughness, 0.75);
  }
  if (m instanceof MeshStandardMaterial || m instanceof MeshLambertMaterial || m instanceof MeshPhongMaterial) {
    m.flatShading = true;
    const c: Color = m.color;
    // as the colour was written (0xffc8d8), not in the linear working space; a pastel is light AND clearly tinted
    // (its channels well apart): white and the off-whites (0xf6f3ec, PALETTE.white) stay as they are
    c.getHSL(hsl, SRGBColorSpace);
    const rgb = c.clone().convertLinearToSRGB(), chroma = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    if (chroma > 0.15 && hsl.l > 0.78) c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), 0.7, SRGBColorSpace);
    islandsLight(m);
    m.needsUpdate = true;
  }
}

/*
 * The islands' light in the material's own shader (what lit() and the facet shades bake into our pieces, here
 * without touching the geometry, so the game's own colour and its recolouring still work): a face looking up keeps
 * its colour, a side sinks 20 % into PALETTE.shade (the islands' violet), an underside 35 %; and each flat face is a
 * little lighter or darker than its neighbours (by its normal in the piece's own space, so it holds still as the
 * piece turns). Runs before what was there (the depth occlusion chains onto it in the same way).
 */
const SHADE = new Color(0x2a1838); // PALETTE.shade, in the linear working space
function islandsLight(m: Material): void {
  const before = m.onBeforeCompile?.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before?.(shader, renderer);
    shader.uniforms.toyShade = { value: SHADE };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vToyPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvToyPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vToyPos;\nuniform vec3 toyShade;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float up = normalize(transpose(mat3(viewMatrix)) * normal).y;
          float sink = up > 0.5 ? 0.0 : (up < -0.5 ? 0.35 : 0.2);
          vec3 face = normalize(cross(dFdx(vToyPos), dFdy(vToyPos)));
          float jitter = fract(sin(dot(floor(face * 6.0 + 0.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453) - 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, toyShade, sink) * (1.0 + jitter * 0.12);
        }`,
      );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|punto-islands-light`;
}

/** Whether a piece is left as it is: ours already, glowing, see-through, textured, skinned or marked. */
function keep(mesh: Mesh, m: Material): boolean {
  const s = m as Material & Partial<MeshStandardMaterial>;
  return (
    mesh instanceof SkinnedMesh ||
    mesh.userData.keepLook === true ||
    !!s.vertexColors ||
    !!s.map ||
    s.transparent === true ||
    (!!s.emissive && s.emissive.getHex() !== 0 && (s.emissiveIntensity ?? 1) > 0) ||
    !(m instanceof MeshStandardMaterial || m instanceof MeshLambertMaterial || m instanceof MeshPhongMaterial)
  );
}

/** Brings everything under `root` into Punto's look in place (see the top of this file). Safe to run again. */
export function styleGuard(root: Object3D): void {
  // `keepLook` on a group keeps all of it as it is (18.11: a molecule, a solar system, a real engine are built true to
  // life, smooth spheres and all — the toy cut made a dopamine molecule a heap of lumps)
  const walk = (o: Object3D): void => {
    if (o.userData.keepLook === true) return;
    guard(o);
    for (const child of o.children) walk(child);
  };
  walk(root);
}

function guard(o: Object3D): void {
  {
    // additive light of any made thing — its own or an effect's — never darkens the room (src/blend.ts)
    const anyMaterial = (o as Mesh).material as Material | Material[] | undefined;
    if (anyMaterial) for (const m of Array.isArray(anyMaterial) ? anyMaterial : [anyMaterial]) lightOnly(m);
    if (!(o instanceof Mesh)) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.some((m) => keep(o, m))) return;
    for (const m of materials) toyMaterial(m);
    // one material per face group (a box painted side by side) keeps its geometry: a new cut has no groups
    if (!Array.isArray(o.material)) o.geometry = toyCut(o.geometry);
  }
}
