import {
  Box3,
  createSystem,
  DistanceGrabbable,
  type Entity,
  Grabbed,
  Group,
  Matrix4,
  type Object3D,
  ObjectLoader,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  OneHandGrabbable,
  PhysicsState,
  Quaternion,
  TwoHandsGrabbable,
  Vector3,
  type World,
} from '@iwsdk/core';
import { api, apiHeaders, apiUrl, setGuestRoom, socketAddress } from './api.js';
import { dropMade, madeNow, onLateThing, rootsOf, runMade } from './live.js';
import { closePlate, flashHit, showInvite, showKnock, showNote } from './together-plates.js';
import { sfx } from './sfx.js';
import { voiceJoin, voiceLeave, voiceListener, voicePlace, voiceSignal, voiceStart } from './together-voice.js';
import type { Avatar, Pad } from './together-avatar.js';

/**
 * Playing together from different rooms (research/notes/SHARING.md, 16.11).
 *
 * Every player has the game somewhere in their own room. The stage is that place (setStage: a tower's base,
 * a board): a point and a direction, +Z towards the player who stands there. Each player's stage is turned by
 * their seat (the second player half round, so they stand across the table), and what goes over the network
 * is in that turned frame, the shared one: a player's head and hands come out in your room where they are at
 * their own table, only opposite you.
 *
 * 30 times a second each player sends a pose: the head and the 25 joints of each tracked hand (IWSDK reads
 * them every frame to draw your hands; src/together-avatar.ts draws theirs with the same model). The others
 * play it back 0.1 s late, in between two poses, so the network's unevenness does not show.
 *
 * Things (share): nobody takes turns (Yury, 16.11: «люди сами разберутся»). The host — the player in the
 * lowest seat — runs the physics of every free thing and sends where they are; the others' copies have no
 * physics of their own and follow. A thing in a hand is led by whoever holds it: they move it at once, and
 * at the host it becomes a kinematic body driven after that hand, so it pushes the others for real. Let go,
 * it goes back to the host's physics with the throw's speed. One rule for every game: whatever a made game
 * lets the player take in a hand (a grab component: throwable, OneHandGrabbable, …) or its physics moves (a
 * dynamic body) is shared by itself, named by its order among the game's things — the game runs the same code
 * everywhere, so the order is the same.
 *
 * Everybody has a room of their own and is in it while they play (server/together.mjs: a code like «kot-42»).
 * invite() gives a one-time way in (a link, a QR); visit() goes to a friend's room by code or nick and knocks;
 * somebody there lets them in (showKnock, or by voice: answerKnock); goHome() comes back.
 *
 * In the address: ?join=<code>&pass=<token> goes to a friend (the invite link); ?room=<id> joins any room
 * without knocking (tests, takes; &name=<nick>, &seat=<n> to sit there); ?record=<take> writes your
 * poses and what you hold down on the server, ?ghost=<take> plays a take back as one more player — a second
 * player when there is one headset (filming: first play their part, a take sits at seat 1; then yours with
 * the ghost: it takes the blocks it took then, and your physics answers).
 */

// Packets, as floats. A pose: what it is, who, when (s), which parts it has, the head (position, rotation),
// the hands. Things: what, who, when, how many, then for each its key, flags, position, rotation, speed.
const KIND = 0;
const ID = 1;
const TIME = 2;
const FLAGS = 3;
const HEAD = 4;
const HANDS = [11, 186]; // left, right: 25 joints × (x, y, z, qx, qy, qz, qw)
const JOINT = 7;
const SPACES = 361; // the hands' grip and ray poses: left grip, left ray, right grip, right ray (x, y, z, qx, qy, qz, qw)
const POSE_LENGTH = 389;
const POSE = 1;
const THINGS = 2;
const COUNT = 3;
const ENTRY = 12; // key, flags, x, y, z, qx, qy, qz, qw, vx, vy, vz
const HAS_HEAD = 1;
const HAS_HAND = [2, 4];
const HAS_SPACES = 32;
const HAS_PAD = [8, 16]; // a controller instead: its grip in the first joint's place, then trigger and squeeze
const HELD = 1; // the sender holds it
const GIVE = 8; // the sender gives it to the player in flags >> 4: they run its physics from now
const SHOT = 4; // the sender shot it (an arrow, a dart): only they move it; the others see a copy
const LET_GO = 2; // the sender has just let it go (with its speed)
const SIDES = ['left', 'right'] as const;

const SEND_EVERY = 1 / 30;
const FULL_EVERY = 1; // s: the host sends every thing, not only the moved ones, for whoever came in later
const DELAY = 0.1; // how far behind the newest pose a player is shown
const KEEP = 30; // poses kept per player (a second)
const NEARER = 0.4; // m: a thing goes to a friend that much nearer to it than its owner (a ball over the net)
const MASK = 0.13; // m: the hit zone round a friend's head (Yury: «чтобы был объект, в который целится»)
const DRIVE = 12; // 1/s: how fast a thing in someone else's hand closes on it at the host
const GHOST = -1; // the id of a played-back take
const ME = -2; // the holder when it is in my hand

interface Peer {
  id: number;
  seat: number;
  name: string;
  avatar: Avatar;
  poses: Float32Array[];
  /** their things packets, waiting for the clock: shown at the same moment as their hands */
  things: Float32Array[];
  /** their head in the world now (as shown), the mask a shot hits */
  head: Vector3;
  hasHead: boolean;
  /** the ball their head is at whoever runs the physics */
  headBody?: Entity;
  /** what each hand holds (holdInHand), shown on their avatar's hand */
  held: (Held | undefined)[];
  /** the sender's time being shown now */
  clock: number;
  started: boolean;
  /** a take: loops */
  ghost: boolean;
  at: number; // the pose before the clock, found last frame
  thingsAt: number; // the next things packet of a take to play
}

interface Held {
  space: 'grip' | 'ray';
  local: Matrix4;
  object: Object3D;
  /** the body it pushes things with, at whoever runs the physics */
  collider?: Entity;
  size: Vector3;
  centre: Vector3;
}

interface Thing {
  key: number;
  entity: Entity;
  object: Object3D;
  /** the body the game gave it (none: it is only moved, never simulated) */
  body?: { linearDamping: number; angularDamping: number; gravityFactor: number };
  /** what it is now here: simulated, following the network, or a kinematic body after someone's hand */
  mode: 'physics' | 'follow' | 'kinematic';
  /** who runs its physics: 0 the host (the lowest seat), a peer's id, or ME */
  owner: number;
  /** who holds it: 0 nobody, a peer's id, or ME */
  holder: number;
  /** where the network says it is (world), and whether it has said so yet */
  target: { p: Vector3; q: Quaternion; has: boolean };
  /** what was last sent (shared frame) */
  sentP: Vector3;
  sentQ: Quaternion;
  /** for the speed of a throw from my hand (world), and when */
  lastP: Vector3;
  speed: Vector3;
  heldByMe: boolean;
  /** when my hand let it go (s, performance clock): a throw that may hit a friend's mask */
  thrownAt?: number;
  /** whom it has hit already (one hit per friend per throw) */
  hit?: Set<number>;
  /** a speed to give it once its new body is there */
  launch?: Vector3;
}

let world: World | undefined;
// loaded only when playing together: the avatars bring their models with them
let makeAvatar: ((name: string, seat: number) => Avatar) | undefined;
let socket: WebSocket | undefined;
let myId = 0;
let mySeat = 0;
let inRoom = false;
let home = ''; // this player's own room's code
let roomNow = '';
let roomLabel = '';
let knockNow: { id: number; name: string } | undefined;
let running = false;
const peers = new Map<number, Peer>();
const things = new Map<number, Thing>();
const sharedEntities = new WeakSet<Entity>();
let stageRoot: Group | undefined;
const startedAt = performance.now() / 1000;
let hosting = true;
let seated: () => void = () => {};
const seatKnown = new Promise<void>((resolve) => (seated = resolve));

// the stage: a thing in the room the game set (setStage), or a place picked once in front of the player
let stageObject: Object3D | undefined;
const stageTurn = new Quaternion();
const fallbackStage = new Matrix4();
let haveFallback = false;
const stage = new Matrix4();
const toStage = new Matrix4();
const stageQ = new Quaternion();

