import {
  createSystem,
  type Entity,
  eq,
  Group,
  Matrix4,
  Vector3,
  type World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { glowTable, pickTable, type Table, tableOfRequest, tableUsed } from './place.js';
import { madeNow, onViewerPage, withGameRandom } from './live.js';

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
  metres: { width: number; depth: number };
}

/**
 * A small world on the player's real table.
 *
 * The game says how big its world is in its own units (say 12 x 8). The host
 * finds the real table nearest to the player (in front rather than behind), puts a board on its top, turns
 * it to face the player and shrinks it to fit. With no table (or
 * `on: 'floor'`) the board lies on the floor a step in front of the player.
 *
 * Inside the board: the centre of the play area is (0, 0, 0), +x is to the
 * player's right, +y is up, +z is towards the player. Sizes and positions are
 * in game units; the board's scale does the rest. Move things by code — no
 * physics bodies inside a board.
 */
export function tabletop(
  world: World,
  { width, depth, on = 'table', fill = false }: { width: number; depth: number; on?: 'table' | 'floor'; fill?: boolean },
  onReady: (board: Board) => void,
): void {
  const up = new Vector3(0, 1, 0);
  let waited = 0;
  let done = false;

  world.registerSystem(
    class Tabletop extends createSystem({
      planes: { required: [XRPlane] },
      furniture: { required: [XRMesh], where: [eq(XRMesh, 'isBounded3D', true)] },
    }) {
      update(delta: number): void {
        // the room is not known yet; the viewer page (research/stands/view.html) has none and never will, so there
        // the board goes on the floor in front of the camera (16.11: tanks and minecraft showed nothing)
        if (done || (this.queries.planes.entities.size === 0 && !onViewerPage())) {
          return;
        }
        waited += delta;
        const player = world.camera.getWorldPosition(new Vector3()).setY(0);
        const ahead = world.camera.getWorldDirection(new Vector3()).setY(0).normalize();
        // the table the player looked at when they asked (src/place.ts): every table of the room counts the same
        let table: Table | undefined;
        if (on === 'table') {
          // the one chosen for this request ("on the other table"), or the one looked at
          table = tableOfRequest() ?? pickTable(world, this.queries.planes.entities, this.queries.furniture.entities);
          if (!table && waited < 1.5) {
            return; // furniture may arrive a moment after the walls
          }
        }
        done = true;

        const centre = new Vector3();
        const towards = new Vector3();
        let room = new Vector3(1.2, 0, 1.2); // free floor: width, -, depth
        const board = new Group();
        if (table) {
          // 2 cm over the top found: the real top wobbles a centimetre or two, and at 2 mm a village's ground sank into
          // the table and flickered against it (18.11) — as everything on a real surface stands off it
          centre.copy(table.centre).addScaledVector(up, 0.02);
          board.quaternion.copy(table.facing);
          room = new Vector3(table.width, 0, table.depth);
          tableUsed(table); // "on the other table" goes on to one it has not stood on
          // the table lights up along its edges as the board comes: the room is felt (Yury, 17.11)
          glowTable(world, table, 2.5);
        } else {
          centre.copy(player).addScaledVector(ahead, 1.1).setY(0.002);
          towards.copy(ahead).negate();
          board.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3().crossVectors(up, towards), up, towards));
        }
        const unit = Math.min((room.x * (fill ? 0.96 : 0.9)) / width, (room.z * (fill ? 0.96 : 0.9)) / depth);
        // fill: the whole table top, edge to edge (2 cm in) — the world gets the table's own proportions, so one
        // of its sides comes out longer than asked
        const across = fill ? (room.x * 0.96) / unit : width;
        const along = fill ? (room.z * 0.96) / unit : depth;
        board.position.copy(centre);
        board.scale.setScalar(unit);
        // the game builds on its board now: the same random numbers for every player (src/live.ts)
        const root = world.createTransformEntity(board);
        withGameRandom(`${madeNow().pop() ?? ''}:board`, () => onReady({ root, width: across, depth: along, unit, onTable: !!table, metres: { width: room.x, depth: room.z } }));
      }
    },
  );
}
