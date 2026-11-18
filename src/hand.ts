import {
  Box3,
  createSystem,
  CylinderGeometry,
  Mesh as MeshNew,
  MeshBasicMaterial,
  Ray,
  Group,
  Matrix4,
  type Mesh,
  Object3D,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  Quaternion,
  Vector3,
  type World,
} from '@iwsdk/core';
import { onUnload } from './live.js';

/**
 * Puts a model into the player's hand, for a bare hand and for a controller.
 *
 * Build the model like this: the handle at the origin, running along Y;
 * +Y comes out of the top of the fist (sword blade, hammer head),
 * -Z points forward, away from the player (pistol barrel, wand, torch beam).
 *
 * `aimed: true` is for things the player points with: on a controller they
 * follow the aiming ray. Everything else follows the fist.
 * `grip: 'stick'` is for a thin stick held between the thumb and the fingers —
 * a drumstick, mallet, pencil, chopstick, conductor's baton: on a bare hand
 * +Y runs along the fingers, a little toward the thumb, not straight out of
 * the side of the fist as a sword does (16.11: drumsticks stuck out sideways,
 * crossed, 90 degrees off; on a controller the fist is held thumb up and the
 * sword grip already points them forward, so that stays).
 * `onUse` fires when the player pulls the index finger like a trigger
 * (bare hand) or presses the trigger (controller).
 *
 * Measured in the emulator: both grip spaces have -Z coming out of the fist
 * by the thumb; on a bare hand -Y runs along the fingers. A controller grip
 * is tilted 45 degrees from its aiming ray; a bare hand's ray ignores the wrist.
 */
export function holdInHand(
  world: World,
  model: Object3D,
  options: { side?: 'left' | 'right'; aimed?: boolean; grip?: 'fist' | 'stick'; sight?: boolean; onUse?: (shot: Shot) => void } = {},
): () => void {
  const { side = 'right', aimed = false, grip: hold = 'fist', sight = aimed } = options;
  const what = model.name || 'a thing';
  console.info(`[hold] ${side} ${what}`); // the player's actions in the log (src/trace.ts)
  // the shot leaves the end of the barrel (16.11: a pistol fired from the middle of the hand — the model's origin,
  // its handle — so it missed what it pointed at)
  const shot: Shot = { from: new Vector3(), direction: new Vector3() };
  // A bare hand fires by curling the index finger, and the curl turns the hand: the shot goes where the barrel
  // pointed AIM_BACK frames before (~80 ms), not where the curl took it (16.11: the cans could not be hit).
  const AIM_BACK = 6;
  const pastFrom = Array.from({ length: AIM_BACK }, () => new Vector3());
  const pastDir = Array.from({ length: AIM_BACK }, () => new Vector3());
  let frame = 0;
  let past = 0; // frames recorded so far, up to AIM_BACK
  let fromPast = false;
  const onUse = options.onUse && (() => {
    if (fromPast && past >= AIM_BACK) {
      const oldest = frame % AIM_BACK; // the slot written AIM_BACK frames ago, next to be overwritten
      shot.from.copy(pastFrom[oldest]);
      shot.direction.copy(pastDir[oldest]);
    } else muzzleOf(model, shot.from, shot.direction);
    console.info(`[use] ${side} ${what}`);
    options.onUse!(shot);
  });
  // A thin laser sight out of the barrel for what is aimed (16.11: without it nothing could be hit with a bare
  // hand); `sight: false` for a game that wants none. A child of the model: it goes wherever the model goes.
  let sightLine: Mesh | undefined;
  const lay = () => {
    muzzleOf(model, tip);
    const local = muzzles.get(model)!;
    const geometry = new CylinderGeometry(0.0011, 0.0011, SIGHT_M, 6, 1, true);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(local.x, local.y, local.z - SIGHT_M / 2);
    sightLine = new MeshNew(geometry, new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.35, depthWrite: false }));
    sightLine.name = 'laser sight';
    sightLine.renderOrder = 4;
    model.add(sightLine);
  };
  model.userData.heldInHand = side; // friends in other rooms see it in this hand too (src/together.ts)
  const tip = new Vector3();
  const palm = new Vector3();
  let onRay: boolean | undefined;
  let asStick: boolean | undefined;
  let cocked = false;

  class HeldInHand extends createSystem({}) {
      init(): void {
        this.cleanupFuncs.push(() => {
          model.removeFromParent();
          if (sightLine) {
            sightLine.removeFromParent();
            sightLine.geometry.dispose();
            (sightLine.material as MeshBasicMaterial).dispose();
          }
        });
      }

      update(): void {
        if (sight && !sightLine && model.parent) lay();
        const bareHand = this.input.xr.isPrimary('hand', side);
        fromPast = bareHand;
        if (onUse && aimed) {
          const slot = frame++ % AIM_BACK;
          muzzleOf(model, pastFrom[slot], pastDir[slot]);
          if (past < AIM_BACK) past++;
        }
        const grip = this.player.gripSpaces[side];
        const useRay = aimed && !bareHand;
        const stick = hold === 'stick' && bareHand;
        if (useRay !== onRay || stick !== asStick) {
          onRay = useRay;
          asStick = stick;
          if (useRay) {
            model.position.set(0, -0.03, 0.05); // handle back into the palm
            model.rotation.set(0, 0, 0);
            this.player.raySpaces[side].add(model);
          } else {
            model.position.set(0, 0, 0);
            // a stick: +Y along the fingers (the bare grip's -Y), 25 degrees toward the thumb (its -Z)
            model.rotation.set(stick ? Math.PI + 0.45 : -Math.PI / 2, 0, 0);
            grip.add(model);
          }
        }
        if (!onUse) {
          return;
        }
        if (!bareHand) {
          if (this.input.xr.gamepads[side]?.getSelectStart()) {
            onUse();
          }
          return;
        }
        // Index tip to palm: ~12 cm straight, 2-4 cm curled.
        const reach = this.player.indexTipSpaces[side]
          .getWorldPosition(tip)
          .distanceTo(grip.getWorldPosition(palm));
        if (cocked && reach < 0.07) {
          cocked = false;
          onUse();
        } else if (reach > 0.09) {
          cocked = true;
        }
      }
  }
  world.registerSystem(HeldInHand);
  // Let go: the thing leaves the hand (the system's cleanup takes it off).
  return () => {
    console.info(`[drop] ${side} ${what}`);
    world.unregisterSystem(HeldInHand);
  };
}

