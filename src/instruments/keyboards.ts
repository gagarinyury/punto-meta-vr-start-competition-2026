// Keyboards and pads of the instruments kit (src/instruments/kit.ts): the synthesizer (also the piano: Yury, 16.11 —
// «a person who asks for a piano gets the synth») and the beat pads of research/concepts/instruments/i1-splash.png, with real key sizes.
import { CatmullRomCurve3, ExtrudeGeometry, Group, Shape, TubeGeometry } from '@iwsdk/core';
import { block, type Built, isSharp, knob, mesh, noteName, notes, paint, type Part, playable, put, type Sound, v, vary } from './kit.js';

/** Real key sizes (a full-size keyboard): white 23.5 mm wide, 145 mm long. */
export const KEY = { white: 0.0235, gap: 0.0013, length: 0.145, height: 0.022, black: 0.0135, blackLength: 0.092, blackRise: 0.012 };

/**
 * A row of piano keys from..to: white tops at y = 0, the back edge at z = 0, the front at z = KEY.length, centred
 * on x. Each key is a playable part. Returns the keys and the keyboard's width.
 */
export function keyboard(from: string | number, to: string | number, sound: Sound, parts: Part[]): { group: Group; width: number } {
  const group = new Group();
  group.name = 'Keys';
  const width = notes(from, to, false).length * KEY.white;
  const ivory = paint.ivory(), ebony = paint.ebony();
  let i = 0;
  for (const m of notes(from, to)) {
    if (!isSharp(m)) {
      const x = -width / 2 + KEY.white * (i + 0.5);
      const key = mesh(block(KEY.white - KEY.gap, KEY.height, KEY.length - KEY.gap, 0.0025), ivory, '', x, -KEY.height / 2, KEY.length / 2);
      group.add(playable(key, noteName(m), sound, parts));
      i++;
    } else {
      const x = -width / 2 + KEY.white * i, h = KEY.height;
      const key = mesh(block(KEY.black, h, KEY.blackLength, 0.003), ebony, '', x, KEY.blackRise - h / 2, KEY.blackLength / 2);
      group.add(playable(key, noteName(m), sound, parts));
    }
  }
  return { group, width };
}

/** A solid with a side profile [z, y][] (the player at +z), as wide as `width` along x, centred, softly bevelled. */
export function sideSlab(profile: [number, number][], width: number, bevel = 0.006): ExtrudeGeometry {
  const shape = new Shape();
  profile.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 4 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2 - bevel, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A compact analog synthesizer: two octaves of keys between red wooden cheeks, a sloped panel with a glowing
 * waveform screen, two sliders and ten coloured knobs. ~0.42 × 0.11 × 0.34 m, for a table.
 */
export function synth(options: { from?: string; to?: string; sound?: Sound } = {}): Built {
  const parts: Part[] = [], object = new Group();
  object.name = 'Synthesizer';
  const kb = keyboard(options.from ?? 'C3', options.to ?? 'C5', options.sound ?? 'piano', parts);
  const W = kb.width + 0.006, keyTop = 0.062, back = -0.17, slope = 0.032;
  // the body: a low lip under the keys, the panel rising behind them
  const body: [number, number][] = [[KEY.length + 0.02, 0], [KEY.length + 0.02, 0.03], [-0.004, 0.03], [-0.004, 0.078], [back, 0.078 + slope], [back, 0]];
  object.add(mesh(sideSlab(body, W), paint.lacquer(0x34363f), 'Body'));
  const cheek = body.map(([z, y]) => [z + (z > 0 ? 0.008 : -0.006), y > 0 ? y + 0.014 : 0] as [number, number]);
  for (const s of [-1, 1]) object.add(mesh(sideSlab(cheek, 0.026, 0.007), paint.lacquer(0xd8473a), s < 0 ? 'CheekLeft' : 'CheekRight', s * (W / 2 + 0.013), 0, 0));
  kb.group.position.set(0, keyTop, 0.002);
  object.add(kb.group);
  // the panel: its own frame lying on the slope, controls stand on its local y = 0
  const panel = put(new Group(), 'Panel', 0, 0.078, -0.004, Math.atan2(slope, -back));
  object.add(panel);
  const left = -W / 2 + 0.02;
  const screen = mesh(block(0.11, 0.008, 0.055, 0.003), paint.lacquer(0x0d1820), 'Screen', left + 0.055, 0.002, -0.115);
  panel.add(screen);
  const wave = new CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => v(left + 0.012 + i * 0.0037, 0.0068, -0.115 + Math.sin(i * 0.75) * 0.014 * Math.cos(i * 0.21))));
  panel.add(mesh(new TubeGeometry(wave, 48, 0.0011, 5, false), paint.glow(0x6ff3ff, 2.2), 'Wave'));
  for (let i = 0; i < 2; i++) {
    const x = left + 0.03 + i * 0.045;
    panel.add(mesh(block(0.008, 0.004, 0.06, 0.0015), paint.rubber(0x111214), `SliderSlot${i}`, x, 0.001, -0.045));
    panel.add(mesh(block(0.022, 0.012, 0.012, 0.003), paint.plastic(0xeeeeee), `Slider${i}`, x, 0.007, -0.045 + (i ? 0.012 : -0.016)));
  }
  const colors = [0xe94b3c, 0xffb22e, 0x3fc464, 0x3a8cf0, 0xe94b3c, 0xffb22e, 0x3fc464, 0x3a8cf0, 0xb06cf0, 0xff7a2f];
  colors.forEach((c, i) => panel.add(put(knob(0.0105, c, `Knob${i}`, i * 0.9), `Knob${i}`, left + 0.15 + (i % 5) * (W - 0.19) / 4.5, 0.002, i < 5 ? -0.115 : -0.05)));
  return { object, parts };
}

