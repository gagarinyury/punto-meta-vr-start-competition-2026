// Studio-grade XR Nature & Room-Surface FX.
// Built from scratch for stereo WebXR + bright passthrough rooms:
// - Surface patterns (`lava`, `water`) measure coordinates in world metres so `coverFloor` never stretches.
import {
  Group,
  PlaneGeometry,
  Vector4,
} from '@iwsdk/core';
import {
  fxMesh,
  instancedQuads,
  shown,
  XR_BILLBOARD_VERT,
  XR_GLSL_2D,
  xrGlowMaterial,
  type Fx,
  type FxDemo,
} from './core.js';

// ─────────────────────── 2. lava ───────────────────────

/** World-scale molten basalt floor on local y = 0 (`coverFloor`-ready, never stretches) + rising embers. */
export function lava({ width = 2, depth = 2, color = 0xff5510 } = {}): Fx {
  const uniforms = {
    uTime: { value: 0 },
    uHalf: { value: [width * 0.5, depth * 0.5] },
    uColor: shown(color),
  };

  const surfGeo = new PlaneGeometry(width, depth);
  surfGeo.rotateX(-Math.PI / 2);
  surfGeo.translate(0, 0.003, 0);
  const surfMat = xrGlowMaterial(
    uniforms,
    /* glsl */ `
      varying vec2 vPos, vUv;
      void main() {
        vUv = uv;
        vPos = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vPos, vUv;
      ${XR_GLSL_2D}
      float crustCells(vec2 p) {
        vec2 ip = floor(p);
        vec2 fp = fract(p);
        float d1 = 8.0, d2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 cell = ip + g;
            vec2 o = 0.5 + 0.42 * sin(uTime * 0.35 + 6.2831 * vec2(hash21(cell), hash21(cell + 17.3)));
            vec2 r = g + o - fp;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; }
            else if (d < d2) { d2 = d; }
          }
        }
        return sqrt(d2) - sqrt(d1);
      }
      void main() {
        float t = uTime;
        vec2 flow = vPos * 2.1 + vec2(t * 0.06, -t * 0.04);
        vec2 warp = vec2(fbm2(flow * 0.9), fbm2(flow * 0.9 + 11.7)) - 0.5;
        float gap = crustCells(flow + warp * 0.85);
        float pool = fbm2(vPos * 1.3 - vec2(t * 0.05, t * 0.03));

        // Molten fissures + glowing magma pools between dark cooled basalt plates
        float magma = smoothstep(0.22, 0.015, gap) + smoothstep(0.62, 0.86, pool) * 0.75;
        magma = clamp(magma * (0.82 + 0.28 * sin(t * 2.2 + pool * 9.0)), 0.0, 1.25);

        float edgeDist = min(0.5 - abs(vUv.x - 0.5), 0.5 - abs(vUv.y - 0.5));
        float feather = smoothstep(0.0, 0.06, edgeDist + (noise2(vPos * 4.5) - 0.5) * 0.035);

        vec3 basalt = vec3(0.055, 0.042, 0.04) * (0.7 + 0.6 * fbm2(vPos * 5.0));
        vec3 hot = mix(uColor, vec3(1.0, 0.94, 0.58), smoothstep(0.45, 1.1, magma));
        vec3 body = mix(basalt, uColor * 0.95, clamp(magma, 0.0, 1.0));
        float a = feather * 0.96;
        gl_FragColor = vec4(body * a + hot * pow(max(magma, 0.0), 1.6) * 0.85 * feather, a);
      }`,
    undefined,
    true,
  );

  // Stereo-safe instanced rising magma sparks
  const sparkCount = Math.min(90, Math.max(28, Math.round(width * depth * 12)));
  const { geometry: sparkGeo, data } = instancedQuads(sparkCount, { aSeed: 4 });
  for (let i = 0; i < sparkCount * 4; i++) {
    data.aSeed[i] = Math.random();
  }
  const sparkMat = xrGlowMaterial(
    { uTime: uniforms.uTime, uW: { value: width * 0.9 }, uD: { value: depth * 0.9 }, uColor: uniforms.uColor },
    /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uW, uD;
      varying vec2 vQ;
      varying float vFade;
      ${XR_BILLBOARD_VERT}
      void main() {
        float ph = fract(uTime / (1.5 + aSeed.x * 1.8) + aSeed.y);
        float cyc = floor(uTime / (1.5 + aSeed.x * 1.8) + aSeed.y);
        float rx = fract(sin(aSeed.z * 91.3 + cyc * 13.7) * 43758.5) - 0.5;
        float rz = fract(sin(aSeed.w * 57.1 + cyc * 7.9) * 43758.5) - 0.5;
        vec3 c = vec3(rx * uW + sin(uTime * 1.8 + aSeed.x * 20.0) * 0.06 * ph, 0.02 + ph * (0.45 + 0.5 * aSeed.x), rz * uD);
        vQ = position.xy;
        vFade = smoothstep(0.0, 0.08, ph) * (1.0 - ph);
        gl_Position = xrBillboard(c, (0.01 + 0.01 * aSeed.z) * (1.0 - 0.4 * ph), 0.0);
      }`,
    /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      varying vec2 vQ;
      varying float vFade;
      ${XR_GLSL_2D}
      void main() {
        float r = length(vQ);
        if (r > 1.0) discard;
        float p = smoothstep(1.0, 0.1, r) * vFade;
        gl_FragColor = xrOut(uColor, p * 0.8, mix(uColor, vec3(1.0, 0.92, 0.55), 0.65) * p * 1.4);
      }`,
  );

  const object = new Group();
  object.add(fxMesh(surfGeo, surfMat, 0), fxMesh(sparkGeo, sparkMat, 1));
  return {
    object,
    update(_delta, age) {
      uniforms.uTime.value = age;
    },
    dispose() {
      surfGeo.dispose();
      surfMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
    },
  };
}

