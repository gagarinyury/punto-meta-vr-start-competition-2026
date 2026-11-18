// Coder: one direct model call writes one live feature file from a phrase.
// Usage: node tools/coder.mjs <feature-name> "<phrase>" ["<director's note>"]
// Env: CODER_MODEL (gemini-4-hydrogen; was gemini-3.8-flash until 12.11), CODER_THINKING (unset = model default),
//      CODER_PROJECT (punto-vr), CODER_DIR (src/features = live scene; src/_gen = aside). Auth: gcloud application-default login.
//      CODER_BASE + CODER_ERROR: repair — the file that failed when loaded into the scene, and its error.
//      CODER_BASE + CODER_CHANGE: edit — the current creation's file and what the player asks to change in it;
//      the model answers with SEARCH/REPLACE blocks (seconds instead of a rewrite), a whole file is the fallback.
//      CODER_EDIT=whole: an edit is answered with the whole file at once (for comparisons).
//      CODER_IMAGE: a reference picture (png/jpeg) the player shows: the model sees it with the request.
//      CODER_STREAM=1: the first answer is also printed while it comes, for the page to show the work
//      (research/notes/STREAM.md): `@@start <model>`, then `@@code <json string>` per piece of text, or `@@edits <json>`
//      for an answer by edits. The server takes these lines out of the log. Repairs are not printed.
//      CODER_BACKEND=agy: the model is asked through the Antigravity CLI (`agy -p`, its headless mode, on the
//      subscription signed in on this computer) instead of Vertex — for testing here without spending Cloud credits
//      (17.11). CODER_AGY_MODEL picks the model (gemini-4-hydrogen-low, as the server; `agy models` lists them). Only on this
//      computer: the published service keeps Vertex. A reference picture is not passed this way.
import { execFile, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { system as punto, systemFor, topicsOf } from './coder-prompt.mjs';
import { bare } from './coder-prompt-bare.mjs';
import { appendFileSync, mkdirSync } from 'node:fs';

// CODER_PROMPT=bare (Yury, 18.11): IWSDK and Three.js only, none of Punto's helpers (tools/coder-prompt-bare.mjs) —
// for the first answer and every repair alike. Its thinking is asked back too and goes to logs/thoughts/<name>.txt
// as it comes (tail -f logs/thoughts/latest.txt), never into the code.
const BARE = process.env.CODER_PROMPT === 'bare';
const system = BARE ? bare : punto;
const THOUGHTS = BARE || process.env.CODER_THOUGHTS === '1';
if (THOUGHTS) mkdirSync('logs/thoughts', { recursive: true });

const [name, phrase, note] = process.argv.slice(2);
// The director's short note (at most a few lines): what kind of thing this is and how it is handled.
const request = `The player said: «${phrase}»${note ? `\nDirector's note: ${note}` : ''}` +
  (process.env.CODER_IMAGE ? '\nThe player shows the attached picture as the reference: build the thing as it is there — the same parts, ' +
    'their shapes, proportions and colours, and the way they move together. Labels and grids in the picture are not part of the thing.' : '');
const model = process.env.CODER_MODEL ?? 'gemini-4-hydrogen';
if (THOUGHTS) writeFileSync('logs/thoughts/latest.txt', `--- ${name} (${process.env.CODER_MODEL ?? 'gemini-4-hydrogen'}, ${process.env.CODER_THINKING ?? 'default'}): ${phrase}\n`);
const project = process.env.CODER_PROJECT ?? 'punto-vr';
// CODER_DIR=src/_gen writes the game aside (typechecked, not loaded into the live scene).
const file = `${process.env.CODER_DIR ?? 'src/features'}/${name}.ts`;
// a reference picture goes before the words, as an inline image
const picture = process.env.CODER_IMAGE
  ? [{ inlineData: { mimeType: /\.jpe?g$/i.test(process.env.CODER_IMAGE) ? 'image/jpeg' : 'image/png', data: readFileSync(process.env.CODER_IMAGE).toString('base64') } }]
  : [];
// The system prompt: systemFor(topics) when CODER_TOPICS is given, full `system` for repairs or without topics.
const baseSource = process.env.CODER_BASE ? readFileSync(process.env.CODER_BASE, 'utf8') : '';
const selectedSystem = !BARE && !process.env.CODER_ERROR && process.env.CODER_TOPICS !== undefined
  ? systemFor([...new Set([...process.env.CODER_TOPICS.split(',').filter(Boolean), ...(baseSource ? topicsOf(baseSource) : [])])])
  : system;

// A small change — a colour, a size, a pace, a shift (the director's `small`; Yury, 18.11): the file holds nearly all
// it needs, so it is asked first with this short prompt instead of the core and the topics (~1 000 tokens, not
// 15 000+). An edit that does not fit goes the usual way; a repair always gets the usual prompt.
const SMALL = !BARE && process.env.CODER_SMALL === '1' && Boolean(process.env.CODER_CHANGE);
const SMALL_SYSTEM = `You make one small change to a TypeScript file of a running IWSDK (WebXR, passthrough AR) app: a creation
standing in the player's real room. The file is given; call edit_file with the fewest edits that do it, and keep
everything else exactly as it is — its shape, imports, systems, names.
- Colour. Pieces made with toy(geometry, color, …) of '../style.js' have their colour painted into the facets: change
  the colour argument of those toy(...) calls (PALETTE.blue, 0x2a7fff, lit(PALETTE.red), topSide(…)), never
  material.color. Plain meshes: their material's color. A figure: figure(name, { colors: { shirt: 'blue' } }).
- Size: scale the root object of the thing (or the numbers it is built from), not one part, unless a part is named.
  Physics shapes (PhysicsShape dimensions) and anything measured from the size follow it.
- Pace: the numbers that drive motion in update() (speeds, delta multipliers, intervals).
- Shift on its surface, as the player sees it: the spot comes from wantedPlace or inFrontOfPlayer;
    const right = new Vector3(1, 0, 0).applyQuaternion(spot.facing); // the player's right, along the wall or table
    const up = new Vector3(0, 1, 0).applyQuaternion(spot.facing);    // up a wall; on a table: away from the player
    thing.position.addScaledVector(right, -0.3);                     // «левее»: 0.3 m to the left
  Without a number a step is about a third of the thing's size, at least 0.2 m; «ещё» repeats the last step.
  Import Vector3 from '@iwsdk/core' if the file has not.
- Never allocate inside update(); import Three.js only from '@iwsdk/core'.`;

const AGY = process.env.CODER_BACKEND === 'agy';
// CODER_BACKEND=deepseek: DeepSeek's own API (Yury, 18.11: «через своё апи, где он полноценный») — the same call shape
// as OpenRouter (OpenAI chat/completions), key DEEPSEEK_API_KEY, model CODER_DS_MODEL (deepseek-flash = V4.1 Flash;
// deepseek-v4-pro), thinking CODER_DS_EFFORT (low)
const DS = process.env.CODER_BACKEND === 'deepseek';
const OR = DS || process.env.CODER_BACKEND === 'openrouter'; // DeepSeek through OpenRouter (genxr-bench 17.11; Yury 18.11 for a test)
const OR_MODEL = DS ? (process.env.CODER_DS_MODEL ?? 'deepseek-flash') : (process.env.CODER_OR_MODEL ?? 'deepseek/deepseek-v4-flash-0731');
const AGY_MODEL = process.env.CODER_AGY_MODEL ?? 'gemini-4-hydrogen-low'; // as the server asks Vertex: Hydrogen, thinking low
// CODER_TOKEN: the server's own token (on Cloud Run there is no gcloud; server/index.mjs passes it)
const token = AGY ? '' : process.env.CODER_TOKEN || execSync('gcloud auth application-default print-access-token').toString().trim();
// The reply is streamed: Gemini 4 models may think for minutes, and a plain
// request dies after five minutes without headers. Streaming also shows how
// long the model is silent before the first piece of the answer.
// `tool`: a function the model must answer with (its arguments are returned) instead of text.
// Vertex sometimes sends nothing at all for minutes (13.11: 124 s, then 111 s on a dopamine
// molecule; a twin to the same model was just as slow, 45 s). A request with no answer in 20 s gets
// a twin to Gemini 3.8 Flash — other capacity, usually 5-15 s; whichever answers first is read, the
// other is dropped. Nothing at all in 100 s: fail. CODER_FALLBACK picks the twin's model.
const HEDGE_MS = Number(process.env.CODER_HEDGE_MS ?? 10_000); // Yury, 18.11: silent for 10 s — a second request // CODER_HEDGE_MS: to try the twin quickly
// The twin is off unless CODER_TWIN=1 (Yury, 14.11: «пусть только Hydrogen работает», two coders burn tokens)
const TWIN = process.env.CODER_TWIN !== '0'; // on since 18.11 (Yury): Vertex stalls cost more than a twin
const FALLBACK = process.env.CODER_FALLBACK ?? 'gemini-3.8-flash';
// CODER_REPAIR_MODEL (Yury, 18.11: «флэш 3.8 пишет, фиксит гидроген»): who repairs type and load errors; the writer by default
const REPAIR_MODEL = process.env.CODER_REPAIR_MODEL ?? model;
const GIVE_UP_MS = 100_000;
// Once it has begun, an answer comes in pieces a few seconds apart (the longest whole answers in the logs
// streamed for 32 s). Nothing more for IDLE_MS: Vertex stopped mid-answer — a failure now, not three
// minutes of waiting for the server to kill the coder (audit item 14). CODER_IDLE_MS to try it.
const IDLE_MS = Number(process.env.CODER_IDLE_MS ?? 10_000); // 18.11: 10 s of silence mid-answer, then once more (ask)
// A tool call (edit_file) is not streamed: Vertex is silent until the whole call is ready, then gives it at once
// (18.11, Cloud Run: a change took 105 s — the twin at 10 s, then «stopped mid-answer» twice, then the whole file).
// For a tool call: no twin at 10 s and 60 s of silence allowed.
const TOOL_IDLE_MS = 60_000;
// true until the first answer is written to the file: only that one is shown as it comes
let streaming = process.env.CODER_STREAM === '1';

// Vertex's schema types are upper case (OBJECT, STRING); a JSON schema's are lower case.
const jsonSchema = (node) =>
  Array.isArray(node) ? node.map(jsonSchema)
  : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([key, value]) => [key, key === 'type' ? String(value).toLowerCase() : jsonSchema(value)]))
  : node;

