// Struck and plucked instruments of the instruments kit (src/instruments/kit.ts): xylophone, marimba,
// glockenspiel, vibraphone, tubular bells and kalimba, in the look of research/concepts/instruments/i1-splash.png.
// Bars and tubes are tuned the way real ones are cut: the higher the note, the shorter, geometrically.
import { CylinderGeometry, Group, type Material, Mesh, Vector3 } from '@iwsdk/core';
import { block, type Built, type BarLayout, type BarPlace, layBars, lying, mallet, mesh, midiOf, noteName, notes, paint, type Part, playable, put, rod, type Sound, v, vary } from './kit.js';

/** The bars of from..to on their felt rails, their tops at y = top. */
function barRow(midis: number[], o: BarLayout, top: number, color: (i: number) => Material, sound: Sound, parts: Part[]) {
  const laid = layBars(midis, o), group = new Group();
  group.name = 'Bars';
  laid.bars.forEach((b, i) => group.add(playable(mesh(block(o.width, o.thick, b.length, o.thick * 0.3), color(i), '', b.x, top + b.y - o.thick / 2, b.z), noteName(b.midi), sound, parts)));
  const felt = paint.rubber(0x8c2f2f), rails = new Group();
  rails.name = 'Rails';
  laid.rails.forEach(([a, b], i) => {
    const y = top - o.thick - 0.004;
    rails.add(rod(v(a.x, a.y + y, a.z), v(b.x, b.y + y, b.z), 0.004, felt, `Felt${i}`, 0.004, 6));
  });
  group.add(rails);
  return { group, laid };
}

/** A metal resonator tube hanging under a bar, its mouth just below it. */
function resonator(b: BarPlace, top: number, length: number, r: number, mat: Material, i: number): Mesh {
  const tube = new Mesh(new CylinderGeometry(r, r, length, 18, 1, true), mat);
  tube.name = `Resonator${i}`;
  tube.position.set(b.x, top + b.y - 0.045 - length / 2, b.z);
  const cap = mesh(new CylinderGeometry(r, r, 0.004, 18), mat, 'Cap', 0, -length / 2, 0);
  tube.add(cap);
  return tube;
}

/** The frame of a standing mallet instrument: two end frames on legs with casters, rails under the bars, a stretcher. */
function standFrame(span: [number, number], depth: number, top: number, mat: Material, rails: [Vector3, Vector3][]): Group {
  const g = new Group();
  g.name = 'Frame';
  const ends = [span[0] - 0.07, span[1] + 0.07];
  ends.forEach((x, i) => {
    for (const s of [-1, 1]) {
      g.add(rod(v(x, top - 0.03, s * depth * 0.42), v(x, 0.07, s * depth * 0.46), 0.016, mat, `Leg${i}${s}`));
      g.add(mesh(new CylinderGeometry(0.03, 0.03, 0.02, 16), paint.rubber(0x202020), `Caster${i}${s}`, x, 0.035, s * depth * 0.46));
    }
    g.add(mesh(block(0.05, 0.05, depth, 0.01), mat, `EndTop${i}`, x, top - 0.05, 0));
    g.add(mesh(block(0.05, 0.04, depth * 1.02, 0.01), mat, `EndFoot${i}`, x, 0.075, 0));
  });
  g.add(rod(v(ends[0], 0.3, 0), v(ends[1], 0.3, 0), 0.014, mat, 'Stretcher'));
  // the rails, carried to the end frames
  rails.forEach(([a, b], i) => {
    const at = (x: number) => a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x);
    g.add(rod(v(ends[0], top - 0.032, at(ends[0])), v(ends[1], top - 0.032, at(ends[1])), 0.011, mat, `Rail${i}`));
  });
  return g;
}

/**
 * A toy xylophone: one row of honey-coloured wooden bars (C major by default, C5–E6) on a dark red trapezoid
 * frame, two mallets resting on it. ~0.55 × 0.07 × 0.3 m, for a table. `sharps: true` adds the black-key row.
 */