// ─────────────────────── 3. water ───────────────────────

/**
 * Natural clear water surface on local y = 0 (`coverFloor`-ready, never over-glows).
 * Call `.drop(x, z)` in local metres for interactive expanding wave rings.
 */
export function water({ width = 1.6, depth = 1.6, color = 0x12789d } = {}): Fx & { drop(x: number, z: number): void } {
  const time = { value: 0 };
  const drops = [0, 1, 2, 3].map(() => new Vector4(0, 0, -100, 0));
  let next = 0;

  const geo = new PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.003, 0);
  const mat = xrGlowMaterial(
    { uTime: time, uColor: shown(color), uDrops: { value: drops } },
    /* glsl */ `
      varying vec2 vUv, vPos;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vPos = position.xz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec4 uDrops[4];
      varying vec2 vUv, vPos;
      varying vec3 vView;
      ${XR_GLSL_2D}
      void main() {
        float t = uTime;
        vec2 p = vPos;
        vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.85), d3 = vec2(0.2, -0.98);
        vec2 slope = d1 * cos(dot(p, d1) * 7.2 + t * 1.25) * 0.055
                   + d2 * cos(dot(p, d2) * 11.5 - t * 1.55) * 0.038
                   + d3 * cos(dot(p, d3) * 17.5 + t * 1.9) * 0.022;
        slope += (vec2(noise2(p * 5.5 + t * 0.35), noise2(p * 5.5 + 29.0 - t * 0.3)) - 0.5) * 0.07;

        float ring = 0.0;
        for (int i = 0; i < 4; i++) {
          vec4 dr = uDrops[i];
          float age = t - dr.z;
          if (age > 0.0 && age < 3.2) {
            vec2 v = p - dr.xy;
            float dist = length(v);
            float x = dist - age * 0.34;
            float env = exp(-x * x * 170.0) * exp(-age * 0.95) * smoothstep(0.0, 0.04, age);
            float w = cos(x * 56.0);
            slope += v / (dist + 1e-4) * w * env * 0.55;
            ring += env * (0.5 + 0.5 * w);
          }
        }

        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 v = normalize(vView);
        float fres = pow(1.0 - clamp(abs(n.y * 0.65 + v.z * 0.35), 0.0, 1.0), 2.8);

        // Refracted caustics stay INSIDE the water tint instead of glowing neon white!
        vec2 c = p * 2.3 + slope * 0.9;
        float c1 = 1.0 - abs(noise2(c * 3.1 + vec2(t * 0.24, t * 0.18)) * 2.0 - 1.0);
        float c2 = 1.0 - abs(noise2(c * 3.4 - vec2(t * 0.19, -t * 0.22) + 7.0) * 2.0 - 1.0);
        float caustic = pow(c1, 5.5) * 0.55 + pow(c2, 5.5) * 0.55;

        float edgeDist = min(0.5 - abs(vUv.x - 0.5), 0.5 - abs(vUv.y - 0.5));
        float ef = edgeDist / 0.08 + (noise2(p * 4.2) - 0.5) * 0.45;
        float feather = smoothstep(0.0, 1.0, ef);

        vec3 deep = uColor * 0.48;
        vec3 shallow = mix(uColor * 1.15, vec3(0.32, 0.88, 0.96), 0.35);
        vec3 body = mix(shallow, deep, smoothstep(0.02, 0.32, edgeDist));
        body += vec3(0.22, 0.62, 0.72) * caustic * 0.55;
        body = mix(body, vec3(0.76, 0.9, 0.98), fres * 0.5 + ring * 0.28);

        vec3 sun = normalize(vec3(0.38, 0.85, 0.4));
        float spec = pow(max(dot(reflect(-v, n), sun), 0.0), 96.0);
        float foam = (1.0 - smoothstep(0.0, 0.48, abs(ef - 0.88))) * (0.45 + 0.55 * noise2(p * 20.0 + t * 0.3));
        body = mix(body, vec3(0.95, 0.98, 1.0), foam * 0.55);

        float a = clamp(0.58 + fres * 0.24 + ring * 0.16, 0.0, 0.88) * feather;
        gl_FragColor = xrOut(body, a, vec3(1.0) * (spec * 0.85 + ring * 0.14) * feather);
      }`,
    undefined,
    true,
  );

  return {
    object: fxMesh(geo, mat, 0),
    drop(x: number, z: number) {
      drops[next].set(x, z, time.value, 1);
      next = (next + 1) % 4;
    },
    update(_delta, age) {
      time.value = age;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

function wateryDemo(): Fx {
  const pond = water();
  let nextDrop = 0;
  return {
    object: pond.object,
    update(delta, age) {
      if (age >= nextDrop) {
        nextDrop = age + 0.75;
        pond.drop((Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 1.1);
      }
      return pond.update(delta, age);
    },
    dispose: () => pond.dispose?.(),
  };
}

export const demos: FxDemo[] = [
  { name: 'lava', title: 'Лава', make: () => lava(), view: 2.8 },
  { name: 'water', title: 'Вода с кругами', make: wateryDemo, view: 2.8 },
];
