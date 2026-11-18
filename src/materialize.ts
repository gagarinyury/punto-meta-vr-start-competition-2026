// The wait for a made thing that stands on a ready model, as one show tied to the real stages on the server
// (Yury, 16.11; the prototype is research/materialize/index.html). The server picks the model before the coder starts
// and says so ({model}); then:
//   - Punto draws the model's own outline on his tablet while the coder thinks (src/blueprint.ts, ready lines);
//   - the code, as it comes, flies out of the drawing as letters (the code's own characters) and weaves the still
//     model where it will stand: the outline first, then the body; the drawing fades as it is taken away;
//   - the answer is all in ({stage: 'written'}): the type check runs down the figure as a ring, the letters it has
//     passed turn from white to colour; the letters the code did not bring come from Punto meanwhile;
//     a failed check ({stage: 'repair'}) flushes some of them red and the ring starts again;
//   - the made file is in the scene: the letters fly onto its model (found by the geometry it shares with ours,
//     wherever the code put it), and the model comes in from white to its own colours. A failure: they fall and go.
// No model was picked: none of this, the usual plan and draft (src/features/punto.ts).
import {
  AnimationMixer,
  AssetManager,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  createSystem,
  DynamicDrawUsage,
  type Entity,
  Float32BufferAttribute,
  type Material,
  Matrix4,
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Points,
  ShaderMaterial,
  TorusGeometry,
  MeshBasicMaterial,
  Vector3,
  type World,
} from '@iwsdk/core';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlanLine } from './blueprint.js';
import { TABLET_SCREEN } from './library/tablet.js';
import { rootsOf } from './live.js';
import { inFrontOfPlayer } from './place.js';

/** The model the server picked ({model} of the make stream). */
export interface ShownModel {
  file: string;
  title: string;
  clips: string[];
  /** its real longest size in the room, metres (the director's guess) */
  metres?: number;
}

/** What the tablet draws: the model's outline from the front, metres (x right, y up, 0 at its foot). */
export interface Figure {
  lines: PlanLine[];
}

export interface MaterializeStage {
  /** Loads the model, freezes it in its first idle frame where it will stand, works out its outline and the letters'
   *  places. `source` is where letters come from when there is no drawing to leave (Punto). Undefined: it failed. */
  begin(model: ShownModel, source: () => Vector3): Promise<Figure | undefined>;
  /** The drawing the letters leave from: the paper (where a point of the outline is on it, its fading) and the
   *  tablet body it lies on; undefined when the tablet has gone. */
  useTablet(tablet: { paper: { toPaper(x: number, y: number): [number, number]; fade: number }; body: Object3D } | undefined): void;
  /** More of the coder's answer (the text as it comes). */
  code(text: string): void;
  /** The answer is all in: the type check starts. */
  written(): void;
  /** The check found errors: the coder repairs. */
  repair(): void;
  /** The made file `name` is in the scene: the letters go onto its model, which comes in. Resolves when done. */
  reveal(name: string): Promise<void>;
  /** Nothing came: the letters fall and go. */
  fail(): void;
  /** Gone at once (a new request, the page going). */
  end(): void;
  /** a show is on (between begin and the end of reveal or fail) */
  readonly active: boolean;
}

// ---------------------------------------------------------------- tuning
const EXPECT_CHARS = 1000; // the code's length we plan the letters for (made files on a model: ~600-1500 characters)
const CODE_SHARE = 0.9; // the code brings this much of the letters; the check brings the rest
const OUTLINE_MAX = 900, FILL = 1700; // letters on the outline (at most) and on the body
const FLY = [0.55, 0.95]; // seconds a letter flies, min and max
const SCAN_S = 6.5; // the check ring's first pass down the figure
const TOPUP_S = 5; // the letters the code did not bring come over this long after it is written
const REVEAL_FLY = 0.45, REVEAL_IN = 0.9; // letters onto the made model; its colours coming in
const FALL_S = 1.4;
const SIZE_SEAT = 0.021, SIZE_EDGE = 0.025, SIZE_FLY = 0.032; // a letter, metres (at 1.75 m tall; scaled with the model)
const C_FLY = [0.8, 0.96, 1], C_SEAT = [0.6, 0.82, 1], C_OK = [0.37, 0.95, 0.82], C_BAD = [1, 0.42, 0.42];

