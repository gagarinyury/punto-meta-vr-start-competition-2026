import { createSystem, Group, Vector3 } from '@iwsdk/core';
import { type BreakableRoom, breakableRoom } from '../breakroom.js';
import { holdInHand } from '../hand.js';
import { feature } from '../live.js';
import { sfx } from '../sfx.js';
import { block, lit, merge, PALETTE, toy } from '../style.js';

// Shoot the walls: they break where you aim, and the sky shows through.
// Something outside also keeps smashing its way in.
feature(import.meta, (world) => {
  let room: BreakableRoom | undefined;
  breakableRoom(world, 'meadow', (ready) => (room = ready));

  const parts = new Group();
  parts.add(
    toy(block(0.032, 0.045, 0.18, [0, 0.03, -0.07]), lit(PALETTE.rockDark)),
    toy(block(0.028, 0.11, 0.045, [0, -0.03, 0]), lit(PALETTE.wood)),
  );
  const gun = merge(parts);
  gun.name = 'blaster';

  holdInHand(world, gun, {
    side: 'right',
    aimed: true,
    onUse: (shot) => {
      const hit = room?.hit(shot.from, shot.direction);
      if (hit) {
        room!.breakAt(hit.point, 0.35);
        sfx(world, 'impactMining', hit.point);
      }
    },
  });

  let wait = 2;
  const from = new Vector3(); // the smashing comes at the player: rays from their head outwards
  const aim = new Vector3();
  world.registerSystem(
    class Invaders extends createSystem({}) {
      update(delta: number): void {
        wait -= delta;
        if (!room || wait > 0) return;
        wait = 2.5;
        this.player.head.getWorldPosition(from);
        aim.randomDirection();
        aim.y = Math.abs(aim.y) * 0.8;
        const hit = room.hit(from, aim.normalize());
        if (hit) room.breakAt(hit.point, 0.3 + Math.random() * 0.3);
      }
    },
  );
});
import.meta.hot?.accept();