export function xylophone(options: { from?: string; to?: string; sharps?: boolean } = {}): Built {
  const parts: Part[] = [], object = new Group();
  object.name = 'Xylophone';
  const top = 0.066, o: BarLayout = { width: 0.038, gap: 0.008, longest: 0.27, shortest: 0.15, thick: 0.02 };
  const row = barRow(notes(options.from ?? 'C5', options.to ?? 'E6', options.sharps ?? false), o, top, (i) => paint.wood(vary(0xe1ad6a, i)), 'xylophone', parts);
  object.add(row.group);
  // the frame: a hollow trapezoid under the node lines
  const [l, r] = row.laid.span, first = row.laid.bars[0], last = row.laid.bars[row.laid.bars.length - 1];
  const zl = first.length * 0.3 + 0.03, zr = last.length * 0.3 + 0.03, w = 0.034, x0 = l - 0.03, x1 = r + 0.03;
  const outer: [number, number][] = [[x0, -zl], [x1, -zr], [x1, zr], [x0, zl]];
  const inner: [number, number][] = [[x0 + w, -zl + w], [x1 - w, -zr + w], [x1 - w, zr - w], [x0 + w, zl - w]];
  object.add(mesh(lying(outer, top - o.thick - 0.008, 0.008, [inner]), paint.lacquer(0x9b3b2c), 'Frame'));
  object.add(mallet(v(0.05, top + 0.004, 0.2), v(-0.07, top + 0.012, 0.01), 0.015, 0x6a2a20, 'MalletLeft'));
  object.add(mallet(v(0.13, top + 0.004, 0.2), v(0.04, top + 0.012, 0.0), 0.015, 0x6a2a20, 'MalletRight'));
  return { object, parts };
}

/** Marimba and vibraphone: two rows of bars on a standing frame with resonator tubes under every bar. */
function standing(name: string, midis: number[], o: BarLayout, bar: (i: number) => Material, tubeMat: Material, frameMat: Material, sound: Sound, parts: Part[]) {
  const object = new Group();
  object.name = name;
  const top = 0.9, row = barRow(midis, o, top, bar, sound, parts);
  object.add(row.group);
  const tubes = new Group();
  tubes.name = 'Resonators';
  const n = row.laid.bars.length;
  row.laid.bars.forEach((b, i) => tubes.add(resonator(b, top, 0.56 * Math.pow(0.18, i / Math.max(1, n - 1)), o.width * 0.36, tubeMat, i)));
  object.add(tubes);
  object.add(standFrame(row.laid.span, o.longest * 2.3, top, frameMat, row.laid.rails));
  return { object, row, top };
}

/** A concert marimba: rosewood bars in two rows over silver resonators, on a dark frame with casters. C3–C5. */
export function marimba(options: { from?: string; to?: string } = {}): Built {
  const parts: Part[] = [];
  const { object } = standing('Marimba', notes(options.from ?? 'C3', options.to ?? 'C5'), { width: 0.05, gap: 0.008, longest: 0.42, shortest: 0.25, thick: 0.022, rise: 0.016 }, (i) => paint.wood(vary(0x8e3b2a, i)), paint.steel(), paint.lacquer(0x3a2a24), 'marimba', parts);
  return { object, parts };
}

/** A vibraphone: aluminium bars over golden resonators with their fan discs, a motor and a sustain pedal. F3–F5. */
export function vibraphone(options: { from?: string; to?: string } = {}): Built {
  const parts: Part[] = [];
  const o: BarLayout = { width: 0.05, gap: 0.008, longest: 0.36, shortest: 0.21, thick: 0.013, rise: 0.016 };
  const { object, row, top } = standing('Vibraphone', notes(options.from ?? 'F3', options.to ?? 'F5'), o, (i) => paint.wood(vary(0xc9ced6, i, 0.03)), paint.brass(), paint.lacquer(0x1d1e23), 'vibraphone', parts);
  const steel = paint.chrome(), fans = new Group();
  fans.name = 'Fans';
  row.laid.bars.forEach((b, i) => fans.add(mesh(new CylinderGeometry(o.width * 0.3, o.width * 0.3, 0.003, 14), steel, `Fan${i}`, b.x, top + b.y - 0.06, b.z)));
  for (const sharp of [false, true]) {
    const own = row.laid.bars.filter((b) => b.sharp === sharp);
    fans.add(rod(v(own[0].x - 0.05, top + own[0].y - 0.06, own[0].z), v(own[own.length - 1].x, top + own[0].y - 0.06, own[own.length - 1].z), 0.004, steel, sharp ? 'AxleBack' : 'AxleFront'));
  }
  object.add(fans);
  object.add(mesh(block(0.09, 0.07, 0.1, 0.012), paint.lacquer(0x2b2c33), 'Motor', row.laid.span[0] - 0.02, top - 0.12, 0));
  object.add(mesh(block(0.2, 0.025, 0.08, 0.008), paint.lacquer(0x1d1e23), 'Pedal', 0, 0.03, 0.12));
  object.add(rod(v(0, 0.04, 0.1), v(0, 0.3, 0), 0.007, steel, 'PedalRod'));
  return { object, parts };
}

