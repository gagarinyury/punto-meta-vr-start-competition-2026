import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  Box3,
  createSystem,
  Group,
  Matrix4,
  type Object3D,
  Vector3,
  type World,
} from '@iwsdk/core';

/**
 * Plays the clips that come with a downloaded model (walk, run, idle…).
 * Pass the same `AssetManager.getGLTF(id)` copy whose scene went into
 * `fitModel`. `play('walk')` switches to the clip with that short name
 * (case does not matter; otherwise the first name containing it), blending
 * over a quarter of a second. `clips` lists the short names. It stops with
 * the game.
 */
export function animate(
  world: World,
  gltf: { scene: Object3D; animations: AnimationClip[] },
): { clips: string[]; play: (name: string) => void } {
  const mixer = new AnimationMixer(gltf.scene);
  const short = (clip: AnimationClip) => clip.name.split('|').pop()!;
  const clips = gltf.animations.map(short);
  let current: AnimationAction | undefined;

  world.registerSystem(
    class ModelAnimation extends createSystem({}) {
      init(): void {
        this.cleanupFuncs.push(() => mixer.stopAllAction());
      }

      update(delta: number): void {
        mixer.update(delta);
      }
    },
  );

  return {
    clips,
    play(name: string): void {
      const want = name.toLowerCase();
      const clip =
        gltf.animations.find((c) => short(c).toLowerCase() === want) ??
        gltf.animations.find((c) => short(c).toLowerCase().includes(want));
      if (!clip) {
        console.warn(`[animate] no clip "${name}"; clips: ${clips.join(', ') || 'none'}`);
        return;
      }
      const next = mixer.clipAction(clip);
      if (next === current) {
        return;
      }
      next.reset().fadeIn(0.25).play();
      current?.fadeOut(0.25);
      current = next;
    },
  };
}

/**
 * Plays the clips that come with a downloaded model (walk, run, idle…).
 * Pass the same `AssetManager.getGLTF(id)` copy whose scene went into
 * `fitModel`. `play('walk')` switches to the clip with that short name
 * (case does not matter; otherwise the first name containing it), blending
 * over a quarter of a second. `clips` lists the short names. It stops with
 * the game.
 */
export const animateModel = animate;

/**
 * Takes one named part out of a downloaded model made of several things (a ball that comes with
 * its hoop, one tree of five) and returns it as a thing of its own, ready for `fitModel`. The
 * part keeps the size and turn it had inside the model. Take parts out BEFORE fitting the rest.
 */
export function takePart(model: Object3D, name: string): Group {
  const holder = new Group();
  holder.name = name;
  model.updateMatrixWorld(true);
  const part = model.getObjectByName(name);
  if (part) {
    holder.attach(part); // keeps its place, turn and size
  } else {
    const names: string[] = [];
    model.traverse((object) => void (object.name && names.push(object.name)));
    console.warn(`[takePart] no part "${name}"; the model has: ${names.join(', ')}`);
  }
  return holder;
}

/**
 * Turns a downloaded model (any size, any origin) into one of real size that
 * stands on whatever it is put on: the longest side becomes `length` metres,
 * and the origin moves to the centre of the model's bottom. The file's axes
 * stay as they are (glTF: +Y is up); where its front is, the file does not say.
 *
 * For things held in the hand use `fitToHand` from hand.ts instead.
 */
export function fitModel(model: Object3D, options: { length: number }): Group {
  model.updateMatrixWorld(true); // rigged models are measured through their bones
  const box = new Box3().setFromObject(model, true);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const scale = options.length / Math.max(size.x, size.y, size.z);
  model.applyMatrix4(
    new Matrix4()
      .makeScale(scale, scale, scale)
      .multiply(new Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z)),
  );
  const fitted = new Group();
  fitted.add(model);
  return fitted;
}
