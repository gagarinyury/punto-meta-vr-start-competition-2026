// Punto's title (Yury, 15.11), after his concept art (research/concepts/title/logo-concept.jpeg): puffy cream 3D letters
// with a glowing cyan layer behind; Punto himself in place of the O, both hands up, > < eyes; a neon
// «SAY IT. SEE IT. PLAY IT.»; two sound waves, cyan streams of light, orange sparks and specks. It comes in as he
// types it: a little keyboard before him, a letter per key press, the neon line at a run — trrrr; then the
// keyboard goes, he throws his hands up, the streams and the waves come and the neon steadies.
// Used by the title stand (research/code/tools/title-stand.ts) and the front page stand (research/code/tools/splash-stand.ts).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type World,
} from '@iwsdk/core';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { type Key, puntoKeyboard } from '../keyboard.js';
import { Font, type FontData } from 'three/addons/loaders/FontLoader.js';
import { createPunto, type Punto, type PuntoSound } from '../helper.js';
import { sfx } from '../sfx.js';

export interface TitleOptions {
  /** Where the logo goes (the scene by default). */
  parent?: Object3D;
  /** false: start() leaves the logo where the caller put it (true: 2.4 m before the eye). */
  place?: boolean;
  /** false: no waves, streams, sparks, specks or pixels of its own (a background that draws them). */
  effects?: boolean;
  /** How high the O stands behind Punto's head, m (0.2: well over it, as the logo art; the splash art: just over it). */
  oRise?: number;
  /** What the show is doing, in words, for a stand's hint line. */
  say?: (text: string) => void;
}
export interface Title {
  /** The logo, in its own space: +X to the viewer's right, +Y up, +Z towards the viewer; its middle at the letters. */
  logo: Group;
  punto: Punto;
  /** The neon line's plane (2.1 m wide, its middle 0.7 m under the logo's origin): a page may move or scale it. */
  neon: Mesh;
  /** Types it from the start (slow: at 0.4 speed). */
  start(slow?: boolean): void;
  /** The player spoke: it all goes, Punto listens. */
  said(): void;
  /** Wipes it with backspace, letter by letter from the end (then the phase is 'off'). */
  erase(): void;
  /** Works at the keyboard for `seconds` (keys at a run, nothing typed), then back to the ta-da. */
  work(seconds: number): void;
  /** Every frame. */
  update(delta: number, time: number): void;
  state(): { phase: string; clock: number; tadaAt: number; shown: number };
}

