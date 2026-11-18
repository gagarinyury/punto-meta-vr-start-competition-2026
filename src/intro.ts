// The first minute: Punto greets the player, makes things with its own hands
// and teaches how to talk to it. Everything is prepared, nothing generated:
// it must start at once and never fail in front of a new player. The voice
// is recorded in advance (src/intro-lines.ts -> tools/voice.mjs).
import {
  BoxGeometry,
  type BufferGeometry,
  createSystem,
  DistanceGrabbable,
  type Group,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  RayInteractable,
  Vector3,
  type World,
} from '@iwsdk/core';
import { basketball } from './basketball.js';
import { type BreakableRoom, breakableRoom } from './breakroom.js';
import { play } from './fx/core.js';
import { poof } from './fx.js';
import type { SpawnedPunto } from './helper.js';
import { INTRO_LINES, type IntroLine, LANG, lineText, liveLineText, ui, voiceFile } from './intro-lines.js';

const OFFER_CUES_RU = [1910, 4670, 7420]; // ms, set from the pauses in public/voice/ru/offer.wav
import { planet, type PlanetName } from './planets.js';
import { remember } from './made.js';
import { sfx } from './sfx.js';
import { prepareClip, sayClip } from './speak.js';

// A photo of a real meadow behind the broken wall (Poly Haven, CC0).
export const MEADOW = { colors: [0x6a95c5, 0x6f8671, 0x59682e] as [number, number, number], panorama: './skies/meadow_2.jpg' };
const SEEN = 'punto.seen';
const clip = voiceFile;

/** True for a browser that has not seen the intro; `?intro` in the address shows it again. */
export function isNewPlayer(): boolean {
  if (new URLSearchParams(location.search).has('intro')) return true;
  // VITE_NO_INTRO=1 at the dev server's start: never the way in (18.11, the bare coder's copy on 8082 — Yury tries
  // requests, not the wall)
  if (import.meta.env.VITE_NO_INTRO === '1') return false;
  try {
    return localStorage.getItem(SEEN) === null;
  } catch {
    return true;
  }
}

/** The way in has been seen in this browser: the next time Punto just pops in (`?intro` shows it again). */
export function markSeen(): void {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {
    // storage blocked: the way in will simply play again next time
  }
}

/** Loads every recorded line ahead, so Punto never waits for its voice. */
export function prepareIntro(): void {
  for (const line of Object.keys(INTRO_LINES) as IntroLine[]) {
    prepareClip(clip(line)).catch((error) => console.warn('[intro]', error));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** With Punto's live voice (?voice=live) the recorded lines are said by Gemini Live instead: one voice,
 *  in the player's language, not a TTS recording next to Live (Yury, 14.11: two voices, two languages). */
let voiceOver: ((text: string) => Promise<void>) | undefined;
export function speakLinesWith(say?: (text: string) => Promise<void>): void {
  voiceOver = say;
}

/** Punto says one of the recorded lines. */
export async function talk(punto: SpawnedPunto, line: IntroLine): Promise<void> {
  console.info(`[intro] ${lineText(line)}`);
  punto.setState('talk');
  if (voiceOver) await voiceOver(liveLineText(line)); // Live hears all the time: no pinch in its lines
  else await sayClip(clip(line));
  punto.setState('idle');
}

/** The player's eye and level forward/right directions right now. */
function view(world: World) {
  const eye = world.camera.getWorldPosition(new Vector3());
  const forward = world.camera.getWorldDirection(new Vector3()).setY(0).normalize();
  const right = new Vector3(-forward.z, 0, forward.x);
  return { eye, forward, right };
}

/** A point `ahead` metres in front of the player's face, `side` to the right, `down` below the eyes. */
function inFront(world: World, ahead: number, side: number, down: number): Vector3 {
  const { eye, forward, right } = view(world);
  return eye.clone().addScaledVector(forward, ahead).addScaledVector(right, side).setY(eye.y - down);
}

function withTimeout<T>(start: (done: (value: T) => void) => void, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(undefined), ms); // a room without walls: that part is skipped
    start(resolve);
  });
}

// What Punto types on its screen while it makes the first cube.
const CUBE_CODE = `// "I want a red cube!"
const cube = new Mesh(
  new BoxGeometry(0.16, 0.16, 0.16),
  new MeshStandardMaterial({
    color: 'red', metalness: 0.8,
  }),
);
cube.position.copy(nearPlayer());
world.createTransformEntity(cube)
  .addComponent(RayInteractable)
  .addComponent(DistanceGrabbable);
poof(cube); // POOF!`;

