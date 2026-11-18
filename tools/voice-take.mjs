// Punto's lines recorded scene by scene, each scene in ONE take, then cut into one file per line:
// recorded line by line the voice jumps (each line is a new performance); in one take it is one
// Punto in one mood.
//
//   node tools/voice-take.mjs                      English -> public/voice/<key>.wav
//   node tools/voice-take.mjs --ru                 Russian -> public/voice/ru/<key>.wav
//   node tools/voice-take.mjs --ru --voice Puck    one of Gemini's voices (default Puck)
//   node tools/voice-take.mjs --ru coding intro    only these scenes
//   node tools/voice-take.mjs --sample out.wav --voice Leda "[playful] Line one" "Line two"   a test take only
//   PUNTO_MOOD=playful                             the mood every line is said in (Gemini's square-bracket tag)
//
// How a take is cut. Pauses inside a line (an ellipsis, a breath) can be as long as the pauses
// between lines, so the longest pauses are not the cuts. Every line's length is known roughly from
// its text, so the cuts are the set of pauses that makes every piece as long as its line should be
// (dynamic programming over the pauses). Every piece is then heard back by Gemini and compared with
// its line; a scene with any piece wrong is recorded again (up to 4 takes, the best one is kept).
// Needs ffmpeg. Auth: gcloud application-default login.
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INTRO_LINES, INTRO_LINES_RU } from '../src/intro-lines.ts';

const { GoogleGenAI } = createRequire(new URL('../server/package.json', import.meta.url))('@google/genai');
const ai = new GoogleGenAI({ vertexai: true, project: process.env.PUNTO_PROJECT ?? 'punto-vr', location: 'global' });
const MODEL = process.env.PUNTO_TTS ?? 'gemini-3.8-flash-tts';
const MOOD = process.env.PUNTO_MOOD ?? 'playful';
const TAKES = 4;

// The scenes, in the order they are played: a scene is said as one piece of acting.
const SCENES = {
  hook: ['anyone', 'help1', 'help2', 'seen'],
  tiles: ['pull', 'nudge1', 'nudge2', 'pulled1', 'pulled2', 'pulled3', 'pushing'],
  repair: ['stuck', 'free', 'fixit', 'sayFix', 'oops'],
  intro: ['hello', 'offer', 'askMe', 'again'],
  coding: ['busyWorking', 'busyTyping', 'busyBugs', 'busyMagic', 'busyCompile', 'busyAlmost', 'busySoon'],
  answers: ['done', 'blasterReady', 'pointIt', 'gotIt', 'fixing', 'failed', 'sorry'],
  idle: ['remind', 'suggestHoop', 'planets', 'suggestDna'],
  misc: ['start', 'woohoo'],
};

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args.splice(at, 2)[1] : undefined;
};
const flag = (name) => {
  const at = args.indexOf(name);
  if (at >= 0) args.splice(at, 1);
  return at >= 0;
};
const russian = flag('--ru');
const voice = option('--voice') ?? 'Puck';
const sample = option('--sample');
const LINES = russian ? INTRO_LINES_RU : INTRO_LINES;

async function speak(text) {
  const reply = await ai.models.generateContent({
    model: MODEL,
    contents: text,
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  });
  return Buffer.from(reply.candidates[0].content.parts[0].inlineData.data, 'base64');
}
const ffmpeg = (...rest) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...rest]);
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

if (sample) {
  writeFileSync(sample, await speak(args.join('\n\n')));
  console.log(`${sample}: ${duration(sample).toFixed(1)} s, voice ${voice}`);
  process.exit(0);
}

/** How long a line should take, in units: letters, plus the pauses its punctuation makes. */
const weight = (text) => {
  const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const ellipses = (text.match(/…|\.\.\./g) ?? []).length;
  const stops = (text.match(/[.!?—–,:;]/g) ?? []).length;
  return letters + ellipses * 7 + stops * 2.5;
};

/** The pauses in a take: [{ start, end }] in seconds. */
function pauses(file) {
  const log = execSync(`ffmpeg -hide_banner -i "${file}" -af silencedetect=noise=-38dB:d=0.12 -f null - 2>&1`).toString();
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((start, n) => ({ start, end: ends[n] ?? duration(file) }));
}

