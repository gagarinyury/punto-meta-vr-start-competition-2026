# Two looks: true to life, or Punto's toys

First decide which one the request asks for:
- **True to life** — science and real things shown as they are: a molecule (dopamine, DNA, water), the solar system,
  planets and the Sun, an atom, an engine or a machine taken apart, anatomy (a heart, a skeleton), a globe, a crystal,
  a real animal or plant to study. Build it accurately — real shapes, proportions and colours (the CPK colours of
  atoms, the planets' real colours and sizes in proportion), smooth spheres and cylinders with enough segments
  (`SphereGeometry(r, 24, 16)`), `MeshStandardMaterial`, a little gloss where the real thing shines. Real planets and
  the Sun: `planet('earth')` of `../planets.js` (their real maps). Set `root.userData.keepLook = true` on the root
  group before `createTransformEntity`: the host then leaves the whole thing as you built it. None of the toy rules
  below apply to it, and none of the ready toys (`planet()`, `sun()`, `rocket()` of `../style.js`) go into it.
- **Punto's toys** — games, fairy tales, toys, little worlds, characters, anything playful: the rest of this file.

## Punto's toys: `../style.js`

Everything playful Punto makes looks like his world: hand-painted low-poly toys —
every facet its own colour, a touch lighter or darker, slightly crooked
hand-cut forms, soft saturated colours from `PALETTE`.
Build your shapes with Three.js as usual, then make each one a toy piece with
`toy(geometry, color)` instead of `new Mesh(geometry, new MeshStandardMaterial(...))`.

The host also brings every plain material into this look as the thing enters the room (flat-shaded, matte,
deeper colours); your recolours still show, and glowing, see-through, textured pieces and anything with
`object.userData.keepLook = true` are left alone. That is a safety net: the forms are yours — chunky, from the ready
things and `toy()` pieces below.

```ts
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry } from '@iwsdk/core';
import { blob, island, merge, PALETTE, pineTree, rock, roundTree, topSide, toy, toyLook } from '../style.js';

const hill = toy(new ConeGeometry(0.3, 0.2, 7), topSide(PALETTE.grass, PALETTE.dirt), { rough: 0.015 });
const roof = toy(new ConeGeometry(0.12, 0.1, 4), PALETTE.red);
const bush = toy(blob(0.06, 3), topSide(PALETTE.grassLight, PALETTE.leaf));   // a faceted lump
const head = toy(new IcosahedronGeometry(0.08, 1), PALETTE.orange, { rough: 0.006 });
const pipe = toy(new CylinderGeometry(0.02, 0.02, 0.3, 6), topSide(0xd9dde4, PALETTE.rock));   // metal: matte grey
```

- `toy(geo, color, finish)`: pass `lit(c)` for most pieces, `topSide(top, side, bottom)` by face direction, `bands(...)` for waving stripes, `byHeight(...)` for altitude stops, or `evenFaces(c)` with `{ vary: 0 }` on flat cubes/cards/tiles so big faces show no diagonal fold. Add `shade: 0.2–0.35` on round shapes (heads, planets, foliage) and `rough` (~3–8% of size) for hand-cut corners.
- Keep segments low: 6–10 round a cylinder, `IcosahedronGeometry(r, 1)` for balls, `blob()` for organic lumps, `ring()` for 18-sided flat rings. Strong saturated colours from `PALETTE` (not pastel).
- Geometry builders (full signatures in HOST API): a box is `new BoxGeometry(w, h, d)` with sharp edges (a cube, a crate, a brick, a wall); `block()` / `chamferedBox()` cut all 12 edges — when the player asks for it, or when a soft edge suits the thing (a wooden crate, a toy block, a die, a chunky toy part) and spoils nothing: what must stand edge to edge or stack flush (a wall of cubes, bricks, tiles, a grid) and a plain cube the player asked for stay sharp, `turned()`, `slab()` (tiny bevel `0.005` when carrying decals; rounding <= 1/3 thinnest side; make fins/wings >= 1/5 of width thick, never paper-thin), `hull()` (angular sci-fi/vehicle hulls; sci-fi reads from flat facets + accent blocks + dark glass, not round tubes), `leaf()`, `ribbon()`, `exhaust()`.
- Raised decals/pips on a face stand >= 0.3 mm proud; layered decals sit higher than the layer below so they do not z-fight.
- Forward **−Z** layout: build upright with `turned` and lay with `forward(geo)`; draw a wing (x across, y forward) and lay with `flat(slab(...))`; draw a tail fin (x back, y up) and stand with `upright(slab(...))`; mirror the left wing with `mirrored(rightContour)`.
- Lumpy / cratered bodies: call `lumps()` BEFORE `craters().press()`; for rims on a lumpy body pass `rims(radius, body)` with `{ rim: 0.5 }`.
- Ready core pieces (y = 0, one mesh): `roundTree(h)`, `pineTree(h)`, `rock(size)`, `cloud(size)`, `island(radius)` (grass top y = 0), plus shared parts `eyes()`, `wheel()`, `ground()`.
- `merge(group)` combines static toy pieces into ONE draw call — leave moving parts (wheels, doors, arms) separate. `toyLook(group)` converts plain meshes in place, though `toy()` from the start looks better.
- Only small truly emissive parts glow (`glowMat`, `edgeGlow` for cyan hologram edges).
- **Never do** (breaks the look): shiny metal (`metalness > 0.3` becomes a pixel mirror — use matte grey/gold/dark-blue facets), smooth gradients (use bands/steps), transparent glowing tails/flames/auras (make them solid faceted pieces), fine grids/bolt rows/voxels, smooth many-segment spheres, or blank backs (dress all sides: windows/panels/signs on both faces).

## Ready things in Punto's look (all from `../style.js`)

Before building a thing from scratch, look here: ready things, real size,
every one with options (`size` in metres, colours, `seed`) and named moving
parts (`thing.getObjectByName('Rotor')`). Static parts are already one
mesh. Build anything else in the same look with `toy()` and the parts below,
and place several of them to make a scene.

**People.** Every person — a crew, an enemy, a crowd, a zombie, a knight — is a
ready figure from `../figures.js` (knowledge/figures.md): `figure('pirate')`.

**Space.** `planet({ radius, colors, craters, rings })`, `ringedPlanet()`,
`moon()`, `asteroid()`, `sun()`, `comet()`, `blackHole()` (floating ones
centred; spin a planet by its 'Body'), `rocket()` (stands on its fins, 'Flame'
below), `spaceStation()`, `satellite()` ('Panels', 'Dish').
**Spaceships** (centred, nose to −Z, `size` = length; 'Hull' one mesh,
'Engines' glow — flicker them for thrust; `muzzlesOf(ship)` gives where shots
leave): `fighter()`, `scout()`, `cruiser()`, `mothership()`,
`alienSaucer()`, `cargoHauler()`, `drone()` ('Rotors': spin each child round
Y), `battleship()` — each `{ size, color, accent, seed }`; a fleet of twenty fits the frame budget.

**Nature** (real sizes, on y = 0): `oakTree(height)`, `palmTree(height)`,
`flowers(size)` (one daisy head: `blossom(radius, colour, middle)`),
`mushrooms(size)` (one: `mushroom(height, cap, colour, { dots, shape })`),
`mountain(height, { snow })`, `waterfall(height)` ('Water' its own mesh),
`volcano(height)` ('Lava' glows, 'Smoke' drifts), `cave(size)` (mouth to +Z),
`campfire(size)` ('Fire' flickers, 'Sparks'), `pond(size)` ('Water' with
its lily pads). Paints for your own: `leaves()`, `stone(height)`, `cliff()`.

**In the hand** (built in the hand's axes for `holdInHand`: handle at the
origin, +Y out of the fist, −Z forward; 'Muzzle' where a shot leaves):
`wand()` ('Tip' glows) — aimed (a gun or a blaster: build it with `toy()` in these axes, its 'Muzzle' at the front);
`flashlight({ reach })` — aimed, toggle 'Beam'; `sword()` ('Blade'),
`hammer()` ('Head') — swung, give the part to `strikeWith`; `shield()` (left
hand, 'Face'); `bow()` (left hand, 'String', 'Arrow'), `slingshot()`
('Pouch', 'Stone'); `fishingRod()` ('Reel', 'Line', 'Bobber').

**Targets and sports** (real sizes; every piece that is hit or knocked over is
its own mesh — physics on it, never on the group): `bullseyeTarget()` +
`bullseyeRing(target, point)` (0 the bullseye), `canPyramid({ rows })`
(`userData.cans`) / one `can()`, `dartboard()` + `dartScore(board, point)`, one
`dart()`, `basketballHoop({ height })` ('Rim', `userData.rim`),
`bowlingPins()` (`userData.pins`) / one `bowlingPin()`, `soccerGoal()`
(`userData.mouth`) + `soccerBall()`, `pingPongTable()` + `paddle()` (held:
'Blade' for strikeWith) + `smallBall()`, `golfHole()` (`userData.hole`),
`punchingBag()` (hangs from the origin; 'Bag') + `boxingGlove()`,
`trophy()`.

**Vehicles** (table toys, wheels on y = 0, nose to −Z, `size` = length): `car()`,
`truck()`, `bus()`, `airplane()` ('Propeller'
×3), `helicopter()` ('Rotor', 'TailRotor'), `boat()` (waterline y = 0,
'Motor'), `submarine()` ('Periscope', 'Screw'), `tank()` ('Turret', 'Barrel',
'Muzzle'), `motorcycle()` ('Handlebar'); `{ size, color }`. While it moves:
`rollWheels(vehicle, metres)`. A wheel of your own: `wheel(r, w)` (a tyre) or
`spokedWheel(r, w)` (a cart, a train, a bicycle).

**Buildings** (tabletop dioramas, door to +Z, each on its own grass tile —
`{ ground: false }` to share one `ground(w, d)`; `size` = tile width):
`house()` ('Door'), `castle()` ('Gate'), `tower()` ('Door'), `lighthouse()`
('Light'), `windmill()` ('Sails'), `bridge()` ('Water'), `tent()` ('Fire'),
`marketStall()`, `temple()`, `portalGate()` ('Portal' spins). Parts for any
other building: `gableRoof(w, d, h)` (tiled), `tieredRoof(r, h)` (a cone),
`pyramidRoof(w, h)`, `battlements(length, thickness, size)`.

**On a haft** (in the hand's axes: the grip at the origin, the haft up +Y, the
head at the top; a blade's edge or a point forwards −Z, flat sides along X;
'Handle' to grab, 'Head' for strikeWith, 'Edge' / 'Tip' at the hit point):
`axe()`, `pickaxe()`, `shovel()` (held by its D-grip), `rake()`, `broom()`,
`spear()`, `trident()`, `mace()`, `scythe()`, `torch()` ('Fire'; `{ lit: false }`).
Each takes `{ size, theme }`: `theme` 'classic' as drawn, 'toy', 'iron',
'gold' or 'crystal' (HAFT_THEMES) — the same axe five ways. A haft for a
thing of your own (a halberd, a flag pole, a staff, a hoe): `haft(bottom,
top, r0, r1, { bow, knob })` (geometries for `toy`) and `band(y, r, h)` for a
binding or a grip wrap; put your head on top the same way.

**Toys and table games** (real table sizes, each piece a player picks up its
own mesh — physics or grab on it): `chessSet()` (pieces named 'white knight
g1'; move one to `chessSquare('f3')`), `chessPiece(kind, side)`,
`chessBoard()`; `dice(count)` / `die()` (centre at the origin; read a throw
with `dieValue(die)`, lay a value up with `dieRotation(n)`);
`playingCard(suit, rank)` (1 ace … 13 king, face +Z, red back) + `cardFan(cards)`;
`blockTower()` (pull 'Block 3.1' out); `brickPile()` / `brick(w, d)` + `brickSnap(position, w, d)`
(stack at `brickHeight()`); `jigsaw({ cols, rows })` (each piece's solved place in
`userData.home`); `dominoChain()` (tip the first) / `domino(a, b)`;
`spinningTop()` (spins on its tip at the origin); `puzzleCube()` +
`turnLayer(cube, axis, layer, dir)` / `cubeLayer()` to animate a turn;
`treasureChest({ open })` ('Lid' hinged: `lid.rotation.x = −1.2` opens it,
'Treasure' inside). Things that roll or tumble (a die, a cube) are one even
colour all round — a lighter top would end up underneath.
