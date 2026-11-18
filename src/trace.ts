import { createSystem, type Entity, Grabbed, Pressed, type World } from '@iwsdk/core';

/**
 * The player's actions in the headset's log, for every game the coder makes (16.11, Yury: «надо сразу делать
 * глобально»): what was pressed, grabbed and let go, by name — the coder writes nothing for it. With the lines of
 * the helpers (`[touch]` src/hand.ts onFingerTouch, `[ray]` src/ray.ts, `[hold]`/`[use]` holdInHand, `[move]`
 * src/gamehandle.ts) the log says whether a game answered the player. One line per action, never per frame.
 */
export function nameOf(entity: Entity): string {
  const object = entity.object3D;
  if (!object) return `entity ${entity.index}`;
  if (object.name) return object.name;
  for (let up = object.parent; up; up = up.parent) if (up.name && up.name !== 'Scene') return `${object.type} in ${up.name}`;
  return `${object.type} ${entity.index}`;
}

export function startTrace(world: World): void {
  world.registerSystem(
    class Trace extends createSystem({ pressed: { required: [Pressed] }, grabbed: { required: [Grabbed] } }) {
      init(): void {
        this.cleanupFuncs.push(
          this.queries.pressed.subscribe('qualify', (entity) => console.info(`[press] ${nameOf(entity)}`)),
          this.queries.grabbed.subscribe('qualify', (entity) => console.info(`[grab] ${nameOf(entity)}`)),
          this.queries.grabbed.subscribe('disqualify', (entity) => console.info(`[release] ${nameOf(entity)}`)),
        );
      }
    },
  );
}
