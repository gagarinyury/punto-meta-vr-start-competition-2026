// Turns a game's TypeScript into the code the published page can run from a
// string (src/remote.ts): CommonJS `require` calls instead of imports, and
// `__meta` instead of `import.meta`, which does not exist outside a module.
//
//   node tools/compile.mjs samples/jenga.ts > game.js
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';

export function compileGame(source) {
  return transform(source.replaceAll('import.meta', '__meta'), {
    transforms: ['typescript', 'imports'],
  }).code;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(compileGame(readFileSync(process.argv[2], 'utf8')));
}
