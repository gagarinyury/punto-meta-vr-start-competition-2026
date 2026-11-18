// The host helpers' API for the coder, as TypeScript declarations (16.11, the coder's own review:
// «replace the prose and the source of hand.ts with one short .d.ts of every helper»).
// Made from the helpers' own source by the TypeScript compiler, so it never drifts from the code.
// Only what the knowledge or the examples mention goes in (plus the types those need): the rest of
// a module is the host's own business.
//
//   node tools/coder-api.mjs        writes tools/coder-api.d.ts
//   import { coderApi } from './coder-api.mjs'   the text, made again when a helper changed
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** The modules the coder may import, as it writes them, and their source files. */
export const MODULES = {
  '../live.js': ['src/live.ts'],
  '../hand.js': ['src/hand.ts'],
  '../place.js': ['src/place.ts'],
  '../ray.js': ['src/ray.ts'],
  '../throwable.js': ['src/throwable.ts'],
  '../basketball.js': ['src/basketball.ts'],
  '../score.js': ['src/score.ts'],
  '../sfx.js': ['src/sfx.ts'],
  '../music.js': ['src/music.ts'],
  '../style.js': ['src/style.ts', 'src/style/base.ts', 'src/splash/models/kit.ts'],
  '../instruments.js': ['src/instruments.ts', 'src/instruments/kit.ts', 'src/instruments/keyboards.ts', 'src/instruments/mallets.ts', 'src/instruments/drums.ts'],
  '../fx.js': ['src/fx.ts'],
  '../models.js': ['src/models.ts'],
  '../creature.js': ['src/creature.ts'],
  '../tabletop.js': ['src/tabletop.ts'],
  // '../together.js' (playing together from different rooms) is not offered: the judges play alone (Yury, 18.11);
  // a game still plays together without it — the host shares hands, throws and shots by itself
  '../breakroom.js': ['src/breakroom.ts'],
  '../outside.js': ['src/outside.ts'],
  '../furniture.js': ['src/furniture.ts'],
  '../planets.js': ['src/planets.ts'],
  '../figures.js': ['src/figures.ts'],
};
const OUT = `${ROOT}tools/coder-api.d.ts`;
// Exported but not offered — the name of another module's helper, or the host's own business:
const HIDDEN = {
  // the game warms the effects' shaders at its start itself
  '../fx.js': ['warmEffects'],
  // fire: the effect of '../fx.js' is the fire (the faceted flame stays inside campfire() and torch());
  // paint: toy() paints, and the instruments have a `paint` of their own
  // astronaut: people are figures ('../figures.js'); spaceship({ kind }): every kind has its own function
  // targetRing: kept for compatibility; coder uses bullseyeRing to avoid collision with '../fx.js' targetRing
  // pistol 20, escapePod 25, train 40, bomber 45, blaster 45 of 100 against their concepts (research/things-review/scores.md,
  // 16.11; Yury, 18.11: the weak ones out) — the coder builds these itself with toy()
  '../style.js': ['fire', 'paint', 'astronaut', 'spaceship', 'targetRing', 'pistol', 'blaster', 'escapePod', 'train', 'bomber'],
  // planet/animate: kept for compatibility; coder uses realPlanet / animateModel to avoid collisions with style.js / figures.js
  '../planets.js': ['planet'],
  '../models.js': ['animate'],
  // block: the same thing as the block of '../style.js'; the rest is the kit the ready instruments are built from
  '../instruments.js': ['block', 'rod', 'v', 'paint', 'vary', 'knob', 'mallet', 'cymbal', 'tripod', 'playable', 'layBars', 'notes', 'keyboard', 'KEY'],
};
// their comment in the source is a note for whoever keeps the host, not for the coder
const NO_COMMENT = new Set(['InstrumentName', 'Place']);
// what the coder reads besides the API: an export named there is one it is meant to use
const MENTIONS = () => [
  ...readdirSync(`${ROOT}knowledge`).map((name) => `${ROOT}knowledge/${name}`),
  ...['thing', 'pistol', 'portals', 'breakout'].map((name) => `${ROOT}samples/${name}.ts`),
];

/**
 * A declaration as the coder needs it: its signature and one short paragraph. The knowledge (knowledge/*.md) says how
 * to use a helper, with an example; the comment in the source says it again, and more — how it works inside, how a
 * ready thing is painted (for whoever builds the model from its concept sheet). Kept of a comment: its first
 * paragraph; of a ready thing's — what it is, its size and axes, the names of its parts.
 */
