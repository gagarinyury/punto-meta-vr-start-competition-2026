import {
  AdditiveBlending,
  AssetManager,
  BackSide,
  type BoxGeometry,
  BufferGeometry,
  Color,
  createSystem,
  CylinderGeometry,
  DoubleSide,
  eq,
  IBLGradient,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  type World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { isRoomSurface, readFurniture } from './furniture.js';

export interface Hole {
  /** World position of the hole's centre, on a real wall, floor or ceiling. */
  centre: Vector3;
  radius: number;
  /** A jagged hole instead of a round one: world points lying on the surface. */
  outline?: Vector3[];
}

/**
 * Cuts round holes in the real room: portals, windows, a pit in the floor.
 *
 * Whatever the game puts OUTSIDE the room (a sky, stars, a landscape, a tunnel)
 * becomes visible through the holes only, from every angle. It works by
 * covering every big room surface with an invisible mask that writes depth
 * and has the holes cut out of it.
 *
 * Things outside must be created with `object.userData.occlude = false`,
 * otherwise real-world occlusion hides them behind the real wall.
 */
export function cutHoles(world: World, holes: Hole[]): void {
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const local = new Vector3();
  let built = false;

  world.registerSystem(
    class RoomHoles extends createSystem({ planes: { required: [XRPlane] } }) {
      update(): void {
        if (built || this.queries.planes.entities.size === 0) {
          return;
        }
        built = true;
        const masks = new Group();
        masks.userData.occlude = false;
        for (const plane of this.queries.planes.entities) {
          const surface = plane.object3D as Mesh;
          const { width, depth } = (surface.geometry as BoxGeometry).parameters;
          if (!isRoomSurface(surface)) {
            continue; // furniture tops, pictures, windows (a real wall may come in narrow pieces)
          }
          const outline = new Shape()
            .moveTo(-width / 2, -depth / 2)
            .lineTo(width / 2, -depth / 2)
            .lineTo(width / 2, depth / 2)
            .lineTo(-width / 2, depth / 2)
            .closePath();
          for (const hole of holes) {
            surface.worldToLocal(local.copy(hole.outline?.[0] ?? hole.centre));
            if (Math.abs(local.y) < 0.05) {
              // Shape (x, y) lies on the surface as its local (x, -z).
              outline.holes.push(
                hole.outline
                  ? new Path(
                      hole.outline.map((p) => {
                        surface.worldToLocal(local.copy(p));
                        // Kept just inside the mask: a hole may reach the very edge.
                        return new Vector2(
                          Math.max(-width / 2 + 0.001, Math.min(width / 2 - 0.001, local.x)),
                          Math.max(-depth / 2 + 0.001, Math.min(depth / 2 - 0.001, -local.z)),
                        );
                      }),
                    )
                  : new Path().absarc(local.x, -local.z, hole.radius, 0, Math.PI * 2, true),
              );
            }
          }
          const mask = new Mesh(
            new ShapeGeometry(outline, 24),
            // Pushed a little back in depth, so thin things lying on the wall
            // (rims, glows, hairline cracks) never flicker against the mask.
            new MeshBasicMaterial({
              colorWrite: false,
              side: DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: 2,
              polygonOffsetUnits: 8,
            }),
          );
          mask.renderOrder = -10;
          mask.quaternion.copy(surface.quaternion).multiply(flat);
          mask.position.copy(surface.position);
          masks.add(mask);
        }
        world.createTransformEntity(masks);
        masks.traverse((object) => (object.castShadow = false));
      }
    },
  );
}

// Off for now (12.11): 'looked' — the surface the head points at ("this wall").
// To bring it back, uncomment the blocks marked "Wall 'looked'" and add it here.
export type Wall = 'front' | 'back' | 'left' | 'right' | 'ceiling' | 'floor';

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
 * 'round' a neat portal; 'crack' a long thin fissure; 'breach' a chunk knocked
 * out of the wall; 'burst' a star-shaped impact; 'corner' a piece broken out
 * where the wall meets the ceiling. All but 'round' come out different every time.
 */
export type Opening = 'round' | 'crack' | 'breach' | 'burst' | 'corner';

/**
 * Opens finished portals in the real room and calls `onOpen` once they exist.
 *
 * For each request the host finds the named real surface, picks a free spot
 * on it (away from pictures, windows, the TV and furniture), cuts the hole,
 * draws a glowing rim with the wall's thickness, and paints a sky behind it.
 * `shape` breaks the wall open instead of a neat round portal (see Opening).
 * A request without `sky` continues the previous request's sky, so several
 * openings show one world outside. Skies:
 * 'space' (default), 'nebula', 'clouds', 'sunset', 'storm' or 'aurora'.
 * The game only decides what comes out.
 *
 * 'front' is the wall the seated player faces (-Z), 'left' is -X, 'right' +X.
 */
export function openPortals(
  world: World,
  requests: { wall: Wall; shape?: Opening; color?: number; radius?: number; sky?: Sky; /** preferred spot on that surface (world) */ at?: Vector3 }[],
  onOpen: (portals: Portal[]) => void,
): void {
  const roomCentre = new Vector3(0, 1.2, 0);
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const up = new Vector3();
  const local = new Vector3();
  let opened = false;
  let waited = 0; // seconds since the first surfaces came

  world.registerSystem(
    class OpenPortals extends createSystem({
      planes: { required: [XRPlane] },
      furniture: { required: [XRMesh], where: [eq(XRMesh, 'isBounded3D', true)] },
    }) {
      update(delta: number, time: number): void {
        skyClock.value = time; // skies move
        if (opened) {
          return;
        }
        const surfaces: Mesh[] = [];
        // Things to keep clear of: [world centre, radius].
        const blocked: [Vector3, number][] = [];
        for (const plane of this.queries.planes.entities) {
          const surface = plane.object3D as Mesh;
          const { width, depth } = (surface.geometry as BoxGeometry).parameters;
          if (isRoomSurface(surface)) {
            surfaces.push(surface);
          } else {
            blocked.push([surface.position, Math.hypot(width, depth) / 2]);
          }
        }
        for (const item of this.queries.furniture.entities) {
          // read through furniture.ts: a real Quest gives the boxes Z-up and one more box, the whole room
          const piece = readFurniture(item);
          if (piece) {
            blocked.push([piece.centre, piece.size.length() / 2]);
          }
        }
        /* Wall 'looked' — off for now.
        // "This wall": the nearest big surface on the line the head looks along.
        const eye = world.camera.getWorldPosition(new Vector3());
        const gaze = world.camera.getWorldDirection(new Vector3());
        let looked: { surface: Mesh; at: Vector3 } | undefined;
        let lookedDistance = Infinity;
        for (const surface of surfaces) {
          up.set(0, 1, 0).applyQuaternion(surface.quaternion);
          const facing = up.dot(gaze);
          const distance = up.dot(local.copy(surface.position).sub(eye)) / facing;
          if (Math.abs(facing) < 1e-3 || distance <= 0 || distance >= lookedDistance) {
            continue;
          }
          const at = eye.clone().addScaledVector(gaze, distance);
          const onSurface = surface.worldToLocal(at.clone());
          const { width, depth } = (surface.geometry as BoxGeometry).parameters;
          if (Math.abs(onSurface.x) <= width / 2 && Math.abs(onSurface.z) <= depth / 2) {
            looked = { surface, at };
            lookedDistance = distance;
          }
        }
        */
        const named = (wall: Wall) =>
          // wall === 'looked' ? looked?.surface : // Wall 'looked' — off for now.
          surfaces.find((surface) => {
            up.set(0, 1, 0).applyQuaternion(surface.quaternion);
            const p = surface.position;
            if (Math.abs(up.y) > 0.9) {
              return wall === (p.y > 1.8 ? 'ceiling' : 'floor');
            }
            if (Math.abs(up.z) > 0.9) {
              return wall === (p.z < 0 ? 'front' : 'back');
            }
            return wall === (p.x < 0 ? 'left' : 'right');
          });
        if (!surfaces.length) {
          return; // the room is not known yet
        }
        const found = requests.map((request) => named(request.wall));
        const ceiling = named('ceiling');
        waited += delta;
        if ((found.some((surface) => !surface) || !ceiling) && waited < 3) {
          return; // the rest of the room may still be coming in
        }
        // After 3 s, what there is: a wall the room has not got gives way to another wall not
        // taken yet (a real scan may miss a wall or the ceiling; waiting for it hung the game).
        for (let index = 0; index < found.length; index++) {
          found[index] ??=
            surfaces.find((surface) => Math.abs(up.set(0, 1, 0).applyQuaternion(surface.quaternion).y) < 0.3 && !found.includes(surface)) ??
            surfaces.find((surface) => !found.includes(surface)) ??
            surfaces[0];
        }
        const ceilingY = ceiling?.position.y ?? 2.4; // a usual ceiling when the scan has none
        opened = true;

        const holes: Hole[] = [];
        // One world outside: a request without a sky continues the previous
        // one, and the sun hangs in one place for the whole room.
        let sky: Sky = 'space';
        let sunward: Vector3 | undefined;
        const portals: Portal[] = requests.map((request, index) => {
          const surface = found[index]!;
          // No shape asked: a break of its own for every hole, not the same neat circle each time; no size asked: a
          // quarter bigger or smaller (Yury, 18.11: «изломы … зерно случайности, чтобы не одинаковые»). 'round' asked
          // stays round. A corner only where a wall meets the ceiling.
          const breaks: Opening[] = request.wall === 'floor' || request.wall === 'ceiling' ? ['breach', 'burst', 'crack'] : ['breach', 'burst', 'crack', 'corner'];
          const shape = request.shape ?? breaks[Math.floor(Math.random() * breaks.length)];
          const radius = request.radius ?? (shape === 'round' ? 0.35 : 0.6) * (0.75 + Math.random() * 0.5);
          const color = request.color ?? 0x9040ff;
          sky = request.sky ?? sky;
          const { width, depth } = (surface.geometry as BoxGeometry).parameters;
          const normal = up.set(0, 1, 0).applyQuaternion(surface.quaternion).clone();
          if (normal.dot(local.copy(roomCentre).sub(surface.position)) < 0) {
            normal.negate();
          }
          // The surface's flat axes in the world.
          const frame = surface.quaternion.clone().multiply(flat);
          const ex = new Vector3(1, 0, 0).applyQuaternion(frame);
          const ey = new Vector3(0, 1, 0).applyQuaternion(frame);

          if (shape === 'corner') {
            // A piece broken out along the line where this wall meets the ceiling.
            const along = new Vector3().crossVectors(normal, new Vector3(0, 1, 0)).normalize();
            const room = Math.abs(ex.dot(along)) > 0.9 ? width : depth;
            const centre = surface.position
              .clone()
              .setY(ceilingY)
              .addScaledVector(along, (Math.random() - 0.5) * Math.max(0, room - 2 * radius - 0.6));
            const down = new Vector3(0, -1, 0);
            const onWall: Vector3[] = [];
            const onCeiling: Vector3[] = [];
            const steps = 12;
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const bite = Math.sin(Math.PI * t) ** 0.5;
              const at = centre
                .clone()
                .addScaledVector(along, (t * 2 - 1) * radius + (Math.random() - 0.5) * 0.06 * radius);
              onWall.push(at.clone().addScaledVector(down, radius * 0.7 * bite * (0.5 + Math.random())));
              onCeiling.push(at.clone().addScaledVector(normal, radius * 0.6 * bite * (0.5 + Math.random())));
            }
            // Each hole runs a little past the corner; the mask's edge trims it.
            const past = (line: Vector3[], beyond: Vector3) => [
              line[0].clone().addScaledVector(beyond, 0.05),
              ...line,
              line[steps].clone().addScaledVector(beyond, 0.05),
            ];
            holes.push(
              { centre, radius, outline: past(onWall, down.clone().negate()) },
              { centre, radius, outline: past(onCeiling, normal.clone().negate()) },
            );
            drawBreak(world, onWall, false, normal, centre, color);
            drawBreak(world, onCeiling, false, down, centre, color);
            const out = normal.clone().negate().add(new Vector3(0, 1, 0)).normalize();
            sunward ??= normal.clone().negate();
            drawSky(world, centre, normal, radius, sky, sunward);
            drawSky(world, centre, down, radius, sky, sunward);
            blocked.push([centre, radius + 0.3]);
            return { centre, normal: out.clone().negate(), radius, color };
          }

          // What the player would like best: eye-height-and-a-bit on a wall,
          // above the play area on the ceiling, in front of the feet on the floor.
          const ideal = request.at?.clone() ??
            // request.wall === 'looked' ? looked!.at.clone() : // Wall 'looked' — off for now.
            (request.wall === 'ceiling' || request.wall === 'floor'
              ? new Vector3(0, surface.position.y, -1.2)
              : surface.position.clone().setY(1.75));
          let best: Vector3 | undefined;
          let bestScore = Infinity;
          const margin = radius + 0.25;
          for (let x = -width / 2 + margin; x <= width / 2 - margin; x += 0.2) {
            for (let z = -depth / 2 + margin; z <= depth / 2 - margin; z += 0.2) {
              const spot = surface.localToWorld(new Vector3(x, 0, z));
              const isWall = Math.abs(normal.y) < 0.5;
              if (isWall && spot.y < 1.3) {
                continue; // out of a seated player's comfortable view
              }
              const clear = blocked.every(
                ([centre, size]) => spot.distanceTo(centre) > size + radius + 0.1,
              );
              const score = spot.distanceTo(ideal) + (clear ? 0 : 100);
              if (score < bestScore) {
                bestScore = score;
                best = spot;
              }
            }
          }
          const centre = best ?? surface.position.clone();
          blocked.push([centre, radius + 0.3]); // the next portal keeps away
          const portal: Portal = { centre, normal, radius, color };
          if (shape === 'round') {
            holes.push(portal);
            drawRim(world, portal);
          } else {
            const outline = OUTLINES[shape](radius).map((p) =>
              centre.clone().addScaledVector(ex, p.x).addScaledVector(ey, p.y),
            );
            holes.push({ centre, radius, outline });
            drawBreak(world, outline, true, normal, centre, color);
          }
          if (!sunward) {
            lightFromSky(world, sky); // the first sky lights the room's things
          }
          sunward ??= normal.clone().negate();
          drawSky(world, centre, normal, radius, sky, sunward);
          return portal;
        });
        cutHoles(world, holes);
        onOpen(portals);
      }
    },
  );
}

