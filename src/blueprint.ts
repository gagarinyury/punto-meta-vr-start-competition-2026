// A plan drawn as a pencil blueprint on Punto's tablet while the coder writes (in the game: src/features/punto.ts;
// the stand: research/code/tools/tablet-stand.ts; polygon of 15.11).
// A plan is a list of simple shapes (Flash-Lite's sketch of the thing, /api/plan; research/code/tools/blueprint-plans.ts keeps three for the stand);
// the front view of each is drawn stroke by stroke, a hand line that wobbles a little and runs past the corner.
// `draw(t)` paints the canvas at t seconds and says where the tool is on the screen (0..1, y down) and which end
// is down: the pencil, or the eraser. Once the drawing is done, and until the real thing comes, Punto keeps working
// on it (Yury, 15.11): he turns the pencil over, rubs a part out and draws it again, one part after another.
import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';

export interface PlanPart {
  name: string;
  shape: 'box' | 'cylinder' | 'cone' | 'sphere' | 'torus';
  size: number[];
  at: number[];
  turn?: number[];
  color?: string;
  count?: number;
  step?: number[];
}
/** A ready line of a drawing (metres: x right, y up) and the part it belongs to: the outline of a model (src/materialize.ts). */
export interface PlanLine { pts: [number, number][]; part: number }
type Outline = { circle: [number, number, number] } | { poly: [number, number][] };
interface Stroke { pts: [number, number][]; t0: number; t1: number; part: number }
export interface Tool { u: number; v: number; eraser: boolean; down: boolean; away?: boolean }

const DEG = Math.PI / 180;
const rnd = (n: number) => { const x = Math.sin(n * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); };

/** The front view of a part (x right, y up, metres): rectangles, triangles, circles. */
function outlines(part: PlanPart): Outline[] {
  const out: Outline[] = [];
  const [w = 0.1, h = 0.1, d = 0.1] = part.size;
  const [rx = 0, ry = 0, rz = 0] = part.turn ?? [];
  const n = Math.max(1, Math.min(40, part.count ?? 1));
  for (let i = 0; i < n; i++) {
    const [ax = 0, ay = 0] = part.at, [sx = 0, sy = 0] = part.step ?? [];
    const cx = ax + sx * i, cy = ay + sy * i;
    const facing = Math.abs(Math.cos(rx * DEG)) < 0.5;
    const rot = (pts: [number, number][]) => pts.map(([x, y]): [number, number] => {
      const c = Math.cos(rz * DEG), s = Math.sin(rz * DEG);
      return [cx + x * c - y * s, cy + x * s + y * c];
    });
    const wide = part.shape === 'box' ? Math.abs(w * Math.cos(ry * DEG)) + Math.abs(d * Math.sin(ry * DEG)) : w;
    if (part.shape === 'sphere') out.push({ circle: [cx, cy, w / 2] });
    else if ((part.shape === 'cylinder' || part.shape === 'torus') && facing) out.push({ circle: [cx, cy, w / 2] });
    else if (part.shape === 'cone') {
      const up = Math.cos(rx * DEG) * Math.cos(rz * DEG) >= 0 ? 1 : -1;
      out.push({ poly: rot([[-w / 2, (-up * h) / 2], [w / 2, (-up * h) / 2], [0, (up * h) / 2]]) });
    } else out.push({ poly: rot([[-wide / 2, -h / 2], [wide / 2, -h / 2], [wide / 2, h / 2], [-wide / 2, h / 2]]) });
  }
  return out;
}

