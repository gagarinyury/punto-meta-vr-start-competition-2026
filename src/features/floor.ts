import {
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
} from '@iwsdk/core';
import { feature } from '../live.js';

// Invisible floor so that dropped physics objects stay in the room.
feature(import.meta, (world) => {
  const floor = world.createTransformEntity();
  floor.object3D!.name = 'Floor Collider';
  floor.object3D!.position.set(0, -0.05, 0);
  floor
    .addComponent(PhysicsBody, { state: PhysicsState.Static })
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Box,
      dimensions: [10, 0.1, 10],
    });
});

import.meta.hot?.accept();
