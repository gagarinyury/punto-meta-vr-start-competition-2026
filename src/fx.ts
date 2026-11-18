// One door to every ready effect: `import { play, smoke, impact, shots } from '../fx.js'`.
// Since 19.11 the set is the new one — the life of a thing (src/life.ts), events (src/event.ts), shots
// (src/shots.ts) and wonders (src/wonder.ts): faceted, opaque, built for the headset. A game need not know which
// file holds which.
import { Box3, type Object3D, Vector3 } from '@iwsdk/core';
import { dust as dustOf, poof as poofOf, shatter as shatterOf } from './event.js';
import type { Fx } from './fx/core.js';
import { fire as fireOf, ready, trail as trailOf } from './life.js';
import { pyroBoom } from './pyro.js';
import { lightning as lightningOf } from './wonder.js';

export { type Fx, play } from './fx/core.js';
// the life of a thing: endless, on the thing
export { light, smoke, spray } from './life.js';
export type { FlamePalette } from './life.js';
// events: one-shot
export { confetti, impact } from './event.js';
// shots
export { laser, shots } from './shots.js';
export type { Laser, ShotKind, Shots, ShotsOptions, ShotTarget } from './shots.js';
// wonders
export { bubbles, fireworks, sparkle, weather } from './wonder.js';
// every effect's shaders compiled ahead (the game does it once at its start)
export { warmEffects } from './warm.js';
// markers and whole floors
export { outlineGlow, targetRing } from './fx/feedback.js';
export { lava, water } from './fx/nature.js';
export { coverFloor } from './fx/floor.js';

type Thing = Object3D | { object3D?: Object3D | null };
const objectOf = (thing: Thing | undefined): Object3D | undefined => (!thing ? undefined : (thing as Object3D).isObject3D ? (thing as Object3D) : ((thing as { object3D?: Object3D | null }).object3D ?? undefined));
const box = new Box3(), span = new Vector3();

/**
 * How big a thing is, metres — the longest side of its box. The `size` most effects ask for is the size of the thing
 * they happen to: `play(world, poof({ size: sizeOf(thing) }), thing)`.
 */
export function sizeOf(thing: Object3D | { object3D?: Object3D | null }): number {
  const object = objectOf(thing);
  if (!object) return 0.3;
  box.setFromObject(object).getSize(span);
  return Math.max(span.x, span.y, span.z) || 0.3;
}

/**
 * One-shot explosion at `spot` (`size` = thing width, m). Heaviest effect: one at a time.
 *
 * About a second: a fluffy fireball that grows, turns to smoke and is eaten away, rings running out along the ground,
 * sparks, light on the surface. Put it at the foot of what blows up: `play(world, explosion({ size: 0.4 }), spot)`.
 */
export function explosion(o: { size?: number; seed?: number } = {}): Fx {
  return ready(pyroBoom({ size: o.size ?? 0.36, seed: o.seed }));
}

/**
 * One-shot dust ring at a thing's foot (`size` = thing width, m; `color` = ground tone).
 *
 * A low ring of faceted puffs rolls out along the surface round its foot and is eaten away.
 * Put it at the foot: `play(world, dust({ size: 0.3 }), spot)`.
 */
export function dust(o: { size?: number; color?: number; seed?: number } = {}): Fx {
  return dustOf(o);
}

/**
 * One-shot shatter: breaks `of` into coloured pieces (play with no target, then dispose `of`), or use `size` + `colors` at `spot`. `count` pieces (16).
 *
 * Pass the thing itself as `of`: the pieces take ITS colours and start where its parts are — a red car breaks into red
 * and dark lumps — fly out, bounce on the surface it stood on, lie a moment and shrink away. Play it with NO target and
 * remove the thing: `play(world, shatter({ of: thing })); thing.removeFromParent()` (an entity: `entity.dispose()`).
 */
export function shatter(o: { of?: Object3D | { object3D?: Object3D | null }; size?: number; colors?: number[]; color?: number; count?: number; seed?: number } = {}): Fx {
  return shatterOf({ of: objectOf(o.of), size: o.size, colors: o.colors ?? (o.color !== undefined ? [o.color] : undefined), count: o.count === undefined ? undefined : Math.min(40, o.count), seed: o.seed });
}

/**
 * One-shot poof when something appears or vanishes (`size` = thing width, m; `color` puffs; `stars: false` for none).
 *
 * A handful of white faceted puffs burst out of its middle and are eaten away, a few small stars twinkle.
 * Put it at the thing's foot: `play(world, poof({ size: 0.3 }), spot)`.
 */
export function poof(o: { size?: number; color?: number; stars?: boolean; seed?: number } = {}): Fx {
  return poofOf(o);
}

/**
 * Endless flame along +Y (`size` = burner width, m; `palette`: 'fire'|'plasma'|'magic'|'acid'|'ice'; `above` surface height, m; `glow: false` no light).
 *
 * One fat flame with tongues breaking off, embers, and its light: a halo and a pool on the surface under it.
 * Put it at the foot of the flame: `play(world, fire({ size: 0.2 }), campfire)`. `size` = how wide the thing that burns is
 * (the flame is ¾ of it across and 1½ of it tall); `'plasma'` suits a gas burner or engine.
 */
export function fire(o: { size?: number; palette?: 'fire' | 'plasma' | 'magic' | 'acid' | 'ice'; above?: number; glow?: boolean; seed?: number } = {}): Fx {
  return fireOf(o);
}

/**
 * Endless tapering trail behind a moving target: `play(world, trail({ size, color, length }), target)`. `size` = target width, m; `length` seconds (0.3).
 *
 * A ribbon back along its way, tapering to a point; the faster the thing, the longer; at rest it is gone.
 */
export function trail(o: { size?: number; color?: number; length?: number } = {}): Fx & { follow(point: Vector3): void } {
  return trailOf(o);
}

/**
 * One-shot lightning bolt (`size` = length, m; `color` rim; `mark` scorch seconds, 6). Default strikes `spot` from `size` above; or `to` local / `from`+`to` world.
 *
 * A jagged white ribbon with a branch, a flash of light where it lands and the sparks and scorch of a hit there.
 */
export function lightning(o: { from?: Vector3; to?: Vector3; size?: number; color?: number; mark?: number; seed?: number } = {}): Fx {
  return lightningOf(o);
}
