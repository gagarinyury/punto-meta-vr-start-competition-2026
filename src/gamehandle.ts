import {
  Box3,
  createSystem,
  DistanceGrabbable,
  type Entity,
  Group,
  Matrix4,
  type Object3D,
  OneHandGrabbable,
  PhysicsBody,
  PhysicsSystem,
  Quaternion,
  Ray,
  TwoHandsGrabbable,
  Vector3,
  type World,
} from '@iwsdk/core';
import { madeNow, rootsOf } from './live.js';
import { creationCount, inFrontOfPlayer, type Place, placeAsked, spotOfThisRequest, surfaceLookedAt, surfaceNear } from './place.js';
import { sfx } from './sfx.js';
import { setDefaultStage } from './together.js';

/**
 * Moving what the coder made, and keeping it out of the player.
 *
 * Long pinch (16.11, Yury: «точку щипком переносим … эту полоску удали, она топорно»): the ray on any part of a
 * made thing, the pinch held HOLD_S — the whole thing (every root its code stands in the room, physics too) follows
 * the ray. The hand pushed forward sends it farther, pulled in brings it closer (×REACH_GAIN). It turns to keep
 * facing the player. Let go and it stays. A short pinch is the thing's own (keys, buttons, shots). Not while the
 * player is showing where to put something, not with a thing in that hand, not on what has its own grab.
 * The coder knows nothing of it.
 *
 * Put by the host (Yury, 18.11: «кодер создаёт вещь … остальное делает хост»): a made thing whose root the code left
 * exactly at the origin (0, 0, 0: built there, its bottom on y = 0, its front to +Z) is put where it goes — on the spot
 * chosen for this request (the table or wall looked at, the place pointed at), else where its code says it stands
 * (`root.userData.stands`: 'table' — the table looked at, else the floor; 'floor'; 'wall' — the wall ahead; 'air' —
 * before the eyes; 18.11: a toy village hung in the air), and without a word before the eyes, a big one (over a metre)
 * on the floor — standing 4 cm off a real surface, turned to the player. A change
 * or a reload of the same creation keeps its place (and where the player carried it); a game that takes the room
 * itself (a board on the table, portals, walls, a creature) never stands at the origin and is left alone.
 *
 * Stretch (Yury, 18.11: «вещь, которая строится, её всегда можно взять рукой, раздвинуть»): while one hand holds a thing,
 * the other hand pinches — anywhere — and the thing grows and shrinks with the distance between the hands, about its
 * foot (×0.2 to ×5 a time). Let the second hand go: the size stays, the first hand still carries it. Physics bodies
 * move with it but keep their size (a collider does not scale). So every made thing, game or place is moved and sized
 * the same way, and the coder writes no grab or scale of its own for it.
 *
 * Out of the player (16.11: the drums stood right in Yury): a new thing that, in its first seconds, overlaps the
 * player's head and chest is moved straight away from the head until clear. Room-wide things (a forest, fish all
 * round) are left as they are, and so is a thing standing on a real table (Yury, 18.11: the table lit up right and
 * the thing then slid a few cm — the table is the player's choice, a seated player's box reaches over its edge).
 * Every new thing's move over its first ~2 s goes to the log ([made] … settled), whoever moved it.
 *
 * Each player arranges their own room: a move is not sent to friends. The newest game's anchor (its foot, turned to
 * the player) is also the shared place of playing together (src/together.ts) unless the game names one.
 */

// The host carries and stretches nothing (Yury, 18.11: «не надо на хосте, чтобы путаницы не было»): the coder makes a
// thing takeable itself (DistanceGrabbable). The host still puts a new thing in its place.
const HOST_CARRIES = false;
const HOLD_S = 0.5; // a pinch this long on a made thing takes it
const REACH_GAIN = 3; // the hand 10 cm forward: the thing 30 cm farther
const SCAN = 0.5; // s between looks at the made things and their boxes
// the player's own body: this far round the head, from 1 m below it (a seated chest) to 0.3 m above. Small on purpose:
// a piano at arm's reach must stay there (16.11: 0.35 and 2 m pushed it out of reach)
const PLAYER_HALF = 0.2;
const ROOM_WIDE = 2; // m across: bigger than this is a room-wide thing, never pushed nor taken whole
const SETTLE_SCANS = 4; // a new thing is checked against the player over its first ~2 s (its parts come in)

