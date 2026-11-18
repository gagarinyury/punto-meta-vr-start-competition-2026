import {
  CanvasTexture,
  CircleGeometry,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type World,
} from '@iwsdk/core';
import qrcode from 'qrcode-generator';
import { onRayPress } from './ray.js';

/**
 * The plates of playing together (src/together.ts): somebody knocks (let them in or not), the way in for a
 * friend (a code to say, a QR, a link), and short notes («Аня зашла», «Никого нет дома»). One plate at a time,
 * in front of the player at their eyes, turned to them; it stays where it came up.
 */

const CYAN = '#35d8ff';
let shown: { entity: Entity; timer?: ReturnType<typeof setTimeout>; textures: CanvasTexture[] } | undefined;

function canvasTexture(width: number, height: number, draw: (x: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d')!);
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function card(x: CanvasRenderingContext2D, w: number, h: number): void {
  x.fillStyle = 'rgba(12,14,18,0.92)';
  x.beginPath();
  x.roundRect(8, 8, w - 16, h - 16, 40);
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = CYAN;
  x.shadowColor = CYAN;
  x.shadowBlur = 20;
  x.stroke();
  x.shadowBlur = 0;
}

function lines(x: CanvasRenderingContext2D, rows: [string, number, string?][], w: number, top: number): void {
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  let y = top;
  for (const [text, size, color] of rows) {
    x.font = `700 ${size}px system-ui, sans-serif`;
    x.fillStyle = color ?? '#ffffff';
    x.fillText(text, w / 2, y, w - 80);
    y += size * 1.35;
  }
}

/** Takes the shown plate away. */
export function closePlate(): void {
  if (!shown) return;
  clearTimeout(shown.timer);
  if (shown.entity.active) shown.entity.dispose();
  for (const texture of shown.textures) texture.dispose();
  shown = undefined;
}

/** Puts `group` 0.7 m in front of the player's eyes, a little low, turned to them. */
function present(world: World, group: Group, textures: CanvasTexture[], seconds?: number): void {
  closePlate();
  const head = world.player.head;
  const eye = head.getWorldPosition(new Vector3());
  const ahead = head.getWorldDirection(new Vector3()).negate().setY(0); // a Group's +Z is behind the eyes
  if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
  ahead.normalize();
  group.position.copy(eye).addScaledVector(ahead, 0.7).setY(eye.y - 0.12);
  group.lookAt(eye.x, group.position.y, eye.z);
  const entity = world.createTransformEntity(group);
  shown = { entity, textures, timer: seconds ? setTimeout(closePlate, seconds * 1000) : undefined };
}

function plate(width: number, height: number, texture: CanvasTexture): Mesh {
  return new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
}

function button(world: World, label: string, color: string, onPress: () => void): Mesh {
  const texture = canvasTexture(256, 256, (x) => {
    x.fillStyle = color;
    x.beginPath();
    x.arc(128, 128, 120, 0, Math.PI * 2);
    x.fill();
    lines(x, [[label, 40, '#0c0e12']], 256, 128);
  });
  const mesh = new Mesh(new CircleGeometry(0.045, 32), new MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.userData.texture = texture;
  mesh.userData.onPress = onPress;
  mesh.userData.world = world;
  return mesh;
}

/** The buttons answer a ray's pinch once they are in the world. */
function wire(world: World, buttons: Mesh[]): void {
  for (const mesh of buttons) {
    const entity = world.createTransformEntity(mesh, shown!.entity);
    onRayPress(world, entity, () => mesh.userData.onPress());
  }
}

/** Somebody knocks: «Аня стучится», and «Пустить» / «Не сейчас». The answer goes to `answer` once. */
export function showKnock(world: World, name: string, answer: (yes: boolean) => void): void {
  const texture = canvasTexture(768, 300, (x) => {
    card(x, 768, 300);
    lines(x, [[`${name} стучится`, 64], ['Пустить в игру?', 40, '#9aa4b2']], 768, 100);
  });
  const group = new Group();
  group.add(plate(0.36, 0.14, texture));
  let done = false;
  const once = (yes: boolean) => {
    if (done) return;
    done = true;
    closePlate();
    answer(yes);
  };
  const yes = button(world, 'Пустить', '#4dff8f', () => once(true));
  const no = button(world, 'Нет', '#c8ced6', () => once(false));
  yes.position.set(-0.07, -0.11, 0.002);
  no.position.set(0.07, -0.11, 0.002);
  present(world, group, [texture, yes.userData.texture, no.userData.texture], 60);
  wire(world, [yes, no]);
}

/** The way into this room for a friend: the code to say, a QR for a phone, the link. The QR goes through Meta's
 *  Web Launch: scanned on the friend's phone, it opens the game in the friend's Quest (research/notes/SHARING.md). */
export function showInvite(world: World, label: string, link: string): void {
  const qr = qrcode(0, 'M');
  qr.addData(`https://www.oculus.com/open_url/?url=${encodeURIComponent(link)}`);
  qr.make();
  const texture = canvasTexture(768, 900, (x) => {
    card(x, 768, 900);
    lines(x, [['Позови друга', 52], [`Код комнаты: ${label}`, 44, CYAN]], 768, 80);
    const cells = qr.getModuleCount();
    const size = 460;
    const cell = size / cells;
    const left = (768 - size) / 2;
    const top = 220;
    x.fillStyle = '#ffffff';
    x.fillRect(left - 20, top - 20, size + 40, size + 40);
    x.fillStyle = '#000000';
    for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) if (qr.isDark(r, c)) x.fillRect(left + c * cell, top + r * cell, cell + 0.5, cell + 0.5);
    lines(x, [['Друг наводит телефон на QR — игра откроется в его Quest.', 28, '#c8ced6'], ['Или скажи другу код: «подключись к ' + label + '».', 28, '#c8ced6']], 768, 760);
  });
  const group = new Group();
  group.add(plate(0.3, 0.35, texture));
  present(world, group, [texture], 90);
  console.info(`[together] the way in: ${link}`);
}

/** A short note: who came, who left, nobody home. */
export function showNote(world: World, text: string, seconds = 4): void {
  const texture = canvasTexture(768, 180, (x) => {
    card(x, 768, 180);
    lines(x, [[text, 52]], 768, 90);
  });
  const group = new Group();
  group.add(plate(0.36, 0.085, texture));
  present(world, group, [texture], seconds);
}

/** A shot hit this player's mask: a red flash before their eyes for a moment, fading. */
export function flashHit(world: World): void {
  const material = new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false });
  const veil = new Mesh(new PlaneGeometry(0.6, 0.4), material);
  veil.position.set(0, 0, -0.25);
  veil.renderOrder = 9999;
  world.player.head.add(veil);
  const start = performance.now();
  const fade = () => {
    const k = (performance.now() - start) / 350;
    if (k >= 1) {
      veil.removeFromParent();
      veil.geometry.dispose();
      material.dispose();
      return;
    }
    material.opacity = 0.45 * (1 - k);
    setTimeout(fade, 16); // not requestAnimationFrame: a window's frames may stop in an XR session
  };
  setTimeout(fade, 16);
}
