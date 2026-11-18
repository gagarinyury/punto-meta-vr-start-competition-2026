// The library behind Punto's tablet: saved games and models (mine and everyone's) and live games
// that their host has opened to others. Routes sit under /api, so the key guard of index.mjs applies.
//
//   GET  /api/library?kind=game|model&scope=mine|all&me=<id>   newest first, without code
//   GET  /api/library/:id                                      one item with its code
//   GET  /api/library/:id/thumb                                its picture (jpeg)
//   POST /api/library        { kind, title, me, name, fromRoom?, sample?, model?, thumb?, recent?, chain? }  -> item
//   GET  /api/library?kind=game&scope=recent&me=<id>           this player's last games, kept by themselves
//
// Recent games (Yury, 14.11: «чтобы у человека сохранялись 5-10 последних игр»): every creation the player makes
// is kept on its own, without «save», as `recent` with the id of its `chain` (a new thing starts a chain, its
// changes go on it): one card per creation, its latest version; the oldest beyond RECENT_MAX go.
//   POST /api/library/:id/thumb { thumb }                      a picture for an item that had none
//   GET  /api/live                                             open games, beaten in the last 20 s
//   POST /api/live/open      { item, title, me, name }         -> { id }
//   POST /api/live/beat      { id }      the host is still there (every ~5 s)
//   POST /api/live/close     { id }
//   POST /api/live/join      { id, me, name }                  -> { item, players }
//
// Storage: one JSON and one JPEG per item — in library/ at the project root while developing, in the
// Cloud Storage bucket PUNTO_LIBRARY_BUCKET on the published site (Cloud Run keeps no disk). The items
// are read once at start and kept in memory: one instance serves everybody (DEPLOY.md).
//
// A saved game's code is never taken from the page: whoever saved code here would run it in every
// browser that plays the item. The server saves the creation it made for this player (`fromRoom`).
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { Storage } from '@google-cloud/storage';

/** Where items and pictures live: a folder, or a bucket. */
function storeOf(root) {
  const name = process.env.PUNTO_LIBRARY_BUCKET;
  if (name) {
    const bucket = new Storage().bucket(name);
    return {
      async all() {
        const [files] = await bucket.getFiles({ prefix: 'items/' });
        return Promise.all(files.map(async (file) => JSON.parse((await file.download())[0].toString('utf8'))));
      },
      putItem: (item) => bucket.file(`items/${item.id}.json`).save(JSON.stringify(item), { contentType: 'application/json' }),
      putThumb: (id, data) => bucket.file(`thumbs/${id}.jpg`).save(data, { contentType: 'image/jpeg' }),
      removeItem: async (id) => {
        await bucket.file(`items/${id}.json`).delete({ ignoreNotFound: true });
        await bucket.file(`thumbs/${id}.jpg`).delete({ ignoreNotFound: true });
      },
      sendThumb: (id, res) => bucket.file(`thumbs/${id}.jpg`).createReadStream().on('error', () => res.status(404).end()).pipe(res.type('jpeg')),
    };
  }
  const dir = `${root}library`;
  mkdirSync(dir, { recursive: true });
  return {
    async all() {
      return readdirSync(dir).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')));
    },
    putItem: async (item) => writeFileSync(`${dir}/${item.id}.json`, JSON.stringify(item, null, 1)),
    putThumb: async (id, data) => writeFileSync(`${dir}/${id}.jpg`, data),
    removeItem: async (id) => {
      for (const file of [`${dir}/${id}.json`, `${dir}/${id}.jpg`]) if (existsSync(file)) unlinkSync(file);
    },
    sendThumb: (id, res) => (existsSync(`${dir}/${id}.jpg`) ? res.type('jpeg').sendFile(`${dir}/${id}.jpg`) : res.status(404).end()),
  };
}

const KINDS = new Set(['game', 'model']);
// Who saved a card or opened a live game: a hash of the page's session (x-punto-session, src/api.ts),
// kept with it and never sent back. Only that page changes its picture, keeps its game open or closes it
// (audit item 17: any holder of a key could). Cards saved before this have none and stay open to all.
const byOf = (req) => createHash('sha256').update(String(req.session?.id ?? '')).digest('hex').slice(0, 24);
const mine = (thing, req) => !thing.by || thing.by === byOf(req);