// recording
let take = '';
const taken: Float32Array[] = [];
let takePart = 0;

const shared: Record<string, unknown> = {};
const listeners = new Map<string, Set<(data: unknown, from: number) => void>>();
const stateListeners = new Set<(patch: Record<string, unknown>, from: number) => void>();

// A game loaded live may get a newer copy of this module than the page started with (src/score.ts has met it):
// the copy would keep a room, a stage and a list of things nobody runs. So the first copy on the page answers
// for every later one: each exported function hands the call over to it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Api = Record<string, (...args: any[]) => any>;
const self: Api = {};
const first: Api = ((globalThis as { __togetherFirst?: Api }).__togetherFirst ??= self);

/** The angle a seat is turned by: the second player across the table, the third and fourth at the sides. */
const SEAT_TURN = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
const Y = new Vector3(0, 1, 0);

/** A key that survives the network as a float: 24 bits of the FNV-1a hash of `name`. */
function keyOf(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return ((h >>> 0) & 0xffffff) + 1;
}

// ---------------------------------------------------------------- what games use

/**
 * Hangs the shared frame on the game's thing in the room (a tower's base, a board). Its +Z is turned once
 * towards where the player is now; it then moves with the thing.
 */
export function setStage(w: World, object: Object3D | undefined): void {
  if (first !== self) return first.setStage(w, object);
  named = !!object;
  hangStage(w, object);
}

/** The place the game stands at in the room (src/gamehandle.ts: its anchor), for when the game names none. */
export function setDefaultStage(w: World, object: Object3D): void {
  if (first !== self) return first.setDefaultStage(w, object);
  if (named && stageObject?.parent) return;
  named = false;
  hangStage(w, object);
}

let named = false; // the game named its place (setStage)
function hangStage(w: World, object: Object3D | undefined): void {
  world ??= w;
  stageObject = object;
  if (!object) return;
  object.updateWorldMatrix(true, false);
  const at = object.getWorldPosition(new Vector3());
  const head = w.player.head.getWorldPosition(new Vector3());
  const yaw = Math.atan2(head.x - at.x, head.z - at.z);
  stageTurn.copy(object.getWorldQuaternion(new Quaternion())).invert().multiply(new Quaternion().setFromAxisAngle(Y, yaw));
}

/** Resolves once this player's seat is known (at once when not in a room): build the game after it. */
export function ready(): Promise<void> {
  if (first !== self) return first.ready();
  return seatKnown;
}

/** Where a point and a turn of the shared frame are in the world now (into `position`, `quaternion`). */
export function toWorld(position: Vector3, quaternion?: Quaternion): void {
  if (first !== self) return first.toWorld(position, quaternion);
  findStage();
  position.applyMatrix4(stage);
  quaternion?.premultiply(stageQ);
}

/**
 * Shares a thing of the game with everybody in the room, under a name that is the same for everybody
 * ('block-3-1'). Build the game the same way everywhere, in the shared frame (toWorld): the names find the
 * same things. A thing shared again under a name (the game started over) takes the old one's place.
 */
export function share(entity: Entity, name: string): void {
  if (first !== self) return first.share(entity, name);
  const object = entity.object3D;
  if (!object) return;
  const key = keyOf(name);
  const body = entity.hasComponent(PhysicsBody)
    ? {
        linearDamping: entity.getValue(PhysicsBody, 'linearDamping') as number,
        angularDamping: entity.getValue(PhysicsBody, 'angularDamping') as number,
        gravityFactor: entity.getValue(PhysicsBody, 'gravityFactor') as number,
      }
    : undefined;
  const thing: Thing = {
    key,
    entity,
    object,
    body,
    mode: body ? 'physics' : 'follow',
    owner: 0,
    holder: 0,
    target: { p: new Vector3(), q: new Quaternion(), has: false },
    sentP: new Vector3(Infinity, 0, 0),
    sentQ: new Quaternion(),
    lastP: object.getWorldPosition(new Vector3()),
    speed: new Vector3(),
    heldByMe: false,
  };
  things.set(key, thing);
  sharedEntities.add(entity);
  if (running) settle(thing);
}

/** True while this player runs the physics of the shared things (alone, or in the lowest seat). */
export function isHost(): boolean {
  if (first !== self) return first.isHost();
  return hosting;
}

/** The players in the room besides you: id, seat, name. */
export function players(): { id: number; seat: number; name: string }[] {
  if (first !== self) return first.players();
  return [...peers.values()].map(({ id, seat, name }) => ({ id, seat, name }));
}

/** Sends a game event to everybody else (on(name) gets it there). */
export function send(name: string, data?: unknown): void {
  if (first !== self) return first.send(name, data);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'event', name, data }));
}

/** Calls `handler` when another player sends `name`; returns the way to stop. */
export function on(name: string, handler: (data: unknown, from: number) => void): () => void {
  if (first !== self) return first.on(name, handler);
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(handler);
  return () => listeners.get(name)?.delete(handler);
}

/** The room's shared state (score, whose turn); kept on the server, so a player who comes later has it too. */
export function state(): Readonly<Record<string, unknown>> {
  if (first !== self) return first.state();
  return shared;
}

/** Changes the room's shared state for everybody. */
export function setState(patch: Record<string, unknown>): void {
  if (first !== self) return first.setState(patch);
  Object.assign(shared, patch);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'state', patch }));
}

/** Calls `handler` when another player changes the shared state. */
export function onState(handler: (patch: Record<string, unknown>, from: number) => void): () => void {
  if (first !== self) return first.onState(handler);
  stateListeners.add(handler);
  return () => stateListeners.delete(handler);
}

// ---------------------------------------------------------------- the stage

const sp = new Vector3();
const ss = new Vector3();
/** The shared frame in the world now (into `stage`, `toStage`, `stageQ`); false while there is nothing to hang it on. */
function findStage(): boolean {
  if (stageObject && !stageObject.parent) stageObject = undefined; // the game that named it is gone
  if (stageObject) {
    stageObject.updateWorldMatrix(true, false);
    stageObject.matrixWorld.decompose(sp, stageQ, ss);
    stageQ.multiply(stageTurn);
  } else {
    if (!haveFallback) {
      // 0.6 m in front of the player, on the floor, +Z back towards them
      const head = world?.player.head;
      if (!head) return false;
      head.getWorldPosition(sp);
      if (!sp.lengthSq()) return false; // no head pose yet
      head.getWorldDirection(ss); // a Group's getWorldDirection is its +Z: behind the eyes
      ss.y = 0;
      if (ss.lengthSq() < 1e-6) ss.set(0, 0, 1);
      ss.normalize();
      const yaw = Math.atan2(ss.x, ss.z);
      sp.addScaledVector(ss, -0.6).setY(0);
      fallbackStage.compose(sp, stageQ.setFromAxisAngle(Y, yaw), ss.set(1, 1, 1));
      haveFallback = true;
    }
    fallbackStage.decompose(sp, stageQ, ss);
  }
  stageQ.multiply(new Quaternion().setFromAxisAngle(Y, SEAT_TURN[mySeat] ?? 0));
  stage.compose(sp, stageQ, ss.set(1, 1, 1));
  toStage.copy(stage).invert();
  return true;
}

// ---------------------------------------------------------------- things

const wp = new Vector3();
const wq = new Quaternion();
const pm = new Matrix4();
const ps = new Vector3();
/** Puts `object` at a world pose, whatever it hangs from. */
function placeInWorld(object: Object3D, p: Vector3, q: Quaternion): void {
  const parent = object.parent;
  if (!parent || parent === world?.scene) {
    object.position.copy(p);
    object.quaternion.copy(q);
    return;
  }
  parent.updateWorldMatrix(true, false);
  pm.copy(parent.matrixWorld).invert();
  object.position.copy(p).applyMatrix4(pm);
  parent.matrixWorld.decompose(ps, wq, ps);
  object.quaternion.copy(wq.invert().multiply(q));
}

/** Gives a thing what it should be now here: the host simulates free things and drives the held ones after
 *  the hand that holds them; everybody else's copies follow the network. */
/** True while this player runs the thing's physics: they were given it, or nobody was and they are the host. */
function owns(thing: Thing): boolean {
  return thing.owner === ME || (thing.owner === 0 && hosting);
}

