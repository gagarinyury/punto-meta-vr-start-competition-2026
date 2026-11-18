# A downloaded model on the floor, a table or in the air (host helper)

Downloaded models have any size and origin. Never scale or offset them by hand;
load, take a copy, and let the host fit it to its real size:

```ts
import { fitModel } from '../models.js';

await AssetManager.loadGLTF('./models/polypizza/chest.glb', 'chest');
const chest = fitModel(AssetManager.getGLTF('chest')!.scene, { length: 0.6 });
const entity = world.createTransformEntity(chest);
entity.object3D!.position.copy(tableTop).y += 0.04; // the bottom of the model stands 4 cm over the real top
```

- `length` is the real length of the longest side in metres: mushroom 0.3,
  cat 0.45, chest 0.6, chair 0.9, robot or person 1.2–1.8, car 4, tree 2.5.
- The returned group's origin is the centre of the model's bottom: put it on a
  surface point and it stands there; rotate `rotation.y` to turn it in place.
- The front of a model is its +Z side (the glTF rule; most Poly Pizza models
  follow it). To make a model face a point (the player, a target):
  `model.rotation.y = Math.atan2(target.x - model.position.x, target.z - model.position.z)`.
  A few authors model along X instead; such a model will look sideways.
- Never use `gltf.scene.clone()` or the object `loadGLTF` returns: rigged models turn
  invisible, and a reused scene is destroyed with the game. `AssetManager.getGLTF(id)`
  gives a fresh, correct copy every time.

## A model is material, not the whole answer

A found model may be only a piece of what was asked. Look at its title and
parts and build in code what is missing, so the whole thing is recognisable and
works: a hoop that is only a ring and a net needs a backboard behind it (and a
Static collider for it); a gun needs its beam; a tree alone is not a forest.

## A model made of several things (the note lists its `parts`)

Some files hold several separate things: a hoop with its ball, five trees, eight
corals. The director's note then lists `parts`. Do not put such a model down as
one lump, and do not build yourself what a part already is. Take each part you
need out first, then fit what is left:

```ts
import { fitModel, takePart } from '../models.js';

const scene = AssetManager.getGLTF('hoop')!.scene;
const ball = fitModel(takePart(scene, 'Sphere'), { length: 0.24 }); // the model's own ball becomes the game ball
const hoop = fitModel(scene, { length: 0.6 });                      // the rest: ring and net
```

- A part you do not need: `takePart(scene, 'Sphere')` and simply do not add it.
- A set of alike things (trees, corals): take every part and place each one on
  its own spot; one `getGLTF` copy gives each part once — for more copies call
  `AssetManager.getGLTF(id)` again.

## An animated model (walk, run, idle…)

Animated characters come with named clips. Use the same `getGLTF` copy for
`fitModel` and `animateModel`:

```ts
import { animateModel, fitModel } from '../models.js';

const gltf = AssetManager.getGLTF('cat')!;
const cat = world.createTransformEntity(fitModel(gltf.scene, { length: 0.45 }));
const anim = animateModel(world, gltf);
anim.play('walk');  // while it moves; anim.play('idle') when it stops
```

- `anim.clips` lists the clip names; a wrong name prints them to the console.
- The clip moves the legs, not the model: move `position` yourself while it walks.
- For things held in the hand use `fitToHand` (see hand.md).
