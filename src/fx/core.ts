import {
  BufferGeometry,
  Color,
  createSystem,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Entity,
  type IUniform,
  type Object3D,
  type Side,
  type World,
} from '@iwsdk/core';

/**
 * One visual effect: a Three.js object plus the code that animates it.
 *
 * Built by a plain factory function with no access to the world, so the same
 * effect runs in a game (through `play`) and on the flat preview page (`/research/stands/fx.html`).
 * The effect sits at its own origin, +Y up, sizes in metres.
 */
export interface Fx {
  object: Object3D;
  /** Keep `object` in world space even when `play` is given a moving Entity/Object3D (e.g. `trail`). */
  worldSpace?: boolean;
  /** Fed automatically with world position each frame when attached to an Entity/Object3D. */
  follow?(point: Vector3): void;
  /** Called once by `play` with the world the effect has come into (shots find the real room's surfaces through it). */
  enter?(world: World): void;
  /**
   * Called every frame with the frame time and the effect's age in seconds.
   * Return false when a one-shot effect is over; endless effects return nothing.
   */
  update(delta: number, age: number): boolean | void;
  /** Cleanup for effect-owned GPU resources (textures, buffers, materials), or return to pool when `pooled` is true. */
  dispose?(): void;
  /** Set true when `dispose()` recycles shared/pooled GPU resources so `entity.dispose` skips recursive buffer destruction. */
  pooled?: boolean;
}

/** A tile on the preview page (/research/stands/fx.html). Every effects file exports `demos`. */
export interface FxDemo {
  name: string;
  title: string;
  make: () => Fx;
  /** Replay a one-shot effect every so many seconds; leave out for endless effects. */
  every?: number;
  /** Camera distance in metres (default 1.6). */
  view?: number;
}

// ─────────────────────── Shared XR Shader & Geometry Primitives ───────────────────────

/** Convert hex colour so raw shader output matches display sRGB without washed-out gamma. */
export const shownColor = (hex: number): Color => new Color(hex).convertLinearToSRGB();
export const shown = (hex: number): { value: Color } => ({ value: shownColor(hex) });

/**
 * XR Premultiplied Hybrid Glow Material:
 * Fragment outputs `vec4(body * alpha + hdrGlow, alpha)`.
 * - On bright sunlit passthrough walls: `alpha` darkens/tints the wall with saturated `body` colour.
 * - In dark space / shadow: `hdrGlow` adds crisp incandescent bloom without muddying.
 * Never uses `gl_PointSize` (which clamps or breaks across Quest stereo viewports).
 */
export function xrGlowMaterial(
  uniforms: Record<string, IUniform>,
  vertexShader: string,
  fragmentShader: string,
  side: Side = DoubleSide,
  polygonOffset = false,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: NormalBlending,
    polygonOffset,
    polygonOffsetFactor: polygonOffset ? -1 : 0,
    polygonOffsetUnits: polygonOffset ? -2 : 0,
  });
}

/** Fast 2D hash / value noise / 4-octave fbm + premultiplied XR glow helper. */
export const XR_GLSL_2D = /* glsl */ `
  float hash11(float n) {
    return fract(sin(n * 127.1 + 311.7) * 43758.5453123);
  }
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm2(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p = p * 2.03 + vec2(17.1, 9.7);
      a *= 0.5;
    }
    return v;
  }
  // Six-ray star flare + four-point arcade sparkle
  vec2 xrStar6(vec2 q) {
    float r = length(q);
    float a = atan(q.y, q.x + 1e-5);
    float spikes = pow(abs(cos(a * 3.0)), 16.0) + 0.55 * pow(abs(cos(a * 2.0 + 0.8)), 22.0);
    spikes *= pow(max(1.0 - r, 0.0), 1.4);
    float core = exp(-r * r * 20.0);
    float halo = exp(-r * r * 4.8) * 0.48;
    float edge = 1.0 - smoothstep(0.78, 1.0, r);
    return vec2((core * 1.65 + spikes * 1.35 + halo) * edge, clamp(core + spikes * 0.4, 0.0, 1.0));
  }
  vec2 xrSparkle4(vec2 q) {
    float arms = exp(-abs(q.x) * 13.0 - abs(q.y) * 2.8) + exp(-abs(q.y) * 13.0 - abs(q.x) * 2.8);
    float core = exp(-dot(q, q) * 10.0);
    float edge = 1.0 - smoothstep(0.75, 1.0, length(q));
    return vec2((arms * 0.75 + core * 1.2) * edge, clamp(core + arms * 0.3, 0.0, 1.0));
  }
  vec4 xrOut(vec3 body, float alpha, vec3 glow) {
    float a = clamp(alpha, 0.0, 0.96);
    return vec4(body * a + glow, a);
  }
`;

/** Fast 3D noise / fbm for volumetric spheres, shields and fireballs. */
export const XR_GLSL_3D = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
          mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
          mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 5.4);
      a *= 0.5;
    }
    return v;
  }
`;

/** Stereo-safe view-space billboard helper (`position.xy` in `[-1, 1]`). */
export const XR_BILLBOARD_VERT = /* glsl */ `
  vec4 xrBillboard(vec3 localPos, float radius, float roll) {
    float c = cos(roll);
    float s = sin(roll);
    vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
    vec4 mv = modelViewMatrix * vec4(localPos, 1.0);
    mv.xy += q * radius;
    return projectionMatrix * mv;
  }
