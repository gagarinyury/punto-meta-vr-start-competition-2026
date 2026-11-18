// The drum kit of the instruments kit (src/instruments/kit.ts), in the look of research/concepts/instruments/i1-splash.png:
// a red lacquered five-piece kit with white heads, chrome hoops and stands, brass cymbals. Real sizes; the player
// sits at about z = +0.55 facing -Z. Playable: every head ('kick', 'snare', toms), the snare's hoop ('rim'), the
// hi-hat's top cymbal ('hihat'), the crash and the ride.
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { type Built, cymbal, lathe, mesh, paint, type Part, playable, put, rod, tripod, v } from './kit.js';

const SHELL = 0xb23a2b;

/** One drum standing on its axis (+Y), centred: an open lacquered shell, a white head at each end, two hoops, lugs. */
function drum(d: number, h: number, name: string, hoop = paint.chrome()) {
  const r = d / 2, g = new Group();
  g.name = name;
  const shell = new Mesh(new CylinderGeometry(r, r, h, 40, 1, true), paint.lacquer(SHELL));
  shell.name = 'Shell';
  (shell.material as MeshStandardMaterial).side = 2;
  g.add(shell);
  const skin = new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.62 });
  const head = mesh(new CylinderGeometry(r * 0.99, r * 0.99, 0.004, 40), skin, 'Head', 0, h / 2, 0);
  const bottom = mesh(new CylinderGeometry(r * 0.99, r * 0.99, 0.004, 40), skin, 'BottomHead', 0, -h / 2, 0);
  const ring = (y: number, label: string) => mesh(lathe([[r * 0.985, -0.011], [r * 1.025, -0.011], [r * 1.03, 0.012], [r * 0.99, 0.013], [r * 0.985, -0.011]], 40), hoop, label, 0, y, 0);
  const top = ring(h / 2 + 0.003, 'Hoop');
  g.add(head, bottom, top, ring(-h / 2 - 0.003, 'BottomHoop'));
  const chrome = paint.chrome(), lugs = Math.max(6, Math.round(d * 26));
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    g.add(rod(v(Math.cos(a) * (r + 0.007), -h * 0.3, Math.sin(a) * (r + 0.007)), v(Math.cos(a) * (r + 0.007), h * 0.3, Math.sin(a) * (r + 0.007)), 0.006, chrome, `Lug${i}`, 0.006, 8));
  }
  return { group: g, head, hoop: top };
}

/** A five-piece drum kit with hi-hat, crash and ride. ~1.5 × 1.3 × 1.1 m, on the floor. */
export function drumKit(): Built {
  const parts: Part[] = [], object = new Group();
  object.name = 'Drum Kit';
  const chrome = paint.chrome();
  // the kick lies on its side, its batter head towards the player, on two spurs
  const kick = drum(0.56, 0.4, 'Kick', paint.lacquer(SHELL));
  kick.group.rotation.x = Math.PI / 2;
  kick.group.position.set(0, 0.29, -0.05);
  playable(kick.head, 'kick', 'drums', parts);
  object.add(kick.group);
  const logo = mesh(lathe([[0.12, 0], [0.15, 0], [0.15, 0.002], [0.12, 0.002]], 40), paint.glow(0x6ff3ff, 0.8), 'KickLogo', 0, -0.203, 0);
  kick.group.add(logo);
  for (const s of [-1, 1]) object.add(rod(v(s * 0.24, 0.2, -0.12), v(s * 0.36, 0.01, 0.0), 0.008, chrome, s < 0 ? 'SpurLeft' : 'SpurRight'));
  // the snare on its stand, its hoop is the rim shot
  const snare = drum(0.356, 0.14, 'Snare');
  snare.group.position.set(-0.36, 0.63, 0.2);
  snare.group.rotation.set(0.12, 0, 0.05);
  playable(snare.head, 'snare', 'drums', parts);
  playable(snare.hoop, 'rim', 'drums', parts);
  object.add(snare.group, tripod(-0.36, 0.2, 0.56, 0.2, 'SnareStand'));
  // two rack toms on the kick, the floor tom on three legs
  const toms: [string, number, number, number, number, number][] = [['high tom', 0.25, 0.2, -0.15, 0.87, -0.07], ['low tom', 0.3, 0.22, 0.18, 0.88, -0.07]];
  toms.forEach(([note, d, h, x, y, z], i) => {
    const t = drum(d, h, i ? 'LowTom' : 'HighTom');
    t.group.position.set(x, y, z);
    t.group.rotation.set(0.35, 0, x < 0 ? 0.18 : -0.18);
    playable(t.head, note, 'drums', parts);
    object.add(t.group, rod(v(x * 0.4, 0.57, -0.05), v(x * 0.85, y - h / 2, z - 0.03), 0.011, chrome, `${t.group.name}Arm`));
  });
  const floor = drum(0.4, 0.38, 'FloorTom');
  floor.group.position.set(0.5, 0.47, 0.16);
  playable(floor.head, 'floor tom', 'drums', parts);
  object.add(floor.group);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    object.add(rod(v(0.5 + Math.cos(a) * 0.22, 0.5, 0.16 + Math.sin(a) * 0.22), v(0.5 + Math.cos(a) * 0.27, 0.01, 0.16 + Math.sin(a) * 0.27), 0.008, chrome, `FloorTomLeg${i}`));
  }
  // the hi-hat: two cymbals on a stand with a pedal, the top one is played
  const hat = put(new Group(), 'HiHat', -0.68, 0.88, 0.08);
  const hatTop = cymbal(0.36, 'HiHatTop');
  hatTop.position.y = 0.02;
  const hatBottom = cymbal(0.36, 'HiHatBottom');
  hatBottom.rotation.x = Math.PI;
  hatBottom.position.y = -0.005;
  hat.add(playable(hatTop, 'hihat', 'drums', parts), hatBottom);
  object.add(hat, tripod(-0.68, 0.08, 0.97, 0.22, 'HiHatStand'));
  object.add(mesh(lathe([[0, 0], [0.035, 0], [0.035, 0.012], [0, 0.012]], 20), paint.rubber(0x222222), 'HiHatPedal', -0.68, 0, 0.3));
  // crash high on the left, ride on the right, both leaning towards the player
  const crash = put(new Group(), 'Crash', -0.5, 1.28, -0.32, 0.3, 0, 0.12);
  crash.add(playable(cymbal(0.45, ''), 'crash', 'drums', parts));
  const ride = put(new Group(), 'Ride', 0.7, 1.08, -0.18, 0.25, 0, -0.15);
  ride.add(playable(cymbal(0.52, ''), 'ride', 'drums', parts));
  object.add(crash, tripod(-0.55, -0.42, 1.25, 0.26, 'CrashStand'), ride, tripod(0.78, -0.26, 1.05, 0.26, 'RideStand'));
  // the sticks, crossed on the floor in front
  const wood = paint.wood(0xe6c08a);
  object.add(rod(v(-0.12, 0.012, 0.42), v(0.22, 0.012, 0.36), 0.007, wood, 'StickLeft', 0.004), rod(v(-0.05, 0.026, 0.32), v(0.18, 0.026, 0.48), 0.007, wood, 'StickRight', 0.004));
  return { object, parts };
}
