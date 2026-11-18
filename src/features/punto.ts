// Punto in the room: floats in front of the player and watches the head.
// A new player gets the intro on entering XR. Point at Punto and pinch to
// talk: the director (server /api/direct) decides — a ready spell runs at
// once; anything else Punto answers aloud (live making is not wired yet).
// While the player has not got going, Punto reminds how to talk to it and
// suggests ideas, now and then, until the player has asked three times.
// window.__punto.setState('listen' | 'think' | 'build' | 'happy' | 'talk' | 'idle') — for checks.
// node tools/say.mjs "make a red cube" — the same as saying it (no microphone: the emulator, checks).
import { Box3, createSystem, Grabbed, Group, Quaternion, Vector3, VisibilityState, type World } from '@iwsdk/core';
import { speechBubble } from '../bubble.js';
import { draftStage } from '../draft.js';
import { drawnMeshes, dropMade, feature, hideForNext, madeNow, nextReplaces, rootsOf, runMade, showAgain, whenLoaded } from '../live.js';
import { spawnPunto } from '../helper.js';
import { isNewPlayer, markSeen, prepareIntro, runIntro, speakLinesWith, talk } from '../intro.js';
import { type IntroLine, ui } from '../intro-lines.js';
import { pointTheWayIn } from '../wayin.js';
import { burstIn, type EntranceVoice, takeWord } from '../entrance.js';
import { api, apiStream } from '../api.js';
import { listenOnPinch } from '../listen.js';
import { level, say, speakFrom } from '../speak.js';
import { clearAll } from '../made.js';
import { makeStickable, startSticking } from '../stick.js';
import { boxModel, boxStage, typeBox, thingInScene } from '../typebox.js';
import { askPlace, newCreation, phraseBegins, placeDone, placeElsewhere, requestBegins, startPlacing } from '../place.js';
import { mountScore, scoreHeight } from '../score.js';
import { SPELLS, type SpellName } from '../spells.js';
import { openTablet, sketchTablet, type Tablet, TABLET_SIZE } from '../library/tablet.js';
import { Blueprint, type PlanPart } from '../blueprint.js';
import { materializeStage, type ShownModel } from '../materialize.js';
import { busy } from '../perf.js';
import { addThumb, getItem, type Item, joinLive, openLive, saveItem } from '../library/store.js';
import { connectLive, liveWanted, type LiveVoice, type ToolCall } from '../livevoice.js';
import { snapshot, tintOf } from '../library/thumb.js';
import { announceMade, announceMaking, answerKnock, company, goHome, invite, onCompany, setName, visit } from '../together.js';

interface Direction {
  said: string;
  action: 'spell' | 'clear' | 'make' | 'change' | 'move' | 'save' | 'library' | 'invite' | 'join' | 'letIn' | 'notNow' | 'leave' | 'name' | 'chat';
  /** for 'join': a room's code or a player's nick; for 'name': the player's own name (src/together.ts) */
  who?: string;
  /** for 'save': a short name for the creation */
  title?: string;
  spell: SpellName | 'none';
  kind: 'thing' | 'game' | 'place' | 'none';
  /** 'pointed': the player shows the spot with the ray (src/place.ts) */
  place?: 'pointed' | 'none';
  /** a move that has to go through the coder: its new spot is chosen already (placeElsewhere) */
  spotChosen?: boolean;
  /** the kind of surface the phrase names, for when the player does not point */
  surface?: 'wall' | 'table' | 'floor' | 'any';
  /** what to look for among ready models ('none': the thing is built in code); the server searches and picks */
  model?: string;
  /** one still thing written by the fast model (the server's PUNTO_QUICK_MODEL): no plan on the tablet, he just types */
  quick?: boolean;
  /** the coder model in use (the server's word, shown above the typing box) */
  coder?: string;
  /** the server's word: draw the plan on the tablet (PUNTO_SKETCH=1), else Punto just types */
  sketch?: boolean;
  reply: string;
}

/** What came of a request, for Gemini Live to tell the player (the answer to its `act` tool, research/notes/LIVE.md). */
interface ActResult {
  status: 'ok' | 'error' | 'busy';
  message: string;
}

const SPELL_DONE: Record<SpellName, string> = {
  blaster: 'A blaster is in the player\'s hand now: it shoots and breaks the walls.',
  solarSystem: 'The planets of the solar system are flying round the player now.',
  breakWall: 'Punto has broken through the wall: the world outside shows through the hole.',
};

