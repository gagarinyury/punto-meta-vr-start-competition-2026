// Punto's look (src/style.ts): toys and table games, each brought to the islands' look one by one beside its concept
// (research/concepts/things/10-toys-games.png). Built only on the base (src/style/base.ts). Real table sizes in metres, standing
// on y = 0; every piece a player picks up is its own mesh (physics or grabbing on it, never on the group).
import { ConeGeometry, CylinderGeometry, Group, type Mesh, type Object3D, OctahedronGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import { blob, block, evenFaces, lit, merge, mix, PALETTE, slab, toy, turned } from './base.js';

const named = <T extends Object3D>(o: T, name: string): T => ((o.name = name), o);
/** Two-tone paint: `topColour` on the facets facing up, `c` on the sides, darker underneath. */
const tone = (c: number, topColour = c) => (_c: Vector3, n: Vector3) => (n.y > 0.55 ? topColour : n.y < -0.55 ? mix(c, PALETTE.shade, 0.35) : mix(c, PALETTE.shade, 0.1));

export type ChessKind = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
const IVORY = 0xf2e4c6, EBONY = 0x4a3830;

/**
 * One chess piece standing on y = 0, `height` metres tall for a king (0.075; the others in proportion): thick and
 * turned in eight facets on a two-step foot, ivory for 'white' and dark brown for 'black' — a pawn's ball on a collar,
 * a rook's four battlements, a bishop's mitre, a queen's crown of points, a king's cross, a knight's horse head
 * (facing −Z for white, +Z for black). One mesh.
 */
export function chessPiece(kind: ChessKind, side: 'white' | 'black', height = 0.075): Mesh {
  const k = height / 0.075, c = side === 'white' ? IVORY : EBONY, g = new Group(), paint = lit(c, 0.3);
  const v = (p: [number, number][]) => p.map(([r, y]) => [r * k, y * k] as [number, number]);
  const add = (geo: ReturnType<typeof turned>) => g.add(toy(geo, paint, { vary: 0.05 }));
  const lathe = (p: [number, number][], sides = 8) => add(turned(v(p), sides));
  const foot: [number, number][] = [[0, 0], [0.017, 0], [0.017, 0.005], [0.0145, 0.007], [0.0145, 0.01], [0.012, 0.012]];
  if (kind === 'pawn') {
    lathe([...foot, [0.008, 0.024], [0.0115, 0.026], [0.0115, 0.029], [0, 0.029]]);
    lathe([[0, 0.027], [0.0085, 0.03], [0.0105, 0.036], [0.0085, 0.042], [0, 0.045]]);
  } else if (kind === 'rook') {
    lathe([...foot, [0.0105, 0.016], [0.0105, 0.036], [0.0145, 0.039], [0.0145, 0.048], [0, 0.048]]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, b = block(0.009 * k, 0.007 * k, 0.006 * k, [0, 0, 0]);
      b.rotateY(-a).translate(Math.cos(a) * 0.0105 * k, 0.0515 * k, Math.sin(a) * 0.0105 * k);
      add(b);
    }
  } else if (kind === 'bishop') {
    lathe([...foot, [0.0085, 0.026], [0.0065, 0.036], [0.0115, 0.038], [0.0115, 0.041], [0, 0.041]]);
    lathe([[0, 0.039], [0.0095, 0.043], [0.0105, 0.05], [0.007, 0.058], [0, 0.062]]);
    lathe([[0, 0.06], [0.0035, 0.0625], [0, 0.066]], 6);
  } else if (kind === 'queen') {
    lathe([...foot, [0.0095, 0.028], [0.0065, 0.045], [0.0125, 0.054], [0.0145, 0.06], [0.0115, 0.062], [0, 0.062]]);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new ConeGeometry(0.0036 * k, 0.008 * k, 5).translate(Math.cos(a) * 0.0115 * k, 0.065 * k, Math.sin(a) * 0.0115 * k)); }
    lathe([[0, 0.06], [0.0055, 0.064], [0, 0.07]], 6);
  } else if (kind === 'king') {
    lathe([...foot, [0.0095, 0.03], [0.0065, 0.047], [0.0135, 0.056], [0.0135, 0.06], [0.0105, 0.064], [0, 0.064]]);
    lathe([[0, 0.063], [0.0065, 0.065], [0, 0.068]], 6);
    add(block(0.005 * k, 0.014 * k, 0.005 * k, [0, 0.074 * k, 0], 0.2));
    add(block(0.013 * k, 0.0045 * k, 0.005 * k, [0, 0.0755 * k, 0], 0.2));
  } else {
    // the knight: a thick horse head cut along its side profile (muzzle forwards, ears up, mane behind) on the foot
    lathe([...foot, [0.0125, 0.014], [0, 0.014]]);
    const head: [number, number][] = [[-0.013, 0.012], [0.012, 0.012], [0.011, 0.02], [0.005, 0.029], [0.012, 0.031], [0.02, 0.033], [0.022, 0.038], [0.02, 0.042], [0.011, 0.051], [0.008, 0.067], [0.001, 0.057], [-0.006, 0.055], [-0.013, 0.045], [-0.017, 0.032], [-0.016, 0.02]];
    const mane: [number, number][] = [[-0.003, 0.058], [-0.01, 0.051], [-0.016, 0.041], [-0.019, 0.028], [-0.018, 0.015], [-0.013, 0.015], [-0.014, 0.03], [-0.01, 0.044], [-0.002, 0.052]];
    const cut = (p: [number, number][], thick: number) => {
      const geo = slab(p.map(([x, y]) => [x * k, y * k] as [number, number]), thick * k, 0.12);
      // the muzzle narrows towards the nose
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / k; if (x > 0.008) pos.setZ(i, pos.getZ(i) * (1 - Math.min(1, (x - 0.008) / 0.014) * 0.3)); }
      geo.rotateY(side === 'black' ? -Math.PI / 2 : Math.PI / 2);
      return geo;
    };
    add(cut(head, 0.02));
    g.add(toy(cut(mane, 0.012), lit(mix(c, side === 'white' ? 0xb89a70 : 0x1e1612, 0.35), 0.3), { vary: 0.05 }));
  }
  return named(merge(g), `${side} ${kind}`);
}