export async function createTitle(world: World, options: TitleOptions = {}): Promise<Title> {
  const CYAN = 0x35d8ff;
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const sstep = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
  const backOut = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2; // past 1 a little, then back

  // ---- the fonts: Fredoka Bold (OFL), as rounded and heavy as the concept's letters; 3D from its typeface JSON,
  // the glows and the neon from the same font on canvases ----
  const fontFace = new FontFace('PuntoTitle', 'url(./fonts/fredoka-bold.woff2)');
  document.fonts.add(await fontFace.load());
  // the neon in a lighter weight of the same family: in the bold one the glowing strokes filled the A's little window
  const neonFace = new FontFace('PuntoNeon', 'url(./fonts/fredoka-medium.woff2)');
  document.fonts.add(await neonFace.load());
  const font = new Font((await (await fetch('./fonts/fredoka-bold.typeface.json')).json()) as FontData);

  // ---- the logo, in its own space: +X to the player's right, +Z towards the player ----
  const logo = new Group();
  (options.parent ?? world.scene).add(logo);
  const SIZE = 0.42; // letter size, m: capitals ~0.29 m, seen from ~2.4 m
  const cream = new MeshPhysicalMaterial({ color: 0xf2dfb8, roughness: 0.55, sheen: 0.4, sheenColor: new Color(0xffffff), clearcoat: 0.15 });
  const inlayMat = new MeshStandardMaterial({ color: 0x0e8fb0, emissive: 0x14c4ee, emissiveIntensity: 1.1, roughness: 0.4 }); // the back glow's blue
  const teal = new MeshStandardMaterial({ color: 0x0a6f80, emissive: 0x14c4ee, emissiveIntensity: 0.75, roughness: 0.4 });

  /** A soft cyan halo of one letter, drawn so the glyph's height is 1/1.8 of the canvas. */
  function glowTexture(ch: string): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.font = '700 200px PuntoTitle';
    const m = g.measureText(ch);
    const gw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const k = 256 / 1.8 / Math.max(gh, gw);
    g.translate(128, 128);
    g.scale(k, k);
    g.translate(-(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    g.shadowColor = '#22e2ff';
    g.fillStyle = 'rgba(40,220,255,0.55)';
    for (const blur of [60, 30]) { g.shadowBlur = blur * k; g.fillText(ch, 0, 0); }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }

  interface Letter { node: Group; end: Vector3; turn: number; start: Vector3; t0: number; out: number; hop: number }
  const letters: Letter[] = [];
  /** One letter: the cream front, the glowing teal layer behind it (shifted down-left, as in the art), a soft cyan halo. */
  function makeLetter(ch: string, at: Vector3, turn: number, scale = 1): void {
    const node = new Group();
    const front = new TextGeometry(ch, { font, size: SIZE, depth: 0.07, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.026, bevelSize: 0.017, bevelSegments: 6 });
    front.computeBoundingBox();
    const centre = front.boundingBox!.getCenter(new Vector3());
    const box = front.boundingBox!.getSize(new Vector3());
    front.translate(-centre.x, -centre.y, -centre.z);
    node.add(new Mesh(front, cream));
    // the art's teal inlay: a thin stripe on the front face, running a little inside its edge (every outline
    // of the glyph moved inward, holes outward, a thin tube along it)
    const faceZ = 0.07 + 0.026 - centre.z;
    for (const shape of font.generateShapes(ch, SIZE)) [shape, ...shape.holes].forEach((path, k) => {
      const pts = path.getPoints(10);
      if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
      let area = 0;
      pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; area += p.x * q.y - q.x * p.y; });
      const inward = (k === 0 ? 1 : -1) * Math.sign(area), INSET = 0.012;
      const inset = pts.map((p, i) => {
        const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
        const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
        return new Vector3(p.x - centre.x + (-ty / l) * INSET * inward, p.y - centre.y + (tx / l) * INSET * inward, faceZ);
      });
      const inlay = new Mesh(new TubeGeometry(new CatmullRomCurve3(inset, true), inset.length * 2, 0.0065, 5, true), inlayMat);
      inlay.userData.rim = true;
      node.add(inlay);
    });
    const back = new TextGeometry(ch, { font, size: SIZE, depth: 0.05, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.03, bevelSegments: 3 });
    back.translate(-centre.x, -centre.y, -centre.z);
    const backMesh = new Mesh(back, teal);
    backMesh.position.set(-0.014, -0.02, -0.075);
    node.add(backMesh);
    const side = Math.max(box.x, box.y) * 1.8;
    const halo = new Mesh(new PlaneGeometry(side, side), new MeshBasicMaterial({ map: glowTexture(ch), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.set(-0.02, -0.03, -0.12);
    node.add(halo);
    node.scale.setScalar(scale);
    node.visible = false;
    logo.add(node);
    letters.push({ node, end: at.clone().add(new Vector3(centre.x, centre.y, 0).multiplyScalar(scale)), turn, start: new Vector3(), t0: -1, out: -1, hop: 0.35 });
  }
  const advance = (ch: string) => (font.data.glyphs[ch].ha / font.data.resolution) * SIZE;
  // PUNT on a baseline that climbs to the right, each letter tipped a little (the art's bounce), tight together;
  // the O last, higher and behind Punto, its top over his head
  const RISE = [0, 0.025, 0.06, 0.1];
  const TIP = [0.09, 0.035, -0.02, -0.07];
  let x = -0.98;
  'PUNT'.split('').forEach((ch, i) => {
    makeLetter(ch, new Vector3(x, RISE[i], 0), TIP[i]);
    x += advance(ch) - 0.03;
  });
  const O_AT = new Vector3(x + 0.02, options.oRise ?? 0.2, -0.16);
  makeLetter('O', O_AT, -0.1, 1.05);

  // ---- Punto in the O's place (src/helper.ts) ----
  const PUNTO_SIZE = 4.1; // bigger than in the room (2.7): his head covers most of the O, as in the art
  const punto = createPunto();
  punto.object.scale.setScalar(PUNTO_SIZE);
  punto.showBuild = false;
  const SOUNDS: Record<PuntoSound, [string, number]> = {
    key: ['switch', 0.35], type: ['click', 0.2], tap: ['tick', 0.3], poke: ['pepSound', 0.6], wake: ['phaserUp', 0.5], glad: ['powerUp', 0.45],
  };
  punto.setSound((name) => sfx(world, SOUNDS[name][0], undefined, SOUNDS[name][1]));
  punto.object.position.set(O_AT.x + 0.14, 0.13, 0.12);
  logo.add(punto.object);

  // ---- his little keyboard, in his own units (src/keyboard.ts: the same one he works at in the room) ----
  const kit = puntoKeyboard(cream);
  const { keys, backspace, keyFor, CAP_Y, capMat, litMat } = kit;
  const keyboard = kit.group;
  keyboard.scale.setScalar(0.001);
  keyboard.visible = false;
  punto.object.add(keyboard);

  // ---- the neon line: three strokes on a canvas (a wide blur, the tube, its white-hot core), added light.
  // He types it too, fast — trrrr — and each letter lights up with its key press, the newest one brighter ----
  const NEON = 'SAY IT. SEE IT. PLAY IT.';
  const neonCanvas = document.createElement('canvas');
  neonCanvas.width = 2048;
  neonCanvas.height = 256;
  const ng = neonCanvas.getContext('2d')!;
  ng.font = '500 150px PuntoNeon';
  ng.textBaseline = 'middle';
  ng.lineJoin = 'round';
  // each letter's left edge, from the letters' own widths (a space a little wider, as on a sign)
  const neonW = [...NEON].map((ch) => ng.measureText(ch).width * (ch === ' ' ? 1.6 : 1) + 3);
  const NEON_X0 = 1024 - neonW.reduce((a, w) => a + w, 0) / 2;
  const neonX = neonW.map((_, i) => NEON_X0 + neonW.slice(0, i).reduce((a, w) => a + w, 0));
  const neonMid = neonX.map((x, i) => x + neonW[i] / 2);
  let neonDrawn = '';
  /** One letter of the neon: its fill and three blurred strokes (`hot`: just typed, brighter). */
  function neonLetter(g: CanvasRenderingContext2D, i: number, hot: boolean): void {
    const ch = NEON[i];
    if (ch === ' ') return;
    const stroke = (width: number, color: string, blur: number) => { g.lineWidth = width; g.strokeStyle = color; g.shadowColor = '#16d6ff'; g.shadowBlur = blur; g.strokeText(ch, neonX[i], 134); };
    g.shadowBlur = 0;
    g.fillStyle = hot ? 'rgba(160,240,255,0.45)' : 'rgba(20,120,160,0.18)';
    g.fillText(ch, neonX[i], 134);
    stroke(hot ? 16 : 12, 'rgba(30,200,255,0.55)', hot ? 60 : 44);
    stroke(7, hot ? '#9ff5ff' : '#3fe6ff', 18);
    stroke(hot ? 4 : 2.5, '#e9fdff', 4);
  }
  // The letters already typed, kept drawn: each new letter used to redraw the whole line, every letter with blurs up
  // to 60 px — ~48 redraws while it is typed, the dearest by far on the Quest's CPU (audit 15.11). Now the line so far
  // is copied and only the newest letter drawn on it: the same strokes in the same order, the same picture.
  const neonBase = document.createElement('canvas');
  neonBase.width = 2048;
  neonBase.height = 256;
  const nb = neonBase.getContext('2d')!;
  nb.font = ng.font;
  nb.textBaseline = 'middle';
  nb.lineJoin = 'round';
  let neonBaseCount = 0; // letters drawn on neonBase, all plain
  /** The first `count` letters lit; the last one `flash` (0..1) brighter, just typed. */
  function drawNeon(count: number, flash: number): void {
    const key = `${count}|${flash > 0 ? 1 : 0}`;
    if (key === neonDrawn) return;
    neonDrawn = key;
    // every letter but the last, plain: kept on neonBase (drawn again from scratch only when letters go: erasing)
    const plain = Math.max(0, count - 1);
    if (plain < neonBaseCount) {
      nb.clearRect(0, 0, 2048, 256);
      neonBaseCount = 0;
    }
    for (; neonBaseCount < plain; neonBaseCount++) neonLetter(nb, neonBaseCount, false);
    ng.clearRect(0, 0, 2048, 256);
    ng.shadowBlur = 0;
    if (plain > 0) ng.drawImage(neonBase, 0, 0);
    if (count > 0) neonLetter(ng, count - 1, flash > 0);
    neonTex.needsUpdate = true;
  }
  const neonTex = new CanvasTexture(neonCanvas);
  neonTex.colorSpace = SRGBColorSpace;
  const neonMat = new MeshBasicMaterial({ map: neonTex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  const NEON_W = 2.1;
  const neon = new Mesh(new PlaneGeometry(NEON_W, NEON_W / 8), neonMat);
  neon.position.set(0.05, -0.7, 0.05);
  logo.add(neon);

  // ---- two sound waves: bars on a line, the left one long and calm with a dotted tail, the right one bright,
  // running into Punto's foot ----
  const barGeo = new PlaneGeometry(1, 1);
  const waveMat = new MeshBasicMaterial({ color: 0x6af2ff, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide, opacity: 0 });
  const waveGlowMat = new MeshBasicMaterial({ color: 0x18c8ff, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide, opacity: 0 });
  interface Wave { from: Vector3; to: Vector3; n: number; tall: number; width: number; env: (u: number) => number; core: InstancedMesh; glow: InstancedMesh; seed: number }
  function wave(from: Vector3, to: Vector3, n: number, tall: number, width: number, env: (u: number) => number, seed: number): Wave {
    const core = new InstancedMesh(barGeo, waveMat, n), glow = new InstancedMesh(barGeo, waveGlowMat, n);
    core.frustumCulled = glow.frustumCulled = false;
    logo.add(core, glow);
    return { from, to, n, tall, width, env, core, glow, seed };
  }
  const waves = [
    wave(new Vector3(-1.15, -0.5, 0.06), new Vector3(-0.2, -0.26, 0.06), 78, 0.2, 0.0045,
      (u) => (u < 0.18 ? 0.06 + 0.1 * Math.abs(Math.sin(u * 60)) : Math.sin((Math.PI * (u - 0.18)) / 0.82) ** 1.3 * (0.6 + 0.4 * Math.sin(u * 19))), 1),
    wave(new Vector3(-0.08, -0.43, 0.1), new Vector3(O_AT.x - 0.05, -0.36, 0.1), 54, 0.34, 0.006,
      (u) => (0.15 + 0.85 * u ** 1.6) * (0.55 + 0.45 * Math.sin(u * 23 + 1)) * (u > 0.93 ? (1 - u) / 0.07 : 1), 2),
  ];
  const dummy = new Object3D();

  // ---- light in the air: a soft dot for the streams and specks, square pixels by Punto ----
  function dotTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
  }
  const dot = dotTexture();
  interface Cloud { points: Points; pos: Float32Array; col: Float32Array }
  function cloud(n: number, size: number, map: CanvasTexture | null): Cloud {
    const geo = new BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const points = new Points(geo, new PointsMaterial({ size, map, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    points.frustumCulled = false;
    logo.add(points);
    return { points, pos, col };
  }
  const touched = (c: Cloud) => {
    c.points.geometry.attributes.position.needsUpdate = true;
    c.points.geometry.attributes.color.needsUpdate = true;
  };

  // the streams: strands of light from over the T, arcing right round Punto and curling down
  const PATH = new CatmullRomCurve3([
    new Vector3(0.08, 0.64, 0.12), new Vector3(0.45, 0.74, 0.1), new Vector3(0.88, 0.62, 0.1), new Vector3(1.12, 0.3, 0.14),
    new Vector3(1.14, -0.06, 0.1), new Vector3(0.95, -0.36, 0.04), new Vector3(0.7, -0.5, 0.0),
  ]);
  const TABLE = 256;
  const pathAt = new Float32Array(TABLE * 3);
  {
    const p = new Vector3();
    for (let i = 0; i < TABLE; i++) { PATH.getPointAt(i / (TABLE - 1), p); pathAt.set([p.x, p.y, p.z], i * 3); }
  }
  const STREAM = 700;
  const stream = cloud(STREAM, 0.012, dot);
  const sU = new Float32Array(STREAM), sV = new Float32Array(STREAM), sOff = new Float32Array(STREAM * 3), sB = new Float32Array(STREAM);
  for (let i = 0; i < STREAM; i++) {
    sU[i] = Math.random();
    sV[i] = 0.08 + Math.random() * 0.1;
    const strand = i % 7; // seven strands, each its own offset from the path, spreading towards the end
    const a = strand * 0.9 + (Math.random() - 0.5) * 0.25;
    sOff.set([Math.cos(a) * (0.02 + strand * 0.012), Math.sin(a) * (0.02 + strand * 0.012), (Math.random() - 0.5) * 0.12], i * 3);
    sB[i] = Math.random() < 0.08 ? 1.6 : 0.35 + Math.random() * 0.6;
  }
  // and the strands themselves: thin lines along the path, spreading towards its end, with pulses of light running along
  const STRANDS = 14, SEG = 160;
  const strandCol: Float32Array[] = [];
  const strandMat = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let s = 0; s < STRANDS; s++) {
    const pos = new Float32Array(SEG * 3), col = new Float32Array(SEG * 3);
    const a = s * 2.39, r = 0.012 + (s % 5) * 0.011, dz = ((s * 7) % 5 - 2) * 0.03;
    for (let j = 0; j < SEG; j++) {
      const u = j / (SEG - 1), f = u * (TABLE - 1), i0 = Math.floor(f), i1 = Math.min(TABLE - 1, i0 + 1), t = f - i0;
      const spread = 0.3 + 2.2 * u * u, wob = Math.sin(u * 9 + s) * 0.008;
      pos[j * 3] = mix(pathAt[i0 * 3], pathAt[i1 * 3], t) + Math.cos(a) * r * spread + wob;
      pos[j * 3 + 1] = mix(pathAt[i0 * 3 + 1], pathAt[i1 * 3 + 1], t) + Math.sin(a) * r * spread;
      pos[j * 3 + 2] = mix(pathAt[i0 * 3 + 2], pathAt[i1 * 3 + 2], t) + dz * spread;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const line = new Line(geo, strandMat);
    line.frustumCulled = false;
    logo.add(line);
    strandCol.push(col);
  }
  // the orange sparkler over the T, and its thin trail up into the streams
  const SPARKS = 140;
  const sparks = cloud(SPARKS, 0.022, dot);
  const SPARK_AT = new Vector3(0.04, 0.6, 0.16); // over the T, in front of the letters
  const flareMat = new MeshBasicMaterial({ map: dot, color: 0xffa040, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  const flare = new Mesh(new PlaneGeometry(0.16, 0.16), flareMat);
  flare.position.copy(SPARK_AT);
  logo.add(flare);
  const kP = new Float32Array(SPARKS * 3), kV = new Float32Array(SPARKS * 3), kL = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) kL[i] = -Math.random();
  // orange specks drifting low on the left, cyan pixels by Punto
  const SPECKS = 26;
  const specks = cloud(SPECKS, 0.032, dot);
  const speckAt = new Float32Array(SPECKS * 3);
  for (let i = 0; i < SPECKS; i++) speckAt.set([-1.0 + Math.random() * 0.75, -0.62 + Math.random() * 0.42, 0.05 + Math.random() * 0.1], i * 3);
  const PIXELS = 34;
  const pixels = cloud(PIXELS, 0.014, null);
  const pixelAt = new Float32Array(PIXELS * 3);
  for (let i = 0; i < PIXELS; i++) pixelAt.set([-0.25 + Math.random() * 0.45, -0.32 + Math.random() * 0.3, 0.08 + Math.random() * 0.06], i * 3);
  // the cyan below the letters lights their undersides, as the glow does in the art
  const under = new PointLight(CYAN, 0, 2.2, 1.5);
  under.position.set(-0.4, -0.35, 0.35);
  logo.add(under);

  // ---- the show ----
  type Phase = 'off' | 'typing' | 'tada' | 'out' | 'erasing' | 'working';
  let phase: Phase = 'off';
  let clock = 0;
  let speed = 1;
  let kb = 0;
  let lit = 0; // the streams, waves, sparks: 0 off .. 1 on
  let neonOn = 0;
  let neonCount = 0;
  let neonAt = 0; // when the last neon letter was typed
  interface Press { t: number; key: Key; hand: 0 | 1; letter: Letter | null; neon: number; done: boolean; erase?: boolean; idle?: boolean }
  let presses: Press[] = [];
  let tadaAt = 0;
  let outAt = 0;
  let eraseEnd = 0;
  let workEnd = 0;
  const FLY = 0.38;
  const PRESS = 0.075;
  const eye = new Vector3();
  const look = new Vector3();
  const tmp = new Vector3();
  const lift = new Vector3();
  const handAt = [new Vector3(), new Vector3()];
  const handGoal = [new Vector3(), new Vector3()];
  const HOME = [keys.get('f')!, keys.get('j')!];
  const KEYS_FOR = ['p', 'u', 'n', 't', 'o'];
  const UP_R: [number, number, number] = [0, 0, -0.3];
  const HANDS = [0, 1] as const;

  function over(i: 0 | 1, key: Key, dip: number): void {
    handGoal[i].set(key.x, CAP_Y + 0.011 - dip * 0.006, key.z - 0.013);
    keyboard.localToWorld(handGoal[i]);
  }

  function start(slow = false): void {
    speed = slow ? 0.4 : 1;
    if (options.place !== false) {
      world.camera.getWorldPosition(eye);
      logo.position.set(eye.x + 0.05, eye.y - 0.08, eye.z - 2.4);
      logo.lookAt(eye);
    }
    logo.updateMatrixWorld(true);
    punto.object.rotation.set(0, 0, 0); // faces the player, as the logo does
    // PUNTO key by key, a breath, then the line under it at a run — trrrr
    presses = letters.map((letter, n) => {
      const key = keys.get(KEYS_FOR[n])!;
      return { t: 0.55 + n * 0.24, key, hand: (key.x >= 0 ? 0 : 1) as 0 | 1, letter, neon: -1, done: false };
    });
    let t = presses[presses.length - 1].t + FLY + 0.2, last: 0 | 1 = 1;
    [...NEON].forEach((ch, i) => {
      const key = keyFor(ch);
      const hand: 0 | 1 = ch === ' ' ? ((1 - last) as 0 | 1) : key.x >= 0 ? 0 : 1;
      presses.push({ t, key, hand, letter: null, neon: i, done: false });
      last = hand;
      t += ch === ' ' ? 0.035 : ch === '.' ? 0.09 : 0.048;
    });
    for (const l of letters) { l.t0 = -1; l.out = -1; l.node.visible = false; }
    tadaAt = t + 0.25;
    neonCount = 0;
    drawNeon(0, 0);
    clock = 0;
    lit = 0;
    neonOn = 0;
    phase = 'typing';
    punto.joy = false;
    punto.setState('idle');
    punto.chirp('key');
    keyboard.visible = true;
    punto.object.updateMatrixWorld(true);
    for (const i of HANDS) {
      over(i, HOME[i], 0);
      handAt[i].copy(handGoal[i]);
      punto.grip(i, handAt[i], [1.35, 0, 0.25]);
    }
    options.say?.('PUNTO по клавише, потом неоновая строка — трррр, потом «та-да» и шлейфы. «Сказал» — как будто игрок заговорил.');
  }

  function said(): void {
    if (phase === 'off' || phase === 'out') return;
    phase = 'out';
    outAt = clock;
    letters.forEach((l, n) => (l.out = clock + n * 0.05));
    punto.joy = false;
    punto.grip(0, null);
    punto.grip(1, null);
    punto.setState('listen');
    options.say?.('Всё ушло — Punto слушает и дальше строит то, что сказали.');
  }

  /** Punto works at his keyboard for `seconds` (making things): keys struck at a run, nothing typed; then the ta-da. */
  function work(seconds: number): void {
    if (phase !== 'tada') return;
    phase = 'working';
    punto.joy = false;
    punto.setState('idle');
    for (const i of HANDS) punto.grip(i, handAt[i], [1.35, 0, 0.25]);
    const all = [...keys.values()];
    let t = clock + 0.4;
    presses = [];
    workEnd = clock + seconds;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    while (t < workEnd - 0.35) {
      const key = all[Math.floor(rnd() * all.length)];
      presses.push({ t, key, hand: key.x >= 0 ? 0 : 1, letter: null, neon: -1, done: false, idle: true });
      t += 0.07 + rnd() * 0.09;
    }
    options.say?.('Работает: печатает — и по его печати собираются вещи.');
  }

  /** Wipes it as with backspace: the neon line letter by letter from its end (held: fast), then O, T, N, U, P. */
  function erase(): void {
    if (phase !== 'tada') return;
    phase = 'erasing';
    punto.joy = false;
    punto.setState('idle');
    // the hands back on the keys as for typing (from up beside his head they glide down; the right one on backspace)
    for (const i of HANDS) punto.grip(i, handAt[i], [1.35, 0, 0.25]);
    let t = clock + 0.4; // the keyboard comes back first
    presses = [];
    for (let i = neonCount - 1; i >= 0; i--) {
      if (NEON[i] === ' ') continue;
      presses.push({ t, key: backspace, hand: 1, letter: null, neon: i, done: false, erase: true });
      t += 0.06;
    }
    t += 0.3;
    for (let n = letters.length - 1; n >= 0; n--) {
      if (letters[n].t0 < 0) continue;
      presses.push({ t, key: backspace, hand: 1, letter: letters[n], neon: -1, done: false, erase: true });
      t += 0.28;
    }
    eraseEnd = t + 0.45;
    neonAt = -1;
    options.say?.('Стирает: Backspace — подпись с конца, потом буквы.');
  }

  // the neon lights up as a real sign does: a few stutters, then steady
  const FLICKER = [0.06, 0.1, 0.18, 0.22];
  const neonLevel = (u: number) => {
    if (u >= 0.25) return 1;
    let on = true;
    for (let i = 0; i < FLICKER.length && FLICKER[i] <= u; i++) on = !on;
    return on ? 0.85 : 0.08;
  };

  function update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05) * speed;
    clock += dt;
    world.camera.getWorldPosition(eye);
    const want = phase === 'typing' || phase === 'erasing' || phase === 'working' ? 1 : 0;
    kb = want > kb ? Math.min(1, kb + dt / 0.35) : Math.max(0, kb - dt / 0.3);
    keyboard.scale.setScalar(Math.max(0.001, want ? backOut(kb) : kb * kb));
    keyboard.visible = kb > 0;
    keyboard.updateMatrixWorld(true);
    look.copy(eye);

    if (phase === 'typing' || phase === 'erasing' || phase === 'working') {
      for (const i of HANDS) {
        let next: Press | null = null;
        for (const p of presses) if (p.hand === i && p.t + PRESS >= clock) { next = p; break; }
        const u = next ? (clock - next.t) / PRESS : -1;
        over(i, next && next.t - clock < 0.5 ? next.key : HOME[i], u >= 0 && u <= 1 ? Math.sin(Math.PI * u) : 0);
        handAt[i].lerp(handGoal[i], 1 - Math.exp(-dt * 30));
      }
      let watching = false;
      for (const p of presses) {
        const down = clock >= p.t && clock <= p.t + PRESS;
        p.key.mesh.position.y = CAP_Y - (down ? 0.0016 : 0);
        p.key.mesh.material = clock > p.t && clock < p.t + PRESS + 0.12 ? litMat : capMat;
        if (!p.done && clock >= p.t) {
          p.done = true;
          punto.tap(p.hand); // a finger strikes the key
          p.key.mesh.getWorldPosition(tmp);
          sfx(world, 'click', tmp, p.letter ? 0.4 : 0.16);
          if (p.idle) {
            // working: a key struck, nothing typed
          } else if (p.erase) {
            // backspace: the last neon letter goes, or (the line gone) the last big letter pops away
            if (p.letter) p.letter.out = clock;
            else neonCount = p.neon;
          } else if (p.letter) {
            p.letter.t0 = clock;
            logo.worldToLocal(p.letter.start.copy(tmp));
            logo.localToWorld(tmp.copy(p.letter.end));
            punto.sendPixels(tmp, p.hand);
          } else {
            neonCount = p.neon + 1;
            neonAt = clock;
            // every other letter a little burst of his pixels to it
            if (p.neon % 2 === 0) punto.sendPixels(neon.localToWorld(tmp.set(((neonMid[p.neon] - 1024) / 2048) * NEON_W, 0, 0)), p.hand);
          }
        }
        if (!p.done && !watching) { p.key.mesh.getWorldPosition(look); watching = true; } // he watches the next key
      }
      if (phase === 'working' && clock >= workEnd) {
        // back to the ta-da, its hands up (the neon not flickering again)
        phase = 'tada';
        tadaAt = clock - 10;
        for (const k of keys.values()) k.mesh.material = capMat;
        punto.joy = true;
      }
      if (phase === 'erasing' && clock >= eraseEnd) {
        phase = 'off';
        for (const k of keys.values()) k.mesh.material = capMat;
        backspace.mesh.material = capMat;
      }
      if (phase === 'typing' && clock >= tadaAt) {
        phase = 'tada';
        for (const k of keys.values()) k.mesh.material = capMat;
        punto.joy = true;
        punto.chirp('glad');
        sfx(world, 'computerNoise', undefined, 0.25);
      }
    }

    // ta-da: both hands up beside his head, waving a little
    if (phase === 'tada') {
      punto.object.updateMatrixWorld(true);
      for (const i of HANDS) {
        const side = i === 0 ? 1 : -1;
        const w = Math.sin(time * 7 + i * 1.3);
        handGoal[i].set(side * (0.09 + w * 0.01), 0.03 + Math.abs(w) * 0.005, 0.04); // just outside his head, palms out
        punto.object.localToWorld(handGoal[i]);
        handAt[i].lerp(handGoal[i], 1 - Math.exp(-dt * 12));
        UP_R[2] = -0.3 + w * 0.25;
        punto.grip(i, handAt[i], UP_R, 0); // open hands, fingers spread, as in the art
      }
    }

    lit += ((phase === 'tada' ? 1 : 0) - lit) * (1 - Math.exp(-dt * (phase === 'out' ? 8 : 3)));
    // the neon: on as he types it, one stutter of the whole sign at the ta-da, off when it all goes
    neonOn = phase === 'out' || phase === 'off' ? Math.max(0, neonOn - dt * 5) : phase === 'tada' ? neonLevel(Math.max(0, clock - tadaAt - 0.1)) : 1;
    drawNeon(neonCount, clock - neonAt < 0.09 ? 1 : 0);
    neonMat.opacity = neonOn;
    under.intensity = 1.6 * lit;

    // the letters: from the key in an arc to their place, a pop past full size, a wobble; then a slow bob
    for (let n = 0; n < letters.length; n++) {
      const l = letters[n];
      const node = l.node;
      if (l.t0 < 0) { node.visible = false; continue; }
      node.visible = true;
      const age = clock - l.t0;
      const u = clamp01(age / FLY);
      const e = 1 - (1 - u) ** 3;
      lift.copy(l.start).lerp(l.end, 0.5);
      lift.y += l.hop;
      node.position.copy(l.start).multiplyScalar((1 - e) * (1 - e)).addScaledVector(lift, 2 * e * (1 - e)).addScaledVector(l.end, e * e);
      node.rotation.y = -2.4 * (1 - u) ** 2;
      const settled = Math.max(0, age - FLY);
      node.rotation.z = l.turn + Math.sin(settled * 24) * Math.exp(-settled * 6) * 0.2;
      node.position.y += Math.sin(time * 1.7 - n * 0.6) * 0.008 * clamp01(settled);
      let s = mix(0.12, 1, backOut(u));
      if (phase === 'out' || (phase === 'erasing' && l.out >= 0)) {
        const o = clamp01((clock - l.out) / 0.26);
        s = o < 0.35 ? mix(1, 1.18, o / 0.35) : mix(1.18, 0, (o - 0.35) / 0.65);
        if (o >= 1) { node.visible = false; l.t0 = -1; sfx(world, 'tick', logo.localToWorld(tmp.copy(l.end)), 0.2); }
      }
      node.scale.setScalar(Math.max(0.001, s) * (n === 4 ? 1.05 : 1));
    }

    // the waves: bars along each line, their heights alive
    waveMat.opacity = 0.95 * lit;
    waveGlowMat.opacity = 0.22 * lit;
    for (const w of waves) {
      for (let i = 0; i < w.n; i++) {
        const u = i / (w.n - 1);
        const live = 0.45 + 0.55 * Math.abs(Math.sin(time * 8.3 + i * 0.71 + w.seed) * Math.sin(time * 3.1 + i * 0.23 + w.seed * 2));
        const h = Math.max(0.004, w.tall * w.env(u) * live * lit);
        dummy.position.lerpVectors(w.from, w.to, u);
        dummy.scale.set(w.width, h, 1);
        dummy.updateMatrix();
        w.core.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(w.width * 5, h * 1.15, 1);
        dummy.updateMatrix();
        w.glow.setMatrixAt(i, dummy.matrix);
      }
      w.core.instanceMatrix.needsUpdate = true;
      w.glow.instanceMatrix.needsUpdate = true;
    }

    // the streams flow along the path, fading in at its start and out at its end
    for (let i = 0; i < STREAM; i++) {
      sU[i] = (sU[i] + sV[i] * dt) % 1;
      const f = sU[i] * (TABLE - 1), a = Math.floor(f), b = Math.min(TABLE - 1, a + 1), t = f - a;
      const spread = 0.4 + 1.6 * sU[i];
      for (let c = 0; c < 3; c++) stream.pos[i * 3 + c] = mix(pathAt[a * 3 + c], pathAt[b * 3 + c], t) + sOff[i * 3 + c] * spread;
      const fade = sstep(sU[i] / 0.12) * sstep((1 - sU[i]) / 0.25) * lit * sB[i];
      stream.col[i * 3] = 0.35 * fade;
      stream.col[i * 3 + 1] = 0.85 * fade;
      stream.col[i * 3 + 2] = 1.0 * fade;
    }
    touched(stream);
    for (let s = 0; s < STRANDS; s++) {
      const col = strandCol[s];
      for (let j = 0; j < SEG; j++) {
        const u = j / (SEG - 1);
        const pulse = Math.max(0, Math.sin((u * 5 - time * 0.9 + s * 0.37) * Math.PI * 2)) ** 6;
        const k = sstep(u / 0.15) * sstep((1 - u) / 0.3) * lit * (0.18 + 0.9 * pulse) * (s % 4 === 0 ? 1.3 : 0.8);
        col[j * 3] = 0.3 * k;
        col[j * 3 + 1] = 0.85 * k;
        col[j * 3 + 2] = 1.0 * k;
      }
    }
    for (const line of logo.children) if (line instanceof Line) line.geometry.attributes.color.needsUpdate = true;
    flareMat.opacity = lit * (0.75 + 0.25 * Math.sin(time * 23) * Math.sin(time * 7));
    flare.scale.setScalar(0.8 + 0.3 * Math.abs(Math.sin(time * 13)));

    // the sparkler: short-lived orange sparks spraying out of one point, falling a little; every fifth flies
    // up and right, the thin orange trail into the streams
    for (let i = 0; i < SPARKS; i++) {
      kL[i] -= dt * 1.6;
      if (kL[i] <= 0) {
        if (lit < 0.3) { sparks.col[i * 3] = sparks.col[i * 3 + 1] = sparks.col[i * 3 + 2] = 0; continue; }
        kL[i] += 1;
        kP[i * 3] = SPARK_AT.x; kP[i * 3 + 1] = SPARK_AT.y; kP[i * 3 + 2] = SPARK_AT.z;
        const a = Math.random() * Math.PI * 2, v = 0.15 + Math.random() * 0.45;
        kV[i * 3] = i % 5 === 0 ? 0.35 + Math.random() * 0.2 : Math.cos(a) * v;
        kV[i * 3 + 1] = i % 5 === 0 ? 0.3 + Math.random() * 0.1 : Math.sin(a) * v * 0.8 + 0.12;
        kV[i * 3 + 2] = i % 5 === 0 ? 0 : (Math.random() - 0.5) * 0.2;
      }
      kV[i * 3 + 1] -= 0.35 * dt;
      for (let c = 0; c < 3; c++) { kP[i * 3 + c] += kV[i * 3 + c] * dt; sparks.pos[i * 3 + c] = kP[i * 3 + c]; }
      const life = kL[i] * lit;
      sparks.col[i * 3] = 1.0 * life;
      sparks.col[i * 3 + 1] = 0.55 * life;
      sparks.col[i * 3 + 2] = 0.15 * life;
    }
    touched(sparks);

    for (let i = 0; i < SPECKS; i++) {
      specks.pos[i * 3] = speckAt[i * 3] + Math.sin(time * 0.4 + i) * 0.02;
      specks.pos[i * 3 + 1] = speckAt[i * 3 + 1] + Math.sin(time * 0.33 + i * 2.1) * 0.025;
      specks.pos[i * 3 + 2] = speckAt[i * 3 + 2];
      const tw = (0.5 + 0.5 * Math.sin(time * 2.3 + i * 1.7)) * lit;
      specks.col[i * 3] = 1.0 * tw;
      specks.col[i * 3 + 1] = 0.62 * tw;
      specks.col[i * 3 + 2] = 0.25 * tw;
    }
    touched(specks);
    for (let i = 0; i < PIXELS; i++) {
      pixels.pos[i * 3] = pixelAt[i * 3];
      pixels.pos[i * 3 + 1] = pixelAt[i * 3 + 1] + Math.sin(time + i) * 0.01;
      pixels.pos[i * 3 + 2] = pixelAt[i * 3 + 2];
      const on = (Math.sin(time * 5.1 + i * 2.7) > 0.2 ? 1 : 0.15) * lit;
      pixels.col[i * 3] = 0.25 * on;
      pixels.col[i * 3 + 1] = 0.85 * on;
      pixels.col[i * 3 + 2] = 1.0 * on;
    }
    touched(pixels);

    if (phase === 'out' && clock - outAt > 1.4) phase = 'off';
    punto.update(dt, time, punto.object.worldToLocal(tmp.copy(look)));
  }
  if (options.effects === false) {
    // the background draws its own waves and streams: only the letters, Punto and the neon stay
    logo.traverse((o) => {
      if (o instanceof Points || o instanceof Line || o instanceof InstancedMesh || (o instanceof Mesh && o.material === flareMat)) o.visible = false;
    });
    under.visible = false;
  }
  return { logo, punto, neon, start, said, erase, work, update, state: () => ({ phase, clock: +clock.toFixed(2), tadaAt: +tadaAt.toFixed(2), shown: letters.filter((l) => l.node.visible).length }) };
}
