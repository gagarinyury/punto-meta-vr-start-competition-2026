import {
  Box3,
  createSystem,
  DistanceGrabbable,
  type Entity,
  Grabbed,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OneHandGrabbable,
  PhysicsBody,
  PlaneGeometry,
  Quaternion,
  TwoHandsGrabbable,
  Vector3,
  type World,
} from '@iwsdk/core';
import { type Place, surfaceHit, surfaceNear } from './place.js';
import { sfx } from './sfx.js';

/**
 * Things stick to the real room (13.11, Yury's idea). A made thing the player holds (any grab
 * component) and brings close to a real wall or table shows its shadow there — where it would go;
 * let go near it and the thing settles onto the surface: flat against a wall, standing on a table.
 * Only flat things stick to walls (a picture, a poster, a board; a ball does not); anything stands
 * on a table. Things with physics live by their own laws and never stick.
 */

interface Stickable {
  thing: Entity;
  /** the thing's look in its own frame */
  bounds: Box3;
  flat: boolean;
  held: boolean;
  /** where it would settle on the surface it is held near; filled every frame while held, made once */
  aim: { position: Vector3; quaternion: Quaternion };
  target?: { position: Vector3; quaternion: Quaternion };
  settling?: { from: Vector3; fromTurn: Quaternion; t: number };
}

const things: Stickable[] = [];
const REACH = 0.3; // how close to a surface the shadow shows up

// The thing's look in its own frame (as in handle.ts).
function localBounds(object: Object3D): Box3 {
  object.updateWorldMatrix(true, true);
  const toLocal = new Matrix4().copy(object.matrixWorld).invert();
  const box = new Box3();
  const part = new Box3();
  object.traverseVisible((child) => {
    const mesh = child as Mesh; // a mesh, or lines and points: anything with a geometry has a look
    if (!mesh.geometry) return;
    // an InstancedMesh: the box of all its copies, not of the one shape they share
    const instanced = mesh as Mesh & { isInstancedMesh?: boolean; count?: number; computeBoundingBox?: () => void; boundingBox?: Box3 | null };
    if (instanced.isInstancedMesh) {
      if (!instanced.count) return;
      instanced.computeBoundingBox!();
      part.copy(instanced.boundingBox!);
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      part.copy(mesh.geometry.boundingBox!);
    }
    part.applyMatrix4(new Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld));
    box.union(part);
  });
  return box;
}

/** Lets `thing` (a made thing) stick to walls and tables when held near them and let go. */
export function makeStickable(thing: Entity): void {
  const object = thing.object3D;
  if (!object || things.some((one) => one.thing === thing)) return;
  const takeable =
    thing.hasComponent(DistanceGrabbable) || thing.hasComponent(OneHandGrabbable) || thing.hasComponent(TwoHandsGrabbable);
  if (!takeable || thing.hasComponent(PhysicsBody)) return;
  const bounds = localBounds(object);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new Vector3());
  // flat: thin front to back compared with its face (a picture, a board, a clock)
  const flat = size.z < 0.3 * Math.max(size.x, size.y);
  things.push({ thing, bounds, flat, held: false, aim: { position: new Vector3(), quaternion: new Quaternion() } });
}

