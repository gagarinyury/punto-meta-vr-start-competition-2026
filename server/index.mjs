// Punto server: serves the built game and the /api calls a page must not make
// itself. Gemini runs on Vertex AI under the server's own Google identity
// (Cloud Run service account, or `gcloud auth application-default login` on a
// laptop), so there is no Gemini key anywhere.
//
// Every /api call needs a key in the `x-punto-key` header. The page takes it
// from its link (?key=...). Keys and their owners come from the environment:
//   PUNTO_KEYS=yury:abc123,judges:def456
//
// The published site (PUNTO_PUBLISHED=1, see DEPLOY.md) is open to anyone who has the link, and a
// link on a public page is soon found, so it counts what costs money (calls to Google, PAID below):
//   PUNTO_VISITOR_HOURLY  paid calls an hour from one address (default 150)
//   PUNTO_CODER_DAILY     coder runs a day for everybody together (default 400); then Punto refuses
// The free calls (tablet, library, live heartbeat, putting a thing in the room) are not counted:
// the tablet alone asks every 8 s, and a count on the key ran out for every judge at once (audit 15.11).
// On a laptop nothing is counted.
//
//   node --env-file=.env index.mjs        (local, port 8787)
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { modelContents, searchModels } from '../tools/models.mjs';
import { codeOf, draftOf } from '../tools/draft.mjs';
import { compileGame } from '../tools/compile.mjs';
import { topicIndex, topicsOf } from '../tools/coder-prompt.mjs';
import { tmpdir } from 'node:os';
import { libraryRoutes } from './library.mjs';
import { liveRoutes } from './live.mjs';
import { togetherRoutes } from './together.mjs';

// Every event line gets its local time as the first field ("t"), so the server's log can be laid beside the
// headset's (logs/quest.log, logs/fps.log): a session in the headset had nothing to match by (16.11).
for (const level of ['log', 'warn', 'error']) {
  const write = console[level].bind(console);
  console[level] = (first, ...rest) => {
    if (typeof first === 'string' && first.startsWith('{"event"')) {
      const d = new Date();
      first = `{"t":"${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}",${first.slice(1)}`;
    }
    write(first, ...rest);
  };
}

const PORT = Number(process.env.PORT ?? 8787);
const DIST = process.env.PUNTO_DIST ?? new URL('../dist', import.meta.url).pathname;
const PUBLISHED = process.env.PUNTO_PUBLISHED === '1';
const VISITOR_HOURLY = Number(process.env.PUNTO_VISITOR_HOURLY ?? 150);
const CODER_DAILY = Number(process.env.PUNTO_CODER_DAILY ?? 400);
const MODEL = process.env.PUNTO_MODEL ?? 'gemini-3.8-flash';

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.PUNTO_PROJECT ?? 'punto-vr',
  location: 'global', // Gemini 3.x on Vertex answers only in `global`
});

// Vertex now and then answers in 17-170 s instead of 1-5 (seen 12.11). A hedged call: if the
// first try has not answered after `hedge` ms, a second one starts; the first answer wins, the
// other is cancelled; both give up after `limit` ms. (A cancelled call is still billed.)
// The second call is off unless PUNTO_HEDGE=1 (Yury, 14.11: every slow director call was paid twice).
const HEDGE = process.env.PUNTO_HEDGE === '1';
async function quick(call, limit, hedge = 2500) {
  if (!HEDGE) return call(AbortSignal.timeout(limit));
  const tries = [new AbortController(), new AbortController()];
  const attempt = (i) => call(AbortSignal.any([tries[i].signal, AbortSignal.timeout(limit)]));
  const first = attempt(0);
  const late = new Promise((resolve) => setTimeout(resolve, hedge)).then(() => {
    console.warn(JSON.stringify({ event: 'slow', hedge }));
    return attempt(1);
  });
  try {
    return await Promise.any([first, late]);
  } catch (error) {
    throw error.errors?.[0] ?? error;
  } finally {
    for (const one of tries) one.abort();
  }
}

// key -> owner name
const keys = new Map(
  (process.env.PUNTO_KEYS ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => pair.split(':'))
    .map(([owner, key]) => [key, owner]),
);
// "owner:<name>" | "visitor:<address>" | "coder" -> { period, calls }
const usage = new Map();

/** Counts one more call for `who` in the current period (an hour or a day); false when it is over `limit`.
 *  Said once in the log: every call after it is refused, and from the outside that looked like a hang (14.11). */
function counted(who, limit, periodMs) {
  const period = Math.floor(Date.now() / periodMs);
  const used = usage.get(who);
  const calls = used?.period === period ? used.calls + 1 : 1;
  usage.set(who, { period, calls });
  if (calls === limit + 1) console.warn(JSON.stringify({ event: 'limit', who, limit, until: new Date((period + 1) * periodMs).toISOString() }));
  return calls <= limit;
}

// The /api calls that go to Google (Gemini, Chirp): only these are counted. /say counts itself, and only
// when the line is not synthesised yet: a line said before costs nothing.
const PAID = new Set(['/hear', '/talk', '/plan', '/direct', '/make', '/change', '/repair']);

/** One more paid call from this visitor this hour; false when they are over. Nothing is counted on a laptop. */
function paidOk(req) {
  return !PUBLISHED || counted(`visitor:${visitorOf(req)}`, VISITOR_HOURLY, 3_600_000);
}

function guard(req, res, next) {
  // the tablet's pictures load as plain images, which send no headers: they are not secret
  if (req.method === 'GET' && /^\/library\/[\w-]+\/thumb$/.test(req.path)) return next();
  const owner = keys.get(req.get('x-punto-key') ?? '');
  if (!owner) return res.status(401).json({ error: 'no key' });
  if (PAID.has(req.path) && !paidOk(req)) return res.status(429).json({ error: 'too many calls this hour' });
  req.owner = owner;
  req.session = sessionOf(req);
  next();
}

/** One more coder run for everybody today; false (and the 429 answer sent) when the day's runs are used up. */
function coderToday(answer) {
  if (!PUBLISHED || counted('coder', CODER_DAILY, 86_400_000)) return true;
  answer.fail(429, 'the coder has done enough for today');
  return false;
}

/** The visitor's address. Behind the Cloudflare Worker (edge/worker.mjs) it is the Worker's
 *  x-punto-visitor: requests from a Worker reach Cloud Run from Cloudflare's address. Without the
 *  Worker, the last X-Forwarded-For entry (the one Google's front end added; earlier ones the visitor can write). */
function visitorOf(req) {
  return (EDGE_SECRET && req.get('x-punto-visitor')) || String(req.get('x-forwarded-for') ?? '').split(',').pop().trim() || req.socket.remoteAddress;
}

const app = express();
// With PUNTO_EDGE_SECRET only the Worker in front (edge/worker.mjs) is answered: whoever finds the
// service's own run.app address gets 403, and cannot write x-punto-visitor themselves.
const EDGE_SECRET = process.env.PUNTO_EDGE_SECRET ?? '';
if (EDGE_SECRET) {
  app.use((req, res, next) => (req.get('x-punto-edge') === EDGE_SECRET ? next() : res.status(403).end()));
}
app.use('/api', express.json({ limit: '1mb' }), guard);

// Speech -> text. Body: { audio: base64, mime: 'audio/webm' }. Reply: { text, ms }.
app.post('/api/hear', async (req, res) => {
  const { audio, mime = 'audio/webm' } = req.body ?? {};
  if (typeof audio !== 'string' || !audio) return res.status(400).json({ error: 'no audio' });
  const started = Date.now();
  try {
    const reply = await quick((abortSignal) => ai.models.generateContent({
      model: MODEL,
      config: { abortSignal },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mime, data: audio } },
          { text: 'Write down exactly what is said, in the language it is said. Reply with the words only; if nothing is said, reply with nothing.' },
        ],
      }],
    }), 10_000);
    const text = (reply.text ?? '').trim();
    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: 'hear', owner: req.owner, ms, text: text.slice(0, 200) }));
    res.json({ text, ms });
  } catch (error) {
    console.error(JSON.stringify({ event: 'hear.error', owner: req.owner, error: String(error).slice(0, 500) }));
    res.status(502).json({ error: 'speech service failed' });
  }
});

// Text -> Punto's voice. Body: { text }. Reply: { audio: base64 WAV (24 kHz mono) }.
// The same line is synthesised once: the demo's lines come back at once.
const VOICE = process.env.PUNTO_VOICE ?? 'Puck';
// GA models (Vertex model list, 12.11): gemini-3.8-flash-lite-tts 2.6 s, gemini-3.8-flash-tts 4.4 s
// for 10 s of speech; both answer WAV in `global`.
const TTS_MODEL = process.env.PUNTO_TTS ?? 'gemini-3.8-flash-lite-tts';
const spoken = new Map(); // text -> Promise<base64>
// 400 characters (the longest line) take 5-7 s to synthesise; the page gives up a little later (src/speak.ts)
const SAY_LIMIT_MS = Number(process.env.PUNTO_SAY_LIMIT_MS ?? 20_000);

app.post('/api/say', async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 400) return res.status(400).json({ error: 'text: 1-400 characters' });
  const started = Date.now();
  let audio = spoken.get(text);
  if (!audio) {
    if (!paidOk(req)) return res.status(429).json({ error: 'too many calls this hour' });
    // At most SAY_LIMIT_MS: a call that never answered stayed in `spoken`, and the same line then
    // hung for everyone, Punto's build with it (audit item 6). A timeout fails it, and a failed line
    // leaves the cache below.
    audio = quick(
      (abortSignal) =>
        ai.models.generateContent({
          model: TTS_MODEL,
          // just the line: Gemini 3.8 TTS reads a style prompt aloud (checked 12.11)
          contents: text,
          config: { abortSignal, responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
        }),
      SAY_LIMIT_MS,
    ).then((reply) => reply.candidates[0].content.parts[0].inlineData.data);
    spoken.set(text, audio);
    if (spoken.size > 300) spoken.delete(spoken.keys().next().value);
  }
  try {
    const data = await audio;
    console.log(JSON.stringify({ event: 'say', owner: req.owner, ms: Date.now() - started, text: text.slice(0, 120) }));
    res.json({ audio: data });
  } catch (error) {
    spoken.delete(text);
    console.error(JSON.stringify({ event: 'say.error', owner: req.owner, error: String(error).slice(0, 500) }));
    res.status(502).json({ error: 'voice service failed' });
  }
});