/** Pencil strokes for the plan, in order, timed from 0: about a fifth of a second each. */
function strokesOf(plan: PlanPart[], pace = 1): Stroke[] {
  const strokes: Stroke[] = [];
  let at = 0, k = 0;
  for (const [index, part] of plan.entries()) {
    for (const o of outlines(part)) {
      if ('circle' in o) {
        const [x, y, r] = o.circle, pts: [number, number][] = [];
        const a0 = rnd(k) * Math.PI * 2;
        for (let i = 0; i <= 36; i++) { const a = a0 + (i / 36) * Math.PI * 2.08; const rr = r * (1 + (rnd(k + i) - 0.5) * 0.03); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
        const dur = (0.16 + Math.min(0.12, r * 0.6)) * pace;
        strokes.push({ pts, t0: at, t1: at + dur, part: index }); at += dur + 0.05 * pace; k += 50;
      } else {
        const p = o.poly;
        for (let i = 0; i < p.length; i++) {
          const a = p[i], b = p[(i + 1) % p.length];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const over = Math.min(0.012, len * 0.08);
          const ux = (b[0] - a[0]) / (len || 1), uy = (b[1] - a[1]) / (len || 1);
          const bend = (rnd(k) - 0.5) * len * 0.025;
          const pts: [number, number][] = [];
          for (let j = 0; j <= 8; j++) {
            const s = j / 8, along = -over + s * (len + 2 * over), side = Math.sin(s * Math.PI) * bend;
            pts.push([a[0] + ux * along - uy * side, a[1] + uy * along + ux * side]);
          }
          const dur = (0.06 + Math.min(0.14, len * 0.35)) * pace;
          strokes.push({ pts, t0: at, t1: at + dur, part: index }); at += dur + 0.035 * pace; k += 7;
        }
      }
    }
  }
  return strokes;
}

/** Pencil strokes along ready lines, in their order, the whole drawing in about `total` seconds (longer lines take longer). */
function strokesOfLines(lines: PlanLine[], pace = 1, total = 3.2): Stroke[] {
  const length = (pts: [number, number][]) => pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  const weights = lines.map((line) => 0.15 + length(line.pts));
  const unit = (total * pace) / Math.max(1e-6, weights.reduce((a, b) => a + b, 0));
  const strokes: Stroke[] = [];
  let at = 0;
  lines.forEach((line, i) => {
    if (line.pts.length < 2) return;
    const dur = weights[i] * unit * 0.9, gap = weights[i] * unit * 0.1;
    strokes.push({ pts: line.pts, t0: at, t1: at + dur, part: line.part });
    at += dur + gap;
  });
  return strokes;
}

// The paper is drawn in 1200 × 800 units but kept at half that in pixels (16.11): it is repainted and sent to the
// GPU every frame while Punto draws, and 1200 × 800 was 3.8 MB a frame. The 0.48 m screen a metre or more away
// is about 500 headset pixels across: 600 lose nothing.
const PAPER_W = 1200;
const PAPER_H = 800;
const PIXELS = 0.5;
let paperBack: HTMLCanvasElement | undefined; // the blue paper with its grid, painted once (see draw)

export class Blueprint {
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  readonly duration: number;
  /** a stroke started since the last draw: for the pencil's sound */
  started = 0;
  /** 1 = the drawing as it is; going to 0 while the code takes it away as letters (src/materialize.ts) */
  fade = 1;
  private strokes: Stroke[];
  private shown = -1;
  private map: (x: number, y: number) => [number, number];
  private box: { x0: number; x1: number; y0: number; y1: number };

  /** A plan of simple shapes (Flash-Lite's sketch, /api/plan), or ready lines (the outline of the chosen model). */
  constructor(plan: PlanPart[] | { lines: PlanLine[] }, pace = 1) {
    this.canvas.width = PAPER_W * PIXELS;
    this.canvas.height = PAPER_H * PIXELS;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.strokes = Array.isArray(plan) ? strokesOf(plan, pace) : strokesOfLines(plan.lines, pace);
    this.duration = (this.strokes[this.strokes.length - 1]?.t1 ?? 0) + 0.5;
    let box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    if (Array.isArray(plan)) {
      for (const part of plan) for (const o of outlines(part)) {
        const pts = 'circle' in o ? [[o.circle[0] - o.circle[2], o.circle[1] - o.circle[2]], [o.circle[0] + o.circle[2], o.circle[1] + o.circle[2]]] : o.poly;
        for (const [x, y] of pts) { box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); }
      }
    } else box = this.boxOf(this.strokes);
    this.box = box;
    const W = PAPER_W, H = PAPER_H, pad = 170;
    const s = Math.min((W - 2 * pad) / (box.x1 - box.x0 || 1), (H - 2 * pad) / (box.y1 - box.y0 || 1));
    const ox = W / 2 - ((box.x0 + box.x1) / 2) * s, oy = H / 2 + ((box.y0 + box.y1) / 2) * s;
    this.map = (x, y) => [ox + x * s, oy - y * s];
    this.draw(0);
  }

  /** The rework after the first drawing, in rounds (Yury, 15.11: «половинку стёр — оп, нарисовал — другую стёр —
   *  нарисовал»): the eraser goes over half the drawing (the left, then the right; now and then one big part) in a
   *  zigzag from top to bottom and the lines go where it has passed; the hand goes aside and the gap shows; the pencil
   *  turns over and draws that half again, twice as fast as the first time. */
  private cycles: { strokes: number[]; box: { x0: number; x1: number; y0: number; y1: number }; t0: number; rubbed: number; erased: number; t1: number }[] = [];
  private cycleAt(t: number) {
    const RUB = 1.1, GAP = 0.5, FLIP = 0.18, REDRAW = 0.5;
    let last = this.cycles[this.cycles.length - 1];
    while (!last || last.t1 <= t) {
      const t0 = last ? last.t1 : this.duration + 0.5;
      if (t < t0) return undefined;
      const n = this.cycles.length;
      const mid = (this.box.x0 + this.box.x1) / 2;
      const centre = (st: Stroke) => st.pts.reduce((sum, [x]) => sum + x, 0) / st.pts.length;
      let picked: number[];
      if (n % 3 === 2) {
        // one of the bigger parts on its own
        const parts = [...new Set(this.strokes.map((st) => st.part))].sort((a, b) => this.strokes.filter((st) => st.part === b).length - this.strokes.filter((st) => st.part === a).length);
        const part = parts[Math.floor(rnd(n * 13 + 5) * Math.min(3, parts.length))];
        picked = this.strokes.map((st, i) => (st.part === part ? i : -1)).filter((i) => i >= 0);
      } else {
        const left = n % 3 === 0;
        picked = this.strokes.map((st, i) => ((centre(st) < mid) === left ? i : -1)).filter((i) => i >= 0);
      }
      if (!picked.length) picked = [0];
      const box = this.boxOf(picked.map((i) => this.strokes[i]));
      const draw = picked.reduce((sum, i) => sum + (this.strokes[i].t1 - this.strokes[i].t0) * REDRAW + 0.02, 0);
      const rubbed = t0 + RUB;
      last = { strokes: picked, box, t0, rubbed, erased: rubbed + GAP + FLIP, t1: rubbed + GAP + FLIP + draw + 0.5 };
      this.cycles.push(last);
    }
    return last.t0 <= t ? last : undefined;
  }

  /** Where a point of the drawing (metres) is on the paper: u, v from 0 to 1, from the top left. */
  toPaper(x: number, y: number): [number, number] {
    const [X, Y] = this.map(x, y);
    return [X / PAPER_W, Y / PAPER_H];
  }

  /** Paints the blueprint at `t` s; returns where the tool is (u, v: 0..1 from the top left) and which end is down. */
  draw(t: number): Tool | null {
    const g = this.canvas.getContext('2d')!;
    g.setTransform(PIXELS, 0, 0, PIXELS, 0, 0); // drawn in paper units (1200 × 800), stored at PIXELS of that
    const W = PAPER_W, H = PAPER_H;
    g.clearRect(0, 0, W, H);
    // the paper: blueprint blue in the screen's rounded rectangle (64 units of 1200, as the UIKit screen)
    g.save();
    g.beginPath();
    g.roundRect(0, 0, W, H, 64);
    g.clip();
    // the blue paper and its grid are the same every time: painted once, then copied (18.11: the plan cost the
    // headset ~20 frames a second while it was drawn — a full repaint of paper, grid and strokes every frame)
    if (!paperBack) {
      paperBack = document.createElement('canvas');
      paperBack.width = this.canvas.width;
      paperBack.height = this.canvas.height;
      const b = paperBack.getContext('2d')!;
      b.setTransform(PIXELS, 0, 0, PIXELS, 0, 0);
      b.fillStyle = '#0f3350';
      b.fillRect(0, 0, W, H);
      b.strokeStyle = 'rgba(160,210,255,0.12)';
      b.lineWidth = 1.5;
      for (let x = 0; x < W; x += 40) { b.beginPath(); b.moveTo(x, 0); b.lineTo(x, H); b.stroke(); }
      for (let y = 0; y < H; y += 40) { b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(paperBack, 0, 0);
    g.restore();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 4.5;
    /** The points from..to, leaving out those `gone` says are rubbed out. */
    const line = (pts: [number, number][], from: number, to: number, alpha: number, gone?: (y: number) => boolean) => {
      alpha *= this.fade;
      if (alpha <= 0.01 || to <= from) return;
      g.strokeStyle = `rgba(238,248,255,${0.95 * alpha})`;
      g.beginPath();
      let pen = false;
      for (let i = from; i <= to; i++) {
        const [X, Y] = this.map(...pts[i]);
        if (gone?.(Y)) { pen = false; continue; }
        if (pen) g.lineTo(X, Y); else g.moveTo(X, Y);
        pen = true;
      }
      g.stroke();
    };
    const toolAt = (pts: [number, number][], i: number): Tool => {
      const [x, y] = this.map(...pts[i]);
      return { u: x / W, v: y / H, eraser: false, down: true };
    };
    const cycle = this.cycleAt(t);
    const reworked = new Set(cycle?.strokes ?? []);
    let tool: Tool | null = null, count = 0;
    this.strokes.forEach((st, index) => {
      if (t < st.t0) return;
      count++;
      if (reworked.has(index)) return; // drawn below
      const last = st.pts.length - 1;
      const u = Math.min(1, (t - st.t0) / (st.t1 - st.t0));
      const n = Math.max(1, Math.round(u * last));
      line(st.pts, 0, n, 1);
      if (u < 1) tool = toolAt(st.pts, n);
    });
    if (cycle) {
      const [bx0, by0] = this.map(cycle.box.x0, cycle.box.y1), [bx1, by1] = this.map(cycle.box.x1, cycle.box.y0);
      const pad = 18;
      if (t < cycle.erased) {
        // the eraser's band comes down the half; above it the lines are gone (a faint smudge stays)
        const e = Math.min(1, (t - cycle.t0) / (cycle.rubbed - cycle.t0));
        const sweep = by0 - pad + (by1 - by0 + 2 * pad) * e;
        for (const index of cycle.strokes) {
          const st = this.strokes[index];
          line(st.pts, 0, st.pts.length - 1, 0.1);
          line(st.pts, 0, st.pts.length - 1, 1, (y) => y < sweep);
        }
        if (t < cycle.rubbed) {
          const across = (Math.sin(e * Math.PI * 9) + 1) / 2; // back and forth, quickly
          tool = { u: (bx0 - pad + (bx1 - bx0 + 2 * pad) * across) / W, v: sweep / H, eraser: true, down: true };
        } else {
          // rubbed out: the hand goes aside to the screen's edge, the gap shows, he turns the pencil over there
          tool = { u: 1.02, v: 0.55, eraser: t < cycle.erased - 0.2, down: false, away: true };
        }
      } else {
        // drawn again, twice as fast as the first time
        let from = cycle.erased;
        for (const index of cycle.strokes) {
          const st = this.strokes[index], last = st.pts.length - 1;
          const dur = (st.t1 - st.t0) * 0.5;
          const u = Math.min(1, Math.max(0, (t - from) / dur));
          line(st.pts, 0, last, 0.1);
          if (u > 0) line(st.pts, 0, Math.max(1, Math.round(u * last)), 1);
          if (u > 0 && u < 1) tool = toolAt(st.pts, Math.round(u * last));
          from += dur + 0.02;
        }
      }
    }
    if (tool) this.lastTool = tool;
    if (count > this.shown) { this.started += count - Math.max(0, this.shown); this.shown = count; }
    // the overall size, once all the lines are there
    const lastStroke = this.strokes[this.strokes.length - 1];
    if (lastStroke && t > lastStroke.t1) {
      const { box } = this, [x0, y0] = this.map(box.x0, box.y0), [x1, y1] = this.map(box.x1, box.y1);
      g.globalAlpha = Math.min(1, (t - lastStroke.t1) / 0.4) * this.fade;
      g.strokeStyle = '#8fd3ff'; g.fillStyle = '#8fd3ff'; g.lineWidth = 3; g.font = '600 38px ui-monospace,Menlo,monospace'; g.textAlign = 'center';
      g.beginPath(); g.moveTo(x0, y0 + 55); g.lineTo(x1, y0 + 55); g.moveTo(x0, y0 + 42); g.lineTo(x0, y0 + 68); g.moveTo(x1, y0 + 42); g.lineTo(x1, y0 + 68); g.stroke();
      g.fillText(`${Math.round((box.x1 - box.x0) * 100)} cm`, (x0 + x1) / 2, y0 + 102);
      g.beginPath(); g.moveTo(x1 + 55, y0); g.lineTo(x1 + 55, y1); g.moveTo(x1 + 42, y0); g.lineTo(x1 + 68, y0); g.moveTo(x1 + 42, y1); g.lineTo(x1 + 68, y1); g.stroke();
      g.save(); g.translate(x1 + 98, (y0 + y1) / 2); g.rotate(-Math.PI / 2); g.fillText(`${Math.round((box.y1 - box.y0) * 100)} cm`, 0, 0); g.restore();
      g.globalAlpha = 1;
    }
    g.restore();
    this.texture.needsUpdate = true;
    return tool;
  }
  private lastTool: Tool | undefined;

  private boxOf(strokes: Stroke[]) {
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const st of strokes) for (const [x, y] of st.pts) { box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); }
    return box;
  }
}
