// Wonders (the night of 18–19.11): five more effects, chosen for what a real table in the headset gains most from.
//   weather   — a cloud hanging over the table: rain with rings where the drops land, a storm (the cloud flashes and
//               strikes the ground), or snow                                                    life: endless
//   lightning — a jagged bolt between two points, drawn anew three times in a quarter of a second, a light and
//               sparks where it lands                                                           event: one-shot
//   fireworks — rockets climb and burst into balls of sparks that droop and go out, for a win   event: a show
//   bubbles   — glassy bubbles rise wobbling and pop: an aquarium, a cauldron, a potion         life: endless
//   sparkle   — small stars blink round a thing: treasure, a thing to pick up, magic            life: endless
// Built from the parts of life.ts, event.ts and shots.ts and to the same rule: instanced, opaque, flat colours, no
// noise in them but the cloud's own; nothing blended but the light of a flash.
import { DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, type Object3D, OctahedronGeometry, Quaternion, ShaderMaterial, Vector3 } from '@iwsdk/core';
import type { Fx } from './fx/core.js';
import { impact, starGeometry, twinkleMaterial } from './event.js';
import { ball, blend, dropMaterial, glow, hash, puffGeometry, ready, ribbon, ringGeometry, ringMaterial, shown, smokeMaterial, smooth } from './life.js';
import { boltMaterial } from './shots.js';

const Y = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------------------------------------------
// lightning

/**
 * A bolt of lightning between two points: from a cloud to the ground, between two posts, out of a wand. One-shot,
 * a quarter of a second. A jagged white ribbon with a branch, a flash of light where it lands and the sparks and
 * scorch of a hit there. By default it strikes its own spot from one `size` above: `play(world, lightning({ size:
 * 0.7 }), spot)`; or give `from` and `to` (points in the effect's own space — world points when played with no target).
 * `size` = about how long the bolt is (its thickness and the hit follow it); `color` its rim (pale blue); `mark`
 * seconds the scorch stays (6; 0: none).
 */