/** Where the middle of a chess square ('a1' … 'h8') lies on a chessBoard of `square` metres (white's rank 1 at +Z). */
export function chessSquare(name: string, square = 0.045): Vector3 {
  const file = name.charCodeAt(0) - 97, rank = Number(name[1]) - 1;
  return new Vector3((file - 3.5) * square, 0, (3.5 - rank) * square);
}

/**
 * A chessboard of 8 × 8 squares `square` metres each (0.045), cream and charcoal, each square flat in one colour,
 * set in a thick wooden frame with a raised rim of lighter wood; the squares' top at y = 0.
 */
export function chessBoard(square = 0.045): Mesh {
  const g = new Group(), n = 8, half = (square * n) / 2, f = square * 0.7, out = half + f, rim = square * 0.08;
  const r = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  g.add(toy(block(out * 2, square * 0.55, out * 2, [0, -square * 0.275 - 0.001, 0], 0.08), tone(0x7a4026, 0x9a5634), { vary: 0.05, shade: 0.25 }));
  const ring = slab([[-out, -out], [out, -out], [out, out], [-out, out]], rim * 2, 0.15, [[[-half, -half], [-half, half], [half, half], [half, -half]]]);
  ring.rotateX(-Math.PI / 2);
  g.add(toy(ring, tone(0x8a4a2c, 0xb06a40), { vary: 0.04 }));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const light = (i + j) % 2 === 0, base = light ? 0xf0e2c6 : 0x3c3436;
    const top = mix(base, light ? 0xd8c4a0 : 0x2a2428, r(i * 8 + j) * 0.5);
    g.add(toy(block(square, square * 0.1, square, [-half + (i + 0.5) * square, -square * 0.05, -half + (j + 0.5) * square], 0.02), tone(mix(top, PALETTE.shade, 0.15), top), { vary: 0 }));
  }
  return named(merge(g), 'Board');
}

/**
 * A chess set (research/concepts/things/10-toys-games.png, Chess Set): the board and all 32 pieces in their starting places,
 * each its own mesh named like 'white knight g1' (move it to chessSquare('f3')). `square` metres per square (0.045).
 */
export function chessSet(options: { square?: number } = {}): Group {
  const sq = options.square ?? 0.045, out = named(new Group(), 'Chess Set');
  out.add(chessBoard(sq));
  const back: ChessKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (const side of ['white', 'black'] as const) {
    const [home, pawns] = side === 'white' ? [1, 2] : [8, 7];
    back.forEach((kind, i) => {
      const at = `${String.fromCharCode(97 + i)}${home}`, p = chessPiece(kind, side, sq * 1.75);
      p.position.copy(chessSquare(at, sq)).setY(0);
      p.name = `${side} ${kind} ${at}`;
      out.add(p);
    });
    for (let i = 0; i < 8; i++) {
      const at = `${String.fromCharCode(97 + i)}${pawns}`, p = chessPiece('pawn', side, sq * 1.75);
      p.position.copy(chessSquare(at, sq)).setY(0);
      p.name = `${side} pawn ${at}`;
      out.add(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ dice */

/** The face of a die that carries each value, as an outward direction (opposite faces add up to seven). */
const DIE_FACES: [number, Vector3][] = [[1, new Vector3(0, 1, 0)], [6, new Vector3(0, -1, 0)], [2, new Vector3(0, 0, 1)], [5, new Vector3(0, 0, -1)], [3, new Vector3(1, 0, 0)], [4, new Vector3(-1, 0, 0)]];
/** Where the pips of each value sit on a face, in thirds of the face across (u) and up (v). */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/**
 * A die `size` metres across (0.03), its centre at the origin (stand it at y = size / 2): a white cube with chamfered edges and round dark pips set into
 * each face, 1 up, 6 down, 2 towards +Z, 5 towards −Z, 3 towards +X, 4 towards −X. One mesh, to throw (physics on
 * it); read the throw with dieValue(die), lay a value up with die.quaternion.copy(dieRotation(4)).
 */
export function die(size = 0.03, color = 0xf6f0e8, pip = 0x1a1014): Mesh {
  const g = new Group(), h = size / 2, up = new Vector3(0, 1, 0);
  // one even colour all round (a die rolls: a lighter top would end up underneath); the scene's light shades it
  g.add(toy(block(size, size, size, [0, 0, 0], 0.15), evenFaces(color, 0.05), { vary: 0 }));
  for (const [value, n] of DIE_FACES) {
    const turn = new Quaternion().setFromUnitVectors(up, n), u = new Vector3(1, 0, 0), v = new Vector3(0, 0, 1);
    if (Math.abs(n.y) < 0.5) { u.set(-n.z, 0, n.x); v.set(0, 1, 0); }
    for (const [a, b] of PIPS[value]) {
      // a pip stands 1 % of the die proud of its face: flush enough to read as set in, far enough not to flicker
      const dot = new CylinderGeometry(size * 0.08, size * 0.08, size * 0.03, 12).applyQuaternion(turn);
      const at = n.clone().multiplyScalar(h - size * 0.005).addScaledVector(u, a * size * 0.23).addScaledVector(v, b * size * 0.23);
      g.add(toy(dot.translate(at.x, at.y, at.z), pip, { vary: 0.02 }));
    }
  }
  return named(merge(g, { roughness: 1 }), 'Die');
}

/** The value a die shows on top (the face pointing most upwards in the world): read a throw once it rests. */
export function dieValue(die: Object3D): number {
  const q = die.getWorldQuaternion(new Quaternion()), n = new Vector3();
  let best = 1, most = -2;
  for (const [value, face] of DIE_FACES) { const y = n.copy(face).applyQuaternion(q).y; if (y > most) { most = y; best = value; } }
  return best;
}

/** The turn that lays a die with `value` on top (copy it into die.quaternion). */
export function dieRotation(value: number): Quaternion {
  const face = DIE_FACES.find(([v]) => v === value)?.[1] ?? DIE_FACES[0][1];
  return new Quaternion().setFromUnitVectors(face, new Vector3(0, 1, 0));
}

/** A pair of dice (or `count`) lying a little apart, each its own mesh named 'Die 1', 'Die 2'… with a different value up. */
export function dice(count = 2, size = 0.03): Group {
  const out = named(new Group(), 'Dice');
  for (let i = 0; i < count; i++) {
    const d = die(size), r = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3 + i * 0.5);
    d.quaternion.copy(r.multiply(dieRotation([5, 6, 3, 2, 4, 1][i % 6])));
    d.position.set((i - (count - 1) / 2) * size * 1.8, size / 2, (i % 2) * size * -0.7);
    d.name = `Die ${i + 1}`;
    out.add(d);
  }
  return out;
}

/* ------------------------------------------------------------------ playing cards */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
const SUIT_RED = 0xe0383c, SUIT_BLACK = 0x2a2433, CARD = 0xf6f0e6;
const circle = (x: number, y: number, r: number, n = 10): [number, number][] => Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * r] as [number, number]);
const heart = (flip = 1): [number, number][] => Array.from({ length: 30 }, (_, i) => {
  const t = (i / 30) * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return [x / 32, (flip * (y + 2.5)) / 30] as [number, number];
});
/** A suit's outline as flat contours about 1 unit tall round (0, 0), pointing up: one for a heart or a diamond, a few for a club or a spade. */
export function suitShape(suit: Suit): [number, number][][] {
  const stem: [number, number][] = [[-0.06, -0.05], [0.06, -0.05], [0.2, -0.5], [-0.2, -0.5]];
  if (suit === 'hearts') return [heart()];
  if (suit === 'diamonds') return [[[0, 0.55], [0.38, 0], [0, -0.55], [-0.38, 0]]];
  if (suit === 'clubs') return [circle(0, 0.25, 0.22), circle(-0.24, -0.08, 0.22), circle(0.24, -0.08, 0.22), stem];
  return [heart(-1).map(([x, y]) => [x, y + 0.08] as [number, number]).reverse(), stem];
}

/** Where the pips of a card of 2–10 sit, in shares of the pip field across (u) and up (v). */
const CARD_PIPS: Record<number, [number, number][]> = {
  2: [[0, 1], [0, -1]], 3: [[0, 1], [0, 0], [0, -1]], 4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
  5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]], 6: [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
  7: [[-1, 1], [1, 1], [0, 0.5], [-1, 0], [1, 0], [-1, -1], [1, -1]], 8: [[-1, 1], [1, 1], [0, 0.5], [-1, 0], [1, 0], [0, -0.5], [-1, -1], [1, -1]],
  9: [[-1, 1], [1, 1], [-1, 0.33], [1, 0.33], [0, 0], [-1, -0.33], [1, -0.33], [-1, -1], [1, -1]],
  10: [[-1, 1], [1, 1], [0, 0.66], [-1, 0.33], [1, 0.33], [-1, -0.33], [1, -0.33], [0, -0.66], [-1, -1], [1, -1]],
};

