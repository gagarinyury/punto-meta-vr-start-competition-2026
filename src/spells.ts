// Spells: things Punto makes at once, polished by hand, for the requests a new
// player is most likely to make (and that Punto itself suggests). Anything
// else goes to the live coder.
import { AssetManager, Group, Vector3, type World } from '@iwsdk/core';
import { type BreakableRoom, breakableRoom } from './breakroom.js';
import { play, shots } from './fx.js';
import { fitToHand, holdInHand } from './hand.js';
import type { SpawnedPunto } from './helper.js';
import { MEADOW, planets, talk, wall } from './intro.js';
import { remember } from './made.js';
import { sfx } from './sfx.js';

let armed = false; // one blaster at a time

/**
 * A ray gun in the right hand that breaks the real walls: curl the index
 * finger like a trigger (bare hand) or pull the trigger (controller); a laser
 * bolt flies to the wall it points at and knocks a hole in it, a meadow behind.
 */
export async function blaster(world: World, punto: SpawnedPunto): Promise<void> {
  if (armed) {
    await talk(punto, 'blasterReady'); // already in the hand: just remind how it works
    return;
  }
  armed = true;
  let room: BreakableRoom | undefined;
  breakableRoom(world, MEADOW, (ready) => (room = ready));
  await AssetManager.loadGLTF('./models/polypizza/ray-gun.glb', 'ray-gun');
  const gun = new Group();
  const model = AssetManager.getGLTF('ray-gun');
  if (model) gun.add(fitToHand(model.scene, { aimed: true, length: 0.3 }));

  const muzzle = new Vector3();
  const aim = new Vector3();
  // blaster bolts that land on the real walls, ceiling and floor; a wall breaks where one lands
  const bolts = shots({
    kind: 'bolt',
    color: 0x00d8ff,
    onRoom: (point) => {
      if (room?.breakAt(point, 0.3)) sfx(world, 'explosionCrunch', point, 1);
    },
  });
  const firing = play(world, bolts);
  const release = holdInHand(world, gun, {
    side: 'right',
    aimed: true,
    onUse: () => {
      gun.localToWorld(muzzle.set(0, 0.045, -0.27)); // the far end of the barrel
      gun.getWorldDirection(aim).negate();
      bolts.fire(muzzle, aim);
      sfx(world, 'laserSmall', muzzle);
    },
  });
  remember(() => {
    release();
    firing.stop();
    room?.dispose();
    armed = false;
  });
  sfx(world, 'powerUp', gun.getWorldPosition(new Vector3()));
  await talk(punto, 'blasterReady');
}

/** The spells by name, for the director. */
export const SPELLS = {
  blaster,
  solarSystem: planets,
  breakWall: wall,
} satisfies Record<string, (world: World, punto: SpawnedPunto) => Promise<void>>;

export type SpellName = keyof typeof SPELLS;
