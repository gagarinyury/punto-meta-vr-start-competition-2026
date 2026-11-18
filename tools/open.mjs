// Brings a kept game from samples/ into the running scene as the creation in the room: it can be
// played, and changed further by voice. Needs the Punto server and the dev server.
//   node tools/open.mjs sandbox-table
//   node tools/open.mjs                 lists what is kept
import { readdirSync, readFileSync } from 'node:fs';
const sample = process.argv[2];
if (!sample) {
  console.log(readdirSync('samples').filter((file) => file.endsWith('.ts')).map((file) => file.replace(/\.ts$/, '')).join('\n'));
  process.exit(0);
}
const key = readFileSync('server/.env', 'utf8').match(/^PUNTO_KEYS=[^:]+:([^,\s]+)/m)?.[1] ?? '';
const response = await fetch('http://localhost:8787/api/open', {
  method: 'POST',
  headers: { 'x-punto-key': key, 'content-type': 'application/json' },
  body: JSON.stringify({ sample }),
});
console.log(response.ok ? `opened as ${(await response.json()).name}` : `failed: ${response.status} ${await response.text()}`);
