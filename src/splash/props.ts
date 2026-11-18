// The front page's own prop (Yury, 15.11): Punto himself as a cyan wire model, as the splash art draws him
// (research/concepts/title/splash-concept.jpeg). The other props are the showcase models of src/splash/models/.
import { AdditiveBlending, EdgesGeometry, Group, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { createPunto } from '../helper.js';

/**
 * The real model of src/helper.ts, every solid part drawn by its edges, without the hands and the power button
 * (the art draws him without hands; the gloves and the button, dense round parts, came out solid white). Only
 * edges where the surface turns more than a degree are drawn, so a smooth loft reads as a grid of quads, not of
 * triangles. No face, no glow sprites, no particles. Origin: his own (the head's middle), +Z his front; his size
 * as drawn (15 cm tall): scale it.
 */
export function wirePunto(): Group {
  const punto = createPunto();
  punto.object.updateMatrixWorld(true);
  const g = new Group();
  g.name = 'WirePunto';
  const line = new LineBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const shown = (o: Object3D) => {
    for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible || p.name.startsWith('PuntoHand') || p.name === 'PuntoPower') return false;
    return true;
  };
  punto.object.traverse((o) => {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh || !shown(o)) return;
    const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as MeshStandardMaterial;
    if (mat.transparent || mat.map) return; // the face's screen and glows are pictures, not shapes
    const edges = new EdgesGeometry(o.geometry, 1);
    edges.applyMatrix4(o.matrixWorld);
    const part = new LineSegments(edges, line);
    part.name = o.name || 'Part';
    g.add(part);
  });
  return g;
}