// The director: a phrase -> what Punto does. Body: { text }. Reply: { action, kind, place, …, reply, ms }.
//   make:  something new for the coder to write (/api/make)
//   clear: take away what Punto has made (the blaster, the planets, the ball)
//   chat:  just an answer
// Structured output: the model can only answer in this shape. No ready spells since 15.11 (Yury: «их нужно убрать
// как готовые, они выглядят неестественно и однообразно»): the coder writes everything, and the page is told
// `spell: 'none'` (see decide).
// Picking from a short list: Flash-Lite answers in ~0.7 s, Flash 3.8 in 4-11 s (12.11, 3 calls each).
const DIRECTOR_MODEL = process.env.PUNTO_DIRECTOR_MODEL ?? 'gemini-3.5-flash-lite';
const DIRECTOR = `You are the director inside Punto, a mixed reality app: the player speaks, and
Punto, a small friendly robot, creates things right in the player's real room.
Decide what the player's phrase asks for, whatever the words or language:
- action "clear" when it asks to take things away: clean up, clear the scene, remove or hide
  the blaster, put things away, start over.
- action "make" when it asks to create something new: a different thing, game or scene — also when the player
  wants Punto itself to break, smash, punch or open up a wall of the room. A phrase that asks to
  build but names nothing to build («построй», «сделай вот это», «так, построй передо мной») is "chat", and the
  reply asks in a few words what to build — never a guess.
- action "move" when a creation is in the room and the phrase only wants it on another real surface, nothing
  else about it changed: «на другой стол», «перенеси на тот стол», «поставь на комод», «на другую стену», «повесь
  на ту стену», «на пол», "move it to the other table". Punto moves it at once, without writing code. surface: the
  kind named — "table" for a table, a chest of drawers or a shelf, "wall", "floor". A phrase that moves it AND
  changes it («на другой стол и сделай больше») is "change". Shifting it on the same surface — «левее», «правее»,
  «выше», «ниже», «подвинь влево», «чуть ближе», «ещё» after one of these — is "change" with place "none": the
  coder moves it along the surface it is on.
- action "change" when a creation is already in the room and the phrase asks to alter THAT creation:
  "it", "this", make it faster / bigger / blue, add something to it, give it physics, fix it. A complaint about
  the creation is "change" too: when the player says it does not work as they expect — they cannot grab or move it,
  it does not react, falls through, is too small to see, broke — the creation has a bug, and the change is to fix
  exactly that («не могу его лучом двигать» → make it movable with the ray). A phrase that
  names a different thing to create is "make", and so is any such phrase when the room has no creation.
  Something for the player to use WITH the creation in the room is "change" too, never "make": drumsticks for the
  drums, mallets for the xylophone, a ball for the hoop, a bow for the targets, a bat for the ball, a pickaxe to
  break its blocks, a gun to shoot its zombies («дай палочки», «положи мне в руки палочки» while drums stand
  there). So is more of something in it or around it: «пусть здесь ещё летают корабли», «и зомби», «добавь …»,
  «здесь …» — the creation stays, the new part joins it.
  But a phrase that names a whole new thing, game, place or world of its own — one that has nothing to do with the
  creation in the room and would stand alone without it — is "make", whatever verb it starts with («дай», «поставь»,
  «повесь», «открой», «сделай вокруг меня»): an underwater world while a lamp stands there, a basketball hoop while a
  house stands there, portals with zombies while a laser pointer is in the hand. When unsure, ask yourself: does the
  new part USE or EXTEND what is there? Only then "change". A bare name of a thing with no verb about the one there
  («атом железа», «куб», «солнечная система», "a dragon") is always "make": it replaces what stands, even when it is
  on the same subject (18.11: «атом железа» after a hydrolysis was taken for a change, and the atom was grafted onto it).
  small, for "change": true when the change only recolours it, makes it bigger or smaller, faster or slower, or
  shifts it on its surface («перекрась в синий», «сделай больше», «помедленнее», «левее») — nothing new is added
  and nothing is fixed; false for everything else.
  quick, for "make": true when it asks for ONE thing to look at that stands still or only turns — a cube, a vase, a
  molecule, a planet, a crystal, a chess piece — with no game, no controls to use, nothing that walks, flies, shoots
  or reacts, and no place around the player; false for everything else.
- action "undo" when the player wants the creation back the way it was before the last change or
  before the last new thing: undo, go back, change it back, it was better before, the old one was
  better, «откати», «верни как было», «отмени», «было лучше». Only when the room has an earlier version;
  without one it is "chat", and the reply says there is nothing to go back to yet. Never for a complaint that
  something does not work after a change («после добавления ничего не бьёт», "now nothing works"): that is
  "change", fix exactly that — undo only when the player asks to go back.
- action "redo" when, after going back, the player wants the newer version again: redo, put the new
  one back, «верни обратно», «нет, новая была лучше». Only when the room has a later version; else "chat".
- action "save" when the player wants the creation in the room kept: save it, keep it, «сохрани», «запомни
  эту игру». Only when there is a creation; without one it is "chat".
- action "library" when the player wants to see what is saved: my games, my saved things, «покажи мои игры»,
  «что я сохранял», «открой библиотеку».
- Playing together with friends in other rooms (each player has a room of their own, with a code like «кот-42»):
  action "invite" when the player wants a friend to join: «позови друга», «пригласи», «давай играть вместе», "invite a friend".
  action "join" when the player wants to go to a friend: «подключись к Ане», «зайди к кот-42», «в гости к Юрию». who: the
  friend's nick or the room's code as said, a code as animal-number in Latin letters («кот сорок два» → "kot-42").
  action "letIn" when somebody knocks and the player says to let them in: «пусти», «впусти», «да, пусть заходит».
  action "notNow" for «не сейчас», «не пускай», «нет».
  action "leave" when the player wants to leave a friend's room: «выйди», «домой», «уйти из гостей».
  action "name" when the player says their name: «меня зовут Юрий», "my name is Ann". who: the name.
- action "chat" for anything else (a question, a greeting).
title, for "make" and "save": a short name of the thing for its card on the tablet (2-4 words, the player's
language, no verb: «Башня из кубиков», "Red cube"). Name it by what it is, never by a brand, a game, a film or
a real person, even when the player said one: «Мир из кубиков», not the game's name.
reply: what Punto says back about what will really happen, one short cheerful line, at most 12 words, in the SAME language as the
player's phrase (a Russian phrase gets a Russian reply, an English one an English reply). In Russian his name is «Пунто» (never
«Пункто»), and he speaks of himself in the masculine.
For "make", say that Punto is starting to build it; for "change", that Punto is changing it; for "undo"
and "redo", that Punto puts that version back — in the player's language like every reply ("undo" in English
gets an English reply).
Take the phrase literally: decide by what the player's words ask for, never by what the named thing
usually is or could grow into, and never make the request bigger than it was said.
kind, for "make" and "change": "thing" when it asks for an object to look at and handle (a DNA molecule, a planet,
a solar system, a car, a flower, a model of anything); "game" only when the words ask to play (shoot, catch, score,
race, a puzzle to solve) — naming a game alone is not asking to play it
(«полотно для тетриса», «a chess board», «a dartboard» are things: the board itself, nothing to play yet). A gun,
blaster, laser or ray gun for the player's own hand is a "game" too (it shoots), and so is a wall for Punto to
break; "place" when it asks for a habitat, a world or weather to be in — an aquarium, a forest,
a jungle, the ocean, space, snow, rain, a zoo — rather than one object to hold; otherwise "none".
place, for "make" and "change": "pointed" when the thing belongs on a spot of the real room that the player
should choose — something to hang on or put against a wall, set on the floor or on a table (a picture, a poster,
a clock, a mirror, a shelf, a window, a dartboard, a target, a plant pot, a lamp), or when the phrase says where
by pointing: here, there, this wall, that table, «сюда», «на эту стену», «вот туда»; for "change" only when the
phrase changes the thing and also moves it to a new spot (only moving it is "move"), never for a change of the thing
itself where it is («за окном должен быть мир», «make it bigger», «add a frame»). Otherwise "none": a thing in the air in front of the player, a place,
a game that sets itself up, any other action.
surface, for place "pointed": the kind of real surface the phrase names or the thing belongs on — "wall"
(a picture, a clock, «на стену»), "table" («на столе», «на стол», a city model, a board game, a vase), "floor"
(a rug, «на пол»); "any" when it does not say and it could go anywhere; "any" for every other action.
Think of how the thing stands: something that lies or spreads out flat — a game world or level, a block world, a
board, a city, a track, a maze, a sandbox, a rug — belongs on a floor or a table even when the player points at a
wall (it is then put down at the foot of that wall), so it is "floor" (or "table" when it is small); only what
hangs flat against a wall is "wall". When "change" moves the creation, think of the creation the room has.
model, for "make": when the request is built around one recognisable object or creature that a
library of ready 3D models would have (a dragon, a cat, a guitar, a sports car, a castle, a horse),
the search words for it: one or two plain English nouns. Never a brand, a product name, a film or game
character or a real person: give the generic thing instead ("sports car", "dragon", "guitar").
Models are for what cannot be drawn from simple shapes: creatures, characters, plants, vehicles,
instruments, furniture. Sports and game equipment — a hoop, a goal, a target, a ball, a bat, a ramp,
blocks, a board — is built in code, where every part sits exactly: "none".
For a "place", search for its main inhabitant ("fish" for an aquarium, "bird" for a forest).
In a game, a weapon or tool the player holds (a pistol, a sword, a bow, a guitar) or its heroes and enemies
(spaceships, a dragon, monsters) are such objects too: the search words for the one that matters most
(«дай пистолет, сбиваю банки» → "pistol", «бластер» → "blaster"); the targets and the rest are built in code.
People of any kind — a zombie, a knight, a pirate, a soldier, a crowd, a robot that walks like a man — are
ready figures the coder has in code: "none".
"none" when the thing is abstract, geometric or better drawn in code (a cube, a ball, a DNA
molecule, planets, fireworks, a fountain), and for every other action.
plain, for "make" with a model: true when the phrase only names the thing and asks nothing more of
it — «динозавр», "a cat", "give me a sports car", «хочу гитару». false when it says what the thing
does, how it should look beyond its name, where it is, or asks for more than that one thing (a dinosaur
that walks around the room and roars, a red car with open doors, a cat on a skateboard, three dogs, a
zoo), when the player asks Punto to draw or build it itself, for a "game" or a "place" (their model is one piece
of them, never the whole), and for everything else.`;