// A card's game runs in the page of whoever presses PLAY, with the page's rights: its storage (the access
// key), the network (audit item 20). There is no sandbox for it (a game needs the world itself), so:
// - EVERYONE lists only the curator's cards (PUNTO_CURATOR, the key's owner name; default «yury»), cards he
//   approved («approved»: true in the card's JSON) and cards saved before owners were kept;
// - a game whose code reaches for the network, the page's storage or code from strings is «risky»: it stays
//   its maker's own — never in EVERYONE, never sent to another page, never opened to others.
// The patterns pass all 405 games the coder has made so far (15.11) and catch the usual tricks; a game
// written to get past them still can: it is a fence, the curator is the gate.
const CURATOR = process.env.PUNTO_CURATOR ?? 'yury';
const RISKY = [
  /\b(?:fetch|eval|importScripts|postMessage|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\s*\(/,
  /\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker|Function)\b/,
  /\b(?:localStorage|sessionStorage|indexedDB|cookieStore)\b/,
  /\bdocument\s*\.\s*cookie\b/,
  /\bsendBeacon\b/,
  /\bimport\s*\(/,
  /\b(?:window|globalThis|self|document|navigator)\s*\[/,
  /\blocation\s*\.\s*(?:href|assign|replace)\b|\b(?:window|document)\s*\.\s*location\b/,
  /\bconstructor\s*\.\s*constructor\b|\bwindow\s*\.\s*open\s*\(/,
];
/** What in `code` a shared game may not do (comments aside), or undefined. */
const riskyIn = (code) => {
  const bare = String(code).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  return RISKY.find((pattern) => pattern.test(bare))?.source;
};
const shared = (item) => !item.risky && (!item.owner || item.owner === CURATOR || item.approved === true);
const LIVE_TTL = 20_000;
const RECENT_MAX = 10;

/**
 * Mounts the routes. `fromRoom(req)` is the source of the creation this player has in the room now
 * (index.mjs), or undefined. Returns `read(id, req)`, for playing an item (/api/play in index.mjs), and
 * `ready`, which resolves when the cards have loaded (from the bucket on Cloud Run: a while after a cold start).
 */
export function libraryRoutes(app, root, fromRoom) {
  const store = storeOf(root);
  const items = new Map();
  const ready = store.all().then((all) => {
    for (const item of all) items.set(item.id, item);
    console.log(JSON.stringify({ event: 'library', items: items.size, bucket: process.env.PUNTO_LIBRARY_BUCKET ?? null }));
  });
  // handled here at once: a failure before the first request was an unhandled rejection, which ends Node
  ready.catch((error) => console.error(JSON.stringify({ event: 'library.load.error', error: String(error).slice(0, 300) })));
  // every route that reads the cards waits for them: on a cold start a card was «no such item» (audit item 15)
  const loaded = (req, res, next) => ready.then(() => next(), next);
  app.use('/api/library', loaded);
  app.use('/api/live', loaded);
  const live = new Map();
  const clean = (text, max) => String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const idOk = (id) => /^[\w-]{4,40}$/.test(id);
  // for a page that is to run it: a risky card only for the page that saved it
  const read = (id, req) => {
    const item = (idOk(id) && items.get(id)) || null;
    return item && req && item.risky && !mine(item, req) ? null : item;
  };
  // a model is one of the ready models the page itself serves, nothing else
  const modelOk = (path) => /^\.\/models\/[\w/-]+\.glb$/.test(path) && !path.includes('..');
  const card = ({ code, by, ...item }) => ({ ...item, playable: Boolean(code || item.sample || item.model) });
  const writeThumb = (id, thumb) => {
    const data = String(thumb ?? '').match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/)?.[1];
    if (!data) return false;
    store.putThumb(id, Buffer.from(data, 'base64')).catch((error) => console.error(JSON.stringify({ event: 'library.thumb.error', id, error: String(error).slice(0, 200) })));
    return true;
  };

  app.get('/api/library', (req, res) => {
    const kind = String(req.query.kind ?? 'game');
    const me = String(req.query.me ?? '');
    const scope = req.query.scope;
    // recent games are this player's own and only on their tab; MINE and EVERYONE are what was saved
    const list = [...items.values()]
      .filter((item) => item.kind === kind && (scope === 'recent' ? item.recent && item.me === me : !item.recent && (scope === 'mine' ? item.me === me : shared(item))))
      .sort((a, b) => b.at - a.at)
      .map(card);
    res.json({ items: list });
  });

  app.get('/api/library/:id', (req, res) => {
    const item = read(req.params.id, req);
    if (!item) return res.status(404).json({ error: 'no such item' });
    const { by, ...shown } = item;
    res.json(shown);
  });

  app.get('/api/library/:id/thumb', (req, res) => {
    if (!idOk(req.params.id) || !items.get(req.params.id)?.thumb) return res.status(404).end();
    store.sendThumb(req.params.id, res);
  });

  app.post('/api/library', async (req, res) => {
    const body = req.body ?? {};
    const kind = String(body.kind);
    const title = clean(body.title, 40);
    if (!KINDS.has(kind) || !title) return res.status(400).json({ error: 'kind and title are needed' });
    const code = body.fromRoom ? fromRoom(req) : undefined;
    if (body.fromRoom && !code) return res.status(400).json({ error: 'nothing in the room to save' });
    if (body.model && !modelOk(String(body.model))) return res.status(400).json({ error: 'not one of the ready models' });
    const me = clean(body.me, 40);
    const chain = body.recent ? clean(body.chain, 40).replace(/[^\w-]/g, '') : '';
    if (body.recent && (!code || !chain || !me)) return res.status(400).json({ error: 'a recent game needs the room, its chain and me' });
    // a recent game already kept for this creation: its card takes the latest version
    // (`me` and `chain` come from the page: only this page's own card is taken, never another's)
    const kept = chain && [...items.values()].find((item) => item.recent && item.me === me && item.chain === chain && mine(item, req));
    const id = kept ? kept.id : `${body.recent ? 'r' : kind[0]}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
    const item = {
      id,
      kind,
      title,
      me,
      name: clean(body.name, 30) || 'Someone',
      at: Date.now(),
      recent: body.recent ? true : undefined,
      chain: chain || undefined,
      // what it is made of: the game's own code, a kept sample, or a model file in public/models
      code,
      sample: body.sample ? clean(body.sample, 60).replace(/[^\w-]/g, '') : undefined,
      model: body.model ? clean(body.model, 160) : undefined,
      credit: body.credit ? clean(body.credit, 120) : undefined,
      by: byOf(req),
      owner: req.owner,
      risky: code ? riskyIn(code) : undefined,
    };
    if (!item.code && !item.sample && !item.model) return res.status(400).json({ error: 'nothing in it to play' });
    item.thumb = writeThumb(id, body.thumb) || Boolean(kept?.thumb);
    items.set(id, item);
    await store.putItem(item);
    if (item.recent) {
      // only the last RECENT_MAX of this player's recent games stay
      const old = [...items.values()].filter((one) => one.recent && one.me === me).sort((a, b) => b.at - a.at).slice(RECENT_MAX);
      for (const one of old) {
        items.delete(one.id);
        store.removeItem(one.id).catch((error) => console.error(JSON.stringify({ event: 'library.remove.error', id: one.id, error: String(error).slice(0, 200) })));
      }
    }
    console.log(JSON.stringify({ event: item.recent ? 'library-recent' : 'library-save', owner: req.owner, id, kind, title, chain: item.chain }));
    res.json(card(item));
  });

  app.post('/api/library/:id/thumb', (req, res) => {
    const item = read(req.params.id);
    if (!item) return res.status(404).json({ error: 'no such item' });
    if (!mine(item, req)) return res.status(403).json({ error: 'not your card' });
    if (!writeThumb(item.id, req.body?.thumb)) return res.status(400).json({ error: 'no picture' });
    item.thumb = true;
    store.putItem(item).then(() => res.json({ ok: true }), (error) => res.status(502).json({ error: String(error).slice(0, 200) }));
  });

  const fresh = () => {
    const now = Date.now();
    for (const [id, game] of live) if (now - game.beat > LIVE_TTL) live.delete(id);
    return [...live.values()];
  };
  const shown = ({ id, item, title, name, players, since }) => ({ id, item, title, host: name, players: players.length + 1, since, thumb: Boolean(read(item)?.thumb) });

  app.get('/api/live', (req, res) => res.json({ games: fresh().map(shown) }));

  app.post('/api/live/open', (req, res) => {
    const body = req.body ?? {};
    const item = read(String(body.item ?? ''));
    if (!item) return res.status(404).json({ error: 'save the game first' });
    if (item.risky) return res.status(400).json({ error: 'this game cannot be opened to others' });
    const id = `l-${randomBytes(4).toString('hex')}`;
    live.set(id, { id, item: item.id, title: clean(body.title, 40) || item.title, me: clean(body.me, 40), name: clean(body.name, 30) || 'Someone', players: [], since: Date.now(), beat: Date.now(), by: byOf(req) });
    console.log(JSON.stringify({ event: 'live-open', id, item: item.id }));
    res.json({ id });
  });

  app.post('/api/live/beat', (req, res) => {
    const game = live.get(String(req.body?.id ?? ''));
    if (!game) return res.status(404).json({ error: 'not open' });
    if (!mine(game, req)) return res.status(403).json({ error: 'not your game' });
    game.beat = Date.now();
    res.json({ players: game.players });
  });

  app.post('/api/live/close', (req, res) => {
    const game = live.get(String(req.body?.id ?? ''));
    if (game && !mine(game, req)) return res.status(403).json({ error: 'not your game' });
    live.delete(String(req.body?.id ?? ''));
    res.json({ ok: true });
  });

  app.post('/api/live/join', (req, res) => {
    fresh();
    const game = live.get(String(req.body?.id ?? ''));
    if (!game) return res.status(404).json({ error: 'that game is closed' });
    const me = clean(req.body?.me, 40);
    if (me && !game.players.some((p) => p.me === me)) game.players.push({ me, name: clean(req.body?.name, 30) || 'Someone' });
    res.json({ item: game.item, players: game.players });
  });

  return { read, ready };
}
