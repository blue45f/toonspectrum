# Virtual Studio world authoring

The live Virtual Studio uses a hybrid architecture:

- **React** owns the product shell, project navigation, Huddle, chat, members, status and feature entry points.
- **Phaser 3** owns the central game world, Arcade Physics, camera, input, player/peer rendering, interactions, portals and NPC movement.
- **Tiled JSON / WorldManifest** owns room geometry and game content so the world can evolve without rewriting the Phaser scene.
- **P2P presence** stays independent from the renderer. Phaser publishes position/facing/room/movement at a throttled cadence and remote peers are interpolated in the engine.

## Source files

- Default editable world: `apps/web/public/assets/virtual-studio/world/default-world.json`
- Default manifest: `apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-manifest.ts`
- Tiled adapter: `studio-virtual-space-tiled-adapter.ts`
- Runtime loader: `studio-virtual-space-world-loader.ts`
- Pathfinding: `studio-virtual-space-world-pathfinding.ts`
- Phaser runtime: `StudioVirtualSpacePhaserCanvas.tsx`
- Character registry: `studio-virtual-space-character-skins.ts`

Regenerate the checked-in default Tiled world after changing the TypeScript default manifest:

```bash
pnpm run studio:virtual-space-world:generate
```

The browser loads the Tiled JSON first. Invalid or unavailable world data safely falls back to the TypeScript default manifest.

## Tiled layers

Use object layers with these exact names.

### `rooms`

Rectangles describing logical rooms.

Properties:

- `roomId`: stable lowercase id, e.g. `meeting-room`
- `labelKo`, `labelEn`
- `descriptionKo`, `descriptionEn`
- `action`: optional default room action: `story | comic | canvas | review | assets | assistant | live | community`

Room ids are data-driven and are carried over P2P; adding a new room id does not require a wire-protocol change.

### `colliders`

Rectangles used by Arcade Physics and A* pathfinding. Move or resize these when walls/furniture move. Doorways are simply gaps between collider rectangles.

### `props`

Decorative or interactive objects.

Properties:

- `kind`: `decor | solid | interactive | portal`
- `assetKey`: unique Phaser texture key
- `assetUrl`: optional PNG/WebP URL. If omitted, the object may still provide collision/interaction over the baked master art.
- `scale`, `rotation`, `alpha`
- `originX`, `originY`
- `depth`: `fixed | y-sort | foreground`
- `fixedDepth`: used with `fixed`
- `collider`: false disables collider derivation from the object's rectangle
- `action`, `interactionRadius`
- `labelKo`, `labelEn`

To add a new chair, plant or monitor, add a prop object. A new React component is not needed.

### `interactions`

Explicit interaction points. They may coexist with interactions derived from props.

Properties:

- `roomId`
- `radius`
- `labelKo`, `labelEn`
- `action`

When the player is outside the radius, clicking the marker pathfinds toward it. Inside the radius, clicking it or pressing **E / gamepad A** activates it.

### `portals`

Properties:

- `radius`
- `targetRoomId`
- `targetX`, `targetY` for explicit local teleport target
- `href` for a route-changing portal

If only `targetRoomId` is set, the matching spawn is used.

### `spawns`

Point objects. The object name is the spawn id.

Property:

- `facing`: `up | down | left | right`

A portal can target a spawn whose id matches its `targetRoomId`.

### `npcs`

Point objects for local ambient creators.

Properties:

- `skinKey`
- `roomId`
- `facing`
- `scale`
- `speed`
- `behavior`: `idle | talk | draw | review | patrol`
- `patrol`: semicolon-separated coordinates, e.g. `230,250;300,250;300,280`

Patrol NPCs use the same manifest-aware A* pathfinder as click-to-move.

## Background and room redesigns

The master room illustration is selected through the map properties:

- `backgroundUrl`
- `backgroundAssetKey`

For a major room-layout redesign, export a new background at the same intended world aspect ratio, update these properties, then move the room/collider/interaction objects in Tiled to match it.

For smaller changes, keep the master background and add transparent prop assets with `assetUrl`. Use `foreground` depth when a sprite must visually pass behind an object.

## Character expansion

Add a skin to `STUDIO_CHARACTER_SKINS`. Each skin supports:

- four static directional images
- optional `talk / draw / review` state images
- optional directional walk atlas clips

Static directional art remains a supported fallback. When a valid walk atlas clip is supplied, Phaser uses the real animation automatically instead of the procedural walk bob.

The P2P packet supports up to 256 avatar indexes, so adding skins does not require changing the network protocol.

## Runtime behavior

- Arcade Physics: fixed 60 Hz step
- acceleration/deceleration instead of instant velocity snapping
- normalized diagonal input
- WASD/arrows, Shift sprint, mouse/touch click-to-move
- gamepad left stick/D-pad, L3 sprint, A/Cross interact
- mobile joystick via the React-to-Phaser bridge
- camera follow with lerp and deadzone
- y-based depth sorting
- P2P state publish at roughly 12.5 Hz
- remote peer interpolation at render rate
- local/offline movement continues without the application server
