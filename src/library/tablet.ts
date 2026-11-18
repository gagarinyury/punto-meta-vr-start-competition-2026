// Punto's tablet: the library of saved games and models (research/concepts/tablet, look t2 + t4).
// A body in Punto's own plastic shaped as in concept t1 (big soft corners, pillowy rim), and the screen
// public/ui/library.uikitml in front of it. Tabs GAMES / MODELS / RECENT (my last games, kept by themselves),
// MINE / EVERYONE, six cards a page,
// an opened card (play, join live, let others join), the list of live games.
//
// What playing, joining and saving do is the host's business: openTablet() takes them as handlers,
// so this module knows nothing of the coder, the room or the live loop (it is integrated later).
import {
  type Entity,
  Group,
  loadUIKitMLAsset,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  type Texture,
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  OneHandGrabbable,
  RayInteractable,
  type UIKitMLAsset,
  type Object3D,
  type World,
} from '@iwsdk/core';
import { type Item, type Kind, type LiveGame, type Scope, getItem, listItems, listLive, me, thumbUrl } from './store.js';
import { placeholder, tintCss } from './thumb.js';
import qrcode from 'qrcode-generator';

export interface TabletHandlers {
  /** play a saved game in my room / put a model in my room */
  play(item: Item): void | Promise<void>;
  /** join a game another player has opened (the item is the saved game it runs) */
  join(live: LiveGame, item: Item): void | Promise<void>;
  /** save what is in the room now; resolves to the new item, or null when there is nothing to save */
  save?(): Promise<Item | null>;
  /** open my game to others */
  host?(item: Item): void | Promise<void>;
  /** the address a friend opens to get this item (default: the game page with ?play=<id>, or ?live=<id>) */
  link?(target: { item: Item; live?: LiveGame }): string;
  /** the power button: the screen went off (false) or on (true) */
  power?(on: boolean): void;
}

export interface Tablet {
  entity: Entity;
  /** what the screen shows (read it, for checks) */
  state: { kind: Kind; scope: Scope; page: number; items: Item[]; live: LiveGame[]; open: Item | null };
  /** reloads the current list (after a save made elsewhere, for example) */
  refresh(): Promise<void>;
  toast(text: string): void;
  /** saves what is in the room, as the SAVE button does, and shows it among mine */
  save(): void;
  dispose(): void;
}

const SCREEN_W = 0.48; // metres; the UIKitML screen is 1200 x 800 units
const SCREEN_H = 0.32;
const BEZEL = 0.032; // a wide soft bezel, as in concept t1
const LEFT = 0.052; // the left bezel is wider, as in t1 and on Punto: the power button lives there
const SHIFT = (LEFT - BEZEL) / 2; // the screen sits this far right of the body's centre
/** The body's width and height in metres (for Punto, who carries it by the edges). */
export const TABLET_SIZE: [number, number] = [SCREEN_W + LEFT + BEZEL, SCREEN_H + BEZEL * 2];
/** Where the screen is on the body (its own space, metres): for drawing on it (src/helper.ts sketch). Set below. */
export const TABLET_SCREEN = { w: SCREEN_W, h: SCREEN_H, x: 0, z: 0 };
const CORNER = 0.062; // outer corner radius
const SCREEN_CORNER = 0.026; // matches the screen's border-radius (64 units)
const ROLL = 0.012; // how far the rim rolls round, sideways
const RISE = 0.008; // and front to back: the rim is a soft pillow 2 x RISE + CORE thick
const CORE = 0.004;
const GLASS_Z = CORE / 2 + 0.0004; // the screen sits down in the pocket, ~8 mm under the rim's top
const SCREEN_SCALE = SCREEN_W / 12;
TABLET_SCREEN.x = SHIFT;
TABLET_SCREEN.z = GLASS_Z + 0.0045; // over the glass, where the sketch's sheet lies // a UIKit unit is 1 cm: 1200 units = 12 m
const CYAN = '#62e9f2';
const GREY = '#8e9a9c';
const SCREEN = '#0d1113';
const PER_PAGE = 6;
const LIVE_ROWS = 4;

type Element = { setProperties(properties: Record<string, unknown>): void; addEventListener(type: 'click', listener: () => void): void; removeEventListener(type: 'click', listener: () => void): void };

