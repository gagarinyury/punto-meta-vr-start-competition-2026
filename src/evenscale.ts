// A grabbed thing grows and shrinks as a whole (Yury, 18.11: «молекула растягивается в стороны, а надо, чтобы она
// масштабировалась»). IWSDK hands its grab handle the three axes separately, and two hands pulled apart stretched a
// thing along that line only; @pmndrs/handle knows `scale.uniform`, but IWSDK does not pass it. So, after the grab
// system each frame, a held thing whose scale went uneven is made even: every axis gets the one that changed most
// from where it was when it was taken.
import { createSystem, DistanceGrabbable, Grabbed, OneHandGrabbable, TwoHandsGrabbable, Vector3, type World } from '@iwsdk/core';

export function startEvenScale(world: World): void {
  const taken = new WeakMap<object, Vector3>();
  world.registerSystem(
    class EvenScale extends createSystem({
      distance: { required: [DistanceGrabbable, Grabbed] },
      two: { required: [TwoHandsGrabbable, Grabbed] },
      one: { required: [OneHandGrabbable, Grabbed] },
    }) {
      init(): void {
        for (const query of [this.queries.distance, this.queries.two, this.queries.one]) {
          this.cleanupFuncs.push(
            query.subscribe('qualify', (entity) => {
              const object = entity.object3D;
              if (object) taken.set(object, object.scale.clone());
            }),
          );
        }
      }
      update(): void {
        for (const query of [this.queries.distance, this.queries.two, this.queries.one]) {
          for (const entity of query.entities) {
            const object = entity.object3D;
            const was = object && taken.get(object);
            if (!object || !was) continue;
            const s = object.scale;
            if (Math.abs(s.x - s.y) < 1e-4 && Math.abs(s.y - s.z) < 1e-4) continue;
            // the factor of the axis that moved most from the start, on all three
            const fx = s.x / (was.x || 1), fy = s.y / (was.y || 1), fz = s.z / (was.z || 1);
            const pick = [fx, fy, fz].reduce((a, b) => (Math.abs(Math.log(b)) > Math.abs(Math.log(a)) ? b : a));
            s.set(was.x * pick, was.y * pick, was.z * pick);
          }
        }
      }
    },
    { priority: 0 },
  );
}
