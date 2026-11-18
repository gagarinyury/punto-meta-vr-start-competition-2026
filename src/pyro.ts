// A stylised explosion rebuilt from a reference video frame by frame (17.11: Nolka's pyrotechnics "Standard", the
// look we want): ~0.7 s, the peak at the very start.
//   0      a white-yellow lumpy fireball of a few puffs (a cauliflower surface), a wide glowing ring on the ground,
//          the floor around lit orange
//   0.1 s  the ring runs out, a thinner second one after it; a ring of white smoke puffs rolls out along the ground
//   0.25 s the ball shrinks and reddens, the rings fade, red spark streaks fly low
//   0.4 s  the ball cools to peach, then light-grey smoke shaded in its folds; the floor light dies
//   0.6 s  the smoke is eaten away by dark holes with crisp edges and is gone
// Everything is an ordinary mesh under one Group: it scales with its parent (a tabletop board too). `size` = how big
// the thing that blows up is (the fireball is about that wide).
import {
  CustomBlending,
  OneFactor,
  SrcAlphaFactor,
  ZeroFactor,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import type { Fx } from './fx/core.js';

/** 3D simplex noise for the effects' shaders (GLSL): `snoise(vec3)` −1…1. */
export const NOISE = /* glsl */ `
  // 3D simplex noise (Ashima / Stefan Gustavson, MIT)
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  // round puffy bulges (Yury, 17.11: «более круглыми»): smooth noise, big soft bumps and only a faint finer ripple on
  // them — no sharp ridges, so the silhouette stays round
  float billow(vec3 p) {
    float f = 0.5 + 0.5 * snoise(p);
    f += 0.18 * snoise(p * 2.3 + 7.1);
    f += 0.06 * snoise(p * 5.1 + 3.7);
    return f * 0.62;
  }`;

/**
 * The puff material: a cauliflower surface (vertex displacement by billowing noise), fire on a smooth ramp from a
 * white core to red rims while hot, light-grey smoke shaded in its folds as it cools, eaten away by dark-edged holes.
 * Per mesh: uHeat 1…0, uSmoke 0…1, uDissolve 0…1, uSeed.
 */
export function puffMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeat: { value: 1 },
      uSmoke: { value: 0 },
      uDissolve: { value: 0 },
      uSeed: { value: 0 },
      uBump: { value: 0.26 },
      uTint: { value: 0 },
    },
    vertexShader: /* glsl */ `
      ${NOISE}
      uniform float uTime, uSeed, uBump;
      varying vec3 vView;
      varying vec3 vLocal;
      varying float vBillow;
      varying vec3 vWorldUp;
      varying vec3 vNormal;
      float height(vec3 q) { return billow(q * 1.5 + vec3(uSeed * 7.0, uTime * 0.5, uSeed * 3.0)); }
      void main() {
        vec3 p = position;
        float b = height(p);
        vBillow = b;
        vLocal = p;
        // a smooth normal of the bumpy surface (the reference is smooth cauliflower, not crumpled paper):
        // the slope of the bumps along two tangents, from two more samples
        vec3 n = normalize(normal);
        vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 t2 = cross(n, t1);
        float e = 0.02;
        float b1 = height(p + t1 * e), b2 = height(p + t2 * e);
        vec3 bent = normalize(n - (t1 * (b1 - b) + t2 * (b2 - b)) / e * uBump * 0.9);
        vNormal = normalize(normalMatrix * bent);
        p += n * (b - 0.25) * uBump;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = mv.xyz;
        vWorldUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uHeat, uSmoke, uDissolve, uSeed, uTint;
      varying vec3 vView;
      varying vec3 vLocal;
      varying float vBillow;
      varying vec3 vWorldUp;
      varying vec3 vNormal;
      // the fire ramp: dark red rim, red, orange, yellow, a white-hot core
      vec3 fire(float t) {
        vec3 c = mix(vec3(0.42, 0.06, 0.03), vec3(0.93, 0.25, 0.08), smoothstep(0.0, 0.3, t));
        c = mix(c, vec3(1.0, 0.55, 0.12), smoothstep(0.25, 0.5, t));
        c = mix(c, vec3(1.0, 0.82, 0.28), smoothstep(0.45, 0.72, t));
        return mix(c, vec3(1.0, 0.98, 0.86), smoothstep(0.72, 0.95, t));
      }
      void main() {
        // the holes: finer noise over the puff, cut with a crisp edge
        float h = snoise(vLocal * 3.1 + uSeed * 5.0) * 0.5 + 0.5;
        h = h * 0.75 + vBillow * 0.5;
        if (h < uDissolve) discard;
        // normals from the displaced surface itself: every fold of the cauliflower catches the light
        vec3 N = normalize(vNormal);
        vec3 V = normalize(-vView);
        float facing = clamp(dot(N, V), 0.0, 1.0);
        // hot where it faces you and in the bulges, cooler in the folds and at the rim
        float t = uHeat * (0.55 + 0.55 * facing) + (vBillow - 0.3) * 0.45 * uHeat;
        // the explosion's own tint: a little yellower (+) or redder (−)
        vec3 hot = fire(clamp(t + uTint, 0.0, 1.0));
        // smoke: light grey lit from above, darker in the folds, a warm tint while still warm
        float light = clamp(dot(N, vWorldUp) * 0.5 + 0.55, 0.0, 1.0);
        vec3 smoke = mix(vec3(0.36, 0.34, 0.36), vec3(0.86, 0.84, 0.82), light) * (0.72 + 0.5 * vBillow);
        smoke = mix(smoke, vec3(1.0, 0.86, 0.68), clamp(uHeat * 2.2, 0.0, 0.75));
        vec3 colour = mix(hot, smoke, uSmoke);
        // the burnt rim of a hole
        float edge = 1.0 - smoothstep(uDissolve, uDissolve + 0.05, h);
        colour = mix(colour, vec3(0.12, 0.08, 0.08), edge * step(0.001, uDissolve));
        gl_FragColor = vec4(colour, 1.0);
      }`,
  });
}

