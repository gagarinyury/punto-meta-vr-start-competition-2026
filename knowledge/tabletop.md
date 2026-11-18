# A small world on the real table ('../tabletop.js')

For anything miniature — strategy, tanks, a diorama, a board game, a maze, air
hockey — ask the host for a board instead of placing things in the room:

```ts
import { type Board, tabletop } from '../tabletop.js';

let board: Board | undefined;
tabletop(world, { width: 12, depth: 8 }, (ready) => {   // the world's size in YOUR units
  board = ready;
  const ground = new Mesh(new BoxGeometry(12, 0.05, 8), grass);
  ground.position.y = 0.025;                             // its BOTTOM on y = 0: nothing below the board
  world.createTransformEntity(ground, board.root);       // parent = board.root
});
```

- On a real table (`board.onTable`) the table IS the ground: houses, trees, pieces stand straight on y = 0 — no slab or
  ground covering the table, unless the phrase asks for one (a green field, a sea). Off a table, a thin ground is fine.
- y = 0 of the board is the table top: nothing goes below it (a ground box centred on 0 sinks half into the real
  table and flickers against it, 18.11) — every base, ground and floor has its bottom on 0.
- Build everything in game units (a tank 1 unit long), never metres; every thing
  is created with `world.createTransformEntity(thing, board.root)`.
- Inside the board the centre of the play area is (0, 0, 0), +x is to the player's right, +y up, +z towards the
  player. Move things by code in a system; no physics bodies inside a board.
- Real objects on the table (a cup, a book) stay visible through the board.
- The table is the one the player looked at when they asked; the host lights
  its edges up as the board comes (`board.onTable` is false if no table was found and it fell back to the floor). Never assume a fixed size.
- `onRayPress` `hit.point` and `onFingerTouch` `finger.point` are in world metres: convert to board units with `board.root.object3D!.worldToLocal(v)`.

## The whole table: `fill: true`

"A board as big as the table", "on the whole table", "a field to build a
village on", or anything that should cover the table edge to edge: ask with
`fill: true`. The board then covers the whole real top (2 cm in from each
edge), and `board.width` × `board.depth` come back in YOUR units with the
table's own proportions — one side longer than you asked. Lay the world out
from those two numbers, never from the ones you asked for:

```ts
tabletop(world, { width: 10, depth: 10, fill: true }, (ready) => {
  board = ready;
  const { width, depth } = ready;           // e.g. 10 x 18.3 on a long narrow table
  const ground = new Mesh(new BoxGeometry(width, 0.1, depth), grass);
  world.createTransformEntity(ground, ready.root);
  // houses along the long side, a path down the middle: positions as fractions of width/depth
  for (let i = 0; i < 6; i++) {
    const house = makeHouse();
    house.position.set((i / 5 - 0.5) * width * 0.8, 0.05, -depth * 0.25);
    world.createTransformEntity(house, ready.root);
  }
});
```

`board.metres` is the real top in metres (x across, z towards the player), if
you need it; `board.unit` is metres per unit.
