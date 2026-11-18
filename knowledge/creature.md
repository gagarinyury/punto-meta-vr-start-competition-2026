# A creature that lives in the real room ('../creature.js')

For a pet, a zombie, a bug, a ghost, a robot — anything that walks the floor —
build the body and give it to the host; never move it by hand:

```ts
import { type Walker, walkInRoom } from '../creature.js';

const pet = new Group();            // feet at y = 0, face towards +z, sizes in metres
// ... add meshes ...
let walker: Walker | undefined;
walkInRoom(world, pet, { speed: 0.8 }, (ready) => (walker = ready)); // speed in m/s

// in update(): decide what it wants only when it is idle
if (walker?.idle) walker.wander();  // or goTo(point), comeToPlayer(), hide(), jumpOn('couch')
```

The host creates the entity, finds the real floor and furniture, and moves,
turns and hops the body; `walker.entity.object3D!.position` is where it is now
(for hits, petting, feeding). One `walkInRoom` call per creature; several
creatures are fine.
