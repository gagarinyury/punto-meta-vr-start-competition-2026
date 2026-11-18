// The host helpers' declarations, made from their source (tools/coder-api.mjs). Do not edit.
declare module '../live.js' {
export function feature(meta: ImportMeta, setup: (world: World) => void | (() => void) | Promise<void | (() => void)>): void;
}

declare module '../hand.js' {
/**
* Puts a model into the player's hand, for a bare hand and for a controller.
*/
export function holdInHand(world: World, model: Object3D, options?: { side?: 'left' | 'right'; aimed?: boolean; grip?: 'fist' | 'stick'; sight?: boolean; onUse?: (shot: Shot) => void; }): () => void;
/**
* Makes a part of a held tool hit physics bodies: a racket face hits a ball,
* a hammer head knocks a tower over.
*/
export function strikeWith(world: World, part: Object3D, size: [number, number, number]): void;
/**
* Turns a downloaded model (any axes, any size, any origin) into one that
* `holdInHand` understands: handle at the origin along Y, +Y out of the fist,
* -Z forward. It reads the shape, not the file's axes.
*/
export function fitToHand(model: Object3D, options: { aimed: boolean; length: number; heavyEnd?: boolean; }): Group;
/**
* The end of a held thing's barrel or blade in the room, and (into `direction`) the way it points: the far end along
* its -Z, at the middle of its front part — a pistol's muzzle, a wand's tip, a bow's arrow rest. For a model built
* for holdInHand (barrel along -Z) or turned by fitToHand. Read once from its shape, then cheap. Shoot from here,
* never from the model's own position (that is the handle, in the middle of the hand).
*/
export function muzzleOf(model: Object3D, out: Vector3, direction?: Vector3): Vector3;
/**
* Every fingertip of both bare hands — thumb to pinky, ten of them — touching a part. `onTouch(finger)` fires when a fingertip comes into `part`,
* `onRelease(finger)` when it leaves, each finger on its own: chords, a drum roll with all fingers, two hands. With
* a controller its tip counts as one finger, and so does the end of a held stick or mallet given to strikeWith (drum
* sticks play the drums). A fast strike that goes right through a thin part between two frames counts too. `part` is a mesh (its geometry's own box, turned with it) or a group
* (its box in the room); a moving part works. `margin` grows it (metres, default 0.008). Returns: stop.
*/
export function onFingerTouch(world: World, part: Object3D, onTouch: (finger: Finger) => void, onRelease?: (finger: Finger) => void, { margin }?: { margin?: number; }): () => void;
/** Where a held thing's shot starts and where it goes (world): the far end of its barrel, along its -Z. */
export interface Shot { from: Vector3; direction: Vector3; }
/** A fingertip touching: which hand, which finger (`controller` for a controller's tip, `tool` for the striking end
*  of a held stick, mallet or bat — strikeWith), and where (world). */
export interface Finger {
hand: 'left' | 'right';
name: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' | 'controller' | 'tool';
point: Vector3;
/** how fast it came, metres a second: a soft touch ~0.2, a drum strike 1-3 (velocityOf in ../music.js) */
speed: number;
}
}

declare module '../place.js' {
/** The spot about `distance` m in front of the player's eyes, a little below them, facing the player. */
export function inFrontOfPlayer(world: World, { distance, below }?: { distance?: number; below?: number; }): Place;
/**
* The spot chosen for the thing being made (at once, see askPlace); the spot in front of the player when none was
* asked for. For the made code.
*/
export function wantedPlace(world: World): Promise<Place>;
/** Where this hand's ray meets a real wall, floor or table now; for dragging things along them. */
export function surfaceHit(side: 'left' | 'right'): Place | undefined;
/**
* Raycasts from `origin` along `direction` against the real room's walls, floor, ceiling, tables (`XRPlane`) and
* furniture (`XRMesh`, via `readFurniture`). Returns the nearest hit within `maxDistance` m (15), or `undefined`.
*/
export function roomHit(world: World, origin: Vector3, direction: Vector3, maxDistance?: number): RoomHit;
export interface Place {
/** on the real surface, world space */
point: Vector3;
/** out of the surface into the room; for 'air' toward the player */
normal: Vector3;
surface: 'wall' | 'floor' | 'table' | 'ceiling' | 'air';
/** turns a thing's front (+Z) the right way: off a wall into the room; on a floor, table or in the air toward the player */
facing: Quaternion;
/** On a table: the whole table top, metres. `point` is its centre and `facing` is square with its edges, so
*  `width` runs along the thing's x (left-right as the player sees it) and `depth` along its z (towards the player).
*  "As big as the table": build to these. */
size?: { width: number; depth: number; };
}
/** Result of raycasting against the real room (`roomHit`). */
export interface RoomHit {
/** World hit point on the real wall, floor, ceiling, table or furniture. */
point: Vector3;
/** Outward surface normal into the room. */
normal: Vector3;
surface: 'wall' | 'floor' | 'table' | 'ceiling' | 'furniture';
/** Semantic label for furniture (`couch`, `table`, `shelf`…). */
label?: string;
}
}

declare module '../ray.js' {
/**
* Calls `handler` each time the player points at `entity` (its object or any child of it) and
* pinches. Adds `RayInteractable` if the entity has none. Returns a function that stops it;
* a feature needs not call it — the listener goes away with the entity.
*/
export function onRayPress(world: World, entity: Entity, handler: (hit: RayHit) => void): () => void;
export interface RayHit {
/** The spot that was hit, in the room (world coordinates). */
point: Vector3;
/** The direction out of the surface at that spot, in the room; (0, 1, 0) when the shape has no faces. */
normal: Vector3;
/** The very mesh that was hit: the entity's own object or a child of it. */
object: Object3D;
/** For an InstancedMesh: which instance. */
instanceId?: number;
/** The hand that pinched. A mouse click on the flat screen counts as the right hand. */
hand: 'left' | 'right';
}
}

declare module '../throwable.js' {
/**
* Makes `object` a thing to throw (see the top of the file). It drops from its position at the
* moment of the call; a lost one drops from there again. Returns its entity: read `Grabbed` on
* it, or `object.position` and `getVectorView(PhysicsBody, '_linearVelocity')` to score.
*/
export function throwable(world: World, object: Object3D, options: ThrowableOptions): Entity;
export interface ThrowableOptions {
/** Radius of the sphere it collides as, metres. */
radius: number;
/** Bounciness 0..1 (default 0.8, a ball). */
bounce?: number;
/** Called when a lost one has been dropped at its first place again. */
onReturn?: () => void;
}
}

declare module '../basketball.js' {
/** A basketball of the given radius (a real one is 0.12 m), its centre at the origin. */
export function basketball(radius?: number): Mesh<SphereGeometry, MeshStandardMaterial>;
}

declare module '../score.js' {
/** Shows the game's numbers over Punto: `{ Score: 12, Wave: 3 }`, up to four, short English labels. */
export function showScore(world: World, values: Record<string, number | string>): void;
}

declare module '../sfx.js' {
/** Plays one variant of a sound group, at a point in the room if given. */
export function sfx(world: World, group: string, at?: Vector3, volume?: number): void;
}

declare module '../music.js' {
/** A finger's or a stick's speed as a velocity (1..127): a soft touch is quiet, a hard strike loud. */
export function velocityOf(finger: { speed: number; }): number;
/**
* A sampled instrument for this game; it falls silent when the game is replaced. Each instrument is heard from
* where it is played (`at`), as a real one in the room.
*/
export function instrument(world: World, name: InstrumentName): Instrument;
/**
* A steady beat for rhythm games: `onStep(step, time)` for every step (`division` steps a beat: 4 = sixteenths), a
* little ahead of time — play with `{ time }` and the notes land exactly on the beat, however the frames go. Stops
* when the game is replaced. `bpm` can be changed while it runs.
*/
export function beatClock(world: World, bpm: number, onStep: (step: number, time: number) => void, division?: 1 | 2 | 4 | 8): { bpm: number; stop(): void; readonly step: number; };
export type InstrumentName = 'piano' | 'upright piano' | 'xylophone' | 'marimba' | 'glockenspiel' | 'vibraphone' | 'tubular bells' | 'kalimba' | 'drums';
export interface Instrument {
/** A note ('C4', 60) or a chord (a list), or for the drums a part ('snare'). `velocity` 1..127 (how hard; 100 by
*  default), `at` the point it is heard from (the key, the drum), `time` an audio time from beatClock, `duration`
*  in seconds (a held note; without it the note rings out). */
play(note: string | number | (string | number)[], options?: { velocity?: number; at?: Vector3; time?: number; duration?: number; }): void;
/** Silences every note. */
stop(): void;
/** Resolves once its sounds are loaded (it may be played before: the first notes may then be silent). */
ready: Promise<void>;
}
}

