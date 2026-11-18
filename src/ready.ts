// A ready thing by name (Yury, 18.11: «возвращай модели минимальным промптом»): the bare coder gets one call and a
// list of names instead of the 163 declarations of style.js (35 thousand characters). Each thing is made with its
// own defaults and scaled whole so its longest side is `size` metres; its origin stays where style.js puts it (the
// bottom centre of a thing that stands, the handle of a thing for the hand — hand.md axes).
import { Box3, type Group, Vector3 } from '@iwsdk/core';
import * as style from './style.js';

export const READY = [
  'roundTree', 'pineTree', 'oakTree', 'palmTree', 'rock', 'cloud', 'island', 'flowers', 'mushrooms', 'mountain',
  'waterfall', 'volcano', 'cave', 'campfire', 'pond',
  'planet', 'ringedPlanet', 'moon', 'asteroid', 'sun', 'satellite', 'spaceStation', 'rocket', 'comet', 'blackHole',
  'fighter', 'scout', 'cruiser', 'mothership', 'alienSaucer', 'cargoHauler', 'drone', 'battleship',
  'sword', 'bow', 'slingshot', 'shield', 'wand', 'hammer', 'flashlight', 'fishingRod', 'axe', 'pickaxe', 'shovel',
  'rake', 'broom', 'spear', 'trident', 'mace', 'scythe', 'torch',
  'bullseyeTarget', 'can', 'canPyramid', 'dart', 'dartboard', 'basketballHoop', 'bowlingPin', 'bowlingPins',
  'soccerBall', 'soccerGoal', 'paddle', 'smallBall', 'pingPongTable', 'golfHole', 'boxingGlove', 'punchingBag', 'trophy',
  'car', 'truck', 'bus', 'airplane', 'helicopter', 'boat', 'submarine', 'tank', 'motorcycle',
  'house', 'castle', 'tower', 'lighthouse', 'windmill', 'bridge', 'tent', 'marketStall', 'temple', 'portalGate',
  'chessBoard', 'chessSet', 'die', 'dice', 'blockTower', 'brick', 'brickPile', 'jigsaw', 'dominoChain', 'spinningTop',
  'puzzleCube', 'treasureChest',
] as const;
export type ReadyName = (typeof READY)[number];

const box = new Box3();
const size = new Vector3();

/** A ready thing (low-poly, faceted, Punto's islands look), `size` metres along its longest side. */
export function ready(name: ReadyName, options: { size: number }): Group {
  const make = (style as unknown as Record<string, (() => Group) | undefined>)[name];
  if (typeof make !== 'function') throw new Error(`ready: no "${name}". Names: ${READY.join(', ')}`);
  const thing = make();
  thing.updateMatrixWorld(true);
  box.setFromObject(thing, true).getSize(size);
  const longest = Math.max(size.x, size.y, size.z);
  if (longest > 0) thing.scale.multiplyScalar(options.size / longest);
  return thing;
}
