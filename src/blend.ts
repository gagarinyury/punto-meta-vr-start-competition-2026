// Additive light over the real room. three's AdditiveBlending adds to the frame's alpha too (SrcAlpha, One for both):
// in passthrough the headset shows the frame wherever its alpha is up, so every additive sprite or glow — its dark
// rim included — came out as a dark patch over the room (Yury, 18.11: «взрывы почему-то на чёрных фонах»). Light
// only: the colour is added, the frame's alpha is left as it was.
import { AdditiveBlending, CustomBlending, type Material, OneFactor, SrcAlphaFactor, ZeroFactor } from '@iwsdk/core';

/** Turns an additive material into light only (in place; returns it). Safe to call again. */
export function lightOnly<T extends Material>(material: T): T {
  if (material.blending !== AdditiveBlending) return material;
  material.blending = CustomBlending;
  material.blendSrc = SrcAlphaFactor;
  material.blendDst = OneFactor;
  material.blendSrcAlpha = ZeroFactor;
  material.blendDstAlpha = OneFactor;
  material.needsUpdate = true;
  return material;
}
