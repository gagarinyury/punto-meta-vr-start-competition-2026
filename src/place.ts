import {
  AdditiveBlending,
  Box3,
  type BoxGeometry,
  createSystem,
  DoubleSide,
  EnvironmentRaycastTarget,
  eq,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Path,
  PlaneGeometry,
  Quaternion,
  Ray,
  RaycastSpace,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  type Entity,
  type World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { readFurniture } from './furniture.js';
import { dust, play } from './fx.js';
import { sfx } from './sfx.js';

/**
 * Where the player wants a thing (13.11). "Hang a picture on the wall": Punto asks the player to
 * point there and pinch, and the coder starts writing at the same moment. The spot does not go
 * into the coder's request: the made code asks for it when it runs, `await wantedPlace(world)`,
 * and by then the player has usually pointed. A change of the thing gets the same spot again.
 * Nobody pointed (or nobody was asked): the spot in front of the player.
 */
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
  size?: { width: number; depth: number };
}

/** A real table top, square with its edges and turned to the player's side of it (see pickTable). */
export interface Table {
  /** the centre of the top, on its surface */
  centre: Vector3;
  /** +Z towards the player, square with the table's edges */
  facing: Quaternion;
  /** along the facing's x (across, as the player sees it) and z (towards the player), metres */
  width: number;
  depth: number;
}

const FOOT_OUT = 0.6; // m out from a wall: where a flat thing shown on that wall is put down on the floor
let asked = false;
let chosen: Place | undefined;
// which request the chosen spot belongs to (18.11, the host puts a thing built at the origin: src/gamehandle.ts) —
// a spot kept from an earlier request, or from storage after a reload, is not this request's
let requests = 0;
let chosenFor = -1;
let creations = 0;
let waiting: ((place: Place) => void)[] = [];
let giveUp: ReturnType<typeof setTimeout> | undefined;
let onPicked: ((place: Place) => void) | undefined;
let wantedKind: Wanted = 'any'; // the surface the thing belongs on (the director's, or the creation's own shape)
// the mark on the chosen spot while the thing is being built there
let building: { stop(): void } | undefined;

