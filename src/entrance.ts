// The way Punto comes into the room: a short game of its own (Yury's script, 14.11; shortened 14.11 night).
//
// The wall is the one ahead of the player (or the nearest turn from it). Knocks from inside it
// (they also turn the player's head if they look elsewhere): knock-knock-knock, knock-knock, a
// hairline crack. "Can anybody hear me? Hey! Is anybody out there?" Knock-knock-knock — bang: the
// bolt, the crack runs wide. "You can see me? I'm kinda stuck in your wall." The plates round the
// hole come loose; the player takes them out with the ray (told how only if they do nothing).
// Behind the wall is a dome with code being typed all over it. After three plates Punto squeezes
// out, sticks, pops out: "I'm out! Appreciate it!". Then (Gemini Live, when it is on) "Hi, I'm Punto,
// a pretty cool coder. Oops, we wrecked your wall: just tell me: fix it." — whatever the player says
// mends it: the first time they speak and Punto does. Then "you say it, I make it", and what to make.
//
// Nobody is left waiting: no look — it goes on; no grab — Punto pushes the plates out itself.
// A room without a wall in reach: Punto just pops in.
import {
  BackSide,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  createSystem,
  DistanceGrabbable,
  DoubleSide,
  type Entity,
  ExtrudeGeometry,
  Grabbed,
  GrabSystem,
  Group,
  Hovered,
  Matrix4,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MovementMode,
  type Object3D,
  Path,
  PlaneGeometry,
  Quaternion,
  Ray,
  RayInteractable,
  RepeatWrapping,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { isRoomSurface } from './furniture.js';
import type { SpawnedPunto } from './helper.js';
import { talk } from './intro.js';
import type { IntroLine } from './intro-lines.js';
import { sfx } from './sfx.js';
import { muffled } from './speak.js';
import { squeezable } from './squeeze.js';

const ROOM_WAIT = 6000; // ms for the headset to hand over the walls; longer and Punto just pops in
const LOOK_WAIT = 9000; // ms of calling before the plates come loose anyway
const GRAB_HINT = 2500; // ms with no plate touched after the plates came loose: "Grab a piece and pull!"
const NUDGE = 5000; // ms with no plate touched: one more word, now and then
const GRAB_WAIT = 14000; // ms with no plate touched: Punto pushes them out itself
const WORD_HINT = 8000; // ms after "just tell me: fix it" with nothing said: once more
const WORD_WAIT = 10000; // ms after that: Punto mends the wall itself
const R1 = 0.095; // m: the first hole, where the piece falls out
const R2 = 0.235; // m: out to here the plates can be taken
const R3 = 0.4; // m: out to here the plates crack and stay in the wall
const SPOKES = 9; // cracks running out from the middle; two of them are the bolt
const OFF = 0.007; // m: everything on the wall sits this far out, in front of the room's shadow catcher (5 mm off every wall, src/features/room.ts), which hides what is behind it
const THICK = 0.02; // m: a plate of plaster
const DEEP = 0.08; // m: the wall's thickness, seen inside the hole
const LOOSE = 0.03; // m: how far a loose plate floats in front of the wall
const PULL = 0.08; // m from its place: the plate is out
const NEED = 3; // plates out, and Punto can get through
const DOME = 0.55; // m: the dome of code behind the wall
const REACH = 1.3; // m: the wall is masked this far round the crack (more than the dome)
const LIGHT = 0x3dff7a; // the code's own green

// What is being typed on the dome: the game's own commands, as Punto writes them.
const CODE = `> punto.listen()
heard: "a red cube"
> const cube = make.box({ color: 'red' })
> room.put(cube, { in_front_of: player })
done in 1.8 s
> punto.listen()
heard: "make it a ball"
> cube.become(make.ball({ bounce: 0.8 }))
> physics.add(ball)
done in 0.9 s
> punto.listen()
heard: "a blaster that breaks walls"
> const blaster = model.find('ray gun')
> hand.right.hold(blaster)
> blaster.onShot(ray => room.breakAt(ray.hit))
done in 4.2 s
> wall.find({ near: player })
wall: 3.4 m, plaster, white
> wall.crack({ pieces: 7 })
> punto.say('Hey! Is anybody there?')
waiting for the player…
> player.says('fix it')
> wall.pieces.forEach(p => p.flyHome())
> wall.seal()
room.looksLike('nothing happened')
> for (const idea of player.ideas) build(idea)
> game.start({ rules: 'yours' })
> world.add(new Solar.System({ scale: 0.01 }))
planets: 8, orbits: on
> punto.listen()`.split('\n');

// What Punto types while it mends the wall.
const FIX_CODE = `// the player said: fix it
for (const piece of wall.pieces) {
  piece.flyHome();
  piece.snapIn();
}
wall.cracks.forEach(c => c.heal());
wall.seal();
room.looksLike('nothing happened');`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The player's word while the wall waits to be mended: whatever is said to Punto then, mends it.
let wordWanted: (() => void) | undefined;
/** True (and the wall starts mending) if the entrance was waiting for the player's word: the caller does nothing more with it. */
export function takeWord(): boolean {
  if (!wordWanted) return false;
  const done = wordWanted;
  wordWanted = undefined;
  done();
  return true;
}

/** Punto's live voice (Gemini Live) for the end of the way in; each resolves once Live has said it. */
export interface EntranceVoice {
  /** "Hi, I'm Punto… we wrecked your wall: just tell me: fix it." */
  greet(): Promise<void>;
  /** Nothing was said: once more, shorter. */
  remind(): Promise<void>;
  /** Still nothing: "fine, I'll fix it myself". */
  giveUp(): Promise<void>;
  /** The wall is whole: "you say it, I make it", and what to make. */
  mended(): void;
}

interface Wall {
  point: Vector3;
  normal: Vector3; // out of the wall, into the room
  above: number; // m of bare wall straight up from the point
  below: number; // m of bare wall straight down (to the floor or to what stands there)
}

/** The room's walls as the headset reports them (kept up to date every frame). */
function roomWalls(world: World) {
  let planes: Iterable<Entity> = [];
  let furniture: Iterable<Entity> = [];
  class EntranceWalls extends createSystem({ planes: { required: [XRPlane] }, furniture: { required: [XRMesh] } }) {
    update(): void {
      planes = this.queries.planes.entities;
      furniture = this.queries.furniture.entities;
    }
  }
  // Nothing on the wall or before it near the gap: no picture, window, screen, door,
  // shelf or sofa within 35 cm, and no corner of the room either.
  const box = new Box3();
  const size = new Vector3();
  const clear = (point: Vector3, wall: Mesh, margin = 0.35) => {
    const wallNormal = new Vector3(0, 1, 0).applyQuaternion(wall.getWorldQuaternion(new Quaternion()));
    for (const entity of [...planes, ...furniture]) {
      const object = entity.object3D;
      if (!object || object === wall) continue;
      // The same wall again — from the next room's side (Space Setup with two rooms, 14.11), or another
      // stretch of it — is not something on the wall: it rejected every wall in Yury's room ("no wall in reach").
      if (entity.hasComponent(XRPlane)) {
        const mesh = object as Mesh;
        const normal = new Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new Quaternion()));
        if (isRoomSurface(mesh) && Math.abs(normal.dot(wallNormal)) > 0.9) continue;
      }
      box.setFromObject(object);
      box.getSize(size);
      if (size.x > 3 && size.z > 3) continue; // the whole room as one mesh
      if (box.expandByScalar(margin).containsPoint(point)) return false;
    }
    return true;
  };
  /** Nothing stands between the eye and the point (a lamp, a shelf, a plant): the crack must be seen whole. */
  const ray = new Ray();
  const seen = (eye: Vector3, point: Vector3) => {
    const distance = eye.distanceTo(point);
    ray.set(eye, point.clone().sub(eye).normalize());
    for (const entity of furniture) {
      const object = entity.object3D;
      if (!object) continue;
      box.setFromObject(object);
      box.getSize(size);
      if (size.x > 3 && size.z > 3) continue; // the whole room as one mesh
      const at = ray.intersectBox(box.expandByScalar(0.04), size);
      if (at && at.distanceTo(eye) < distance - 0.1) return false;
    }
    return true;
  };
  /** How far the wall is bare from the point straight up (`sign` 1) or down (-1), to `most` metres. */
  const run = (point: Vector3, wall: Mesh, sign: number, most: number) => {
    const probe = new Vector3();
    let free = 0;
    while (free + 0.1 <= most && clear(probe.copy(point).setY(point.y + sign * (free + 0.1)), wall, 0.12)) free += 0.1;
    return free;
  };
  world.registerSystem(EntranceWalls);
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

  /** Another whole wall stands between the eye and the point: the point is on a wall of the next room, or on a
   *  stretch behind ours (14.11, the headset: the crack went onto a wall 0.35 m behind the real one, at 19°). */
  const behindAWall = (eye: Vector3, point: Vector3, own: Mesh) => {
    const to = point.clone().sub(eye);
    const length = to.length();
    to.divideScalar(length);
    for (const plane of planes) {
      const mesh = plane.object3D as Mesh | undefined;
      if (!mesh || mesh === own || !isRoomSurface(mesh)) continue;
      const frame = mesh.getWorldQuaternion(new Quaternion());
      const normal = new Vector3(0, 1, 0).applyQuaternion(frame);
      if (Math.abs(normal.y) > 0.3) continue;
      const position = mesh.getWorldPosition(new Vector3());
      const facing = to.dot(normal);
      if (Math.abs(facing) < 1e-3) continue;
      const along = position.clone().sub(eye).dot(normal) / facing;
      if (along <= 0.05 || along >= length - 0.05) continue;
      const local = eye.clone().addScaledVector(to, along).sub(position).applyQuaternion(frame.clone().invert());
      const { width, depth } = (mesh.geometry as BoxGeometry).parameters;
      if (Math.abs(local.x) <= width / 2 && Math.abs(local.z) <= depth / 2) return true;
    }
    return false;
  };
  /** Where a level ray from the eye meets a real wall with room for the gap around the spot. */
  const hit = (eye: Vector3, direction: Vector3): Wall | undefined => {
    let best = Infinity;
    let found: Wall | undefined;
    for (const plane of planes) {
      const mesh = plane.object3D as Mesh | undefined;
      if (!mesh || !isRoomSurface(mesh)) continue;
      const { width, depth } = (mesh.geometry as BoxGeometry).parameters;
      const position = mesh.getWorldPosition(new Vector3());
      const frame = mesh.getWorldQuaternion(new Quaternion()).multiply(flat);
      const normal = new Vector3(0, 0, 1).applyQuaternion(frame);
      if (Math.abs(normal.y) > 0.3) continue; // walls only
      if (normal.dot(eye.clone().sub(position)) < 0) normal.negate();
      const facing = direction.dot(normal);
      if (facing > -0.5) continue; // a wall seen too much from the side
      const distance = position.clone().sub(eye).dot(normal) / facing;
      if (distance < 0.8 || distance > 6 || distance >= best) continue;
      // where the look meets the wall, or a little along it if something is in the way there
      const straight = eye.clone().addScaledVector(direction, distance);
      const along = new Vector3().crossVectors(new Vector3(0, 1, 0), normal).normalize();
      for (const [shift, height] of [[0, 0], [0.6, 0], [-0.6, 0], [0, -0.2], [1.1, 0], [-1.1, 0], [0.6, -0.2], [-0.6, -0.2]]) {
        const point = straight.clone().addScaledVector(along, shift);
        point.y = Math.min(1.7, Math.max(1.3, point.y)) + height;
        const local = point.clone().sub(position).applyQuaternion(frame.clone().invert());
        if (Math.abs(local.x) > width / 2 - 0.4 || Math.abs(local.y) > depth / 2 - 0.45) continue;
        if (!clear(point, mesh) || !seen(eye, point) || behindAWall(eye, point, mesh)) continue;
        best = distance;
        found = { point, normal, above: run(point, mesh, 1, Math.min(0.9, 2.4 - point.y)), below: run(point, mesh, -1, point.y - 0.08) };
        break;
      }
    }
    return found;
  };
  return {
    /** How many planes the headset has handed over so far. */
    count(): number {
      let n = 0;
      for (const _ of planes) n++;
      return n;
    },
    /** The wall in front of the player if there is room on it, else the nearest turn to either side, else behind. */
    find(world: World): Wall | undefined {
      const eye = world.camera.getWorldPosition(new Vector3());
      const forward = world.camera.getWorldDirection(new Vector3()).setY(0).normalize();
      for (const degrees of [0, 20, -20, 40, -40, 60, -60, 90, -90, 180]) {
        const direction = forward.clone().applyAxisAngle(new Vector3(0, 1, 0), (degrees * Math.PI) / 180);
        const wall = hit(eye, direction);
        if (wall) return wall;
      }
      return undefined;
    },
    dispose() {
      world.unregisterSystem(EntranceWalls);
    },
  };
}


