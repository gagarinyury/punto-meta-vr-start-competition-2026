// The life of a thing (18.11): what a made thing does all the time, sitting on it — smoke or steam from its chimney,
// a fire, a light. Endless: add fx.object to the thing (or to its mark) and call fx.update(delta, age).
// Rebuilt from reference videos frame by frame (public/_ref/life-*.jpg, not in git):
//   smoke — Gabriel Aguiar, «Stylized Smoke»: white puffs in flat tones crowd out of the mouth, grow as they rise,
//           and are eaten by big holes into ribbons with crisp edges; ours are faceted lumps, as our things;
//   fire  — «Stylized realtime mesh fire» and a toon bonfire: ONE fat teardrop with lumps running up it, pale yellow
//           at the foot through orange to a red tip torn into tongues; small tongues break off, rise and shrink;
//           a few embers; a pool of light under it;
//   light — a soft halo round the source and its pool of light on the surface below.
// The headset first: every part is one draw call, the noise runs per vertex and never per pixel, smoke and flame are
// opaque (nothing is blended but the glow), and the glow only ADDS light and leaves the frame's alpha alone — over the
// real room it lights the table instead of veiling it (as lightOnly in src/splash/ingame-title.ts).
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  type Object3D,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  OneFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  ZeroFactor,
} from '@iwsdk/core';
import type { Fx } from './fx/core.js';
import { CLOUDS, NOISE } from './pyro.js';

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const smooth = (a: number, b: number, t: number) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};
/** A raw shader writes a colour's own numbers: undo the renderer's conversion. */
export const shown = (hex: number) => new Color(hex).convertLinearToSRGB();
export const blend = (a: number, b: number, t: number) => new Color(a).lerp(new Color(b), t).getHex();
/** A steady random number 0…1 for the i-th piece on its n-th turn (no state, no allocation). */
export const hash = (i: number, n: number, k: number) => {
  const s = Math.sin(i * 127.1 + n * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
/**
 * An effect ready to be shown: run once at age 0, so that nothing of it is drawn at its untouched full size in the
 * frame between adding its object and its first update (a cloud of metre-wide puffs for one frame).
 */
export function ready<T extends Fx>(fx: T): T {
  fx.update(0, 0);
  return fx;
}
/** A candle's unsteadiness, −1…1. */
export const waver = (t: number, s: number) => 0.6 * Math.sin(t * 11.3 + s) * Math.sin(t * 6.7 + s * 2.1) + 0.4 * Math.sin(t * 23.1 + s * 3.7);

/** A round ball, radius 0.5, its corners shared (IcosahedronGeometry repeats each: 960 → 162 for detail 3). */
export function ball(detail: number): BufferGeometry {
  const src = new IcosahedronGeometry(0.5, detail);
  const pos = src.getAttribute('position');
  const seen = new Map<string, number>(), points: number[] = [], index: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let at = seen.get(key);
    if (at === undefined) {
      at = points.length / 3;
      seen.set(key, at);
      points.push(x, y, z);
    }
    index.push(at);
  }
  src.dispose();
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(points, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(points.map((v) => v * 2), 3));
  geo.setIndex(index);
  return geo;
}

// ---------------------------------------------------------------------------------------------------------------
// light

/** Only light: added to what is there, the frame's alpha left as it was (over the real room: no dark veil). */
const LIGHT_ONLY = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

/** The halo: a ball bright where it faces you and gone at its rim, a hot heart in its middle. */
function haloMaterial(colour: number): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT_ONLY,
    uniforms: { uColour: { value: shown(colour) }, uAmount: { value: 1 }, uCore: { value: 0.5 } },
    vertexShader: /* glsl */ `
      varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vF = clamp(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)), 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour; uniform float uAmount, uCore; varying float vF;
      void main() {
        float f = vF * vF * sqrt(vF);
        gl_FragColor = vec4((uColour * f + vec3(1.0, 0.95, 0.85) * pow(vF, 10.0) * uCore) * uAmount, 1.0);
      }`,
  });
}

