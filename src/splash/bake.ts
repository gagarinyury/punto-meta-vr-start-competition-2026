// The poster's draw calls (18.11, «почему заставка так тормозит»): its models were built part by part — the castle
// 108 meshes, its wire copy 166 (a fill and a line per part) — ~1000 draws a frame where the Quest browser holds
// 72 Hz at ~200. bake() merges what never moves on its own into one mesh (or one set of lines) per material, three's
// mergeGeometries; the parts the models' idle() moves by name stay their own objects.
import { BufferGeometry, LineSegments, Material, Matrix4, Mesh, Object3D } from '@iwsdk/core';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Moved as a whole by an idle(): kept, what is under it merged into it. */
const WHOLE = new Set(['GearSide', 'GearFront', 'MinuteHand', 'Bolt', 'Charge', 'Planet', 'Trail', 'Ship', 'Arcs', 'Galaxy', 'Motes']);
/** Its children moved one by one by an idle(): each child kept, what is under each merged into it. */
const EACH = new Set(['Signal', 'Cubes', 'Sparkles', 'Pines', 'Clods', 'Bits', 'Beam', 'Embers']);

const plain = (o: Object3D): o is Mesh | LineSegments =>
  ((o as Mesh).isMesh && !(o as { isInstancedMesh?: boolean }).isInstancedMesh && !(o as { isSkinnedMesh?: boolean }).isSkinnedMesh && !Array.isArray((o as Mesh).material)) ||
  ((o as LineSegments).isLineSegments === true);

/**
 * Merges root's still parts. `parts`: its top-level children are kept as they are (each merged inside) — the poster
 * burns a made model in part by part. Hidden things are left alone. Returns the draws before and after.
 */
export function bake(root: Object3D, parts = false, still = false): [number, number] {
  const before = draws(root);
  root.updateWorldMatrix(true, true);
  live = !still;
  looks.clear(); // one model's like materials only: the poster fades one draft or burns one model by its own materials
  if (parts) for (const c of [...root.children]) frame(c);
  else frame(root);
  prune(root);
  return [before, draws(root)];
}

function draws(root: Object3D): number {
  let n = 0;
  root.traverseVisible((o) => { if ((o as Mesh).isMesh || (o as LineSegments).isLineSegments || (o as { isPoints?: boolean }).isPoints) n++; });
  return n;
}

const inv = new Matrix4(), rel = new Matrix4();
/** false: nothing under it is moved by an idle() (a draft: a fresh build only faded in and out) — all of it merged. */
let live = true;