// The same question through the Antigravity CLI (CODER_BACKEND=agy). It is an agent: it runs in an empty folder of
// its own, so whatever tool it reaches for finds nothing of the project, and it is told to answer in text only.
// A function (`tool`) becomes a JSON schema the answer must follow (--json-schema). No streaming: the whole answer
// is printed at once for the page.
function askAgy(text, raw = false, tool, sys = selectedSystem) {
  const started = Date.now(), dir = mkdtempSync(join(tmpdir(), 'punto-agy-'));
  if (process.env.CODER_IMAGE) console.log('agy: the reference picture is not passed this way');
  // The task goes before AND after the instructions: after 200 000 characters of instructions alone, Hydrogen on
  // low thinking answered «your message was truncated, what shall I build?» (17.11). The prompt goes on stdin as one
  // stream-json message: a repair (instructions + the file + its errors) was too long for a -p argument.
  const content = `${text}\n\nUse no tools at all: do not read, write or run anything; answer in this reply only.\n\n` +
    `<instructions>\n${sys}\n</instructions>\n\nTHE TASK (as at the top):\n${text}`;
  const args = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--model', AGY_MODEL, '--print-timeout', '300s', '--disable-slash-commands'];
  if (tool) args.push('--json-schema', JSON.stringify(jsonSchema(tool.parameters)));
  return new Promise((resolve, reject) => {
    const child = execFile('agy', args, { cwd: dir, maxBuffer: 64 * 1024 * 1024, timeout: 330_000 }, (error, stdout, stderr) => {
      rmSync(dir, { recursive: true, force: true });
      const line = String(stdout).split('\n').find((l) => l.includes('"event":"result"'));
      let answer;
      try {
        answer = JSON.parse(line).result;
      } catch {
        return reject(new Error(`agy: ${error?.message?.slice(0, 200) ?? ''} ${String(stderr).slice(0, 400)} ${String(stdout).slice(-400)}`.trim()));
      }
      if (answer.status !== 'SUCCESS') return reject(new Error(`agy: ${answer.status} ${JSON.stringify(answer).slice(0, 400)}`));
      const reply = answer.response ?? '';
      console.log(`model agy ${AGY_MODEL} ${((Date.now() - started) / 1000).toFixed(1)} s`, JSON.stringify(answer.usage));
      if (tool) {
        try {
          return resolve(answer.structured_output ?? JSON.parse(reply));
        } catch {
          return reject(new Error(`agy: no structured answer: ${reply.slice(0, 300)}`));
        }
      }
      if (streaming) process.stdout.write(`@@start agy ${AGY_MODEL}\n@@code ${JSON.stringify(reply)}\n`);
      if (!reply.trim()) return reject(new Error('agy: empty reply'));
      if (!raw && !reply.includes('```')) console.log(`agy: no code block in the reply: ${reply.slice(0, 600).replace(/\n/g, ' ⏎ ')}`);
      resolve(raw ? reply : (reply.match(/```(?:ts|typescript)?\n([\s\S]*?)```/)?.[1] ?? reply));
    });
    child.stdin.end(JSON.stringify({ event: 'user', message: { content: [{ type: 'text', text: content }] } }) + '\n');
  });
}

