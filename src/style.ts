// Punto's look for the coder's creations (Yury, 16.11): the hand-painted low-poly toy style of the front page's
// islands (src/splash/models/kit.ts), so a thing the coder draws itself looks like it belongs to Punto's world.
// Every facet its own colour, a little lighter or darker; slightly crooked hand-cut forms; one material for all.
//
//   const hill = toy(new ConeGeometry(0.3, 0.2, 7), topSide(PALETTE.grass, PALETTE.dirt), { rough: 0.02 });
//   const tree = roundTree(0.6);                    // a ready tree, one mesh
//   toyLook(myCarGroup);                            // a thing built the usual way, turned into the look
//   const scene = merge(group);                     // many painted pieces → one mesh (one draw call)
// The coder imports '../style.js': the base (src/style/base.ts) and the things built on it, one area at a time.
export * from './style/base.js';
// things built on the base, each brought to the islands' look one by one beside the island (/research/stands/things.html?big)
export * from './style/space.js';
export * from './style/ships.js';
export * from './style/nature.js';
export * from './style/gear.js';
export * from './style/sports.js';
export * from './style/vehicles.js';
export * from './style/buildings.js';
export * from './style/toys.js';
export * from './style/hafted.js';
