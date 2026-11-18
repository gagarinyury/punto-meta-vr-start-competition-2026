import {
  type BoxGeometry,
  createSystem,
  type Entity,
  eq,
  type Mesh,
  type Object3D,
  type Quaternion,
  Vector3,
  type World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { isRoomSurface, readFurniture } from './furniture.js';

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

const CELL = 0.12;

/**
 * Makes a creature live in the real room: it walks on the real floor, goes
 * around real furniture, hides behind it and hops onto it.
 *
 * The game builds the body (feet at y = 0, face towards +z) and decides what
 * the creature wants; the host finds the way and moves, turns and hops it.
 * Standing or sitting still, the creature turns its face to the player.
 */
export function walkInRoom(
  world: World,
  body: Object3D,
  { speed = 0.7, radius = 0.15, hop = 0.03 }: { speed?: number; radius?: number; hop?: number },
  onReady: (walker: Walker) => void,
): void {
  // a piece of furniture read through furniture.ts (a real Quest gives its boxes Z-up)
  interface Box {
    centre: Vector3;
    /** The inverse of the box's turn around the vertical: world -> the box's own axes. */
    unturn: Quaternion;
    half: Vector3;
    label: string;
  }
  const boxes: Box[] = [];
  let free: boolean[] = [];
  let columns = 0;
  let rows = 0;
  const corner = new Vector3();
  let path: Vector3[] = [];
  let leap: { from: Vector3; to: Vector3; time: number } | undefined;
  let perch: Vector3 | undefined; // where to hop once the walk ends
  let perched = false;
  let waited = 0;
  let stride = 0;
  let walker: Walker | undefined;
  const local = new Vector3();
  const step = new Vector3();

  const cellOf = (p: Vector3) => [Math.floor((p.x - corner.x) / CELL), Math.floor((p.z - corner.z) / CELL)];
  const centreOf = (c: number, r: number) =>
    new Vector3(corner.x + (c + 0.5) * CELL, corner.y, corner.z + (r + 0.5) * CELL);
  const isFree = (c: number, r: number) => c >= 0 && r >= 0 && c < columns && r < rows && free[r * columns + c];
  // Is the point inside a piece of furniture, seen from above, with a margin?
  const inside = ({ centre, unturn, half }: Box, p: Vector3, margin: number) => {
    local.copy(p).sub(centre).applyQuaternion(unturn);
    return Math.abs(local.x) < half.x + margin && Math.abs(local.z) < half.z + margin;
  };
  const nearestFree = (p: Vector3) => {
    let best: [number, number] | undefined;
    let bestGap = Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const gap = centreOf(c, r).distanceTo(p);
        if (free[r * columns + c] && gap < bestGap) {
          bestGap = gap;
          best = [c, r];
        }
      }
    }
    return best;
  };
  // Shortest way over free cells (A*), as a list of points.
  const route = (from: Vector3, to: Vector3): Vector3[] | undefined => {
    const start = nearestFree(from);
    const goal = nearestFree(to);
    // The player stands on the floor too: never walk through their legs.
    const feet = world.camera.getWorldPosition(new Vector3()).setY(corner.y);
    const clear = (c: number, r: number) => isFree(c, r) && centreOf(c, r).distanceTo(feet) > 0.3;
    if (!start || !goal) {
      return undefined;
    }
    const id = (c: number, r: number) => r * columns + c;
    const cost = new Map<number, number>([[id(...start), 0]]);
    const cameFrom = new Map<number, number>();
    const open = [id(...start)];
    while (open.length > 0) {
      let pick = 0;
      const guess = (n: number) =>
        cost.get(n)! + Math.hypot((n % columns) - goal[0], Math.floor(n / columns) - goal[1]);
      for (let i = 1; i < open.length; i++) {
        if (guess(open[i]) < guess(open[pick])) {
          pick = i;
        }
      }
      const current = open.splice(pick, 1)[0];
      if (current === id(...goal)) {
        const points: Vector3[] = [];
        for (let n: number | undefined = current; n !== undefined; n = cameFrom.get(n)) {
          points.unshift(centreOf(n % columns, Math.floor(n / columns)));
        }
        return points;
      }
      const c = current % columns;
      const r = Math.floor(current / columns);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!clear(c + dc, r + dr) || !isFree(c + dc, r) || !isFree(c, r + dr)) {
          continue;
        }
        const next = id(c + dc, r + dr);
        const total = cost.get(current)! + Math.hypot(dc, dr);
        if (total < (cost.get(next) ?? Infinity)) {
          cost.set(next, total);
          cameFrom.set(next, current);
          if (!open.includes(next)) {
            open.push(next);
          }
        }
      }
    }
    return undefined;
  };
  const walkTo = (target: Vector3) => {
    const from = body.position.clone();
    if (perched) {
      // First hop down to the floor next to the furniture.
      const down = nearestFree(from);
      if (!down) {
        return false;
      }
      leap = { from, to: centreOf(...down), time: 0 };
      perched = false;
    }
    const found = route(leap?.to ?? from, target);
    if (!found) {
      return false;
    }
    path = found;
    perch = undefined;
    return true;
  };

  world.registerSystem(
    class RoomWalker extends createSystem({
      planes: { required: [XRPlane] },
      furniture: { required: [XRMesh], where: [eq(XRMesh, 'isBounded3D', true)] },
    }) {
      update(delta: number): void {
        if (!walker) {
          // Learn the room once: the floor and what stands on it.
          let floor: Mesh | undefined;
          for (const plane of this.queries.planes.entities) {
            const mesh = plane.object3D as Mesh;
            const { width, depth } = (mesh.geometry as BoxGeometry).parameters;
            if (isRoomSurface(mesh) && mesh.position.y < 0.3 && Math.abs(mesh.up.clone().applyQuaternion(mesh.quaternion).y) > 0.9) {
              floor = mesh;
            }
          }
          waited += floor ? delta : 0;
          if (!floor || waited < 1) {
            return; // furniture may arrive a moment after the floor
          }
          for (const item of this.queries.furniture.entities) {
            const piece = readFurniture(item);
            if (!piece) {
              continue; // the mesh of the whole room (a real Quest has one): not furniture
            }
            boxes.push({
              centre: piece.centre,
              unturn: piece.quaternion.clone().invert(),
              half: piece.size.clone().multiplyScalar(0.5),
              label: piece.label,
            });
          }
          const { width, depth } = (floor.geometry as BoxGeometry).parameters;
          const reach = Math.hypot(width, depth) / 2;
          corner.set(floor.position.x - reach, floor.position.y, floor.position.z - reach);
          columns = rows = Math.ceil((reach * 2) / CELL);
          free = Array.from({ length: columns * rows }, (_, n) => {
            const p = centreOf(n % columns, Math.floor(n / columns));
            floor!.worldToLocal(local.copy(p));
            const onFloor = Math.abs(local.x) < width / 2 - radius && Math.abs(local.z) < depth / 2 - radius;
            // Things hanging above the creature's head do not block the way.
            return onFloor && !boxes.some((box) => box.centre.y - box.half.y < 0.5 && inside(box, p, radius));
          });
          const start = nearestFree(world.camera.getWorldPosition(new Vector3()).add(new Vector3(0, 0, -1.2)));
          body.position.copy(start ? centreOf(...start) : floor.position);
          const entity = world.createTransformEntity(body);
          walker = {
            entity,
            goTo: walkTo,
            wander() {
              for (let tries = 0; tries < 20; tries++) {
                const n = Math.floor(Math.random() * free.length);
                if (free[n] && walkTo(centreOf(n % columns, Math.floor(n / columns)))) {
                  return;
                }
              }
            },
            comeToPlayer() {
              // Beside the feet, half a step to the side of where the player looks.
              const feet = world.camera.getWorldPosition(new Vector3()).setY(corner.y);
              const gaze = world.camera.getWorldDirection(new Vector3()).setY(0).normalize();
              const side = body.position.clone().sub(feet).cross(gaze).y > 0 ? -0.8 : 0.8;
              return walkTo(feet.addScaledVector(gaze.applyAxisAngle(new Vector3(0, 1, 0), side), 0.5));
            },
            hide() {
              const player = world.camera.getWorldPosition(new Vector3()).setY(corner.y);
              let best: Vector3 | undefined;
              let bestGap = Infinity;
              free.forEach((open, n) => {
                if (!open) {
                  return;
                }
                const spot = centreOf(n % columns, Math.floor(n / columns));
                // Hidden: a low-standing piece of furniture lies on the line of sight.
                const covered = boxes.some((box) => {
                  if (box.half.y * 2 < 0.3) {
                    return false;
                  }
                  for (let t = 0.1; t < 0.95; t += 0.05) {
                    if (inside(box, step.lerpVectors(spot, player, t), 0)) {
                      return true;
                    }
                  }
                  return false;
                });
                const gap = spot.distanceTo(body.position);
                if (covered && gap < bestGap && boxes.some((box) => inside(box, spot, radius + 0.25))) {
                  bestGap = gap;
                  best = spot;
                }
              });
              return best ? walkTo(best) : false;
            },
            jumpOn(label) {
              const box = boxes
                .filter((candidate) => candidate.label === label)
                .sort((a, b) => a.centre.distanceTo(body.position) - b.centre.distanceTo(body.position))[0];
              if (!box || !walkTo(box.centre)) {
                return false;
              }
              // Land where the walk ended, a third of the way in from that edge.
              const edge = path[path.length - 1];
              perch = box.centre.clone().lerp(edge, 0.35);
              // Seats are boxes up to the top of the backrest: sit at seat height.
              const soft = label === 'couch' || label === 'bed';
              const bottom = box.centre.y - box.half.y;
              perch.setY(soft ? bottom + Math.min(box.half.y, 0.45) : box.centre.y + box.half.y);
              return true;
            },
            get idle() {
              return path.length === 0 && !leap;
            },
            get perched() {
              return perched;
            },
          };
          onReady(walker);
          return;
        }

        if (leap) {
          // A hop: an arc from one spot to another.
          leap.time += delta / 0.45;
          const t = Math.min(leap.time, 1);
          body.position.lerpVectors(leap.from, leap.to, t);
          body.position.y += Math.sin(Math.PI * t) * (0.25 + Math.abs(leap.to.y - leap.from.y) * 0.3);
          if (t >= 1) {
            leap = undefined;
          }
          return;
        }
        if (path.length === 0) {
          // Still: turn the face to the player, as a living thing would.
          world.camera.getWorldPosition(step).sub(body.position);
          const facing = Math.atan2(step.x, step.z);
          const swing = Math.atan2(Math.sin(facing - body.rotation.y), Math.cos(facing - body.rotation.y));
          body.rotation.y += swing * Math.min(1, delta * 4);
          return;
        }
        step.copy(path[0]).sub(body.position).setY(0);
        const left = step.length();
        const stride1 = speed * delta;
        if (left <= stride1) {
          body.position.copy(path.shift()!);
          if (path.length === 0 && perch) {
            leap = { from: body.position.clone(), to: perch, time: 0 };
            perch = undefined;
            perched = true;
          }
        } else {
          body.position.addScaledVector(step, stride1 / left);
          // Turn the face to where it goes, and bob with every step.
          const heading = Math.atan2(step.x, step.z);
          const turn = Math.atan2(Math.sin(heading - body.rotation.y), Math.cos(heading - body.rotation.y));
          body.rotation.y += turn * Math.min(1, delta * 10);
          stride += stride1;
          body.position.y = corner.y + Math.abs(Math.sin(stride * 14)) * hop;
        }
      }
    },
  );
}
