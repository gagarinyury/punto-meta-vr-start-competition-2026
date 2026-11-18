# The player's real room (IWSDK scene understanding)

The headset knows the room; you never create it, you query it. `XRPlane` — flat surfaces (floor, ceiling, walls,
table tops). `XRMesh` — furniture with `semanticLabel` (`table`, `couch`, `shelf`, `screen`, `lamp`, `plant`, `other`).
They exist only in XR and may come a moment after it starts: react through a query, never read them once at start.
Make the room take part: a creature sleeps on the `couch`, something crawls out of the `screen`, a firefly circles
the `lamp`.

The room is already solid: the host makes every plane and piece of furniture a static body (a ball bounces off the
walls, lands on the couch). Never add colliders for it. Hiding behind real things and shadows on the real room are
automatic for everything made with `world.createTransformEntity`: never add `DepthOccludable`, `ShadowCatcher` or
`ContactShadow` (the exception: a thing out of a portal, below); a mesh added after its entity was made sets
`castShadow = true` itself. Never use `XRAnchor`. The sky of portals or breakable walls lights the game's things too.

## Where the player wants it (host helper, '../place.js')

When the director's note names a place (a wall, a table, the floor), the host has chosen it already — the surface the
player looked at — and marked it:

```ts
const spot = await wantedPlace(world);   // point on the real surface, normal into the room, surface, facing
thing.quaternion.copy(spot.facing);      // turns its front (+Z) the right way
thing.position.copy(spot.point).addScaledVector(spot.normal, 0.04);   // 4 cm off it (+ half its depth on a wall)
```

On a table `spot.point` is the CENTRE of the top, `spot.facing` square with its edges, `spot.size = { width, depth }`
the whole top in metres: "as big as the table" builds to `spot.size` (a game world on it: `tabletop` with
`fill: true`). "Left", "higher", "closer" shift it along the surface as the player sees it
(`new Vector3(1, 0, 0).applyQuaternion(spot.facing)` is their right); a step without a number is a third of the
thing's size, at least 0.2 m.

No place named, "in front of me", a thing for the air: `inFrontOfPlayer(world, { distance: 1 })` — `point` before
the eyes (`below` 0.15 m by default), `facing` toward the player. A ray against the real walls, floor, tables and
furniture (a laser, a ricochet, a flashlight): `roomHit(world, from, direction)` →
`{ point, normal, surface, label? }`.

## A piece of furniture or a wall by yourself

For the rest — a creature on the `couch`, a firefly round the `lamp`, something on every wall — query
`{ required: [XRMesh], where: [eq(XRMesh, 'isBounded3D', true)] }` and `{ required: [XRPlane] }`, subscribe to
`'qualify'` with `true` (the ones already there too). Read furniture only with `readFurniture(entity)` from
`../furniture.js` (`{ label, centre, quaternion, size, top }`, undefined for the room-sized mesh) — never the raw
`XRMesh` sizes, they differ between the Quest and the emulator. A plane: skip it unless `isRoomSurface(plane)`; its
normal is `new Vector3(0, 1, 0).applyQuaternion(plane.quaternion)` — a wall when `|normal.y| < 0.3`. Take the one
nearest the player's head unless one is named; with nothing found after a second, `inFrontOfPlayer`.

## Portals in the walls, ceiling, floor (host helper)

Never build a portal or choose its spot yourself:

```ts
import { openPortals, type Portal } from '../outside.js';
let portals: Portal[] = [];   // empty until the room is known: check in update()
openPortals(world, [{ wall: 'front', color: 0x9040ff }, { wall: 'ceiling', sky: 'sunset' }], (opened) => (portals = opened));
```

`wall`: 'front' (the one the player faces), 'left', 'right', 'back', 'ceiling', 'floor'. `shape`: left out, each hole is a
different break of the wall (and a different size); `'round'` a neat portal; or one of `'crack'`, `'breach'`, `'burst'`,
`'corner'`. `sky`: a name, `{ ...SKY.sunset, sea: … }`,
or a `SkyRecipe`; without one it continues the previous request's sky. Each `Portal` has `centre`, `normal` (into
the room), `radius`, `color`. A thing coming out of it starts behind the wall, with `userData.occlude = false` set
BEFORE `createTransformEntity` (the host must not hide it behind its own wall), and gets `DepthOccludable` once it
is 0.15 m inside the room. Complete example: `samples/portals.ts`.

## Rules

- "On the wall", "on the table" means the real wall or table, never a made-up position.
- Anything on a real surface stands 4 cm off it along its normal: the real depth wobbles a centimetre or two.
- The play area is 0.4–1.2 m in front of the seated player. Never cover the whole view: the room stays visible.

## Breakable walls

`breakableRoom(world, sky, (ready) => (room = ready))` from `../breakroom.js` makes the real walls and ceiling
breakable anywhere, with one sky around the whole room — instead of `openPortals` when the room is smashed open by
shots, hits or creatures (never both in one game). A shot: `const hit = room?.hit(muzzle, direction)`, then
`room.breakAt(hit.point, 0.35)` (radius in metres; false if nothing broke). Pieces fly in and vanish by themselves;
the floor and the bottom 0.75 m of walls never break; holes grow and merge. Complete example: `samples/breakout.ts`.
