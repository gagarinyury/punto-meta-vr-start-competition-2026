// Planet maps from NASA and USGS (public domain), fetched once into
// public/textures/planets/ as equirectangular JPGs of at most 2048 x 1024.
//
//   node tools/planets.mjs          fetch whatever is missing
//
// Licences: NASA — "texture maps … generally are not subject to copyright in the
// United States" (nasa.gov/nasa-brand-center/images-and-media); NASA-3D-Resources —
// "free and without copyright". Credits go to public/textures/planets/CREDITS.md.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const DIR = 'public/textures/planets';
const SCIENCE = 'https://assets.science.nasa.gov/content/dam/science';
const RESOURCES = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/Images%20and%20Textures';

// name, source (an image, or [glb, image index] for a texture inside a NASA model), credit
const MAPS = [
  ['sun', 'https://svs.gsfc.nasa.gov/vis/a030000/a030300/a030362/euvi_aia304_2012_carrington.tif', 'NASA JPL / SVS (STEREO + SDO, 304 Å)'],
  ['moon', 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg', "NASA's Scientific Visualization Studio (CGI Moon Kit)"],
  ['venus', [`${SCIENCE}/psd/solar/2023/09/v/Venus_1_12103.glb`, 0], 'NASA Visualization Technology Applications and Development'],
  ['earth', `${SCIENCE}/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg`, 'NASA Earth Observatory (Blue Marble NG)'],
  ['earth-clouds', `${SCIENCE}/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg`, 'NASA Earth Observatory (Reto Stöckli)'],
  ['mars', `${RESOURCES}/Mars/Mars.jpg`, 'NASA-3D-Resources'],
  ['jupiter', `${SCIENCE}/psd/photojournal/pia/pia07/pia07782/PIA07782.jpg`, 'NASA/JPL/Space Science Institute (Cassini)'],
  ['saturn', `${RESOURCES}/Saturn/Saturn.jpg`, 'NASA-3D-Resources'],
  ['saturn-rings', [`${SCIENCE}/psd/solar/2023/09/s/Saturn_1_120536.glb`, 1], 'NASA Visualization Technology Applications and Development'],
  ['uranus', [`${SCIENCE}/psd/solar/2023/09/u/Uranus_1_51118.glb`, 0], 'NASA Visualization Technology Applications and Development'],
  ['neptune', [`${SCIENCE}/psd/solar/2023/09/n/Neptune_1_49528.glb`, 0], 'NASA Visualization Technology Applications and Development'],
];

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'merci-start' }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** One embedded image of a GLB, by its index in `images`. */
function glbImage(glb, index) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = glb.subarray(20 + jsonLength + 8);
  const view = json.bufferViews[json.images[index].bufferView];
  return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
}

mkdirSync(DIR, { recursive: true });
for (const [name, source, credit] of MAPS) {
  const rings = name === 'saturn-rings'; // a 4096 x 16 strip with transparency: kept as PNG
  const out = `${DIR}/${name}.${rings ? 'png' : 'jpg'}`;
  if (existsSync(out)) {
    continue;
  }
  const started = Date.now();
  const raw = `${out}.download`;
  writeFileSync(raw, Array.isArray(source) ? glbImage(await fetchBytes(source[0]), source[1]) : await fetchBytes(source));
  if (rings) {
    execFileSync('sips', ['-s', 'format', 'png', raw, '--out', out], { stdio: 'ignore' });
  } else {
    // Equirectangular 2:1, never larger than 2048 x 1024 (the Sun's map is 16:9 and gets stretched).
    const width = Number(execFileSync('sips', ['-g', 'pixelWidth', raw]).toString().match(/pixelWidth: (\d+)/)[1]);
    const w = Math.min(2048, width);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-z', String(w / 2), String(w), raw, '--out', out], { stdio: 'ignore' });
  }
  rmSync(raw);
  appendFileSync(`${DIR}/CREDITS.md`, `- ${name}: ${credit}; ${Array.isArray(source) ? source[0] : source}; public domain\n`);
  console.log(`${name}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
