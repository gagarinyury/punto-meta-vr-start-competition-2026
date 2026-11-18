import {
  AssetManager,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
} from '@iwsdk/core';

/**
 * A real surface (brick, wood, stone…) from a downloaded texture folder with
 * color.jpg, normal.jpg and rough.jpg. `repeat` is how many times the picture
 * repeats across the surface (one tile is about a metre of the real thing).
 * The maps arrive a moment later; the material is usable at once.
 */
export function texturedMaterial(dir: string, options: { repeat?: number } = {}): MeshStandardMaterial {
  const repeat = new Vector2(options.repeat ?? 1, options.repeat ?? 1);
  const material = new MeshStandardMaterial({ normalScale: new Vector2(1, 1) });
  for (const [file, slot] of [
    ['color', 'map'],
    ['normal', 'normalMap'],
    ['rough', 'roughnessMap'],
  ] as const) {
    void AssetManager.loadTexture(`${dir}/${file}.jpg`).then((shared) => {
      const texture = shared.clone(); // own repeat; the picture itself is shared
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.copy(repeat);
      if (slot === 'map') {
        texture.colorSpace = SRGBColorSpace;
      }
      texture.needsUpdate = true;
      material[slot] = texture;
      material.needsUpdate = true;
    });
  }
  return material;
}
