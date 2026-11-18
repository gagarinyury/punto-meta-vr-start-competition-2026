# The score: one board over Punto (host helper)

A game's numbers live on the host's board over Punto's head: it has its own place, never covers the game, and goes
away with the game. Never build a score panel or score text of your own.

```ts
import { showScore } from '../score.js';

showScore(world, { Score: 0 });                       // when the game starts
showScore(world, { Score: 12, Wave: 3, Lives: 2 });   // again whenever a number changes; up to four, short English labels
```

# Buttons and menus (IWSDK UIKitML) — only when the player asks for them

A panel only when the request needs buttons, a menu, settings or a progress bar; things picked up or hit are
Three.js objects. UIKitML looks like HTML + CSS, with the ready Horizon kit:

```ts
const PANEL = `
<style>
  .card { flex-direction: column; gap: 14px; width: 360px; padding-top: 22px; padding-bottom: 22px; padding-left: 22px; padding-right: 22px; }
</style>
<Panel class="card">
  <ProgressBar id="bar" value="20"></ProgressBar>
  <Button id="again"><ButtonLabel>Again</ButtonLabel></Button>
  <Slider id="speed" min="0" max="100" step="5" default-value="50"></Slider>
</Panel>`;
const url = URL.createObjectURL(new Blob([PANEL], { type: 'text/plain' }));
const panel = await loadUIKitMLAsset(url);     // inside an async setup
URL.revokeObjectURL(url);
panel.scale.setScalar(0.12);                   // 360px → 43 cm
world.createTransformEntity(panel).addComponent(RayInteractable)
  .addComponent(Follower, { target: world.player.head, offsetPosition: [-0.45, -0.1, -0.9] }); // left of the gaze
panel.requireElementById('again').addEventListener('click', () => panel.requireElementById('bar').setProperties({ value: 0 }));
panel.requireElementById('speed').setProperties({ onValueChange: (v: number) => { /* 0..100 */ } });
```

## Where a panel goes

`Follower` keeps it at an offset from the head (x right, y up, −z ahead, metres) and turns it to the player. A panel
that belongs to a place (on the table, on a wall) is placed once like any object.

## Rules

- 100px = 1 m before scaling: author 300–450px wide, scale 0.1–0.15. Visible from ONE side (+Z): face the player.
- The panel entity needs `RayInteractable`, or clicks do not land.
- `Slider` and `Toggle` take `setProperties({ onValueChange })` / `{ onCheckedChange }`, never
  `addEventListener('change')`. Change text and style with `setProperties({ text, color, backgroundColor, display })`.
- Every padding and margin side separately (no `padding: 12px 18px`); flexbox only; tags `div`, `span`.

## Ready elements (Horizon kit)

`<Panel>`, `<Button>` with `<ButtonLabel>` and/or `<ButtonIcon><IconName></IconName></ButtonIcon>`, `<ProgressBar
value="0..100">`, `<Divider>`, `<Badge>`, `<Toggle>`, `<Slider>`. Icons are Lucide names in PascalCase: `ArrowLeft`,
`ArrowRight`, `RotateCw`, `Play`, `Pause`, `RefreshCw`, `Trophy`, `Heart`, `Star`, `Target`, `Timer`, `Volume2`, `X`,
`Check`.