// "It is being built here": a thin cyan ring on the surface and a softer one that keeps spreading
// out from it, like a ping (Punto's face colour; nothing mystic).
function buildMark(point: Vector3, normal: Vector3): { stop(): void } {
  const mark = new Group();
  mark.position.copy(point).addScaledVector(normal, 0.008);
  mark.quaternion.setFromUnitVectors(FRONT, normal);
  const look = (opacity: number) =>
    new MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const ring = new Mesh(new RingGeometry(0.1, 0.112, 64), look(0.9));
  const ping = new Mesh(new RingGeometry(0.1, 0.106, 64), look(0.6));
  ring.raycast = ping.raycast = () => {};
  mark.add(ring, ping);
  const start = performance.now();
  ring.onBeforeRender = () => {
    const t = ((performance.now() - start) / 1400) % 1;
    ping.scale.setScalar(1 + t * 1.2);
    (ping.material as MeshBasicMaterial).opacity = 0.6 * (1 - t);
    ring.scale.setScalar(1 + 0.04 * Math.sin((performance.now() - start) / 180));
  };
  scene?.add(mark);
  return {
    stop() {
      mark.removeFromParent();
      for (const mesh of [ring, ping]) {
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
    },
  };
}
let scene: Group | import('@iwsdk/core').Scene | undefined;
let buildingTimeout: ReturnType<typeof setTimeout> | undefined;

/** The thing has come (or failed): the circle on its spot goes. */
export function placeDone(): void {
  building?.stop();
  building = undefined;
  clearTimeout(buildingTimeout);
}

const FRONT = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const head = new Vector3();
const look = new Vector3();

/** Turns a thing's front toward the head, upright. */
function towardHead(point: Vector3): Quaternion {
  look.subVectors(head, point).setY(0);
  if (look.lengthSq() < 1e-6) look.set(0, 0, 1);
  return new Quaternion().setFromUnitVectors(FRONT, look.normalize());
}

// ---- which table: the one the player looked at when they began to say it (Yury, 17.11) ----
// "Put it on the table" is said looking at that table, and the director's answer comes 2-3 s later, when the
// player may have turned to Punto already. So the gaze is kept from the moment a voice came on the microphone
// (phraseBegins), and a request takes it as it starts (requestBegins). Every table the room has counts the
// same — no sizes or heights left out (a low table is a table too, Yury) — and the nearest to that gaze wins.
const heardEye = new Vector3();
const heardGaze = new Vector3();
let heardAt = -Infinity;
const askedEye = new Vector3();
const askedGaze = new Vector3();
let askedSet = false;
// the whole gaze, up and down too: looking down at a chest of drawers is not looking up at the shelf over it
const levelGaze = (world: World, eye: Vector3, gaze: Vector3) => {
  world.camera.getWorldPosition(eye);
  world.camera.getWorldDirection(gaze).normalize();
};
// What things are put on: a table first, a shelf (a chest of drawers is scanned as one) when it is looked at
// rather than the table — `extra` is how much further off the gaze it counts, in radians.
const PUT_ON: Record<string, number> = { table: 0, shelf: 0.3 };

/** A voice came on the microphone: where the player looks now is where "there" is in what they are saying. */
export function phraseBegins(world: World): void {
  levelGaze(world, heardEye, heardGaze);
  heardAt = performance.now();
}

/** A request starts: its table is the one looked at when the phrase began (or now, without a fresh phrase). */
export function requestBegins(world: World): void {
  requests++;
  if (performance.now() - heardAt < 20_000) {
    askedEye.copy(heardEye);
    askedGaze.copy(heardGaze);
  } else levelGaze(world, askedEye, askedGaze);
  askedSet = true;
  tableOfThis = undefined;
}

// The tables this creation has stood on (Yury, 17.11: with three tables "on the other table" must not take it back
// and forth between two of them), and the one chosen for the request going on.
const tablesBeen: Vector3[] = [];
let tableOfThis: Table | undefined;

/** A new creation: it has stood on no table yet. */
export function newCreation(): void {
  creations++;
  tablesBeen.length = 0;
  // A new thing has no spot from an earlier one (18.11, genxr-bench: a sand table, a garden and a beer-pong table each
  // went onto the far wall chosen two requests before, through wantedPlace). A spot chosen in this same request stays.
  if (chosenFor !== requests) {
    chosen = undefined;
    asked = false;
    try {
      localStorage.removeItem(KEPT); // nor after a reload
    } catch {}
  }
}

/** The creation stands on this table now (see newCreation). */
export function tableUsed(table: Table): void {
  if (!tablesBeen.some((been) => been.distanceTo(table.centre) < 0.15)) tablesBeen.push(table.centre.clone());
}

/** The table chosen for the request going on ("on the table", "on the other table"), if one was. */
export function tableOfRequest(): Table | undefined {
  return tableOfThis && { ...tableOfThis, centre: tableOfThis.centre.clone(), facing: tableOfThis.facing.clone() };
}

const tableUp = new Vector3();
const tableX = new Vector3();
const tableZ = new Vector3();
const toTable = new Vector3();
const basis = new Matrix4();

/** Of the room's tables (and shelves), the one nearest to where the player looked (see requestBegins). The
 *  headset's planes first (their tops are exact); with none, its furniture boxes. `except`: not the ones whose
 *  centres are there (the tables the thing has stood on, for "on the other table"). */
export function pickTable(world: World, planes: Iterable<Entity>, furniture: Iterable<Entity> = [], except: Vector3[] = []): Table | undefined {
  const eye = new Vector3();
  const gaze = new Vector3();
  if (askedSet) {
    eye.copy(askedEye);
    gaze.copy(askedGaze);
  } else levelGaze(world, eye, gaze);
  // angle off the gaze first, distance second: the table looked at, not the one sat at
  const score = (centre: Vector3, label: string | undefined) => {
    const extra = PUT_ON[label ?? ''];
    if (extra === undefined || except.some((been) => been.distanceTo(centre) < 0.15)) return Infinity;
    toTable.copy(centre).sub(eye);
    const far = toTable.length();
    return (far < 1e-3 ? 0 : Math.acos(Math.max(-1, Math.min(1, toTable.dot(gaze) / far)))) + 0.1 * far + extra;
  };
  let best: { centre: Vector3; turn: Quaternion; sizeX: number; sizeZ: number } | undefined;
  let bestScore = Infinity;
  for (const entity of planes) {
    const label = (entity.getValue(XRPlane, '_plane') as { semanticLabel?: string } | undefined)?.semanticLabel;
    if (label === undefined || PUT_ON[label] === undefined) continue;
    const plane = entity.object3D as Mesh | undefined;
    const size = (plane?.geometry as BoxGeometry | undefined)?.parameters;
    if (!plane || !size) continue;
    plane.updateWorldMatrix(true, false);
    const centre = plane.getWorldPosition(new Vector3());
    const s = score(centre, label);
    if (s >= bestScore) continue;
    bestScore = s;
    best = { centre, turn: plane.getWorldQuaternion(new Quaternion()), sizeX: size.width, sizeZ: size.depth };
  }
  if (!best) {
    for (const entity of furniture) {
      const piece = readFurniture(entity);
      if (!piece) continue;
      const centre = piece.centre.clone().setY(piece.top);
      const s = score(centre, piece.label);
      if (s >= bestScore) continue;
      bestScore = s;
      best = { centre, turn: piece.quaternion.clone(), sizeX: piece.size.x, sizeZ: piece.size.z };
    }
  }
  if (!best) return undefined;
  // Of the table's four sides, the one nearest to the player faces them (as tabletop.ts did)
  tableUp.set(0, 1, 0);
  tableX.set(1, 0, 0).applyQuaternion(best.turn).setY(0).normalize();
  tableZ.set(0, 0, 1).applyQuaternion(best.turn).setY(0).normalize();
  world.camera.getWorldPosition(head);
  toTable.copy(head).sub(best.centre).setY(0).normalize();
  const alongX = Math.abs(tableX.dot(toTable)) > Math.abs(tableZ.dot(toTable));
  const towards = (alongX ? tableX : tableZ).clone();
  if (towards.dot(toTable) < 0) towards.negate();
  const across = new Vector3().crossVectors(tableUp, towards);
  const facing = new Quaternion().setFromRotationMatrix(basis.makeBasis(across, tableUp, towards));
  return {
    centre: best.centre,
    facing,
    width: alongX ? best.sizeZ : best.sizeX,
    depth: alongX ? best.sizeX : best.sizeZ,
  };
}

/** The chosen table lights up along its edges: a cyan band that breathes, with a faint glow over the top. Until
 *  `stop()`; `fadeAfter` s: it fades out by itself. */
export function glowTable(world: World, table: Table, fadeAfter?: number): { stop(): void } {
  const mark = new Group();
  mark.position.copy(table.centre).addScaledVector(UP, 0.006);
  mark.quaternion.copy(table.facing);
  const w = table.width / 2;
  const d = table.depth / 2;
  const band = Math.min(0.025, Math.min(w, d) * 0.15);
  const outer = new Shape([new Vector2(-w, -d), new Vector2(w, -d), new Vector2(w, d), new Vector2(-w, d)]);
  outer.holes.push(
    new Path([new Vector2(-w + band, -d + band), new Vector2(-w + band, d - band), new Vector2(w - band, d - band), new Vector2(w - band, -d + band)]),
  );
  const look = (opacity: number) =>
    new MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const edge = new Mesh(new ShapeGeometry(outer).rotateX(-Math.PI / 2), look(0.9));
  const top = new Mesh(new PlaneGeometry(table.width, table.depth).rotateX(-Math.PI / 2), look(0.12));
  edge.raycast = top.raycast = () => {};
  mark.userData.occlude = false;
  mark.add(top, edge);
  const start = performance.now();
  edge.onBeforeRender = () => {
    const t = (performance.now() - start) / 1000;
    const fade = fadeAfter === undefined ? 1 : Math.max(0, Math.min(1, fadeAfter + 1 - t));
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    (edge.material as MeshBasicMaterial).opacity = (0.55 + 0.4 * pulse) * fade;
    (top.material as MeshBasicMaterial).opacity = (0.06 + 0.1 * pulse) * Math.min(1, t * 2) * fade;
  };
  world.scene.add(mark);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    if (!mark.parent) return;
    mark.removeFromParent();
    for (const mesh of [edge, top]) {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
  };
  if (fadeAfter !== undefined) timer = setTimeout(stop, (fadeAfter + 1.2) * 1000);
  return { stop };
}

/** The spot about `distance` m in front of the player's eyes, a little below them, facing the player. */
export function inFrontOfPlayer(world: World, { distance = 1, below = 0.15 } = {}): Place {
  // not through a wall: closer to the player when the room's wall ahead is nearer than that (0.4 m short of it, at
  // least 0.6 m from the eyes). Behind a wall the depth occlusion hid it — the dancers came and went (15.11)
  const wall = wallAheadOf?.();
  world.camera.getWorldPosition(head);
  if (wall) distance = Math.max(0.6, Math.min(distance, Math.hypot(wall.point.x - head.x, wall.point.z - head.z) - 0.4));
  world.camera.getWorldDirection(look).setY(0);
  if (look.lengthSq() < 1e-6) look.set(0, 0, -1);
  const point = head.clone().addScaledVector(look.normalize(), distance);
  point.y = head.y - below;
  const normal = head.clone().sub(point).setY(0).normalize();
  return { point, normal, surface: 'air', facing: towardHead(point) };
}

/**
 * The spot chosen for the thing being made (at once, see askPlace); the spot in front of the player when none was
 * asked for. For the made code.
 */
export function wantedPlace(world: World): Promise<Place> {
  if (chosen) return Promise.resolve(copy(chosen));
  if (!asked) return Promise.resolve(inFrontOfPlayer(world));
  return new Promise((resolve) => waiting.push(resolve));
}

/** Punto asks the player to point: the next pinch on the real room is the spot. */
export function askPlace(world: World, picked?: (place: Place) => void, kind: Wanted = 'any'): void {
  asked = true;
  chosen = undefined;
  onPicked = picked;
  wantedKind = kind;
  clearTimeout(giveUp);
  // Nothing is waited for (Yury, 18.11: «ждать не должно ничего»): the surface of the wanted kind the player looked
  // at when the phrase began is taken at once and marked; with none, the spot in front of the player. A table lights
  // up whole, a wall or a floor gets the "being built here" ring. "On the other wall" moves it later (placeElsewhere).
  const looked = lookedAt?.(kind);
  const spot = looked ?? inFrontOfPlayer(world);
  console.info(`[place] at once (wanted: ${kind}): ${looked ? `the ${looked.surface} looked at` : 'in front of the player'}`);
  choose(spot);
  placeDone();
  scene = world.scene;
  if (spot.surface === 'table' && spot.size) {
    building = glowTable(world, { centre: spot.point, facing: spot.facing, width: spot.size.width, depth: spot.size.depth });
  } else if (looked) {
    building = buildMark(spot.point, spot.normal);
  }
  buildingTimeout = setTimeout(placeDone, 90_000);
}

/** The spot chosen for the request going on now (looked at or pointed at), or undefined. */
export function spotOfThisRequest(): Place | undefined {
  return chosen && chosenFor === requests ? copy(chosen) : undefined;
}

/** The real surface of that kind the player looked at when the request began (a table: the whole top; none: the
 *  floor ahead), or the wall ahead; undefined before the room is known or with no such wall. */
export function surfaceLookedAt(kind: 'table' | 'floor' | 'wall'): Place | undefined {
  return lookedAt?.(kind);
}

/** How many new creations ("make") this page has begun: a change or a reload keeps the number. */
export function creationCount(): number {
  return creations;
}

/** The spot chosen last (undefined if none was pointed). */
export function chosenPlace(): Place | undefined {
  return chosen && copy(chosen);
}

// Where each hand's ray meets the real room now, square with the room's planes (see startPlacing).
let hitOf: ((side: 'left' | 'right') => Place | undefined) | undefined;

let nearOf: ((point: Vector3, reach: number) => Place | undefined) | undefined;
// Nobody pointed: the real surface of that kind the player faces (see startPlacing).
let lookedAt: ((kind: Wanted) => Place | undefined) | undefined;
// "On the other table / wall": the next surface of that kind (see startPlacing).
let otherOf: ((kind: 'table' | 'wall' | 'floor') => { place: Place; again: boolean } | undefined) | undefined;

/**
 * "On the other table", "on that wall": the creation's next spot, chosen and shown now — a table it has not stood on
 * yet, the nearest to where the player looked (once it has stood on all of them, the round begins again: `again`);
 * the wall the player looks at, not the one it hangs on. Undefined when there is no other. The made code takes the
 * spot when it runs again (wantedPlace, tabletop).
 */
export function placeElsewhere(world: World, kind: 'table' | 'wall' | 'floor'): { place: Place; again: boolean } | undefined {
  const found = otherOf?.(kind);
  if (!found) return undefined;
  const { place } = found;
  console.info(`[place] elsewhere: the ${place.surface} at ${place.point.toArray().map((v) => v.toFixed(2)).join(', ')}${found.again ? ' (every one had it: round again)' : ''}`);
  asked = true;
  choose(place);
  placeDone();
  scene = world.scene;
  building = place.size
    ? glowTable(world, { centre: place.point, facing: place.facing, width: place.size.width, depth: place.size.depth })
    : buildMark(place.point, place.normal);
  buildingTimeout = setTimeout(placeDone, 30_000);
  return { place: copy(place), again: found.again };
}

/** The nearest room wall along the level gaze (set up with the room's planes): none before the headset has them. */
let wallAheadOf: (() => Place | undefined) | undefined;
/** The kind of surface a request names (the director's `surface`). */
export type Wanted = 'wall' | 'table' | 'floor' | 'any';

/** The real wall, table or floor a thing at `point` stands on or hangs against (within `reach` m), if any. */
export function surfaceNear(point: Vector3, reach = 0.15): Place | undefined {
  return nearOf?.(point, reach);
}

/** Where this hand's ray meets a real wall, floor or table now; for dragging things along them (src/handle.ts). */
export function surfaceHit(side: 'left' | 'right'): Place | undefined {
  return hitOf?.(side);
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

const roomCaches = new WeakMap<World, { planes: Set<Entity>; furniture: Set<Entity> }>();
const hitRay = new Ray();
const hitDir = new Vector3();
const hitInv = new Matrix4();
const hitMat = new Matrix4();
const hitBox = new Box3();
const hitLocal = new Vector3();
const hitWorld = new Vector3();
const hitNormal = new Vector3();
const hitBestPoint = new Vector3();
const hitBestNormal = new Vector3();
const ZERO = new Vector3();
const ONE = new Vector3(1, 1, 1);

/**
 * Raycasts from `origin` along `direction` against the real room's walls, floor, ceiling, tables (`XRPlane`) and
 * furniture (`XRMesh`, via `readFurniture`). Returns the nearest hit within `maxDistance` m (15), or `undefined`.
 */
export function roomHit(world: World, origin: Vector3, direction: Vector3, maxDistance = 15): RoomHit | undefined {
  if (direction.lengthSq() < 1e-12) return undefined;
  let cache = roomCaches.get(world);
  if (!cache) {
    const own = { planes: new Set<Entity>(), furniture: new Set<Entity>() };
    cache = own;
    roomCaches.set(world, own);
    world.registerSystem(
      class RoomHitQuery extends createSystem({
        planes: { required: [XRPlane] },
        furniture: { required: [XRMesh], where: [eq(XRMesh, 'isBounded3D', true)] },
      }) {
        init(): void {
          this.cleanupFuncs.push(
            this.queries.planes.subscribe('qualify', (e) => own.planes.add(e), true),
            this.queries.planes.subscribe('disqualify', (e) => own.planes.delete(e)),
            this.queries.furniture.subscribe('qualify', (e) => own.furniture.add(e), true),
            this.queries.furniture.subscribe('disqualify', (e) => own.furniture.delete(e)),
          );
        }
      },
    );
  }
  hitDir.copy(direction).normalize();
  let bestDist = maxDistance;
  let bestSurface: RoomHit['surface'] | undefined;
  let bestLabel: string | undefined;

  for (const entity of cache.planes) {
    const plane = entity.object3D as Mesh | undefined;
    const flat = plane?.geometry;
    if (!plane?.parent || !flat) continue;
    if (!flat.boundingBox) flat.computeBoundingBox();
    plane.updateWorldMatrix(true, false);
    hitInv.copy(plane.matrixWorld).invert();
    hitRay.origin.copy(origin).applyMatrix4(hitInv);
    hitRay.direction.copy(hitDir).transformDirection(hitInv);
    if (flat.boundingBox!.containsPoint(hitRay.origin) || !hitRay.intersectBox(flat.boundingBox!, hitLocal)) continue;
    hitWorld.copy(hitLocal).applyMatrix4(plane.matrixWorld);
    const dist = hitWorld.distanceTo(origin);
    if (dist >= bestDist) continue;
    hitNormal.set(0, hitRay.origin.y >= 0 ? 1 : -1, 0).transformDirection(plane.matrixWorld);
    bestDist = dist;
    bestPoint();
    bestSurface = hitBestNormal.y > 0.7 ? (hitBestPoint.y < 0.25 ? 'floor' : 'table') : hitBestNormal.y < -0.7 ? 'ceiling' : 'wall';
    bestLabel = undefined;
  }

  for (const entity of cache.furniture) {
    const piece = readFurniture(entity);
    if (!piece) continue;
    hitMat.compose(piece.centre, piece.quaternion, ONE);
    hitInv.copy(hitMat).invert();
    hitRay.origin.copy(origin).applyMatrix4(hitInv);
    hitRay.direction.copy(hitDir).transformDirection(hitInv);
    hitBox.setFromCenterAndSize(ZERO, piece.size);
    if (hitBox.containsPoint(hitRay.origin) || !hitRay.intersectBox(hitBox, hitLocal)) continue;
    hitWorld.copy(hitLocal).applyMatrix4(hitMat);
    const dist = hitWorld.distanceTo(origin);
    if (dist >= bestDist) continue;
    const ax = Math.abs(hitLocal.x) / (piece.size.x * 0.5 || 1);
    const ay = Math.abs(hitLocal.y) / (piece.size.y * 0.5 || 1);
    const az = Math.abs(hitLocal.z) / (piece.size.z * 0.5 || 1);
    if (ax >= ay && ax >= az) hitNormal.set(Math.sign(hitLocal.x) || 1, 0, 0);
    else if (ay >= az) hitNormal.set(0, Math.sign(hitLocal.y) || 1, 0);
    else hitNormal.set(0, 0, Math.sign(hitLocal.z) || 1);
    hitNormal.applyQuaternion(piece.quaternion);
    bestDist = dist;
    bestPoint();
    bestSurface = 'furniture';
    bestLabel = piece.label;
  }

  if (!bestSurface) return undefined;
  return { point: hitBestPoint.clone(), normal: hitBestNormal.clone(), surface: bestSurface, ...(bestLabel && { label: bestLabel }) };
}

function bestPoint(): void {
  hitBestPoint.copy(hitWorld);
  hitBestNormal.copy(hitNormal);
}

/** True while Punto waits for the player to point. */
export function placeAsked(): boolean {
  return asked && !chosen;
}

/** How far `b` is from the plane of `a`, along `a`'s normal (the same wall: ~0). */
function toRoomOf(a: Place, b: Place): number {
  return look.copy(b.point).sub(a.point).dot(a.normal);
}

function copy(place: Place): Place {
  const copied: Place = { point: place.point.clone(), normal: place.normal.clone(), surface: place.surface, facing: place.facing.clone() };
  if (place.size) copied.size = { ...place.size };
  return copied;
}

// The chosen spot outlives a page load: the made thing on the wall calls wantedPlace() again when
// it loads or is changed, and without this it came back in front of the player (13.11).
const KEPT = 'punto.place';
try {
  const kept = JSON.parse(localStorage.getItem(KEPT) ?? 'null') as
    | { point: number[]; normal: number[]; surface: Place['surface']; facing: number[]; size?: Place['size'] }
    | null;
  if (kept) {
    chosen = {
      point: new Vector3().fromArray(kept.point),
      normal: new Vector3().fromArray(kept.normal),
      surface: kept.surface,
      facing: new Quaternion().fromArray(kept.facing),
    };
    if (kept.size) chosen.size = kept.size;
  }
} catch {
  /* no storage: the spot lives until the page goes */
}

function choose(place: Place): void {
  chosen = place;
  chosenFor = requests;
  if (place.surface === 'table' && place.size) {
    tableOfThis = { centre: place.point.clone(), facing: place.facing.clone(), width: place.size.width, depth: place.size.depth };
    tableUsed(tableOfThis);
  }
  try {
    localStorage.setItem(
      KEPT,
      JSON.stringify({ point: place.point.toArray(), normal: place.normal.toArray(), surface: place.surface, facing: place.facing.toArray(), size: place.size }),
    );
  } catch {
    /* no storage */
  }
  clearTimeout(giveUp);
  const resolvers = waiting;
  waiting = [];
  for (const resolve of resolvers) resolve(copy(place));
  onPicked?.(copy(place));
  onPicked = undefined;
}

/** Catches the pinch while Punto waits: where that hand's ray meets the real room. Started once by Punto
 *  (with its feature's world: the markers and the system go when Punto's feature reloads). */
export function startPlacing(world: World): void {
  // the SDK's environment raycast moves each marker to where that hand's ray meets a real surface
  const markers = (['left', 'right'] as const).map((side) => {
    const marker = new Group();
    marker.userData.occlude = false;
    world
      .createTransformEntity(marker)
      .addComponent(EnvironmentRaycastTarget, { space: side === 'left' ? RaycastSpace.Left : RaycastSpace.Right });
    return { side, marker };
  });
  const normal = new Vector3();
  const turn = new Quaternion();
  const local = new Vector3();
  const planeNormal = new Vector3();
  // The ray's hit gives a rough normal (on a real Quest wall it was 29° off, 13.11, and the thing
  // went half into the wall). The room's own planes are exact: a plane within a few cm of the hit,
  // with the hit inside it, gives the normal.
  let lastGap = 0; // how far the point was from the plane snapToPlane found
  const snapToPlane = (planes: Iterable<{ object3D?: unknown }>, point: Vector3, reach = 0.12): Vector3 | undefined => {
    let best: Vector3 | undefined;
    let bestGap = reach;
    for (const entity of planes) {
      const plane = entity.object3D as Mesh | undefined;
      const size = (plane?.geometry as BoxGeometry | undefined)?.parameters;
      if (!plane || !size) continue;
      plane.updateWorldMatrix(true, false);
      planeNormal.set(0, 1, 0).applyQuaternion(plane.getWorldQuaternion(turn));
      local.copy(point);
      plane.worldToLocal(local);
      const gap = Math.abs(local.y);
      if (gap < bestGap && Math.abs(local.x) < size.width / 2 + 0.1 && Math.abs(local.z) < size.depth / 2 + 0.1) {
        bestGap = gap;
        lastGap = gap;
        best = planeNormal.clone();
      }
    }
    return best;
  };
  let planeEntities: Iterable<{ object3D?: unknown }> = [];
  let furnitureEntities: Iterable<unknown> = [];
  const read = (side: 'left' | 'right'): (Place & { exact: boolean }) | undefined => {
    const marker = markers.find((one) => one.side === side)!.marker;
    if (!marker.visible) return undefined;
    const point = marker.getWorldPosition(new Vector3());
    normal.copy(UP).applyQuaternion(marker.getWorldQuaternion(turn));
    const exact = snapToPlane(planeEntities, point);
    if (exact) normal.copy(exact);
    world.camera.getWorldPosition(head);
    // a hit's normal can point out of the room (the Quest floor does): turn it to the player's side
    if (normal.dot(head.clone().sub(point)) < 0) normal.negate();
    const surface: Place['surface'] =
      normal.y > 0.7 ? (point.y < 0.25 ? 'floor' : 'table') : normal.y < -0.7 ? 'ceiling' : 'wall';
    const facing = surface === 'wall' ? new Quaternion().setFromUnitVectors(FRONT, normal) : towardHead(point);
    return { point, normal: normal.clone(), surface, facing, exact: !!exact };
  };
  hitOf = read;
  // Nobody pointed: aim for them. A level ray from the eyes along the gaze; the nearest room wall
  // it meets (within 6 m) is the spot, at eye height.
  const eyes = new Vector3();
  const gaze = new Vector3();
  const from = new Vector3();
  const along = new Vector3();
  const back = new Matrix4();
  const wallAhead = (): Place | undefined => {
    world.camera.getWorldPosition(eyes);
    world.camera.getWorldDirection(gaze).setY(0);
    if (gaze.lengthSq() < 1e-6) return undefined;
    gaze.normalize();
    let best: Place | undefined;
    let bestDistance = 6;
    for (const entity of planeEntities) {
      const plane = entity.object3D as Mesh | undefined;
      const size = (plane?.geometry as BoxGeometry | undefined)?.parameters;
      if (!plane || !size) continue;
      plane.updateWorldMatrix(true, false);
      planeNormal.set(0, 1, 0).applyQuaternion(plane.getWorldQuaternion(turn));
      if (Math.abs(planeNormal.y) > 0.3) continue; // walls only
      back.copy(plane.matrixWorld).invert();
      from.copy(eyes).applyMatrix4(back);
      along.copy(eyes).add(gaze).applyMatrix4(back).sub(from);
      if (Math.abs(along.y) < 1e-6) continue;
      const distance = -from.y / along.y; // in the plane's own units: it is not scaled
      if (distance <= 0.2 || distance >= bestDistance) continue;
      const x = from.x + along.x * distance;
      const z = from.z + along.z * distance;
      if (Math.abs(x) > size.width / 2 || Math.abs(z) > size.depth / 2) continue;
      bestDistance = distance;
      const point = eyes.clone().addScaledVector(gaze, distance);
      const normal = planeNormal.clone();
      if (normal.dot(gaze) > 0) normal.negate(); // facing the player
      best = { point, normal, surface: 'wall', facing: new Quaternion().setFromUnitVectors(FRONT, normal) };
    }
    return best;
  };
  // The table the player looked at when they said it (pickTable): the whole top, square with its edges.
  const tableAhead = (): Place | undefined => {
    const table = pickTable(world, planeEntities as Iterable<Entity>, furnitureEntities as Iterable<Entity>);
    if (!table) return undefined;
    return {
      point: table.centre.clone(),
      normal: new Vector3(0, 1, 0),
      surface: 'table',
      facing: table.facing.clone(),
      size: { width: table.width, depth: table.depth },
    };
  };
  const floorAhead = (): Place => {
    const spot = inFrontOfPlayer(world, { distance: 1.2 });
    spot.point.y = 0;
    return { ...spot, normal: new Vector3(0, 1, 0), surface: 'floor' };
  };
  wallAheadOf = wallAhead;
  lookedAt = (kind) => {
    if (kind === 'table') return tableAhead() ?? floorAhead();
    if (kind === 'floor') return floorAhead();
    return wallAhead();
  };
  otherOf = (kind) => {
    if (kind === 'table') {
      const planes = planeEntities as Iterable<Entity>, furniture = furnitureEntities as Iterable<Entity>;
      let table = pickTable(world, planes, furniture, tablesBeen);
      let again = false;
      if (!table && tablesBeen.length > 1) {
        // it has stood on every table: the round begins again, from the one it is on now
        const now = tablesBeen[tablesBeen.length - 1];
        tablesBeen.length = 0;
        tablesBeen.push(now);
        table = pickTable(world, planes, furniture, tablesBeen);
        again = true;
      }
      if (!table) return undefined;
      const size = { width: table.width, depth: table.depth };
      return { place: { point: table.centre, normal: new Vector3(0, 1, 0), surface: 'table', facing: table.facing, size }, again };
    }
    if (kind === 'floor') return { place: floorAhead(), again: false };
    const wall = wallAhead();
    // the wall it hangs on is not "the other wall": the player has to look at another one
    if (!wall || (chosen?.surface === 'wall' && wall.normal.dot(chosen.normal) > 0.9 && Math.abs(toRoomOf(wall, chosen)) < 0.2)) return undefined;
    return { place: wall, again: false };
  };
  nearOf = (point, reach) => {
    const found = snapToPlane(planeEntities, point, reach);
    if (!found) return undefined;
    world.camera.getWorldPosition(head);
    if (found.dot(head.clone().sub(point)) < 0) found.negate();
    const surface: Place['surface'] =
      found.y > 0.7 ? (point.y < 0.25 ? 'floor' : 'table') : found.y < -0.7 ? 'ceiling' : 'wall';
    const facing = surface === 'wall' ? new Quaternion().setFromUnitVectors(FRONT, found) : towardHead(point);
    // the spot on the surface itself, under the thing
    return { point: point.clone().addScaledVector(found, -lastGap), normal: found, surface, facing };
  };
  class PlacingSystem extends createSystem({
    planes: { required: [XRPlane] },
    furniture: { required: [XRMesh] },
  }) {
    update(): void {
      planeEntities = this.queries.planes.entities;
      furnitureEntities = this.queries.furniture.entities;
      if (!placeAsked()) return;
      for (const { side } of markers) {
        if (!this.input.xr.gamepads[side]?.getSelectStart()) continue;
        const hit = read(side);
        if (!hit) continue;
        let { point, surface, facing } = hit;
        const { exact } = hit;
        normal.copy(hit.normal);
        // A thing that lies flat (a game world, a board, a rug) shown on a wall goes on the floor at the foot of
        // that wall, not into it (14.11: a Minecraft was walled in). A thing for a wall stays as it is.
        if (surface === 'wall' && (wantedKind === 'floor' || wantedKind === 'table')) {
          const out = normal.clone().setY(0).normalize();
          point = point.clone().addScaledVector(out, FOOT_OUT).setY(0);
          normal.set(0, 1, 0);
          surface = 'floor';
          facing = towardHead(point);
        }
        console.info(
          `[place] ${surface} at ${point.toArray().map((v) => v.toFixed(2)).join(', ')}, normal ${normal.toArray().map((v) => v.toFixed(2)).join(', ')}${exact ? ' (the room plane)' : ' (the ray, no plane near)'}`,
        );
        play(world, dust({ color: 0x5ef0ff, size: 0.12 }), point);
        sfx(world, 'select', point);
        // "it is being built here": a slow cyan circle on the surface until the thing comes
        placeDone();
        scene = world.scene;
        building = buildMark(point, normal);
        buildingTimeout = setTimeout(placeDone, 90_000);
        choose({ point, normal: normal.clone(), surface, facing });
        return;
      }
    }
  }
  world.registerSystem(PlacingSystem);
}