// The same question to OpenRouter (CODER_BACKEND=openrouter). Code pieces are printed as they come (@@code), the
// thinking is not shown; `usage` (with the cached part and the cost in dollars) goes to the log line.
// A thinking that runs past THINK_CAP characters (~8k tokens) with no code yet is cut and the question asked once
// more without thinking (17.11: on «mug cauldron» DeepSeek thought through all 32k tokens and wrote nothing, even on
// effort low). Without thinking it is less careful (a test question: 10 primes below 60 instead of 17), so only then.
const THINK_CAP = Number(process.env.CODER_OR_THINK_CAP ?? 32_000);
// CODER_OR_NO_THINK=1: never think (17.11, Yury: «без размышлений собрать, что получится»)
async function askOpenRouter(text, raw = false, tool, think = process.env.CODER_OR_NO_THINK !== '1', sys = system) {
  const started = Date.now();
  const stop = new AbortController();
  const body = DS ? {
    model: OR_MODEL,
    stream: true,
    stream_options: { include_usage: true },
    // CODER_DS_EFFORT=none: no thinking at all (Yury, 18.11: «не думай, сразу пиши» — on low it thought 38 s first)
    ...((process.env.CODER_DS_EFFORT ?? 'none') === 'none' ? { thinking: { type: 'disabled' } } : { reasoning_effort: process.env.CODER_DS_EFFORT }),
    max_tokens: 32000,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: text }],
    ...(tool && {
      tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: jsonSchema(tool.parameters) } }],
      // thinking refuses a forced tool (14.11 polygon: «Thinking mode does not support this tool_choice»)
      tool_choice: (process.env.CODER_DS_EFFORT ?? 'none') === 'none' ? { type: 'function', function: { name: tool.name } } : 'auto',
    }),
  } : {
    model: OR_MODEL,
    stream: true,
    usage: { include: true },
    max_tokens: 32000,
    // Claude caches only what is marked (18.11: every call «cached 0», full price): the system prompt is marked
    messages: [
      { role: 'system', content: /anthropic\//.test(OR_MODEL) ? [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }] : sys },
      { role: 'user', content: text },
    ],
    // one provider for every call, or the prefix cache never hits (17.11: ~30 providers, two calls went to different ones)
    provider: { order: [process.env.CODER_OR_PROVIDER ?? 'deepinfra/fp8'], allow_fallbacks: true },
    ...(!think ? { reasoning: { enabled: false } } : process.env.CODER_OR_REASONING && { reasoning: { effort: process.env.CODER_OR_REASONING } }),
    ...(tool && {
      tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: jsonSchema(tool.parameters) } }],
      tool_choice: { type: 'function', function: { name: tool.name } },
    }),
  };
  const response = await fetch(DS ? 'https://api.deepseek.com/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: stop.signal,
    headers: DS
      ? { authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'content-type': 'application/json' }
      : { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', 'x-title': 'punto-genxr-bench' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`openrouter: ${response.status} ${(await response.text()).slice(0, 600)}`);
  const shown = streaming && !tool;
  if (shown) process.stdout.write(`@@start ${OR_MODEL}\n`);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let reply = '', args = '', pending = '', usage, finish, firstWords, provider, thought = 0;
  for (;;) {
    if (think && thought > THINK_CAP && !reply && !args) {
      stop.abort();
      console.log(`thinking past ${THINK_CAP} characters with no code after ${((Date.now() - started) / 1000).toFixed(1)} s: once more without thinking`);
      return askOpenRouter(text, raw, tool, false, sys);
    }
    let idle;
    const silence = new Promise((resolve) => (idle = setTimeout(resolve, IDLE_MS)));
    const next = await Promise.race([reader.read(), silence]).finally(() => clearTimeout(idle));
    if (!next) throw new Error(`openrouter stopped mid-answer: nothing more for ${IDLE_MS / 1000} s`);
    if (next.done) break;
    pending += next.value;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.startsWith('data: [DONE]')) continue;
      let piece;
      try {
        piece = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (piece.error) throw new Error(`openrouter: ${JSON.stringify(piece.error).slice(0, 400)}`);
      const delta = piece.choices?.[0]?.delta ?? {};
      const words = delta.content ?? '';
      const called = delta.tool_calls?.[0]?.function?.arguments ?? '';
      thought += (delta.reasoning ?? delta.reasoning_content ?? '').length;
      if ((words || called) && firstWords === undefined) firstWords = (Date.now() - started) / 1000;
      reply += words;
      args += called;
      if (shown && words) process.stdout.write(`@@code ${JSON.stringify(words)}\n`);
      finish = piece.choices?.[0]?.finish_reason ?? finish;
      usage = piece.usage ?? usage;
      provider = piece.provider ?? provider;
    }
  }
  console.log(`model ${OR_MODEL} via ${provider} ${((Date.now() - started) / 1000).toFixed(1)} s, first words after ${firstWords?.toFixed(1) ?? '—'} s, cached ${usage?.prompt_tokens_details?.cached_tokens ?? 0}/${usage?.prompt_tokens ?? '?'} (written ${usage?.prompt_tokens_details?.cache_write_tokens ?? 0}), $${usage?.cost?.toFixed?.(4) ?? '?'}`, JSON.stringify(usage));
  if (tool) {
    try {
      return JSON.parse(args);
    } catch {
      throw new Error(`openrouter: no tool arguments (${finish}): ${args.slice(0, 300)} ${reply.slice(0, 300)}`);
    }
  }
  if (!reply.trim() && think && finish === 'length') {
    console.log('all the tokens went into thinking: once more without thinking');
    return askOpenRouter(text, raw, tool, false, sys);
  }
  if (!reply.trim()) throw new Error(`openrouter: empty reply (${finish})`);
  return raw ? reply : (reply.match(/```(?:ts|typescript)?\n([\s\S]*?)```/)?.[1] ?? reply);
}