/** A rounded rectangle's contour, w × h round (0, 0), corners of radius r. */
function roundRect(w: number, h: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [cx, cy, a0] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 0.5], [-w / 2 + r, -h / 2 + r, 1], [w / 2 - r, -h / 2 + r, 1.5]] as const)
    for (let i = 0; i <= 3; i++) { const a = (a0 + i / 6) * Math.PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

/**
 * A playing card (63 × 88 mm, a toy 3 mm thick), its centre at the origin, its face towards +Z and its top up (+Y):
 * cream with rounded corners and raised suit shapes — an ace one big suit, 2–10 their pips in the usual places (the
 * lower ones upside down), a jack, queen or king (11–13) a suit under a gold crown of 2, 3 or 4 points — a small suit
 * in two corners; the back red with a cream border and diamond. One mesh named like 'A hearts', '7 spades'.
 */
export function playingCard(suit: Suit, rank = 1, size = 0.088): Mesh {
  const k = size / 0.088, w = 0.063 * k, h = size, t = 0.003 * k, g = new Group(), ink = suit === 'hearts' || suit === 'diamonds' ? SUIT_RED : SUIT_BLACK;
  g.add(toy(slab(roundRect(w, h, 0.006 * k), t, 0.12), evenFaces(CARD, 0.03), { vary: 0 }));
  // `lift` sets a shape onto another one (never at the same depth: the two would flicker through each other)
  const decal = (polys: [number, number][][], s: number, x: number, y: number, colour: number, flip = false, back = false, lift = 0) => {
    for (const p of polys) {
      const geo = slab(p.map(([a, b]) => [a * s, b * s] as [number, number]), 0.0008 * k, 0.05);
      if (flip) geo.rotateZ(Math.PI);
      if (back) geo.rotateY(Math.PI);
      g.add(toy(geo.translate(x, y, (back ? -1 : 1) * (t / 2 + (0.0002 + lift) * k)), evenFaces(colour, 0.03), { vary: 0 }));
    }
  };
  const shape = suitShape(suit);
  if (rank <= 1) decal(shape, 0.034 * k, 0, 0, ink);
  else if (rank <= 10) for (const [u, v] of CARD_PIPS[rank]) decal(shape, 0.0125 * k, u * 0.0125 * k, v * 0.026 * k, ink, v < -0.01);
  else {
    decal(shape, 0.022 * k, 0, -0.006 * k, ink);
    const n = rank - 9, cw = 0.026 * k, crown: [number, number][] = [[cw / 2, 0], [cw / 2, 0.006 * k]];
    for (let i = n - 1; i >= 0; i--) { const x = -cw / 2 + (cw * (i + 0.5)) / n; crown.push([x + cw / (2 * n), 0.006 * k], [x, 0.014 * k], [x - cw / (2 * n), 0.006 * k]); }
    crown.push([-cw / 2, 0.006 * k], [-cw / 2, 0]);
    decal([crown], 1, 0, 0.012 * k, 0xf2b53a);
  }
  decal(shape, 0.008 * k, -w / 2 + 0.0075 * k, h / 2 - 0.009 * k, ink);
  decal(shape, 0.008 * k, w / 2 - 0.0075 * k, -h / 2 + 0.009 * k, ink, true);
  // the back: a red panel inside a cream border, a cream diamond in the middle
  decal([roundRect(w - 0.008 * k, h - 0.008 * k, 0.004 * k)], 1, 0, 0, 0xc8323a, false, true);
  decal([[[0, 0.016 * k], [0.011 * k, 0], [0, -0.016 * k], [-0.011 * k, 0]]], 1, 0, 0, CARD, false, true, 0.0007);
  const name = rank <= 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
  return named(merge(g), `${name} ${suit}`);
}

/**
 * Cards fanned as held in a hand: each turned about a pivot below its bottom middle by `spread` radians (0.2) from
 * the next, shifted a little sideways and set a little behind it (the first card at the back, left). The cards keep their own meshes and names.
 */
export function cardFan(cards: Mesh[], spread = 0.2): Group {
  const out = named(new Group(), 'Card Fan'), h = 0.088, pivot = h * 0.9;
  cards.forEach((card, i) => {
    const a = (i - (cards.length - 1) / 2) * spread, holder = new Group();
    holder.rotation.z = -a;
    // 8 mm apart: a card (3 mm) and the raised shapes on both its faces, with room so none shows through the next
    holder.position.set((i - (cards.length - 1) / 2) * 0.016, -pivot, i * 0.008);
    card.position.set(0, pivot, 0);
    holder.add(card);
    out.add(holder);
  });
  return out;
}

/* ------------------------------------------------------------------ block tower */

/** The painted woods of the toys: red, blue, green, orange and bare pale wood. */
export const TOY_WOODS = [0xd8564a, 0x4a6cc8, 0x52a84a, 0xf0963a, 0xe8c48a];

/**
 * A tower of wooden blocks to pull out one by one (research/concepts/things/10-toys-games.png, Block Tower): `layers` (10) of
 * three blocks `length` long (0.075; a third as wide, a quarter as tall), each layer across the one below, some blocks
 * already pulled (`pulled`, a share of the layers, 0.55: a side or the middle, never two), one or two on the top. Painted
 * red, blue, green, orange or bare wood. Every block its own mesh named 'Block 3.1' (layer.place), resting on the next.
 */
export function blockTower(options: { layers?: number; length?: number; pulled?: number; seed?: number } = {}): Group {
  const L = options.length ?? 0.075, W = L / 3, H = L * 0.24, layers = options.layers ?? 10, out = named(new Group(), 'Block Tower');
  let seed = (options.seed ?? 3) * 9301 + 49297;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  let last = -1;
  for (let i = 0; i < layers; i++) {
    let keep = [0, 1, 2];
    if (i === layers - 1) keep = r() < 0.5 ? [0] : [0, 2].map((x) => (r() < 0.5 ? x : 1)).filter((x, k, a) => a.indexOf(x) === k);
    else if (i > 0 && i < layers - 2 && r() < (options.pulled ?? 0.55)) keep.splice(Math.floor(r() * 3), 1);
    for (const j of keep) {
      // a new colour each block, never the one just used; bare wood half as often as each paint
      let c = last;
      while (c === last) c = Math.floor(r() * (TOY_WOODS.length - 0.5));
      last = c;
      const along = i % 2 === 0, colour = TOY_WOODS[c];
      const geo = block(along ? L : W * 0.97, H * 0.98, along ? W * 0.97 : L, [0, 0, 0], 0.12);
      const b = toy(geo, evenFaces(lit(colour, 0.22), 0.06, i * 3 + j), { vary: 0 });
      b.position.set(along ? (r() - 0.5) * W * 0.06 : (j - 1) * W, i * H + H / 2, along ? (j - 1) * W : (r() - 0.5) * W * 0.06);
      b.name = `Block ${i + 1}.${j + 1}`;
      out.add(b);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ building bricks */

/** The bricks' plastic colours: red, blue, yellow, green, white. */
export const BRICK_COLOURS = [0xe8392e, 0x2f63d6, 0xf7c21c, 0x3fae4a, 0xf2efe8];

/**
 * A building brick `w` × `d` studs (2 × 4), `pitch` metres a stud (0.016 — twice a real one, to take in the hand),
 * 1.2 pitches tall, its origin at its bottom middle: glossy-free plastic with round studs on top and, underneath, a
 * hollow with walls and tubes the studs of the brick below fit into. One mesh named 'Brick 2x4'; stack it with
 * brickSnap (a brick sits on another at y + brickHeight()).
 */
export function brick(w = 2, d = 4, color = BRICK_COLOURS[0], pitch = 0.016): Mesh {
  const g = new Group(), W = w * pitch - pitch * 0.02, D = d * pitch - pitch * 0.02, H = pitch * 1.2, t = pitch * 0.15, top = pitch * 0.15;
  const paint = evenFaces(lit(color, 0.2), 0.05);
  const piece = (geo: ReturnType<typeof block>) => g.add(toy(geo, paint, { vary: 0 }));
  piece(block(W, top, D, [0, H - top / 2, 0], 0.1));
  piece(block(W, H - top, t, [0, (H - top) / 2, D / 2 - t / 2], 0.1));
  piece(block(W, H - top, t, [0, (H - top) / 2, -D / 2 + t / 2], 0.1));
  piece(block(t, H - top, D - 2 * t, [W / 2 - t / 2, (H - top) / 2, 0], 0.1));
  piece(block(t, H - top, D - 2 * t, [-W / 2 + t / 2, (H - top) / 2, 0], 0.1));
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++)
    piece(turned([[0, H], [pitch * 0.3, H], [pitch * 0.3, H + pitch * 0.2], [pitch * 0.26, H + pitch * 0.22], [0, H + pitch * 0.22]], 10).translate((i - (w - 1) / 2) * pitch, 0, (j - (d - 1) / 2) * pitch));
  for (let i = 0; i < w - 1; i++) for (let j = 0; j < d - 1; j++)
    piece(turned([[pitch * 0.3, 0], [pitch * 0.4, 0], [pitch * 0.4, H - top], [pitch * 0.3, H - top], [pitch * 0.3, 0]], 10).translate((i - (w - 2) / 2) * pitch, 0, (j - (d - 2) / 2) * pitch));
  return named(merge(g), `Brick ${w}x${d}`);
}

/** A brick's height for `pitch` (stack: the next brick's y is this much higher). */
export const brickHeight = (pitch = 0.016) => pitch * 1.2;

/**
 * Snaps a brick's position onto the stud grid (in place; returns it): x and z to whole pitches, or half pitches when
 * the brick is odd along that side (`w`, `d` as built and turned a quarter or not), y to whole brick heights.
 */
export function brickSnap(position: Vector3, w = 2, d = 4, pitch = 0.016, turnedQuarter = false): Vector3 {
  const [sx, sz] = turnedQuarter ? [d, w] : [w, d];
  const snap = (v: number, n: number) => { const off = n % 2 ? 0 : pitch / 2; return Math.round((v - off) / pitch) * pitch + off; };
  position.x = snap(position.x, sx);
  position.z = snap(position.z, sz);
  position.y = Math.max(0, Math.round(position.y / brickHeight(pitch)) * brickHeight(pitch));
  return position;
}

/** A small pile of bricks as in the concept: red, blue and yellow 2×4s and 2×2s stacked across each other, each its own mesh. */
export function brickPile(pitch = 0.016): Group {
  const out = named(new Group(), 'Bricks'), h = brickHeight(pitch);
  const put = (w: number, d: number, c: number, x: number, y: number, z: number, quarter = false) => {
    const b = brick(w, d, BRICK_COLOURS[c], pitch);
    if (quarter) b.rotation.y = Math.PI / 2;
    b.position.copy(brickSnap(new Vector3(x * pitch, y * h, z * pitch), w, d, pitch, quarter));
    out.add(b);
  };
  // the ground layer, then each upper brick resting across one or two below (centres in pitches)
  put(2, 4, 1, -2, 0, 2, true);
  put(2, 4, 0, 1, 0, 0);
  put(2, 4, 0, 4, 0, 2, true);
  put(2, 2, 2, -3, 0, 0);
  put(2, 4, 1, -1, 1, 0);
  put(2, 4, 2, 3, 1, 0, true);
  put(2, 4, 0, 0, 2, 0, true);
  return out;
}

/* ------------------------------------------------------------------ jigsaw puzzle */

/** The puzzles' picture colours: green, blue, red, yellow, orange. */
export const PUZZLE_COLOURS = [0x8cc850, 0x5a8ad8, 0xe85a4a, 0xf5c040, 0xf09a3a];

/** A jigsaw piece's contour, `size` across round (0, 0): edges bottom (−y), right, top, left, each 1 a tab, −1 a blank, 0 flat. */
function pieceContour(edges: [number, number, number, number], size: number): [number, number][] {
  const h = size / 2, nw = size * 0.075, R = size * 0.16, c = size * 0.22, s = Math.sqrt(R * R - nw * nw), out: [number, number][] = [];
  const sides: [[number, number], [number, number], [number, number]][] = [[[-h, -h], [1, 0], [0, -1]], [[h, -h], [0, 1], [1, 0]], [[h, h], [-1, 0], [0, 1]], [[-h, h], [0, -1], [-1, 0]]];
  sides.forEach(([[ax, ay], [dx, dy], [nx, ny]], k) => {
    const e = edges[k], at = (u: number, v: number) => out.push([ax + dx * (h + u) + nx * e * v, ay + dy * (h + u) + ny * e * v]);
    at(-h, 0);
    if (!e) return;
    at(-nw, 0);
    const a0 = Math.atan2(-s, -nw) + Math.PI * 2, a1 = Math.atan2(-s, nw);
    for (let i = 0; i <= 10; i++) { const a = a0 + ((a1 - a0) * i) / 10; at(Math.cos(a) * R, c + Math.sin(a) * R); }
    at(nw, 0);
  });
  return out;
}

/**
 * One jigsaw piece `size` across its square (0.06; tabs reach beyond), a quarter as thick, lying on y = 0: `edges`
 * [front (+Z), right (+X), back (−Z), left (−X)], each 1 a tab, −1 a blank, 0 a straight border, in `color`
 * with a few blobs of other picture colours on top as a bit of the picture. One mesh.
 */
export function puzzlePiece(edges: [number, number, number, number], size = 0.06, color = PUZZLE_COLOURS[0], seed = 1): Mesh {
  const g = new Group(), t = size * 0.24, h = size / 2;
  let sd = seed * 7919 + 13;
  const r = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
  const body = slab(pieceContour(edges, size), t, 0.1);
  body.rotateX(-Math.PI / 2).translate(0, t / 2, 0);
  g.add(toy(body, evenFaces(lit(color, 0.25), 0.04, seed), { vary: 0 }));
  const others = PUZZLE_COLOURS.filter((x) => x !== color), blobs = 1 + Math.floor(r() * 2);
  for (let b = 0; b < blobs; b++) {
    const rad = size * (0.16 + r() * 0.12), lim = Math.max(0, h - rad * 0.9 - size * 0.04), x = (r() * 2 - 1) * lim, y = (r() * 2 - 1) * lim;
    const blob = Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2, q = rad * (0.75 + r() * 0.5); return [x + Math.cos(a) * q, y + Math.sin(a) * q] as [number, number]; });
    const geo = slab(blob, size * 0.012, 0.05);
    // each blob a little above the last: two that overlap at one depth would flicker
    geo.rotateX(-Math.PI / 2).translate(0, t + size * (0.004 + b * 0.008), 0);
    g.add(toy(geo, evenFaces(others[Math.floor(r() * others.length)], 0.03, b), { vary: 0 }));
  }
  return named(merge(g), 'Piece');
}

/**
 * A jigsaw puzzle of `cols` × `rows` pieces (3 × 2) that fit together: neighbours share a tab and a blank, the
 * outer edges straight. Each piece its own mesh named 'Piece 1.2' (row.column), laid out solved round the origin;
 * userData.home holds its solved place (snap a piece home when it comes near it).
 */
export function jigsaw(options: { cols?: number; rows?: number; size?: number; seed?: number } = {}): Group {
  const cols = options.cols ?? 3, rows = options.rows ?? 2, size = options.size ?? 0.06, out = named(new Group(), 'Jigsaw');
  let sd = (options.seed ?? 5) * 7919 + 17;
  const r = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646, flip = () => (r() < 0.5 ? 1 : -1);
  const across = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, flip)); // between c and c+1
  const down = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, flip)); // between r and r+1
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    // contour edges: bottom (−y → +Z after laying flat, the next row), right (+X), top (−Z, the row before), left (−X)
    const edges: [number, number, number, number] = [i < rows - 1 ? down[i][j] : 0, j < cols - 1 ? across[i][j] : 0, i > 0 ? -down[i - 1][j] : 0, j > 0 ? -across[i][j - 1] : 0];
    const p = puzzlePiece(edges, size, PUZZLE_COLOURS[(i * cols + j) % PUZZLE_COLOURS.length], i * cols + j + 1);
    p.position.set((j - (cols - 1) / 2) * size, 0, (i - (rows - 1) / 2) * size);
    p.userData.home = p.position.clone();
    p.name = `Piece ${i + 1}.${j + 1}`;
    out.add(p);
  }
  return out;
}

