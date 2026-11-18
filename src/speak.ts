// Punto's voice: a line of text -> speech from the server (/api/say, WAV), or
// a line recorded in advance (public/voice/*.wav) -> played FROM Punto: a
// Three.js PositionalAudio on Punto, heard through the AudioListener that
// IWSDK's AudioSystem keeps on the player's head, so headphones tell where
// Punto is. `level()` is the loudness right now, for the mouth.
import {
  AudioContext as SharedAudio,
  type AudioListener,
  type Object3D,
  PositionalAudio,
  type World,
} from '@iwsdk/core';
import { api } from './api.js';

let analyser: AnalyserNode | undefined;
let samples: Float32Array<ArrayBuffer> | undefined;
let emitter: { listener: AudioListener; object: Object3D } | undefined;
let muffle: number | null = null;
/** Hz: the voice is heard through a wall (only the low part of it gets through); null = clear again. */
export function muffled(hz: number | null): void {
  muffle = hz;
}
const lines = new Map<string, Promise<AudioBuffer>>();

/** The one audio context IWSDK and Three.js share (IWSDK resumes it when XR starts). */
export function context(): AudioContext {
  // the typings call it Three's class; it is the browser's AudioContext
  const ctx = SharedAudio.getContext() as unknown as AudioContext;
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    samples = new Float32Array(analyser.fftSize);
  }
  return ctx;
}

/** Makes Punto's voice come from `object`. Call once the world is up. */
export function speakFrom(world: World, object: Object3D): void {
  let listener: AudioListener | undefined;
  world.player.head.traverse((child) => {
    if ((child as AudioListener).type === 'AudioListener') listener = child as AudioListener;
  });
  if (listener) emitter = { listener, object };
  else console.warn('[speak] no AudioListener on the head: the voice will not be spatial');
}

function remember(key: string, load: () => Promise<ArrayBuffer>): Promise<AudioBuffer> {
  let line = lines.get(key);
  if (!line) {
    line = load().then((bytes) => context().decodeAudioData(bytes));
    line.catch(() => lines.delete(key)); // a failed line may be tried again
    lines.set(key, line);
  }
  return line;
}

/** Fetches and decodes a line ahead of time, so saying it later starts at once. */
export function prepare(text: string): Promise<AudioBuffer> {
  return remember(text, async () => {
    // the server gives up after 20 s (SAY_LIMIT_MS); this is for a call that never comes back at all
    const { audio: wav } = await api<{ audio: string }>('say', { text }, 25_000);
    return Uint8Array.from(atob(wav), (c) => c.charCodeAt(0)).buffer;
  });
}

/** The same for a line recorded in advance (public/voice/*.wav). */
export function prepareClip(url: string): Promise<AudioBuffer> {
  return remember(url, async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`[speak] ${url}: ${response.status}`);
    return response.arrayBuffer();
  });
}

/** Says a line made on the fly by the server; resolves when it has been said. */
export async function say(text: string): Promise<void> {
  await play(await prepare(text));
}

/** Plays a recorded line; resolves when it has been said. */
export async function sayClip(url: string): Promise<void> {
  await play(await prepareClip(url));
}

// How many recorded lines are playing now: the live voice keeps the microphone shut meanwhile, or Live hears
// Punto's own recorded voice as the player (14.11: two Puntos talking at once).
let recordedPlaying = 0;
export const recordedSpeaking = (): boolean => recordedPlaying > 0;

async function play(buffer: AudioBuffer): Promise<void> {
  recordedPlaying++;
  try {
    await playBuffer(buffer);
  } finally {
    recordedPlaying--;
  }
}

// A line ends when its sound says so, or when it has surely played: a sound context that died
// (the headset slept) never says it, and Punto waited for ever (audit item 6).
const playedOut = (buffer: AudioBuffer, stop: () => void) =>
  new Promise<void>((resolve) =>
    setTimeout(() => {
      stop();
      resolve();
    }, buffer.duration * 1000 + 1500),
  );

