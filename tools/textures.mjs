// Poly Haven search (all CC0): surface textures and sky panoramas, downloaded
// into public/ so a game loads them locally.
//
//   node tools/textures.mjs texture "<query>" [limit]   -> public/textures/<id>/{color,normal,rough}.jpg
//   node tools/textures.mjs sky "<query>" [limit]       -> public/skies/<id>.jpg + sky colours
//
// A sky comes back as a ready recipe for openPortals / breakableRoom:
//   { colors: [top, horizon, bottom], panorama: './skies/<id>.jpg' }
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.polyhaven.com';
const HEADERS = { 'User-Agent': 'merci-start' };

async function json(path) {
  const response = await fetch(`${API}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Poly Haven answered ${response.status} for ${path}`);
  }
  return response.json();
}

async function download(url, path) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${url}`);
  }
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}

/**
 * Asset ids that match the most query words: a word in the name counts double,
 * one in the tags or categories once; ties go to the more downloaded asset.
 */
async function find(type, query, limit) {
  const assets = await json(`/assets?t=${type}`);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return Object.entries(assets)
    .map(([id, asset]) => {
      const name = `${id} ${asset.name}`.toLowerCase();
      const tags = [...asset.tags, ...asset.categories].join(' ').toLowerCase();
      const score = words.reduce((sum, word) => sum + (name.includes(word) ? 2 : tags.includes(word) ? 1 : 0), 0);
      return { id, name: asset.name, score, downloads: asset.download_count ?? 0 };
    })
    .filter((asset) => asset.score > 0)
    .sort((a, b) => b.score - a.score || b.downloads - a.downloads)
    .slice(0, limit);
}

function credit(file, id, name, authors) {
  appendFileSync(
    file,
    `- ${id}: "${name}" by ${Object.keys(authors).join(', ')}, https://polyhaven.com/a/${id}, CC0 1.0\n`,
  );
}

/** Surface textures: colour, normal (OpenGL) and roughness maps at 1k. */
export async function searchTextures(query, limit = 3) {
  const found = [];
  for (const { id, name } of await find('textures', query, limit)) {
    const dir = `public/textures/${id}`;
    if (!existsSync(`${dir}/color.jpg`)) {
      const files = await json(`/files/${id}`);
      mkdirSync(dir, { recursive: true });
      await download(files.Diffuse['1k'].jpg.url, `${dir}/color.jpg`);
      await download(files.nor_gl['1k'].jpg.url, `${dir}/normal.jpg`);
      await download(files.Rough['1k'].jpg.url, `${dir}/rough.jpg`);
      credit('public/textures/CREDITS.md', id, name, (await json(`/info/${id}`)).authors);
    }
    found.push({ title: name, dir: `./textures/${id}` });
  }
  return found;
}

/** Average colour of the top, middle and bottom thirds of a JPG (macOS sips). */
function bandColors(path) {
  const bmp = `${path}.bands.bmp`;
  execFileSync('sips', ['-z', '3', '1', '-s', 'format', 'bmp', path, '--out', bmp], { stdio: 'ignore' });
  const data = readFileSync(bmp);
  execFileSync('rm', [bmp]);
  const start = data.readUInt32LE(10); // 24-bit BGR pixels, each row padded to 4 bytes
  const topDown = data.readInt32LE(22) < 0; // negative height: the top row comes first
  const pixel = (row) => {
    const at = start + (topDown ? row : 2 - row) * 4;
    return (data[at + 2] << 16) | (data[at + 1] << 8) | data[at];
  };
  return [pixel(0), pixel(1), pixel(2)].map((hex) => `0x${hex.toString(16).padStart(6, '0')}`);
}

/** Sky panoramas: the tonemapped JPG, shrunk to 4096x2048. */
export async function searchSkies(query, limit = 3) {
  const found = [];
  mkdirSync('public/skies', { recursive: true });
  for (const { id, name } of await find('hdris', query, limit)) {
    const path = `public/skies/${id}.jpg`;
    if (!existsSync(path)) {
      const files = await json(`/files/${id}`);
      await download(files.tonemapped.url, path);
      execFileSync('sips', ['-Z', '4096', '-s', 'formatOptions', '80', path], { stdio: 'ignore' });
      credit('public/skies/CREDITS.md', id, name, (await json(`/info/${id}`)).authors);
    }
    found.push({ title: name, sky: { colors: bandColors(path), panorama: `./skies/${id}.jpg` } });
  }
  return found;
}

if (process.argv[1]?.endsWith('textures.mjs') && process.argv[3]) {
  const [kind, query, limit] = process.argv.slice(2);
  const started = Date.now();
  const found = await (kind === 'sky' ? searchSkies : searchTextures)(query, Number(limit ?? 3));
  console.log(JSON.stringify(found, null, 2));
  console.log(`${found.length} found, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
