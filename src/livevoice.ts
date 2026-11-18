// Punto's live voice, behind ?voice=live (research/notes/LIVE.md, server/live.mjs): Gemini Live hears the player while
// they pinch Punto and answers in Punto's voice, streamed. When the player asks for something to happen
// it calls the tool `act`, and the page does it as it always does (src/features/punto.ts).
//
// Hands free, Google's own way (XR Blocks, Google's WebXR SDK that runs on the Quest: src/addons/ai/GeminiManager.ts,
// src/sound/AudioListener.ts; Yury, 15.11: «сделай точно, как в XR Blocks»): in XR the microphone always goes to
// Live, also while Punto talks; the browser's echo cancellation, noise suppression and gain control keep his voice
// out (src/voice.ts), Live hears where a phrase starts and ends, and when the player cuts in Live stops its turn
// (`interrupted`: his voice stops here). The format is the one Vertex's docs ask for: PCM16 16 kHz in 40 ms pieces.
// Punto's speech comes back as PCM16 24 kHz and plays from Punto (streamVoice).
// If Live cannot be reached, or is lost for good, `lost` tells the page to go on without it.
import { liveAddress } from './api.js';
import { context, streamVoice, type VoiceStream } from './speak.js';
import { micStream } from './voice.js';

/** The page was opened with ?voice=live (not ?live=: that is a friend's link to an open game, research/notes/TABLET.md). */
export const liveWanted = (): boolean => new URLSearchParams(location.search).get('voice') === 'live';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** what the player said in this turn (Live's transcription of it) */
  heard: string;
}

export interface LiveHandlers {
  /** the player's words so far in this turn */
  heard(text: string): void;
  /** Live asks for something: answer with LiveVoice.answer(id, name, response) */
  tool(call: ToolCall): void;
  /** Punto's voice has started (true) or finished (false) */
  speaking(on: boolean): void;
  /** The microphone hears a voice now, before Live has made out a word (a level over VOICE_RMS for VOICE_PIECES
   *  pieces in a row; once per phrase): Punto turns to listen at once */
  voice?(): void;
  /** Live has finished a turn */
  turn(): void;
  /** the server refused a phrase (the hourly limit) */
  refused(why: string): void;
  /** Live is gone for good: back to the usual chain */
  lost(): void;
}

export interface LiveVoice {
  /** The microphone to Live on (in XR) or off. */
  listen(on: boolean): void;
  /** A typed phrase, taken as if it were said. */
  type(text: string): void;
  /** Something happened in the room: Live says something about it ([event] in its instruction). */
  event(text: string): void;
  /** The answer to a tool call. */
  answer(id: string, name: string, response: Record<string, unknown>): void;
  /** Punto is talking right now. */
  readonly speaking: boolean;
  /** While on, Live's voice is not played (Punto is in a scripted scene with its recorded lines). */
  hush(on: boolean): void;
  close(): void;
}

const READY_WAIT = 12_000;
const VOICE_RMS = 0.02; // of full scale (about -34 dB): speech close to the headset's microphones, not the room's hum
const VOICE_PIECES = 3; // 40 ms pieces in a row: 120 ms of voice, not a click
const PHRASE_GAP_MS = 1200; // this long quiet: the next voice is a new phrase
// a broken link comes back in seconds (the route into the headset, the back-forward cache): ~18 s of tries
const RETRIES = 8;

// Turns the microphone into PCM16 at 16 kHz in pieces of 640 samples (40 ms: Google asks for 20-40 ms pieces,
// Live API best practices; it was 100 ms till 15.11). The context runs at its
// own rate (48 kHz on the Quest): every `step` input samples are averaged into one (a simple low-pass).
// On "off" it hands over what it has, marked last.
const WORKLET = `
class PuntoPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.step = sampleRate / 16000; this.t = 0; this.acc = 0; this.n = 0;
    this.out = new Int16Array(640); this.k = 0;
    this.port.onmessage = (event) => {
      if (event.data.on) { this.on = true; this.t = 0; this.acc = 0; this.n = 0; this.k = 0; return; }
      this.on = false;
      this.port.postMessage({ pcm: this.out.slice(0, this.k), last: true });
      this.k = 0;
    };
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!this.on || !channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.acc += channel[i]; this.n++; this.t += 1;
      if (this.t < this.step) continue;
      this.t -= this.step;
      const v = Math.max(-1, Math.min(1, this.acc / this.n));
      this.acc = 0; this.n = 0;
      this.out[this.k++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.k === this.out.length) { this.port.postMessage({ pcm: this.out.slice(), last: false }); this.k = 0; }
    }
    return true;
  }
}
registerProcessor('punto-pcm', PuntoPcm);
`;

