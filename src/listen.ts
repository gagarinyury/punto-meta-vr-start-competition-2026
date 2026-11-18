// Talking to Punto: point at it and pinch, speak, let go. The phrase goes on
// as recorded sound (base64 webm); the server hears it. A pinch is a select
// of Punto (RayInteractable), so it does not grab anything else.
//
// The start comes from IWSDK's Pressed tag. The end does not: Pressed is also
// removed when the ray slides off Punto (pointerleave), and a hand wanders
// while its owner talks. So the end is the WebXR `selectend` of the same hand
// (outside XR: the mouse button going up).
import { createSystem, type Entity, Pressed, RayInteractable, type World } from '@iwsdk/core';
import type { SpawnedPunto } from './helper.js';
import type { LiveVoice } from './livevoice.js';
import { openMic, record, type Recording } from './voice.js';

export function listenOnPinch(
  world: World,
  punto: SpawnedPunto,
  onPhrase: (audio: string) => void,
  /** the player has just started talking to Punto */
  onStart?: () => void,
  /** the pinch was too short to be talking: nothing goes on */
  onCancel?: () => void,
  /** Punto's live voice (?voice=live): while there is one it hears the player all the time, and a pinch is
   *  not talking any more — Punto is just ticklish */
  live?: { voice: () => LiveVoice | undefined },
): void {
  punto.entity.addComponent(RayInteractable);
  // Ask for the microphone in the 2D page, before XR: no system dialog later.
  openMic().catch((error) => console.warn('[listen] no microphone', error));

  let session: XRSession | undefined;
  let lastPinch: XRInputSource | undefined;
  let talking: { recording: Recording; hand?: XRInputSource; since: number } | undefined;
  // A pinch shorter than this is not talking: a shot, a slip of the ray across Punto.
  const MIN_HOLD = 400;
  const onSelectStart = (event: XRInputSourceEvent) => (lastPinch = event.inputSource);
  const onSelectEnd = (event: XRInputSourceEvent) => talking?.hand === event.inputSource && finish();
  const onMouseUp = () => talking && !talking.hand && finish();
  addEventListener('pointerup', onMouseUp);

  function finish(): void {
    const { recording, since } = talking!;
    talking = undefined;
    if (performance.now() - since < MIN_HOLD) {
      recording.cancel();
      punto.setState('idle');
      onCancel?.();
      return;
    }
    punto.setState('think');
    const held = Math.round(performance.now() - since);
    recording.finish().then(
      (audio) => {
        // base64: 4 characters carry 3 bytes
        console.info(`[listen] held ${held} ms, ${Math.round((audio.length * 3) / 4 / 1024)} KB of sound`);
        if (audio) onPhrase(audio);
        else {
          punto.setState('idle');
          onCancel?.(); // nothing recorded: the listening bubble goes
        }
      },
      (error) => {
        // no microphone, or it failed: nothing goes on, and the listening bubble must not stay (13.11)
        console.error('[listen]', error);
        punto.setState('idle');
        onCancel?.();
      },
    );
  }

  world.registerSystem(
    class ListenSystem extends createSystem({ pressed: { required: [RayInteractable, Pressed] } }) {
      init(): void {
        this.queries.pressed.subscribe('qualify', (entity: Entity) => {
          if (entity !== punto.entity || talking) return;
          // The same press reaches the power button's listener right after this: wait for it.
          queueMicrotask(() => {
            if (talking || performance.now() - punto.poweredAt < 500) return; // the power button: leaving, not talking
            // On the flat page there is nothing to talk about yet: Punto points at the way in, the power
            // button on his bezel (the bubble over him that showWay() points at is hidden, panel.ts).
            if (!this.world.session) return punto.showPower();
            // selectstart fires before the frame that adds Pressed, so lastPinch is this hand
            if (live?.voice()) return punto.poke(); // the live voice hears without a pinch
            talking = { recording: record(), hand: this.world.session ? lastPinch : undefined, since: performance.now() };
            punto.setState('listen');
            onStart?.();
          });
        });
        this.cleanupFuncs.push(() => {
          removeEventListener('pointerup', onMouseUp);
          session?.removeEventListener('selectstart', onSelectStart);
          session?.removeEventListener('selectend', onSelectEnd);
        });
      }

      update(): void {
        // follow the XR session as it comes and goes
        if (this.world.session === session) return;
        session?.removeEventListener('selectstart', onSelectStart);
        session?.removeEventListener('selectend', onSelectEnd);
        session = this.world.session;
        session?.addEventListener('selectstart', onSelectStart);
        session?.addEventListener('selectend', onSelectEnd);
      }
    },
  );
}
