# Systems inside a feature (IWSDK ECS)

Per-frame code is a system registered in the setup (`world.registerSystem(class extends createSystem({...}) {...})`);
it goes away with the file. What IWSDK will not tell you:

- React to a change with `this.queries.x.subscribe('qualify' | 'disqualify', …)`, and push what it returns into
  `this.cleanupFuncs`. A held thing is left alone with `excluded: [Grabbed]`.
- A vector field is read with `entity.getVectorView(Component, 'field')`; `setValue` throws on vector fields.
- The player: `this.player.head`, `raySpaces.left/right` (where each hand points), `gripSpaces.left/right`,
  `indexTipSpaces.left/right` — call `getWorldPosition(v)`. `world.camera.position` is local to the player.
- `world.createTransformEntity(object, parent?)`; remove with `entity.dispose()`. A `parent` moves the object to hang
  straight under that entity: a mesh inside a turned group loses the group's turn (a kick drum's skin, made an entity
  with the kit as parent, lay flat over the whole kit). A part inside a group: make the group the entity, or pass no
  parent — `onRayPress` and `onFingerTouch` work on any child.
- `Grabbed`, `Pressed`, `Hovered` are set by the host: read them only. Drop a held thing:
  `world.getSystem(GrabSystem)!.forceRelease(entity)`.
- Keep the game's state in variables of the setup; do not declare components.