// ---------------------------------------------------------------- the letters' look: glyphs of an atlas on points
const COLS = 16, ROWS = 6; // printable ASCII, 32..127
function glyphAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * 64;
  canvas.height = ROWS * 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.font = 'bold 50px ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < COLS * ROWS; i++) g.fillText(String.fromCharCode(32 + i), (i % COLS) * 64 + 32, Math.floor(i / COLS) * 64 + 34);
  return new CanvasTexture(canvas);
}
const glyphOf = (code: number) => (code >= 33 && code < 127 ? code - 32 : 31); // '?' for the rest
function lettersMaterial(atlas: CanvasTexture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uHalfH: { value: 500 } },
    vertexShader: `
      attribute float aGlyph; attribute float aSize; attribute vec4 aColor;
      uniform float uHalfH; varying float vGlyph; varying vec4 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * projectionMatrix[1][1] * uHalfH / max(0.05, -mv.z);
        vGlyph = aGlyph; vColor = aColor;
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas; varying float vGlyph; varying vec4 vColor;
      void main() {
        vec2 cell = vec2(mod(vGlyph, ${COLS}.0), floor(vGlyph / ${COLS}.0));
        vec2 uv = vec2((cell.x + gl_PointCoord.x) / ${COLS}.0, 1.0 - (cell.y + gl_PointCoord.y) / ${ROWS}.0);
        float a = texture2D(uAtlas, uv).a * vColor.a;
        if (a < 0.04) discard;
        gl_FragColor = vec4(vColor.rgb, a);
      }`,
    // normal blending: the letters must read over a bright real room in passthrough, not only over the dark
    transparent: true,
    depthWrite: false,
  });
}

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;

/** The made thing's model, frozen where it will stand: its triangles in the room (`pos`), which mesh each is of. */
interface Baked { pos: Float32Array; mesh: Uint16Array; meshes: Mesh[]; top: number; base: Vector3; face: Vector3; right: Vector3; size: number }

/** Loads the model and freezes a copy in its first idle frame, `size` m at its longest, standing at the spot. */
async function bake(world: World, model: ShownModel): Promise<Baked> {
  await AssetManager.loadGLTF(model.file);
  const gltf = AssetManager.getGLTF(model.file)!; // a copy: its geometry is shared with the made file's copy
  const scene = gltf.scene;
  const idle = gltf.animations.find((clip) => /idle/i.test(clip.name)) ?? gltf.animations.find((clip) => /stand|breath/i.test(clip.name)) ?? gltf.animations[0];
  if (idle) {
    const mixer = new AnimationMixer(scene);
    mixer.clipAction(idle).play();
    mixer.update(0);
  }
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene, true);
  const dims = box.getSize(new Vector3());
  const size = model.metres ?? 1;
  const k = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
  // big things stand on the floor ahead, small ones float at chest height a little closer
  const big = size >= 0.7;
  const spot = inFrontOfPlayer(world, big ? { distance: Math.min(2.6, Math.max(1.3, size * 0.55 + 0.9)), below: 0 } : { distance: 0.85, below: 0.35 });
  const base = spot.point.clone();
  if (big) base.y = 0;
  const face = spot.normal.clone().setY(0).normalize(); // toward the player
  const right = new Vector3(0, 1, 0).cross(face);
  const place = new Matrix4()
    .makeTranslation(base.x, base.y, base.z)
    .multiply(new Matrix4().makeRotationY(Math.atan2(face.x, face.z)))
    .multiply(new Matrix4().makeScale(k, k, k))
    .multiply(new Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  scene.applyMatrix4(place);
  scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  scene.traverse((o) => { if ((o as Mesh).isMesh && !(o as { isInstancedMesh?: boolean }).isInstancedMesh) meshes.push(o as Mesh); });
  const pos: number[] = [], part: number[] = [];
  const v = new Vector3();
  meshes.forEach((mesh, m) => {
    const g = mesh.geometry, index = g.index, n = index ? index.count : g.attributes.position.count;
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(index ? index.getX(i) : i, v).applyMatrix4(mesh.matrixWorld); // skinned: posed
      pos.push(v.x, v.y, v.z);
      if (i % 3 === 0) part.push(m);
    }
  });
  let top = -Infinity;
  for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);
  return { pos: Float32Array.from(pos), mesh: Uint16Array.from(part), meshes, top, base, face, right, size };
}

