// Events (18.11): what happens once to a thing — it is hit, it breaks. One-shot: add fx.object where it happens and
// call fx.update(delta, age) until it returns false. The other half of the new set, next to src/life.ts.
//   impact  — from toon hit packs and Gabriel Aguiar's «Hits and Impact Effects» frame by frame: a bold flat star for
//             a few frames, a thin ring running out along the surface, sparks thrown out in a fan that brake and
//             fall in arcs, and the spot left white-hot that cools into a scorch mark;
//   shatter — the thing itself falls to pieces: faceted lumps in its own colours, starting where its parts were,
//             fly out, bounce on the surface under it, lie a moment and shrink away;
//   poof    — something appears or vanishes: a handful of the smoke's puffs burst out and are eaten away, stars twinkle;
//   dust    — something lands: a low ring of the same puffs rolls out along the surface;
//   confetti — a win: paper scraps shot up, stopped by the air, tumbling down, lying on the surface.
// The headset first, as in life.ts: instanced, opaque, flat colours, nothing blended but the flash's light; no noise.
import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import type { Fx } from './fx/core.js';
import { blend, clamp01, glow, hash, puffGeometry, ready, ringGeometry, ringMaterial, shown, smokeMaterial, smooth } from './life.js';
import { spikyStar } from './shot.js';

const Y = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------------------------------------------
// impact

