// People for games (Yury, 17.11): ready low-poly toy figures — one silhouette for everyone, costumes on top like
// LEGO — already in Punto's look (the islands' light and palette are baked into the vertex colours), one mesh and one
// draw call each, with joints and hand sockets. The builder is plain JS in src/style/figures/ (its source of truth is
// ~/code/crystal-figures/blueprint, copied here by its tools/sync-to-punto.sh); this file is the typed API the coder
// imports as '../figures.js'.
import type { Group, Material, Object3D, Vector3 } from '@iwsdk/core';
import * as F from './style/figures/figures.js';

export type FigureJoint = 'Root' | 'Body' | 'Torso' | 'Head' | 'ArmRight' | 'ArmLeft' | 'ForearmRight' | 'ForearmLeft' | 'HandRight' | 'HandLeft'
  | 'LegRight' | 'LegLeft' | 'ShinRight' | 'ShinLeft' | 'CoatRight' | 'CoatLeft' | 'SkirtRight' | 'SkirtLeft';
/** idle, walk (the figure's own gait: a zombie shambles), run, sit, hold (both hands forward), wave, jump, shamble, aim (right arm straight forward), strike (overhead swing). */
export type FigureAnim = 'idle' | 'walk' | 'run' | 'sit' | 'hold' | 'wave' | 'jump' | 'shamble' | 'aim' | 'strike';
export type FigureFace = 'smile' | 'happy' | 'surprised' | 'angry' | 'zombie' | 'skull';
/** A colour by name (red, dark red, orange, yellow, green, dark green, light blue, blue, dark blue, purple, pink, white, grey, dark grey, black, brown, light brown, beige, gold, silver, turquoise) or 0xRRGGBB. */
export type FigureColor = string | number;
export type FigureHem = 'hip' | 'knee' | 'shin' | 'floor';
export interface FigureOptions {
  /** An adult's height in the units of the world it stands in: 1 on a tabletop board (one game unit, the default), 1.7 in the room (metres). A kid comes out smaller by itself. */
  height?: number;
  face?: FigureFace;
  colors?: Partial<Record<'shirt' | 'jeans' | 'boot' | 'skin' | 'hair' | 'belt', FigureColor>>;
  /** Replaces the shared toy material (it must use vertex colours). */
  material?: Material;
}
/** A figure: feet at y = 0, facing +Z. Put a thing into a hand with `fig.userData.joints.HandRight.add(thing)`. */
export interface Figure extends Group {
  userData: { joints: Record<FigureJoint, Object3D>; outfit: string | null; stride: number; walk: string };
}
/** What a verb returns: pass it in `wear`. */
export type Worn = unknown;

/** The figure names (English; synonyms and Russian work too). 'person' is the plain figure with no costume. */
export const FIGURE_NAMES: readonly string[] = F.FIGURE_NAMES;

/**
 * A ready figure by name, in Punto's look, one mesh: figure('pirate'), figure('zombie', { height: 1.7 }),
 * figure('knight', { face: 'angry', colors: { shirt: 'blue' } }). An unknown name throws with the list.
 */
export function figure(name = 'person', options: FigureOptions = {}): Figure {
  return F.figure(name, options) as Figure;
}
/** Poses the figure for this moment of an animation: call it every frame in update() with the time in seconds. */
export function animate(fig: Figure, anim: FigureAnim = 'idle', time = 0): void {
  F.animate(fig, anim, time);
}
/** Turns the head (within its limits) and, beyond them, the body towards a point in the scene. Call after animate(). */
export function lookAt(fig: Figure, point: Vector3): void {
  F.lookAt(fig, point);
}
/** A new figure from verbs, only when no name fits: defineFigure('fire chief', { wear: [verbs.coat({ color: 'red' }), …] }); then figure('fire chief'). */
export function defineFigure(name: string, def: { wear: Worn[]; face?: FigureFace; walk?: FigureAnim; stride?: number; scale?: number }): void {
  F.defineFigure(name, def);
}

export type FigureWhere = 'chest' | 'chest right' | 'chest left' | 'belly' | 'back' | 'neck' | 'belt' | 'belt back' | 'belt right' | 'belt left'
  | 'thigh right' | 'thigh left' | 'knee right' | 'knee left' | 'shoulder right' | 'shoulder left' | 'forehead' | 'top of head';
export interface FigureVerbs {
  shirt(o: { color: FigureColor }): Worn;
  pants(o: { color: FigureColor }): Worn;
  boots(o: { color: FigureColor }): Worn;
  skin(o: { color: FigureColor }): Worn;
  belt(o: { color: FigureColor }): Worn;
  coat(o: { color?: FigureColor; cuff?: FigureColor; hem?: FigureHem; closed?: boolean }): Worn;
  vest(o: { color?: FigureColor; closed?: boolean }): Worn;
  skirt(o: { color?: FigureColor; hem?: FigureHem }): Worn;
  dress(o: { color?: FigureColor; hem?: FigureHem }): Worn;
  sleeves(o: { color: FigureColor }): Worn;
  gloves(o: { color?: FigureColor; size?: 'big' }): Worn;
  apron(o: { color?: FigureColor }): Worn;
  scarf(o: { color?: FigureColor }): Worn;
  pads(o: { color?: FigureColor }): Worn;
  kneepads(o: { color?: FigureColor }): Worn;
  stripes(o: { color?: FigureColor; on?: 'torso' | 'vest' | 'coat' }): Worn;
  /** shape: hat, wizard hat, pointed cap, chef hat, top hat, cap, peaked cap, sailor cap, beret, nurse cap, beanie, ushanka, turban, hood, tricorn, crown, tiara, bandana, halo, horns, antennae, headphones, pumpkin. */
  hat(o: { shape?: string; color?: FigureColor; band?: FigureColor; veil?: 'bridal' }): Worn;
  helmet(o: { shape?: 'dome' | 'bucket' | 'sphere' | 'horned'; color?: FigureColor; visor?: FigureColor; brim?: 'back' }): Worn;
  hair(o: { style?: 'short' | 'bob' | 'long' | 'ponytail' | 'bun' | 'bald'; color?: FigureColor }): Worn;
  lashes(): Worn;
  beard(o: { color?: FigureColor }): Worn;
  mustache(o: { color?: FigureColor }): Worn;
  ears(o?: { type?: 'elf' }): Worn;
  mask(o: { type?: 'medical' | 'eye patch' | 'hero'; color?: FigureColor }): Worn;
  glasses(o: { type?: 'regular' | 'dark' | 'goggles' }): Worn;
  badge(where: FigureWhere, o?: { shape?: 'star' | 'circle' | 'stripe' | 'moon' | 'patch'; color?: FigureColor; size?: 'small' | 'medium' | 'big' }): Worn;
  face(name: FigureFace): Worn;
  walk(name: FigureAnim): Worn;
}
/** The verbs a new figure is put together from (defineFigure). */
export const verbs: FigureVerbs = F.verbs as unknown as FigureVerbs;
