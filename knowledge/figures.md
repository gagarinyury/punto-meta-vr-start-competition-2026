# People: ready toy figures (`../figures.js`)

For any person in a game — a pirate crew on the table, a zombie in the room, a
crowd — take a ready figure by name. Never build people from boxes: every
figure is already in Punto's look, one mesh (one draw call), with joints.

```ts
import { figure, animate, lookAt } from '../figures.js';

const pirate = figure('pirate');                    // 1 unit tall: a game unit on a tabletop board
const zombie = figure('zombie', { height: 1.7 });   // life size in the room: metres
pirate.userData.joints.HandRight.add(sword());      // a thing in the hand
// in update():
animate(pirate, 'walk', time);                      // time in seconds
lookAt(zombie, playerHeadPosition);                 // after animate()
```

- **height**: an adult's height in the units of the world it stands in. On a
  `tabletop` board build in game units (`height: 1` = one cell); in the room
  use metres (`1.7`). Kids' figures come out smaller by themselves.
- Feet at y = 0, facing +Z. On a board move and turn it yourself; in the room
  give it to `walkInRoom` like any creature (knowledge/creature.md) and call
  `animate(fig, walker.idle ? 'idle' : 'walk', t)` in update().
- **Animations**: idle, walk, run, sit, hold (both hands forward), wave, jump,
  shamble (zombie), aim (right arm straight forward), strike (overhead swing).
  `walk` uses the figure's own gait (a zombie shambles).
- **Faces**: smile, happy, surprised, angry, zombie, skull — `figure('knight', { face: 'angry' })`.
- **Colours**: `figure('knight', { colors: { shirt: 'blue', jeans: 'dark grey' } })` (keys and colour names: the
  HOST API).
- **Joints** (`fig.userData.joints`): Body, Torso, Head, Arm/Forearm/Leg/Shin Right|Left; their limits are kept.
- **Hands**: `joints.HandRight` / `joints.HandLeft` take any thing built for the
  player's hand (`knowledge/hand.md` axes: handle at the origin along Y, +Y out of
  the top of the fist, −Z along the forearm; real metres): the ready ones
  (`sword()`, `axe()`, `wand()`, `torch()`… from `../style.js`) or
  your own. It is scaled to the figure by itself. Use `aim` for guns and wands, `strike` for swords and axes,
  `hold` to carry. Remove it with `hand.remove(thing)`.

## Names
person (no costume), wizard, worker, clerk, doctor, scientist, knight, chef, pirate, woman,
sportswoman, astronaut, zombie, ninja, viking, cowboy, superhero, robot, firefighter, nurse,
police officer, diver, mail carrier, teacher, female teacher, shopkeeper, waiter, waitress,
pilot, flight attendant, sailor, captain, taxi driver, gardener, plumber, vet, judge,
librarian, miner, lumberjack, fisherman, photographer, journalist, janitor, guard, detective,
mechanic, programmer, pastry chef, farmer, beekeeper, gnome, king, queen, princess, prince,
jester, witch, necromancer, paladin, barbarian, druid, monk, alchemist, dark knight, orc, elf,
archer, fairy, angel, imp, archaeologist, explorer, hunter, climber, hiker, alien, cyborg,
space marine, starship pilot, android, vampire, mummy, skeleton, werewolf, ghost, pumpkin head,
football player, basketball player, boxer, tennis player, female tennis player, skier, runner,
hockey player, cyclist, coach, grandpa, grandma, schoolboy, schoolgirl, toddler, musician,
artist, dj, blogger, singer, ballerina, bride, cowgirl, samurai, legionary, pharaoh.
Common synonyms work too (builder, cop, kid, dancer, old man…). An unknown name throws with
the list.

No name fits: the nearest one with other colours (`colors`), never people built from boxes.
