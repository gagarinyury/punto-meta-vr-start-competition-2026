// Playing together from different rooms (research/notes/SHARING.md, 16.11): WS /api/together?room=<code>&name=<nick>&session=<id>
// [&seat=<n>][&pass=<token>]. The server only passes things on. Each player gets an id and a seat at the table
// (0, 1, …); binary messages (poses and things, 30 a second, src/together.ts) go to everybody else in the room
// as they are; JSON messages are the room's own: who came and went, knocks, game events, and the room's shared
// state, kept here for whoever comes later.
//
// Everybody has a room of their own (Yury, 16.11): its code («kot-42») comes from their session, so it stays
// the same; they are in it whenever they play. Another player comes in by a link or QR the owner gave (a
// one-time pass in it) or knocks — found by code or by nick, from the tablet's list or by voice — and somebody
// in the room lets them in or not. A room whose code is nobody's (?room=test) is open: tests and takes.
//
//   GET  /api/together/home                    -> { code, label }   this session's own room
//   GET  /api/together/find?q=<code or nick>   -> { rooms: [{ code, label, name, players }] }   rooms with somebody in
//   POST /api/together/game { room }           -> { name, js } | {}   the room owner's game (published site only)
//
// Takes: a player's poses written down, to be played back as a second player when there is one headset
// (filming): POST /api/together/take/<name>?part=<n> appends a piece (part 0 starts the file again),
// GET /api/together/take/<name> gives the whole take. Kept in logs/takes/ (not in git).
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import express from 'express';
import { WebSocketServer } from 'ws';

const SEATS = 4; // the most players at one table
const KNOCK_MS = 60_000; // a knock nobody answers is turned away
const TAKES = new URL('../logs/takes/', import.meta.url).pathname;
const TAKE_MAX = 32 * 1024 * 1024; // about 15 minutes of poses
const clean = (text, max) => String(text ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, max);

// A room's code: an animal and a number, easy to say aloud (the label is how it is said in Russian)
const ANIMALS = [
  ['kot', 'кот'], ['lis', 'лис'], ['sova', 'сова'], ['yozh', 'ёж'], ['volk', 'волк'], ['bobr', 'бобр'], ['kit', 'кит'],
  ['slon', 'слон'], ['tigr', 'тигр'], ['lev', 'лев'], ['enot', 'енот'], ['krot', 'крот'], ['zhuk', 'жук'], ['gus', 'гусь'],
  ['os', 'оса'], ['rys', 'рысь'], ['tyulen', 'тюлень'], ['olen', 'олень'], ['pingvin', 'пингвин'], ['koala', 'коала'],
  ['panda', 'панда'], ['zebra', 'зебра'], ['lama', 'лама'], ['kenguru', 'кенгуру'], ['delfin', 'дельфин'], ['kozel', 'козёл'],
  ['baran', 'баран'], ['popugay', 'попугай'], ['khomyak', 'хомяк'], ['belka', 'белка'], ['zayac', 'заяц'], ['medved', 'медведь'],
];
/** The code of the room of `owner`'s session `session`. */
export function homeOf(owner, session) {
  const hash = createHash('sha256').update(`${owner}/${session}`).digest();
  const [code, said] = ANIMALS[hash[0] % ANIMALS.length];
  const number = 10 + (hash[1] % 90);
  return { code: `${code}-${number}`, label: `${said}-${number}` };
}

/** Mounts the rooms' WebSocket on `server` and the rest on `app` (behind the /api guard). `admit(req, url)` checks
 *  the key as /api/live does and returns { owner } or null; `gameOf(owner, session)` gives that session's game. */