/**
 * Makes a part of a held tool hit physics bodies: a racket face hits a ball,
 * a hammer head knocks a tower over.
 *
 * `part` is the Object3D to follow (the racket face, the hammer head);
 * `size` is the box around it, [x, y, z] in the part's own axes.
 *
 * A held tool hangs under the hand, and physics only understands bodies at the
 * scene root. So an invisible body at the root is driven after the part with
 * velocities; that way a fast swing gives the ball a fast flight.
 */
export function strikeWith(
  world: World,
  part: Object3D,
  size: [number, number, number],
): void {
  // its end touches what onFingerTouch listens to, as a fingertip does (drum sticks on the drums), in the hand that
  // holds it (holdInHand set userData.heldInHand on the tool above it)
  let holder: Object3D | null = part;
  while (holder && !holder.userData.heldInHand) holder = holder.parent;
  tools.push({ part, hand: holder?.userData.heldInHand === 'left' ? 'left' : 'right' });
  const twin = new Object3D();
  const body = world
    .createTransformEntity(twin)
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions: size })
    .addComponent(PhysicsBody, { state: PhysicsState.Kinematic });
  const target = new Vector3();
  const turn = new Quaternion();
  const back = new Quaternion();
  const spin = new Vector3();
  // the velocities sent every frame: one object, refilled (addComponent copies the numbers)
  const push: { linearVelocity: [number, number, number]; angularVelocity: [number, number, number] } = {
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
  let placed = false;

  world.registerSystem(
    class StrikeWith extends createSystem({}) {
      update(delta: number): void {
        if (delta <= 0 || body.hasComponent(PhysicsManipulation)) {
          return;
        }
        part.getWorldPosition(target);
        part.getWorldQuaternion(turn);
        if (!placed) {
          placed = true;
          twin.position.copy(target);
          twin.quaternion.copy(turn);
          return;
        }
        // Velocity that brings the body onto the part by the next frame.
        target.sub(twin.position).divideScalar(delta);
        // Rotation from the body to the part, as an angular velocity.
        turn.multiply(back.copy(twin.quaternion).invert());
        const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
        const s = Math.sqrt(1 - turn.w * turn.w) || 1;
        spin
          .set(turn.x, turn.y, turn.z)
          .multiplyScalar(((turn.w < 0 ? -1 : 1) * angle) / s / delta);
        // An exact zero means "leave as is", so never send one.
        push.linearVelocity[0] = target.x || 1e-6;
        push.linearVelocity[1] = target.y;
        push.linearVelocity[2] = target.z;
        push.angularVelocity[0] = spin.x || 1e-6;
        push.angularVelocity[1] = spin.y;
        push.angularVelocity[2] = spin.z;
        body.addComponent(PhysicsManipulation, push);
      }
    },
  );
}

