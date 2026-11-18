// The real room's flat surfaces — floor, walls, ceiling, table tops — as the scene's own objects, kept up to date:
// what a flying effect needs to land on them (src/shots.ts). One list for a world, made the first time it is asked for.
import { createSystem, type Object3D, type World, XRPlane } from '@iwsdk/core';

const lists = new WeakMap<World, Object3D[]>();

/** The room's surfaces now: thin boxes lying in their own XZ, their +Y out of the surface. The same array every time. */
export function roomSurfaces(world: World): Object3D[] {
  let list = lists.get(world);
  if (!list) {
    const surfaces: Object3D[] = [];
    list = surfaces;
    lists.set(world, surfaces);
    world.registerSystem(
      class RoomSurfaces extends createSystem({ planes: { required: [XRPlane] } }) {
        update(): void {
          // a handful of planes that come and go rarely: the list is simply read again
          surfaces.length = 0;
          for (const plane of this.queries.planes.entities) if (plane.object3D) surfaces.push(plane.object3D);
        }
      },
    );
  }
  return list;
}