/** A soft glow (the bloom the reference has): a sphere bright where it faces you, fading to its rim. Additive. */
export function glowMaterial(colour: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
    uniforms: { uColour: { value: new Color(colour) }, uAmount: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour; uniform float uAmount; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.5); gl_FragColor = vec4(uColour * f * uAmount, 1.0); }`,
  });
}

/** Light on the real floor round the blast: a radial orange glow, additive (in AR there is no floor mesh to light). */
function floorGlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
    uniforms: { uAmount: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount; varying vec2 vUv;
      void main() { float r = length(vUv - 0.5) * 2.0; float f = pow(clamp(1.0 - r, 0.0, 1.0), 1.8); gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * f * uAmount, 1.0); }`,
  });
}

/** The ring running along the ground: bright yellow-white at its inner edge, fading outward; additive. */
function ringMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
    uniforms: { uAmount: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount; varying vec2 vUv;
      void main() {
        // RingGeometry's uv: radius runs from the centre; across the band, bright on its leading (outer) edge
        float r = length(vUv - 0.5) * 2.0;
        float band = smoothstep(0.86, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        vec3 c = mix(vec3(1.0, 0.5, 0.12), vec3(1.0, 0.95, 0.75), band);
        gl_FragColor = vec4(c * (0.25 + band) * uAmount, 1.0);
      }`,
  });
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => 1 - (1 - clamp01(t)) ** 3;

// ---- the bubble cloud (17.11, from Gemini's sprite sheet public/_ref/gemini-boom-sprites.png drawn from the video) ----
// The cloud is a cluster of a few dozen small round balls, each lit softly like a cartoon (light top-left, shade
// below, a darker rim). It GROWS for the first quarter, glowing white-yellow with orange rims; turns orange, then
// cream, then light grey with dark gaps between the balls; then holes are eaten out of the middle and the lacy rim
// goes last. One InstancedMesh: one draw call.
/** The colours of a cloud: five hot steps from its rim to its core, and its smoke (shade, light) and the warm smoke
 *  it passes through while cooling. */
export interface CloudPalette {
  hot: [number, number, number, number, number];
  smoke: [number, number];
  warm: [number, number];
}
// the raw shader writes these as they are: the colour's own sRGB values (as the numbers it had before)
const srgbVec = (hex: number) => new Color(hex).convertLinearToSRGB();
export const CLOUDS = {
  fire: { hot: [0x8c1f0a, 0xf2611a, 0xff9e2e, 0xffd96b, 0xfffae0], smoke: [0x807d78, 0xeeebe0], warm: [0xd1ad75, 0xfff2c7] },
  smoke: { hot: [0x6e6870, 0x8a8590, 0xa59a9c, 0xc8c4cc, 0xe8e4ec], smoke: [0x6b6870, 0xe4e2e6], warm: [0x8a8590, 0xe8e4ec] },
  dust: { hot: [0x6b4a2e, 0x8f6a45, 0xb08a5e, 0xcfae80, 0xeedbb8], smoke: [0x7a6550, 0xd9c6a6], warm: [0x8f7356, 0xe4d1b0] },
  magic: { hot: [0x4a1a8a, 0x9a3ae0, 0xd06cf0, 0xffa8f0, 0xffffff], smoke: [0x6a5a8a, 0xe0d4f4], warm: [0x9a7ac0, 0xf4e4ff] },
  acid: { hot: [0x1f5a1a, 0x3f9a2a, 0x7cd43c, 0xc8f05a, 0xf4ffd0], smoke: [0x5a7050, 0xd4e4c4], warm: [0x7c9a5a, 0xe4f4c8] },
  ice: { hot: [0x1a4a9a, 0x3a8cf0, 0x8fd8ff, 0xd8f6ff, 0xffffff], smoke: [0x8aa0b8, 0xf0f6fc], warm: [0xa8c4dc, 0xf4fbff] },
  plasma: { hot: [0x1a2a9a, 0x2a6cf0, 0x3ad8ff, 0x9ff8ff, 0xffffff], smoke: [0x6a7a9a, 0xdce4f4], warm: [0x7a94c0, 0xe4f0ff] },
} satisfies Record<string, CloudPalette>;

function bubbleMaterial(palette: CloudPalette = CLOUDS.fire): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uHeat: { value: 1 }, uSmoke: { value: 0 }, uDissolve: { value: 0 }, uTint: { value: 0 }, uCentre: { value: new Vector3() }, uBlend: { value: 0.5 },
      uHot: { value: palette.hot.map(srgbVec) },
      uSmokeLo: { value: srgbVec(palette.smoke[0]) }, uSmokeHi: { value: srgbVec(palette.smoke[1]) },
      uWarmLo: { value: srgbVec(palette.warm[0]) }, uWarmHi: { value: srgbVec(palette.warm[1]) },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;   // 0 the middle of the cloud … 1 its surface
      attribute float aOrder;   // when this ball is eaten away, 0 first … 1 last
      attribute float aSeed;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vLocal;
      varying vec3 vUp;
      varying vec3 vLight;
      varying float vDepth;
      varying float vOrder;
      varying float vSeed;
      uniform vec3 uCentre;  // the cloud's centre, in the effect's space
      uniform float uBlend;  // how much the balls are lit as one cloud (the sprite: soft, merged)
      ${NOISE}
      void main() {
        vDepth = aDepth; vOrder = aOrder; vSeed = aSeed; vLocal = position;
        // each puff a round cloud ball, only softly uneven (Yury: «круглые облака», not drops)
        vec3 pos = position + normal * snoise(position * 2.0 + aSeed * 4.7) * 0.05;
        mat4 model = modelMatrix * instanceMatrix;
        vec4 mv = viewMatrix * model * vec4(pos, 1.0);
        // the normal of the ball blended with the normal of the whole cloud (the stylised cloud / tree-crown trick):
        // the light lies on the cloud as on one soft mass, the seams between the balls fade, the bumpy outline stays
        vec3 inCloud = (instanceMatrix * vec4(pos, 1.0)).xyz - uCentre;
        vec3 ballN = normalize(mat3(instanceMatrix) * normal);
        vec3 bent = normalize(mix(ballN, normalize(inCloud), uBlend));
        vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * bent);
        vV = -mv.xyz;
        vUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
        // the cartoon light: from above, a little from the left of the eye
        vLight = normalize(mat3(viewMatrix) * vec3(-0.35, 1.0, 0.25));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uHeat, uSmoke, uDissolve, uTint;
      uniform vec3 uHot[5];
      uniform vec3 uSmokeLo, uSmokeHi, uWarmLo, uWarmHi;
      varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying vec3 vUp; varying vec3 vLight;
      varying float vDepth; varying float vOrder; varying float vSeed;
      vec3 fire(float t) {
        vec3 c = mix(uHot[0], uHot[1], smoothstep(0.0, 0.3, t));
        c = mix(c, uHot[2], smoothstep(0.25, 0.5, t));
        c = mix(c, uHot[3], smoothstep(0.45, 0.7, t));
        return mix(c, uHot[4], smoothstep(0.7, 0.92, t));
      }
      void main() {
        // eaten away: this ball's turn (the middle ones first), with a lacy noisy edge
        float n = snoise(vLocal * 5.0 + vSeed * 9.0) * 0.5 + 0.5;
        float cut = uDissolve * 1.25 - vOrder;
        if (n < cut * 1.6) discard;
        vec3 N = normalize(vN);
        vec3 V = normalize(vV);
        float facing = clamp(dot(N, V), 0.0, 1.0);
        // the ball's own facing (not the blended one): its outline is torn like cotton wool and drawn darker
        float own = clamp(dot(normalize(cross(dFdx(vV), dFdy(vV))), V), 0.0, 1.0);
        float tear = snoise(vLocal * 14.0 + vSeed * 13.0) * 0.5 + 0.5;
        if (own < 0.36 && tear > own * 2.2 + 0.3) discard; // a fine fluffy edge, like cotton
        float lit = smoothstep(-0.45, 0.85, dot(N, vLight)); // soft light: a cloud, not a ball
        float rim = 1.0 - smoothstep(0.0, 0.45, facing);
        float outline = 1.0 - smoothstep(0.12, 0.38, own);
        // fire: hotter in the middle of the cloud and where a ball faces the light; orange round each ball's rim
        float t = uHeat * (1.15 - 0.35 * vDepth) * (0.8 + 0.35 * lit) + uTint;
        vec3 hot = fire(clamp(t - rim * 0.3 * uHeat, 0.0, 1.0));
        // smoke: cream while still warm, then light grey; shaded below, a darker rim between the balls
        vec3 cream = mix(uWarmLo, uWarmHi, lit);
        vec3 grey = mix(uSmokeLo, uSmokeHi, lit);
        vec3 smoke = mix(grey, cream, clamp(uHeat * 3.0, 0.0, 1.0));
        smoke *= 1.0 - rim * 0.2;
        vec3 colour = mix(hot, smoke, uSmoke);
        // the contour of each ball: darker, a burnt orange while hot, a warm grey in the smoke
        colour = mix(colour, mix(colour * 0.72, uHot[1], uHeat * (1.0 - uSmoke)), outline * 0.55);
        // a darker rim where a hole is being eaten
        if (cut > 0.0 && n < cut * 1.6 + 0.06) colour *= 0.55;
        gl_FragColor = vec4(colour, 1.0);
      }`,
  });
}