/* ------------------------------------------------------------------ dominoes */

/**
 * A domino `length` long (0.064; half as wide, a sixth as thick), its centre at the origin, lying face up (+Y) and
 * long along X: a cream tile with chamfered edges, a dark line across the middle and `a` pips (0–6) on its −X half,
 * `b` on its +X half, set into the face. One mesh named like 'Domino 3|5'; stand it on end for a chain (dominoChain).
 */
export function domino(a: number, b: number, length = 0.064, color = 0xf4ece0, pip = 0x16101c): Mesh {
  const g = new Group(), L = length, W = L / 2, T = L / 6;
  g.add(toy(block(L, T, W, [0, 0, 0], 0.22), evenFaces(lit(color, 0.18), 0.04), { vary: 0 }));
  g.add(toy(block(W * 0.04, T * 0.1, W * 0.72, [0, T / 2, 0], 0.3), evenFaces(pip, 0.02), { vary: 0 }));
  [a, b].forEach((n, side) => {
    for (const [u, v] of PIPS[n] ?? []) {
      const dot = new CylinderGeometry(W * 0.075, W * 0.075, T * 0.12, 12);
      g.add(toy(dot.translate((side ? 1 : -1) * W / 2 + u * W * 0.25, T / 2 - T * 0.03, v * W * 0.25), evenFaces(pip, 0.02), { vary: 0 }));
    }
  });
  return named(merge(g), `Domino ${a}|${b}`);
}