/**
 * Turns a downloaded model (any axes, any size, any origin) into one that
 * `holdInHand` understands: handle at the origin along Y, +Y out of the fist,
 * -Z forward. It reads the shape, not the file's axes.
 *
 * `aimed: true` — pistol-like: the longest side is the barrel, the handle
 * hangs from one end of it.
 * `aimed: false` — sword-like: the longest side is the blade; the handle is
 * the end near the crossguard, or the thicker end.
 * `length` — the real length of the longest side, in metres.
 * `heavyEnd: true` — a hammer, axe or pickaxe: the widest part is the head,
 * and the hand holds the other end of the handle.
 */
export function fitToHand(
  model: Object3D,
  options: { aimed: boolean; length: number; heavyEnd?: boolean },
): Group {
  model.updateMatrixWorld(true);
  const points: Vector3[] = [];
  model.traverse((child) => {
    const positions = (child as Mesh).geometry?.attributes.position;
    if (!positions) {
      return;
    }
    const step = Math.max(1, Math.floor(positions.count / 4000));
    for (let i = 0; i < positions.count; i += step) {
      points.push(
        new Vector3().fromBufferAttribute(positions, i).applyMatrix4(child.matrixWorld),
      );
    }
  });

  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = min.clone().negate();
  for (const point of points) {
    min.min(point);
    max.max(point);
  }
  const size = max.clone().sub(min);
  // Model axes sorted from the longest side to the thinnest.
  const [long, mid, thin] = ([0, 1, 2] as const)
    .slice()
    .sort((a, b) => size.getComponent(b) - size.getComponent(a));
  const at = (point: Vector3, axis: number) =>
    (point.getComponent(axis) - min.getComponent(axis)) / size.getComponent(axis); // 0..1
  // Extent of the points with `along` in [from, to], measured on `across`.
  const extent = (along: number, from: number, to: number, across: number) => {
    let low = Infinity;
    let high = -Infinity;
    for (const point of points) {
      const t = at(point, along);
      if (t >= from && t <= to) {
        const value = at(point, across);
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
    return high > low ? { low, high, width: high - low } : { low: 0.5, high: 0.5, width: 0 };
  };

  // For each model axis: which hand axis it becomes, and its sign.
  const target = new Vector3(); // grip point, in 0..1 box coordinates per axis
  const sign = [1, 1, 1];
  let up: number;
  let forward: number;
  if (options.aimed) {
    forward = long;
    up = mid;
    // The handle is the low slab that covers only part of the barrel length.
    const bottom = extent(mid, 0, 0.3, long);
    const top = extent(mid, 0.7, 1, long);
    const handle = bottom.width < top.width ? bottom : top;
    sign[mid] = handle === bottom ? 1 : -1; // model +mid is "up" when the handle is at the bottom
    const handleCentre = (handle.low + handle.high) / 2;
    sign[long] = handleCentre < 0.5 ? 1 : -1; // forward is away from the handle
    target.setComponent(long, handleCentre);
    target.setComponent(mid, handle === bottom ? 0.35 : 0.65);
    target.setComponent(thin, 0.5);
  } else {
    up = long;
    forward = mid;
    // The crossguard is the widest slice; the handle is the end nearer to it.
    let widest = 0;
    let guard = 0.5;
    for (let i = 0; i < 20; i++) {
      const width = extent(long, i / 20, (i + 1) / 20, mid).width;
      if (width > widest) {
        widest = width;
        guard = (i + 0.5) / 20;
      }
    }
    let handleAtStart = guard < 0.5;
    if (options.heavyEnd) {
      // The widest slice is the head: hold the far end of the handle.
      handleAtStart = guard > 0.5;
      guard = handleAtStart ? 0.24 : 0.76;
    } else if (guard > 0.4 && guard < 0.6) {
      // No clear guard: the handle is round, the blade is flat.
      handleAtStart =
        extent(long, 0, 0.2, thin).width > extent(long, 0.8, 1, thin).width;
      guard = handleAtStart ? 0.2 : 0.8;
    }
    sign[long] = handleAtStart ? 1 : -1;
    target.setComponent(long, handleAtStart ? guard * 0.5 : 1 - (1 - guard) * 0.5);
    target.setComponent(mid, 0.5);
    target.setComponent(thin, 0.5);
  }

  // Rows of the rotation: hand X, Y, Z expressed in model axes.
  const axis = (index: number, value: number) => new Vector3().setComponent(index, value);
  const y = axis(up, sign[up]);
  const z = axis(forward, -sign[forward]); // hand -Z is forward
  const x = new Vector3().crossVectors(y, z); // keeps it a rotation, not a mirror
  const rotation = new Matrix4().makeBasis(x, y, z).transpose();
  const grip = min.clone().add(size.clone().multiply(target));
  const scale = options.length / size.getComponent(long);

  model.applyMatrix4(
    new Matrix4()
      .makeScale(scale, scale, scale)
      .multiply(rotation)
      .multiply(new Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z)),
  );
  const fitted = new Group();
  fitted.add(model);
  return fitted;
}

/** Where a held thing's shot starts and where it goes (world): the far end of its barrel, along its -Z. */
export interface Shot {
  from: Vector3;
  direction: Vector3;
}

const muzzles = new WeakMap<Object3D, Vector3>();
const SIGHT_M = 3; // the laser sight's length
const corner = new Vector3();
const toModel = new Matrix4();

/**
 * The end of a held thing's barrel or blade in the room, and (into `direction`) the way it points: the far end along
 * its -Z, at the middle of its front part — a pistol's muzzle, a wand's tip, a bow's arrow rest. For a model built
 * for holdInHand (barrel along -Z) or turned by fitToHand. Read once from its shape, then cheap. Shoot from here,
 * never from the model's own position (that is the handle, in the middle of the hand).
 */
export function muzzleOf(model: Object3D, out: Vector3, direction?: Vector3): Vector3 {
  let local = muzzles.get(model);
  if (!local) {
    // every vertex in the model's own space: the front tenth of its length, and the middle of that slice
    model.updateWorldMatrix(true, true);
    const toLocal = new Matrix4().copy(model.matrixWorld).invert();
    let front = Infinity;
    const points: number[] = [];
    model.traverse((object) => {
      const mesh = object as Mesh;
      const position = mesh.isMesh ? mesh.geometry.getAttribute('position') : undefined;
      if (!position) return;
      toModel.multiplyMatrices(toLocal, mesh.matrixWorld);
      const step = Math.max(1, Math.floor(position.count / 4000));
      for (let i = 0; i < position.count; i += step) {
        corner.fromBufferAttribute(position, i).applyMatrix4(toModel);
        points.push(corner.x, corner.y, corner.z);
        if (corner.z < front) front = corner.z;
      }
    });
    let back = -Infinity;
    for (let i = 2; i < points.length; i += 3) back = Math.max(back, points[i]);
    const edge = front + (back - front) * 0.1;
    let x = 0, y = 0, n = 0;
    for (let i = 0; i < points.length; i += 3) if (points[i + 2] <= edge) (x += points[i]), (y += points[i + 1]), n++;
    local = n ? new Vector3(x / n, y / n, front) : new Vector3();
    muzzles.set(model, local);
  }
  model.localToWorld(out.copy(local));
  if (direction) model.getWorldDirection(direction).negate();
  return out;
}

/** A fingertip touching: which hand, which finger (`controller` for a controller's tip, `tool` for the striking end
 *  of a held stick, mallet or bat — strikeWith), and where (world). */
export interface Finger {
  hand: 'left' | 'right';
  name: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' | 'controller' | 'tool';
  point: Vector3;
  /** how fast it came, metres a second: a soft touch ~0.2, a drum strike 1-3 (velocityOf in ../music.js) */
  speed: number;
}

const TIPS = [
  ['thumb', 'thumb-tip'],
  ['index', 'index-finger-tip'],
  ['middle', 'middle-finger-tip'],
  ['ring', 'ring-finger-tip'],
  ['pinky', 'pinky-finger-tip'],
] as const;

interface Touchable {
  part: Object3D;
  onTouch: (finger: Finger) => void;
  onRelease?: (finger: Finger) => void;
  margin: number;
  /** which of the 10 fingers is in it now (bit i = fingers[i]) */
  inside: number;
  /** it has been in the room: once it is taken out (its feature reloaded or gone), it is dropped */
  seen: boolean;
  /** when each finger last touched it (performance.now): a tracking jitter within BOUNCE_MS is not a new touch */
  touchedAt: Float64Array;
}
const BOUNCE_MS = 70;

/**
 * Every fingertip of both bare hands — thumb to pinky, ten of them — touching a part (16.11: a piano heard only the
 * index finger, which is all PokeInteractable feels). `onTouch(finger)` fires when a fingertip comes into `part`,
 * `onRelease(finger)` when it leaves, each finger on its own: chords, a drum roll with all fingers, two hands. With
 * a controller its tip counts as one finger, and so does the end of a held stick or mallet given to strikeWith (drum
 * sticks play the drums). A fast strike that goes right through a thin part between two frames counts too (16.11: a
 * drum skin 1.2 cm thick missed the fingers). `part` is a mesh (its geometry's own box, turned with it) or a group
 * (its box in the room); a moving part works. `margin` grows it (metres, default 0.008). Returns: stop.
 *
 *   onFingerTouch(world, key, (finger) => { playNote(i); glow(key); }, () => unglow(key));
 */
export function onFingerTouch(
  world: World,
  part: Object3D,
  onTouch: (finger: Finger) => void,
  onRelease?: (finger: Finger) => void,
  { margin = 0.008 } = {},
): () => void {
  // the fingers are watched by the host's own system (startFingers, src/index.ts); the touch goes with the game
  const one: Touchable = { part, onTouch, onRelease, margin, inside: 0, seen: false, touchedAt: new Float64Array(16) };
  touchables.add(one);
  const stop = () => void touchables.delete(one);
  onUnload(world, stop);
  return stop;
}

// One set per page, not per copy of this module (18.11: after the host's own files were changed on the fly, a new game
// imported hand.ts?t=… — a second copy — and its keys and drum heads went into a set no finger watch ever read: not one
// touch all day). The watch, the touchables, the fingers and the held tools live on globalThis, as live.ts's state does.
const handState = ((globalThis as unknown as { __puntoHand?: unknown }).__puntoHand ??= {
  touchables: new Set(),
  fingers: [],
  on: false,
  tools: [],
}) as {
  touchables: Set<Touchable>;
  fingers: (Finger & { live: boolean; prev: Vector3; prevLive: boolean })[];
  on: boolean;
  tools: { part: Object3D; hand: 'left' | 'right' }[];
};
const touchables = handState.touchables;
const fingers = handState.fingers;
/** the striking ends of held tools (strikeWith): they touch as fingers do */
const tools = handState.tools;
const TOOL_SLOTS = 4;

/** The fingertip watch, started once by the host on the real world (src/index.ts). Started from inside a made thing,
 *  it went with that thing: the drums' new version (sticks added) felt nothing at all (16.11). */
export function startFingers(world: World): void {
  if (handState.on) return;
  handState.on = true;
  const one = (hand: 'left' | 'right', name: Finger['name']) => ({ hand, name, point: new Vector3(), speed: 0, live: false, prev: new Vector3(), prevLive: false });
  for (const hand of ['left', 'right'] as const) for (const [name] of TIPS) fingers.push(one(hand, name));
  for (const hand of ['left', 'right'] as const) fingers.push(one(hand, 'controller'));
  for (let i = 0; i < TOOL_SLOTS; i++) fingers.push(one('right', 'tool'));
  const box = new Box3();
  const grown = new Box3();
  const from = new Vector3();
  const sweep = new Ray();
  const crossing = new Vector3();
  const local = new Vector3();
  const inverse = new Matrix4();
  const scale = new Vector3();

  class FingerTouch extends createSystem({}) {
    update(delta: number): void {
      for (const finger of fingers) {
        finger.prev.copy(finger.point);
        finger.prevLive = finger.live;
        finger.live = false;
      }
      const xr = world.renderer.xr;
      const frame = xr.getFrame();
      const space = xr.getReferenceSpace();
      if (frame && space && world.session) {
        for (const source of world.session.inputSources) {
          const hand = source.handedness === 'left' ? 0 : source.handedness === 'right' ? 1 : -1;
          if (hand < 0) continue;
          if (source.hand) {
            for (let i = 0; i < TIPS.length; i++) {
              const joint = source.hand.get(TIPS[i][1]);
              const pose = joint && frame.getJointPose?.(joint, space);
              if (!pose) continue;
              const finger = fingers[hand * 5 + i];
              const p = pose.transform.position;
              // poses are in the player's own space (the rig moves with locomotion)
              this.player.localToWorld(finger.point.set(p.x, p.y, p.z));
              finger.live = true;
            }
          } else {
            const finger = fingers[10 + hand];
            this.player.raySpaces[hand ? 'right' : 'left'].getWorldPosition(finger.point);
            finger.live = true;
          }
        }
      }
      for (let i = tools.length - 1; i >= 0; i--) if (!tools[i].part.parent && tools[i].part.userData.struck) tools.splice(i, 1);
      for (let i = 0; i < TOOL_SLOTS; i++) {
        const tool = tools[i];
        if (!tool?.part.parent) continue;
        tool.part.userData.struck = true;
        const finger = fingers[12 + i];
        finger.hand = tool.hand;
        tool.part.getWorldPosition(finger.point);
        finger.live = true;
      }
      for (const finger of fingers) finger.speed = finger.live && finger.prevLive && delta > 0 ? finger.point.distanceTo(finger.prev) / delta : 0;
      const now = performance.now();
      for (const one of touchables) {
        const { part } = one;
        if (!part.parent) {
          if (one.seen) touchables.delete(one);
          continue;
        }
        one.seen = true;
        // hidden (a creation burning away while its next version comes) or under something hidden: not touchable
        let shown = true;
        for (let up: Object3D | null = part; up && shown; up = up.parent) shown = up.visible;
        if (!shown) continue;
        const mesh = (part as Mesh).isMesh && part.children.length === 0 ? (part as Mesh) : undefined;
        let pad = one.margin;
        if (mesh) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          part.updateWorldMatrix(true, false);
          inverse.copy(part.matrixWorld).invert();
          part.getWorldScale(scale);
          pad /= Math.max(1e-4, Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)));
          box.copy(mesh.geometry.boundingBox!);
        } else box.setFromObject(part);
        for (let i = 0; i < fingers.length; i++) {
          const finger = fingers[i];
          const bit = 1 << i;
          const was = (one.inside & bit) !== 0;
          let inside = false;
          if (finger.live) {
            const at = mesh ? local.copy(finger.point).applyMatrix4(inverse) : finger.point;
            // out again only past twice the margin: a finger resting on the edge does not chatter
            const grow = was ? pad * 2 : pad;
            grown.copy(box).expandByScalar(grow);
            inside = grown.containsPoint(at);
            // went right through it since the last frame (a quick strike on a thin skin or key)
            if (!inside && !was && finger.prevLive) {
              const a = mesh ? from.copy(finger.prev).applyMatrix4(inverse) : finger.prev;
              const length = a.distanceTo(at);
              if (length > 1e-5) {
                sweep.origin.copy(a);
                sweep.direction.copy(at).sub(a).divideScalar(length);
                inside = sweep.intersectBox(grown, crossing) !== null && crossing.distanceTo(a) <= length;
              }
            }
          }
          if (inside === was) continue;
          one.inside ^= bit;
          if (!inside) {
            try {
              one.onRelease?.(finger);
            } catch (error) {
              console.error(`[touch] ${part.name || part.type}: its release failed`, error);
            }
            continue;
          }
          if (now - one.touchedAt[i] < BOUNCE_MS) continue; // the same finger shaking on the edge
          one.touchedAt[i] = now;
          console.info(`[touch] ${finger.hand} ${finger.name} on ${part.name || part.type} at ${finger.speed.toFixed(1)} m/s`);
          // a made game's error stays its own: thrown here it stopped every system after this one — the whole game
          // stood still while Punto went on talking (16.11)
          try {
            one.onTouch(finger);
          } catch (error) {
            console.error(`[touch] ${part.name || part.type}: its touch failed`, error);
          }
        }
      }
    }
  }
  world.registerSystem(FingerTouch);
}
