# Things held in the hand (host helper)

A tool, weapon or instrument goes into the player's hand through the host, never attached by hand:
`holdInHand(world, model, { side: 'right', aimed: true, onUse: (shot) => fire(shot) })` from `../hand.js`. It works
with a bare hand and a controller and goes away with the game. The model: the file the director's note names
(below), else a ready thing of `../style.js` (style.md: "In the hand", "On a haft"), else your own.

## How to build the model

The handle at the origin along **Y**; **+Y** out of the top of the fist (a blade, a hammer head, a racket, a flame);
**−Z** forward, away from the player (a barrel, a wand tip, a beam). Checked shapes:
- sword, hammer, torch, racket, paddle: straight up +Y, no tilt of your own; flat things (a racket face, a shield)
  face along **X**, the way the palm looks;
- pistol, wand: the handle down −Y, the barrel along −Z, `aimed: true`; its 'Muzzle' at the front;
- drumstick, mallet, pencil, baton: along +Y, `grip: 'stick'`;
- bow: limbs along ±Y, the arc bulging to −Z, the string on the +Z side, no `aimed`.

## Options (see HOST API for full signature)

`aimed: true` for pointed things (omit for swung ones); `sight: false` hides the laser sight; `onUse(shot)` fires on
the trigger or a finger curl — shoot from `shot.from` along `shot.direction` (or `muzzleOf(model, point, direction)`),
never from the model's origin, which is the handle.

## Hitting things with a held tool

A held tool collides with nothing by itself: `strikeWith(world, racketHead, [0.27, 0.33, 0.03])` — the part that
hits and its box in the part's own axes. A swing then sends a dynamic ball flying (faster swing, faster ball), knocks
a tower down, and plays whatever listens with `onFingerTouch` (drumsticks on drums). Never a `PhysicsBody` on the
held model. A tool for the creation already in the room (sticks for the drums) goes into that creation's file.

## Second hand (bow string, slingshot, pump)

Hold the tool with one hand; read the other in a system, only while it is at your tool's string or handle:
`this.input.xr.getSelectState('right')` (`start`, `active`, `end`), the hand at
`this.input.xr.isPrimary('hand', 'right') ? this.player.indexTipSpaces.right : this.player.gripSpaces.right`, taken
into the tool's own space with `tool.worldToLocal(...)` — the maths then holds however the tool is turned.

## Arrows, darts, knives that stick into the real room

Move the projectile yourself each frame (velocity, gravity 9.8, `lookAt` along the velocity). Each frame cast from
where the tip was along the step it just made: `roomHit(world, before, step, step.length())` from `../place.js`
(`step` = tip now minus tip before) — a hit on a wall, the floor, a table or the sofa: put the tip at `hit.point`
and stop it there.

## A downloaded model in the hand

Downloaded models have any axes, size and origin: never turn them by hand.

```ts
await AssetManager.loadGLTF('./models/polypizza/revolver.glb', 'revolver');
const revolver = fitToHand(AssetManager.getGLTF('revolver')!.scene, { aimed: true, length: 0.24 });
holdInHand(world, revolver, { side: 'right', aimed: true, onUse: shoot });
```

`length` is the real longest side in metres (pistol 0.22, dagger 0.35, sword 0.9); `heavyEnd: true` for a hammer, an
axe or a pickaxe (the hand holds the other end). The copy comes from `AssetManager.getGLTF(id)`, never `clone()`.
