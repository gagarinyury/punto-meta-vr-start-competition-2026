// Before XR there is no caption: Punto itself shows the way in. Every few seconds it
// points at the power button on its own bezel, without a sound (a page may not play
// sound before the player has touched it). After the player's first touch of the page
// Punto says it once: "Press my button to start!". The same button takes the player out
// of the room later (helper.ts), so nothing more needs saying about leaving.
import { AudioContext as SharedAudio, VisibilityState, type World } from '@iwsdk/core';
import type { SpawnedPunto } from './helper.js';
import { talk } from './intro.js';
import { voiceFile } from './intro-lines.js';
import { prepareClip } from './speak.js';

const EVERY = 5000; // ms between silent pointings
const CHECK = 350; // ms: was that touch the power button itself? then XR is starting, keep quiet

/** Starts the pointing; returns the stop. */
export function pointTheWayIn(world: World, punto: SpawnedPunto): () => void {
  // the front page (src/splash/front.ts) is the way in now: a tap anywhere goes in, there is no button to point at
  // or to talk about (said a moment after a tap, it came as the headset was going in: «press my button»)
  const outside = () => world.visibilityState.peek() === VisibilityState.NonImmersive && !world.session && !document.body.dataset.poster;
  prepareClip(voiceFile('start')).catch((error) => console.warn('[wayin]', error));

  const pointer = setInterval(() => {
    if (outside() && punto.state === 'idle') punto.showPower();
  }, EVERY);

  let said = false;
  const onTouch = () => {
    if (said) return;
    said = true;
    removeEventListener('pointerdown', onTouch, true);
    removeEventListener('keydown', onTouch, true);
    // unlock the sound inside the touch itself; the clip is played a moment later
    const ctx = SharedAudio.getContext() as unknown as globalThis.AudioContext;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    setTimeout(() => {
      if (!outside()) return;
      const speech = talk(punto, 'start');
      punto.showPower(); // after talk() set its state: a new state stops what Punto was doing
      speech.catch((error) => console.warn('[wayin]', error));
    }, CHECK);
  };
  addEventListener('pointerdown', onTouch, true);
  addEventListener('keydown', onTouch, true);

  return () => {
    clearInterval(pointer);
    removeEventListener('pointerdown', onTouch, true);
    removeEventListener('keydown', onTouch, true);
  };
}
