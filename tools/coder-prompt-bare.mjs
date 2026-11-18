// The bare coder prompt (Yury, 18.11): IWSDK and Three.js, plus only Punto's helpers for the real room — the spot
// the player wants, the table, the furniture, portals, breakable walls, a creature on the floor; since the evening
// of 18.11 also hands, ready things (ready.js), people, found models and effects, all packed small. Not the look or the
// music (style.js as such, music.js): the model draws itself, as the XR Blocks Gem does on its SDK. Chosen with CODER_PROMPT=bare (tools/coder.mjs, server/index.mjs).
// The file still goes through the host's loader `feature()` of '../live.js': that is how a file enters the scene.
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const sample = readFileSync(`${ROOT}tools/coder-bare-sample.ts`, 'utf8');
// the room helpers (Yury, 18.11: «верни работу со столами, со стенами, вообще с комнатой»): their knowledge as it is,
// and their declarations from tools/coder-api.json (made from the helpers' own source)
// and the hands (Yury, 18.11): a sword, a racket, a gun in the hand, hitting with it, and playing with the fingers —
// '../hand.js' without fitToHand (a downloaded model, which this coder never gets)
export const ROOM_MODULES = ['../place.js', '../tabletop.js', '../furniture.js', '../outside.js', '../breakroom.js', '../creature.js', '../hand.js', '../figures.js',
  // sound, music and the small game helpers (Yury, 18.11): sfx (the Kenney library), the sampled instruments, where a ray
  // hit, a thing to throw, the score, real planets. Not instruments.js: an instrument is built by the coder each time
  '../sfx.js', '../music.js', '../ray.js', '../throwable.js', '../score.js', '../planets.js'];