/**
 * A chain of `count` dominoes (12) standing on end along a gentle S-curve on y = 0, each `spacing` (0.6 of a length)
 * behind the last, face to face, random values: tip the first (+Z end) and they fall. Each its own mesh 'Domino k'.
 */
export function dominoChain(count = 12, length = 0.064, spacing = 0.6, seed = 7): Group {
  const out = named(new Group(), 'Domino Chain');
  let sd = seed * 7919 + 3;
  const r = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646, step = length * spacing;
  for (let i = 0; i < count; i++) {
    const d = domino(Math.floor(r() * 7), Math.floor(r() * 7), length), z = (count / 2 - i) * step, x = Math.sin(i * 0.5) * length * 0.6;
    // standing on end its thin side (local X once stood up) runs along the path, so each falls onto the next
    const heading = Math.atan2(step, Math.cos(i * 0.5) * length * 0.6 * 0.5);
    d.rotation.set(0, heading, Math.PI / 2, 'YXZ');
    d.position.set(x, length / 2, z);
    d.name = `Domino ${i + 1}`;
    out.add(d);
  }
  return out;
}

/* ------------------------------------------------------------------ spinning top */

/**
 * A spinning top `height` metres tall (0.12), standing on its tip at the origin: a ten-sided body in rainbow belts
 * (each belt its own ring of facets) — purple at the tip, blue, green, yellow, orange, a red rim, and back up through
 * orange, yellow and green to a blue crown — with a thin stem and a red knob to twist it by. One mesh named
 * 'Spinning Top': spin it round Y, lean it as it slows.
 */
