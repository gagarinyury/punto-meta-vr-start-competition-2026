// Poly Pizza search: CC0 models only (the contest takes public domain only;
// CC-BY may come after it, with each model's credit stored in the game and
// shown under it), downloaded into public/models/polypizza/
// so a game loads them locally and judges see the same files we do.
// Each model is credited in public/models/polypizza/CREDITS.md.
//
//   node tools/models.mjs "<query in English>" [limit]   try it from the shell
//
// Key: POLY_PIZZA_API_KEY in the environment or in .env (not in git).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.poly.pizza/v1.1/search/';
// Paths are taken from this file, not from the working directory: the server runs in server/.
const ROOT = new URL('..', import.meta.url).pathname;
const DIR = `${ROOT}public/models/polypizza`;
const MAX_TRIS = 50_000;
const MAX_BYTES = 12 * 1024 * 1024;

if (!process.env.POLY_PIZZA_API_KEY && existsSync(`${ROOT}.env`)) {
  process.loadEnvFile(`${ROOT}.env`);
}

/**
 * What is inside a GLB: clip names in short form ("Walk", not "Armature|...|Walk") and, for a
 * model made of several separate things ("Basket ball and hoop", "Trees"), the names of those
 * parts as the loader will call them. A part is a node with a mesh and no mesh above it; rigged
 * models have none (their meshes are one body).
 */
function contents(glb) {
  const length = glb.readUInt32LE(12); // the first chunk is the JSON one
  const json = JSON.parse(glb.subarray(20, 20 + length).toString('utf8'));
  const clips = (json.animations ?? []).map((clip, i) => (clip.name ?? `clip${i}`).split('|').pop());
  const parts = [];
  const walk = (index) => {
    const node = json.nodes[index];
    // three's GLTFLoader names objects this way (PropertyBinding.sanitizeNodeName)
    if (node.mesh !== undefined && node.name) parts.push(node.name.replace(/\s/g, '_').replace(/[\[\].:/]/g, ''));
    else (node.children ?? []).forEach(walk);
  };
  if (!json.skins?.length) (json.scenes?.[json.scene ?? 0]?.nodes ?? []).forEach(walk);
  const separate = new Set(parts).size === parts.length && parts.length >= 2 && parts.length <= 12;
  return { clips, parts: separate ? parts : [] };
}

/** The clips and separate parts of a model file in public/ ('./models/…'), as searchModels gives them. */
export function modelContents(file) {
  return contents(readFileSync(`${ROOT}public/${file.replace(/^\.\//, '')}`));
}

/**
 * Finds up to `limit` CC0 models and downloads them. Each result:
 * { title, file: './models/polypizza/<name>.glb', tris, author, clips: [...], parts: [...] }.
 */
export async function searchModels(query, limit = 3) {
  const key = process.env.POLY_PIZZA_API_KEY;
  if (!key) {
    throw new Error('POLY_PIZZA_API_KEY is not set');
  }
  const response = await fetch(`${API}${encodeURIComponent(query)}?License=1&limit=${limit * 3}`, {
    headers: { 'x-auth-token': key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Poly Pizza answered ${response.status}`);
  }
  const { results = [] } = await response.json();
  const found = [];
  for (const item of results) {
    if (found.length >= limit) {
      break;
    }
    if (!/^CC0/i.test(item.Licence ?? '') || !(item['Tri Count'] <= MAX_TRIS)) {
      continue;
    }
    const id = String(item.ID).replace(/[^A-Za-z0-9_-]/g, '');
    const slug = String(item.Title ?? 'model').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const name = `${slug}-${id}.glb`;
    const path = `${DIR}/${name}`;
    try {
      if (!existsSync(path)) {
        const file = await fetch(item.Download, { signal: AbortSignal.timeout(20_000) });
        const glb = Buffer.from(await file.arrayBuffer());
        if (!file.ok || glb.length > MAX_BYTES || glb.toString('latin1', 0, 4) !== 'glTF') {
          continue;
        }
        writeFileSync(path, glb);
        appendFileSync(
          `${DIR}/CREDITS.md`,
          `- ${name}: "${item.Title}" by ${item.Creator?.Username ?? 'unknown'}, https://poly.pizza/m/${id}, CC0 1.0\n`,
        );
      }
      found.push({
        title: item.Title,
        file: `./models/polypizza/${name}`,
        tris: item['Tri Count'],
        author: item.Creator?.Username ?? '',
        ...contents(readFileSync(path)),
      });
    } catch {
      continue; // network trouble or a broken file: try the next model
    }
  }
  return found;
}

if (process.argv[1]?.endsWith('models.mjs') && process.argv[2]) {
  const started = Date.now();
  const found = await searchModels(process.argv[2], Number(process.argv[3] ?? 3));
  console.log(JSON.stringify(found, null, 2));
  console.log(`${found.length} model(s), ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
