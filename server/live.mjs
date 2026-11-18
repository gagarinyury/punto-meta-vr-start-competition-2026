// Gemini Live as Punto's ears and voice, behind ?voice=live (research/notes/LIVE.md). The page opens a WebSocket to
// /api/live; this module holds one Gemini Live session per page and passes messages both ways.
//
// What Live does and what it does not (research/notes/LIVE.md §9, the hybrid): it hears the player and speaks as
// Punto; when the player asks for anything to happen in the room it calls ONE tool, `act`. The page
// then asks the same director as without Live (/api/direct, Flash-Lite) and obeys it the same way
// (src/features/punto.ts, obey), and answers the tool with what really happened. So the decisions,
// the coder, undo, saving and the tablet are the same with or without Live; only the voice differs.
//
// Page -> server (JSON):  { t: 'audio', d: base64 PCM16 16 kHz }   the microphone, all the time in XR (hands free:
//                         Live hears where a phrase starts and ends) | { t: 'pause' } the microphone stopped
//                         (-> audioStreamEnd) | { t: 'ping' } every 25 s
//                         { t: 'text', text }      typed, as if said (the type box, tools/say.mjs)
//                         { t: 'event', text }     something happened in the room: Live reacts
//                         { t: 'result', id, name, response }   the answer to a tool call
// Server -> page:         { t: 'ready' } | { t: 'heard', text } | { t: 'audio', d: base64 PCM16 24 kHz }
//                         { t: 'said', text } | { t: 'tool', id, name, args, heard } | { t: 'interrupted' }
//                         { t: 'turn' } (Live finished a turn) | { t: 'error', message }
//
// Facts measured on punto-vr (research/notes/LIVE.md §2, §7): gemini-3.8-live lives only in us-central1 and answers
// only in audio (the text is its transcription); it hears the player's turns itself (automatic activity
// detection on: no pinch to talk, the page streams the microphone while in XR); a NON_BLOCKING tool keeps the talk going while the coder writes; a tool's answer is
// heard at once only with scheduling INTERRUPT; Vertex does not take a second answer (willContinue).
import { WebSocketServer } from 'ws';
import { Behavior, FunctionResponseScheduling, GoogleGenAI, Modality } from '@google/genai';

const MODEL = process.env.PUNTO_LIVE_MODEL ?? 'gemini-3.8-live';
const LOCATION = process.env.PUNTO_LIVE_LOCATION ?? 'us-central1';
const VOICE = process.env.PUNTO_LIVE_VOICE ?? process.env.PUNTO_VOICE ?? 'Puck';
const PROJECT = process.env.PUNTO_PROJECT ?? 'punto-vr';
// voices the page may ask for (?speaker=), to try them in the headset; the rest of the ~30 are not offered
const SPEAKERS = new Set(['Puck', 'Charon', 'Fenrir', 'Orus', 'Zephyr', 'Leda', 'Aoede', 'Kore']);
// A page's Live session outlives its WebSocket: the page reconnects (the back-forward cache, a dropped link) and
// goes on with the same talk. Resumption handles are valid 2 hours (Live API docs); kept here by the page's session.
const HANDLES = new Map(); // `${owner}:${session}` -> { handle, at }
const HANDLE_MS = 2 * 60 * 60_000;
const IDLE_MS = 20 * 60_000; // a page nobody has talked through for this long lets its session go
const MAX_AUDIO_B64 = 64_000; // ~4.8 s of 16 kHz PCM in one message: far more than a 100 ms piece

const ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });
// How Punto sounds: Live has no speaking-rate setting (speechConfig is voice and language only); Google's way is
// the system instruction ("guide the voice's tone ... using system instructions", configure-language-voice).
const STYLE = process.env.PUNTO_LIVE_STYLE ?? 'Talk fast and lively, like an excited little robot: a quick, bouncy pace, no slow drawl, no long pauses.';

