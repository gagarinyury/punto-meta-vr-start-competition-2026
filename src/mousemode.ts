/**
 * Mouse mode for the emulator on a computer (13.11): the cursor aims the right hand's ray, a left
 * click is its trigger (the pinch). The emulator's own panels grab the mouse for their gizmos, and
 * its Play mode turns the head instead; here the mouse simply points, like in any desktop app.
 *
 * It drives the emulated device through IWER's own remote control (the same one the CLI uses):
 * the right controller sits at the eyes and looks through the cursor, so the ray goes exactly where
 * the mouse is. While it runs, the emulator hides its panels (remote control), which is what we want.
 * Toggle: the mouse button by the type box, or M.
 */

interface Remote {
  dispatch(method: string, params: unknown): Promise<unknown>;
}
interface Device {
  remote?: Remote;
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  fovy?: number;
}

// IWER keeps its device on navigator.xr under a private symbol.
function emulatedDevice(): Device | undefined {
  const xr = navigator.xr as unknown as Record<symbol, { device?: Device }> | undefined;
  if (!xr) return undefined;
  for (const key of Object.getOwnPropertySymbols(xr)) {
    const device = xr[key]?.device;
    if (device?.remote) return device;
  }
  return undefined;
}

// Rotates (x, y, z) by the quaternion q.
function rotate(v: [number, number, number], q: Device['quaternion']): [number, number, number] {
  const [x, y, z] = v;
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  return [
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  ];
}

// The emulator's own top bar lives in a shadow root (IWER's dev UI). Our button goes next to its
// Play button, dressed as its neighbours (a clone of one); put back whenever the bar is redrawn.
const MOUSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 6v4"/></svg>';

function intoEmulatorBar(onClick: () => void): () => void {
  const put = () => {
    for (const host of document.querySelectorAll('*')) {
      const root = host.shadowRoot;
      if (!root || root.querySelector('[data-punto-mouse]')) continue;
      const play = root.querySelector<HTMLButtonElement>('button[title^="Play mode"], button[title^="Pointer lock"]');
      if (!play) continue;
      const mine = play.cloneNode(true) as HTMLButtonElement;
      mine.dataset.puntoMouse = '1';
      mine.title = 'Mouse mode: the cursor aims the right hand, a click pinches (M to leave)';
      mine.disabled = false;
      mine.innerHTML = MOUSE_ICON;
      mine.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick();
      });
      play.after(mine);
    }
  };
  put();
  const keeper = setInterval(put, 1000); // the bar comes with the XR session and is redrawn at will
  return () => {
    clearInterval(keeper);
    for (const host of document.querySelectorAll('*')) host.shadowRoot?.querySelector('[data-punto-mouse]')?.remove();
  };
}

export function mouseMode(bar: HTMLElement): () => void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.title = 'Mouse mode: the cursor aims, a click pinches (M)';
  toggle.textContent = '🖱';
  const look = (on: boolean) =>
    toggle.setAttribute(
      'style',
      `width:36px;height:36px;border:0;border-radius:50%;font:16px/1 system-ui;cursor:pointer;` +
        (on ? 'background:#62e9f2;color:#04191c' : 'background:rgba(243,239,232,0.12);color:#f3efe8'),
    );
  look(false);
  bar.insertBefore(toggle, bar.lastChild);

  let on = false;
  let busy = false; // one command at a time, only the latest cursor is sent
  let next: { x: number; y: number } | undefined;

  const aim = async () => {
    const device = emulatedDevice();
    if (!device?.remote || !next || busy) return;
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const { x, y } = next;
    next = undefined;
    busy = true;
    try {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
      const ndcY = 1 - ((y - rect.top) / rect.height) * 2;
      const tanY = Math.tan((device.fovy ?? 1.2) / 2);
      const tanX = tanY * (rect.width / rect.height);
      const [dx, dy, dz] = rotate([ndcX * tanX, ndcY * tanY, -1], device.quaternion);
      const length = Math.hypot(dx, dy, dz);
      const eye = device.position;
      const hand = { x: eye.x, y: eye.y - 0.04, z: eye.z };
      const target = { x: eye.x + (dx / length) * 4, y: eye.y + (dy / length) * 4, z: eye.z + (dz / length) * 4 };
      await device.remote.dispatch('set_transform', { device: 'controller-right', position: hand });
      await device.remote.dispatch('look_at', { device: 'controller-right', target });
    } catch (error) {
      console.warn('[mouse]', error);
    } finally {
      busy = false;
      if (next) void aim();
    }
  };

  const outside = (event: Event) => !bar.contains(event.target as Node);
  const onMove = (event: PointerEvent) => {
    if (!on || !outside(event)) return;
    next = { x: event.clientX, y: event.clientY };
    void aim();
  };
  const press = (value: number) => (event: PointerEvent) => {
    if (!on || !outside(event) || event.button !== 0) return;
    event.stopPropagation(); // the emulator's panels must not take it
    event.preventDefault();
    void emulatedDevice()?.remote?.dispatch('set_select_value', { device: 'controller-right', value });
  };
  const onDown = press(1);
  const onUp = press(0);
  const setOn = (value: boolean) => {
    on = value;
    look(on);
    try {
      localStorage.setItem('punto.mouse', on ? '1' : '0'); // it comes back on after a page load
    } catch {
      /* no storage */
    }
    console.info(`[mouse] mouse mode ${on ? 'on' : 'off'}${on && !emulatedDevice() ? ' — no emulated device here' : ''}`);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.code === 'KeyM' && !(event.target as HTMLElement)?.closest?.('input,textarea')) setOn(!on);
  };
  toggle.addEventListener('click', () => setOn(!on));
  const leaveBar = intoEmulatorBar(() => setOn(true));
  try {
    if (localStorage.getItem('punto.mouse') === '1') setOn(true);
  } catch {
    /* no storage */
  }
  addEventListener('pointermove', onMove, true);
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointerup', onUp, true);
  addEventListener('keydown', onKey, true);
  return () => {
    removeEventListener('pointermove', onMove, true);
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('keydown', onKey, true);
    leaveBar();
    toggle.remove();
  };
}
