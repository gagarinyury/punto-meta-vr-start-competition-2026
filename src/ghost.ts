import { Group, InstancedMesh, type Material, Mesh, Object3D, type Scene, Vector3 } from '@iwsdk/core';

/**
 * The ghost of a creation that is being replaced (13.11). Without it the old version goes at
 * once and the new one comes a moment later: the thing blinks out. The ghost is a look-only copy
 * of the old version (no logic, physics, sound or lights) left where it was; it holds until the
 * new version has loaded, then burns away in noise with a glowing rim, showing the new one under
 * it. Where nothing changed the two match and the burn hardly shows; where something changed,
 * the old burns off the new.
 */

const HOLD_MS = 1500; // the ghost burns by itself if no new version comes
const BURN_MS = 800;
const RIM = new Vector3(0.35, 0.95, 1.0); // Punto's cyan

interface Ghost {
  root: Object3D;
  scene: Scene;
  /** The old version's geometries, materials and textures: let go when the ghost is gone (release). */
  owned: Set<Disposable>;
  materials: Material[];
  uniforms: { uBurn: { value: number }; uRim: { value: Vector3 } };
  burnFrom?: number;
}

interface Disposable {
  dispose(): void;
}

const ghosts = new Set<Ghost>();
let newCameAt = -Infinity; // the new version may load just before the old one leaves

/**
 * Leaves a ghost of `objects` (the old version's things) in `scene`; `now`: it burns at once. True when
 * a ghost was left: it then owns the old things' geometries, materials and textures and lets go of
 * those nobody in the scene uses when it is gone (release), so the old things may go without them.
 */
export function leaveGhost(scene: Scene, objects: Object3D[], now: boolean): boolean {
  const set = new Set(objects);
  // only the outermost ones: a thing inside another is copied with it
  const roots = objects.filter((object) => {
    for (let up = object.parent; up; up = up.parent) if (set.has(up)) return false;
    return object.visible;
  });
  if (!roots.length) return false;
  // a burning copy needs a shader of its own per material: a thing of many materials stopped a frame as it went
  // (18.11, «когда удаляется, тоже подвисает»: 21–48 materials) — it goes at once, without a ghost
  const kinds = new Set<Material>();
  for (const root of roots) root.traverse((o) => { const m = (o as Mesh).material; if (m) for (const one of Array.isArray(m) ? m : [m]) kinds.add(one); });
  if (kinds.size > 8) {
    console.info(`[ghost] none: ${kinds.size} materials, it goes at once`);
    return false;
  }
  const uniforms = burnUniforms();
  const owned = new Set<Disposable>();
  for (const object of objects) object.traverse((inner) => resourcesOf(inner, owned));
  const ghost: Ghost = { root: undefined!, scene, owned, materials: [], uniforms };
  const swapped = new Map<Material, Material>();
  const group = (ghost.root = new Group());
  group.name = 'ghost';
  for (const root of roots) {
    root.updateWorldMatrix(true, false);
    const copy = lookOnly(root);
    if (!copy) continue;
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(root.matrixWorld);
    const drop: Object3D[] = [];
    copy.traverse((object) => {
      const mesh = object as Mesh & { isLight?: boolean; isSkinnedMesh?: boolean; isLine?: boolean; isPoints?: boolean };
      if (mesh.isLight || mesh.isSkinnedMesh || mesh.isLine || mesh.isPoints) {
        drop.push(object); // a cloned skeleton draws nothing; lights and lines are not worth it
        return;
      }
      if (!mesh.isMesh) return;
      const own = (material: Material) => {
        let copied = swapped.get(material);
        if (!copied) {
          copied = burnable(material.clone(), uniforms);
          swapped.set(material, copied);
          ghost.materials.push(copied);
        }
        return copied;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      mesh.renderOrder = 10; // over the new version where the two match
      mesh.castShadow = false;
      mesh.raycast = () => {}; // rays go through to the new version
      mesh.onBeforeRender = tick;
    });
    for (const object of drop) object.removeFromParent();
    group.add(copy);
  }
  scene.add(group);
  ghosts.add(ghost);
  console.info(`[ghost] left: ${roots.length} things, ${ghost.materials.length} materials`);
  if (now || performance.now() - newCameAt < 500) ghost.burnFrom = performance.now();
  setTimeout(() => (ghost.burnFrom ??= performance.now()), HOLD_MS);
  return true;
}

// What an object draws with: its geometry, materials and their textures.
function resourcesOf(object: Object3D, into: Set<Disposable>): void {
  const mesh = object as Mesh;
  if (mesh.geometry) into.add(mesh.geometry);
  if (!mesh.material) return;
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    into.add(material);
    const fields = material as unknown as Record<string, { isTexture?: boolean; value?: { isTexture?: boolean } }>;
    for (const key in fields) if (fields[key]?.isTexture) into.add(fields[key] as unknown as Disposable);
    const uniforms = (material as { uniforms?: Record<string, { value?: { isTexture?: boolean } }> }).uniforms;
    for (const key in uniforms ?? {}) if (uniforms![key]?.value?.isTexture) into.add(uniforms![key].value as unknown as Disposable);
  }
}

