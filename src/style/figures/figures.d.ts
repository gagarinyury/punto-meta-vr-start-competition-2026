// figures.js is plain JS (its source: ~/code/crystal-figures/blueprint, copied by tools/sync-to-punto.sh there).
// The typed API the game uses is src/figures.ts; these are only the loose shapes it calls.
export declare const FIGURE_NAMES: string[];
export declare function figure(name?: string, options?: object): any;
export declare function animate(fig: object, anim?: string, time?: number): void;
export declare function lookAt(fig: object, point: object): void;
export declare function defineFigure(name: string, def: object): void;
export declare const verbs: Record<string, (...args: any[]) => unknown>;