/** Like materials as one (the models make a fresh material per part): the first seen of each look. */
const looks = new Map<string, Material>();
const LOOK = ['type', 'color', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'flatShading', 'vertexColors', 'transparent', 'opacity', 'side', 'blending', 'depthWrite', 'depthTest', 'toneMapped', 'alphaTest', 'wireframe', 'fog', 'visible', 'colorWrite', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'envMapIntensity'];
const MAPS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap', 'envMap'];
const SIMPLE = new Set(['MeshStandardMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'LineBasicMaterial']);
function look(m: Material): Material {
  const r = m as unknown as Record<string, unknown>;
  // a material changed in its shader (the burn, styles) or of a kind not listed: only itself
  if (!SIMPLE.has(m.type) || m.onBeforeCompile !== Material.prototype.onBeforeCompile || m.userData && Object.keys(m.userData).length) return m;
  const key = LOOK.map((k) => { const v = r[k] as { getHex?: () => number } | undefined; return v && typeof v === 'object' && v.getHex ? v.getHex() : v; }).join('|') +
    '|' + MAPS.map((k) => (r[k] as { uuid?: string } | null)?.uuid ?? '').join('|');
  const have = looks.get(key);
  if (have) return have;
  looks.set(key, m);
  return m;
}
const hasMap = (m: Material) => MAPS.some((k) => (m as unknown as Record<string, unknown>)[k]);

/** Merges the still things under f into f; the moving ones are frames of their own. */
function frame(f: Object3D): void {
  const take: (Mesh | LineSegments)[] = [];
  const walk = (o: Object3D) => {
    for (const c of o.children) {
      if (!c.visible) continue;
      if (live && WHOLE.has(c.name)) { frame(c); continue; }
      if (live && EACH.has(c.name)) { for (const k of c.children) frame(k); continue; }
      if (plain(c) && !Object.keys(c.geometry.morphAttributes).length && c.onBeforeRender === Object3D.prototype.onBeforeRender) take.push(c);
      walk(c);
    }
  };
  walk(f);
  // by material, kind and the attributes the geometry has: only like goes with like
  const groups = new Map<string, (Mesh | LineSegments)[]>();
  for (const o of take) {
    const m = look(o.material as Material);
    // what the material reads: no uv without a picture, no colours without vertex colours
    const names = Object.keys(o.geometry.attributes).filter((a) => !(a === 'uv' && !hasMap(m)) && !(a === 'color' && !m.vertexColors)).sort();
    const key = `${m.uuid}|${(o as LineSegments).isLineSegments ? 'L' : 'M'}|${names.join(',')}`;
    const list = groups.get(key);
    if (list) list.push(o); else groups.set(key, [o]);
  }
  inv.copy(f.matrixWorld).invert();
  for (const list of groups.values()) {
    if (list.length < 2) { const o = list[0]; o.material = look(o.material as Material); continue; }
    const m = look(list[0].material as Material);
    const keep = new Set(Object.keys(list[0].geometry.attributes).filter((a) => !(a === 'uv' && !hasMap(m)) && !(a === 'color' && !m.vertexColors)));
    const geos = list.map((o) => {
      // indexed and not mixed: all spelled out (a few thousand vertices more, one draw)
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (g === o.geometry) g = g.clone();
      for (const a of Object.keys(g.attributes)) if (!keep.has(a)) g.deleteAttribute(a);
      g.morphAttributes = {};
      g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      // a mirrored part (negative scale) turns its faces inside out once its matrix is baked in: wound back
      if ((o as Mesh).isMesh && rel.determinant() < 0) flip(g);
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = list[0];
    const one = (first as LineSegments).isLineSegments ? new LineSegments(merged, m) : new Mesh(merged, m);
    one.name = `${f.name || 'part'}Baked`;
    one.renderOrder = first.renderOrder;
    one.castShadow = first.castShadow;
    one.receiveShadow = first.receiveShadow;
    f.add(one);
    for (const o of list) unhook(o);
  }
}

/** Reverse the triangles' winding. */
function flip(g: BufferGeometry): void {
  if (g.index) {
    const I = g.index.array;
    for (let n = 0; n < I.length; n += 3) { const t = I[n + 1]; I[n + 1] = I[n + 2]; I[n + 2] = t; }
    return;
  }
  for (const a of Object.values(g.attributes)) {
    const s = a.itemSize, arr = a.array as Float32Array, tmp = new Float32Array(s);
    for (let v = 0; v + 2 < a.count; v += 3) {
      const b = (v + 1) * s, c = (v + 2) * s;
      tmp.set(arr.subarray(b, b + s)); arr.copyWithin(b, c, c + s); arr.set(tmp, c);
    }
  }
}

/** A merged part leaves; what hangs under it stays where it was, on a plain holder with its matrix. */
function unhook(o: Mesh | LineSegments): void {
  const parent = o.parent;
  if (!parent) return;
  if (o.children.length) {
    const hold = new Object3D();
    hold.name = o.name;
    hold.position.copy(o.position); hold.quaternion.copy(o.quaternion); hold.scale.copy(o.scale);
    for (const c of [...o.children]) hold.add(c);
    parent.add(hold);
  }
  parent.remove(o);
}

/** Groups left empty go (fewer matrices a frame); named moving ones and their children stay. */
function prune(o: Object3D): boolean {
  for (const c of [...o.children]) if (prune(c)) o.remove(c);
  const kept = WHOLE.has(o.name) || EACH.has(o.name) || (o.parent !== null && EACH.has(o.parent.name));
  return !kept && o.children.length === 0 && !(o as Mesh).isMesh && !(o as LineSegments).isLineSegments && !(o as { isPoints?: boolean }).isPoints && o.type !== 'Bone' && !(o as { isLight?: boolean }).isLight;
}