// declarations kept without their comments: the knowledge below says what they do
const BARE_SIGNATURES = new Set(['../music.js']);
// ready things, people and downloaded models (Yury, 18.11: «возвращай это все минимальным промптом»): style.js as one
// call and its names (src/ready.ts, ~1.5 thousand instead of 46), the figures as they are, models.js for a found model
const READY_NAMES = [...readFileSync(`${ROOT}src/ready.ts`, 'utf8').match(/export const READY = \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
// a real molecule from PubChem (Yury, 18.11, src/molecule.ts): written here by hand, coder-api.json does not have it
const MOLECULE_API = `declare module '../molecule.js' {
/** A real molecule by its English name, atoms where they really are (PubChem 3D), ball and stick in CPK colours,
 * \`size\` metres along its longest side (0.3). Origin at its bottom centre. Throws when PubChem has no 3D for it. */
export function molecule(name: string, options?: { size?: number; hydrogens?: boolean }): Promise<Molecule>;
export interface Molecule extends Group { userData: { name: string; atoms: { element: string; position: Vector3 }[]; bonds: [number, number, number][] } }
}`;
const READY_API = `declare module '../ready.js' {
/** A ready thing by name, made with its defaults and scaled whole: its longest side is \`size\` metres. Low-poly,
 * faceted (Punto's islands look). Its origin: the bottom centre of a thing that stands; the handle of a thing for the
 * hand (hand.md axes). A Group: add it to your root like any part, recolour or add to it freely. */
export function ready(name: ReadyName, options: { size: number }): Group;
export type ReadyName = ${READY_NAMES.map((n) => `'${n}'`).join(' | ')};
}`;
// fitToHand is back (18.11): with the director the coder gets downloaded models again, and a blaster turned by guess
// held its barrel the wrong way
const LEFT_OUT = new Set(['fitToHand']); // our own models only (18.11): no downloaded files, so no fitToHand

const parts = JSON.parse(readFileSync(`${ROOT}tools/coder-api.json`, 'utf8'));
// No word twice (Yury, 18.11: «убери дублирование, только грамотно»): a helper the knowledge below already explains
// (room.md, tabletop.md, creature.md, hand.md, figures.md name it in code) keeps its signature without its own doc
// comment; the comments inside its types stay, and a helper the knowledge does not explain keeps everything.
const KNOWN = ['room.md', 'tabletop.md', 'creature.md', 'hand.md', 'figures.md'].map((name) => readFileSync(`${ROOT}knowledge/${name}`, 'utf8')).join('\n');
const explained = (name) => new RegExp(`\\b${name}\\b\\s*\\(|\`${name}\\b`).test(KNOWN);
const declared = (spec, one) => {
  if (BARE_SIGNATURES.has(spec)) return one.text.replace(/\/\*\*[\s\S]*?\*\/\n?/g, '');
  return explained(one.name) ? one.text.replace(/^\s*\/\*\*[\s\S]*?\*\/\n?/, '') : one.text;
};
const roomApi = ROOM_MODULES.map((spec) => `declare module '${spec}' {\n${(parts[spec] ?? []).filter((one) => !LEFT_OUT.has(one.name)).map((one) => declared(spec, one)).join('\n')}\n}`).join('\n\n');
const know = (name) => readFileSync(`${ROOT}knowledge/${name}`, 'utf8')
  // their complete examples are built with the look of style.js, which this coder does not have
  .replace(/ ?Complete example: `samples\/\w+\.ts`\./g, '')
  // onRayPress / onFingerTouch are hand helpers this coder does not have: a pressed point comes from the engine
;
// room.md said twice what the prompt above says (the play area, the view) and placed every thing itself: for the
// bare coder a single thing says \`stands\` and the host puts it, so room.md's placing is for games and places
const roomMd = () => know('room.md')
  .replace("When the director's note names a place", "For a game or a place (a single thing only says `stands`): when the director's note names a place")
  .replace('- The play area is 0.4–1.2 m in front of the seated player. Never cover the whole view: the room stays visible.\n', '');
const handKnow = know('hand.md')
  .slice(0, know('hand.md').indexOf('## A downloaded model'))
  .replace(' The model: the file the director\'s note names\n(below), else a ready thing of `../style.js` (style.md: "In the hand", "On a haft"), else your own.', " The model: a ready one when it fits — `ready('sword' | 'axe' | 'wand' | 'torch' | 'hammer' | 'spear' | 'bow' | 'shield' | 'pickaxe' | 'flashlight' …, { size })` comes with its handle at the origin, these axes — else your own.");
const FINGERS = `## Played with the fingers: \`onFingerTouch\`

Keys, bars, drum heads, pads, a button under the finger, a mole to whack — \`onFingerTouch(world, key, onIn, onOut)\` from
\`../hand.js\`: every fingertip of both hands on its own (chords, rolls, two hands), and held sticks' tips given to
\`strikeWith\`. One call per key; \`onIn(finger)\` as a finger comes in (\`finger.point\` in world metres), \`onOut\` as it
leaves: sink the key a few millimetres and light it while touched. Keep \`RayInteractable\` too if it should also work
from afar.
`;
// the effects (Yury, 18.11: «эффекты тоже так компактно»): fx.js signatures without their comments, the markers left
// out, and fx.md in a few lines — ~4.5 thousand chars instead of 12
const FX_LEFT_OUT = new Set(['outlineGlow', 'targetRing']);
const fxApi = `declare module '../fx.js' {\n${(parts['../fx.js'] ?? []).filter((one) => !FX_LEFT_OUT.has(one.name))
  .map((one) => one.text.replace(/\/\*\*[\s\S]*?\*\/\n?/g, '').replace(/\n(?=[a-z])/g, ' ')).join('\n')}\n}`;
const FX = `EFFECTS ('../fx.js': a function makes one, \`play\` shows it)
\`\`\`ts
play(world, smoke({ size: 0.06 }), chimneyTop);          // on a thing (Entity or Object3D): moves with it
play(world, poof({ size: sizeOf(thing) }), spot);        // at a world point; a one-shot removes itself
play(world, impact({ size: 0.3 }), hitPoint, hitNormal); // on a real wall or table: its normal; local +Y points out
const flame = play(world, fire({ size: 0.2 }), campfire); flame.stop();
\`\`\`
- \`size\` is the size of the THING it happens to, in metres (the chimney's mouth, the campfire; \`sizeOf(thing)\`).
- Endless (stop with \`.stop()\`): smoke, fire (palette 'plasma' an engine jet), light (a lamp, a lit window), spray (a
  fountain; burst: true a splash), bubbles, sparkle, weather (rain, storm, snow over a table), trail (behind a ball).
- One-shot: impact (with the normal), shatter({ of: thing }) (play with no target, dispose the thing), explosion (the
  heaviest: one at a time), dust, poof, lightning, confetti and fireworks (a win).
- Shooting: one \`shots({ kind, color, targets: () => enemies, onHit })\` for all guns of a kind, \`play(world, gun)\` once,
  then \`gun.fire(from, direction)\`; size 1 in the room, ~a quarter of a ship on a table. \`laser\`: \`ray.aim(from, to)\`, \`ray.on\`.
- The whole real floor as lava or water (sofas and tables stay dry): \`coverFloor(world, (width, depth) => lava({ width, depth }))\`.
- One clear effect where something happened — not one on every frame or every touch.
`;
const figuresKnow = know('figures.md')
  .replace("the ready ones\n  (`sword()`, `axe()`, `wand()`, `torch()`… from `../style.js`) or\n  your own", "`ready('sword', { size: 0.9 })` or your own")
  .replace(' (keys and colour names: the\n  HOST API)', '');
const roomKnow = [...['room.md', 'tabletop.md', 'creature.md'].map((name) => `--- ${name} ---\n${name === 'room.md' ? roomMd() : know(name)}`),
  `--- hand.md ---\n${handKnow}${FINGERS}`, `--- figures.md ---\n${figuresKnow}`].join('\n');

export const bare = `You write ONE TypeScript file for a running IWSDK app (WebXR, passthrough mixed reality) on Meta Quest 3 / 3S,
in the player's real room. IWSDK is Meta's Immersive Web SDK: an ECS (entities, components, systems) over Three.js.

THE FILE
- Shape: \`feature(import.meta, (world) => { ... });\` (import { feature } from '../live.js') and the last line
  \`import.meta.hot?.accept();\`. Setup may be \`async\` and return a cleanup function. Everything created through
  \`world\` is disposed by itself when the file is replaced.
- Import everything from '@iwsdk/core' (it re-exports all of Three.js: Mesh, Group, BoxGeometry, Vector3…),
  \`feature\` from '../live.js', and the room helpers from ${ROOM_MODULES.map((spec) => `'${spec}'`).join(', ')}
  '../ready.js', '../molecule.js' and '../fx.js' (THE REAL ROOM below). Nothing else exists to import.
- Create every object with \`world.createTransformEntity(object, parent?)\`, never \`scene.add()\`. Remove one with
  \`entity.dispose()\`. An entity's object stays where IWSDK hung it: never move it to another group afterwards
  (\`group.add(mesh)\` after \`createTransformEntity(mesh, …)\` loses it — 18.11, the planets of a solar system ended
  up on the floor). A part that moves inside a group (a planet on its orbit, a wheel) is a plain child of that group,
  not an entity; make the whole group the entity.
- Per-frame code is a system registered in the setup: \`world.registerSystem(class extends createSystem({ queries }) {
  init() {} update(delta, time) {} })\`. Never allocate inside update(): make scratch vectors once outside it.

A THING TO LOOK AT IS PUT BY THE HOST
- One thing (a cube, a molecule, a vase, a machine, a model of anything): build it inside ONE root \`Group\` left at
  exactly (0, 0, 0) — its bottom on y = 0, its front toward +Z, real size in metres — and make that group the entity.
  Do not place it — say where it belongs and the host puts it there: \`root.userData.stands = 'table'\` (a small
  world, a diorama, a village, a board game, a toy, a vase: on the table the player looked at, else the floor),
  \`'floor'\` (a car to sit by, a dog house, a big machine), \`'wall'\` (a picture, a clock, a dartboard: on the wall
  ahead), \`'air'\` (a molecule, a planet, a model to turn in the hands: before the eyes). Where the player pointed wins.
  Taking it is yours, not the host's: the root entity gets RayInteractable + DistanceGrabbable (\`movementMode:
  MovementMode.MoveFromTarget\`: it rides on the ray, both hands' rays stretch it); a part the player asks to take in
  the hand (a planet, an atom) is its own entity with the same two, left alone by your motion while it is \`Grabbed\`.
  Entities are made top-down, each under the entity of the group it really sits in: a planet on an orbit — the orbit's
  turning group an entity under the thing, the planet an entity under THAT (\`createTransformEntity(planet,
  orbitEntity)\`). IWSDK hangs the object under the entity you name: naming the thing for a part that sat in an orbit
  group tears it out of the orbit (18.11: the planets stood in a line while empty orbits turned). Your code only
  builds it and gives it the motion that was asked for (turning, a pulse, moving parts) to the parts INSIDE the group:
  never write the root group's position, rotation or scale — they are the host's.
- A game or a place that uses the room itself (a board on the table, portals, broken walls, a creature on the floor,
  things on every wall) places itself with the room helpers below; never leave its root at the origin.
- Something PLAYED or OPERATED with the hands — a piano, drums, a xylophone, a control panel, buttons, levers — is not
  a thing the host puts: place it yourself within reach, \`const spot = inFrontOfPlayer(world, { distance: 0.4, below:
  0.45 })\` (keys and pads at hand height, the near edge ~0.3 m from the eyes, all of it within 0.55 m), no \`stands\`,
  and NO grab component on it (a pinch there must play, not carry it away). 18.11: a piano before the eyes at 0.9 m
  and drums 1.25 m away could not be played, and a hand reaching for a drum grabbed the whole kit.

THE PLAYER AND THE ROOM
- The player sits (couch or chair), facing any way, bare hands, no controller. World origin is where XR started:
  never fixed world coordinates — place relative to the player's head: \`world.player.head.getWorldPosition(v)\`,
  \`world.camera.getWorldDirection(d)\` (flatten to y = 0 for "ahead"). Floor is y = 0.
- What the hands touch is within 0.55 m: near edge ~0.3 m from the eyes, 0.35–0.45 m below them. Things to look at
  0.6–1.2 m ahead. The room stays visible: never a background over the whole view.
- The real room — its walls, floor, tables, furniture — is taken through the host's room helpers (THE REAL ROOM below).

HANDS
- Press: \`RayInteractable\` on the entity (+ \`PokeInteractable\` for a fingertip touch within reach); a query
  \`{ required: [RayInteractable, Pressed] }\` and \`subscribe('qualify')\`. \`Hovered\` while the ray is on it.
  Where exactly the ray hit (which block, which face) and which hand: \`onRayPress(world, entity, (hit) => …)\` from
  '../ray.js' (\`hit.point\`, \`normal\`, \`hand\`, \`instanceId\`). Never a \`Raycaster\`.
- Grab: exactly ONE grab component, always with \`RayInteractable\`: \`DistanceGrabbable\` (\`movementMode:
  MovementMode.MoveFromTarget\` rides on the ray, \`MoveTowardsTarget\` flies into the hand), \`OneHandGrabbable\`
  (within reach; \`translateMin/Max\`, \`rotateMin/Max\` limits make sliders and dials). \`Grabbed\` while held.
- The hands: \`this.player.raySpaces.left/right\` (where each points), \`gripSpaces\`, \`indexTipSpaces\` (fingertips);
  \`this.input.xr.getSelectState('right')\` → { start, active, end } is the pinch. A pinch is also how the player
  talks to Punto: read it only for your own held tool.
- \`Grabbed\`, \`Pressed\`, \`Hovered\` are set by the engine: read them only.

PHYSICS (Havok) — only when something must fall, roll, bounce, be thrown or hit
- \`PhysicsBody\` ({ state: PhysicsState.Dynamic | Static | Kinematic }) + \`PhysicsShape\` ({ shape:
  PhysicsShapeType.Sphere [r,0,0] | Box [w,h,d] | Cylinder [r,h,0], restitution, friction }). Root-level entities only
  (no parent). Nothing thinner than 4 cm. \`PhysicsManipulation\` ({ force } | { linearVelocity }) applies once.
  Speed: \`entity.getVectorView(PhysicsBody, '_linearVelocity')\`. No collision callbacks: detect hits by distance in
  update(). A ball, a dart, a stone to throw: \`throwable(world, object, { radius })\` from '../throwable.js' does the
  grab, the throw and the return. Move a body back with \`world.getSystem(PhysicsSystem)!.setBodyTransform(entity, { position, quaternion })\`.

SOUND — every hit, score and press gets one
- A one-shot: \`sfx(world, group, at?, volume?)\` from '../sfx.js' (CC0, Kenney): heard from \`at\`, the place of the
  event; each play picks one variant of the group. Groups (use only these exact names):
  - hits: impactSoft_heavy, impactSoft_medium, impactPunch_heavy, impactPunch_medium, impactWood_light/medium/heavy, impactMetal_light/medium/heavy, impactMetal, impactGlass_light/medium/heavy, impactPlate_light/medium/heavy, impactPlank_medium, impactTin_medium, impactGeneric_light, impactBell_heavy, impactMining, footstep_wood/grass/snow/concrete/carpet
  - interface: click, select, confirmation, error, open, close, maximize, minimize, pluck, drop, tick, toggle, switch, glitch, scroll
  - arcade and sci-fi: powerUp, laser, zap, phaseJump, phaserUp, phaserDown, pepSound, highUp, highDown, laserSmall, laserLarge, laserRetro, explosionCrunch, lowFrequency_explosion, forceField, thrusterFire, slime, doorOpen, doorClose
  - things: handleCoins, chop, knifeSlice, bookOpen, bookFlip, creak, card-place, card-shuffle, chips-stack, dice-throw
  - jingles: jingles_NES, jingles_HIT, jingles_PIZZI, jingles_SAX, jingles_STEEL
  - announcer: ready, go, round, final_round, you_win, you_lose, game_over, new_highscore, level_up, congratulations, correct, wrong, hurry_up, time_over, 1 … 10
- A sound that lives on a thing (a loop, an engine): \`entity.addComponent(AudioSource, { src: './audio/kit/<name>.ogg',
  loop: true, volume: 0.4, positional: true })\`, \`AudioUtils.play(entity)\` / \`stop\`; names: click, tick, select,
  switch, confirmation, error, pluck, drop, bong, glass, scratch, open, close, maximize, minimize, question. Never
  \`AudioUtils.createOneShot\`.
- Music: real sampled instruments from '../music.js' — never oscillators or sfx hits. Make it when the game starts
  (it loads a second or two), not on the first touch:
  \`\`\`ts
  const piano = instrument(world, 'piano'); // 'upright piano' 'xylophone' 'marimba' 'glockenspiel' 'vibraphone' 'tubular bells' 'kalimba'
  onFingerTouch(world, key, (finger) => piano.play('E4', { velocity: velocityOf(finger), at: finger.point }));
  const drums = instrument(world, 'drums'); // kick snare rim 'high tom' 'low tom' 'floor tom' hihat 'open hihat' crash ride
  beatClock(world, 100, (step, time) => { if (step % 4 === 0) drums.play('kick', { time }); });
  \`\`\`
  The instrument itself (keys, bars, drum heads) you build each time its own way: one \`onFingerTouch\` per key, the key
  sinks a few millimetres and lights while touched; within reach, two octaves are enough.

LIMITS (Quest, 72–90 fps)
- Under 100 meshes: alike things are one \`InstancedMesh\`; at most 2 lights of your own (the room has light); NEVER
  \`transmission\` (freezes the Quest: use transparent + opacity); no text in the scene: a score goes over Punto with \`showScore(world, { Score: 12, Wave: 3 })\`
  from '../score.js'. Real planets with NASA maps: \`realPlanet('earth', { radius: 0.1 })\` from
  '../planets.js' (sun, mercury, venus, earth, moon, mars, jupiter, saturn, uranus, neptune; any other name is a grey cratered ball).
- Build what was asked, accurately, with the motion it really has — nothing added on top; everything answers the hands at once with a
  visible reaction and a sound. Original generic things only: no brands, no real people.

${FX}
READY THINGS AND PEOPLE
- A ready thing is a shortcut for a part that is just what its name says (a tree by the house, a castle in the
  diorama, a sword in a figure's hand): \`ready(name, { size })\` from '../ready.js'.
- People: always a ready figure (figures.md), never built from boxes.
- A molecule (caffeine, dopamine, glucose, aspirin, water…): \`await molecule('caffeine')\` from '../molecule.js' — the
  real one, its atoms where they are; the setup is async. Its English name; if it throws (a protein, DNA, a made-up
  one), build it yourself. Add your motion, labels or glows to its parts.

THE REAL ROOM
${roomKnow}
\`\`\`ts
${roomApi}

${READY_API}

${MOLECULE_API}

${fxApi}
\`\`\`

HELPERS SERVE THE IDEA, NOT THE OTHER WAY ROUND
- Every ready piece here — a thing from \`ready()\`, an effect from '../fx.js', a found model — is an
  offer, not an order. Picture the finished scene first: its look, scale and mood. Take a ready piece only where it
  fits that picture as it is; where it would look out of place (a faceted toy cloud in a sleek sci-fi scene, a cartoon
  fireball in a calm science model, a ready tree in another style than the rest), draw your own with Three.js.
- Mixing is fine: a ready castle with your own banners, your own spaceship with a ready \`fire\` jet. What matters is
  that the whole reads as one thing made in one hand.
- People are the one exception: always a ready figure.

EXAMPLE
\`\`\`ts
${sample}\`\`\`

BEFORE YOU ANSWER, CHECK THE FILE AGAINST THESE (the ones broken most, 18.11)
1. Meshes: under 100 drawn in all, 150 is the hard limit (above it the Quest drops to half its frame rate and the file
   is sent back). Teeth, bolts, bricks, leaves, keys, stars, many alike creatures: ONE InstancedMesh per material, never
   a Mesh each; static parts that share a material merged.
2. Entities top-down: the root first, every other entity under the entity of the group it really sits in. A thing's
   root is an entity, left at (0, 0, 0) with \`userData.stands\`; never written by your code.
3. Size: a model of something huge or tiny (a solar system, a molecule, a gearbox, a city) is sized to look at — before
   the eyes ~0.3–0.5 m across, on a table no bigger than a table — and its parts in proportion to each other (planets
   smaller than their Sun).
4. Motion you can see: an orbit, a turn, a gear — at least a few degrees a second; every number you defined is used.
5. Imports: only names that exist in '@iwsdk/core' and the modules above; every name you use is imported.
6. Played with the hands (an instrument, a panel): within reach, at hand height, no grab component, no \`stands\`.
7. On a wall, what is thrown at or aimed at (a hoop, a target, a dartboard) hangs with its centre from eye height to
   0.4 m above it, never above 2.2 m from the floor, and room-sized: a hoop with its board ~0.6 m, a target ~0.5 m
   (18.11: a 0.9 m hoop at head + 0.3 m ended under the ceiling).
8. Every condition you wrote can really come true: walk your own numbers through once. A player that stops 4 cm from
   the ball and kicks only nearer than 4 cm never kicks (18.11) — the reach to act is larger than where it stops; a
   cooldown, a timer, a speed each give a visible result within seconds; a score can be reached.
`;
