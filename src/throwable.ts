// A thing to throw: a ball, a dart, a snowball, a ring.
//
// It is a real physical thing: it falls from where it was put, bounces, and
// lies where it stops — on the floor too. The seated player points a hand at it
// and pinches, near or far: it flies into the fingers; opening them on a swing
// throws it. (One grab component only: IWSDK keeps the first and ignores the
// rest, and OneHandGrabbable would switch the ray off — audit 15.11.)
// Only a lost one — through a wall, under the floor, metres away — drops again
// at its first place. A game needs no respawn code of its own.
//
//   const ball = basketball(0.12);
//   ball.position.set(0, 0.8, -0.7);            // it drops to the floor from here
//   const entity = throwable(world, ball, { radius: 0.12 });
import {
  createSystem,
  DistanceGrabbable,
  type Entity,
  Grabbed,
  MovementMode,
  type Object3D,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  PhysicsSystem,
  RayInteractable,
  Vector3,
  type World,
} from '@iwsdk/core';
import { sfx } from './sfx.js';

export interface ThrowableOptions {
  /** Radius of the sphere it collides as, metres. */
  radius: number;
  /** Bounciness 0..1 (default 0.8, a ball). */
  bounce?: number;
  /** Called when a lost one has been dropped at its first place again. */
  onReturn?: () => void;
}

const FAR = 5; // metres from its first place: lost, bring it back

/**
 * Makes `object` a thing to throw (see the top of the file). It drops from its position at the
 * moment of the call; a lost one drops from there again. Returns its entity: read `Grabbed` on
 * it, or `object.position` and `getVectorView(PhysicsBody, '_linearVelocity')` to score.
 */
export function throwable(world: World, object: Object3D, options: ThrowableOptions): Entity {
  const home = object.position.clone();
  const entity = world
    .createTransformEntity(object)
    .addComponent(RayInteractable)
    // into the hand, just in front of the pinch (the ray points along -z)
    .addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveTowardsTarget,
      targetPositionOffset: [0, 0, -options.radius],
      scale: false,
    })
    .addComponent(PhysicsBody, { state: PhysicsState.Dynamic, linearDamping: 0.05, angularDamping: 0.3 })
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Sphere,
      dimensions: [options.radius, 0, 0],
      restitution: options.bounce ?? 0.8,
      friction: 0.8,
    });
  const position = new Vector3();

  world.registerSystem(
    class Throwable extends createSystem({}) {
      update(): void {
        if (!entity.active || entity.hasComponent(Grabbed)) return;
        object.getWorldPosition(position);
        if (position.y > -1 && position.distanceTo(home) < FAR) return;
        world.getSystem(PhysicsSystem)!.setBodyTransform(entity, { position: [home.x, home.y, home.z], quaternion: [0, 0, 0, 1] });
        sfx(world, 'pluck', home, 0.5);
        options.onReturn?.();
      }
    },
  );
  return entity;
}
