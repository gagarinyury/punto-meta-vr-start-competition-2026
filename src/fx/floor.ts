import {
  BoxGeometry,
  createSystem,
  eq,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { readFurniture } from '../furniture.js';
import { type Fx, play } from './core.js';

/**
 * Covers the whole real floor with a surface effect: lava, water, mist.
 *
 * The host measures the real floor and hands its size to `make`, lays the
 * effect on it, and keeps real furniture standing in it: sofas and tables are
 * not painted over, so they become islands.
 */
export function coverFloor<T extends Fx>(
  world: World,
  make: (width: number, depth: number) => T,
  onReady?: (surface: T) => void,
): void {
  let waited = 0;
  let done = false;
  const axis = new Vector3();
  world.registerSystem(
    class CoverFloor extends createSystem({
      planes: { required: [XRPlane] },
      furniture: { required: [XRMesh], where: [eq(XRMesh, 'isBounded3D', true)] },
    }) {
      update(delta: number): void {
        if (done) {
          return;
        }
        let floor: Mesh | undefined;
        for (const plane of this.queries.planes.entities) {
          const mesh = plane.object3D as Mesh;
          const { width, depth } = (mesh.geometry as BoxGeometry).parameters;
          const up = axis.set(0, 1, 0).applyQuaternion(mesh.quaternion).y;
          if (width * depth >= 6 && mesh.position.y < 0.3 && Math.abs(up) > 0.9) {
            floor = mesh;
          }
        }
        waited += floor ? delta : 0;
        if (!floor || waited < 1) {
          return; // furniture may arrive a moment after the floor
        }
        done = true;
        // Invisible stand-ins for the furniture: they hide the surface behind them.
        const islands = new Group();
        islands.userData.occlude = false;
        for (const item of this.queries.furniture.entities) {
          const box = readFurniture(item);
          if (!box) {
            continue;
          }
          const stand = new Mesh(
            new BoxGeometry(box.size.x, box.size.y, box.size.z),
            new MeshBasicMaterial({ colorWrite: false }),
          );
          stand.renderOrder = -10;
          stand.position.copy(box.centre);
          stand.quaternion.copy(box.quaternion);
          islands.add(stand);
        }
        world.createTransformEntity(islands);
        islands.traverse((part) => (part.castShadow = false));

        const { width, depth } = (floor.geometry as BoxGeometry).parameters;
        const surface = make(width, depth);
        axis.set(1, 0, 0).applyQuaternion(floor.quaternion);
        surface.object.rotation.y = Math.atan2(-axis.z, axis.x);
        play(world, surface, floor.position.clone().setY(floor.position.y + 0.01));
        onReady?.(surface);
      }
    },
  );
}
