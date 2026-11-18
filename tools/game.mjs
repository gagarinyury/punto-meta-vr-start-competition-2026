// Change the game in the running scene without reloading the page:
// the live channel removes everything the old game created and loads the new one.
//
//   node tools/game.mjs <sample> [<sample> ...]   put samples/<sample>.ts into the scene
//   node tools/game.mjs                           empty scene (only the room)
//   node tools/game.mjs --again                   run the current game again from the start
//
// The room itself, the pointer dot and Punto (room.ts, floor.ts, cursor.ts, punto.ts) always stay, and so
// do the things Punto made (made-*.ts): they are not in git, a removed one is gone for good (audit item 11).
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const KEEP = new Set(['room.ts', 'floor.ts', 'cursor.ts', 'punto.ts']);
const dir = 'src/features';
const wanted = process.argv.slice(2);
const current = readdirSync(dir).filter((name) => name.endsWith('.ts') && !KEEP.has(name) && !name.startsWith('made-'));

if (wanted[0] === '--again') {
  for (const name of current) {
    writeFileSync(`${dir}/${name}`, readFileSync(`${dir}/${name}`)); // a save is enough to restart it
  }
  console.log(`restarted: ${current.join(', ') || 'nothing'}`);
} else {
  const missing = wanted.filter((name) => !existsSync(`samples/${name}.ts`));
  if (missing.length) {
    console.error(`no such sample: ${missing.join(', ')}`);
    process.exit(1);
  }
  for (const name of current) {
    rmSync(`${dir}/${name}`);
  }
  for (const name of wanted) {
    copyFileSync(`samples/${name}.ts`, `${dir}/${name}.ts`);
  }
  console.log(`scene: ${wanted.join(', ') || 'empty'} (was: ${current.join(', ') || 'empty'})`);
}