/** The bold toon star: flat, two colours, always facing the eye. */
function starMaterial(core: number, edge: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uCore: { value: shown(core) }, uEdge: { value: shown(edge) }, uSize: { value: 1 }, uTurn: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uSize, uTurn;
      varying float vR;
      void main() {
        vR = length(position.xy) / 0.5;
        float c = cos(uTurn), s = sin(uTurn);
        vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
        // laid out in the eye's own plane, at the effect's scale: the same star from any side
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += p * uSize * length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uEdge; varying float vR;
      void main() { gl_FragColor = vec4(vR < 0.4 ? uCore : uEdge, 1.0); }`,
  });
}

/** A spark: a bright needle, pale while fast and hot, its own colour as it cools. Opaque. */
function sparkMaterial(core: number, edge: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uCore: { value: shown(core) }, uEdge: { value: shown(edge) } },
    vertexShader: /* glsl */ `
      attribute float aHeat;
      varying float vHeat;
      void main() { vHeat = aHeat; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uEdge; varying float vHeat;
      void main() { gl_FragColor = vec4(mix(uEdge, uCore, smoothstep(0.35, 0.8, vHeat)), 1.0); }`,
  });
}

/** The mark a hit leaves, lying in XZ, about 1 across: a ragged blot, its middle (the hole) apart from its rim. */
function blotGeometry(seed: number): BufferGeometry {
  const points: number[] = [0, 0, 0], ring: number[] = [0], index: number[] = [], N = 13;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, far = 0.5 * (0.5 + 0.5 * hash(k, seed, 1)); // uneven all round, not a cog
    points.push(Math.cos(a) * far * 0.42, 0, Math.sin(a) * far * 0.42, Math.cos(a) * far, 0, Math.sin(a) * far);
    ring.push(0.5, 1);
  }
  for (let k = 0; k < N; k++) {
    const a = 1 + k * 2, b = 1 + ((k + 1) % N) * 2;
    index.push(0, b, a, a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(points, 3));
  geo.setAttribute('aRing', new Float32BufferAttribute(ring, 1));
  geo.setIndex(index);
  return geo;
}
function blotMaterial(hot: number): ShaderMaterial {
  return new ShaderMaterial({
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms: { uHeat: { value: 1 }, uHotIn: { value: shown(blend(hot, 0xffffff, 0.8)) }, uHotOut: { value: shown(hot) }, uColdIn: { value: shown(0x151113) }, uColdOut: { value: shown(0x3b3236) } },
    vertexShader: /* glsl */ `attribute float aRing; varying float vRing; void main() { vRing = aRing; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uHeat; uniform vec3 uHotIn, uHotOut, uColdIn, uColdOut; varying float vRing;
      void main() {
        bool hole = vRing < 0.5;
        gl_FragColor = vec4(mix(hole ? uColdIn : uColdOut, hole ? uHotIn : uHotOut, uHeat), 1.0);
      }`,
  });
}

/**
 * One-shot impact sparks + scorch (`play(world, impact({ size }), point, normal)`). `size` = blow width, m; `mark` scorch seconds (6; 0 none); `endless: true` continuous sparks.
 *
 * A bold star flashes, a thin ring runs out along the surface, sparks fly out in a fan and fall in arcs, and the spot
 * cools into a scorch mark. (`shots` plays this by itself where a bolt lands.)
 */
// cost: 5 draw calls for the first half second, then 1 (the mark); ~250 triangles, opaque.
export function impact(o: { size?: number; color?: number; mark?: number; endless?: boolean; seed?: number } = {}): Fx {
  const size = o.size ?? 0.3, seed = o.seed ?? Math.floor(Math.random() * 1000), endless = o.endless ?? false;
  const colour = o.color ?? 0xffa51e, pale = blend(colour, 0xffffff, 0.8);
  const markFor = endless ? 0 : (o.mark ?? 6);
  const object = new Group();
  object.name = 'ToyEffect';
  // the star, held a little off the surface
  const star = new Mesh(spikyStar(9, seed + 1), starMaterial(pale, blend(colour, 0xffe23a, 0.5)));
  star.position.y = size * 0.12;
  star.frustumCulled = false;
  // its light: a halo and a pool on the surface round the hit
  const g = glow(colour, size * (endless ? 1.0 : 1.5), size * 2.4, size * 0.1, 0.6);
  g.halo.position.y = size * 0.1;
  g.pool.position.y = 0.002;
  // the ring along the surface
  const ringGeo = ringGeometry(32), ringAge = new Float32Array(1);
  const ringAttr = new InstancedBufferAttribute(ringAge, 1);
  ringAttr.setUsage(DynamicDrawUsage);
  ringGeo.setAttribute('aAge', ringAttr);
  const ring = new InstancedMesh(ringGeo, ringMaterial(pale, 0.14), 1);
  ring.frustumCulled = false;
  // the sparks
  const SPARKS = 14;
  const sparkGeo = new OctahedronGeometry(0.5, 0), heat = new Float32Array(SPARKS);
  const heatAttr = new InstancedBufferAttribute(heat, 1);
  heatAttr.setUsage(DynamicDrawUsage);
  sparkGeo.setAttribute('aHeat', heatAttr);
  // saturated, not pale: a pale needle is lost against a bright room's wall
  const sparks = new InstancedMesh(sparkGeo, sparkMaterial(blend(colour, 0xfff06a, 0.6), blend(colour, 0xff3a10, 0.45)), SPARKS);
  sparks.frustumCulled = false;
  // the mark
  const blot = new Mesh(blotGeometry(seed), blotMaterial(colour));
  blot.position.y = 0.0015;
  blot.rotation.y = hash(seed, 3, 4) * 6.28;
  if (endless) object.add(g.halo, sparks);
  else object.add(star, g.halo, g.pool, ring, sparks, ...(markFor > 0 ? [blot] : []));
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion(), turned = new Quaternion();
  const up = new Vector3(), dir = new Vector3(), vel = new Vector3();
  const DRAG = 5, fall = 5 * size, turn0 = hash(seed, 1, 2) * 6.28;
  return ready({
    object,
    update(_delta, age) {
      (object as Object3D).getWorldQuaternion(turned);
      up.set(0, 1, 0).applyQuaternion(turned.invert());
      if (!endless) {
        // the star: it pops out bigger than it is, settles, and is gone in a tenth of a second
        const t = age / 0.1;
        star.visible = t < 1;
        const mat = star.material as ShaderMaterial;
        mat.uniforms.uSize.value = size * smooth(0, 0.25, t) * (1.15 - 0.25 * t);
        mat.uniforms.uTurn.value = turn0 + 0.5 * t;
        const lit = age < 0.16;
        g.halo.visible = g.pool.visible = lit;
        if (lit) g.set(0.9 * (1 - age / 0.16) ** 2, 0.8 * (1 - age / 0.16) ** 2);
        const a = age / 0.24;
        ring.visible = a < 1;
        if (ring.visible) {
          ring.setMatrixAt(0, m.compose(at.set(0, 0.003, 0), q.identity(), sc.setScalar(size * (0.16 + 0.5 * (1 - (1 - a) ** 3)))));
          ring.instanceMatrix.needsUpdate = true;
          ringAge[0] = a;
          ringAttr.needsUpdate = true;
        }
        if (markFor > 0) {
          blot.visible = age < markFor;
          blot.scale.setScalar(size * 0.42 * smooth(0, 0.05, age) * (1 - smooth(markFor - 0.4, markFor, age)));
          (blot.material as ShaderMaterial).uniforms.uHeat.value = clamp01(1 - age / 0.9) ** 2;
        }
      } else {
        g.set(0.3 + 0.12 * Math.sin(age * 37) * Math.sin(age * 23), 0);
      }
      // the sparks: thrown out fast in a fan round +Y, they brake at once, then fall in arcs; long while fast
      let flying = false;
      for (let i = 0; i < SPARKS; i++) {
        const life = (endless ? 0.3 : 0.38) + 0.3 * hash(i, seed, 5);
        const x = age / life - (endless ? hash(i, seed, 6) : 0);
        const turn = Math.floor(x), u = x - turn, t = u * life, n = turn + seed;
        if (x < 0 || (!endless && turn > 0)) {
          sparks.setMatrixAt(i, m.makeScale(0, 0, 0));
          continue;
        }
        flying = true;
        const tilt = 1.3 * Math.sqrt(hash(i, n, 7)), round = hash(i, n, 8) * 6.28;
        dir.set(Math.sin(tilt) * Math.cos(round), Math.cos(tilt), Math.sin(tilt) * Math.sin(round));
        const v = 5.5 * size * (0.45 + 0.55 * hash(i, n, 9)), slow = Math.exp(-DRAG * t);
        at.copy(dir).multiplyScalar((v * (1 - slow)) / DRAG).addScaledVector(up, -0.5 * fall * t * t);
        at.y += size * 0.04;
        vel.copy(dir).multiplyScalar(v * slow).addScaledVector(up, -fall * t);
        const speed = vel.length();
        q.setFromUnitVectors(Y, vel.multiplyScalar(1 / Math.max(speed, 1e-6)));
        const w = size * 0.042 * (1 - u * u);
        sparks.setMatrixAt(i, m.compose(at, q, sc.set(w, size * 0.07 + speed * 0.05, w)));
        heat[i] = 1 - u;
      }
      sparks.visible = flying;
      sparks.instanceMatrix.needsUpdate = heatAttr.needsUpdate = true;
      return endless || age < Math.max(0.7, markFor);
    },
    dispose() {
      star.geometry.dispose();
      (star.material as ShaderMaterial).dispose();
      g.dispose();
      ringGeo.dispose();
      (ring.material as ShaderMaterial).dispose();
      ring.dispose();
      sparkGeo.dispose();
      (sparks.material as ShaderMaterial).dispose();
      sparks.dispose();
      blot.geometry.dispose();
      (blot.material as ShaderMaterial).dispose();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// shatter

/** A piece: a small uneven faceted lump, about 1 across. */
function lumpGeometry(seed: number): BufferGeometry {
  const geo = new IcosahedronGeometry(0.5, 0);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // the same corner is listed for each face it belongs to: push it by its place, so the faces stay joined
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 0.72 + 0.56 * hash(Math.round(x * 50), Math.round(y * 50) + seed, Math.round(z * 50));
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * The thing falls to pieces. One-shot. Pass the thing itself as `of`: the pieces take ITS colours and start where
 * its parts are — a red car breaks into red and dark lumps — fly out, bounce on the surface it stood on, lie a
 * moment and shrink away. Play it with NO target and remove the thing: `play(world, shatter({ of: thing }));
 * thing.removeFromParent()`. Without `of`: `size` = how big the broken thing was, `colors` its colours, and give
 * play() the spot at its foot. `count` pieces (16).
 */
// cost: 1 draw call, `count` × 20 triangles (16 pieces: 320), opaque, lit as our things are.
export function shatter(o: { of?: Object3D; size?: number; colors?: number[]; count?: number; life?: number; seed?: number } = {}): Fx {
  const count = o.count ?? 16, life = o.life ?? 2.4, seed = o.seed ?? Math.floor(Math.random() * 1000);
  const object = new Group();
  object.name = 'ToyEffect';
  const box = new Box3(), origin = new Vector3(), centre = new Vector3(), dims = new Vector3();
  const meshes: Mesh[] = [];
  let corners = 0;
  if (o.of) {
    o.of.updateWorldMatrix(true, true);
    box.setFromObject(o.of);
    o.of.getWorldPosition(origin);
    o.of.traverse((x) => {
      const mesh = x as Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.getAttribute('position')) return;
      meshes.push(mesh);
      corners += mesh.geometry.getAttribute('position').count;
    });
  }
  if (meshes.length) box.getSize(dims);
  const size = o.size ?? (meshes.length ? Math.max(dims.x, dims.y, dims.z) : 0.3);
  if (!meshes.length) box.min.set(-size * 0.35, 0, -size * 0.35), box.max.set(size * 0.35, size * 0.8, size * 0.35), box.translate(origin);
  box.getCenter(centre).sub(origin);
  // where the pieces come to rest: the real floor (y = 0 of the room), not the thing's own bottom — a target hanging in
  // the air left its pieces lying on nothing there, a flat patch like a hole in the wall (Yury, 18.11). On a table
  // they fall through it to the floor, and the real table hides them.
  const floor = Math.min(box.min.y, 0) - origin.y;
  object.position.copy(origin);
  // toy gravity: a small thing's pieces fall slowly enough to be seen, a big one's as in life
  const g = Math.min(9.8, 9 * size), v0 = Math.sqrt(2 * g * 0.55 * size);
  const geometry = lumpGeometry(seed);
  const material = new MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  object.add(mesh);
  const P = new Float32Array(count * 3), V = new Float32Array(count * 3), A = new Float32Array(count * 3), D = new Float32Array(count * 3);
  const rate = new Float32Array(count), goes = new Float32Array(count), still = new Uint8Array(count);
  const turns = Array.from({ length: count }, () => new Quaternion());
  const p = new Vector3(), c = new Color(), fallback = (o.colors?.length ? o.colors : [0xd97b48]).map((h) => new Color(h));
  // the thing's faces, by area: a piece is likelier to come from a big panel than from a small detail, so the pieces
  // carry its colours in the share it shows them (a red car: mostly red). A very heavy model: by corners, to stay quick.
  const va = new Vector3(), vb = new Vector3(), vc = new Vector3();
  const corner = (geo: BufferGeometry, t: number, k: number) => (geo.index ? geo.index.getX(t * 3 + k) : t * 3 + k);
  const faceArea = (geo: BufferGeometry, t: number) => {
    const pos = geo.getAttribute('position');
    va.fromBufferAttribute(pos, corner(geo, t, 0));
    vb.fromBufferAttribute(pos, corner(geo, t, 1)).sub(va);
    vc.fromBufferAttribute(pos, corner(geo, t, 2)).sub(va);
    return vb.cross(vc).length() * 0.5;
  };
  const parts = meshes.map((from) => {
    const geo = from.geometry, faces = Math.floor((geo.index ? geo.index.count : geo.getAttribute('position').count) / 3);
    return { from, faces, grown: from.matrixWorld.getMaxScaleOnAxis() ** 2, area: 0 };
  });
  const byArea = corners < 60000;
  let all = 0;
  if (byArea) for (const part of parts) {
    for (let t = 0; t < part.faces; t++) part.area += faceArea(part.from.geometry, t);
    all += part.area *= part.grown;
  }
  for (let i = 0; i < count; i++) {
    const r = (k: number) => hash(i, seed, k);
    if (meshes.length) {
      let from = meshes[0], at = 0;
      if (byArea && all > 0) {
        let x = r(1) * all, part = parts[0];
        for (const each of parts) {
          part = each;
          if (x < each.area) break;
          x -= each.area;
        }
        x /= part.grown;
        let t = 0;
        for (; t < part.faces - 1; t++) if ((x -= faceArea(part.from.geometry, t)) <= 0) break;
        from = part.from;
        at = corner(from.geometry, t, 0);
        // the middle of that face
        const pos = from.geometry.getAttribute('position');
        p.fromBufferAttribute(pos, at).add(va.fromBufferAttribute(pos, corner(from.geometry, t, 1))).add(va.fromBufferAttribute(pos, corner(from.geometry, t, 2))).multiplyScalar(1 / 3);
      } else {
        at = Math.floor(r(1) * corners);
        for (const each of meshes) {
          const n = each.geometry.getAttribute('position').count;
          from = each;
          if (at < n) break;
          at -= n;
        }
        p.fromBufferAttribute(from.geometry.getAttribute('position'), at);
      }
      // where that spot of the thing is now: there a piece starts, in its colour
      p.applyMatrix4(from.matrixWorld).sub(origin);
      const paint = from.geometry.getAttribute('color'), mat = (Array.isArray(from.material) ? from.material[0] : from.material) as Material & { color?: Color };
      if (paint) c.fromBufferAttribute(paint, at);
      else if (mat.color && !o.colors) c.copy(mat.color);
      else c.copy(fallback[i % fallback.length]);
      p.lerp(centre, 0.3 * r(2)); // a little inside it, not only on its skin
    } else {
      p.set((r(1) - 0.5) * size * 0.7, floor + r(2) * size * 0.8, (r(3) - 0.5) * size * 0.7);
      c.copy(fallback[i % fallback.length]);
    }
    mesh.setColorAt(i, c.multiplyScalar(0.92 + 0.16 * r(4)));
    P.set([p.x, p.y, p.z], i * 3);
    // out from the middle and up
    p.sub(centre).multiply(dims.set(1, 0.35, 1)).normalize().multiplyScalar(0.75).add(dims.set((r(5) - 0.5) * 0.5, 0.6 + 0.5 * r(6), (r(7) - 0.5) * 0.5));
    const v = v0 * (0.5 + 0.5 * r(8));
    V.set([p.x * v * 0.7, p.y * v, p.z * v * 0.7], i * 3);
    p.set(r(9) - 0.5, r(10) - 0.5, r(11) - 0.5).normalize();
    A.set([p.x, p.y, p.z], i * 3);
    rate[i] = 5 + 9 * r(12);
    // a few big pieces, many small
    const big = size * (0.07 + 0.17 * r(13) ** 2);
    D.set([big * (0.7 + 0.6 * r(14)), big * (0.7 + 0.6 * r(15)), big * (0.7 + 0.6 * r(16))], i * 3);
    turns[i].setFromAxisAngle(p, r(17) * 6.28);
    goes[i] = life - 0.4 - 0.25 * r(18);
  }
  mesh.instanceColor!.needsUpdate = true;
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion(), axis = new Vector3(), down = new Vector3();
  return ready({
    object,
    update(delta, age) {
      // in small steps, however long the frame was: the pieces fall the same at any frame rate
      const steps = Math.min(8, Math.max(1, Math.ceil(delta / 0.02))), dt = Math.min(delta, 0.16) / steps;
      // down in the world, however the effect is turned (pieces of a brick broken on a wall fall to the floor);
      // the surface under it is known only when it stands upright
      (object as Object3D).getWorldQuaternion(q);
      down.set(0, -1, 0).applyQuaternion(q.invert());
      const upright = down.y < -0.9;
      for (let i = 0; i < count; i++) {
        const j = i * 3, half = D[j + 1] * 0.35;
        for (let s = 0; s < steps && !still[i]; s++) {
          V[j] += down.x * g * dt;
          V[j + 1] += down.y * g * dt;
          V[j + 2] += down.z * g * dt;
          P[j] += V[j] * dt;
          P[j + 1] += V[j + 1] * dt;
          P[j + 2] += V[j + 2] * dt;
          turns[i].premultiply(q.setFromAxisAngle(axis.set(A[j], A[j + 1], A[j + 2]), rate[i] * dt));
          if (upright && P[j + 1] - half < floor && V[j + 1] < 0) {
            // it lands: a short bounce, slower and tumbling less each time, then it lies
            P[j + 1] = floor + half;
            V[j + 1] *= -0.35;
            V[j] *= 0.55;
            V[j + 2] *= 0.55;
            rate[i] *= 0.5;
            if (V[j + 1] < 0.14 * v0) still[i] = 1;
          }
        }
        const k = 1 - smooth(goes[i], goes[i] + 0.35, age);
        mesh.setMatrixAt(i, m.compose(at.set(P[j], P[j + 1], P[j + 2]), turns[i], sc.set(D[j] * k, D[j + 1] * k, D[j + 2] * k)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      return age < life;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// poof, dust

/** A burst of the smoke's faceted puffs: thrown out of a spot they brake at once, swell, and are eaten away one by one. */
function puffBurst(o: { size: number; color: number; count: number; life: number; seed: number; low: boolean }) {
  const { size, count, life, seed, low } = o;
  const geometry = puffGeometry(true);
  const lives = new Float32Array(count), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = hash(i, seed, 1) * 10;
  const lifeAttr = new InstancedBufferAttribute(lives, 1);
  lifeAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aLife', lifeAttr);
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  // (a column far taller than the burst: the smoke's "light it as one mass" then simply leans every facet's light up)
  const material = smokeMaterial(o.color, blend(o.color, 0x84848e, 0.4), 0, size * 1000, 0, 1, true);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion(), axis = new Vector3();
  return {
    mesh,
    update(age: number): boolean {
      const out = 1 - Math.exp(-6 * age);
      for (let i = 0; i < count; i++) {
        const mine = life * (0.6 + 0.4 * hash(i, seed, 2)), u = age / mine;
        if (u >= 1) {
          mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
          continue;
        }
        const swell = smooth(0, 0.07, u) * (0.55 + 1.0 * (1 - (1 - u) ** 2));
        if (low) {
          // dust: round the foot, rolling out along the surface
          const a = ((i + 0.7 * hash(i, seed, 3)) / count) * 6.283, far = size * (0.26 + 0.55 * (0.6 + 0.4 * hash(i, seed, 4)) * out);
          const big = size * (0.2 + 0.16 * hash(i, seed, 5)) * swell;
          at.set(Math.cos(a) * far, big * 0.32 + size * 0.1 * u, Math.sin(a) * far);
          sc.setScalar(big);
        } else {
          // a poof: out of the middle every way, a little more upward
          const a = hash(i, seed, 3) * 6.283, up = -0.25 + 1.2 * hash(i, seed, 4), flat = Math.sqrt(Math.max(0, 1 - Math.min(1, up) ** 2));
          const far = size * 0.4 * (0.35 + 0.65 * hash(i, seed, 5)) * out;
          at.set(Math.cos(a) * flat * far, size * 0.45 + up * far, Math.sin(a) * flat * far);
          sc.setScalar(size * (0.3 + 0.22 * hash(i, seed, 6)) * swell);
        }
        axis.set(hash(i, seed, 7) - 0.5, hash(i, seed, 8) - 0.5, hash(i, seed, 9) - 0.5).normalize();
        mesh.setMatrixAt(i, m.compose(at, q.setFromAxisAngle(axis, hash(i, seed, 10) * 6.28 + u * 1.2), sc));
        lives[i] = 0.3 + 0.7 * u;
      }
      mesh.instanceMatrix.needsUpdate = lifeAttr.needsUpdate = true;
      return age < life;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/** A small star of `points` rays, 1 across, in XY. */
function starGeometry(points = 4, inner = 0.16): BufferGeometry {
  const at: number[] = [0, 0, 0], index: number[] = [];
  for (let k = 0; k < points * 2; k++) {
    const a = (k / (points * 2)) * Math.PI * 2 + Math.PI / 2, r = k % 2 === 0 ? 0.5 : inner;
    at.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    index.push(0, 1 + k, 1 + ((k + 1) % (points * 2)));
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(at, 3));
  geo.setIndex(index);
  return geo;
}
/** Flat stars that always face the eye, one for each instance: where it is and how big, from its matrix. Opaque. */
export function twinkleMaterial(colour: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColour: { value: shown(colour) } },
    vertexShader: /* glsl */ `
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uColour; void main() { gl_FragColor = vec4(uColour, 1.0); }`,
  });
}
export { starGeometry };

/**
 * A poof: something appears or vanishes. One-shot. A handful of white faceted puffs burst out of its middle and are
 * eaten away, a few small stars twinkle. Put it at the thing's foot: `play(world, poof({ size: 0.3 }), spot)`.
 * `size` = how big the thing is; `color` the puffs' tone (white; the thing's own colour for a tinted one);
 * `stars: false` for none.
 */
// cost: 2 draw calls, ~0.9 thousand triangles, opaque; over in 0.7 s.
export function poof(o: { size?: number; color?: number; stars?: boolean; seed?: number } = {}): Fx {
  const size = o.size ?? 0.3, seed = o.seed ?? Math.floor(Math.random() * 1000);
  const object = new Group();
  object.name = 'ToyEffect';
  const puffs = puffBurst({ size, color: o.color ?? 0xf6f4f2, count: 10, life: 0.7, seed, low: false });
  object.add(puffs.mesh);
  const STARS = o.stars === false ? 0 : 6;
  const starGeo = starGeometry(), starMat = twinkleMaterial(0xffe27a);
  const stars = new InstancedMesh(starGeo, starMat, Math.max(1, STARS));
  stars.frustumCulled = false;
  if (STARS) object.add(stars);
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion();
  return ready({
    object,
    update(_delta, age) {
      const going = puffs.update(age);
      for (let i = 0; i < STARS; i++) {
        const u = age / 0.55;
        // out past the puffs, braking; each blinks as it goes
        const a = ((i + hash(i, seed, 21)) / STARS) * 6.283, up = 0.15 + 0.7 * hash(i, seed, 22), far = size * 0.75 * (1 - Math.exp(-5 * age));
        at.set(Math.cos(a) * far, size * 0.45 + up * far, Math.sin(a) * far);
        const k = u >= 1 ? 0 : size * 0.17 * smooth(0, 0.12, u) * (1 - u) * (0.75 + 0.25 * Math.sin(age * 38 + i * 2.1));
        stars.setMatrixAt(i, m.compose(at, q.identity(), sc.setScalar(k)));
      }
      stars.instanceMatrix.needsUpdate = true;
      return going;
    },
    dispose() {
      puffs.dispose();
      starGeo.dispose();
      starMat.dispose();
      stars.dispose();
    },
  });
}

/**
 * Dust where something lands, stomps, skids or takes off. One-shot. A low ring of faceted puffs rolls out along the
 * surface round its foot and is eaten away. Put it at the foot: `play(world, dust({ size: 0.3 }), spot)`.
 * `size` = how wide the thing is; `color` the dust's tone (pale earth; the colour of the ground it stands on).
 */
// cost: 1 draw call, ~0.9 thousand triangles, opaque; over in 0.8 s.
export function dust(o: { size?: number; color?: number; seed?: number } = {}): Fx {
  const size = o.size ?? 0.3;
  const object = new Group();
  object.name = 'ToyEffect';
  const puffs = puffBurst({ size, color: o.color ?? 0xdccbb0, count: 11, life: 0.8, seed: o.seed ?? Math.floor(Math.random() * 1000), low: true });
  object.add(puffs.mesh);
  return ready({ object, update: (_delta, age) => puffs.update(age), dispose: () => puffs.dispose() });
}

// ---------------------------------------------------------------------------------------------------------------
// confetti

const PARTY = [0xe94b3c, 0xffc93a, 0x45d483, 0x3a8cf0, 0xb06cf0, 0xff6fa8];

/**
 * One-shot confetti burst along +Y (~4 s, for a win). `size` = burst width, m (rises 1.3×); `above` height over landing surface, m; `count` scraps (48).
 *
 * Bright paper scraps shot up as from a party popper, stopped by the air, tumbling slowly down; they land on the
 * surface, lie, and shrink away. `play(world, confetti({ size: 0.5 }), spot)`.
 */
// cost: 1 draw call, `count` × 2 triangles (48 scraps: 96), opaque;
export function confetti(o: { size?: number; colors?: number[]; count?: number; above?: number; life?: number; seed?: number } = {}): Fx {
  const size = o.size ?? 0.4, count = o.count ?? 48, seed = o.seed ?? Math.floor(Math.random() * 1000), life = o.life ?? 4.2;
  const floor = -(o.above ?? 0), colours = (o.colors?.length ? o.colors : PARTY).map(shown);
  const object = new Group();
  object.name = 'ToyEffect';
  const geometry = new PlaneGeometry(1, 0.62);
  const tint = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours[i % colours.length].toArray(tint, i * 3);
  geometry.setAttribute('aColour', new InstancedBufferAttribute(tint, 3));
  const material = new ShaderMaterial({
    side: DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aColour; varying vec3 vColour;
      void main() { vColour = aColour; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      void main() { gl_FragColor = vec4(gl_FrontFacing ? vColour : mix(vColour, vec3(1.0), 0.45), 1.0); }`,
  });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  object.add(mesh);
  // the air stops a scrap within a moment; then it sinks at a steady slow pace
  const DRAG = 4, sink = 0.55 * size, g = sink * DRAG, launch = DRAG * 1.3 * size * 1.15;
  const P = new Float32Array(count * 3), V = new Float32Array(count * 3), A = new Float32Array(count * 3);
  const rate = new Float32Array(count), sway = new Float32Array(count), down = new Float32Array(count).fill(-1), big = new Float32Array(count);
  const turns = Array.from({ length: count }, () => new Quaternion());
  const axis = new Vector3(), q = new Quaternion(), flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  for (let i = 0; i < count; i++) {
    const r = (k: number) => hash(i, seed, k), j = i * 3;
    const tilt = 0.55 * Math.sqrt(r(1)), round = r(2) * 6.283, v = launch * (0.45 + 0.55 * r(3));
    V.set([Math.sin(tilt) * Math.cos(round) * v, Math.cos(tilt) * v, Math.sin(tilt) * Math.sin(round) * v], j);
    axis.set(r(4) - 0.5, r(5) - 0.5, r(6) - 0.5).normalize();
    A.set([axis.x, axis.y, axis.z], j);
    rate[i] = 5 + 9 * r(7);
    sway[i] = r(8) * 6.283;
    big[i] = size * 0.05 * (0.7 + 0.6 * r(9));
    turns[i].setFromAxisAngle(axis, r(10) * 6.283);
  }
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3();
  return ready({
    object,
    update(delta, age) {
      const steps = Math.min(8, Math.max(1, Math.ceil(delta / 0.02))), dt = Math.min(delta, 0.16) / steps;
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        for (let s = 0; s < steps && down[i] < 0; s++) {
          V[j] -= V[j] * DRAG * dt;
          V[j + 1] -= (g + V[j + 1] * DRAG) * dt;
          V[j + 2] -= V[j + 2] * DRAG * dt;
          P[j] += V[j] * dt;
          P[j + 1] += V[j + 1] * dt;
          P[j + 2] += V[j + 2] * dt;
          turns[i].premultiply(q.setFromAxisAngle(axis.set(A[j], A[j + 1], A[j + 2]), rate[i] * dt));
          if (P[j + 1] <= floor + 0.003 && V[j + 1] < 0) {
            // it has landed: flat on the surface, turned as it fell
            P[j + 1] = floor + 0.003 + i * 0.00004;
            down[i] = age;
            turns[i].setFromAxisAngle(axis.set(0, 1, 0), sway[i]).multiply(flat);
          }
        }
        // while it sinks it sways from side to side
        const drift = down[i] < 0 && V[j + 1] < 0 ? size * 0.05 : 0;
        at.set(P[j] + Math.sin(age * 3.1 + sway[i]) * drift, P[j + 1], P[j + 2] + Math.cos(age * 2.6 + sway[i]) * drift);
        const k = big[i] * smooth(0, 0.06, age) * (1 - smooth(life - 0.5, life - 0.1 + (i % 7) * 0.012, age));
        mesh.setMatrixAt(i, m.compose(at, turns[i], sc.setScalar(k)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      return age < life;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  });
}
