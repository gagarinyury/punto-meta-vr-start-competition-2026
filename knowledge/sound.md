# Sound (IWSDK)

## One-shot sounds: `sfx()` (CC0, Kenney)

A hit, a step, a shot, a coin, a click, a win, an announcer's voice: the host helper. A sound is a group name; each
play picks one of its variants. It is heard from the point you give — the place of the event: the hit target, the
bounce point, the pressed button.

```ts
import { sfx } from '../sfx.js';

sfx(world, 'impactSoft_heavy', ball.position);   // a ball hits the floor
sfx(world, 'you_win');                            // everywhere, no point
```

Groups (use only these exact names):
- hits: impactSoft_heavy, impactSoft_medium, impactPunch_heavy, impactPunch_medium, impactWood_light/medium/heavy, impactMetal_light/medium/heavy, impactMetal, impactGlass_light/medium/heavy, impactPlate_light/medium/heavy, impactPlank_medium, impactTin_medium, impactGeneric_light, impactBell_heavy, impactMining, footstep_wood/grass/snow/concrete/carpet
- interface: click, select, confirmation, error, open, close, maximize, minimize, pluck, drop, tick, toggle, switch, glitch, scroll
- arcade and sci-fi: powerUp, laser, zap, phaseJump, phaserUp, phaserDown, pepSound, highUp, highDown, laserSmall, laserLarge, laserRetro, explosionCrunch, lowFrequency_explosion, forceField, thrusterFire, slime, doorOpen, doorClose
- things: handleCoins, chop, knifeSlice, bookOpen, bookFlip, creak, card-place, card-shuffle, chips-stack, dice-throw
- jingles: jingles_NES, jingles_HIT, jingles_PIZZI, jingles_SAX, jingles_STEEL
- announcer: ready, go, round, final_round, you_win, you_lose, game_over, new_highscore, level_up, congratulations, correct, wrong, hurry_up, time_over, 1 … 10

## Musical instruments: `../music.js`

Anything played as music — a piano, a xylophone, a marimba, drums, a
glockenspiel, bells — sounds through the host helper `instrument`: real sampled
instruments (acoustic drum kit, Steinway grand, mallets), heard from where they
are played, silent when the game is replaced. Never build them from oscillators
or from `sfx()` impacts.

```ts
import { onFingerTouch } from '../hand.js';
import { beatClock, instrument, velocityOf } from '../music.js';

const drums = instrument(world, 'drums');   // parts: kick, snare, rim, high tom, low tom, floor tom, hihat, open hihat, crash, ride
onFingerTouch(world, snareSkin, (finger) => drums.play('snare', { velocity: velocityOf(finger), at: finger.point }));

const piano = instrument(world, 'piano');   // also 'upright piano', 'xylophone', 'marimba', 'glockenspiel', 'vibraphone', 'tubular bells', 'kalimba'
onFingerTouch(world, key, (finger) => piano.play('E4', { velocity: velocityOf(finger), at: finger.point }));
piano.play(['C4', 'E4', 'G4']);             // a chord

beatClock(world, 100, (step, time) => { if (step % 4 === 0) drums.play('kick', { time }); }); // a steady beat
```

`velocityOf(finger)` makes a soft touch quiet and a hard strike loud. The
sounds load in a second or two the first time (then they are cached): make the
instrument when the game starts, not on the first touch.

## An instrument to play: build it yourself

An instrument the player asks for (a piano, drums, a xylophone, a harp, pads) is built by you, each time its own way
— shape, colours, how many keys after what was asked: one `onFingerTouch` per key, bar or drum head, the sound from
`instrument(world, …)`, a key that sinks a few millimetres and lights up while touched; bare hands, nothing in them
unless sticks are asked for. Within reach (ergonomics.md): a drum kit is small and close, not a real 1.5 m kit. Two
octaves (25 keys) are enough; each key its own mesh, the rest (body, legs, stands) `merge`d into one.
`drumKit()`, `synth()`, `xylophone()`, `pads()`… of `../instruments.js` (with `playInstrument(world, it)`) only when
the player names exactly that ready one: they look the same every time.

## A sound that lives on an object (loop, engine, music)

Its file is one of `./audio/kit/` (CC0), only these names: click, tick, select, switch, confirmation, error, pluck,
drop, bong, glass, scratch, open, close, maximize, minimize, question (`.ogg`).

```ts
entity.addComponent(AudioSource, {
  src: './audio/kit/tick.ogg',
  loop: true,
  volume: 0.4,
  positional: true,
});
AudioUtils.play(entity);   // AudioUtils.stop(entity) to end it
```

For a sound triggered many times on the same object add
`playbackMode: PlaybackMode.Overlap, maxInstances: 4`.

## Rules

- Every scoring event, hit and button press gets a sound.
- Keep volume 0.4–0.9. Do not start a new sound every frame: play it on the event (the
  moment of the hit), not while a contact lasts. The host plays one sound name at most
  about 12 times a second and drops the rest.
- Do not invent group names, file names or URLs; if nothing fits, use `pluck`.
- Never call `AudioUtils.createOneShot`: it leaves an entity behind on every play, and the scene breaks after a
  thousand of them.
