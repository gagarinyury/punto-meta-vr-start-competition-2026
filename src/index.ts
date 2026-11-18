/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DepthSensingSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { startLive } from './live.js';
import { startPerf } from './perf.js';
import { PanelSystem } from './panel.js';
import { openShared } from './remote.js';
import { type Front, startFront } from './splash/front.js';
import { startTogether } from './together.js';
import { startGameHandle } from './gamehandle.js';
import { startEvenScale } from './evenscale.js';
import { startTrace } from './trace.js';
import { startFingers } from './hand.js';
import { warmTablet } from './library/tablet.js';
import { warmEffects } from './warm.js';

const t0 = performance.now();
World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then(async (world) => {
  // A tap anywhere on the page goes into XR — from the first moment, the loading art too (the browser's own
  // «Enter XR» chip still works). On the window, capturing: first of all (the mouse mode stops the clicks it takes).
  addEventListener(
    'pointerup',
    (e) => {
      // not a tap meant for a control (the type box, its buttons, links)
      // (along the whole path: the type box lives in a shadow root, where the target is its host)
      if (e.composedPath().some((n) => n instanceof Element && n.matches('input, textarea, button, select, a, [contenteditable]'))) return;
      if (!world.session) world.launchXR();
    },
    { capture: true },
  );
  let front: Front | null = null;
  const xr = world.renderer.xr;
  // into XR: the poster just goes, the room is clean (the title comes back in the game: once Punto has mended the
  // wall he types it, src/splash/ingame-title.ts)
  xr.addEventListener('sessionstart', () => front?.show(false));
  // 72 Hz, not the Quest browser's 90: at 90 the game made 55-70 frames a second (fps.log 16.11, Stale ~30 a second),
  // so every third frame was shown twice — a judder. 72 it keeps. WebXR's own frame-rate call; older browsers lack it.
  xr.addEventListener('sessionstart', () => {
    // three's own session: world.session is not set yet when 'sessionstart' fires (16.11: nothing happened)
    const session = xr.getSession() as (XRSession & { updateTargetFrameRate?: (rate: number) => Promise<void>; supportedFrameRates?: Float32Array }) | undefined;
    if (!session?.updateTargetFrameRate || !session.supportedFrameRates?.includes(72)) return;
    session.updateTargetFrameRate(72).then(
      () => console.info('[perf] frame rate 72 Hz'),
      (error) => console.warn('[perf] frame rate stays', error),
    );
  });
  xr.addEventListener('sessionend', () => front?.show(true));

  // The front page (src/splash/front.ts) first, the game's own loading alongside it
  const ready = startFront(world, new URLSearchParams());
  world.registerSystem(PanelSystem);
  world.registerSystem(DepthSensingSystem, {
    configData: {
      enableDepthTexture: true,
      enableOcclusion: true,
      useFloat32: true,
      blurRadius: 20,
    },
  });
  startLive(world);
  startPerf(world); // long frames and what was going on in them (src/perf.ts, logs/quest.log)
  openShared().catch((error) => console.error(error));
  startTogether(world); // ?room=, ?ghost=, ?record= (src/together.ts)
  startTrace(world); // the player's actions in the log, for every game (src/trace.ts)
  startFingers(world); // every fingertip and held stick for onFingerTouch (src/hand.ts), whatever thing comes and goes
  startGameHandle(world); // a long pinch moves a made thing; a new one never stands in the player (src/gamehandle.ts)
  startEvenScale(world); // a grabbed thing grows and shrinks as a whole, never stretched along one axis (src/evenscale.ts)

  front = await ready;
  // gone into XR while it loaded: it stays off
  if (world.session || xr.isPresenting) front.show(false);
  // every shader compiled before it is seen; then the loading art dissolves into it
  await front.warm();
  await warmTablet(world).catch((error) => console.warn('[tablet] warm', error)); // Punto's tablet: no compile when he takes it out
  // the effects' shaders (src/warm.ts): no dropped frames at the first shot or the first explosion of a made game
  await warmEffects(world.renderer, world.camera, world.scene)
    .then((ms) => console.info(`[fx] effects warm in ${ms} ms`))
    .catch((error) => console.warn('[fx] warm', error));
  console.log(`[front] ready in ${Math.round(performance.now() - t0)} ms`);
  const art = document.getElementById('loading-art');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!art) return;
    art.style.opacity = '0';
    art.addEventListener('transitionend', () => art.remove(), { once: true });
  }));
  if (import.meta.env.DEV) (window as unknown as { __front?: unknown }).__front = { front, world };
});