// cost: 2 draw calls and the hit's; ~60 triangles.
export function lightning(o: { from?: Vector3; to?: Vector3; size?: number; color?: number; mark?: number; seed?: number } = {}): Fx {
  // from one size above onto its own spot; `to` alone: from its spot to there; both: between them
  const to = o.to?.clone() ?? new Vector3(), there = o.from?.clone() ?? (o.to ? new Vector3() : undefined);
  const size = o.size ?? (there ? Math.max(0.2, there.distanceTo(to)) : 0.6), from = there ?? new Vector3(0, size, 0);
  const colour = o.color ?? 0x8fc8ff, seed = o.seed ?? Math.floor(Math.random() * 1000);
  const MAIN = 11, BRANCH = 4, count = MAIN + BRANCH;
  // the bolt keeps its width; its two ends and its branch narrow
  const band = ribbon(count, colour, size * 0.055, (i) => (i < MAIN ? (i === 0 || i === MAIN - 1 ? 0.55 : 0) : 0.35 + 0.65 * ((i - MAIN) / (BRANCH - 1))), [MAIN - 1]);
  const object = new Group();
  object.name = 'ToyEffect';
  object.add(band.mesh);
  const light = glow(colour, size * 0.38, size * 0.9, 0, 0.8);
  light.halo.position.copy(to);
  light.pool.position.copy(to).setY(to.y + 0.002);
  const hit = impact({ size: size * 0.28, color: colour, mark: o.mark });
  hit.object.position.copy(to);
  object.add(light.halo, light.pool, hit.object);
  const points = Array.from({ length: count }, () => new Vector3());
  const along = new Vector3().copy(to).sub(from), far = along.length(), a = new Vector3(), b = new Vector3();
  along.normalize();
  a.set(1, 0, 0).cross(along);
  if (a.lengthSq() < 0.01) a.set(0, 0, 1).cross(along);
  a.normalize();
  b.copy(along).cross(a);
  let drawn = -1;
  const draw = (stroke: number) => {
    for (let i = 0; i < MAIN; i++) {
      const t = i / (MAIN - 1), wild = Math.sin(Math.PI * t) * far * 0.11; // pinned at both ends
      points[i].copy(from).addScaledVector(along, far * t).addScaledVector(a, (hash(i, seed + stroke, 1) - 0.5) * 2 * wild).addScaledVector(b, (hash(i, seed + stroke, 2) - 0.5) * 2 * wild);
    }
    // a branch off the upper part, sideways and on
    const root = 3 + Math.floor(hash(stroke, seed, 3) * 3), turn = hash(stroke, seed, 4) * 6.283;
    for (let j = 0; j < BRANCH; j++) {
      const k = j / (BRANCH - 1);
      points[MAIN + j].copy(points[root]).addScaledVector(along, far * 0.2 * k).addScaledVector(a, Math.cos(turn) * far * 0.2 * k).addScaledVector(b, Math.sin(turn) * far * 0.2 * k);
      if (j > 0) points[MAIN + j].addScaledVector(a, (hash(j, seed + stroke, 5) - 0.5) * far * 0.05);
    }
    band.set(points);
  };
  return ready({
    object,
    update(delta, age) {
      // three strokes, each a different jagged way, a blink of dark between them
      const stroke = Math.min(2, Math.floor(age / 0.075)), within = age - stroke * 0.075;
      if (stroke !== drawn) draw((drawn = stroke));
      band.mesh.visible = age < 0.26 && (stroke === 2 || within < 0.055);
      const lit = Math.max(0, 1 - age / 0.3);
      light.halo.visible = light.pool.visible = lit > 0;
      light.set(lit * (band.mesh.visible ? 1 : 0.5), lit * 0.9);
      return hit.update(delta, age) !== false || age < 0.3;
    },
    dispose() {
      band.dispose();
      light.dispose();
      hit.dispose?.();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// weather

/**
 * Endless weather cloud placed ON the surface below (`kind`: 'rain'|'storm'|'snow'; `size` = cloud width, m; `height` above surface, 0.9× size).
 *
 * 'rain': streaks and a ring where each lands · 'storm': a dark cloud that flashes and strikes the ground with lightning
 * every few seconds · 'snow': a white cloud and flakes swaying down. `play(world, weather({ kind: 'storm', size: 0.7 }), spot)`.
 */
// cost: 3 draw calls (2 for snow), ~2.5 thousand triangles; a strike adds its own for a quarter of a second.
export function weather(o: { kind?: 'rain' | 'storm' | 'snow'; size?: number; height?: number; seed?: number } = {}): Fx {
  const kind = o.kind ?? 'rain', size = o.size ?? 0.6, seed = o.seed ?? Math.floor(Math.random() * 1000), snow = kind === 'snow';
  const high = o.height ?? size * 0.9;
  const object = new Group();
  object.name = 'ToyEffect';
  // ---- the cloud ----
  const PUFFS = 14, tone = snow ? 0xf4f6fa : kind === 'storm' ? 0x6c7384 : 0xb4bac8;
  const cloudGeo = puffGeometry(true), lives = new Float32Array(PUFFS).fill(0.08), seeds = new Float32Array(PUFFS);
  for (let i = 0; i < PUFFS; i++) seeds[i] = hash(i, seed, 1) * 10;
  cloudGeo.setAttribute('aLife', new InstancedBufferAttribute(lives, 1));
  cloudGeo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  const cloudMat = smokeMaterial(tone, blend(tone, 0x3c4254, 0.5), 0, size * 1000, 0, 1, true);
  const cloud = new InstancedMesh(cloudGeo, cloudMat, PUFFS);
  cloud.frustumCulled = false;
  object.add(cloud);
  const calm = shown(tone), bright = shown(0xf2f6ff);
  // ---- what falls ----
  const COUNT = 30, fall = snow ? 2.6 : 0.5, RING = 0.3, period = fall + (snow ? 0 : RING);
  const fallGeo = snow ? starGeometry(6, 0.22) : new OctahedronGeometry(0.5, 0);
  const fallMat = snow ? twinkleMaterial(0xd9e8ff) : dropMaterial(0x6aaef2);
  const falling = new InstancedMesh(fallGeo, fallMat, COUNT);
  falling.frustumCulled = false;
  object.add(falling);
  const ringGeo = ringGeometry(16), ringAge = new Float32Array(COUNT);
  const ringAttr = new InstancedBufferAttribute(ringAge, 1);
  ringAttr.setUsage(DynamicDrawUsage);
  ringGeo.setAttribute('aAge', ringAttr);
  const rings = new InstancedMesh(ringGeo, ringMaterial(0xd6ebff, 0.22), COUNT);
  rings.frustumCulled = false;
  if (!snow) object.add(rings);
  const strikes: { fx: Fx; age: number }[] = [];
  let next = 1.2 + hash(seed, 1, 9) * 2, flash = 9;
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion(), lean = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.14); // the streaks lean the way they fall
  const from = new Vector3(), to = new Vector3();
  return ready({
    object,
    update(delta, age) {
      // the cloud: a flat heap of puffs, breathing a little
      for (let i = 0; i < PUFFS; i++) {
        const a = hash(i, seed, 2) * 6.283, r = Math.sqrt(hash(i, seed, 3)) * (i < 4 ? 0.15 : 0.42);
        at.set(Math.cos(a) * r * size, high + size * (0.16 + 0.1 * hash(i, seed, 4)) + Math.sin(age * 0.9 + i) * size * 0.012, Math.sin(a) * r * size * 0.7);
        cloud.setMatrixAt(i, m.compose(at, q.identity(), sc.setScalar(size * (i < 4 ? 0.42 : 0.24 + 0.14 * hash(i, seed, 5)) * (1 + 0.04 * Math.sin(age * 1.3 + i * 2)))));
      }
      cloud.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < COUNT; i++) {
        const x = age / period - (i + hash(i, seed, 6) * 0.9) / COUNT;
        const turn = Math.floor(x), t = (x - turn) * period, n = turn + seed;
        if (x < 0) {
          falling.setMatrixAt(i, m.makeScale(0, 0, 0));
          rings.setMatrixAt(i, m);
          continue;
        }
        // somewhere under the cloud
        const a = hash(i, n, 7) * 6.283, r = Math.sqrt(hash(i, n, 8)) * 0.44 * size;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r * 0.7;
        if (t < fall) {
          const u = t / fall, y = high * (1 - u);
          if (snow) {
            // a flake: swaying down, gone as it touches
            at.set(px + Math.sin(age * 1.7 + i) * size * 0.05, y, pz + Math.cos(age * 1.3 + i * 2) * size * 0.05);
            falling.setMatrixAt(i, m.compose(at, q.identity(), sc.setScalar(size * (0.035 + 0.02 * hash(i, n, 9)) * smooth(0, 0.06, u) * (1 - smooth(0.92, 1, u)))));
          } else {
            at.set(px + y * 0.14, y, pz);
            falling.setMatrixAt(i, m.compose(at, lean, sc.set(size * 0.014, size * 0.11, size * 0.014)));
          }
          rings.setMatrixAt(i, m.makeScale(0, 0, 0));
        } else {
          const u = (t - fall) / RING;
          falling.setMatrixAt(i, m.makeScale(0, 0, 0));
          rings.setMatrixAt(i, m.compose(at.set(px, 0.002, pz), q.identity(), sc.setScalar(size * (0.02 + 0.06 * (1 - (1 - u) ** 2)))));
          ringAge[i] = u;
        }
      }
      falling.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = ringAttr.needsUpdate = true;
      if (kind === 'storm') {
        // now and then the cloud lights up from inside and strikes the ground under it
        if (age > next) {
          next = age + 2.2 + hash(Math.floor(age * 10), seed, 10) * 2.6;
          flash = 0;
          const a = hash(Math.floor(age * 7), seed, 11) * 6.283, r = Math.sqrt(hash(Math.floor(age * 5), seed, 12)) * 0.34 * size;
          to.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.7);
          from.set(to.x * 0.4, high + size * 0.08, to.z * 0.4);
          const fx = lightning({ from, to, size: high, mark: 2 });
          object.add(fx.object);
          strikes.push({ fx, age: 0 });
        }
        flash += delta;
        cloudMat.uniforms.uLight.value.copy(calm).lerp(bright, Math.max(0, 1 - flash / 0.3));
        for (const item of strikes) {
          item.age += delta;
          if (item.fx.update(delta, item.age) === false) {
            item.fx.object.removeFromParent();
            item.fx.dispose?.();
            item.age = -1;
          }
        }
        for (let i = strikes.length - 1; i >= 0; i--) if (strikes[i].age < 0) strikes.splice(i, 1);
      }
      return true;
    },
    dispose() {
      cloudGeo.dispose();
      cloudMat.dispose();
      cloud.dispose();
      fallGeo.dispose();
      fallMat.dispose();
      falling.dispose();
      ringGeo.dispose();
      (rings.material as ShaderMaterial).dispose();
      rings.dispose();
      for (const item of strikes) item.fx.dispose?.();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// fireworks

const SHOW = [0xff4a3a, 0xffb21e, 0x2ab8ff, 0x3fd65a, 0xc050f0, 0xff5aa0];

/**
 * One-shot fireworks along +Y (~5 s, for a win). `size` = show scale, m (0.5 table, 1.5 room; bursts at 1.3–1.9× up); `shots` rockets (5).
 *
 * Rockets climb one after another along +Y and each bursts into a ball of sparks in its own colour that fly out, droop
 * and go out. `play(world, fireworks({ size: 0.5 }), spot)`.
 */
// cost: 2 draw calls, ~1.4 thousand triangles (5 rockets, 34 sparks each); over in about 5 s.
export function fireworks(o: { size?: number; colors?: number[]; shots?: number; seed?: number } = {}): Fx {
  const size = o.size ?? 0.6, K = o.shots ?? 5, seed = o.seed ?? Math.floor(Math.random() * 1000), S = 34, each = 1 + S;
  const colours = o.colors?.length ? o.colors : SHOW;
  const object = new Group();
  object.name = 'ToyEffect';
  const geometry = new OctahedronGeometry(0.5, 0); // a spark is a needle of 8 triangles
  const cores = new Float32Array(K * each * 3), edges = new Float32Array(K * each * 3);
  for (let k = 0; k < K; k++) {
    const colour = colours[(k + seed) % colours.length];
    for (let j = 0; j < each; j++) {
      shown(blend(colour, 0xffffff, j === 0 ? 0.85 : 0.4)).toArray(cores, (k * each + j) * 3);
      shown(j === 0 ? 0xffc46a : colour).toArray(edges, (k * each + j) * 3);
    }
  }
  geometry.setAttribute('aCore', new InstancedBufferAttribute(cores, 3));
  geometry.setAttribute('aEdge', new InstancedBufferAttribute(edges, 3));
  const material = boltMaterial();
  const mesh = new InstancedMesh(geometry, material, K * each);
  mesh.frustumCulled = false;
  object.add(mesh);
  const light = glow(0xfff0d0, size * 0.7, 0, 0, 0.5);
  light.halo.visible = false;
  object.add(light.halo);
  const RISE = 0.55, GAP = 0.55, LAST = 1.5, DRAG = 3.2, droop = 0.9 * size, life = (K - 1) * GAP + RISE + LAST + 0.1;
  const m = new Matrix4(), at = new Vector3(), top = new Vector3(), sc = new Vector3(), q = new Quaternion(), turned = new Quaternion();
  const up = new Vector3(), dir = new Vector3(), vel = new Vector3();
  return ready({
    object,
    update(_delta, age) {
      (object as Object3D).getWorldQuaternion(turned);
      up.set(0, 1, 0).applyQuaternion(turned.invert());
      let lit = 0;
      for (let k = 0; k < K; k++) {
        const t = age - k * GAP - hash(k, seed, 1) * 0.15, base = k * each;
        // where this rocket bursts: up, a little to one side
        top.set((hash(k, seed, 2) - 0.5) * 0.8 * size, (1.3 + 0.6 * hash(k, seed, 3)) * size, (hash(k, seed, 4) - 0.5) * 0.5 * size);
        if (t < 0 || t > RISE + LAST) {
          for (let j = 0; j < each; j++) mesh.setMatrixAt(base + j, m.makeScale(0, 0, 0));
          continue;
        }
        if (t < RISE) {
          // climbing: fast off the ground, slowing to its top
          const u = t / RISE, climb = 1 - (1 - u) ** 2;
          at.copy(top).multiplyScalar(climb);
          mesh.setMatrixAt(base, m.compose(at, q.setFromUnitVectors(Y, dir.copy(top).normalize()), sc.set(size * 0.03, size * 0.16 * (1 - u * 0.6), size * 0.03)));
          for (let j = 1; j < each; j++) mesh.setMatrixAt(base + j, m.makeScale(0, 0, 0));
          continue;
        }
        const b = t - RISE, slow = Math.exp(-DRAG * b);
        mesh.setMatrixAt(base, m.makeScale(0, 0, 0));
        if (b < 0.22 && 1 - b / 0.22 > lit) {
          lit = 1 - b / 0.22;
          light.halo.position.copy(top);
        }
        for (let j = 1; j < each; j++) {
          // sparks every way out of the burst: they brake, then droop
          const mine = LAST * (0.7 + 0.3 * hash(j, seed + k, 5)), u = b / mine;
          if (u >= 1) {
            mesh.setMatrixAt(base + j, m.makeScale(0, 0, 0));
            continue;
          }
          const tilt = Math.acos(1 - 2 * hash(j, seed + k, 6)), round = hash(j, seed + k, 7) * 6.283;
          dir.set(Math.sin(tilt) * Math.cos(round), Math.cos(tilt), Math.sin(tilt) * Math.sin(round));
          const v = 2.1 * size * (0.75 + 0.25 * hash(j, seed + k, 8));
          at.copy(top).addScaledVector(dir, (v * (1 - slow)) / DRAG).addScaledVector(up, -0.5 * droop * b * b);
          vel.copy(dir).multiplyScalar(v * slow).addScaledVector(up, -droop * b);
          const speed = vel.length();
          q.setFromUnitVectors(Y, vel.multiplyScalar(1 / Math.max(speed, 1e-6)));
          // going out: thinner, and blinking at the very end
          const w = size * 0.042 * (1 - u * u) * (u > 0.7 ? 0.6 + 0.4 * Math.sin(age * 55 + j) : 1);
          mesh.setMatrixAt(base + j, m.compose(at, q, sc.set(w, size * 0.06 + speed * 0.09, w)));
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      light.halo.visible = lit > 0;
      light.set(lit * lit * 0.6, 0);
      return age < life;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      light.dispose();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// bubbles

/** A glassy bubble without blending: thin in its middle (a quarter of the samples), solid at its rim, a white glint. */
function bubbleMaterial(colour: number): ShaderMaterial {
  return new ShaderMaterial({
    alphaToCoverage: true,
    uniforms: { uColour: { value: shown(colour) } },
    vertexShader: /* glsl */ `
      varying float vF;
      varying float vGlint;
      void main() {
        mat4 model = modelMatrix * instanceMatrix;
        vec4 mv = viewMatrix * model * vec4(position, 1.0);
        vec3 worldN = normalize(mat3(model) * normal);
        vF = clamp(dot(normalize(mat3(viewMatrix) * worldN), normalize(-mv.xyz)), 0.0, 1.0);
        vGlint = dot(worldN, normalize(vec3(-0.4, 0.8, 0.45)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour; varying float vF; varying float vGlint;
      void main() {
        float rim = smoothstep(0.45, 0.8, 1.0 - vF);
        vec4 c = vec4(mix(uColour, vec3(1.0), rim * 0.45), mix(0.3, 1.0, rim));
        if (vGlint > 0.94) c = vec4(1.0);
        gl_FragColor = c;
      }`,
  });
}

/**
 * Endless rising bubbles along +Y (`size` = source width, m; `color` tint; `height` climb in sizes, 2.5; `pace` seconds, 2.2; `count` 14).
 *
 * Glassy bubbles leave the spot, climb wobbling along +Y and pop. Put it where they start: `play(world, bubbles({ size: 0.16 }), pot)`.
 */
// cost: 1 draw call, `count` × 80 triangles (14: 1.1 thousand), no blending.
export function bubbles(o: { size?: number; color?: number; height?: number; count?: number; pace?: number; seed?: number } = {}): Fx {
  const size = o.size ?? 0.2, count = o.count ?? 14, pace = o.pace ?? 2.2, seed = o.seed ?? Math.floor(Math.random() * 1000);
  const tall = (o.height ?? 2.5) * size;
  const geometry = ball(2), material = bubbleMaterial(o.color ?? 0x9fd4ff);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const object = new Group();
  object.name = 'ToyEffect';
  object.add(mesh);
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion();
  return ready({
    object,
    update(_delta, age) {
      for (let i = 0; i < count; i++) {
        const x = age / pace - (i + hash(i, seed, 1) * 0.9) / count;
        const turn = Math.floor(x), u = x - turn, n = turn + seed;
        if (x < 0) {
          mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
          continue;
        }
        const a = hash(i, n, 2) * 6.283, r = Math.sqrt(hash(i, n, 3)) * 0.36 * size, sway = size * 0.08 * u;
        at.set(Math.cos(a) * r + Math.sin(u * 11 + hash(i, n, 4) * 6) * sway, tall * u ** 0.85 * (0.75 + 0.25 * hash(i, n, 5)), Math.sin(a) * r + Math.cos(u * 9 + hash(i, n, 6) * 6) * sway);
        // it pops at the top: a quick swell, and gone
        const pop = u > 0.95 ? (1 + 1.2 * ((u - 0.95) / 0.05)) * (u > 0.985 ? 0 : 1) : 1;
        mesh.setMatrixAt(i, m.compose(at, q.identity(), sc.setScalar(size * (0.09 + 0.12 * hash(i, n, 7) ** 2) * smooth(0, 0.08, u) * (0.75 + 0.35 * u) * pop)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// sparkle

/**
 * Endless blinking stars around a thing (`size` = thing width, m; `color` pale gold; `count` 7).
 *
 * Small four-pointed stars blink round it. Put it at the thing's foot: `play(world, sparkle({ size: 0.3 }), chest)`.
 */
// cost: 1 draw call, `count` × 8 triangles (7: 56), opaque.
export function sparkle(o: { size?: number; color?: number; count?: number; seed?: number } = {}): Fx {
  const size = o.size ?? 0.3, count = o.count ?? 7, seed = o.seed ?? Math.floor(Math.random() * 1000);
  const geometry = starGeometry(4, 0.13), material = twinkleMaterial(o.color ?? 0xfff3b0);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const object = new Group();
  object.name = 'ToyEffect';
  object.add(mesh);
  const m = new Matrix4(), at = new Vector3(), sc = new Vector3(), q = new Quaternion();
  return ready({
    object,
    update(_delta, age) {
      for (let i = 0; i < count; i++) {
        const beat = 1.0 + 0.8 * hash(i, seed, 1), x = age / beat + hash(i, seed, 2);
        const turn = Math.floor(x), u = x - turn, n = turn + seed;
        // a blink for the first half of its beat, somewhere on a ball round the thing's middle
        const a = hash(i, n, 3) * 6.283, lift = -0.2 + 1.2 * hash(i, n, 4), flat = Math.sqrt(Math.max(0, 1 - Math.min(1, lift) ** 2));
        at.set(Math.cos(a) * flat * size * 0.55, size * 0.5 + lift * size * 0.5, Math.sin(a) * flat * size * 0.55);
        const blink = u < 0.5 ? Math.sin((u / 0.5) * Math.PI) ** 2 : 0;
        mesh.setMatrixAt(i, m.compose(at, q.identity(), sc.setScalar(size * (0.12 + 0.1 * hash(i, n, 5)) * blink)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  });
}
