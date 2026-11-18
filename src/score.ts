// The game's numbers — score, wave, lives, time — on one board that hangs over Punto's head.
// It always has the same place and the same look, never covers Punto or the game, and goes
// away with the game. A game only says the numbers:
//
//   showScore(world, { Score: 12 });
//   showScore(world, { Score: 12, Wave: 3, Lives: 2 });     // call again whenever a number changes
//
// Do not build a score panel of your own.
import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, type World } from '@iwsdk/core';
import { onUnload } from './live.js';

const W = 768;
const H = 168;

// One board for the whole page. While developing, a game loaded live may get a newer copy of this
// module than Punto has: the board's state is kept on the page, not in the module, so both copies
// talk about the same board (12.11: the score was set in one copy and the board hung in the other).
interface Board {
  pen: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
  plane?: Mesh; // made when Punto mounts the board
  shown?: Record<string, number | string>;
  height: number; // of the board, in Punto's units
  owners: WeakSet<World>;
}
function makeBoard(): Board {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return {
    pen: canvas.getContext('2d')!,
    texture,
    material: new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    height: 0,
    owners: new WeakSet<World>(),
  };
}
const page = globalThis as unknown as { __puntoScoreBoard?: Board };
const board = (page.__puntoScoreBoard ??= makeBoard());

function draw(): void {
  const { pen, shown, texture } = board;
  pen.clearRect(0, 0, W, H);
  texture.needsUpdate = true;
  if (!shown) return;
  const cells = Object.entries(shown).slice(0, 4);
  pen.font = '700 76px "Avenir Next", "Segoe UI", system-ui, sans-serif';
  const widths = cells.map(([label, value]) => {
    const number = pen.measureText(String(value)).width;
    pen.font = '600 30px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    const name = pen.measureText(label.toUpperCase()).width;
    pen.font = '700 76px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    return Math.max(number, name) + 56;
  });
  const total = Math.min(W - 8, widths.reduce((sum, width) => sum + width, 0) + 24);
  const scale = Math.min(1, (W - 8) / (widths.reduce((sum, width) => sum + width, 0) + 24));
  pen.fillStyle = 'rgba(22,24,30,0.92)';
  pen.beginPath();
  pen.roundRect((W - total) / 2, 6, total, H - 12, 44);
  pen.fill();
  let x = (W - total) / 2 + 12 * scale;
  pen.textAlign = 'center';
  cells.forEach(([label, value], i) => {
    const width = widths[i] * scale;
    pen.fillStyle = '#9aa0ad';
    pen.font = `600 ${30 * scale}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
    pen.textBaseline = 'top';
    pen.fillText(label.toUpperCase(), x + width / 2, 24);
    pen.fillStyle = '#ffffff';
    pen.font = `700 ${76 * scale}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
    pen.textBaseline = 'alphabetic';
    pen.fillText(String(value), x + width / 2, H - 30);
    x += width;
  });
}

/** Shows the game's numbers over Punto: `{ Score: 12, Wave: 3 }`, up to four, short English labels. */
export function showScore(world: World, values: Record<string, number | string>): void {
  board.shown = values;
  draw();
  if (board.plane) board.plane.visible = true;
  if (!board.owners.has(world)) {
    board.owners.add(world);
    onUnload(world, hideScore); // the game goes away: so does its board
  }
}

export function hideScore(): void {
  board.shown = undefined;
  if (board.plane) board.plane.visible = false;
}

/** How much room the board takes over Punto right now (Punto's units): the speech bubble sits above it. */
export function scoreHeight(): number {
  return board.shown && board.plane ? board.height + 0.012 : 0;
}

/** Punto hangs the board over its head: `at` above its origin, `width` wide (both in Punto's own units). */
export function mountScore(parent: Object3D, at: number, width: number): () => void {
  board.height = (width * H) / W;
  const plane = new Mesh(new PlaneGeometry(width, board.height), board.material);
  board.plane = plane;
  plane.position.y = at + board.height / 2;
  plane.renderOrder = 10;
  plane.raycast = () => {}; // a pinch here is for Punto
  plane.userData.occlude = false;
  plane.visible = !!board.shown;
  parent.add(plane);
  draw();
  return () => {
    plane.removeFromParent();
    plane.geometry.dispose();
    if (board.plane === plane) board.plane = undefined;
  };
}