/** The outline as seen from the front (silhouette, sharp creases, borders of parts), chained into lines; and points
 *  along it every `step` m (the first letters' places). */
function outlineOf(b: Baked, step: number): { lines: PlanLine[]; points: { p: Vector3; mesh: number }[] } {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  const merged = mergeVertices(geometry, 1e-4);
  geometry.dispose();
  const P = merged.attributes.position, I = merged.index!;
  const faces = I.count / 3;
  const normal: Vector3[] = [], front: boolean[] = [];
  const a = new Vector3(), c = new Vector3(), d = new Vector3();
  for (let f = 0; f < faces; f++) {
    a.fromBufferAttribute(P, I.getX(f * 3));
    c.fromBufferAttribute(P, I.getX(f * 3 + 1));
    d.fromBufferAttribute(P, I.getX(f * 3 + 2));
    const n = new Vector3().subVectors(d, c).cross(new Vector3().subVectors(a, c)).normalize();
    normal.push(n);
    front.push(n.dot(b.face) > 0.05);
  }
  const edges = new Map<number, { i: number; j: number; faces: number[] }>();
  const verts = P.count;
  for (let f = 0; f < faces; f++) for (let e = 0; e < 3; e++) {
    const x = I.getX(f * 3 + e), y = I.getX(f * 3 + ((e + 1) % 3));
    const i = Math.min(x, y), j = Math.max(x, y), key = i * verts + j;
    let edge = edges.get(key);
    if (!edge) edges.set(key, (edge = { i, j, faces: [] }));
    edge.faces.push(f);
  }
  const crease = Math.cos((38 * Math.PI) / 180);
  const keep: { i: number; j: number; faces: number[] }[] = [];
  for (const edge of edges.values()) {
    const [f1, f2] = edge.faces;
    if (f2 === undefined) { if (front[f1]) keep.push(edge); continue; }
    const silhouette = front[f1] !== front[f2];
    const sharp = front[f1] && front[f2] && normal[f1].dot(normal[f2]) < crease;
    const border = (front[f1] || front[f2]) && b.mesh[f1] !== b.mesh[f2];
    if (silhouette || sharp || border) keep.push(edge);
  }
  const point = (i: number) => new Vector3().fromBufferAttribute(P, i);
  const at = new Map<number, typeof keep>();
  for (const edge of keep) for (const v of [edge.i, edge.j]) { let list = at.get(v); if (!list) at.set(v, (list = [])); list.push(edge); }
  keep.sort((x, y) => Math.max(P.getY(y.i), P.getY(y.j)) - Math.max(P.getY(x.i), P.getY(x.j))); // top first
  const used = new Set<typeof keep[number]>();
  const lines: PlanLine[] = [], points: { p: Vector3; mesh: number }[] = [];
  const flat = (p: Vector3): [number, number] => { const q = p.clone().sub(b.base); return [q.dot(b.right), q.y]; };
  for (const start of keep) {
    if (used.has(start)) continue;
    used.add(start);
    const chain = [start.i, start.j];
    for (const grow of [1, -1]) {
      for (;;) {
        const end = grow > 0 ? chain[chain.length - 1] : chain[0];
        const next = (at.get(end) ?? []).find((edge) => !used.has(edge));
        if (!next) break;
        used.add(next);
        const other = next.i === end ? next.j : next.i;
        if (grow > 0) chain.push(other); else chain.unshift(other);
      }
    }
    const pts = chain.map(point);
    lines.push({ pts: pts.map(flat), part: b.mesh[start.faces[0]] });
    for (let k = 1; k < pts.length; k++) {
      const n = Math.max(1, Math.round(pts[k - 1].distanceTo(pts[k]) / step));
      for (let s = 0; s < n; s++) points.push({ p: pts[k - 1].clone().lerp(pts[k], s / n), mesh: b.mesh[start.faces[0]] });
    }
  }
  merged.dispose();
  // too many along the outline: an even subset
  if (points.length > OUTLINE_MAX) {
    const every = points.length / OUTLINE_MAX;
    return { lines, points: Array.from({ length: OUTLINE_MAX }, (_, i) => points[Math.floor(i * every)]) };
  }
  return { lines, points };
}

