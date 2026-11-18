// The one way to make the left side of a model from its right side (14.11: a ship's left tail fin built with a
// mirrored geometry AND a hand-mirrored orientBasis ended up under the nose — mirrored twice). Not part of Meta's
// hardsurface library; built on its mirrorGeometryX.
import { Group, Mesh, Object3D } from '@iwsdk/core';
import { mirrorGeometryX } from './hardsurface.js';

const leftName = (name: string): string =>
  name
    .replace(/_R(?=$|_)/g, '_L')
    .replace(/Right/g, 'Left')
    .replace(/right/g, 'left');

/**
 * A mirrored copy of `part` across the model's centre plane (x = 0 of the part's parent), with its whole
 * hierarchy: every position, rotation and geometry is reflected, pivots stay where they belong, materials are
 * shared, names ending in _R / Right become _L / Left. Add the result to the same parent as `part`.
 * Never mirror a rotation by hand and never mirrorGeometryX a part that is turned — use this.
 */
export function mirrorPartX<T extends Object3D>(part: T): T {
  const copy = (node: Object3D): Object3D => {
    let out: Object3D;
    if ((node as Mesh).isMesh) {
      const mesh = node as Mesh;
      out = new Mesh(mirrorGeometryX(mesh.geometry), mesh.material);
    } else {
      out = new Group();
    }
    out.name = leftName(node.name);
    // reflection S = diag(-1, 1, 1): a node's transform T becomes S·T·S, its geometry S·G
    out.position.set(-node.position.x, node.position.y, node.position.z);
    out.quaternion.set(node.quaternion.x, -node.quaternion.y, -node.quaternion.z, node.quaternion.w);
    out.scale.copy(node.scale);
    out.visible = node.visible;
    for (const child of node.children) out.add(copy(child));
    return out;
  };
  return copy(part) as T;
}
