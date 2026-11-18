// Punto's little keyboard (Yury, 15.11): the one he types the title on (src/splash/title.ts) and, in the room,
// the one he works at while a thing is being made (src/helper.ts, the 'build' state; it took the little cubes'
// place). In his own units: he faces +Z, his own left is +X; its place is under his hands in the build pose.
// Three.js only: no world, no systems.
import { Color, type Material, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from '@iwsdk/core';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface Key {
  mesh: Mesh;
  x: number;
  z: number;
}

export interface PuntoKeyboard {
  group: Group;
  /** by letter ('a'…'z', ',', '.', ' ' for the space bar) */
  keys: Map<string, Key>;
  backspace: Key;
  /** the key for a character (unknown ones: the full stop) */
  keyFor(ch: string): Key;
  /** a key cap's height on the board, up; pressed it goes PRESS_DEPTH lower */
  CAP_Y: number;
  PRESS_DEPTH: number;
  capMat: MeshStandardMaterial;
  litMat: MeshStandardMaterial;
}

const CYAN = 0x35d8ff;
const PITCH = 0.0108;
const CAP_Y = 0.0016;
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm,.'];
const OFFSET = [0, 0.25, 0.75];

/** The keyboard, with its board in `boardMat` (the title's cream by default), at its place before him, tilted 0.35 rad toward him. */
export function puntoKeyboard(
  boardMat: Material = new MeshPhysicalMaterial({ color: 0xf2dfb8, roughness: 0.55, sheen: 0.4, sheenColor: new Color(0xffffff), clearcoat: 0.15 }),
): PuntoKeyboard {
  const capMat = new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 });
  const litMat = new MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.6, roughness: 0.4 });
  const group = new Group();
  group.name = 'PuntoKeyboard';
  group.position.set(0, -0.07, 0.094);
  group.rotation.x = 0.35;
  const board = new Mesh(new RoundedBoxGeometry(0.14, 0.006, 0.052, 3, 0.0025), boardMat);
  board.position.x = -0.008; // wider to the backspace's side
  board.position.y = -0.0018;
  group.add(board);
  const keys = new Map<string, Key>();
  const capGeo = new RoundedBoxGeometry(0.0092, 0.0034, 0.0092, 2, 0.0014);
  ROWS.forEach((row, r) =>
    [...row].forEach((ch, col) => {
      const kx = -(col + OFFSET[r] - 4.5) * PITCH, kz = (1.5 - r) * PITCH;
      const mesh = new Mesh(capGeo, capMat);
      mesh.position.set(kx, CAP_Y, kz);
      group.add(mesh);
      keys.set(ch, { mesh, x: kx, z: kz });
    }),
  );
  const space: Key = { mesh: new Mesh(new RoundedBoxGeometry(PITCH * 5, 0.0034, 0.0092, 2, 0.0014), capMat), x: -0.4 * PITCH, z: -1.5 * PITCH };
  space.mesh.position.set(space.x, CAP_Y, space.z);
  group.add(space.mesh);
  keys.set(' ', space);
  // backspace: a wide key past P, at the end of the top row (he wipes the title with it)
  const backspace: Key = { mesh: new Mesh(new RoundedBoxGeometry(PITCH * 1.5, 0.0034, 0.0092, 2, 0.0014), capMat), x: -(10.25 - 4.5) * PITCH, z: 1.5 * PITCH };
  backspace.mesh.position.set(backspace.x, CAP_Y, backspace.z);
  group.add(backspace.mesh);
  return {
    group,
    keys,
    backspace,
    keyFor: (ch) => keys.get(ch.toLowerCase()) ?? keys.get('.')!,
    CAP_Y,
    PRESS_DEPTH: 0.0016,
    capMat,
    litMat,
  };
}
