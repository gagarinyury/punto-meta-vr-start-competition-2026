// Sound effects from the CC0 library (public/audio/kenney, tools/sounds.mjs).
// A sound is named by its group, e.g. 'impactPunch_heavy'; each play picks
// one of the group's variants, so repeats do not sound the same.
//
//   sfx(world, 'impactSoft_heavy', point);          // heard from the point
//   sfx(world, 'jingles_NES', undefined, 0.6);      // heard everywhere
//   playSound(world, './audio/kit/tick.ogg', point) // one file by its path
//
// Why not AudioUtils.createOneShot: it makes a new entity for every play and
// never removes it (IWSDK 1.1.0-rc.2 only says "this would be handled by the
// AudioSystem"). The engine has room for 1000 entities; past that every
// createTransformEntity throws "RangeError: offset is out of bounds" and
// nothing new appears in the scene (seen in the headset 11.11 and 12.11).
// Here one entity per sound file is kept and played again.
import {
  AudioSource,
  AudioUtils,
  type Entity,
  Object3D,
  PlaybackMode,
  type Vector3,
  type World,
} from '@iwsdk/core';

const BASE = './audio/kenney/';
const MAX_SOURCES = 200; // sound files kept ready at once; the oldest goes first
let index: Promise<Record<string, string[]>> | undefined;
let sources = new Map<string, Entity>(); // 'file|positional' -> its entity
let owner: World | undefined;

// A safety net (17.11): a game stuck in a loop — a puck pinned in a corner, hit again every frame — played one impact
// 30 times a second and the room drummed. One sound name plays at most once per MIN_GAP_MS (about 12 a second):
// real repeats (steps, a rally, a machine gun) are slower than that, a stuck loop is not. By the group for sfx()
// (its variants would slip past a check by file), by the file for playSound().
const MIN_GAP_MS = 80;
const lastPlayed = new Map<string, number>();
function tooSoon(key: string): boolean {
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -Infinity) < MIN_GAP_MS) return true;
  lastPlayed.set(key, now);
  return false;
}

function catalogue(): Promise<Record<string, string[]>> {
  index ??= fetch(`${BASE}index.json`).then((response) => response.json());
  return index;
}

/** Plays a sound file once, at a point in the room if given, otherwise everywhere. */
export function playSound(feature: World, src: string, at?: { x: number; y: number; z: number }, volume = 0.8): Entity {
  console.info(`[sound] file ${src.slice(src.lastIndexOf('/') + 1)}`);
  // Every feature gets its own wrapper of the world (src/live.ts). A sound belongs to the app,
  // so it is made in the real world: through a wrapper it became that feature's thing, and
  // Punto's and a game's sounds in turn emptied this map each time while the old entities
  // stayed, until the 1000-entity limit (audit 15.11).
  const world = ((feature as unknown as Record<symbol, World | undefined>)[Symbol.for('punto.rootWorld')] ??
    feature) as World;
  if (owner !== world) {
    owner = world;
    sources = new Map();
  }
  const key = `${src}|${at ? 1 : 0}`;
  let source = sources.get(key);
  if (!source?.active) {
    if (sources.size >= MAX_SOURCES) {
      const [oldest, entity] = sources.entries().next().value!;
      sources.delete(oldest);
      if (entity.active) entity.dispose();
    }
    // persistent: a sound belongs to the app, not to the level that is open
    source = world.createTransformEntity(new Object3D(), { persistent: true }).addComponent(AudioSource, {
      src,
      positional: !!at,
      playbackMode: PlaybackMode.Overlap, // the same sound may start again before it ends
      maxInstances: 4,
    });
    sources.set(key, source);
  }
  // A sound stands still between plays: its matrices are worked out when it is moved, not every frame. ~85 sources of
  // 6 objects each (the entity, the pool's group, 4 voices) were 17 % of the scene in the headset (15.11, CPU profile).
  // (Its pool is made once the file has loaded: caught by the next play.)
  const object = source.object3D!;
  if (at) object.position.set(at.x, at.y, at.z);
  object.updateMatrix(); // and the children follow (matrixWorldNeedsUpdate forces them)
  object.traverse((o) => (o.matrixAutoUpdate = false));
  if (tooSoon(`file:${src}`)) return source; // the same file again within MIN_GAP_MS: a stuck loop, not a new sound
  source.setValue(AudioSource, 'volume', volume);
  AudioUtils.play(source); // waits for the file if it is still loading
  return source;
}

// A safety net: generated games and old samples call createOneShot directly.
AudioUtils.createOneShot = (world, src, options = {}) =>
  playSound(world, src, options.positional ? options.position : undefined, options.volume ?? 1);

/** Plays one variant of a sound group, at a point in the room if given. */
export function sfx(world: World, group: string, at?: Vector3, volume = 0.8): void {
  if (tooSoon(`group:${group}`)) return; // the same group again within MIN_GAP_MS (see tooSoon)
  console.info(`[sound] sfx ${group}`); // for cutting the video: what sounded when (logs/quest.log)
  catalogue()
    .then((groups) => {
      // A group that is not there (18.11: 'impactSoft_light', 50 times in one game, all silent): the nearest of its
      // family — the same name before the '_' (impactSoft_medium) — rather than nothing.
      const family = group.split('_')[0];
      const files = groups[group] ?? groups[`${family}_medium`] ?? Object.entries(groups).find(([name]) => name.split('_')[0] === family)?.[1];
      if (!files) {
        console.warn(`[sfx] no sound "${group}"`);
        return;
      }
      playSound(world, BASE + files[Math.floor(Math.random() * files.length)], at, volume);
    })
    .catch((error) => console.warn('[sfx]', error));
}
