// The microphone: record a phrase and hand it over as base64 webm (the server hears it).
// The stream stays open after the first permission, so a phrase starts at once.

const MIME = 'audio/webm'; // Gemini on Vertex takes audio/webm as is
const MAX_MS = 15_000; // a phrase, not a speech

let stream: MediaStream | undefined;
let opening: Promise<MediaStream> | undefined;

/**
 * Asks for the microphone. Call it from a 2D-page gesture (the Enter XR
 * button): the permission is then remembered for the site, and no system
 * dialog interrupts the XR session later.
 */
export async function openMic(): Promise<void> {
  // The system may end the track (the headset slept): then every recording failed until a reload
  // (audit). A new stream needs no dialog, the permission is the site's.
  if (stream?.getAudioTracks().some((track) => track.readyState === 'live')) return;
  opening ??= navigator.mediaDevices
    .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) // as Google's XR Blocks
    .finally(() => (opening = undefined));
  stream = await opening;
}

/** The open microphone stream (asks for it first, if need be): Punto's live voice reads it raw. */
export async function micStream(): Promise<MediaStream> {
  await openMic();
  return stream!;
}

export interface Recording {
  /** Stops and returns the phrase as base64 webm ('' when nothing was recorded). */
  finish(): Promise<string>;
  /** Stops and throws the sound away. */
  cancel(): void;
}

/** Starts recording now. A recording is cut at 15 s. */
export function record(): Recording {
  const chunks: Blob[] = [];
  let stopRequested = false;
  let recorder: MediaRecorder | undefined;
  let stopped!: () => void;
  const done = new Promise<void>((resolve) => (stopped = resolve));

  const started = openMic().then(() => {
    recorder = new MediaRecorder(stream!, { mimeType: MIME });
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => stopped();
    recorder.start();
    setTimeout(() => recorder?.state === 'recording' && recorder.stop(), MAX_MS);
    // released before the microphone was ready: stop at once
    if (stopRequested) recorder.stop();
  });

  return {
    cancel() {
      stopRequested = true;
      if (recorder?.state === 'recording') recorder.stop();
    },
    async finish() {
      stopRequested = true;
      await started;
      if (recorder?.state === 'recording') recorder.stop();
      await done;
      const blob = new Blob(chunks, { type: MIME });
      return blob.size === 0 ? '' : base64(blob);
    },
  };
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
