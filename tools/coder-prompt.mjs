// The coder's system prompt (tools/coder.mjs): the rules, the knowledge, the host API and the examples.
// A module of its own so that the coder and a review of the prompt read the same text.
//
//   node tools/coder-prompt.mjs                 prints the whole prompt
//   node tools/coder-prompt.mjs --for hand,fx   prints the prompt for a request that needs these topics
//   node tools/coder-prompt.mjs --index         the topics, as JSON: what the server chooses from (server/index.mjs, pickTopics)
//
// The whole prompt is ~170 000 characters, and a request needs a part of it: a red cube needs neither the drum kit
// nor the portals. `systemFor(topics)` is the core — the rules, how a file is written, where a thing is put, the look
// and its shapes, sounds — and the topics the request needs, each with its own knowledge and its helpers'
// declarations. The names of everything else stay in sight (the list of ready things in style.md, the list of topics),
// and a repair is asked with the whole prompt (tools/coder.mjs): a topic not chosen costs one repair, never the game.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { coderApi, MODULES } from './coder-api.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (path) => `\n--- ${path} ---\n${readFileSync(`${ROOT}${path}`, 'utf8')}`;

const files = readdirSync(`${ROOT}knowledge`).sort();
const knowledge = files.map((name) => read(`knowledge/${name}`)).join('');
// The host helpers' declarations, made from their source (tools/coder-api.mjs, 16.11: instead of the
// source of hand.ts and the engine-wide ecs-api.md — the coder's own review of its prompt).
const api = await coderApi();
const modules = Object.keys(MODULES).map((spec) => `'${spec}'`).join(', ');
// Nothing in the system prompt changes between calls (no file name, no request): Vertex caches a
// shared prefix of 4096+ tokens by itself — the rules and the core come first in every prompt.
const RULES = `You write ONE TypeScript file for a running IWSDK (WebXR, passthrough AR) app in the player's real room (Meta Quest 3 / 3S browser).

THE FILE
- Shape: \`feature(import.meta, (world) => { ... });\` and last line \`import.meta.hot?.accept();\` (see examples).
  Setup may be \`async\` and return a cleanup function; everything created through \`world\` is disposed automatically when replaced (even after \`await\`), so \`await\` models/panels inside setup and never leave a \`.then()\` creating entities later.
- Import Three.js and IWSDK from \`@iwsdk/core\`; host helpers only from ${modules}. Use only APIs shown in this prompt; prefer host helpers over custom code.
- Register systems inside setup with \`world.registerSystem(...)\`. Do not declare components or touch other files.
- Never allocate objects inside \`update()\`: create scratch vectors/quaternions once outside it.

QUICK REFERENCE
- Placement: \`inFrontOfPlayer\` (air), \`wantedPlace\` (if note says pointing), \`tabletop\` (miniatures/board on table), \`walkInRoom\` (ground pets/people), \`openPortals\` / \`breakableRoom\` (walls/sky), \`readFurniture\` / \`XRPlane\` (furniture/walls).
- Forward axes: **+Z** for \`figure()\`, \`walkInRoom\`, \`fitModel\`, buildings/targets, \`place.facing\`; **−Z** for \`holdInHand\` (\`aimed\`), \`style.js\` ships/vehicles, \`dart\`.
- Hard limits (90 fps Quest budget): < 100 meshes — detail in shape and colour, not mesh count (host rejects > 150; alike items → \`InstancedMesh\`, static parts → \`merge()\`); ≤ 2 own lights; NEVER \`transmission\` (freezes Quest — use \`transparent: true, opacity\`); NEVER \`gltf.scene.clone()\` (use \`AssetManager.getGLTF(id)\`); NEVER \`AudioUtils.createOneShot\`; NEVER add colliders for floor/walls/furniture.

THE PLAYER AND THE ROOM
- The player sits on a couch/chair facing any direction and uses bare hands. World origin is where XR started: never use fixed world coordinates — place relative to a host spot.
- Pinch is also how the player talks to Punto and grabs things. Never read raw pinch/select state: react to your own objects via \`RayInteractable\` + \`Pressed\`, \`onRayPress\`, or a grab component. Only two exceptions for your own held objects: carrying with the ray (\`controls.md\`) and working a two-handed tool (\`hand.md\`).
- Floor is y = 0. The room already has ambient light and a shadow-casting sun; add a light only for something that glows itself.

WHAT TO BUILD
- Build the subject accurately with its real working parts and motion (simple request → simple object; rich subject → real moving parts; short \`mesh.name\` on key parts). No unrelated decor, extra glow, or floating bits.
- Mixed reality: for a habitat, world or weather (aquarium, forest, space, rain, zoo), bring its inhabitants and elements around the player in the real room — never build a box, tank or diorama unless asked.
- Never build a screen/TV/player for a «video», «film», «cartoon» or «clip»: build the live moving scene itself in the room (screen only when asked for a screen).
- Original generic things only: never copy existing games, films, brands, or real people's names/likenesses.
- Scene text is ONLY \`showScore\`. No popups, labels or instructions; UI panels only when buttons, menu, settings or a progress bar are needed (\`ui.md\`).
- Dynamic VFX (explosions, impacts, smoke, fire, spray, trails, shots, lasers) come from \`../fx.js\`, never custom meshes; ready \`../style.js\` items keep their built-in parts (\`Flame\`, \`Fire\`, \`Water\`) and \`exhaust()\` is valid on engines.
- Load a GLTF path ONLY when the director's note gives that exact path; all paths in docs (\`chest.glb\`, \`cat\`, \`revolver.glb\`) are placeholders — never invent a path.
`;
const HOST_API = "=== HOST API (declarations of the helpers' modules) ===";
const EXAMPLES = ['thing', 'pistol', 'portals', 'breakout'];
export const system = `${RULES}${knowledge}
${HOST_API}
${api}
=== EXAMPLES ===${EXAMPLES.map((name) => read(`samples/${name}.ts`)).join('')}`;

