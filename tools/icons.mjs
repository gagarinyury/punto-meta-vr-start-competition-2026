// The app icons (public/icons): Punto's face — the cream bezel, the dark screen, cyan eyes and
// smile, the power button low on the wide left bezel — on a dark full-bleed field, so one picture
// serves both "any" and "maskable" (the face sits inside the middle 80 %, the platform's safe zone).
//   node tools/icons.mjs
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="field" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#17323b"/>
      <stop offset="100%" stop-color="#050b0f"/>
    </radialGradient>
    <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e2d9cc"/>
      <stop offset="100%" stop-color="#b3a897"/>
    </linearGradient>
    <radialGradient id="screen" cx="50%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0f2026"/>
      <stop offset="100%" stop-color="#03080a"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#5fe8ee" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#5fe8ee" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#field)"/>
  <circle cx="262" cy="248" r="210" fill="url(#glow)"/>
  <rect x="104" y="112" width="312" height="276" rx="64" fill="url(#bezel)"/>
  <rect x="150" y="140" width="242" height="214" rx="38" fill="url(#screen)"/>
  <g fill="#5fe8ee">
    <rect x="192" y="190" width="38" height="10" rx="5" transform="rotate(-8 211 195)"/>
    <rect x="310" y="190" width="38" height="10" rx="5" transform="rotate(8 329 195)"/>
    <rect x="194" y="214" width="34" height="56" rx="17"/>
    <rect x="312" y="214" width="34" height="56" rx="17"/>
  </g>
  <path d="M232 300 Q271 334 310 300" stroke="#5fe8ee" stroke-width="12" stroke-linecap="round" fill="none"/>
  <circle cx="127" cy="352" r="13" fill="#3a3a3a"/>
  <circle cx="127" cy="352" r="8" fill="#5fe8ee"/>
</svg>`;

await mkdir('public/icons', { recursive: true });
const png = (size, out) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
await png(512, 'public/icons/icon-512.png');
await png(192, 'public/icons/icon-192.png');
await png(512, 'public/icons/icon-512-maskable.png');
await png(180, 'public/icons/apple-touch-icon.png');
console.log('public/icons: 192, 512, 512 maskable, 180');
