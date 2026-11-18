// Work with the real Quest over a USB cable, the way we work with the emulator.
//
//   node tools/quest.mjs open [query]  route the dev server into the headset, pair it, open the game (query: voice=live)
//   node tools/quest.mjs prod [query]  open the published game (punto.example.com) with Yury's key; query: voice=live by default
//   node tools/quest.mjs shot [file]   save what the headset shows as a PNG
//   node tools/quest.mjs logs [secs]   print the game's console in the headset (default 10 s)
//   node tools/quest.mjs watch         keep writing the game's console to logs/quest.log (run in background)
//   node tools/quest.mjs target        print the runtimeTarget for `npx iwsdk ... --input-json`
//   node tools/quest.mjs close         remove the routes
//   node tools/quest.mjs wifi          by cable once: adb over Wi-Fi on the fixed port 5555, then the cable can go
//   node tools/quest.mjs connect       reconnect over Wi-Fi (also after a headset restart, see below)
//   node tools/quest.mjs keep          stay connected: reconnect over Wi-Fi whenever adb loses the headset (run in background)
//
// Wi-Fi that survives a headset restart (set up 13.11.2026, checked with a restart): the app
// adb-auto-enable (github.com/project-SIMPLE/adb-auto-enable, MIT, v3.0.0) keeps Android's own
// wireless debugging on and clicks Meta's "always allow this computer" dialog. Once, by cable or
// over :5555:
//   adb install project-SIMPLE_adb-auto-enable_v3.apk
//   adb shell pm grant eu.project_simple.adbautoenable android.permission.WRITE_SECURE_SETTINGS
//   adb shell "settings put secure enabled_accessibility_services eu.project_simple.adbautoenable/eu.project_simple.adbautoenable.AdbPopupAccessibilityService && settings put secure accessibility_enabled 1"
//   adb shell am start -n eu.project_simple.adbautoenable/.MainActivity
// and `wifi` once (it saves the headset's serial, by which it is found on the network).
//   node tools/quest.mjs awake         keep the headset awake when it is taken off (proximity sensor off)
//   node tools/quest.mjs sleep         give the proximity sensor back
//
// Needs: developer mode on the headset, USB debugging allowed, the dev server running.
// NOT YET RUN ON A HEADSET (11.11.2026): written from the IWSDK native-test skill and
// standard Android/Chromium tooling. The devtools socket name is discovered, not assumed.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PORT = Number(process.env.PUNTO_DEV_PORT ?? 8081); // PUNTO_DEV_PORT=8082: the bare copy (18.11)
const PROD = 'punto.example.com'; // the published game (DEPLOY.md)
/** A tab with the game in it: the dev server's, or the published one. */
const isGame = (entry) => entry.type === 'page' && (entry.url.includes(`:${PORT}`) || entry.url.includes(PROD));
const DEVTOOLS = 9333;
const [command = 'help', argument] = process.argv.slice(2);

const run = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', ...options });

// Only a Quest counts: other Android devices on the network (phones, tablets, TVs) are never touched.
function serial() {
  const listed = run('adb', ['devices', '-l']).trim();
  const ready = listed
    .split('\n')
    .slice(1)
    .filter((line) => /\sdevice\s/.test(line) && /model:\S*Quest/i.test(line))
    .map((line) => line.trim().split(/\s+/)[0]);
  // The same headset may be listed more than once (cable, port 5555, wireless debugging): prefer Wi-Fi,
  // and of several Wi-Fi entries any one will do — they all lead to the same headset.
  const wireless = ready.filter((id) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(id));
  const chosen = wireless.length ? wireless.slice(0, 1) : ready;
  if (chosen.length !== 1) {
    throw new Error(`Need exactly one authorised Quest, adb sees:\n${listed}`);
  }
  return chosen[0];
}

const adb = (id, ...args) => run('adb', ['-s', id, ...args]);
const iwsdk = (...args) => JSON.parse(run('npx', ['iwsdk', ...args, '--raw']));

function targets(id) {
  const listed = iwsdk('runtime', 'targets');
  const all = listed.targets ?? listed.data?.targets ?? [];
  return all.filter(
    (entry) =>
      entry.runtimeTarget?.deviceClass === 'physical' &&
      entry.runtimeTarget?.headsetId === id &&
      entry.role === 'app' &&
      entry.commandReady,
  );
}

