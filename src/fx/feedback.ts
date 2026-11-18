// Studio-grade XR Player Feedback & Spatial UI FX.
// Built from scratch for stereo WebXR + bright passthrough rooms:
// - Every ribbon & billboard uses `modelViewMatrix` (per-eye exact in Quest stereo, never twists).
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';
import {
  fxMesh,
  multiQuads,
  shown,
  XR_GLSL_2D,
  xrGlowMaterial,
  type Fx,
  type FxDemo,
} from './core.js';

// ─────────────────────── 4. targetRing (spatial zone / goal / base marker) ───────────────────────

/**
 * Clean spatial XR goal / drop-zone / placement marker (`size` = radius in metres).
 * High-contrast dark-backed ring on local y = 0 + soft 3D light crown + hovering 3D chevron pointer (`▼`).
 * Call `.pulse()` to trigger a bright confirmation wave when an item/ball enters!
 */
export function targetRing({ color = 0x2ee6a6, size = 0.34 } = {}): Fx & { pulse(): void } {
  const crownH = size * 0.55;
  const uniforms = {
    uTime: { value: 0 },
    uPulse: { value: -10 },
    uSize: { value: size },
    uHeight: { value: crownH },
    uColor: shown(color),
  };

  // Surface ring on local y = 0.004
  const discGeo = new CircleGeometry(size * 1.12, 64);
  discGeo.rotateX(-Math.PI / 2);
  discGeo.translate(0, 0.004, 0);
  const discMat = xrGlowMaterial(
    uniforms,
    /* glsl */ `
      varying vec2 vQ;
      void main() {
        vQ = (uv - 0.5) * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    /* glsl */ `
      precision highp float;
      uniform float uTime, uPulse;
      uniform vec3 uColor;
      varying vec2 vQ;
      ${XR_GLSL_2D}
      void main() {
        float r = length(vQ);
        if (r > 1.0) discard;
        float t = uTime;
        float ang = atan(vQ.y, vQ.x);

        // Outer solid rim + rotating tactical dash band + inward radar sweep + centre dot
        float outer = smoothstep(0.028, 0.0, abs(r - 0.88));
        float dashes = step(0.38, fract((ang - t * 0.55) * 8.0 / 6.2831853))
                     * smoothstep(0.022, 0.0, abs(r - 0.75));
        float radar = 1.0 - fract(t * 0.65);
        float sweep = exp(-pow((r - radar * 0.86) / 0.06, 2.0)) * (1.0 - radar) * 0.85;
        float dotC = smoothstep(0.11, 0.05, r);

        // Triggered confirmation pulse
        float pt = t - uPulse;
        float burstWave = pt > 0.0 && pt < 0.7 ? exp(-pow((r - pt * 1.45) / 0.09, 2.0)) * (1.0 - pt / 0.7) * 2.2 : 0.0;

        float darkBack = smoothstep(0.96, 0.72, r) * 0.32 + smoothstep(0.065, 0.0, abs(r - 0.88)) * 0.55;
        float power = (outer * 1.25 + dashes * 0.95 + sweep + dotC * 1.15 + burstWave) * (1.0 - smoothstep(0.93, 1.0, r));
        vec3 hot = mix(uColor, vec3(1.0), clamp(power * 0.35 + burstWave * 0.4, 0.0, 0.85));
        gl_FragColor = vec4(vec3(0.03, 0.04, 0.06) * darkBack + hot * power * 1.15, clamp(darkBack + power * 0.82, 0.0, 0.95));
      }`,
    undefined,
    true,
  );

  // Low sleek 3D Fresnel crown rising from the ring
  const crownGeo = new CylinderGeometry(size * 0.98, size * 0.98, crownH, 48, 1, true);
  crownGeo.translate(0, crownH * 0.5, 0);
  const crownMat = xrGlowMaterial(
    uniforms,
    /* glsl */ `
      uniform float uHeight;
      varying float vH;
      varying vec3 vNormal, vView;
      void main() {
        vH = position.y / uHeight;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * normal;
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uColor;
      varying float vH;
      varying vec3 vNormal, vView;
      ${XR_GLSL_2D}
      void main() {
        float edge = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        float rise = pow(1.0 - vH, 1.8) * smoothstep(0.0, 0.05, vH);
        float breath = 0.8 + 0.2 * sin(uTime * 3.0);
        float p = rise * (0.28 + 0.75 * edge) * breath;
        gl_FragColor = xrOut(uColor * 0.55, p * 0.48, mix(uColor, vec3(1.0), 0.35 * rise) * p * 1.05);
      }`,
  );

  // Crossed 3D stereo bobbing chevron pointer (`▼`) above the spot — visible from shallow seated angles!
  const arrowGeo = multiQuads([0, 1]);
  const arrowMat = xrGlowMaterial(
    uniforms,
    /* glsl */ `
      attribute float aKind;
      uniform float uTime, uSize;
      varying vec2 vQ;
      void main() {
        vQ = position.xy;
        float bob = uSize * (0.62 + 0.12 * sin(uTime * 3.6));
        float spin = uTime * 1.1 + aKind * 1.5707963;
        float r = uSize * 0.24;
        vec3 p = vec3(cos(spin) * position.x * r, bob + position.y * r, sin(spin) * position.x * r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      varying vec2 vQ;
      ${XR_GLSL_2D}
      void main() {
        // Crisp downward chevron SDF in [-1, 1]^2
        float ax = abs(vQ.x);
        float lineY = -0.38 + ax * 0.95;
        float chev = smoothstep(0.22, 0.06, abs(vQ.y - lineY)) * step(ax, 0.78);
        if (chev < 0.01) discard;
        float core = smoothstep(0.14, 0.0, abs(vQ.y - lineY)) * step(ax, 0.74);
        gl_FragColor = xrOut(uColor * 0.75, chev * 0.9, mix(uColor, vec3(1.0), core * 0.75) * chev * 1.35);
      }`,
  );

  let now = 0;
  const object = new Group();
  object.add(fxMesh(discGeo, discMat, 0), fxMesh(crownGeo, crownMat, 1), fxMesh(arrowGeo, arrowMat, 2));
  return {
    object,
    pulse() {
      uniforms.uPulse.value = now;
    },
    update(_delta, age) {
      now = age;
      uniforms.uTime.value = age;
    },
    dispose() {
      discGeo.dispose();
      discMat.dispose();
      crownGeo.dispose();
      crownMat.dispose();
      arrowGeo.dispose();
      arrowMat.dispose();
    },
  };
}

// ─────────────────────── 5. outlineGlow (3D object pickup aura) ───────────────────────

/**
 * Endless 3D "pick me up / important item" aura around an object `size` metres wide:
 * Fresnel halo shell + two counter-orbiting stereo comet rings + rising sparkles.
 */
export function outlineGlow({ color = 0xffc933, size = 0.25 } = {}): Fx {
  const uTime = { value: 0 };
  const uColor = shown(color);

  const shellGeo = new SphereGeometry(size * 0.6, 32, 22);
  const shellMat = xrGlowMaterial(
    { uTime, uColor },
    /* glsl */ `
      varying vec3 vN, vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vN, vV;
      ${XR_GLSL_2D}
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.2);
        float pulse = 0.68 + 0.32 * sin(uTime * 2.6);
        float p = rim * pulse;
        gl_FragColor = xrOut(uColor * 0.8, p * 0.52, mix(uColor, vec3(1.0), 0.4) * p * 1.15);
      }`,
  );

  // Two stereo-exact orbiting comet rings
  const segs = 64;
  const vertsPerRing = (segs + 1) * 2;
  const ringAng = new Float32Array(vertsPerRing * 2);
  const ringSide = new Float32Array(vertsPerRing * 2);
  const ringId = new Float32Array(vertsPerRing * 2);
  const ringIdx: number[] = [];
  for (let r = 0; r < 2; r++) {
    const base = r * vertsPerRing;
    for (let s = 0; s <= segs; s++) {
      for (let k = 0; k < 2; k++) {
        const v = base + s * 2 + k;
        ringAng[v] = (s / segs) * Math.PI * 2;
        ringSide[v] = k === 0 ? -1 : 1;
        ringId[v] = r;
      }
      if (s < segs) {
        const a = base + s * 2;
        ringIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const ringGeo = new BufferGeometry();
  ringGeo.setIndex(ringIdx);
  ringGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(vertsPerRing * 6), 3));
  ringGeo.setAttribute('aAngle', new Float32BufferAttribute(ringAng, 1));
  ringGeo.setAttribute('aSide', new Float32BufferAttribute(ringSide, 1));
  ringGeo.setAttribute('aRing', new Float32BufferAttribute(ringId, 1));

  const ringMat = xrGlowMaterial(
    { uTime, uColor, uR: { value: size * 0.78 }, uW: { value: size * 0.032 } },
    /* glsl */ `
      attribute float aAngle, aSide, aRing;
      uniform float uTime, uR, uW;
      varying float vAng, vSide, vRing;
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
      void main() {
        float second = step(0.5, aRing);
        float rad = uR * mix(1.0, 1.12, second);
        mat3 m = rotY(uTime * mix(0.65, -0.5, second) + second * 2.0) * rotX(mix(0.88, -0.72, second));
        vec3 c = m * (vec3(cos(aAngle), 0.0, sin(aAngle)) * rad);
        vec3 tang = m * vec3(-sin(aAngle), 0.0, cos(aAngle));
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        vec3 tv = (modelViewMatrix * vec4(tang, 0.0)).xyz;
        vec3 side = cross(normalize(tv + vec3(1e-5)), normalize(mv.xyz));
        side /= max(length(side), 1e-4);
        mv.xyz += side * aSide * uW * 0.5;
        vAng = aAngle;
        vSide = aSide;
        vRing = aRing;
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uColor;
      varying float vAng, vSide, vRing;
      ${XR_GLSL_2D}
      void main() {
        float dir = vRing < 0.5 ? 1.0 : -1.0;
        float ph = fract(vAng / 6.2831853 * dir - uTime * (0.35 + 0.12 * vRing));
        float comet = pow(ph, 3.8) * smoothstep(0.0, 0.04, 1.0 - ph);
        float inten = 0.18 + 0.82 * comet;
        float core = exp(-vSide * vSide * 10.0);
        float soft = max(1.0 - vSide * vSide, 0.0);
        gl_FragColor = xrOut(uColor * 0.75, (soft * 0.55 + core * 0.4) * (0.3 + 0.7 * inten), mix(uColor, vec3(1.0), 0.7 * core * comet) * (core * 1.35 + soft * 0.3) * inten);
      }`,
  );

  const object = new Group();
  object.add(fxMesh(shellGeo, shellMat, 1), fxMesh(ringGeo, ringMat, 2));
  return {
    object,
    update(_delta, age) {
      uTime.value = age;
    },
    dispose() {
      shellGeo.dispose();
      shellMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}

// ─────────────────────── Preview Demos (/research/stands/fx.html) ───────────────────────

export const demos: FxDemo[] = [
  {
    name: 'targetRing',
    title: 'Кольцо цели / зоны',
    make: () => {
      const ring = targetRing({ size: 0.42 });
      let nextPulse = 0.6;
      return {
        object: ring.object,
        update(delta, age) {
          if (age > nextPulse) {
            nextPulse += 1.6;
            ring.pulse();
          }
          return ring.update(delta, age);
        },
        dispose: () => ring.dispose?.(),
      };
    },
    view: 1.45,
  },
  {
    name: 'outlineGlow',
    title: 'Подсветка предмета',
    make: () => {
      const aura = outlineGlow();
      const cube = new Mesh(new BoxGeometry(0.14, 0.14, 0.14), new MeshStandardMaterial({ color: 0x8c7b6b, roughness: 0.75 }));
      aura.object.add(cube);
      aura.object.position.y = 0.26;
      return aura;
    },
    view: 1.05,
  },
];