/** A rounded rectangle, centred, for the slab and its glass. */
function rounded(width: number, height: number, radius: number, centreX = 0): Shape {
  const x = centreX - width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/** The body as in concept t1: Punto's cream-grey plastic, big soft corners, a fat pillowy rim that
 *  rolls round on the outside and down into the screen on the inside; the dark glass sits in the
 *  pocket. The rim is one extrusion of a rounded frame with a rounded hole, so its bevel rounds
 *  both edges; a thin back plate closes it. The left bezel is wider, with Punto's power button. */
/** The body's geometry and materials, made once (16.11: every tablet built its extrusions anew — bevelSegments 10 ×
 *  curveSegments 28 — and entity.dispose() threw the materials away, so each one compiled its physical shaders
 *  again in the headset: the stutter when Punto took it out). The meshes say iwsdkRuntimeOnly, which keeps
 *  entity.dispose() off them; warmTablet compiles them before the game starts. */
let kit: ReturnType<typeof makeKit> | undefined;
function makeKit() {
  const plastic = new MeshPhysicalMaterial({ color: 0xc9c4ba, roughness: 0.68, sheen: 0.35, sheenRoughness: 0.5, sheenColor: 0xfff4e0 });
  const width = SCREEN_W + LEFT + BEZEL;
  const height = SCREEN_H + BEZEL * 2;
  // the bevel grows the outline by ROLL at mid-depth and shrinks the hole by ROLL: the faces keep
  // the shape's own outline, so the outside is drawn ROLL smaller and the hole ROLL larger
  const frame = rounded(width - ROLL * 2, height - ROLL * 2, CORNER - ROLL);
  frame.holes.push(rounded(SCREEN_W + 0.004 + ROLL * 2, SCREEN_H + 0.004 + ROLL * 2, SCREEN_CORNER + ROLL, SHIFT));
  const rim = new ExtrudeGeometry(frame, { depth: CORE, bevelEnabled: true, bevelThickness: RISE, bevelSize: ROLL, bevelSegments: 10, curveSegments: 28 });
  rim.translate(0, 0, -CORE / 2);
  // the back, closing the hole behind the screen
  const back = new ExtrudeGeometry(rounded(width - ROLL * 2 - 0.01, height - ROLL * 2 - 0.01, CORNER - ROLL - 0.005), {
    depth: 0.004, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0025, bevelSegments: 4, curveSegments: 28,
  });
  back.translate(0, 0, -CORE / 2 - RISE + 0.0025);
  const R = 0.0095;
  const GAP = 1.1; // the opening at the top of the ⏻
  return {
    width,
    height,
    plastic,
    rim,
    back,
    glass: new ShapeGeometry(rounded(SCREEN_W + 0.006, SCREEN_H + 0.006, SCREEN_CORNER, SHIFT), 28),
    glassMaterial: new MeshPhysicalMaterial({ color: 0x08090b, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    dark: new MeshStandardMaterial({ color: 0x35322e, roughness: 0.8 }),
    R,
    GAP,
    ring: new TorusGeometry(R + 0.0008, 0.0014, 10, 40),
    button: new CylinderGeometry(R, R + 0.0006, 0.0044, 40),
    arc: new TorusGeometry(0.0044, 0.0012, 10, 32, Math.PI * 2 - GAP),
    bar: new BoxGeometry(0.0024, 0.0056, 0.0016),
  };
}
/** A mesh of the kit's: entity.dispose() leaves it (and its shared geometry and material) alone. */
function kept(mesh: Mesh): Mesh {
  mesh.userData.iwsdkRuntimeOnly = true;
  return mesh;
}

/** The body as in concept t1: Punto's cream-grey plastic, big soft corners, a fat pillowy rim that
 *  rolls round on the outside and down into the screen on the inside; the dark glass sits in the
 *  pocket. The rim is one extrusion of a rounded frame with a rounded hole, so its bevel rounds
 *  both edges; a thin back plate closes it. The left bezel is wider, with Punto's power button. */
function buildBody(): { body: Group; power: Group; cap: Group; light: MeshStandardMaterial } {
  const k = (kit ??= makeKit());
  const body = new Group();
  body.name = 'Tablet Body';
  body.add(kept(new Mesh(k.rim, k.plastic)));
  body.add(kept(new Mesh(k.back, k.plastic)));
  // the glass, down in the pocket, its corners following the hole
  const glass = kept(new Mesh(k.glass, k.glassMaterial));
  glass.position.z = GLASS_Z;
  body.add(glass);

  // Punto's power button (src/helper.ts), scaled up: a plastic cap in a dark ring, the ⏻ glowing in
  // his cyan; low in the wide left column, on the flat top of the rim
  const power = new Group();
  power.name = 'Tablet Power';
  power.position.set(-k.width / 2 + LEFT / 2 + 0.002, -SCREEN_H / 2 + 0.045, CORE / 2 + RISE);
  // its own, it glows and dims with the power (the same shader as `dark`: nothing to compile)
  const light = new MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x35d8ff, emissiveIntensity: 2, roughness: 0.35 });
  const ring = kept(new Mesh(k.ring, k.dark));
  const cap = new Group();
  const button = kept(new Mesh(k.button, k.plastic));
  button.rotation.x = Math.PI / 2;
  button.position.z = 0.0018;
  const arc = new Mesh(k.arc, light);
  arc.userData.iwsdkRuntimeOnly = true; // the shared torus stays (`light` is left to the collector: no texture, a shared shader)
  arc.rotation.z = Math.PI / 2 + k.GAP / 2;
  arc.position.z = 0.0042;
  const bar = kept(new Mesh(k.bar, light));
  bar.position.set(0, 0.0038, 0.0042);
  cap.add(button, arc, bar);
  power.add(ring, cap);
  body.add(power);
  return { body, power, cap, light };
}

/** The tablet's shaders compiled before the game starts (src/index.ts, after the poster's warm): taking it out
 *  then compiles nothing. */
export async function warmTablet(world: World): Promise<void> {
  const { body } = buildBody();
  body.position.set(0, -50, 0);
  world.scene.add(body);
  const r = world.renderer as typeof world.renderer & { compileAsync?: (o: Object3D, c: Object3D, s?: Object3D) => Promise<unknown> };
  try {
    await (r.compileAsync ? r.compileAsync(body, world.camera, world.scene) : r.compile(body, world.camera, world.scene));
  } finally {
    body.removeFromParent();
  }
}

/** The tablet Punto draws a plan on while the coder writes (src/blueprint.ts): the same body, and on the screen
 *  `paper` (the blueprint's canvas) instead of the library. Nothing on it takes a ray or a hand: the player may be
 *  pointing out where the thing goes past it. It stands where `place` puts it (as openTablet's place). */
export function sketchTablet(world: World, paper: Texture, place: (body: Group) => void): { entity: Entity; body: Group; dispose(): void } {
  const { body, power } = buildBody();
  place(body);
  body.userData.occlude = false;
  power.userData.occlude = false;
  const sheet = new Mesh(new PlaneGeometry(SCREEN_W, SCREEN_H), new MeshBasicMaterial({ map: paper, transparent: true }));
  sheet.position.set(TABLET_SCREEN.x, 0, TABLET_SCREEN.z); // over the glass, as the library's screen
  sheet.renderOrder = 5;
  sheet.userData.occlude = false;
  body.add(sheet);
  const entity = world.createTransformEntity(body);
  return {
    entity,
    body,
    dispose() {
      sheet.geometry.dispose();
      (sheet.material as MeshBasicMaterial).dispose();
      if (entity.active) entity.dispose();
    },
  };
}

/** A QR code for `text` as a PNG data URL: dark modules on white, a quiet zone of 2. */
function qrPicture(text: string): string {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const count = code.getModuleCount();
  const cell = 8;
  const margin = 2 * cell;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = count * cell + margin * 2;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0d1113';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) if (code.isDark(row, col)) context.fillRect(margin + col * cell, margin + row * cell, cell, cell);
  }
  return canvas.toDataURL('image/png');
}