/** The cuts: N-1 pauses that make every piece as long as its line should be. */
function cuts(file, texts) {
  const total = duration(file);
  const found = pauses(file).filter((p) => p.start > 0.2 && p.end < total - 0.2);
  const N = texts.length;
  if (found.length < N - 1) return undefined;
  const w = texts.map(weight);
  const speech = total - (N - 1) * 0.55;
  const k = speech / w.reduce((a, b) => a + b, 0);
  const expected = w.map((x) => x * k);
  const M = found.length;
  // cost of a piece from `a` to `b` seconds that should be `e` long
  const piece = (a, b, e) => ((b - a - e) / (0.3 * e + 0.25)) ** 2;
  // best[i][j]: the best cost when the i-th cut (0-based) is pause j
  const best = Array.from({ length: N - 1 }, () => new Array(M).fill(Infinity));
  const from = Array.from({ length: N - 1 }, () => new Array(M).fill(-1));
  const bonus = (j) => -2.5 * (found[j].end - found[j].start); // a longer pause is likelier a cut
  for (let j = 0; j < M; j++) best[0][j] = piece(0, found[j].start, expected[0]) + bonus(j);
  for (let i = 1; i < N - 1; i++) {
    for (let j = i; j < M; j++) {
      for (let q = i - 1; q < j; q++) {
        if (best[i - 1][q] === Infinity) continue;
        const cost = best[i - 1][q] + piece(found[q].end, found[j].start, expected[i]) + bonus(j);
        if (cost < best[i][j]) {
          best[i][j] = cost;
          from[i][j] = q;
        }
      }
    }
  }
  let end = -1;
  let lowest = Infinity;
  for (let j = 0; j < M; j++) {
    if (N === 1) break;
    const cost = best[N - 2][j] + piece(found[j].end, total, expected[N - 1]);
    if (cost < lowest) {
      lowest = cost;
      end = j;
    }
  }
  const chosen = [];
  for (let i = N - 2, j = end; i >= 0; i--) {
    chosen.unshift(found[j]);
    j = from[i][j];
  }
  return chosen;
}

const words = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
async function hears(file, text) {
  const reply = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: readFileSync(file).toString('base64') } }, { text: 'Write down exactly what is said, word for word, in its language. Only the words.' }] }],
  });
  const heard = words(reply.text ?? '');
  const wanted = words(text);
  if (wanted.length <= 2) return { ok: heard.length > 0 && heard.length <= wanted.length + 2, heard };
  const shared = wanted.filter((w) => heard.includes(w)).length;
  return { ok: shared / Math.max(wanted.length, heard.length, 1) >= 0.7, heard };
}

const dir = russian ? 'public/voice/ru' : 'public/voice';
mkdirSync(dir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'punto-voice-'));
const wanted = args.length ? args : Object.keys(SCENES);

async function scene(name) {
  const keys = SCENES[name];
  const texts = keys.map((key) => LINES[key]);
  let kept;
  for (let take = 1; take <= TAKES; take++) {
    const raw = join(work, `${name}-${take}.wav`);
    writeFileSync(raw, await speak(texts.map((t) => `[${MOOD}] ${t}`).join('\n\n')));
    const chosen = cuts(raw, texts);
    if (!chosen) {
      console.log(`  ${name} take ${take}: lines ran together`);
      continue;
    }
    const files = [];
    let start = 0;
    keys.forEach((key, n) => {
      const end = n < chosen.length ? chosen[n].start + 0.06 : duration(raw);
      const file = join(work, `${name}-${take}-${key}.wav`);
      ffmpeg('-i', raw, '-ss', Math.max(0, start - 0.03).toFixed(3), '-to', end.toFixed(3), '-af', 'afade=t=in:d=0.015,areverse,afade=t=in:d=0.05,areverse', file);
      files.push(file);
      start = n < chosen.length ? chosen[n].end : 0;
    });
    const checks = await Promise.all(files.map((file, n) => hears(file, texts[n])));
    const wrong = checks.map((c, n) => (c.ok ? null : `${keys[n]}: heard «${c.heard.join(' ')}»`)).filter(Boolean);
    if (!kept || wrong.length < kept.wrong.length) kept = { files, wrong, take };
    if (!wrong.length) break;
    console.log(`  ${name} take ${take}: ${wrong.length} off (${wrong.join('; ')})`);
  }
  if (!kept) throw new Error(`${name}: no take could be cut`);
  keys.forEach((key, n) => copyFileSync(kept.files[n], join(dir, `${key}.wav`)));
  console.log(`${name}: take ${kept.take}${kept.wrong.length ? `, still off: ${kept.wrong.join('; ')}` : ', every line right'}`);
}

console.log(`${russian ? 'Russian' : 'English'}, voice ${voice}, mood [${MOOD}], scenes: ${wanted.join(', ')}`);
await Promise.all(wanted.map((name) => scene(name).catch((error) => console.log(`${name}: ${error.message}`))));
writeFileSync(join(dir, '_take.txt'), `voice ${voice}, mood [${MOOD}], scene takes, ${new Date().toISOString()}\n`);