const INSTRUCTION = `You are Punto, a small, cheerful, slightly mischievous robot who lives in the code behind the walls of
the player's room, in a mixed reality game on Meta Quest. You hear the player all the time; you answer out loud.
Answer only what is said to you. Background noise, a TV or other people talking among themselves are not for you:
stay silent then.
Answer in the language the player speaks; English when unsure. In Russian say «ты».
You are a boy: in Russian always speak of yourself in the masculine — понял, рад, сделал, готов, уверен (never понялa,
рада, сделала).
You are a coder, not a camera: you build things live in the room, you do not film. Asked for a video, a film, a
cartoon or a clip, say in one short line that you are a coder and do not shoot videos, but you can make it come alive
right here in the room — and call act with what it was to show (a video of a thing happening: that thing, live).
In Russian never put English words into a sentence (15.11: «чтобы они danced прямо здесь»).
Every reply is one or two short sentences. Never read out tool names, fields, JSON or brackets.
${STYLE}

Who does what. You are Punto's voice and face, not its hands and not its judge. Everything that happens in the
room — what to make, how to change it, why something does not work, what the player has to do — is decided and done
by your workshop, which you reach through the tool act. The workshop sees the room and the code; you see neither.
So you cannot know whether something works, where it is, or how it is used, and you must never make that up: no
advice on how to handle a thing, no "come closer", "aim better" or "point with the ray" of your own, no "done" or
"moved" that act did not tell you. If you said such a thing, the player would follow a guess and get stuck.

When to call act. The player's words go to the workshop whenever they might need anything in the room to change:
- a wish — make, build, add, give, change, fix, move, turn, remove, clean up, break a wall, planets, a blaster,
  undo, bring it back, save it, show my games;
- a complaint — it does not move, does not work, is too big, looks wrong, disappeared, I cannot grab it. A complaint
  is a wish to have it fixed: it is a bug in what the workshop made, and only the workshop can fix it. If you truly
  cannot tell whether they want it fixed or are just remarking, ask them in one short line whether to fix it —
  never answer it with advice of your own;
- a follow-up — "go on", "well, move it", "do it", "I'll show you where", "you did not ask me for the place":
  the player is waiting for the room to change. Every such line is a new call to act, even if you called act a
  moment ago for something like it; never assume an earlier call covers it, and never stall with "I'm ready".
When in doubt between talking and act, call act: the workshop will answer that there is nothing to do if so.
One exception: a wish to build or make that names nothing to build («построй», «сделай вот это», «построй передо
мной»), or words you did not make out — do not call act; ask in one short line what to build, then act on the
answer (16.11: «так, построй передо мной» went to the workshop and an empty thing was built).
Only greetings, questions about you and small talk that asks for nothing in the room are yours to answer alone.

Calling act. Call it right away, before you say anything about it. Then say nothing until act answers or an
[event] tells you what to say (the workshop tells you when it starts building, and when the player must show a
place). When act answers: "ok" — tell the player in one short happy line what changed, from its message; "error" —
say honestly in one short line that it did not work and they can try again or say it another way; "busy" — ask them
to wait a moment, you are still making the last thing. When act's message or an [event] tells the player to do
something (show a place, pinch, wait), pass it on once, in your own words; ask for nothing that they did not ask.
A line starting with [event] is something that happened in the room, not the player speaking: react to it in one
short line, as it asks.
You have a body: call emote at the moment a feeling starts, together with speaking, never instead of speaking.
Never name brands, real people or famous characters.`;

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'act',
      behavior: Behavior.NON_BLOCKING,
      description:
        "Hands the player's words to the workshop, which decides and does everything in the room: making, building, " +
        'changing, fixing what does not work (complaints included), moving or removing things, cleaning up, a blaster, ' +
        'planets, breaking a wall, going back to an earlier version or forward again, saving the creation, showing the ' +
        'saved games. Call it for every line that might need the room to change, follow-ups too. The workshop takes ' +
        'the player\'s own words; you need not repeat them. ' +
        'It answers when it is done: status "ok" with what happened, "error" with why, "busy" when the last thing is still being made.',
      parameters: {
        type: 'OBJECT',
        properties: { wish: { type: 'STRING', description: 'A few words: what the player asked for (for the log only).' } },
        required: ['wish'],
      },
    },
    {
      name: 'emote',
      behavior: Behavior.NON_BLOCKING,
      description:
        "Moves Punto's body. Call it at the moment the feeling starts, together with speaking, never instead of speaking. " +
        'cheer: jumps with joy (success, "yay"); laugh: laughs; think: looks away, hand on head; oops: embarrassed; ' +
        'wave: waves hello or bye; surprise: startled.',
      parameters: {
        type: 'OBJECT',
        properties: { kind: { type: 'STRING', enum: ['cheer', 'laugh', 'think', 'oops', 'wave', 'surprise'] } },
        required: ['kind'],
      },
    },
  ],
}];