`;

const QUAD_POS = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
const QUAD_UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const QUAD_IDX = [0, 1, 2, 0, 2, 3];

/** Create an `InstancedBufferGeometry` of `count` `[-1, 1]` quads with typed per-instance attributes. */
export function instancedQuads(
  count: number,
  attrs: Record<string, number>,
): { geometry: InstancedBufferGeometry; data: Record<string, Float32Array> } {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(QUAD_POS, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(QUAD_UV, 2));
  geometry.setIndex(QUAD_IDX);
  geometry.instanceCount = count;
  const data: Record<string, Float32Array> = {};
  for (const [name, itemSize] of Object.entries(attrs)) {
    const arr = new Float32Array(count * itemSize);
    data[name] = arr;
    geometry.setAttribute(name, new InstancedBufferAttribute(arr, itemSize));
  }
  return { geometry, data };
}

/** Multi-quad single-draw geometry tagged by `aKind` (`position.xy` in `[-1, 1]`). */
export function multiQuads(kinds: number[]): BufferGeometry {
  const pos: number[] = [];
  const kind: number[] = [];
  const idx: number[] = [];
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  kinds.forEach((k, q) => {
    for (let c = 0; c < 4; c++) {
      pos.push(corners[c * 2], corners[c * 2 + 1], 0);
      kind.push(k);
    }
    const b = q * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aKind', new Float32BufferAttribute(kind, 1));
  geometry.setIndex(idx);
  return geometry;
}

/** Wrap geometry + shader material in an unculled mesh (GPU shaders displace vertices outside local bounds). */
export function fxMesh(geometry: BufferGeometry, material: ShaderMaterial, renderOrder = 0): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}

// ─────────────────────── Runtime Orchestrator (`play`) ───────────────────────

interface ActiveFx {
  entity?: Entity;
  fx: Fx;
  age: number;
  track?: Object3D;
  sourceEntity?: Entity;
  orphanAge: number;
}

const UP = new Vector3(0, 1, 0);
const _pos = new Vector3();
const _dir = new Vector3();
const _quat = new Quaternion();

const running = new WeakMap<World, ActiveFx[]>();

function cleanupItem(item: ActiveFx): void {
  if (item.entity) {
    if (item.entity.active) {
      item.entity.dispose({ disposeResources: !item.fx.pooled });
    }
  } else {
    item.fx.object.removeFromParent();
  }
  item.fx.dispose?.();
}

/**
 * Shows an effect in the game:
 * - `play(world, fx, point)` — at a world `Vector3`
 * - `play(world, fx, point, normal)` — oriented so local `+Y` aligns with `normal` (walls, ceilings, slopes!)
 * - `play(world, fx, entityOrObject3D)` — parented to it, or auto-tracking its world position (`trail`)
 *
 * One-shot effects remove and dispose themselves; `stop()` removes an endless one.
 */
export function play(
  world: World,
  fx: Fx,
  at?: Vector3 | Entity | Object3D,
  normal?: Vector3,
): { stop(): void } {
  let list = running.get(world);
  if (!list) {
    const active: ActiveFx[] = [];
    list = active;
    running.set(world, active);
    world.registerSystem(
      class Effects extends createSystem({}) {
        update(delta: number): void {
          for (let i = active.length - 1; i >= 0; i--) {
            const item = active[i];
            item.age += delta;
            if (item.sourceEntity && !item.sourceEntity.active) {
              item.orphanAge += delta;
              if (item.orphanAge > 0.5) {
                cleanupItem(item);
                active.splice(i, 1);
                continue;
              }
            } else if (item.track && item.fx.follow) {
              item.track.getWorldPosition(_pos);
              item.fx.follow(_pos);
            }
            if (item.fx.update(delta, item.age) === false) {
              cleanupItem(item);
              active.splice(i, 1);
            }
          }
        }
        destroy(): void {
          for (let i = active.length - 1; i >= 0; i--) {
            cleanupItem(active[i]);
          }
          active.length = 0;
        }
      },
    );
  }

  // Custom shaders cannot be rewritten by IWSDK's real-world depth-occlusion material patcher.
  fx.object.userData.occlude = false;
  fx.enter?.(world);

  if (normal) {
    _dir.copy(normal);
    if (_dir.lengthSq() > 1e-6) {
      _dir.normalize();
      _quat.setFromUnitVectors(UP, _dir);
      fx.object.quaternion.copy(_quat);
    }
  }

  let entity: Entity | undefined;
  let track: Object3D | undefined;
  let sourceEntity: Entity | undefined;

  if (!at) {
    entity = world.createTransformEntity(fx.object);
  } else if ('isVector3' in at) {
    fx.object.position.copy(at);
    entity = world.createTransformEntity(fx.object);
  } else if ('isObject3D' in at) {
    if (fx.worldSpace && fx.follow) {
      track = at;
      at.getWorldPosition(_pos);
      fx.follow(_pos);
      entity = world.createTransformEntity(fx.object);
    } else {
      at.add(fx.object);
    }
  } else {
    sourceEntity = at;
    if (fx.worldSpace && fx.follow) {
      track = at.object3D ?? undefined;
      if (track) {
        track.getWorldPosition(_pos);
        fx.follow(_pos);
      }
      entity = world.createTransformEntity(fx.object);
    } else {
      entity = world.createTransformEntity(fx.object, at);
    }
  }

  fx.object.traverse((part) => {
    part.castShadow = false;
    part.raycast = () => {}; // FX never intercept XR pointer/hand rays
  });

  const item: ActiveFx = { entity, fx, age: 0, track, sourceEntity, orphanAge: 0 };
  list.push(item);
  const active = list;
  return {
    stop() {
      const index = active.indexOf(item);
      if (index >= 0) {
        active.splice(index, 1);
        cleanupItem(item);
      }
    },
  };
}
