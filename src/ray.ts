// Where the pointing ray hit, and which hand pinched.
//
// `RayInteractable` + `Pressed` only say "this entity is pressed". A game that
// must know the exact spot — which block of a world, which face of it, which
// key, which cell — and the hand, asks here. It is the engine's own ray and
// its own pinch: never build a Raycaster, never read the pinch state yourself.
//
//   const blocks = world.createTransformEntity(group);     // many meshes in one group
//   onRayPress(world, blocks, (hit) => {
//     if (hit.hand === 'left') remove(hit.object);          // the mesh that was hit
//     else addBlockAt(hit.point.clone().addScaledVector(hit.normal, 0.5 * SIZE));
//   });
import { type Entity, type Object3D, RayInteractable, Vector3, type World } from '@iwsdk/core';

export interface RayHit {
  /** The spot that was hit, in the room (world coordinates). */
  point: Vector3;
  /** The direction out of the surface at that spot, in the room; (0, 1, 0) when the shape has no faces. */
  normal: Vector3;
  /** The very mesh that was hit: the entity's own object or a child of it. */
  object: Object3D;
  /** For an InstancedMesh: which instance. */
  instanceId?: number;
  /** The hand that pinched. A mouse click on the flat screen counts as the right hand. */
  hand: 'left' | 'right';
}

// What the engine's pointer event carries (@pmndrs/pointer-events), as far as it is used here.
interface PointerHit {
  object: Object3D;
  point: Vector3;
  face?: { normal: Vector3 } | null;
  instanceId?: number;
  pointerPosition: Vector3;
  pointerType: string;
}

/**
 * Calls `handler` each time the player points at `entity` (its object or any child of it) and
 * pinches. Adds `RayInteractable` if the entity has none. Returns a function that stops it;
 * a feature needs not call it — the listener goes away with the entity.
 */
export function onRayPress(world: World, entity: Entity, handler: (hit: RayHit) => void): () => void {
  if (!entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
  const target = entity.object3D!;
  const left = new Vector3();
  const right = new Vector3();
  const listener = (event: PointerHit) => {
    // The hand: the ray starts at one of the two hands' ray spaces — the nearer one is it.
    world.player.raySpaces.left.getWorldPosition(left);
    world.player.raySpaces.right.getWorldPosition(right);
    const fromHand = event.pointerType !== 'mouse' && event.pointerType !== 'touch' && event.pointerType !== 'screen-mouse';
    const hand = fromHand && event.pointerPosition.distanceToSquared(left) < event.pointerPosition.distanceToSquared(right) ? 'left' : 'right';
    const normal = event.face
      ? event.face.normal.clone().transformDirection(event.object.matrixWorld)
      : new Vector3(0, 1, 0);
    console.info(`[ray] ${hand} on ${event.object.name || target.name || event.object.type}${event.instanceId !== undefined ? ` #${event.instanceId}` : ''}`);
    // a made game's error stays its own: thrown inside the engine's pointer handling it could stop the input
    try {
      handler({ point: event.point.clone(), normal, object: event.object, instanceId: event.instanceId, hand });
    } catch (error) {
      console.error(`[ray] ${target.name || 'a thing'}: its press failed`, error);
    }
  };
  // three types its own events only; the engine dispatches pointer events on the same objects
  const events = target as unknown as {
    addEventListener(type: string, listener: (event: PointerHit) => void): void;
    removeEventListener(type: string, listener: (event: PointerHit) => void): void;
  };
  events.addEventListener('pointerdown', listener);
  return () => events.removeEventListener('pointerdown', listener);
}