function settle(thing: Thing): void {
  if (!thing.body) return;
  const want: Thing['mode'] = owns(thing) ? (thing.holder && thing.holder !== ME ? 'kinematic' : 'physics') : 'follow';
  if (want === thing.mode && (want === 'follow' || thing.entity.hasComponent(PhysicsBody))) return;
  if (thing.entity.hasComponent(PhysicsBody)) thing.entity.removeComponent(PhysicsBody);
  if (want !== 'follow') {
    thing.entity.addComponent(PhysicsBody, {
      state: want === 'kinematic' ? PhysicsState.Kinematic : PhysicsState.Dynamic,
      linearDamping: thing.body.linearDamping,
      angularDamping: thing.body.angularDamping,
      gravityFactor: thing.body.gravityFactor,
    });
  }
  thing.mode = want;
}

function becomeHost(now: boolean): void {
  if (hosting === now) return;
  hosting = now;
  console.info(`[together] ${now ? 'I run' : 'the host runs'} the things' physics`);
  for (const thing of things.values()) settle(thing);
}

/** Who runs the physics: the player in the lowest seat (a take never does). */
function electHost(): void {
  let lowest = true;
  for (const peer of peers.values()) if (!peer.ghost && peer.seat < mySeat) lowest = false;
  becomeHost(lowest);
}

const ep = new Vector3();
const eq = new Quaternion();
/** What another player says about things. `from` holds or lets go; the host's free things are where it says. */
function takeThings(packet: Float32Array, from: number): void {
  const count = packet[COUNT];
  for (let n = 0; n < count; n++) {
    const at = 4 + n * ENTRY;
    const shot = packet[at + 1] & SHOT ? theirShots.get(packet[at]) : undefined;
    if (shot) {
      shot.object.position.fromArray(packet, at + 2);
      shot.object.quaternion.fromArray(packet, at + 5);
      shot.object.visible = true;
      shot.seen = performance.now();
      continue;
    }
    const thing = things.get(packet[at]);
    if (!thing || !thing.entity.active || thing.heldByMe) continue;
    const flags = packet[at + 1];
    ep.fromArray(packet, at + 2).applyMatrix4(stage);
    eq.fromArray(packet, at + 5).premultiply(stageQ);
    if (flags & HELD) {
      if (thing.holder !== from) {
        thing.holder = from;
        settle(thing);
      }
    } else if (flags & LET_GO) {
      // whoever threw it runs its flight: it is by them, and their own throw goes on with no delay
      if (thing.holder === from) thing.holder = 0;
      thing.owner = from;
      settle(thing);
    } else if (flags & GIVE) {
      const to = Math.floor(flags / 16);
      if (to === myId) {
        // given to me: on from here with its speed, in my physics
        thing.owner = ME;
        placeInWorld(thing.object, ep, eq);
        thing.launch = new Vector3().fromArray(packet, at + 9).applyQuaternion(stageQ);
        settle(thing);
        continue;
      }
      thing.owner = to;
      settle(thing);
    } else if (thing.holder) continue; // somebody holds it: their hand's word counts
    else if (owns(thing)) {
      // two think it theirs (both came in, both were given it): the lower id keeps it
      if (from > myId) continue;
      thing.owner = from;
      settle(thing);
    } else if (!thing.owner) thing.owner = from;
    thing.target.p.copy(ep);
    thing.target.q.copy(eq);
    thing.target.has = true;
  }
}

/**
 * Shares, by themselves, the things of the made games that move: what a hand can take, and whatever the physics
 * moves (a dynamic body: a ball, a falling brick). Named by the game's place among the games in the room and the
 * thing's place among the game's moving things (the order the code made them in: the same everywhere). A game
 * that shares its own things (Jenga) is left be: this runs half a second later.
 */
function shareWhatHandsTake(): void {
  madeNow().forEach((game, g) => {
    let n = 0;
    for (const entity of rootsOf(game)) {
      const takeable = entity.hasComponent(OneHandGrabbable) || entity.hasComponent(TwoHandsGrabbable) || entity.hasComponent(DistanceGrabbable);
      const moved = entity.hasComponent(PhysicsBody) && entity.getValue(PhysicsBody, 'state') === PhysicsState.Dynamic;
      if (!takeable && !moved) continue;
      const name = `game${g}-thing${n++}`;
      if (!sharedEntities.has(entity)) share(entity, name);
    }
  });
}

const dp = new Vector3();
const dq = new Quaternion();
const dr = new Quaternion();
const dv = new Vector3();
const dw = new Vector3();
/** Drives a kinematic body to a world pose by speed: a speed that closes on it smoothly (poses come 30 a second
 *  and frames more often: «there by the next frame» jerked it, and a tower above it shook down). */
function drive(entity: Entity, object: Object3D, p: Vector3, q: Quaternion): void {
  object.getWorldPosition(dp);
  object.getWorldQuaternion(dq);
  dv.subVectors(p, dp).multiplyScalar(DRIVE).clampLength(0, 6);
  dr.copy(q).multiply(dq.invert());
  if (dr.w < 0) dr.set(-dr.x, -dr.y, -dr.z, -dr.w);
  const angle = 2 * Math.acos(Math.min(1, dr.w));
  const sin = Math.sqrt(1 - dr.w * dr.w);
  dw.set(dr.x, dr.y, dr.z);
  if (sin > 1e-4) dw.divideScalar(sin).multiplyScalar(angle * DRIVE).clampLength(0, 20);
  else dw.set(0, 0, 0);
  if (entity.hasComponent(PhysicsManipulation)) {
    entity.getVectorView(PhysicsManipulation, 'linearVelocity').set([dv.x, dv.y, dv.z]);
    entity.getVectorView(PhysicsManipulation, 'angularVelocity').set([dw.x, dw.y, dw.z]);
  } else entity.addComponent(PhysicsManipulation, { linearVelocity: [dv.x, dv.y, dv.z], angularVelocity: [dw.x, dw.y, dw.z] });
}

const heldSent = ['', ''];
const objects = new ObjectLoader();
/** Tells the room what my hands hold now (holdInHand marks it): its look once (three.js JSON), or its name when
 *  that is too big (the friend's own copy of the game has the same thing), and where it sits in the hand. */
function sendHeld(player: World['player']): void {
  for (let h = 0; h < 2; h++) {
    const side = SIDES[h];
    let found: Object3D | undefined;
    let space: 'grip' | 'ray' = 'grip';
    for (const [name, root] of [['grip', player.gripSpaces[side]], ['ray', player.raySpaces[side]]] as const) {
      for (const child of root.children) if (child.userData.heldInHand) [found, space] = [child, name];
    }
    found?.updateMatrix();
    const local = found ? found.matrix.toArray().map((v) => +v.toFixed(4)) : null;
    const key = found ? `${found.uuid}/${space}/${local}` : 'none';
    if (key === heldSent[h]) continue;
    heldSent[h] = key;
    let json: unknown;
    if (found) {
      const look = found.toJSON();
      if (JSON.stringify(look).length < 400_000) json = look;
    }
    send('_held', { side: h, name: found?.name ?? '', space, local, json });
  }
}

/** A friend's hand holds something now (or nothing): its copy goes on their avatar's hand. */
function takeHeld(from: number, data: { side: number; name: string; space: 'grip' | 'ray'; local: number[] | null; json?: unknown }): void {
  const peer = peers.get(from);
  if (!peer || !stageRoot || (data.side !== 0 && data.side !== 1)) return;
  dropHeld(peer, data.side);
  if (!data.local) return;
  let object: Object3D | undefined;
  if (data.json) object = objects.parse(data.json);
  else world?.scene.traverse((o) => { if (!object && o.userData.heldInHand && o.name === data.name) object = o.clone(); });
  if (!object) return;
  object.userData.heldInHand = undefined;
  const bounds = new Box3().setFromObject(object);
  stageRoot.add(object);
  peer.held[data.side] = { space: data.space, local: new Matrix4().fromArray(data.local), object, size: bounds.getSize(new Vector3()), centre: bounds.getCenter(new Vector3()) };
  console.info(`[together] ${peer.name} holds ${object.name || 'a thing'} in the ${SIDES[data.side]} hand`);
}

