# Ready visual effects ('../fx.js')

Every effect comes from the one module `'../fx.js'`: a function makes it, `play` shows it. The HOST API says what
each looks like and takes; here is how to choose and place them.

```ts
import { play, sizeOf, smoke, fire, impact, poof } from '../fx.js';

play(world, smoke({ size: 0.06 }), chimneyTop);              // on a thing (an Entity or Object3D): it moves with it
play(world, poof({ size: sizeOf(thing) }), spot);            // at a world point; a one-shot removes itself
play(world, impact({ size: 0.3 }), hitPoint, hitNormal);     // on a real wall, table or ceiling: pass its normal
const flame = play(world, fire({ size: 0.2 }), campfire);    // an endless effect stays until…
flame.stop();                                                // …you stop it
```

`size` is always the size of the THING the effect happens to, in metres — the chimney's mouth, the campfire, the
thing that vanishes (`sizeOf(thing)` measures one). The effect fits itself to it: never guess a big number.
An effect's local `+Y` points out of the surface it is on.

## Endless effects (played on a thing; stop with `handle.stop()`)

- `smoke` (chimney, funnel, exhaust), `fire` (campfire, torch; `palette: 'plasma'` engine jet), `light` (lamp, lit window), `spray` (fountain, hose; `burst: true` for a one-shot splash), `bubbles`, `sparkle`, `weather` (`'rain' | 'storm' | 'snow'` over a table), `trail` (behind a ball/projectile).

## One-shot effects

- `impact` (hit on surface — pass `normal`), `shatter({ of: thing })` (play with NO target and dispose `thing`), `explosion` (heaviest: one at a time), `dust`, `poof`, `lightning`, `confetti` / `fireworks` (win).

## Shooting (`shots`, `laser`)

One `shots` for all guns of a kind; it hits `targets` (`onHit`) and room surfaces (`onRoom`):

```ts
import { play, shatter, shots } from '../fx.js';

const gun = shots({ kind: 'bolt', color: 0x5ad8ff, targets: () => enemies, onHit: (enemy) => kill(enemy) });
play(world, gun);                                             // once, with no target
holdInHand(world, blaster, { aimed: true, onUse: (shot) => gun.fire(shot.from, shot.direction) });
```

`size: 1` for a room gun; ~quarter of ship length on a table. `laser`: `ray.aim(from, to)`, `ray.on`.

## Markers and whole floors

- A goal or a drop spot: `targetRing` (`zone.pulse()` on a score). A thing to notice: `outlineGlow`.
- The whole real floor as lava or water, real sofas and tables left dry as islands:

```ts
import { coverFloor, lava, water } from '../fx.js';

coverFloor(world, (width, depth) => lava({ width, depth }));
coverFloor(world, (width, depth) => water({ width, depth }), (pond) => pond.drop(0, 0));
```

One clear effect where something happened is enough — not an effect on every frame or every touch.