/** The drum parts and notes of the beat pads, from the front row up (as on a drum machine). */
const PADS: [string, Sound][] = [
  ['kick', 'drums'], ['snare', 'drums'], ['hihat', 'drums'], ['open hihat', 'drums'],
  ['high tom', 'drums'], ['low tom', 'drums'], ['floor tom', 'drums'], ['rim', 'drums'],
  ['crash', 'drums'], ['ride', 'drums'], ['C4', 'marimba'], ['D4', 'marimba'],
  ['E4', 'marimba'], ['G4', 'marimba'], ['A4', 'marimba'], ['C5', 'marimba'],
];
const PAD_COLORS = [0xff6a3d, 0xff9a2e, 0xffc93a, 0x45d483, 0xff4f6d, 0xff7a2f, 0x3fd0c9, 0x45d483, 0xb26cff, 0x6c7bff, 0x3fa9ff, 0x3fd0c9, 0xb26cff, 0x6c7bff, 0x3fa9ff, 0x3fd0c9];

/**
 * A drum machine: a 4 × 4 grid of soft lit rubber pads (5 cm, the drum kit and six marimba notes), a screen, a
 * fader and three knobs on a graphite body. ~0.32 × 0.05 × 0.3 m, for a table.
 */
export function pads(options: { sounds?: [string, Sound][] } = {}): Built {
  const parts: Part[] = [], object = new Group();
  object.name = 'Beat Pads';
  const sounds = options.sounds ?? PADS, H = 0.034, size = 0.048, gap = 0.012;
  object.add(mesh(block(0.33, H, 0.31, 0.012), paint.lacquer(0x2b2d35), 'Body', 0, H / 2, 0));
  object.add(mesh(block(0.25, 0.004, 0.25, 0.002), paint.rubber(0x0b0b0e), 'PadWell', 0.035, H, 0.03));
  sounds.slice(0, 16).forEach(([note, sound], i) => {
    const col = i % 4, row = Math.floor(i / 4), color = PAD_COLORS[i % PAD_COLORS.length];
    const pad = mesh(block(size, 0.009, size, 0.004), paint.glow(vary(color, i, 0.04), 0.18), '', 0.035 + (col - 1.5) * (size + gap), H + 0.0045, 0.03 + (1.5 - row) * (size + gap));
    pad.userData.color = color;
    object.add(playable(pad, note, sound, parts));
  });
  object.add(mesh(block(0.1, 0.006, 0.035, 0.003), paint.lacquer(0x0d1820), 'Screen', -0.09, H + 0.002, -0.125));
  object.add(mesh(block(0.08, 0.003, 0.018, 0.002), paint.glow(0x6ff3ff, 1.4), 'ScreenText', -0.09, H + 0.0055, -0.125));
  [0xffb22e, 0x3fc464, 0x3a8cf0].forEach((c, i) => object.add(put(knob(0.011, c, `Knob${i}`, i), `Knob${i}`, 0.04 + i * 0.04, H, -0.125)));
  object.add(mesh(block(0.008, 0.004, 0.18, 0.002), paint.rubber(0x0b0b0d), 'FaderSlot', -0.135, H + 0.001, 0.03));
  object.add(mesh(block(0.022, 0.014, 0.014, 0.003), paint.plastic(0xeeeeee), 'Fader', -0.135, H + 0.008, 0.06));
  return { object, parts };
}