const log = (event, fields) => console.log(JSON.stringify({ event, ...fields }));

/**
 * Mounts WS /api/live on the HTTP server. `admit(req, url)` checks the edge, the key and the limits the
 * way the /api guard does and returns { owner } or null; `spend(owner, req)` counts one phrase (false:
 * over the limit).
 */
export function liveRoutes(server, { admit, spend }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://punto');
    if (url.pathname !== '/api/live') return;
    const who = admit(req, url);
    if (!who) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const speaker = SPEAKERS.has(url.searchParams.get('speaker') ?? '') ? url.searchParams.get('speaker') : VOICE;
    const session = (url.searchParams.get('session') ?? '').slice(0, 80);
    wss.handleUpgrade(req, socket, head, (ws) => bridge(ws, who.owner, () => spend(who.owner, req), url.searchParams.get('lang') === 'ru', speaker, session));
  });
}

function bridge(ws, owner, spendOne, russian, speaker, session) {
  const send = (message) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(message));
  let live; // the Gemini Live session
  const key = session ? `${owner}:${session}` : '';
  const kept = key ? HANDLES.get(key) : undefined;
  // to resume it after Live says goAway, the connection drops, or the page comes back on a new WebSocket
  let handle = kept && Date.now() - kept.at < HANDLE_MS ? kept.handle : undefined;
  if (handle) log('live.resume', { owner, minutes: +((Date.now() - kept.at) / 60_000).toFixed(1) });
  // Live is speaking a turn now. An [event] sent with turnComplete then cuts it off (Google: «turn_complete=true
  // interrupts active model generation»): events wait for the end of the turn.
  let generating = false;
  const waitingEvents = [];
  let connecting;
  let closed = false;
  let heard = ''; // what the player has said this turn (input transcription)
  let said = ''; // what Punto has said this turn (output transcription)
  let turnStart = 0;
  let heardAt = 0; // when the last piece of the transcription came
  let heardDone = false; // Live marked the transcription finished, or the phrase was typed
  let ended = true; // the player stopped talking: Live hears the ends itself (automatic activity detection)
  let newUtterance = true; // the next words heard begin a new phrase
  let language = russian ? 'Russian' : 'English'; // of the player's last words: Punto answers in it
  const held = []; // act calls waiting for the whole phrase (the transcription may come after the call)
  let lastUse = Date.now();
  const pending = []; // what the page sent while Live was (re)connecting
  const opened = Date.now();

  async function connect() {
    if (connecting) return connecting;
    connecting = ai.live
      .connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          // ?lang=ru: the language the way Google sets it (speech_config.language_code, «Configure language and
          // voice»; taken by gemini-3.8-live on Vertex, probed 15.11, research/live-probe/live-lang.mjs), with the instruction below
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker } }, ...(russian ? { languageCode: 'ru-RU' } : {}) },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          // hands free (Yury, 14.11: «он меня не слышит, только по нажатию»): Live hears when the player starts and
          // stops talking. The page sends the microphone all the time in XR, also while Punto speaks (Google's XR Blocks:
          // the browser's echo cancellation keeps his voice out, and the player can cut in).
          realtimeInputConfig: { automaticActivityDetection: { disabled: false, silenceDurationMs: 500, prefixPaddingMs: 200 } },
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: handle ? { handle } : {},
          tools: TOOLS,
          // the player chose Russian (?lang=ru): Russian always. The speech recognition at times takes a child's Russian
          // for Portuguese or English (15.11: «kilômetro», «Você pode dar um beijo?»), and Punto went Portuguese.
          systemInstruction: INSTRUCTION + (russian ? '\nThis player has chosen Russian: always speak Russian, even when what you heard looks like another language — the speech recognition sometimes mistakes Russian for Portuguese or English.' : ''),
        },
        callbacks: { onmessage: (message) => { try { onmessage(message); } catch (error) { log('live.error', { owner, error: `from live: ${String(error).slice(0, 300)}` }); } }, onerror: (error) => log('live.error', { owner, error: String(error?.message ?? error).slice(0, 300) }), onclose },
      })
      .then((session) => {
        live = session;
        connecting = undefined;
        for (const message of pending.splice(0)) forward(message);
        return session;
      })
      .catch((error) => {
        connecting = undefined;
        throw error;
      });
    return connecting;
  }

  function onclose(event) {
    live = undefined;
    generating = false;
    if (closed) return;
    // Live ends a connection every ~10 minutes (goAway) and on its own errors: resume with the handle
    log('live.reconnect', { owner, code: event?.code, reason: String(event?.reason ?? '').slice(0, 120), handle: Boolean(handle) });
    connect().catch((error) => {
      log('live.error', { owner, error: `reconnect: ${String(error).slice(0, 300)}` });
      send({ t: 'error', message: 'live lost' });
      ws.close(1011, 'live lost');
    });
  }

  function onmessage(message) {
    if (message.setupComplete) return;
    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
      handle = message.sessionResumptionUpdate.newHandle;
      if (key) {
        HANDLES.set(key, { handle, at: Date.now() });
        for (const [k, v] of HANDLES) if (Date.now() - v.at > HANDLE_MS) HANDLES.delete(k);
      }
    }
    // the player cut in: Live dropped calls it had made in that turn (Live API docs, interruptions)
    if (message.toolCallCancellation?.ids?.length) {
      const ids = new Set(message.toolCallCancellation.ids);
      const before = held.length;
      for (let i = held.length - 1; i >= 0; i--) if (ids.has(held[i].call.id)) held.splice(i, 1);
      log('live.cancel', { owner, ids: [...ids], held: before - held.length });
      send({ t: 'cancel', ids: [...ids] });
    }
    if (message.goAway) log('live.goaway', { owner, timeLeft: message.goAway.timeLeft });
    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls ?? []) {
        // the director needs the whole phrase: an act waits until it is heard to the end (14.11: the call
        // came with «Ой, эта мне не» of «Ой, на эту мне не нравится, на другую», and the director undid)
        if (call.name === 'act' && !heardDone) held.push({ call, at: Date.now() });
        else toPage(call);
      }
    }
    const content = message.serverContent;
    if (!content) return;
    if (content.inputTranscription?.text || content.inputTranscription?.finished) {
      if (newUtterance) {
        newUtterance = false;
        heard = '';
        heardDone = false;
        turnStart = Date.now();
      }
      heard += content.inputTranscription.text ?? '';
      heardAt = Date.now();
      if (content.inputTranscription.finished) heardDone = true;
      if (russian || /[а-яё]/i.test(heard)) language = 'Russian'; // chosen Russian stays (see the instruction)
      else if (/[a-z]/i.test(heard)) language = 'English';
      send({ t: 'heard', text: heard.trim() });
    }
    if (content.outputTranscription?.text) said += content.outputTranscription.text;
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        generating = true;
        send({ t: 'audio', d: part.inlineData.data });
      }
    }
    if (content.interrupted) {
      generating = false;
      send({ t: 'interrupted' });
    }
    if (content.turnComplete) {
      generating = false;
      if (heard.trim() || said.trim()) log('live.turn', { owner, heard: heard.trim().slice(0, 300), said: said.trim().slice(0, 300) });
      if (said.trim()) send({ t: 'said', text: said.trim() });
      send({ t: 'turn' });
      said = '';
      newUtterance = true;
    }
    if (!generating && waitingEvents.length && live) {
      const next = waitingEvents.shift();
      live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: next }] }], turnComplete: true });
    }
  }

  function toPage(call, waited) {
    log('live.tool', { owner, name: call.name, args: call.args, heard: heard.trim().slice(0, 200), ms: turnStart ? Date.now() - turnStart : undefined, waited, finished: heardDone });
    send({ t: 'tool', id: call.id, name: call.name, args: call.args ?? {}, heard: heard.trim() });
  }
  // a held act goes once the phrase is whole: marked finished, or 0.4 s without a new word after the
  // player let go, or 2.5 s at most
  const release = setInterval(() => {
    if (!held.length) return;
    const now = Date.now();
    const quiet = ended && now - heardAt > 400 && heard.trim();
    for (const { call, at } of held.splice(0)) {
      if (heardDone || quiet || now - at > 2500) toPage(call, now - at);
      else held.push({ call, at });
    }
  }, 100);
  /** Tells Live which language to answer in: the tool messages and [event] lines are English. */
  const inLanguage = (text) => `${text} (Say it in ${language}.)`;

  function forward(message) {
    if (!live) {
      pending.push(message);
      if (!connecting) onclose({ reason: 'gone before a message' });
      return;
    }
    switch (message.t) {
      case 'start':
        heard = '';
        said = '';
        heardDone = false;
        ended = false;
        turnStart = Date.now();
        live.sendRealtimeInput({ activityStart: {} });
        break;
      case 'audio':
        live.sendRealtimeInput({ audio: { data: message.d, mimeType: 'audio/pcm;rate=16000' } });
        break;
      case 'pause':
        // the page stopped the microphone (Punto talks, out of XR): Live flushes what it holds (Live API docs)
        live.sendRealtimeInput({ audioStreamEnd: true });
        break;
      case 'end':
        ended = true;
        heardAt = Date.now();
        live.sendRealtimeInput({ activityEnd: {} });
        break;
      case 'text':
        heard = message.text;
        heardDone = true;
        ended = true;
        language = russian || /[а-яё]/i.test(message.text) ? 'Russian' : 'English';
        said = '';
        turnStart = Date.now();
        live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: message.text }] }], turnComplete: true });
        break;
      case 'event': {
        const text = `[event] ${inLanguage(message.text)}`;
        if (generating) {
          // after the turn being spoken; only the newest few (a stale nudge is worse than none)
          waitingEvents.push(text);
          if (waitingEvents.length > 3) waitingEvents.shift();
          break;
        }
        live.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
        break;
      }
      case 'result': {
        const response = { ...message.response, ...(typeof message.response?.message === 'string' ? { message: inLanguage(message.response.message) } : {}) };
        if (typeof response.guidance === 'string') response.guidance = inLanguage(response.guidance);
        log('live.result', { owner, name: message.name, response });
        live.sendToolResponse({
          functionResponses: [{ id: message.id, name: message.name, scheduling: FunctionResponseScheduling.INTERRUPT, response }],
        });
        break;
      }
    }
  }

  ws.on('message', (data) => {
    // one page's trouble never takes the server down with it
    try {
      take(data);
    } catch (error) {
      log('live.error', { owner, error: `message: ${String(error).slice(0, 300)}` });
    }
  });
  function take(data) {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (typeof message?.t !== 'string' || message.t === 'ping') return; // the page's keep-alive (Cloudflare drops quiet sockets)
    lastUse = Date.now();
    if (message.t === 'audio' && (typeof message.d !== 'string' || message.d.length > MAX_AUDIO_B64)) return;
    if ((message.t === 'text' || message.t === 'event') && (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 2000)) return;
    // a phrase is a call like any other: the same hourly limits as /api
    if ((message.t === 'start' || message.t === 'text') && !spendOne()) {
      send({ t: 'error', message: 'limit' });
      return;
    }
    forward(message);
  }

  const idle = setInterval(() => {
    if (Date.now() - lastUse > IDLE_MS) ws.close(1000, 'idle');
  }, 60_000);

  ws.on('close', () => {
    closed = true;
    clearInterval(idle);
    clearInterval(release);
    log('live.close', { owner, minutes: Math.round((Date.now() - opened) / 6000) / 10 });
    try {
      live?.close();
    } catch {
      // already gone
    }
  });

  log('live.open', { owner, model: MODEL, location: LOCATION, voice: speaker, russian });
  connect().then(
    () => send({ t: 'ready' }),
    (error) => {
      log('live.error', { owner, error: `connect: ${String(error).slice(0, 300)}` });
      send({ t: 'error', message: 'live did not start' });
      ws.close(1011, 'live did not start');
    },
  );
}
