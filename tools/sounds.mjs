// Downloads Kenney's audio packs (all CC0) into public/audio/kenney/<pack>/:
// every .ogg plus the pack's licence. Run again to refresh.
//   node tools/sounds.mjs                 all packs
//   node tools/sounds.mjs impact-sounds   only these
//   node tools/sounds.mjs --index         only rebuild public/audio/kenney/index.json
// Kenney gives a fresh signed link per download, bound to the page's cookie.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKS = [
  'impact-sounds', 'interface-sounds', 'ui-audio', 'digital-audio', 'sci-fi-sounds',
  'rpg-audio', 'casino-audio', 'music-jingles', 'voiceover-pack', 'voiceover-pack-fighter',
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

async function download(pack) {
  const page = `https://kenney.nl/assets/${pack}`;
  const visit = await fetch(page, { headers: { 'user-agent': UA } });
  const cookie = visit.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const id = Buffer.from(`assets/${pack}`).toString('hex');
  const headers = { 'user-agent': UA, cookie, referer: page };
  const { url } = await (await fetch(`https://kenney.nl/download-link/${id}`, { headers })).json();
  if (!url) throw new Error(`${pack}: no download link`);
  const zip = await fetch(url, { headers });
  const bytes = Buffer.from(await zip.arrayBuffer());
  if (bytes.subarray(0, 2).toString() !== 'PK') throw new Error(`${pack}: not a zip (${zip.status})`);

  const work = mkdtempSync(join(tmpdir(), 'kenney-'));
  writeFileSync(join(work, 'pack.zip'), bytes);
  execFileSync('unzip', ['-q', '-o', join(work, 'pack.zip'), '-d', join(work, 'x')]);
  const out = `public/audio/kenney/${pack}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let count = 0;
  for (const path of files(join(work, 'x'))) {
    const name = path.split('/').pop();
    if (name.endsWith('.ogg') && !name.startsWith('Preview')) {
      // the voice packs repeat names in Male/ and Female/: keep both
      const folder = path.split('/').at(-2);
      const target = existsSync(join(out, name)) ? `${folder}-${name}` : name;
      cpSync(path, join(out, target));
      count++;
    }
    if (/^licen[cs]e/i.test(name)) cpSync(path, join(out, 'License.txt'));
  }
  execFileSync('chmod', ['-R', 'u+w', work]); // some packs unzip read-only folders
  rmSync(work, { recursive: true, force: true });
  console.log(`${pack}: ${count} sounds`);
}

// --index: only rebuild the catalogue from what is already downloaded
const wanted = process.argv.slice(2).filter((arg) => arg !== '--index');
if (!process.argv.includes('--index')) {
  for (const pack of PACKS) {
    if (!wanted.length || wanted.includes(pack)) await download(pack);
  }
}

// The catalogue for sfx(): a group is a file name without its variant number,
// e.g. impactPunch_heavy -> impactPunch_heavy_000.ogg ... _004.ogg.
const index = {};
for (const pack of readdirSync('public/audio/kenney').filter((name) => statSync(`public/audio/kenney/${name}`).isDirectory())) {
  for (const name of readdirSync(`public/audio/kenney/${pack}`).filter((file) => file.endsWith('.ogg')).sort()) {
    const base = name.replace(/\.ogg$/, '');
    const group = base.replace(/[_-]?\d+$/, '') || base; // '7.ogg' (a count) is its own group
    (index[group] ??= []).push(`${pack}/${name}`);
  }
}
writeFileSync('public/audio/kenney/index.json', JSON.stringify(index, null, 1));
console.log(`index: ${Object.keys(index).length} groups`);