// ---- The prompt for one request: the core and the topics it needs ----

/** The topics: what each is about (for whoever chooses, and for the coder to know it exists) and its helpers' modules.
 *  `signs`: what in a written file tells that the file uses the topic (a change of that file needs it again). */
export const TOPICS = {
  hand: { about: "a tool, weapon or instrument in the player's hand; shooting from it; hitting with it; a bow, a slingshot; arrows and darts that stick", modules: ['../hand.js'], signs: /holdInHand|strikeWith|fitToHand|muzzleOf/ },
  people: { about: 'people of any kind (a zombie, a knight, a crowd) as ready figures; a creature, a pet, a robot that walks the real floor', modules: ['../figures.js', '../creature.js'], signs: /\bfigures\.js|\bcreature\.js/ },
  music: { about: 'musical instruments (piano, drums, xylophone…), playing notes and beats', modules: ['../music.js', '../instruments.js', '../hand.js'], signs: /\bmusic\.js|\binstruments\.js/ },
  physics: { about: 'things that fall, roll, bounce, stack, are thrown, hit or knocked down', modules: ['../throwable.js', '../basketball.js'], signs: /PhysicsBody|PhysicsShape|PhysicsSystem|\bthrowable\.js|\bbasketball\.js/ },
  tabletop: { about: 'a small world, a diorama, a strategy or a board game on the real table', modules: ['../tabletop.js'], signs: /\btabletop\.js/ },
  walls: { about: 'portals in the real walls, ceiling or floor; breaking the walls; a sky outside the room', modules: ['../outside.js', '../breakroom.js'], signs: /\boutside\.js|\bbreakroom\.js/ },
  furniture: { about: 'the real furniture taking part (a creature on the couch, a firefly round the lamp), something on every wall', modules: ['../furniture.js'], signs: /\bfurniture\.js|XRMesh|XRPlane/ },
  controls: { about: 'things to press, buttons, sliders, dials, levers; picking a block or a cell with the ray; carrying a thing with the ray to a wall; keys and pads played with the fingers', modules: ['../ray.js', '../hand.js'], signs: /\bray\.js|OneHandGrabbable|PokeInteractable|\bPressed\b|\bHovered\b|\bGrabbed\b|onFingerTouch/ },
  panels: { about: 'a flat panel with buttons, a menu, settings, a progress bar', modules: [], signs: /loadUIKitMLAsset|\bFollower\b/ },
  fx: { about: 'effects: smoke, fire, light, water spray, bubbles, weather, a trail; a hit, an explosion, a thing falling to pieces, dust, lightning, confetti, fireworks; shots that fly, a laser; lava or water over the floor', modules: ['../fx.js'], signs: /\bfx\.js/ },
  model: { about: "a downloaded model file (only when the director's note names one)", modules: ['../models.js', '../hand.js'], signs: /loadGLTF|\bmodels\.js/ },
  planets: { about: 'the real planets of the solar system by name, with their real maps', modules: ['../planets.js'], signs: /\bplanets\.js/ },
};
/** Where a piece of the knowledge goes — 'core' or a topic: the first line that fits. [file, its section's heading begins with] */
const SHELVES = [
  ['room.md', 'Portals', 'walls'], ['room.md', 'Breakable walls', 'walls'], ['room.md', 'A piece of furniture', 'furniture'],
  ['sound.md', 'Musical instruments', 'music'], ['sound.md', 'An instrument to play', 'music'],
  ['ui.md', 'The score', 'core'], ['ui.md', '', 'panels'],
  ['hand.md', 'A downloaded model', 'model'], ['hand.md', '', 'hand'],
  ['controls.md', '', 'controls'], ['figures.md', '', 'people'], ['creature.md', '', 'people'], ['physics.md', '', 'physics'],
  ['tabletop.md', '', 'tabletop'], ['fx.md', '', 'fx'], ['models.md', '', 'model'],
  ['planets.md', '', 'planets'],
]; // everything else — ecs, ergonomics, style, the rest of room, sound and ui — is the core
const CORE_MODULES = ['../live.js', '../place.js', '../score.js', '../sfx.js'];
const shelfOf = (file, heading) => SHELVES.find(([name, begins]) => name === file && heading.startsWith(begins))?.[2] ?? 'core';
/** A knowledge file as its sections: [{ heading, text }], cut before every # and ## heading. */
const sections = (text) => text.split(/^(?=#{1,2} )/m).map((part) => ({ heading: part.match(/^#{1,2} (.*)/)?.[1] ?? '', text: part }));

// The declarations one by one (module -> [{ name, text }]): tools/coder-api.d.ts read by the TypeScript parser and
// kept as tools/coder-api.json, which is used as it is where there is no TypeScript (the published service).
const PARTS = `${ROOT}tools/coder-api.json`;
const API_DTS = `${ROOT}tools/coder-api.d.ts`;
async function declarations() {
  const stale = !existsSync(PARTS) || statSync(PARTS).mtimeMs < statSync(API_DTS).mtimeMs;
  if (stale) {
    try {
      const ts = (await import('typescript')).default;
      const source = ts.createSourceFile('api.d.ts', api, ts.ScriptTarget.ES2022, true);
      const parts = {};
      for (const block of source.statements) {
        if (!ts.isModuleDeclaration(block) || !block.body) continue;
        parts[`../${block.name.text.replace(/^\.\.\//, '')}`] = block.body.statements.map((statement) => ({
          name: statement.name?.text ?? statement.declarationList?.declarations[0].name.text ?? '',
          text: statement.getFullText(source).replace(/^\s*\n/, '').trimEnd(),
        }));
      }
      writeFileSync(PARTS, JSON.stringify(parts, null, 1) + '\n');
    } catch (error) {
      if (!existsSync(PARTS)) throw error;
      console.warn(`coder-prompt: kept the old ${PARTS} (${error.message})`);
    }
  }
  return JSON.parse(readFileSync(PARTS, 'utf8'));
}
const parts = await declarations();

// Core utilities of '../style.js' (always in the cached core prefix). Every other ready thing belongs to a group
// parsed from the catalog in style.md. Using an explicit Set instead of scanning prose prevents words like `car` or
// `house` in examples from dragging ready things into core.
const CORE_STYLE = new Set([
  'PALETTE', 'topSide', 'lit', 'evenFaces', 'bands', 'byHeight',
  'ring', 'lumps', 'craters', 'turned', 'slab', 'forward', 'flat', 'upright', 'mirrored',
  'hull', 'block', 'chamferedBox', 'exhaust', 'leaf', 'ribbon', 'toy', 'toyLook', 'merge',
  'blob', 'edgeGlow', 'glowMat',
  'roundTree', 'pineTree', 'rock', 'cloud', 'island', 'eyes', 'wheel', 'ground',
]);
const styleMd = readFileSync(`${ROOT}knowledge/style.md`, 'utf8');
const catalogAt = styleMd.indexOf('## Ready things');
const styleNames = (parts['../style.js'] ?? []).map((one) => one.name).filter((name) => /^[a-z]/.test(name));
const calledIn = (text) => new Set(styleNames.filter((name) => new RegExp(`\\b${name}\\(`).test(text)));
export const GROUPS = {}; // 'vehicles' -> Set of ready thing names
const GROUP_DOCS = {}; // 'vehicles' -> catalog paragraph from style.md
let peopleStyleDoc = '';
for (const paragraph of styleMd.slice(catalogAt).split(/\n\n+/)) {
  const title = paragraph.match(/^\*\*([^*]+?)[.:]?\*\*/)?.[1];
  if (!title) continue;
  if (title === 'People') {
    peopleStyleDoc = paragraph;
    continue;
  }
  const id = title.toLowerCase();
  GROUPS[id] = new Set([...calledIn(paragraph)].filter((name) => !CORE_STYLE.has(name)));
  GROUP_DOCS[id] = paragraph;
}
const grouped = new Set(Object.values(GROUPS).flatMap((names) => [...names]));
for (const name of styleNames) if (!CORE_STYLE.has(name) && !grouped.has(name)) CORE_STYLE.add(name);

/** Transitive closure of uppercase types/tables referenced by `kept` in `list`, excluding `already`. */
function withTypes(list, kept, already = new Set()) {
  for (let grew = true; grew; ) {
    grew = false;
    const text = [...kept].map((one) => one.text).join('\n');
    for (const one of list) {
      if (!kept.has(one) && !already.has(one) && /^[A-Z]/.test(one.name) && new RegExp(`\\b${one.name}\\b`).test(text)) {
        kept.add(one);
        grew = true;
      }
    }
  }
  return list.filter((one) => kept.has(one));
}

const styleList = parts['../style.js'] ?? [];
const coreStyleKept = new Set(styleList.filter((one) => CORE_STYLE.has(one.name)));
const coreStyleItems = withTypes(styleList, coreStyleKept);
const coreStyleSet = new Set(coreStyleItems);

function formatModules(lean) {
  return Object.entries(lean)
    .filter(([, list]) => list.length)
    .map(([spec, list]) => `declare module '${spec}' {\n${list.map((one) => one.text).join('\n')}\n}`)
    .join('\n\n') + '\n';
}

const CORE_API = formatModules({
  ...Object.fromEntries(CORE_MODULES.map((spec) => [spec, parts[spec] ?? []])),
  '../style.js': coreStyleItems,
});

function topicApiFor(topics) {
  const specs = new Set([...topics].flatMap((id) => TOPICS[id]?.modules ?? []));
  const lean = {};
  for (const [spec, list] of Object.entries(parts)) {
    if (spec === '../style.js') {
      const kept = new Set(list.filter((one) => /^[a-z]/.test(one.name) && [...topics].some((id) => GROUPS[id]?.has(one.name))));
      if (kept.size) lean[spec] = withTypes(list, kept, coreStyleSet);
    } else if (!CORE_MODULES.includes(spec) && specs.has(spec)) {
      lean[spec] = list;
    }
  }
  return formatModules(lean);
}

/** What a request may be given, for whoever chooses: [{ id, about }]. 'model' is not chosen: the server knows. */
export const topicIndex = () => [
  ...Object.entries(TOPICS).filter(([id]) => id !== 'model').map(([id, topic]) => ({ id, about: topic.about })),
  ...Object.entries(GROUPS).map(([id, names]) => ({ id, about: `ready things (${id}): ${[...names].join(', ')}` })),
];

/** The topics a written file uses (a change or a repair of it needs them again). */
export function topicsOf(source) {
  const found = Object.entries(TOPICS).filter(([, topic]) => topic.signs.test(source)).map(([id]) => id);
  for (const [id, names] of Object.entries(GROUPS)) if ([...names].some((name) => new RegExp(`\\b${name}\\(`).test(source))) found.push(id);
  return found;
}

// Static prefix: identical byte-for-byte on every systemFor() call so Vertex caches the entire core (> 4096 tokens).
const coreKnow = files.map((name) => {
  const text = name === 'style.md'
    ? styleMd.slice(0, catalogAt).trimEnd() + '\n'
    : readFileSync(`${ROOT}knowledge/${name}`, 'utf8');
  const kept = sections(text).filter((section) => shelfOf(name, section.heading) === 'core');
  return kept.length ? `\n--- knowledge/${name} ---\n${kept.map((section) => section.text).join('')}` : '';
}).join('');

const STATIC_CORE_PREFIX = `${RULES}${coreKnow}
${HOST_API}
${CORE_API}=== EXAMPLES ===${read('samples/thing.ts')}`;

/** The prompt for a request that needs `topics` (ids of TOPICS and GROUPS; unknown ones are dropped). */
export function systemFor(wanted) {
  const topics = new Set(wanted.filter((id) => TOPICS[id] || GROUPS[id]));
  const topicKnow = files.map((name) => {
    if (name === 'style.md') {
      const styleDocs = [
        ...(topics.has('people') && peopleStyleDoc ? [peopleStyleDoc] : []),
        ...Object.entries(GROUP_DOCS).filter(([id]) => topics.has(id)).map(([, doc]) => doc),
      ];
      return styleDocs.length ? `\n--- knowledge/style.md (ready things) ---\n${styleDocs.join('\n\n')}\n` : '';
    }
    const kept = sections(readFileSync(`${ROOT}knowledge/${name}`, 'utf8')).filter((section) => {
      const shelf = shelfOf(name, section.heading);
      return shelf !== 'core' && topics.has(shelf);
    });
    return kept.length ? `\n--- knowledge/${name} ---\n${kept.map((section) => section.text).join('')}` : '';
  }).join('');
  const topicApi = topicApiFor(topics);
  const topicExamples = [
    ...(topics.has('hand') ? ['pistol'] : []),
    ...(topics.has('walls') ? [topics.has('hand') ? 'breakout' : 'portals'] : []),
  ];
  const restTopics = Object.entries(TOPICS).filter(([id]) => !topics.has(id) && id !== 'model');
  const restGroups = Object.entries(GROUPS).filter(([id]) => !topics.has(id));
  return `${STATIC_CORE_PREFIX}${topicKnow}${topicApi.trim() ? `\n=== TOPIC HOST API ===\n${topicApi}` : ''}${topicExamples.length ? `\n=== TOPIC EXAMPLES ===${topicExamples.map((name) => read(`samples/${name}.ts`)).join('')}` : ''}
=== NOT SHOWN HERE ===
This prompt holds what this request was judged to need. The host has more modules and ready things not shown here — use one only when the request cannot be done without it:
${restTopics.map(([, topic]) => `- ${topic.about} (${topic.modules.filter((spec) => !CORE_MODULES.includes(spec)).join(', ') || '@iwsdk/core'})`).join('\n')}
${restGroups.map(([id, names]) => `- '../style.js' (${id}): ${[...names].join(', ')}`).join('\n')}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [flag, list] = process.argv.slice(2);
  if (flag === '--index') process.stdout.write(JSON.stringify(topicIndex()));
  else if (flag === '--for') process.stdout.write(systemFor((list ?? '').split(',').filter(Boolean)));
  else process.stdout.write(system);
}
