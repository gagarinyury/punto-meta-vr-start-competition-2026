import { createSystem, DistanceGrabbable, Grabbed, MovementMode, RayInteractable } from '@iwsdk/core';
import { feature } from '../live.js';
import { inFrontOfPlayer } from '../place.js';
import { block, evenFaces, PALETTE, toy } from '../style.js';

// «A red cube that hangs in the air»: one chamfered red cube, slowly turning.
// Taken with the ray; both hands' rays on it scale it bigger or smaller.
feature(import.meta, (world) => {
  const cube = toy(block(0.2, 0.2, 0.2), evenFaces(PALETTE.red), { vary: 0 });
  cube.name = 'cube';
  const spot = inFrontOfPlayer(world, { distance: 0.7 }); // wherever the player sits and looks
  cube.position.copy(spot.point);
  cube.quaternion.copy(spot.facing);
  const entity = world
    .createTransformEntity(cube)
    .addComponent(RayInteractable)
    .addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget });

  world.registerSystem(
    class Turn extends createSystem({}) {
      update(delta: number): void {
        if (!entity.hasComponent(Grabbed)) cube.rotation.y += delta * 0.4;
      }
    },
  );
});
import.meta.hot?.accept();
