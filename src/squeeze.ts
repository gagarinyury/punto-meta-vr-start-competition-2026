// Squeezing a model through a hole in a wall, in 3D. Every vertex near the wall's plane is pulled in
// towards the hole's axis, as far as the hole is narrow, and the volume pushed out of the narrow part
// goes forward and back along the axis, with a little bulge either side of the wall: an hourglass
// where the wall holds it, like toothpaste. A deformer in the vertex shader of the model's own
// materials (what films and games use for this), not a soft-body simulation. The pinch follows the
// wall, so as the model moves through, the waist runs along its body by itself.
//
//   const squeeze = squeezable(punto.object);          // once: patches its materials
//   squeeze.hole(centre, normal, 0.12);                 // where the hole is, its axis, its radius (m)
//   squeeze.amount = 1;                                 // 0 = no effect, 1 = fits the hole
import { type InstancedMesh, type Material, type Mesh, type Object3D, Vector3 } from '@iwsdk/core';

const HEADER = /* glsl */ `
uniform vec3 uSqueezeHole;
uniform vec3 uSqueezeAxis;
uniform float uSqueezeRadius;
uniform float uSqueezeBand;
uniform float uSqueezeAmount;
vec3 squeezeWorld(vec3 p) {
  vec3 rel = p - uSqueezeHole;
  float d = dot(rel, uSqueezeAxis);              // along the hole's axis: 0 in the wall
  vec3 side = rel - d * uSqueezeAxis;            // across it
  float r = length(side);
  if (r < 1e-5) return p;
  float hold = exp(-(d * d) / (uSqueezeBand * uSqueezeBand));   // 1 in the wall, 0 away from it
  // in the wall everything is drawn within the hole's radius: the inner part hardly moves, the outer most
  float fitted = uSqueezeRadius * tanh(r / uSqueezeRadius);
  float rNew = mix(r, fitted, hold * uSqueezeAmount * exp(-pow(r / (3.0 * uSqueezeRadius), 4.0)));
  // what was squeezed out goes along the axis, away from the wall on its own side
  float lost = 1.0 - rNew / r;
  float dNew = d + sign(d) * uSqueezeBand * 0.9 * lost * uSqueezeAmount;
  // and swells a little just out of the wall, either side
  float near = abs(d) / uSqueezeBand;
  // (the body only: the hands, far off the axis, keep their shape)
  float body = exp(-pow(r / (2.2 * uSqueezeRadius), 2.0));
  float swell = exp(-pow(near - 1.7, 2.0)) * (1.0 - hold) * 0.1 * body * uSqueezeAmount;
  rNew *= 1.0 + swell;
  return uSqueezeHole + uSqueezeAxis * dNew + side * (rNew / r);
}
`;

const BODY = /* glsl */ `
if (uSqueezeAmount > 0.0) {
  vec4 squeezeAt = modelMatrix * vec4(transformed, 1.0);
  transformed = (inverse(modelMatrix) * vec4(squeezeWorld(squeezeAt.xyz), 1.0)).xyz;
}
`;

export interface Squeezable {
  /** 0 = no effect, 1 = fits the hole. */
  amount: number;
  /** The hole: its centre on the wall, its axis (the wall's normal), its radius, all in the room (m). */
  hole(centre: Vector3, axis: Vector3, radius: number, band?: number): void;
}

const made = new WeakMap<Object3D, Squeezable>();

/** Patches every built-in material under `object` (not instanced meshes, not custom shaders), once for good. */
export function squeezable(object: Object3D): Squeezable {
  const known = made.get(object);
  if (known) return known;
  const uniforms = {
    uSqueezeHole: { value: new Vector3() },
    uSqueezeAxis: { value: new Vector3(0, 0, 1) },
    uSqueezeRadius: { value: 0.12 },
    uSqueezeBand: { value: 0.05 },
    uSqueezeAmount: { value: 0 },
  };
  const patched = new Set<Material>();
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || (mesh as InstancedMesh).isInstancedMesh) return;
    for (const material of [mesh.material].flat()) {
      if (patched.has(material) || (material as { isShaderMaterial?: boolean }).isShaderMaterial) continue;
      patched.add(material);
      const before = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        before.call(material, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${HEADER}`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BODY}`);
      };
      const key = material.customProgramCacheKey.bind(material);
      material.customProgramCacheKey = () => `${key()}|squeeze`;
      material.needsUpdate = true;
    }
  });
  const api: Squeezable = {
    get amount() {
      return uniforms.uSqueezeAmount.value;
    },
    set amount(value: number) {
      uniforms.uSqueezeAmount.value = value;
    },
    hole(centre, axis, radius, band = 0.05) {
      uniforms.uSqueezeHole.value.copy(centre);
      uniforms.uSqueezeAxis.value.copy(axis).normalize();
      uniforms.uSqueezeRadius.value = radius;
      uniforms.uSqueezeBand.value = band;
    },
  };
  made.set(object, api);
  return api;
}
