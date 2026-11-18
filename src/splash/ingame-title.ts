// The title in the game (Yury, 15.11): once Punto has mended the wall, he flies up and types PUNTO before the
// player, as on the front page — the same title (src/splash/title.ts), its own waves, streams and sparks. While it
// shows, the game's Punto is hidden and the title's own flies out of where he was and back there at the end.
import { AdditiveBlending, CustomBlending, type Material, Mesh, type Object3D, type Texture, OneFactor, SrcAlphaFactor, Vector3, ZeroFactor, createSystem, type World } from '@iwsdk/core';
import type { Punto } from '../helper.js';
import { level } from '../speak.js';
import { createTitle, type Title } from './title.js';

const FLY = 0.8; // s, out to the title and back
const HOLD = 2.6; // s of the ta-da before it goes
const SCALE = 0.75; // smaller than the front page's: Punto's own sign before the player, not a poster

let current: { title: Title; update: (delta: number, time: number) => void } | null = null;
let prepared: Promise<Title> | null = null;

/**
 * Builds the title ahead and compiles its shaders in the background (the browser's parallel compile), while
 * nothing much happens (Punto waiting for «fix it»): built and compiled at the moment it shows, it stalled the
 * headset right after the wall was mended (95 and 62 ms frames on a computer, far longer in the Quest).
 */
export function prepareTitle(world: World): Promise<Title> {
  prepared ??= (async () => {
    const title = await createTitle(world);
    lightOnly(title.logo);
    // no light of its own: a light coming into the scene changes the scene's light count, and every material in it
    // (the game's too) is rebuilt at once — the stall after the wall. Over the room its glow from below hardly shows.
    const lamps: Object3D[] = [];
    title.logo.traverse((o) => { if ((o as { isLight?: boolean }).isLight) lamps.push(o); });
    for (const l of lamps) l.removeFromParent();
    title.logo.visible = false;
    // its textures (the letters' glows, the neon, Punto's face) on the GPU now, not at its first frame
    title.logo.traverse((o) => {
      const mats = (o as Mesh).material as Material | Material[] | undefined;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        for (const v of Object.values(m)) if (v && (v as Texture).isTexture) world.renderer.initTexture(v as Texture);
      }
    });
    // every part shown for the compile (the letters, the keyboard, the effects are hidden until they are used)
    const hidden: Object3D[] = [];
    title.logo.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const r = world.renderer as typeof world.renderer & { compileAsync?: (o: Object3D, c: Object3D, s?: Object3D) => Promise<unknown> };
    try {
      if (r.compileAsync) await r.compileAsync(title.logo, world.camera, world.scene);
      else r.compile(title.logo, world.camera, world.scene);
      // drawn for two frames as a speck far below the floor: its geometry goes to the GPU now (a compile does not
      // upload buffers; its first real frame did, 72 ms on a computer)
      title.logo.visible = true;
      title.logo.scale.setScalar(1e-4);
      title.logo.position.set(0, -50, 0);
      const s = world.renderer.xr.getSession();
      const frame = () => new Promise<void>((resolve) => (s ? s.requestAnimationFrame(() => resolve()) : requestAnimationFrame(() => resolve())));
      await frame();
      await frame();
    } finally {
      for (const o of hidden) o.visible = false;
      title.logo.visible = false;
      title.logo.scale.setScalar(1);
    }
    return title;
  })();
  return prepared;
}
let registered = false;

/**
 * Over the room (passthrough, or the emulator's room) the frame is laid with its alpha: a glow that fades by going dark
 * but keeps its alpha covers the room like smoke (the streams came out black, 15.11). Its light is added and the
 * frame's alpha left as it was: only light over the room, no veil.
 */
function lightOnly(root: Object3D): void {
  root.traverse((o) => {
    const mats = (o as Mesh).material as Material | Material[] | undefined;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      if (m.blending !== AdditiveBlending) continue;
      m.blending = CustomBlending;
      m.blendSrc = SrcAlphaFactor;
      m.blendDst = OneFactor;
      m.blendSrcAlpha = ZeroFactor;
      m.blendDstAlpha = OneFactor;
      m.needsUpdate = true;
    }
  });
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/** Types the title before the player; resolves when it has gone and the game's Punto is back. */
export async function typeTitle(world: World, punto: Punto): Promise<void> {
  if (current) return;
  if (!registered) {
    registered = true;
    world.registerSystem(
      class InGameTitle extends createSystem({}) {
        update(delta: number, time: number): void {
          current?.update(delta, time);
        }
      },
    );
  }
  const title = await prepareTitle(world);
  prepared = null; // used: a next show builds a fresh one
  title.logo.visible = true;
  const from = punto.object.getWorldPosition(new Vector3());
  punto.object.visible = false;
  title.start(); // the logo 2.4 m before the eyes, facing them
  title.logo.scale.setScalar(SCALE);
  const own: Object3D = title.punto.object;
  const home = own.position.clone();
  const at = new Vector3();
  let clock = 0, phase: 'in' | 'show' | 'out' | 'back' = 'in', leftAt = 0;
  /** The title's Punto at t (0..1) of the way between its place in the logo and `world` (where the game's one is). */
  const between = (t: number) => {
    title.logo.worldToLocal(at.copy(from));
    own.position.lerpVectors(home, at, t);
  };
  between(1);
  return new Promise<void>((resolve) => {
    current = {
      title,
      update(delta, time) {
        clock += delta;
        // the title's Punto stands in for the game's: when Live speaks (it answers the mended wall as he types),
        // his mouth goes with that voice, whatever the title has him doing
        title.punto.setVoice(level());
        title.update(delta, time);
        if (phase === 'in') {
          const k = Math.min(1, clock / FLY);
          between(1 - ease(k));
          if (k >= 1) phase = 'show';
        } else if (phase === 'show') {
          const s = title.state();
          if (s.phase === 'tada' && s.clock - s.tadaAt > HOLD) { title.said(); phase = 'out'; }
        } else if (phase === 'out') {
          if (title.state().phase === 'off') { phase = 'back'; leftAt = clock; punto.object.getWorldPosition(from); }
        } else {
          const k = Math.min(1, (clock - leftAt) / FLY);
          between(ease(k));
          if (k >= 1) {
            title.logo.removeFromParent();
            punto.object.visible = true;
            current = null;
            resolve();
          }
        }
      },
    };
  });
}
