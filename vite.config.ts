/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync, rmSync } from 'node:fs';

/**
 * What public/ holds for development only, taken out of the published build (audit item 27): notes for
 * agents, the voice-take logs, the model sheet page (research/code/tools/model-shot.mjs, on localhost) and the test models
 * of src/_view. Credits and licences stay.
 */
const DEV_ONLY = [
  'scenes/AGENTS.md', 'ui/AGENTS.md', 'voice/_take.txt', 'voice/ru/_take.txt', 'model-shot.html', 'models/_test',
  // the stands' flat boy and the art to compare with (the game's front page draws it all in code)
  'splash-boy.png', 'splash.jpg',
];
function devOnlyOut(): Plugin {
  let outDir = 'dist';
  return {
    name: 'punto-dev-only-out',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const path of DEV_ONLY) rmSync(`${outDir}/${path}`, { recursive: true, force: true });
    },
  };
}

/**
 * Flat stand pages (research/stands/life.html: the effects) do not need the headset emulator the IWSDK dev plugin puts into every
 * page it serves — an 8 MB script that held such a page for 1.7 s at its start on the desktop (measured 18.11: one
 * long frame, all of it this script). A page that says <meta name="punto-stand"> gets it taken out again.
 * The game page keeps it; the Quest browser never starts it (the plugin's own rule), the build never has it.
 */
function standsWithoutEmulator(): Plugin {
  return {
    name: 'punto-stands-without-emulator',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => (html.includes('name="punto-stand"') ? html.replace(/<script[^>]*src="\/@iwer-injection-runtime"[^>]*><\/script>/, '') : html),
    },
  };
}

/** The first key in server/.env (PUNTO_KEYS=owner:key,...), or '' without it. */
function devKey(): string {
  const env = existsSync('server/.env') ? readFileSync('server/.env', 'utf8') : '';
  return env.match(/^PUNTO_KEYS=[^:]+:([^,\s]+)/m)?.[1] ?? '';
}

/**
 * Dev bridge for tools/say.mjs: POST /__say { text } reaches every open page (the emulator, the
 * headset) as if the player had said it; the answer waits until the page reports what came of it.
 */
function sayBridge(): Plugin {
  return {
    name: 'punto-say-bridge',
    configureServer(server) {
      const waiting = new Map<string, (result: unknown) => void>();
      server.ws.on('punto:said', (result: { id: string }) => {
        waiting.get(result.id)?.(result);
        waiting.delete(result.id);
      });
      server.middlewares.use('/__say', (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const id = Date.now().toString(36);
          const reply = (result: unknown) => {
            clearTimeout(timer);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(result));
          };
          const timer = setTimeout(() => {
            waiting.delete(id);
            reply({ id, error: 'no page answered in 180 s (is the game open?)' });
          }, 180_000);
          waiting.set(id, reply);
          server.ws.send({ type: 'custom', event: 'punto:say', data: { id, text: JSON.parse(body || '{}').text ?? '' } });
        });
      });
    },
  };
}

export default defineConfig({
  // Coder-made panels are UIKitML strings loaded at run time, so the build cannot see their
  // icons: keep every Lucide icon (~1 MB gzipped), or an unknown one drops the whole panel.
  plugins: [iwsdkDev({ bundle: { icons: 'all' } }), sayBridge(), devOnlyOut(), standsWithoutEmulator()],
  server: {
    host: '0.0.0.0',
    // PUNTO_DEV_PORT / PUNTO_API_PORT: a second copy beside the usual one (18.11: the bare coder on 8082/8788)
    port: Number(process.env.PUNTO_DEV_PORT ?? 8081),
    open: false,
    // The Punto server (server/index.mjs) answers /api while developing; the
    // proxy adds the developer's own key from server/.env, so the page needs none.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PUNTO_API_PORT ?? 8787}`,
        headers: { 'x-punto-key': devKey() },
        ws: true, // /api/live, Punto's live voice (server/live.mjs)
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      // made games import it (src/music.ts): found first in a made game, Vite optimised it then and reloaded the
      // page in the headset — out of XR, the game "hung" (16.11)
      'smplr',
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
