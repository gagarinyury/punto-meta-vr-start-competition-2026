// The splash art's «digital copies» (Yury, 15.11): a thing drawn again as a glowing wire grid with a faint glassy
// fill — a shadow of the real one, the thing before it is built. wireCopy() turns any showcase model into one:
// every mesh keeps its form as a barely-there additive fill, and its facet edges become glowing lines.
import { AdditiveBlending, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from '@iwsdk/core';

/** A copy of root (a fresh build is best: geometry is shared, not copied) as a wire hologram of colour. */
export function wireCopy(root: Object3D, color: number, opacity = 0.85): Object3D {
  const line = new LineBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const fill = new MeshBasicMaterial({ color, transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const meshes: Mesh[] = [];
  root.traverse((o) => { if (o instanceof Mesh) meshes.push(o); else if (o instanceof LineSegments) o.material = line; });
  for (const m of meshes) {
    const edges = new EdgesGeometry(m.geometry, 12);
    let wire: LineSegments;
    if (m instanceof InstancedMesh) {
      // one set of lines for all the instances: the edges moved by each instance's matrix
      const src = edges.getAttribute('position'), out: number[] = [], mat = new Matrix4(), v = new Vector3();
      for (let k = 0; k < m.count; k++) {
        m.getMatrixAt(k, mat);
        for (let i = 0; i < src.count; i++) { v.fromBufferAttribute(src, i).applyMatrix4(mat); out.push(v.x, v.y, v.z); }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(out, 3));
      wire = new LineSegments(geo, line);
    } else wire = new LineSegments(edges, line);
    wire.name = `${m.name}Wire`;
    m.material = fill;
    m.add(wire);
  }
  root.userData.wire = true;
  return root;
}

/** A group to hold the copy (so the caller can treat it as any built model). */
export const asGroup = (o: Object3D): Group => { if (o instanceof Group) return o; const g = new Group(); g.add(o); return g; };