// `first`: the model asked first (an empty answer is asked once more of FALLBACK, below)
// Vertex now and then stalls mid-answer or is out of capacity (429) for a moment (18.11: 3.8 Flash went silent for
// 45 s on a space battle and the player got a 502). Such a failure is asked once more before it is given up.
async function ask(text, raw = false, tool, first = model, sys = selectedSystem) {
  try {
    return await askOnce(text, raw, tool, first, sys);
  } catch (error) {
    if (!/stopped mid-answer|sent nothing|RESOURCE_EXHAUSTED|"code": 429|"code": 503/.test(String(error))) throw error;
    console.log(`vertex: ${String(error.message ?? error).slice(0, 120)} — once more`);
    return askOnce(text, raw, tool, first, sys);
  }
}

async function askOnce(text, raw = false, tool, first = model, sys = selectedSystem) {
  if (AGY) return askAgy(text, raw, tool, sys);
  if (OR) return askOpenRouter(text, raw, tool, undefined, sys);
  const started = Date.now();
  // the twin to Flash thinks little: its job is to answer fast
  const thinking = (which) => (which === model ? process.env.CODER_THINKING : 'LOW');
  const bodyFor = (which) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [...picture, { text }] }],
      ...(tool && { tools: [{ functionDeclarations: [tool] }], toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tool.name] } } }),
      generationConfig: {
        maxOutputTokens: 32000,
        ...(thinking(which) && { thinkingConfig: { thinkingLevel: thinking(which), ...(THOUGHTS && { includeThoughts: true }) } }),
      },
    });
  // One request: resolves with its stream once the first piece of it has come.
  const attempts = [];
  const launch = (which = first) => {
    const stop = new AbortController();
    const answered = (async () => {
      const response = await fetch(
        `https://aiplatform.googleapis.com/v1beta1/projects/${project}/locations/global/publishers/google/models/${which}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          signal: stop.signal,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-goog-user-project': project,
            // CODER_PRIORITY=1: Priority PayGo (Yury, 18.11) — ahead of the shared queue (Hydrogen waited 2…108 s for its
            // first byte on Standard), ~1.8× the token price; falls back to Standard when priority capacity is out
            ...(process.env.CODER_PRIORITY === '1' && { 'X-Vertex-AI-LLM-Request-Type': 'shared', 'X-Vertex-AI-LLM-Shared-Request-Type': 'priority' }),
          },
          body: bodyFor(which),
        },
      );
      if (!response.ok) throw new Error((await response.text()).slice(0, 600));
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      const { value } = await reader.read();
      return { reader, firstText: value ?? '', stop, which };
    })();
    answered.catch(() => {}); // a dropped twin's failure is nobody's business
    attempts.push({ stop, answered });
    return answered;
  };
  // unref: a timer still waiting must not keep the coder's process alive after the answer
  const wait = (ms) => new Promise((resolve) => setTimeout(() => resolve(undefined), ms).unref());
  let winner = await Promise.race([launch(), wait(TWIN && !tool ? HEDGE_MS : GIVE_UP_MS)]);
  if (!winner && !TWIN) {
    for (const one of attempts) one.stop.abort();
    throw new Error(`Vertex sent nothing in ${GIVE_UP_MS / 1000} s`);
  }
  if (!winner) {
    console.log(`no answer in ${HEDGE_MS / 1000} s: a second request to ${first === FALLBACK ? model : FALLBACK}`);
    winner = await Promise.race([Promise.any(attempts.map((one) => one.answered).concat(launch(first === FALLBACK ? model : FALLBACK))), wait(GIVE_UP_MS - HEDGE_MS)]); // the twin is the other model
    if (!winner) {
      for (const one of attempts) one.stop.abort();
      throw new Error(`Vertex sent nothing in ${GIVE_UP_MS / 1000} s`);
    }
  }
  for (const one of attempts) if (one.stop !== winner.stop) one.stop.abort();
  if (winner.which !== model) console.log(`answered by ${winner.which}`);
  // only the winner is read, so a twin's text never mixes in
  const shown = streaming && !tool;
  if (shown) process.stdout.write(`@@start ${winner.which}\n`);
  let reply = '';
  let usage;
  let finish; // why the model stopped: an empty reply is explained by it
  let call; // the arguments of the function call, when a tool is given
  let firstWords;
  let pending = '';
  for (let chunk = winner.firstText; ; ) {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const piece = JSON.parse(line.slice(6));
      const parts = piece.candidates?.[0]?.content?.parts ?? [];
      const words = parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('');
      const thought = parts.filter((part) => part.thought).map((part) => part.text ?? '').join('');
      if (thought && THOUGHTS) {
        for (const at of [`logs/thoughts/${name}.txt`, 'logs/thoughts/latest.txt']) appendFileSync(at, thought);
      }
      call = parts.find((part) => part.functionCall)?.functionCall.args ?? call;
      if (call && firstWords === undefined) firstWords = (Date.now() - started) / 1000;
      if (words && firstWords === undefined) firstWords = (Date.now() - started) / 1000;
      reply += words;
      if (shown && words) process.stdout.write(`@@code ${JSON.stringify(words)}\n`);
      usage = piece.usageMetadata ?? usage;
      finish = piece.candidates?.[0]?.finishReason ?? finish;
    }
    // a timer of its own, cleared at every piece: wait()'s does not keep the process alive
    let idle;
    const silence = new Promise((resolve) => (idle = setTimeout(resolve, tool ? TOOL_IDLE_MS : IDLE_MS)));
    const next = await Promise.race([winner.reader.read(), silence]).finally(() => clearTimeout(idle));
    if (!next) {
      winner.stop.abort();
      throw new Error(`Vertex stopped mid-answer: nothing more for ${IDLE_MS / 1000} s (${winner.which})`);
    }
    const { value, done } = next;
    if (done) break;
    chunk = value;
  }
  const code = raw ? reply : (reply.match(/```(?:ts|typescript)?\n([\s\S]*?)```/)?.[1] ?? reply);
  console.log(
    // the tier Vertex served it on (ON_DEMAND = Standard; Priority shows its own) — whether CODER_PRIORITY took (18.11)
    `model ${((Date.now() - started) / 1000).toFixed(1)} s, first words after ${firstWords?.toFixed(1) ?? '—'} s, ${winner.which}, traffic ${usage?.trafficType ?? '?'}${reply || call ? '' : `, EMPTY reply (${finish})`}`,
    JSON.stringify(usage),
  );
  // An empty answer was written as an empty file, which passes the type check (audit item 14):
  // ask FALLBACK once instead, and fail if it is empty too.
  if (!reply && !call) {
    if (first !== FALLBACK) {
      console.log(`empty reply from ${winner.which}: once more, to ${FALLBACK}`);
      return ask(text, raw, tool, FALLBACK, sys);
    }
    throw new Error(`empty reply from ${winner.which} (${finish})`);
  }
  return tool ? call : code;
}
function typecheck(again = true) {
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    return '';
  } catch (error) {
    const out = String(error.stdout ?? '');
    // A tsc that was killed (out of memory) or never started prints no "error TS": that is no check
    // at all, and an empty filter below called the file clean (audit item 14). Once more, then fail.
    if (!/error TS\d+/.test(out)) {
      const why = `${error.signal ?? `exit ${error.status}`} ${String(error.stderr ?? '').trim().slice(0, 300)}`.trim();
      if (again) {
        console.log(`the type check did not run (${why}): once more`);
        return typecheck(false);
      }
      throw new Error(`the type check did not run: ${why}`);
    }
    // Only this file's errors: other files may be mid-edit by someone else.
    return out
      .split('\n')
      .filter((line) => line.startsWith(file))
      .join('\n');
  }
}

// Applies SEARCH/REPLACE blocks to `source`. Each SEARCH must be found exactly once: as it is, or
// ignoring spaces at line ends. Returns the new text, or throws saying which block did not fit.
function applyEdits(source, edits) {
  const blocks = (edits ?? []).map((edit) => [null, String(edit.search ?? ''), String(edit.replace ?? '')]);
  if (!blocks.length) throw new Error('no edits in the answer');
  const trim = (text) => text.split('\n').map((line) => line.trimEnd()).join('\n');
  let result = source;
  blocks.forEach(([, search, replace], i) => {
    let found = result.split(search).length - 1;
    if (found !== 1) {
      result = trim(result);
      search = trim(search);
      found = result.split(search).length - 1;
    }
    if (found !== 1) throw new Error(`block ${i + 1}: SEARCH found ${found} times, must be exactly once`);
    result = result.replace(search, () => replace);
  });
  return result;
}

const EDIT_TOOL = {
  name: 'edit_file',
  description: 'Replaces pieces of the current file. Each search text must occur in the file exactly once: ' +
    'take enough whole lines to be unique, and no more than needed.',
  parameters: {
    type: 'OBJECT',
    properties: {
      edits: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            search: { type: 'STRING', description: 'exact lines from the current file' },
            replace: { type: 'STRING', description: 'the lines that take their place' },
          },
          required: ['search', 'replace'],
        },
      },
    },
    required: ['edits'],
  },
};

// The model changes `current` by calling edit_file; returns the new text or throws when an edit does not fit.
// As a function call, not as text: asked for SEARCH/REPLACE text, Gemini 4 Hydrogen tried to call an edit
// tool anyway and returned nothing (MALFORMED_FUNCTION_CALL, 5 times of 8, 12.11) — so it gets the tool.
async function editFile(task, current, sys = selectedSystem, who = model) {
  const answer = await ask(`${task}\nCall edit_file with the edits.`, true, EDIT_TOOL, who, sys);
  if (streaming && Array.isArray(answer?.edits)) {
    const edits = answer.edits.map((edit) => ({ search: String(edit.search ?? ''), replace: String(edit.replace ?? '') }));
    process.stdout.write(`@@edits ${JSON.stringify(edits)}\n`);
  }
  const edited = applyEdits(current, answer?.edits);
  console.log(`edit: ${answer.edits.length} blocks applied`);
  return edited;
}

// Edits as plain text (Yury, 18.11: «делай правильно кусками»): through OpenRouter Claude thinks, and a forced tool
// call is refused with thinking on (400), so a change went as a whole rewrite — 15 s for one line. Plain SEARCH/REPLACE
// blocks need no tool: a small change comes back in seconds. A reply with no blocks but a whole ```ts file is taken as
// the whole file (a new thing written from scratch).
const TEXT_EDIT_FORMAT = '\n\nReply with the changes only, as one or more blocks exactly like this:\n' +
  '<<<<<<< SEARCH\n(lines copied exactly from the current file, enough to be found once)\n=======\n(the lines that replace them)\n>>>>>>> REPLACE\n' +
  'Nothing else around the blocks. If you rewrite it from scratch (something else entirely), reply instead with the whole ' +
  'new file in one ```ts block.';
async function editFileText(task, current, sys = selectedSystem, who = model) {
  const reply = await ask(task + TEXT_EDIT_FORMAT, true, undefined, who, sys);
  const blocks = [...reply.matchAll(/<{7} SEARCH\n([\s\S]*?)\n={7}\n([\s\S]*?)\n?>{7} REPLACE/g)].map((m) => ({ search: m[1], replace: m[2] }));
  if (!blocks.length) {
    const whole = reply.match(/```(?:ts|typescript)?\n([\s\S]*?)```/)?.[1];
    if (whole && /feature\(/.test(whole)) {
      console.log('edit: a whole new file');
      return whole;
    }
    throw new Error('no SEARCH/REPLACE blocks in the reply');
  }
  if (streaming) process.stdout.write(`@@edits ${JSON.stringify(blocks)}\n`);
  const edited = applyEdits(current, blocks);
  console.log(`edit: ${blocks.length} text blocks applied`);
  return edited;
}

async function change() {
  const current = baseSource || readFileSync(process.env.CODER_BASE, 'utf8');
  const task = `${request}\n\nThat is already built. Current file:\n\`\`\`ts\n${current}\`\`\`\n\nNow the player asks to change it: ` +
    `«${process.env.CODER_CHANGE}»\nChange only what this request needs; keep everything else exactly as it is. ` +
    // 14.11: «make it film quality» on a dinosaur the player had asked to be drawn in code brought the ready model back
    'Keep the way the thing is made: a thing built in code stays built in code — a request to improve it means better ' +
    'shapes, materials, detail and motion of that same thing, never swapping it for a model file (and a model is never ' +
    'swapped for shapes), unless the player asks for exactly that.' +
    // with no director (PUNTO_NO_DIRECTOR=1) every phrase while something stands comes here: the coder tells a change
    // from a new thing itself
    // the scene grows phrase by phrase, with the director or without (18.11)
    (true
      ? ' The scene grows phrase by phrase: what the phrase asks joins what stands (a rocket flying from the Earth to Mars ' +
        'is added to the solar system). Only when the phrase plainly asks for something else in its place — a whole other ' +
        'game or thing, nothing to do with this one — write a new file from scratch: the old one goes. When unsure, add.' +
        // 18.11: «пусть с потолка падают большие фигуры тетриса из стекла» on a wall board → pieces fell inside the board
        ' If it changes the scale or the place — from the ceiling, around me, all over the room, huge, out of the walls — ' +
        'rebuild as much as that needs: a thing on a wall or a table may become a game of the whole room, then drop ' +
        '`stands` and put its parts at the real ceiling, walls and floor with the room helpers. Do the asked thing in ' +
        'full, not a token of it.'
      : '');
  if (OR) {
    try {
      return await editFileText(task, current);
    } catch (error) {
      console.log(`edit: ${error.message}; asking for the whole file`);
      return ask(`${task}\nReply with the complete changed file in one \`\`\`ts block and nothing else.`);
    }
  }
  if (process.env.CODER_EDIT === 'whole') {
    console.log('edit: whole file asked');
    return ask(`${task}\nReply with the complete changed file in one \`\`\`ts block and nothing else.`);
  }
  if (SMALL) {
    try {
      const edited = await editFile(task, current, SMALL_SYSTEM);
      console.log('small: done with the short prompt');
      return edited;
    } catch (error) {
      console.log(`small: ${error.message}; the usual way`);
    }
  }
  try {
    return await editFile(task, current);
  } catch (error) {
    console.log(`edit: ${error.message}; asking for the whole file`);
    return ask(`${task}\nReply with the complete changed file in one \`\`\`ts block and nothing else.`);
  }
}

const started = Date.now();
const WHOLE = '\n\nReply with the complete file in one ```ts block and nothing else.';
const fenced = (code) => `\`\`\`ts\n${code}\`\`\``;

// A repair: the file and what is wrong with it. First by edits (seconds: one wrong line is not a
// reason to rewrite 500), the whole file when the edits do not fit.
async function repair(code, trouble, sys = system) {
  const task = `${request}\n\nYour file:\n${fenced(code)}\n\n${trouble}\n\nFind the cause and fix only that; keep everything else exactly as it is.`;
  // CODER_EDIT=whole: repairs go as whole files too (18.11, Sonnet through OpenRouter: the edit tool came back «400»
  // with thinking on, and the repair took a failed call plus a whole rewrite — 36 s)
  if (OR) {
    try {
      return await editFileText(task, code, sys, REPAIR_MODEL);
    } catch (error) {
      console.log(`repair: ${error.message}; asking for the whole file`);
      return ask(task + WHOLE, false, undefined, REPAIR_MODEL, sys);
    }
  }
  if (process.env.CODER_EDIT === 'whole') return ask(task + WHOLE, false, undefined, REPAIR_MODEL, sys);
  try {
    return await editFile(task, code, sys, REPAIR_MODEL);
  } catch (error) {
    console.log(`repair: ${error.message}; asking for the whole file`);
    return ask(task + WHOLE, false, undefined, REPAIR_MODEL, sys);
  }
}

if (process.env.CODER_BASE && process.env.CODER_ERROR) {
  writeFileSync(file, await repair(baseSource || readFileSync(process.env.CODER_BASE, 'utf8'),
    `It passed the type check but failed when loaded into the scene:\n${process.env.CODER_ERROR}`, system));
} else {
  writeFileSync(file, process.env.CODER_CHANGE ? await change() : await ask(request + WHOLE));
}
streaming = false; // what follows are repairs of this file
let errors = typecheck();
console.log(`first attempt: ${errors ? errors.split('\n').filter(Boolean).length + ' type errors' : 'clean'}`);
// which errors: the repeating ones are closed in knowledge/ so the second pass is not needed
for (const line of errors.split('\n').filter(Boolean).slice(0, 6)) console.log(`  type error: ${line.replace(file, '').slice(0, 260)}`);
for (let pass = 1; errors && pass <= 2; pass++) {
  // Missing-symbol/module errors may mean a topic was not selected; bring the whole prompt on those or on pass 2.
  const code = readFileSync(file, 'utf8');
  const trouble = `TypeScript errors:\n${errors}`;
  const missingTopic = /error TS230[457]|error TS2339|error TS2552|error TS2724/.test(errors);
  const repairSystem = pass === 2 || missingTopic ? system : selectedSystem;
  writeFileSync(file, pass === 1 ? await repair(code, trouble, repairSystem) : await ask(`${request}\n\nYour file:\n${fenced(code)}\n\n${trouble}${WHOLE}`, false, undefined, REPAIR_MODEL, system));
  errors = typecheck();
  console.log(`after repair${pass === 2 ? ' 2' : ''}: ${errors ? errors : 'clean'}`);
}
console.log(`total ${((Date.now() - started) / 1000).toFixed(1)} s`);