// A glowing rim and the cut edge of the wall.
function drawRim(world: World, { centre, normal, radius, color }: Portal): void {
  const rim = new Group();
  rim.position.copy(centre).addScaledVector(normal, 0.012);
  rim.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal);
  const edge = new Mesh(
    new CylinderGeometry(radius, radius, 0.14, 40, 1, true),
    new MeshBasicMaterial({ color: 0x3a3632, side: BackSide }),
  );
  edge.rotation.x = Math.PI / 2;
  edge.position.z = -0.082;
  rim.add(
    new Mesh(
      new TorusGeometry(radius + 0.015, 0.025, 12, 48),
      new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5 }),
    ),
    edge,
  );
  rim.userData.occlude = false; // the cut edge is inside the real wall
  world.createTransformEntity(rim);
  rim.traverse((object) => (object.castShadow = false));
}

// Outlines of broken openings, around (0, 0), in the surface's flat (x, y).
const OUTLINES = {
  // A wandering fissure, widest in the middle, with side splinters.
  crack(radius: number): Vector2[] {
    const steps = 14;
    const left: Vector2[] = [];
    const right: Vector2[] = [];
    const fat = 0.1 + Math.random() * 0.2;
    const bend = (Math.random() - 0.5) * 0.12 * radius;
    let wander = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const along = (t * 2 - 1) * radius + (Math.random() - 0.5) * 0.04 * radius;
      wander += bend + (Math.random() - 0.5) * 0.14 * radius;
      const width = radius * fat * Math.sin(Math.PI * t) ** 0.7 * (0.5 + Math.random());
      left.push(new Vector2(along, wander + width));
      right.push(new Vector2(along, wander - width));
    }
    const splinter = (edge: Vector2[], side: number) => {
      const i = 3 + Math.floor(Math.random() * (edge.length - 6));
      const v = edge[i];
      const tip = new Vector2(
        v.x + (Math.random() - 0.5) * 0.3 * radius,
        v.y + side * (0.15 + Math.random() * 0.3) * radius,
      );
      edge.splice(i, 1, new Vector2(v.x - 0.03 * radius, v.y), tip, new Vector2(v.x + 0.03 * radius, v.y));
    };
    for (let n = 1 + Math.floor(Math.random() * 4); n > 0; n--) {
      n % 2 ? splinter(left, 1) : splinter(right, -1);
    }
    const turn = Math.random() * Math.PI;
    return [...left, ...right.slice(1, -1).reverse()].map((p) => p.rotateAround(new Vector2(), turn));
  },
  // A chunk knocked out: a lumpy hole with a few sharp teeth.
  breach(radius: number): Vector2[] {
    const count = 20 + Math.floor(Math.random() * 8);
    const lobes = 2 + Math.floor(Math.random() * 3);
    const phase = Math.random() * 6.28;
    const squash = 0.6 + Math.random() * 0.4;
    const turn = Math.random() * Math.PI;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      let reach = 0.55 + 0.15 * Math.sin(angle * lobes + phase) + (Math.random() - 0.5) * 0.2;
      if (Math.random() < 0.2) {
        reach += 0.25; // a tooth
      }
      return new Vector2(Math.cos(angle) * reach * radius, Math.sin(angle) * reach * radius * squash).rotateAround(
        new Vector2(),
        turn,
      );
    });
  },
  // An impact: a small hole with long sharp rays.
  burst(radius: number): Vector2[] {
    const rays = 6 + Math.floor(Math.random() * 5);
    const points: Vector2[] = [];
    for (let i = 0; i < rays; i++) {
      const angle = ((i + (Math.random() - 0.5) * 0.5) / rays) * Math.PI * 2;
      const gap = Math.PI / rays;
      const pit = radius * (0.18 + Math.random() * 0.14);
      const tip = radius * (0.45 + Math.random() * 0.55);
      points.push(
        new Vector2(Math.cos(angle - gap) * pit, Math.sin(angle - gap) * pit),
        new Vector2(Math.cos(angle) * tip, Math.sin(angle) * tip),
      );
    }
    return points;
  },
};