function dropHeld(peer: Peer, side: number): void {
  const held = peer.held[side];
  if (!held) return;
  held.object.removeFromParent();
  if (held.collider?.active) held.collider.dispose();
  peer.held[side] = undefined;
}

const hm = new Matrix4();
const hp = new Vector3();
const hq = new Quaternion();
const hs = new Vector3();
/** A friend's held thing follows their hand; at whoever runs the physics it also pushes things, as a kinematic box. */
function moveHeld(peer: Peer, side: number, space: Matrix4): void {
  const held = peer.held[side];
  if (!held) return;
  hm.multiplyMatrices(space, held.local).decompose(held.object.position, held.object.quaternion, held.object.scale);
  if (!world) return; // it pushes things wherever they are run: at everybody's
  // the box's pose in the world: the shared frame, the hand, the thing, its middle
  hm.premultiply(stage).decompose(hp, hq, hs);
  hp.add(dp.copy(held.centre).multiply(hs).applyQuaternion(hq));
  if (!held.collider) {
    const box = new Group();
    box.position.copy(hp);
    box.quaternion.copy(hq);
    held.collider = world
      .createTransformEntity(box)
      .addComponent(PhysicsShape, { shape: 'Box', dimensions: [held.size.x * hs.x, held.size.y * hs.y, held.size.z * hs.z] })
      .addComponent(PhysicsBody, { state: PhysicsState.Kinematic });
    console.info(`[together] ${peer.name}'s ${held.object.name || 'thing'} pushes things here (a kinematic box)`);
  }
  if (held.collider.object3D) drive(held.collider, held.collider.object3D, hp, hq);
}

/** Which friend's mask is at `point` (world), within `reach` more: their id, or undefined. */
export function hitPlayer(point: Vector3, reach = 0): number | undefined {
  if (first !== self) return first.hitPlayer(point, reach);
  let best: number | undefined;
  let nearest = MASK + reach;
  for (const peer of peers.values()) {
    if (!peer.hasHead || peer.ghost) continue;
    const d = peer.head.distanceTo(point);
    if (d < nearest) [best, nearest] = [peer.id, d];
  }
  return best;
}

type Hit = { from: number; to: number; byMe: boolean; onMe: boolean };
const hitListeners = new Set<(hit: Hit) => void>();
/** Calls `handler` when a shot hits somebody's mask (yours, or a friend's by you or by another). */
export function onHit(handler: (hit: Hit) => void): () => void {
  if (first !== self) return first.onHit(handler);
  hitListeners.add(handler);
  return () => hitListeners.delete(handler);
}

let effects: Promise<typeof import('./fx.js')> | undefined;
/** Sparks at a friend's mask where my shot hit it (the effects load the first time). */
function sparksAt(at: Vector3): void {
  if (!world) return;
  const w = world;
  const where = at.clone();
  effects ??= import('./fx.js');
  effects.then((fx) => fx.play(w, fx.impact({ size: 0.12, color: 0xffd23a, mark: 0 }), where)).catch(() => {});
  sfx(w, 'zap', where, 0.6);
}

/** My shot reached a friend's mask: they hear of it, I see it. */
function scored(to: number): void {
  const peer = peers.get(to);
  if (!peer) return;
  send('_hit', { to });
  sparksAt(peer.head);
  for (const handler of hitListeners) handler({ from: myId, to, byMe: true, onMe: false });
}

// ---- shots (Yury: a duel with darts or a bow, «летела в маску»): a thing the game makes after it loaded, by my
// hands or head, moving fast at once, is mine: its look goes to the room once (three.js JSON), then its flight;
// a friend sees a copy with no physics (their walls are not mine). It hitting a friend's mask is my hit.
interface Shot {
  entity: Entity;
  object: Object3D;
  /** where it was when it came, and when; null once it is known to be a shot */
  start: Vector3 | null;
  at: number;
  key: number;
  hit?: Set<number>;
}
const waiting: Shot[] = []; // new things, not yet known to be shots
const myShots = new Map<number, Shot>();
const theirShots = new Map<number, { object: Object3D; seen: number }>();
const SHOT_SPEED = 1.5; // m/s within its first moments: a shot, not a piece put down
const SHOT_NEAR = 0.8; // m from my head or a hand when it came

function newThing(entity: Entity): void {
  if (!running || !company() || !entity.object3D) return;
  waiting.push({ entity, object: entity.object3D, start: null, at: performance.now() / 1000, key: 0 });
}

/** Their shot's look: a copy under the shared frame, moved by their packets. */
function takeShot(from: number, data: { key: number; json: unknown }): void {
  if (!stageRoot || theirShots.size > 40) return;
  let object: Object3D;
  try {
    object = objects.parse(data.json);
  } catch {
    return;
  }
  object.visible = false; // until its first pose
  stageRoot.add(object);
  theirShots.set(data.key, { object, seen: performance.now() });
}

function dropShot(key: number): void {
  const shot = theirShots.get(key);
  if (!shot) return;
  shot.object.removeFromParent();
  theirShots.delete(key);
}

/** Lets go of everything a player who left was holding. */
function dropAllOf(id: number): void {
  for (const thing of things.values()) {
    if (thing.holder !== id) continue;
    thing.holder = 0;
    settle(thing);
  }
}

// ---------------------------------------------------------------- the room

const companyListeners = new Set<(company: boolean) => void>();
let hadCompany = false;
/** True while somebody else (not a take) is in the room: Punto then listens only on a pinch. */
export function company(): boolean {
  if (first !== self) return first.company();
  for (const peer of peers.values()) if (!peer.ghost) return true;
  return false;
}
/** Calls `handler` when the room fills or empties. */
export function onCompany(handler: (company: boolean) => void): () => void {
  if (first !== self) return first.onCompany(handler);
  companyListeners.add(handler);
  return () => companyListeners.delete(handler);
}
function companyChanged(): void {
  const now = company();
  if (now === hadCompany) return;
  hadCompany = now;
  for (const handler of companyListeners) handler(now);
}

function addPeer(id: number, seat: number, name: string, ghost = false): Peer {
  const have = peers.get(id);
  if (have) return have;
  const avatar = makeAvatar!(name, seat);
  stageRoot?.add(avatar.group);
  const peer: Peer = { id, seat, name, avatar, poses: [], things: [], held: [undefined, undefined], head: new Vector3(), hasHead: false, clock: 0, started: false, ghost, at: 0, thingsAt: 0 };
  heldSent.fill(''); // a newcomer is told what my hands hold
  peers.set(id, peer);
  console.info(`[together] ${name} is here (seat ${seat})`);
  electHost();
  if (!ghost && myId) voiceJoin(id, myId).catch((error) => console.warn('[voice]', error));
  companyChanged();
  return peer;
}

function removePeer(id: number): void {
  const peer = peers.get(id);
  if (!peer) return;
  peer.avatar.remove();
  for (let h = 0; h < 2; h++) dropHeld(peer, h);
  if (peer.headBody?.active) peer.headBody.dispose();
  peers.delete(id);
  dropAllOf(id);
  for (const thing of things.values()) {
    if (thing.owner !== id) continue;
    thing.owner = 0; // back to the host
    settle(thing);
  }
  voiceLeave(id);
  console.info(`[together] ${peer.name} left`);
  electHost();
  companyChanged();
}

/** This player's nick: asked once by Punto (setName), kept in the browser. */
export function myName(): string {
  if (first !== self) return first.myName();
  try {
    return localStorage.getItem('punto.name') || 'Player';
  } catch {
    return 'Player';
  }
}

/** Keeps this player's nick; the room hears it next time they come in. */
export function setName(name: string): void {
  if (first !== self) return first.setName(name);
  try {
    localStorage.setItem('punto.name', name.slice(0, 24));
  } catch {
    // storage can be blocked: the nick lives this page load only
  }
}

/** The players in the room besides you, and the room's code as it is said («кот-42»). */
export function roomNowLabel(): string {
  if (first !== self) return first.roomNowLabel();
  return roomLabel;
}

/** Tells the friends in the room that this player is changing the game (Punto's coder is at work). */
export function announceMaking(said: string): void {
  if (first !== self) return first.announceMaking(said);
  if (company()) send('making', { name: myName(), said });
}

