<div align="center">

<img src="public/icons/icon-192.png" width="96" alt="Punto" />

# Punto

### Say it — and it appears in your room.

A tiny robot lives behind your walls. Point, pinch and say what you want:<br/>
he codes it live, and it appears in your real room.

[![Meta Quest](https://img.shields.io/badge/Meta_Quest-mixed_reality-0467DF?logo=meta&logoColor=white)](https://www.meta.com/quest/)
[![WebXR](https://img.shields.io/badge/WebXR-IWSDK-7B3FE4)](https://iwsdk.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![three.js](https://img.shields.io/badge/three.js-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Claude](https://img.shields.io/badge/coder-Claude_Sonnet-D97757?logo=anthropic&logoColor=white)](https://www.anthropic.com/claude)
[![Gemini Live](https://img.shields.io/badge/voice-Gemini_Live-4285F4?logo=googlegemini&logoColor=white)](https://ai.google.dev/gemini-api/docs/live)
[![Cloud Run](https://img.shields.io/badge/Google_Cloud_Run-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)

**Built for the [Meta VR Start Developer Competition 2026](https://developers.meta.com/vr/start/)**

[How it works](#how-it-works) · [Run locally](#run-locally)

<br/>

<img src="docs/cover.jpg" alt="Punto — say it, see it, play it" width="100%" />

</div>

---

## What it is

You hear knocking inside your real wall. A crack opens, and a small robot squeezes out while you pull
the broken pieces away with your hands. That's **Punto**. He asks you to say *"fix it"* — and the wall
heals: your first spell.

Then just talk to him:

| You say | Punto builds |
|---|---|
| *"The solar system on my coffee table"* | Planets with real NASA textures, orbiting on your real table |
| *"A village in the forest, with little people walking"* | A tabletop diorama that stands on your table top |
| *"A blaster, and targets on that wall"* | A tool in your hand and targets anchored to your real wall |
| *"A piano"* · *"drums"* · *"a xylophone"* | Instruments you play with your fingertips |
| *"A water molecule I can hold"* | A real molecule (PubChem), in your hands |
| *"Make it bigger"* · *"make it red"* · *"undo"* | Changes in seconds, 20 versions kept |

No code on screen, no menus, no controllers — your voice, your hands and your room.

<p align="center"><img src="docs/demo.jpg" alt="Real captures from Meta Quest: whack-a-mole, xylophone, drums, solar system, DNA, black hole, portal in the wall, village on the table, fire in your hands" width="100%" /><br/><sub>Captured in passthrough on Meta Quest — every thing here was coded live by Punto from one spoken sentence.</sub></p>

## Features

- 🧱 **Mixed reality first** — passthrough, scene understanding (walls, floor, tables, sofa), hit test and
  anchors: things land where you point and stay there.
- ✋ **Hands, not controllers** — pinch to talk, touch to play, grab, pull and throw.
- 🗣️ **Natural voice** — a live voice conversation with Punto, in English or Russian.
- ⚡ **Watch it being built** — the code streams onto Punto's screen while parts of the thing appear one by
  one; the old version burns away as a ghost.
- ↩️ **Undo / redo by voice** — every change is a version; *"go back"*, *"no, the new one was better"*.
- 📚 **Library** — say *"save"* to keep a creation; saved ones replay instantly, without any AI call.
- 👥 **Many players at once** — every browser gets its own Punto and its own history.

## How it works

```mermaid
flowchart LR
    V["🎙️ Your voice"] --> L["Gemini Live<br/>Punto's voice"]
    L --> D["Director<br/>Claude Haiku<br/>make · change · undo · save"]
    D -->|ready spell| H
    D -->|make / change| C["Coder<br/>Claude Sonnet<br/>streams a TypeScript module"]
    C --> T["tsc type check"]
    T -->|errors| R["auto repair"] --> T
    T -->|ok| H["Host page (IWSDK)<br/>room, placement, physics,<br/>effects, sound"]
    H --> Q["🥽 Your room on Quest"]
```

The model writes only **the idea** — a small TypeScript module against a typed host API (`tools/coder-api.d.ts`).
The **host** does the hard, reliable parts: finding surfaces in your room, placing and anchoring, hands,
physics, effects, sound, and a library of ready parts (characters, planets, molecules, instruments,
99 ready things). Generated code never runs on the server — only `tsc --noEmit` does.

## Tech stack

| Layer | |
|---|---|
| XR runtime | [IWSDK](https://iwsdk.dev) (WebXR, ECS) · three.js · Havok physics · Quest browser, no install, installable PWA |
| Voice | Gemini Live (conversation) · Chirp 3 (speech-to-text fallback) |
| Agents | Director: Claude Haiku · Coder: Claude Sonnet (via OpenRouter, prompt caching) |
| Server | Node.js · Express · Google Cloud Run · Cloudflare Worker in front |
| Content | Poly Haven skies (CC0) · Kenney sounds (CC0) · NASA planet textures · PubChem molecules |

## Project layout

```
src/            the page: Punto, the live loop, the way in through the wall, placement, drafts, hands
  features/     the creations the coder writes (one TypeScript module each)
  style/        the host's building blocks: houses, trees, characters, props
  instruments/  piano, drums, xylophone, marimba, kalimba — played by fingertips
server/         /api: voice, director, coder, versions & undo, library, limits
tools/          the coder (coder.mjs), its prompt and typed API, compile & checks
knowledge/      what the coder is taught, topic by topic
samples/        example creations
edge/           the Cloudflare Worker in front of Cloud Run
public/         sounds, voice lines, textures, models, icons
```

## Run locally

Requires Node.js 22+ and a Meta Quest (or the IWER emulator that opens with the dev server).

```sh
npm install && (cd server && npm install)

# server/.env
#   PUNTO_KEYS=me:some-local-key
#   OPENROUTER_API_KEY=...
#   CODER_BACKEND=openrouter
#   CODER_OR_MODEL=anthropic/claude-sonnet-5.5
#   PUNTO_DIRECTOR_OR=anthropic/claude-haiku-5.5
#   CODER_PROMPT=bare
# Gemini Live and Chirp use Google Cloud: gcloud auth application-default login

node --env-file=server/.env server/index.mjs   # the Punto server, :8787
npm run dev                                     # the page, with the IWER emulator
```

Open the page with `?key=some-local-key&voice=live`.
On a Quest connected over USB: `node tools/quest.mjs open "voice=live"`.

```sh
npm test    # type check + syntax check of every server/tools/edge script
```

## Credits

- 3D models: [Poly Pizza](https://poly.pizza), CC0 — see `public/models/polypizza/CREDITS.md`
- Skies: [Poly Haven](https://polyhaven.com), CC0 · Sounds: [Kenney](https://kenney.nl), CC0
- Built on [IWSDK](https://github.com/facebook/immersive-web-sdk) by Meta

<div align="center">
<br/>
Made solo · November 2026
</div>