/** A Share button on the 2D page, for when the sheet would not open by itself after leaving XR. Gone after a tap. */
function shareButton(data: ShareData): void {
  document.getElementById('punto-share')?.remove();
  const button = document.createElement('button');
  button.id = 'punto-share';
  button.textContent = document.documentElement.lang === 'ru' || new URLSearchParams(location.search).get('lang') === 'ru' ? 'Поделиться' : 'Share';
  button.style.cssText =
    'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:10000;padding:18px 44px;font:600 28px system-ui,sans-serif;' +
    'border:0;border-radius:40px;background:#2f6bff;color:#fff;box-shadow:0 6px 24px #0006';
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // not a tap on the front page (that goes back into XR)
    button.remove();
    void navigator.share(data).catch((error) => console.warn('[tablet] share', error));
  });
  document.body.append(button);
}

/**
 * Puts the tablet in the world in front of the player and fills it from the library.
 * `place` sets where it goes (default: 0.55 m ahead, a little below the eyes, facing the player).
 */
export async function openTablet(world: World, handlers: TabletHandlers, place?: (body: Group) => void): Promise<Tablet> {
  const { body, power, cap, light } = buildBody();
  if (place) {
    place(body);
  } else {
    const head = world.camera;
    head.updateMatrixWorld();
    const eye = head.getWorldPosition(body.position.clone());
    const yaw = Math.atan2(-head.matrixWorld.elements[8], -head.matrixWorld.elements[10]);
    body.position.set(eye.x + Math.sin(yaw) * 0.55, eye.y - 0.12, eye.z + Math.cos(yaw) * 0.55);
    body.rotation.set(-0.15, yaw + Math.PI, 0, 'YXZ');
  }
  // held up in front of the player, like Punto: never hidden behind real furniture. In the game the live
  // loop gives everything a feature makes DepthOccludable unless told not to, and that rewrites materials
  // for good: the UIKit screen went black (14.11). Opt out before each entity is made.
  body.userData.occlude = false;
  const entity = world.createTransformEntity(body).addComponent(OneHandGrabbable, {});

  const panel = (await loadUIKitMLAsset('./ui/library.uikitml')) as UIKitMLAsset;
  panel.scale.setScalar(SCREEN_SCALE);
  panel.userData.occlude = false;
  panel.position.set(SHIFT, 0, GLASS_Z + 0.001);
  // the screen and the power button are entities of their own under the body: elics does not dispose
  // children with their parent, they stayed in the scene after every close (audit item 10)
  const parts = [world.createTransformEntity(panel, { parent: entity }).addComponent(RayInteractable)];
  const el = (id: string) => panel.requireElementById(id) as unknown as Element;

  // the power button: dips like a pressed key, turns the screen off and on again
  power.userData.occlude = false;
  parts.push(world.createTransformEntity(power, { parent: entity }).addComponent(RayInteractable));
  let screenOn = true;
  const onPower = () => {
    screenOn = !screenOn;
    cap.position.z = -0.0018;
    setTimeout(() => (cap.position.z = 0), 140);
    panel.visible = screenOn;
    light.emissiveIntensity = screenOn ? 2 : 0.25;
    handlers.power?.(screenOn);
  };
  (power as unknown as Element).addEventListener('click', onPower);

  const state = {
    kind: 'game' as Kind,
    scope: 'all' as Scope,
    page: 0,
    items: [] as Item[],
    live: [] as LiveGame[],
    open: null as Item | null,
    /** the RECENT tab: my last games, kept by themselves (no MINE / EVERYONE there) */
    recent: false,
    /** cover pictures made here for items without one, by item id */
    covers: new Map<string, string>(),
  };

  const listeners: [Element, () => void][] = [];
  const on = (id: string, listener: () => void) => {
    const element = el(id);
    element.addEventListener('click', listener);
    listeners.push([element, listener]);
  };
  const show = (id: string, visible: boolean) => el(id).setProperties({ display: visible ? 'flex' : 'none' });
  const text = (id: string, value: string) => el(id).setProperties({ text: value });
  const cover = (item: { id: string; title: string; thumb: boolean }) => {
    if (item.thumb) return thumbUrl(item.id);
    let made = state.covers.get(item.id);
    if (!made) state.covers.set(item.id, (made = placeholder(item.title)));
    return made;
  };

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast = (message: string) => {
    text('toast-label', message);
    show('toast', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show('toast', false), 2600);
  };

  const view = (name: 'grid' | 'detail' | 'live' | 'invite') => {
    show('grid-view', name === 'grid');
    show('detail-view', name === 'detail');
    show('live-view', name === 'live');
    show('invite-view', name === 'invite');
  };

  let invited = '';
  const copyInvite = () => void navigator.clipboard?.writeText(invited).then(() => toast('Link copied'), () => toast('Scan the code with a phone'));
  /**
   * The system share sheet, the same one as the browser's own Share button. Quest Browser refuses it inside XR
   * (NotAllowedError at once, checked 15.11 in the headset) and opens it a moment after the session ends: so out of
   * XR first, while the press still counts as the player's gesture. Back in through the front page, the room as it was.
   * If the sheet still will not open there, a Share button on the page does it with a tap.
   */
  const shareInvite = async (data: ShareData) => {
    if (!navigator.share) return copyInvite();
    try {
      if (world.session) await world.session.end();
      await navigator.share(data);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return; // the player closed the sheet
      console.warn('[tablet] share', error);
      if (world.session) return copyInvite();
      shareButton(data);
    }
  };
  const linkOf = (item: Item, live?: LiveGame) => {
    if (handlers.link) return handlers.link({ item, live });
    const url = new URL('.//', location.href);
    url.searchParams.set(live ? 'live' : 'play', live ? live.id : item.id);
    return url.toString();
  };
  const invite = (item: Item) => {
    const live = liveOf(item);
    invited = linkOf(item, live);
    el('invite-qr').setProperties({ src: qrPicture(invited) });
    text('invite-what', live ? `${item.title}, live with ${live.host}` : item.title);
    text('invite-link', invited.replace(/^https?:\/\//, ''));
    view('invite');
  };

  const paintTabs = () => {
    for (const tab of ['game', 'model', 'recent'] as const) {
      const on = tab === 'recent' ? state.recent : !state.recent && state.kind === tab;
      el(`tab-${tab}-label`).setProperties({ color: on ? CYAN : GREY });
      el(`tab-${tab}-bar`).setProperties({ backgroundColor: on ? CYAN : SCREEN });
    }
    show('scope', !state.recent);
    // the toggle: the knob on the chosen side is white, the other one takes the track's colour
    for (const scope of ['mine', 'all'] as const) {
      const on = state.scope === scope;
      el(`scope-${scope}`).setProperties({ color: on ? CYAN : GREY });
      el(`knob-${scope}`).setProperties({ backgroundColor: on ? '#e8eded' : '#3a4446' });
    }
  };

  const paintGrid = () => {
    const pages = Math.max(1, Math.ceil(state.items.length / PER_PAGE));
    state.page = Math.min(state.page, pages - 1);
    const shown = state.items.slice(state.page * PER_PAGE, state.page * PER_PAGE + PER_PAGE);
    for (let i = 0; i < PER_PAGE; i++) {
      const item = shown[i];
      show(`card-${i}`, item != null);
      if (!item) continue;
      el(`thumb-${i}`).setProperties({ src: cover(item) });
      el(`card-${i}`).setProperties({ backgroundColor: tintCss(item.title), borderColor: tintCss(item.title, 0.18) });
      text(`name-${i}`, item.title);
    }
    const empty = state.items.length === 0;
    show('grid', !empty);
    show('empty', empty);
    text('empty-big', state.recent ? 'Nothing made yet' : state.scope === 'mine' ? 'Nothing saved yet' : 'Nobody has shared anything yet');
    text(
      'empty-small',
      state.recent ? 'Ask Punto for something: your last 10 games land here by themselves'
        : state.kind === 'game' ? 'Make a game with Punto and press save' : 'Ask Punto for a model and press save',
    );
    text('page', `${state.page + 1} / ${pages}`);
    text('count', `${state.items.length} ${state.kind === 'game' ? 'games' : 'models'}`);
    show('prev', state.page > 0);
    show('next', state.page < pages - 1);
  };

  const paintLive = () => {
    el('live-dot').setProperties({ backgroundColor: state.live.length ? '#ff4d5e' : '#4a5557' });
    // the hosts of the first two open games, as round avatars by the LIVE label
    for (let i = 0; i < 2; i++) {
      const game = state.live[i];
      show(`live-av-${i}`, game != null);
      if (!game) continue;
      el(`live-av-${i}`).setProperties({ backgroundColor: tintCss(game.host, 0.25) });
      text(`live-av-letter-${i}`, (game.host[0] ?? '?').toUpperCase());
    }
    for (let i = 0; i < LIVE_ROWS; i++) {
      const game = state.live[i];
      show(`live-row-${i}`, game != null);
      if (!game) continue;
      el(`live-thumb-${i}`).setProperties({ src: cover({ id: game.item, title: game.title, thumb: game.thumb }) });
      text(`live-title-${i}`, game.title);
      text(`live-host-${i}`, `${game.host} - ${game.players} playing`);
    }
    show('live-none', state.live.length === 0);
  };

  const liveOf = (item: Item) => state.live.find((game) => game.item === item.id);

  const openCard = (item: Item) => {
    state.open = item;
    el('detail-thumb').setProperties({ src: cover(item) });
    text('detail-title', item.title);
    text('detail-letter', (item.name[0] ?? '?').toUpperCase());
    el('detail-avatar').setProperties({ backgroundColor: tintCss(item.name, 0.25) });
    text('detail-author', item.me === me().id ? `${item.name} (you)` : item.name);
    text('detail-credit', item.credit ?? new Date(item.at).toLocaleDateString());
    text('detail-play-label', item.kind === 'game' ? 'PLAY IN MY ROOM' : 'PUT IN MY ROOM');
    show('detail-play', item.playable);
    const live = liveOf(item);
    show('detail-join', live != null);
    if (live) text('detail-join-label', `JOIN LIVE - ${live.players} playing`);
    show('detail-host', item.kind === 'game' && item.me === me().id && !live && handlers.host != null);
    show('detail-invite', item.kind === 'game');
    view('detail');
  };

  const load = async () => {
    try {
      [state.items, state.live] = await Promise.all([state.recent ? listItems('game', 'recent') : listItems(state.kind, state.scope), listLive()]);
    } catch (error) {
      console.warn('[tablet]', error);
      state.items = [];
      toast('The library is not answering');
    }
    paintTabs();
    paintGrid();
    paintLive();
  };

  // the controls
  for (const kind of ['game', 'model'] as const) on(`tab-${kind}`, () => { state.kind = kind; state.recent = false; state.page = 0; view('grid'); void load(); });
  on('tab-recent', () => { state.kind = 'game'; state.recent = true; state.page = 0; view('grid'); void load(); });
  const scopeTo = (scope: Scope) => { state.scope = scope; state.page = 0; void load(); };
  on('scope-mine', () => scopeTo('mine'));
  on('scope-all', () => scopeTo('all'));
  on('scope-toggle', () => scopeTo(state.scope === 'mine' ? 'all' : 'mine'));
  on('prev', () => { state.page = Math.max(0, state.page - 1); paintGrid(); });
  on('next', () => { state.page += 1; paintGrid(); });
  for (let i = 0; i < PER_PAGE; i++) on(`card-${i}`, () => { const item = state.items[state.page * PER_PAGE + i]; if (item) openCard(item); });
  on('detail-back', () => view('grid'));
  on('detail-invite', () => state.open && invite(state.open));
  on('invite-back', () => (state.open ? view('detail') : view('grid')));
  on('invite-share', () => void shareInvite({ title: 'Punto', text: `Play ${state.open?.title ?? 'this'} with me`, url: invited }));
  on('live-back', () => view('grid'));
  on('live', () => { view('live'); void listLive().then((games) => { state.live = games; paintLive(); }); });
  on('detail-play', () => {
    const item = state.open;
    if (!item) return;
    toast(item.kind === 'game' ? `Starting ${item.title}...` : `Bringing ${item.title}...`);
    void getItem(item.id).then((full) => handlers.play(full)).catch((error) => toast(String(error.message ?? error)));
  });
  const join = (game: LiveGame | undefined) => {
    if (!game) return;
    toast(`Joining ${game.host}...`);
    void getItem(game.item).then((item) => handlers.join(game, item)).catch((error) => toast(String(error.message ?? error)));
  };
  on('detail-join', () => join(state.open ? liveOf(state.open) : undefined));
  for (let i = 0; i < LIVE_ROWS; i++) on(`live-join-${i}`, () => join(state.live[i]));
  on('detail-host', () => {
    if (!state.open || !handlers.host) return;
    void Promise.resolve(handlers.host(state.open)).then(() => { toast('Others can join now'); return load(); }).then(() => state.open && openCard(state.open));
  });
  const save = () => {
    if (!handlers.save) return toast('Nothing to save here');
    toast('Saving...');
    void handlers.save().then((item) => {
      if (!item) return toast('Nothing in the room to save');
      toast(`Saved: ${item.title}`);
      state.kind = item.kind;
      state.recent = false;
      state.scope = 'mine';
      state.page = 0;
      view('grid');
      return load();
    }).catch((error) => toast(String(error.message ?? error)));
  };
  on('save', save);

  show('toast', false);
  view('grid');
  await load();
  const poll = setInterval(() => void listLive().then((games) => { state.live = games; paintLive(); }).catch(() => undefined), 8000);

  return {
    entity,
    state,
    refresh: load,
    toast,
    save,
    dispose() {
      clearInterval(poll);
      clearTimeout(toastTimer);
      for (const [element, listener] of listeners) element.removeEventListener('click', listener);
      (power as unknown as Element).removeEventListener('click', onPower);
      for (const part of parts) if (part.active) part.dispose();
      entity.dispose();
    },
  };
}