function base64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The microphone as 40 ms pieces of PCM16 16 kHz, on demand. Made once, at the first pinch. */
let mic: Promise<AudioWorkletNode> | undefined;
let source: MediaStreamAudioSourceNode | undefined;
/** the microphone track the worklet hears now */
let track: MediaStreamTrack | undefined;
let plugging: Promise<void> | undefined;

/**
 * Plugs the worklet into the open microphone stream. The browser ends the track when the page goes to the
 * back-forward cache or the headset sleeps; the site's permission stays (15.11, the headset: after going out
 * and back in, Live got only zeros and heard nothing until a reload). A new stream needs no dialog.
 */
function plugIn(node: AudioWorkletNode): Promise<void> {
  plugging ??= (async () => {
    const stream = await micStream();
    source?.disconnect();
    source = context().createMediaStreamSource(stream);
    source.connect(node);
    track = stream.getAudioTracks()[0];
  })().finally(() => (plugging = undefined));
  return plugging;
}

const micDead = (): boolean => Boolean(track) && track!.readyState !== 'live';

function microphone(): Promise<AudioWorkletNode> {
  mic ??= (async () => {
    const ctx = context();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(ctx, 'punto-pcm');
    await plugIn(node);
    // a worklet only runs when something pulls it: a silent line to the speakers
    const silent = ctx.createGain();
    silent.gain.value = 0;
    node.connect(silent).connect(ctx.destination);
    return node;
  })();
  mic.catch(() => (mic = undefined)); // tried again at the next pinch
  return mic;
}

/** The track has ended: a new one, the worklet stays. */
function revive(): void {
  if (plugging || !mic) return;
  console.warn('[live] the microphone ended, opening it again');
  void mic.then(plugIn).catch((error) => console.error('[live] no microphone', error));
}