interface Made {
  name: string;
  ms: number;
  /** on the published site: the made feature compiled, to run here (there is no dev server to load its file) */
  js?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A change answered by edits, for Punto's screen: what went (-) and what came (+).
function editsAsCode(edits: unknown[]): string {
  const lines = (text: unknown, sign: string) => String(text ?? '').split('\n').map((line) => `${sign} ${line}`);
  return edits
    .map((edit) => {
      const { search, replace } = edit as { search?: unknown; replace?: unknown };
      return [...lines(search, '-'), ...lines(replace, '+')].join('\n');
    })
    .join('\n\n');
}

// Separate meshes a creation may draw (draw calls; Quest browser, 13.11: ~250 -> 36 fps of 90).
const MESH_BUDGET = 150;

async function tooHeavy(name: string): Promise<Error | undefined> {
  await sleep(1000); // things that come a moment later (tabletop, room)
  const meshes = drawnMeshes(name);
  console.info(`[punto] ${name} draws ${meshes} separate meshes`);
  if (meshes <= MESH_BUDGET) return undefined;
  return new Error(
    `Too heavy for the Quest browser: ${meshes} separate meshes are drawn every frame (budget ${MESH_BUDGET}), ` +
      'the headset drops to half its frame rate. Draw alike things (blocks, bricks, tiles, coins, leaves, parts of ' +
      'many alike creatures) with one InstancedMesh per material and merge static parts that share a material; ' +
      'keep everything else as it is.',
  );
}

const NUDGES: IntroLine[] = ['remind', 'suggestHoop', 'planets', 'suggestDna'];
const LIVE_NUDGES = [
  'ask what they would like you to make',
  'suggest a basketball hoop right on their wall',
  'suggest a little solar system right here',
  'suggest a giant DNA strand',
];
// While the coder writes: first "working on it", then a coder's joke or two, then "almost done".
const BUSY_EARLY: IntroLine[] = ['busyTyping', 'busyBugs', 'busyMagic', 'busyCompile'];
const BUSY_LATE: IntroLine[] = ['busyAlmost', 'busySoon'];
const FIRST_NUDGE = 12; // seconds of silence before the first reminder
const NEXT_NUDGE = 25; // and between the next ones
const WARMED_UP = 3; // requests after which Punto stops suggesting
const MAX_NUDGES = 6;

// Made games are not saved yet, so a new page starts without them. Only on a real page load:
// when the dev server swaps this file in place, the scene keeps what was made.
const pageLoad = !import.meta.hot?.data.loaded;
if (import.meta.hot) import.meta.hot.data.loaded = true;

feature(import.meta, (world) => {
  // A page load no longer clears the made games (it did until 13.11): with the emulator and the
  // headset both open, reloading one wiped the game in the other. The creation stays; 'clear' clears.
  const punto = spawnPunto(world, { voice: level });
  startPlacing(world); // the pinch that shows where a thing goes
  startSticking(world); // and a held thing sticks to the wall or table it is let go near
  // every made thing that can be taken may stick — checked every 2 s, so also after a page load
  const handler = setInterval(() => {
    for (const name of madeNow()) for (const thing of rootsOf(name)) makeStickable(thing);
  }, 2000);
  // over Punto's head (its own units: it is drawn 15 cm tall and scaled up)
  const bubble = speechBubble(punto.object, 0.13, 0.17);
  // the game's score board hangs right over the head; the bubble moves above it while it is shown
  const unmountScore = mountScore(punto.object, 0.1, 0.15);
  world.registerSystem(
    class PuntoBubble extends createSystem({}) {
      update(delta: number, time: number): void {
        bubble.raise(scoreHeight());
        bubble.update(delta, time);
      }
    },
  );
  speakFrom(world, punto.root); // the voice comes from Punto: headphones tell where it is

  let requests = 0;
  let making = false; // the live coder is writing a game

  // ---- Punto's live voice (?voice=live, src/livevoice.ts, research/notes/LIVE.md) ----
  // With it Gemini Live hears the player and speaks as Punto; what the player asks for is decided and done
  // here exactly as without it (the director, obey). So that only one voice talks, Punto's recorded lines
  // and the director's TTS replies stay quiet then: `speak` and `moment` below. Without ?voice=live, or when
  // Live cannot be reached, everything is as before.
  let live: LiveVoice | undefined;
  /** The director's reply, said aloud (TTS) — unless Live does the talking. */
  // A line that could not be said is not a failure: Punto goes on without it (the build above all, audit item 6).
  const speak = (text?: string): Promise<void> =>
    live || !text ? Promise.resolve() : say(text).catch((error) => console.warn('[punto] could not say a line', error));
  /** A recorded line of Punto's at a moment of the game; with Live, Live says it in its own words (`event`). */
  const moment = (line: IntroLine, event?: string): Promise<void> => {
    if (!live) return talk(punto, line);
    if (event) live.event(event);
    return Promise.resolve();
  };
  let inRoom: string | undefined; // the creation in the room now (its feature name)
  // The thing being made shows up part by part while the coder writes (src/draft.ts). With its
  // first part the little cubes before Punto go, and the creation it replaces burns away.
  let replaced: string | undefined;
  const draft = draftStage(world, punto, () => {
    punto.showBuild = false;
    if (replaced) hideForNext(replaced);
    firstShown = true;
    void sketching?.stop(); // the real parts are coming: the tablet goes
  });

  // ---- a ready model being coded (Yury, 16.11; src/materialize.ts): its outline on the tablet, the code as letters ----
  const show = materializeStage(world);
  const puntoAt = new Vector3();
  const fromPunto = () => punto.object.getWorldPosition(puntoAt);

  // ---- the plan on the tablet (Yury, 15.11; src/blueprint.ts, helper.ts sketch, polygon of 15.11) ----
  // While the coder writes a new thing, Flash-Lite lays it out as simple shapes (/api/plan, ~3 s); Punto takes out his
  // tablet, turns — whoosh — and draws the plan with a pencil, then works it over with the eraser, until the first real
  // part comes (or the thing, or a failure): then he turns back, puts the tablet away and builds as before.
  let sketching: { stop(): Promise<void> } | undefined;
  let firstShown = false; // a real part of the thing being made is in the room (draftStage's onFirstPart)
  const replacedShown = () => firstShown;
  /** `model`: the server's word on the ready model (a picked one, or null), when the director asked for one. */
  function startSketch(text: string, model?: Promise<ShownModel | null>): { stop(): Promise<void> } {
    let stopped = false;
    let shown: ReturnType<typeof sketchTablet> | undefined;
    const at = new Vector3(), q = new Quaternion(), eye = new Vector3();
    const run = (async () => {
      // a picked model: its own outline (and its code will fly out of it as letters); none: Flash-Lite's plan
      let paper: Blueprint | undefined;
      const picked = model ? await model : null;
      if (stopped || !making) return;
      if (picked) {
        const figuring = busy('model figure');
        const figure = await show.begin(picked, fromPunto).finally(figuring);
        if (stopped || !making) return;
        if (figure?.lines.length) {
          paper = new Blueprint({ lines: figure.lines });
          console.info(`[punto] drawing the outline of ${picked.title}: ${figure.lines.length} lines`);
        }
      }
      if (!paper) {
        const plan = await api<{ parts: PlanPart[] }>('plan', { text }).catch((error) => {
          console.warn('[punto] no plan to draw', error);
          return undefined;
        });
        if (stopped || !making || !plan?.parts?.length) {
          if (!stopped && making && !replacedShown()) punto.showBuild = true; // no plan to draw: he codes at his keyboard
          return;
        }
        console.info(`[punto] drawing the plan: ${plan.parts.length} parts`);
        paper = new Blueprint(plan.parts);
      }
      shown = sketchTablet(world, paper.texture, (body) => {
        // Where Punto is: he draws it out from behind his back on the spot and draws on it there, at the side of the
        // view, and the player turns to watch (Yury, 15.11 night: he jumped to the right to a spot 0.8-4 m ahead of
        // the player first). The draw starts DRAW_R = 0.36 m behind the tablet and 8 cm above it (src/helper.ts,
        // drawFrom): so the tablet goes 0.36 m from him toward the player, and he has nowhere to fly.
        const head = world.camera;
        head.getWorldPosition(eye);
        punto.object.getWorldPosition(at);
        const toPlayer = Math.atan2(eye.x - at.x, eye.z - at.z);
        at.set(at.x + Math.sin(toPlayer) * 0.36, at.y - 0.08, at.z + Math.cos(toPlayer) * 0.36);
        body.rotation.set(-0.12, Math.atan2(eye.x - at.x, eye.z - at.z), 0, 'YXZ'); // its face to the player
        q.copy(body.quaternion);
        body.scale.setScalar(0.001); // until Punto pulls it out
      });
      punto.showBuild = false; // his hands are on the tablet: no keyboard before him meanwhile
      if (show.active) show.useTablet({ paper, body: shown.body }); // the letters leave from the drawing
      await punto.bring(shown.body, TABLET_SIZE, at, q, { seconds: 1 });
      if (stopped) return;
      await punto.sketch(shown.body, paper);
      console.info('[punto] drawing on the tablet');
    })();
    return {
      async stop() {
        if (stopped) return;
        stopped = true;
        await run.catch(() => {});
        const tablet = shown;
        shown = undefined;
        if (!tablet) return;
        console.info('[punto] the tablet goes: the real parts are coming');
        show.useTablet(undefined); // the letters come from Punto now
        if (making && !replacedShown()) punto.showBuild = true; // no real part yet (the thing is late): his keyboard
        await punto.endSketch();
        await punto.putAway(tablet.body, 0.6);
        tablet.dispose();
      },
    };
  }
  /** Made games out of the scene: the server deletes their files (while developing); on the published
   *  site the ones that came as code go here (dropMade). The server forgets them either way. */
  async function unmake(which: { name?: string; keep?: string }): Promise<{ gone: number }> {
    dropMade(which);
    return api<{ gone: number }>('unmake', which);
  }

  // ---- Punto's tablet (src/library, research/notes/TABLET.md): only the director opens it ----
  // «сохрани» saves the creation and shows it among mine; «покажи мои игры» opens the library. After a
  // made thing Punto now and then offers to save it. PLAY brings an item in as the creation in the room.
  let tablet: Tablet | undefined;
  let lastTitle = '';
  let offers = 0; // how many times Punto has offered to save: the 1st thing, then every 3rd, at most 3
  let madeCount = 0;
  // The creation in the room as one of the player's recent games (Yury, 14.11: the last 5-10 games kept on the
  // tablet by themselves): a new thing starts a chain, its changes, undo and redo update the same card.
  let chain = '';
  const newChain = () => (chain = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  /** Keeps the creation in the room on the RECENT tab, with a picture once its things have set themselves out. */
  function keepRecent(): void {
    const name = inRoom;
    const title = lastTitle || 'My creation';
    if (!name || !chain) return;
    const kept = chain;
    setTimeout(() => {
      if (inRoom !== name) return; // replaced meanwhile: the next one keeps itself
      saveItem({ kind: 'game', title, fromRoom: true, thumb: pictureOf(name, title), recent: true, chain: kept })
        .then(() => tablet?.refresh())
        .catch((error) => console.warn('[punto] not kept among the recent games', error));
    }, 1500);
  }

  /** A picture of the creation in the room for its card. */
  function pictureOf(name: string, title: string): string | undefined {
    const group = new Group();
    for (const root of rootsOf(name)) {
      const object = root.object3D!;
      object.updateWorldMatrix(true, true);
      const copy = object.clone(true);
      object.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
      group.add(copy);
    }
    return group.children.length ? snapshot(world.renderer, group, tintOf(title)) : undefined;
  }

  /** An item from the library becomes the creation in the room (the server keeps its versions). */
  async function playItem(item: Item): Promise<void> {
    if (making) return tablet?.toast('One moment, still making the last thing');
    making = true;
    let made: Made | undefined;
    try {
      tablet?.toast(`Bringing in ${item.title}…`);
      nextReplaces(inRoom, false);
      made = await api<Made>('play', { id: item.id });
      if (made.js) runMade(made.name, made.js);
      await whenLoaded(made.name, 30);
      inRoom = made.name;
      lastTitle = item.title;
      chain = item.recent && item.chain ? item.chain : ''; // a recent game played again goes on its own card
      await unmake({ keep: made.name });
      clearAll();
      closeTablet();
      punto.setState('happy');
      await moment('done', `The player picked "${item.title}" on the tablet and it is in the room now.`);
    } catch (error) {
      console.error('[punto] play failed', error);
      if (made) await unmake({ name: made.name }).catch(() => {});
      if (inRoom) showAgain(inRoom);
      tablet?.toast('It did not load');
      await moment('failed', `"${item.title}" from the tablet did not load. Say sorry in one short line.`);
    } finally {
      making = false;
      punto.setState('idle');
    }
  }

  /** Punto takes the tablet back behind its back (at once when the feature goes away). */
  function closeTablet(now = false, seconds?: number): void {
    const shown = tablet;
    if (!shown) return;
    tablet = undefined;
    const body = shown.entity.object3D!;
    if (now) return shown.dispose();
    void punto.putAway(body, seconds).then(() => shown.dispose());
  }

  let brought = 0; // the first time the tablet comes out takes a little longer
  const tabletAt = new Vector3();
  const tabletQ = new Quaternion();

  /** Punto pulls the tablet from behind its back and holds it up in front of the player (only the director opens it). */
  async function showTablet(seconds?: number): Promise<Tablet> {
    if (tablet) {
      void tablet.refresh();
      return tablet; // already out: no second flight
    }
    const shown = await openTablet(world, {
      play: playItem,
      join: (_live, item) => playItem(item),
      host: async (item) => void (await openLive(item)),
      save: async () => {
        if (!inRoom) return null;
        const title = lastTitle || 'My creation';
        const kind = 'game';
        return saveItem({ kind, title, fromRoom: true, thumb: pictureOf(inRoom, title) });
      },
      power: (on) => {
        if (!on) setTimeout(() => closeTablet(), 400); // the power button puts the tablet away
      },
    }, (body) => {
      // where it is read: 0.8 m ahead (was 0.55: Punto peeking from behind it was in the player's face, 16.11),
      // a little below the eyes, tilted back, facing the player
      const head = world.camera;
      head.updateMatrixWorld();
      head.getWorldPosition(tabletAt);
      const yaw = Math.atan2(-head.matrixWorld.elements[8], -head.matrixWorld.elements[10]);
      tabletAt.set(tabletAt.x + Math.sin(yaw) * 0.8, tabletAt.y - 0.15, tabletAt.z + Math.cos(yaw) * 0.8);
      body.rotation.set(-0.15, yaw + Math.PI, 0, 'YXZ');
      tabletQ.copy(body.quaternion);
      body.scale.setScalar(0.001); // until Punto pulls it out
    });
    tablet = shown;
    await punto.bring(shown.entity.object3D!, TABLET_SIZE, tabletAt, tabletQ, {
      seconds: seconds ?? (brought++ ? 0.75 : 1.1),
      held: () => shown.entity.hasComponent(Grabbed),
    });
    return shown;
  }

  // A friend's link (the tablet's QR or SHARE): ?play=<item> or ?live=<open game> brings that game in.
  const link = new URLSearchParams(location.search);
  const wanted = link.get('play') ?? link.get('live');
  if (wanted) {
    void (link.has('play') ? Promise.resolve(wanted) : joinLive(wanted).then((game) => game.item))
      .then(getItem)
      .then(playItem)
      .catch((error) => {
        console.warn('[punto] the shared game did not come', error);
        // said, not only logged: a link without the access key used to bring nothing at all (audit item 19)
        const why = String(error);
        bubble.show(
          /no key|: 401/.test(why) ? 'This link needs the access key. Ask for the full link.'
            : /closed|no such item|: 404/.test(why) ? 'That game is not there any more.'
            : 'The shared game did not come.',
          10,
        );
      });
  }

  // A page load starts clean (Yury, 14.11: the last creation came back on the flat page and was not there in XR —
  // «не надо, чтобы была последняя»; while developing too: «убери причину загрузки старой игры»): the server forgets
  // this browser's creation and its versions, so "change it" never works on something unseen. (src/live.ts does not
  // load a made file that was there before the page.)
  if (!wanted) {
    void unmake({}).catch((error) => console.warn('[punto] the server did not forget the last creation', error));
  }

  let nudges = 0;
  let quietSince = performance.now();
  let nearTimer: ReturnType<typeof setTimeout> | undefined;
  /** Spoken to: Punto drifts a little closer, and after a quiet while back to his place (Yury, 15.11). */
  const comeNear = () => {
    punto.stay('near');
    clearTimeout(nearTimer);
    nearTimer = setTimeout(() => punto.stay('front'), 9000);
  };
  let walling = false; // the wall waits for the player's «fix it», or mends: Live's act only mends it
  let handedAt = 0; // when the talk went to Live after the way in (for the log: how long till its first words)
  let wholeAt = 0; // when Live was told the wall is whole (for the log: how long Punto was silent after it)
  let ready = !isNewPlayer(); // a returning player is ready at once; a new one after the intro

  // Why the server refused, in the bubble: true when it was the server (an [api] error with a status).
  function explain(error: unknown): boolean {
    const text = String(error);
    const status = Number(/\[api\] [\w/-]+: (\d{3})/.exec(text)?.[1] ?? 0);
    if (!status) return false;
    const hourTurns = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // the server's reason comes after the status (src/api.ts): a day's limit is not an hour's, and a game
    // that did not build is an answer, not silence (audit item 18)
    bubble.show(
      status === 429 && /today/.test(text) ? 'Daily limit reached. Back tomorrow.'
        : status === 429 ? `Hourly limit reached. Back at ${hourTurns}.`
        : status === 422 ? 'It did not build this time. Say it another way?'
        : status === 409 ? 'Still making the last thing.'
        : `The server did not answer (${status}).`,
      8,
    );
    return true;
  }
  // A request that did not go through is said and shown, never only logged: a typed one used to
  // leave Punto "coding" for ever while the server refused every call (the hourly limit, 14.11).
  async function notDone(error: unknown): Promise<void> {
    console.error('[punto]', error);
    const server = explain(error);
    if (!server) bubble.show('?', 1.5);
    if (making) return; // a build goes on: Punto stays at it
    await moment(server ? 'failed' : 'sorry').catch(() => {});
    punto.setState('idle');
  }
  /** Punto talks shop now and then while the coder writes, so the wait is never silent. Returns what stops it. */
  function chatter(): () => void {
    let stopped = false;
    if (live) {
      const keepCompany = 'You are still building it, it is not ready yet. Say one short line to keep the player company: a tiny coder joke or "almost there".';
      // not while the player is talking to Punto: the event would cut in on them
      const timers = [12_000, 32_000].map((ms) => setTimeout(() => !stopped && punto.state !== 'listen' && live?.event(keepCompany), ms));
      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
      };
    }
    void (async () => {
      const lines: IntroLine[] = ['busyWorking', ...[...BUSY_EARLY].sort(() => Math.random() - 0.5).slice(0, 2), ...BUSY_LATE];
      await sleep(3000);
      for (const line of lines) {
        if (stopped) return;
        if (punto.state === 'build') {
          await talk(punto, line).catch(() => {});
          if (!stopped) punto.setState('build');
        }
        await sleep(5000 + Math.random() * 3000);
      }
    })();
    return () => {
      stopped = true;
    };
  }

  /** The surface a thing being placed belongs on: the director's word, or, when it says "any" for moving the creation
   *  in the room, the creation's own shape — wide and low lies on a floor (14.11: a Minecraft shown on a wall was
   *  walled in). */
  function surfaceFor(direction: Direction): 'wall' | 'table' | 'floor' | 'any' {
    const said = direction.surface ?? 'any';
    if (said !== 'any' || direction.action !== 'change' || !inRoom) return said;
    const box = new Box3();
    for (const entity of rootsOf(inRoom)) if (entity.object3D) box.expandByObject(entity.object3D);
    if (box.isEmpty()) return said;
    const size = box.getSize(new Vector3());
    const wide = Math.max(size.x, size.z);
    return wide > 0.3 && size.y < 0.6 * wide ? 'floor' : said;
  }

  // What the player said -> what Punto does. Punto is 'think' while the director decides.
  async function obey(audio: string, typed?: string, given?: Direction, report?: (result: ActResult) => void): Promise<string> {
    // on the way in the wall waits to be mended: whatever is said to Punto then mends it (src/entrance.ts)
    if (takeWord()) return 'the wall mends';
    // while the server hears and decides, Punto is already at work: code on its screen. No keyboard yet (Yury, 15.11:
    // keyboard, tablet, keyboard again — the first one was a blink): it comes once there is code to write
    if (!making) punto.showBuild = false;
    punto.setState('build');
    const direction =
      given ??
      (typed ? { ...(await api<Direction>('direct', { text: typed })), said: typed } : await api<Direction>('talk', { audio, mime: 'audio/webm' }));
    console.info(`[punto] heard: ${direction.said}`);
    bubble.show(direction.said ? `“${direction.said}”` : '?', direction.said ? 4 : 1.5);
    console.info(`[punto] ${direction.action} ${direction.spell}: ${direction.reply}`);
    if (!direction.said) {
      // nothing was said: the pinch was not meant for talking (and Punto may be busy coding)
      if (!making) punto.setState('idle');
      report?.({ status: 'error', message: 'Nothing was heard.' });
      return 'heard nothing';
    }
    requests++;
    // anything else to do: the games tablet goes behind his back first (16.11, Yury: it stayed out while he went on
    // to other things — «как только он чем-то другим занимается, чтоб он его убирал»)
    if (direction.action !== 'save' && direction.action !== 'library') closeTablet();
    if (direction.action === 'spell' && direction.spell !== 'none') {
      // it goes on putting the thing together before itself, answering meanwhile;
      // then it flies off and makes it with its hands
      await Promise.all([speak(direction.reply), sleep(1500)]);
      punto.showBuild = false;
      await SPELLS[direction.spell](world, punto);
      punto.showBuild = true;
      // the spells say their own recorded line (how to use the blaster): Live only adds a word, not a repeat
      report?.({ status: 'ok', message: `${SPELL_DONE[direction.spell]} Punto has just said a line about it himself: add at most a very short cheer, do not explain it again.` });
    } else if (direction.action === 'move') {
      // «на другой стол», «на ту стену» (17.11): the creation runs again as it is on the next spot — no coder
      if (making) {
        bubble.show(ui('One moment…', 'Минутку…'), 3);
        report?.({ status: 'busy', message: 'Still making the last thing.' });
        return 'busy: still making the last thing';
      }
      if (!inRoom) {
        punto.setState('idle');
        report?.({ status: 'error', message: 'There is nothing in the room to move yet.' });
        return 'move: nothing in the room';
      }
      requestBegins(world);
      const kind = direction.surface === 'wall' || direction.surface === 'floor' ? direction.surface : 'table';
      const moved = placeElsewhere(world, kind);
      if (!moved) {
        punto.setState('idle');
        report?.({
          status: 'error',
          message: kind === 'table' ? 'The room has no other table.' : 'It already hangs on the wall the player looks at: ask them to look at the other wall and say it again.',
        });
        return `move: no other ${kind}`;
      }
      try {
        const again = await api<{ name: string; js?: string }>('again', { name: inRoom });
        if (again.js) runMade(again.name, again.js);
      } catch (error) {
        // its code takes no spot from the room: only a change can move it — the coder, with the spot chosen
        if (String(error).includes(': 409')) {
          console.info('[punto] it takes no spot from the room: moving it by a change');
          return obey(audio, typed, { ...direction, action: 'change', place: 'pointed', spotChosen: true }, report);
        }
        placeDone();
        console.error('[punto] move failed', error);
        report?.({ status: 'error', message: 'It did not move this time.' });
        return `move failed: ${String(error).slice(0, 200)}`;
      }
      setTimeout(placeDone, 2500); // the glow on the new spot goes once the thing stands there
      punto.setState('happy');
      void speak(direction.reply);
      report?.({
        status: 'ok',
        message: `It stands on the other ${moved.place.surface} now.` + (moved.again ? ' It has been on every table of the room, so this is the first one again.' : ''),
      });
      setTimeout(() => punto.setState('idle'), 1500);
      return `move: ${moved.place.surface}${moved.again ? ' (round again)' : ''}`;
    } else if (direction.action === 'make' || direction.action === 'change') {
      // «откати» / «верни обратно»: a version the player already had comes back, with no coder (14.11).
      // It is not a new thing: no weighing, no «Done!» (his line said it), no count towards «save it».
      const step = (direction as Direction & { step?: 'undo' | 'redo' }).step;
      if (making) {
        // One thing at a time (the server refuses a second one anyway). Not taken here, before
        // anything is touched: a second request once ended the draft of the first (14.11).
        console.info('[punto] still making the last thing: this request is not taken');
        bubble.show(ui('One moment…', 'Минутку…'), 3);
        report?.({ status: 'busy', message: 'Still making the last thing.' });
        return 'busy: still making the last thing';
      }
      // the live coder writes a new game (7-46 s) while Punto answers; Punto codes on, its screen full of code
      making = true;
      requestBegins(world); // its table is the one looked at when the phrase began (askPlace, tabletop)
      if (direction.action === 'make') newCreation(); // it has stood on no table yet («на другой стол»)
      announceMaking(direction.said); // friends in the room see who is changing the game (src/together.ts)
      let made: Made | undefined;
      let modelSaid: (model: ShownModel | null) => void = () => {}; // the server's word on the ready model (below)
      try {
        // 'change' edits the creation in the room; 'make' builds a new one, which then replaces it
        // the new one replaces the creation in the room (a change keeps the player's moves of its
        // things); the file may land before the reply does
        // "on the wall": the player shows the spot while the coder writes; the made code takes it when it runs
        const pointed = direction.place === 'pointed';
        // a change that puts the thing on a new spot must not drag the player's old move along (13.11:
        // a Tetris field "on the other wall" landed off the wall by the old shift)
        nextReplaces(inRoom, direction.action === 'change' && !pointed);
        // after each of its lines Punto goes back to coding: the player sees the work goes on
        const backToWork = () => {
          if (making) punto.setState('build');
        };
        if (pointed && !direction.spotChosen) askPlace(world, () => void moment('gotIt').catch(() => {}).then(backToWork), surfaceFor(direction));
        // The coder's answer comes as it is written (research/notes/STREAM.md): its code runs on Punto's screen,
        // and for a new thing every draft of the file adds the parts written so far to the room.
        const growing = direction.action === 'make';
        // the server's word on the ready model comes first in the stream (~1-2 s): it decides what the tablet shows
        const wantsModel = growing && !!direction.model && direction.model !== 'none';
        const modelComing = wantsModel
          ? new Promise<ShownModel | null>((resolve) => {
              modelSaid = resolve;
              setTimeout(() => resolve(null), 8000); // an older server, or the word lost: the plan, as before
            })
          : undefined;
        if (growing) {
          replaced = inRoom;
          // a new game: the old one burns away now, as Punto starts — not when the first part of the new one comes
          // (a ready model, or a silent coder, brought none for half a minute: drums, sticks, the pistol and its
          // drawing all at once, 16.11). If nothing comes of the new one, the old one comes back (showAgain).
          if (replaced) hideForNext(replaced);
          draft.begin({ pointed, roomIsThePlace: direction.kind === 'place' });
          void sketching?.stop();
          show.end();
          firstShown = false;
          // the plan on the tablet first; his keyboard after it. A quick thing comes in seconds: no tablet, he just types
          // (Yury, 18.11)
          if (direction.quick || !direction.sketch) punto.showBuild = true;
          else sketching = startSketch(direction.said, modelComing);
        } else {
          punto.showBuild = true; // a change: no plan to draw, he codes at his keyboard
        }
        let code = '';
        if (direction.coder) boxModel(direction.coder);
        boxStage('ждёт первое слово');
        const coding = apiStream<Made>(direction.action, { phrase: direction.said, kind: direction.kind, place: direction.place }, (event) => {
          if ('model' in event) modelSaid((event.model as ShownModel | null) ?? null);
          else if (typeof event.start === 'string') {
            code = '';
            boxModel(event.start);
            boxStage('пишет код');
          } else if (event.stage === 'twin') boxStage('молчит 30 с → близнец');
          else if (typeof event.code === 'string') {
            punto.setCode((code += event.code));
            show.code(event.code); // the code flies out of the drawing (only while a model is being shown)
          } else if (typeof event.draft === 'string') {
            if (!show.active) draft.show(event.draft); // a model being shown is its own draft
          } else if (Array.isArray(event.edits)) punto.setCode(editsAsCode(event.edits));
          else if (event.stage === 'written') {
            boxStage('проверка типов');
            show.written();
            // the drawing has gone to letters: the tablet goes after the last of them has left
            const drawing = sketching;
            if (show.active) setTimeout(() => void drawing?.stop(), 1200);
          } else if (event.stage === 'repair') {
            boxStage('починка');
            show.repair();
          }
        });
        coding.catch(() => {}); // awaited below, after the answer
        await speak(direction.reply);
        if (pointed && direction.surface !== 'table' && !direction.spotChosen) await moment('pointIt'); // a table is chosen at once
        backToWork();
        const stopChatter = chatter();
        made = await coding.finally(stopChatter);
        console.info(`[punto] made ${made.name} in ${made.ms} ms`);
        const loading = busy(`made load ${made.name}`); // until it is in the scene (src/perf.ts)
        const loadingFrom = performance.now();
        if (made.js) runMade(made.name, made.js);
        // "Done!" only when the thing really is in the scene; a failed one gets one repair.
        // Too many separate meshes counts as a failure too (the headset drops frames); after
        // the repair a heavy but working thing stays: slow is better than nothing.
        // a thing waiting for the player's pointing loads when the spot comes (at most 20 s more)
        const loadWait = pointed ? 40 : 10;
        let failure = await whenLoaded(made.name, loadWait).finally(() => {
          loading();
          console.info(`[perf] ${made!.name} in the scene after ${Math.round(performance.now() - loadingFrom)} ms`);
        }).then(
          () => {
            thingInScene(); // the typed phrase's clock stops here, not after Punto's lines (src/typebox.ts)
            // the real thing is in: the draft burns away over it — and a draft's trouble never fails the real thing
            try { draft.end(); } catch (error) { console.warn('[draft] could not end cleanly', error); }
            if (show.active) void show.reveal(made!.name); // the letters go onto its model
            // a version back was weighed when it was made, and a heavy one was kept then: a repair now would be paid for nothing
            return step ? undefined : tooHeavy(made!.name);
          },
          (error) => error,
        );
        if (failure) {
          console.warn(`[punto] ${made.name} failed in the scene, repairing`);
          punto.setState('build');
          void moment('fixing', 'The first try broke and you are fixing it now. Say so in one short line; it is not ready yet.').then(() => punto.setState('build'));
          nextReplaces(inRoom, direction.action === 'change' && !pointed);
          made = await api<Made>('repair', { name: made.name, error: String(failure?.stack ?? failure).slice(0, 1500) });
          console.info(`[punto] repaired as ${made.name} in ${made.ms} ms`);
          if (made.js) runMade(made.name, made.js);
          failure = await whenLoaded(made.name, loadWait).then(() => undefined, (error) => error);
          draft.end();
          if (!failure && show.active) void show.reveal(made.name);
        }
        if (failure) {
          await unmake({ name: made.name }); // what it replaced comes back
          if (inRoom) showAgain(inRoom); // it was hidden when the failed one came in
          throw failure;
        }
        inRoom = made.name;
        await unmake({ keep: made.name }); // one creation at a time: the old one goes now
        clearAll(); // and the spells with it: a blaster and its broken walls do not outlive the request (13.11)
      } catch (error) {
        console.error('[punto] make failed', error);
        explain(error);
        draft.end();
        show.fail(); // the letters fall and go
        if (inRoom) showAgain(inRoom); // it burnt away when the new one's first part came
        report?.({ status: 'error', message: `It did not work this time${String(error).includes(': 429') ? ': the server has done enough for now' : ''}.` });
        await moment('failed');
        return `${direction.action} failed: ${String(error).slice(0, 200)}`;
      } finally {
        making = false;
        modelSaid(null); // never left waiting
        announceMade(); // and take the new version
        void sketching?.stop(); // no real part came before the thing (or nothing came): the tablet goes now
        sketching = undefined;
        placeDone(); // the circle on the spot goes, whatever came of it
        draft.end();
        punto.setCode(null); // the screen's own sample again
      }
      punto.setState('happy');
      if (!step) await moment('done');
      if (direction.action === 'make') {
        lastTitle = (direction.title || direction.said).slice(0, 40);
        newChain();
      } else if (!chain) newChain();
      keepRecent();
      if (!step) madeCount++;
      // the way to keep it: offered for the first thing, then every third, three times at most
      const offer = !step && offers < 3 && (madeCount === 1 || madeCount % 3 === 0);
      if (offer) offers++;
      report?.({
        status: 'ok',
        message:
          (step === 'undo' ? 'The earlier version is back in the room.' : step === 'redo' ? 'The newer version is back in the room.'
            : direction.action === 'change' ? `The change is done: "${direction.said}".` : `It is in the room now: "${direction.said}".`) +
          (offer ? ' Also suggest, in a few words, that they can say "save it" to keep it on your tablet.' : ''),
      });
      if (offer && !live) await talk(punto, 'saveOffer').catch(() => {});
      punto.setState('idle');
      return `${direction.action}: ${made!.name} in ${made!.ms} ms — «${direction.reply}»`;
    } else if (['invite', 'join', 'letIn', 'notNow', 'leave', 'name'].includes(direction.action)) {
      // playing together from different rooms (src/together.ts, research/notes/SHARING.md)
      punto.setState('talk');
      let message = '';
      if (direction.action === 'invite') {
        invite();
        message = 'The way in for a friend is in front of the player now: the room\'s code to say, a QR for a phone, a link.';
      } else if (direction.action === 'join') {
        const going = await visit(direction.who ?? '');
        message = going === 'no such room' ? `Nobody called "${direction.who}" is playing now.` : `Knocking at ${direction.who}'s room; they let the player in or not.`;
      } else if (direction.action === 'letIn' || direction.action === 'notNow') {
        const knock = answerKnock(direction.action === 'letIn');
        message = !knock ? 'Nobody is knocking now.' : direction.action === 'letIn' ? 'The friend is coming in.' : 'The friend was told: not now.';
      } else if (direction.action === 'leave') {
        goHome();
        message = 'The player is back in their own room.';
      } else if (direction.action === 'name' && direction.who) {
        setName(direction.who);
        message = `The player's name is kept: ${direction.who}.`;
      }
      report?.({ status: 'ok', message: message || 'Nothing was done.' });
      await speak(direction.reply);
    } else if (direction.action === 'save' || direction.action === 'library') {
      punto.setState('talk');
      if (direction.title) lastTitle = direction.title.slice(0, 40);
      const reply = speak(direction.reply);
      const shown = await showTablet();
      if (direction.action === 'save') shown.save();
      report?.({
        status: 'ok',
        message: direction.action === 'save' ? `Your tablet is out and the creation is saved on it as "${lastTitle || 'My creation'}".` : 'Your tablet with the saved games is out in front of the player.',
      });
      await reply;
    } else if (direction.action === 'clear') {
      const gone = clearAll();
      inRoom = undefined;
      closeTablet();
      const { gone: games } = await unmake({});
      console.info(`[punto] cleared ${gone} things and ${games} made games`);
      punto.setState('happy');
      report?.({ status: 'ok', message: 'The room is cleared.' });
      await speak(direction.reply);
    } else {
      punto.setState(live ? 'idle' : 'talk');
      report?.({ status: 'ok', message: `Nothing was done. Tell the player, in your own words: ${direction.reply}` });
      await speak(direction.reply);
    }
    punto.setState('idle');
    return `${direction.action}${direction.spell !== 'none' ? ` ${direction.spell}` : ''} — «${direction.reply}»`;
  }

  // ---- what Gemini Live asks for (?voice=live) ----
  // `act`: the player wants something to happen. The phrase is what Live heard (its arguments are its own
  // shortened English, research/notes/LIVE.md §4); the same director decides and obey does it; the answer tells Live what
  // really happened, and only then does it say "done". `emote`: Punto's body in time with its voice (§6б).
  let typedPhrase: string | undefined; // a typed phrase stands in for a heard one
  let actInTurn = false; // Live has asked for something since the player last spoke
  let spoke = false; // and has said something
  const waiting: ((outcome: string) => void)[] = []; // typed phrases waiting for what came of them
  const settle = (outcome: string) => {
    for (const done of waiting.splice(0)) done(outcome);
  };
  const turnBegins = () => {
    actInTurn = false;
    spoke = false;
  };

  async function act(call: ToolCall): Promise<void> {
    const phrase = (typedPhrase ?? call.heard).trim() || String(call.args.wish ?? '').trim();
    typedPhrase = undefined;
    actInTurn = true;
    let result: ActResult = { status: 'error', message: 'It did not work this time.' };
    let outcome = 'act: nothing done';
    try {
      if (!phrase) {
        result = { status: 'error', message: 'Nothing was heard.' };
      } else {
        if (!making) punto.showBuild = false; // no keyboard while the director decides (as in obey)
        punto.setState('build');
        const direction: Direction & { step?: string } = { ...(await api<Direction>('direct', { text: phrase })), said: phrase };
        // the coder takes a while: Live says it is on it now (without this it kept silent until the end, 14.11)
        if ((direction.action === 'make' || direction.action === 'change') && !direction.step && !making) {
          live?.event(
            direction.place === 'pointed' && direction.surface === 'table'
              ? 'You have started on what the player asked for. In one short line say you are on it and that it goes on the table they looked at — the one lit up now. Do not ask them to point. It is not ready yet.'
              : direction.place === 'pointed'
              ? 'You have started on what the player asked for. In one short line say you are on it and that it goes where the player looked — the spot marked now. Do not ask them to point. It is not ready yet.'
              : 'You have started on what the player asked for. Say one short line that you are on it. It is not ready yet.',
          );
        }
        outcome = await obey('', undefined, direction, (report) => (result = report));
      }
    } catch (error) {
      await notDone(error);
      result = { status: 'error', message: String(error).includes(': 429') ? 'The hourly limit is reached: it can be tried again later.' : 'It did not work this time.' };
      outcome = `error: ${String(error).slice(0, 200)}`;
    }
    live?.answer(call.id, call.name, { ...result });
    settle(outcome);
  }

  function emote(call: ToolCall): void {
    const kind = String(call.args.kind ?? '');
    if (!making) {
      if (kind === 'cheer') punto.setState('happy');
      else if (kind === 'wave') punto.perform('wave');
      else if (kind === 'think' || kind === 'oops') punto.perform('scratch');
      else if (kind === 'laugh') punto.poke(); // ticklish: its laugh
      else if (kind === 'surprise') punto.perform('look');
    }
    // INTERRUPT with this guidance keeps it talking (SILENT silenced it, research/notes/LIVE.md §6б)
    live?.answer(call.id, call.name, { status: 'ok', guidance: 'Body moved. Now say your line out loud.' });
  }

  // Punto's recorded lines (the intro, the hints, the spells' lines) said by Live: one voice, the player's
  // language. Each resolves once Live has said it (its voice came and went), or after 12 s.
  // A pause inside a line («Ой…») stops the voice for a moment: a line is over only once Live has ended its turn
  // and the voice has stopped (14.11: the reminder came 4 s after the greeting instead of 8).
  const sayWaiters = new Set<{ started: boolean; turned: boolean; done: () => void }>();
  function sayThroughLive(text: string): Promise<void> {
    return liveSays(`Say exactly this line, word for word, and nothing else: "${text}"`, 12_000);
  }
  /** An [event] for Live; resolves once Live has answered it aloud (its voice came and went), or after `most` ms. */
  function liveSays(event: string, most = 15_000): Promise<void> {
    return new Promise((resolve) => {
      if (!live) return resolve();
      const waiter = { started: false, turned: false, done: resolve };
      sayWaiters.add(waiter);
      live.event(event);
      setTimeout(() => {
        sayWaiters.delete(waiter);
        resolve();
      }, most);
    });
  }
  /** The microphone goes to Live only while the player is in XR (Visible: not in the system menu either), and not
   *  while friends are in the room: then the player talks to them, and to Punto only on a pinch (src/together.ts). */
  const listenInXR = () => live?.listen(world.visibilityState.peek() === VisibilityState.Visible && !company());
  const stopListening = world.visibilityState.subscribe(listenInXR);
  const stopCompany = onCompany(listenInXR);

  const liveHandlers = {
    // a voice on the microphone, before Live has a word of it: he turns to listen at once (16.11)
    voice() {
      phraseBegins(world); // "on that table": where the player looks as they begin to say it (src/place.ts)
      if (!ready || walling) return;
      comeNear();
      if (!making && punto.state === 'idle') punto.setState('listen');
    },
    heard(text: string) {
      if (!text) return;
      quietSince = performance.now();
      if (takeWord()) return; // on the way in: whatever is said mends the wall (src/entrance.ts)
      if (ready) comeNear();
      if (!actInTurn) turnBegins();
      bubble.show(`“${text}”`, 4);
      if (!making && punto.state === 'idle') punto.setState('listen');
    },
    tool(call: ToolCall) {
      // the wall waiting for «fix it», or mending: that is what the player asked for, nothing else is done
      if (walling && call.name === 'act') {
        takeWord();
        // one short word, not silence: «say nothing» left Punto mute through the whole mending (15.11, the headset)
        live?.answer(call.id, call.name, {
          status: 'ok',
          message: `The wall is being mended right now. Say only this, word for word, and nothing more: ${ui('"On it!"', '"Чиню!"')} You will be told when it is whole.`,
        });
        return;
      }
      // coming in through the wall and the intro: a scripted scene with recorded lines; Live waits
      if (!ready && call.name === 'act') {
        live?.answer(call.id, call.name, { status: 'busy', message: 'Not now: Punto is still coming into the room. Say nothing.' });
        return;
      }
      if (call.name === 'act') void act(call);
      else if (call.name === 'emote') emote(call);
      else live?.answer(call.id, call.name, { status: 'error', message: 'There is no such tool.' });
    },
    speaking(on: boolean) {
      quietSince = performance.now(); // Live talking is not a silence to fill with a reminder
      if (on && handedAt) {
        console.info(`[live] first words ${((performance.now() - handedAt) / 1000).toFixed(1)} s after the hand-over`);
        handedAt = 0;
      }
      if (on && wholeAt) {
        console.info(`[live] first words ${((performance.now() - wholeAt) / 1000).toFixed(1)} s after the mended wall`);
        wholeAt = 0;
      }
      for (const waiter of sayWaiters) {
        if (on) waiter.started = true;
        else if (waiter.started && waiter.turned) {
          sayWaiters.delete(waiter);
          waiter.done();
        }
      }
      if (on) {
        spoke = true;
        // not over his work (mending the wall): the face keeps its code, the mouth goes with the voice anyway (helper.ts)
        if (!making && punto.state !== 'listen' && punto.state !== 'build') punto.setState('talk');
      } else if (!making && (punto.state === 'talk' || punto.state === 'happy')) {
        punto.setState('idle');
      }
    },
    turn() {
      for (const waiter of sayWaiters) {
        if (!waiter.started) continue;
        waiter.turned = true;
        if (live?.speaking) continue; // its voice is still playing: speaking(false) ends it
        sayWaiters.delete(waiter);
        waiter.done();
      }
      // a typed phrase that asked for nothing is answered once Live has said its piece
      if (!actInTurn && spoke) settle('live: talked, nothing to do');
      // heard, but nothing came of it (no words, no answer): Punto stops thinking
      setTimeout(() => {
        if (!making && !live?.speaking && punto.state === 'think') punto.setState('idle');
      }, 1500);
    },
    refused() {
      bubble.show(ui('Hourly limit reached.', 'Лимит на час исчерпан.'), 6);
      if (!making) punto.setState('idle');
    },
    lost() {
      live = undefined; // the usual chain from now on (listenOnPinch asks every pinch)
      speakLinesWith(undefined);
    },
  };

  /** A typed phrase with the live voice: Live hears it as if said; resolves with what came of it. */
  function liveTyped(text: string): Promise<string> {
    typedPhrase = text;
    turnBegins();
    bubble.show(`“${text}”`, 4);
    if (!making) punto.setState('think');
    live!.type(text);
    return new Promise((resolve) => {
      waiting.push(resolve);
      setTimeout(() => resolve('live: no answer in 90 s'), 90_000);
    });
  }

  // Gone (the feature reloaded) while Live was still connecting: that connection is closed as soon as it opens.
  // Left open it went on as a second Punto voice and kept the microphone in the background (15.11, the headset:
  // two greetings at once after three hot reloads of this file).
  let gone = false;
  if (liveWanted()) {
    connectLive(liveHandlers).then(
      (voice) => {
        if (gone) {
          voice.close();
          return;
        }
        live = voice;
        voice.hush(entered && !ready); // connected during the way in: quiet till it is over
        // Punto's recorded lines stay recorded: said by Live they came 4-11 s late, and the way in through the
        // wall waits for each of them (the headset, 14.11: «медленно… никто не стал пробивать стену»).
        // With ?lang=ru they are Russian too. (sayThroughLive is kept for a faster Live.)
        void sayThroughLive;
        listenInXR();
        (window as unknown as { __puntoLive?: LiveVoice }).__puntoLive = voice; // for checks, like __punto
        console.info('[live] Punto hears and speaks with Gemini Live');
      },
      (error) => console.warn('[live] not available: the usual voice', error),
    );
  }

  // On a computer, while developing: a box to type tasks, obeyed like spoken ones (src/typebox.ts). It was
  // made for the emulator: the published site has none (Yury, 14.11).
  const removeTypeBox = !import.meta.env.DEV ? () => {} : typeBox((text) =>
    (live ? liveTyped(text) : obey('', text)).catch(async (error) => {
      await notDone(error);
      throw error;
    }),
  );

  // The dev bridge (vite.config.ts, tools/say.mjs): a typed phrase is obeyed like a spoken one.
  import.meta.hot?.on('punto:say', ({ id, text }: { id: string; text: string }) => {
    const started = performance.now();
    (live ? liveTyped(text) : obey('', text))
      .catch(async (error) => {
        await notDone(error);
        return `error: ${String(error).slice(0, 200)}`;
      })
      .then((outcome) => import.meta.hot?.send('punto:said', { id, text, outcome, seconds: Math.round((performance.now() - started) / 100) / 10 }));
  });

  listenOnPinch(
    world,
    punto,
    (audio) => {
      quietSince = performance.now();
      obey(audio)
        .catch(notDone)
        .finally(() => (quietSince = performance.now()));
    },
    () => {
      quietSince = performance.now();
      comeNear();
      bubble.listening();
    },
    () => bubble.hide(),
    { voice: () => (company() ? undefined : live) }, // with friends in the room a pinch is talking to Punto again
  );

  const stopWayIn = pointTheWayIn(world, punto); // before XR: Punto points at its power button
  let entered = false;
  prepareIntro(); // the way in talks for every player, new or not
  const stopWatching = world.visibilityState.subscribe((state) => {
    if (entered || state !== VisibilityState.Visible) return;
    entered = true;
    // breaks in through the wall ahead (or just pops in where there is none), then the intro
    // the way in only for a new player: one who has seen it is welcomed back by Punto popping in (Yury, 15.11:
    // «убрать для повторных входов»); `?intro` shows it again
    const newPlayer = isNewPlayer();
    ready = false; // no reminders while Punto is still coming in
    live?.hush(true); // and Live keeps quiet: the way in speaks with its recorded lines
    // With Live the talk is Live's from the moment Punto is out of the wall (Yury, 14.11 night: «заставка минимальная»,
    // «всё общается Live»): it says who it is and asks for «fix it» — the first time the player speaks and Punto
    // does — then offers what to make. Without Live, the recorded lines and the recorded intro.
    let talking = false;
    const OFFER = 'offer a wall-breaking blaster, a little solar system right here, or anything they think of. Then let them speak.';
    const startTalk = () => {
      if (!live || talking) return false;
      talking = true;
      handedAt = performance.now();
      ready = true;
      live.hush(false);
      quietSince = performance.now();
      console.info('[live] the talk is Live\'s now');
      return true;
    };
    /** Live, if it is wanted and comes within `ms` (it connects in the background, up to ~12 s). */
    const liveSoon = async (ms: number) => {
      for (let waited = 0; liveWanted() && !live && waited < ms; waited += 200) await sleep(200);
      return live;
    };
    const wallVoice = async (): Promise<EntranceVoice | undefined> => {
      // with Live wanted, its own words: the recorded lines teach the pinch, and Live needs none
      await liveSoon(8000);
      if (!startTalk()) return undefined;
      walling = true;
      return {
        // the exact words in the player's language: in its own words Live turned «скажи мне: почини» into «почини её» (14.11)
        greet: () =>
          liveSays(
            "You have just squeezed out through a hole in the player's wall into their room. Say this, word for word: " +
              ui(
                '"Oh, hi! I\'m Punto, a pretty cool coder. Oops… we wrecked your wall. Just tell me: fix it!"',
                '"О, привет! Я Пунто, крутой кодер. Ой… стену-то мы тебе испортили. Просто скажи мне: почини!"',
              ) +
              ' You fix it yourself as soon as the player says it. Then wait.',
          ),
        remind: () =>
          liveSays(
            'The player has not said anything yet. Say this, word for word: ' +
              ui('"Well? Just say it, and I\'ll patch it up."', '"Ну? Скажи — и я заделаю."'),
          ),
        giveUp: () =>
          liveSays(`The player still said nothing. Say this, word for word: ${ui('"Okay, I\'ll fix it myself!"', '"Ладно, сам починю!"')}`, 6000),
        mended() {
          walling = false;
          quietSince = performance.now();
          wholeAt = performance.now();
          const text = `The wall is whole again, as the player asked. In one or two short sentences: "See? You say it, I make it." Then ${OFFER}`;
          live?.event(text);
          // Punto talks here whatever happens: Live sometimes lets an [event] go by in silence (an empty turn,
          // 15.11). Nothing heard of it in 5 s: asked once more, now.
          setTimeout(() => {
            if (!wholeAt || !live || live.speaking) return;
            console.info('[live] silent after the mended wall: asked again');
            live.event(`You have not said it yet. Say it now, out loud. ${text}`);
          }, 5000);
        },
      };
    };
    const comeIn = newPlayer
      ? burstIn(world, punto, wallVoice)
      : Promise.resolve().then(() => {
          punto.object.visible = true;
          punto.enter();
          return false;
        });
    comeIn
      .catch((error) => {
        console.error('[entrance]', error);
        punto.object.visible = true;
        punto.enter();
      })
      .then(async () => {
        walling = false;
        // with Live wanted, it is waited for here too, not the recorded intro (which teaches the pinch)
        if (!talking) await liveSoon(8000);
        // no wall to come through: Live starts the talk straight away
        if (startTalk()) {
          live?.event(
            newPlayer
              ? `You have just popped into the player's room. In one or two short sentences say who you are (Punto, you live in the code behind their walls; they say it, you build it) and ${OFFER}`
              : `You have just popped into the player's room. You have met before: they know you. In one short sentence welcome them back, then ${OFFER}`,
          );
        }
        if (talking) return;
        return newPlayer ? runIntro(world, punto, (text) => bubble.show(`“${text}”`, 2.4)) : talk(punto, 'again');
      })
      .catch((error) => console.error('[intro]', error))
      .finally(() => {
        ready = true;
        live?.hush(false);
        quietSince = performance.now();
        markSeen();
      });
  });

  const nudger = setInterval(() => {
    // never while something is being made: a hint in the middle of a build sounds lost (13.11)
    if (!ready || walling || making || requests >= WARMED_UP || nudges >= MAX_NUDGES || punto.state !== 'idle') return;
    if (world.visibilityState.peek() !== VisibilityState.Visible) return;
    const quiet = (performance.now() - quietSince) / 1000;
    if (quiet < (nudges === 0 ? FIRST_NUDGE : NEXT_NUDGE)) return;
    quietSince = performance.now();
    // with Live the reminder is Live's too: one voice, and no «pinch» (Live hears without it)
    if (live) live.event(`The player has said nothing for a while. In one short line, ${LIVE_NUDGES[nudges++ % LIVE_NUDGES.length]}.`);
    else talk(punto, NUDGES[nudges++ % NUDGES.length]).catch((error) => console.warn('[punto]', error));
  }, 1000);

  (window as unknown as { __punto?: typeof punto }).__punto = punto;
  (window as unknown as { __puntoWorld?: World }).__puntoWorld = world; // for checks (a draft stage by hand, 15.11)
  // for checks: Punto brings the tablet out and takes it away, as the director's «покажи мои игры» does
  /** A picture for a library item that has none: it is played in the room and pictured the way a save
   *  pictures the creation (pictureOf), then the picture goes to its card. For the kept games (14.11). */
  async function pictureItem(id: string, settle = 2500): Promise<boolean> {
    const item = await getItem(id);
    await playItem(item);
    await sleep(settle); // games set out their pieces a moment after they load
    const thumb = inRoom ? pictureOf(inRoom, item.title) : undefined;
    if (!thumb) return false;
    await addThumb(item.id, thumb);
    return true;
  }
  (window as unknown as { __puntoTablet?: unknown }).__puntoTablet = { show: showTablet, close: closeTablet, picture: pictureItem };
  return () => {
    gone = true;
    stopWatching();
    stopWayIn();
    unmountScore();
    clearInterval(nudger);
    clearTimeout(nearTimer);
    void sketching?.stop();
    clearInterval(handler);
    removeTypeBox();
    live?.close();
    live = undefined;
    speakLinesWith(undefined);
    stopListening();
    stopCompany();
    delete (window as unknown as { __puntoLive?: LiveVoice }).__puntoLive;
    closeTablet(true);
    clearAll(); // the feature reloads: nothing it made stays behind
    delete (window as unknown as { __punto?: typeof punto }).__punto;
    delete (window as unknown as { __puntoWorld?: World }).__puntoWorld;
    delete (window as unknown as { __puntoTablet?: unknown }).__puntoTablet;
  };
});

import.meta.hot?.accept();