/** The change is done (or failed): the friends take the room's new version. */
export function announceMade(): void {
  if (first !== self) return first.announceMade();
  if (company()) send('made');
}

/** Leaves the room this player is in (nobody is told twice: the server says they left). */
function leaveRoom(): void {
  setGuestRoom('');
  const ws = socket;
  socket = undefined;
  ws?.close();
  for (const id of [...peers.keys()]) if (id !== GHOST) removePeer(id);
  myId = 0;
  inRoom = false;
  roomNow = '';
}

/** Goes to a friend's room — found by its code or by the nick of somebody in it — and knocks. */
export async function visit(query: string, pass = ''): Promise<string> {
  if (first !== self) return first.visit(query, pass);
  await wake();
  let code = query.trim().toLowerCase();
  if (!pass) {
    const found = await fetch(apiUrl(`together/find?q=${encodeURIComponent(query)}`), { headers: apiHeaders() }).then((r) => r.json());
    const room = (found.rooms as { code: string; label: string; name: string }[]).find((r) => r.code !== home);
    if (!room) {
      if (world) showNote(world, `Не нашёл «${query}»`);
      return 'no such room';
    }
    code = room.code;
  }
  leaveRoom();
  connect(code, myName(), null, pass);
  return `going to ${code}`;
}

/** Back to this player's own room. */
export function goHome(): void {
  if (first !== self) return first.goHome();
  if (roomNow === home && socket) return;
  leaveRoom();
  if (home) connect(home, myName(), null);
}

/** Asks the room for a one-time way in and shows it: the code to say, a QR, the link. */
export function invite(): void {
  if (first !== self) return first.invite();
  if (asleep) {
    void wake().then(() => invite());
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'pass' }));
}

/** Answers the knock at the door now (by voice: «пусти», «не сейчас»); false when nobody knocks. */
export function answerKnock(yes: boolean): boolean {
  if (first !== self) return first.answerKnock(yes);
  if (!knockNow || socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ t: 'let', id: knockNow.id, yes }));
  knockNow = undefined;
  closePlate();
  return true;
}

/** The game of the room a guest came into: on the published site it comes as code; while developing every page has it. */
async function takeHostsGame(room: string): Promise<void> {
  const game = await api<{ name?: string; js?: string }>('together/game', { room }).catch(() => ({}) as { name?: string; js?: string });
  if (!game.name || !game.js) return;
  dropMade({});
  runMade(game.name, game.js);
}

const SENT_AWAY: Record<number, string> = { 4000: 'Стол полон', 4003: 'Не пустили', 4004: 'Никого нет дома' };

function connect(room: string, name: string, seat: string | null, pass = ''): void {
  const params: Record<string, string> = { room, name };
  if (seat) params.seat = seat;
  if (pass) params.pass = pass;
  const ws = new WebSocket(socketAddress('together', params));
  ws.binaryType = 'arraybuffer';
  socket = ws;
  roomNow = room;
  ws.onmessage = (event) => {
    if (socket !== ws) return;
    if (event.data instanceof ArrayBuffer) {
      const packet = new Float32Array(event.data);
      const peer = peers.get(packet[ID]) ?? addPeer(packet[ID], 1, 'Friend');
      if (packet[KIND] === POSE && packet.length === POSE_LENGTH) {
        peer.poses.push(packet);
        if (peer.poses.length > KEEP) {
          peer.poses.shift();
          peer.at = Math.max(0, peer.at - 1);
        }
      } else if (packet[KIND] === THINGS && packet.length === 4 + packet[COUNT] * ENTRY) peer.things.push(packet);
      return;
    }
    const message = JSON.parse(String(event.data));
    if (message.t === 'welcome') {
      myId = message.id;
      mySeat = message.seat;
      inRoom = true;
      roomLabel = message.label;
      Object.assign(shared, message.state);
      for (const p of message.peers) addPeer(p.id, p.seat, p.name);
      electHost();
      seated();
      console.info(`[together] in room ${room} (${message.label}) as ${name}, seat ${mySeat}`);
      setGuestRoom(message.home ? '' : room); // what a guest makes or changes is the room's game
      if (!message.home && world && room !== home && message.peers.length) {
        showNote(world, `Ты в гостях: ${message.label}`);
        takeHostsGame(room).catch((error) => console.warn('[together] the host\'s game did not come', error));
      }
    } else if (message.t === 'join') {
      addPeer(message.id, message.seat, message.name);
      if (world) showNote(world, `${message.name} зашёл`);
    } else if (message.t === 'leave') {
      const gone = peers.get(message.id)?.name;
      removePeer(message.id);
      if (world && gone) showNote(world, `${gone} вышел`);
    } else if (message.t === 'knock') {
      knockNow = { id: message.id, name: message.name };
      if (world) showKnock(world, message.name, (yes) => answerKnock(yes));
    } else if (message.t === 'knockGone') {
      if (knockNow?.id === message.id) {
        knockNow = undefined;
        closePlate();
      }
    } else if (message.t === 'knocking') {
      if (world) showNote(world, 'Стучусь…', 60);
    } else if (message.t === 'pass') {
      const link = new URL('.//', location.href);
      link.searchParams.set('join', message.room);
      link.searchParams.set('pass', message.token);
      if (world) showInvite(world, message.label, link.toString());
    } else if (message.t === 'rtc') voiceSignal(message.from, message.data);
    else if (message.t === 'event') for (const handler of listeners.get(message.name) ?? []) handler(message.data, message.from);
    else if (message.t === 'state') {
      Object.assign(shared, message.patch);
      for (const handler of stateListeners) handler(message.patch, message.from);
    }
  };
  ws.onclose = (event) => {
    if (socket !== ws) return;
    const away = SENT_AWAY[event.code];
    if (away) {
      // turned away: a note, and home again
      if (world) showNote(world, away);
      socket = undefined;
      for (const id of [...peers.keys()]) if (id !== GHOST) removePeer(id);
      setTimeout(goHome, 1500);
      return;
    }
    console.warn(`[together] the room closed (${event.code}${event.reason ? ` ${event.reason}` : ''}); again in 2 s`);
    for (const id of [...peers.keys()]) if (id !== GHOST) removePeer(id);
    setTimeout(() => socket === ws && connect(room, name, String(mySeat)), 2000);
  };
}

/** A take is packets one after another, each led by its length. */
async function loadGhost(name: string, label: string): Promise<void> {
  const response = await fetch(apiUrl(`together/take/${encodeURIComponent(name)}`), { headers: apiHeaders() });
  if (!response.ok) throw new Error(`[together] no take ${name}: ${response.status}`);
  const all = new Float32Array(await response.arrayBuffer());
  const peer = addPeer(GHOST, 1, label, true);
  for (let i = 0; i < all.length; ) {
    const length = all[i];
    const packet = all.subarray(i + 1, i + 1 + length);
    i += 1 + length;
    if (packet[KIND] === POSE) peer.poses.push(packet);
    else if (packet[KIND] === THINGS) peer.things.push(packet);
  }
  if (!peer.poses.length) throw new Error(`[together] take ${name} is empty`);
  const seconds = peer.poses[peer.poses.length - 1][TIME] - peer.poses[0][TIME];
  console.info(`[together] take ${name}: ${peer.poses.length} poses, ${peer.things.length} things packets, ${seconds.toFixed(1)} s`);
}

function saveTake(): void {
  if (!take || !taken.length) return;
  let size = 0;
  for (const packet of taken) size += 1 + packet.length;
  const body = new Float32Array(size);
  let at = 0;
  for (const packet of taken) {
    body[at] = packet.length;
    body.set(packet, at + 1);
    at += 1 + packet.length;
  }
  taken.length = 0;
  fetch(apiUrl(`together/take/${encodeURIComponent(take)}?part=${takePart++}`), {
    method: 'POST',
    headers: { ...apiHeaders(), 'content-type': 'application/octet-stream' },
    body,
  }).catch((error) => console.warn('[together] the take was not saved', error));
}