/** Opens Punto's live voice; resolves once Live is ready, rejects if it cannot be reached. */
export function connectLive(handlers: LiveHandlers): Promise<LiveVoice> {
  const page = new URLSearchParams(location.search);
  // ?lang=ru: Russian; ?speaker=Fenrir: another of Live's voices (server/live.mjs, SPEAKERS)
  const lang = { ...(page.get('lang') === 'ru' ? { lang: 'ru' } : {}), ...(page.get('speaker') ? { speaker: page.get('speaker')! } : {}) };
  let ws: WebSocket | undefined;
  let voice: VoiceStream | undefined;
  let closedByUs = false;
  let failures = 0;
  let wasSpeaking = false;
  let listening = false;
  let hushed = false;
  // The stream stops out of XR. Google: «when the audio stream is paused for more than a
  // second, an audioStreamEnd should be sent to flush any cached audio» (Live API capabilities, automatic VAD).
  // `streaming`: pieces are going now; `pausedAt`: since when they are not; the end is sent once, a second on.
  let streaming = false;
  let pausedAt = 0;
  let endSent = true;
  const pause = () => {
    if (!streaming) return;
    streaming = false;
    pausedAt = performance.now();
    endSent = false;
  };
  const queue: string[] = []; // messages written while the socket was reconnecting

  const send = (message: Record<string, unknown>) => {
    const text = JSON.stringify(message);
    if (ws?.readyState === WebSocket.OPEN) ws.send(text);
    else if (queue.length < 200) queue.push(text);
  };

  const watch = setInterval(() => {
    const now = Boolean(voice?.speaking);
    if (now !== wasSpeaking) handlers.speaking((wasSpeaking = now));
    // only on a page in view: a hidden page's microphone is ended by the system again and again (every ~16 s, 15.11)
    if (listening && micDead() && document.visibilityState === 'visible') revive();
    if (!streaming && !endSent && performance.now() - pausedAt > 1000) {
      endSent = true;
      send({ t: 'pause' });
    }
  }, 80);
  // Cloudflare closes a WebSocket that has been quiet ~100 s (seen 14.11 in the headset): a ping keeps it
  const ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), 25_000);

  function onMessage(raw: MessageEvent) {
    let message: { t: string; [key: string]: unknown };
    try {
      message = JSON.parse(String(raw.data));
    } catch {
      return;
    }
    switch (message.t) {
      case 'audio':
        if (hushed) break; // a scripted scene is on: its recorded lines speak, not Live
        voice ??= streamVoice();
        voice.push(String(message.d));
        break;
      case 'heard':
        handlers.heard(String(message.text ?? ''));
        break;
      case 'tool':
        handlers.tool({ id: String(message.id), name: String(message.name), args: (message.args ?? {}) as Record<string, unknown>, heard: String(message.heard ?? '') });
        break;
      case 'interrupted':
        voice?.stop(); // Google: «stop playing audio and clear queued playback here»
        break;
      case 'cancel':
        // the player cut in and Live dropped the calls of that turn (an act already begun goes on)
        console.info('[live] calls cancelled', message.ids);
        break;
      case 'turn':
        handlers.turn();
        break;
      case 'said':
        console.info(`[live] Punto: ${message.text}`);
        break;
      case 'error':
        if (message.message === 'limit') handlers.refused('limit');
        else console.warn('[live]', message.message);
        break;
    }
  }

  function open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(liveAddress(lang));
      ws = socket;
      let ready = false;
      const timer = setTimeout(() => !ready && socket.close(), READY_WAIT);
      socket.onmessage = (event) => {
        if (!ready && String(event.data).includes('"t":"ready"')) {
          ready = true;
          clearTimeout(timer);
          failures = 0;
          for (const text of queue.splice(0)) socket.send(text);
          resolve();
          return;
        }
        onMessage(event);
      };
      socket.onclose = (event) => {
        clearTimeout(timer);
        if (!ready) return reject(new Error(`live: closed before ready (${event.code})`));
        if (closedByUs) return;
        // the connection dropped (Cloud Run's request timeout, the network): open it again
        console.warn(`[live] the connection dropped (${event.code}), reconnecting`);
        voice?.stop();
        reconnect();
      };
    });
  }

  function reconnect() {
    if (closedByUs) return;
    if (++failures > RETRIES) {
      console.error('[live] gone for good: back to the usual voice');
      clearInterval(watch);
      clearInterval(ping);
      handlers.lost();
      return;
    }
    setTimeout(() => open().catch(() => reconnect()), Math.min(500 * failures, 4000));
  }

  // A voice on the microphone, heard here at once (16.11, Yury: «чтобы Punto начинал слушать, как только микрофон
  // услышал звук»): Live's transcription comes a second or more into the phrase. The browser's echo cancellation
  // and noise suppression are on (src/voice.ts); Punto's own talk is skipped. 🔍 the level is a first guess: each
  // phrase logs what it was, to tune it on the headset.
  let loud = 0;
  let quietAt = 0;
  let inPhrase = false;
  function hearVoice(pcm: Int16Array) {
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / pcm.length) / 32768;
    const now = performance.now();
    if (rms < VOICE_RMS) {
      loud = 0;
      if (inPhrase && now - quietAt > PHRASE_GAP_MS) inPhrase = false;
      return;
    }
    quietAt = now;
    if (inPhrase || voice?.speaking || ++loud < VOICE_PIECES) return;
    inPhrase = true;
    console.info(`[live] a voice on the microphone (level ${rms.toFixed(3)})`);
    handlers.voice?.();
  }

  const live: LiveVoice = {
    listen(on) {
      if (on === listening) return;
      listening = on;
      if (!on) {
        pause();
        if (mic) void mic.then((node) => node.port.postMessage({ on: false }), () => {});
        return;
      }
      void context().resume();
      if (micDead()) revive();
      microphone().then(
        (node) => {
          node.port.onmessage = (event: MessageEvent<{ pcm: Int16Array; last: boolean }>) => {
            const pcm = event.data.pcm;
            if (!listening || !pcm.length) return;
            hearVoice(pcm);
            streaming = true;
            send({ t: 'audio', d: base64(pcm) });
          };
          if (listening) node.port.postMessage({ on: true });
        },
        (error) => console.error('[live] no microphone', error),
      );
    },
    type(text) {
      send({ t: 'text', text });
    },
    event(text) {
      send({ t: 'event', text });
    },
    answer(id, name, response) {
      send({ t: 'result', id, name, response });
    },
    get speaking() {
      return Boolean(voice?.speaking);
    },
    hush(on) {
      hushed = on;
      if (on) voice?.stop();
    },
    close() {
      closedByUs = true;
      live.listen(false);
      clearInterval(watch);
      clearInterval(ping);
      voice?.stop();
      ws?.close();
    },
  };

  return open().then(
    () => live,
    (error) => {
      closedByUs = true;
      clearInterval(watch);
      clearInterval(ping);
      throw error;
    },
  );
}