export function spinningTop(height = 0.12): Mesh {
  const k = height / 0.12, g = new Group();
  const P = 0x6a4ad0, B = 0x3a8cf0, G = 0x45c46a, Y = 0xffc93a, O = 0xff8a2f, R = 0xe94b3c;
  const profile: [number, number][] = [[0, 0], [0.005, 0.006], [0.014, 0.016], [0.024, 0.026], [0.033, 0.035], [0.04, 0.043], [0.044, 0.05], [0.046, 0.055], [0.046, 0.06], [0.041, 0.065], [0.034, 0.07], [0.025, 0.075], [0.015, 0.079], [0.006, 0.081], [0, 0.081]];
  const belts = [P, P, B, G, Y, O, R, R, O, Y, G, B, B, B];
  const belt = (c: Vector3) => { const y = c.y / k; let i = 0; while (i < belts.length - 1 && y > profile[i + 1][1]) i++; return belts[i]; };
  const body = turned(profile.map(([r, y]) => [r * k * 1.12, y * k] as [number, number]), 10);
  g.add(toy(body, evenFaces((c, n) => mix(belt(c), PALETTE.shade, n.y < -0.3 ? 0.22 : n.y < 0.3 ? 0.08 : 0), 0.06), { vary: 0 }));
  g.add(toy(turned([[0.0038 * k, 0.078 * k], [0.0038 * k, 0.105 * k], [0, 0.105 * k]], 6), lit(0x6a4030, 0.25), { vary: 0.04 }));
  g.add(toy(turned([[0, 0.102 * k], [0.007 * k, 0.104 * k], [0.0085 * k, 0.115 * k], [0.006 * k, 0.12 * k], [0, 0.12 * k]], 8), evenFaces(lit(R, 0.22), 0.05), { vary: 0 }));
  return named(merge(g), 'Spinning Top');
}

