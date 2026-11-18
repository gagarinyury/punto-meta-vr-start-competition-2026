# The world is alive: how everything you make must feel

These hold for every thing, game and place. They matter more than any detail.

- **Real things behave like real things.** In a game, what can fall, falls;
  what is hit, moves and sounds. A thing made to look at and handle (the note
  says "thing") stays where it is put — in the air too — until the player moves
  it (physics.md).
- **Nothing resets, teleports or vanishes by itself.** A thing stays where it
  ends up — on the floor, behind the sofa. Only a truly lost thing (through a
  wall, under the floor, metres away) comes back, and it drops in front of the
  player, where it is easy to find.
- **A game never stalls.** The piece in play (a ball, a puck, a shuttle) that has
  not moved for 2 seconds while it should — pinned between a paddle and a wall,
  wedged in a corner, resting where nobody can reach — is served again from the
  centre or the server's side. That is play going on, not a reset. Keep a
  computer opponent off the walls by more than its own radius, so it cannot pin
  the piece there.
- **The player is seated and never has to get up.** Whatever they must take can
  be taken with the ray from anywhere, the floor included. What they use first
  starts in front of them, in view.
- **What is played or touched with the hands is within reach of the seated
  player** — piano keys, drums, a xylophone, pads, buttons to hit: its near
  edge about 0.3 m from the eyes, the surface the hands play 0.35–0.45 m below
  the eyes. For its centre: `inFrontOfPlayer(world, { distance: 0.3 + depth / 2,
  below: 0.4 })`, and put the playing surface (not the feet) at that height —
  a piano or a drum kit floats at the player's lap if it must. An arm's length
  is 0.55 m: farther than that is out of reach.
- **Every action is answered at once**: a sound and a visible reaction at the
  place where it happened.
- **Things belong to the real room.** Games, habitats and large objects stand on the floor or table, hang on a wall, or bounce off walls — the room is part of play, not a backdrop. (Exception: a small/table-sized `"thing"` for inspection floats via `inFrontOfPlayer` with no physics; the host lets the player carry and stretch it.)

## The engine holds about a thousand entities

Past that nothing new can be created. Make an entity only for a thing that needs
components of its own: a grab, physics, a ray target. Many alike things are instances
under ONE entity (THE FRAME BUDGET): `setMatrixAt`, then `instanceMatrix.needsUpdate = true`;
a ray hit gives `instanceId` (controls.md).
