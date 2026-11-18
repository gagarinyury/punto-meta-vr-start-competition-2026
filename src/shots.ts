// Shots (18.11): everything that is fired and flies — the third part of the new set, next to life.ts and event.ts.
// One `shots` is one KIND of fire for as many guns as you like (a pistol, a fleet of ships): a pool of bolts drawn as
// ONE instanced mesh, their muzzle stars as another; call fire(from, direction) for each shot. A bolt flies at a
// speed the eye can follow and hits when it arrives (a ray against the targets' boxes, computed once a frame).
//   'bullet'  a thin bright tracer with a fading tail; where it lands — a hit (event.ts impact): star, sparks, a mark
//   'bolt'    a blaster's bolt: a fat glowing rod, white down its middle, its colour at the rim, a short tail
//   'orb'     a ball of plasma with a string of shrinking beads behind it
//   'rocket'  a rocket with a flickering jet and a trail of the smoke's puffs left in the air; it lands as an explosion
// and `laser`: a steady ray between two points with running pulses, light at both ends and sparks where it burns.
// The headset first: opaque, instanced, no noise; a bolt's glow is painted on its own surface (white where it faces
// the eye), so it shows against a bright room where added light would be lost. (The first shots, src/shot.ts gunShot,
// made a mesh and a material for every wisp of smoke; these replace them in the new set.)
import {
  Box3,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  type Mesh as MeshType,
  type Object3D,
  Quaternion,
  Ray,
  ShaderMaterial,
  Vector2,
  Vector3,
  type World,
} from '@iwsdk/core';
import type { Fx } from './fx/core.js';
import { roomSurfaces } from './fx/room.js';
import { impact, starGeometry, twinkleMaterial } from './event.js';
import { blend, glow, hash, puffGeometry, ready, shown, smokeMaterial, smooth } from './life.js';
import { pyroBoom } from './pyro.js';

const Y = new Vector3(0, 1, 0);

/** A bolt's shape: a spindle 1 long along Y, 1 across at its middle, pointed at both ends. 72 triangles. */
export function spindle(): LatheGeometry {
  const points: Vector2[] = [];
  for (let k = 0; k <= 6; k++) points.push(new Vector2(0.5 * Math.max(0, Math.sin((Math.PI * k) / 6)) ** 0.75, k / 6 - 0.5));
  return new LatheGeometry(points, 6);
}