/** Starts playing together: this player's own room, or what the address asks for (?join=, ?room=, ?ghost=, ?record=). */
export function startTogether(w: World): void {
  if (first !== self) return first.startTogether(w);
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  const ghost = params.get('ghost');
  take = (params.get('record') ?? '').replace(/[^\w-]/g, '');
  world = w;
  // Asleep until it is wanted (18.11: always on, it gave 16 reconnects and 6 failed handshakes in one session, and
  // nobody played together): it starts with ?room=, ?ghost=, ?together=1, or when the player invites or visits.
  if (!room && !ghost && params.get('together') !== '1') {
    asleep = () => startNow(w, params, room, ghost);
    return;
  }
  startNow(w, params, room, ghost);
}

let asleep: (() => void) | undefined;
/** Wakes playing together (an invite, a visit) and waits a little for the room's line to open. */
async function wake(): Promise<void> {
  if (!asleep) return;
  const start = asleep;
  asleep = undefined;
  start();
  for (let i = 0; i < 50 && socket?.readyState !== WebSocket.OPEN; i++) await new Promise((r) => setTimeout(r, 100));
}

function startNow(w: World, params: URLSearchParams, room: string | null, ghost: string | null): void {
  import('./together-avatar.js')
    .then(({ Avatar }) => {
      makeAvatar = (name, seat) => new Avatar(name, seat);
      begin(w, params, room, ghost);
    })
    .catch((error) => console.error('[together] could not start', error));
}

function begin(w: World, params: URLSearchParams, room: string | null, ghost: string | null): void {
  stageRoot = new Group();
  stageRoot.name = 'TogetherStage';
  w.createTransformEntity(stageRoot);
  w.registerSystem(TogetherSystem);
  running = true;
  voiceStart((to, data) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ t: 'rtc', to, data })));
  // a friend is changing the game: who and what; then everybody takes the room's new version
  on('_held', (data, from) => takeHeld(from, data as Parameters<typeof takeHeld>[1]));
  on('_shot', (data, from) => takeShot(from, data as { key: number; json: unknown }));
  on('_shotGone', (data) => dropShot((data as { key: number }).key));
  onLateThing(newThing);
  // a shot hit a mask: mine — a flash before my eyes; somebody else's — sparks there
  on('_hit', (data, from) => {
    const { to } = data as { to: number };
    if (to === myId) flashHit(w);
    else {
      const peer = peers.get(to);
      if (peer) sparksAt(peer.head);
    }
    for (const handler of hitListeners) handler({ from, to, byMe: false, onMe: to === myId });
  });
  on('making', (data) => {
    const { name, said } = data as { name: string; said: string };
    showNote(w, `${name} меняет игру: «${said.slice(0, 40)}»`, 60);
  });
  on('made', () => {
    closePlate();
    if (roomNow) takeHostsGame(roomNow).catch((error) => console.warn('[together] the new version did not come', error));
  });
  const join = params.get('join');
  if (params.get('name')) setName(params.get('name')!);
  setTimeout(seated, 3000); // the room does not answer: the game is built anyway, at seat 0
  // this player's own room, always open while they play (a test room or a friend's from the address instead)
  fetch(apiUrl('together/home'), { headers: apiHeaders() })
    .then((r) => r.json())
    .then((own: { code: string; label: string }) => {
      home = own.code;
      if (room || join || take || ghost) return; // a take is its own seat, no room
      connect(home, myName(), null);
    })
    .catch((error) => console.warn('[together] no room of my own', error));
  if (room) connect(room, myName(), params.get('seat'));
  else if (join) connect(join.toLowerCase(), myName(), null, params.get('pass') ?? '');
  else if (!take && !ghost) {
    // just playing: the own room comes when the server answers
  } else {
    // a take sits at seat 1 unless said otherwise: it is going to be the second player
    mySeat = take ? Number(params.get('seat') ?? 1) || 0 : 0;
    seated();
  }
  if (ghost) loadGhost(ghost, params.get('ghostName') ?? 'Friend').catch((error) => console.warn(error));
  if (take) {
    setInterval(saveTake, 3000);
    addEventListener('pagehide', saveTake);
    console.info(`[together] recording take ${take} at seat ${mySeat}`);
  }
  for (const thing of things.values()) settle(thing);
  (globalThis as { __together?: unknown }).__together = { peers, things, players, isHost, send, on, state, setState, invite, visit, goHome, answerKnock, home: () => home };
}

// ---------------------------------------------------------------- every frame

class TogetherSystem extends createSystem({}) {
  private p = new Vector3();
  private q = new Quaternion();
  private s = new Vector3();
  private m = new Matrix4();
  private jm = new Matrix4();
  private sinceSent = 0;
  private sinceFull = 0;
  private pose = new Float32Array(POSE_LENGTH);
  private head = { position: new Vector3(), quaternion: new Quaternion() };
  private hands = [new Float32Array(25 * JOINT), new Float32Array(25 * JOINT)];
  private pads: Pad[] = [0, 1].map(() => ({ position: new Vector3(), quaternion: new Quaternion(), trigger: 0, squeeze: 0, thumb: 0 }));
  private qa = new Quaternion();
  private qb = new Quaternion();
  private v = new Vector3();
  private w = new Vector3();
  private sinceScan = 0;

  update(delta: number, time: number): void {
    if (!findStage()) return;
    stageRoot!.position.setFromMatrixPosition(stage);
    stageRoot!.quaternion.copy(stageQ);

    this.sinceScan += delta;
    if (this.sinceScan > 0.5) {
      this.sinceScan = 0;
      shareWhatHandsTake();
      if (company() || take) sendHeld(this.player);
    }
    this.watchMyHands(delta);
    this.sinceGive += delta;
    if (this.sinceGive > 0.2 && inRoom) {
      this.sinceGive = 0;
      this.handOff();
    }
    this.sinceSent += delta;
    this.sinceFull += delta;
    // alone in the room, nothing goes out (a take is written all the same)
    let anyone = false;
    for (const peer of peers.values()) if (!peer.ghost) anyone = true;
    if (this.sinceSent >= SEND_EVERY) {
      this.sinceSent %= SEND_EVERY;
      if (anyone || take) {
        this.sendPose();
        this.sendThings();
      }
    }
    for (const peer of peers.values()) this.showPeer(peer, delta);
    // my ears for the friends' voices: where my head is and which way it looks
    const head = this.player.head.matrixWorld.elements;
    voiceListener(head[12], head[13], head[14], -head[8], -head[9], -head[10], head[4], head[5], head[6]);
    this.moveThings(delta);
    this.watchShots();
  }

  /** What I threw (for 3 s after the throw) or shot reaching a friend's mask is a hit, once per friend. */
  private watchShots(): void {
    const now = performance.now() / 1000;
    // new things: by my head or hands and fast at once — my shots
    for (let i = waiting.length - 1; i >= 0; i--) {
      const shot = waiting[i];
      if (!shot.entity.active || now - shot.at > 0.3) {
        waiting.splice(i, 1);
        continue;
      }
      shot.object.getWorldPosition(this.p);
      if (!shot.start) {
        const near = (o: Object3D) => o.getWorldPosition(this.v).distanceTo(this.p) < SHOT_NEAR;
        if (!near(this.player.head) && !near(this.player.gripSpaces.left) && !near(this.player.gripSpaces.right)) {
          waiting.splice(i, 1);
          continue;
        }
        shot.start = this.p.clone();
        shot.at = now;
        continue;
      }
      if (now - shot.at < 0.05) continue;
      waiting.splice(i, 1);
      if (this.p.distanceTo(shot.start) / (now - shot.at) < SHOT_SPEED) continue;
      const look = shot.object.toJSON();
      if (JSON.stringify(look).length > 400_000) continue;
      shot.key = 0x1000000 + Math.floor(Math.random() * 0xffffff); // apart from shared things' keys
      myShots.set(shot.key, shot);
      send('_shot', { key: shot.key, json: look });
    }
    for (const [key, shot] of myShots) {
      if (!shot.entity.active) {
        myShots.delete(key);
        send('_shotGone', { key });
        continue;
      }
      shot.object.getWorldPosition(this.p);
      const to = hitPlayer(this.p, 0.03);
      if (to === undefined || shot.hit?.has(to)) continue;
      (shot.hit ??= new Set()).add(to);
      scored(to);
    }
    // their shots that went quiet (they left, a packet was lost): gone after 10 s
    for (const [key, shot] of theirShots) if (performance.now() - shot.seen > 10_000) dropShot(key);
    for (const thing of things.values()) {
      if (thing.thrownAt === undefined) continue;
      if (now - thing.thrownAt > 3 || !thing.entity.active) {
        thing.thrownAt = undefined;
        continue;
      }
      thing.object.getWorldPosition(this.p);
      const to = hitPlayer(this.p, 0.03);
      if (to === undefined || thing.hit?.has(to)) continue;
      (thing.hit ??= new Set()).add(to);
      scored(to);
    }
  }

