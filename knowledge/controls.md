# Controls: press, grab, sliders, dials, levers (IWSDK)

Bare hands, no controller: **press** = hand ray + pinch (or a click), **grab** = pinch and hold.

## Press an object

`RayInteractable` on the entity; react in a system to `subscribe('qualify')` of a query
`{ required: [RayInteractable, Pressed] }` (and `Hovered` to highlight). A button within arm's reach
(on the table, on a wall) also takes `PokeInteractable`: the index fingertip presses it, same `Pressed` tag.

## Played with the fingers: `onFingerTouch`

Keys, bars, drum heads, pads, a mole to whack — `onFingerTouch(world, key, onIn, onOut)` from `../hand.js`:
every fingertip of both hands on its own (chords, rolls), and held sticks' tips given to `strikeWith` (hand.md).
One call per key; the sound from `../music.js` (sound.md). Keep `RayInteractable` too if it should play from afar.

## Where exactly the ray hit, and which hand: `onRayPress`

When the game needs the spot (which block, which face, which cell) or the hand: `onRayPress(world, entity, (hit) =>
…)` from `../ray.js` — `hit.point`, `hit.normal`, `hit.hand`, `hit.instanceId`, `hit.object`. Never a `Raycaster`.
Many blocks are one `InstancedMesh` under one entity: after changing them set `instanceMatrix.needsUpdate = true` and
call `computeBoundingSphere()`, or rays miss the new ones. On a `tabletop` board convert points with
`board.root.object3D!.worldToLocal(v)`.

## Grab an object: which component

Exactly ONE grab component per entity (IWSDK keeps the first), always with `RayInteractable`.

| What | Use |
| --- | --- |
| a thing to look at and handle (note "thing") | `DistanceGrabbable` (`MoveFromTarget`) on its root: rides on the ray, both rays stretch it; parts to take — the same on each |
| a thing to throw | `throwable` (physics.md): it has its grab |
| a physics block, domino, crate | `DistanceGrabbable`, `MoveTowardsTarget` — flies into the fingers from anywhere |
| a control in reach: slider, dial, lever | `OneHandGrabbable` with limits (below); IWSDK disables its far ray-grab |

`returnToOrigin: true` springs it back. Held now: query `{ required: [Grabbed] }`.

## Carry a thing with the ray and stick it somewhere

"Take it with the ray and put it on the wall" (a picture, a magnet, a puzzle piece): no grab component.
`onRayPress` starts the hold (`held = hit.hand`); in `update()` move it to `surfaceHit(held)` from `../place.js`
(`point`, `facing`: lerp/slerp to them) and let go when `!this.input.xr.getSelectState(held).active`.
Hold by the select state, never by `Pressed`: `Pressed` drops the moment the thing lags behind the ray.

## Rules that keep rays working

- A `Line`, `LineSegments` or `Points` child catches rays a metre around it: give each `line.raycast = () => {};`.
- No invisible helper meshes on an interactable thing (hidden boxes "to be easier to hit"): they break hovering. A
  flat thing hard to hit is made 3–4 cm thick.
- The host draws the dot at the end of the ray. Never draw a cursor or reticle.
- What the player must point at hangs on a wall or in the air facing them, never flat on the floor (edge-on to a
  seated player's ray, hidden by the real sofa).
- While `Hovered`, make the thing ~10 % bigger.

## Slider, dial, lever

`OneHandGrabbable` limits are in the space of `mesh.position` / `mesh.rotation`:
- **Slider**: `{ rotate: false, translate: true, translateMin: [x0, y, z], translateMax: [x1, y, z] }` — only x free;
  read `(knob.position.x - x0) / (x1 - x0)`.
- **Dial**: `{ translate: false, rotate: true, rotateMin: [0, 0, -2.4], rotateMax: [0, 0, 2.4] }` — turned by the
  wrist, not the arm.
- **Lever** pulled with the arm: a small handle that is a slider, the visible arm turned from it
  (`arm.rotation.x = Math.atan2(handle.position.z - pivot.z, 0.25)`); spring back when not `Grabbed`.

Every control within 0.55 m of the seated player (ergonomics.md), or pressable by ray.
