import { Group, type Object3D } from '@iwsdk/core';
import { play, shots } from '../fx.js';
import { holdInHand } from '../hand.js';
import { feature } from '../live.js';
import { sfx } from '../sfx.js';
import { block, lit, merge, PALETTE, toy } from '../style.js';

// A toy pistol in the right hand: each shot is a bullet you see fly, a bang, and a hit where it lands.
feature(import.meta, (world) => {
  const parts = new Group();
  const barrel = toy(block(0.032, 0.042, 0.16, [0, 0.03, -0.06]), lit(PALETTE.rockDark));
  const grip = toy(block(0.028, 0.1, 0.04), lit(PALETTE.wood));
  grip.position.set(0, -0.03, 0);
  grip.rotation.x = 0.25;
  parts.add(barrel, grip);
  const gunModel = merge(parts);
  gunModel.name = 'pistol';

  // One pooled `shots` handles bullets, room hits and target hits; `targets` can grow/shrink as the game plays.
  const targets: Object3D[] = [];
  const gun = shots({ kind: 'bullet', targets: () => targets, onHit: (target) => console.info('[pistol] hit', target) });
  play(world, gun);

  holdInHand(world, gunModel, {
    aimed: true,
    onUse: (shot) => {
      gun.fire(shot.from, shot.direction);
      sfx(world, 'laserSmall', shot.from);
    },
  });
});
import.meta.hot?.accept();
