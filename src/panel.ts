/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The way into the room (public/ui/welcome.uikitml): before XR a speech bubble
// over Punto's head, Punto offers to step into the room. Inside XR it is
// hidden: the way out is the power button on Punto's bezel (src/helper.ts).
// The bubble keeps over Punto's usual place with the same lazy follow as Punto.
import { createSystem, UIKitMLAsset } from '@iwsdk/core';


export class PanelSystem extends createSystem({}) {
  init(): void {
    // 13.11: no bubble at all — the way in and out is the power button on Punto's bezel (src/wayin.ts). Only the
    // button inside it was hidden then, and its dark card kept following the head with a lag: "a strange thing in
    // front of my eyes that comes and goes as I turn my head" (Yury, 18.11). The whole panel is hidden now.
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    if (panel) panel.visible = false;
  }
}
