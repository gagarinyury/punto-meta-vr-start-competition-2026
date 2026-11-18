// Calls to the Punto server (server/index.mjs). The access key comes from the
// page link (?key=...) and is remembered, so a later visit without it still works.
const BASE = import.meta.env.VITE_API ?? './api';

function accessKey(): string {
  const fromLink = new URLSearchParams(location.search).get('key');
  try {
    if (fromLink) localStorage.setItem('punto.key', fromLink);
    return fromLink ?? localStorage.getItem('punto.key') ?? '';
  } catch {
    return fromLink ?? ''; // storage can be blocked; the link still works
  }
}

/**
 * This browser's own id, so the published server keeps each player's creation and its versions
 * apart (server/index.mjs, sessionOf). Remembered, so a page load keeps the history.
 */
let session = '';
function sessionId(): string {
  if (session) return session;
  try {
    session = localStorage.getItem('punto.session') ?? '';
    if (!session) localStorage.setItem('punto.session', (session = crypto.randomUUID()));
  } catch {
    session ||= crypto.randomUUID(); // storage can be blocked: this page load only
  }
  return session;
}

/** The address of Punto's live voice (WS /api/live, server/live.mjs): a browser WebSocket cannot set
 *  headers, so the key and the session go in the address. */
export function liveAddress(params: Record<string, string> = {}): string {
  return socketAddress('live', params);
}

/** The address of a WebSocket under /api (live, together), with the key and the session in it. */
export function socketAddress(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${BASE}/${path}`, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const key = accessKey();
  if (key) url.searchParams.set('key', key);
  url.searchParams.set('session', sessionId());
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

/** The full address of /api/<path>, for calls that are not JSON (the takes of src/together.ts). */
export const apiUrl = (path: string) => `${BASE}/${path}`;

/** The friend's room this player is a guest in (src/together.ts): what they make or change goes to that room's game. */
let room = '';
export const setGuestRoom = (code: string) => (room = code);

/** The headers every call to the Punto server carries: the access key, this browser's session, the room a guest is in. */
export const apiHeaders = () => ({
  'content-type': 'application/json',
  'x-punto-key': accessKey(),
  'x-punto-session': sessionId(),
  ...(room ? { 'x-punto-room': room } : {}),
});

/** The server's own reason for a refusal ({ error } in its answer), after the status: «429 the coder has done
 *  enough for today». The page tells a daily limit from an hourly one by it (audit item 18). */
async function refused(path: string, response: Response): Promise<Error> {
  const why = await response.json().then((body: { error?: unknown }) => body?.error, () => undefined);
  return new Error(`[api] ${path}: ${response.status}${typeof why === 'string' ? ` ${why}` : ''}`);
}

/** POSTs JSON to /api/<path> with the access key; throws on a non-2xx answer, or after `timeoutMs` if given. */
export async function api<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  if (!response.ok) {
    throw await refused(path, response);
  }
  return (await response.json()) as T;
}

/**
 * The same call, answered as it goes (the server's `stream: true`, research/notes/STREAM.md): every line of the
 * answer but the last goes to `onEvent` — { start }, { code }, { draft, statements }, { edits } —
 * and the call resolves with the result in the last one. Throws like api() when the call fails.
 */
const SILENT_MS = 20_000;

export async function apiStream<T>(
  path: string,
  body: Record<string, unknown>,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!response.ok) {
    throw await refused(path, response);
  }
  // a server that does not stream answers with the plain result
  if (!response.body || !response.headers.get('content-type')?.includes('ndjson')) {
    return (await response.json()) as T;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: T | undefined;
  for (;;) {
    // the server beats every 5 s while it works (server/index.mjs, answering): 20 s of nothing means it is gone
    // (18.11: restarted mid-build, the page waited for ever behind the dev proxy)
    let silent: ReturnType<typeof setTimeout> | undefined;
    const gone = new Promise<never>((_, reject) => {
      silent = setTimeout(() => reject(new Error(`[api] ${path}: the server went silent`)), SILENT_MS);
    });
    const { value, done } = await Promise.race([reader.read(), gone]).catch((error) => {
      void reader.cancel().catch(() => {});
      throw error;
    }).finally(() => clearTimeout(silent));
    pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = done ? '' : lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as Record<string, unknown>;
      if ('error' in event) throw new Error(`[api] ${path}: ${String(event.status ?? '')} ${String(event.error)}`);
      if ('result' in event) {
        result = event.result as T;
        continue;
      }
      if ('beat' in event) continue;
      try {
        onEvent(event);
      } catch (error) {
        console.warn(`[api] ${path}: an event was not taken`, error); // the call itself goes on
      }
    }
    if (done) break;
  }
  if (result === undefined) throw new Error(`[api] ${path}: the answer ended without a result`);
  return result;
}