  /** Notices what my hands took and let go of, and how fast it moved (for a throw). */
  private watchMyHands(delta: number): void {
    for (const thing of things.values()) {
      if (!thing.entity.active) continue;
      const held = thing.entity.hasComponent(Grabbed);
      thing.object.getWorldPosition(this.p);
      if (delta > 0) thing.speed.subVectors(this.p, thing.lastP).divideScalar(delta);
      thing.lastP.copy(this.p);
      if (held && !thing.heldByMe) {
        thing.heldByMe = true;
        thing.holder = ME;
      } else if (!held && thing.heldByMe) {
        thing.heldByMe = false;
        thing.holder = 0;
        // my throw is mine to run (no delay for it); a guest's copy gets its body and the throw's speed
        if (thing.body && !owns(thing)) thing.launch = thing.speed.clone();
        thing.owner = ME;
        settle(thing);
        thing.thrownAt = performance.now() / 1000;
        thing.hit = undefined;
        this.letGo.push(thing);
      }
    }
  }
  private letGo: Thing[] = [];
  private giving: [Thing, number][] = [];
  private sinceGive = 0;

  /** A thing I run that a friend is clearly nearer to (a ball over the net) is theirs to run from now. */
  private handOff(): void {
    this.player.head.getWorldPosition(this.w);
    for (const thing of things.values()) {
      if (!owns(thing) || thing.holder || !thing.body || !thing.entity.active) continue;
      thing.object.getWorldPosition(this.p);
      const mine = this.p.distanceTo(this.w);
      let to: Peer | undefined;
      let nearest = mine - NEARER;
      for (const peer of peers.values()) {
        if (peer.ghost || !peer.hasHead) continue;
        const d = peer.head.distanceTo(this.p);
        if (d < nearest) [to, nearest] = [peer, d];
      }
      if (!to) continue;
      this.giving.push([thing, to.id]);
      thing.owner = to.id;
      settle(thing); // my physics lets go of it (its pose and speed go out in this frame's packet)
      // until their word comes, it stays where it is
      thing.target.p.copy(this.p);
      thing.object.getWorldQuaternion(thing.target.q);
      thing.target.has = true;
    }
  }

  /** The free things the host simulates follow nothing; everybody else's copies ease to where the network says,
   *  and at the host a thing in someone else's hand is driven after it. */
  private moveThings(delta: number): void {
    const k = 1 - Math.exp(-delta * 25);
    for (const thing of things.values()) {
      if (!thing.entity.active || thing.heldByMe) continue;
      if (thing.launch && thing.entity.hasComponent(PhysicsBody) && !thing.entity.hasComponent(PhysicsManipulation)) {
        thing.entity.addComponent(PhysicsManipulation, { linearVelocity: thing.launch.toArray() as [number, number, number] });
        thing.launch = undefined;
      }
      if (!thing.target.has) continue;
      if (thing.mode === 'follow') {
        thing.object.getWorldPosition(this.p);
        thing.object.getWorldQuaternion(this.q);
        // far off (it was thrown, the game started over): there at once
        if (this.p.distanceToSquared(thing.target.p) > 0.25) this.p.copy(thing.target.p);
        else this.p.lerp(thing.target.p, k);
        this.q.slerp(thing.target.q, k);
        placeInWorld(thing.object, this.p, this.q);
      } else if (thing.mode === 'kinematic' && thing.entity.hasComponent(PhysicsBody)) {
        drive(thing.entity, thing.object, thing.target.p, thing.target.q);
      }
    }
  }

  private sendPose(): void {
    const out = this.pose;
    out[KIND] = POSE;
    out[ID] = myId;
    out[TIME] = performance.now() / 1000 - startedAt;
    let flags = HAS_HEAD;
    // the head, in the shared frame
    this.player.head.updateWorldMatrix(true, false);
    this.m.multiplyMatrices(toStage, this.player.head.matrixWorld);
    this.m.decompose(this.p, this.q, this.s);
    this.p.toArray(out, HEAD);
    this.q.toArray(out, HEAD + 3);
    // each tracked hand: its 25 joints, which IWSDK keeps relative to the hand's grip, into the shared frame
    for (let h = 0; h < 2; h++) {
      const side = SIDES[h];
      const joints = this.input.xr.visualAdapters.hand[side].jointTransforms;
      if (!joints || !this.input.xr.isPrimary('hand', side)) continue;
      const grip = this.player.gripSpaces[side];
      grip.updateWorldMatrix(true, false);
      this.m.multiplyMatrices(toStage, grip.matrixWorld);
      for (let j = 0; j < 25; j++) {
        this.jm.fromArray(joints, j * 16).premultiply(this.m).decompose(this.p, this.q, this.s);
        this.p.toArray(out, HANDS[h] + j * JOINT);
        this.q.toArray(out, HANDS[h] + j * JOINT + 3);
      }
      flags |= HAS_HAND[h];
    }
    // a controller instead of a tracked hand: its grip, and how far the trigger and the grip button are pressed
    for (let h = 0; h < 2; h++) {
      const side = SIDES[h];
      if (flags & HAS_HAND[h] || !this.input.xr.isPrimary('controller', side)) continue;
      const pad = this.input.xr.gamepads[side];
      const grip = this.player.gripSpaces[side];
      grip.updateWorldMatrix(true, false);
      this.m.multiplyMatrices(toStage, grip.matrixWorld).decompose(this.p, this.q, this.s);
      this.p.toArray(out, HANDS[h]);
      this.q.toArray(out, HANDS[h] + 3);
      // the buttons IWSDK's own controller hand bends its fingers by: trigger, grip, the thumb's
      out[HANDS[h] + JOINT] = pad?.getButtonValueByIdx(0) ?? 0;
      out[HANDS[h] + JOINT + 1] = pad?.getButtonValueByIdx(1) ?? 0;
      out[HANDS[h] + JOINT + 2] = pad?.getButtonValueByIdx(3) ?? 0;
      flags |= HAS_PAD[h];
    }
    // where each hand's grip and ray are: what a hand holds hangs from one of them (holdInHand)
    for (let h = 0; h < 2; h++) {
      const spaces = [this.player.gripSpaces[SIDES[h]], this.player.raySpaces[SIDES[h]]];
      for (let k = 0; k < 2; k++) {
        spaces[k].updateWorldMatrix(true, false);
        this.m.multiplyMatrices(toStage, spaces[k].matrixWorld).decompose(this.p, this.q, this.s);
        this.p.toArray(out, SPACES + (h * 2 + k) * JOINT);
        this.q.toArray(out, SPACES + (h * 2 + k) * JOINT + 3);
      }
    }
    flags |= HAS_SPACES;
    out[FLAGS] = flags;
    if (socket?.readyState === WebSocket.OPEN && myId) socket.send(out);
    if (take) taken.push(out.slice());
  }

