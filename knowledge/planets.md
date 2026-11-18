# The real planets of the solar system (`../planets.js`)

The Sun, the Moon, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune by name, with NASA's maps (there is no
Mercury). Any other planet — an invented world, a planet as a toy or a game piece — is the `planet({ … })` of
`../style.js` (style.md, "Space"): another function of the same name.

```ts
import { realPlanet } from '../planets.js';

const earth = realPlanet('earth', { radius: 0.12 });   // metres
earth.position.copy(inFrontOfPlayer(world, { distance: 0.8 }).point);
world.createTransformEntity(earth);
// in update(): earth.rotation.y += delta * 0.3;  tilt with rotation.z (Saturn 0.47, Earth 0.41)
```
