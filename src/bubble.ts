// A speech bubble over Punto: "…" while it listens, then the player's own words, so the
// player knows at once that they were heard (and what was heard).
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Object3D } from '@iwsdk/core';

const W = 768;
const H = 224;
const FONT = '600 44px "Geist", "Avenir Next", "Segoe UI", system-ui, sans-serif';

export interface Bubble {
  /** Dots while Punto listens. */
  listening(): void;
  /** The player's words (or anything) for a few seconds. */
  show(text: string, seconds?: number): void;
  hide(): void;
  /** Moves the bubble up by `extra` (the parent's units): something else hangs under it. */
  raise(extra: number): void;
  /** Call every frame: fades the bubble and animates the dots. */
  update(dt: number, t: number): void;
}

/** Hangs a bubble on `parent` at `height` (in the parent's units), `width` wide. */
export function speechBubble(parent: Object3D, height: number, width: number): Bubble {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
  const plane = new Mesh(new PlaneGeometry(width, (width * H) / W), material);
  plane.position.y = height;
  plane.renderOrder = 10;
  plane.raycast = () => {}; // the pinch is for Punto, not for its words
  plane.userData.occlude = false;
  parent.add(plane);

  let mode: 'hidden' | 'dots' | 'text' = 'hidden';
  let left = 0;
  let lastDots = -1;

  // In Punto's look (research/stands/start.html, the welcome bubble): a dark card, light words, a thin rim and
  // glow in Punto's face colour; the tail points down at Punto.
  const INK = '#f3efe8';
  const FACE = '98,233,242'; // #62e9f2
  function card(boxW: number, boxH: number): { x: number; y: number } {
    const x = (W - boxW) / 2, y = 18, r = Math.min(44, boxH / 2), tail = 26, mid = W / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
    ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
    ctx.lineTo(mid + 20, y + boxH);
    ctx.quadraticCurveTo(mid + 4, y + boxH + 4, mid, y + boxH + tail); // the tail, down to Punto
    ctx.quadraticCurveTo(mid - 4, y + boxH + 4, mid - 20, y + boxH);
    ctx.arcTo(x, y + boxH, x, y, r);
    ctx.arcTo(x, y, x + boxW, y, r);
    ctx.closePath();
    ctx.shadowColor = `rgba(${FACE},0.55)`;
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(12,11,10,0.94)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(${FACE},0.7)`;
    ctx.stroke();
    return { x, y };
  }

  function frame(lines: string[]) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = FONT;
    const textW = Math.max(120, ...lines.map((line) => ctx.measureText(line).width));
    const boxW = Math.min(W - 40, textW + 80), boxH = lines.length > 1 ? 150 : 96;
    const { y } = card(boxW, boxH);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, y + boxH / 2 + 2 + (i - (lines.length - 1) / 2) * 54));
    texture.needsUpdate = true;
  }

  // Listening: a small card with Punto-coloured sound bars that move (research/stands/start.html's wave).
  function wave(t: number) {
    ctx.clearRect(0, 0, W, H);
    const bars = 7, gap = 14, barW = 10, boxH = 96;
    const { y } = card(bars * (barW + gap) - gap + 84, boxH);
    const left = W / 2 - (bars * (barW + gap) - gap) / 2;
    ctx.fillStyle = `rgb(${FACE})`;
    ctx.shadowColor = `rgba(${FACE},0.8)`;
    ctx.shadowBlur = 10;
    for (let i = 0; i < bars; i++) {
      const h = 12 + 44 * (0.5 + 0.5 * Math.sin(t * 7 + i * 0.9)) * (0.55 + 0.45 * Math.sin(t * 2.3 + i * 1.7) ** 2);
      ctx.beginPath();
      ctx.roundRect(left + i * (barW + gap), y + boxH / 2 - h / 2, barW, h, barW / 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
  }

  // At most two lines; a longer phrase ends with "…".
  function wrap(text: string): string[] {
    ctx.font = FONT;
    const words = text.split(/\s+/), lines = [''];
    for (const word of words) {
      const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
      if (ctx.measureText(next).width <= W - 96) lines[lines.length - 1] = next;
      else if (lines.length < 2) lines.push(word);
      else { lines[1] = `${lines[1].replace(/\s*\S*$/, '')}…`; break; }
    }
    return lines;
  }

  return {
    listening() { mode = 'dots'; lastDots = -1; left = Infinity; },
    show(text, seconds = 4) { mode = 'text'; left = seconds; frame(wrap(text)); },
    hide() { left = 0; },
    raise(extra) { plane.position.y = height + extra; },
    update(dt, t) {
      left -= dt;
      const target = left > 0 ? 1 : 0;
      material.opacity += (target - material.opacity) * Math.min(1, dt * 10);
      plane.visible = material.opacity > 0.01;
      if (left <= 0 && material.opacity < 0.01) mode = 'hidden';
      if (mode === 'dots') {
        const step = Math.floor(t * 20); // the wave redraws 20 times a second, not every frame
        if (step !== lastDots) { lastDots = step; wave(t); }
      }
    },
  };
}