async function playBuffer(buffer: AudioBuffer): Promise<void> {
  const ctx = context();
  // resume() waits for the sound to come back, which a dead context never does
  if (ctx.state === 'suspended') await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 1000))]);
  if (!emitter) {
    // no listener yet (before XR): plain stereo
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser!).connect(ctx.destination);
    await Promise.race([
      new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      }),
      playedOut(buffer, () => {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // never started
        }
      }),
    ]);
    return;
  }
  const sound = new PositionalAudio(emitter.listener);
  sound.setBuffer(buffer);
  sound.setRefDistance(1.6); // full voice at Punto's usual distance, softer further away
  const filters: AudioNode[] = [];
  if (muffle) {
    const wall = ctx.createBiquadFilter();
    wall.type = 'lowpass';
    wall.frequency.value = muffle;
    wall.Q.value = 0.5;
    filters.push(wall);
  }
  filters.push(analyser!); // the mouth listens to the same signal
  sound.setFilters(filters);
  emitter.object.add(sound);
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    (sound as { isPlaying: boolean }).isPlaying = false;
    sound.removeFromParent();
    try {
      sound.disconnect();
    } catch {
      // already disconnected
    }
  };
  await Promise.race([
    new Promise<void>((resolve) => {
      sound.onEnded = () => {
        end();
        resolve();
      };
      sound.play();
    }),
    playedOut(buffer, () => {
      if (ended) return;
      try {
        sound.stop();
      } catch {
        // never started
      }
      end();
    }),
  ]);
}

// ---- the live voice (?voice=live, src/livevoice.ts): pieces of speech as Gemini Live sends them ----
// Played a little faster than it comes (Yury, 14.11: «он медленно говорит, надо быстро»). Live itself keeps its
// pace whatever the instruction says (15-16 characters a second before and after «talk fast»), so the speed is
// the player's: a faster playback is also a little higher, which suits a small robot. ?pace=1.25 to try others.
const PACE = (() => {
  const asked = Number(new URLSearchParams(location.search).get('pace'));
  return asked >= 0.8 && asked <= 1.6 ? asked : 1.15;
})();
let streamMeter: AnalyserNode | undefined;
let streamSamples: Float32Array<ArrayBuffer> | undefined;

export interface VoiceStream {
  /** One more piece of speech: base64 PCM16 mono 24 kHz. It plays right after the pieces before it. */
  push(base64: string): void;
  /** Stops at once and drops what is queued (the player cut in). */
  stop(): void;
  /** Something is playing or queued. */
  readonly speaking: boolean;
}

/** Punto's live voice, from Punto like every line it says (the same spatial sound, the mouth follows it).
 *  Call it once speakFrom() has run. */
export function streamVoice(): VoiceStream {
  const ctx = context();
  const input = ctx.createGain();
  const meter = ctx.createAnalyser();
  meter.fftSize = 1024;
  streamMeter = meter;
  streamSamples = new Float32Array(meter.fftSize);
  if (emitter) {
    const sound = new PositionalAudio(emitter.listener);
    // the queued pieces flow through one node: Three.js keeps it where Punto is, frame by frame
    sound.setNodeSource(input as unknown as AudioBufferSourceNode);
    sound.setRefDistance(1.6);
    sound.setFilters([meter]);
    emitter.object.add(sound);
  } else {
    input.connect(meter).connect(ctx.destination); // no listener yet (before XR): plain stereo
  }
  const playing = new Set<AudioBufferSourceNode>();
  let next = 0;
  return {
    push(base64) {
      if (ctx.state === 'suspended') void ctx.resume();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      if (!pcm.length) return;
      const buffer = ctx.createBuffer(1, pcm.length, 24_000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = PACE;
      source.connect(input);
      const at = Math.max(next, ctx.currentTime + 0.05); // a little ahead, so the pieces join without clicks
      source.start(at);
      next = at + buffer.duration / PACE;
      playing.add(source);
      source.onended = () => {
        playing.delete(source);
        source.disconnect();
      };
    },
    stop() {
      for (const source of playing) {
        try {
          source.stop();
        } catch {
          // it had not started yet
        }
      }
      playing.clear();
      next = 0;
    },
    get speaking() {
      return next > ctx.currentTime;
    },
  };
}

function loudness(meter: AnalyserNode | undefined, buffer: Float32Array<ArrayBuffer> | undefined): number {
  if (!meter || !buffer) return 0;
  meter.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
}

/** Loudness of the voice right now, 0..1 (0 when silent). No allocation: call it every frame. */
export function level(): number {
  return Math.max(loudness(analyser, samples), loudness(streamMeter, streamSamples));
}