/**
 * A glockenspiel in its open wooden case: bright steel bars in two rows on red felt, the lid standing open
 * behind them, two mallets. C6–C7, ~0.33 × 0.22 m, for a table.
 */
export function glockenspiel(options: { from?: string; to?: string } = {}): Built {
  const parts: Part[] = [], object = new Group();
  object.name = 'Glockenspiel';
  const o: BarLayout = { width: 0.026, gap: 0.006, longest: 0.13, shortest: 0.085, thick: 0.008, rise: 0.008 };
  const top = 0.05, row = barRow(notes(options.from ?? 'C6', options.to ?? 'C7'), o, top, (i) => paint.wood(vary(0xd9dee6, i, 0.03)), 'glockenspiel', parts);
  for (const m of row.group.children) if (m instanceof Mesh) (m.material as { metalness: number; roughness: number }).metalness = 0.9;
  object.add(row.group);
  const W = row.laid.span[1] - row.laid.span[0] + 0.08, D = o.longest * 2 + 0.07, wood = paint.lacquer(0xc98447);
  const cx = (row.laid.span[0] + row.laid.span[1]) / 2, t = 0.012;
  const outer: [number, number][] = [[cx - W / 2, -D / 2], [cx + W / 2, -D / 2], [cx + W / 2, D / 2], [cx - W / 2, D / 2]];
  const inner: [number, number][] = [[cx - W / 2 + t, -D / 2 + t], [cx + W / 2 - t, -D / 2 + t], [cx + W / 2 - t, D / 2 - t], [cx - W / 2 + t, D / 2 - t]];
  object.add(mesh(lying(outer, 0.042, 0.005, [inner]), wood, 'CaseWalls'));
  object.add(mesh(block(W - 2 * t, 0.01, D - 2 * t, 0.002), paint.rubber(0x9a2b2b), 'CaseFelt', cx, 0.012, 0));
  object.add(mesh(block(W, 0.012, D, 0.004), wood, 'CaseFloor', cx, 0.006, 0));
  const lid = put(new Group(), 'Lid', cx, 0.042, -D / 2, -1.85);
  lid.add(mesh(lying(outer.map(([x, z]) => [x - cx, z + D / 2] as [number, number]), 0.03, 0.005, [inner.map(([x, z]) => [x - cx, z + D / 2] as [number, number])]), wood, 'LidWalls', 0, -0.03, 0));
  lid.add(mesh(block(W, 0.008, D, 0.003), wood, 'LidTop', 0, -0.026, D / 2));
  object.add(lid);
  object.add(mallet(v(cx + 0.02, 0.06, D / 2 + 0.06), v(cx - 0.07, 0.065, D / 2 - 0.01), 0.008, 0xf2f2f2, 'MalletLeft'));
  object.add(mallet(v(cx + 0.06, 0.06, D / 2 + 0.06), v(cx + 0.01, 0.065, D / 2 - 0.02), 0.008, 0xf2f2f2, 'MalletRight'));
  return { object, parts };
}

/**
 * Tubular bells: golden tubes of graded length hanging on cords from a rail, on a floor frame with feet, the
 * hammer on the floor. C major C4–C5 by default (`sharps: true` for all the notes), ~0.7 × 1.8 m.
 */