/* ------------------------------------------------------------------ puzzle cube */

/** A puzzle cube's sticker colours by face: +Y white, −Y yellow, +Z green, −Z blue, +X red, −X orange. */
const CUBE_FACES: [Vector3, number][] = [[new Vector3(0, 1, 0), 0xf2efe8], [new Vector3(0, -1, 0), 0xffc93a], [new Vector3(0, 0, 1), 0x45b85a], [new Vector3(0, 0, -1), 0x3a7ce0], [new Vector3(1, 0, 0), 0xe23e34], [new Vector3(-1, 0, 0), 0xff8a2f]];

/**
 * A 3 × 3 × 3 puzzle cube `size` metres across (0.075), its centre at the origin: 26 dark plastic cubies, each with
 * rounded coloured stickers raised on its outer faces, each its own mesh named 'Cubie x,y,z' (−1…1); scrambled by
 * `scramble` random quarter turns (20; 0 for a solved cube). Turn a layer with turnLayer, find one with cubeLayer.
 */
export function puzzleCube(options: { size?: number; scramble?: number; seed?: number } = {}): Group {
  const size = options.size ?? 0.075, s = size / 3, out = named(new Group(), 'Puzzle Cube');
  out.userData.cubie = s;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const g = new Group(), at = new Vector3(x, y, z);
    g.add(toy(block(s * 0.97, s * 0.97, s * 0.97, [0, 0, 0], 0.14), evenFaces(0x24202a, 0.06), { vary: 0 }));
    for (const [n, colour] of CUBE_FACES) {
      if (at.dot(n) < 1) continue;
      const sticker = block(s * 0.86, s * 0.03, s * 0.86, [0, 0, 0], 0.3).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n));
      const p = n.clone().multiplyScalar(s * 0.49);
      g.add(toy(sticker.translate(p.x, p.y, p.z), evenFaces(colour, 0.05), { vary: 0 }));
    }
    const m = named(merge(g), `Cubie ${x},${y},${z}`);
    m.position.copy(at).multiplyScalar(s);
    out.add(m);
  }
  let sd = (options.seed ?? 11) * 7919 + 7;
  const r = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < (options.scramble ?? 20); i++) turnLayer(out, (['x', 'y', 'z'] as const)[Math.floor(r() * 3)], Math.floor(r() * 3) - 1, r() < 0.5 ? 1 : -1);
  return out;
}

/** The cubies of a puzzle cube now in layer `layer` (−1, 0, 1) along `axis`: parent them to a pivot to animate a turn. */
export function cubeLayer(cube: Object3D, axis: 'x' | 'y' | 'z', layer: number): Object3D[] {
  const s = cube.userData.cubie as number;
  return cube.children.filter((c) => Math.round(c.position[axis] / s) === layer);
}

/** Turns a puzzle cube's layer a quarter turn (`dir` 1 anticlockwise looking down the axis, −1 clockwise) at once, snapping each cubie to the grid. */
export function turnLayer(cube: Object3D, axis: 'x' | 'y' | 'z', layer: number, dir = 1): void {
  const s = cube.userData.cubie as number, q = new Quaternion().setFromAxisAngle(new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), (dir * Math.PI) / 2);
  for (const c of cubeLayer(cube, axis, layer)) {
    c.position.applyQuaternion(q).divideScalar(s).round().multiplyScalar(s);
    c.quaternion.premultiply(q).normalize();
  }
}

/* ------------------------------------------------------------------ treasure chest */

/**
 * A treasure chest `width` metres wide (0.5; 0.32 deep), standing on y = 0, its front towards +Z: a box of wooden
 * planks with gold corners and rims and a gold lock plate with a keyhole, dark inside, a heap of gold coins and gems
 * in it ('Treasure'); its lid ('Lid', its own mesh) a faceted wooden arch with gold end frames, two gold bands over it
 * and a turquoise gem at the front, hinged along the back top edge: lid.rotation.x = −1.2 opens it (`open`, 0.5).
 */
