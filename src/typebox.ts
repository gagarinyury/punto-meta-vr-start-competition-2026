import { ui } from './intro-lines.js';
import { mouseMode } from './mousemode.js';

/**
 * A box to type Punto's tasks on the computer (13.11): the emulator has no microphone, and typing
 * is quicker for checks. A typed phrase goes the same way as a spoken one. Only on a computer: the
 * headset's browser never shows it. Keys typed here do not reach the emulator (W would move a stick).
 */
// The clock stops when the thing stands in the scene, not when Punto has finished talking about it (Yury, 18.11: the
// transparent cube was there at 7 s, the clock went on to 13 s through «Done!» and «Like it? Just say: save it!…»).
let inScene: (() => void) | undefined;
let stageNow: ((name: string) => void) | undefined;
let modelNow: ((name: string) => void) | undefined;
/** The next stage of the typed phrase: the one before gets its own seconds (shown above the box). */
export function boxStage(name: string): void {
  stageNow?.(name);
}
/** The coder model in use, shown above the box. */
export function boxModel(name: string): void {
  modelNow?.(name);
}
/** The made thing is in the scene now: the clock of the phrase that asked for it stops (punto.ts). */
export function thingInScene(): void {
  inScene?.();
}

export function typeBox(onPhrase: (text: string) => Promise<unknown>): () => void {
  // The emulator dresses the page up as a Quest (its user agent), so the user agent cannot tell. The platform
  // can: the Quest Browser says "Linux" (14.11; not "Android"), a computer says macOS or Windows. Only there.
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
  if (!/mac|win/i.test(platform)) return () => {};
  const box = document.createElement('form');
  box.setAttribute('style', [
    'position:fixed', 'left:50%', 'bottom:12px', 'transform:translateX(-50%)', 'z-index:2147483647',
    'display:flex', 'gap:8px', 'align-items:center', 'width:min(560px,calc(100vw - 32px))',
    'padding:8px 8px 8px 18px', 'border-radius:999px', 'background:rgba(12,11,10,0.92)',
    'box-shadow:0 0 0 1.5px rgba(98,233,242,0.55),0 10px 30px -10px rgba(98,233,242,0.5)',
    'font:500 15px/1.2 "Geist","Avenir Next","Segoe UI",system-ui,sans-serif',
  ].join(';'));
  const input = document.createElement('input');
  input.placeholder = ui('Tell Punto what to make…', 'Скажи Пунто, что сделать…');
  input.setAttribute('style', 'flex:1;min-width:0;background:transparent;border:0;outline:0;color:#f3efe8;font:inherit');
  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = '→';
  send.setAttribute('style', 'width:36px;height:36px;border:0;border-radius:50%;background:#62e9f2;color:#04191c;font:600 18px/1 system-ui;cursor:pointer');
  // seconds since the phrase was sent, until Punto has done it (Yury, 18.11: to see how long the coder takes)
  const clock = document.createElement('span');
  clock.setAttribute('style', 'min-width:4.5em;text-align:right;color:#62e9f2;font-variant-numeric:tabular-nums;white-space:nowrap');
  box.append(input, clock, send);
  // above the box: the coder model and every stage with its seconds (Yury, 18.11: «все этапы шаг за шагом»)
  const steps = document.createElement('div');
  steps.setAttribute('style', [
    'position:absolute', 'left:18px', 'right:18px', 'bottom:calc(100% + 6px)', 'padding:6px 12px', 'border-radius:12px',
    'background:rgba(12,11,10,0.85)', 'color:#cfd6dd', 'font:500 12.5px/1.45 "Geist",system-ui,sans-serif',
    'white-space:normal', 'pointer-events:none', 'display:none',
  ].join(';'));
  box.style.position = 'fixed';
  box.append(steps);
  let model = '';
  const done: string[] = [];
  let current = '';
  let currentAt = 0;
  const paint = () => {
    steps.style.display = model || done.length || current ? 'block' : 'none';
    steps.innerHTML = '';
    if (model) {
      const m = document.createElement('div');
      m.textContent = `кодер: ${model}`;
      m.style.color = '#62e9f2';
      steps.append(m);
    }
    const line = document.createElement('div');
    line.textContent = [...done, current ? `${current}…` : ''].filter(Boolean).join(' → ');
    steps.append(line);
  };
  modelNow = (name) => ((model = name), paint());
  let ticking: ReturnType<typeof setInterval> | undefined;
  // the emulator listens to the keyboard for its sticks and buttons: keys typed here stay here
  for (const type of ['keydown', 'keyup', 'keypress']) input.addEventListener(type, (event) => event.stopPropagation());
  box.addEventListener('pointerdown', (event) => event.stopPropagation());
  box.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    console.info(`[typebox] sent: ${text}`);
    if (!text) return;
    input.value = '';
    input.placeholder = `“${text.slice(0, 60)}”…`;
    const at = performance.now();
    const seconds = () => ((performance.now() - at) / 1000).toFixed(1);
    clearInterval(ticking);
    clock.style.color = '#62e9f2';
    clock.textContent = '0.0 s';
    ticking = setInterval(() => (clock.textContent = `${seconds()} s`), 100);
    let stoppedAt: string | undefined;
    done.length = 0;
    current = 'режиссёр';
    currentAt = performance.now();
    paint();
    const close = () => {
      if (current) done.push(`${current} ${((performance.now() - currentAt) / 1000).toFixed(1)} с`);
      currentAt = performance.now();
    };
    stageNow = (name) => {
      if (stoppedAt || name === current) return;
      close();
      current = name;
      console.info(`[typebox] stage: ${done[done.length - 1]} → ${name} (${seconds()} s)`);
      paint();
    };
    inScene = () => {
      if (stoppedAt) return;
      close();
      current = '';
      done.push(`в сцене ✓`);
      paint();
      console.info(`[typebox] in the scene: ${done.join(' → ')}`);
      stoppedAt = seconds();
      clearInterval(ticking);
      clock.textContent = `✓ ${stoppedAt} s`;
      clock.style.color = '#8be07a';
    };
    onPhrase(text)
      .then(
        (result) => {
          const failed = typeof result === 'string' && / failed/.test(result); // obey answers a failure, it does not throw
          clock.textContent = `${failed ? '✗' : '✓'} ${failed || !stoppedAt ? seconds() : stoppedAt} s`;
          clock.style.color = failed ? '#ff7a6a' : '#8be07a';
        },
        (error) => {
          console.warn('[typebox]', error);
          clock.textContent = `✗ ${seconds()} s`;
          clock.style.color = '#ff7a6a';
        },
      )
      .finally(() => {
        clearInterval(ticking);
        input.placeholder = ui('Tell Punto what to make…', 'Скажи Пунто, что сделать…');
      });
  });
  document.body.append(box);
  const stopMouse = mouseMode(box); // and the button for the mouse mode (src/mousemode.ts)
  return () => {
    stopMouse();
    clearInterval(ticking);
    box.remove();
  };
}
