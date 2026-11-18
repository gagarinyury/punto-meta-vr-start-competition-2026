// The splash art's background drawn in code (Yury, 15.11), so the picture can go (all but the boy) and the page
// gets depth: a warped tunnel of glowing grid walls and floor running to a vanishing point, HUD frames, a tilted
// «window» of stars and running code above, the vortex of light streams on the right, the boy's voice wave,
// drifting orange specks. Lines and glows are additive and fade with distance.
// createBackdrop(at) — at(x, y, depth) turns a point of the art (2576 × 1438 pixels) at a depth into the
// camera's space; place(at) again after the page is resized; update(time) every frame.
import { AdditiveBlending, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Points, PointsMaterial, SRGBColorSpace, TubeGeometry, Vector3 } from '@iwsdk/core';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bake } from './bake.js';

export type ArtPoint = (x: number, y: number, depth: number) => Vector3;
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const lineMat = (opacity: number) => new LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

/** Lines from pairs of points, each vertex coloured by how far it is (fading into the dark). */
function fadingLines(pairs: number[], base: Color, near: number, far: number, opacity: number): LineSegments {
  const colors: number[] = [], c = new Color();
  for (let i = 0; i < pairs.length; i += 3) {
    const d = Math.hypot(pairs[i], pairs[i + 1], pairs[i + 2]);
    const k = Math.max(0, Math.min(1, 1 - (d - near) / (far - near)));
    c.copy(base).multiplyScalar(k * k * (0.25 + 0.75 * k));
    colors.push(c.r, c.g, c.b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pairs, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new LineSegments(g, lineMat(opacity));
}

/**
 * The tunnel, in its own space: its axis along -Z from the eye, the eye at (0, 0, 0) a little above and right of
 * the axis. A wall is a grid on a warped tube; the top is left open (the art has its window and panels there).
 */
function tunnel(): Group {
  const g = new Group();
  g.name = 'Tunnel';
  const R = 2.7, AX = -0.35, AY = -0.75; // the axis, relative to the eye
  const radius = (a: number, z: number) => R * (1 + 0.07 * Math.sin(3 * a + z * 0.35) + 0.05 * Math.sin(z * 0.55 + 1.3) + 0.12 * Math.exp(-((a - 2.9) ** 2) * 3) * Math.sin(z * 0.4 + 2));
  const point = (a: number, z: number, out: number[]) => { const r = radius(a, z); out.push(AX + Math.cos(a) * r, AY + Math.sin(a) * r, -z); };
  // the open top: no wall from 50° to 125° (the window and the panels are there)
  const OPEN0 = (50 * Math.PI) / 180, OPEN1 = (125 * Math.PI) / 180;
  const walls: [string, number, number, number, number, number][] = [
    // name, from angle, to angle, lines along (count), rings step (first), colour
    ['LeftWall', OPEN1, Math.PI * 1.25, 34, 0.5, 0x3aa8ff],
    ['Floor', Math.PI * 1.25, Math.PI * 1.85, 30, 0.7, 0x2f8cf0],
    ['RightWall', -0.15 * Math.PI, OPEN0, 16, 0.9, 0x3aa8ff],
  ];
  for (const [name, a0, a1, along, step, color] of walls) {
    const pairs: number[] = [];
    const Z0 = 0.6, Z1 = 24;
    // lines along the tunnel
    for (let i = 0; i <= along; i++) {
      const a = a0 + ((a1 - a0) * i) / along;
      for (let z = Z0; z < Z1; z += 0.5) { point(a, z, pairs); point(a, z + 0.5, pairs); }
    }
    // rings across, closer together near the eye than far (their spacing grows)
    for (let z = Z0, s = step; z < Z1; z += s, s *= 1.06) {
      for (let k = 0; k < 40; k++) { point(a0 + ((a1 - a0) * k) / 40, z, pairs); point(a0 + ((a1 - a0) * (k + 1)) / 40, z, pairs); }
    }
    // they die out well before the vanishing point: there the art has a soft haze, not lines meeting
    const l = fadingLines(pairs, new Color(color), 1, 14, 0.85);
    l.name = name;
    g.add(l);
  }
  return g;
}

/**
 * The window overhead: deep blue glass with stars (drawn once), and over them a matrix rain — columns of
 * characters falling, a bright head and a fading tail — redrawn as it falls (tick()).
 */
function windowTexture(): { texture: CanvasTexture; tick(time: number): void } {
  const W = 1024, H = 512, r = rng(11);
  const sky = document.createElement('canvas');
  sky.width = W; sky.height = H;
  const sg = sky.getContext('2d')!;
  const grad = sg.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1d4fa8');
  grad.addColorStop(1, '#0f2c70');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { // stars, most on the left
    const x = r() ** 1.6 * W, y = r() * H, sz = r() < 0.08 ? 2.2 : 1;
    sg.fillStyle = `rgba(220,240,255,${0.4 + r() * 0.6})`;
    sg.fillRect(x, y, sz, sz);
  }
  sg.strokeStyle = 'rgba(120,220,255,0.9)';
  sg.lineWidth = 6;
  sg.strokeRect(3, 3, W - 6, H - 6);
  // the rain on a layer of its own: each tick its old marks fade a little, the heads move on a row
  const rain = document.createElement('canvas');
  rain.width = W; rain.height = H;
  const rg = rain.getContext('2d')!;
  rg.font = 'bold 28px monospace';
  const COL = 26, GLYPHS = '01アイウエオカキクケコ{}<>/=;:$#*';
  const cols = Array.from({ length: Math.floor(W / COL) }, (_, i) => ({ x: i * COL + 2, y: r() * H, speed: 70 + r() * 140, dense: i * COL > W * 0.3 || r() < 0.3 }));
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const og = out.getContext('2d')!;
  const texture = new CanvasTexture(out);
  texture.colorSpace = SRGBColorSpace;
  let last = -1;
  function tick(time: number): void {
    if (last >= 0 && time - last < 1 / 30) return;
    const dt = last < 0 ? 0 : Math.min(0.1, time - last);
    last = time;
    rg.globalCompositeOperation = 'destination-out';
    rg.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 1.6)})`;
    rg.fillRect(0, 0, W, H);
    rg.globalCompositeOperation = 'source-over';
    for (const c of cols) {
      if (!c.dense) continue;
      const before = Math.floor(c.y / 30);
      c.y += c.speed * dt;
      if (c.y > H + 40) { c.y = -20 - r() * 200; c.speed = 70 + r() * 140; }
      if (Math.floor(c.y / 30) !== before || dt === 0) {
        rg.fillStyle = 'rgba(210,250,255,0.95)';
        rg.fillText(GLYPHS[Math.floor(r() * GLYPHS.length)], c.x, c.y);
        // the one just above turns from white to the trail's cyan
        rg.fillStyle = 'rgba(90,210,255,0.85)';
        rg.fillText(GLYPHS[Math.floor(r() * GLYPHS.length)], c.x, c.y - 30);
      }
    }
    og.drawImage(sky, 0, 0);
    og.drawImage(rain, 0, 0);
    texture.needsUpdate = true;
  }
  tick(0);
  return { texture, tick };
}

/** A quad through four points (top-left, top-right, bottom-right, bottom-left), its texture across it. */
function quad(geo: BufferGeometry, p: Vector3[]): void {
  const v = [p[3], p[2], p[0], p[1]];
  geo.setAttribute('position', new Float32BufferAttribute(v.flatMap((q) => [q.x, q.y, q.z]), 3));
  geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  geo.computeVertexNormals();
}

/** A HUD frame: a thin glowing outline and a faint fill, w × h, facing +Z. */
function frame(w: number, h: number): Group {
  const g = new Group();
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const pairs = pts.flatMap((p, i) => [...p, 0, ...pts[(i + 1) % 4], 0]);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pairs, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
  g.add(new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: 0x1a4a90, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })));
  return g;
}

// The streams of light, as the art draws them (read off it at its 2576 × 1438 scale): from the orange burst over
// the T, right and round behind Punto's right hand in a loop, back under him, and into the wire Punto. [x, y, depth]
const LOOP: [number, number, number][] = [
  [1503, 317, 5.2], [1579, 256, 5], [1714, 196, 4.8], [1895, 226, 4.5], [2060, 290, 4.2], [2205, 380, 4], [2300, 495, 3.9],
  [2315, 600, 3.8], [2262, 672, 3.6],
];
// after the loop the bundle parts: one branch runs back under Punto into the wire Punto, the other down into the
// castle, where it blows up behind the left tower (the art's spray of sparks there)
const TO_WIRE: [number, number, number][] = [...LOOP, [2160, 736, 3.4], [2025, 798, 3.2], [1880, 844, 3.1], [1714, 867, 3.1], [1564, 875, 3.2], [1443, 890, 3.3]];
// the point it hits sits behind the wall between the towers: the castle hides it, only the sparks and the glow rise over
const BLAST: [number, number, number] = [2200, 1095, 3.75];
const TO_CASTLE: [number, number, number][] = [...LOOP, [2245, 740, 3.6], [2228, 830, 3.65], [2212, 960, 3.7], BLAST];
const STRANDS = 12, FLOW = 600;

/** One bundle of thin glowing strands along a curve, spread apart in its middle, close at its ends; light flows down it. */
function streams(): { group: Group; build(path: Vector3[]): void; update(time: number, reveal: number): void } {
  const group = new Group();
  group.name = 'Streams';
  const r = rng(23), seeds = Array.from({ length: STRANDS }, () => [r() * 2 - 1, r() * 2 - 1, r() * 6.28, 0.5 + r() * 0.5]);
  let curve: CatmullRomCurve3 | null = null, spread = 0.1;
  const flowPos = new Float32Array(FLOW * 3), flowT = Float32Array.from({ length: FLOW }, () => r()), flowLane = Float32Array.from({ length: FLOW }, () => r() * 2 - 1);
  const flowGeo = new BufferGeometry();
  flowGeo.setAttribute('position', new Float32BufferAttribute(flowPos, 3));
  const flow = new Points(flowGeo, new PointsMaterial({ color: 0xbff4ff, size: 0.022, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  flow.name = 'Flow';
  flow.frustumCulled = false;
  // all 12 strands one mesh, all 12 halos another (18.11: 24 draws a bundle were 48 of the poster's ~1000): each
  // strand's colour and opacity in its vertices (RGBA: the opacity as alpha, as the material had it — folded into the
  // colour it came out brighter, the colour goes to sRGB before the blend), and the bundle grows along its path in
  // the shader — a vertex's way along its tube (the tube's u) against uReveal — where each tube's draw range did it
  const reveal = { value: 0 };
  const grown = (m: MeshBasicMaterial) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uReveal = reveal;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float along;\nvarying float vAlong;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlong;\nuniform float uReveal;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vAlong > uReveal) discard;');
    };
    m.customProgramCacheKey = () => 'punto-stream';
    return m;
  };
  const strandMat = grown(new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  const haloMat = grown(new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  const tint = new Color();
  /** A tube with its light baked in: colour and opacity per vertex, and how far along it each vertex is. */
  const lit = (g: TubeGeometry, hex: number, opacity: number): BufferGeometry => {
    const n = g.attributes.position.count, col = new Float32Array(n * 4), along = new Float32Array(n), uv = g.attributes.uv;
    tint.setHex(hex);
    for (let i = 0; i < n; i++) { col[i * 4] = tint.r; col[i * 4 + 1] = tint.g; col[i * 4 + 2] = tint.b; col[i * 4 + 3] = opacity; along[i] = uv.getX(i); }
    g.setAttribute('color', new Float32BufferAttribute(col, 4));
    g.setAttribute('along', new Float32BufferAttribute(along, 1));
    return g;
  };
  const side = new Vector3(), tan = new Vector3(), p = new Vector3();
  /** A point on the bundle: t along it, lane −1..1 across it (in the picture's plane, across the curve). */
  const at = (t: number, lane: number, wob: number, out: Vector3) => {
    curve!.getPointAt(t, out);
    curve!.getTangentAt(t, tan);
    side.set(-tan.y, tan.x, 0).normalize();
    const width = Math.sin(Math.PI * t) ** 0.8 * spread; // narrow at both ends
    return out.addScaledVector(side, lane * width + Math.sin(t * 9 + wob) * width * 0.15);
  };
  function build(path: Vector3[]): void {
    for (const ch of [...group.children]) { group.remove(ch); if (ch instanceof Mesh) ch.geometry.dispose(); }
    curve = new CatmullRomCurve3(path);
    spread = path[0].distanceTo(path[path.length - 1]) * 0.075;
    const strands: BufferGeometry[] = [], halos: BufferGeometry[] = [];
    seeds.forEach(([lane, wl, wob, bright], k) => {
      const pts = Array.from({ length: 160 }, (_, i) => at(i / 159, lane * 0.9 + Math.sin(i * 0.04 + wl * 3) * 0.1, wob, new Vector3()));
      const c = new CatmullRomCurve3(pts), core = k === 4;
      strands.push(lit(new TubeGeometry(c, 400, core ? 0.006 : 0.0025 + bright * 0.002, 4, false), core ? 0xeafcff : 0x5fd8ff, core ? 1 : 0.55 + bright * 0.4));
      halos.push(lit(new TubeGeometry(c, 200, core ? 0.03 : 0.014, 5, false), 0x1aa8ff, core ? 0.18 : 0.07));
    });
    const strand = new Mesh(mergeGeometries(strands), strandMat), halo = new Mesh(mergeGeometries(halos), haloMat);
    for (const g of [...strands, ...halos]) g.dispose();
    strand.name = 'Strands'; halo.name = 'Halos';
    group.add(strand, halo);
    group.add(flow);
  }
  /** reveal 0..1: how far along its path the bundle has grown (a tube's triangles run from its start to its end). */
  function update(time: number, grow: number): void {
    if (!curve) return;
    group.visible = grow > 0.001;
    reveal.value = grow;
    for (let i = 0; i < FLOW; i++) {
      const t = (flowT[i] + time * 0.06 * (0.7 + (i % 5) * 0.12)) % 1;
      at(t * grow, flowLane[i], i, p);
      flowPos[i * 3] = p.x; flowPos[i * 3 + 1] = p.y; flowPos[i * 3 + 2] = p.z;
    }
    flowGeo.getAttribute('position').needsUpdate = true;
  }
  return { group, build, update };
}

/** A burst of short glowing streaks out from a point (sparks), in its own space, ~1 across. */
function burst(count: number, color: number, seed: number, from: number, to: number, arc: [number, number] = [0, Math.PI * 2]): Group {
  const g = new Group(), r = rng(seed), geo = new PlaneGeometry(1, 1), mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let i = 0; i < count; i++) {
    const a = arc[0] + r() * (arc[1] - arc[0]), d = from + r() * (to - from), len = 0.03 + r() * 0.08;
    const m = new Mesh(geo, mat);
    m.position.set(Math.cos(a) * d, Math.sin(a) * d, 0);
    m.rotation.z = a;
    m.scale.set(len, 0.006 + r() * 0.004, 1);
    g.add(m);
  }
  return g;
}

/**
 * The blast behind the castle, in its own space (~1 across, facing +Z): a pulsing white-orange core, a fountain of
 * sparks flying out in a fan (each on its own beat, so it never stops), embers falling under their weight.
 */
function explosion(): { group: Group; update(time: number): void } {
  const group = new Group();
  group.name = 'Blast';
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,250,230,1)');
  grad.addColorStop(0.18, 'rgba(255,200,110,0.85)');
  grad.addColorStop(0.45, 'rgba(255,120,40,0.35)');
  grad.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const core = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  core.name = 'Core';
  group.add(core);
  const N = 200, r = rng(31);
  const sparks = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0xffb04a, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), N);
  sparks.name = 'Sparks';
  group.add(sparks);
  // a fan opening up and out (the castle stands below), a few thrown down the sides
  const dirs = Array.from({ length: N }, () => { const a = (r() < 0.85 ? 0.05 + r() * 0.9 : -0.25 + r() * 1.5) * Math.PI; return [Math.cos(a), Math.sin(a), 0.6 + r() * 0.8, r(), 0.4 + r() * 0.8]; });
  const E = 60, embers = new Float32Array(E * 3), emberSeed = Array.from({ length: E }, () => [r() * 2 - 1, r(), r()]);
  const eg = new BufferGeometry();
  eg.setAttribute('position', new Float32BufferAttribute(embers, 3));
  const em = new Points(eg, new PointsMaterial({ color: 0xffc070, size: 0.02, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  em.name = 'Embers';
  group.add(em);
  const d = new Object3D();
  function update(time: number): void {
    const pulse = 0.85 + 0.25 * Math.sin(time * 5.3) * Math.sin(time * 2.1 + 1);
    core.scale.setScalar(0.5 * pulse);
    for (let i = 0; i < N; i++) {
      const [x, y, speed, phase, len] = dirs[i], k = (time * 0.9 * speed + phase) % 1; // 0 .. 1: born at the core, gone at the rim
      const dist = 0.04 + k * 0.62 * speed;
      d.position.set(x * dist, y * dist - k * k * 0.12, 0);
      d.rotation.set(0, 0, Math.atan2(y - k * 0.3, x));
      const fade = (1 - k) ** 1.5;
      d.scale.set(0.12 * len * fade + 0.005, 0.008 * fade + 0.001, 1);
      d.updateMatrix();
      sparks.setMatrixAt(i, d.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < E; i++) {
      const [sx, sp, ph] = emberSeed[i], k = (time * 0.35 * (0.6 + sp) + ph) % 1;
      embers[i * 3] = sx * 0.35 * k;
      embers[i * 3 + 1] = 0.25 * k - 0.7 * k * k;
      embers[i * 3 + 2] = 0;
    }
    eg.getAttribute('position').needsUpdate = true;
  }
  return { group, update };
}

export interface Backdrop {
  root: Group;
  place(at: ArtPoint): void;
  update(time: number): void;
  /** The voice wave starts here (the player's mouth, in the backdrop's space) instead of the drawn boy's. */
  setMouth(p: Vector3): void;
  /** How loud he speaks, 0..1: the voice wave and the lights round his words; front 0..1: how far out from his
   *  mouth the wave has flown yet (it grows out of the mouth, it does not appear whole). */
  setVoice(level: number, front?: number): void;
  /** How far the loop of streams has grown, 0..1 (its blast and the wave into Punto once it is all there). */
  setLoop(level: number): void;
}

export function createBackdrop(at: ArtPoint): Backdrop {
  const root = new Group();
  root.name = 'Backdrop';
  const tun = tunnel();
  root.add(tun);

  const sky = windowTexture();
  const win = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ map: sky.texture, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  win.name = 'Window';
  root.add(win);

  // HUD frames up on the right: [x, y, width, height in the art's pixels, depth, turn]
  const FRAMES: [number, number, number, number, number, number][] = [[2330, 170, 430, 300, 6, -0.5], [2470, 520, 300, 420, 5.5, -0.7], [2120, 300, 240, 190, 7.5, -0.4], [2560, 980, 260, 360, 5, -0.8]];
  const frames = FRAMES.map(() => frame(1, 1));
  frames.forEach((f, i) => { f.name = `Frame${i}`; root.add(f); });

  // the haze where the tunnel goes: a wide soft glow, so the far end melts instead of the lines meeting
  const hazeCanvas = document.createElement('canvas');
  hazeCanvas.width = hazeCanvas.height = 256;
  const hg = hazeCanvas.getContext('2d')!, hz = hg.createRadialGradient(128, 128, 0, 128, 128, 128);
  hz.addColorStop(0, 'rgba(70,110,220,0.55)');
  hz.addColorStop(0.35, 'rgba(40,70,170,0.3)');
  hz.addColorStop(1, 'rgba(10,20,60,0)');
  hg.fillStyle = hz;
  hg.fillRect(0, 0, 256, 256);
  const hazeTex = new CanvasTexture(hazeCanvas);
  hazeTex.colorSpace = SRGBColorSpace;
  const haze = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: hazeTex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  haze.name = 'Haze';
  root.add(haze);

  const flow = streams(), branch = streams();
  root.add(flow.group, branch.group);
  // the orange burst the streams start from (over the T), and the spray of sparks behind the castle
  const spark = burst(46, 0xffb04a, 3, 0.02, 0.5);
  spark.name = 'Burst';
  const glowDot = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  spark.add(glowDot);
  glowDot.scale.setScalar(0.06);
  const blast = explosion();
  root.add(spark, blast.group);
  bake(spark); // its streaks never move one by one (the whole burst turns): one draw, the glow dot another

  // the voice wave from the boy's mouth: bars across a line, an envelope, alive
  const BARS = 90;
  const bar = new PlaneGeometry(1, 1);
  const waveCore = new InstancedMesh(bar, new MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), BARS);
  const waveGlow = new InstancedMesh(bar, new MeshBasicMaterial({ color: 0x2fd0ff, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), BARS);
  waveCore.name = 'VoiceWave';
  waveGlow.name = 'VoiceGlow';
  root.add(waveGlow, waveCore);
  // the second wave: through the wire Punto to Punto's foot, tall in its middle (the art draws it there)
  const wave2Core = new InstancedMesh(bar, waveCore.material, BARS), wave2Glow = new InstancedMesh(bar, waveGlow.material, BARS);
  wave2Core.name = 'PuntoWave';
  root.add(wave2Glow, wave2Core);
  const from2 = new Vector3(), to2 = new Vector3();
  let bar2H = 0.1;
  const from = new Vector3(), to = new Vector3();
  let barH = 0.1, barW = 0.006;

  // round his words: soft orange lights (bokeh) of three sizes, thick along the wave and under it, drifting away
  // from his mouth and twinkling; and cyan pixels by the wire Punto, where the wave runs into it
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 64;
  const dg = dotCanvas.getContext('2d')!, dgr = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  dgr.addColorStop(0, 'rgba(255,240,200,1)');
  dgr.addColorStop(0.22, 'rgba(255,170,70,0.95)');
  dgr.addColorStop(0.5, 'rgba(255,120,30,0.25)');
  dgr.addColorStop(1, 'rgba(255,90,20,0)');
  dg.fillStyle = dgr;
  dg.fillRect(0, 0, 64, 64);
  const dotTex = new CanvasTexture(dotCanvas);
  dotTex.colorSpace = SRGBColorSpace;
  const r = rng(5), TIERS = [[10, 0.07], [12, 0.045], [14, 0.03]] as const;
  interface Dot { u: number; off: number; depth: number; speed: number; phase: number }
  const tiers = TIERS.map(([n, size], k) => {
    const dots: Dot[] = Array.from({ length: n }, () => ({ u: r(), off: (r() - 0.35) * 2, depth: 3 + r() * 0.6, speed: 0.012 + r() * 0.02, phase: r() * 6.28 }));
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new Points(geo, new PointsMaterial({ map: dotTex, size, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    pts.name = `WordLights${k}`;
    pts.frustumCulled = false; // its points move every frame: its bounds, taken once at zero, would cull it
    root.add(pts);
    return { pts, dots };
  });
  const PIX = 28, pixGeo = new BufferGeometry(), pixSeeds = Array.from({ length: PIX }, () => [r(), r(), r()]);
  pixGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(PIX * 3), 3));
  const pixels = new Points(pixGeo, new PointsMaterial({ color: 0x8ff3ff, size: 0.018, sizeAttenuation: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  pixels.name = 'WordPixels';
  pixels.frustumCulled = false;
  root.add(pixels);
  let artAt: ArtPoint = at;

  const FWD = new Vector3(0, 0, -1), dummy = new Object3D();
  function place(at: ArtPoint): void {
    // the tunnel runs to the art's vanishing point
    tun.quaternion.setFromUnitVectors(FWD, at(1202, 666, 1).normalize());
    // the haze: over the vanishing point, far, about a third of the picture wide
    const vp = at(1202, 666, 16);
    haze.position.copy(vp);
    haze.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), vp.clone().negate().normalize());
    haze.scale.setScalar(at(1202, 666, 16).distanceTo(at(1202 + 520, 666, 16)) * 2);
    // the window overhead: its near (top) edge closer than its far (bottom) one
    quad(win.geometry, [at(250, -200, 4.6), at(2250, -200, 4.6), at(1630, 300, 9), at(958, 330, 9)]);
    FRAMES.forEach(([x, y, w, h, d, turn], i) => {
      const c = at(x, y, d), right = at(x + w / 2, y, d), up = at(x, y - h / 2, d);
      frames[i].position.copy(c);
      frames[i].scale.set(right.distanceTo(c) * 2, up.distanceTo(c) * 2, 1);
      frames[i].quaternion.setFromUnitVectors(new Vector3(0, 0, 1), c.clone().negate().normalize());
      frames[i].rotateY(turn);
    });
    // the streams along their drawn path; the burst at their start; the spray behind the castle
    flow.build(TO_WIRE.map(([x, y, d]) => at(x, y, d)));
    branch.build(TO_CASTLE.map(([x, y, d]) => at(x, y, d)));
    const sp = at(1503, 317, 5.3);
    spark.position.copy(sp);
    spark.scale.setScalar(sp.distanceTo(at(1503 + 120, 317, 5.3)));
    spark.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), sp.clone().negate().normalize());
    const bc = at(...BLAST);
    blast.group.position.copy(bc);
    blast.group.scale.setScalar(bc.distanceTo(at(BLAST[0] + 680, BLAST[1], BLAST[2])));
    blast.group.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), bc.clone().negate().normalize());
    // the voice wave: from the boy's mouth up to the right
    from.copy(at(489, 951, 3.2));
    to.copy(at(1121, 798, 3.2));
    barH = at(489, 951, 3.2).distanceTo(at(489, 1111, 3.2));
    barW = from.distanceTo(to) / BARS * 0.45;
    from2.copy(at(1420, 880, 3.25));
    to2.copy(at(1790, 865, 3.25));
    bar2H = at(1600, 870, 3.25).distanceTo(at(1600, 1110, 3.25));
    artAt = at;
  }
  place(at);

  const dir = new Vector3();
  function update(time: number): void {
    flow.update(time, loop);
    branch.update(time + 3.7, loop);
    spark.rotation.z = time * 0.2;
    spark.visible = loop > 0.01;
    // the blast and the wave into Punto only once the streams have reached them
    blast.group.visible = loop > 0.97;
    blast.update(time);
    sky.tick(time);
    // the wave: an envelope high near the mouth's side, the bars alive
    dir.copy(to).sub(from);
    const angle = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < BARS; i++) {
      const u = i / (BARS - 1), env = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.4 * (1 - 0.55 * u);
      const live = 0.35 + 0.65 * Math.abs(Math.sin(time * 9.1 + i * 0.73) * Math.sin(time * 3.7 + i * 0.29));
      dummy.position.lerpVectors(from, to, u);
      dummy.rotation.set(0, 0, angle);
      const out = voice > 0.01 && u <= front;
      dummy.scale.set(out ? barW : 0, Math.max(0.0001, barH * env * live * voice), 1);
      dummy.updateMatrix();
      waveCore.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(out ? barW * 4 : 0, Math.max(0.0001, barH * env * live * 1.15 * voice), 1);
      dummy.updateMatrix();
      waveGlow.setMatrixAt(i, dummy.matrix);
    }
    waveCore.instanceMatrix.needsUpdate = waveGlow.instanceMatrix.needsUpdate = true;
    const angle2 = Math.atan2(to2.y - from2.y, to2.x - from2.x);
    for (let i = 0; i < BARS; i++) {
      const u = i / (BARS - 1), env = Math.sin(Math.PI * u) ** 2.2;
      const live = 0.3 + 0.7 * Math.abs(Math.sin(time * 8.3 + i * 0.61) * Math.sin(time * 2.9 + i * 0.37));
      dummy.position.lerpVectors(from2, to2, u);
      dummy.rotation.set(0, 0, angle2);
      dummy.scale.set(loop > 0.97 ? barW * 0.8 : 0, Math.max(0.0001, bar2H * env * live), 1);
      dummy.updateMatrix();
      wave2Core.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(loop > 0.97 ? barW * 3.5 : 0, Math.max(0.0001, bar2H * env * live * 1.15), 1);
      dummy.updateMatrix();
      wave2Glow.setMatrixAt(i, dummy.matrix);
    }
    wave2Core.instanceMatrix.needsUpdate = wave2Glow.instanceMatrix.needsUpdate = true;
    // the lights: each slides along the wave away from his mouth (and a little up), wraps round, twinkles
    for (const { pts, dots } of tiers) {
      const pos = pts.geometry.getAttribute('position');
      dots.forEach((d, i) => {
        const u = (d.u + time * d.speed) % 1;
        const x = 520 + u * 700 + Math.sin(time * 0.7 + d.phase) * 12, y = 960 - u * 170 + d.off * 150 - u * 40 + Math.sin(time * 0.5 + d.phase) * 10;
        const q = artAt(x, y, d.depth);
        pos.setXYZ(i, q.x, q.y, q.z);
      });
      pos.needsUpdate = true;
      (pts.material as PointsMaterial).opacity = (0.75 + 0.25 * Math.sin(time * 2.3 + pts.id)) * voice * Math.min(1, front * 1.5);
      pts.visible = voice > 0.01 && front > 0.05;
    }
    const pp = pixGeo.getAttribute('position');
    pixSeeds.forEach(([a, b, c], i) => {
      const on = Math.sin(time * (3 + c * 4) + a * 30) > -0.2;
      const q = artAt(1250 + a * 190 + Math.sin(time + i) * 4, 760 + b * 130, on ? 3.3 : 99);
      pp.setXYZ(i, q.x, q.y, q.z);
    });
    pp.needsUpdate = true;
  }
  // from the player's mouth: the wave keeps its length and its rise, it only moves to start there
  const span = new Vector3();
  // a little in front of his mouth, not out of it (it looked odd)
  const MOUTH_GAP = 0.09;
  function setMouth(p: Vector3): void {
    span.copy(to).sub(from);
    from.copy(p).addScaledVector(span.clone().normalize(), MOUTH_GAP);
    to.copy(from).add(span);
  }
  let voice = 1, front = 1, loop = 1;
  const setVoice = (level: number, f = 1) => { voice = level; front = f; };
  const setLoop = (level: number) => { loop = level; };
  return { root, place, update, setMouth, setVoice, setLoop };
}
