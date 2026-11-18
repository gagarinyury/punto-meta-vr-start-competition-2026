import { createSystem, type Vector3, type World } from '@iwsdk/core';
import { CacheStorage, SampleLoader, Versilian } from 'smplr';
import { context } from './speak.js';

/**
 * Real instruments for the coder's games (16.11): what the coder itself asked for in its review of music
 * (research/coder-self-review/2-music.md) — one thin host module instead of raw libraries, sampled sounds instead of
 * oscillators, one shared audio context, nothing left playing when the game is replaced.
 *
 * The sounds are the Versilian Community Sample Library (VCSL, CC0: real acoustic drums, mallets, pianos), played by
 * smplr (MIT), cached by the browser after the first load (Cache API). A note is heard from where it was played.
 *
 *   const drums = instrument(world, 'drums');
 *   onFingerTouch(world, snareSkin, (finger) => drums.play('snare', { velocity: velocityOf(finger), at: finger.point }));
 *
 *   const piano = instrument(world, 'piano');
 *   piano.play('C4', { velocity: 80 });  piano.play(['C4', 'E4', 'G4']);   // a chord
 *
 *   const clock = beatClock(world, 100, (step, time) => { if (step % 4 === 0) drums.play('kick', { time }); });
 */

export type InstrumentName =
  | 'piano'
  | 'upright piano'
  | 'xylophone'
  | 'marimba'
  | 'glockenspiel'
  | 'vibraphone'
  | 'tubular bells'
  | 'kalimba'
  | 'drums';

/** The parts of the drum kit: what `drums.play(...)` takes. */
export type DrumName = 'kick' | 'snare' | 'rim' | 'high tom' | 'low tom' | 'floor tom' | 'hihat' | 'open hihat' | 'crash' | 'ride';

export interface Instrument {
  /** A note ('C4', 60) or a chord (a list), or for the drums a part ('snare'). `velocity` 1..127 (how hard; 100 by
   *  default), `at` the point it is heard from (the key, the drum), `time` an audio time from beatClock, `duration`
   *  in seconds (a held note; without it the note rings out). */
  play(note: string | number | (string | number)[], options?: { velocity?: number; at?: Vector3; time?: number; duration?: number }): void;
  /** Silences every note. */
  stop(): void;
  /** Resolves once its sounds are loaded (it may be played before: the first notes may then be silent). */
  ready: Promise<void>;
}

const BASE = 'Idiophones/Struck Idiophones/';
const SOUNDS: Record<Exclude<InstrumentName, 'drums'>, string> = {
  piano: 'Chordophones/Zithers/Grand Piano, Steinway B',
  'upright piano': 'Chordophones/Zithers/Upright Piano, Yamaha',
  xylophone: BASE + 'Xylophone - Medium Mallets',
  marimba: BASE + 'Marimba',
  glockenspiel: BASE + 'Glockenspiel',
  vibraphone: BASE + 'Vibraphone - Hard Mallets',
  'tubular bells': BASE + 'Tubular Bells 1',
  kalimba: 'Idiophones/Plucked Idiophones/Kalimba, Kenya',
};
const DRUM = 'Membranophones/Struck Membranophones/';
// each part: the VCSL instrument and the note its hit sits on (read from their SFZ files, 16.11)
const KIT: Record<DrumName, [string, number]> = {
  kick: [DRUM + 'Bass Drum 1', 60],
  snare: [DRUM + 'Snare Drum, Modern 1', 60],
  rim: [DRUM + 'Snare Drum, Modern 1', 61],
  'high tom': [DRUM + 'Tom 1', 64],
  'low tom': [DRUM + 'Tom 1', 62],
  'floor tom': [DRUM + 'Tom 2', 60],
  hihat: [BASE + 'Hi-Hat Cymbal', 42],
  'open hihat': [BASE + 'Hi-Hat Cymbal', 46],
  crash: [BASE + 'Clash Cymbals 1', 60],
  ride: [BASE + 'Suspended Cymbal 1', 68],
};

type Smplr = ReturnType<typeof Versilian>;
const storage = CacheStorage();
// one loader for the whole app: its decoded sounds are shared by every instrument of every game, so a game made
// again (or a second piano) does not fetch and decode them again
let loader: ReturnType<typeof SampleLoader> | undefined;