/** The dome's screen: code typed line after line, scrolling up when it is full. */
function terminal() {
  const SIZE = 1024;
  const LINE = 40;
  const PAD = 40;
  const BACK = '#020a05';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BACK;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.font = 'bold 30px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'top';
  const letter = ctx.measureText('M').width;
  const rows = Math.floor((SIZE - 2 * PAD) / LINE);
  // one column, starting a little left of the middle: the middle of the dome is what the hole looks at
  const width = SIZE - 300 - PAD;
  const most = Math.floor(width / letter) - 1;
  const columns = [{ x: 300, row: 0, at: 0, line: 0, due: 0, speed: 30 }];
  const cell = (column: (typeof columns)[number], colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(column.x + column.at * letter, PAD + column.row * LINE, letter, LINE - 4);
  };
  /** One more character in this column; true at the end of a line. */
  const type = (column: (typeof columns)[number]) => {
    const text = CODE[column.line % CODE.length].slice(0, most);
    cell(column, BACK); // the cursor moves on
    if (column.at < text.length) {
      ctx.fillStyle = text.startsWith('>') ? '#8dffb0' : '#2fbf5e'; // what Punto types is brighter than what comes back
      ctx.fillText(text[column.at], column.x + column.at * letter, PAD + column.row * LINE);
      column.at++;
      cell(column, '#c8ffd8');
      return false;
    }
    column.line++;
    column.at = 0;
    if (++column.row >= rows) {
      column.row = rows - 1;
      ctx.drawImage(canvas, column.x, PAD + LINE, width, (rows - 1) * LINE, column.x, PAD, width, (rows - 1) * LINE);
      ctx.fillStyle = BACK;
      ctx.fillRect(column.x, PAD + (rows - 1) * LINE, width, LINE);
    }
    return true;
  };
  for (const column of columns) for (let n = 0; n < rows * 0.7; ) if (type(column)) n++; // already full of code when first seen
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -1; // read from inside the dome
  let wait = 0;
  return {
    texture,
    /** Types on; the picture goes to the headset ten times a second. */
    tick(delta: number) {
      for (const column of columns) {
        column.due += delta * column.speed;
        while (column.due >= 1) {
          column.due -= 1;
          if (type(column)) column.due -= 7; // a breath at the end of a line
        }
      }
      wait -= delta;
      if (wait <= 0) {
        wait = 0.1;
        texture.needsUpdate = true;
      }
    },
  };
}

/** One line typed big, right behind the hole: what is being written now. */
function promptLine() {
  const W = 1024;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const commands = CODE.filter((line) => line.startsWith('>'));
  let line = 0;
  let at = 0;
  let due = 0;
  let hold = 0;
  let wait = 0;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const draw = (time: number) => {
    ctx.fillStyle = '#020a05';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 64px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    const text = commands[line % commands.length].slice(0, at);
    ctx.shadowColor = '#3dff7a';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#c9ffd8';
    ctx.fillText(text, 40, H / 2);
    if (Math.sin(time * 9) > 0 || hold <= 0) {
      ctx.fillRect(40 + ctx.measureText(text).width + 6, H / 2 - 30, 34, 60); // the cursor
    }
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
  };
  draw(0);
  return {
    texture,
    tick(delta: number, time: number) {
      const text = commands[line % commands.length];
      if (at < text.length) {
        due += delta * 16;
        while (due >= 1 && at < text.length) {
          due -= 1;
          at++;
        }
        hold = 1.4;
      } else if ((hold -= delta) <= 0) {
        line++;
        at = 0;
      }
      wait -= delta;
      if (wait <= 0) {
        wait = 1 / 15;
        draw(time);
      }
    },
  };
}

const LINE_VERTEX = /* glsl */ `
  attribute float aSide;
  attribute float aAt;
  attribute float aOn;
  attribute float aKind;
  varying float vSide;
  varying float vAt;
  varying float vOn;
  varying float vKind;
  varying vec2 vLocal;
  void main() {
    vSide = aSide;
    vAt = aAt;
    vOn = aOn;
    vKind = aKind;
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
// kind 0: a dark hair. 1: a seam, a dark gap that lights up from inside, with a halo on the wall.
// 2: the bolt's white core. 3: its glow. 4: its light on the wall round it. 5: shadow inside a crack. 6: the lit lip of a crack.
const LINE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uShown;
  uniform float uGlow;
  uniform sampler2D uHoles;
  uniform float uHoleSize;
  varying float vSide;
  varying float vAt;
  varying float vOn;
  varying float vKind;
  varying vec2 vLocal;
  void main() {
    // nothing is drawn over an open hole: a crack or a bolt is on the wall, not in the air
    vec2 hole = vLocal / (2.0 * uHoleSize) + 0.5;
    if (hole.x > 0.0 && hole.x < 1.0 && hole.y > 0.0 && hole.y < 1.0 && texture2D(uHoles, hole).r > 0.5) discard;
    float d = abs(vSide);
    int kind = int(vKind + 0.5);
    float lit = min(1.0, uGlow);
    vec3 color;
    float a;
    if (kind == 0) {
      color = vec3(0.07, 0.065, 0.06);
      a = (1.0 - smoothstep(0.35, 1.0, d)) * 0.9;
    } else if (kind == 1) {
      float core = 1.0 - smoothstep(0.1, 0.22, d);
      float halo = pow(1.0 - d, 3.0) * 0.5 * lit;
      vec3 inside = mix(vec3(0.05, 0.045, 0.04), mix(uColor, vec3(1.0), 0.6), lit);
      a = max(core * 0.92, halo);
      color = (inside * core * 0.92 + uColor * halo * (1.0 - core)) / max(a, 0.001);
    } else if (kind == 2) {
      color = mix(vec3(1.0), uColor, 0.18);
      a = (1.0 - smoothstep(0.45, 1.0, d)) * lit;
    } else if (kind == 3) {
      color = mix(uColor, vec3(1.0), 0.2);
      a = pow(1.0 - d, 1.7) * 0.75 * lit;
    } else if (kind == 4) {
      color = uColor;
      a = pow(1.0 - d, 2.4) * 0.22 * lit;
    } else if (kind == 5) {
      color = vec3(0.0);
      a = pow(1.0 - d, 1.8) * 0.32;
    } else {
      color = vec3(1.0);
      a = pow(1.0 - d, 2.0) * 0.5;
    }
    // not reached yet: nothing at all (written so that a bad number hides the line rather than shows it)
    if (!(vAt <= uShown) || vOn < 0.5) discard;
    a *= 1.0 - smoothstep(uShown - 0.02, uShown, vAt);
    if (!(a >= 0.004)) discard;
    gl_FragColor = vec4(color, min(a, 1.0));
    #include <colorspace_fragment>
  }`;

type Point = [number, number];
type PlateState = 'wall' | 'loose' | 'auto' | 'out' | 'back' | 'fall' | 'rest';
interface Plate {
  mesh: Mesh;
  mask: Mesh;
  entity: Entity;
  face: MeshStandardMaterial;
  side: MeshStandardMaterial;
  tint: Color; // its face in the wall
  veil: number; // and how much of the wall that face covers
  home: Vector3; // in the room, on the wall
  rest: Quaternion; // how it sits in the wall once cracked: a little out of true
  lift: number; // and how far out
  at: number; // m from the middle: the crack reaches it then
  outward: Vector3; // in the room, from the middle of the crack to this plate along the wall
  state: PlateState;
  p: Vector3;
  q: Quaternion;
  v: Vector3;
  spin: Vector3;
  from: Vector3;
  fromQ: Quaternion;
  to: Vector3;
  t: number;
  wait: number;
  seed: number;
  counted: boolean;
  held: boolean;
  far: number;
}

/**
 * The broken place on a real wall round a point, as a bolt would leave it: the bolt runs down the
 * wall through the point, and the cracks run out from where it struck: spokes from the middle (two
 * of them are the bolt itself) and rings round it. Inside the first ring a piece falls out; the
 * plates of the second ring can be taken out; those of the third crack and stay. The plates are
 * real slabs a little out of true, so their broken edges catch the light; their faces are only a
 * veil, so the wall keeps its own colour. Behind it all, the dome of code. The real wall is hidden
 * only where a plate has left its place.
 */
