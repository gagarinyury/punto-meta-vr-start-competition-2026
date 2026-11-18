// The library behind Punto's tablet, from the page's side: who I am, saved games and models,
// live games. The routes are in server/library.mjs. No World, no DOM beyond localStorage.
import { apiHeaders } from '../api.js';

export type Kind = 'game' | 'model';
/** saved by me, saved by anyone, or my last games kept by themselves */
export type Scope = 'mine' | 'all' | 'recent';

export interface Item {
  id: string;
  kind: Kind;
  title: string;
  /** the saver's id (see `me()`) and shown name */
  me: string;
  name: string;
  at: number;
  thumb: boolean;
  playable: boolean;
  sample?: string;
  model?: string;
  credit?: string;
  /** only from `getItem`: the game's own code */
  code?: string;
  /** one of my last games, kept by itself; `chain` is the creation it is the latest version of */
  recent?: boolean;
  chain?: string;
}

export interface LiveGame {
  id: string;
  item: string;
  title: string;
  host: string;
  players: number;
  since: number;
  thumb: boolean;
}

const API = import.meta.env.VITE_API ?? './api';

/** This device's player: a random id kept in the browser, and a name to show to others. */
export function me(): { id: string; name: string } {
  let id = '';
  let name = 'Player';
  try {
    id = localStorage.getItem('punto-me') ?? '';
    if (!id) {
      id = `u-${crypto.randomUUID().slice(0, 12)}`;
      localStorage.setItem('punto-me', id);
    }
    name = localStorage.getItem('punto-name') ?? name;
  } catch {
    id ||= 'u-anonymous';
  }
  return { id, name };
}

export function setName(name: string): void {
  try {
    localStorage.setItem('punto-name', name.slice(0, 30));
  } catch {
    // a private window: the name lasts this visit only
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  // the key and the session go with every call (src/api.ts); on the published site there is no dev proxy to add them
  const response = await fetch(`${API}${path}`, body === undefined ? { headers: apiHeaders() } : {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `${path}: ${response.status}`);
  return data as T;
}

export function thumbUrl(id: string): string {
  return `${API}/library/${id}/thumb`;
}

export async function listItems(kind: Kind, scope: Scope): Promise<Item[]> {
  const { items } = await call<{ items: Item[] }>(`/library?kind=${kind}&scope=${scope}&me=${encodeURIComponent(me().id)}`);
  return items;
}

export function getItem(id: string): Promise<Item> {
  return call<Item>(`/library/${encodeURIComponent(id)}`);
}

export interface SaveRequest {
  kind: Kind;
  title: string;
  code?: string;
  sample?: string;
  model?: string;
  credit?: string;
  /** a data URL (see thumb.ts) */
  thumb?: string;
  /** a game: the server saves the creation it made for this player (the page never sends code) */
  fromRoom?: boolean;
  /** one of my last games (with fromRoom): the card of creation `chain`, updated with each version */
  recent?: boolean;
  chain?: string;
}

/** `as` saves under another author (the stand's seed of community models); normally it is me. */
export function saveItem(request: SaveRequest, as: { id: string; name: string } = me()): Promise<Item> {
  const { id, name } = as;
  return call<Item>('/library', { ...request, me: id, name });
}

export function addThumb(id: string, thumb: string): Promise<unknown> {
  return call(`/library/${encodeURIComponent(id)}/thumb`, { thumb });
}

export async function listLive(): Promise<LiveGame[]> {
  const { games } = await call<{ games: LiveGame[] }>('/live');
  return games;
}

/**
 * Opens a saved game to others; the host keeps it open by beating every 5 s while it runs.
 * Returns the way to close it. `onPlayers` hears who has joined.
 */
export async function openLive(item: Item, onPlayers?: (players: { name: string }[]) => void): Promise<{ id: string; close: () => void }> {
  const { id: who, name } = me();
  const { id } = await call<{ id: string }>('/live/open', { item: item.id, title: item.title, me: who, name });
  const timer = setInterval(() => {
    call<{ players: { name: string }[] }>('/live/beat', { id }).then((r) => onPlayers?.(r.players)).catch(() => clearInterval(timer));
  }, 5000);
  return {
    id,
    close: () => {
      clearInterval(timer);
      void call('/live/close', { id }).catch(() => undefined);
    },
  };
}

export function joinLive(id: string): Promise<{ item: string; players: { name: string }[] }> {
  const { id: who, name } = me();
  return call('/live/join', { id, me: who, name });
}