declare module '../style.js' {
/** The colours of Punto's world (the front page's concept art): use them before inventing new ones. */
export const PALETTE: Record<'grass' | 'grassLight' | 'leaf' | 'leafDark' | 'pine' | 'dirt' | 'earth' | 'earthDark' | 'bark' | 'wood' | 'woodLight' | 'rock' | 'rockDark' | 'sand' | 'snow' | 'water' | 'lava' | 'cream' | 'plastic' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'pink' | 'cyan' | 'gold' | 'white' | 'black' | 'shade', number>;
/** A colour by which way a facet faces: its top, its sides, its underside (grass on top, earth on the sides). */
export const topSide: (top: number, side: number, bottom?: number) => (_c: Vector3, n: Vector3) => number;
/** A colour lit like the islands: the top as it is, the sides `dark` (0.2) darker, the underside darker still. */
export const lit: (color: number, dark?: number) => (_c: Vector3, n: Vector3) => number;
/**
* A colour a little lighter or darker per flat face rather than per triangle: both triangles of one flat face (a die's
* side, a domino, a card, a block) get the same shade, so a big face never shows a diagonal fold. Pass it to toy with
* `vary: 0`. `color` may be a colour or another pick (lit, topSide…); `vary` 0.06.
*/
export const evenFaces: (color: number | ((c: Vector3, n: Vector3) => number), vary?: number, seed?: number) => (c: Vector3, n: Vector3) => number;
/**
* Broad horizontal bands of `colors` from bottom to top over the heights `from`..`to` (a planet's stripes, a striped
* hat, a layered cake), their edges waving a little round the vertical axis (`wave`, a share of the height, 0.07).
*/
export function bands(colors: number[], from: number, to: number, options?: { wave?: number; seed?: number; }): (c: Vector3) => number;
/** A flat ring between two radii lying in the XZ plane, `thickness` thick, cut in `sides` straight facets (18). */
export function ring(inner: number, outer: number, thickness: number, sides?: number): BufferGeometry;
/**
* Big lumps and hollows over a roughly round piece centred on the origin — a potato, an asteroid, a boulder, a cloud:
* `count` broad swellings (and as many flattened sides), each up to `amount` of the radius (0.18). Call it before
* `craters().press`; small hand-cut bumps are `jitter` / `blob`'s rough, these are the big shape.
*/
export function lumps(geo: BufferGeometry, count?: number, options?: { amount?: number; seed?: number; }): BufferGeometry;
/**
* `count` craters over a roughly round piece centred on the origin (`size` radians, 0.45; `depth` share of radius, 0.08; `rim` height, 1).
*/
export function craters(count: number, options?: { size?: number; depth?: number; rim?: number; seed?: number; }): {
press(geo: BufferGeometry): BufferGeometry;
/**
* Their raised rims for a ball of `radius`: a low crooked seven-sided ring round each crater, one geometry. Pass
* the pressed `body` of a lumpy thing (an asteroid) and the rims sit on its real surface instead of the ball's.
*/
rims(radius: number, body?: BufferGeometry): BufferGeometry;
paint(color: Pick): (c: Vector3, n: Vector3) => number;
};
/**
* A turned body round the Y axis from a side profile of [radius, y] points, bottom to top — a rocket, a vase, a
* bottle, a chess piece, a lamp, a tower: `sides` straight facets round it (10; 6–8 for small things). End the profile
* at radius 0 to close a tip or a bottom.
*/
export function turned(profile: [number, number][], sides?: number): BufferGeometry;
/**
* A thick flat piece cut out along a contour of [x, y] points (in the XY plane), `thickness` thick round z = 0, its
* edges chamfered (`bevel`, a share of the thickness, 0.3) — a fin, a wing, a leaf, a sign, a blade, a star; `holes`
* (contours inside it) make a frame, a ring, a pond's bank.
*/
export function slab(points: [number, number][], thickness: number, bevel?: number, holes?: [number, number][][]): BufferGeometry;
/** A piece built upright (tip at +Y) laid along the thing, its tip forwards (−Z). */
export const forward: (geo: BufferGeometry) => BufferGeometry;
/** A slab drawn with y forwards laid flat (y becomes −Z): a wing, a fin, a deck. */
export const flat: (geo: BufferGeometry) => BufferGeometry;
/** A slab drawn with x backwards and y up stood upright along the thing (x becomes +Z): a tail fin, a crest. */
export const upright: (geo: BufferGeometry) => BufferGeometry;
/** The left side's contour from the right side's: x mirrored, the order reversed so the faces still look out. */
export const mirrored: (points: [number, number][]) => [number, number][];
/**
* Angular faceted hull from cross-sections `[z, halfWidth, top, bottom]` along Z, front (−Z) first (width 0 = closed tip) — a ship, car, boat, fish.
*/
export function hull(sections: [number, number, number, number][], options?: { shoulder?: number; }): BufferGeometry;
/** A chamfered block w × h × d set at `at` (its centre): a superstructure, a container, a pylon, a crate, a die. */
export function block(w: number, h: number, d: number, at?: [number, number, number], round?: number): BufferGeometry;
/**
* A box w × h × d round the origin with all twelve edges chamfered the same (`r` metres) and each corner cut by a small
* triangle — even from every side (an extruded bevel leaves the four edges along its depth sharp). Flat facets.
*/
export function chamferedBox(w: number, h: number, d: number, r: number): BufferGeometry;
/**
* A glowing thrust cone `length` long out of an engine of radius `r`, its narrow end at the origin and opening
* backwards (+Z): put it at the engine's back end. One of the few things that may shine; flicker its scale for thrust.
*/
export function exhaust(r: number, length: number, color?: number): Mesh;
/**
* A long leaf from the origin along +X — a palm frond, a banana leaf, a fern, a feather, a petal: `width` at its
* widest, folded along its middle (`fold`, how far the edges hang below the crease, a share of the width, 0.25),
* rising and then drooping (`rise` and `droop`, metres at its middle and its tip), cut in `segments` facets along it
* (6), pointed at the tip. Both faces are closed; the top faces up.
*/
export function leaf(length: number, width: number, options?: { fold?: number; rise?: number; droop?: number; segments?: number; }): BufferGeometry;
/**
* A thick band along a path of points — a waterfall, a river, a road, a scarf, a banner: `width` across (along `side`,
* +X by default, which must not run along the path), `thickness` through, `across` facets side to side (1; more to
* paint stripes along it). Its top faces away from `side` × the path; both ends are closed.
*/
export function ribbon(points: Vector3[], width: number, thickness: number, options?: { across?: number; side?: Vector3; }): BufferGeometry;
/** A colour by height: [y, colour] stops from low to high, blended between (a mountain: rock, then snow). */
export function byHeight(stops: [number, number][]): (c: Vector3) => number;
/**
* Any geometry as a hand-painted toy piece: each facet coloured by `color` (a colour, or a function of the
* facet's centre and normal, as lit / topSide / bands / byHeight), a little lighter or darker (`vary`, 0.08); `rough`
* (metres) bends its corners a little, as cut by hand; `shade` (0–1, ~0.3) sinks its lower part into shade. One Mesh with the shared toy material.
*/
export function toy(geo: BufferGeometry, color: Pick, finish?: Finish): Mesh;
/**
* Turns a thing built the usual way (meshes with MeshStandardMaterial colours) into the toy look in place:
* facets painted in each material's colour with a little variation, flat shading. Textured, transparent,
* glowing and skinned meshes are left as they are. Call it once, after building.
*/
export function toyLook(object: Object3D, finish?: { vary?: number; }): void;
/**
* All the toy pieces in `root` (toy, the ready shapes, toyLook) as ONE mesh: a whole tree, island or village is a
* single draw call (the frame budget counts meshes). Keeps their places; the pieces must not move on their own
* afterwards. Pieces of other materials are left out (keep them as they are).
*/
export function merge(root: Object3D, finish?: Finish): Mesh;
/** A round leafy tree `height` metres tall. */
export function roundTree(height?: number, options?: { seed?: number; leaves?: number[]; }): Mesh;
/** A pine `height` metres tall. */
export function pineTree(height?: number, options?: { seed?: number; color?: number; }): Mesh;
/** A faceted stone `size` metres across, sitting on y = 0. */
export function rock(size?: number, options?: { seed?: number; color?: number; }): Mesh;
/** A soft white cloud of a few lumps, `size` metres long, centred on the origin. One mesh. */
export function cloud(size?: number, options?: { seed?: number; color?: number; }): Mesh;
/** A floating island `radius` metres across its grass. */
export function island(radius?: number, options?: { seed?: number; grass?: number; roots?: boolean; }): Mesh;
/**
* Cartoon eyes for a creature, a person or a robot: two glossy black ovals with a white glint, `spacing` apart
* (centre to centre), each `size` tall; `whites: true` puts each on a white eyeball. Centred between the eyes,
* looking along +Z: put it on the front of a head. One mesh.
*/
export function eyes(spacing: number, size: number, options?: { whites?: boolean; color?: number; }): Mesh;
/**
* A toy wheel of radius r and width w on an axle along X (as a car's wheel stands): a dark chunky tyre with
* rounded shoulders, a coloured hub and a cap. One mesh centred on its axle: spin it with rotation.x.
*/
export function wheel(r: number, w: number, options?: { hub?: number; tyre?: number; }): Mesh;
/**
* A grass ground tile, the base of a little diorama (a house, a golf hole, a can pyramid): w × d, `height` thick,
* grass on top hanging a little over its earth sides, chamfered; `round: true` makes it a disc of diameter w.
* Its top is at y = 0. One mesh.
*/
export function ground(w: number, d: number, options?: { height?: number; grass?: number; earth?: number; round?: boolean; seed?: number; }): Mesh;
type Pick = number | ((centre: Vector3, normal: Vector3) => number);
type Finish = { vary?: number; rough?: number; seed?: number; roughness?: number; metalness?: number; emissive?: number; shade?: number; };
/** A round faceted lump (a crown of leaves, a stone, a bush). */
export function blob(radius: number, seed: number, detail?: number, rough?: number, squash?: number): BufferGeometry;
/** Glowing lines along the sharp edges of a form (the concepts' cyan wire on glass and plastic). */
export function edgeGlow(geo: BufferGeometry, color?: number, opacity?: number, angle?: number): LineSegments;
/** A glowing material that ignores light (lava, beams, sparks), optionally see-through and additive. */
export const glowMat: (color: number, opacity?: number) => MeshBasicMaterial;
/** A planet `radius` metres, centred. Parts: 'Body', 'Rings'. */
export function planet(options?: {
radius?: number;
colors?: number[];
craters?: number;
craterDepth?: number;
rings?: boolean | { inner?: number; outer?: number; colors?: number[]; };
tilt?: number;
seed?: number;
rough?: number;
detail?: number;
}): Group;
/** A ringed planet: broad red, orange and sand bands, a yellow and a blue ring. ~0.25 m radius, centred. */
export const ringedPlanet: (options?: Parameters<typeof planet>[0]) => Group;
/** A blue-grey moon with craters pressed in (dark floors, light rims). ~0.2 m radius, centred; 'Body'. */
export const moon: (options?: Parameters<typeof planet>[0]) => Group;
/** A lumpy brown asteroid with craters. `size` metres across (0.3), centred; 'Body' (tumble it). */
export function asteroid(options?: { size?: number; color?: number; seed?: number; }): Group;
/** A sun `radius` metres (0.3), centred. Parts: 'Body', 'Rays'. */
export function sun(options?: { radius?: number; color?: number; rays?: boolean; seed?: number; }): Group;
/** A toy satellite `size` metres across its panels (0.6), centred. Parts: 'Panels', 'Dish'. */
export function satellite(options?: { size?: number; seed?: number; }): Group;
/** A space station `size` metres across its panels (1.0), centred. Parts: 'Body', 'Panels', 'Dish'. */
export function spaceStation(options?: { size?: number; seed?: number; }): Group;
/** A chunky toy rocket `height` metres (0.6), standing on its fins at y = 0, the nose up. Parts: 'Flame'. */
export function rocket(options?: { height?: number; color?: number; body?: number; flame?: boolean; seed?: number; }): Group;
/** A comet `size` metres long (0.6), its icy faceted head at the origin flying towards −Z and a chunky faceted tail streaming back along +Z in a few tongues, in bands. Parts: 'Head', 'Tail'. */
export function comet(options?: { size?: number; color?: number; seed?: number; }): Group;
/** A black hole `size` metres across its mouth (0.7). Parts: 'Funnel', 'Hole'. */
export function blackHole(options?: { size?: number; seed?: number; }): Group;
/** A chunky sci-fi fighter `size` metres long (0.6), centred, nose to −Z. Parts: 'Engines', 'Muzzle'. */
export function fighter(options?: ShipOptions): Group;
/** A fast scout `size` metres long (0.5), nose to −Z. */
export function scout(options?: ShipOptions): Group;
/** A cruiser `size` metres long (1.0), nose to −Z. */
export function cruiser(options?: ShipOptions): Group;
/** A mothership `size` metres long (1.4), nose to −Z. */
export function mothership(options?: ShipOptions): Group;
/** An alien flying saucer `size` metres across (0.6), centred. */
export function alienSaucer(options?: ShipOptions): Group;
/** A cargo hauler `size` metres long (0.9), nose to −Z. */
export function cargoHauler(options?: ShipOptions): Group;
/** A drone `size` metres across its rotors (0.5), centred, front to −Z. Parts: 'Rotors'. */
export function drone(options?: ShipOptions): Group;
/** A space battleship `size` metres long (1.2), nose to −Z. */
export function battleship(options?: ShipOptions): Group;
/** Every 'Muzzle' of a ship: where its shots leave. */
export const muzzlesOf: (ship: Object3D) => Object3D[];
/** A ship's options: its length in metres, its main and accent colours, a seed. */
export interface ShipOptions { size?: number; color?: number; accent?: number; seed?: number; }
/** Leaves lit like the islands: lime on top, green on the sides, dark green underneath. */
export const leaves: (top?: number, side?: number, under?: number) => (_c: Vector3, n: Vector3) => number;
/** An oak tree `height` metres tall (1.2). Parts: 'Tree'. */
export function oakTree(height?: number, options?: { seed?: number; leaves?: [number, number, number]; }): Group;
/** A palm tree `height` metres tall (1.4). Parts: 'Tree'. */
export function palmTree(height?: number, options?: { seed?: number; lean?: number; }): Group;
/** A chunky daisy head `radius` metres across its petals, facing up (+Y), its middle at the origin. */
export function blossom(radius: number, color: number, middle?: number, petals?: number, seed?: number): Group;
/** A flower patch `size` metres across (0.35). Parts: 'Flowers'. */
export function flowers(size?: number, options?: { seed?: number; colors?: number[]; }): Group;
/** One mushroom `height` metres tall standing on y = 0. */
export function mushroom(height: number, cap: number, color: number, options?: { dots?: boolean; shape?: 'dome' | 'flat'; seed?: number; }): Group;
/** A cluster of six mushrooms `size` metres across (0.3) on y = 0. Parts: 'Mushrooms'. */
export function mushrooms(size?: number, options?: { seed?: number; }): Group;
/** A mountain `height` metres tall (0.6) on y = 0. Parts: 'Mountain'. */
export function mountain(height?: number, options?: { seed?: number; snow?: boolean; }): Group;
/** Rock lit like the concepts' cliffs: warm rust where the light falls, dark grey-brown in the shade, lighter tops. */
export const cliff: (warm?: number, cool?: number) => (_c: Vector3, n: Vector3) => number;
/** A waterfall `height` metres tall (0.5) on y = 0, facing +Z. Parts: 'Water', 'Rocks'. */
export function waterfall(height?: number, options?: { seed?: number; }): Group;
/** A volcano `height` metres tall (0.5) on y = 0. Parts: 'Lava', 'Smoke', 'Volcano'. */
export function volcano(height?: number, options?: { seed?: number; }): Group;
/** Mountain rock: cool blue-grey on one side, warm mauve-grey on the other, darker low down. */
export const stone: (height: number, cool?: number, warm?: number) => (c: Vector3, n: Vector3) => number;
/** A cave `size` metres across (0.6) on y = 0, its mouth facing +Z. Parts: 'Cave'. */
export function cave(size?: number, options?: { seed?: number; }): Group;
/** A campfire `size` metres across (0.4) on y = 0. Parts: 'Fire', 'Sparks', 'Campfire'. */
export function campfire(size?: number, options?: { seed?: number; }): Group;
/** A pond `size` metres across (0.6) on y = 0. Parts: 'Water', 'Bank'. */
export function pond(size?: number, options?: { seed?: number; }): Group;
/** A sword `size` metres long (0.75), its grip's middle at the origin and its blade up +Y. Parts: 'Blade'. */
export function sword(options?: { size?: number; steel?: number; gem?: number; }): Group;
/** A recurve bow `size` metres tall (0.8), held in the left hand: its grip at the origin, its limbs up and down bending back towards the player and flicking forward at the tips. Parts: 'String', 'Arrow', 'Muzzle'. */
export function bow(options?: { size?: number; wood?: number; wrap?: number; }): Group;
/** A slingshot `size` metres tall (0.24), its handle at the origin and its fork up +Y. Parts: 'Pouch', 'Stone', 'Muzzle'. */
export function slingshot(options?: { size?: number; wood?: number; band?: number; }): Group;
/** A round shield `size` metres across (0.5), held in the left hand: its handle at the origin, its face looking along −Z. Parts: 'Face'. */
export function shield(options?: { size?: number; field?: number; metal?: number; }): Group;
/** A magic wand `size` metres long (0.36), aimed: its grip at the origin, the shaft running forward along −Z. Parts: 'Tip', 'Muzzle'. */
export function wand(options?: { size?: number; shaft?: number; metal?: number; }): Group;
/** A war hammer `size` metres long (0.45), its handle at the origin and its head up +Y. Parts: 'Head'. */
export function hammer(options?: { size?: number; head?: number; wood?: number; }): Group;
/** A flashlight `size` metres long (0.24), aimed: its grip at the origin, its lens forward along −Z. Parts: 'Beam', 'Lens', 'Muzzle'. */
export function flashlight(options?: { size?: number; color?: number; beam?: number; reach?: number; }): Group;
/** A fishing rod `size` metres long (1.0), its grip at the origin and the rod up +Y bending forward. Parts: 'Reel', 'Line', 'Bobber'. */
export function fishingRod(options?: { size?: number; grip?: number; wood?: number; }): Group;
/** An archery target `size` metres across its face (0.6), on a wooden easel, its face looking +Z, its middle at `height` (0.55). Parts: 'Face'. */
export function bullseyeTarget(options?: { size?: number; height?: number; colors?: number[]; }): Group;
/** Which ring of a bullseyeTarget a hit at `point` (in the room) falls in: 0 the bullseye … rings − 1 the outer, −1 a miss. */
export const bullseyeRing: typeof targetRing;
/** A tin can `height` metres tall (0.12), standing on y = 0. */
export function can(options?: { height?: number; color?: number; stripe?: number; seed?: number; }): Mesh;
/** A pyramid of cans to knock down, on a little floating grass block. Parts: userData.cans, 'Ground'. */
export function canPyramid(options?: { rows?: number; height?: number; seed?: number; }): Group;
/** A dart `length` metres long (0.15), pointing along −Z with its tip at the origin. */
export function dart(options?: { length?: number; color?: number; }): Mesh;
/** A dartboard `size` metres across (0.45), its face looking +Z, its middle at `height` (0.4). Parts: 'Darts', 'Face'. */
export function dartboard(options?: { size?: number; height?: number; darts?: boolean; }): Group;
/** The score of a dart stuck at `point` (in the room) in a dartboard: 50 the bull, 25 the outer bull, × 3 / × 2 rings, 0 a miss. */
export function dartScore(board: Object3D, point: Vector3): number;
/** A basketball hoop, its rim `height` metres up (1.6) and reaching towards +Z. Parts: 'Rim', 'Net', userData.rim. */
export function basketballHoop(options?: { height?: number; frame?: number; }): Group;
/** A bowling pin `height` metres tall (0.38), standing on y = 0. */
export function bowlingPin(options?: { height?: number; stripe?: number; seed?: number; }): Mesh;
/** Ten bowling pins in a triangle on the end of a wooden lane. Parts: userData.pins, 'Lane'. */
export function bowlingPins(options?: { height?: number; }): Group;
/** A football `radius` metres (0.11). */
export function soccerBall(options?: { radius?: number; }): Mesh;
/** A football goal `width` metres wide (1.5), its mouth facing +Z. Parts: 'Ball', userData.mouth. */
export function soccerGoal(options?: { width?: number; ball?: boolean; }): Group;
/** A table-tennis paddle `size` metres long (0.26), its handle at the origin and its blade up +Y (in the hand's axes: hold it with holdInHand). Parts: 'Blade'. */
export function paddle(options?: { size?: number; color?: number; }): Group;
/** A small ball `radius` metres (0.02, a table-tennis ball). */
export function smallBall(options?: { radius?: number; color?: number; }): Mesh;
/** A table-tennis table `length` metres long (2.2) along Z, its top at 0.76 m. Parts: 'Top', 'Net'. */
export function pingPongTable(options?: { length?: number; extras?: boolean; }): Group;
/** A golf green `size` metres across (0.8) on y = 0. Parts: 'Green', 'Flag', userData.hole. */
export function golfHole(options?: { size?: number; flag?: number; seed?: number; }): Group;
/** A boxing glove `size` metres long (0.28), its cuff at the origin and the fist up +Y (in the hand's axes). Parts: 'Glove'. */
export function boxingGlove(options?: { size?: number; color?: number; cuff?: number; seed?: number; }): Mesh;
/** A punching bag `size` metres tall (0.9) hanging from the top of its chain at the origin, everything below it. Parts: 'Bag'. */
export function punchingBag(options?: { size?: number; color?: number; band?: number; }): Group;
/** A trophy `size` metres tall (0.35) on y = 0. Parts: 'Trophy'. */
export function trophy(options?: { size?: number; gold?: number; base?: number; }): Group;
/** Turns every 'Wheel' of a vehicle by the distance it rolled (metres). */
export function rollWheels(vehicle: Object3D, distance: number): void;
/** A toy car `size` metres long (0.4), nose to −Z. */
export function car(options?: { size?: number; color?: number; }): Group;
/** A toy pickup truck `size` metres long (0.42), nose to −Z. */
export function truck(options?: { size?: number; color?: number; }): Group;
/** A toy school bus `size` metres long (0.55), nose to −Z. */
export function bus(options?: { size?: number; color?: number; }): Group;
/**
* A spoked wheel of radius `r` and width `w`, its axle along X, standing on nothing (place it): a rim, `spokes` spokes
* and a hub, all in `color` (a train's, a cart's, a bicycle's). One mesh named 'Wheel' (rollWheels turns it).
*/
export function spokedWheel(r: number, w: number, options?: { color?: number; spokes?: number; }): Mesh;
/** A toy airplane `size` metres long (0.5), nose to −Z, standing on its wheels. Parts: 'Propeller'. */
export function airplane(options?: { size?: number; color?: number; }): Group;
/** A toy helicopter `size` metres long (0.55), nose to −Z, standing on its skids. Parts: 'Rotor', 'TailRotor'. */
export function helicopter(options?: { size?: number; color?: number; }): Group;
/** A toy motor boat `size` metres long (0.5), its bow to −Z, its waterline at y = 0. Parts: 'Motor'. */
export function boat(options?: { size?: number; color?: number; }): Group;
/** A toy submarine `size` metres long (0.5), bow to −Z, floating centred. Parts: 'Periscope', 'Screw'. */
export function submarine(options?: { size?: number; color?: number; }): Group;
/** A toy tank `size` metres long (0.5), its gun to −Z. Parts: 'Barrel', 'Muzzle', 'Turret'. */
export function tank(options?: { size?: number; colors?: number[]; }): Group;
/** A toy cruiser motorcycle `size` metres long (0.42), its front wheel to −Z. Parts: 'Handlebar'. */
export function motorcycle(options?: { size?: number; color?: number; }): Group;
/**
* A gable roof `width` wide (along X) over a `depth` deep house, `height` tall, its eaves at y = 0: a red ridge roof
* with rows of tiles down both slopes, overhanging a little. One Group of toy pieces (merge it with the house).
*/
export function gableRoof(width: number, depth: number, height: number, color?: number): Group;
/** A cottage on a grass tile `size` metres wide (0.5). Parts: 'Door'. */
export function house(options?: { size?: number; walls?: number; roof?: number; ground?: boolean; }): Group;
/**
* Battlements along the top of a wall `length` long (along X), `thickness` thick: merlons (teeth) `size` tall with
* gaps between, standing on y = 0. A Group of toy pieces.
*/
export function battlements(length: number, thickness: number, size: number, color?: number): Group;
/** A pointed four-sided roof `width` across and `height` tall in `color`, an orange finial on top, its foot at y = 0. */
export function pyramidRoof(width: number, height: number, color?: number): Group;
/** A castle on a grass tile `size` metres wide (0.6). Parts: 'Gate'. */
export function castle(options?: { size?: number; stone?: number; roof?: number; ground?: boolean; }): Group;
/** A cone roof of `tiers` overlapping tiled rings, `radius` at its eaves and `height` tall, `sides` facets round, a finial. */
export function tieredRoof(radius: number, height: number, color?: number, sides?: number, tiers?: number): Group;
/** A stone watchtower `size` metres across its base (0.35). Parts: 'Door'. */
export function tower(options?: { size?: number; stone?: number; roof?: number; }): Group;
/** A lighthouse `size` metres across its island (0.4). Parts: 'Light'. */
export function lighthouse(options?: { size?: number; color?: number; }): Group;
/** A windmill on a round grass tile `size` metres wide (0.45). Parts: 'Sails'. */
export function windmill(options?: { size?: number; wood?: number; ground?: boolean; }): Group;
/** A stone arch bridge over a river on a grass tile `size` metres wide (0.6), the river running along Z and the bridge across X. Parts: 'Water'. */
export function bridge(options?: { size?: number; stone?: number; }): Group;
/** A camping tent on a grass tile `size` metres wide (0.5), its open front to +Z. Parts: 'Fire'. */
export function tent(options?: { size?: number; colors?: [number, number]; ground?: boolean; }): Group;
/** A market stall `size` metres wide (0.5), its counter facing +Z, standing on y = 0 without a tile unless `ground: true`. */
export function marketStall(options?: { size?: number; colors?: [number, number]; ground?: boolean; }): Group;
/** A sandstone temple on a sand tile `size` metres wide (0.5), its front to +Z. */
export function temple(options?: { size?: number; stone?: number; ground?: boolean; }): Group;
/** A portal gate `size` metres wide (0.5), facing +Z. Parts: 'Portal'. */
export function portalGate(options?: { size?: number; stone?: number; swirl?: number[]; }): Group;
/** One chess piece standing on y = 0, `height` metres tall for a king (0.075; the others in proportion). */
export function chessPiece(kind: ChessKind, side: 'white' | 'black', height?: number): Mesh;
/** Where the middle of a chess square ('a1' … 'h8') lies on a chessBoard of `square` metres (white's rank 1 at +Z). */
export function chessSquare(name: string, square?: number): Vector3;
/**
* A chessboard of 8 × 8 squares `square` metres each (0.045), cream and charcoal, each square flat in one colour,
* set in a thick wooden frame with a raised rim of lighter wood; the squares' top at y = 0.
*/
export function chessBoard(square?: number): Mesh;
/** A chess set. */
export function chessSet(options?: { square?: number; }): Group;
/** A die `size` metres across (0.03), its centre at the origin (stand it at y = size / 2). */
export function die(size?: number, color?: number, pip?: number): Mesh;
/** The value a die shows on top (the face pointing most upwards in the world): read a throw once it rests. */
export function dieValue(die: Object3D): number;
/** The turn that lays a die with `value` on top (copy it into die.quaternion). */
export function dieRotation(value: number): Quaternion;
/** A pair of dice (or `count`) lying a little apart, each its own mesh named 'Die 1', 'Die 2'… with a different value up. */
export function dice(count?: number, size?: number): Group;
/** A playing card (63 × 88 mm, a toy 3 mm thick), its centre at the origin, its face towards +Z and its top up (+Y). Parts: 'A hearts'. */
export function playingCard(suit: Suit, rank?: number, size?: number): Mesh;
/**
* Cards fanned as held in a hand: each turned about a pivot below its bottom middle by `spread` radians (0.2) from
* the next, shifted a little sideways and set a little behind it (the first card at the back, left). The cards keep their own meshes and names.
*/
export function cardFan(cards: Mesh[], spread?: number): Group;
/** A tower of wooden blocks to pull out one by one. */
export function blockTower(options?: { layers?: number; length?: number; pulled?: number; seed?: number; }): Group;
/** A building brick `w` × `d` studs (2 × 4), `pitch` metres a stud (0.016 — twice a real one, to take in the hand), 1.2 pitches tall, its origin at its bottom middle. Parts: 'Brick 2x4'. */
export function brick(w?: number, d?: number, color?: number, pitch?: number): Mesh;
/** A brick's height for `pitch` (stack: the next brick's y is this much higher). */
export const brickHeight: (pitch?: number) => number;
/**
* Snaps a brick's position onto the stud grid (in place; returns it): x and z to whole pitches, or half pitches when
* the brick is odd along that side (`w`, `d` as built and turned a quarter or not), y to whole brick heights.
*/
export function brickSnap(position: Vector3, w?: number, d?: number, pitch?: number, turnedQuarter?: boolean): Vector3;
/** A small pile of bricks as in the concept: red, blue and yellow 2×4s and 2×2s stacked across each other, each its own mesh. */
export function brickPile(pitch?: number): Group;
/** A jigsaw puzzle of `cols` × `rows` pieces (3 × 2) that fit together. Parts: userData.home. */
export function jigsaw(options?: { cols?: number; rows?: number; size?: number; seed?: number; }): Group;
/** A domino `length` long (0.064; half as wide, a sixth as thick), its centre at the origin, lying face up (+Y) and long along X. */
export function domino(a: number, b: number, length?: number, color?: number, pip?: number): Mesh;
/** A chain of `count` dominoes (12) standing on end along a gentle S-curve on y = 0, each `spacing` (0.6 of a length) behind the last, face to face, random values. Parts: 'Domino k'. */
export function dominoChain(count?: number, length?: number, spacing?: number, seed?: number): Group;
/** A spinning top `height` metres tall (0.12), standing on its tip at the origin. Parts: 'Spinning Top'. */
export function spinningTop(height?: number): Mesh;
/** A 3 × 3 × 3 puzzle cube `size` metres across (0.075), its centre at the origin. */
export function puzzleCube(options?: { size?: number; scramble?: number; seed?: number; }): Group;
/** The cubies of a puzzle cube now in layer `layer` (−1, 0, 1) along `axis`: parent them to a pivot to animate a turn. */
export function cubeLayer(cube: Object3D, axis: 'x' | 'y' | 'z', layer: number): Object3D[];
/** Turns a puzzle cube's layer a quarter turn (`dir` 1 anticlockwise looking down the axis, −1 clockwise) at once, snapping each cubie to the grid. */
export function turnLayer(cube: Object3D, axis: 'x' | 'y' | 'z', layer: number, dir?: number): void;
/** A treasure chest `width` metres wide (0.5; 0.32 deep), standing on y = 0, its front towards +Z. Parts: 'Treasure', 'Lid'. */
export function treasureChest(options?: { width?: number; open?: number; treasure?: boolean; }): Group;
export type ChessKind = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
/**
* The themes a hafted thing comes in: 'classic' as drawn (each thing its own colours), 'toy' bright plastic, 'iron'
* dark wood and grey iron, 'gold' a royal purple haft with gold, 'crystal' a violet haft with a glowing crystal head.
*/
export const HAFT_THEMES: {
toy: { haft: number; metal: number; edge: number; accent: number; };
iron: { haft: number; metal: number; edge: number; accent: number; };
gold: { haft: number; metal: number; edge: number; accent: number; };
crystal: { haft: number; metal: number; edge: number; accent: number; };
};
/**
* A wooden haft from `bottom` to `top` (metres up Y from the grip at the origin), `r0` thick at the bottom tapering
* to `r1`, bowed a little (`bow`, metres towards −Z at its middle; 0 straight), six-sided; a knob at its foot
* (`knob`, 0 none). Shared by every hafted thing; also for a haft of your own (a flag pole, a staff, a halberd).
*/
export function haft(bottom: number, top: number, r0: number, r1: number, options?: { bow?: number; knob?: number; }): BufferGeometry[];
/** A band of cord or leather wound round a haft of radius `r` at height `y`, `h` tall: a binding, a grip wrap. */
export const band: (y: number, r: number, h: number) => BufferGeometry;
/** An axe `size` metres long (0.55), in the hand's axes. Parts: 'Handle', 'Head', 'Edge'. */
export function axe(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A pickaxe `size` metres long (0.7), in the hand's axes. Parts: 'Handle', 'Head', 'Tip'. */
export function pickaxe(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A shovel `size` metres long (0.95), held by its D-grip at the origin. Parts: 'Handle', 'Head', 'Edge'. */
export function shovel(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A garden rake `size` metres long (1.1), held near the foot of its haft at the origin. Parts: 'Handle', 'Head', 'Tip'. */
export function rake(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A broom `size` metres long (0.92), held near the foot of its stick at the origin. Parts: 'Handle', 'Head', 'Tip'. */
export function broom(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A spear `size` metres long (1.2), held at its balance point at the origin. Parts: 'Handle', 'Head', 'Tip'. */
export function spear(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A trident `size` metres long (1.15), held at its balance point at the origin. Parts: 'Handle', 'Head', 'Tip'. */
export function trident(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A mace `size` metres long (0.62), its grip at the origin. Parts: 'Handle', 'Head'. */
export function mace(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A scythe `size` metres long (0.85), its grip at the origin. Parts: 'Handle', 'Head', 'Edge', 'Tip'. */
export function scythe(options?: { size?: number; theme?: HaftTheme; }): Group;
/** A torch `size` metres long (0.5), its grip at the origin. Parts: 'Fire', 'Tip', 'Handle', 'Head'. */
export function torch(options?: { size?: number; theme?: HaftTheme; lit?: boolean; }): Group;
export type HaftTheme = 'classic' | keyof typeof HAFT_THEMES;
}

declare module '../instruments.js' {
/**
* Makes every part of an instrument play: a fingertip (or a stick given to strikeWith) touching a part plays its
* note, as loud as the touch was fast, heard from the part; the part sinks a few millimetres and glows while
* touched. Load the sounds now (the first second may be silent). Everything stops with the game. Returns the
* sampled instruments it plays, by sound name, for playing them from code too (a demo tune, a beat).
*/
export function playInstrument(world: World, built: Built, options?: { sink?: number; onPlay?: (part: Part) => void; }): Map<Sound, Instrument>;
/**
* A compact analog synthesizer: two octaves of keys between red wooden cheeks, a sloped panel with a glowing
* waveform screen, two sliders and ten coloured knobs. ~0.42 × 0.11 × 0.34 m, for a table.
*/
export function synth(options?: { from?: string; to?: string; sound?: Sound; }): Built;
/**
* A drum machine: a 4 × 4 grid of soft lit rubber pads (5 cm, the drum kit and six marimba notes), a screen, a
* fader and three knobs on a graphite body. ~0.32 × 0.05 × 0.3 m, for a table.
*/
export function pads(options?: { sounds?: [string, Sound][]; }): Built;
/**
* A toy xylophone: one row of honey-coloured wooden bars (C major by default, C5–E6) on a dark red trapezoid
* frame, two mallets resting on it. ~0.55 × 0.07 × 0.3 m, for a table. `sharps: true` adds the black-key row.
*/
export function xylophone(options?: { from?: string; to?: string; sharps?: boolean; }): Built;
/** A concert marimba: rosewood bars in two rows over silver resonators, on a dark frame with casters. C3–C5. */
export function marimba(options?: { from?: string; to?: string; }): Built;
/**
* A glockenspiel in its open wooden case: bright steel bars in two rows on red felt, the lid standing open
* behind them, two mallets. C6–C7, ~0.33 × 0.22 m, for a table.
*/
export function glockenspiel(options?: { from?: string; to?: string; }): Built;
/** A vibraphone: aluminium bars over golden resonators with their fan discs, a motor and a sustain pedal. F3–F5. */
export function vibraphone(options?: { from?: string; to?: string; }): Built;
/** A kalimba: a wooden box with a sound hole and 17 steel tines over a bridge, longest in the middle. ~0.18 × 0.15 m. */
export function kalimba(options?: { tines?: string[]; }): Built;
/** A five-piece drum kit with hi-hat, crash and ride. ~1.5 × 1.3 × 1.1 m, on the floor. */
export function drumKit(): Built;
/** What the host can sound, as a part names it. */
export type Sound = 'piano' | 'upright piano' | 'xylophone' | 'marimba' | 'glockenspiel' | 'vibraphone' | 'tubular bells' | 'kalimba' | 'drums';
}

declare module '../fx.js' {
/**
* How big a thing is, metres — the longest side of its box. The `size` most effects ask for is the size of the thing
* they happen to: `play(world, poof({ size: sizeOf(thing) }), thing)`.
*/
export function sizeOf(thing: Object3D | { object3D?: Object3D | null; }): number;
/**
* One-shot explosion at `spot` (`size` = thing width, m). Heaviest effect: one at a time.
*/
export function explosion(o?: { size?: number; seed?: number; }): Fx;
/**
* One-shot dust ring at a thing's foot (`size` = thing width, m; `color` = ground tone).
*/
export function dust(o?: { size?: number; color?: number; seed?: number; }): Fx;
/**
* One-shot shatter: breaks `of` into coloured pieces (play with no target, then dispose `of`), or use `size` + `colors` at `spot`. `count` pieces (16).
*/
export function shatter(o?: {
of?: Object3D | { object3D?: Object3D | null; };
size?: number;
colors?: number[];
color?: number;
count?: number;
seed?: number;
}): Fx;
/**
* One-shot poof when something appears or vanishes (`size` = thing width, m; `color` puffs; `stars: false` for none).
*/
export function poof(o?: { size?: number; color?: number; stars?: boolean; seed?: number; }): Fx;
/**
* Endless flame along +Y (`size` = burner width, m; `palette`: 'fire'|'plasma'|'magic'|'acid'|'ice'; `above` surface height, m; `glow: false` no light).
*/
export function fire(o?: { size?: number; palette?: 'fire' | 'plasma' | 'magic' | 'acid' | 'ice'; above?: number; glow?: boolean; seed?: number; }): Fx;
/**
* Endless tapering trail behind a moving target: `play(world, trail({ size, color, length }), target)`. `size` = target width, m; `length` seconds (0.3).
*/
export function trail(o?: { size?: number; color?: number; length?: number; }): Fx & { follow(point: Vector3): void; };
/**
* One-shot lightning bolt (`size` = length, m; `color` rim; `mark` scorch seconds, 6). Default strikes `spot` from `size` above; or `to` local / `from`+`to` world.
*/
export function lightning(o?: { from?: Vector3; to?: Vector3; size?: number; color?: number; mark?: number; seed?: number; }): Fx;
/**
* Shows an effect in the game:
* - `play(world, fx, point)` — at a world `Vector3`
* - `play(world, fx, point, normal)` — oriented so local `+Y` aligns with `normal` (walls, ceilings, slopes!)
* - `play(world, fx, entityOrObject3D)` — parented to it, or auto-tracking its world position (`trail`)
*/
export function play(world: World, fx: Fx, at?: Vector3 | Entity | Object3D, normal?: Vector3): { stop(): void; };
/** One effect, made by an effect function; show it with play(). */
export interface Fx { object: Object3D; }
/**
* Endless halo + light pool below (`size` = source width, m; `above` height over surface, m; `halo` 0.3..1; `flicker` 0..1; `pulse` 0..1).
*/
export function light(o?: { size?: number; color?: number; above?: number; halo?: number; flicker?: number; pulse?: number; seed?: number; }): Fx;
/**
* Endless rising smoke/steam along +Y (`size` = mouth width, m; `color` 0x55525c dark smoke; `opacity` 0.75; `wind` lean along +X in heights, 0.3; `height` in sizes, 6; `thin` 0..1; `pace` seconds, 3; `faceted: false` heavy).
*/
export function smoke(o?: { size?: number; color?: number; opacity?: number; faceted?: boolean; wind?: number; height?: number; thin?: number; count?: number; pace?: number; seed?: number; }): Fx;
/**
* Fountain/hose jet along +Y (endless, or `burst: true` one-shot splash). `size` = spout width, m; `height` in sizes (4); `spread` 0..1; `above` height over landing surface, m; `pace` climb s (0.32).
*/
export function spray(o?: { size?: number; color?: number; height?: number; spread?: number; above?: number; count?: number; pace?: number; burst?: boolean; seed?: number; }): Fx;
/**
* One-shot confetti burst along +Y (~4 s, for a win). `size` = burst width, m (rises 1.3×); `above` height over landing surface, m; `count` scraps (48).
*/
export function confetti(o?: { size?: number; colors?: number[]; count?: number; above?: number; life?: number; seed?: number; }): Fx;
/**
* One-shot impact sparks + scorch (`play(world, impact({ size }), point, normal)`). `size` = blow width, m; `mark` scorch seconds (6; 0 none); `endless: true` continuous sparks.
*/
export function impact(o?: { size?: number; color?: number; mark?: number; endless?: boolean; seed?: number; }): Fx;
/**
* Endless steady beam (`play(world, ray)` once with no target, then `ray.aim(from, to)` and `ray.on = true/false`). `size` = scale (1 room, 0.3 table); `sparks: false` none.
*/
export function laser(o?: { size?: number; color?: number; sparks?: boolean; }): Laser;
/**
* Endless pooled shots (`play(world, gun)` once with no target, then `gun.fire(from, direction)`). Hits `targets` (`onHit`) and room surfaces (`onRoom`).
*/
export function shots(o?: ShotsOptions): Shots;
export interface Laser extends Fx {
/** From where to where it runs, in the space the effect's object is in; call it whenever either end moves. */
aim(from: Vector3, to: Vector3): void;
/** Whether it shines now. */
on: boolean;
}
export interface ShotsOptions {
kind?: ShotKind;
/** its colour: a bolt's and an orb's glow (0x5ad8ff), the bullet's tracer (warm) */
color?: number;
/** the scale of the shot: 1 for a pistol in the room, 0.25 for ships on a table */
size?: number;
/** metres a second for size 1: slow enough to see (bullet 22, bolt 12, orb 8, rocket 7) */
speed?: number;
/** what it can hit — each thing's own box, turned as the thing is: your array or Set, read every frame (add and remove targets in it as the game goes), or a function that gives the list */
targets?: Iterable<ShotTarget> | (() => Iterable<ShotTarget>);
/** called once for each hit of a target: the target as you gave it, the point and the way out of it, in the world */
onHit?: (target: ShotTarget, point: Vector3, normal: Vector3) => void;
/** whether it also lands on the real room's walls, tables and floor (true); `onRoom` is called then */
room?: boolean;
onRoom?: (point: Vector3, normal: Vector3) => void;
/** how far it flies when it hits nothing, in sizes (12) */
range?: number;
/** how many can fly at once (12): the oldest is taken when all are flying */
count?: number;
/** seconds the mark of a hit stays (bullet, bolt, orb): 6; 0 for none — keep it short for rapid fire */
mark?: number;
}
export interface Shots extends Fx {
/** Fires one: from where it leaves the barrel, the way it goes — in the space the effect's object is in. */
fire(from: Vector3, direction: Vector3): void;
}
export type ShotKind = 'bullet' | 'bolt' | 'orb' | 'rocket';
/** Something a shot can hit: an object of the scene, or an entity (its object3D). */
export type ShotTarget = Object3D | { object3D?: Object3D | null; };
/**
* Endless rising bubbles along +Y (`size` = source width, m; `color` tint; `height` climb in sizes, 2.5; `pace` seconds, 2.2; `count` 14).
*/
export function bubbles(o?: { size?: number; color?: number; height?: number; count?: number; pace?: number; seed?: number; }): Fx;
/**
* One-shot fireworks along +Y (~5 s, for a win). `size` = show scale, m (0.5 table, 1.5 room; bursts at 1.3–1.9× up); `shots` rockets (5).
*/
export function fireworks(o?: { size?: number; colors?: number[]; shots?: number; seed?: number; }): Fx;
/**
* Endless blinking stars around a thing (`size` = thing width, m; `color` pale gold; `count` 7).
*/
export function sparkle(o?: { size?: number; color?: number; count?: number; seed?: number; }): Fx;
/**
* Endless weather cloud placed ON the surface below (`kind`: 'rain'|'storm'|'snow'; `size` = cloud width, m; `height` above surface, 0.9× size).
*/
export function weather(o?: { kind?: 'rain' | 'storm' | 'snow'; size?: number; height?: number; seed?: number; }): Fx;
/**
* Endless 3D "pick me up / important item" aura around an object `size` metres wide:
* Fresnel halo shell + two counter-orbiting stereo comet rings + rising sparkles.
*/
export function outlineGlow({ color, size }?: { color?: number; size?: number; }): Fx;
/**
* Clean spatial XR goal / drop-zone / placement marker (`size` = radius in metres).
* High-contrast dark-backed ring on local y = 0 + soft 3D light crown + hovering 3D chevron pointer (`▼`).
* Call `.pulse()` to trigger a bright confirmation wave when an item/ball enters!
*/
export function targetRing({ color, size }?: { color?: number; size?: number; }): Fx & { pulse(): void; };
/** World-scale molten basalt floor on local y = 0 (`coverFloor`-ready, never stretches) + rising embers. */
export function lava({ width, depth, color }?: { width?: number; depth?: number; color?: number; }): Fx;
/**
* Natural clear water surface on local y = 0 (`coverFloor`-ready, never over-glows).
* Call `.drop(x, z)` in local metres for interactive expanding wave rings.
*/
export function water({ width, depth, color }?: { width?: number; depth?: number; color?: number; }): Fx & { drop(x: number, z: number): void; };
/**
* Covers the whole real floor with a surface effect: lava, water, mist.
*/
export function coverFloor<T extends Fx>(world: World, make: (width: number, depth: number) => T, onReady?: (surface: T) => void): void;
}

declare module '../models.js' {
/**
* Plays the clips that come with a downloaded model (walk, run, idle…).
* Pass the same `AssetManager.getGLTF(id)` copy whose scene went into
* `fitModel`. `play('walk')` switches to the clip with that short name
* (case does not matter; otherwise the first name containing it), blending
* over a quarter of a second. `clips` lists the short names. It stops with
* the game.
*/
export const animateModel: typeof animate;
/**
* Takes one named part out of a downloaded model made of several things (a ball that comes with
* its hoop, one tree of five) and returns it as a thing of its own, ready for `fitModel`. The
* part keeps the size and turn it had inside the model. Take parts out BEFORE fitting the rest.
*/
export function takePart(model: Object3D, name: string): Group;
/**
* Turns a downloaded model (any size, any origin) into one of real size that
* stands on whatever it is put on: the longest side becomes `length` metres,
* and the origin moves to the centre of the model's bottom. The file's axes
* stay as they are (glTF: +Y is up); where its front is, the file does not say.
*/
export function fitModel(model: Object3D, options: { length: number; }): Group;
}

declare module '../creature.js' {
export interface Walker {
entity: Entity;
/** Walk across the real floor to the spot nearest to `target`, around the furniture. False if there is no way. */
goTo(target: Vector3): boolean;
/** Stroll to a random free spot of the floor. */
wander(): void;
/** Come up to the player and stop beside their feet, in view, without walking through their legs. */
comeToPlayer(): boolean;
/** Run to a spot where real furniture stands between the creature and the player. False if there is none. */
hide(): boolean;
/** Walk up to a real piece of furniture ('couch', 'table', 'bed', ...) and hop onto it. False if the room has none. */
jumpOn(label: string): boolean;
/** True while standing still: time to decide what to do next. */
readonly idle: boolean;
/** True while sitting on top of furniture. */
readonly perched: boolean;
}
/**
* Makes a creature live in the real room: it walks on the real floor, goes
* around real furniture, hides behind it and hops onto it.
*/
export function walkInRoom(world: World, body: Object3D, { speed, radius, hop }: { speed?: number; radius?: number; hop?: number; }, onReady: (walker: Walker) => void): void;
}

declare module '../tabletop.js' {
export interface Board {
/** Parent for everything in the small world: `world.createTransformEntity(thing, board.root)`. */
root: Entity;
/** Size of the play area in the game's own units, as asked. */
width: number;
depth: number;
/** How many metres one game unit is. */
unit: number;
/** False when no table was found and the board lies on the floor. */
onTable: boolean;
/** The real table top (or the free floor) under the board, metres: x across, z towards the player. */
metres: { width: number; depth: number; };
}
/**
* A small world on the player's real table.
*/
export function tabletop(world: World, { width, depth, on, fill }: { width: number; depth: number; on?: 'table' | 'floor'; fill?: boolean; }, onReady: (board: Board) => void): void;
}

declare module '../breakroom.js' {
export interface BreakableRoom {
/** Where a ray (a shot, a thrown thing) meets a real wall, ceiling or floor. */
hit(origin: Vector3, direction: Vector3): { point: Vector3; normal: Vector3; } | undefined;
/**
* Smashes the real wall or ceiling around a world point: pieces fly into the
* room and the sky shows through. Returns false where nothing can break
* (the floor, the bottom 0.75 m of walls, already broken places).
*/
breakAt(point: Vector3, radius?: number): boolean;
/** Everything broken so far flies back into place and the walls are whole again; resolves when done. */
repair(): Promise<void>;
/** Takes the breakable room away (masks, sky, pieces): a whole room looks the same without it. */
dispose(): void;
}
/**
* Makes the real walls and ceiling breakable, piece by piece, anywhere.
*/
export function breakableRoom(world: World, sky: Sky, onReady: (room: BreakableRoom) => void): void;
}

declare module '../outside.js' {
export interface Portal {
/** World position of the hole's centre, on the real surface. */
centre: Vector3;
/** Unit vector from the surface into the room: things fly out along it. */
normal: Vector3;
/** Half the size of the opening. A crack is much narrower than it is long. */
radius: number;
color: number;
}
/**
* Opens finished portals in the real room and calls `onOpen` once they exist.
*/
export function openPortals(world: World, requests: {
wall: Wall;
shape?: Opening;
color?: number;
radius?: number;
sky?: Sky; /** preferred spot on that surface (world) */
at?: Vector3;
}[], onOpen: (portals: Portal[]) => void): void;
/**
* A sky is built from layers; every layer is optional except the colours.
* Colours are hex numbers. Mix freely: a green sun over a red sea, a storm
* with stars, two-colour gas clouds over a planet.
*/
export interface SkyRecipe {
/** Sky colour straight up, at the horizon, and straight down (default: as up). */
colors: [top: number, horizon: number, bottom?: number];
/** Twinkling stars, 0..1. */
stars?: number;
/** Glowing gas clouds of two colours; amount 0..1 (0.3 a faint milky way, 1 fills the sky). */
nebula?: { colors: [number, number]; amount?: number; };
/** A sun, moon or planet seen straight through the portal. height: -0.2 (below the horizon) .. 1 (overhead); size: 1 = our sun, 6 = a huge planet. */
sun?: { color?: number; height?: number; size?: number; };
/** Drifting clouds. cover 0..1 (0.5 scattered, 1 overcast); below: also a sea of clouds under the horizon. */
clouds?: { color?: number; shadow?: number; cover?: number; below?: boolean; };
/** Water below the horizon, with the sun's path on it. */
sea?: number;
/** Land outside at the level of the real floor, in two colours: grass and earth, sand and rock, snow and ice. */
ground?: [number, number];
/** Dark shapes along the horizon. */
skyline?: { kind: 'mountains' | 'forest' | 'city'; color?: number; };
/** Northern lights: colour near the horizon and colour high up. */
aurora?: [low: number, high: number];
/** Flashes of lightning of this colour. */
lightning?: number;
/** How fast everything moves (default 1). */
speed?: number;
}
/** Ready skies. Use by name, or spread one and change a layer: `{ ...SKY.sunset, sea: 0x400000 }`. */
export const SKY: Record<'space' | 'nebula' | 'clouds' | 'sunset' | 'storm' | 'meadow' | 'city' | 'aurora', SkyRecipe>;
export type Wall = 'front' | 'back' | 'left' | 'right' | 'ceiling' | 'floor';
/**
* 'round' a neat portal; 'crack' a long thin fissure; 'breach' a chunk knocked
* out of the wall; 'burst' a star-shaped impact; 'corner' a piece broken out
* where the wall meets the ceiling. All but 'round' come out different every time.
*/
export type Opening = 'round' | 'crack' | 'breach' | 'burst' | 'corner';
export type Sky = keyof typeof SKY | SkyRecipe;
}

declare module '../furniture.js' {
/**
* Reads a detected XRMesh as furniture, or returns undefined for the mesh of
* the whole room.
*/
export function readFurniture(entity: Entity): Furniture | undefined;
/**
* Is this detected plane a part of the room itself — the floor, the ceiling or
* a wall — and not a table top, a picture or a window?
*/
export function isRoomSurface(plane: Mesh): boolean;
/** One real piece of furniture as an upright box, the same on every device. */
export interface Furniture {
label: string;
/** World position of the box's centre. */
centre: Vector3;
/** Turn of the box around the vertical axis only. */
quaternion: Quaternion;
/** Size along the box's own x, up, z — in metres. */
size: Vector3;
/** Height of its top above the world's zero. */
top: number;
}
}

declare module '../planets.js' {
/**
* A real planet with NASA's map on it (public domain), `radius` in metres.
* The Sun glows by itself; Earth has clouds and a thin blue air; Saturn has
* its rings. The equator is horizontal; spin it with
* `planet.rotation.y += delta * speed` and tilt it with `rotation.z`.
*/
export const realPlanet: typeof planet;
}

declare module '../figures.js' {
/**
* A ready figure by name, in Punto's look, one mesh: figure('pirate'), figure('zombie', { height: 1.7 }),
* figure('knight', { face: 'angry', colors: { shirt: 'blue' } }). An unknown name throws with the list.
*/
export function figure(name?: string, options?: FigureOptions): Figure;
/** Poses the figure for this moment of an animation: call it every frame in update() with the time in seconds. */
export function animate(fig: Figure, anim?: FigureAnim, time?: number): void;
/** Turns the head (within its limits) and, beyond them, the body towards a point in the scene. Call after animate(). */
export function lookAt(fig: Figure, point: Vector3): void;
export interface FigureOptions {
/** An adult's height in the units of the world it stands in: 1 on a tabletop board (one game unit, the default), 1.7 in the room (metres). A kid comes out smaller by itself. */
height?: number;
face?: FigureFace;
colors?: Partial<Record<'shirt' | 'jeans' | 'boot' | 'skin' | 'hair' | 'belt', FigureColor>>;
/** Replaces the shared toy material (it must use vertex colours). */
material?: Material;
}
/** A figure: feet at y = 0, facing +Z. Put a thing into a hand with `fig.userData.joints.HandRight.add(thing)`. */
export interface Figure extends Group {
userData: { joints: Record<FigureJoint, Object3D>; outfit: string | null; stride: number; walk: string; };
}
/** idle, walk (the figure's own gait: a zombie shambles), run, sit, hold (both hands forward), wave, jump, shamble, aim (right arm straight forward), strike (overhead swing). */
export type FigureAnim = 'idle' | 'walk' | 'run' | 'sit' | 'hold' | 'wave' | 'jump' | 'shamble' | 'aim' | 'strike';
export type FigureFace = 'smile' | 'happy' | 'surprised' | 'angry' | 'zombie' | 'skull';
/** A colour by name (red, dark red, orange, yellow, green, dark green, light blue, blue, dark blue, purple, pink, white, grey, dark grey, black, brown, light brown, beige, gold, silver, turquoise) or 0xRRGGBB. */
export type FigureColor = string | number;
export type FigureJoint = 'Root' | 'Body' | 'Torso' | 'Head' | 'ArmRight' | 'ArmLeft' | 'ForearmRight' | 'ForearmLeft' | 'HandRight' | 'HandLeft' | 'LegRight' | 'LegLeft' | 'ShinRight' | 'ShinLeft' | 'CoatRight' | 'CoatLeft' | 'SkirtRight' | 'SkirtLeft';
}
