import {
  type BoxGeometry,
  BackSide,
  BufferGeometry,
  createSystem,
  DoubleSide,
  type Entity,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  type World,
  XRPlane,
} from '@iwsdk/core';
import { Delaunay } from 'd3-delaunay';
import { isRoomSurface } from './furniture.js';
import { lightFromSky, type Sky, skyClock, skyMaterial } from './outside.js';

export interface BreakableRoom {
  /** Where a ray (a shot, a thrown thing) meets a real wall, ceiling or floor. */
  hit(origin: Vector3, direction: Vector3): { point: Vector3; normal: Vector3 } | undefined;
  /**
   * Smashes the real wall or ceiling around a world point: pieces fly into the
   * room and the sky shows through. Returns false where nothing can break
   * (the floor, the bottom 0.75 m of walls, already broken places).
   */
  breakAt(point: Vector3, radius?: number): boolean;
  /** Everything broken so far flies back into place and the walls are whole again; resolves when done. */
  repair(): Promise<void>;
  /** Takes the breakable room away (masks, sky, pieces): a whole room looks the same without it. */
  dispose(): void;
}

/**
 * Makes the real walls and ceiling breakable, piece by piece, anywhere.
 *
 * The whole room stands inside one painted sky. Every surface is covered by an
 * invisible mask made of many irregular pieces; breaking removes pieces, so the
 * hole grows with every hit and no two holes are alike.
 */