export function tubularBells(options: { from?: string; to?: string; sharps?: boolean } = {}): Built {
  const parts: Part[] = [], object = new Group();
  object.name = 'Tubular Bells';
  const midis = notes(options.from ?? 'C4', options.to ?? 'C5', options.sharps ?? false), n = midis.length;
  const step = 0.075, r = 0.019, rail = 1.78, hang = 1.66, W = (n - 1) * step + 0.2;
  const frame = paint.lacquer(0x3b3f4a), chrome = paint.chrome();
  midis.forEach((m, i) => {
    const x = (i - (n - 1) / 2) * step, len = 1.2 * Math.pow(0.68, i / Math.max(1, n - 1));
    const tube = mesh(new CylinderGeometry(r, r, len, 20), paint.brass(), '', x, hang - len / 2, 0);
    object.add(playable(tube, noteName(m), 'tubular bells', parts));
    object.add(mesh(new CylinderGeometry(r * 1.18, r * 1.18, 0.03, 20), chrome, `Cap${i}`, x, hang, 0));
    object.add(rod(v(x - 0.012, hang + 0.012, 0), v(x, rail - 0.01, 0), 0.0015, paint.rubber(0x222222), `Cord${i}`, 0.0015, 4));
  });
  for (const s of [-1, 1]) {
    object.add(mesh(block(0.05, rail + 0.04, 0.05, 0.01), frame, s < 0 ? 'PostLeft' : 'PostRight', (s * W) / 2, (rail + 0.04) / 2, 0));
    object.add(mesh(block(0.07, 0.05, 0.6, 0.015), frame, s < 0 ? 'FootLeft' : 'FootRight', (s * W) / 2, 0.025, 0));
  }
  object.add(mesh(block(W + 0.05, 0.05, 0.06, 0.012), frame, 'Rail', 0, rail, 0));
  object.add(rod(v(-W / 2, 0.45, 0), v(W / 2, 0.45, 0), 0.012, frame, 'Stretcher'));
  const hammer = new Group();
  hammer.name = 'Hammer';
  hammer.add(rod(v(0.05, 0.02, 0.32), v(0.32, 0.02, 0.2), 0.008, paint.wood(0xd9a46a), 'Handle'));
  hammer.add(rod(v(0.03, 0.03, 0.26), v(0.07, 0.03, 0.36), 0.03, paint.wood(0xc9b48a), 'Head', 0.03, 16));
  object.add(hammer);
  return { object, parts };
}

/** The standard 17-tine kalimba in C, left to right: the lowest in the middle, rising outwards in turn. */
const KALIMBA = ['D6', 'B5', 'G5', 'E5', 'C5', 'A4', 'F4', 'D4', 'C4', 'E4', 'G4', 'B4', 'D5', 'F5', 'A5', 'C6', 'E6'];

/** A kalimba: a wooden box with a sound hole and 17 steel tines over a bridge, longest in the middle. ~0.18 × 0.15 m. */
export function kalimba(options: { tines?: string[] } = {}): Built {
  const parts: Part[] = [], object = new Group();
  object.name = 'Kalimba';
  const tines = options.tines ?? KALIMBA, H = 0.026, step = 0.0092, n = tines.length, W = n * step + 0.03;
  object.add(mesh(block(W, H, 0.15, 0.005), paint.wood(0xb5703a), 'Box', 0, H / 2, 0));
  object.add(mesh(new CylinderGeometry(0.013, 0.013, 0.004, 24), paint.ebony(), 'SoundHole', 0, H - 0.0015, 0.05));
  object.add(mesh(block(n * step + 0.01, 0.007, 0.012, 0.003), paint.wood(0xe8c58f), 'Saddle', 0, H + 0.0035, -0.05));
  object.add(rod(v(-(n * step) / 2 - 0.006, H + 0.009, -0.05), v((n * step) / 2 + 0.006, H + 0.009, -0.05), 0.0028, paint.chrome(), 'PressBar'));
  object.add(rod(v(-(n * step) / 2 - 0.006, H + 0.006, -0.032), v((n * step) / 2 + 0.006, H + 0.006, -0.032), 0.002, paint.chrome(), 'Bridge'));
  const low = Math.min(...tines.map(midiOf)), high = Math.max(...tines.map(midiOf));
  tines.forEach((note, i) => {
    const len = 0.088 * Math.pow(0.5, (midiOf(note) - low) / Math.max(1, high - low)), x = (i - (n - 1) / 2) * step;
    const tine = put(mesh(block(0.0058, 0.0016, len + 0.03, 0.0006), paint.chrome(), ''), '', x, H + 0.0095, -0.06 + (len + 0.03) / 2, -0.03);
    playable(tine, note, 'kalimba', parts);
    object.add(tine);
  });
  return { object, parts };
}