// What the coder is told besides the phrase itself (the director's short note).
const NOTES = {
  thing: 'This is a thing to look at and handle, not a game: no score, no enemies. It works the way the real one does: exactly what was asked, nothing added on top. ' +
    'Something played or operated with the hands (an instrument, a panel) is no such thing: place it yourself within ' +
    'reach at hand height and give it no grab component. Anything else: ' +
    'make it takeable yourself (the host does not carry things, 18.11): its root entity gets RayInteractable + ' +
    'DistanceGrabbable ({ movementMode: MovementMode.MoveFromTarget }) — it rides on the ray, both hands\' rays stretch it. ' +
    'Parts the player asks to take in the hand (each planet, each atom): each its own entity with the same two ' +
    'components, made under the entity of the group it really sits in (a planet under its orbit group\'s entity, that ' +
    'one under the thing), never re-hung elsewhere; your motion leaves a Grabbed one alone. ' +
    'A big one stands in the room where it belongs.',
  place: 'This is a place to be in, not an object: the player\'s own room becomes it. No box, tank, dome or model of the place. ' +
    'Put its inhabitants and elements into the room around the seated player (within about 2 m): what stands (a house, ' +
    'a tree, a well, a walker) stands on the real floor (y = 0) or on real furniture (the room helpers), all on its ground; ' +
    'only what flies or swims (birds, fish, clouds) is in the air, from 0.3 to 2 m high: ' +
    'they move on their own, pass close by the player, and nothing is grabbed as a whole. No score.',
  game: 'This is a game: play it with bare hands only, using the controls in the knowledge.',
};
// The player shows the spot with the ray while the coder writes (src/place.ts).
// CODER_PROMPT=bare (Yury, 18.11, tools/coder-prompt-bare.mjs): the coder on IWSDK alone — no ready models, no topics,
// no replayed library games. The coder process gets the variable itself.
const BARE = process.env.CODER_PROMPT === 'bare';
const QUICK_MODEL = process.env.PUNTO_QUICK_MODEL ?? '';
const MODEL_OF_CODER = () => process.env.CODER_MODEL ?? 'gemini-4-hydrogen';
// (the bare coder has the room helpers since 18.11, so it takes the pointed spot the same way)
const POINTED = ' The player is pointing at the spot for it with the ray right now. Take that spot in the code: ' +
  "`const spot = await wantedPlace(world);` (import { wantedPlace } from '../place.js'; the setup is async) and put the " +
  'thing there as the knowledge shows (room.md, "Where the player wants it"). Do not look for walls, tables or floors yourself.';
const DIRECTION = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING', enum: ['clear', 'make', 'change', 'move', 'undo', 'redo', 'save', 'library', 'invite', 'join', 'letIn', 'notNow', 'leave', 'name', 'chat'] },
    title: { type: 'STRING' },
    who: { type: 'STRING' },
    kind: { type: 'STRING', enum: ['thing', 'game', 'place', 'none'] },
    place: { type: 'STRING', enum: ['pointed', 'none'] },
    surface: { type: 'STRING', enum: ['wall', 'table', 'floor', 'any'] },
    model: { type: 'STRING' },
    plain: { type: 'BOOLEAN' },
    small: { type: 'BOOLEAN' },
    quick: { type: 'BOOLEAN' },
    reply: { type: 'STRING' },
  },
  required: ['action', 'kind', 'place', 'surface', 'model', 'plain', 'reply'],
};

/** The director's decision on a phrase (hedged; gives up after 8 s). `spell: 'none'` is for the page, which
 *  still knows the ready spells' names (src/features/punto.ts) and is never sent one. */
// No director (Yury, 18.11: «убери режиссёра, пусть сразу только кодер, он всё делает»; PUNTO_NO_DIRECTOR=1): no model
// before the coder. Clearing and going back are words; everything else is the coder's, with the file of what stands in
// the room — it changes that file or writes a new one itself (see the note in /api/make).
const NO_DIRECTOR = process.env.PUNTO_NO_DIRECTOR === '1';
// A change only when the phrase is plainly about what stands (Yury, 18.11: «пусть с потолка падают большие фигуры
// тетриса из стекла» was meant as another game, and went as a change of the wall board); everything else is a new thing.
const ABOUT_IT = /(^|\s)(дай|дайте|положи|вложи|в руки|добавь|добавить|сделай (его|её|ее|это|их|всё|все|так)|поменяй|измени|исправь|почини|убери |удали |замени|перекрась|покрась|верни |больше|меньше|быстрее|медленнее|выше|ниже|ярче|темнее|ещё|еще|тоже|пусть (он|она|оно|они)|его |её |ее |их |этот|эта|это |эти|add|make it|change|fix|remove|bigger|smaller|faster|slower|more|too|it |this )/;
const aboutIt = (t) => ABOUT_IT.test(` ${t} `);

function wordsOnly(text, session) {
  const t = String(text).toLowerCase();
  const ru = /[а-яё]/.test(t);
  const action = /^(очист\S*|удали\S*|убер\S*|сотри|clear|remove|delete)[\s\p{P}]*(всё|все|это|его|её|it|all|everything)?[\s\p{P}]*$/u.test(t.trim()) ? 'clear'
    : /(откат|верни как было|отмени|было лучше|undo|go back)/.test(t) ? 'undo'
    : /(верни обратно|redo)/.test(t) ? 'redo'
    // something stands: a change — the page keeps it in sight until the new version comes (18.11: as a make it
    // vanished for the whole build); the coder writes a new file itself when the phrase asks for something else
    // a lone filler word (Live sends «Теперь» on its own now and then) goes to no coder (18.11: it replaced the scene)
    : /^[\s\p{P}]*(теперь|да|нет|ну|так|окей|ок|хорошо|давай|ага|ладно|now|yes|no|ok|okay|so|well)[\s\p{P}]*$/u.test(t) ? 'chat'
    // something stands: always a change, and the coder decides (Yury, 18.11: «почему всё время пропадает модель… мы
    // теряем фишку» — the word rule took «теперь пусть с Земли ракета на Марс летит» for a new thing and the solar
    // system went); the scene grows phrase by phrase
    : session?.current ? 'change'
    : 'make';
  const reply = action === 'clear' ? (ru ? 'Убираю!' : 'Clearing!') : action === 'make' || action === 'change' ? (ru ? 'Делаю!' : 'On it!') : '';
  // the place is words too (Yury, 18.11: «почему стол не выделился изначально, как раньше»): the director used to say
  // it, and the page chose and lit the table looked at the moment the phrase came — without it the board picked a table
  // only when the code loaded, and the village stood by the table's side
  const surface = /(на стол|на столе|столик|table)/.test(t) ? 'table' : /(на стен|на стене|wall)/.test(t) ? 'wall' : /(на пол|на полу|floor)/.test(t) ? 'floor' : 'any';
  const place = (action === 'make' || action === 'change') && surface !== 'any' ? 'pointed' : 'none';
  return { action, kind: 'none', place, surface, model: 'none', plain: false, reply, quick: false, small: false, title: String(text).slice(0, 40) };
}

async function decide(text, session) {
  const direction = { ...backAndForth(NO_DIRECTOR ? wordsOnly(text, session) : await decideOnce(text, session), session, text), spell: 'none' };
  // his name as it is spelt: Flash-Lite writes «Пункто» now and then, asked or not (15.11)
  if (typeof direction.reply === 'string') direction.reply = direction.reply.replace(/Пункто/g, 'Пунто');
  if (direction.action === 'change' && !session.current) direction.action = 'make';
  if (direction.action === 'move' && !session.current) direction.action = 'chat';
  // quick only means something where a fast model writes it: elsewhere the page keeps its plan on the tablet
  if (!QUICK_MODEL || direction.action !== 'make') direction.quick = false;
  // No plan on the tablet (Yury, 18.11: «убрать планшет … лишний вызов модели не делал»): the code itself starts at
  // once, so Punto just types. PUNTO_SKETCH=1 brings the tablet back.
  direction.sketch = process.env.PUNTO_SKETCH === '1';
  // the coder in use, for the page to show beside its clock (Yury, 18.11: «пусть пишет модель, какая подключена»)
  direction.coder = process.env.CODER_BACKEND === 'openrouter' ? process.env.CODER_OR_MODEL ?? 'deepseek/deepseek-v4-flash-0731'
    : process.env.CODER_BACKEND === 'deepseek' ? `deepseek ${process.env.CODER_DS_MODEL ?? 'deepseek-flash'}`
    : `${MODEL_OF_CODER()}${process.env.CODER_PRIORITY === '1' ? ' · priority' : ''} (Vertex)`;
  return direction;
}

/**
 * "Undo" and "redo" (14.11): a version the player had comes back at once, without the coder. The page
 * knows no such actions: it hears "change", asks /api/change with the same phrase, and gets the old
 * version back the way it gets a changed one (the ghost, the player's moves kept). `step` is what
 * /api/change will do. With no version that way the director's answer becomes a plain "chat".
 */
// Going back only when the player asked to go back: Flash-Lite took complaints for an undo even with the rule in its
// instruction (16.11, twice: «после добавления ничего не было», «банки пропали … стрелял из центра»). Without one of
// these words it is a change: the complaint is fixed.
const ASKED_BACK = /откат|верни|вернуть|отмен|как было|было лучше|назад|обратно|undo|redo|go back|revert|put .* back|was better|change it back/i;
function backAndForth(direction, session, said = '') {
  if (direction.action === 'save' && !session.current) return { ...direction, action: 'chat' };
  if (direction.action !== 'undo' && direction.action !== 'redo') return direction;
  if (said && !ASKED_BACK.test(said)) {
    console.log(`[direct] "${direction.action}" without words for it — a change: ${said.slice(0, 80)}`);
    return { ...direction, action: 'change', model: 'none' };
  }
  const to = session.at + (direction.action === 'undo' ? -1 : 1);
  if (!session.current || to < 0 || to >= session.versions.length) return { ...direction, action: 'chat', step: direction.action };
  return { ...direction, action: 'change', step: direction.action, place: 'none', model: 'none' };
}

async function decideOnce(text, session) {
  const { current, versions, at } = session;
  const room = current
    ? `The creation in the room now was made from: "${current.phrase}"\n` +
      `Earlier versions to go back to: ${Math.max(0, at)}. Later versions to go forward to: ${Math.max(0, versions.length - 1 - at)}.`
    : 'There is no creation in the room yet.';
  // PUNTO_DIRECTOR_OR (18.11, Yury: «бери его, переведи на OpenRouter»): the same model through OpenRouter — our Vertex
  // queue held the director 8 s and the request failed with 502
  if (process.env.PUNTO_DIRECTOR_OR && process.env.OPENROUTER_API_KEY) {
    const lower = (node) => Array.isArray(node) ? node.map(lower)
      : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === 'type' ? String(v).toLowerCase() : lower(v)]))
      : node;
    const answer = await quick(async (signal) => {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.PUNTO_DIRECTOR_OR,
          messages: [{ role: 'system', content: DIRECTOR }, { role: 'user', content: `${room}\nThe player said: "${text}"` }],
          response_format: { type: 'json_schema', json_schema: { name: 'direction', strict: false, schema: lower(DIRECTION) } },
          reasoning: /anthropic\//.test(process.env.PUNTO_DIRECTOR_OR) ? { enabled: false } : { effort: 'low' },
          max_tokens: 2000,
        }),
      });
      if (!response.ok) throw new Error(`openrouter director ${response.status}: ${(await response.text()).slice(0, 300)}`);
      return response.json();
    }, 8_000, 3000);
    const content = answer.choices?.[0]?.message?.content ?? '';
    return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
  }
  const reply = await quick((abortSignal) => ai.models.generateContent({
    model: DIRECTOR_MODEL,
    contents: `${room}\nThe player said: "${text}"`,
    config: {
      abortSignal,
      systemInstruction: DIRECTOR,
      responseMimeType: 'application/json',
      responseSchema: DIRECTION,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  }), 8_000, 2000);
  return JSON.parse(reply.text);
}