/** The pool of light on the surface under a source: brightest in the middle, gone at its edge. */
function poolMaterial(colour: number): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT_ONLY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms: { uColour: { value: shown(colour) }, uAmount: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour; uniform float uAmount; varying vec2 vUv;
      void main() {
        float f = clamp(1.0 - length(vUv - 0.5) * 2.0, 0.0, 1.0);
        gl_FragColor = vec4(uColour * f * f * uAmount, 1.0);
      }`,
  });
}

/** A halo `wide` across at `at`, and its pool `spread` across lying `above` under it. Two draw calls. */
export function glow(colour: number, wide: number, spread: number, above: number, core = 0.5) {
  const halo = new Mesh(ball(2), haloMaterial(colour));
  halo.scale.setScalar(wide);
  (halo.material as ShaderMaterial).uniforms.uCore.value = core;
  const pool = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMaterial(colour));
  pool.position.y = -above + 0.002;
  pool.scale.setScalar(spread);
  return {
    halo,
    pool,
    set(halo_: number, pool_: number) {
      (halo.material as ShaderMaterial).uniforms.uAmount.value = halo_;
      (pool.material as ShaderMaterial).uniforms.uAmount.value = pool_;
    },
    dispose() {
      halo.geometry.dispose();
      pool.geometry.dispose();
      (halo.material as ShaderMaterial).dispose();
      (pool.material as ShaderMaterial).dispose();
    },
  };
}

/**
 * Endless halo + light pool below (`size` = source width, m; `above` height over surface, m; `halo` 0.3..1; `flicker` 0..1; `pulse` 0..1).
 *
 * A soft halo round the source and the pool of its light on the surface under it.
 * Put it at the source: `play(world, light({ size: 0.05, above: 0.3 }), lamp)`.
 */
// cost: 2 draw calls, ~180 triangles.
export function light(o: { size?: number; color?: number; above?: number; halo?: number; flicker?: number; pulse?: number; seed?: number } = {}): Fx {
  const size = o.size ?? 0.1, above = o.above ?? 0, seed = o.seed ?? Math.random() * 10, halo = o.halo ?? 1;
  const object = new Group();
  object.name = 'ToyEffect';
  const g = glow(o.color ?? 0xffc46a, size * 3.4, size * 4.5 + above * 2.2, above, 0.7 * halo * halo);
  object.add(g.halo, g.pool);
  // the higher the lamp, the wider and the fainter its pool
  const reach = 1 / (1 + (above / size) * 0.12);
  return {
    object,
    update(_delta, age) {
      const k = 1 + (o.flicker ?? 0) * 0.3 * waver(age, seed) + (o.pulse ?? 0) * 0.45 * Math.sin(age * 1.9 + seed);
      g.set(0.95 * halo * k, 0.85 * reach * k);
    },
    dispose: () => g.dispose(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// smoke

/** The smoke's puff material (also the puffs of a poof, of dust, of a rocket's trail): `aLife` 0…1 and `aSeed` for each puff. */
export function smokeMaterial(light_: number, old: number, thin: number, tall: number, wind: number, opacity: number, faceted: boolean): ShaderMaterial {
  return new ShaderMaterial({
    defines: faceted ? { FACETED: 1 } : {},
    // see-through without blending: the alpha only says how many of a pixel's antialiasing samples the smoke covers
    // (the frame is antialiased 4×), so it stays in the opaque pass — no sorting, nothing blended, and where puffs
    // overlap the plume does not get denser: it reads as ONE sheer cloud, not as glass balls
    alphaToCoverage: opacity < 1,
    uniforms: { uTime: { value: 0 }, uThin: { value: thin }, uOpacity: { value: opacity }, uTall: { value: tall }, uWind: { value: wind }, uLight: { value: shown(light_) }, uOld: { value: shown(old) } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aLife;   // 0 just out … 1 gone
      uniform float uTime, uThin, uTall, uWind;
      varying float vCut;
      #ifdef FACETED
        flat varying float vLit;   // one tone per facet
      #else
        varying float vLit;
      #endif
      varying float vAge;
      ${NOISE}
      void main() {
        vec3 p = position;
        // a round puff, barely uneven: the cloud's lumps come from many puffs pressed together (the reference)
        #ifdef FACETED
          // an uneven faceted lump, as our rocks and crowns: every corner pushed its own way (a fine noise), so the
          // ball's regular pattern does not show
          vec3 pos = p * (1.0 + 0.13 * snoise(p * 6.3 + aSeed * 11.0) + 0.08 * snoise(p * 1.4 + aSeed * 3.0));
        #else
          vec3 pos = p * (1.0 + 0.06 * snoise(p * 2.0 + aSeed * 11.0));
        #endif
        mat4 model = modelMatrix * instanceMatrix;
        vec4 mv = viewMatrix * model * vec4(pos, 1.0);
        vec3 worldN = normalize(mat3(model) * normal);
        float facing = clamp(dot(normalize(mat3(viewMatrix) * worldN), normalize(-mv.xyz)), 0.0, 1.0);
        // what is eaten first: one or two big holes anywhere on it, its rim a little later — a puff opens into thick
        // crescents and ribbons (the reference), never into pixel static and not into a thin wire ring
        float holes = snoise(p * 1.7 + vec3(aSeed * 5.0, aSeed * 3.0, uTime * 0.1)) * 0.5 + 0.5;
        float gone = pow(clamp((aLife - 0.36 + 0.4 * uThin) / 0.64, 0.0, 1.0), 0.8) * 1.15;
        vCut = holes * 1.03 + (1.0 - facing) * 0.09 - gone;
        // the cartoon light, from above and a little from the left, laid on the plume as on ONE soft mass: the puff's
        // normal blended with the plume's own (out from its leaning middle line, and up) — a cloud, not a bunch of
        // shiny balls (the trick of the explosion's cloud, pyro.ts)
        vec3 here = (instanceMatrix * vec4(pos, 1.0)).xyz;
        float climbed = 1.0 - pow(1.0 - clamp(here.y / uTall, 0.0, 0.999), 0.4545);
        vec3 plumeN = normalize(vec3(here.x - uWind * uTall * pow(climbed, 1.6), 0.0, here.z) / (0.35 * uTall) + vec3(0.0, 0.6, 0.0));
        #ifdef FACETED
          float asOne = 0.3;  // the facets keep their own light
        #else
          float asOne = 0.55;
        #endif
        vLit = dot(normalize(mix(worldN, normalize(mat3(modelMatrix) * plumeN), asOne)), normalize(vec3(-0.35, 1.0, 0.25)));
        // one flat tone per puff, paler when young: the puffs part from each other by tone
        vAge = clamp(aLife * 0.85 + (fract(aSeed * 7.31) - 0.5) * 0.4, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight, uOld;
      uniform float uOpacity;
      varying float vCut;
      #ifdef FACETED
        flat varying float vLit;
      #else
        varying float vLit;
      #endif
      varying float vAge;
      void main() {
        if (vCut < 0.0) discard;
        vec3 base = mix(uLight, uOld, vAge);
        // a soft cooler shade underneath: a volume in the headset, still a flat cartoon tone
        #ifdef FACETED
          float lit = smoothstep(-0.5, 0.8, vLit);
        #else
          float lit = smoothstep(-0.25, 0.5, vLit);
        #endif
        gl_FragColor = vec4(mix(base * vec3(0.82, 0.84, 0.91), base, lit), uOpacity);
      }`,
  });
}