function sampler(name: string, destination: AudioNode): Smplr {
  const ctx = context();
  loader ??= SampleLoader(ctx);
  const one = Versilian(ctx, { instrument: name, storage, loader, destination });
  void one.ready.then(
    () => console.info(`[music] ${name.slice(name.lastIndexOf('/') + 1)} ready`),
    (error: unknown) => console.warn(`[music] ${name} did not load`, error),
  );
  return one;
}

/** A finger's or a stick's speed as a velocity (1..127): a soft touch is quiet, a hard strike loud. */
export function velocityOf(finger: { speed: number }): number {
  return Math.round(Math.min(127, Math.max(25, 25 + finger.speed * 45)));
}

/**
 * A sampled instrument for this game; it falls silent when the game is replaced. Each instrument is heard from
 * where it is played (`at`), as a real one in the room.
 */
export function instrument(world: World, name: InstrumentName): Instrument {
  const ctx = context();
  const drums = name === 'drums';
  // its own place in the room: a panner the listener (the player's head) hears it through
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 0.6;
  panner.connect(ctx.destination);
  const files = drums ? [...new Set(Object.values(KIT).map(([file]) => file))] : [SOUNDS[name]];
  const samplers = new Map(files.map((file) => [file, sampler(file, panner)]));

  const one = (note: string | number, velocity: number, time: number | undefined, duration: number | undefined) => {
    let file = files[0];
    let key: string | number = note;
    if (drums) {
      const part = KIT[note as DrumName];
      if (!part) {
        console.warn(`[music] no drum "${note}": ${Object.keys(KIT).join(', ')}`);
        return;
      }
      [file, key] = part;
    }
    samplers.get(file)!.start({ note: key, velocity, time, duration });
  };

  let gone = false; // its game was replaced: a late touch plays nothing (16.11: smplr threw on a disposed instrument)
  const result: Instrument = {
    play(note, { velocity = 100, at, time, duration } = {}) {
      if (gone) return;
      console.info(`[sound] ${name.slice(name.lastIndexOf('/') + 1)} ${Array.isArray(note) ? note.join('+') : note}`);
      if (ctx.state !== 'running') void ctx.resume();
      if (at) {
        panner.positionX.value = at.x;
        panner.positionY.value = at.y;
        panner.positionZ.value = at.z;
      }
      for (const n of Array.isArray(note) ? note : [note]) one(n, velocity, time, duration);
    },
    stop() {
      if (!gone) for (const one of samplers.values()) one.stop();
    },
    ready: Promise.all([...samplers.values()].map((one) => one.ready)).then(() => undefined),
  };

  // gone with the game: through the feature's world this system goes when the game is replaced
  world.registerSystem(
    class MusicOwner extends createSystem({}) {
      init(): void {
        this.cleanupFuncs.push(() => {
          gone = true;
          for (const one of samplers.values()) one.dispose();
          panner.disconnect();
        });
      }
    },
  );
  return result;
}

/**
 * A steady beat for rhythm games: `onStep(step, time)` for every step (`division` steps a beat: 4 = sixteenths), a
 * little ahead of time — play with `{ time }` and the notes land exactly on the beat, however the frames go. Stops
 * when the game is replaced. `bpm` can be changed while it runs.
 */
export function beatClock(
  world: World,
  bpm: number,
  onStep: (step: number, time: number) => void,
  division: 1 | 2 | 4 | 8 = 4,
): { bpm: number; stop(): void; readonly step: number } {
  const ctx = context();
  let next = ctx.currentTime + 0.1;
  let step = 0;
  const clock = {
    bpm,
    stop: () => clearInterval(timer),
    get step() {
      return step;
    },
  };
  const AHEAD = 0.12; // s scheduled ahead, every 25 ms
  const timer = setInterval(() => {
    while (next < ctx.currentTime + AHEAD) {
      onStep(step++, next);
      next += 60 / clock.bpm / division;
    }
  }, 25);
  world.registerSystem(
    class BeatOwner extends createSystem({}) {
      init(): void {
        this.cleanupFuncs.push(() => clearInterval(timer));
      }
    },
  );
  return clock;
}
