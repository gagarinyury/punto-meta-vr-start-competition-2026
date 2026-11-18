// Fire and smoke in Punto's look (17.11, from the storyboard concepts/fx/boom-frames.png): faceted lumps with a toon
// shader — the colour in hard steps from the hot centre (white, yellow, orange, dark red), facets turned to the eye
// hotter than the rims; as a lump cools it turns into grey toon-lit smoke, and a noise dissolve eats holes into it
// with a bright edge, the inside of the lump glowing like an ember through them. One draw call for all the lumps.
//
//   const lumps = flameLumps(16);                 // up to 16 lumps; set each one's place, size, heat, dissolve per frame
//   boom2({ size })                               // the explosion of the storyboard, built on it (an Fx for spawn)
import {
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import type { Fx } from './fx/core.js';
import { blob } from './splash/models/kit.js';
import { chamferedBox, toy } from './style/base.js';
import { type EffectOptions, toyEffect } from './toyfx.js';

// a plank of the crate: long, thin, painted white for the instance colour
const PLANK = toy(chamferedBox(1, 0.12, 0.26, 0.03), 0xffffff, { vary: 0.14 }).geometry;

const srgb = (hex: number) => ({ value: new Color(hex).convertLinearToSRGB() });

/** The colours of a kind of fire: four hot steps (hottest first), its smoke lit from above (top, side, underside), the
 *  ember inside, and how see-through its smoke is. */
export interface FlamePalette {
  hot: [number, number, number, number];
  smoke: [number, number, number];
  ember: number;
  smokeAlpha?: number;
}
/** Ready kinds of fire: the same shader, other colours. */
export const FLAMES = {
  fire: { hot: [0xfff4c2, 0xffc93a, 0xff7a2f, 0xb3302a], smoke: [0xa59a9c, 0x7c7079, 0x4e4352], ember: 0xff7a2f },
  plasma: { hot: [0xffffff, 0x9ff8ff, 0x3ad8ff, 0x2a5cd0], smoke: [0x8fa8c8, 0x5c7096, 0x34405e], ember: 0x6ff3ff },
  acid: { hot: [0xf4ffc2, 0xc8f03a, 0x5fb532, 0x2f7d3a], smoke: [0x9cb08a, 0x6f8a62, 0x45583e], ember: 0x9fe04a },
  magic: { hot: [0xffffff, 0xffb8f0, 0xb06cf0, 0x5a2a9a], smoke: [0xb4a0c8, 0x8a74a6, 0x5a4676], ember: 0xff6fa8 },
  ice: { hot: [0xffffff, 0xd8f6ff, 0x8fd8ff, 0x3a8cf0], smoke: [0xd8e4ee, 0xa8bccc, 0x7088a0], ember: 0xbff6ff, smokeAlpha: 0.6 },
  smoke: { hot: [0xd8d0d4, 0xb4acb0, 0x948a90, 0x6e6870], smoke: [0xa59a9c, 0x7c7079, 0x4e4352], ember: 0x948a90 },
} satisfies Record<string, FlamePalette>;

/** The toon fire material: per lump `aHeat` (1 white-hot … 0 cold smoke), `aDissolve` (0 whole … 1 gone), `aSeed`. */
export function flameMaterial(palette: FlamePalette = FLAMES.fire): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    // smoke turns see-through as it cools (Yury, 17.11: «более призрачным»): fire stays solid
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSmokeAlpha: { value: palette.smokeAlpha ?? 0.5 },
      // hot bands, hottest first
      uHot0: srgb(palette.hot[0]), uHot1: srgb(palette.hot[1]), uHot2: srgb(palette.hot[2]), uHot3: srgb(palette.hot[3]),
      // smoke, lit from above: top, side, underside
      uSmoke0: srgb(palette.smoke[0]), uSmoke1: srgb(palette.smoke[1]), uSmoke2: srgb(palette.smoke[2]),
      // the inside, seen through the holes
      uEmber: srgb(palette.ember), uEmberCold: srgb(0x3a2430),
    },
    vertexShader: /* glsl */ `
      attribute float aHeat;
      attribute float aDissolve;
      attribute float aSeed;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vUp;
      varying float vHeat;
      varying float vDissolve;
      varying float vSeed;
      void main() {
        vLocal = position;
        vHeat = aHeat;
        vDissolve = aDissolve;
        vSeed = aSeed;
        mat4 model = modelMatrix * instanceMatrix;
        vec4 mv = viewMatrix * model * vec4(position, 1.0);
        vNormal = normalize(mat3(viewMatrix) * mat3(model) * normal);
        vUp = normalize(mat3(viewMatrix) * vec3(0.25, 1.0, 0.15));
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uSmokeAlpha;
      uniform vec3 uHot0, uHot1, uHot2, uHot3, uSmoke0, uSmoke1, uSmoke2, uEmber, uEmberCold;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vUp;
      varying float vHeat;
      varying float vDissolve;
      varying float vSeed;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        // the holes: a crisp noise dissolve over the lump's own surface
        float n = noise(vLocal * 3.4 + vSeed * 13.7) * 0.6 + noise(vLocal * 7.9 + vSeed * 5.3) * 0.4;
        // the noise sits mostly in 0.2..0.8: the dissolve runs over that, so holes show from its very start
        float cut = vDissolve > 0.001 ? mix(0.22, 0.8, vDissolve) : -1.0;
        if (n < cut) discard;
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vView);
        // each flat facet a touch lighter or darker, as every toy piece
        float facet = (hash(floor(N * 9.0) + vSeed) - 0.5) * 0.08;
        vec3 colour;
        if (!gl_FrontFacing) {
          // the inside: an ember while there is heat, dark when cold
          colour = vHeat > 0.2 ? uEmber : uSmoke2; // see-through smoke must not show an ember everywhere inside it
        } else if (vHeat > 0.2) {
          float facing = clamp(dot(N, V), 0.0, 1.0);
          float t = vHeat * (0.4 + 0.6 * facing) + (n - 0.5) * 0.1 + facet;
          colour = t > 0.8 ? uHot0 : t > 0.6 ? uHot1 : t > 0.38 ? uHot2 : uHot3;
        } else {
          float light = dot(N, vUp) + facet * 2.0;
          colour = light > 0.35 ? uSmoke0 : light > -0.15 ? uSmoke1 : uSmoke2;
        }
        // the bright rim of a hole being eaten
        // solid while it burns, a ghost once it is smoke; the bright rims of the holes stay solid
        float alpha = mix(uSmokeAlpha, 1.0, smoothstep(0.12, 0.3, vHeat));
        // the rims of the holes: glowing while it burns and as the holes open, grey ash at the end
        if (cut > 0.0 && n < cut + 0.045) { colour = vHeat > 0.2 ? uHot1 : vDissolve < 0.45 ? uEmber : uSmoke1; alpha = vDissolve < 0.45 ? 1.0 : alpha; }
        gl_FragColor = vec4(colour, alpha);
      }`,
  });
}