// The ghost is gone. The old version's things went without their resources (live.ts) or with them;
// either way the ghost drew them for its 2 s, and three uploaded what had been let go again: now
// whatever nobody in the scene uses goes (a hidden version that may come back, or a model the
// new version loads too, is still in the scene and stays). Audit item 25: they hung on before.
function release(ghost: Ghost): void {
  for (const material of ghost.materials) material.dispose();
  const inUse = new Set<Disposable>();
  ghost.scene.traverse((object) => resourcesOf(object, inUse));
  for (const resource of ghost.owned) if (!inUse.has(resource)) resource.dispose();
  ghost.owned.clear();
}

// A copy of the object tree without what has no look: sounds (THREE.Audio cannot be cloned and
// warns), lights, skinned meshes (a cloned skeleton draws nothing), lines and points.
function lookOnly(object: Object3D): Object3D | undefined {
  // Only plain three.js things are copied: UI panels (UIKit) and other subclasses cannot be cloned
  // and threw on every swap (14.11, "Cannot read properties of undefined (reading 'children')").
  const plain = [Object3D, Group, Mesh, InstancedMesh] as unknown[];
  if (!plain.includes(object.constructor)) return undefined;
  let copy: Object3D;
  try {
    copy = object.clone(false);
  } catch {
    return undefined;
  }
  for (const child of object.children) {
    const kind = child as Object3D & { isLight?: boolean; isSkinnedMesh?: boolean; isLine?: boolean; isPoints?: boolean };
    if (child.type === 'Audio' || child.type === 'PositionalAudio' || child.type === 'AudioListener') continue;
    if (kind.isLight || kind.isSkinnedMesh || kind.isLine || kind.isPoints) continue;
    const inner = lookOnly(child);
    if (inner) copy.add(inner);
  }
  return copy;
}

/** The new version is in: every ghost starts burning. */
export function burnGhosts(): void {
  const now = (newCameAt = performance.now());
  for (const ghost of ghosts) ghost.burnFrom ??= now;
}

// Runs as a ghost mesh is drawn (the XR frame loop has no window.requestAnimationFrame).
function tick(): void {
  const now = performance.now();
  for (const ghost of ghosts) {
    if (ghost.burnFrom === undefined) continue;
    const t = (now - ghost.burnFrom) / BURN_MS;
    ghost.uniforms.uBurn.value = Math.min(1, t);
    if (t >= 1.05) {
      ghost.root.removeFromParent();
      ghosts.delete(ghost);
      // after this frame: the rest of the ghost may still be drawn in it
      setTimeout(() => release(ghost), 0);
    }
  }
}

/** The uniforms of one burn: `uBurn` 0 = whole, 1 = gone. Run it backwards and the thing appears (src/draft.ts). */
export function burnUniforms(burn = 0): Ghost['uniforms'] {
  return { uBurn: { value: burn }, uRim: { value: RIM } };
}

/**
 * The material, burning: fragments under the noise threshold are gone, those just above it glow.
 * `over`: drawn over another thing's identical surfaces (a ghost over the new version).
 */
export function burnable(material: Material, uniforms: Ghost['uniforms'], over = true): Material {
  if (over) {
    material.polygonOffset = true; // drawn over the new version's identical surfaces, no flicker
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -4;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBurn = uniforms.uBurn;
    shader.uniforms.uRim = uniforms.uRim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGhostPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 ghostPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          ghostPos = instanceMatrix * ghostPos;
        #endif
        vGhostPos = (modelMatrix * ghostPos).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGhostPos;
        uniform float uBurn;
        uniform vec3 uRim;
        float ghostHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float ghostNoise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(ghostHash(i), ghostHash(i + vec3(1,0,0)), f.x), mix(ghostHash(i + vec3(0,1,0)), ghostHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(ghostHash(i + vec3(0,0,1)), ghostHash(i + vec3(1,0,1)), f.x), mix(ghostHash(i + vec3(0,1,1)), ghostHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float ghostN = 0.65 * ghostNoise(vGhostPos * 14.0) + 0.35 * ghostNoise(vGhostPos * 41.0);
        float ghostCut = uBurn * 1.15 - 0.05;
        if (ghostN < ghostCut) discard;
        float ghostRim = 1.0 - smoothstep(0.0, 0.05, ghostN - ghostCut);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uRim * 1.6, ghostRim * step(0.001, uBurn));`,
      );
  };
  material.customProgramCacheKey = () => 'ghost-burn';
  return material;
}
