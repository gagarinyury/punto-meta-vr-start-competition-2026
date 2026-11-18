import { type BoxGeometry, type Entity, type Mesh, Quaternion, Vector3, XRMesh } from '@iwsdk/core';

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

const axis = new Vector3();

/**
 * Reads a detected XRMesh as furniture, or returns undefined for the mesh of
 * the whole room.
 *
 * Devices disagree. The emulator gives a box centred on its origin with local
 * Y up and dimensions [width, height, depth]. A real Quest gives the origin on
 * the top face, local Z up and dimensions [x, y, height] — and one more "mesh"
 * that is the whole room. Everything in the host goes through this function.
 */
export function readFurniture(entity: Entity): Furniture | undefined {
  const body = entity.object3D;
  if (!body || !entity.getValue(XRMesh, 'isBounded3D')) {
    return undefined;
  }
  const raw = entity.getVectorView(XRMesh, 'dimensions');
  const zUp = Math.abs(axis.set(0, 0, 1).applyQuaternion(body.quaternion).y) > 0.9;
  const size = zUp ? new Vector3(raw[0], raw[2], raw[1]) : new Vector3(raw[0], raw[1], raw[2]);
  if (size.x * size.z > 9 || (size.x > 3 && size.z > 3)) {
    return undefined; // nothing in a home is this big: it is the room itself
  }
  // The box's own x, flattened: the turn around the vertical.
  axis.set(1, 0, 0).applyQuaternion(body.quaternion);
  const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-axis.z, axis.x));
  const centre = body.position.clone();
  if (zUp) {
    centre.y -= size.y / 2; // the origin is on the top face
  }
  return {
    label: String(entity.getValue(XRMesh, 'semanticLabel') || 'other'),
    centre,
    quaternion,
    size,
    top: centre.y + size.y / 2,
  };
}

/**
 * Is this detected plane a part of the room itself — the floor, the ceiling or
 * a wall — and not a table top, a picture or a window?
 *
 * A real room's walls come in pieces (around a door, a niche), some of them
 * narrow, so size alone does not tell: a wall is any upright plane at least
 * two metres tall or long.
 */
export function isRoomSurface(plane: Mesh): boolean {
  const { width, depth } = (plane.geometry as BoxGeometry).parameters;
  const level = Math.abs(axis.set(0, 1, 0).applyQuaternion(plane.quaternion).y) > 0.9;
  return level ? width * depth >= 6 : Math.max(width, depth) >= 2 && Math.min(width, depth) >= 0.15;
}