/** Glowing rods and balls: white-hot where the surface faces the eye, the colour at the rim. `aCore`, `aEdge` each. */
export function boltMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec3 aCore;
      attribute vec3 aEdge;
      varying vec3 vCore;
      varying vec3 vEdge;
      varying float vF;
      void main() {
        mat4 model = modelMatrix * instanceMatrix;
        vec4 mv = viewMatrix * model * vec4(position, 1.0);
        // the piece is stretched: its normals are squeezed the other way
        vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 n = normalize(mat3(viewMatrix) * mat3(model) * (normal / max(s * s, vec3(1e-12))));
        vF = clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0);
        vCore = aCore;
        vEdge = aEdge;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCore; varying vec3 vEdge; varying float vF;
      void main() { gl_FragColor = vec4(mix(vEdge, vCore, smoothstep(0.5, 0.82, vF)), 1.0); }`,
  });
}

export type ShotKind = 'bullet' | 'bolt' | 'orb' | 'rocket';
/** Something a shot can hit: an object of the scene, or an entity (its object3D). */
export type ShotTarget = Object3D | { object3D?: Object3D | null };
/** How each kind looks and flies, in sizes: metres a second, its width and length, how many pieces trail it. */
const KINDS = {
  bullet: { speed: 22, wide: 0.03, long: 0.42, tails: 3, gap: 0.3, hit: 0.22 },
  bolt: { speed: 12, wide: 0.07, long: 0.5, tails: 2, gap: 0.32, hit: 0.3 },
  orb: { speed: 8, wide: 0.17, long: 0.19, tails: 4, gap: 0.13, hit: 0.36 },
  rocket: { speed: 7, wide: 0.07, long: 0.26, tails: 1, gap: 0, hit: 0.8 },
} as const;

export interface ShotsOptions {
  kind?: ShotKind;
  /** its colour: a bolt's and an orb's glow (0x5ad8ff), the bullet's tracer (warm) */
  color?: number;
  /** the scale of the shot: 1 for a pistol in the room, 0.25 for ships on a table */
  size?: number;
  /** metres a second for size 1: slow enough to see (bullet 22, bolt 12, orb 8, rocket 7) */
  speed?: number;
  /** what it can hit — each thing's own box, turned as the thing is: your array or Set, read every frame (add and remove targets in it as the game goes), or a function that gives the list */
  targets?: Iterable<ShotTarget> | (() => Iterable<ShotTarget>);
  /** called once for each hit of a target: the target as you gave it, the point and the way out of it, in the world */
  onHit?: (target: ShotTarget, point: Vector3, normal: Vector3) => void;
  /** whether it also lands on the real room's walls, tables and floor (true); `onRoom` is called then */
  room?: boolean;
  onRoom?: (point: Vector3, normal: Vector3) => void;
  /** how far it flies when it hits nothing, in sizes (12) */
  range?: number;
  /** how many can fly at once (12): the oldest is taken when all are flying */
  count?: number;
  /** seconds the mark of a hit stays (bullet, bolt, orb): 6; 0 for none — keep it short for rapid fire */
  mark?: number;
}
export interface Shots extends Fx {
  /** Fires one: from where it leaves the barrel, the way it goes — in the space the effect's object is in. */
  fire(from: Vector3, direction: Vector3): void;
}

/**
 * Endless pooled shots (`play(world, gun)` once with no target, then `gun.fire(from, direction)`). Hits `targets` (`onHit`) and room surfaces (`onRoom`).
 *
 * ONE kind of fire for any number of guns — a pistol, a blaster, a fleet of ships. A bolt flies at a speed the eye can
 * follow and plays an impact/explosion where it lands. `kind`: 'bullet' thin tracer · 'bolt' glowing rod · 'orb' plasma
 * ball · 'rocket' exploding with smoke.
 */
// cost: 2 draw calls (the bolts, the muzzle stars), 3 for rockets (their smoke); a hit adds its own for half a second.
export function shots(o: ShotsOptions = {}): Shots {
  const kind = o.kind ?? 'bolt', K = KINDS[kind], size = o.size ?? 1, count = o.count ?? 12;
  const colour = o.color ?? (kind === 'bullet' ? 0xffa51e : kind === 'rocket' ? 0xff7a1e : 0x5ad8ff);
  const speed = (o.speed ?? K.speed) * size, range = (o.range ?? 12) * size, each = K.tails + 1;
  const object = new Group();
  object.name = 'ToyEffect';
  // ---- the bolts: a head and its tail pieces for each, all one mesh ----
  const geometry = spindle();
  const cores = new Float32Array(count * each * 3), edges = new Float32Array(count * each * 3);
  for (let i = 0; i < count * each; i++) {
    const j = i % each, back = j / each;
    let core = blend(0xffffff, colour, back * 0.9), edge = colour;
    if (kind === 'bullet') (core = blend(0xfffbe0, colour, back)), (edge = blend(colour, 0xff5a14, back * 0.6));
    if (kind === 'rocket') (core = j === 0 ? 0xffffff : 0xfff3a0), (edge = j === 0 ? 0xb9c0cc : colour); // the body; its jet
    shown(core).toArray(cores, i * 3);
    shown(edge).toArray(edges, i * 3);
  }
  geometry.setAttribute('aCore', new InstancedBufferAttribute(cores, 3));
  geometry.setAttribute('aEdge', new InstancedBufferAttribute(edges, 3));
  const material = boltMaterial();
  const bolts = new InstancedMesh(geometry, material, count * each);
  bolts.frustumCulled = false;
  object.add(bolts);
  // ---- the muzzle stars ----
  const FLASHES = 6;
  const flashGeo = starGeometry(8, 0.2), flashMat = twinkleMaterial(blend(colour, 0xffffff, 0.7));
  const flashes = new InstancedMesh(flashGeo, flashMat, FLASHES);
  flashes.frustumCulled = false;
  object.add(flashes);
  const flashAt = Array.from({ length: FLASHES }, () => new Vector3()), flashBorn = new Float32Array(FLASHES).fill(-9);
  let flashNext = 0;
  // ---- a rocket's smoke: puffs left in the air ----
  const PUFFS = kind === 'rocket' ? 40 : 0;
  const puffGeo = PUFFS ? puffGeometry(true) : undefined, puffLife = new Float32Array(Math.max(1, PUFFS)), puffSeed = new Float32Array(Math.max(1, PUFFS));
  const puffLifeAttr = new InstancedBufferAttribute(puffLife, 1);
  puffLifeAttr.setUsage(DynamicDrawUsage);
  let smoke: InstancedMesh | undefined;
  const puffAt = Array.from({ length: PUFFS }, () => new Vector3()), puffBorn = new Float32Array(Math.max(1, PUFFS)).fill(-9);
  let puffNext = 0;
  if (puffGeo) {
    for (let i = 0; i < PUFFS; i++) puffSeed[i] = hash(i, 7, 1) * 10;
    puffGeo.setAttribute('aLife', puffLifeAttr);
    puffGeo.setAttribute('aSeed', new InstancedBufferAttribute(puffSeed, 1));
    smoke = new InstancedMesh(puffGeo, smokeMaterial(0xf1eeea, 0xb4b2b8, 0, size * 1000, 0, 1, true), PUFFS);
    smoke.frustumCulled = false;
    object.add(smoke);
  }
  // ---- the state of each bolt ----
  const at = Array.from({ length: count }, () => new Vector3()), way = Array.from({ length: count }, () => new Vector3());
  const flying = new Uint8Array(count), flown = new Float32Array(count), aged = new Float32Array(count), smoked = new Float32Array(count);
  const hits: { fx: Fx; age: number }[] = [];
  // what can be hit this frame: each thing's own box in its own space (found once), and the way into that space
  const own = new WeakMap<Object3D, Box3>(), part = new Box3(), into = new Matrix4(), rel = new Matrix4();
  const things: Object3D[] = [], given: (ShotTarget | undefined)[] = [], boxes: Box3[] = [], inward: Matrix4[] = [];
  // the list itself, read every frame: a game adds and removes its targets in the array it gave (19.11: the coder's
  // first blaster game pushed its saucers into the array after making the shots — a copy taken here had none)
  const listed: Iterable<ShotTarget> | undefined = typeof o.targets === 'function' ? undefined : (o.targets ?? []);
  let surfaces: Object3D[] = [];
  const ownBox = (thing: Object3D): Box3 => {
    let box = own.get(thing);
    if (!box) {
      const made = new Box3();
      thing.updateWorldMatrix(true, true);
      into.copy(thing.matrixWorld).invert();
      thing.traverse((piece) => {
        const mesh = piece as MeshType;
        if (!mesh.isMesh || !mesh.geometry || piece.name === 'ToyEffect' || piece.parent?.name === 'ToyEffect') return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        made.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(rel.multiplyMatrices(into, mesh.matrixWorld)));
      });
      own.set(thing, (box = made));
    }
    return box;
  };
  const m = new Matrix4(), back = new Matrix4(), p = new Vector3(), sc = new Vector3(), q = new Quaternion();
  const ray = new Ray(), here = new Vector3(), there = new Vector3(), meet = new Vector3(), best = new Vector3(), out = new Vector3(), bestOut = new Vector3();
  let clock = 0;
  const hide = (slot: number) => {
    for (let j = 0; j < each; j++) bolts.setMatrixAt(slot * each + j, m.makeScale(0, 0, 0));
  };
  for (let i = 0; i < count; i++) hide(i);
  for (let i = 0; i < FLASHES; i++) flashes.setMatrixAt(i, m.makeScale(0, 0, 0));
  for (let i = 0; i < PUFFS; i++) smoke!.setMatrixAt(i, m.makeScale(0, 0, 0));
  /** Which side of its own box the point lies on — the way out of the thing there, against the shot. */
  const side = (box: Box3, point: Vector3, shot: Vector3, normal: Vector3) => {
    const dx = Math.min(Math.abs(point.x - box.min.x), Math.abs(box.max.x - point.x));
    const dy = Math.min(Math.abs(point.y - box.min.y), Math.abs(box.max.y - point.y));
    const dz = Math.min(Math.abs(point.z - box.min.z), Math.abs(box.max.z - point.z));
    if (dx <= dy && dx <= dz) normal.set(shot.x > 0 ? -1 : 1, 0, 0);
    else if (dy <= dz) normal.set(0, shot.y > 0 ? -1 : 1, 0);
    else normal.set(0, 0, shot.z > 0 ? -1 : 1);
  };
  const land = (slot: number, k: number) => {
    flying[slot] = 0;
    hide(slot);
    // where and which way, in the effect's own space
    back.copy(object.matrixWorld).invert();
    p.copy(best).applyMatrix4(back);
    // a mark only on the real room: a target is often shattered or gone the next moment, and its marks then hung in
    // the air (Yury, 18.11: «после того как разбиваются мишени, остаются следы от пуль»)
    const onTarget = Boolean(given[k]);
    const fx = kind === 'rocket' ? ready(pyroBoom({ size: K.hit * size })) : impact({ size: K.hit * size, color: colour, mark: onTarget ? 0 : o.mark });
    if (kind === 'rocket') fx.object.position.copy(p).setY(p.y - K.hit * size * 0.42); // the fireball's middle on the hit
    else {
      fx.object.position.copy(p);
      fx.object.quaternion.setFromUnitVectors(Y, there.copy(bestOut).transformDirection(back));
    }
    object.add(fx.object);
    hits.push({ fx, age: 0 });
    const target = given[k];
    if (target) o.onHit?.(target, best.clone(), bestOut.clone());
    else o.onRoom?.(best.clone(), bestOut.clone());
  };
  return {
    object,
    enter(world: World) {
      if (o.room !== false) surfaces = roomSurfaces(world);
    },
    fire(from, direction) {
      let slot = 0;
      for (let i = 0; i < count; i++) {
        if (!flying[i]) {
          slot = i;
          break;
        }
        if (flown[i] > flown[slot]) slot = i; // all are flying: the one that has flown farthest goes
      }
      at[slot].copy(from);
      way[slot].copy(direction).normalize();
      flying[slot] = 1;
      flown[slot] = aged[slot] = 0;
      smoked[slot] = clock;
      flashAt[flashNext].copy(from).addScaledVector(way[slot], 0.05 * size);
      flashBorn[flashNext] = clock;
      flashNext = (flashNext + 1) % FLASHES;
    },
    update(delta) {
      clock += delta;
      object.updateWorldMatrix(true, false);
      const grown = object.matrixWorld.getMaxScaleOnAxis();
      // what can be hit, once for all the bolts: the targets, then the room's surfaces
      let n = 0;
      for (const target of listed ?? (o.targets as () => Iterable<ShotTarget>)()) {
        const thing = (target as Object3D).isObject3D ? (target as Object3D) : (target as { object3D?: Object3D | null }).object3D;
        if (!thing || !thing.visible || !thing.parent) continue;
        const box = ownBox(thing);
        if (box.isEmpty()) continue;
        things[n] = thing;
        given[n] = target;
        boxes[n] = box;
        (inward[n] ??= new Matrix4()).copy(thing.matrixWorld).invert();
        n++;
      }
      for (const surface of surfaces) {
        if (!surface.parent) continue;
        // (its geometry is made anew when the room is measured again: its box is read every time)
        const flat = (surface as MeshType).geometry;
        if (!flat) continue;
        if (!flat.boundingBox) flat.computeBoundingBox();
        things[n] = surface;
        given[n] = undefined;
        boxes[n] = flat.boundingBox!;
        (inward[n] ??= new Matrix4()).copy(surface.matrixWorld).invert();
        n++;
      }
      let last = -1;
      for (let slot = 0; slot < count; slot++) {
        if (!flying[slot]) continue;
        last = slot;
        aged[slot] += delta;
        const pos = at[slot], dir = way[slot];
        // a rocket starts slow and picks up speed
        const step = speed * delta * (kind === 'rocket' ? 0.35 + 0.65 * smooth(0, 0.45, aged[slot]) : 1);
        here.copy(pos).applyMatrix4(object.matrixWorld);
        there.copy(dir).transformDirection(object.matrixWorld);
        let reach = step * grown, hit = -1;
        for (let k = 0; k < n; k++) {
          // the shot in the thing's own space, against the thing's own box
          ray.origin.copy(here).applyMatrix4(inward[k]);
          ray.direction.copy(there).transformDirection(inward[k]);
          if (boxes[k].containsPoint(ray.origin) || !ray.intersectBox(boxes[k], meet)) continue;
          side(boxes[k], meet, ray.direction, out);
          const far = meet.applyMatrix4(things[k].matrixWorld).distanceTo(here);
          if (far > reach) continue;
          reach = far;
          hit = k;
          best.copy(meet);
          bestOut.copy(out).transformDirection(things[k].matrixWorld);
        }
        if (hit >= 0) {
          land(slot, hit);
          continue;
        }
        pos.addScaledVector(dir, step);
        flown[slot] += step;
        if (flown[slot] > range) {
          flying[slot] = 0;
          hide(slot);
          continue;
        }
        q.setFromUnitVectors(Y, dir);
        const beat = kind === 'orb' ? 1 + 0.12 * Math.sin(clock * 34 + slot) : 1;
        bolts.setMatrixAt(slot * each, m.compose(pos, q, sc.set(K.wide * size * beat, K.long * size * beat, K.wide * size * beat)));
        for (let j = 1; j < each; j++) {
          if (kind === 'rocket') {
            // its jet: a flame behind it, flickering
            const long = size * 0.2 * (0.75 + 0.5 * Math.abs(Math.sin(clock * 43 + slot * 1.7)));
            p.copy(pos).addScaledVector(dir, -(K.long * 0.5 * size + long * 0.42));
            bolts.setMatrixAt(slot * each + j, m.compose(p, q, sc.set(K.wide * 0.8 * size, long, K.wide * 0.8 * size)));
          } else {
            // the tail: smaller pieces strung out behind, as far as it has flown
            const k = 1 - j / each, far = Math.min(flown[slot], (K.long * 0.5 + K.gap * j) * size);
            p.copy(pos).addScaledVector(dir, -far);
            bolts.setMatrixAt(slot * each + j, m.compose(p, q, sc.set(K.wide * size * k, K.long * size * (kind === 'orb' ? k : 0.85), K.wide * size * k)));
          }
        }
        if (smoke && clock - smoked[slot] > 0.035) {
          smoked[slot] = clock;
          puffAt[puffNext].copy(pos).addScaledVector(dir, -K.long * 0.6 * size);
          puffAt[puffNext].x += (hash(puffNext, clock * 60, 1) - 0.5) * 0.04 * size;
          puffAt[puffNext].y += (hash(puffNext, clock * 60, 2) - 0.5) * 0.04 * size;
          puffBorn[puffNext] = clock;
          puffNext = (puffNext + 1) % PUFFS;
        }
      }
      bolts.count = (last + 1) * each; // none flying: nothing is drawn
      bolts.instanceMatrix.needsUpdate = true;
      // the muzzle stars: a few frames each
      for (let i = 0; i < FLASHES; i++) {
        const u = (clock - flashBorn[i]) / 0.07;
        flashes.setMatrixAt(i, u >= 1 ? m.makeScale(0, 0, 0) : m.compose(flashAt[i], q.identity(), sc.setScalar(size * 0.34 * smooth(0, 0.3, u) * (1.15 - 0.35 * u))));
      }
      flashes.instanceMatrix.needsUpdate = true;
      if (smoke) {
        for (let i = 0; i < PUFFS; i++) {
          const u = (clock - puffBorn[i]) / 0.9;
          if (u >= 1) {
            smoke.setMatrixAt(i, m.makeScale(0, 0, 0));
            continue;
          }
          // it swells where it was left, drifts up a little, and is eaten away
          p.copy(puffAt[i]).setY(puffAt[i].y + 0.06 * size * u);
          smoke.setMatrixAt(i, m.compose(p, q.identity(), sc.setScalar(size * 0.085 * (0.6 + 1.5 * (1 - (1 - u) ** 2)) * smooth(0, 0.08, u))));
          puffLife[i] = 0.25 + 0.75 * u;
        }
        smoke.instanceMatrix.needsUpdate = puffLifeAttr.needsUpdate = true;
      }
      for (const item of hits) {
        item.age += delta;
        if (item.fx.update(delta, item.age) === false) {
          item.fx.object.removeFromParent();
          item.fx.dispose?.();
          item.age = -1;
        }
      }
      for (let i = hits.length - 1; i >= 0; i--) if (hits[i].age < 0) hits.splice(i, 1);
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      bolts.dispose();
      flashGeo.dispose();
      flashMat.dispose();
      flashes.dispose();
      puffGeo?.dispose();
      (smoke?.material as ShaderMaterial | undefined)?.dispose();
      smoke?.dispose();
      for (const item of hits) item.fx.dispose?.();
    },
  };
}

export interface Laser extends Fx {
  /** From where to where it runs, in the space the effect's object is in; call it whenever either end moves. */
  aim(from: Vector3, to: Vector3): void;
  /** Whether it shines now. */
  on: boolean;
}

/**
 * Endless steady beam (`play(world, ray)` once with no target, then `ray.aim(from, to)` and `ray.on = true/false`). `size` = scale (1 room, 0.3 table); `sparks: false` none.
 *
 * A glowing rod with bright beads running along it, a light at each end and sparks where it burns.
 */
// cost: 5 draw calls (1 without the lights and sparks), ~200 triangles.
export function laser(o: { size?: number; color?: number; sparks?: boolean } = {}): Laser {
  const size = o.size ?? 1, colour = o.color ?? 0xff3b4e;
  const object = new Group();
  object.name = 'ToyEffect';
  const geometry = new CylinderGeometry(0.5, 0.5, 1, 8, 1, true).translate(0, 0.5, 0); // from 0 up to 1 along Y
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLong: { value: 1 }, uCore: { value: shown(0xffffff) }, uEdge: { value: shown(colour) }, uPale: { value: shown(blend(colour, 0xffffff, 0.55)) } },
    vertexShader: /* glsl */ `
      varying float vF; varying float vAlong;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 s = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        vec3 n = normalize(mat3(modelViewMatrix) * (normal / max(s * s, vec3(1e-12))));
        vF = clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0);
        vAlong = position.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uLong; uniform vec3 uCore, uEdge, uPale;
      varying float vF; varying float vAlong;
      void main() {
        // bright beads running from the gun to the target
        float bead = step(0.62, fract(vAlong * uLong - uTime * 7.0));
        gl_FragColor = vec4(mix(mix(uEdge, uPale, bead), uCore, smoothstep(0.5, 0.82, vF)), 1.0);
      }`,
  });
  const rod = new Mesh(geometry, material);
  rod.frustumCulled = false;
  object.add(rod);
  const near = glow(colour, size * 0.22, 0, 0, 0.8), far = glow(colour, size * 0.34, 0, 0, 0.8);
  object.add(near.halo, far.halo);
  const burn = o.sparks === false ? undefined : impact({ size: size * 0.22, color: colour, endless: true });
  if (burn) object.add(burn.object);
  const a = new Vector3(), b = new Vector3(1, 0, 0), dir = new Vector3();
  const fx: Laser = {
    object,
    on: true,
    aim(from, to) {
      a.copy(from);
      b.copy(to);
    },
    update(delta, age) {
      object.visible = fx.on;
      if (!fx.on) return true;
      const long = dir.copy(b).sub(a).length();
      dir.multiplyScalar(1 / Math.max(long, 1e-6));
      rod.position.copy(a);
      rod.quaternion.setFromUnitVectors(Y, dir);
      const wide = size * 0.05 * (1 + 0.14 * Math.sin(age * 51) * Math.sin(age * 29));
      rod.scale.set(wide, long, wide);
      material.uniforms.uTime.value = age;
      material.uniforms.uLong.value = long / (size * 0.16);
      near.halo.position.copy(a);
      far.halo.position.copy(b);
      near.set(0.7, 0);
      far.set(0.85 + 0.15 * Math.sin(age * 37), 0);
      if (burn) {
        burn.object.position.copy(b);
        burn.object.quaternion.setFromUnitVectors(Y, dir.negate()); // the sparks fly back from what it burns
        burn.update(delta, age);
      }
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      near.dispose();
      far.dispose();
      burn?.dispose?.();
    },
  };
  return fx;
}