/** Runs the sticking. Started once by Punto. */
export function startSticking(world: World): void {
  // the shadow: a soft dark sheet the size of the thing's face (wall) or foot (table)
  const shadowLook = new MeshBasicMaterial({ color: 0x0c0b0a, transparent: true, opacity: 0, depthWrite: false });
  const shadow = new Mesh(new PlaneGeometry(1, 1), shadowLook);
  shadow.name = 'stick-shadow';
  shadow.userData.occlude = false;
  shadow.renderOrder = 5;
  shadow.raycast = () => {};
  shadow.visible = false;
  world.scene.add(shadow);

  const FRONT = new Vector3(0, 0, 1);
  const UP = new Vector3(0, 1, 0);
  const at = new Vector3();
  const turn = new Quaternion();
  const parentTurn = new Quaternion();
  const local = new Vector3();
  const forward = new Vector3();
  const centre = new Vector3();
  const offset = new Vector3();
  const fit = { w: 0, h: 0, onWall: false }; // the size of its shadow, refilled by settleOn

  // Where the thing would go on `spot` (into one.aim), if it may go there at all. Runs every frame
  // while a thing is held near a surface: it makes nothing new (audit item 26).
  const settleOn = (one: Stickable, spot: Place) => {
    const { bounds, aim } = one;
    if (spot.surface === 'wall') {
      if (!one.flat) return undefined;
      aim.quaternion.setFromUnitVectors(FRONT, spot.normal);
      // its back (min z) against the wall, its centre on the spot
      bounds.getCenter(centre);
      aim.position
        .copy(spot.point)
        .addScaledVector(spot.normal, -bounds.min.z + 0.004)
        .sub(offset.set(centre.x, centre.y, 0).applyQuaternion(aim.quaternion));
      fit.w = bounds.max.x - bounds.min.x;
      fit.h = bounds.max.y - bounds.min.y;
      fit.onWall = true;
      return fit;
    }
    if (spot.surface === 'table' || spot.surface === 'floor') {
      // standing upright, turned as it is held (around the vertical only)
      one.thing.object3D!.getWorldQuaternion(turn);
      forward.set(0, 0, 1).applyQuaternion(turn).setY(0);
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
      aim.quaternion.setFromUnitVectors(FRONT, forward.normalize());
      aim.position.copy(spot.point).addScaledVector(UP, -bounds.min.y + 0.002);
      fit.w = bounds.max.x - bounds.min.x;
      fit.h = bounds.max.z - bounds.min.z;
      fit.onWall = false;
      return fit;
    }
    return undefined;
  };

  class StickSystem extends createSystem({}) {
    update(delta: number): void {
      let shown = false;
      for (let i = things.length - 1; i >= 0; i--) {
        const one = things[i];
        const object = one.thing.object3D;
        if (!one.thing.active || !object) {
          things.splice(i, 1);
          continue;
        }
        const held = one.thing.hasComponent(Grabbed);

        if (held) {
          one.settling = undefined;
          // the surface it is near, or the one the holding ray points at, if the thing is close to it
          object.getWorldPosition(at);
          let spot = surfaceNear(at, REACH);
          if (!spot) {
            for (const side of ['left', 'right'] as const) {
              if (!this.input.xr.getSelectState(side).active) continue;
              const hit = surfaceHit(side);
              if (hit && hit.point.distanceTo(at) < REACH + 0.2) spot = hit;
            }
          }
          const goal = spot && spot.surface !== 'ceiling' ? settleOn(one, spot) : undefined;
          one.target = goal ? one.aim : undefined;
          if (goal && spot) {
            shown = true;
            shadow.visible = true;
            shadow.scale.set(goal.w, goal.h, 1);
            if (goal.onWall) {
              shadow.quaternion.copy(one.aim.quaternion);
              shadow.position.copy(spot.point).addScaledVector(spot.normal, 0.003);
            } else {
              shadow.quaternion.setFromUnitVectors(FRONT, UP).premultiply(one.aim.quaternion);
              shadow.position.copy(one.aim.position).setY(spot.point.y + 0.003);
            }
          }
        } else if (one.held && !one.target) {
          console.info(`[stick] let go of ${object.name} away from any surface`);
        } else if (one.held && one.target) {
          console.info(`[stick] ${object.name} settles onto the surface`);
          // just let go near a surface: it settles onto it
          object.getWorldPosition(at);
          one.settling = { from: at.clone(), fromTurn: object.getWorldQuaternion(new Quaternion()), t: 0 };
          sfx(world, 'drop', one.target.position);
        }

        if (one.settling && one.target) {
          one.settling.t = Math.min(1, one.settling.t + delta / 0.18);
          const k = 1 - (1 - one.settling.t) ** 3;
          local.lerpVectors(one.settling.from, one.target.position, k);
          turn.copy(one.settling.fromTurn).slerp(one.target.quaternion, k);
          const parent = object.parent;
          if (parent) {
            parent.worldToLocal(local);
            turn.premultiply(parent.getWorldQuaternion(parentTurn).invert());
          }
          object.position.copy(local);
          object.quaternion.copy(turn);
          if (one.settling.t >= 1) {
            one.settling = undefined;
            one.target = undefined;
          }
        }
        one.held = held;
      }
      // the shadow fades in while a held thing is near a surface, and out after
      shadowLook.opacity += ((shown ? 0.38 : 0) - shadowLook.opacity) * (1 - Math.exp(-delta * 12));
      if (!shown && shadowLook.opacity < 0.01) shadow.visible = false;
    }
  }
  world.registerSystem(StickSystem);
}
