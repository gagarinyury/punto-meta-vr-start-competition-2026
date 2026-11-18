// Shots you can see (17.11, rebuilt from Gabriel Aguiar's «Unique Toon Projectiles» showcase frame by frame):
//  'bullet'  a spiky yellow-white star at the muzzle with a tongue of flame, a thin bright tracer (yellow core,
//            orange rim) racing to the target, and where it lands a small fiery puff (our explosion, small)
//  'orb'     a spiky star at the muzzle, a white-hot ball with a coloured halo flying with a trail of smoke wisps,
//            and where it lands a ring of shock waves and a puff
// The bolt flies at a speed you can follow and hits when it arrives (a ray against the targets' boxes each frame).
//
//   spawn-free: const fx = gunShot({ from, direction, kind: 'bullet', targets: zombies, onHit }); scene/parent.add(fx.object)
import {
  AdditiveBlending,
  Box3,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  Ray,
  RingGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Fx } from './fx/core.js';
import { glowMaterial, puffMaterial, pyroBoom } from './pyro.js';

const Z = new Vector3(0, 0, 1);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// a spiky star: long thin rays of uneven length (the toon muzzle flash), in the XY plane
export function spikyStar(rays: number, seed: number): ShapeGeometry {
  const s = new Shape();
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i <= rays * 2; i++) {
    const a = (i / (rays * 2)) * Math.PI * 2;
    const len = i % 2 === 0 ? 0.5 * (0.55 + rnd() * 0.45) : 0.09;
    if (i === 0) s.moveTo(Math.cos(a) * len, Math.sin(a) * len);
    else s.lineTo(Math.cos(a) * len, Math.sin(a) * len);
  }
  return new ShapeGeometry(s);
}

/** A soft additive glow on a flat shape: bright in its middle, `colour` at its edges. */
export function flashMaterial(core: number, edge: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uCore: { value: new Color(core) }, uEdge: { value: new Color(edge) }, uAmount: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uEdge; uniform float uAmount; varying vec2 vP;
      void main() { float r = clamp(length(vP) / 0.5, 0.0, 1.0); vec3 c = mix(uCore, uEdge, smoothstep(0.1, 0.7, r)); gl_FragColor = vec4(c * (1.2 - r) * uAmount, 1.0); }`,
  });
}

/** A streak along +Z: a white-yellow core with an orange rim, fading to its tail (the tracer, a flame tongue). */
export function streakMaterial(core: number, edge: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uCore: { value: new Color(core) }, uEdge: { value: new Color(edge) }, uAmount: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uEdge; uniform float uAmount; varying vec2 vUv;
      void main() {
        float across = abs(vUv.x - 0.5) * 2.0;          // 0 the middle line … 1 its edge
        float along = vUv.y;                            // 0 the tail … 1 the head
        float body = (1.0 - smoothstep(0.0, 1.0, across)) * smoothstep(0.0, 0.7, along);
        vec3 c = mix(uEdge, uCore, 1.0 - smoothstep(0.0, 0.45, across));
        gl_FragColor = vec4(c * body * uAmount * 1.4, 1.0);
      }`,
  });
}

/** Two crossed planes along +Z from 0 to `length` (so the streak reads from every side, as in VR it must). */
export function crossedStreak(material: ShaderMaterial, width: number, length: number): Group {
  const g = new Group();
  for (const turn of [0, Math.PI / 2]) {
    const plane = new Mesh(new PlaneGeometry(width, length), material);
    plane.geometry.rotateX(Math.PI / 2).translate(0, 0, -length / 2); // its uv.y: 0 at the tail (−Z) … 1 at the head
    plane.rotation.z = turn;
    g.add(plane);
  }
  return g;
}

export interface GunShotOptions {
  /** where it leaves the barrel and the way it goes (in the space it flies in: the room, or a board's units) */
  from: Vector3;
  direction: Vector3;
  /** 'bullet' a tracer and a fiery puff; 'orb' a glowing ball with a smoke trail and shock rings */
  kind?: 'bullet' | 'orb';
  /** the orb's colour (its halo, its rings): 0x5ad8ff by default */
  colour?: number;
  /** metres a second: slow enough to see (bullet 22, orb 9) */
  speed?: number;
  /** the scale of the whole shot: 1 for a pistol in the room */
  size?: number;
  /** what it can hit: their boxes */
  targets?: Iterable<Object3D>;
  /** called once with the thing hit and the point */
  onHit?: (target: Object3D, point: Vector3) => void;
  /** how far it flies when it hits nothing, metres (12) */
  range?: number;
}