export function togetherRoutes(app, server, { admit, gameOf }) {
  const rooms = new Map(); // code -> { peers: Map<number, Peer>, state: {}, passes: Set, waiting: Map, owner?: { owner, session } }
  let nextId = 1;
  const roomOf = (code) => {
    let room = rooms.get(code);
    if (!room) rooms.set(code, (room = { peers: new Map(), state: {}, passes: new Set(), waiting: new Map() }));
    return room;
  };
  const tell = (ws, message) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(message));
  const shown = (p) => ({ id: p.id, seat: p.seat, name: p.name });

  // a held thing's look goes once as three.js JSON (src/together.ts, sendHeld): a racket's geometry is tens of kB
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://punto');
    if (url.pathname !== '/api/together') return;
    const code = clean(url.searchParams.get('room'), 40).toLowerCase();
    const who = code && admit(req, url);
    if (!who) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const session = clean(url.searchParams.get('session'), 64);
    wss.handleUpgrade(req, socket, head, (ws) =>
      arrive(ws, code, {
        name: clean(url.searchParams.get('name'), 24) || 'Friend',
        seat: Number(url.searchParams.get('seat')),
        pass: String(url.searchParams.get('pass') ?? ''),
        owner: who.owner,
        session,
        home: homeOf(who.owner, session).code === code,
      }),
    );
  });

  /** Somebody comes to a room: in at once (their own room, a pass, an open room), or they knock. */
  function arrive(ws, code, guest) {
    const room = roomOf(code);
    if (guest.home) room.owner = { owner: guest.owner, session: guest.session };
    const ownedByOther = room.owner && !guest.home;
    const passed = guest.pass && room.passes.delete(guest.pass);
    if (!ownedByOther || passed) return join(ws, code, guest);
    if (!room.peers.size) {
      ws.close(4004, 'nobody home');
      return;
    }
    // a knock: whoever is in the room answers (src/together.ts shows it); unanswered, it is turned away
    const knock = nextId++;
    room.waiting.set(knock, { ws, guest });
    tell(ws, { t: 'knocking' });
    for (const peer of room.peers.values()) tell(peer.ws, { t: 'knock', id: knock, name: guest.name });
    const timer = setTimeout(() => answer(code, knock, false), KNOCK_MS);
    ws.on('close', () => {
      clearTimeout(timer);
      if (room.waiting.delete(knock)) for (const peer of room.peers.values()) tell(peer.ws, { t: 'knockGone', id: knock });
    });
  }

  function answer(code, knock, yes) {
    const room = rooms.get(code);
    const waiting = room?.waiting.get(knock);
    if (!waiting) return;
    room.waiting.delete(knock);
    for (const peer of room.peers.values()) tell(peer.ws, { t: 'knockGone', id: knock });
    if (yes) join(waiting.ws, code, waiting.guest);
    else waiting.ws.close(4003, 'not now');
  }

  function join(ws, code, guest) {
    const room = roomOf(code);
    const taken = new Set([...room.peers.values()].map((p) => p.seat));
    let seat = Number.isInteger(guest.seat) && guest.seat >= 0 && guest.seat < SEATS && !taken.has(guest.seat) ? guest.seat : -1;
    for (let s = 0; seat < 0 && s < SEATS; s++) if (!taken.has(s)) seat = s;
    if (seat < 0) {
      ws.close(4000, 'the table is full');
      return;
    }
    const me = { id: nextId++, seat, name: guest.name, ws, home: guest.home, owner: guest.owner, session: guest.session };
    const others = () => [...room.peers.values()].filter((p) => p !== me);
    room.peers.set(me.id, me);
    const label = room.owner ? homeOf(room.owner.owner, room.owner.session).label : code;
    tell(ws, { t: 'welcome', id: me.id, seat, seats: SEATS, peers: others().map(shown), state: room.state, room: code, label, home: guest.home });
    for (const peer of others()) tell(peer.ws, { t: 'join', ...shown(me) });
    console.log(`[together] ${guest.name} joined ${code} at seat ${seat} (${room.peers.size} there)`);

    ws.on('message', (data, binary) => {
      if (binary) {
        // poses and things: on to everybody else, untouched
        for (const peer of others()) if (peer.ws.readyState === peer.ws.OPEN && peer.ws.bufferedAmount < 256 * 1024) peer.ws.send(data, { binary: true });
        return;
      }
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (message?.t === 'event' && typeof message.name === 'string') {
        for (const peer of others()) tell(peer.ws, { t: 'event', from: me.id, name: message.name.slice(0, 40), data: message.data });
      } else if (message?.t === 'state' && message.patch && typeof message.patch === 'object') {
        Object.assign(room.state, message.patch);
        for (const peer of others()) tell(peer.ws, { t: 'state', from: me.id, patch: message.patch });
      } else if (message?.t === 'pass') {
        // a one-time way in, for a link or QR this player gives somebody
        const token = randomBytes(6).toString('base64url');
        room.passes.add(token);
        if (room.passes.size > 20) room.passes.delete(room.passes.values().next().value);
        tell(ws, { t: 'pass', token, room: code, label });
      } else if (message?.t === 'let' && typeof message.id === 'number') answer(code, message.id, !!message.yes);
      else if (message?.t === 'rtc' && typeof message.to === 'number') {
        // the voice's handshake (src/together-voice.ts): to that one player only
        const peer = room.peers.get(message.to);
        if (peer) tell(peer.ws, { t: 'rtc', from: me.id, data: message.data });
      }
    });
    ws.on('close', () => {
      room.peers.delete(me.id);
      for (const peer of room.peers.values()) tell(peer.ws, { t: 'leave', id: me.id });
      if (!room.peers.size && !room.waiting.size) rooms.delete(code);
      console.log(`[together] ${guest.name} left ${code}`);
    });
  }

  /** Whose game the room `code` plays, when that player's session `session` of `owner` is in it: a guest's
   *  «make» and «change» go to that game (server/index.mjs, sessionOf), so the room has one line of versions. */
  function roomGameOf(code, owner, session) {
    const room = rooms.get(String(code).toLowerCase());
    if (!room?.owner) return undefined;
    const inside = [...room.peers.values()].some((p) => p.owner === owner && p.session === session);
    return inside ? room.owner : undefined;
  }

  app.get('/api/together/home', (req, res) => res.json(homeOf(req.owner, String(req.get('x-punto-session') ?? '').slice(0, 64))));

  // rooms somebody is in, by code («kot-42», «кот 42») or by the nick of somebody in it («Юрий»)
  app.get('/api/together/find', (req, res) => {
    const q = String(req.query.q ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[\s_]+/g, '-').slice(0, 40);
    const found = [];
    for (const [code, room] of rooms) {
      if (!room.peers.size || !room.owner) continue;
      const { label } = homeOf(room.owner.owner, room.owner.session);
      const names = [...room.peers.values()].map((p) => p.name);
      const hit = !q || code === q || label.replace(/ё/g, 'е') === q || names.some((n) => n.toLowerCase().replace(/ё/g, 'е') === q.replace(/-/g, ' '));
      if (hit) found.push({ code, label, name: [...room.peers.values()].find((p) => p.home)?.name ?? names[0], players: names.length });
    }
    res.json({ rooms: found.slice(0, 10) });
  });

  // the room owner's game, for whoever comes in (on the published site; while developing every page has the files)
  app.post('/api/together/game', (req, res) => {
    const room = rooms.get(clean(req.body?.room, 40).toLowerCase());
    if (!room?.owner) return res.json({});
    res.json(gameOf(room.owner.owner, room.owner.session) ?? {});
  });

  const takeFile = (req) => {
    const name = String(req.params.name ?? '').replace(/[^\w-]/g, '').slice(0, 40);
    return name ? `${TAKES}${name}.bin` : '';
  };
  app.post('/api/together/take/:name', express.raw({ type: 'application/octet-stream', limit: '2mb' }), (req, res) => {
    const file = takeFile(req);
    if (!file || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'no take' });
    mkdirSync(TAKES, { recursive: true });
    if (req.query.part === '0') writeFileSync(file, req.body);
    else if (existsSync(file) && readFileSync(file).length + req.body.length <= TAKE_MAX) appendFileSync(file, req.body);
    else return res.status(413).json({ error: 'the take is too long' });
    res.json({ ok: true });
  });
  app.get('/api/together/take/:name', (req, res) => {
    const file = takeFile(req);
    if (!file || !existsSync(file)) return res.status(404).json({ error: 'no such take' });
    res.type('application/octet-stream').send(readFileSync(file));
  });
  return { roomGameOf };
}
