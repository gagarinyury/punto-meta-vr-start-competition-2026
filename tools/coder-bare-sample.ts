import {
  AudioSource,
  AudioUtils,
  BoxGeometry,
  createSystem,
  Group,
  Mesh,
  MeshStandardMaterial,
  DistanceGrabbable,
  MovementMode,
  Pressed,
  RayInteractable,
} from '@iwsdk/core';
import { feature } from '../live.js';

// «A red cube that slowly turns»: built at the origin in one root group (its bottom on y = 0); the host puts it before
// the player; the code makes it takeable (rides on the ray, both rays stretch it). Turning, and a click when pressed.
feature(import.meta, (world) => {
  const thing = new Group(); // stays at (0, 0, 0): the host places it
  thing.userData.stands = 'air'; // a thing to look at, before the eyes
  const cube = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshStandardMaterial({ color: 0xe02020, roughness: 0.6 }));
  cube.position.y = 0.1; // its bottom on y = 0
  thing.add(cube);
  const entity = world
    .createTransformEntity(thing)
    .addComponent(RayInteractable)
    .addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget })
    .addComponent(AudioSource, { src: './audio/kit/click.ogg', volume: 0.6, positional: true });

  world.registerSystem(
    class Cube extends createSystem({ pressed: { required: [RayInteractable, Pressed] } }) {
      init(): void {
        this.cleanupFuncs.push(this.queries.pressed.subscribe('qualify', (e) => e === entity && AudioUtils.play(entity)));
      }
      update(delta: number): void {
        cube.rotation.y += delta * 0.4; // a part inside the group turns; the group itself is the host's
      }
    },
  );
});
import.meta.hot?.accept();