/** A red cube -> a ball -> a real ball that falls and bounces; it can be taken with the ray all along. */
async function ball(world: World, punto: SpawnedPunto, said?: (text: string) => void): Promise<void> {
  const RADIUS = 0.12; // a real basketball
  // Punto shows what to say, as if the player had said it, and then codes the cube:
  // the thing is written, not conjured.
  await talk(punto, 'example');
  said?.('I want a red cube!');
  // Punto stays where it is and turns about 45 degrees: the cube appears
  // before its hands, between Punto and the player.
  const here = punto.object.getWorldPosition(new Vector3());
  const toPlayer = view(world).eye.sub(here).setY(0).normalize().applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
  const at = here.clone().addScaledVector(toPlayer, 0.6).setY(here.y - 0.05);
  // it codes facing the player, so the screen full of code is seen; then it turns to the spot
  punto.showBuild = true; // little cubes click together before it, the code runs on its screen
  punto.setCode(null); // from the top
  punto.setCode(CUBE_CODE);
  punto.setState('build');
  await sleep(2600);
  punto.showBuild = false;
  await punto.flyTo(here, at);
  punto.setState('build');
  const thing = new Mesh<BufferGeometry, MeshStandardMaterial>(new BoxGeometry(0.16, 0.16, 0.16), new MeshStandardMaterial({ color: 0xd01020, metalness: 0.8, roughness: 0.22 }));
  thing.position.copy(at);
  const entity = world
    .createTransformEntity(thing)
    .addComponent(RayInteractable)
    .addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget });
  play(world, poof({ color: 0xff4455, size: 0.35 }), at);
  sfx(world, 'maximize', at);
  punto.noticeWorld(at);
  punto.setState('happy');
  await sleep(600);

  await talk(punto, 'ball');
  punto.setState('build');
  await sleep(300);
  const ball = basketball(RADIUS);
  thing.geometry.dispose();
  thing.material.dispose();
  thing.geometry = ball.geometry;
  thing.material = ball.material;
  play(world, poof({ color: 0xff4455, size: 0.18 }), thing.position);
  sfx(world, 'pluck', thing.position);
  punto.setState('happy');
  await sleep(500);

  await talk(punto, 'real');
  entity
    .addComponent(PhysicsBody, { state: PhysicsState.Dynamic })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [RADIUS, 0, 0], density: 1.1, restitution: 0.8, friction: 0.9 });
  sfx(world, 'phaseJump', thing.position);
  // a thump on every bounce, as loud as the hit
  const velocity = entity.getVectorView(PhysicsBody, '_linearVelocity');
  let falling = 0;
  class BallBounce extends createSystem({}) {
      update(): void {
        const vy = velocity[1];
        if (falling < -0.4 && vy >= 0) {
          sfx(world, 'impactSoft_heavy', thing.position, Math.min(1, -falling / 4));
          punto.noticeWorld(thing.position, 0.8); // its eyes follow the bouncing ball
        }
        falling = vy;
      }
  }
  world.registerSystem(BallBounce);
  remember(() => {
    world.unregisterSystem(BallBounce);
    if (entity.active) entity.dispose();
  });
  punto.setState('happy');
  await sayClip(clip('laugh'));
  await sleep(400);
  await punto.comeBack();
  await talk(punto, 'grab');
}

/** Punches the wall ahead open and mends it (a ready spell). */
export async function wall(world: World, punto: SpawnedPunto): Promise<void> {
  const room = await withTimeout<BreakableRoom>((done) => breakableRoom(world, MEADOW, done), 8000);
  if (!room) {
    console.warn('[intro] no room: the wall is skipped');
    return;
  }
  const { eye, forward } = view(world);
  const hit = room.hit(eye, forward);
  if (!hit) {
    console.warn('[intro] no wall ahead: the wall is skipped');
    room.dispose();
    return;
  }
  await talk(punto, 'wall');
  punto.setState('build');
  await punto.flyTo(hit.point.clone().addScaledVector(hit.normal, 0.6), hit.point);
  for (let i = 0; i < 3; i++) {
    await punto.punch();
    const spot = hit.point.clone().addScaledVector(hit.normal, 0.08).add(new Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.15, 0));
    sfx(world, 'impactPunch_heavy', spot);
    await sleep(220);
  }
  room.breakAt(hit.point, 0.45);
  sfx(world, 'lowFrequency_explosion', hit.point, 1);
  console.info('[intro] wall broken');
  punto.setState('happy');
  await sleep(1000);

  // turns round to the player, embarrassed
  await punto.flyTo(punto.object.getWorldPosition(new Vector3()), eye);
  punto.setState('think');
  await talk(punto, 'oops');
  punto.setState('build');
  await punto.flyTo(hit.point.clone().addScaledVector(hit.normal, 0.75), hit.point);
  await room.repair();
  console.info('[intro] wall repaired');
  sfx(world, 'confirmation', hit.point);
  punto.setState('happy');
  await sayClip(clip('woohoo'));
  room.dispose(); // whole again: nobody can tell it is gone
  await punto.comeBack();
}

