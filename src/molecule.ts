// A real molecule by name (Yury, 18.11: «молекулу добавляй»): its atoms where they really are, from PubChem — the open
// chemistry database of the US National Library of Medicine (public domain, CORS open). The 3D conformer comes as an
// SDF file (atoms with x, y, z in ångströms, bonds with their order); here it becomes balls and sticks in the usual
// colours (CPK: carbon dark grey, hydrogen white, oxygen red, nitrogen blue…), scaled to the size asked for.
// Small molecules only (caffeine, dopamine, glucose, aspirin, water): PubChem has no 3D for proteins or DNA.
import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

export interface Atom {
  /** 'C', 'H', 'O', 'N'… */
  element: string;
  /** where it is inside the returned group, in metres */
  position: Vector3;
}

export interface Molecule extends Group {
  userData: { name: string; atoms: Atom[]; bonds: [number, number, number][] };
}

// CPK colours (Jmol's), and how big each atom's ball is relative to carbon
const COLOR: Record<string, number> = {
  H: 0xf2f2f2, C: 0x404040, N: 0x3050f8, O: 0xff0d0d, F: 0x90e050, Cl: 0x1ff01f, Br: 0xa62929, I: 0x940094,
  S: 0xffff30, P: 0xff8000, Na: 0xab5cf2, K: 0x8f40d4, Mg: 0x8aff00, Ca: 0x3dff00, Fe: 0xe06633, Zn: 0x7d80b0,
  Cu: 0xc88033, B: 0xffb5b5, Si: 0xf0c8a0, Li: 0xcc80ff,
};
const SIZE: Record<string, number> = { H: 0.6, C: 1, N: 0.95, O: 0.92, F: 0.85, S: 1.25, P: 1.25, Cl: 1.2, Br: 1.35, I: 1.5 };

const files = new Map<string, Promise<string>>();

/** The PubChem 3D file of `name` (an English name or a synonym: 'caffeine', 'aspirin', 'adrenaline'). */
function sdf(name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  let file = files.get(key);
  if (!file) {
    file = fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(key)}/SDF?record_type=3d`).then(
      async (response) => {
        if (!response.ok) throw new Error(`molecule: PubChem has no 3D "${name}" (${response.status}) — use an English name`);
        return response.text();
      },
    );
    file.catch(() => files.delete(key));
    files.set(key, file);
  }
  return file;
}

/**
 * A real molecule, ball and stick, `size` metres along its longest side (default 0.3): `await molecule('caffeine')`.
 * The group's origin is the centre of its bottom, front +Z. Atoms are one InstancedMesh per element, bonds one
 * InstancedMesh (a double bond two sticks, a triple three). `userData.atoms` gives each atom's element and place (in
 * the group, metres) for labels, glows or motion; `userData.bonds` [from, to, order] by atom index.
 * Throws when PubChem has no 3D shape for the name (not a small molecule, or not an English name).
 */
export async function molecule(name: string, options: { size?: number; hydrogens?: boolean } = {}): Promise<Molecule> {
  const lines = (await sdf(name)).split('\n');
  const counts = lines[3];
  const atomCount = Number(counts.slice(0, 3));
  const bondCount = Number(counts.slice(3, 6));
  const raw: { element: string; at: Vector3 }[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    raw.push({ element: line.slice(31, 34).trim(), at: new Vector3(Number(line.slice(0, 10)), Number(line.slice(10, 20)), Number(line.slice(20, 30))) });
  }
  const rawBonds: [number, number, number][] = [];
  for (let i = 0; i < bondCount; i++) {
    const line = lines[4 + atomCount + i];
    rawBonds.push([Number(line.slice(0, 3)) - 1, Number(line.slice(3, 6)) - 1, Number(line.slice(6, 9))]);
  }
  // hydrogens can be left out: a cleaner shape for big molecules
  const keep = raw.map((atom) => options.hydrogens !== false || atom.element !== 'H');
  const index = new Map<number, number>();
  const atoms: { element: string; at: Vector3 }[] = [];
  raw.forEach((atom, i) => keep[i] && (index.set(i, atoms.length), atoms.push(atom)));
  const bonds = rawBonds.filter(([a, b]) => keep[a] && keep[b]).map(([a, b, order]) => [index.get(a)!, index.get(b)!, order] as [number, number, number]);

  // ångströms → metres of the asked size; the bottom centre to the origin
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const { at } of atoms) min.min(at), max.max(at);
  const span = max.clone().sub(min);
  const ball = 0.32; // carbon's ball radius in ångströms
  const scale = (options.size ?? 0.3) / (Math.max(span.x, span.y, span.z) + 2 * ball);
  const shift = new Vector3((min.x + max.x) / 2, min.y - ball, (min.z + max.z) / 2);
  for (const atom of atoms) atom.at.sub(shift).multiplyScalar(scale);

  const group = new Group() as Molecule;
  group.name = `molecule ${name}`;
  const matrix = new Matrix4();
  const one = new Vector3();
  const byElement = new Map<string, number[]>();
  atoms.forEach((atom, i) => byElement.set(atom.element, [...(byElement.get(atom.element) ?? []), i]));
  const sphere = new SphereGeometry(ball * scale, 24, 16);
  for (const [element, members] of byElement) {
    const material = new MeshStandardMaterial({ color: new Color(COLOR[element] ?? 0xff1493), roughness: 0.35, metalness: 0.05 });
    const mesh = new InstancedMesh(sphere, material, members.length);
    mesh.name = `atoms ${element}`;
    members.forEach((atomIndex, k) => {
      const size = SIZE[element] ?? 1.1;
      mesh.setMatrixAt(k, matrix.compose(atoms[atomIndex].at, new Quaternion(), one.set(size, size, size)));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  // sticks: a unit cylinder along Y, stretched between the two atoms; double and triple bonds side by side
  const sticks = bonds.reduce((n, [, , order]) => n + Math.min(order, 3), 0);
  if (sticks) {
    const stick = new InstancedMesh(
      new CylinderGeometry(0.1 * scale, 0.1 * scale, 1, 10),
      new MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.45 }),
      sticks,
    );
    stick.name = 'bonds';
    const up = new Vector3(0, 1, 0);
    const side = new Vector3();
    const turn = new Quaternion();
    const middle = new Vector3();
    let k = 0;
    for (const [a, b, order] of bonds) {
      const from = atoms[a].at;
      const to = atoms[b].at;
      const along = to.clone().sub(from);
      const length = along.length();
      turn.setFromUnitVectors(up, along.clone().normalize());
      side.set(1, 0, 0).applyQuaternion(turn).multiplyScalar(0.2 * scale);
      const n = Math.min(order, 3);
      for (let s = 0; s < n; s++) {
        middle.copy(from).add(to).multiplyScalar(0.5).addScaledVector(side, s - (n - 1) / 2);
        stick.setMatrixAt(k++, matrix.compose(middle, turn, one.set(1, length, 1)));
      }
    }
    stick.computeBoundingSphere();
    group.add(stick);
  }
  group.userData = { name, atoms: atoms.map(({ element, at }) => ({ element, position: at })), bonds };
  return group;
}