// The plan Punto draws on his tablet while the coder writes (Yury, 15.11; polygon of 15.11, tools/blueprint.ts →
// src/blueprint.ts): Flash-Lite lays the thing out as 8-16 simple shapes in ~3 s. Only a picture for the player;
// the coder never gets it (given the plan, the coder built poorer things: a box of a racing car, 15.11).
const PLAN = `You draw, within two seconds, the plan of a 3D thing or a small game a player just asked for: a list of simple
shapes. The plan is drawn in the player's real room like a pencil blueprint while the thing is being coded, so it
shows the layout: the parts the thing is made of, their real proportions and places.
- Real size in metres, as the thing would stand in a room (a toy windmill on a table ~0.5 m tall, a car model ~0.4 m long,
  a game board on a table ~0.6 m across, targets on a wall ~0.3 m each).
- Coordinates: x right, y up, z toward the player; the base centre of the whole thing is at 0,0,0.
- 8 to 16 parts, in the order a builder puts them up: the base or the biggest part first, then the other big parts, then
  the details that make it recognisable (sails, towers, wheels, windows, a gate).
- Many alike pieces (blocks, bricks, targets, trees, wheels): one part with count and step (the offset from one to the next).
- A game: its board or field and its pieces where they stand at the start; no rules.
- size: box — width, height, depth; cylinder and cone — diameter, height, diameter; sphere — diameter ×3;
  torus — outer diameter, tube thickness, outer diameter. turn: rotation in degrees about x, y, z.`;
const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    surface: { type: 'STRING', enum: ['floor', 'table', 'wall', 'air'] },
    parts: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      name: { type: 'STRING' }, shape: { type: 'STRING', enum: ['box', 'cylinder', 'cone', 'sphere', 'torus'] },
      size: { type: 'ARRAY', items: { type: 'NUMBER' } }, at: { type: 'ARRAY', items: { type: 'NUMBER' } },
      turn: { type: 'ARRAY', items: { type: 'NUMBER' } }, color: { type: 'STRING' },
      count: { type: 'INTEGER' }, step: { type: 'ARRAY', items: { type: 'NUMBER' } } },
      required: ['name', 'shape', 'size', 'at'], propertyOrdering: ['name', 'shape', 'size', 'at', 'turn', 'color', 'count', 'step'] } },
  },
  required: ['surface', 'parts'], propertyOrdering: ['surface', 'parts'],
};
app.post('/api/plan', async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 1000) return res.status(400).json({ error: 'text: 1-1000 characters' });
  const started = Date.now();
  try {
    const reply = await quick((abortSignal) => ai.models.generateContent({
      model: DIRECTOR_MODEL,
      contents: `The player said: «${text}»`,
      config: { abortSignal, systemInstruction: PLAN, responseMimeType: 'application/json', responseSchema: PLAN_SCHEMA, thinkingConfig: { thinkingLevel: 'low' } },
    }), 8_000, 4_000);
    const plan = JSON.parse(reply.text);
    const parts = (plan.parts ?? []).filter((p) => Array.isArray(p.size) && Array.isArray(p.at)).slice(0, 24);
    console.log(JSON.stringify({ event: 'plan', owner: req.owner, ms: Date.now() - started, parts: parts.length, tokens: reply.usageMetadata?.totalTokenCount }));
    res.json({ surface: plan.surface, parts, ms: Date.now() - started });
  } catch (error) {
    console.error(JSON.stringify({ event: 'plan.error', owner: req.owner, error: String(error).slice(0, 300) }));
    res.status(502).json({ error: 'no plan' });
  }
});

app.post('/api/direct', async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) return res.status(400).json({ error: "text: 1-4000 characters" });
  const started = Date.now();
  try {
    // a kept file played back (see replayOf): nothing for the director to decide
    const replay = replayOf(text);
    const direction = replay
      ? { action: 'make', spell: 'none', kind: 'thing', model: 'none', place: replay.pointed ? 'pointed' : 'none', surface: 'any', reply: '' }
      : await decide(text, req.session);
    if (direction.action === 'make' || direction.action === 'change') req.session.wanted = { phrase: text, model: direction.model, plain: direction.plain === true, small: direction.small === true, quick: direction.quick === true, step: direction.step };
    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: 'direct', owner: req.owner, ms, text: text.slice(0, 200), ...direction }));
    res.json({ ...direction, ms });
  } catch (error) {
    console.error(JSON.stringify({ event: 'direct.error', owner: req.owner, error: String(error).slice(0, 500) }));
    res.status(502).json({ error: 'director failed' });
  }
});