function crackedWall(world: World, point: Vector3, normal: Vector3, above: number, below: number) {
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const across = new Vector3().crossVectors(up, normal).normalize();
  const frame = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across, up, normal));
  const inRoom = (x: number, y: number, z: number, target: Vector3) =>
    target.copy(point).addScaledVector(across, x).addScaledVector(up, y).addScaledVector(normal, z);
  const length = (p: Point) => Math.hypot(p[0], p[1]);

  // ---- the bolt: long straight runs and sudden kinks, never an even saw ----
  const zigzag = (from: Point, to: Point, pace: number, sway: number): Point[] => {
    const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (span < pace) return [from];
    const t = 0.3 + Math.random() * 0.4;
    const side = (Math.random() < 0.5 ? -1 : 1) * span * sway * (0.5 + Math.random());
    const middle: Point = [from[0] + (to[0] - from[0]) * t - ((to[1] - from[1]) / span) * side, from[1] + (to[1] - from[1]) * t + ((to[0] - from[0]) / span) * side];
    return [...zigzag(from, middle, pace, sway), ...zigzag(middle, to, pace, sway)];
  };
  const jagged = (from: Point, to: Point, pace: number, sway: number): Point[] => [...zigzag(from, to, pace, sway), to];
  const along = (points: Point[], start: number) => {
    const at = [start];
    for (let n = 1; n < points.length; n++) at.push(at[n - 1] + Math.hypot(points[n][0] - points[n - 1][0], points[n][1] - points[n - 1][1]));
    return at;
  };
  const lean = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.12);
  const rise = Math.min(0.9, Math.max(0.5, above));
  const fall = Math.max(0.5, below);
  const upper = jagged([lean * rise * 1.3, rise], [0, 0], 0.07, 0.17); // from above down to the middle
  const lower = jagged([0, 0], [-lean * 0.7, -fall], 0.08, 0.17); // from the middle down to the floor

  // ---- the cracks: spokes out from the middle, rings round it ----
  /** Where a line running out from the middle first gets `r` metres from it. */
  const cut = (poly: Point[], r: number) => {
    for (let n = 0; n < poly.length - 1; n++) {
      const a = length(poly[n]);
      const b = length(poly[n + 1]);
      if (a < r && b >= r) {
        const t = (r - a) / (b - a);
        return { n, point: [poly[n][0] + (poly[n + 1][0] - poly[n][0]) * t, poly[n][1] + (poly[n + 1][1] - poly[n][1]) * t] as Point };
      }
    }
    const last = poly[poly.length - 1];
    const k = r / Math.max(1e-6, length(last));
    return { n: poly.length - 2, point: [last[0] * k, last[1] * k] as Point };
  };
  const between = (poly: Point[], from: number, to: number): Point[] => {
    const a = cut(poly, from);
    const b = cut(poly, to);
    return [a.point, ...poly.slice(a.n + 1, b.n + 1), b.point];
  };
  const angleOf = (poly: Point[]) => {
    const [x, y] = cut(poly, R2).point;
    return Math.atan2(y, x);
  };
  const boltUp = [...upper].reverse();
  const spokes: Point[][] = [boltUp, lower];
  {
    // the other five fill the two gaps between the bolt's halves, as evenly as the gaps allow
    const a = angleOf(boltUp);
    const b = angleOf(lower);
    const gap = (((b - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const first = Math.min(SPOKES - 3, Math.max(1, Math.round(((SPOKES - 2) * gap) / (Math.PI * 2))));
    const second = SPOKES - 2 - first;
    const fill = (from: number, span: number, count: number) => {
      for (let k = 1; k <= count; k++) {
        const angle = from + (span * (k + (Math.random() - 0.5) * 0.45)) / (count + 1);
        const reach = R3 + 0.08 + Math.random() * 0.32;
        spokes.push(jagged([0, 0], [Math.cos(angle) * reach, Math.sin(angle) * reach], 0.05, 0.12));
      }
    };
    fill(a, gap, first);
    fill(b, Math.PI * 2 - gap, second);
  }
  spokes.sort((p, q) => angleOf(p) - angleOf(q));
  // between two spokes the crack runs nearly straight: the plates are polygons, not rings
  const chord = (from: Point, to: Point): Point[] => jagged(from, to, 0.028, 0.07);
  const RADII = [R1, R2, R3];
  const K = SPOKES;
  // every spoke is crossed at its own distance: no two plates alike, nothing round
  const radius = RADII.map((r, k) => spokes.map(() => r * (k === 0 ? 0.85 + Math.random() * 0.3 : k === 1 ? 0.8 + Math.random() * 0.4 : 0.62 + Math.random() * 0.7)));
  const at = (k: number, i: number) => cut(spokes[i % K], radius[k][i % K]);
  const rings = RADII.map((_, k) => spokes.map((_, i) => chord(at(k, i).point, at(k, i + 1).point)));
  const runs = [0, 1].map((k) => spokes.map((spoke, i) => {
    const a = at(k, i);
    const b = at(k + 1, i);
    return [a.point, ...spoke.slice(a.n + 1, b.n + 1), b.point];
  }));
  const rev = (points: Point[]) => [...points].reverse();
  const ringCell = (k: number, i: number): Point[] => [
    ...runs[k][i],
    ...rings[k + 1][i].slice(1),
    ...rev(runs[k][(i + 1) % K]).slice(1),
    ...rev(rings[k][i]).slice(1, -1),
  ];
  // cells: 0 the middle, 1..K the plates to take, K+1..2K the plates that stay
  const outlines: Point[][] = [rings[0].flatMap((points) => points.slice(0, -1))];
  for (let i = 0; i < K; i++) outlines.push(ringCell(0, i));
  for (let i = 0; i < K; i++) outlines.push(ringCell(1, i));
  // ---- when the fracture reaches each point (seconds after the blow) ----
  // As in glass or plaster hit at a point: first the radial cracks run out from where it struck, each
  // at its own speed (the bolt's two the fastest); then the cross cracks, each starting on a radial
  // crack the fracture has already passed and running to the next radial one, where it stops. Near
  // the blow they close every gap; further out only some do. Nothing appears all at once, and
  // nothing is round.
  const dist = (p: Point, q: Point) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const walk = (points: Point[], start: number, v: number) => {
    const times = [start];
    for (let n = 1; n < points.length; n++) times.push(times[n - 1] + dist(points[n - 1], points[n]) / v);
    return times;
  };
  const isBolt = (i: number) => spokes[i] === boltUp || spokes[i] === lower;
  const speed = spokes.map((_, i) => (isBolt(i) ? 2.6 : 1.0 + Math.random() * 0.9)); // m/s
  const delay = spokes.map((_, i) => (isBolt(i) ? 0 : 0.02 + Math.random() * 0.12));
  /** When the radial crack `i` reaches a point of it found by `cut`. */
  const arrive = (i: number, c: { n: number; point: Point }) => {
    const spoke = spokes[i];
    let d = 0;
    for (let n = 0; n < c.n; n++) d += dist(spoke[n], spoke[n + 1]);
    d += dist(spoke[Math.max(0, c.n)], c.point);
    return delay[i] + d / speed[i];
  };
  const radialTimes = (k: number, i: number) => walk(runs[k][i], arrive(i, at(k, i)), speed[i]);
  const crossTimes = (k: number, i: number) => {
    const points = rings[k][i];
    const j = (i + 1) % K;
    const start = Math.max(arrive(i, at(k, i)), arrive(j, at(k, j))) + 0.03 + Math.random() * 0.14;
    const v = 0.6 + Math.random() * 0.5;
    return Math.random() < 0.5 ? walk(points, start, v) : walk(rev(points), start, v).reverse();
  };
  // the outer cross cracks: only some (at least three)
  const outer = spokes.map(() => Math.random() < 0.5);
  for (let i = 0; outer.filter(Boolean).length < 3; i = (i + 3) % K) outer[i] = true;

  interface Edge { points: Point[]; times: number[]; a: number; b: number; kind: number; half: number; first: number; count: number }
  const edges: Edge[] = [];
  const edge = (points: Point[], times: number[], a: number, b: number, kind: number, half: number) => edges.push({ points, times, a, b, kind, half, first: 0, count: 0 });
  for (let i = 0; i < K; i++) {
    const before = (i - 1 + K) % K;
    edge(rings[0][i], crossTimes(0, i), 0, 1 + i, 1, 0.03);
    edge(runs[0][i], radialTimes(0, i), 1 + before, 1 + i, 1, 0.03);
    edge(rings[1][i], crossTimes(1, i), 1 + i, K + 1 + i, 1, 0.03);
    edge(runs[1][i], radialTimes(1, i), K + 1 + before, K + 1 + i, 0, 0.0055);
    if (outer[i]) edge(rings[2][i], crossTimes(2, i), K + 1 + i, -1, 0, 0.0042);
  }
  // a plate breaks loose when the fracture has run all round it
  const done = new Array(2 * K + 1).fill(0);
  for (const e of edges) {
    const last = Math.max(...e.times);
    for (const cell of [e.a, e.b]) if (cell >= 0) done[cell] = Math.max(done[cell], last);
  }

  const root = new Group();
  root.position.copy(point);
  root.quaternion.copy(frame);
  root.userData.occlude = false; // on and behind the real wall: the depth sensor would hide it all

  // ---- the wall's mask: what is behind the wall shows only where a plate has left ----
  const hide = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide });
  const shapeOf = (outline: Point[]) => new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  // the masks sit 4 mm inside the wall: in the emulator the wall is drawn too, and a mask level with it
  // fights it for depth along its seams (a ghost web of the cracks before there are any)
  const MASK = -0.004;
  const masks = outlines.slice(0, K + 1).map((outline) => {
    const mask = new Mesh(new ShapeGeometry(shapeOf(outline)), hide);
    mask.position.z = MASK;
    mask.renderOrder = -10;
    root.add(mask);
    return mask;
  });
  {
    const around = new Shape([new Vector2(-REACH, -REACH), new Vector2(REACH, -REACH), new Vector2(REACH, REACH), new Vector2(-REACH, REACH)]);
    around.holes.push(new Path(rings[1].flatMap((points) => points.slice(0, -1)).map(([x, y]) => new Vector2(x, y))));
    const mask = new Mesh(new ShapeGeometry(around), hide);
    mask.position.z = MASK;
    mask.renderOrder = -10;
    root.add(mask);
  }

  // ---- the plates: real slabs with broken edges; the face is a veil over the player's own wall ----
  const middleOf = (outline: Point[]): Point => [outline.reduce((sum, [x]) => sum + x, 0) / outline.length, outline.reduce((sum, [, y]) => sum + y, 0) / outline.length];
  const slab = (outline: Point[], [cx, cy]: Point, thick: number) => {
    // every point is pulled in by a different little amount: the edges are chipped, the gaps uneven
    const shape = new Shape(outline.map(([x, y]) => {
      const pull = 0.985 - Math.random() * 0.035;
      return new Vector2((x - cx) * pull, (y - cy) * pull);
    }));
    return new ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }).translate(0, 0, -thick);
  };
  // In the wall a plate's face is only a veil, each a little lighter or darker than its neighbours,
  // as if shifted out of true; out of the wall it is a solid piece of white plaster.
  const PLASTER = new Color(0xf3f0ea);
  const toneOf = () => (Math.random() < 0.5 ? { tint: new Color(0x000000), veil: 0.025 + Math.random() * 0.05 } : { tint: PLASTER.clone(), veil: 0.1 + Math.random() * 0.14 });
  const faceOf = (tone = toneOf()) => new MeshStandardMaterial({ color: tone.tint, roughness: 0.9, transparent: true, opacity: tone.veil, emissive: LIGHT, emissiveIntensity: 0 });
  const sideOf = () => new MeshStandardMaterial({ color: 0xd2cbc0, roughness: 1, emissive: LIGHT, emissiveIntensity: 0 });
  const tiltOf = () => new Quaternion().setFromAxisAngle(new Vector3(Math.random() - 0.5, Math.random() - 0.5, 0).normalize(), 0.025 + Math.random() * 0.05);
  const plates: Plate[] = [];
  for (let cell = 0; cell <= K; cell++) {
    const [cx, cy] = middleOf(outlines[cell]);
    const tone = toneOf();
    const face = faceOf(tone);
    const side = sideOf();
    const mesh = new Mesh(slab(outlines[cell], [cx, cy], THICK), [face, side]);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.userData.occlude = false;
    mesh.name = cell === 0 ? 'WallPiece' : `WallPlate${cell}`;
    const home = inRoom(cx, cy, 0, new Vector3());
    mesh.position.copy(home);
    mesh.quaternion.copy(frame);
    const entity = world.createTransformEntity(mesh);
    mesh.castShadow = true;
    plates.push({
      mesh, mask: masks[cell], entity, face, side, tint: tone.tint, veil: tone.veil, home, rest: frame.clone().multiply(tiltOf()), lift: OFF + 0.003 + Math.random() * 0.006,
      at: done[cell], outward: new Vector3().addScaledVector(across, cx).addScaledVector(up, cy).normalize(),
      state: 'wall', p: home.clone(), q: frame.clone(), v: new Vector3(), spin: new Vector3().randomDirection(),
      from: new Vector3(), fromQ: new Quaternion(), to: new Vector3(), t: 0, wait: 0, seed: Math.random() * 10,
      counted: false, held: false, far: 0,
    });
  }
  const staySide = sideOf();
  const stay = outlines.slice(K + 1).filter((_, i) => outer[i]).map((outline) => {
    const i = outlines.indexOf(outline) - K - 1;
    const [cx, cy] = middleOf(outline);
    const mesh = new Mesh(slab(outline, [cx, cy], 0.014), [faceOf(), staySide]);
    const lift = OFF + 0.002 + Math.random() * 0.006;
    const rest = tiltOf();
    mesh.position.set(cx, cy, lift);
    mesh.quaternion.copy(rest);
    mesh.visible = false;
    root.add(mesh);
    return { mesh, at: done[K + 1 + i] };
  });

  // ---- the lines: the seams, the hairs, and the bolt in three layers ----
  const ribbon = () => ({ positions: [] as number[], sides: [] as number[], ats: [] as number[], kinds: [] as number[] });
  const strip = (to: ReturnType<typeof ribbon>, points: Point[], width: (n: number) => number, kind: number, z: number, at?: number[]) => {
    const first = to.positions.length / 3;
    const normals = points.map((_, n) => {
      const before = points[Math.max(0, n - 1)];
      const after = points[Math.min(points.length - 1, n + 1)];
      const span = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
      return [-(after[1] - before[1]) / span, (after[0] - before[0]) / span];
    });
    for (let n = 0; n < points.length - 1; n++) {
      for (const [index, side] of [[n, -1], [n, 1], [n + 1, 1], [n, -1], [n + 1, 1], [n + 1, -1]]) {
        const w = width(index);
        to.positions.push(points[index][0] + normals[index][0] * w * side, points[index][1] + normals[index][1] * w * side, z);
        to.sides.push(side);
        to.ats.push(at ? at[index] : length(points[index]));
        to.kinds.push(kind);
      }
    }
    return { first, count: to.positions.length / 3 - first };
  };
  // Where the wall is open: the cells whose plates are out, drawn white (refresh() redraws it). The lines look it up.
  const HOLE_SIZE = 0.4; // m from the middle each way: more than the plates reach
  const holeCanvas = document.createElement('canvas');
  holeCanvas.width = holeCanvas.height = 256;
  const holeMap = new CanvasTexture(holeCanvas);
  holeMap.generateMipmaps = false;
  const drawHoles = (open: (cell: number) => boolean) => {
    const ctx = holeCanvas.getContext('2d')!;
    const n = holeCanvas.width;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#fff';
    for (let cell = 0; cell <= K; cell++) {
      if (!open(cell)) continue;
      ctx.beginPath();
      outlines[cell].forEach(([x, y], k) => {
        const px = (x / (2 * HOLE_SIZE) + 0.5) * n;
        const py = (0.5 - y / (2 * HOLE_SIZE)) * n; // the canvas runs down, the texture (flipped) up
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }
    holeMap.needsUpdate = true;
  };
  drawHoles(() => false);
  const build = (from: ReturnType<typeof ribbon>, order: number) => {
    const shape = new BufferGeometry();
    shape.setAttribute('position', new BufferAttribute(new Float32Array(from.positions), 3));
    shape.setAttribute('aSide', new BufferAttribute(new Float32Array(from.sides), 1));
    shape.setAttribute('aAt', new BufferAttribute(new Float32Array(from.ats), 1));
    shape.setAttribute('aKind', new BufferAttribute(new Float32Array(from.kinds), 1));
    const on = new Float32Array(from.sides.length).fill(1);
    shape.setAttribute('aOn', new BufferAttribute(on, 1));
    const uniforms = { uColor: { value: new Color(LIGHT) }, uShown: { value: 0 }, uGlow: { value: 0 }, uHoles: { value: holeMap }, uHoleSize: { value: HOLE_SIZE } };
    const mesh = new Mesh(shape, new ShaderMaterial({ uniforms, vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT, transparent: true, depthWrite: false, side: DoubleSide }));
    mesh.renderOrder = order;
    root.add(mesh);
    return { shape, on, uniforms, mesh };
  };
  const SEAMS = OFF + 0.012; // over the plates' faces
  const seams = ribbon();
  // Relief that works on any wall: the light comes from above on the left, so inside every crack
  // the side facing the light is in shadow and the far lip catches the light. A white wall shows
  // the shadow, a dark one the highlight.
  const LIGHT_FROM = new Vector2(-0.6, 0.8).normalize();
  const band = (points: Point[], times: number[], side: number, width: number, kind: number) => {
    for (let n = 0; n < points.length - 1; n++) {
      const [ax, ay] = points[n];
      const [bx, by] = points[n + 1];
      const span = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (-(by - ay) / span) * side * width;
      const ny = ((bx - ax) / span) * side * width;
      const ta = times[n];
      const tb = times[n + 1];
      for (const [x, y, d, t] of [[ax, ay, 0, ta], [bx, by, 0, tb], [bx + nx, by + ny, 1, tb], [ax, ay, 0, ta], [bx + nx, by + ny, 1, tb], [ax + nx, ay + ny, 1, ta]]) {
        seams.positions.push(x, y, SEAMS - 0.001);
        seams.sides.push(d);
        seams.ats.push(t);
        seams.kinds.push(kind);
      }
    }
  };
  const relief = (points: Point[], times: number[], strength: number) => {
    // which side of the whole line faces the light
    let sx = 0;
    let sy = 0;
    for (let n = 0; n < points.length - 1; n++) {
      sx += -(points[n + 1][1] - points[n][1]);
      sy += points[n + 1][0] - points[n][0];
    }
    const side = sx * LIGHT_FROM.x + sy * LIGHT_FROM.y > 0 ? 1 : -1;
    band(points, times, side, 0.016 * strength, 5);
    band(points, times, -side, 0.007 * strength, 6);
  };
  for (const e of edges) {
    const first = seams.positions.length / 3;
    relief(e.points, e.times, e.kind === 1 ? 1 : 0.75);
    strip(seams, e.points, () => e.half, e.kind, SEAMS, e.times);
    e.first = first;
    e.count = seams.positions.length / 3 - first;
  }
  // the radial cracks run on past the plates, thinning to their tips (not the bolt's: the bolt is drawn over them)
  const hairs = (points: Point[], times: number[], half: number) =>
    strip(seams, points, (n) => half * (1 - (0.85 * n) / Math.max(1, points.length - 1)), 0, SEAMS, times);
  spokes.forEach((spoke, i) => {
    if (isBolt(i)) return;
    const c = cut(spoke, Math.max(R3, radius[2][i]));
    const rest = [c.point, ...spoke.slice(c.n + 1)];
    const times = walk(rest, arrive(i, c), speed[i]);
    hairs(rest, times, 0.005);
    // branches split off at a sharp angle, after the crack has passed there, and slower
    for (let k = 1; k < rest.length - 1; k++) {
      if (Math.random() > 0.4) continue;
      const [x, y] = rest[k];
      const heading = Math.atan2(rest[k + 1][1] - y, rest[k + 1][0] - x);
      const angle = heading + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.35);
      const reach = 0.04 + Math.random() * 0.09;
      const branch = jagged([x, y], [x + Math.cos(angle) * reach, y + Math.sin(angle) * reach], 0.025, 0.15);
      hairs(branch, walk(branch, times[k] + 0.01, speed[i] * 0.6), 0.0035);
    }
  });
  const crackEnd = Math.max(...seams.ats) + 0.05; // the last tip stops running
  const crack = build(seams, 3);

  // the bolt: its light on the wall, its glow, and the white core; thick where it struck, thin at the ends
  const BOLT = OFF + 0.014;
  const flash = ribbon();
  const upperAt = along(upper, 0);
  const lowerAt = along(lower, upperAt[upperAt.length - 1]);
  const strike = upperAt[upperAt.length - 1]; // the first stroke reaches the middle
  const whole = lowerAt[lowerAt.length - 1] + 0.05;
  const forks: { points: Point[]; at: number[] }[] = [];
  const fork = (from: Point, start: number, angle: number, reach: number) => {
    const points = jagged(from, [from[0] + Math.cos(angle) * reach, from[1] + Math.sin(angle) * reach], 0.05, 0.22);
    forks.push({ points, at: along(points, start) });
  };
  fork([0, 0], strike, (lean > 0 ? Math.PI : 0) + (lean > 0 ? 0.5 : -0.5), 0.32 + Math.random() * 0.12);
  const half = Math.floor(upper.length / 2);
  fork(upper[half], upperAt[half], (lean > 0 ? 0 : Math.PI) + (lean > 0 ? -0.55 : 0.55), 0.2 + Math.random() * 0.1);
  const thickness = (points: Point[], strong: number) => {
    const swell = points.map(() => 0.65 + Math.random() * 0.5);
    return (n: number) => {
      const end = Math.min(n, points.length - 1 - n) / Math.max(1, points.length - 1);
      const near = Math.exp(-length(points[n]) * 3); // thicker where it struck
      return strong * swell[n] * (0.45 + 0.55 * Math.min(1, end * 6)) * (1 + near * 0.8);
    };
  };
  for (const [kind, scale] of [[4, 0.16], [3, 0.045], [2, 0.0075]] as const) {
    strip(flash, upper, thickness(upper, scale), kind, BOLT, upperAt);
    strip(flash, lower, thickness(lower, scale), kind, BOLT, lowerAt);
    for (const f of forks) strip(flash, f.points, (n) => scale * 0.7 * (1 - (0.8 * n) / Math.max(1, f.points.length - 1)), kind, BOLT, f.at);
  }
  const bolt = build(flash, 4);

  // the hairline: the first crack, where the bolt will run, before there is any bolt
  const upTo = (poly: Point[], r: number) => {
    const c = cut(poly, r);
    return [...poly.slice(0, c.n + 1), c.point];
  };
  const hairline = [...rev(upTo(boltUp, 0.3)), ...upTo(lower, 0.3).slice(1)];
  const hairRibbon = ribbon();
  strip(hairRibbon, hairline, () => 0.024, 1, SEAMS + 0.0005);
  const hair = build(hairRibbon, 3);
  let hairShown = 0;
  let hairTo = 0;
  let hairSpeed = 1;
  let hairGlow = 0;
  let hairGlowTo = 0;
  let charge = 0; // 0..1: the light gathering behind the wall before the bolt

  // ---- the wall's thickness where a plate is gone ----
  const inner = edges.filter((e) => (e.a >= 0 && e.a <= K) || (e.b >= 0 && e.b <= K));
  const jambMost = inner.reduce((sum, e) => sum + (e.points.length - 1) * 12, 0);
  const jambPositions = new Float32Array(jambMost * 3);
  const jambColours = new Float32Array(jambMost * 3);
  const jambShape = new BufferGeometry();
  jambShape.setAttribute('position', new BufferAttribute(jambPositions, 3));
  jambShape.setAttribute('color', new BufferAttribute(jambColours, 3));
  jambShape.setDrawRange(0, 0);
  const jamb = new Mesh(jambShape, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  root.add(jamb);
  const lit = new Color(LIGHT).multiplyScalar(0.6);
  const ROWS: [number, number, number, number][] = [[OFF, 0.62, 0.59, 0.55], [-DEEP * 0.3, 0.2, 0.19, 0.18], [-DEEP, lit.r, lit.g, lit.b]];
  const gone = (cell: number) => cell >= 0 && cell <= K && !plates[cell].mask.visible; // its hole is open
  const refresh = () => {
    let at = 0;
    for (const e of inner) {
      const a = gone(e.a);
      const b = gone(e.b);
      crack.on.fill(a && b ? 0 : 1, e.first, e.first + e.count);
      if (a === b) continue;
      for (let n = 0; n < e.points.length - 1; n++) {
        for (let r = 0; r < ROWS.length - 1; r++) {
          for (const [index, row] of [[n, r], [n + 1, r], [n + 1, r + 1], [n, r], [n + 1, r + 1], [n, r + 1]]) {
            jambPositions.set([e.points[index][0], e.points[index][1], ROWS[row][0]], at * 3);
            jambColours.set([ROWS[row][1], ROWS[row][2], ROWS[row][3]], at * 3);
            at++;
          }
        }
      }
    }
    jambShape.setDrawRange(0, at);
    jambShape.attributes.position.needsUpdate = jambShape.attributes.color.needsUpdate = true;
    crack.shape.attributes.aOn.needsUpdate = true;
    drawHoles(gone);
  };

  // ---- behind the wall: the dome of code, and the line being typed right behind the hole ----
  const screen = terminal();
  const dome = new Mesh(
    new SphereGeometry(DOME, 48, 28, Math.PI, Math.PI, 0, Math.PI),
    new MeshBasicMaterial({ map: screen.texture, side: BackSide, toneMapped: false }),
  );
  dome.position.z = -DEEP;
  const typing = promptLine();
  const prompt = new Mesh(new PlaneGeometry(0.56, 0.07), new MeshBasicMaterial({ map: typing.texture, toneMapped: false }));
  prompt.position.set(0.02, -0.035, -DEEP - 0.22);
  const behind = new Group();
  behind.add(dome, prompt);
  behind.visible = false;
  root.add(behind);

  // ---- the code's light on the wall round the hole ----
  const soft = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new CanvasTexture(canvas);
  })();
  const shine = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: soft, color: LIGHT, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  shine.position.z = OFF + 0.001;
  shine.renderOrder = 1;
  shine.visible = false; // a round glow round the hole looked made up (14.11): the light stays in the cracks and the hole

  // ---- crumbs and dust ----
  const floor = -point.y; // the floor, in the wall's own frame (its up is the room's up)
  const CRUMBS = 40;
  const crumbMaterial = new MeshStandardMaterial({ color: 0xddd6cb, roughness: 1 });
  const crumbs = new InstancedMesh(new BoxGeometry(1, 1, 0.7), crumbMaterial, CRUMBS);
  const crumbState = Array.from({ length: CRUMBS }, () => ({ p: new Vector3(), v: new Vector3(), spin: new Vector3().randomDirection(), turn: 0, size: 0, live: false, resting: false }));
  const hidden = new Matrix4().makeScale(0, 0, 0);
  for (let n = 0; n < CRUMBS; n++) crumbs.setMatrixAt(n, hidden);
  let nextCrumb = 0;
  const crumble = (x: number, y: number, count: number, speed: number) => {
    for (let k = 0; k < count; k++) {
      const c = crumbState[nextCrumb];
      nextCrumb = (nextCrumb + 1) % CRUMBS;
      c.p.set(x + (Math.random() - 0.5) * 0.12, y + (Math.random() - 0.5) * 0.12, OFF + 0.01);
      c.v.set((Math.random() - 0.5) * 0.8 * speed, Math.random() * 0.8 * speed, (0.3 + Math.random()) * speed);
      c.size = 0.006 + Math.random() * 0.016;
      c.live = true;
      c.resting = false;
    }
  };
  const dust = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new CanvasTexture(canvas);
  })();
  const puffs = Array.from({ length: 8 }, () => {
    const sprite = new Sprite(new SpriteMaterial({ map: dust, color: 0xd8d2c8, transparent: true, opacity: 0, depthWrite: false }));
    sprite.raycast = () => {}; // decoration: a Sprite needs a camera to be ray-tested and throws without one
    sprite.visible = false;
    sprite.renderOrder = 6;
    root.add(sprite);
    return { sprite, v: new Vector3(), age: 0, life: 1, size: 0.2 };
  });
  let nextPuff = 0;
  const puff = (x: number, y: number, size: number) => {
    const p = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % puffs.length;
    p.sprite.position.set(x + (Math.random() - 0.5) * 0.06, y + (Math.random() - 0.5) * 0.06, OFF + 0.04);
    p.v.set((Math.random() - 0.5) * 0.15, 0.03 + Math.random() * 0.1, 0.12 + Math.random() * 0.25);
    p.age = 0;
    p.life = 0.8 + Math.random() * 0.6;
    p.size = size * (0.7 + Math.random() * 0.6);
    p.sprite.visible = true;
  };

  // sparks that run along the hairline while the light gathers
  const sparks = Array.from({ length: 16 }, () => {
    const sprite = new Sprite(new SpriteMaterial({ map: soft, color: 0xc8ffd6, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    sprite.raycast = () => {};
    sprite.visible = false;
    sprite.renderOrder = 7;
    root.add(sprite);
    return { sprite, life: 0, age: 0 };
  });
  let sparkDue = 0;
  const onHair = (target: Vector3) => {
    // a random point of the hairline as far as it has run
    const n = Math.floor(Math.random() * (hairline.length - 1));
    const t = Math.random();
    const x = hairline[n][0] + (hairline[n + 1][0] - hairline[n][0]) * t;
    const y = hairline[n][1] + (hairline[n + 1][1] - hairline[n][1]) * t;
    if (Math.hypot(x, y) > hairShown) return false;
    target.set(x, y, SEAMS + 0.004);
    return true;
  };

  root.add(crumbs);
  root.traverse((object) => (object.frustumCulled = false));
  const rootEntity = world.createTransformEntity(root);
  root.traverse((object) => (object.castShadow = false)); // the room's proxy turns every shadow on
  for (const piece of stay) piece.mesh.castShadow = true;
  crumbs.castShadow = true;

  let shown = 0; // how far the cracks have run from the middle (m)
  let shownTo = 0;
  let shownSpeed = 1;
  let shownDone: (() => void) | undefined;
  let glow = 0;
  let glowTo = 0;
  let boltShown = 0;
  let boltTo = 0;
  let boltSpeed = 1;
  let boltGlow = 0;
  let boltGlowTo = 0;
  let out = 0;
  let typeClick = 0;
  let crackle = 0;
  let struck = -Infinity; // when the bolt struck (the system's clock)
  let clock = 0;
  let mended: (() => void) | undefined;
  let onOut: ((count: number) => void) | undefined;
  const tilt = new Quaternion();
  const axis = new Vector3();
  const zAxis = new Vector3();
  const upward = new Vector3();
  const matrix = new Matrix4();
  const turn = new Quaternion();
  const scale = new Vector3();

  /** The plate's place is a hole now: what is behind the wall shows through it. */
  const open = (plate: Plate) => {
    if (!plate.mask.visible) return;
    plate.mask.visible = false;
    behind.visible = true;
    refresh();
  };
  const leave = (plate: Plate) => {
    open(plate);
    if (plate.counted) return;
    plate.counted = true;
    out++;
    const [x, y] = [plate.home.clone().sub(point).dot(across), plate.home.clone().sub(point).dot(up)];
    crumble(x, y, 4, 0.6);
    sfx(world, 'impactPlate_light', plate.p, 0.6);
    sfx(world, 'drop', plate.p, 0.5);
    onOut?.(out);
  };
  /** The plate pops out of the wall by itself and falls to the floor: a pinch alone is enough, and it is how Punto pushes one out. */
  const float = (plate: Plate) => {
    plate.state = 'fall';
    plate.v.copy(normal).multiplyScalar(0.9 + Math.random() * 0.5).addScaledVector(plate.outward, 0.35).add(axis.set(0, 0.6 + Math.random() * 0.5, 0));
    leave(plate);
  };
  const ease = (rate: number, delta: number) => 1 - Math.exp(-delta * rate);

  class CrackedWall extends createSystem({}) {
    update(delta: number, time: number): void {
      clock = time;
      if (shown !== shownTo) {
        shown = shown < shownTo ? Math.min(shownTo, shown + shownSpeed * delta) : Math.max(shownTo, shown - shownSpeed * delta);
        if (shown === shownTo) { const done = shownDone; shownDone = undefined; done?.(); }
      }
      crack.uniforms.uShown.value = shown;
      if (hairShown !== hairTo) hairShown = hairShown < hairTo ? Math.min(hairTo, hairShown + hairSpeed * delta) : Math.max(hairTo, hairShown - hairSpeed * delta);
      hairGlow += (hairGlowTo - hairGlow) * ease(7, delta);
      hair.uniforms.uShown.value = hairShown;
      // the light behind the hairline breathes, faster and faster as it gathers
      hair.uniforms.uGlow.value = hairGlow * (1 - 0.45 * charge + 0.45 * charge * Math.sin(time * (6 + charge * 26)));
      sparkDue += delta * charge * 45;
      for (const spark of sparks) {
        if (spark.sprite.visible) {
          spark.age += delta;
          spark.sprite.material.opacity = Math.max(0, 1 - spark.age / spark.life);
          if (spark.age >= spark.life) spark.sprite.visible = false;
        } else if (sparkDue >= 1 && onHair(spark.sprite.position)) {
          sparkDue -= 1;
          spark.age = 0;
          spark.life = 0.05 + Math.random() * 0.12;
          spark.sprite.scale.setScalar(0.012 + Math.random() * 0.025 * (0.5 + charge));
          spark.sprite.visible = true;
          if (Math.random() < 0.15) sfx(world, 'zap', point, 0.05 + 0.08 * charge);
        }
      }
      sparkDue = Math.min(sparkDue, 3);
      glow += (glowTo - glow) * ease(6, delta);
      crack.uniforms.uGlow.value = glow * (0.85 + 0.15 * Math.sin(time * 7));
      if (boltShown !== boltTo) boltShown = boltShown < boltTo ? Math.min(boltTo, boltShown + boltSpeed * delta) : Math.max(boltTo, boltShown - boltSpeed * delta);
      boltGlow += (boltGlowTo - boltGlow) * ease(5, delta);
      bolt.uniforms.uShown.value = boltShown;
      bolt.uniforms.uGlow.value = boltGlow * (0.8 + 0.2 * Math.sin(time * 23) * Math.sin(time * 7.3)); // it flickers like a live wire
      for (const piece of stay) piece.mesh.visible = shown > piece.at;
      if (behind.visible) {
        screen.tick(delta);
        typing.tick(delta, time);
        // somebody is typing in there: soft clicks from the hole
        if ((typeClick -= delta) <= 0) {
          typeClick = 0.06 + Math.random() * 0.16 + (Math.random() < 0.08 ? 0.5 : 0);
          sfx(world, 'click', point, 0.06);
        }
      }
      // a live wire: the bolt crackles while it glows
      if (boltGlow > 0.3 && time - struck < 2.5 && (crackle -= delta) <= 0) {
        crackle = 0.25 + Math.random() * 0.9;
        sfx(world, 'zap', point, 0.1 + 0.12 * Math.min(1, boltGlow));
      }
      let waiting = 0;
      for (const plate of plates) {
        const { mesh, entity } = plate;
        if (plate.state === 'wall') {
          // cracked: a little out of true in its place; whole: not there at all
          mesh.visible = shown > plate.at && plate.mask.visible;
          plate.p.copy(plate.home).addScaledVector(normal, plate.lift);
          plate.q.copy(plate.rest);
          plate.face.opacity += (plate.veil - plate.face.opacity) * ease(8, delta);
          plate.face.color.lerp(plate.tint, ease(8, delta));
          plate.side.emissiveIntensity += (0 - plate.side.emissiveIntensity) * ease(8, delta);
          mesh.position.copy(plate.p);
          mesh.quaternion.copy(plate.q);
          continue;
        }
        const held = entity.hasComponent(Grabbed);
        if (held) {
          // the player has it: it goes where the ray takes it (and how fast, for when it is let go)
          if (delta > 0) plate.v.lerp(axis.copy(mesh.position).sub(plate.p).divideScalar(delta), 0.4);
          plate.p.copy(mesh.position);
          plate.q.copy(mesh.quaternion);
          plate.far = Math.max(plate.far, plate.p.distanceTo(plate.home));
          if (plate.far > 0.04) open(plate);
          if (plate.far > PULL) { plate.state = 'out'; leave(plate); }
          plate.held = true;
        } else if (plate.held) {
          plate.held = false;
          if (plate.state === 'loose') float(plate); // pinched and let go at once: it comes out by itself
          else {
            // let go in the air: it falls, as fast as it was moving (but not flung across the room)
            plate.state = 'fall';
            if (plate.v.length() > 3) plate.v.setLength(3);
          }
        }
        // out of the wall it is a solid piece of plaster, lit green round its broken edge from inside;
        // in the wall only a veil; loose, its edge glows: it can be taken
        const solid = plate.state === 'loose' ? (held ? 1 : 0.6) : plate.state === 'back' ? 0.7 : 1;
        plate.face.opacity += (solid - plate.face.opacity) * ease(8, delta);
        plate.face.color.lerp(PLASTER, ease(8, delta));
        plate.face.transparent = plate.face.opacity < 0.99;
        const edge = plate.state === 'loose' ? 0.7 + 0.5 * Math.sin(time * 4 + plate.seed) : plate.state === 'fall' || plate.state === 'rest' ? 0.45 : 0.2;
        plate.side.emissiveIntensity += (edge - plate.side.emissiveIntensity) * ease(8, delta);
        const hover = entity.hasComponent(Hovered) ? 0.45 : plate.state === 'loose' ? 0.12 + 0.1 * Math.sin(time * 4 + plate.seed) : 0;
        plate.face.emissiveIntensity += (hover - plate.face.emissiveIntensity) * ease(12, delta);
        if (held) continue;
        if (plate.state === 'loose') {
          // afloat in front of its place, never quite still
          plate.t = Math.min(1, plate.t + delta / 0.35);
          const lift = plate.lift + LOOSE * (1 - (1 - plate.t) ** 3) + Math.sin(time * 1.7 + plate.seed) * 0.005;
          plate.p.copy(plate.home).addScaledVector(normal, lift);
          plate.q.copy(plate.rest).multiply(tilt.setFromAxisAngle(plate.spin, (0.06 + Math.sin(time * 1.1 + plate.seed) * 0.05) * plate.t));
        } else if (plate.state === 'auto') {
          plate.t = Math.min(1, plate.t + delta / 0.55);
          const s = 1 - (1 - plate.t) ** 3;
          plate.p.lerpVectors(plate.from, plate.to, s);
          plate.q.copy(plate.fromQ).multiply(tilt.setFromAxisAngle(plate.spin, s * 0.7));
          if (plate.t >= 1) plate.state = 'out';
        } else if (plate.state === 'out') {
          // weightless: it turns slowly where it was left
          plate.p.y += Math.sin(time * 0.9 + plate.seed) * 0.0004;
          plate.q.multiply(tilt.setFromAxisAngle(plate.spin, delta * 0.15));
        } else if (plate.state === 'fall') {
          plate.v.y -= 9.8 * delta;
          plate.p.addScaledVector(plate.v, delta);
          plate.q.premultiply(tilt.setFromAxisAngle(plate.spin, delta * 7));
          zAxis.set(0, 0, 1).applyQuaternion(plate.q);
          const flat = Math.abs(zAxis.y);
          const reach = flat * (THICK / 2) + Math.sqrt(Math.max(0, 1 - flat * flat)) * 0.08;
          if (plate.p.y - reach < 0 && plate.v.y < 0) {
            plate.p.y = reach;
            sfx(world, 'impactPlank_medium', plate.p, Math.min(0.5, -plate.v.y * 0.12));
            if (plate.v.y > -0.8) {
              plate.state = 'rest';
              plate.v.y = 0;
              plate.fromQ.setFromUnitVectors(zAxis, upward.set(0, zAxis.y >= 0 ? 1 : -1, 0)).multiply(plate.q);
            } else plate.v.set(plate.v.x * 0.5, -plate.v.y * 0.3, plate.v.z * 0.5);
          }
        } else if (plate.state === 'rest') {
          plate.q.slerp(plate.fromQ, ease(16, delta));
          plate.p.y += (THICK / 2 - plate.p.y) * ease(16, delta);
          plate.p.x += plate.v.x * delta;
          plate.p.z += plate.v.z * delta;
          plate.v.multiplyScalar(Math.exp(-delta * 7)); // it slides a little and stops
        } else if (plate.state === 'back') {
          // home: an arc to its place in the wall
          waiting++;
          if (plate.wait > 0) plate.wait -= delta;
          else {
            plate.t = Math.min(1, plate.t + delta / 0.55);
            const s = plate.t < 0.5 ? 4 * plate.t ** 3 : 1 - (-2 * plate.t + 2) ** 3 / 2;
            const a = (1 - s) * (1 - s);
            const b = 2 * s * (1 - s);
            const c = s * s;
            const homeX = plate.home.x + normal.x * plate.lift;
            const homeY = plate.home.y + normal.y * plate.lift;
            const homeZ = plate.home.z + normal.z * plate.lift;
            plate.p.set(a * plate.from.x + b * plate.to.x + c * homeX, a * plate.from.y + b * plate.to.y + c * homeY, a * plate.from.z + b * plate.to.z + c * homeZ);
            plate.q.slerpQuaternions(plate.fromQ, plate.rest, Math.min(1, s * 1.2));
            if (plate.t >= 1) {
              plate.state = 'wall';
              plate.mask.visible = true;
              refresh();
              glow = Math.max(glow, 1.6); // the seam flares where it joined
              const [x, y] = [plate.home.clone().sub(point).dot(across), plate.home.clone().sub(point).dot(up)];
              puff(x, y, 0.12);
              sfx(world, 'switch', plate.home, 0.5);
              sfx(world, 'impactSoft_medium', plate.home, 0.35);
              waiting--;
            }
          }
        }
        mesh.position.copy(plate.p);
        mesh.quaternion.copy(plate.q);
      }
      if (mended && waiting === 0 && plates.every((plate) => plate.state === 'wall')) {
        const done = mended;
        mended = undefined;
        done();
      }
      // crumbs fall and stay on the floor until the wall is whole
      crumbState.forEach((c, n) => {
        if (!c.live) return;
        if (!c.resting) {
          c.v.y -= 9.8 * delta;
          c.p.addScaledVector(c.v, delta);
          c.turn += delta * 9;
          if (c.p.y - c.size / 2 < floor) {
            c.p.y = floor + c.size / 2;
            c.resting = true;
          }
        }
        crumbs.setMatrixAt(n, matrix.compose(c.p, turn.setFromAxisAngle(c.spin, c.turn), scale.setScalar(c.size)));
      });
      crumbs.instanceMatrix.needsUpdate = true;
      for (const p of puffs) {
        if (!p.sprite.visible) continue;
        p.age += delta;
        const k = p.age / p.life;
        if (k >= 1) { p.sprite.visible = false; continue; }
        p.sprite.position.addScaledVector(p.v, delta);
        p.v.multiplyScalar(Math.exp(-delta * 2.2));
        p.sprite.scale.setScalar(p.size * (0.35 + 0.65 * (1 - (1 - k) ** 3)));
        p.sprite.material.opacity = 0.5 * (1 - k) ** 1.5 * Math.min(1, k * 12);
      }
    }
  }
  world.registerSystem(CrackedWall);
  const run = (to: number, seconds: number) => {
    shownTo = to;
    shownSpeed = Math.abs(to - shown) / Math.max(0.01, seconds) || 1;
    return new Promise<void>((resolve) => (shown === to ? resolve() : (shownDone = resolve)));
  };
  const local = (at: Vector3): Point => {
    const offset = at.clone().sub(point);
    return [offset.dot(across), offset.dot(up)];
  };

  return {
    /** How many plates are out of the wall. */
    get out() {
      return out;
    },
    /** The player holds a plate right now. */
    get holding() {
      return plates.some((plate) => plate.held);
    },
    set onOut(listener: ((count: number) => void) | undefined) {
      onOut = listener;
    },
    /** A knock from inside: dust trickles from the spot (and from the hairline, if there is one). */
    tap(strength: number) {
      crumble(0, 0, Math.round(1 + strength * 3), 0.15 + strength * 0.25);
      if (strength > 0.5) puff(0, 0, 0.08 + strength * 0.08);
    },
    /** The hairline runs out to `reach` metres from the middle; `glow` is the light coming through it. */
    grow(reach: number, glowing: number, seconds = 0.25) {
      hairTo = reach;
      hairSpeed = Math.abs(reach - hairShown) / Math.max(0.01, seconds) || 1;
      hairGlowTo = glowing;
    },
    /** 0..1: the light gathering behind the wall: it breathes faster, sparks run along the hairline. */
    gather(level: number) {
      charge = level;
    },
    /** The bolt strikes down the wall in two strokes; the cracks run out from where it struck; the piece in the middle falls out. */
    async crack() {
      charge = 0;
      hairGlowTo = 1;
      const stroke = (to: number, seconds: number) => {
        boltSpeed = Math.abs(to - boltShown) / seconds;
        boltTo = to;
        return sleep(seconds * 1000);
      };
      sfx(world, 'zap', point, 0.8);
      sfx(world, 'impactMining', point, 0.7);
      boltGlow = 1.8;
      boltGlowTo = 1;
      await stroke(strike, 0.1);
      crumble(0, 0, 6, 0.6);
      puff(0, 0, 0.18);
      await sleep(220);
      sfx(world, 'zap', point, 1);
      sfx(world, 'explosionCrunch', point, 0.8);
      struck = clock;
      boltGlow = 2.2;
      void stroke(whole, 0.12);
      glowTo = 0.6;
      await run(crackEnd, crackEnd); // in real time: one second of crack is one second
      crumble(0, 0, 10, 1);
      for (let k = 0; k < 3; k++) puff((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.3);
      sfx(world, 'impactMining', point, 1);
      await sleep(180);
      const piece = plates[0];
      piece.state = 'fall';
      piece.p.copy(piece.home).addScaledVector(normal, piece.lift);
      piece.v.copy(normal).multiplyScalar(0.9).add(axis.set(0, 0.8, 0));
      piece.mesh.visible = true;
      open(piece);
      sfx(world, 'impactPlate_light', point, 0.7);
    },
    /** The plates round the hole come loose, one after another, and can be taken. */
    async loosen() {
      glowTo = 1;
      for (const plate of plates.slice(1)) {
        plate.state = 'loose';
        plate.t = 0;
        plate.mesh.visible = true; // it still covers its place: the hole opens when it leaves
        plate.entity.addComponent(RayInteractable).addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget });
        sfx(world, 'impactPlate_light', plate.home, 0.4);
        await sleep(60);
      }
    },
    /** Punto pushes so many of the loose plates out from behind (Infinity: all of them). */
    push(count: number) {
      for (const plate of plates) {
        if (count <= 0) break;
        if (plate.state !== 'loose') continue;
        float(plate);
        count--;
      }
    },
    /** The middle of the hole Punto can get through: the first hole and the places of the plates that are out. */
    gap(target: Vector3) {
      target.copy(plates[0].home);
      let count = 1;
      for (const plate of plates) {
        if (!plate.counted) continue;
        target.add(plate.home);
        count++;
      }
      return target.divideScalar(count);
    },
    /** Dust and crumbs at a point of the wall: something burst through. */
    burst(at: Vector3) {
      const [x, y] = local(at);
      crumble(x, y, 8, 1.1);
      for (let k = 0; k < 3; k++) puff(x, y, 0.3);
    },
    /** A point on the broken place, for Punto's pixels. */
    spot(target: Vector3) {
      return target.copy(plates[Math.floor(Math.random() * plates.length)].home).addScaledVector(normal, 0.02);
    },
    /** Every plate flies home, the ones furthest out first; then the cracks close up and the bolt runs back. Resolves when the wall is whole.
     *  `home`: called the moment the last plate is in its place (the cracks still closing, ~1 s before the end). */
    async mend(home?: () => void) {
      const grabs = world.getSystem(GrabSystem);
      const order = plates.filter((plate) => plate.state !== 'wall').sort((a, b) => b.p.distanceTo(b.home) - a.p.distanceTo(a.home));
      order.forEach((plate, k) => {
        if (plate.entity.hasComponent(Grabbed)) grabs?.forceRelease(plate.entity);
        if (plate.entity.hasComponent(DistanceGrabbable)) plate.entity.removeComponent(DistanceGrabbable);
        if (plate.entity.hasComponent(RayInteractable)) plate.entity.removeComponent(RayInteractable);
        plate.state = 'back';
        plate.wait = 0.25 + k * 0.1;
        plate.t = 0;
        plate.held = false;
        plate.from.copy(plate.p);
        plate.fromQ.copy(plate.q);
        plate.to.lerpVectors(plate.p, plate.home, 0.5).addScaledVector(normal, 0.28).add(axis.set(0, 0.12, 0));
      });
      // the crumbs go too
      for (const c of crumbState) c.live = false;
      for (let n = 0; n < CRUMBS; n++) crumbs.setMatrixAt(n, hidden);
      await new Promise<void>((resolve) => (mended = resolve));
      home?.();
      behind.visible = false;
      await sleep(200);
      glowTo = 0;
      boltGlow = 1.8;
      boltGlowTo = 0.6;
      boltSpeed = whole / 0.6;
      boltTo = 0;
      hairTo = 0;
      hairSpeed = 0.5;
      hairGlowTo = 0;
      await run(0, 0.6);
      boltGlowTo = 0;
      await sleep(250);
    },
    dispose() {
      world.unregisterSystem(CrackedWall);
      holeMap.dispose();
      for (const plate of plates) {
        if (plate.entity.active) plate.entity.dispose();
        plate.mesh.geometry.dispose();
        plate.face.dispose();
        plate.side.dispose();
      }
      if (rootEntity.active) rootEntity.dispose();
      const materials = new Set<{ dispose(): void }>();
      root.traverse((object) => {
        if (object instanceof Mesh || object instanceof Sprite) {
          object.geometry.dispose();
          for (const material of [object.material].flat()) materials.add(material);
        }
      });
      for (const material of materials) material.dispose();
      screen.texture.dispose();
      typing.texture.dispose();
      soft.dispose();
      dust.dispose();
    },
  };
}

/**
 * Punto comes in through a crack in a real wall that the player takes apart. Resolves when
 * Punto is back at its place by the player and the wall is whole; false when there was no
 * wall in reach (it has then just popped in).
 */
export async function burstIn(world: World, punto: SpawnedPunto, voice?: () => EntranceVoice | undefined | Promise<EntranceVoice | undefined>): Promise<boolean> {
  punto.object.visible = false; // nobody in the room yet
  const popIn = () => {
    punto.object.visible = true;
    punto.enter();
    return false;
  };
  const walls = roomWalls(world);
  let found: Wall | undefined;
  // The headset hands the walls over one by one in the first seconds: a wall chosen too early can be one that
  // a nearer wall, still to come, stands in front of. Choose once the list has not changed for 0.9 s (and not
  // before 1.5 s), or at ROOM_WAIT with what there is.
  let seen = -1;
  let steadySince = 0;
  for (let waited = 0; waited < ROOM_WAIT && !found; waited += 300) {
    await sleep(300);
    const count = walls.count();
    if (count !== seen) {
      seen = count;
      steadySince = waited;
    }
    const steady = count > 0 && waited >= 1500 && waited - steadySince >= 900;
    if (steady || waited + 300 >= ROOM_WAIT) found = walls.find(world);
  }
  walls.dispose();
  if (!found) {
    console.warn('[entrance] no wall in reach: Punto pops in');
    return popIn();
  }
  const { point, normal, above, below } = found;
  const eye = () => world.camera.getWorldPosition(new Vector3());
  const across = new Vector3().crossVectors(new Vector3(0, 1, 0), normal).normalize();
  const out = (ahead: number, side = 0, from = point) => from.clone().addScaledVector(normal, ahead).addScaledVector(across, side);
  // how far into the room Punto comes: never into the player's face, the wall may be 80 cm away
  const away = eye().sub(point).setY(0).length();
  const OUT = Math.min(0.85, away * 0.4);
  const WORK = Math.min(0.55, away * 0.3);
  const wall = crackedWall(world, point, normal, above, below);
  // The title of step 6 built and compiled now, while Punto is still hidden behind the wall and nothing in the room
  // moves (the wall has just been built in this same stall). Started at «fix it» it fell on Punto's flight back to
  // the player and his greeting: the build, the texture uploads and its compile frames, all where the player looks.
  void import('./splash/ingame-title.js').then(({ prepareTitle }) => prepareTitle(world)).catch((error) => console.error('[title]', error));
  console.info(`[entrance] a crack at ${point.toArray().map((v) => v.toFixed(2)).join(', ')} facing ${normal.toArray().map((v) => v.toFixed(2)).join(', ')}, bare wall ${above.toFixed(1)} m up, ${below.toFixed(1)} m down`);

  // On the way in Punto casts no shadow: on the wall it covered the crack.
  const shadowed: Object3D[] = [];
  punto.object.traverse((object) => {
    if (!object.castShadow) return;
    shadowed.push(object);
    object.castShadow = false;
  });

  // In the hole Punto's body is really squeezed, in 3D: a waist where the wall holds it, the rest
  // pushed out either side (src/squeeze.ts). Out of it, it springs back like rubber.
  const base = punto.object.scale.x;
  const squash = { x: 1, vx: 0, y: 1, vy: 0, toX: 1, toY: 1, wobble: 0, deform: 0, deformTo: 0 };
  const deformer = squeezable(punto.object);
  let dash: { from: Vector3; to: Vector3; t: number; seconds: number; done: () => void } | undefined;
  const dashTo = (to: Vector3, seconds: number) =>
    new Promise<void>((done) => (dash = { from: punto.object.getWorldPosition(new Vector3()), to, t: 0, seconds, done }));
  class Squeeze extends createSystem({}) {
    update(delta: number, time: number): void {
      const step = Math.min(delta, 0.05);
      squash.vx += ((squash.toX - squash.x) * 240 - squash.vx * 11) * step;
      squash.vy += ((squash.toY - squash.y) * 240 - squash.vy * 11) * step;
      squash.x += squash.vx * step;
      squash.y += squash.vy * step;
      punto.object.scale.set(base * squash.x, base * squash.y, base * squash.x); // wide and deep together: a body, not a picture
      squash.deform += (squash.deformTo - squash.deform) * (1 - Math.exp(-step * (squash.deformTo > squash.deform ? 9 : 22)));
      deformer.amount = squash.deform < 0.002 ? 0 : squash.deform;
      punto.root.rotation.z = squash.wobble * Math.sin(time * 19) * 0.14;
      if (dash) {
        dash.t = Math.min(1, dash.t + step / dash.seconds);
        const s = 1 - (1 - dash.t) ** 3;
        punto.placeAt(dash.from.clone().lerp(dash.to, s), eye());
        if (dash.t >= 1) {
          const { done } = dash;
          dash = undefined;
          done();
        }
      }
    }
  }
  world.registerSystem(Squeeze);
  const looking = () => {
    const forward = world.camera.getWorldDirection(new Vector3()).setY(0).normalize();
    return forward.dot(point.clone().sub(eye()).setY(0).normalize()) > Math.cos((45 * Math.PI) / 180);
  };
  /** Three knocks from inside the wall: heard from where the crack is, whichever way the player looks. */
  const knock = () => {
    for (let k = 0; k < 3; k++) setTimeout(() => sfx(world, 'impactWood_heavy', point, 0.9), k * 190);
  };
  const finish = () => {
    muffled(null);
    deformer.amount = 0;
    world.unregisterSystem(Squeeze);
    punto.object.scale.setScalar(base);
    punto.root.rotation.z = 0;
    for (const object of shadowed) object.castShadow = true;
  };

  // Punto talks all the way in, one line at a time: a line said while another is being said waits
  // for it (only the newest one waits: what was news a moment ago is old now).
  let speaking: Promise<void> | undefined;
  let next: IntroLine | undefined;
  const speak = (line: IntroLine): Promise<void> => {
    speaking = talk(punto, line).finally(() => {
      speaking = undefined;
      const queued = next;
      next = undefined;
      if (queued) void speak(queued);
    });
    return speaking;
  };
  const chat = (line: IntroLine) => {
    if (speaking) next = line;
    else void speak(line);
  };
  const sayNow = async (line: IntroLine) => {
    next = undefined;
    while (speaking) await speaking;
    await speak(line);
  };

  try {
    // Punto waits behind the wall (the wall hides it); its voice comes through the wall.
    punto.placeAt(out(-0.45, 0.25), eye());
    muffled(900); // its voice comes through the wall; Punto itself shows up behind it only when it comes to the hole

    // 1. Knocks from inside the wall, a hairline, a call, knocks again — and the bolt.
    const knocks = async (times: number[], volume: number, grow?: number[]) => {
      const start = performance.now();
      for (const [k, at] of times.entries()) {
        const wait = at * 1000 - (performance.now() - start);
        if (wait > 0) await sleep(wait);
        sfx(world, 'impactWood_heavy', point, volume);
        wall.tap(volume);
        if (grow?.[k]) wall.grow(grow[k], 0.15 + k * 0.1, 0.12);
      }
    };
    /** Not looking at the wall: knocks from it, so the ears tell where to look, until the player turns (or `most` ms). */
    const untilLooking = async (most: number) => {
      const until = performance.now() + most;
      while (!looking() && performance.now() < until) {
        knock();
        for (let quiet = 0; quiet < 25 && !looking(); quiet++) await sleep(100);
      }
    };
    await sleep(300);
    await untilLooking(8000);
    await knocks([0, 0.2, 0.4], 0.7); // knock-knock-knock
    await sleep(450);
    await knocks([0, 0.2], 0.8); // knock-knock, and a hairline
    wall.grow(0.035, 0, 0.15);
    sfx(world, 'impactMining', point, 0.25);
    await sleep(200);
    await sayNow('anyone');
    await untilLooking(5000);
    await knocks([0, 0.2, 0.4], 0.9, [0.07, 0.12, 0.17]); // knock-knock-knock, the crack running out with each
    wall.gather(0.8);
    sfx(world, 'phaserUp', point, 0.35);
    await sleep(350);
    wall.gather(0);
    // bang: the bolt
    await wall.crack();
    console.info('[entrance] the wall cracked');
    punto.object.visible = true;
    await punto.flyTo(out(-0.16, 0), eye());
    const started = performance.now();
    let calls = 0;
    while (!looking() && performance.now() - started < LOOK_WAIT) {
      knock();
      const line = sayNow(calls++ % 2 ? 'help2' : 'help1');
      punto.perform('reach');
      await line;
      for (let quiet = 0; quiet < 12 && !looking(); quiet++) await sleep(100);
    }
    // 2. "You can see me?" — and the plates round the hole come loose while it says so.
    //    The player takes them out; three, and Punto can get through. Told how only if they do nothing.
    let touched = performance.now(); // the last time the player had a plate in hand or took one out
    let pushed = false; // Punto pushes the plates out itself
    wall.onOut = (count) => {
      console.info(`[entrance] a plate is out: ${count}`);
      touched = performance.now();
      punto.chirp(count < NEED ? 'poke' : 'glad');
      if (!pushed) chat(count === 1 ? 'pulled1' : count === 2 ? 'pulled2' : 'pulled3'); // praise only for the player's own
    };
    const seen = sayNow('seen');
    punto.perform('reach');
    await sleep(900);
    await wall.loosen();
    console.info('[entrance] the plates are loose');
    touched = performance.now();
    await seen;
    punto.setState('listen');
    let told = false;
    let nudges = 0;
    let lastWord = performance.now();
    let knocked = performance.now();
    let calledBack = 0;
    while (wall.out < NEED) {
      if (wall.holding) touched = performance.now();
      const idle = performance.now() - touched;
      // turned away: knocks from the wall, so the ears tell where to look — now and then, not on and on
      if (!looking() && performance.now() - knocked > 4000 && calledBack < 3) {
        knock();
        calledBack++;
        knocked = performance.now();
      }
      // a word only when the player does nothing: one already pulling needs no telling
      if (!speaking && !told && wall.out === 0 && idle > GRAB_HINT) {
        told = true;
        chat('pull');
        punto.perform('reach');
        lastWord = performance.now();
      } else if (!speaking && idle > NUDGE && performance.now() - lastWord > NUDGE && nudges < 2) {
        chat(nudges++ % 2 ? 'nudge2' : 'nudge1');
        punto.perform('reach');
        lastWord = performance.now();
      }
      if (idle > GRAB_WAIT) {
        console.info('[entrance] nobody took the plates: Punto pushes them out');
        await sayNow('pushing');
        pushed = true; // it breaks out through the plates itself, below
        break;
      }
      await sleep(100);
    }
    wall.onOut = undefined;
    await speaking;
    await sleep(150);

    // 3. Out it comes: it dives into the hole, sticks, struggles, and pops out like a cork.
    const gap = wall.gap(new Vector3());
    punto.setState('happy');
    await punto.flyTo(out(-0.26, 0, gap), eye());
    deformer.hole(gap, normal, 0.1, 0.045); // the hole is about 20 cm across where it is narrowest
    squash.deformTo = 1;
    sfx(world, 'creak', gap, 0.7);
    await dashTo(out(-0.06, 0, gap), 0.3); // its front is out of the wall, the widest part is stuck
    sfx(world, 'impactSoft_heavy', gap, 0.6);
    console.info('[entrance] Punto is stuck');
    muffled(null); // its face is in the room now
    const stuck = sayNow('stuck');
    punto.perform('strain');
    for (let k = 0; k < 2; k++) {
      squash.wobble = 1;
      sfx(world, 'creak', gap, 0.5);
      await sleep(650);
      squash.wobble = 0;
      punto.chirp('poke');
      await sleep(300);
      punto.perform('strain');
    }
    await stuck;
    // pop: the waist lets go at once, and the body overshoots, wide and short, and springs back
    squash.deformTo = 0;
    squash.vx = 6;
    squash.vy = -5;
    wall.burst(gap);
    wall.push(Infinity); // the plates still hanging round the hole fly off with it: nothing is left in the way
    if (pushed) sfx(world, 'impactMining', gap, 0.7);
    sfx(world, 'pepSound', gap, 0.8);
    sfx(world, 'drop', gap, 0.7);
    punto.setState('happy');
    await dashTo(out(OUT, 0, gap).add(new Vector3(0, 0.08, 0)), 0.32);
    console.info('[entrance] Punto is in the room');
    await sayNow('free');

    // 4. Punto says who it is and asks the player to say «fix it»: the first time the player speaks and Punto does
    //    (with Live, Live says it; without, the recorded lines). Whatever is said then mends the wall.
    const word = new Promise<boolean>((resolve) => (wordWanted = () => resolve(true)));
    const until = (step: Promise<unknown>) => Promise.race([word, step.then(() => false)]);
    // (with Live wanted but not connected yet, this waits a little for it: its words, not the recorded «pinch»)
    const talk = await voice?.();
    void punto.comeBack();
    let said = await until(talk ? talk.greet() : sayNow('fixit'));
    punto.setState('listen');
    if (!said) said = await until(sleep(WORD_HINT));
    if (!said) {
      said = await until(talk ? talk.remind() : sayNow('sayFix'));
      punto.setState('listen');
      if (!said) said = await until(sleep(WORD_WAIT));
    }
    wordWanted = undefined;
    console.info(said ? '[entrance] the player said it' : '[entrance] nobody said it: Punto mends the wall itself');
    if (!said) await (talk ? talk.giveUp() : sayNow('oops'));

    // 5. The wall mends: the plates fly home, the cracks close, the bolt runs back up and is gone.
    punto.setState('happy');
    await punto.flyTo(out(WORK, 0.35), point);
    punto.showBuild = false; // its hands work on the wall, not on little cubes
    punto.setCode(null);
    punto.setCode(FIX_CODE);
    punto.setState('build');
    const spot = new Vector3();
    const pixels = setInterval(() => punto.sendPixels(wall.spot(spot), Math.random() < 0.5 ? 0 : 1), 120);
    // Live is told the wall is whole as the last plate lands, not after the cracks have closed: its answer takes
    // ~2-3 s to come, and that second is a second less of silence (15.11, the headset: 11 s without a word)
    let toldWhole = false;
    const tell = () => {
      if (toldWhole) return;
      toldWhole = true;
      talk?.mended();
    };
    await wall.mend(tell);
    clearInterval(pixels);
    wall.dispose(); // the wall is whole: nothing of it is left in the scene
    console.info('[entrance] the wall is whole again');
    punto.setCode(null); // its own sample again
    punto.showBuild = true;
    punto.setState('happy');
    finish();
    // 6. He flies up and types PUNTO before the player, as on the front page (src/splash/ingame-title.ts). Live has
    //    been told the wall is whole as the last plate landed (tell() above; here only if mend() never called it)
    tell();
    await import('./splash/ingame-title.js').then(({ typeTitle }) => typeTitle(world, punto)).catch((error) => console.error('[title]', error));
    await punto.comeBack();
    punto.setState('idle');
    return true;
  } catch (error) {
    finish();
    throw error;
  }
}