// A band of quads between two lines of points.
function strip(a: Vector3[], b: Vector3[], closed: boolean, tint?: () => number): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < (closed ? a.length : a.length - 1); i++) {
    const j = (i + 1) % a.length;
    const shade = tint?.() ?? 1;
    for (const p of [a[i], b[i], a[j], a[j], b[i], b[j]]) {
      positions.push(p.x, p.y, p.z);
      colors.push(shade, shade, shade);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

// A broken edge on one surface: the wall's thickness, a glow along the break
// and hairline cracks running off. `points` are world points on the surface,
// `normal` looks into the room, `inside` is any point within the hole.
function drawBreak(
  world: World,
  points: Vector3[],
  closed: boolean,
  normal: Vector3,
  inside: Vector3,
  color: number,
): void {
  const count = points.length;
  const turn = new Vector3();
  let winding = 0;
  for (let i = 0; i < count - 1; i++) {
    turn.crossVectors(points[i].clone().sub(inside), points[i + 1].clone().sub(inside));
    winding += turn.dot(normal);
  }
  // For every point, the direction away from the hole along the surface.
  const away = points.map((_, i) => {
    const before = points[closed ? (i + count - 1) % count : Math.max(i - 1, 0)];
    const after = points[closed ? (i + 1) % count : Math.min(i + 1, count - 1)];
    return after.clone().sub(before).cross(normal).normalize().multiplyScalar(Math.sign(winding));
  });
  const line = (grow: number, lift: number) =>
    points.map((p, i) => p.clone().addScaledVector(away[i], grow).addScaledVector(normal, lift));
  const glow = (from: number, to: number, opacity: number) =>
    new Mesh(
      strip(line(from, 0.004), line(to, 0.004), closed),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
  const broken = new Group();
  broken.add(
    new Mesh(
      strip(line(0, 0), line(0, -0.14), closed, () => 0.5 + Math.random() * 0.8),
      new MeshBasicMaterial({ color: 0x2e2925, vertexColors: true, side: DoubleSide }),
    ),
    glow(0, 0.015, 1),
    glow(0.015, 0.07, 0.3),
  );
  const dark = new MeshBasicMaterial({ color: 0x14110e, side: DoubleSide });
  for (let k = 0; k < 4 + count / 4; k++) {
    const i = Math.floor(Math.random() * count);
    const at = points[i].clone().addScaledVector(normal, 0.003);
    const heading = away[i].clone();
    const a: Vector3[] = [];
    const b: Vector3[] = [];
    const segments = 3 + Math.floor(Math.random() * 4);
    for (let n = 0; n <= segments; n++) {
      const side = turn.crossVectors(heading, normal).multiplyScalar(0.004 * (1 - n / segments));
      a.push(at.clone().add(side));
      b.push(at.clone().sub(side));
      heading.applyAxisAngle(normal, (Math.random() - 0.5) * 1.2);
      at.addScaledVector(heading, 0.04 + Math.random() * 0.07);
    }
    broken.add(new Mesh(strip(a, b, false), dark));
  }
  broken.userData.occlude = false; // the broken edge is inside the real wall
  world.createTransformEntity(broken);
  broken.traverse((object) => (object.castShadow = false));
}

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
  nebula?: { colors: [number, number]; amount?: number };
  /** A sun, moon or planet seen straight through the portal. height: -0.2 (below the horizon) .. 1 (overhead); size: 1 = our sun, 6 = a huge planet. */
  sun?: { color?: number; height?: number; size?: number };
  /** Drifting clouds. cover 0..1 (0.5 scattered, 1 overcast); below: also a sea of clouds under the horizon. */
  clouds?: { color?: number; shadow?: number; cover?: number; below?: boolean };
  /** Water below the horizon, with the sun's path on it. */
  sea?: number;
  /** Land outside at the level of the real floor, in two colours: grass and earth, sand and rock, snow and ice. */
  ground?: [number, number];
  /** Dark shapes along the horizon. */
  skyline?: { kind: 'mountains' | 'forest' | 'city'; color?: number };
  /** Northern lights: colour near the horizon and colour high up. */
  aurora?: [low: number, high: number];
  /** Flashes of lightning of this colour. */
  lightning?: number;
  /** How fast everything moves (default 1). */
  speed?: number;
  /**
   * A photo of a real sky: an equirectangular JPG from `node tools/textures.mjs sky`.
   * It replaces the painted sky; `colors` (given with it) still light the game's things.
   */
  panorama?: string;
}

/** Ready skies. Use by name, or spread one and change a layer: `{ ...SKY.sunset, sea: 0x400000 }`. */
export const SKY = {
  space: {
    colors: [0x010208, 0x050816, 0x010206],
    stars: 1,
    nebula: { colors: [0x3b2d82, 0xc98a5b], amount: 0.38 },
  },
  nebula: {
    colors: [0x04010d, 0x0b031c, 0x03010a],
    stars: 0.75,
    nebula: { colors: [0xb81d88, 0x18a8f0], amount: 1 },
  },
  clouds: {
    colors: [0x1b58c8, 0xc2e2ff, 0x7cb2e8],
    sun: { color: 0xfff2d6, height: 0.45 },
    clouds: { color: 0xffffff, shadow: 0x6f86b5, cover: 0.5, below: true },
  },
  sunset: {
    colors: [0x16144a, 0xff6a1a, 0x080a1f],
    sun: { color: 0xffb868, height: 0.085, size: 1.15 },
    clouds: { color: 0x8c3b58, shadow: 0x261024, cover: 0.48 },
    sea: 0x070b22,
  },
  storm: {
    colors: [0x080b12, 0x1c2432, 0x090c13],
    clouds: { color: 0x6d7b99, shadow: 0x070910, cover: 1, below: true },
    lightning: 0xb8ccff,
    speed: 1.8,
  },
  meadow: {
    colors: [0x2266d4, 0xcce6ff, 0x4f9a35],
    sun: { color: 0xfff3d6, height: 0.48 },
    clouds: { color: 0xffffff, shadow: 0x8298c2, cover: 0.44 },
    ground: [0x4b9932, 0x786c38],
    skyline: { kind: 'forest', color: 0x1b4522 },
  },
  city: {
    colors: [0x040716, 0x3b2452, 0x12131a],
    stars: 0.55,
    sun: { color: 0xeaf0ff, height: 0.4, size: 1.55 },
    ground: [0x12141c, 0x1e212b],
    skyline: { kind: 'city', color: 0x070910 },
  },
  aurora: {
    colors: [0x01040c, 0x061524, 0x020710],
    stars: 0.75,
    aurora: [0x1aff70, 0x8833f0],
    skyline: { kind: 'mountains', color: 0x060f1a },
    sea: 0x020812,
  },
} satisfies Record<string, SkyRecipe>;

export type Sky = keyof typeof SKY | SkyRecipe;

/** Time for all skies, in seconds: clouds drift, stars twinkle. */
export const skyClock = { value: 0 };

// Colours go to the screen as written, so undo the renderer's conversion.
const shown = (hex: number) => ({ value: new Color(hex).convertLinearToSRGB() });

/**
 * The sky outside lights the game's things with its own colours: a pistol
 * turns warm at sunset and cold under the northern lights.
 */
export function lightFromSky(world: World, sky: Sky): void {
  const { colors } = typeof sky === 'string' ? SKY[sky] : sky;
  const tone = (hex: number) => [...new Color(hex).toArray(), 1] as [number, number, number, number];
  const level = world.activeLevel.value;
  const light = {
    sky: tone(colors[0]),
    equator: tone(colors[1]),
    ground: tone(colors[2] ?? colors[1]),
    intensity: 0.6,
  };
  if (level.hasComponent(IBLGradient)) {
    level.getVectorView(IBLGradient, 'sky').set(light.sky);
    level.getVectorView(IBLGradient, 'equator').set(light.equator);
    level.getVectorView(IBLGradient, 'ground').set(light.ground);
    level.setValue(IBLGradient, 'intensity', 0.6);
  } else {
    level.addComponent(IBLGradient, light);
  }
}

/** The painted sky itself. `out` points from the room through the portal. */
export function skyMaterial(sky: Sky, out: Vector3): ShaderMaterial {
  const recipe: SkyRecipe = typeof sky === 'string' ? SKY[sky] : sky;
  const { colors, nebula, sun, clouds, aurora, ground, skyline } = recipe;
  // The sun hangs where the portal looks, lifted to its height.
  const flat = new Vector3(out.x, 0, out.z);
  const height = sun?.height ?? 0.3;
  const sunDir =
    flat.length() < 0.1
      ? out.clone().add(new Vector3(0.3, 0, 0.2)).normalize()
      : flat.normalize().multiplyScalar(Math.sqrt(Math.max(0, 1 - height * height))).setY(height);
  const defines: Record<string, boolean> = {};
  for (const layer of ['stars', 'nebula', 'sun', 'clouds', 'sea', 'ground', 'skyline', 'aurora', 'lightning'] as const) {
    if (recipe[layer] !== undefined) {
      defines[layer.toUpperCase()] = true;
    }
  }
  if (skyline) {
    (defines as Record<string, unknown>).KIND = ['mountains', 'forest', 'city'].indexOf(skyline.kind);
  }
  if (clouds?.below) {
    defines.CLOUDS_BELOW = true;
  }
  const panorama = { value: null as Texture | null };
  if (recipe.panorama) {
    defines.PANORAMA = true;
    void AssetManager.loadTexture(recipe.panorama).then((photo) => {
      photo.wrapS = RepeatWrapping; // the seam behind the viewer wraps around
      photo.needsUpdate = true;
      panorama.value = photo;
    });
  }
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    defines,
    uniforms: {
      uTime: skyClock,
      uSpeed: { value: recipe.speed ?? 1 },
      uTop: shown(colors[0]),
      uHorizon: shown(colors[1]),
      uBottom: shown(colors[2] ?? colors[0]),
      uStars: { value: recipe.stars ?? 0 },
      uNebulaA: shown(nebula?.colors[0] ?? 0),
      uNebulaB: shown(nebula?.colors[1] ?? 0),
      uNebula: { value: nebula?.amount ?? 1 },
      uSun: { value: sunDir },
      uSunColor: shown(sun?.color ?? 0xfff0d0),
      uSunSize: { value: sun?.size ?? 1 },
      uCloud: shown(clouds?.color ?? 0xffffff),
      uCloudShadow: shown(clouds?.shadow ?? 0x8094bf),
      uCover: { value: clouds?.cover ?? 0.5 },
      uSea: shown(recipe.sea ?? 0),
      uGroundA: shown(ground?.[0] ?? 0),
      uGroundB: shown(ground?.[1] ?? 0),
      uSkyline: shown(skyline?.color ?? 0x101418),
      uAuroraLow: shown(aurora?.[0] ?? 0),
      uAuroraHigh: shown(aurora?.[1] ?? 0),
      uLightning: shown(recipe.lightning ?? 0),
      uPanorama: panorama,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uSpeed, uStars, uNebula, uSunSize, uCover;
      uniform vec3 uTop, uHorizon, uBottom, uNebulaA, uNebulaB, uSun, uSunColor;
      uniform vec3 uCloud, uCloudShadow, uSea, uAuroraLow, uAuroraHigh, uLightning;
      uniform vec3 uGroundA, uGroundB, uSkyline;
      uniform sampler2D uPanorama;
      varying vec3 vWorld;

      // Orthogonal octave rotations — eliminates axis-aligned grid boxes in FBM
      const mat3 ROT3 = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
      const mat2 ROT2 = mat2(0.80, -0.60, 0.60, 0.80);

      vec3 toLin(vec3 c) {
        c = max(c, 0.0);
        return c * c * (0.76 + 0.24 * c);
      }

      vec3 filmicSrgb(vec3 col, vec2 frag) {
        col = max(col, 0.0);
        float peak = max(col.r, max(col.g, col.b));
        if (peak > 0.72) {
          float mapped = 0.72 + 0.28 * (1.0 - exp(-(peak - 0.72) * 2.1));
          float bleach = smoothstep(0.85, 3.6, peak) * 0.58;
          col = mix(col * (mapped / peak), vec3(mapped), bleach);
        }
        vec3 srgb = pow(max(col, 1e-6), vec3(1.0 / 2.2));
        // Subtle blue-noise-style dither prevents 8-bit banding on dark VR skies
        vec3 p3 = fract(vec3(frag.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        float dither = (fract((p3.x + p3.y) * p3.z) - 0.5) / 255.0;
        return clamp(srgb + dither, 0.0, 1.0);
      }

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float hash13(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.zyx + 31.32);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 hash33(vec3 p3) {
        p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yxz + 33.33);
        return fract((p3.xxy + p3.yxx) * p3.zyx);
      }

      float noise2(vec2 x) {
        vec2 i = floor(x);
        vec2 f = fract(x);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
          mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float noise3(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(
            mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
            mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x),
            u.y
          ),
          mix(
            mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
            mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x),
            u.y
          ),
          u.z
        );
      }

      float fbm2(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p = ROT2 * p * 2.03 + vec2(3.1, 7.4);
          a *= 0.5;
        }
        return v / 0.9375;
      }

      float fbm3(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise3(p);
          p = ROT3 * p * 2.02 + vec3(1.7, 9.2, 4.3);
          a *= 0.5;
        }
        return v / 0.96875;
      }

      #ifdef STARS
      vec3 starLayer(vec3 d, float scale, float thresh, float t, float pxBase, bool hero) {
        vec3 p = d * scale;
        vec3 id = floor(p);
        vec3 rnd = hash33(id);
        if (rnd.x < thresh) return vec3(0.0);
        vec3 offset = (rnd - 0.5) * 0.64;
        vec3 local = fract(p) - 0.5 - offset;
        float dist = length(local);
        // Pinpoint jewel radius with pixel-width floor so VR head rotation never shimmers
        float baseR = hero ? 0.052 : 0.048;
        float rad = max(baseR, pxBase * scale * 0.72);
        float energy = (baseR * baseR) / (rad * rad);
        float core = exp(-dist * dist / (rad * rad * 0.30)) * smoothstep(rad * 1.5, 0.0, dist);
        float twinkle = 0.74 + 0.26 * sin(t * (1.4 + rnd.y * 4.0) + rnd.z * 50.0);
        // Blackbody star temperature: warm K/M gold -> pure A white -> hot O/B icy blue
        vec3 tint = mix(vec3(1.0, 0.58, 0.30), vec3(1.0, 0.98, 0.95), smoothstep(0.0, 0.52, rnd.z));
        tint = mix(tint, vec3(0.56, 0.80, 1.0), smoothstep(0.52, 1.0, rnd.z));
        float mag = pow(max((rnd.x - thresh) / (1.0 - thresh), 0.0), 1.45);
        vec3 outCol = tint * core * twinkle * energy * (0.65 + 3.2 * mag);
        if (hero && rnd.x > 0.965) {
          // Delicate 4-point airy flare on rare magnitude-1 stars
          float crossA = exp(-abs(local.x) * 38.0) * exp(-abs(local.y + local.z * 0.35) * 7.5);
          float crossB = exp(-abs(local.y - local.z * 0.35) * 38.0) * exp(-abs(local.x) * 7.5);
          outCol += tint * (crossA + crossB) * smoothstep(0.36, 0.0, dist) * mag * 1.1;
        }
        return outCol;
      }
      #endif

      #ifdef CLOUDS
      float cloudField(vec2 p, float t, float cover, bool detailed) {
        vec2 wind = vec2(t * 0.030, t * 0.012);
        float macro = fbm2(p * 0.62 + wind);
        // Normalized billowy cumulus cauliflower domes
        float billow = 0.0;
        vec2 bp = p * 1.48 + wind * 1.28;
        float amp = 0.5;
        for (int i = 0; i < 3; i++) {
          float n = noise2(bp);
          billow += amp * (1.0 - abs(n * 2.0 - 1.0));
          bp = ROT2 * bp * 2.06 + vec2(2.3, 5.1);
          amp *= 0.5;
        }
        billow /= 0.875;
        float shape = macro * 0.58 + billow * 0.42;
        if (detailed) {
          float wisp = fbm2(p * 3.8 - wind * 1.55);
          shape += (wisp - 0.5) * 0.19;
        }
        float thresh = mix(0.74, 0.24, clamp(cover, 0.0, 1.0));
        return smoothstep(thresh, thresh + mix(0.20, 0.64, cover), shape);
      }
      #endif

      // Evaluates the celestial dome, aurora, volumetric clouds & lightning along ray d.
      // Reused in lightweight isRefl mode so water (SEA) mirrors real clouds, aurora & sun!
      vec3 renderSkyDome(vec3 d, float t, float px, float jitter, bool isRefl) {
        vec3 topL = toLin(uTop);
        vec3 horL = toLin(uHorizon);
        vec3 botL = toLin(uBottom);

        // Balanced atmospheric optical-depth gradient: rich zenith vault + luminous horizon belt
        float elev = abs(d.y);
        float airCurve = pow(clamp(elev * 1.85, 0.0, 1.0), 0.62);
        vec3 col = mix(horL, d.y >= 0.0 ? topL : botL, airCurve);

        vec3 lightDir = normalize(vec3(uSun.x, max(uSun.y, 0.35), uSun.z));
        vec3 lightCol = mix(horL, vec3(0.9, 0.94, 1.0), 0.5);
        float sunDot = 0.0;
        float sunPos = 0.0;
        float dayLum = dot(topL + horL, vec3(0.25));

        #ifdef SUN
          lightDir = uSun;
          lightCol = toLin(uSunColor);
          sunDot = dot(d, uSun);
          sunPos = max(sunDot, 0.0);
          bool isNightBody = (uSunSize > 1.25 && dayLum < 0.16);
          if (!isNightBody) {
            // Azimuthal sunset glow & warm horizon scattering belt
            vec2 flatD = d.xz / max(length(d.xz), 1e-4);
            vec2 flatS = uSun.xz / max(length(uSun.xz), 1e-4);
            float azim = max(dot(flatD, flatS), 0.0);
            float lowSun = 1.0 - smoothstep(0.04, 0.42, uSun.y);
            float horBand = exp(-abs(d.y) * 7.5);
            col += lightCol * pow(azim, 3.2) * horBand * (0.14 + 0.42 * lowSun);
            // Clean-air Mie solar aureole
            col += lightCol * pow(sunPos, 9.0) * (0.12 + 0.18 * lowSun);
          }
        #endif

        float dustMask = 0.0;
        float galGlow = 0.0;
        #ifdef NEBULA
          vec3 nebAL = toLin(uNebulaA);
          vec3 nebBL = toLin(uNebulaB);
          // Tilted galactic coordinate frame: sweeps diagonally across the portal view
          vec3 gDir = normalize(vec3(
            d.x * 0.80 - d.y * 0.50 - d.z * 0.33,
            d.x * 0.52 + d.y * 0.85 + d.z * 0.08,
            d.x * 0.29 - d.y * 0.18 + d.z * 0.94
          ));
          float warpBand = (fbm3(gDir * 2.4) - 0.5) * 0.28;
          float galBand = mix(exp(-abs(gDir.y + warpBand) * 4.4), 1.0, smoothstep(0.42, 0.92, uNebula));
          galGlow = galBand;

          vec3 q = ROT3 * gDir * 2.05;
          vec3 warp = vec3(
            fbm3(q + vec3(t * 0.006, -t * 0.004, 0.0)),
            fbm3(q * 1.15 + vec3(5.2, 1.4, -t * 0.005)),
            isRefl ? 0.5 : fbm3(q * 0.94 + vec3(11.3, 7.1, t * 0.004))
          ) - 0.5;

          // Multi-layered domain-warped cosmic emission clouds (no cellular worm outlines!)
          float gasA = fbm3(q * 1.45 + warp * 2.15);
          float gasB = fbm3(q * 1.95 - warp * 1.65 + vec3(6.4, 2.8, 9.1));
          float wisps = isRefl ? gasA : fbm3(q * 3.6 + warp * 2.6 + vec3(3.1, 8.4, 1.9));

          float low = mix(0.56, 0.34, uNebula);
          float emitA = smoothstep(low, low + 0.36, gasA * 0.72 + wisps * 0.28) * galBand;
          float emitB = smoothstep(low + 0.04, low + 0.38, gasB * 0.74 + wisps * 0.26) * galBand;
          float coreGlow = pow(max(smoothstep(low + 0.12, low + 0.42, (gasA + gasB) * 0.52), 0.0), 2.4) * galBand;

          float nebStrength = min(1.0, uNebula * 1.25);
          col += (nebAL * emitA * 0.95 + nebBL * emitB * 0.85) * nebStrength;
          col += mix(nebAL + nebBL, vec3(1.0, 0.84, 0.68), 0.45) * coreGlow * uNebula * 0.95;

          // Dark Great-Rift / Bok-globule molecular dust lanes carving natural cosmic depth
          float riftSpine = mix(exp(-abs(gDir.y + warpBand * 0.6) * 8.5), 1.0, smoothstep(0.45, 0.95, uNebula));
          dustMask = smoothstep(0.46, 0.74, fbm3(q * 2.7 + warp * 1.3 + vec3(18.7, 4.2, 8.9))) * riftSpine * nebStrength;
          col *= 1.0 - dustMask * 0.84;
        #endif

        #ifdef STARS
          if (!isRefl) {
            float skyLum = dot(col, vec3(0.2126, 0.7152, 0.0722));
            float nightVis = 1.0 / (1.0 + skyLum * 7.5);
            vec3 st = starLayer(d, 54.0, 0.86, t, px, true) * 1.35
                    + starLayer(ROT3 * d, 112.0, 0.84, t, px, false) * 0.48
                    + starLayer(ROT3 * (ROT3 * d), 196.0, 0.81, t, px, false) * 0.26;
            // Subtle unresolved Milky Way star-dust concentrated along galactic band
            float mwBoost = 1.0 + galGlow * 1.15;
            float starDust = pow(max(noise3(ROT3 * d * 82.0), 0.0), 8.0) * (0.03 + 0.14 * galGlow);
            col += (st * mwBoost + vec3(0.78, 0.86, 1.0) * starDust) * uStars * nightVis * (1.0 - dustMask * 0.72);
          }
        #endif

        #ifdef SUN
          float angR = 0.025 * uSunSize;
          float ang = acos(clamp(sunDot, -1.0, 1.0));
          float aaSun = max(px * 1.15, 0.0014);
          float disc = isRefl ? 0.0 : (1.0 - smoothstep(angR - aaSun, angR + aaSun, ang));
          bool isMoonOrPlanet = (uSunSize > 1.25 && dayLum < 0.16);
          if (isMoonOrPlanet) {
            // Subtle crisp lunar halo that preserves deep velvet night sky
            col += lightCol * pow(sunPos, 48.0 / max(uSunSize, 0.5)) * 0.22
                 + lightCol * pow(sunPos, 10.0) * 0.035;
            if (disc > 0.001) {
              vec3 upRef = abs(uSun.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
              vec3 sRight = normalize(cross(uSun, upRef));
              vec3 sUp = cross(sRight, uSun);
              vec2 dUV = vec2(dot(d, sRight), dot(d, sUp)) / max(angR, 1e-4);
              float zSph = sqrt(max(0.0, 1.0 - dot(dUV, dUV)));
              vec3 sphN = dUV.x * sRight + dUV.y * sUp + zSph * uSun;
              // Realistic lunar maria seas & subtle highland craters on 3D sphere
              float maria = smoothstep(0.42, 0.66, fbm3(sphN * 2.8 + vec3(2.1, 4.7, 1.3)));
              float craters = fbm3(sphN * 9.8);
              float albedo = mix(1.12, 0.54, maria) * (0.86 + 0.26 * craters);
              float limb = 0.68 + 0.32 * pow(zSph, 0.60);
              vec3 moonSurf = lightCol * albedo * limb * 1.18;
              col = mix(col, moonSurf, disc);
            }
          } else {
            // Blazing solar corona + limb-darkened incandescent disc
            col += lightCol * pow(sunPos, 64.0 / max(uSunSize, 0.4)) * 0.95;
            if (disc > 0.001) {
              float zSun = sqrt(max(0.0, 1.0 - min(1.0, (ang * ang) / max(angR * angR, 1e-6))));
              vec3 solarDisc = lightCol * (1.9 + 2.6 * pow(zSun, 0.55));
              col = mix(col, solarDisc, disc);
            }
          }
        #endif

        #ifdef AURORA
          if (d.y > -0.04) {
            vec3 aurLowL = toLin(uAuroraLow);
            vec3 aurHighL = toLin(uAuroraHigh);
            float invY = 1.0 / (max(d.y, 0.0) + 0.13);
            vec3 aurAcc = vec3(0.0);
            for (int i = 0; i < 16; i++) {
              if (isRefl && i >= 6) break;
              // Stochastic per-pixel slice jitter completely eliminates horizontal march banding!
              float fi = isRefl ? (float(i) + 0.5) / 6.0 : (float(i) + jitter) / 16.0;
              float alt = 0.80 + pow(fi, 1.28) * 1.85;
              vec2 ap = d.xz * (alt * invY * 0.42);
              vec2 w = ap + 0.38 * vec2(
                sin(ap.y * 1.65 + t * 0.12) + 0.5 * sin(ap.x * 2.25 - t * 0.08),
                cos(ap.x * 1.45 - t * 0.09) + 0.5 * cos(ap.y * 2.05 + t * 0.07)
              );
              float fold1 = abs(sin(w.y * 2.50 + w.x * 0.85 + 0.55 * sin(w.x * 2.1 - t * 0.14)));
              float fold2 = abs(sin(w.x * 2.05 - w.y * 1.35 - t * 0.10 + 0.55 * cos(w.y * 2.6 + t * 0.11)));
              float ribbon = exp(-fold1 * 6.6) + 0.65 * exp(-fold2 * 7.6);
              // Vertical magnetic-field ray pleats locked along each curtain
              float pleats = 0.55 + 0.45 * sin(w.x * 20.0 + w.y * 15.0 + sin(w.x * 6.5 - t * 0.55) * 2.0 + t * 0.78);
              if (!isRefl) {
                pleats *= 0.62 + 0.38 * noise2(w * 9.0 + vec2(t * 0.32, -t * 0.20));
              }
              float vert = smoothstep(0.0, 0.11, fi) * exp(-fi * 1.75);
              float wisp = ribbon * pleats * vert;
              // Vivid emerald base transitioning into tall royal violet-magenta upper rays
              vec3 cCurtain = mix(aurLowL * 1.55, aurHighL * 1.95, smoothstep(0.10, 0.56, fi));
              cCurtain += vec3(0.95, 0.35, 0.60) * pow(max(ribbon * pleats, 0.0), 3.2) * (1.0 - smoothstep(0.0, 0.18, fi)) * 0.5;
              aurAcc += cCurtain * wisp;
            }
            float stepScale = isRefl ? 0.46 : 0.19;
            float horFade = smoothstep(-0.02, 0.15, d.y);
            col += aurAcc * stepScale * horFade;
            col += mix(aurLowL, aurHighL, 0.35) * exp(-abs(d.y) * 6.5) * 0.08;
          }
        #endif

        // Storm lightning cells anchored around portal outward azimuth so strikes shine right in view
        #ifdef LIGHTNING
          vec3 boltColL = toLin(uLightning);
          vec2 portalXZ = uSun.xz / max(length(uSun.xz), 1e-4);
          float baseAz = atan(portalXZ.y, portalXZ.x);

          float st1 = t * 0.52 + 0.04;
          float id1 = floor(st1);
          float ph1 = fract(st1);
          float flash1 = exp(-ph1 * 11.0) + 0.80 * exp(-max(ph1 - 0.11, 0.0) * 18.0) * step(0.11, ph1);
          float az1 = baseAz + (hash12(vec2(id1, 1.7)) - 0.5) * 0.78;
          vec3 cell1 = normalize(vec3(cos(az1), 0.22, sin(az1)));

          float st2 = t * 0.39 + 0.53;
          float id2 = floor(st2);
          float ph2 = fract(st2);
          float flash2 = exp(-ph2 * 10.0) + 0.70 * exp(-max(ph2 - 0.13, 0.0) * 16.0) * step(0.13, ph2);
          float az2 = baseAz + (hash12(vec2(id2, 5.3)) - 0.5) * 0.92;
          vec3 cell2 = normalize(vec3(cos(az2), 0.26, sin(az2)));

          vec3 stormProbe = normalize(vec3(d.x, abs(d.y) * 0.55 + 0.08, d.z));
          float sheetGlow = pow(max(dot(stormProbe, cell1), 0.0), 4.2) * flash1 * 1.15
                          + pow(max(dot(stormProbe, cell2), 0.0), 3.8) * flash2 * 1.05
                          + (0.10 + 0.06 * sin(t * 2.4)) * pow(max(dot(stormProbe, normalize(vec3(portalXZ.x, 0.28, portalXZ.y))), 0.0), 3.0);
        #endif

        #ifdef CLOUDS
          #ifdef CLOUDS_BELOW
            float cSide = abs(d.y);
          #else
            float cSide = d.y;
          #endif
          if (cSide > 0.002) {
            float shellDist = (sqrt(d.y * d.y + 0.26) - abs(d.y)) / 0.13;
            vec2 cPos = d.xz * shellDist;
            if (d.y < 0.0) {
              // Independent sea-of-clouds deck below the room — zero mirror symmetry!
              cPos = cPos * 0.78 + vec2(43.7, -61.2);
            }
            float dens = cloudField(cPos, t, uCover, !isRefl);
            float cAlpha = smoothstep(0.01, 0.34, dens) * smoothstep(0.004, 0.12, cSide);
            if (cAlpha > 0.002) {
              vec3 cLitL = toLin(uCloud);
              vec3 cShadL = toLin(uCloudShadow);
              // 2-tap directional sun ray-shadowing across cumulus domes
              vec2 lStep = (lightDir.xz / max(length(lightDir.xz), 0.15)) * 0.24;
              float occ1 = cloudField(cPos + lStep * 0.42, t, uCover, false);
              float occ2 = isRefl ? occ1 : cloudField(cPos + lStep * 1.05, t, uCover, false);
              float vertCue = d.y >= 0.0 ? dens * 0.48 : (1.0 - dens) * 0.30;
              float sunTrans = exp(-(occ1 * 1.25 + occ2 * 0.85 + vertCue) * 1.75);

              #ifdef SUN
                float lowTint = 1.0 - smoothstep(0.02, 0.32, uSun.y);
                cLitL = mix(cLitL, lightCol * 1.35, 0.28 + 0.58 * lowTint);
              #endif

              vec3 cBody = mix(cShadL, cLitL, clamp(sunTrans * 1.22, 0.0, 1.0));

              #ifdef SUN
                // Crisp golden-white silver lining on sunlit cloud edges
                float fringe = (1.0 - exp(-dens * 8.0)) * exp(-dens * 2.2);
                float hg = pow(sunPos, 4.5) * 0.55 + pow(sunPos, 24.0) * 1.65;
                cBody += lightCol * hg * (fringe * 1.75 + sunTrans * 0.32);
              #endif

              #ifdef LIGHTNING
                // Translucent storm-cloud crevices blaze from inside during thunderstrikes
                cBody += boltColL * sheetGlow * (0.28 + 1.85 * exp(-dens * 2.3));
              #endif

              float distHaze = exp(-abs(d.y) * 10.5) * 0.65;
              cBody = mix(cBody, horL, distHaze);
              col = mix(col, cBody, cAlpha);
            }
          }
          #ifdef CLOUDS_BELOW
            col = mix(col, horL, exp(-abs(d.y) * 26.0) * 0.52);
          #endif
        #endif

        #ifdef LIGHTNING
          col += boltColL * sheetGlow * 0.20;
          // Active forked plasma bolt (picks whichever cell is currently striking!)
          bool useCell1 = flash1 >= flash2;
          float bFlash = useCell1 ? flash1 : flash2;
          vec3 bCell = useCell1 ? cell1 : cell2;
          float bSeed = useCell1 ? id1 * 7.3 : id2 * 11.9 + 3.7;
          if (!isRefl && d.y > -0.02 && bFlash > 0.14) {
            vec3 bRight = normalize(cross(vec3(0.0, 1.0, 0.0), bCell));
            float bx = dot(d, bRight);
            float by = d.y;
            float fwd = dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(bCell.x, 0.0, bCell.z)));
            if (fwd > 0.70 && by > 0.005 && by < 0.52) {
              float jag = (fbm2(vec2(by * 9.5, bSeed)) - 0.5) * 0.13
                        + (noise2(vec2(by * 34.0, bSeed * 0.7)) - 0.5) * 0.032;
              float trunk = abs(bx - jag);
              float br1 = by < 0.34
                ? abs(bx - (jag + (0.34 - by) * 0.52 + (noise2(vec2(by * 26.0, bSeed + 4.1)) - 0.5) * 0.04))
                : 1.0;
              float br2 = by < 0.25
                ? abs(bx - (jag - (0.25 - by) * 0.58 + (noise2(vec2(by * 29.0, bSeed + 8.3)) - 0.5) * 0.04))
                : 1.0;
              float topTap = smoothstep(0.52, 0.40, by) * smoothstep(0.005, 0.04, by);
              float core = (exp(-trunk * 460.0) + 0.60 * exp(-br1 * 540.0) + 0.50 * exp(-br2 * 580.0)) * topTap;
              float halo = (exp(-trunk * 38.0) + 0.45 * exp(-br1 * 48.0)) * topTap;
              col += (vec3(1.0, 0.98, 1.0) * core * 3.2 + boltColL * halo * 0.95) * bFlash;
            }
          }
        #endif

        return col;
      }

      void main() {
        vec3 d = normalize(vWorld - cameraPosition);
        float px = length(fwidth(d));
        float jitter = hash12(gl_FragCoord.xy);
        float t = uTime * uSpeed;

        vec3 topL = toLin(uTop);
        vec3 horL = toLin(uHorizon);
        vec3 lightDir = normalize(vec3(uSun.x, max(uSun.y, 0.35), uSun.z));
        vec3 lightCol = mix(horL, vec3(0.9, 0.94, 1.0), 0.5);
        float sunPos = 0.0;
        float dayLum = dot(topL + horL, vec3(0.25));
        #ifdef SUN
          lightDir = uSun;
          lightCol = toLin(uSunColor);
          sunPos = max(dot(d, uSun), 0.0);
        #endif

        vec3 col;
        #if defined(SEA) || defined(GROUND)
          if (d.y >= 0.0) {
            col = renderSkyDome(d, t, px, jitter, false);
          } else {
            col = horL;
          }
        #else
          col = renderSkyDome(d, t, px, jitter, false);
        #endif

        #ifdef SEA
          if (d.y < 0.0) {
            vec3 seaDeepL = toLin(uSea);
            float eyeH = max(cameraPosition.y, 1.2);
            float seaDist = eyeH / (-d.y + 0.0012);
            vec2 seaXZ = d.xz * seaDist + cameraPosition.xz * 0.15;
            // Distance LOD keeps horizon clean in VR while preserving crisp foreground wavelets
            float waveLod = 1.0 / (1.0 + seaDist * 0.045);
            vec2 swellA = seaXZ * 0.62 + vec2(t * 0.42, -t * 0.24);
            vec2 swellB = ROT2 * seaXZ * 1.15 + vec2(-t * 0.35, t * 0.52);
            vec2 swellC = ROT2 * (ROT2 * seaXZ) * 2.45 + vec2(t * 0.78, t * 0.48);
            float eps = 0.09;
            float h0 = noise2(swellA) * 0.50 + noise2(swellB) * 0.32 + noise2(swellC) * 0.18 * waveLod;
            float hx = noise2(swellA + vec2(eps, 0.0)) * 0.50 + noise2(swellB + vec2(eps, 0.0)) * 0.32 + noise2(swellC + vec2(eps * 1.6, 0.0)) * 0.18 * waveLod;
            float hz = noise2(swellA + vec2(0.0, eps)) * 0.50 + noise2(swellB + vec2(0.0, eps)) * 0.32 + noise2(swellC + vec2(0.0, eps * 1.6)) * 0.18 * waveLod;
            if (waveLod > 0.12) {
              vec2 rip = seaXZ * 5.2 - vec2(t * 1.15, -t * 0.85);
              h0 += noise2(rip) * 0.10 * waveLod;
              hx += noise2(rip + vec2(eps * 2.4, 0.0)) * 0.10 * waveLod;
              hz += noise2(rip + vec2(0.0, eps * 2.4)) * 0.10 * waveLod;
            }
            float slopeAmp = 0.30 + 0.42 * waveLod;
            vec3 wNorm = normalize(vec3((h0 - hx) * slopeAmp, 1.0, (h0 - hz) * slopeAmp));
            vec3 reflDir = reflect(d, wNorm);
            reflDir.y = max(reflDir.y, 0.012);
            reflDir = normalize(reflDir);

            // True sky reflection (captures sunset clouds, aurora curtains, nebula & lightning!)
            vec3 reflSky = renderSkyDome(reflDir, t, px * 2.0, jitter, true);
            float fresnel = 0.04 + 0.93 * pow(clamp(1.0 - max(dot(-d, wNorm), 0.0), 0.0, 1.0), 4.2);
            vec3 waterBody = seaDeepL * (0.70 + 0.65 * h0) + horL * 0.03;
            col = mix(waterBody, reflSky, fresnel);

            #ifdef SUN
              float specDot = max(dot(reflDir, uSun), 0.0);
              // Dancing diamond sun-sparkles + broken golden wave glints
              float glitter = pow(specDot, 340.0) * 7.5 * (0.35 + 0.65 * waveLod)
                            + pow(specDot, 58.0) * 1.05
                            + pow(specDot, 12.0) * 0.14;
              col += lightCol * glitter;
            #endif

            col = mix(col, horL, exp(d.y * 65.0) * 0.72);
          }
        #endif

        #ifdef GROUND
          if (d.y < 0.0) {
            vec3 gndAL = toLin(uGroundA);
            vec3 gndBL = toLin(uGroundB);
            float eyeH = max(cameraPosition.y, 0.4);
            vec2 land = cameraPosition.xz + d.xz * (eyeH / (-d.y + 0.0008));
            float far = length(land - cameraPosition.xz);
            float detailFade = 1.0 / (1.0 + far * 0.14);

            #if defined(SKYLINE) && KIND == 2
              // Damp urban night plaza / asphalt with rippled rain-puddle reflections
              float pave = fbm2(land * 0.55);
              float grit = mix(0.5, noise2(land * 12.0), detailFade);
              float puddle = smoothstep(0.48, 0.70, fbm2(land * 0.34 + vec2(4.1, 2.7)));
              vec3 soil = mix(gndAL, gndBL, smoothstep(0.35, 0.68, pave)) * (0.82 + 0.36 * grit);
              // Organic asphalt-perturbed reflections of warm city lights & neon
              float rippleAz = (noise2(land * 2.4) - 0.5) * 0.022 + (noise2(land * 7.5) - 0.5) * 0.009 * detailFade;
              float uAz = fract(atan(d.z, d.x) * 0.15915494 + 0.5 + rippleAz);
              float bCol = floor(uAz * 144.0);
              float cityStreak = hash12(vec2(bCol, 7.0)) * step(0.42, hash12(vec2(bCol, 2.0)));
              vec3 neonTint = mix(vec3(1.0, 0.62, 0.22), vec3(0.38, 0.78, 1.0), hash12(vec2(bCol, 11.0)));
              float reflMask = puddle * smoothstep(-0.32, -0.004, d.y) * (0.55 + 0.45 * noise2(land * 4.2));
              soil += neonTint * cityStreak * reflMask * 0.26;
              #ifdef SUN
                vec2 flatD = normalize(d.xz + vec2(rippleAz * 1.8, -rippleAz * 1.8));
                vec2 flatS = uSun.xz / max(length(uSun.xz), 1e-4);
                float moonPath = pow(max(dot(flatD, flatS), 0.0), 48.0);
                soil += lightCol * moonPath * (0.15 + 0.85 * puddle) * smoothstep(-0.36, -0.004, d.y) * 0.28;
              #endif
              vec3 haze = mix(toLin(uSkyline), horL * 0.65, 0.38);
              col = mix(soil, haze, smoothstep(8.0, 75.0, far));
            #else
              // Rolling natural terrain with wind-swept meadow waves, wildflowers & cloud shadows
              float hill0 = fbm2(land * 0.14);
              float hillX = fbm2(land * 0.14 + vec2(0.35, 0.0));
              float hillZ = fbm2(land * 0.14 + vec2(0.0, 0.35));
              vec3 tNorm = normalize(vec3((hill0 - hillX) * 0.68, 1.0, (hill0 - hillZ) * 0.68));
              float slopeLight = clamp(dot(tNorm, lightDir) * 0.85 + 0.48, 0.38, 1.40);

              float blot = fbm2(land * 0.42);
              float breeze = noise2(land * 0.68 - vec2(t * 0.58, t * 0.25));
              float blades = mix(0.5, noise2(land * 9.0) * 0.65 + noise2(land * 28.0) * 0.35, detailFade);
              vec3 soil = mix(gndAL, gndBL, smoothstep(0.42, 0.70, blot));
              soil *= (0.74 + 0.50 * blades) * (0.88 + 0.25 * breeze) * slopeLight;

              // Tiny sunlit golden/white wildflower glints near the player
              float flowers = smoothstep(0.83, 0.94, noise2(land * 16.0 + vec2(3.7, 9.2))) * detailFade;
              soil += mix(vec3(1.0, 0.86, 0.20), vec3(1.0, 0.96, 0.90), blot) * flowers * 0.32;

              #ifdef CLOUDS
                float cShad = cloudField(land * 0.042 + vec2(5.0, -3.0), t, uCover, false);
                soil *= 1.0 - cShad * 0.38;
              #endif

              vec3 haze = horL;
              #ifdef SKYLINE
                haze = mix(toLin(uSkyline) * 1.15, horL, 0.25);
              #endif
              col = mix(soil, haze, smoothstep(14.0, 145.0, far));
            #endif
          }
        #endif

        #ifdef SKYLINE
          float horizLen = max(length(d.xz), 0.001);
          float lift = d.y / horizLen;
          if (lift > -0.022 && lift < 0.36) {
            vec2 dirXZ = d.xz / horizLen;
            // Normalized [0, 1) azimuth — multiplying by exact integers eliminates +/-PI seam!
            float uTurn = atan(d.z, d.x) * 0.159154943 + 0.5;
            float aaLift = max(px / horizLen, 0.0012);
            vec3 skyColL = toLin(uSkyline);
            float baseFade = smoothstep(-0.022, -0.002, lift);

            #if KIND == 0
              // 3-layer alpine mountain ranges with directional ridge shading & snow caps
              float mFar = 0.055 + 0.165 * (1.0 - abs(noise2(dirXZ * 2.8 + vec2(4.2, 1.7)) * 2.0 - 1.0))
                         * (0.55 + 0.65 * fbm2(dirXZ * 5.2));
              float mFarNext = 0.055 + 0.165 * (1.0 - abs(noise2(ROT2 * dirXZ * 2.8 + vec2(4.24, 1.7)) * 2.0 - 1.0));
              float farSlope = clamp(0.5 + (mFar - mFarNext) * 6.0, 0.0, 1.0);
              float covFar = (1.0 - smoothstep(mFar - aaLift * 1.5, mFar + aaLift * 1.5, lift)) * baseFade;
              if (covFar > 0.001) {
                float snow = smoothstep(0.125, 0.185, lift + (fbm2(dirXZ * 18.0) - 0.5) * 0.035);
                vec3 rockFar = mix(skyColL * 1.3, lightCol * 0.45 + skyColL, farSlope * 0.5);
                rockFar = mix(rockFar, mix(vec3(0.52, 0.68, 0.84), lightCol * 0.9, 0.35), snow * 0.70);
                col = mix(col, mix(rockFar, horL, 0.56), covFar);
              }

              float mMid = 0.032 + 0.105 * fbm2(dirXZ * 4.6 + vec2(9.1, 3.4))
                         + 0.032 * (1.0 - abs(noise2(dirXZ * 13.0) * 2.0 - 1.0));
              float covMid = (1.0 - smoothstep(mMid - aaLift, mMid + aaLift, lift)) * baseFade;
              if (covMid > 0.001) {
                vec3 rockMid = skyColL * (0.85 + 0.35 * noise2(vec2(dirXZ.x * 22.0, lift * 45.0)));
                col = mix(col, mix(rockMid, horL, 0.28), covMid);
              }

              float mNear = 0.014 + 0.052 * fbm2(dirXZ * 7.5 + vec2(1.3, 8.2));
              float covNear = (1.0 - smoothstep(mNear - aaLift, mNear + aaLift, lift)) * baseFade;
              col = mix(col, mix(skyColL * 0.78, horL, 0.08), covNear);

            #elif KIND == 1
              // 3-rank organic woodland horizon rooted seamlessly into the distant meadow
              float sunSide = 0.5 + 0.5 * dot(dirXZ, lightDir.xz / max(length(lightDir.xz), 1e-4));

              // Rank 1: Distant rolling forested hills
              float rHills = 0.048 + 0.052 * fbm2(dirXZ * 3.4 + vec2(2.1, 6.7));
              float covHills = (1.0 - smoothstep(rHills - aaLift * 1.4, rHills + aaLift * 1.4, lift)) * baseFade;
              col = mix(col, mix(skyColL * 1.25, horL, 0.58), covHills);

              // Rank 2: Midground mixed canopy with valley mist tucked below
              float nMid = 96.0;
              float idM = mod(floor(uTurn * nMid), nMid);
              float fM = fract(uTurn * nMid) - 0.5;
              float hM = hash12(vec2(idM, 4.1));
              float crownM = sqrt(max(0.0, 0.25 - fM * fM)) * 2.0;
              float rMid = 0.030 + 0.034 * fbm2(dirXZ * 6.2 + vec2(8.3, 1.9)) + 0.024 * crownM * (0.45 + 0.55 * hM);
              float covMid = (1.0 - smoothstep(rMid - aaLift, rMid + aaLift, lift)) * baseFade;
              if (covMid > 0.001) {
                vec3 midFoliage = skyColL * (0.95 + 0.48 * sunSide * smoothstep(rMid - 0.025, rMid, lift));
                float valleyMist = exp(-max(lift - 0.008, 0.0) * 52.0) * 0.28;
                col = mix(col, mix(midFoliage, horL, 0.26 + valleyMist), covMid);
              }

              // Rank 3: Foreground irregular spruce spires & lush crowns (zero sawtooth!)
              float nFg = 132.0;
              float uFg = uTurn * nFg;
              float idF = mod(floor(uFg), nFg);
              float hF = hash12(vec2(idF, 1.3));
              float hF2 = hash12(vec2(idF, 7.9));
              float localX = (fract(uFg) - 0.5) / (0.68 + 0.58 * hF2);
              float spire = max(0.0, 1.0 - abs(localX) * 2.0);
              spire = mix(spire, sqrt(max(0.0, 1.0 - localX * localX * 3.0)), step(0.58, hF2));
              float rFg = 0.018 + 0.024 * fbm2(dirXZ * 9.5) + (0.020 + 0.042 * pow(hF, 1.5)) * spire * step(0.14, hF);
              float covFg = (1.0 - smoothstep(rFg - aaLift, rFg + aaLift, lift)) * baseFade;
              if (covFg > 0.001) {
                float canopyTex = noise2(vec2(uTurn * 420.0, lift * 190.0));
                float rimSun = smoothstep(rFg - 0.018, rFg, lift) * sunSide;
                vec3 fgTree = skyColL * (0.72 + 0.42 * canopyTex) + lightCol * rimSun * 0.08;
                col = mix(col, mix(fgTree, horL, 0.07), covFg);
              }

            #else
              // 3-tier metropolitan night skyline + warm street glow + anti-aliased window grids
              float cityBase = smoothstep(-0.005, 0.002, lift);
              col += vec3(0.22, 0.10, 0.045) * exp(-max(lift, 0.0) * 16.0) * cityBase;

              for (int tier = 0; tier < 3; tier++) {
                float cells = tier == 0 ? 340.0 : (tier == 1 ? 236.0 : 164.0);
                float seed = float(tier) * 19.7 + 3.1;
                float uB = uTurn * cells;
                float bId = mod(floor(uB), cells);
                float bx = fract(uB);
                float hRand = hash12(vec2(bId, seed));
                float present = step(tier == 0 ? 0.18 : (tier == 1 ? 0.28 : 0.36), hash12(vec2(bId, seed + 4.3)));
                float maxH = tier == 0 ? 0.13 : (tier == 1 ? 0.175 : 0.215);
                float bHeight = (0.018 + maxH * pow(hRand, 2.1)) * present;

                float style = hash12(vec2(bId, seed + 8.7));
                float halfW = 0.44 - 0.08 * style;
                if (style > 0.65 && lift > bHeight * 0.72) {
                  halfW *= 0.68;
                }
                float inWidth = 1.0 - smoothstep(halfW - 0.06, halfW + 0.03, abs(bx - 0.5));
                float spireH = (style > 0.78 && present > 0.5) ? bHeight + 0.032 * style : 0.0;
                float inSpire = (1.0 - smoothstep(0.025, 0.06, abs(bx - 0.5))) * step(lift, spireH) * step(bHeight, lift);

                float covB = ((1.0 - smoothstep(bHeight - aaLift, bHeight + aaLift, lift)) * inWidth + inSpire) * cityBase;
                covB = clamp(covB, 0.0, 1.0);

                if (covB > 0.002) {
                  float hazeAmt = tier == 0 ? 0.55 : (tier == 1 ? 0.28 : 0.09);
                  vec3 facade = mix(skyColL * (0.9 + 0.4 * style), horL * 0.50, hazeAmt);
                  facade += horL * 0.16 * smoothstep(bHeight - 0.03, bHeight, lift);

                  if (lift < bHeight - 0.003 && inWidth > 0.5) {
                    float wCols = tier == 0 ? 3.0 : (tier == 1 ? 5.0 : 6.0);
                    float wRows = tier == 0 ? 280.0 : (tier == 1 ? 240.0 : 200.0);
                    vec2 wCoord = vec2(bx * wCols, lift * wRows);
                    vec2 wCell = floor(wCoord);
                    vec2 wFrac = fract(wCoord);
                    float winLod = clamp(1.0 - px * wRows * 0.55, 0.15, 1.0);
                    float paneMask = smoothstep(0.14, 0.28, wFrac.x) * (1.0 - smoothstep(0.76, 0.90, wFrac.x))
                                   * smoothstep(0.18, 0.34, wFrac.y) * (1.0 - smoothstep(0.74, 0.90, wFrac.y));
                    paneMask = mix(0.35, paneMask, winLod);

                    float floorOn = step(0.32, hash12(vec2(bId * 13.0 + wCell.y, seed + 1.9)));
                    float roomOn = step(0.46, hash12(wCell + vec2(bId * 7.0, seed + 5.5)));
                    float wTemp = hash12(wCell + vec2(bId * 3.0, 9.2));
                    vec3 winCol = mix(vec3(1.0, 0.64, 0.24), vec3(1.0, 0.90, 0.68), smoothstep(0.0, 0.65, wTemp));
                    winCol = mix(winCol, vec3(0.42, 0.80, 1.0), smoothstep(0.72, 1.0, wTemp));
                    float winVis = floorOn * roomOn * paneMask * (tier == 0 ? 0.38 : (tier == 1 ? 0.72 : 1.0));
                    facade += winCol * winVis * (0.55 + 0.65 * hash12(wCell + 2.1));
                  }

                  if (tier == 2 && spireH > 0.14 && abs(lift - spireH) < 0.004 && abs(bx - 0.5) < 0.08) {
                    float blink = 0.35 + 0.65 * smoothstep(0.2, 0.8, sin(t * 2.6 + bId * 1.9));
                    facade += vec3(1.4, 0.08, 0.05) * blink;
                  }

                  col = mix(col, facade, covB);
                }
              }
            #endif
          }
        #endif

        // Gentle daytime sun glare wrap across foreground silhouettes (skipped for night moon)
        #ifdef SUN
          if (!(uSunSize > 1.25 && dayLum < 0.16)) {
            col += lightCol * pow(sunPos, 7.0) * 0.05;
          }
        #endif

        #ifdef PANORAMA
          // A photo of a real sky replaces the painted one. The second set of
          // coordinates hides the seam where the picture's edges meet.
          vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
          vec2 uvSeam = vec2(fract(uv.x + 0.5), uv.y);
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          vec2 dxSeam = dFdx(uvSeam), dySeam = dFdy(uvSeam);
          if (abs(dx.x) + abs(dy.x) > abs(dxSeam.x) + abs(dySeam.x)) {
            dx = dxSeam;
            dy = dySeam;
          }
          col = toLin(textureGrad(uPanorama, uv, dx, dy).rgb);
        #endif

        gl_FragColor = vec4(filmicSrgb(col, gl_FragCoord.xy), 1.0);
      }`,
  });
}

// The sky behind one portal: a small bowl inside the real wall, closing the
// hole from behind. It is painted by direction, so its size does not show; it
// writes no depth, so whatever waits behind it is drawn over the sky.
function drawSky(
  world: World,
  centre: Vector3,
  normal: Vector3,
  radius: number,
  sky: Sky,
  out: Vector3,
): void {
  const dome = new Mesh(
    new SphereGeometry(radius + 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    skyMaterial(sky, out),
  );
  dome.renderOrder = -5; // after the wall masks, before everything else
  dome.position.copy(centre).addScaledVector(normal, -0.03); // its rim stays inside the wall
  dome.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), normal.clone().negate());
  dome.userData.occlude = false;
  world.createTransformEntity(dome);
  dome.castShadow = false;
}