// Speech -> text with Cloud Speech-to-Text, model Chirp 3 (region eu): 0.7-0.8 s and exact on
// short Russian and English phrases, where Gemini Flash-Lite heard "Убери бластер" as
// "Give me a blaster" (12.11). Languages: Russian and English, detected per phrase.
const SPEECH = 'https://eu-speech.googleapis.com/v2/projects/' + (process.env.PUNTO_PROJECT ?? 'punto-vr') + '/locations/eu/recognizers/_:recognize';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
async function hearText(audio) {
  const token = await auth.getAccessToken();
  const answer = await quick(async (signal) => {
    const response = await fetch(SPEECH, {
      method: 'POST',
      signal,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ config: { autoDecodingConfig: {}, model: 'chirp_3', languageCodes: ['ru-RU', 'en-US'] }, content: audio }),
    });
    if (!response.ok) throw new Error(`speech ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.json();
  }, 8_000, 2000);
  return (answer.results ?? []).map((result) => result.alternatives?.[0]?.transcript ?? '').join(' ').trim();
}

// Every phrase is kept in logs/heard/ (not in git), named by the time and what was heard, so an
// empty or wrong recognition can be listened to: <time>-<words or NOTHING>.webm (13.11).
const HEARD = new URL('../logs/heard/', import.meta.url).pathname;
function keepRecording(audio, said) {
  try {
    mkdirSync(HEARD, { recursive: true });
    const words = said.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'NOTHING';
    writeFileSync(`${HEARD}${new Date().toISOString().replace(/[:.]/g, '-')}-${words}.webm`, Buffer.from(audio, 'base64'));
  } catch (error) {
    console.error(JSON.stringify({ event: 'heard.keep.error', error: String(error).slice(0, 200) }));
  }
}

// Speech straight to a decision: Chirp 3 hears, the director decides. Body: { audio: base64, mime }.
// Reply: { said, action, spell, reply, ms }.
app.post('/api/talk', async (req, res) => {
  const { audio } = req.body ?? {};
  if (typeof audio !== 'string' || !audio) return res.status(400).json({ error: 'no audio' });
  const started = Date.now();
  try {
    const said = await hearText(audio);
    const heard = Date.now() - started;
    keepRecording(audio, said);
    const direction = said ? await decide(said, req.session) : { action: 'chat', spell: 'none', reply: '' };
    if (direction.action === 'make' || direction.action === 'change') req.session.wanted = { phrase: said, model: direction.model, plain: direction.plain === true, small: direction.small === true, quick: direction.quick === true, step: direction.step };
    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: 'talk', owner: req.owner, kb: Math.round((audio.length * 3) / 4 / 1024), heardMs: heard, ms, said, ...direction }));
    res.json({ said, ...direction, ms });
  } catch (error) {
    console.error(JSON.stringify({ event: 'talk.error', owner: req.owner, error: String(error).slice(0, 500) }));
    res.status(502).json({ error: 'talk failed' });
  }
});

// The live coder (tools/coder.mjs, Gemini Flash): a phrase -> a new game file. It is written
// aside (src/_gen), type-checked and repaired there. While developing, a clean file moves into
// src/features/, where the dev server loads it into the running scene. On the published site
// (PUNTO_PUBLISHED=1) there is no dev server: the answer carries the file compiled to a string
// (tools/compile.mjs) and the page runs it (src/remote.ts); nothing goes into src/features.
const ROOT = new URL('..', import.meta.url).pathname;
const FEATURES = `${ROOT}src/features`;
// Punto's tablet: saved games and models, live games (server/library.mjs). A saved game is the
// creation the server made for this player, never code from the page.
const library = libraryRoutes(app, ROOT, (req) => req.session.current?.source);
const ASIDE = `${ROOT}src/_gen`;
// made file name -> what it was made from, for a repair
const madeFrom = new Map();

// ---- One player's state ----
// While developing there is one: every page shows the same files of src/features. On the published
// site every page has its own (the x-punto-session header, else the address), so one judge's
// "change it" never touches another's creation and one judge building does not keep another waiting.
//   making     the coder is at work for this player (one thing at a time)
//   wanted     the last phrase the director sent to the coder, and the model it asked to look for;
//              /api/make and /api/change get the same phrase from the page a moment later
//   current    the creation in the room: { name, phrase, note, models, source, prior, swapped, before }.
//              `prior` is the creation it replaces, kept until the page says the new one loaded
//              (/api/unmake { keep }); `swapped` means the prior file was moved aside (unused now);
//              `before` is the history as it was, put back if the new one fails to load
//   versions   every creation this player had, oldest first ({ name, phrase, note, models, source }),
//   at         and which one is in the room: "undo" goes one back, "redo" one forward (14.11)
const sessions = new Map();
const KEEP_VERSIONS = 20;
const SESSION_IDLE_MS = 6 * 3_600_000;

/** A room's game is changed by one player at a time (server/together.mjs): a second make or change waits for the
 *  first, up to 90 s, instead of being refused; false: still busy. */
async function freeOf(session) {
  for (const until = Date.now() + 90_000; session.making && Date.now() < until; ) await new Promise((resolve) => setTimeout(resolve, 300));
  if (session.making) return false;
  session.making = true; // taken at once: two waiting ones must not both go
  return true;
}

// A guest in a friend's room (server/together.mjs) makes and changes that room's game: the room owner's session.
let roomGameOf = () => undefined;
function sessionOf(req) {
  const mine = String(req.get('x-punto-session') ?? '').slice(0, 64);
  const host = PUBLISHED && req.get('x-punto-room') ? roomGameOf(req.get('x-punto-room'), req.owner, mine) : undefined;
  const id = host ? `${host.owner}/${host.session}` : PUBLISHED ? `${req.owner}/${mine || visitorOf(req)}` : 'dev';
  let session = sessions.get(id);
  if (!session) sessions.set(id, (session = { id, making: false, wanted: null, current: null, versions: [], at: -1 }));
  session.used = Date.now();
  return session;
}
setInterval(() => {
  for (const [id, session] of sessions) if (id !== 'dev' && !session.making && Date.now() - session.used > SESSION_IDLE_MS) sessions.delete(id);
}, 600_000).unref();

/** A made file's name; on the published site many players make things in the same second. */
const madeName = () => `made-${Date.now().toString(36)}${PUBLISHED ? Math.random().toString(36).slice(2, 6) : ''}`;

/** The new creation is in the room: it becomes the newest version (later ones, gone back from, are dropped). */
function addVersion(session, name, record) {
  const before = { versions: session.versions.slice(), at: session.at };
  session.versions.length = session.at + 1;
  session.versions.push({ name, ...record });
  if (session.versions.length > KEEP_VERSIONS) session.versions.shift();
  session.at = session.versions.length - 1;
  return before;
}

// A restart must not forget the creation in the room: its file is still in the scene, and the
// next "change it" would build a new thing from nothing instead (14.11). The newest made file is
// taken as the creation. What the player asked for is not known any more; the file tells the coder.
if (!PUBLISHED) {
  const made = existsSync(FEATURES) ? readdirSync(FEATURES).filter((file) => /^made-.*\.ts$/.test(file)).sort() : [];
  const name = made.pop()?.slice(0, -3);
  if (name) {
    const record = { phrase: 'the creation already in the room', note: '', source: readFileSync(`${FEATURES}/${name}.ts`, 'utf8') };
    madeFrom.set(name, record);
    const session = { id: 'dev', making: false, wanted: null, current: null, versions: [], at: -1, used: Date.now() };
    addVersion(session, name, record);
    session.current = { name, ...record, prior: null, swapped: false };
    sessions.set('dev', session);
    console.log(JSON.stringify({ event: 'adopt', name }));
  }
}

/** Keeps a copy of every file the coder wrote (logs/made/, not in git), to read later what it made. */
function keepCopy(name) {
  mkdirSync(`${ROOT}logs/made`, { recursive: true });
  if (existsSync(`${ASIDE}/${name}.ts`)) copyFileSync(`${ASIDE}/${name}.ts`, `${ROOT}logs/made/${name}.ts`);
}

/**
 * Runs the coder aside; resolves with whether the file came out clean and the coder's own timings.
 * `on(kind, value)`: the coder's answer while it comes (tools/coder.mjs, CODER_STREAM) —
 * 'start' (the model that answers), 'code' (the next piece of text), 'edits' (an answer by edits).
 */
async function runCoder(name, phrase, note, env = {}, on) {
  // the published service has no gcloud: the coder gets this server's own token
  const token = PUBLISHED ? { CODER_TOKEN: await auth.getAccessToken() } : {};
  mkdirSync(ASIDE, { recursive: true });
  const log = await new Promise((resolve, reject) => {
    const coder = spawn('node', ['tools/coder.mjs', name, phrase, note ?? ''], {
      cwd: ROOT,
      env: { CODER_THINKING: 'low', ...process.env, ...env, ...token, CODER_DIR: 'src/_gen', ...(on && { CODER_STREAM: '1' }) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const limit = setTimeout(() => coder.kill(), BARE ? 300_000 : 180_000); // Carbon thinking medium writes longer
    let out = '';
    let trouble = '';
    let pending = '';
    coder.stdout.setEncoding('utf8');
    coder.stdout.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const mark = line.match(/^@@(start|code|edits) (.*)$/);
        if (!mark) {
          out += `${line}\n`;
          // the stages the page shows (src/materialize.ts): the answer is in and checked now; the check found errors
          if (/^model /.test(line)) on?.('stage', 'written');
          else if (/^first attempt: \d+ type errors/.test(line)) on?.('stage', 'repair');
          else if (/^no answer in /.test(line)) on?.('stage', 'twin');
          continue;
        }
        try {
          on?.(mark[1], mark[1] === 'start' ? mark[2] : JSON.parse(mark[2]));
        } catch (error) {
          console.warn(JSON.stringify({ event: 'coder.stream.error', error: String(error).slice(0, 200) }));
        }
      }
    });
    coder.stderr.setEncoding('utf8');
    coder.stderr.on('data', (chunk) => (trouble += chunk));
    coder.on('error', (error) => {
      clearTimeout(limit);
      reject(error);
    });
    coder.on('close', (code, signal) => {
      clearTimeout(limit);
      if (code === 0) resolve(out + pending);
      else reject(new Error(trouble || `the coder ended with ${code ?? signal}`));
    });
  });
  keepCopy(name);
  return {
    clean: /(first attempt|after repair|after repair 2): clean\s*\n(?![\s\S]*after repair)/.test(log),
    // each model call, type errors after the first attempt, the total
    steps: log.split('\n').filter(Boolean).map((line) => line.replace(/ \{.*$/, '')),
  };
}

/** Picks the prompt topics a request needs (tools/coder-prompt.mjs, systemFor), or returns undefined on error (falls back to full prompt). */
const TOPIC_LIST = topicIndex();
const TOPIC_IDS = TOPIC_LIST.map((topic) => topic.id);
const TOPICS_PROMPT =
  'Pick ONLY the topic ids from this list that the coder needs to build the player\'s request in mixed reality. ' +
  'Return [] for a plain object with no special mechanics or catalog helpers (e.g. a red cube).\n' +
  TOPIC_LIST.map((topic) => `- ${topic.id}: ${topic.about}`).join('\n');

async function pickTopics(phrase, kind, basePhrase) {
  if (BARE) return [];
  const contents = basePhrase
    ? `Existing creation: "${basePhrase}"\nRequested change: "${phrase}"\nPick any additional topic ids needed for the change.`
    : `Kind: ${kind || 'thing'}\nThe player said: "${phrase}"`;
  const reply = await quick((abortSignal) => ai.models.generateContent({
    model: DIRECTOR_MODEL,
    contents,
    config: {
      abortSignal,
      systemInstruction: TOPICS_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { topics: { type: 'ARRAY', items: { type: 'STRING', enum: TOPIC_IDS } } },
        required: ['topics'],
      },
      thinkingConfig: { thinkingLevel: 'low' },
    },
  }), 4_000, 1500);
  return [...new Set((JSON.parse(reply.text).topics ?? []).filter((id) => TOPIC_IDS.includes(id)))];
}

/** The ready models for `query` (Poly Pizza, CC0, tools/models.mjs), found and downloaded before
 *  the coder starts: { found, note } — the models and the coder's note about them. Nothing asked
 *  for, nothing found or a failed search: no models and an empty note. */
async function readyModels(query, owner) {
  const none = { found: [], note: '' };
  // only our own models (Yury, 18.11: «убери вообще эти скачанные, оставь только наши»): no Poly Pizza files for the
  // bare coder — their axes and sizes are anyone's (a blaster held its barrel the wrong way)
  if (BARE) return none;
  if (!query || query === 'none') return none;
  const started = Date.now();
  const found = await searchModels(query, 3).catch((error) => {
    console.warn(JSON.stringify({ event: 'models.error', owner, query, error: String(error).slice(0, 200) }));
    return [];
  });
  console.log(JSON.stringify({ event: 'models', owner, query, ms: Date.now() - started, found: found.map((one) => one.file) }));
  if (!found.length) return none;
  const note = `\nReady models found for "${query}" (already downloaded; load and size one as in models.md, with fitModel` +
    ` and, when it has clips, animateModel):\n` + found.map(modelLine).join('\n') +
    `\nUse one only when its title really is what the player asked for; otherwise build the thing in code. ` +
    `A model may be only a piece of it: build what is missing in code.` + BARE_MODELS;
  return { found, note };
}

// The bare coder has no models.md (Yury, 18.11: models come back minimal): how to load one rides with the note, only
// when a model was found — nothing in the prompt otherwise.
const BARE_MODELS = !BARE ? '' : `\nmodels.md, briefly (import { AssetManager } from '@iwsdk/core'; fitModel, takePart, animateModel from '../models.js'):
\`await AssetManager.loadGLTF('./models/polypizza/<file>', 'id')\`, then \`const gltf = AssetManager.getGLTF('id')!\` — a fresh copy each
call; never \`scene.clone()\` or the object loadGLTF returns. \`fitModel(gltf.scene, { length })\`: the longest side
\`length\` m, origin at the bottom centre, front +Z; add it to your root group. Parts listed: take each you need with
\`takePart(gltf.scene, 'Name')\` BEFORE fitting the rest. Clips: \`animateModel(world, gltf).play('walk')\` (same gltf copy);
the clip moves the legs, you move the position.`;

const modelLine = (one) => `- ${one.file} — "${one.title}", ${one.tris} triangles` +
  (one.clips.length ? `, clips: ${one.clips.join(', ')}` : ', no animation') +
  (one.parts.length ? `, parts (separate things inside, see models.md): ${one.parts.join(', ')}` : '');

/** The coder's note when the model is already chosen (and the player is watching it being drawn, src/materialize.ts):
 *  this one model only, so what the page shows and what the coder builds are the same thing. */
const pickedNote = (one) => `\nThe ready model for this (already downloaded and chosen; the player is already watching it ` +
  `being drawn): load and size it as in models.md, with fitModel and, when it has clips, animateModel:\n${modelLine(one)}\n` +
  (one.metres ? `Its size: ${one.metres} m at its longest (fitModel length ${one.metres}): the player is watching it ` +
    `drawn at that size, so it must come at that size.\n` : '') +
  `Build the thing on this model. A model may be only a piece of it: build what is missing in code.` + BARE_MODELS;

// ---- A ready model, placed without the coder (14.11) ----
// «динозавр»: the coder took 12 s (7 of them silent) to write the 40 lines every ready model gets —
// load it, size it, put it before the player, let it be taken and stretched, play its idle clip.
// When the director says the phrase asks for the thing alone (`plain`) and a found model really is
// that thing, the host writes those lines itself. The file is an ordinary made file: it loads,
// is changed by the coder and repaired like any other.

/** The model among `found` that really is what the phrase asks for, or undefined (a search for
 *  "drone" brings a helicopter and a drill). One quick question to the director's model. */
async function pickModel(phrase, found) {
  const reply = await quick((abortSignal) => ai.models.generateContent({
    model: DIRECTOR_MODEL,
    contents: `The player said: "${phrase}"\nModels found:\n${found.map((one, index) => `${index}: "${one.title}"`).join('\n')}`,
    config: {
      abortSignal,
      systemInstruction: 'A player of a mixed reality app asked for a thing; a library search brought these 3D models. ' +
        'pick: the number of the model whose title really is that thing (a T-Rex is a dinosaur, a tabby is a cat); ' +
        '-1 when none of them is (a helicopter is not a drone, a drill is not a drone). ' +
        'metres: the longest size of that thing as the player would see it in their room (a person 1.75, a cat 0.5, ' +
        'a toy windmill 0.5, a car model 0.4, a horse 2.2).',
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { pick: { type: 'INTEGER' }, metres: { type: 'NUMBER' } }, required: ['pick', 'metres'] },
      thinkingConfig: { thinkingLevel: 'low' },
    },
  }), 6_000, 1500);
  const { pick, metres } = JSON.parse(reply.text);
  return found[pick] && { ...found[pick], metres: Number.isFinite(metres) && metres > 0.05 && metres < 20 ? metres : undefined };
}

/** Writes the made file `name` (aside, like the coder) that puts `model` before the player. */
function placeModel(name, phrase, model) {
  const key = model.file.split('/').pop().replace(/\.glb$/i, '').replace(/\W/g, '_');
  const idle = model.clips.find((clip) => /idle/i.test(clip)) ?? model.clips.find((clip) => /stand|breath/i.test(clip)) ?? model.clips[0];
  const source = `import { AssetManager, DistanceGrabbable, MovementMode, RayInteractable } from '@iwsdk/core';
import { feature } from '../live.js';
import { ${idle ? 'animate, ' : ''}fitModel } from '../models.js';
import { inFrontOfPlayer } from '../place.js';

// ${JSON.stringify(phrase.replace(/\s+/g, ' ').slice(0, 200))}: the ready model ${JSON.stringify(model.title)}, put before the player by the
// host without the coder (server/index.mjs, placeModel). Taken with the ray; both hands' rays stretch it (one grab component).
feature(import.meta, async (world) => {
  await AssetManager.loadGLTF(${JSON.stringify(model.file)}, ${JSON.stringify(key)});
  const gltf = AssetManager.getGLTF(${JSON.stringify(key)})!;
  const thing = fitModel(gltf.scene, { length: 0.6 });
  thing.name = ${JSON.stringify(key)};

  const spot = inFrontOfPlayer(world, { distance: 0.9 });
  thing.position.copy(spot.point);
  thing.quaternion.copy(spot.facing);

  world
    .createTransformEntity(thing)
    .addComponent(RayInteractable)
    .addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget });
${idle ? `\n  animate(world, gltf).play(${JSON.stringify(idle)});\n` : ''}});
import.meta.hot?.accept();
`;
  mkdirSync(ASIDE, { recursive: true });
  writeFileSync(`${ASIDE}/${name}.ts`, source);
  keepCopy(name);
  return { clean: true, steps: [`the ready model "${model.title}" placed by the host, no coder`] };
}

// ---- The work shown while it goes on (research/notes/STREAM.md) ----
// With `stream: true` in the body, /api/make and /api/change answer with lines of JSON as things
// happen (application/x-ndjson) instead of one JSON at the end:
//   { start: model }          the coder's answer has begun
//   { code: text }            the next piece of the file (the code only, without its fence)
//   { draft: js, statements } the part of the file that can run already (tools/draft.mjs)
//   { edits: [...] }          an answer by edits (a change)
//   { result: { name, ms } }  the end; or { error, status }
// Without `stream` the answer is the plain JSON it always was.
function answering(req, res) {
  const streamed = req.body?.stream === true;
  let begun = false;
  const send = (event) => {
    if (!streamed || res.writableEnded) return;
    if (!begun) {
      begun = true;
      res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
    }
    res.write(`${JSON.stringify(event)}\n`);
  };
  // A beat every 5 s while the work goes on (18.11: the server was restarted mid-build and the page waited for ever —
  // the dev proxy kept its side open). The page gives up after 20 s with no line at all (src/api.ts, apiStream).
  if (streamed) {
    const beat = setInterval(() => send({ beat: 1 }), 5_000);
    res.on('close', () => clearInterval(beat));
  }
  return {
    streamed,
    send,
    done(result) {
      if (!streamed) return res.json(result);
      send({ result });
      res.end();
    },
    fail(status, error, more = {}) {
      // nothing sent yet: the plain status answer, as without a stream
      if (!begun) return res.status(status).json({ error, ...more });
      send({ error, status, ...more });
      res.end();
    },
  };
}

const CODE_EVERY_MS = 100; // pieces of text go to the page in batches
const DRAFT_EVERY_MS = 600; // a draft is run by the page in full: not more often than the eye needs

/** Turns the coder's answer, as it comes, into `code` and `draft` lines for the page. */
function feed(send, { drafts = true } = {}) {
  let reply = '';
  let sent = 0; // characters of the code already sent
  let statements = 0; // of the last draft sent
  let draftedAt = 0;
  let timer;
  const stages = new Set(); // each stage goes to the page once (a repair writes a «model» line again)
  const flush = (last = false) => {
    timer = undefined;
    const code = codeOf(reply);
    if (!code) return;
    // a fence that has begun to close is not code: hold back a tail that may be the start of it
    const ready = code.closed || last ? code.text : code.text.replace(/\n?`{0,2}$/, '');
    if (ready.length > sent) {
      send({ code: ready.slice(sent) });
      sent = ready.length;
    }
    if (!drafts || (!code.closed && !last && Date.now() - draftedAt < DRAFT_EVERY_MS)) return;
    draftedAt = Date.now();
    const draft = draftOf(code.text, code.closed);
    if (draft && draft.statements > statements) {
      statements = draft.statements;
      send({ draft: draft.js, statements });
    }
  };
  return {
    on(kind, value) {
      if (kind === 'start') {
        clearTimeout(timer);
        timer = undefined;
        reply = '';
        sent = statements = 0;
        send({ start: value });
      } else if (kind === 'code') {
        reply += value;
        timer ??= setTimeout(flush, CODE_EVERY_MS);
      } else if (kind === 'edits') {
        send({ edits: value });
      } else if (kind === 'stage' && !stages.has(value)) {
        stages.add(value);
        if (timer !== undefined) { clearTimeout(timer); flush(true); } // the last of the code before the stage
        send({ stage: value });
      }
    },
    /** The coder is done: what is left goes out. */
    finish() {
      if (timer === undefined) return;
      clearTimeout(timer);
      flush(true);
    },
  };
}

// While developing: `replay <made file> [pointed] [chars per second]` as the phrase plays a file
// kept in logs/made/ instead of asking the coder — the same file at the same pace every time, no
// Vertex, to work on the build shown in the room. `node tools/say.mjs "replay made-mwfm25pu"`.
const REPLAY = /^replay\s+(made-[\w-]+)(\s+pointed)?(?:\s+(\d+))?\s*$/i;
function replayOf(phrase) {
  if (BARE) return undefined;
  const asked = String(phrase ?? '').trim().match(REPLAY);
  if (!asked || !existsSync(`${ROOT}logs/made/${asked[1]}.ts`)) return undefined;
  return { sample: asked[1], pointed: !!asked[2], speed: Number(asked[3] ?? 600) };
}

/** Plays the kept file `sample` as if the coder were writing it now, at `speed` characters a second. */
async function replayCoder(name, { sample, speed }, on) {
  const source = readFileSync(`${ROOT}logs/made/${sample}.ts`, 'utf8');
  const reply = `\`\`\`ts\n${source}${source.endsWith('\n') ? '' : '\n'}\`\`\``;
  const step = Math.max(1, Math.round(speed / 25)); // 25 pieces a second
  on?.('start', 'replay');
  for (let at = 0; at < reply.length; at += step) {
    on?.('code', reply.slice(at, at + step));
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  mkdirSync(ASIDE, { recursive: true });
  writeFileSync(`${ASIDE}/${name}.ts`, source);
  return { clean: true, steps: [`replay of ${sample}, ${source.length} characters at ${speed}/s`] };
}

/**
 * A clean file `name` waits in src/_gen. While developing it goes into the scene (src/features), where
 * the dev server loads it. On the published site it is read and taken away, and the page gets it
 * compiled (`js`, run by src/remote.ts). Returns its source and what goes into the answer.
 */
function deliver(name) {
  const aside = `${ASIDE}/${name}.ts`;
  const source = readFileSync(aside, 'utf8');
  if (!PUBLISHED) {
    renameSync(aside, `${FEATURES}/${name}.ts`);
    return { source, answer: {} };
  }
  unlinkSync(aside);
  return { source, answer: { js: compileGame(source) } };
}

/** The file the coder changes or repairs: while developing, the one in the scene (it may have been
 *  edited by hand); on the published site, the creation's source written out of the project for a moment. */
function baseOf(name, source) {
  if (!PUBLISHED) return `${FEATURES}/${name}.ts`;
  const path = `${tmpdir()}/punto-base-${name}.ts`;
  writeFileSync(path, source);
  return path;
}

/** A failed coder run leaves its file in src/_gen: take it away. */
function dropAside(name) {
  if (existsSync(`${ASIDE}/${name}.ts`)) unlinkSync(`${ASIDE}/${name}.ts`);
}

app.post('/api/make', async (req, res) => {
  // aside: true leaves the file in src/_gen and out of the live scene (for checks)
  // coder: another model for this one call (comparisons), e.g. 'gemini-4-hydrogen'
  const { phrase, kind, model, aside, coder, place } = req.body ?? {};
  const session = req.session;
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 4000) return res.status(400).json({ error: "phrase: 1-4000 characters" });
  if (!(await freeOf(session))) return res.status(409).json({ error: 'already making something' });
  session.making = true;
  const name = madeName();
  const started = Date.now();
  const answer = answering(req, res);
  // No drafts for now (18.11): three times the headset's page froze for good while the coder wrote — 09:01, 09:12,
  // 09:15, each time with drafts of the half-written file running in the page (a loop over a stand-in never ends).
  // The code still flies onto Punto's screen; the thing appears when it is whole. PUNTO_DRAFTS=1 brings them back.
  const work = answer.streamed ? feed(answer.send, { drafts: process.env.PUNTO_DRAFTS === '1' }) : undefined;
  try {
    const replay = PUBLISHED ? undefined : replayOf(phrase);
    const asked = session.wanted;
    const mayBePlain = asked?.phrase === phrase && asked.plain && place !== 'pointed' && !coder;
    const topicsTask = replay || mayBePlain
      ? undefined
      : pickTopics(phrase, kind).catch((error) => {
          console.warn(JSON.stringify({ event: 'topics.error', owner: req.owner, error: String(error).slice(0, 200) }));
          return undefined;
        });
    // a quick thing (a cube, a molecule) gets no list of downloaded models (18.11: «вращающийся куб» came with a stone
    // block, a brick cube and a crate in the note, and the coder made a studded toy brick)
    const quickAsked = QUICK_MODEL && asked?.phrase === phrase && asked.quick && !coder;
    const ready = replay || quickAsked ? { found: [], note: '' } : await readyModels(model ?? (asked?.phrase === phrase ? asked.model : ''), req.owner);
    // the thing alone and a model that is it: no coder (see placeModel). Not for a spot the player
    // points at, and not for a set of several things in one file: those the coder handles.
    let picked;
    if (mayBePlain) {
      const whole = ready.found.filter((one) => !one.parts.length);
      picked = whole.length ? await pickModel(phrase, whole).catch((error) => {
        console.warn(JSON.stringify({ event: 'pick.error', owner: req.owner, error: String(error).slice(0, 200) }));
        return undefined;
      }) : undefined;
    }
    if (!picked && !replay && !coderToday(answer)) return;
    // The model the coder builds on is chosen now (~1 s), so the page can show it while the coder writes: Punto draws
    // its outline, the code flies out as letters onto it (src/materialize.ts, Yury 16.11). None fits: the coder
    // builds in code and the page draws the usual plan. Only the page that streams hears about it.
    // Never the raw list of what the search found (18.11: «вращающийся куб» + a brick cube and a crate in the note → a
    // studded toy brick): the coder gets a model only when the check says it IS the thing, and only that one
    let models = '';
    let shown;
    if (!picked && !replay && ready.found.length) {
      shown = await pickModel(phrase, ready.found).catch((error) => {
        console.warn(JSON.stringify({ event: 'pick.error', owner: req.owner, error: String(error).slice(0, 200) }));
        return undefined;
      });
      if (shown) models = pickedNote(shown);
      console.log(JSON.stringify({ event: 'model.shown', owner: req.owner, file: shown?.file ?? null, metres: shown?.metres }));
    }
    answer.send({ model: shown ? { file: shown.file, title: shown.title, clips: shown.clips, metres: shown.metres } : null });
    const pickedTopics = picked || replay
      ? undefined
      : await (topicsTask ?? pickTopics(phrase, kind).catch((error) => {
          console.warn(JSON.stringify({ event: 'topics.error', owner: req.owner, error: String(error).slice(0, 200) }));
          return undefined;
        }));
    const coderTopics = pickedTopics && (models ? [...new Set([...pickedTopics, 'model'])] : pickedTopics);
    // the ready models are kept apart from the note: a later change is offered them only while
    // the creation still is a model (see /api/change)
    // with no director the coder decides: the file of what stands in the room comes with the phrase
    const standing = NO_DIRECTOR && session.current?.source
      ? `\nIn the room now stands this (its file):\n\`\`\`ts\n${session.current.source}\n\`\`\`\nIf the phrase changes it, adds to it or asks something about it, reply with the whole file changed; if it asks for something else, write a new file from scratch (the old one goes).`
      : '';
    const note = (NOTES[kind] ?? '') + (place === 'pointed' ? POINTED : '') + standing;
    // A quick thing (the director's `quick`: one still thing to look at — a cube, a molecule) is written by a fast model
    // (Yury, 18.11: «режиссёр сам решает … куб сам пишет»). PUNTO_QUICK_MODEL picks it; empty turns it off.
    const quick = QUICK_MODEL && asked?.phrase === phrase && asked.quick && !coder;
    const coderEnv = {
      ...(/^gemini-[\w.-]+$/.test(coder ?? '') && !PUBLISHED ? { CODER_MODEL: coder } : {}),
      ...(quick ? { CODER_MODEL: QUICK_MODEL, CODER_THINKING: 'LOW' } : {}),
      ...(coderTopics !== undefined ? { CODER_TOPICS: coderTopics.join(',') } : {}),
    };
    let { clean, steps } = picked
      ? placeModel(name, phrase, picked)
      : replay
      ? await replayCoder(name, replay, work?.on)
      : await runCoder(name, phrase, note + models, coderEnv, work?.on);
    // The fast model may answer with a file that builds nothing (18.11, «прозрачный шар»: it thought aloud in comments
    // and stopped — the type check passes an empty setup): the usual coder writes it then.
    if (quick && clean && !/createTransformEntity/.test(readFileSync(`${ASIDE}/${name}.ts`, 'utf8'))) {
      console.warn(JSON.stringify({ event: 'quick.empty', owner: req.owner, name, model: QUICK_MODEL }));
      const { CODER_MODEL: _model, CODER_THINKING: _thinking, ...usual } = coderEnv;
      const again = await runCoder(name, phrase, note + models, usual, work?.on);
      clean = again.clean;
      steps = [...steps, `the fast model built nothing: ${MODEL_OF_CODER()}`, ...again.steps];
    }
    work?.finish();
    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: 'make', owner: req.owner, session: session.id, ms, name, clean, ...(quick && { quick: QUICK_MODEL }), steps, topics: coderTopics ?? 'full', streamed: answer.streamed, phrase: phrase.slice(0, 200) }));
    if (!clean) {
      dropAside(name);
      return answer.fail(422, 'the game did not compile', { ms });
    }
    if (aside && !PUBLISHED) return answer.done({ name, ms });
    // a replayed file is remembered by what it is, so a later change of it reads sensibly to the coder
    const { source, answer: more } = deliver(name);
    const record = { phrase: replay ? `the thing kept as "${replay.sample}"` : phrase, note, models, source };
    madeFrom.set(name, record);
    const before = addVersion(session, name, record);
    session.current = { name, ...record, prior: session.current, swapped: false, before };
    answer.done({ name, ms, ...more });
  } catch (error) {
    console.error(JSON.stringify({ event: 'make.error', owner: req.owner, error: String(error).slice(0, 500) }));
    dropAside(name);
    answer.fail(502, 'coder failed');
  } finally {
    session.making = false;
  }
});