/** Up to `count` toon fire lumps in one InstancedMesh; set each with `set(i, …)` and call `commit()` once a frame. */
export function flameLumps(count: number, material = flameMaterial()) {
  const geometry = toy(blob(0.5, 7, 1, 0.2).toNonIndexed(), 0xffffff).geometry.clone();
  const heat = new InstancedBufferAttribute(new Float32Array(count), 1);
  const dissolve = new InstancedBufferAttribute(new Float32Array(count), 1);
  const seed = new InstancedBufferAttribute(new Float32Array(count).map((_, i) => (i * 0.6180339) % 1), 1);
  geometry.setAttribute('aHeat', heat);
  geometry.setAttribute('aDissolve', dissolve);
  geometry.setAttribute('aSeed', seed);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const m = new Matrix4(), q = new Quaternion(), s = new Vector3();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
  return {
    mesh,
    /** lump `i` at `at`, `size` across, turned by `turn`, with its heat and dissolve */
    set(i: number, at: Vector3, size: number, turn: Quaternion | undefined, h: number, d: number) {
      mesh.setMatrixAt(i, m.compose(at, turn ?? q.identity(), s.setScalar(Math.max(size, 0))));
      heat.setX(i, h);
      dissolve.setX(i, d);
    },
    /** only lump `i`'s heat and dissolve (its matrix set by the caller on `mesh`) */
    look(i: number, h: number, d: number) {
      heat.setX(i, h);
      dissolve.setX(i, d);
    },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
      heat.needsUpdate = true;
      dissolve.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

const random = (seed: number) => {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * The explosion of the storyboard (concepts/fx/boom-frames.png), `size` = the size of what blows up:
 * 0.05 s a white-hot core and a star flash; 0.2 s a lumpy cluster, yellow cores and orange around them, the outer
 * lumps dark red, a shock ring on the floor, needle sparks, debris on arcs; 0.5 s the lumps rise and cool into grey
 * smoke with orange insides, a rough mushroom, holes eaten into them; 1 s a few lacy grey lumps, a scorch on the floor.
 */
export function boom2(o: EffectOptions = {}): Fx {
  const size = o.size ?? 1;
  const r = random(o.seed ?? Math.floor(Math.random() * 1e9));
  const object = new Group();
  object.name = 'ToyEffect';
  const N = 14;
  const lumps = flameLumps(N + 1); // + the core
  object.add(lumps.mesh);
  // each lump: where it starts, where it goes, how big, how hot, when it goes
  const start = Array.from({ length: N }, () => new Vector3());
  const vel = Array.from({ length: N }, () => new Vector3());
  const big = new Float32Array(N), heat0 = new Float32Array(N), cool = new Float32Array(N), gone = new Float32Array(N), rise = new Float32Array(N);
  const turn = Array.from({ length: N }, () => new Quaternion());
  for (let i = 0; i < N; i++) {
    const dir = new Vector3(r() * 2 - 1, r() * 1.4 - 0.2, r() * 2 - 1).normalize();
    const out = 0.12 + r() * 0.22;
    start[i].copy(dir).multiplyScalar(out * size).add(new Vector3(0, 0.35 * size, 0));
    // out and up; the top ones rise fastest (the mushroom)
    vel[i].copy(dir).multiplyScalar((0.5 + r() * 0.5) * size).add(new Vector3(0, (0.25 + Math.max(0, dir.y) * 0.9) * size, 0));
    big[i] = (0.24 + r() * 0.2) * size * (1 - out);
    heat0[i] = 1 - out * 1.6; // the outer ones are cooler: dark red at once
    cool[i] = 0.42 + r() * 0.14;
    gone[i] = 0.22 + r() * 0.38;
    rise[i] = dir.y > 0.2 ? 1.7 : 0.5; // the top of the cluster rises into the mushroom's cap
    turn[i].setFromAxisAngle(new Vector3(r(), r(), r()).normalize(), r() * 6.28);
  }
  // the rest of the storyboard from the toy pieces: a star flash, sparks, debris, the shock ring
  const burst = toyEffect([
    { shape: 'star', color: [0xfff4c2, 0xffc93a], glow: true, count: 3, size: [0.9, 1.1], fly: 'none', spin: [0, 0.2], life: 0.14, grow: 'flash' },
    { shape: 'needle', color: [0xffc93a, 0xfff4c2], glow: true, count: 12, size: [0.06, 0.1], fly: 'all', speed: [3, 4.5], drag: 3, life: [0.2, 0.35], delay: [0.02, 0.06], grow: 'shrink', stretch: 5 },
  ], { size, seed: o.seed });
  burst.object.position.y = 0.35 * size; // at the core
  object.add(burst.object);
  // the crate's planks fly from the floor and land on it; the shock ring runs along the floor
  const ground = toyEffect([
    { shape: PLANK, color: [0xa06a3a, 0xc98a4b, 0x7a4a2b], count: 9, size: [0.28, 0.42], fly: 'up', spread: 1.3, speed: [2, 3.2], gravity: 7, floor: true, spin: [6, 12], life: 2, grow: 'pop', start: 0.15 },
    { shape: 'ring', color: 0xff7a2f, glow: true, count: 1, size: 1.25, fly: 'none', life: 0.4, delay: 0.06, grow: 'wave' },
  ], { size, seed: (o.seed ?? 1) + 1 });
  object.add(ground.object);
  // a scorch on the floor
  const scorch = new InstancedMesh(new CircleGeometry(0.5, 9), new MeshBasicMaterial({ color: 0x241c2c }), 1);
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.003 * size;
  scorch.setMatrixAt(0, new Matrix4().makeScale(0, 0, 0));
  object.add(scorch);
  const at = new Vector3(), core = new Vector3(0, 0.35 * size, 0), m = new Matrix4();
  const END = 1.8;
  return {
    object,
    update(delta, age) {
      // the core: white-hot, swells in 60 ms and is swallowed by the cluster
      const c = age < 0.18 ? ease(age / 0.06) * (1 - clamp01((age - 0.08) / 0.1)) : 0;
      lumps.set(N, core, 0.55 * size * c, undefined, 1, 0);
      for (let i = 0; i < N; i++) {
        const t = age - 0.03;
        if (t < 0) {
          lumps.set(i, core, 0, undefined, 1, 0);
          continue;
        }
        // flies out fast and slows (drag), keeps rising
        const k = 1 - Math.exp(-t * 3.2);
        at.copy(vel[i]).multiplyScalar(k / 3.2).add(start[i]);
        at.y += t * t * 0.32 * size * rise[i];
        const s = big[i] * (ease(t / 0.1) * (1 + 0.25 * clamp01(t / 1.2)));
        // hot for a while (yellow cores at 0.2 s), then quickly grey (smoke by 0.5 s)
        const h = Math.max(0, heat0[i] * (1 - (t / cool[i]) ** 2));
        const d = clamp01((t - gone[i]) / 0.75);
        lumps.set(i, at, s, turn[i], h, d);
      }
      lumps.commit();
      scorch.setMatrixAt(0, m.makeScale(0.75 * size * ease((age - 0.1) / 0.5), 0.75 * size * ease((age - 0.1) / 0.5), 1));
      scorch.instanceMatrix.needsUpdate = true;
      burst.update(delta, age);
      ground.update(delta, age);
      return age < END;
    },
    dispose() {
      lumps.dispose();
      scorch.geometry.dispose();
      (scorch.material as MeshBasicMaterial).dispose();
      scorch.dispose();
      burst.dispose?.();
      ground.dispose?.();
    },
  };
}
