import {
  CanvasTexture,
  CircleGeometry,
  createSystem,
  EnvironmentRaycastTarget,
  Mesh,
  MeshBasicMaterial,
  RaycastSpace,
  Vector3,
} from '@iwsdk/core';
import { feature } from '../live.js';

// The dot at the end of the pointing ray. The SDK draws it 8 mm wide and plain
// white: fine on a dark panel, lost on anything bright. Here it keeps its size
// but gets a dark ring and is drawn over everything, so the player always
// sees what the ray touches.
feature(import.meta, (world) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const pen = canvas.getContext('2d')!;
  pen.fillStyle = '#101418';
  pen.beginPath();
  pen.arc(64, 64, 60, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = '#ffffff';
  pen.beginPath();
  pen.arc(64, 64, 40, 0, Math.PI * 2);
  pen.fill();
  const look = new CanvasTexture(canvas);
  // The SDK's own size (8 mm at arm's length, growing with distance): only the look changes.
  const disc = new CircleGeometry(0.008, 24);
  // The room's dot lies flat on the surface: a hit's +Y is the surface normal.
  const flatDisc = new CircleGeometry(0.008, 24);
  flatDisc.rotateX(-Math.PI / 2);
  flatDisc.translate(0, 0.004, 0);

  // And on the real room: the SDK's ready environment raycast moves a marker to
  // wherever each hand's ray meets a real wall, floor or piece of furniture.
  const marks = ([RaycastSpace.Left, RaycastSpace.Right] as const).map((space) => {
    const mark = new Mesh(flatDisc, new MeshBasicMaterial({ map: look, transparent: true, depthTest: false }));
    mark.renderOrder = 1000;
    mark.userData.occlude = false;
    world.createTransformEntity(mark).addComponent(EnvironmentRaycastTarget, { space });
    mark.castShadow = false;
    return mark;
  });
  const sdkDots: Mesh[] = [];
  const eye = new Vector3();
  const from = new Vector3();
  const along = new Vector3();
  const to = new Vector3();

  let wait = 0;
  world.registerSystem(
    class BigCursor extends createSystem({}) {
      update(delta: number): void {
        // One dot per hand is enough: while a hand's ray touches a thing of the
        // game, the room's dot of that hand hides.
        world.camera.getWorldPosition(eye);
        marks.forEach((mark, index) => {
          const ray = world.player.raySpaces[index === 0 ? 'left' : 'right'];
          ray.getWorldPosition(from);
          ray.getWorldDirection(along).negate();
          const onThing = sdkDots.some(
            (dot) => dot.visible && to.copy(dot.getWorldPosition(to)).sub(from).cross(along).length() < 0.05,
          );
          // Sized by the same rule as the SDK's dot.
          mark.scale.setScalar(onThing ? 0 : Math.max(0, mark.position.distanceTo(from) - 0.3) + 1);
        });
        wait -= delta;
        if (wait > 0) {
          return;
        }
        wait = 1; // the SDK makes its cursors when a hand or controller appears
        for (const child of world.player.children) {
          const dot = child as Mesh;
          if (dot.userData.attached && dot.geometry?.type === 'CircleGeometry' && !sdkDots.includes(dot)) {
            sdkDots.push(dot);
            dot.geometry = disc;
            const material = dot.material as MeshBasicMaterial;
            material.map = look;
            material.depthTest = false;
            material.needsUpdate = true;
          }
        }
      }
    },
  );
});

import.meta.hot?.accept();