/** How a cloud lives: when it is grown, how long it stays hot, when it is smoke, when it is eaten away (seconds). */
export interface CloudTiming { grow: number; heat: number; smokeAt: number; smokeFor: number; goneAt: number; goneFor: number; rise: number }
const BOOM_TIMING: CloudTiming = { grow: 0.16, heat: 0.5, smokeAt: 0.28, smokeFor: 0.22, goneAt: 0.6, goneFor: 0.38, rise: 0.12 };

function bubbleCloud(size: number, r: () => number, tint: number, tall: number, wide: number, palette: CloudPalette = CLOUDS.fire, timing: CloudTiming = BOOM_TIMING, density = 1) {
  const count = Math.max(8, Math.round((92 + Math.floor(r() * 20)) * density)); // more, smaller puffs in the same volume (Yury)
  const geometry = new IcosahedronGeometry(0.5, 3);
  const depth = new Float32Array(count), order = new Float32Array(count), seed = new Float32Array(count);
  const home = Array.from({ length: count }, () => new Vector3());
  const big = new Float32Array(count);
  const turn = Array.from({ length: count }, () => new Quaternion());
  const stretch = Array.from({ length: count }, () => new Vector3(1, 1, 1));
  for (let i = 0; i < count; i++) {
    // more balls near the surface (that is what the eye sees), a few inside to fill it
    const dir = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    const d = i < 6 ? r() * 0.4 : 0.55 + r() * 0.45;
    home[i].copy(dir).multiplyScalar(d * 0.36).multiply(new Vector3(wide, tall, wide));
    depth[i] = d;
    big[i] = d < 0.5 ? 0.48 : 0.19 + r() * 0.14; // many, pressed into each other, as on the sprite
    // the balls go one by one in a random order: the cloud is eaten into lace
    order[i] = 0.05 + 0.8 * r();
    seed[i] = r() * 10;
    // turned at random: its slight unevenness differs from every side
    turn[i].setFromUnitVectors(new Vector3(0, 0, 1), dir.clone().add(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.5)).normalize());
    stretch[i].set(0.95 + r() * 0.1, 0.92 + r() * 0.1, 0.95 + r() * 0.12); // round cloud puffs, barely uneven
  }
  geometry.setAttribute('aDepth', new InstancedBufferAttribute(depth, 1));
  geometry.setAttribute('aOrder', new InstancedBufferAttribute(order, 1));
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
  const material = bubbleMaterial(palette);
  material.uniforms.uTint.value = tint;
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3();
  const centre = new Vector3(0, 0.45 * tall * size, 0);
  material.uniforms.uCentre.value = centre.clone();
  return {
    mesh,
    update(age: number) {
      // grows over the first quarter (the sprite's first row), then swells a little more and rises
      const grow = 0.45 + 0.55 * ease(age / timing.grow) + 0.1 * clamp01((age - timing.grow) / 0.8);
      for (let i = 0; i < count; i++) {
        // each ball breathes a little on its own
        const wobble = 1 + 0.06 * Math.sin(age * 9 + seed[i] * 3);
        at.copy(home[i]).multiplyScalar(size * grow).add(centre);
        at.y += timing.rise * size * clamp01(age / 0.9);
        if (i === 0) material.uniforms.uCentre.value.copy(centre).setY(centre.y + timing.rise * size * clamp01(age / 0.9));
        sc.copy(stretch[i]).multiplyScalar(big[i] * size * grow * wobble);
        mesh.setMatrixAt(i, m.compose(at, turn[i], sc));
      }
      mesh.instanceMatrix.needsUpdate = true;
      // the sprite's timeline over ~1 s: white-yellow → orange (by 0.3) → cream (0.45) → grey (0.6) → holes → gone
      material.uniforms.uHeat.value = timing.heat > 0 ? clamp01(1 - age / timing.heat) ** 0.8 : 0;
      material.uniforms.uSmoke.value = clamp01((age - timing.smokeAt) / timing.smokeFor);
      material.uniforms.uDissolve.value = clamp01((age - timing.goneAt) / timing.goneFor);
    },
    end: timing.goneAt + timing.goneFor,
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/**
 * A cloud on its own (a poof, dust, smoke, a magic burst): the same round fluffy puffs as the explosion, in any palette
 * and pace. `size` = how big the cloud is; `flat` < 1 squashes it (dust on the ground), `density` more or fewer puffs.
 */
export function puffCloud(o: { size?: number; seed?: number; palette?: keyof typeof CLOUDS | CloudPalette; timing?: Partial<CloudTiming>; tall?: number; wide?: number; density?: number } = {}): Fx {
  const r = random(o.seed ?? Math.floor(Math.random() * 1e9));
  const palette = typeof o.palette === 'object' ? o.palette : CLOUDS[o.palette ?? 'smoke'];
  const timing = { ...BOOM_TIMING, ...o.timing };
  const cloud = bubbleCloud(o.size ?? 1, r, 0, o.tall ?? 1, o.wide ?? 1, palette, timing, o.density ?? 0.7);
  const object = new Group();
  object.name = 'ToyEffect';
  object.add(cloud.mesh);
  return {
    object,
    update(_delta, age) {
      cloud.update(age);
      return age < cloud.end;
    },
    dispose: () => cloud.dispose(),
  };
}

const random = (seed: number) => {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/** The explosion of the reference: `size` = the size of what blows up (the fireball is about that wide). */
/** `ball`: 'bubbles' — a cloud of many small round balls (Gemini's sprite sheet); 'puffs' — a few big billowing ones (the video). */
export function pyroBoom(o: { size?: number; seed?: number; ball?: 'bubbles' | 'puffs' } = {}): Fx {
  const size = o.size ?? 1;
  const r = random(o.seed ?? Math.floor(Math.random() * 1e9));
  const object = new Group();
  object.name = 'ToyEffect';
  const sphere = new IcosahedronGeometry(0.5, 5); // ~10k triangles: the cauliflower needs vertices
  // the seed decides this explosion's character, not only where its puffs sit (Yury, 17.11: «случайное зерно»)
  const count = 5 + Math.floor(r() * 4); // 5..8 puffs
  const tall = 0.8 + r() * 0.5; // a squat wide blast … a tall one
  const wide = 1.25 - (tall - 0.8) * 0.5;
  const pace = 0.85 + r() * 0.3; // shorter or longer, ±15 %
  const tint = (r() - 0.5) * 0.16; // yellower or redder
  const ringCount = r() < 0.35 ? 1 : 2;
  const tilt = (r() - 0.5) * 0.35;

  // the fireball: a big puff in the middle and a few around it, each a little later
  const bubbles = o.ball === 'puffs' ? undefined : bubbleCloud(size, r, tint, tall, wide);
  if (bubbles) object.add(bubbles.mesh);
  const puffs = Array.from({ length: bubbles ? 0 : count }, (_, i) => {
    const mesh = new Mesh(sphere, puffMaterial());
    // a round cloud: one big ball in the middle, smaller ones pressed onto its surface all round
    const dir = new Vector3((r() - 0.5) * wide, (r() * 0.9 - 0.2) * tall, (r() - 0.5) * wide).normalize();
    const at = i === 0 ? new Vector3(0, 0.42 * tall, 0) : dir.multiplyScalar(0.3 + r() * 0.1).multiply(new Vector3(wide, tall, wide)).add(new Vector3(0, 0.42 * tall, 0));
    const big = i === 0 ? 0.9 : 0.38 + r() * 0.24;
    (mesh.material as ShaderMaterial).uniforms.uSeed.value = r() * 10;
    (mesh.material as ShaderMaterial).uniforms.uTint.value = tint;
    object.add(mesh);
    return { mesh, at: at.multiplyScalar(size), big: big * size, delay: i === 0 ? 0 : 0.015 + r() * 0.06, rise: 0.15 + r() * 0.2 };
  });
  // the glow round it (the reference's bloom)
  const glow = new Mesh(new IcosahedronGeometry(0.5, 2), glowMaterial(0xffb040));
  glow.position.y = 0.42 * size;
  object.add(glow);
  // the floor lit orange
  const floor = new Mesh(new PlaneGeometry(1, 1), floorGlowMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.004 * size;
  object.add(floor);
  // two rings running out along the ground
  const rings = (ringCount === 1 ? [0] : [0, 1]).map((k) => {
    const mesh = new Mesh(new RingGeometry(0.42, 0.5, 64, 1), ringMaterial());
    mesh.rotation.x = -Math.PI / 2 + tilt + (r() - 0.5) * 0.15;
    mesh.rotation.y = r() * Math.PI;
    mesh.position.y = (0.08 + k * 0.08) * size;
    object.add(mesh);
    return { mesh, delay: k * 0.06, reach: k === 0 ? 1.1 : 0.85 }; // the reference: the ring at most ~1.5× the ball
  });
  // a ring of white smoke puffs rolling out along the ground
  const small = new IcosahedronGeometry(0.5, 3);
  const rollCount = 8 + Math.floor(r() * 7);
  const rolls = Array.from({ length: rollCount }, (_, i) => {
    const mesh = new Mesh(small, puffMaterial());
    const m = mesh.material as ShaderMaterial;
    m.uniforms.uSeed.value = r() * 10;
    m.uniforms.uHeat.value = 0;
    m.uniforms.uSmoke.value = 1;
    m.uniforms.uBump.value = 0.4;
    object.add(mesh);
    const a = (i / rollCount) * Math.PI * 2 + r() * 0.5;
    return { mesh, dir: new Vector3(Math.cos(a), 0, Math.sin(a)), big: (0.06 + r() * 0.05) * size, delay: 0.04 + r() * 0.05, reach: (0.4 + r() * 0.2) * size };
  });
  // red spark streaks flying low
  const streak = new PlaneGeometry(1, 1);
  const sparkMat = new MeshBasicMaterial({ color: 0xff5a20, blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, transparent: true, depthWrite: false, side: DoubleSide });
  const sparks = Array.from({ length: 8 + Math.floor(r() * 12) }, () => {
    const mesh = new Mesh(streak, sparkMat);
    object.add(mesh);
    const a = r() * Math.PI * 2;
    const v = new Vector3(Math.cos(a), 0.25 + r() * 0.6, Math.sin(a)).multiplyScalar((1.0 + r() * 0.8) * size);
    return { mesh, v, delay: 0.12 + r() * 0.08 };
  });
  const tmp = new Vector3(), up = new Vector3(0, 1, 0);
  const END = bubbles ? 1.05 : 0.95;
  let time = 0;
  return {
    object,
    update(delta, realAge) {
      time += delta;
      const age = realAge / pace; // this explosion's own pace
      bubbles?.update(age);
      for (const p of puffs) {
        const t = age - p.delay;
        const m = p.mesh.material as ShaderMaterial;
        m.uniforms.uTime.value = time;
        if (t < 0) {
          p.mesh.visible = false;
          continue;
        }
        p.mesh.visible = true;
        // peak at once, then shrinking as it cools and rises a little
        const s = p.big * (ease(t / 0.05) * (1.12 - 0.5 * clamp01(t / 0.7)));
        p.mesh.scale.setScalar(Math.max(s, 1e-4));
        p.mesh.position.copy(p.at).addScaledVector(up, p.rise * size * clamp01(t / 0.7));
        m.uniforms.uHeat.value = clamp01(1 - t / 0.45) ** 0.9;
        m.uniforms.uSmoke.value = clamp01((t - 0.18) / 0.2);
        m.uniforms.uDissolve.value = clamp01((t - 0.45) / 0.3) * 1.05;
      }
      // the glow and the floor light: strongest at the very start
      const flash = clamp01(1 - age / 0.4) ** 1.5;
      glow.scale.setScalar(size * (1.3 + 0.4 * ease(age / 0.1)));
      (glow.material as ShaderMaterial).uniforms.uAmount.value = flash * 0.9;
      floor.scale.setScalar(size * 2.2);
      (floor.material as ShaderMaterial).uniforms.uAmount.value = flash * 1.1;
      for (const ring of rings) {
        const t = age - ring.delay;
        ring.mesh.visible = t > 0 && t < 0.4;
        if (!ring.mesh.visible) continue;
        ring.mesh.scale.setScalar(size * (0.7 + ring.reach * ease(t / 0.35)));
        (ring.mesh.material as ShaderMaterial).uniforms.uAmount.value = (1 - t / 0.4) ** 1.4;
      }
      for (const roll of rolls) {
        const t = age - roll.delay;
        roll.mesh.visible = t > 0 && t < 0.75;
        if (!roll.mesh.visible) continue;
        const m = roll.mesh.material as ShaderMaterial;
        m.uniforms.uTime.value = time;
        roll.mesh.position.copy(roll.dir).multiplyScalar(size * 0.3 + roll.reach * ease(t / 0.45));
        roll.mesh.position.y = roll.big * 0.4;
        roll.mesh.scale.setScalar(roll.big * (0.6 + 0.6 * ease(t / 0.2)));
        m.uniforms.uDissolve.value = clamp01((t - 0.3) / 0.4) * 1.05;
      }
      for (const spark of sparks) {
        const t = age - spark.delay;
        spark.mesh.visible = t > 0 && t < 0.35;
        if (!spark.mesh.visible) continue;
        tmp.copy(spark.v).multiplyScalar(t);
        tmp.y -= 3 * size * t * t;
        spark.mesh.position.set(0, 0.3 * size, 0).add(tmp);
        // a streak along its flight, thin
        tmp.copy(spark.v).setY(spark.v.y - 6 * size * t).normalize();
        spark.mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tmp);
        spark.mesh.scale.set(0.012 * size, 0.12 * size * (1 - t / 0.35), 1);
      }
      return age < END; // END in its own time
    },
    dispose() {
      bubbles?.dispose();
      sphere.dispose();
      small.dispose();
      streak.dispose();
      sparkMat.dispose();
      object.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        (mesh.material as ShaderMaterial).dispose?.();
        if (mesh.geometry !== sphere && mesh.geometry !== small && mesh.geometry !== streak) mesh.geometry.dispose();
      });
    },
  };
}