export function treasureChest(options: { width?: number; open?: number; treasure?: boolean } = {}): Group {
  const k = (options.width ?? 0.5) / 0.5, w = 0.5 * k, d = 0.32 * k, H = 0.24 * k, lh = 0.15 * k, wt = 0.03 * k, out = named(new Group(), 'Treasure Chest');
  const WOOD = [0x9a5634, 0x86462a], GOLD = evenFaces(lit(PALETTE.gold, 0.22), 0.06), ink = 0x1e1418;
  // the box: a floor and four walls of two planks each, dark inside
  const inside = (c: Vector3) => Math.abs(c.x) < w / 2 - wt + 1e-4 && Math.abs(c.z) < d / 2 - wt + 1e-4 && c.y > wt * 0.9;
  const wood = (i: number) => evenFaces((c: Vector3, n: Vector3) => mix(lit(WOOD[i % 2], 0.22)(c, n), PALETTE.shade, inside(c) ? 0.6 : 0), 0.06, i);
  const box = new Group();
  box.add(toy(block(w, wt, d, [0, wt / 2, 0], 0.1), wood(0), { vary: 0 }));
  for (let p = 0; p < 2; p++) {
    const y = wt + ((H - wt) / 2) * (p + 0.5), ph = (H - wt) / 2 - 0.004 * k;
    box.add(toy(block(w, ph, wt, [0, y, d / 2 - wt / 2], 0.1), wood(p + 1), { vary: 0 }));
    box.add(toy(block(w, ph, wt, [0, y, -d / 2 + wt / 2], 0.1), wood(p + 2), { vary: 0 }));
    box.add(toy(block(wt, ph, d - 2 * wt, [w / 2 - wt / 2, y, 0], 0.1), wood(p + 3), { vary: 0 }));
    box.add(toy(block(wt, ph, d - 2 * wt, [-w / 2 + wt / 2, y, 0], 0.1), wood(p + 4), { vary: 0 }));
  }
  // gold: corner posts, a rim round the top and the bottom, the lock plate with its keyhole
  const g = 0.034 * k, gt = 0.026 * k;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box.add(toy(block(g, H, g, [sx * (w / 2 - g / 2 + 0.006 * k), H / 2, sz * (d / 2 - g / 2 + 0.006 * k)], 0.15), GOLD, { vary: 0 }));
  for (const y of [gt / 2, H - gt / 2]) {
    box.add(toy(block(w + 0.01 * k, gt, 0.016 * k, [0, y, d / 2 + 0.003 * k], 0.2), GOLD, { vary: 0 }));
    box.add(toy(block(w + 0.01 * k, gt, 0.016 * k, [0, y, -d / 2 - 0.003 * k], 0.2), GOLD, { vary: 0 }));
    box.add(toy(block(0.016 * k, gt, d + 0.01 * k, [w / 2 + 0.003 * k, y, 0], 0.2), GOLD, { vary: 0 }));
    box.add(toy(block(0.016 * k, gt, d + 0.01 * k, [-w / 2 - 0.003 * k, y, 0], 0.2), GOLD, { vary: 0 }));
  }
  box.add(toy(block(0.075 * k, 0.09 * k, 0.014 * k, [0, H - 0.062 * k, d / 2 + 0.008 * k], 0.2), GOLD, { vary: 0 }));
  const hole = circle(0, 0.008 * k, 0.009 * k, 8);
  box.add(toy(slab(hole, 0.004 * k, 0.05).translate(0, H - 0.058 * k, d / 2 + 0.0155 * k), ink, { vary: 0 }));
  box.add(toy(slab([[-0.004 * k, 0.004 * k], [0.004 * k, 0.004 * k], [0.007 * k, -0.016 * k], [-0.007 * k, -0.016 * k]], 0.004 * k, 0.05).translate(0, H - 0.058 * k, d / 2 + 0.0155 * k), ink, { vary: 0 }));
  out.add(named(merge(box), 'Box'));
  // the lid, built round its hinge (the back top edge): a faceted arch from the back (z 0) to the front (z d)
  const a = d / 2, arch = (o: number): [number, number][] => [[-(a + o), 0], [a + o, 0], [a + o, lh * 0.5], [a * 0.55 + o * 0.6, lh + o], [-(a * 0.55 + o * 0.6), lh + o], [-(a + o), lh * 0.5]];
  const band = (o: number, t: number): [number, number][] => {
    const outer = arch(o + t), inner = arch(o);
    return [outer[0], outer[5], outer[4], outer[3], outer[2], outer[1], inner[1], inner[2], inner[3], inner[4], inner[5], inner[0]];
  };
  // a slab's bevel grows its contour by bevel × thickness: keep it a few millimetres, or the wide lid swallows its bands
  const across = (contour: [number, number][], thick: number, x: number) => slab(contour, thick, Math.min(0.1, (0.003 * k) / thick)).rotateY(Math.PI / 2).translate(x, 0, a);
  const lid = new Group();
  lid.add(toy(across(arch(0), w - 0.02 * k, 0), evenFaces((c: Vector3, n: Vector3) => (n.y < -0.5 ? mix(WOOD[1], PALETTE.shade, 0.6) : lit(WOOD[0], 0.22)(c, n)), 0.08, 3), { vary: 0 }));
  for (const sx of [-1, 1]) {
    lid.add(toy(across(band(0, 0.024 * k), 0.034 * k, sx * (w / 2 - 0.012 * k)), GOLD, { vary: 0 }));
    lid.add(toy(across(band(0, 0.014 * k), 0.05 * k, sx * w * 0.2), GOLD, { vary: 0 }));
  }
  lid.add(toy(block(w + 0.01 * k, 0.026 * k, 0.016 * k, [0, 0.013 * k, d + 0.003 * k], 0.2), GOLD, { vary: 0 }));
  lid.add(toy(block(0.07 * k, 0.07 * k, 0.02 * k, [0, 0.03 * k, d + 0.01 * k], 0.25), GOLD, { vary: 0 }));
  lid.add(toy(new OctahedronGeometry(0.026 * k, 0).scale(1, 1, 0.6).translate(0, 0.03 * k, d + 0.024 * k), evenFaces(lit(0x4fd8c8, 0.2), 0.12), { vary: 0 }));
  const lidMesh = named(merge(lid), 'Lid');
  lidMesh.position.set(0, H, -a);
  lidMesh.rotation.x = -(options.open ?? 0.5);
  out.add(lidMesh);
  // the treasure: a heap of gold, coins lying on it, two gems
  if (options.treasure ?? true) {
    const t = new Group();
    const rx = 0.19 * k, ry = 0.06 * k, rz = 0.125 * k, cy = H * 0.72, on = (x: number, z: number) => cy + ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (z / rz) ** 2));
    t.add(toy(blob(0.14 * k, 5, 1, 0.12, 0.42).scale(1.35, 1, 0.9).translate(0, cy, 0), evenFaces(lit(0xe8a028, 0.25), 0.08), { vary: 0 }));
    for (let i = 0; i < 9; i++) {
      // coins lying on the heap, tipped to its slope
      const ang = i * 2.4, rr = 0.25 + (i % 3) * 0.22, x = Math.cos(ang) * rx * rr, z = Math.sin(ang) * rz * rr;
      t.add(toy(new CylinderGeometry(0.024 * k, 0.024 * k, 0.006 * k, 10).rotateX((z / rz) * 0.6).rotateZ((-x / rx) * 0.6).translate(x, on(x, z) + 0.004 * k, z), evenFaces(lit(0xffd65a, 0.2), 0.1, i), { vary: 0 }));
    }
    t.add(toy(new OctahedronGeometry(0.022 * k, 0).translate(-0.08 * k, H * 0.72 + 0.06 * k, 0.03 * k), evenFaces(lit(0xe23e5a, 0.2), 0.12), { vary: 0 }));
    t.add(toy(new OctahedronGeometry(0.018 * k, 0).translate(0.1 * k, H * 0.72 + 0.05 * k, -0.02 * k), evenFaces(lit(0x5ad0f0, 0.2), 0.12), { vary: 0 }));
    out.add(named(merge(t), 'Treasure'));
  }
  return out;
}