/** A shot as an Fx (add its object to the room or to a board): muzzle flash, the flying bolt, the hit. */
export function gunShot(o: GunShotOptions): Fx {
  const kind = o.kind ?? 'bullet';
  const size = o.size ?? 1;
  const colour = o.colour ?? 0x5ad8ff;
  const speed = (o.speed ?? (kind === 'bullet' ? 22 : 9)) * size;
  const range = (o.range ?? 12) * size;
  const dir = o.direction.clone().normalize();
  const object = new Group();
  object.name = 'ToyEffect';
  const geometries: { dispose(): void }[] = [];
  const materials: { dispose(): void }[] = [];

  // ---- the muzzle: a spiky star facing along the shot, a tongue of flame forward ----
  const muzzle = new Group();
  muzzle.position.copy(o.from);
  muzzle.quaternion.setFromUnitVectors(Z, dir);
  const starMat = flashMaterial(0xfffbe0, kind === 'bullet' ? 0xffa020 : colour);
  const starGeo = spikyStar(9, Math.floor(Math.random() * 1000) + 1);
  const star = new Mesh(starGeo, starMat); // faces along the shot (seen from the side as a burst)
  const starSide = new Mesh(starGeo, starMat);
  starSide.rotation.y = Math.PI / 2; // and across it, so it reads from the side too
  const tongueMat = streakMaterial(0xfff4c0, 0xff6a10);
  const tongue = crossedStreak(tongueMat, 0.07 * size, 0.28 * size);
  tongue.rotation.y = Math.PI; // turned to run forward from the barrel, bright at the barrel
  muzzle.add(star, starSide, tongue);
  object.add(muzzle);
  geometries.push(starGeo);
  materials.push(starMat, tongueMat);

  // ---- the bolt ----
  const bolt = new Group();
  bolt.position.copy(o.from);
  bolt.quaternion.setFromUnitVectors(Z, dir);
  object.add(bolt);
  let tracerMat: ShaderMaterial | undefined;
  let halo: Mesh | undefined;
  const wisps: { mesh: Mesh; born: number; at: Vector3 }[] = [];
  const wispGeo = new IcosahedronGeometry(0.5, 2);
  geometries.push(wispGeo);
  if (kind === 'bullet') {
    tracerMat = streakMaterial(0xfffbe0, 0xff8a20);
    bolt.add(crossedStreak(tracerMat, 0.04 * size, 0.7 * size));
    materials.push(tracerMat);
  } else {
    const coreMat = new MeshBasicMaterial({ color: 0xffffff });
    const core = new Mesh(new IcosahedronGeometry(0.5, 2), coreMat);
    core.scale.setScalar(0.07 * size);
    halo = new Mesh(new IcosahedronGeometry(0.5, 2), glowMaterial(colour));
    halo.scale.setScalar(0.24 * size);
    bolt.add(core, halo);
    const tailMat = streakMaterial(0xffffff, colour);
    const tail = crossedStreak(tailMat, 0.09 * size, 0.55 * size);
    // from the ball backwards (a crossed streak runs from 0 back along −Z, bright at its head)
    bolt.add(tail);
    materials.push(tailMat);
    geometries.push(core.geometry, halo.geometry);
    materials.push(coreMat, halo.material as ShaderMaterial);
  }

  let hit: { fx: Fx; age: number } | undefined;
  const rings: { mesh: Mesh; age: number }[] = [];
  let travelled = 0;
  let flying = true;
  let lastWisp = 0;
  const ray = new Ray(), box = new Box3(), here = new Vector3(), way = new Vector3(), meet = new Vector3(), best = new Vector3();
  const targets = [...(o.targets ?? [])];

  const land = (point: Vector3) => {
    flying = false;
    bolt.visible = false;
    // the hit: our explosion, small (bullet: a fiery puff; orb: in its colour's light, plus shock rings)
    const puff = pyroBoom({ size: (kind === 'bullet' ? 0.16 : 0.22) * size });
    puff.object.position.copy(point).addScaledVector(dir, -0.04 * size);
    puff.object.position.y -= 0.1 * size;
    object.add(puff.object);
    hit = { fx: puff, age: 0 };
    if (kind === 'orb') {
      for (let k = 0; k < 3; k++) {
        const ringMat = flashMaterial(0xffffff, colour);
        const mesh = new Mesh(new RingGeometry(0.42, 0.5, 48), ringMat);
        mesh.position.copy(point);
        mesh.quaternion.setFromUnitVectors(Z, dir);
        mesh.rotateX((k - 1) * 0.5);
        object.add(mesh);
        rings.push({ mesh, age: -k * 0.04 });
      }
    }
  };

  return {
    object,
    update(delta, age) {
      // the muzzle flash: two or three frames
      const flash = clamp01(1 - age / 0.07);
      muzzle.visible = flash > 0;
      if (muzzle.visible) {
        const s = size * (0.22 + 0.12 * (1 - flash));
        star.scale.setScalar(s);
        starSide.scale.setScalar(s);
        star.rotation.z += 0.9;
        starMat.uniforms.uAmount.value = flash;
        tongueMat.uniforms.uAmount.value = flash;
      }
      if (flying) {
        const step = speed * delta;
        object.updateWorldMatrix(true, false);
        const scale = object.matrixWorld.getMaxScaleOnAxis();
        bolt.getWorldPosition(here);
        way.copy(dir).transformDirection(object.matrixWorld);
        ray.set(here, way);
        let reach = step * scale, target: Object3D | undefined;
        for (const thing of targets) {
          if (!thing.visible || !thing.parent) continue;
          box.setFromObject(thing, true);
          if (!ray.intersectBox(box, meet)) continue;
          const far = meet.distanceTo(here);
          if (far > reach) continue;
          reach = far;
          target = thing;
          best.copy(meet);
        }
        if (target) {
          const point = object.worldToLocal(best.clone());
          land(point);
          o.onHit?.(target, best.clone());
        } else {
          bolt.position.addScaledVector(dir, step);
          travelled += step;
          if (travelled > range) {
            flying = false;
            bolt.visible = false;
          }
        }
        if (halo) halo.scale.setScalar(0.24 * size * (1 + 0.15 * Math.sin(age * 60)));
        // the orb leaves smoke wisps behind it; the bullet a few faint ones
        if (age - lastWisp > (kind === 'orb' ? 0.008 : 0.02)) {
          lastWisp = age;
          const mat = puffMaterial();
          mat.uniforms.uHeat.value = 0;
          mat.uniforms.uSmoke.value = 1;
          mat.uniforms.uSeed.value = Math.random() * 10;
          const mesh = new Mesh(wispGeo, mat);
          // a wisp a little off the line, its own size: a ragged trail of smoke, not a string of beads
          mesh.position.copy(bolt.position).addScaledVector(dir, -(kind === 'orb' ? 0.08 : 0.3) * size);
          mesh.position.x += (Math.random() - 0.5) * 0.05 * size;
          mesh.position.y += (Math.random() - 0.5) * 0.05 * size;
          mesh.position.z += (Math.random() - 0.5) * 0.05 * size;
          mesh.userData.big = 0.6 + Math.random() * 0.9;
          object.add(mesh);
          wisps.push({ mesh, born: age, at: mesh.position.clone() });
          materials.push(mat);
        }
      }
      // the wisps: swell a little, drift up, are eaten away
      for (const w of wisps) {
        const t = age - w.born;
        const m = w.mesh.material as ShaderMaterial;
        w.mesh.visible = t < 0.5;
        if (!w.mesh.visible) continue;
        w.mesh.scale.setScalar(size * (kind === 'orb' ? 0.06 : 0.03) * (w.mesh.userData.big as number) * (0.5 + t * 2.2));
        w.mesh.position.copy(w.at).setY(w.at.y + t * 0.08 * size);
        m.uniforms.uDissolve.value = clamp01(t / 0.35) * 1.05;
      }
      for (const ring of rings) {
        ring.age += delta;
        ring.mesh.visible = ring.age > 0 && ring.age < 0.3;
        if (!ring.mesh.visible) continue;
        ring.mesh.scale.setScalar(size * (0.1 + ring.age * 1.6));
        (ring.mesh.material as ShaderMaterial).uniforms.uAmount.value = 1 - ring.age / 0.3;
      }
      let going = flying || (muzzle.visible && age < 0.1);
      if (hit) {
        hit.age += delta;
        if (hit.fx.update(delta, hit.age) === false) {
          hit.fx.object.removeFromParent();
          hit.fx.dispose?.();
          hit = undefined;
        } else going = true;
      }
      return going || wisps.some((w) => age - w.born < 0.5) || rings.some((r) => r.age < 0.3);
    },
    dispose() {
      hit?.fx.dispose?.();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const ring of rings) {
        ring.mesh.geometry.dispose();
        (ring.mesh.material as ShaderMaterial).dispose();
      }
      object.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh && mesh.geometry && mesh.geometry.type === 'PlaneGeometry') mesh.geometry.dispose();
      });
    },
  };
}
