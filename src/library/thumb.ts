// Pictures for the tablet's cards: a thing (a model, the pieces of a game) rendered alone,
// three-quarter view, on Punto's dark screen colour, into a JPEG data URL.
// Uses the world's own renderer (a second WebGL context is costly on Quest) and steps out of
// XR rendering for the one frame it takes.
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  type Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from '@iwsdk/core';

const WIDTH = 512;
const HEIGHT = 288;

// Soft muted card colours, as in concept t1 (wood brown, olive, indigo, slate, grey, blue, plum, teal):
// the card and the background of its picture share one, picked from the title.
const TINTS = [0x4a3a2c, 0x394634, 0x2f3150, 0x3a4152, 0x47474b, 0x2b3c52, 0x4a3442, 0x2f4644];

export function tintOf(title: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/** The tint as a CSS colour, `lift` (0..1) towards white for borders. */
export function tintCss(title: string, lift = 0): string {
  const tint = tintOf(title);
  const channel = (shift: number) => Math.round(((tint >> shift) & 255) * (1 - lift) + 255 * lift).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Renders `thing` (it is cloned, the original stays where it is) to a 16:9 JPEG data URL. */
export function snapshot(renderer: WebGLRenderer, thing: Object3D, background: number): string {
  const scene = new Scene();
  scene.background = new Color(background);
  scene.add(new HemisphereLight(0xffffff, 0x667075, 2.2), new AmbientLight(0xffffff, 0.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  const copy = thing.clone(true);
  copy.updateMatrixWorld(true);
  scene.add(copy);
  const box = new Box3().setFromObject(copy);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const radius = Math.max(size.length() / 2, 0.01);

  const camera = new PerspectiveCamera(32, WIDTH / HEIGHT, radius / 50, radius * 50);
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
  camera.position.copy(center).add(new Vector3(0.75, 0.55, 1).normalize().multiplyScalar(distance));
  camera.lookAt(center);

  const target = new WebGLRenderTarget(WIDTH, HEIGHT);
  target.texture.colorSpace = SRGBColorSpace; // read back as the eye sees it, not linear (dark)
  const xr = renderer.xr.enabled;
  const before = renderer.getRenderTarget();
  renderer.xr.enabled = false;
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);
  renderer.setRenderTarget(before);
  renderer.xr.enabled = xr;
  target.dispose();

  // in XR the frame can come back with a clear (transparent) background, which a JPEG turns black:
  // lay the pixels over the card's colour
  const raw = document.createElement('canvas');
  raw.width = WIDTH;
  raw.height = HEIGHT;
  const image = raw.getContext('2d')!.createImageData(WIDTH, HEIGHT);
  for (let row = 0; row < HEIGHT; row++) {
    // render targets are read bottom row first
    image.data.set(pixels.subarray((HEIGHT - 1 - row) * WIDTH * 4, (HEIGHT - row) * WIDTH * 4), row * WIDTH * 4);
  }
  raw.getContext('2d')!.putImageData(image, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = `#${background.toString(16).padStart(6, '0')}`;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(raw, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** A card cover for something without a picture yet: its first letter on its card colour. */
export function placeholder(title: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = tintCss(title);
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = tintCss(title, 0.55);
  context.font = '600 150px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText((title.trim()[0] ?? '?').toUpperCase(), WIDTH / 2, HEIGHT / 2 + 8);
  return canvas.toDataURL('image/jpeg', 0.85);
}
