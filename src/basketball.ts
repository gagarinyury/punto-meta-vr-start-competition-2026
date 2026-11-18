// A basketball drawn in code: orange pebbled leather and the classic black
// seams (the equator, one meridian, and the two curved side seams).
import { CanvasTexture, Mesh, MeshStandardMaterial, RepeatWrapping, SphereGeometry, SRGBColorSpace } from '@iwsdk/core';

const W = 1024;
const H = 512;
const SEAM = 0.028; // half-width of a seam on a ball of radius 1
const SIDE = 0.62; // the curved seams: circles where |x| = SIDE

let textures: { color: CanvasTexture; bump: CanvasTexture } | undefined;

function paint() {
  const colour = document.createElement('canvas');
  const bumps = document.createElement('canvas');
  colour.width = bumps.width = W;
  colour.height = bumps.height = H;
  const c = colour.getContext('2d')!.createImageData(W, H);
  const b = bumps.getContext('2d')!.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    // the same mapping as SphereGeometry: row -> latitude, column -> longitude
    const theta = ((py + 0.5) / H) * Math.PI;
    for (let px = 0; px < W; px++) {
      const phi = ((px + 0.5) / W) * Math.PI * 2;
      const x = -Math.cos(phi) * Math.sin(theta);
      const y = Math.cos(theta);
      const z = Math.sin(phi) * Math.sin(theta);
      const seam = Math.min(Math.abs(y), Math.abs(z), Math.abs(Math.abs(x) - SIDE));
      const i = (py * W + px) * 4;
      // pebbles: fine bumps everywhere but on the seams
      const pebble = 150 + Math.random() * 90;
      if (seam < SEAM) {
        c.data[i] = 26; c.data[i + 1] = 20; c.data[i + 2] = 16;
        b.data[i] = b.data[i + 1] = b.data[i + 2] = 40; // the seams are sunk in
      } else {
        const shade = 0.92 + Math.random() * 0.08;
        c.data[i] = 214 * shade; c.data[i + 1] = 98 * shade; c.data[i + 2] = 34 * shade;
        b.data[i] = b.data[i + 1] = b.data[i + 2] = pebble;
      }
      c.data[i + 3] = b.data[i + 3] = 255;
    }
  }
  colour.getContext('2d')!.putImageData(c, 0, 0);
  bumps.getContext('2d')!.putImageData(b, 0, 0);
  const color = new CanvasTexture(colour);
  color.colorSpace = SRGBColorSpace;
  color.anisotropy = 8;
  const bump = new CanvasTexture(bumps);
  color.wrapS = bump.wrapS = RepeatWrapping;
  return { color, bump };
}

/** A basketball of the given radius (a real one is 0.12 m), its centre at the origin. */
export function basketball(radius = 0.12): Mesh<SphereGeometry, MeshStandardMaterial> {
  textures ??= paint();
  return new Mesh(
    new SphereGeometry(radius, 64, 32),
    new MeshStandardMaterial({ map: textures.color, bumpMap: textures.bump, bumpScale: 1.2, roughness: 0.75 }),
  );
}