// A solar system small enough for any room: about 0.8 m across.
const ORBITS: [PlanetName, number, number, number][] = [
  // name, body radius, orbit radius, turns a minute
  ['venus', 0.016, 0.11, 9],
  ['earth', 0.018, 0.16, 7],
  ['mars', 0.013, 0.21, 5.5],
  ['jupiter', 0.034, 0.28, 3.5],
  ['saturn', 0.028, 0.35, 2.6],
  ['neptune', 0.02, 0.41, 1.8],
];

/** Punto flies up to the spot, faces it and makes the planets with its hands, one by one; then they start to orbit. */
export async function planets(world: World, punto: SpawnedPunto): Promise<void> {
  const { forward, right } = view(world);
  const centre = inFront(world, 1.2, 0, 0.15);
  await punto.flyTo(centre.clone().addScaledVector(forward, -0.6).addScaledVector(right, 0.65).setY(centre.y + 0.05), centre);
  punto.setState('build');
  const sun = planet('sun', { radius: 0.06 });
  sun.position.copy(centre);
  const made = [world.createTransformEntity(sun)];
  play(world, poof({ color: 0xffb347, size: 0.25 }), centre);
  sfx(world, 'maximize', centre);
  const bodies: { body: Group; orbit: number; speed: number; angle: number }[] = [];
  for (const [name, radius, orbit, perMinute] of ORBITS) {
    await sleep(220);
    const angle = Math.random() * Math.PI * 2;
    const body = planet(name, { radius });
    if (name === 'saturn') body.rotation.z = 0.47;
    body.position.set(centre.x + Math.cos(angle) * orbit, centre.y, centre.z + Math.sin(angle) * orbit);
    made.push(world.createTransformEntity(body));
    play(world, poof({ color: 0xaad4ff, size: 0.12 }), body.position);
    sfx(world, 'pluck', body.position, 0.6);
    bodies.push({ body, orbit, speed: (perMinute * Math.PI * 2) / 60, angle });
  }
  await sleep(250);
  sfx(world, 'forceField', centre);
  let spin = 0; // the planets speed up from rest
  class Orbits extends createSystem({}) {
      update(delta: number): void {
        spin = Math.min(1, spin + delta * 0.8);
        sun.rotation.y += delta * 0.2;
        for (const one of bodies) {
          one.angle += one.speed * spin * delta;
          one.body.position.set(centre.x + Math.cos(one.angle) * one.orbit, centre.y, centre.z + Math.sin(one.angle) * one.orbit);
          one.body.rotation.y += delta;
        }
      }
  }
  world.registerSystem(Orbits);
  remember(() => {
    world.unregisterSystem(Orbits);
    for (const entity of made) if (entity.active) entity.dispose();
  });
  punto.setState('happy');
  await sleep(1000);
  await punto.comeBack();
}

/** `said` shows a phrase in the bubble over Punto, as if the player had said it. */
export async function runIntro(world: World, punto: SpawnedPunto, said?: (text: string) => void): Promise<void> {
  punto.showBuild = false; // in the intro Punto makes things with its hands
  punto.stay('front');
  // the cube-and-ball show is gone (14.11): the way in already taught to point, pinch and speak
  void ball;
  void said;
  await talk(punto, 'hello');
  await sleep(250);
  // the three answers show over Punto as it names them: what to say, word for word
  const offer = talk(punto, 'offer');
  // when each answer is named, by the pauses in each language's offer.wav
  const at = LANG === 'ru' ? OFFER_CUES_RU : [1620, 3120, 5450]; // ms, from the pauses in public/voice/offer.wav
  const cues: [number, string][] = [
    [at[0], ui('a wall-blaster', 'бластер, который ломает стены')],
    [at[1], ui('a mini solar system', 'Солнечная система')],
    [at[2], ui('whatever you want', 'своё')],
  ];
  for (const [at, text] of cues) setTimeout(() => said?.(text), at);
  await offer;
  await sleep(200);
  await talk(punto, 'askMe');
  punto.setState('listen'); // a hand by its ear: your turn
  punto.showBuild = true;
  punto.setCode(null); // the live coder's own sample again
  try {
    localStorage.setItem(SEEN, '1');
  } catch {
    // storage blocked: the intro will simply play again next time
  }
}
