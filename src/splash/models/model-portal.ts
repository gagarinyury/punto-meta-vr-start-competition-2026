// Galaxy Portal (research/concepts/title/models-sheet-2.jpeg, top left): a thick upright ring of pale glass drawn over
// with a cyan wire grid, a glowing cyan inner rim and broken glowing arcs on its face; inside it a disc of
// galaxy — violet and teal nebula, stars; coloured motes float round it. ~1.25 m tall. Origin: the ring's
// centre, its face to +Z. The nebula is computed (a DataTexture), no image file.
import { CircleGeometry, DataTexture, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, RGBAFormat, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, MeshBasicMaterial } from '@iwsdk/core';
import { edgeGlow, glowMat, named, rng } from './kit.js';

export const model = { name: 'Galaxy Portal', length: 1.3, parts: ['Ring', 'Wire', 'Rim', 'Arcs', 'Galaxy', 'Motes'] };

const RI = 0.42, RO = 0.6, D = 0.2;

/** A nebula 256²: soft violet and teal clouds (summed waves, value-noise like) on deep blue, stars on top. */
function nebula(seed: number): DataTexture {
  const N = 256, data = new Uint8Array(N * N * 4), r = rng(seed);
  const waves = Array.from({ length: 7 }, () => [r() * 6 + 2, r() * 6 + 2, r() * 6.28, r() * 6.28, 0.4 + r() * 0.6]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N - 0.5, v = y / N - 0.5, d = Math.hypot(u, v) * 2;
    let a = 0, b = 0;
    waves.forEach(([fx, fy, px, py, w], i) => {
      const s = Math.sin(u * fx * 3 + px + Math.sin(v * fy * 2 + py)) * Math.cos(v * fy * 3 + py) * w;
      i % 2 ? (a += s) : (b += s);
    });
    const violet = Math.max(0, a * 0.5 + 0.3) * (1 - d * 0.4), teal = Math.max(0, b * 0.45 + 0.1) * (1 - d * 0.6);
    const k = (y * N + x) * 4;
    data[k] = Math.min(255, 18 + violet * 150 + teal * 20);
    data[k + 1] = Math.min(255, 14 + violet * 30 + teal * 120);
    data[k + 2] = Math.min(255, 48 + violet * 170 + teal * 140);
    data[k + 3] = 255;
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(r() * N), y = Math.floor(r() * N), big = r() < 0.12;
    for (const [dx, dy] of big ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]]) {
      const kk = (((y + dy + N) % N) * N + ((x + dx + N) % N)) * 4, bright = dx || dy ? 170 : 255;
      data[kk] = data[kk + 1] = data[kk + 2] = bright;
    }
  }
  const tex = new DataTexture(data, N, N, RGBAFormat);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function build(): Group {
  const root = new Group();
  root.name = 'Portal';
  // the ring: a rounded-rectangle section turned round (a lathe), then stood up to face +Z
  const profile: Vector2[] = [], c = 0.05;
  const corners: [number, number, number][] = [[RO - c, D / 2 - c, 0], [RI + c, D / 2 - c, Math.PI / 2], [RI + c, -D / 2 + c, Math.PI], [RO - c, -D / 2 + c, Math.PI * 1.5]];
  for (const [x, y, a0] of corners) for (let i = 0; i <= 3; i++) { const a = a0 + (i / 3) * (Math.PI / 2); profile.push(new Vector2(x + Math.cos(a) * c, y + Math.sin(a) * c)); }
  profile.push(profile[0].clone());
  const ring = new LatheGeometry(profile, 48);
  ring.rotateX(Math.PI / 2);
  root.add(named(new Mesh(ring, new MeshStandardMaterial({ color: 0x7fa8c8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false })), 'Ring'));
  // the wire: the same ring coarser, every edge a cyan line
  const coarse = new LatheGeometry(profile.filter((_, i) => i % 2 === 0), 32);
  coarse.rotateX(Math.PI / 2);
  root.add(named(edgeGlow(coarse, 0x7fefff, 0.45, 1), 'Wire'));
  root.add(named(new Mesh(new TorusGeometry(RI + 0.005, 0.014, 6, 64), glowMat(0x8ff6ff)), 'Rim'));
  // broken arcs on the front face
  const arcs = new Group();
  arcs.name = 'Arcs';
  for (let i = 0; i < 5; i++) {
    const arc = new TorusGeometry(0.52, 0.007, 4, 24, Math.PI * 0.28);
    arc.rotateZ(i * ((Math.PI * 2) / 5) + 0.3);
    arcs.add(named(new Mesh(arc, glowMat(0x9ff3ff)), `Arc${i}`, 0, 0, D / 2 + 0.003));
  }
  root.add(arcs);
  root.add(named(new Mesh(new CircleGeometry(RI, 48), new MeshBasicMaterial({ map: nebula(4), toneMapped: false, side: DoubleSide })), 'Galaxy'));

  const motes = new Group();
  motes.name = 'Motes';
  const r = rng(12), colors = [0xff8ad8, 0x8ff6ff, 0xffd36a, 0xb18cff];
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = RO + 0.08 + r() * 0.25;
    motes.add(named(new Mesh(new SphereGeometry(0.012 + r() * 0.014, 8, 6), glowMat(colors[i % 4])), `Mote${i}`, Math.cos(a) * d, Math.sin(a) * d, (r() - 0.5) * 0.3));
  }
  root.add(motes);
  return root;
}

export function idle(root: Group, time: number): void {
  const arcs = root.getObjectByName('Arcs'), galaxy = root.getObjectByName('Galaxy'), motes = root.getObjectByName('Motes');
  if (arcs) arcs.rotation.z = -time * 0.25;
  if (galaxy) galaxy.rotation.z = time * 0.08;
  if (motes) motes.rotation.z = time * 0.1;
}
