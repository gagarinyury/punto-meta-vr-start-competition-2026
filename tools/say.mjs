// Says a phrase to Punto in every open page (the emulator, the headset) as if the player had
// spoken it, and prints what came of it. Needs the dev server (npm run dev).
//   node tools/say.mjs "make a red cube"
//   node tools/say.mjs "make a red cube" "paint it blue"     several, one after another
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the dev server's own local certificate
const phrases = process.argv.slice(2);
if (!phrases.length) {
  console.log('usage: node tools/say.mjs "<phrase>" ["<phrase>" ...]');
  process.exit(1);
}
for (const text of phrases) {
  const response = await fetch('https://localhost:8081/__say', { method: 'POST', body: JSON.stringify({ text }) });
  const { outcome, seconds, error } = await response.json();
  console.log(`> ${text}\n  ${error ?? `${outcome} (${seconds} s)`}`);
}