export function breakableRoom(world: World, sky: Sky, onReady: (room: BreakableRoom) => void): void {
  interface Piece {
    outline: Vector2[];
    middle: Vector3; // world
    start: number; // first vertex in the surface's mask
    count: number;
    breakable: boolean;
    broken: boolean;
  }
  interface Surface {
    position: Vector3;
    frame: Quaternion;
    normal: Vector3; // into the room
    half: Vector2;
    pieces: Piece[];
    mask: BufferGeometry;
    original: Float32Array; // the whole mask, to put broken pieces back
    edges: Mesh;
  }
  const surfaces: Surface[] = [];
  const debris: { entity: Entity; velocity: Vector3; spin: Vector3; age: number }[] = [];
  const fallen: { surface: Surface; piece: Piece }[] = []; // broken since the last repair
  // pieces flying back into the wall during a repair: plain meshes in one entity, however many
  // there are (one entity each could pass the engine's 1000 after a few broken walls)
  const returning: { chunk: Mesh; from: Vector3; to: Vector3; delay: number }[] = [];
  let returningEntity: Entity | undefined;
  const dropReturning = () => {
    for (const { chunk } of returning) chunk.geometry.dispose();
    // keep the shared plaster: disposing it would recompile the shader of every other piece
    if (returningEntity?.active) returningEntity.dispose({ disposeResources: false });
    returningEntity = undefined;
    returning.length = 0;
  };
  let repairT = -1;
  let repaired: (() => void) | undefined;
  let outsideEntity: Entity | undefined;
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const roomCentre = new Vector3(0, 1.2, 0);
  const plaster = new MeshStandardMaterial({ color: 0xe6e0d6, roughness: 0.95 });
  const local = new Vector3();
  let built = false;
  let settled = 0;
  const known = new Set<Entity>();
  const outside = new Group();
  outside.userData.occlude = false;
  let front = new Vector3(0, 0, -1);

  const toWorld = (surface: Surface, p: Vector2, depth = 0) =>
    new Vector3(p.x, p.y, 0)
      .applyQuaternion(surface.frame)
      .add(surface.position)
      .addScaledVector(surface.normal, depth);

  // The wall's thickness, drawn wherever a broken piece meets a whole one.
  const drawEdges = (surface: Surface) => {
    const sides = new Map<string, { a: Vector2; b: Vector2; broken: number; whole: number }>();
    const key = (p: Vector2) => `${Math.round(p.x * 500)},${Math.round(p.y * 500)}`;
    for (const piece of surface.pieces) {
      piece.outline.forEach((a, i) => {
        const b = piece.outline[(i + 1) % piece.outline.length];
        const [first, second] = [key(a), key(b)].sort();
        const side = sides.get(first + second) ?? { a, b, broken: 0, whole: 0 };
        piece.broken ? side.broken++ : side.whole++;
        sides.set(first + second, side);
      });
    }
    const positions: number[] = [];
    const colors: number[] = [];
    for (const { a, b, broken, whole } of sides.values()) {
      if (broken !== 1 || whole !== 1) {
        continue;
      }
      const shade = 0.5 + ((Math.abs(a.x * 7 + a.y * 13) * 10) % 1) * 0.8;
      const corners = [toWorld(surface, a), toWorld(surface, a, -0.14), toWorld(surface, b), toWorld(surface, b, -0.14)];
      for (const i of [0, 1, 2, 2, 1, 3]) {
        positions.push(corners[i].x, corners[i].y, corners[i].z);
        colors.push(shade, shade, shade);
      }
    }
    surface.edges.geometry.dispose();
    surface.edges.geometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(positions, 3))
      .setAttribute('color', new Float32BufferAttribute(colors, 3));
  };

  // A piece of the wall as a real slab of plaster, at its place in the wall.
  const makeChunk = (surface: Surface, piece: Piece) => {
    const centre = piece.outline.reduce((sum, p) => sum.add(p), new Vector2()).divideScalar(piece.outline.length);
    const chunk = new Mesh(
      new ExtrudeGeometry(new Shape(piece.outline.map((p) => p.clone().sub(centre))), { depth: 0.03, bevelEnabled: false }),
      plaster,
    );
    chunk.position.copy(piece.middle);
    chunk.quaternion.copy(surface.frame);
    return chunk;
  };

  const room: BreakableRoom = {
    hit(origin, direction) {
      let nearest = Infinity;
      let found: { point: Vector3; normal: Vector3 } | undefined;
      for (const { position, normal, frame, half } of surfaces) {
        const facing = direction.dot(normal);
        const distance = local.copy(position).sub(origin).dot(normal) / facing;
        if (facing >= 0 || distance <= 0 || distance >= nearest) {
          continue;
        }
        const point = origin.clone().addScaledVector(direction, distance);
        local.copy(point).sub(position).applyQuaternion(frame.clone().invert());
        if (Math.abs(local.x) <= half.x && Math.abs(local.y) <= half.y) {
          nearest = distance;
          found = { point, normal: normal.clone() };
        }
      }
      return found;
    },
    breakAt(point, radius = 0.3) {
      let any = false;
      // The wall hit. Behind it there can be the same wall again, from the next room's side (Space Setup with
      // two rooms hands over both sides of a shared wall, 14.11): its mask would still hide the sky in the hole.
      // A wall facing the same way up to 8 m behind the one hit breaks where the shot would go through it.
      let onIt: Surface | undefined;
      for (const surface of surfaces) {
        const off = Math.abs(local.copy(point).sub(surface.position).dot(surface.normal));
        if (off < 0.05 && (!onIt || off < Math.abs(local.copy(point).sub(onIt.position).dot(onIt.normal)))) onIt = surface;
      }
      for (const surface of surfaces) {
        let at = point;
        // facing the same way as the wall hit (a wall across the room faces the other way)
        if (onIt && surface !== onIt && surface.normal.dot(onIt.normal) > 0.9) {
          const behind = local.copy(point).sub(surface.position).dot(surface.normal); // > 0: the point is room-side of it
          if (behind > 0.02 && behind < 8) at = point.clone().addScaledVector(surface.normal, -behind);
        }
        const hit = surface.pieces.filter(
          (piece) => piece.breakable && !piece.broken && piece.middle.distanceTo(at) < radius,
        );
        if (hit.length === 0) {
          continue;
        }
        any = true;
        console.log(`[break] ${hit.length} pieces at ${point.x.toFixed(1)},${point.y.toFixed(1)},${point.z.toFixed(1)} r ${radius.toFixed(2)}`);
        const positions = surface.mask.getAttribute('position');
        for (const piece of hit) {
          piece.broken = true;
          fallen.push({ surface, piece });
          for (let i = piece.start; i < piece.start + piece.count; i++) {
            positions.setXYZ(i, 0, 0, 0); // the piece of mask is gone
          }
          if (debris.length > 40) {
            continue;
          }
          // The piece itself flies into the room. No DepthOccludable (1.4 s in the air, mostly in front of
          // the wall): the depth system wrapped the shared plaster's shader once more for every piece, and
          // switched occlusion off for the others when one went (audit item 12).
          const chunk = makeChunk(surface, piece);
          chunk.userData.occlude = false;
          debris.push({
            entity: world.createTransformEntity(chunk),
            velocity: surface.normal
              .clone()
              .multiplyScalar(1 + Math.random() * 2)
              .add(new Vector3().randomDirection().multiplyScalar(0.8)),
            spin: new Vector3().randomDirection().multiplyScalar(2 + Math.random() * 6),
            age: 0,
          });
        }
        positions.needsUpdate = true;
        drawEdges(surface);
      }
      return any;
    },
    repair() {
      // Every broken piece rises from the room back into its place, one after another.
      dropReturning();
      const group = new Group();
      fallen.forEach(({ surface, piece }, index) => {
        const chunk = makeChunk(surface, piece);
        const from = piece.middle
          .clone()
          .addScaledVector(surface.normal, 0.6 + Math.random() * 0.8)
          .add(new Vector3().randomDirection().multiplyScalar(0.3));
        from.y = Math.max(0.1, from.y - 0.8);
        chunk.position.copy(from);
        group.add(chunk);
        returning.push({ chunk, from, to: piece.middle, delay: index * 0.02 });
      });
      // the pieces are in before the entity is made: the world's wrapper gives them shadows and occlusion
      if (returning.length) returningEntity = world.createTransformEntity(group);
      repairT = 0;
      return new Promise<void>((done) => (repaired = done));
    },
    dispose() {
      world.unregisterSystem(BreakRoom);
      for (const piece of debris) piece.entity.dispose();
      debris.length = 0;
      dropReturning();
      outsideEntity?.dispose();
    },
  };

  // The repair is over: the mask is whole again where pieces came back.
  const finishRepair = () => {
    const touched = new Set<Surface>();
    for (const { surface, piece } of fallen) {
      piece.broken = false;
      const positions = surface.mask.getAttribute('position');
      for (let i = piece.start; i < piece.start + piece.count; i++) {
        positions.setXYZ(i, surface.original[i * 3], surface.original[i * 3 + 1], surface.original[i * 3 + 2]);
      }
      positions.needsUpdate = true;
      touched.add(surface);
    }
    touched.forEach(drawEdges);
    fallen.length = 0;
    dropReturning();
    repairT = -1;
    const done = repaired;
    repaired = undefined;
    done?.();
  };

  class BreakRoom extends createSystem({ planes: { required: [XRPlane] } }) {
      update(delta: number, time: number): void {
        skyClock.value = time;
        if (repairT >= 0) {
          repairT += delta;
          let flying = false;
          // its game may be gone (13.11): then nothing flies and the repair ends
          if (returningEntity?.active) {
            for (const piece of returning) {
              const t = Math.min(1, Math.max(0, (repairT - piece.delay) / 0.7));
              const s = t * t * (3 - 2 * t);
              piece.chunk.position.lerpVectors(piece.from, piece.to, s);
              flying ||= t < 1;
            }
          }
          if (!flying) finishRepair();
        }
        for (let i = debris.length - 1; i >= 0; i--) {
          const piece = debris[i];
          // a piece whose game was replaced is already gone: forget it (it killed the world, 13.11)
          if (!piece.entity.active || !piece.entity.object3D) {
            debris.splice(i, 1);
            continue;
          }
          const chunk = piece.entity.object3D;
          piece.age += delta;
          piece.velocity.y -= 6 * delta;
          chunk.position.addScaledVector(piece.velocity, delta);
          chunk.rotateOnAxis(local.copy(piece.spin).normalize(), piece.spin.length() * delta);
          chunk.scale.setScalar(Math.min(1, (1.4 - piece.age) * 3));
          if (piece.age > 1.4 || chunk.position.y < 0.02) {
            // its own geometry only: the plaster is every piece's, disposing it recompiled their shader
            (chunk as Mesh).geometry.dispose();
            piece.entity.dispose({ disposeResources: false });
            debris.splice(i, 1);
          }
        }
        // A headset hands the walls over one by one during the first seconds:
        // every new one gets its mask as soon as it comes.
        for (const plane of this.queries.planes.entities) {
          if (known.has(plane)) {
            continue;
          }
          known.add(plane);
          const mesh = plane.object3D as Mesh;
          const { width, depth } = (mesh.geometry as BoxGeometry).parameters;
          if (!isRoomSurface(mesh)) {
            continue; // furniture tops, pictures, windows
          }
          settled = 0;
          const frame = mesh.quaternion.clone().multiply(flat);
          const normal = new Vector3(0, 0, 1).applyQuaternion(frame);
          if (normal.dot(local.copy(roomCentre).sub(mesh.position)) < 0) {
            normal.negate();
          }
          const surface: Surface = {
            position: mesh.position.clone(),
            frame,
            normal,
            half: new Vector2(width / 2, depth / 2),
            pieces: [],
            mask: new BufferGeometry(),
            original: new Float32Array(0),
            edges: new Mesh(
              new BufferGeometry(),
              new MeshBasicMaterial({ color: 0x6a6056, vertexColors: true, side: DoubleSide }),
            ),
          };
          const isFloor = normal.y > 0.9;
          if (normal.z > 0.9) {
            front = normal.clone().negate();
          }
          // Irregular pieces of about the same size: a jittered grid of seeds.
          const seeds: [number, number][] = [];
          const step = isFloor ? 1.5 : 0.22;
          for (let x = -width / 2 + step / 2; x < width / 2; x += step) {
            for (let y = -depth / 2 + step / 2; y < depth / 2; y += step) {
              seeds.push([x + (Math.random() - 0.5) * step * 0.8, y + (Math.random() - 0.5) * step * 0.8]);
            }
          }
          // The mask reaches 8 cm past the surface's edges: neighbouring walls and the
          // ceiling overlap, and no sky shows through the seams between them.
          const over = 0.08;
          const cells = Delaunay.from(seeds).voronoi([-width / 2 - over, -depth / 2 - over, width / 2 + over, depth / 2 + over]);
          const positions: number[] = [];
          seeds.forEach((_, index) => {
            const ring = cells.cellPolygon(index);
            if (!ring) {
              return;
            }
            const outline = ring.slice(0, -1).map(([x, y]) => new Vector2(x, y));
            const middle = toWorld(surface, new Vector2(...seeds[index]));
            const start = positions.length / 3;
            for (let i = 1; i < outline.length - 1; i++) {
              for (const p of [outline[0], outline[i], outline[i + 1]]) {
                const at = toWorld(surface, p);
                positions.push(at.x, at.y, at.z);
              }
            }
            surface.pieces.push({
              outline,
              middle,
              start,
              count: positions.length / 3 - start,
              // Like the walls of a real house: the bottom stays, so do the floor.
              breakable: !isFloor && (normal.y < -0.9 || middle.y > 0.75),
              broken: false,
            });
          });
          surface.mask.setAttribute('position', new Float32BufferAttribute(positions, 3));
          surface.original = new Float32Array(positions);
          const mask = new Mesh(
            surface.mask,
            new MeshBasicMaterial({
              colorWrite: false,
              side: DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: 2,
              polygonOffsetUnits: 8,
            }),
          );
          mask.renderOrder = -10;
          mask.frustumCulled = false;
          surface.edges.frustumCulled = false;
          outside.add(mask, surface.edges);
          surfaces.push(surface);
        }
        settled += delta;
        if (built || surfaces.length < 4 || settled < 1) {
          return; // open the sky only when the room has stopped arriving
        }
        built = true;
        lightFromSky(world, sky);
        const dome = new Mesh(new SphereGeometry(40, 32, 16), skyMaterial(sky, front));
        dome.material.side = BackSide;
        dome.renderOrder = -5;
        dome.position.copy(roomCentre);
        outside.add(dome);
        outsideEntity = world.createTransformEntity(outside);
        outside.traverse((object) => (object.castShadow = false));
        console.log(
          `[break] built ${surfaces.length} surfaces: ` +
            surfaces
              .map((one) => `${(one.half.x * 2).toFixed(1)}x${(one.half.y * 2).toFixed(1)} n(${one.normal.x.toFixed(1)},${one.normal.y.toFixed(1)},${one.normal.z.toFixed(1)}) pieces ${one.pieces.length} breakable ${one.pieces.filter((piece) => piece.breakable).length}`)
              .join(' | '),
        );
        onReady(room);
      }
  }
  world.registerSystem(BreakRoom);
}