  /** What I hold and let go of; the host also where its free things are (the moved ones; all of them now and then). */
  private sendThings(): void {
    const full = inRoom && this.sinceFull >= FULL_EVERY;
    if (full) this.sinceFull = 0;
    const entries: number[] = [];
    const mine: number[] = []; // for a take: only what I held
    const entry = (thing: Thing, flags: number, list: number[]) => {
      thing.object.getWorldPosition(this.p).applyMatrix4(toStage);
      thing.object.getWorldQuaternion(this.q).premultiply(this.qa.copy(stageQ).invert());
      this.v.copy(thing.speed).applyQuaternion(this.qa);
      list.push(thing.key, flags, this.p.x, this.p.y, this.p.z, this.q.x, this.q.y, this.q.z, this.q.w, this.v.x, this.v.y, this.v.z);
      thing.sentP.copy(this.p);
      thing.sentQ.copy(this.q);
    };
    for (const thing of this.letGo) if (thing.entity.active) entry(thing, LET_GO, entries);
    for (const [key, shot] of myShots) {
      shot.object.getWorldPosition(this.p).applyMatrix4(toStage);
      shot.object.getWorldQuaternion(this.q).premultiply(this.qa.copy(stageQ).invert());
      entries.push(key, SHOT, this.p.x, this.p.y, this.p.z, this.q.x, this.q.y, this.q.z, this.q.w, 0, 0, 0);
    }
    this.letGo.length = 0;
    for (const [thing, to] of this.giving) if (thing.entity.active) entry(thing, GIVE + to * 16, entries);
    this.giving.length = 0;
    for (const thing of things.values()) {
      if (!thing.entity.active) continue;
      if (thing.heldByMe) entry(thing, HELD, entries);
      else if (owns(thing) && inRoom && !thing.holder) {
        thing.object.getWorldPosition(this.p).applyMatrix4(toStage);
        thing.object.getWorldQuaternion(this.q).premultiply(this.qa.copy(stageQ).invert());
        if (full || this.p.distanceToSquared(thing.sentP) > 1e-6 || Math.abs(this.q.dot(thing.sentQ)) < 0.99996) entry(thing, 0, entries);
      }
    }
    if (take) for (let i = 0; i < entries.length; i += ENTRY) if (entries[i + 1] & (HELD | LET_GO | SHOT)) mine.push(...entries.slice(i, i + ENTRY));
    const time = performance.now() / 1000 - startedAt;
    const packet = (list: number[]) => {
      const out = new Float32Array(4 + list.length);
      out[KIND] = THINGS;
      out[ID] = myId;
      out[TIME] = time;
      out[COUNT] = list.length / ENTRY;
      out.set(list, 4);
      return out;
    };
    if (entries.length && socket?.readyState === WebSocket.OPEN && myId) socket.send(packet(entries));
    if (mine.length) taken.push(packet(mine));
  }

  /** Shows a player as they were DELAY ago, in between the two poses around that moment, with what their hands did then. */
  private showPeer(peer: Peer, delta: number): void {
    const poses = peer.poses;
    if (!poses.length) {
      // things from a player whose poses have not come yet: as they come
      for (const packet of peer.things) takeThings(packet, peer.id);
      peer.things.length = 0;
      return;
    }
    const first = poses[0][TIME];
    const last = poses[poses.length - 1][TIME];
    if (!peer.started) {
      peer.clock = peer.ghost ? first : last - DELAY;
      peer.started = true;
    } else peer.clock += delta;
    if (peer.ghost) {
      if (peer.clock > last) {
        peer.clock = first; // a take loops
        peer.at = 0;
        peer.thingsAt = 0;
        dropAllOf(GHOST);
      }
    } else if (peer.clock > last) peer.clock = last; // nothing newer yet: hold
    else if (peer.clock < last - 0.5) peer.clock = last - DELAY; // fell behind: catch up
    // their things, at the moment their hands are shown
    if (peer.ghost) {
      while (peer.thingsAt < peer.things.length && peer.things[peer.thingsAt][TIME] <= peer.clock) takeThings(peer.things[peer.thingsAt++], peer.id);
    } else {
      let n = 0;
      while (n < peer.things.length && peer.things[n][TIME] <= peer.clock) takeThings(peer.things[n++], peer.id);
      if (n) peer.things.splice(0, n);
    }
    if (peer.at >= poses.length || poses[peer.at][TIME] > peer.clock) peer.at = 0;
    while (peer.at + 1 < poses.length && poses[peer.at + 1][TIME] <= peer.clock) peer.at++;
    const a = poses[peer.at];
    const b = poses[Math.min(peer.at + 1, poses.length - 1)];
    const span = b[TIME] - a[TIME];
    const k = span > 0 ? Math.min(1, Math.max(0, (peer.clock - a[TIME]) / span)) : 0;
    const flags = a[FLAGS] & b[FLAGS];
    const head = this.head;
    head.position.set(a[HEAD] + (b[HEAD] - a[HEAD]) * k, a[HEAD + 1] + (b[HEAD + 1] - a[HEAD + 1]) * k, a[HEAD + 2] + (b[HEAD + 2] - a[HEAD + 2]) * k);
    head.quaternion.slerpQuaternions(this.qa.fromArray(a, HEAD + 3), this.qb.fromArray(b, HEAD + 3), k);
    for (let h = 0; h < 2; h++) {
      if (flags & HAS_PAD[h]) {
        const pad = this.pads[h];
        const at = HANDS[h];
        pad.position.set(a[at] + (b[at] - a[at]) * k, a[at + 1] + (b[at + 1] - a[at + 1]) * k, a[at + 2] + (b[at + 2] - a[at + 2]) * k);
        pad.quaternion.slerpQuaternions(this.qa.fromArray(a, at + 3), this.qb.fromArray(b, at + 3), k);
        pad.trigger = a[at + JOINT] + (b[at + JOINT] - a[at + JOINT]) * k;
        pad.squeeze = a[at + JOINT + 1] + (b[at + JOINT + 1] - a[at + JOINT + 1]) * k;
        pad.thumb = a[at + JOINT + 2] + (b[at + JOINT + 2] - a[at + JOINT + 2]) * k;
        continue;
      }
      if (!(flags & HAS_HAND[h])) continue;
      const out = this.hands[h];
      for (let j = 0; j < 25; j++) {
        const at = HANDS[h] + j * JOINT;
        const o = j * JOINT;
        out[o] = a[at] + (b[at] - a[at]) * k;
        out[o + 1] = a[at + 1] + (b[at + 1] - a[at + 1]) * k;
        out[o + 2] = a[at + 2] + (b[at + 2] - a[at + 2]) * k;
        this.qa.fromArray(a, at + 3).slerp(this.qb.fromArray(b, at + 3), k).toArray(out, o + 3);
      }
    }
    peer.hasHead = !!(flags & HAS_HEAD);
    if (peer.hasHead) {
      peer.head.copy(head.position).applyMatrix4(stage);
      voicePlace(peer.id, peer.head.x, peer.head.y, peer.head.z); // their voice comes from their head
      // their head is a ball at whoever runs the physics: a thrown ball bounces off it
      if (!peer.ghost && world) {
        if (!peer.headBody) {
          const ball = new Group();
          ball.position.copy(peer.head);
          peer.headBody = world
            .createTransformEntity(ball)
            .addComponent(PhysicsShape, { shape: 'Sphere', dimensions: [MASK, 0, 0] })
            .addComponent(PhysicsBody, { state: PhysicsState.Kinematic });
        }
        if (peer.headBody.object3D) drive(peer.headBody, peer.headBody.object3D, peer.head, this.qa.identity());
      } else if (peer.headBody) {
        if (peer.headBody.active) peer.headBody.dispose();
        peer.headBody = undefined;
      }
    }
    if (flags & HAS_SPACES) {
      for (let h = 0; h < 2; h++) {
        const held = peer.held[h];
        if (!held) continue;
        const at = SPACES + (h * 2 + (held.space === 'ray' ? 1 : 0)) * JOINT;
        this.p.set(a[at] + (b[at] - a[at]) * k, a[at + 1] + (b[at + 1] - a[at + 1]) * k, a[at + 2] + (b[at + 2] - a[at + 2]) * k);
        this.q.slerpQuaternions(this.qa.fromArray(a, at + 3), this.qb.fromArray(b, at + 3), k);
        moveHeld(peer, h, this.m.compose(this.p, this.q, this.s.set(1, 1, 1)));
      }
    }
    peer.avatar.update(
      flags & HAS_HEAD ? head : null,
      flags & HAS_HAND[0] ? this.hands[0] : flags & HAS_PAD[0] ? this.pads[0] : null,
      flags & HAS_HAND[1] ? this.hands[1] : flags & HAS_PAD[1] ? this.pads[1] : null,
    );
  }
}

// this copy's functions, for later copies to hand their calls to (see `first`)
Object.assign(self, { setStage, setDefaultStage, ready, toWorld, share, isHost, players, send, on, state, setState, onState, company, onCompany, myName, setName, roomNowLabel, announceMaking, announceMade, visit, goHome, invite, answerKnock, startTogether, hitPlayer, onHit });