export function materializeStage(world: World): MaterializeStage {
  const atlas = glyphAtlas();
  const material = lettersMaterial(atlas);
  const scan = new Mesh(new TorusGeometry(1, 0.004, 6, 64), new MeshBasicMaterial({ color: 0x7dffd9, transparent: true, depthWrite: false }));
  scan.rotation.x = Math.PI / 2;
  scan.userData.occlude = false;
  scan.visible = false;
  world.createTransformEntity(scan); // one ring for the page's life, as the draft stage has its stage

  // the show now (one at a time)
  let on = false;
  let build = 0; // changes with each begin and end: a bake that finishes after that is dropped
  let now = 0;
  let baked: Baked | undefined;
  let source: () => Vector3 = () => new Vector3();
  let tablet: Parameters<MaterializeStage['useTablet']>[0];
  let points: Points | undefined;
  let entity: Entity | undefined;
  let n = 0, fromCode = 0, perChar = 1;
  // per letter
  let target = new Float32Array(0), normal = new Float32Array(0), from = new Float32Array(0), mid = new Float32Array(0);
  let spawn = new Float32Array(0), dur = new Float32Array(0), glyph = new Float32Array(0), mesh = new Uint16Array(0);
  let edge = new Uint8Array(0), bad = new Float32Array(0), fallV = new Float32Array(0);
  let aPos = new Float32Array(0), aGlyph = new Float32Array(0), aSize = new Float32Array(0), aColor = new Float32Array(0);
  let flatXY = new Float32Array(0); // each letter's place on the drawing (metres of the front view)
  let chars: number[] = []; // the code's characters so far (no spaces)
  let emitted = 0;
  let writtenAt = -1, checkAt = -1, revealAt = -1, failAt = -1;
  let topUpFrom = 0;
  let scale = 1; // letters' size with the model's
  let pairs: { made: Mesh; ours: Mesh; map: Matrix4 }[] = [];
  let swapped: { mesh: Mesh; original: Material | Material[]; copies: { m: MeshStandardMaterial; color: Color }[] }[] = [];
  let revealDone: (() => void) | undefined;

  const v = new Vector3(), w = new Vector3(), inverse = new Matrix4();
  const WHITE = new Color(1, 1, 1);
  const halfHeight = () => {
    const renderer = world.renderer;
    if (renderer.xr.isPresenting) {
      const eye = renderer.xr.getCamera().cameras[0];
      if (eye?.viewport) return eye.viewport.w / 2;
    }
    return renderer.domElement.height / 2;
  };

  /** Where a letter leaves from now: its point on the drawing while the tablet is out, else Punto. */
  function departure(i: number, out: Vector3): Vector3 {
    if (tablet) {
      const [u, vv] = tablet.paper.toPaper(flatXY[i * 2], flatXY[i * 2 + 1]);
      out.set(TABLET_SCREEN.x + (u - 0.5) * TABLET_SCREEN.w, (0.5 - vv) * TABLET_SCREEN.h, TABLET_SCREEN.z + 0.003);
      return tablet.body.localToWorld(out);
    }
    return out.copy(source());
  }
  function launch(i: number, at: number) {
    spawn[i] = at;
    dur[i] = FLY[0] + hash(i + 11) * (FLY[1] - FLY[0]);
    departure(i, v); // called from update() too (the top-up): no arrays made here
    from[i * 3] = v.x; from[i * 3 + 1] = v.y; from[i * 3 + 2] = v.z;
    w.set(target[i * 3], target[i * 3 + 1], target[i * 3 + 2]);
    v.lerp(w, 0.5);
    mid[i * 3] = v.x + (hash(i + 3) - 0.5) * 0.3 * scale;
    mid[i * 3 + 1] = v.y + (0.15 + hash(i + 5) * 0.22) * scale;
    mid[i * 3 + 2] = v.z + (hash(i + 9) - 0.5) * 0.3 * scale;
  }

  function clear() {
    on = false;
    build++;
    baked = undefined;
    tablet = undefined;
    scan.visible = false;
    if (entity?.active) entity.dispose();
    entity = undefined;
    points?.geometry.dispose();
    points = undefined;
    restoreMaterials();
    pairs = [];
    revealDone?.();
    revealDone = undefined;
  }
  function restoreMaterials() {
    for (const { mesh: m, original, copies } of swapped) {
      m.material = original;
      for (const { m: copy } of copies) copy.dispose();
    }
    swapped = [];
  }

  world.registerSystem(
    class Materializing extends createSystem({}) {
      update(delta: number): void {
        if (!on || !points || !baked) return;
        now += delta;
        material.uniforms.uHalfH.value = halfHeight();
        // the check ring: down the figure once, then slowly up and down until the file is in
        const span = baked.top - baked.base.y;
        let scanY = Infinity;
        if (checkAt >= 0 && revealAt < 0 && failAt < 0) {
          const t = (now - checkAt) / SCAN_S;
          scanY = t < 1 ? baked.top + 0.03 - (span + 0.06) * smooth(t) : baked.base.y + span * (0.5 - 0.5 * Math.cos((t - 1) * 1.6));
          scan.visible = true;
          scan.position.set(baked.base.x, scanY, baked.base.z);
          scan.scale.setScalar(Math.max(0.25, span * 0.26));
          (scan.material as MeshBasicMaterial).opacity = t < 1 ? 0.9 : 0.45;
        } else scan.visible = false;
        if (tablet) tablet.paper.fade = 1 - clamp01(emitted / Math.max(1, fromCode));
        // the letters the code did not bring, after it is written
        if (writtenAt >= 0 && failAt < 0) {
          const due = Math.min(n, topUpFrom + Math.floor(clamp01((now - writtenAt) / TOPUP_S) * (n - topUpFrom)));
          if (revealAt < 0) for (let i = emitted; i < due; i++) launch(i, now);
          emitted = Math.max(emitted, due);
        }
        // the made model, moving: where each of our meshes is now on it
        if (revealAt >= 0) for (const pair of pairs) pair.map.multiplyMatrices(pair.made.matrixWorld, inverse.copy(pair.ours.matrixWorld).invert());
        const into = revealAt >= 0 ? clamp01((now - revealAt) / REVEAL_FLY) : 0;
        const fade = revealAt >= 0 ? clamp01((now - revealAt - REVEAL_FLY * 0.6) / 0.5) : 0;
        const fall = failAt >= 0 ? clamp01((now - failAt) / FALL_S) : 0;
        const tick = Math.floor(now * 4);
        for (let i = 0; i < n; i++) {
          const t = i < emitted ? (now - spawn[i]) / dur[i] : -1;
          let size = 0, a = 0, r = 0, g = 0, bl = 0;
          if (t >= 0) {
            if (t < 1 && revealAt < 0) { // flying from the drawing to its place
              const e = easeOut(t), u = 1 - e;
              v.set(from[i * 3], from[i * 3 + 1], from[i * 3 + 2]).multiplyScalar(u * u);
              v.x += 2 * u * e * mid[i * 3] + e * e * target[i * 3];
              v.y += 2 * u * e * mid[i * 3 + 1] + e * e * target[i * 3 + 1];
              v.z += 2 * u * e * mid[i * 3 + 2] + e * e * target[i * 3 + 2];
              size = SIZE_FLY - 0.01 * e; a = 1; [r, g, bl] = C_FLY;
              aGlyph[i] = glyph[i];
            } else { // in its place: shimmering like running code; the check colours it
              v.set(target[i * 3], target[i * 3 + 1], target[i * 3 + 2]);
              const checked = v.y > scanY;
              const just = checked && v.y - scanY < 0.035 * scale;
              const base = bad[i] > now ? C_BAD : checked ? C_OK : C_SEAT;
              [r, g, bl] = base;
              if (just) r = g = bl = 1;
              size = (edge[i] ? SIZE_EDGE : SIZE_SEAT) * (just ? 1.35 : 1);
              a = (edge[i] ? 0.95 : 0.72) * (0.75 + 0.25 * Math.sin(now * 9 + i));
              aGlyph[i] = hash(i * 13 + tick) < 0.06 && chars.length ? glyphOf(chars[Math.floor(hash(i + tick) * chars.length)]) : glyph[i];
              if (revealAt >= 0) { // onto the made model where it is now, flaring white, then gone
                const pair = pairs[mesh[i]] ?? pairs[0];
                if (pair) { w.copy(v).applyMatrix4(pair.map); v.lerp(w, easeOut(into)); }
                else v.addScaledVector(w.set(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]), -0.012 * into * scale);
                r = g = bl = 1;
                a *= 1 - fade;
                size *= 1 - fade * 0.8;
              }
              if (failAt >= 0) { // falling: down and a little out, going grey and gone
                const s = now - failAt;
                v.x += fallV[i * 3] * s; v.z += fallV[i * 3 + 2] * s;
                v.y = Math.max(0.01, v.y + fallV[i * 3 + 1] * s - 4.9 * s * s);
                r = g = bl = 0.6;
                a *= 1 - fall;
              }
            }
          }
          aPos[i * 3] = v.x; aPos[i * 3 + 1] = v.y; aPos[i * 3 + 2] = v.z;
          aSize[i] = size * scale;
          aColor[i * 4] = r; aColor[i * 4 + 1] = g; aColor[i * 4 + 2] = bl; aColor[i * 4 + 3] = a;
        }
        const attrs = points.geometry.attributes;
        attrs.position.needsUpdate = attrs.aGlyph.needsUpdate = attrs.aSize.needsUpdate = attrs.aColor.needsUpdate = true;
        // the made model's colours come in, from white
        if (revealAt >= 0) {
          const come = clamp01((now - revealAt - REVEAL_FLY * 0.5) / REVEAL_IN);
          for (const { copies } of swapped) for (const { m, color } of copies) {
            m.opacity = smooth(come * 1.8);
            m.color.copy(WHITE).lerp(color, smooth((come - 0.25) / 0.75));
          }
          if (now - revealAt > REVEAL_FLY + REVEAL_IN + 0.1) clear();
        }
        if (failAt >= 0 && now - failAt > FALL_S + 0.1) clear();
      }
    },
  );

  return {
    get active() {
      return on;
    },
    async begin(model, origin) {
      clear();
      const mine = build;
      source = origin;
      const b = await bake(world, model).catch((error) => {
        console.warn('[materialize] no figure', error);
        return undefined;
      });
      if (!b || mine !== build) return undefined;
      baked = b;
      scale = b.size >= 0.7 ? b.size / 1.75 : Math.max(0.35, b.size / 0.6);
      const outline = outlineOf(b, Math.max(0.012, b.size / 70));
      // the body: points spread evenly over the surface, mesh by mesh (each letter knows which part of the model it is
      // on: it flies onto that part of the made model), as many on a mesh as its share of the area; then all of them in
      // order: the outline first, the body shuffled
      const all: { p: Vector3; nrm: Vector3; mesh: number; edge: boolean }[] = outline.points.map((o) => ({ p: o.p, nrm: b.face.clone(), mesh: o.mesh, edge: true }));
      const body: typeof all = [];
      const p = new Vector3(), nrm = new Vector3(), e1 = new Vector3(), e2 = new Vector3();
      const ofMesh = b.meshes.map((_, m) => {
        const tris: number[] = [];
        let area = 0;
        for (let f = 0; f < b.mesh.length; f++) {
          if (b.mesh[f] !== m) continue;
          const at = f * 9;
          tris.push(...b.pos.subarray(at, at + 9));
          p.fromArray(b.pos, at);
          area += e1.fromArray(b.pos, at + 3).sub(p).cross(e2.fromArray(b.pos, at + 6).sub(p)).length() / 2;
        }
        return { tris, area };
      });
      const total = ofMesh.reduce((sum, one) => sum + one.area, 0) || 1;
      ofMesh.forEach(({ tris, area }, m) => {
        const count = Math.round((FILL * area) / total);
        if (!count || !tris.length) return;
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(tris, 3));
        geometry.computeVertexNormals();
        const sampler = new MeshSurfaceSampler(new Mesh(geometry)).build();
        for (let i = 0; i < count; i++) {
          sampler.sample(p, nrm);
          body.push({ p: p.clone().addScaledVector(nrm, 0.004 * scale), nrm: nrm.clone(), mesh: m, edge: false });
        }
        geometry.dispose();
      });
      for (let i = body.length - 1; i > 0; i--) { const j = Math.floor(hash(i) * (i + 1)); [body[i], body[j]] = [body[j], body[i]]; }
      all.push(...body);
      n = all.length;
      fromCode = Math.round(n * CODE_SHARE);
      topUpFrom = fromCode;
      perChar = Math.max(1, Math.ceil(fromCode / EXPECT_CHARS));
      target = new Float32Array(n * 3); normal = new Float32Array(n * 3); from = new Float32Array(n * 3); mid = new Float32Array(n * 3);
      spawn = new Float32Array(n); dur = new Float32Array(n); glyph = new Float32Array(n).fill(31); mesh = new Uint16Array(n);
      edge = new Uint8Array(n); bad = new Float32Array(n); fallV = new Float32Array(n * 3); flatXY = new Float32Array(n * 2);
      all.forEach((one, i) => {
        target.set([one.p.x, one.p.y, one.p.z], i * 3);
        normal.set([one.nrm.x, one.nrm.y, one.nrm.z], i * 3);
        mesh[i] = one.mesh;
        edge[i] = one.edge ? 1 : 0;
        const q = one.p.clone().sub(b.base);
        flatXY[i * 2] = q.dot(b.right);
        flatXY[i * 2 + 1] = q.y;
        fallV.set([(hash(i + 21) - 0.5) * 0.6, hash(i + 23) * 0.8, (hash(i + 25) - 0.5) * 0.6], i * 3);
      });
      aPos = new Float32Array(n * 3); aGlyph = new Float32Array(n); aSize = new Float32Array(n); aColor = new Float32Array(n * 4);
      const cloud = new BufferGeometry();
      cloud.setAttribute('position', new BufferAttribute(aPos, 3).setUsage(DynamicDrawUsage));
      cloud.setAttribute('aGlyph', new BufferAttribute(aGlyph, 1).setUsage(DynamicDrawUsage));
      cloud.setAttribute('aSize', new BufferAttribute(aSize, 1).setUsage(DynamicDrawUsage));
      cloud.setAttribute('aColor', new BufferAttribute(aColor, 4).setUsage(DynamicDrawUsage));
      points = new Points(cloud, material);
      points.frustumCulled = false;
      points.renderOrder = 6;
      points.userData.occlude = false; // its own shader: no depth occlusion patched in
      entity = world.createTransformEntity(points);
      chars = [];
      emitted = 0;
      writtenAt = checkAt = revealAt = failAt = -1;
      now = 0;
      on = true;
      console.info(`[materialize] ${model.title}: ${outline.lines.length} lines, ${n} letters (${outline.points.length} on the outline), ${perChar} per character`);
      return { lines: outline.lines };
    },
    useTablet(next) {
      tablet = next;
    },
    code(text) {
      if (!on || revealAt >= 0 || failAt >= 0) return;
      for (let k = 0; k < text.length; k++) {
        const c = text.charCodeAt(k);
        if (c <= 32) continue;
        chars.push(c);
        for (let j = 0; j < perChar && emitted < fromCode; j++) {
          glyph[emitted] = glyphOf(c);
          launch(emitted, now + hash(emitted + 31) * 0.1);
          emitted++;
        }
      }
    },
    written() {
      if (!on || writtenAt >= 0) return;
      writtenAt = checkAt = now;
      // the rest (the code was shorter than planned): their glyphs from the code itself
      topUpFrom = emitted;
      for (let i = emitted; i < n; i++) glyph[i] = glyphOf(chars.length ? chars[Math.floor(hash(i) * chars.length)] : 63);
    },
    repair() {
      if (!on) return;
      checkAt = now; // the check runs again
      for (let i = 0; i < emitted; i++) if (hash(i * 7 + now) < 0.3) bad[i] = now + 0.6 + hash(i) * 0.4;
    },
    reveal(name) {
      if (!on || !baked) return Promise.resolve();
      // the letters not yet out go now, straight to their places
      for (let i = emitted; i < n; i++) { spawn[i] = now - 2; dur[i] = 1; }
      emitted = n;
      // the made model: meshes that share geometry with ours (the same glTF from the cache)
      const ours = new Map(baked.meshes.map((m, i) => [m.geometry, i]));
      const found: Mesh[] = new Array(baked.meshes.length);
      for (const root of rootsOf(name)) root.object3D?.traverse((o) => {
        const i = (o as Mesh).isMesh ? ours.get((o as Mesh).geometry) : undefined;
        if (i !== undefined && !found[i]) found[i] = o as Mesh;
      });
      pairs = baked.meshes.map((m, i) => ({ made: found[i], ours: m, map: new Matrix4() })).filter((p) => p.made);
      // index by our mesh: a letter of a mesh that was not found goes with the first pair
      const byMesh = baked.meshes.map((m) => pairs.find((p) => p.ours === m));
      pairs = byMesh.map((p) => p ?? pairs[0]).filter(Boolean) as typeof pairs;
      for (const p of new Set(pairs)) {
        const original = p.made.material;
        const list = Array.isArray(original) ? original : [original];
        const copies = list.map((m) => {
          const copy = (m as MeshStandardMaterial).clone();
          copy.transparent = true;
          copy.opacity = 0;
          return { m: copy, color: copy.color?.clone() ?? new Color(1, 1, 1) };
        });
        p.made.material = Array.isArray(original) ? copies.map((c) => c.m) : copies[0].m;
        swapped.push({ mesh: p.made, original, copies });
      }
      console.info(`[materialize] reveal on ${name}: ${new Set(pairs).size} of ${baked.meshes.length} meshes found`);
      revealAt = now;
      return new Promise((resolve) => (revealDone = resolve));
    },
    fail() {
      if (!on || failAt >= 0) return;
      failAt = now;
      revealAt = -1;
    },
    end() {
      clear();
    },
  } satisfies MaterializeStage & { readonly active: boolean };
}