// A made game passed the type check but failed when the page loaded it: the coder gets its file
// and the error, and the corrected file comes into the scene under a new name. Body: { name, error }.
app.post('/api/repair', async (req, res) => {
  const { name, error } = req.body ?? {};
  const session = req.session;
  const from = session.current?.name === name ? session.current : undefined;
  if (!from || typeof error !== 'string' || (!PUBLISHED && !existsSync(`${FEATURES}/${name}.ts`))) return res.status(400).json({ error: 'nothing to repair' });
  if (session.making) return res.status(409).json({ error: 'already making something' });
  session.making = true;
  const fixed = madeName();
  const started = Date.now();
  const answer = answering(req, res);
  try {
    if (!coderToday(answer)) return;
    const broken = baseOf(name, from.source);
    const { clean, steps } = await runCoder(fixed, from.phrase, from.note + (from.models ?? ''), { CODER_BASE: broken, CODER_ERROR: error.slice(0, 1500) });
    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: 'repair', owner: req.owner, session: session.id, ms, name, fixed, clean, steps, error: error.slice(0, 300) }));
    unlinkSync(broken);
    if (!clean) {
      dropAside(fixed);
      return answer.fail(422, 'the repair did not compile', { ms });
    }
    const { source, answer: more } = deliver(fixed);
    const record = { phrase: from.phrase, note: from.note, models: from.models, source };
    madeFrom.set(fixed, record);
    // the repaired file takes the broken one's place in the history: the broken one never was in the room
    Object.assign(session.versions[session.at] ?? {}, { name: fixed, source });
    Object.assign(session.current, { name: fixed, source });
    answer.done({ name: fixed, ms, ...more });
  } catch (failure) {
    console.error(JSON.stringify({ event: 'repair.error', owner: req.owner, error: String(failure).slice(0, 500) }));
    dropAside(fixed);
    answer.fail(502, 'coder failed');
  } finally {
    session.making = false;
  }
});

