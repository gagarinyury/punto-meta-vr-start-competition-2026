// Playable instruments for the coder's games (Yury, 16.11): ready models of real size (src/instruments/*) and the
// pieces they are made of, and playInstrument — every key, bar, tine, pad or drum head sounds under a finger or a
// held stick, through the host's sampled instruments (src/music.ts), and sinks and lights up while touched.
//
//   const drums = drumKit();
//   world.createTransformEntity(drums.object);  drums.object.position.set(0, 0, -1);
//   playInstrument(world, drums);
//
// Something new from the pieces: a mesh made playable(mesh, 'C4', 'marimba', parts) is played like any other.
import { createSystem, type Material, type Mesh, MeshStandardMaterial, type World } from '@iwsdk/core';
import { onFingerTouch } from './hand.js';
import { type Instrument, instrument, velocityOf } from './music.js';
import type { Built, Part, Sound } from './instruments/kit.js';

export { synth, pads, keyboard, KEY } from './instruments/keyboards.js';
export { xylophone, marimba, glockenspiel, vibraphone, tubularBells, kalimba } from './instruments/mallets.js';
export { drumKit } from './instruments/drums.js';
export { block, rod, v, lathe, paint, vary, knob, mallet, cymbal, tripod, playable, layBars, notes, noteName, midiOf, isSharp } from './instruments/kit.js';
export type { Built, Part, Sound, BarLayout, BarPlace } from './instruments/kit.js';

/** A touched part: how far it is still pressed (1 → 0), where it rests, its own lit material. */
interface Press {
  mesh: Mesh;
  restY: number;
  t: number;
  held: number;
  lit: MeshStandardMaterial;
  base: Material;
}

/**
 * Makes every part of an instrument play: a fingertip (or a stick given to strikeWith) touching a part plays its
 * note, as loud as the touch was fast, heard from the part; the part sinks a few millimetres and glows while
 * touched. Load the sounds now (the first second may be silent). Everything stops with the game. Returns the
 * sampled instruments it plays, by sound name, for playing them from code too (a demo tune, a beat).
 */
export function playInstrument(world: World, built: Built, options: { sink?: number; onPlay?: (part: Part) => void } = {}): Map<Sound, Instrument> {
  const sink = options.sink ?? 0.003;
  const sounds = new Map<Sound, Instrument>();
  for (const part of built.parts) if (!sounds.has(part.sound)) sounds.set(part.sound, instrument(world, part.sound));
  const pressed: Press[] = [];
  for (const part of built.parts) {
    const base = part.mesh.material as Material;
    const lit = (base as MeshStandardMaterial).clone();
    lit.emissive.set(0x6ff3ff);
    lit.emissiveIntensity = 0.55;
    const press: Press = { mesh: part.mesh, restY: part.mesh.position.y, t: 0, held: 0, lit, base };
    onFingerTouch(
      world,
      part.mesh,
      (finger) => {
        sounds.get(part.sound)!.play(part.note, { velocity: velocityOf(finger), at: finger.point });
        press.held++;
        press.t = 1;
        part.mesh.material = lit;
        if (!pressed.includes(press)) pressed.push(press);
        options.onPlay?.(part);
      },
      () => (press.held = Math.max(0, press.held - 1)),
    );
  }
  // let go: the part comes back up and its glow fades
  world.registerSystem(
    class InstrumentPresses extends createSystem({}) {
      update(delta: number): void {
        for (let i = pressed.length - 1; i >= 0; i--) {
          const p = pressed[i];
          if (!p.held) p.t = Math.max(0, p.t - delta * 8);
          p.mesh.position.y = p.restY - p.t * sink;
          if (!p.t) {
            p.mesh.material = p.base;
            pressed.splice(i, 1);
          }
        }
      }
    },
  );
  return sounds;
}