// Chromium on Android listens on an abstract socket; its name differs between browsers.
function forwardDevtools(id) {
  const sockets = adb(id, 'shell', 'cat /proc/net/unix')
    .split('\n')
    .map((line) => line.trim().split(/\s+/).pop())
    .filter((name) => name?.startsWith('@') && name.includes('devtools_remote'))
    .map((name) => name.slice(1));
  if (sockets.length === 0) {
    throw new Error('No browser with remote debugging is running in the headset. Open the game first.');
  }
  adb(id, 'forward', `tcp:${DEVTOOLS}`, `localabstract:${sockets[0]}`);
  return sockets;
}

async function gamePage(id) {
  forwardDevtools(id);
  const pages = await (await fetch(`http://127.0.0.1:${DEVTOOLS}/json`)).json();
  const page = pages.find(isGame);
  if (!page) {
    throw new Error(`The game is not open in the headset. Pages: ${pages.map((p) => p.url).join(', ')}`);
  }
  return page;
}

const WIFI_PORT = 5555; // `adb tcpip`: lasts until the headset restarts
const ADDRESS_FILE = 'logs/quest-address.txt';
const SERIAL_FILE = 'logs/quest-serial.txt';

// Where the headset can be reached now. Since 13.11 the headset keeps Android's own wireless
// debugging on across restarts (the adb-auto-enable app, see the top of this file); its port is new
// after every restart, but the headset announces itself on the network (mDNS) under its serial.
// The old fixed :5555 address is tried as well (it works until the headset restarts).
function headsetAddresses() {
  const found = [];
  const serialNo = existsSync(SERIAL_FILE) ? readFileSync(SERIAL_FILE, 'utf8').trim() : '';
  if (serialNo) {
    let services = '';
    try { services = run('adb', ['mdns', 'services']); } catch { /* no mDNS: only the saved address */ }
    for (const line of services.split('\n')) {
      if (line.includes(`adb-${serialNo}`) && line.includes('_adb-tls-connect')) {
        const address = line.match(/(\d+\.\d+\.\d+\.\d+:\d+)/)?.[1];
        if (address && !found.includes(address)) found.push(address);
      }
    }
  }
  if (existsSync(ADDRESS_FILE)) found.push(readFileSync(ADDRESS_FILE, 'utf8').trim());
  return found;
}

/** The Wi-Fi address adb now has an authorised Quest on, if any. */
function connectedHeadset() {
  try {
    return serial().match(/^\d+\.\d+\.\d+\.\d+:\d+$/)?.[0];
  } catch {
    return undefined;
  }
}

function reachHeadset() {
  for (const address of headsetAddresses()) {
    try { run('adb', ['connect', address]); } catch { /* asleep, away or an old port: the next one */ }
    const now = connectedHeadset();
    if (now) return now;
  }
  return undefined;
}