// The player asks to change the creation in the room: the coder gets its file and the request and
// answers with edits. The changed file comes in under a new name; the old one stays until the page
// says the new one loaded. Body: { phrase }. Reply: { name, ms } (+ js on the published site).
// When the director heard "undo" or "redo" in that phrase, no coder: the version the player had
// comes back as the changed file, at once (backAndForth).
app.post('/api/change', async (req, res) => {
  const { phrase, place } = req.body ?? {};
  const session = req.session;
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 4000) return res.status(400).json({ error: "phrase: 1-4000 characters" });
  // a friend's change in the room goes first: this one is made on top of it
  if (!(await freeOf(session))) return res.status(409).json({ error: 'already making something' });
  const old = session.current;
  if (!old || (!PUBLISHED && !existsSync(`${FEATURES}/${old.name}.ts`))) {
    session.making = false;
    return res.status(400).json({ error: 'nothing to change' });
  }
  const step = session.wanted?.phrase === phrase ? session.wanted.step : undefined;
  if (step) {
    session.making = false;
    const back = stepTo(session, step);
    return res.status(back.error ? 400 : 200).json(back);
  }
  session.making = true;
  const name = madeName();
  const started = Date.now();
  const answer = answering(req, res);
  // no drafts: the creation being changed stands in the room, a second one growing in it would only confuse
  const work = answer.streamed ? feed(answer.send, { drafts: false }) : undefined;
  let base;
  try {
    if (!coderToday(answer)) return;
    base = baseOf(old.name, old.source);
    // The models found for the first request are offered again only while the creation is made
    // of one. Once it is built in code they are not: asked to draw a dinosaur itself and then to
    // "make it film quality", the coder threw its own dinosaur away for the ready model (14.11).
    const baseSource = readFileSync(base, 'utf8');
    const usesModel = /\bloadGLTF\b/.test(baseSource);
    const existingTopics = topicsOf(baseSource);
    const addedTopics = await pickTopics(phrase, 'change', old.phrase).catch((error) => {
      console.warn(JSON.stringify({ event: 'topics.error', owner: req.owner, error: String(error).slice(0, 200) }));
      return undefined;
    });
    const coderTopics = addedTopics === undefined
      ? undefined
      : [...new Set([...existingTopics, ...addedTopics, ...(usesModel && old.models ? ['model'] : [])])];
    const { clean, steps } = await runCoder(
      name,
      old.phrase,
      old.note + (usesModel ? old.models ?? '' : ''),
      {
        CODER_BASE: base,
        CODER_CHANGE: phrase + (place === 'pointed' ? POINTED.replace(' right now', ' for the new spot') : ''),
        // a recolour, a size, a pace or a shift: first with the short prompt (tools/coder.mjs, CODER_SMALL)
        ...(session.wanted?.phrase === phrase && session.wanted.small && place !== 'pointed' ? { CODER_SMALL: '1' } : {}),
        ...(coderTopics !== undefined ? { CODER_TOPICS: coderTopics.join(',') } : {}),
      },
      work?.on,
    );
    work?.finish();
    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: 'change', owner: req.owner, session: session.id, ms, name, from: old.name, clean, steps, topics: coderTopics ?? 'full', streamed: answer.streamed, phrase: phrase.slice(0, 200) }));
    if (!clean) {
      dropAside(name);
      return answer.fail(422, 'the change did not compile', { ms });
    }
    // the old file stays in the scene until the page says the new one is in (unmake keep): no blink
    // between them; a new one that fails is taken away and the old one simply goes on (13.11)
    const { source, answer: more } = deliver(name);
    const record = { phrase: `${old.phrase}» Then the player asked to change it: «${phrase}`, note: old.note, models: old.models, source };
    madeFrom.set(name, record);
    const before = addVersion(session, name, record);
    session.current = { name, ...record, prior: old, swapped: false, before };
    answer.done({ name, ms, ...more });
  } catch (error) {
    console.error(JSON.stringify({ event: 'change.error', owner: req.owner, error: String(error).slice(0, 500) }));
    dropAside(name);
    answer.fail(502, 'coder failed');
  } finally {
    if (PUBLISHED && base) unlinkSync(base);
    session.making = false;
  }
});

