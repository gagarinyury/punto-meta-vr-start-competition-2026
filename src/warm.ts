// Warming the effects (19.11): a shader is compiled the first time something drawn with it comes into view, and in
// the headset that is a dropped frame or several — at the first shot, the first explosion. warmEffects() makes one of
// every effect, has all their shaders compiled at once WITHOUT stopping the frames (three's compileAsync: the driver
// compiles in parallel, we only wait), and keeps them, never drawn, so the compiled programs stay for the real ones.
// Call it once when the game starts, with the game's own renderer, camera and scene (its lights are part of what the
// lit shaders are compiled for):
//
//   await warmEffects(world.renderer, world.camera, world.scene);
import { type Camera, Group, type Object3D, type Scene, Vector3, type WebGLRenderer } from '@iwsdk/core';
import { confetti, dust, impact, poof, shatter } from './event.js';
import type { Fx } from './fx/core.js';
import { fire, light, smoke, spray, trail } from './life.js';
import { pyroBoom } from './pyro.js';
import { laser, shots } from './shots.js';
import { bubbles, fireworks, lightning, sparkle, weather } from './wonder.js';

let kept: { held: Group; effects: Fx[] } | undefined;

/** Compiles every effect's shaders ahead of their first use; resolves with the milliseconds it took. Safe to call twice. */
export async function warmEffects(renderer: WebGLRenderer, camera: Camera, scene: Scene): Promise<number> {
  if (kept) return 0;
  const began = performance.now();
  const tail = trail();
  tail.follow(new Vector3());
  // one of each kind of drawing: variants that share a shader (colours, sizes) need no copy of their own
  const effects: Fx[] = [
    smoke(), smoke({ faceted: false }), smoke({ opacity: 1 }), fire(), light(), spray(), tail,
    impact(), shatter(), poof(), dust(), confetti(),
    shots({ kind: 'bolt' }), shots({ kind: 'rocket' }), laser(),
    weather({ kind: 'storm' }), weather({ kind: 'snow' }), lightning(), fireworks(), bubbles(), sparkle(),
    pyroBoom(),
  ];
  const held = new Group();
  for (const fx of effects) held.add(fx.object as Object3D);
  // things hidden at their start (a trail at rest, a beam switched off) are skipped by the compile: show them all
  held.traverse((o) => (o.visible = true));
  kept = { held, effects };
  await renderer.compileAsync(held, camera, scene);
  return Math.round(performance.now() - began);
}
