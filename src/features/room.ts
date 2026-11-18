import {
  type BoxGeometry,
  createSystem,
  type Entity,
  eq,
  type Mesh,
  Object3D,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  ShadowCatcher,
  Quaternion,
  Vector3,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { isRoomSurface, readFurniture } from '../furniture.js';
import { feature } from '../live.js';

// The real room becomes solid: every detected plane (floor, walls, ceiling,
// table tops) and every piece of furniture gets a static collider, so thrown
// things bounce off the player's own walls and land on their own table.
// Planes follow the recipe in the IWSDK scene-understanding guide.
// Planes also catch shadows, so game objects sit in the room instead of floating.
feature(import.meta, (world) => {
  const solid = new Set<Entity>();
  const makeSolid = (entity: Entity, dimensions: [number, number, number]) => {
    if (entity.hasComponent(PhysicsBody)) {
      return;
    }
    entity
      .addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions })
      .addComponent(PhysicsBody, { state: PhysicsState.Static });
    solid.add(entity);
  };

  // A shadow catcher 5 mm off the surface, on the side that faces the room.
  // A headset can hand over the same wall more than once, one copy a little behind the other (14.11, three
  // front walls in Yury's room). A catcher hides what is behind it, so the catcher of a wall that has a
  // parallel wall in front of it hid the blaster's hole, the crack Punto comes in through and the dome behind
  // it. Only the wall nearest the room keeps its catcher (`twins` below, also when the copies come in late).
  const catchers = new Map<Entity, { catcher: Entity; normal: Vector3; position: Vector3; turn: Quaternion; half: [number, number]; gone?: boolean }>();
  const inverse = new Quaternion();
  const behindAnother = (plane: Entity): string | undefined => {
    const me = catchers.get(plane)!;
    for (const [other, them] of catchers) {
      // facing the same way (both normals point into the room): a wall across the room faces the other way
      if (other === plane || them.normal.dot(me.normal) < 0.9) continue;
      // how far in front of me (towards the room) the other wall is, and whether it covers me; up to 8 m: the
      // next room's far wall too
      const ahead = toRoom.copy(them.position).sub(me.position).dot(me.normal);
      if (ahead < 0.005 || ahead > 8) continue;
      inverse.copy(me.turn).invert(); // kept when it came: the plane may be gone from the scene since (14.11)
      const local = up.copy(them.position).sub(me.position).applyQuaternion(inverse);
      // really covering me — at least half of my width and of my height — not a stretch beside me that only
      // touches my edge, and not a door (the emulator's room, 14.11: a 0.85 m door took a 5 m wall's catcher)
      const overlap = (axis: number, offset: number) => Math.min(me.half[axis], them.half[axis]) * 2 - Math.max(0, Math.abs(offset) - Math.abs(me.half[axis] - them.half[axis])) > me.half[axis];
      if (overlap(0, local.x) && overlap(1, local.z)) {
        const f = (v: Vector3) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
        return `the wall at ${f(me.position)} (${(me.half[0] * 2).toFixed(1)} m wide) is ${ahead.toFixed(2)} m behind the one at ${f(them.position)}`;
      }
    }
    return undefined;
  };
  const twins = () => {
    for (const [plane, entry] of catchers) {
      if (entry.gone) continue;
      const why = behindAnother(plane);
      if (why) {
        console.info(`[room] ${why}: no shadow catcher on it (the same wall from the next room)`);
        entry.gone = true;
        if (entry.catcher.active) entry.catcher.dispose();
      }
    }
  };
  const up = new Vector3();
  const toRoom = new Vector3();
  // One catcher per plane, whatever the plane is (18.11: 180 catchers in the headset after an hour — every plane that
  // qualified again got a new one and only walls had the old one taken away; each writes depth, and the pile hid the
  // tablet and showed as stray shapes in the room)
  const catcherOf = new Map<Entity, Entity>();
  const dropCatcher = (plane: Entity) => {
    const old = catcherOf.get(plane);
    if (old?.active) old.dispose();
    catcherOf.delete(plane);
    catchers.delete(plane);
  };
  const catchShadows = (plane: Entity, width: number, depth: number) => {
    dropCatcher(plane);
    const surface = plane.object3D!;
    up.set(0, 1, 0).applyQuaternion(surface.quaternion);
    toRoom.set(0, 1.2, 0).sub(surface.position);
    // Not a child of the plane: plane meshes are invisible and hide children.
    const node = new Object3D();
    node.position.copy(surface.position);
    node.quaternion.copy(surface.quaternion);
    if (up.dot(toRoom) < 0) {
      node.rotateX(Math.PI);
    }
    node.translateY(0.005);
    node.userData.occlude = false;
    const catcher = world.createTransformEntity(node).addComponent(ShadowCatcher, { size: [width, depth], opacity: 0.45 });
    catcherOf.set(plane, catcher);
    const normal = new Vector3(0, 1, 0).applyQuaternion(surface.quaternion);
    if (normal.dot(toRoom.set(0, 1.2, 0).sub(surface.position)) < 0) normal.negate();
    // walls only, and only whole walls: a picture, a door or a window on a wall is not a copy of it
    if (Math.abs(normal.y) < 0.3 && isRoomSurface(surface as Mesh)) {
      const before = catchers.get(plane);
      if (before?.catcher.active) before.catcher.dispose(); // the same plane again: one catcher
      catchers.set(plane, { catcher, normal, position: surface.position.clone(), turn: surface.quaternion.clone(), half: [width / 2, depth / 2] });
      try {
        twins();
      } catch (error) {
        console.warn('[room] the copies of a wall were not sorted out', error); // never at the cost of the room
      }
    }
  };

  world.registerSystem(
    class RoomPhysics extends createSystem({
      planes: { required: [XRPlane] },
      furniture: {
        required: [XRMesh],
        where: [eq(XRMesh, 'isBounded3D', true)],
      },
    }) {
      init(): void {
        this.cleanupFuncs.push(
          this.queries.planes.subscribe(
            'qualify',
            (entity) => {
              const { width, height, depth } = (
                (entity.object3D as Mesh).geometry as BoxGeometry
              ).parameters;
              makeSolid(entity, [width, height, depth]);
              catchShadows(entity, width, depth);
            },
            true,
          ),
          this.queries.planes.subscribe('disqualify', (entity) => dropCatcher(entity)),
          this.queries.furniture.subscribe(
            'qualify',
            (entity) => {
              const box = readFurniture(entity);
              if (!box) {
                return; // the mesh of the whole room: never a solid box
              }
              // A body of its own: the detected mesh's origin differs between devices.
              const stand = new Object3D();
              stand.position.copy(box.centre);
              stand.quaternion.copy(box.quaternion);
              stand.userData.occlude = false;
              const solidBox = world.createTransformEntity(stand);
              makeSolid(solidBox, [box.size.x, box.size.y, box.size.z]);
            },
            true,
          ),
        );
      }
    },
  );

  return () => {
    for (const entity of solid) {
      if (entity.active) {
        entity.removeComponent(PhysicsBody).removeComponent(PhysicsShape);
      }
    }
  };
});

import.meta.hot?.accept();
