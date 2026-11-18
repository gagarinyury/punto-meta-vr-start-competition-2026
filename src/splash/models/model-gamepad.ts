// Gamepad (research/concepts/title/models-sheet-2.jpeg, top right): a chunky angular controller of pale lilac-grey plastic,
// its edges chamfered and traced in faint cyan light; a big raised cross pad on the left, four round buttons in
// a diamond on the right (green, red, yellow, blue), select and start between them. ~0.9 m wide.
// Origin: the middle of its body, the face to +Z (tilted a little up), +Y up.
import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, Vector3 } from '@iwsdk/core';
import { bevelBox, edgeGlow, facets, mix, named, paint } from './kit.js';

export const model = { name: 'Gamepad', length: 0.95, parts: ['Body', 'Pad', 'Buttons', 'Select', 'Start'] };

const LIGHT = new Vector3(-0.5, 0.7, 0.6).normalize();
const plastic = (n: Vector3) => mix(0x524a68, 0xc6bed6, Math.max(0, n.dot(LIGHT)) * 0.85 + 0.2);

// the outline seen from the front: a wide top, two grips going down, angular (low poly), [x, y]
const OUTLINE: [number, number][] = [[-0.36, 0.2], [0.36, 0.2], [0.45, 0.1], [0.46, -0.08], [0.4, -0.3], [0.28, -0.33], [0.2, -0.16], [-0.2, -0.16], [-0.28, -0.33], [-0.4, -0.3], [-0.46, -0.08], [-0.45, 0.1]];

export function build(): Group {
  const root = new Group();
  root.name = 'Gamepad';
  const face = new Group();
  face.name = 'Face';
  face.rotation.x = -0.35;
  root.add(face);
  const shape = new Shape();
  OUTLINE.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const T = 0.1, bevel = 0.04;
  const body = new ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  body.translate(0, 0, -T / 2);
  face.add(named(new Mesh(paint(body, (c, n) => plastic(n), 0.02, 1), facets({ roughness: 0.5 })), 'Body'));
  face.add(named(edgeGlow(body, 0x8ff2ff, 0.55, 25), 'Edges'));

  const top = T / 2 + bevel; // the face's surface
  const pad = new Group();
  pad.name = 'Pad';
  pad.position.set(-0.24, 0.03, top);
  const padMat = facets({ roughness: 0.45 });
  pad.add(named(new Mesh(paint(bevelBox(0.21, 0.07, 0.05, 0.012), (c, n) => mix(0x8a84a0, 0xeeeaf6, Math.max(0, n.dot(LIGHT)) + 0.1), 0.02, 2), padMat), 'PadAcross'));
  pad.add(named(new Mesh(paint(bevelBox(0.07, 0.21, 0.05, 0.012), (c, n) => mix(0x8a84a0, 0xeeeaf6, Math.max(0, n.dot(LIGHT)) + 0.1), 0.02, 3), padMat), 'PadAlong'));
  face.add(pad);

  const buttons = new Group();
  buttons.name = 'Buttons';
  const cap = new CylinderGeometry(0.033, 0.036, 0.04, 14);
  cap.rotateX(Math.PI / 2);
  ([['Green', 0x4fd068, 0, 0.065], ['Red', 0xf0506a, 0.065, 0], ['Yellow', 0xf6c63e, 0, -0.065], ['Blue', 0x4f8cf0, -0.065, 0]] as const).forEach(([name, color, x, y]) => {
    buttons.add(named(new Mesh(cap, new MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.15 })), `Button${name}`, 0.25 + x, 0.03 + y, top + 0.012));
  });
  face.add(buttons);
  const small = new MeshStandardMaterial({ color: 0x8c86a0, roughness: 0.5 });
  face.add(named(new Mesh(bevelBox(0.07, 0.028, 0.025, 0.008), small), 'Select', -0.055, -0.05, top + 0.004));
  face.add(named(new Mesh(bevelBox(0.07, 0.028, 0.025, 0.008), small), 'Start', 0.055, -0.05, top + 0.004));
  return root;
}
