// Where the frames go (Yury, 16.11: «много тормозило, когда что-то запускалось»). The page tells its console, and
// the headset's console is kept in logs/quest.log (tools/quest.mjs watch; the headset's own frame rate beside it in
// logs/fps.log):
//   [perf] long frame 180 ms · draft run, made load · +4 shader programs (41)
//   [perf] long task 230 ms · draft run
//   [perf] 10 s: 68 fps, worst 180 ms, 3 long frames, 41 shader programs, 120 draw calls
// Work that may cost frames says what it is doing: `const done = busy('draft run'); …; done()`. A long frame names
// what was going on in it, also the work that ended during it. New shader programs are counted: a thing that comes
// with new materials compiles them on its first frame, and on the Quest that is the classic jerk.
import { createSystem, type World } from '@iwsdk/core';

const LONG_MS = 50; // ~4 frames at 72 Hz
const EVERY_S = 10;

const active = new Map<string, number>(); // what is going on now (a label may be on more than once)
const ended: { label: string; at: number }[] = []; // what ended lately, for a frame it was in
let started = false;

/** Marks work that may cost frames; call the returned function when it is done (twice is fine). */
export function busy(label: string): () => void {
  active.set(label, (active.get(label) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = (active.get(label) ?? 1) - 1;
    if (left > 0) active.set(label, left);
    else active.delete(label);
    ended.push({ label, at: performance.now() });
    if (ended.length > 40) ended.splice(0, ended.length - 40);
  };
}

/** The work going on since `since` (ms, performance.now()): on now, or ended after it. */
function doing(since: number): string {
  const labels = new Set(active.keys());
  for (const one of ended) if (one.at >= since) labels.add(one.label);
  return labels.size ? [...labels].join(', ') : 'nothing marked';
}

/** Starts the frame watch: long frames and long tasks as they happen, a summary every 10 s. Once per page. */
export function startPerf(world: World): void {
  if (started) return;
  started = true;
  // JavaScript that held the main thread for 50 ms or more (Chromium's long tasks; the Quest browser has them)
  try {
    new PerformanceObserver((list) => {
      for (const task of list.getEntries()) {
        console.warn(`[perf] long task ${Math.round(task.duration)} ms · ${doing(task.startTime)}`);
      }
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    console.info('[perf] no long-task observer in this browser');
  }
  let last = 0, worst = 0, long = 0, frames = 0, windowStart = 0, programs = -1;
  world.registerSystem(
    class FrameWatch extends createSystem({}) {
      update(): void {
        const now = performance.now();
        const info = world.renderer.info;
        const count = info.programs?.length ?? 0;
        if (last) {
          const ms = now - last;
          frames++;
          if (ms > worst) worst = ms;
          if (ms > LONG_MS) {
            long++;
            const grew = programs >= 0 && count > programs ? ` · +${count - programs} shader programs (${count})` : '';
            console.warn(`[perf] long frame ${Math.round(ms)} ms · ${doing(last)}${grew}`);
          } else if (programs >= 0 && count > programs) {
            console.info(`[perf] +${count - programs} shader programs (${count}) · ${doing(last)}`);
          }
        } else windowStart = now;
        programs = count;
        last = now;
        if (now - windowStart >= EVERY_S * 1000) {
          const seconds = (now - windowStart) / 1000;
          // quiet windows say nothing outside XR: the summary is for the headset
          if (world.renderer.xr.isPresenting || long) {
            console.info(
              `[perf] ${EVERY_S} s: ${Math.round(frames / seconds)} fps, worst ${Math.round(worst)} ms, ${long} long frames, ` +
                `${count} shader programs, ${info.render.calls} draw calls`,
            );
          }
          windowStart = now;
          worst = long = frames = 0;
        }
      }
    },
  );
}
