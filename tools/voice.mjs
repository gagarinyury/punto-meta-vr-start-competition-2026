// Records Punto's intro lines once into public/voice/<key>.wav, so the intro
// plays files and never waits for (or pays) a speech service.
//   node tools/voice.mjs            all lines
//   node tools/voice.mjs hello oops only these
//   node tools/voice.mjs --ru         the Russian lines into public/voice/ru/
// Env: PUNTO_VOICE (Puck), PUNTO_TTS (gemini-3.8-flash-tts: the better GA model;
// speed does not matter here). Auth: gcloud application-default login.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { INTRO_LINES, INTRO_LINES_RU } from '../src/intro-lines.ts';

// the SDK lives with the server
const { GoogleGenAI } = createRequire(new URL('../server/package.json', import.meta.url))('@google/genai');
const ai = new GoogleGenAI({ vertexai: true, project: process.env.PUNTO_PROJECT ?? 'punto-vr', location: 'global' });
const model = process.env.PUNTO_TTS ?? 'gemini-3.8-flash-tts';
const voice = process.env.PUNTO_VOICE ?? 'Puck';

// --ru: the Russian lines into public/voice/ru/
const russian = process.argv.includes('--ru');
const wanted = process.argv.slice(2).filter((arg) => arg !== '--ru');
const dir = russian ? 'public/voice/ru' : 'public/voice';
mkdirSync(dir, { recursive: true });
for (const [key, text] of Object.entries(russian ? INTRO_LINES_RU : INTRO_LINES)) {
  if (wanted.length && !wanted.includes(key)) continue;
  const started = Date.now();
  const reply = await ai.models.generateContent({
    model,
    contents: text, // just the line: Gemini 3.8 TTS reads a style prompt aloud (checked 12.11)
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  });
  const audio = reply.candidates[0].content.parts[0].inlineData;
  if (!audio.mimeType.includes('wav')) throw new Error(`${key}: expected WAV, got ${audio.mimeType}`);
  writeFileSync(`${dir}/${key}.wav`, Buffer.from(audio.data, 'base64'));
  console.log(`${key}: ${Date.now() - started} ms — ${text}`);
}
