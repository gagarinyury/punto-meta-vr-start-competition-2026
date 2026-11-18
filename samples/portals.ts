import { createSystem, DepthOccludable, type Entity, Group, IcosahedronGeometry, Vector3 } from '@iwsdk/core';
import { feature } from '../live.js';
import { openPortals, type Portal } from '../outside.js';
import { eyes, lit, mirrored, slab, toy } from '../style.js';

// Three portals in the real room (front wall, right wall, ceiling) with winged creatures flying in from space.
feature(import.meta, (world) => {
  const COLORS = [0x9040ff, 0x20c0ff, 0xff5a20];

  let portals: Portal[] = [];
  openPortals(
    world,
    [
      { wall: 'front', color: COLORS[0] },
      { wall: 'right', color: COLORS[1] },
      { wall: 'ceiling', color: COLORS[2] },
    ],
    (opened) => (portals = opened),
  );

  const rightWing: [number, number][] = [[0, 0.03], [0.13, 0.04], [0.11, -0.03], [0, -0.02]];
  const leftWing = mirrored(rightWing);

  const makeCreature = (color: number) => {
    const creature = new Group();
    const body = toy(new IcosahedronGeometry(0.06, 1), lit(color), { shade: 0.25 });
    const face = eyes(0.045, 0.02, { whites: true });
    face.position.set(0, 0.015, 0.052);
    const wings = [leftWing, rightWing].map((shape) => {
      const pivot = new Group();
      pivot.add(toy(slab(shape, 0.014, 0.2), lit(color)));
      return pivot;
    });
    creature.add(body, face, ...wings);
    return { creature, wings };
  };

  interface Flyer {
    entity: Entity;
    wings: Group[];
    velocity: Vector3;
    portal: Portal;
    age: number;
    phase: number;
    out: boolean;
  }
  const flyers: Flyer[] = [];
  const target = new Vector3();
  const steer = new Vector3();
  const ahead = new Vector3();
  const head = new Vector3();
  const lean = new Vector3(0, 0, 0.35);
  let spawnIn = 1;
  let next = 0;

  world.registerSystem(
    class Creatures extends createSystem({}) {
      update(delta: number, time: number): void {
        if (portals.length === 0) return;

        spawnIn -= delta;
        if (spawnIn <= 0 && flyers.length < 9) {
          spawnIn = 1.4;
          this.spawn(portals[next++ % portals.length]);
        }

        for (let i = flyers.length - 1; i >= 0; i--) {
          const flyer = flyers[i];
          const body = flyer.entity.object3D!;
          flyer.age += delta;
          const depth = steer.copy(body.position).sub(flyer.portal.centre).dot(flyer.portal.normal);
          if (!flyer.out && depth > 0.15) {
            flyer.out = true; // through the wall: from now on furniture hides it
            flyer.entity.addComponent(DepthOccludable);
          }
          if (flyer.out) {
            const angle = time * 0.9 + flyer.phase;
            this.player.head.getWorldPosition(head);
            target.set(head.x + Math.cos(angle) * 1.1, head.y + Math.sin(angle * 1.7) * 0.35, head.z + Math.sin(angle) * 1.1);
            steer.copy(target).sub(body.position).normalize().multiplyScalar(4 * delta);
            flyer.velocity.add(steer).clampLength(0, 1.6);
          }
          body.position.addScaledVector(flyer.velocity, delta);
          body.lookAt(ahead.copy(body.position).add(flyer.velocity));
          const flap = Math.sin(time * 22 + flyer.phase) * 0.9;
          flyer.wings[0].rotation.z = -flap;
          flyer.wings[1].rotation.z = flap;
          body.scale.setScalar(Math.min(1, flyer.age * 2, (16 - flyer.age) * 2));
          if (flyer.age > 16) {
            flyer.entity.dispose();
            flyers.splice(i, 1);
          }
        }
      }

      private spawn(portal: Portal): void {
        const { creature, wings } = makeCreature(portal.color);
        creature.position.copy(portal.centre).addScaledVector(portal.normal, -0.9);
        creature.userData.occlude = false; // still outside the wall
        const entity = world.createTransformEntity(creature);
        flyers.push({
          entity,
          wings,
          velocity: new Vector3().copy(portal.normal).multiplyScalar(1.4).add(lean),
          portal,
          age: 0,
          phase: Math.random() * 6.28,
          out: false,
        });
      }
    },
  );
});
import.meta.hot?.accept();