function forCoder(text, spec) {
  return text
    // the photo sky: the server never gives one
    .replace(/[ \t]*\/\*\*(?:(?!\*\/)[\s\S])*?textures\.mjs sky(?:(?!\*\/)[\s\S])*?\*\/\n[ \t]*panorama\?: string;\n/g, '')
    .replace(/\/\*\*[\s\S]*?\*\//g, (comment) => brief(comment, spec))
    .replace(/ ?\(1\d\.11[^()]*\)/g, '')
    .replace(/ ?\((?:src|tools|research)\/[\w./-]+\)/g, '')
    .replace(/<import\("three"\)[^<>]*>/g, '');
}

/** One comment, short (see forCoder). */
function brief(comment, spec) {
  const paragraphs = comment.slice(3, -2).split(/\n[ \t]*\*[ \t]*(?=\n)/);
  const flat = paragraphs[0].replace(/\s*\n\s*\*\s?/g, ' ').trim();
  const at = lookStart(flat, spec);
  if (at >= 0) {
    const parts = [...new Set(flat.slice(at).match(/'[A-Z][\w ]*'|`?userData\.\w+`?/g) ?? [])].map((name) => name.replace(/`/g, ''));
    return `/** ${flat.slice(0, at)}.${parts.length ? ` Parts: ${parts.join(', ')}.` : ''} */`;
  }
  return paragraphs.length === 1 ? comment : `/**${paragraphs[0].trimEnd()}\n */`;
}

/** Where a ready thing's comment turns to how it looks, or -1: after the name of its concept sheet, or after the colon
 *  of «A treasure chest `width` metres wide (0.5), its front towards +Z: a box of wooden planks with gold corners…». */
function lookStart(flat, spec) {
  const sheet = flat.indexOf(' (research/concepts/');
  if (sheet >= 0) return sheet;
  if (spec !== '../style.js') return -1;
  for (let i = 0, depth = 0; i < flat.length - 1; i++) {
    if (flat[i] === '(') depth++;
    else if (flat[i] === ')') depth--;
    else if (flat[i] === ':' && flat[i + 1] === ' ' && depth === 0) return /metres|\(\d/.test(flat.slice(0, i)) ? i : -1;
  }
  return -1;
}

/** The same declarations in fewer characters: an options type on one line, no indentation. */
function compact(text) {
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    out = out.replace(/\{\n\s+([^{}]*?)\n\s*\}/g, (all, body) => (body.includes('*') ? all : `{ ${body.split(/\n\s*/).join(' ')} }`));
  }
  return out.replace(/^[ \t]+/gm, '');
}

/** Every .ts file under src/ that a helper may pull in (for the staleness check). */
function sources(dir = `${ROOT}src`) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name.startsWith('_') || entry.name === 'features' ? [] : sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

async function build() {
  const ts = (await import('typescript')).default;
  const mentioned = MENTIONS().map((path) => readFileSync(path, 'utf8')).join('\n');
  const said = (name) => new RegExp(`\\b${name}\\b`).test(mentioned);

  // declarations of the helpers, in memory
  const files = Object.values(MODULES).flat().map((file) => `${ROOT}${file}`);
  const dts = new Map();
  const program = ts.createProgram(files, {
    declaration: true,
    emitDeclarationOnly: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    types: ['@iwsdk/vite-plugin-dev/client'],
  });
  program.emit(undefined, (name, text) => dts.set(name.replace(/^.*?\/src\//, 'src/').replace(/\.d\.ts$/, '.ts'), text));

  const nameOf = (statement) =>
    statement.name?.text ?? (ts.isVariableStatement(statement) ? statement.declarationList.declarations[0].name.text : undefined);
  const exported = (statement) => statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  /** One declaration as the coder reads it: with its comment, without noise. */
  function shorten(statement, source) {
    // a type the coder only passes around: what it is, not how the host builds it
    const opaque = { Fx: '/** One effect, made by an effect function; show it with play(). */\nexport interface Fx {\n    object: Object3D;\n}' };
    if (opaque[nameOf(statement)]) return opaque[nameOf(statement)];
    // a table of ready values (SKY): its keys are the news, the shape of each is the type next to it
    const declaration = ts.isVariableStatement(statement) ? statement.declarationList.declarations[0] : undefined;
    const type = declaration?.type;
    if (type && ts.isTypeLiteralNode(type)) {
      const keys = type.members.map((member) => `'${member.name.getText(source)}'`).join(' | ');
      const comment = statement.getFullText(source).slice(0, statement.getStart(source) - statement.getFullStart()).trim();
      // a table of numbers (PALETTE): its keys
      if (type.members.every((member) => member.type?.kind === ts.SyntaxKind.NumberKeyword)) return `${comment}\nexport declare const ${declaration.name.text}: Record<${keys}, number>;`;
      if (type.getText(source).length > 800) return `${comment}\nexport declare const ${declaration.name.text}: Record<${keys}, SkyRecipe>;`;
    }
    let text = statement.getFullText(source).replace(/^\s*\n/, '').trimEnd().replace(/\?: ([^;\n]+?) \| undefined;/g, '?: $1;');
    if (NO_COMMENT.has(nameOf(statement))) text = text.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*\n/, '');
    return forCoder(text, offered);
  }

  /** The declarations `wanted` of the d.ts of `file`, following `export { … } from` into other files. */
  function take(file, wanted, hidden) {
    const text = dts.get(file);
    if (!text) throw new Error(`no declarations for ${file}`);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    const own = new Map(); // name -> statement
    const local = new Map(); // a type the file does not export, which its exports use (Pick, Finish, Hit)
    const reexports = new Map(); // name -> file it comes from
    const stars = []; // files re-exported whole
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.exportClause && !statement.isTypeOnly) {
        // export * from './x.js': everything of that file the knowledge mentions
        stars.push(posix.normalize(`${file.replace(/[^/]+$/, '')}${statement.moduleSpecifier.text.replace(/^\.\//, '')  .replace(/\.js$/, '.ts')}`));
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && statement.exportClause) {
        const from = posix.normalize(`${file.replace(/[^/]+$/, '')}${statement.moduleSpecifier.text.replace(/^\.\//, '').replace(/\.js$/, '.ts')}`);
        for (const element of statement.exportClause.elements) reexports.set(element.name.text, from);
      } else if (exported(statement) && nameOf(statement)) {
        own.set(nameOf(statement), statement);
      } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        local.set(statement.name.text, statement);
      }
    }
    const names = wanted ?? [...own.keys(), ...reexports.keys()].filter(said).filter((name) => !hidden.has(name));
    // types the kept declarations use, from the same file, until nothing new comes
    const keep = new Set(names.filter((name) => own.has(name)));
    for (let grew = true; grew; ) {
      grew = false;
      for (const name of [...keep]) {
        const body = (own.get(name) ?? local.get(name)).getText(source);
        for (const other of [...own.keys(), ...local.keys()]) {
          if (!keep.has(other) && /^[A-Z]/.test(other) && new RegExp(`\\b${other}\\b`).test(body)) {
            keep.add(other);
            grew = true;
          }
        }
      }
    }
    const parts = [...keep].map((name) => shorten(own.get(name) ?? local.get(name), source));
    // re-exported names, grouped by the file they come from
    const byFile = new Map();
    for (const name of names) if (reexports.has(name)) byFile.set(reexports.get(name), [...(byFile.get(reexports.get(name)) ?? []), name]);
    for (const [from, list] of byFile) parts.push(take(from, list));
    for (const from of stars) if (!wanted) parts.push(take(from, undefined, hidden));
    return parts.join('\n');
  }

  let offered; // the module being made
  const blocks = Object.entries(MODULES).map(([spec, [file]]) => {
    offered = spec;
    const body = take(file, undefined, new Set(HIDDEN[spec] ?? []));
    return body ? `declare module '${spec}' {\n${compact(body.replace(/^export declare /gm, 'export '))}\n}` : '';
  });
  return `// The host helpers' declarations, made from their source (tools/coder-api.mjs). Do not edit.\n${blocks.filter(Boolean).join('\n\n')}\n`;
}

/** The API text; made again first when a helper, the knowledge or an example is newer than it. */
export async function coderApi() {
  const made = existsSync(OUT) ? statSync(OUT).mtimeMs : 0;
  const stale = [...sources(), ...MENTIONS()].some((path) => statSync(path).mtimeMs > made);
  if (stale) {
    try {
      writeFileSync(OUT, await build());
    } catch (error) {
      // no TypeScript here (the published service): the file in git is used as it is
      if (!made) throw error;
      console.warn(`coder-api: kept the old ${OUT} (${error.message})`);
    }
  }
  return readFileSync(OUT, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUT, await build());
  console.log(`${OUT}: ${readFileSync(OUT, 'utf8').length} chars`);
}
