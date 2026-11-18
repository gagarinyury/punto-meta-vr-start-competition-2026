/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

// The scene (public/scenes/main.iwsdk.scene.json) uses one asset: the welcome panel (src/panel.ts).
// The starter's studio, decor, ball, robot and label panels were built at every start and used by
// nothing (audit item 29, 15.11): taken out with src/scene-assets, src/robot*.ts and public/ui/label-*.
const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Welcome Panel',
  },
});
