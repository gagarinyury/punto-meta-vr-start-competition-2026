import * as core from '@iwsdk/core';

/**
 * Games that arrive as a string of code instead of a file in src/features/:
 * a shared link (?g=<id>) or a game the coder has just written on the server.
 * The published build has no Vite, so nothing can be imported by path.
 *
 * The server compiles the game's TypeScript to CommonJS and replaces
 * `import.meta` with `__meta` (tools/compile.mjs). Here `require` is answered
 * from the host modules a game may import, and `__meta` is a stand-in whose
 * `hot.dispose` hands us the cleanup that live.ts builds for the game.
 *
 * Host modules load lazily and only the ones a game asks for: some of them
 * (helper.ts) run feature() when imported, which must not happen before
 * startLive(world). A module the page already loaded is the same instance.
 */
const hosts = import.meta.glob([
  './*.ts',
  './fx/*.ts',
  '!./index.ts',
  '!./remote.ts',
  '!./*.d.ts',
]);

// A game lives at src/features/<name>.ts, so it asks for '../hand.js'.
const loaders = new Map<string, () => Promise<unknown>>();
for (const [path, load] of Object.entries(hosts)) {
  loaders.set(`.${path.replace(/\.ts$/, '.js')}`, load);
}

const API = import.meta.env.VITE_API ?? './api';

let stop: (() => void) | undefined;

/** Removes the running remote game, if any. */
export function stopGame(): void {
  stop?.();
  stop = undefined;
}

/** Loads the host modules the compiled game requires, by name. */
async function modulesFor(js: string): Promise<Map<string, unknown>> {
  const table = new Map<string, unknown>([['@iwsdk/core', core]]);
  for (const [, name] of js.matchAll(/require\('([^']+)'\)/g)) {
    if (table.has(name)) {
      continue;
    }
    const load = loaders.get(name);
    if (!load) {
      throw new Error(`[remote] a game asked for an unknown module: ${name}`);
    }
    table.set(name, await load());
  }
  return table;
}

/**
 * Runs compiled game code with `meta` as its `import.meta` (`__meta`). Throws what the code throws
 * while it runs; what an async setup does later is the feature's own business (live.ts).
 */
export async function runCompiled(js: string, meta: unknown): Promise<void> {
  const table = await modulesFor(js);
  const require = (name: string): unknown => table.get(name);
  new Function('require', 'exports', '__meta', js)(require, {}, meta);
}

/** Runs compiled game code in the live world, replacing the previous remote game. */
export async function runGame(js: string): Promise<void> {
  const table = await modulesFor(js);
  stopGame();
  const meta = {
    url: `${location.origin}/src/features/remote.ts`,
    hot: {
      data: {},
      accept() {},
      prune() {},
      dispose(undo: () => void) {
        stop = undo;
      },
    },
  };
  const require = (name: string): unknown => table.get(name);
  new Function('require', 'exports', '__meta', js)(require, {}, meta);
}

/** Opens the game named in the address (?g=<id>). Call after startLive(world). */
export async function openShared(): Promise<void> {
  const id = new URLSearchParams(location.search).get('g');
  if (!id) {
    return;
  }
  const response = await fetch(`${API}/games/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`[remote] game ${id}: ${response.status}`);
  }
  const game: { js: string } = await response.json();
  await runGame(game.js);
  console.info(`[remote] game ${id} is running`);
}