/** A puff's shape — round: a smooth ball; faceted: a coarse one with a flat normal per face (80 triangles), as our things. */
export function puffGeometry(faceted = true): BufferGeometry {
  if (!faceted) return ball(3);
  const geo = new IcosahedronGeometry(0.5, 1);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Endless rising smoke/steam along +Y (`size` = mouth width, m; `color` 0x55525c dark smoke; `opacity` 0.75; `wind` lean along +X in heights, 0.3; `height` in sizes, 6; `thin` 0..1; `pace` seconds, 3; `faceted: false` heavy).
 *
 * Faceted puffs crowd out, grow as they rise, lean downwind and are eaten away.
 * Put it at the mouth: `play(world, smoke({ size: 0.07 }), chimneyTop)`.
 */
// cost: 1 draw call, opaque; `count` × 80 triangles (26 puffs: 2 thousand; round: × 320, 8 thousand).
export function smoke(o: { size?: number; color?: number; opacity?: number; faceted?: boolean; wind?: number; height?: number; thin?: number; count?: number; pace?: number; seed?: number } = {}): Fx {
  const size = o.size ?? 0.1, count = o.count ?? 26, pace = o.pace ?? 3, seed = o.seed ?? Math.floor(Math.random() * 1000);
  const tall = (o.height ?? 6) * size, wind = o.wind ?? 0.3;
  const colour = o.color ?? 0xf6f4f2;
  // round: a smooth ball; faceted: a coarse one with a flat normal per face (80 triangles), in our things' style
  const faceted = o.faceted ?? true;
  const geometry = puffGeometry(faceted);
  const life = new Float32Array(count), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = hash(i, seed, 1) * 10;
  const lifeAttr = new InstancedBufferAttribute(life, 1);
  lifeAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aLife', lifeAttr);
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  const material = smokeMaterial(colour, blend(colour, 0x84848e, 0.7), o.thin ?? 0, tall, wind, o.opacity ?? 0.75, faceted);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const object = new Group();
  object.name = 'ToyEffect';
  object.add(mesh);
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion(), axis = new Vector3();
  return ready({
    object,
    update(_delta, age) {
      material.uniforms.uTime.value = age;
      for (let i = 0; i < count; i++) {
        // each puff in its turn, a little off the beat; none before its first turn (the column grows from the mouth)
        const x = age / pace - (i + hash(i, seed, 2) * 0.8) / count;
        const turn = Math.floor(x), u = x - turn;
        if (x < 0) {
          life[i] = 1;
          mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
          continue;
        }
        const n = turn + seed; // this puff's own numbers this turn: hash(i, n, k)
        const up = 1 - (1 - u) ** 2.2; // out fast, then hanging
        // some climb higher than others and each drifts its own way out of the middle: they overtake, overlap and
        // pile into one lumpy plume two or three puffs wide (the reference), not a string of beads
        const h = tall * (0.7 + 0.6 * hash(i, n, 3));
        const way = hash(i, n, 4) * 6.28, off = Math.sqrt(hash(i, n, 6)) * (0.2 + 1.1 * up) * size;
        at.set(
          Math.cos(way) * off + wind * h * u ** 1.6 + 0.3 * size * Math.sin(u * 5 + hash(i, n, 5) * 6.28) * u,
          h * up,
          Math.sin(way) * off + 0.3 * size * Math.cos(u * 4.3 + hash(i, n, 7) * 6.28) * u,
        );
        // puffs of several sizes; each pops out, swells quickly, then keeps growing slowly
        const big = size * (0.65 + 0.6 * hash(i, n, 8) ** 2) * (0.9 + 1.3 * (1 - (1 - u) ** 1.8)) * smooth(0, 0.025, u);
        // it rolls as it rises: its holes and curls turn
        axis.set(hash(i, n, 9) - 0.5, hash(i, n, 10) - 0.5, hash(i, n, 11) - 0.5).normalize();
        q.setFromAxisAngle(axis, hash(i, n, 12) * 6.28 + u * 1.6);
        mesh.setMatrixAt(i, m.compose(at, q, sc.setScalar(big)));
        life[i] = u;
      }
      mesh.instanceMatrix.needsUpdate = true;
      lifeAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// fire

/** A flame's colours from its rim to its heart (five steps), as the clouds' `hot`. */
export type FlamePalette = keyof typeof CLOUDS | [number, number, number, number, number];
const FIRE: [number, number, number, number, number] = [0xc42a10, 0xf2541a, 0xff9a1e, 0xffd23a, 0xfff3a0];

/** One tongue: a teardrop standing on y = 0, 1 tall, 0.6 at its widest a quarter of the way up, a point on top. */
function tongueGeometry(): LatheGeometry {
  const steps = 16, points: Vector2[] = [];
  for (let k = 0; k <= steps; k++) {
    const y = k / steps;
    points.push(new Vector2(0.3 * Math.max(0, Math.sin(Math.PI * y ** 0.55)) ** 0.9, y));
  }
  return new LatheGeometry(points, 20);
}

function flameMaterial(hot: number[]): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHot: { value: hot.map(shown) } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute vec3 aLook;    // x: its heat if ≥ 0 (a tongue that broke off), else by height · y: how torn its top is · z: how much it sways
      uniform float uTime;
      varying float vHeat;
      varying float vCut;
      varying float vTorn;
      ${NOISE}
      void main() {
        vec3 p = position;
        float h = p.y;                       // 0 its foot … 1 its tip
        float t = uTime + aSeed * 7.0;
        vec2 out2 = normalize(p.xz + vec2(1e-5));
        // lumps running up it: none at the foot, wild at the top
        float lump = snoise(vec3(p.x * 3.0, h * 2.4 - t * 2.3, p.z * 3.0) + aSeed * 13.0);
        vec3 pos = p;
        pos.xz += out2 * lump * 0.11 * smoothstep(0.02, 0.45, h);
        // the tip sways and bends over
        float bend = h * h * aLook.z;
        pos.x += (sin(t * 2.7) * 0.6 + snoise(vec3(aSeed, t * 0.8, 0.0))) * 0.13 * bend;
        pos.z += (cos(t * 2.1) * 0.6 + snoise(vec3(t * 0.7, aSeed, 3.0))) * 0.13 * bend;
        // it stretches and settles
        pos.y *= 1.0 + 0.1 * sin(t * 8.3) * sin(t * 3.1 + 1.0) * aLook.z;
        mat4 model = modelMatrix * instanceMatrix;
        vec4 mv = viewMatrix * model * vec4(pos, 1.0);
        float facing = clamp(dot(normalize(mat3(viewMatrix) * mat3(model) * normal), normalize(-mv.xyz)), 0.0, 1.0);
        // hot at the foot and where it faces you, cooler up the flame and at its rim
        vHeat = aLook.x < 0.0 ? (1.0 - h) * 0.95 + (facing - 0.5) * 0.3 + lump * 0.07 : aLook.x + (facing - 0.5) * 0.25;
        // the top is eaten by noise running up: tongues, holes
        float torn = smoothstep(0.52, 1.0, h) * 0.85 * aLook.y;
        vCut = (snoise(vec3(p.x * 3.4, h * 2.8 - t * 3.1, p.z * 3.4) + aSeed * 5.0) * 0.5 + 0.5) - torn;
        vTorn = torn;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHot[5];
      varying float vHeat;
      varying float vCut;
      varying float vTorn;
      void main() {
        if (vCut < 0.0) discard;
        float t = clamp(vHeat, 0.0, 1.0);
        // a redder lip round a hole
        t -= (1.0 - smoothstep(0.0, 0.09, vCut)) * step(0.04, vTorn) * 0.22;
        // flat bands with a short blend between them (a cartoon flame)
        vec3 c = mix(uHot[0], uHot[1], smoothstep(0.06, 0.16, t));
        c = mix(c, uHot[2], smoothstep(0.28, 0.4, t));
        c = mix(c, uHot[3], smoothstep(0.5, 0.64, t));
        c = mix(c, uHot[4], smoothstep(0.78, 0.94, t));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/**
 * A fire: a campfire, a torch, a burning thing, a burner. Endless. One fat flame with tongues breaking off, embers,
 * and its light: a halo and a pool on the surface under it. It burns up along the effect's +Y (turn it for a jet).
 * Put it at the foot of the flame: `play(world, fire({ size: 0.2 }), campfire)`.
 * `size` = how wide the thing that burns is (the flame is ¾ of it across and 1½ of it tall); `palette` 'fire', or
 * 'plasma' (a gas burner, an engine), 'magic', 'acid', 'ice'; `above` how high it is over the surface it lights,
 * metres; `glow: false` without its light.
 */
// cost: 4 draw calls, ~6 thousand triangles, the flame opaque.
export function fire(o: { size?: number; palette?: FlamePalette; above?: number; glow?: boolean; seed?: number } = {}): Fx {
  const size = o.size ?? 0.3, above = o.above ?? 0, seed = o.seed ?? Math.floor(Math.random() * 1000);
  const hot = Array.isArray(o.palette) ? o.palette : o.palette && o.palette !== 'fire' ? CLOUDS[o.palette].hot : FIRE;
  const object = new Group();
  object.name = 'ToyEffect';
  const TONGUES = 4, LICKS = 5, count = TONGUES + LICKS;
  const geometry = tongueGeometry();
  const seeds = new Float32Array(count), look = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) seeds[i] = hash(i, seed, 1) * 10;
  const lookAttr = new InstancedBufferAttribute(look, 3);
  lookAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute('aLook', lookAttr);
  const material = flameMaterial(hot);
  const flame = new InstancedMesh(geometry, material, count);
  flame.frustumCulled = false;
  object.add(flame);
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion(), axis = new Vector3();
  const wide = size * 1.25, high = size * 1.5;
  // the tongues stand still (the shader moves them): the big one, three smaller leaning out round it
  for (let i = 0; i < TONGUES; i++) {
    if (i === 0) {
      m.compose(at.set(0, 0, 0), q.identity(), sc.set(wide, high, wide));
    } else {
      const a = ((i - 1) / (TONGUES - 1)) * Math.PI * 2 + hash(i, seed, 2) * 0.9, k = 0.5 + 0.18 * hash(i, seed, 3);
      q.setFromAxisAngle(axis.set(Math.sin(a), 0, -Math.cos(a)), 0.2 + 0.12 * hash(i, seed, 4));
      m.compose(at.set(Math.cos(a) * size * 0.17, 0, Math.sin(a) * size * 0.17), q, sc.set(wide * k, high * k, wide * k));
    }
    flame.setMatrixAt(i, m);
    look.set([-1, 1, i === 0 ? 1 : 1.35], i * 3);
  }
  for (let j = 0; j < LICKS; j++) look.set([0.5, 0.55, 1.6], (TONGUES + j) * 3); // their heat changes as they rise
  // embers: tiny bright bits flying up
  const EMBERS = 10;
  const emberMaterial = new MeshBasicMaterial({ color: hot[3], toneMapped: false });
  const embers = new InstancedMesh(new OctahedronGeometry(0.5, 0), emberMaterial, EMBERS);
  embers.frustumCulled = false;
  object.add(embers);
  const g = o.glow === false ? undefined : glow(hot[2], size * 2.7, size * 4.2 + above * 2.2, above + size * 0.45, 0);
  if (g) {
    g.halo.position.y = size * 0.45;
    g.pool.position.y = -above + 0.002;
    object.add(g.halo, g.pool);
  }
  return ready({
    object,
    update(_delta, age) {
      material.uniforms.uTime.value = age;
      // tongues that break off: born inside the top of the flame, they rise out of it, cool and shrink away
      for (let j = 0; j < LICKS; j++) {
        const i = TONGUES + j, life = 0.55 + 0.3 * hash(j, seed, 5);
        const x = age / life - hash(j, seed, 6);
        const turn = Math.floor(x), u = x - turn;
        if (x < 0) {
          flame.setMatrixAt(i, m.makeScale(0, 0, 0));
          continue;
        }
        const n = turn + seed;
        const k = size * (0.24 + 0.16 * hash(j, n, 11)) * smooth(0, 0.12, u) * (1 - u) ** 0.8;
        at.set((hash(j, n, 12) - 0.5) * 0.3 * size * (1 + u), (0.62 + 0.3 * hash(j, n, 13) + 0.8 * (1 - (1 - u) ** 1.6)) * size, (hash(j, n, 14) - 0.5) * 0.3 * size * (1 + u));
        flame.setMatrixAt(i, m.compose(at, q.identity(), sc.set(k * 1.2, k * 1.7, k * 1.2)));
        look[i * 3] = 0.5 - 0.4 * u;
      }
      flame.instanceMatrix.needsUpdate = true;
      lookAttr.needsUpdate = true;
      for (let j = 0; j < EMBERS; j++) {
        const life = 1.1 + 0.7 * hash(j, seed, 7);
        const x = age / life - hash(j, seed, 8);
        const turn = Math.floor(x), u = x - turn;
        if (x < 0) {
          embers.setMatrixAt(j, m.makeScale(0, 0, 0));
          continue;
        }
        const n = turn + seed;
        const a = hash(j, n, 31) * 6.28, far = (0.08 + 0.3 * u) * size * (0.5 + hash(j, n, 32));
        at.set(Math.cos(a) * far + 0.07 * size * Math.sin(u * 9 + hash(j, n, 33) * 6), (0.35 + 0.5 * hash(j, n, 34) + 1.5 * u ** 0.8) * size, Math.sin(a) * far + 0.07 * size * Math.cos(u * 7 + hash(j, n, 35) * 6));
        embers.setMatrixAt(j, m.compose(at, q.identity(), sc.setScalar(size * (0.028 + 0.022 * hash(j, n, 36)) * (1 - smooth(0.6, 1, u)))));
      }
      embers.instanceMatrix.needsUpdate = true;
      if (g) {
        const k = 1 + 0.16 * waver(age, seed % 10);
        g.set(0.36 * k, 0.8 * k);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      flame.dispose();
      embers.geometry.dispose();
      emberMaterial.dispose();
      embers.dispose();
      g?.dispose();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// spray

/** A thin flat ring (lying in XZ, 1 in radius) that gets thinner as it widens: `aAge` 0…1 for each one. Opaque. */
export function ringGeometry(segments = 28): BufferGeometry {
  const points: number[] = [], inner: number[] = [], index: number[] = [];
  for (let k = 0; k <= segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    points.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 0, Math.sin(a));
    inner.push(0, 1);
    if (k < segments) index.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2); // facing +Y
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(points, 3));
  geo.setAttribute('aIn', new Float32BufferAttribute(inner, 1));
  geo.setIndex(index);
  return geo;
}
export function ringMaterial(colour: number, thick = 0.34): ShaderMaterial {
  return new ShaderMaterial({
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms: { uColour: { value: shown(colour) }, uThick: { value: thick } },
    vertexShader: /* glsl */ `
      attribute float aIn;
      attribute float aAge;
      uniform float uThick;
      void main() {
        vec3 p = position * (1.0 - aIn * uThick * (1.0 - aAge));
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uColour; void main() { gl_FragColor = vec4(uColour, 1.0); }`,
  });
}

/** A drop's shape: a faceted teardrop 1 long, its round head leading along +Y, its tail a point behind. */
export function dropGeometry(): LatheGeometry {
  return new LatheGeometry([[0, -0.5], [0.2, -0.12], [0.33, 0.16], [0.26, 0.38], [0, 0.5]].map(([r, y]) => new Vector2(r, y)), 6);
}

/** A drop: three flat tones — pale on top, the colour on its sides, deeper underneath. */
export function dropMaterial(colour: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uBase: { value: shown(colour) }, uPale: { value: shown(blend(colour, 0xffffff, 0.6)) }, uDeep: { value: shown(blend(colour, 0x1a2a55, 0.35)) } },
    vertexShader: /* glsl */ `
      flat varying float vUp;
      void main() {
        mat4 model = modelMatrix * instanceMatrix;
        vUp = normalize(mat3(model) * normal).y;
        gl_Position = projectionMatrix * viewMatrix * model * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uPale, uDeep;
      flat varying float vUp;
      void main() { gl_FragColor = vec4(vUp > 0.35 ? uPale : vUp > -0.35 ? uBase : uDeep, 1.0); }`,
  });
}

/**
 * Fountain/hose jet along +Y (endless, or `burst: true` one-shot splash). `size` = spout width, m; `height` in sizes (4); `spread` 0..1; `above` height over landing surface, m; `pace` climb s (0.32).
 *
 * Drops fly out along the effect's +Y (turn it to aim) and fall DOWN in the world however it is turned, leaving a ring where each lands.
 * Put it at the spout: `play(world, spray({ size: 0.04, above: 0.14 }), spout)`.
 */
// cost: 2 draw calls, `count` × 104 triangles (28 drops: 2.9 thousand), opaque.
export function spray(o: { size?: number; color?: number; height?: number; spread?: number; above?: number; count?: number; pace?: number; burst?: boolean; seed?: number } = {}): Fx {
  const size = o.size ?? 0.05, count = o.count ?? 28, seed = o.seed ?? Math.floor(Math.random() * 1000), above = o.above ?? 0;
  const burst = o.burst ?? false, colour = o.color ?? 0x3a92ea;
  const tall = (o.height ?? 4) * size, pace = o.pace ?? 0.32, spread = (o.spread ?? (burst ? 0.8 : 0.35)) * 1.2;
  // gravity from the jet's height and pace: the same arc at any size, on a table or in the room
  const g = (2 * tall) / (pace * pace), v0 = (2 * tall) / pace, RIPPLE = 0.45;
  const period = (v0 + Math.sqrt(v0 * v0 + 2 * g * above)) / g + RIPPLE;
  const wide = size * 0.3;
  const object = new Group();
  object.name = 'ToyEffect';
  const dropGeo = dropGeometry();
  const drops = new InstancedMesh(dropGeo, dropMaterial(colour), count);
  const ringGeo = ringGeometry();
  const ages = new Float32Array(count);
  const ageAttr = new InstancedBufferAttribute(ages, 1);
  ageAttr.setUsage(DynamicDrawUsage);
  ringGeo.setAttribute('aAge', ageAttr);
  const rings = new InstancedMesh(ringGeo, ringMaterial(blend(colour, 0xffffff, 0.75), 0.2), count);
  drops.frustumCulled = rings.frustumCulled = false;
  object.add(drops, rings);
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion(), qUp = new Quaternion(), turned = new Quaternion();
  const up = new Vector3(), dir = new Vector3(), vel = new Vector3(), Y = new Vector3(0, 1, 0);
  return ready({
    object,
    update(_delta, age) {
      // which way is up for this effect, turned as it is
      (object as Object3D).getWorldQuaternion(turned);
      up.set(0, 1, 0).applyQuaternion(turned.invert());
      qUp.setFromUnitVectors(Y, up);
      for (let i = 0; i < count; i++) {
        const x = age / period - (burst ? 0 : (i + hash(i, seed, 2) * 0.9) / count);
        const turn = Math.floor(x), t = (x - turn) * period, n = turn + seed;
        if (x < 0 || (burst && turn > 0)) {
          drops.setMatrixAt(i, m.makeScale(0, 0, 0));
          rings.setMatrixAt(i, m);
          continue;
        }
        // thrown within a cone round +Y
        const tilt = spread * Math.sqrt(hash(i, n, 3)), round = hash(i, n, 4) * 6.28;
        dir.set(Math.sin(tilt) * Math.cos(round), Math.cos(tilt), Math.sin(tilt) * Math.sin(round));
        const v = v0 * (burst ? 0.45 + 0.55 * hash(i, n, 5) : 0.86 + 0.14 * hash(i, n, 5));
        const rise = v * dir.dot(up), land = Math.max(0.05, (rise + Math.sqrt(Math.max(0, rise * rise + 2 * g * above))) / g);
        const big = wide * (0.7 + 0.6 * hash(i, n, 6));
        if (t < land) {
          at.copy(dir).multiplyScalar(v * t).addScaledVector(up, -0.5 * g * t * t);
          vel.copy(dir).multiplyScalar(v).addScaledVector(up, -g * t);
          const speed = vel.length();
          q.setFromUnitVectors(Y, vel.multiplyScalar(1 / Math.max(speed, 1e-6)));
          const k = big * smooth(0, 0.04, t);
          drops.setMatrixAt(i, m.compose(at, q, sc.set(k * 1.25, k * (1.5 + 0.9 * (speed / v0)), k * 1.25)));
          rings.setMatrixAt(i, m.makeScale(0, 0, 0));
        } else {
          // it has landed: its ring on the surface, widening and thinning away
          const a = clamp01((t - land) / RIPPLE);
          at.copy(dir).multiplyScalar(v * land).addScaledVector(up, -0.5 * g * land * land + 0.002);
          drops.setMatrixAt(i, m.makeScale(0, 0, 0));
          rings.setMatrixAt(i, m.compose(at, qUp, sc.setScalar(big * (1.6 + 4.2 * (1 - (1 - a) ** 2)))));
          ages[i] = a;
        }
      }
      drops.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = ageAttr.needsUpdate = true;
      return burst ? age < period : true;
    },
    dispose() {
      dropGeo.dispose();
      ringGeo.dispose();
      (drops.material as ShaderMaterial).dispose();
      (rings.material as ShaderMaterial).dispose();
      drops.dispose();
      rings.dispose();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// trail

/**
 * A ribbon through `count` points, always facing the eye, pale down its middle and `colour` at its edges; opaque.
 * `thin[i]` 0…1 narrows it at the i-th point (1: to nothing); `breaks` are the points after which it does not go on
 * to the next one (a branch starts there). Give it the points with set() whenever they move. One draw call.
 */
export function ribbon(count: number, colour: number, wide: number, thin: (i: number) => number, breaks: number[] = []) {
  const places = new Float32Array(count * 6), ways = new Float32Array(count * 6), sides = new Float32Array(count * 2), thins = new Float32Array(count * 2);
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    sides.set([-1, 1], i * 2);
    thins.set([thin(i), thin(i)], i * 2);
    if (i < count - 1 && !breaks.includes(i)) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  const placeAttr = new BufferAttribute(places, 3), wayAttr = new BufferAttribute(ways, 3); // sharing the arrays above
  placeAttr.setUsage(DynamicDrawUsage);
  wayAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', placeAttr);
  geometry.setAttribute('aWay', wayAttr);
  geometry.setAttribute('aSide', new Float32BufferAttribute(sides, 1));
  geometry.setAttribute('aAlong', new Float32BufferAttribute(thins, 1));
  geometry.setIndex(index);
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uWidth: { value: wide }, uCore: { value: shown(blend(colour, 0xffffff, 0.75)) }, uEdge: { value: shown(colour) } },
    vertexShader: /* glsl */ `
      attribute vec3 aWay;      // the way the ribbon runs here
      attribute float aSide;    // −1 / +1: its two edges
      attribute float aAlong;   // how much narrower it is here, 0 … 1
      uniform float uWidth;
      varying float vAcross;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 way = mat3(modelViewMatrix) * aWay;
        // across the ribbon and facing the eye
        vec3 across = cross(way, mv.xyz);
        mv.xyz += normalize(across + vec3(1e-6)) * aSide * uWidth * 0.5 * (1.0 - aAlong) * length(modelMatrix[0].xyz);
        vAcross = aSide;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uEdge; varying float vAcross;
      void main() { gl_FragColor = vec4(abs(vAcross) < 0.45 ? uCore : uEdge, 1.0); }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const way = new Vector3();
  return {
    mesh,
    set(points: Vector3[]) {
      for (let i = 0; i < count; i++) {
        const p = points[i], j = i * 6;
        // the way it runs: from the point after to the point before, on its own stretch
        const before = i > 0 && !breaks.includes(i - 1) ? i - 1 : i, after = i < count - 1 && !breaks.includes(i) ? i + 1 : i;
        way.copy(points[before]).sub(points[after]);
        if (way.lengthSq() < 1e-12) way.set(0, 1, 0);
        way.normalize();
        places[j] = places[j + 3] = p.x;
        places[j + 1] = places[j + 4] = p.y;
        places[j + 2] = places[j + 5] = p.z;
        ways[j] = ways[j + 3] = way.x;
        ways[j + 1] = ways[j + 4] = way.y;
        ways[j + 2] = ways[j + 5] = way.z;
      }
      placeAttr.needsUpdate = wayAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * A trail behind a fast thing: a ball, a thrown thing, a rocket, a shooting star. A ribbon back along its way,
 * tapering to a point; the faster the thing, the longer; at rest it is gone. Endless.
 * `play(world, trail({ size: 0.07, color: 0x38d8ff }), ball)` — it follows the entity or object by itself.
 * `size` = how wide the thing is; `length` how long the tail lasts, seconds (0.3).
 */
// cost: 1 draw call, 38 triangles, opaque.
export function trail(o: { size?: number; color?: number; length?: number } = {}): Fx & { follow(point: Vector3): void } {
  const size = o.size ?? 0.06, N = 20, lag = (o.length ?? 0.3) / N;
  const band = ribbon(N, o.color ?? 0x38d8ff, size * 0.7, (i) => i / (N - 1));
  band.mesh.visible = false;
  const object = new Group();
  object.name = 'ToyEffect';
  object.add(band.mesh);
  // where the thing has been, with the time of each place: the ribbon is drawn through its places of the last
  // `length` seconds, so it is the same at any frame rate
  const KEPT = 96, past = Array.from({ length: KEPT }, () => new Vector3()), when = new Float32Array(KEPT);
  const points = Array.from({ length: N }, () => new Vector3()), head = new Vector3();
  let newest = -1, kept = 0, clock = 0, told = false;
  return {
    object,
    worldSpace: true,
    follow(point) {
      head.copy(point);
      told = true;
    },
    update(delta) {
      if (!told || delta <= 0) return;
      clock += delta;
      newest = (newest + 1) % KEPT;
      kept = Math.min(KEPT, kept + 1);
      past[newest].copy(head);
      when[newest] = clock;
      // the ribbon's i-th point: where the thing was i·lag seconds ago, between the two places kept round that time
      let back = 0;
      for (let i = 0; i < N; i++) {
        const t = clock - i * lag;
        while (back < kept - 1 && when[(newest - back - 1 + KEPT) % KEPT] > t) back++;
        const later = (newest - back + KEPT) % KEPT, earlier = (newest - Math.min(back + 1, kept - 1) + KEPT) % KEPT;
        const span = when[later] - when[earlier];
        points[i].copy(past[later]).lerp(past[earlier], span > 1e-6 ? Math.min(1, Math.max(0, (when[later] - t) / span)) : 0);
      }
      band.mesh.visible = points[0].distanceToSquared(points[N - 1]) > (size * 0.5) ** 2;
      if (band.mesh.visible) band.set(points);
    },
    dispose: () => band.dispose(),
  };
}