const commands = {
  // adb over Wi-Fi on a fixed port. Run once with the cable in; it lasts until the headset restarts.
  async wifi() {
    const id = serial();
    if (id.includes(':')) {
      console.log(`Already on Wi-Fi: ${id}`);
      return;
    }
    const ip = adb(id, 'shell', 'ip -f inet addr show wlan0').match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1];
    if (!ip) throw new Error('The headset has no Wi-Fi address: is it on the network?');
    mkdirSync('logs', { recursive: true });
    writeFileSync(SERIAL_FILE, `${adb(id, 'shell', 'getprop', 'ro.serialno').trim()}\n`);
    adb(id, 'tcpip', String(WIFI_PORT));
    await new Promise((resolve) => setTimeout(resolve, 2000)); // adbd restarts in network mode
    console.log(run('adb', ['connect', `${ip}:${WIFI_PORT}`]).trim());
    mkdirSync('logs', { recursive: true });
    writeFileSync(ADDRESS_FILE, `${ip}:${WIFI_PORT}\n`);
    console.log(`Saved ${ip}:${WIFI_PORT}. The cable can go; after a Mac restart: node tools/quest.mjs connect`);
  },

  async connect() {
    const address = connectedHeadset() ?? reachHeadset();
    if (!address) throw new Error(`The headset is not reachable over Wi-Fi (tried: ${headsetAddresses().join(', ') || 'nothing saved'}). Is it awake and on the network?`);
    console.log(`connected: ${address}`);
  },

  // A watchman: every 5 s, if adb no longer sees the headset over Wi-Fi, find it again (after a
  // headset restart: on its new wireless-debugging port, by its name on the network).
  async keep() {
    let was = '';
    for (;;) {
      const address = connectedHeadset() ?? reachHeadset();
      const now = address ? `connected ${address}` : 'lost';
      if (now !== was) console.log(`${new Date().toLocaleTimeString()} ${now}`);
      // back after a drop: the headset's route to the dev server may be gone with the old connection
      if (address && was !== now) {
        try { run('adb', ['-s', address, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`]); } catch { /* next round */ }
      }
      was = now;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  },

  // The headset sleeps a few seconds after it is taken off, and the connection drops.
  async awake() {
    adb(serial(), 'shell', 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.prox_close');
    console.log('Proximity sensor off: the headset stays awake when taken off. Undo: sleep');
  },

  async sleep() {
    adb(serial(), 'shell', 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.automation_disable');
    console.log('Proximity sensor back on.');
  },

  async open() {
    const id = serial();
    adb(id, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`);
    // One game at a time (18.11): every open used to leave the old tab running beside the new one — two or three
    // games in one headset, each with its own Punto and microphone, 2 fps and frames of 20 s. The old ones go first.
    try {
      forwardDevtools(id);
      const pages = await (await fetch(`http://127.0.0.1:${DEVTOOLS}/json`)).json();
      for (const page of pages.filter(isGame)) {
        await fetch(`http://127.0.0.1:${DEVTOOLS}/json/close/${page.id}`);
        console.log(`closed the old tab ${page.id}`);
      }
    } catch { /* no browser running yet: nothing to close */ }
    const paired = iwsdk('runtime', 'pair-headset', '--input-json', JSON.stringify({ headsetId: id }));
    let url = paired.url ?? paired.data?.url ?? paired.result?.url;
    if (!url || !/^https?:\/\/(localhost|127\.0\.0\.1):/.test(url)) {
      throw new Error(`Unexpected pairing answer: ${JSON.stringify(paired)}`);
    }
    if (argument) url += (url.includes('?') ? '&' : '?') + argument; // e.g. `open voice=live`
    adb(
      id,
      'shell',
      'am',
      'broadcast',
      '-n',
      'com.oculus.vrshell/.ShellControlBroadcastReceiver',
      '-a',
      'com.oculus.vrshell.intent.action.LAUNCH',
      '-d',
      'apk://com.oculus.browser',
      '-e',
      'uri',
      `ovrweb://vr?uri=${encodeURIComponent(url)}`,
    );
    console.log(`Opened in headset ${id}: ${url}`);
    console.log('In the headset: accept the certificate warning once, then press Enter XR.');
  },

  // The published game, as the judges get it: no dev server and no route through this computer — the headset
  // talks to Cloud Run itself (18.11: the home Wi-Fi stalled for 107 s twice, and every build in progress failed).
  // `watch` writes its console to logs/quest.log like the dev page's.
  async prod() {
    const id = serial();
    const key = readFileSync(`${process.env.HOME}/code/meta-keys/punto-prod-keys.txt`, 'utf8').match(/(?:^|,)\s*yury\s*[:=]\s*([^,\s]+)/m)?.[1];
    if (!key) throw new Error('No yury key in ~/code/meta-keys/punto-prod-keys.txt');
    try {
      forwardDevtools(id);
      const pages = await (await fetch(`http://127.0.0.1:${DEVTOOLS}/json`)).json();
      for (const page of pages.filter(isGame)) {
        await fetch(`http://127.0.0.1:${DEVTOOLS}/json/close/${page.id}`);
        console.log(`closed the old tab ${page.id}`);
      }
    } catch { /* no browser running yet: nothing to close */ }
    const url = `https://${PROD}/?key=${encodeURIComponent(key)}&${argument ?? 'voice=live'}`;
    adb(id, 'shell', 'am', 'broadcast', '-n', 'com.oculus.vrshell/.ShellControlBroadcastReceiver', '-a', 'com.oculus.vrshell.intent.action.LAUNCH',
      '-d', 'apk://com.oculus.browser', '-e', 'uri', `ovrweb://vr?uri=${encodeURIComponent(url)}`);
    console.log(`Opened in headset ${id}: https://${PROD}/?key=…&${argument ?? 'voice=live'}`);
  },

  async target() {
    const found = targets(serial());
    if (found.length !== 1) {
      throw new Error(`Expected one game page in the headset, found ${found.length}. Close extra tabs.`);
    }
    console.log(JSON.stringify(found[0].runtimeTarget));
  },

  async shot() {
    const id = serial();
    const file = argument ?? `quest-${Date.now()}.png`;
    const png = run('adb', ['-s', id, 'exec-out', 'screencap', '-p'], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
    // The headset prints a line of text before the image; keep the PNG only.
    const start = png.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (start < 0) {
      throw new Error(`No image came back: ${png.subarray(0, 200).toString()}`);
    }
    writeFileSync(file, png.subarray(start));
    console.log(`${file} (${png.length - start} bytes)`);
  },

  async logs() {
    const id = serial();
    const seconds = Number(argument ?? 10);
    const page = await gamePage(id);
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('Cannot connect to the headset browser'));
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    socket.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
    socket.onmessage = ({ data }) => {
      const { method, params } = JSON.parse(data);
      if (method === 'Runtime.consoleAPICalled') {
        const text = params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
        console.log(`[${params.type}] ${text.slice(0, 500)}`);
      } else if (method === 'Runtime.exceptionThrown') {
        const detail = params.exceptionDetails;
        console.log(`[exception] ${(detail.exception?.description ?? detail.text).slice(0, 800)}`);
      } else if (method === 'Log.entryAdded') {
        console.log(`[${params.entry.level}] ${params.entry.text.slice(0, 500)}`);
      }
    };
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    socket.close();
  },

  // Keeps writing the console of every game page in the headset to logs/quest.log,
  // with the time and the tab, so a freeze can be traced after the fact. Runs until stopped.
  async watch() {
    // The headset's address is found again whenever it is lost: wireless debugging gets a new port after the
    // headset restarts, and an address kept from the start left a whole session unlogged (16.11).
    let id = serial();
    mkdirSync('logs', { recursive: true });
    const seen = new Set();
    // local time, as the server's log and the player's clock (it was UTC before 16.11)
    const clock = () => { const d = new Date(); return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`; };
    const note = (tab, kind, text) =>
      appendFileSync('logs/quest.log', `${clock()} ${tab} [${kind}] ${text.slice(0, 1500).replace(/\n/g, ' ⏎ ')}\n`);
    // The headset's own frame rate, once a second (VrApi in logcat): FPS, stale frames, the app's CPU time, GPU load.
    // Goes to logs/fps.log beside the console, so a jerk in quest.log can be matched to the frames it cost.
    let frames;
    const watchFrames = () => {
      if (frames && frames.exitCode === null) return;
      frames = spawn('adb', ['-s', id, 'logcat', '-v', 'raw', '-T', '1', '-s', 'VrApi:I']);
      let rest = '';
      frames.stdout.setEncoding('utf8');
      frames.stdout.on('data', (chunk) => {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop();
        for (const line of lines) {
          const pick = (key) => line.match(new RegExp(`${key}=([^,]+)`))?.[1];
          const fps = pick('FPS');
          if (fps) appendFileSync('logs/fps.log', `${clock()} FPS=${fps} Stale=${pick('Stale')} App=${pick('App')} CPU%=${pick('CPU%')} GPU%=${pick('GPU%')}\n`);
        }
      });
      frames.on('error', () => {});
    };
    for (;;) {
      try {
        // The route from the headset to the dev server vanishes when the headset
        // sleeps or the cable is pulled: put it back whenever it is missing.
        if (!adb(id, 'reverse', '--list').includes(`tcp:${PORT}`)) {
          adb(id, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`);
          note('------', 'watch', 'route to the dev server was missing — restored');
        }
        forwardDevtools(id);
        watchFrames();
        const pages = await (await fetch(`http://127.0.0.1:${DEVTOOLS}/json`)).json();
        for (const page of pages.filter(isGame)) {
          if (seen.has(page.id)) {
            continue;
          }
          seen.add(page.id);
          const tab = page.id.slice(0, 6);
          const socket = new WebSocket(page.webSocketDebuggerUrl);
          socket.onopen = () => {
            note(tab, 'watch', `attached to ${page.url}`);
            socket.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
            socket.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
          };
          socket.onclose = () => {
            note(tab, 'watch', 'page closed or reloaded');
            seen.delete(page.id);
          };
          socket.onmessage = ({ data }) => {
            const { method, params } = JSON.parse(data);
            if (method === 'Runtime.consoleAPICalled') {
              note(tab, params.type, params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
            } else if (method === 'Runtime.exceptionThrown') {
              const detail = params.exceptionDetails;
              note(tab, 'EXCEPTION', detail.exception?.description ?? detail.text);
            } else if (method === 'Log.entryAdded') {
              note(tab, params.entry.level, params.entry.text);
            }
          };
        }
      } catch (error) {
        note('------', 'watch', `headset not reachable: ${error.message}`);
        try {
          const found = serial();
          if (found !== id) {
            note('------', 'watch', `the headset is at ${found} now (was ${id})`);
            id = found;
            frames?.kill();
          }
        } catch {
          // not on the network yet: next round
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  },

  async close() {
    const id = serial();
    adb(id, 'reverse', '--remove-all');
    adb(id, 'forward', '--remove-all');
    console.log('Routes removed.');
  },

  async help() {
    console.log('Usage: node tools/quest.mjs open | shot [file] | logs [seconds] | target | close');
  },
};

try {
  await (commands[command] ?? commands.help)();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