type Side = 'left' | 'right';

interface Root {
  name: string;
  thing: Entity;
  box: Box3;
}

interface Drag {
  hand: Side;
  name: string;
  /** where each thing was when the drag began (world) */
  from: Map<Entity, Matrix4>;
  anchorFrom?: Matrix4;
  /** the group's foot then, the grabbed spot then, the turn to the player then */
  base: Vector3;
  grab: Vector3;
  yaw: number;
  /** the grabbed spot's distance along the ray then, the hand's distance from the head then */
  along: number;
  reach: number;
  /** the second hand is stretching: the hands' distance when it began */
  stretch?: { from: number };
  /** the host's placing of the thing when the drag began (see autoPlace), to keep it after the drag */
  placedFrom?: Matrix4;
}

export function startGameHandle(world: World): void {
  const anchor = new Group();
  anchor.name = 'GameAnchor';
  world.createTransformEntity(anchor);

  let game = ''; // the newest made thing: the anchor is on it
  const roots: Root[] = []; // pooled: `count` of them are live
  let count = 0;
  const settling = new Map<string, number>(); // name -> scans left to check it against the player
  const known = new Set<string>();
  // where each root of a new thing was when it came (world), to log how far it went while settling
  const cameAt = new Map<Entity, Vector3>();
  const onTable = new Set<string>(); // new things found standing on a real table: never pushed
  let pending: { hand: Side; name: string; point: Vector3; at: number } | undefined;
  let drag: Drag | undefined;
  let sinceScan = SCAN;
  let time = 0;

  const ray = new Ray();
  const bounds = new Box3();
  const playerBox = new Box3();
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  const head = new Vector3();
  const hit = new Vector3();
  const away = new Vector3();
  const m = new Matrix4();
  const move = new Matrix4();
  const turn = new Matrix4();
  const up = new Vector3(0, 1, 0);
  const pose = new Matrix4();
  const grow = new Matrix4();
  const leftHand = new Vector3();
  const rightHand = new Vector3();
  // ---- the host puts a thing built at the origin (autoPlace) ----
  const placedAt = new Map<string, Matrix4>(); // name -> the move the host gave its roots
  // roots already put, by their object: IWSDK reuses Entity objects, so a recoloured cube's new entity was taken for
  // the old one already put and stayed at the world's origin, under the player (18.11)
  const putByHost = new WeakSet<object>();
  const KEPT = 'punto.autoplace'; // { [name]: matrix } of the last few, and the last one with its creation's number
  type Kept = { names: Record<string, number[]>; last?: { creation: number; matrix: number[] } };
  const kept = (): Kept => {
    try {
      return JSON.parse(localStorage.getItem(KEPT) ?? '') as Kept;
    } catch {
      return { names: {} };
    }
  };
  const keep = (name: string, matrix: Matrix4) => {
    try {
      const all = kept();
      all.names = Object.fromEntries([...Object.entries(all.names ?? {}).filter(([n]) => n !== name).slice(-19), [name, matrix.toArray()]]);
      all.last = { creation: creationCount(), matrix: matrix.toArray() };
      localStorage.setItem(KEPT, JSON.stringify(all));
    } catch {
      // storage blocked: a reload simply puts it before the player again
    }
  };
  const atOrigin = (thing: Entity) => {
    const object = thing.object3D;
    return !!object && object.position.lengthSq() < 1e-10 && !putByHost.has(object);
  };
  /** Where a thing of this box goes now, as a move from where it stands (built at the origin). */
  const placing = (box: Box3, stands: unknown): Matrix4 => {
    const size = box.getSize(new Vector3());
    const biggest = Math.max(size.x, size.y, size.z);
    const said = stands === 'table' || stands === 'floor' || stands === 'wall' ? surfaceLookedAt(stands) : undefined;
    const spot: Place | undefined = spotOfThisRequest() ?? said;
    if (!spot && stands === 'floor') stands = 'big';
    let at: Vector3;
    let turned: Quaternion;
    let from: Vector3; // the point of the thing that goes onto the spot
    if (spot && spot.surface === 'wall') {
      // its back against the wall: the box's back face, its middle height, 4 cm off
      from = new Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);
      at = spot.point.clone().addScaledVector(spot.normal, 0.04);
      turned = spot.facing;
    } else if (spot && spot.surface !== 'air') {
      from = new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      at = spot.point.clone().addScaledVector(spot.normal, 0.04);
      turned = spot.facing;
      if (spot.surface === 'floor') {
        // the floor spot looked at may be at the player's feet (18.11: a piano 1.1 m wide stood against the knees):
        // its near side at least 0.6 m away, pushed out along the same line from the player
        world.player.head.getWorldPosition(p);
        const away = new Vector3(at.x - p.x, 0, at.z - p.z);
        const least = 0.6 + Math.max(size.x, size.z) / 2;
        if (away.length() < least) {
          if (away.lengthSq() < 1e-4) world.camera.getWorldDirection(away).setY(0);
          away.normalize();
          at.set(p.x + away.x * least, at.y, p.z + away.z * least);
        }
      }
    } else if (spot) {
      from = box.getCenter(new Vector3());
      at = spot.point.clone();
      turned = spot.facing;
    } else if (stands === 'big' || (stands !== 'air' && biggest > 1)) {
      // a big thing stands on the floor before the player, its near side 0.6 m away
      const front = inFrontOfPlayer(world, { distance: 0.6 + Math.max(size.x, size.z) / 2 });
      from = new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      at = front.point.clone().setY(0);
      turned = front.facing;
    } else {
      const front = inFrontOfPlayer(world, { distance: 0.5 + biggest / 2, below: 0.15 });
      from = box.getCenter(new Vector3());
      at = front.point;
      turned = front.facing;
    }
    return new Matrix4().makeTranslation(at.x, at.y, at.z)
      .multiply(new Matrix4().makeRotationFromQuaternion(turned))
      .multiply(new Matrix4().makeTranslation(-from.x, -from.y, -from.z));
  };
  /** The roots of `name` its code left at the origin go where they belong (see the head of this file). */
  const autoPlace = (name: string, roots: Entity[]) => {
    // Only a root that asks for it — userData.stands, which the coder sets on a thing (18.11, the space battles: a
    // game's container group left at the origin, its ships and portals at real room places inside it, was moved a
    // metre aside by the host, and the whole game ended up in the walls and behind the player).
    const waiting = roots.filter((thing) => atOrigin(thing) && thing.object3D?.userData.stands !== undefined);
    if (!waiting.length) return;
    let matrix = placedAt.get(name);
    if (!matrix) {
      const all = kept();
      const mine = all.names?.[name];
      const same = all.last && all.last.creation === creationCount() && creationCount() > 0 ? all.last.matrix : undefined;
      if (mine) matrix = new Matrix4().fromArray(mine); // a reload: where it was
      else if (same) matrix = new Matrix4().fromArray(same); // a change of the same creation: where the last version was
      else {
        const box = new Box3();
        for (const thing of waiting) box.union(new Box3().setFromObject(thing.object3D!));
        if (box.isEmpty()) return; // nothing to see yet: the next look
        matrix = placing(box, waiting.find((thing) => thing.object3D!.userData.stands)?.object3D!.userData.stands);
      }
      placedAt.set(name, matrix);
      keep(name, matrix);
      console.info(`[made] ${name}: put by the host`);
    }
    for (const thing of waiting) {
      thing.object3D!.updateWorldMatrix(true, false);
      place(thing, pose.multiplyMatrices(matrix, thing.object3D!.matrixWorld));
      putByHost.add(thing.object3D!);
    }
  };
  /** A drag of a thing the host put: its new place is kept for a change or a reload. */
  const keepDragged = () => {
    if (!drag?.placedFrom) return;
    const matrix = move.clone().multiply(drag.placedFrom);
    placedAt.set(drag.name, matrix);
    keep(drag.name, matrix);
  };

  const handsApart = () =>
    world.player.gripSpaces.left.getWorldPosition(leftHand).distanceTo(world.player.gripSpaces.right.getWorldPosition(rightHand));

  const boundsOf = (name: string, out: Box3) => {
    out.makeEmpty();
    for (let i = 0; i < count; i++) if (roots[i].name === name) out.union(roots[i].box);
    return out;
  };

  /** The made things and their boxes now; a new newest thing gets the anchor at its foot, turned to the player. */
  const scan = () => {
    count = 0;
    const names = madeNow();
    for (const name of names) {
      if (!known.has(name)) {
        known.add(name);
        settling.set(name, SETTLE_SCANS);
      }
      const ofName = rootsOf(name);
      autoPlace(name, ofName);
      for (const thing of ofName) {
        if (!thing.object3D) continue;
        const root = (roots[count] ??= { name: '', thing, box: new Box3() });
        root.name = name;
        root.thing = thing;
        root.box.setFromObject(thing.object3D);
        if (settling.has(name) && !cameAt.has(thing)) cameAt.set(thing, thing.object3D.getWorldPosition(new Vector3()));
        if (!root.box.isEmpty()) count++;
      }
    }
    for (const name of known) if (!names.includes(name)) known.delete(name), settling.delete(name), onTable.delete(name);
    const now = names[names.length - 1] ?? '';
    // a game whose things are not in the room yet (a board waits for the table) is taken when they are
    if (now !== game && (!now || !boundsOf(now, bounds).isEmpty())) {
      game = now;
      if (game) {
        bounds.getCenter(p).setY(bounds.min.y);
        world.player.head.getWorldPosition(head);
        anchor.position.copy(p);
        anchor.quaternion.setFromAxisAngle(up, Math.atan2(head.x - p.x, head.z - p.z));
        setDefaultStage(world, anchor); // the shared place of playing together, unless the game named its own
      }
    }
  };

  /** Puts `object` at the world pose `pose`, whatever it hangs from (an anchor's group, a board). */
  const putInWorld = (object: Object3D, pose: Matrix4) => {
    const parent = object.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      m.copy(parent.matrixWorld).invert().multiply(pose);
    } else m.copy(pose);
    m.decompose(object.position, object.quaternion, object.scale);
  };

  /** One thing to a world pose: a physics body through the physics, anything else as an object. */
  const place = (thing: Entity, at: Matrix4) => {
    if (!thing.active || !thing.object3D) return;
    if (thing.hasComponent(PhysicsBody) && thing.getValue(PhysicsBody, '_engineBody')) {
      at.decompose(s, q, hit);
      world.getSystem(PhysicsSystem)?.setBodyTransform(thing, { position: [s.x, s.y, s.z], quaternion: [q.x, q.y, q.z, q.w] });
    } else putInWorld(thing.object3D, at);
  };

  /** A new thing standing in the player goes straight away from the head (level) until clear. */
  const keepOut = (name: string) => {
    // a thing only (userData.stands): a game is never pushed — its gun in the hand and ships close by touched the
    // player, and the whole game went 75 cm aside (18.11)
    let thing = false;
    for (let i = 0; i < count; i++) if (roots[i].name === name && roots[i].thing.object3D?.userData.stands !== undefined) thing = true;
    if (!thing) return;
    boundsOf(name, bounds);
    if (bounds.isEmpty()) return;
    bounds.getSize(s);
    if (Math.max(s.x, s.z) > ROOM_WIDE || onTable.has(name)) return;
    // standing on a real table: its foot (the middle of the bottom of its box) on a table's plane
    bounds.getCenter(p).setY(bounds.min.y);
    if (surfaceNear(p)?.surface === 'table') {
      onTable.add(name);
      console.info(`[made] ${name} stands on a table: never pushed away from the player`);
      return;
    }
    world.player.head.getWorldPosition(head);
    playerBox.min.set(head.x - PLAYER_HALF, head.y - 1, head.z - PLAYER_HALF);
    playerBox.max.set(head.x + PLAYER_HALF, head.y + 0.3, head.z + PLAYER_HALF);
    if (!bounds.intersectsBox(playerBox)) return;
    bounds.getCenter(away).sub(head).setY(0);
    if (away.lengthSq() < 0.01) world.camera.getWorldDirection(away).setY(0); // where the player looks
    away.normalize();
    let shift = 0;
    while (shift < 3 && bounds.intersectsBox(playerBox)) {
      shift += 0.05;
      bounds.translate(p.copy(away).multiplyScalar(0.05));
    }
    move.makeTranslation(away.x * shift, 0, away.z * shift);
    for (let i = 0; i < count; i++) {
      const { name: of, thing } = roots[i];
      if (of !== name || !thing.object3D) continue;
      thing.object3D.updateWorldMatrix(true, false);
      place(thing, pose.multiplyMatrices(move, thing.object3D.matrixWorld));
      roots[i].box.translate(p.copy(away).multiplyScalar(shift));
    }
    if (name === game) {
      anchor.updateWorldMatrix(true, false);
      putInWorld(anchor, pose.multiplyMatrices(move, anchor.matrixWorld));
    }
    console.info(`[made] ${name} stood in the player: moved ${shift.toFixed(2)} m away`);
  };

  /** Logs how far the new thing's roots went since they came (the push above, a board, the code itself). */
  const settled = (name: string) => {
    let most = 0;
    for (let i = 0; i < count; i++) {
      const { name: of, thing } = roots[i];
      const was = cameAt.get(thing);
      if (of !== name || !was || !thing.object3D) continue;
      most = Math.max(most, thing.object3D.getWorldPosition(p).distanceTo(was));
      cameAt.delete(thing);
    }
    console.info(`[made] ${name} settled: moved ${(most * 100).toFixed(1)} cm since it came`);
  };

  const holding = (hand: Side) =>
    world.player.gripSpaces[hand].children.some((c) => c.userData.heldInHand) ||
    world.player.raySpaces[hand].children.some((c) => c.userData.heldInHand);

  const aim = (hand: Side) => {
    const space = world.player.raySpaces[hand];
    space.getWorldPosition(ray.origin);
    ray.direction.set(0, 0, -1).applyQuaternion(space.getWorldQuaternion(q));
  };

  /** A pinch began: on a made thing, it may become a drag once held HOLD_S. */
  const onSelectStart = (event: XRInputSourceEvent) => {
    if (!HOST_CARRIES) return;
    const hand: Side = event.inputSource.handedness === 'left' ? 'left' : 'right';
    if (drag && hand !== drag.hand && !drag.stretch && !holding(hand)) return stretchBegins();
    if (drag || placeAsked() || holding(hand)) return;
    aim(hand);
    world.player.head.getWorldPosition(head);
    let best = Infinity;
    let name = '';
    for (let i = 0; i < count; i++) {
      const { box, thing } = roots[i];
      if (box.containsPoint(head)) continue; // the player is inside it: a room-wide thing
      if (thing.hasComponent(DistanceGrabbable) || thing.hasComponent(OneHandGrabbable) || thing.hasComponent(TwoHandsGrabbable)) continue;
      boundsOf(roots[i].name, bounds).getSize(s);
      if (Math.max(s.x, s.z) > ROOM_WIDE) continue;
      if (!ray.intersectBox(box, hit)) continue;
      const d = hit.distanceTo(ray.origin);
      if (d < best) (best = d), (name = roots[i].name), p.copy(hit);
    }
    pending = name ? { hand, name, point: p.clone(), at: time } : undefined;
  };

  const onSelectEnd = (event: XRInputSourceEvent) => {
    const hand: Side = event.inputSource.handedness === 'left' ? 'left' : 'right';
    if (pending?.hand === hand) pending = undefined;
    if (drag?.stretch && drag.hand !== hand) return stretchEnds();
    if (drag?.hand !== hand) return;
    keepDragged();
    console.info(`[move] ${hand} ${drag.name}: put down`);
    sfx(world, 'pluck', drag.grab, 0.3);
    drag = undefined;
  };

  const stretchBegins = () => {
    if (!drag) return;
    drag.stretch = { from: Math.max(0.05, handsApart()) };
    console.info(`[move] ${drag.name}: stretched with both hands`);
    sfx(world, 'pluck', drag.grab, 0.3);
  };
  /** The second hand let go: the new size stays, and the carrying hand goes on from where the thing is now. */
  const stretchEnds = () => {
    if (!drag) return;
    keepDragged();
    const { hand, name } = drag;
    aim(hand);
    ray.at(drag.along, hit);
    begin(hand, name, hit, true);
  };

  const begin = (hand: Side, name: string, point: Vector3, quiet = false) => {
    const from = new Map<Entity, Matrix4>();
    for (let i = 0; i < count; i++) {
      const { name: of, thing } = roots[i];
      if (of !== name || !thing.active || !thing.object3D) continue;
      thing.object3D.updateWorldMatrix(true, false);
      from.set(thing, thing.object3D.matrixWorld.clone());
    }
    anchor.updateWorldMatrix(true, false);
    world.player.head.getWorldPosition(head);
    const base = boundsOf(name, bounds).getCenter(new Vector3()).setY(bounds.min.y);
    aim(hand);
    drag = {
      hand,
      name,
      from,
      anchorFrom: name === game ? anchor.matrixWorld.clone() : undefined,
      base,
      grab: point.clone(),
      yaw: Math.atan2(head.x - base.x, head.z - base.z),
      along: point.distanceTo(ray.origin),
      reach: ray.origin.distanceTo(head),
      placedFrom: placedAt.get(name)?.clone(),
    };
    settling.delete(name); // the player put it there: no pushing it away any more
    if (quiet) return;
    console.info(`[move] ${hand} ${name}: taken (long pinch)`);
    sfx(world, 'pluck', point, 0.4);
  };

  // three's own session: world.session is not set yet when 'sessionstart' fires (16.11: the long pinch did nothing)
  world.renderer.xr.addEventListener('sessionstart', () => {
    const session = world.renderer.xr.getSession();
    session?.addEventListener('selectstart', onSelectStart);
    session?.addEventListener('selectend', onSelectEnd);
  });
  world.renderer.xr.addEventListener('sessionend', () => {
    pending = drag = undefined;
  });

  world.registerSystem(
    class GameHandle extends createSystem({}) {
      update(delta: number): void {
        time += delta;
        sinceScan += delta;
        if (!drag && sinceScan >= SCAN) {
          sinceScan = 0;
          scan();
          for (const [name, left] of settling) {
            keepOut(name);
            if (left <= 1) {
              settling.delete(name);
              settled(name);
            } else settling.set(name, left - 1);
          }
          if (!settling.size) cameAt.clear(); // a thing gone before it settled leaves nothing behind
        }
        if (pending && time - pending.at >= HOLD_S) {
          begin(pending.hand, pending.name, pending.point);
          pending = undefined;
          // both hands came down on it together: the other one is already pinching
          if (this.input.xr.getSelectState(drag!.hand === 'left' ? 'right' : 'left').active) stretchBegins();
        }
        if (!drag) return;

        // the grabbed spot rides the holding hand's ray; the hand's reach sets how far along
        aim(drag.hand);
        this.player.head.getWorldPosition(head);
        const along = Math.min(6, Math.max(0.3, drag.along + (ray.origin.distanceTo(head) - drag.reach) * REACH_GAIN));
        ray.at(along, hit);
        // the foot goes where the grabbed spot goes; the thing turns to keep facing the player
        const base = p.copy(drag.base).add(hit).sub(drag.grab);
        const yaw = Math.atan2(head.x - base.x, head.z - base.z) - drag.yaw;
        const k = drag.stretch ? Math.min(5, Math.max(0.2, handsApart() / drag.stretch.from)) : 1;
        move
          .makeTranslation(base.x, base.y, base.z)
          .multiply(turn.makeRotationY(yaw))
          .multiply(grow.makeScale(k, k, k))
          .multiply(m.makeTranslation(-drag.base.x, -drag.base.y, -drag.base.z));
        for (const [thing, was] of drag.from) place(thing, pose.multiplyMatrices(move, was));
        if (drag.anchorFrom) putInWorld(anchor, pose.multiplyMatrices(move, drag.anchorFrom));
      }
    },
  );
}
