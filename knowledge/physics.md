# Physics (IWSDK, Havok)

Add physics only when the request needs it: a thing must fall, roll, bounce, be thrown, be hit, stack or be knocked
down. A thing to look at stays in the air with no body (ergonomics.md). In a real room a falling thing drops behind
the real sofa and is lost.

A body is BOTH `PhysicsBody` (`state: PhysicsState.Dynamic | Static | Kinematic`) and `PhysicsShape` (`shape:
PhysicsShapeType.Sphere [r,0,0] | Box [w,h,d] | Cylinder [r,h,0] | ConvexHull | TriMesh`; `restitution`, `friction`,
`density`), the collider the size of the visible mesh. A `Cylinder` runs along the object's own Y: lay a barrel or a
wheel down by turning the object, never by swapping the numbers.

## What the engine will not tell you

1. **Root level only.** Every physics entity is `world.createTransformEntity(mesh)` with no parent: physics reads
   the local position, and a body under a moved parent collides somewhere else than it is drawn.
2. **Nothing thinner than 4 cm.** Smaller bodies do not stack: a tower of 2.4 × 1.5 × 7.2 cm bricks collapses in a
   second, the same tower three times larger stands.
3. **The real room is solid already** (room.md): never add colliders for the floor, walls or furniture. A Static
   body of your own only for a thing you built (a backboard, a ramp, a shelf).
4. **Kinematic** (a paddle, a platform, moved by your code): writing `object3D.position` does NOT move it. Each frame
   `addComponent(PhysicsManipulation, { linearVelocity: [vx || 1e-6, vy, vz] })` when it does not have one — an
   all-zero vector means "leave as is", so never send exact zeros. A tool in the hand is `strikeWith` (hand.md).
5. **`PhysicsManipulation` is one-shot**: `{ force: [x, y, z] }` an impulse, `{ linearVelocity }` a speed; it
   applies once and removes itself. An explosion: one on every body near the point, away from it, weaker with distance.
6. **Moving a body back**: `world.getSystem(PhysicsSystem)!.setBodyTransform(entity, { position, quaternion })`.
   Never write the position of a dynamic body, never remove and re-add its components.
7. **No collision callbacks**: Havok runs in a worker. Detect hits in `update()`: distance or bounds overlap (a ball
   through the rim), tilt (`up.set(0, 1, 0).applyQuaternion(pin.quaternion).y < 0.7` — a pin is down), or a sudden
   drop of speed (`entity.getVectorView(PhysicsBody, '_linearVelocity')`, with a short cooldown) for a bounce. Play
   `sfx()` once on the event, never every frame while it rests.

## A thing to throw: use the host helper

A ball, a snowball, a can: `throwable(world, mesh, { radius })` from `../throwable.js` (a real-looking ball:
`basketball(0.12)` from `../basketball.js`). It drops, bounces, lies where it stops; the player pinches it from
anywhere (the floor too), it flies into the fingers and off on a swing; a lost one comes back by itself. Write no
respawn code and add no grab component of your own — a second one breaks its grab. Score from its position, never
by moving it. A dart, a knife or an arrow that sticks is not a throwable: hand.md.

```ts
const ball = basketball(0.12);
ball.position.copy(inFrontOfPlayer(world, { distance: 0.7 }).point);
throwable(world, ball, { radius: 0.12 });
```