/** Undo / redo: the version one back or one forward comes into the room as a new file (the page
 *  takes it as a change: the ghost, the player's moves kept). The history itself stays. */
function stepTo(session, step) {
  const at = session.at + (step === 'undo' ? -1 : 1);
  const version = session.versions[at];
  if (!version) return { error: `nothing to ${step}` };
  const name = madeName();
  mkdirSync(ASIDE, { recursive: true });
  writeFileSync(`${ASIDE}/${name}.ts`, version.source);
  const { answer: more } = deliver(name);
  const record = { phrase: version.phrase, note: version.note, models: version.models, source: version.source };
  madeFrom.set(name, record);
  const before = { versions: session.versions.slice(), at: session.at };
  version.name = name;
  session.at = at;
  session.current = { name, ...record, prior: session.current, swapped: false, before };
  console.log(JSON.stringify({ event: step, session: session.id, name, at, of: session.versions.length }));
  return { name, ms: 0, ...more };
}

// The creation this player has now, for a page that has just loaded: on the published site a page
// starts empty, and the creation comes back from here (its versions stay, so "change" and "undo" go
// on). While developing it is still in src/features: nothing to send. Reply: { name, js } or {}.
app.post('/api/current', (req, res) => {
  const current = req.session.current;
  if (!PUBLISHED || !current?.source) return res.json({});
  res.json({ name: current.name, js: compileGame(current.source) });
});

// Plays an item of the tablet's library: its game (its saved code, or a kept sample) or its ready model
// becomes the creation in the room, the way a made one does — versions, "change it", "undo" go on from
// it. Body: { id }. Reply: { name, ms } (+ js on the published site).
app.post('/api/play', async (req, res) => {
  const session = req.session;
  // the cards load a while after a cold start: wait for them, or a saved game was «no such item»
  try {
    await library.ready;
  } catch {
    return res.status(503).json({ error: 'the library did not load' });
  }
  const item = library.read(String(req.body?.id ?? ''), req); // a risky card only for its maker (library.mjs)
  if (!item) return res.status(404).json({ error: 'no such item' });
  if (session.making) return res.status(409).json({ error: 'already making something' });
  const name = madeName();
  mkdirSync(ASIDE, { recursive: true });
  const phrase = `the ${item.kind} kept as "${item.title}"`;
  if (item.code) writeFileSync(`${ASIDE}/${name}.ts`, item.code);
  else if (item.sample && existsSync(`${ROOT}samples/${item.sample}.ts`)) copyFileSync(`${ROOT}samples/${item.sample}.ts`, `${ASIDE}/${name}.ts`);
  else if (item.model) placeModel(name, phrase, { file: item.model, title: item.title, ...modelContents(item.model) });
  else return res.status(400).json({ error: 'nothing to play in it' });
  const { source, answer: more } = deliver(name);
  const record = { phrase, note: NOTES[item.kind === 'model' ? 'thing' : 'game'], source };
  madeFrom.set(name, record);
  const before = addVersion(session, name, record);
  session.current = { name, ...record, prior: session.current, swapped: false, before };
  console.log(JSON.stringify({ event: 'play', owner: req.owner, session: session.id, item: item.id, name }));
  res.json({ name, ms: 0, ...more });
});

// "On the other table" (17.11): the creation in the room runs again as it is, and its code takes the new spot the
// page has chosen (wantedPlace, tabletop). No coder. While developing its file is written again (the dev server
// reloads it); on the published site its code comes back compiled. 409 when its code takes no spot from the
// room — then it can only be moved by changing it.
app.post('/api/again', (req, res) => {
  const current = req.session.current;
  if (!current?.name || current.name !== req.body?.name) return res.status(404).json({ error: 'not the creation in the room' });
  const file = `${FEATURES}/${current.name}.ts`;
  const source = !PUBLISHED && existsSync(file) ? readFileSync(file, 'utf8') : current.source;
  if (!source) return res.status(404).json({ error: 'no code for it' });
  if (!/wantedPlace|tabletop\(/.test(source)) return res.status(409).json({ error: 'it takes no spot from the room' });
  console.log(JSON.stringify({ event: 'again', owner: req.owner, session: req.session.id, name: current.name }));
  if (!PUBLISHED) {
    writeFileSync(file, source);
    return res.json({ name: current.name });
  }
  res.json({ name: current.name, js: compileGame(source) });
});

// Brings a kept game (samples/<sample>.ts) into the scene as the creation in the room, so it can be
// played and changed further. Body: { sample }. Until saving exists: `node tools/open.mjs <sample>`.
app.post('/api/open', (req, res) => {
  const session = req.session;
  const sample = String(req.body?.sample ?? '').replace(/[^\w-]/g, '');
  const from = `${ROOT}samples/${sample}.ts`;
  if (!sample || !existsSync(from)) return res.status(404).json({ error: 'no such sample' });
  if (session.making) return res.status(409).json({ error: 'already making something' });
  if (!PUBLISHED) for (const file of readdirSync(FEATURES).filter((file) => /^made-.*\.ts$/.test(file))) unlinkSync(`${FEATURES}/${file}`);
  const name = madeName();
  mkdirSync(ASIDE, { recursive: true });
  copyFileSync(from, `${ASIDE}/${name}.ts`);
  const { source, answer: more } = deliver(name);
  const record = { phrase: String(req.body?.phrase ?? `the game kept as "${sample}"`), note: NOTES.game, source };
  madeFrom.set(name, record);
  addVersion(session, name, record);
  session.current = { name, ...record, prior: null, swapped: false };
  console.log(JSON.stringify({ event: 'open', owner: req.owner, session: session.id, sample, name }));
  res.json({ name, ...more });
});

// Take made games out of the scene (the dev server unloads a deleted file). Body:
//   {}          all of them
//   { name }    that one, because it failed: the creation it replaced comes back, and the history
//               is as it was before it
//   { keep }    all but that one, because it loaded: what it replaced is gone for good
// On the published site there are no files: only what the server remembers changes.
app.post('/api/unmake', (req, res) => {
  const session = req.session;
  const dir = FEATURES;
  const { name: failed, keep } = req.body ?? {};
  const only = typeof failed === 'string' ? `${failed}.ts` : undefined;
  const kept = typeof keep === 'string' ? `${keep}.ts` : undefined;
  let restored;
  const current = session.current;
  if (only && current?.name === failed) {
    if (current.before) {
      session.versions = current.before.versions;
      session.at = current.before.at;
    }
    session.current = current.prior ?? null;
  } else if (kept) {
    if (current) current.prior = null;
  } else if (!only) {
    session.current = null;
  }
  const gone = !PUBLISHED && existsSync(dir) ? readdirSync(dir).filter((file) => /^made-.*\.ts$/.test(file) && (!only || file === only) && file !== kept && file !== `${restored}.ts`) : [];
  for (const file of gone) unlinkSync(`${dir}/${file}`);
  console.log(JSON.stringify({ event: 'unmake', owner: req.owner, session: session.id, gone: gone.length, failed, keep, restored }));
  res.json({ gone: gone.length, restored });
});

// On the published site the ready models the coder found are downloaded while it runs
// (public/models/polypizza): they are not in the built page.
if (PUBLISHED) app.use('/models/polypizza', express.static(`${ROOT}public/models/polypizza`));

// The page itself is never taken from a cache: a cached index.html points at the chunks of a build that is
// gone (14.11, the headset: 404 on every chunk, and Punto never came). The hashed chunks may be cached.
app.use(express.static(DIST, { setHeaders: (res, path) => path.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache') }));

const server = app.listen(PORT, () => console.log(`punto server on :${PORT}, game from ${DIST}`));

// Gemini Live as Punto's ears and voice, behind ?voice=live (server/live.mjs, research/notes/LIVE.md). A browser WebSocket
// cannot set headers, so the key may come in the address (?key=); the edge secret, the key and the hourly
// limit on paid calls are checked as for every /api call: opening counts one paid call, and so does each phrase.
const asExpress = (req) => ({ get: (name) => req.headers[name.toLowerCase()], socket: req.socket });
liveRoutes(server, {
  admit(req, url) {
    if (EDGE_SECRET && req.headers['x-punto-edge'] !== EDGE_SECRET) return null;
    const owner = keys.get(String(req.headers['x-punto-key'] ?? url.searchParams.get('key') ?? ''));
    if (!owner || !paidOk(asExpress(req))) return null;
    return { owner };
  },
  spend: (owner, req) => paidOk(asExpress(req)),
});

// Playing together from different rooms (server/together.mjs, research/notes/SHARING.md): the room only passes poses and
// events on, nothing paid, so only the edge secret and the key are checked.
({ roomGameOf } = togetherRoutes(app, server, {
  admit(req, url) {
    if (EDGE_SECRET && req.headers['x-punto-edge'] !== EDGE_SECRET) return null;
    const owner = keys.get(String(req.headers['x-punto-key'] ?? url.searchParams.get('key') ?? ''));
    return owner ? { owner } : null;
  },
  // the room owner's game for a guest: on the published site the code goes as compiled JS; while developing
  // every page on the dev server loads the made files anyway
  gameOf(owner, session) {
    if (!PUBLISHED) return {};
    const current = sessions.get(`${owner}/${session}`)?.current;
    return current?.source ? { name: current.name, js: compileGame(current.source) } : {};
  },
}));
