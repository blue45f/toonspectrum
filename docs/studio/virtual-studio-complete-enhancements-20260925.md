# Virtual Studio complete enhancements — 2026-09-25

## Goal

Close the remaining usability, accessibility, presentation and runtime gaps without weakening explicit consent, route accessibility, content authority or the allowlisted interaction registry.

## Delivered experience layers

| Area | Delivery |
|---|---|
| Mobile controls | Fixed joystick, floating joystick, tap-to-move, handedness selection and mobile-safe touch layout |
| Camera | Follow, steady and cinematic framing with reduced-motion override |
| Quality | Auto, ultra, high, balanced, battery and accessibility tiers with sustained-frame hysteresis |
| Nameplates | Distance LOD, duplicate-name disambiguation and overlap displacement |
| NPC dialogue | High contrast, text scale, visit-only history, copy and explicit read-aloud action |
| Entry | Last position, Lobby or My Desk start policy |
| Effects | Low, balanced or high environment intensity with quality-aware particles, weather, lights and ambient actors |
| Observability | Local-only FPS, frame time, visible actor, route and failed-texture health metrics |
| Accessible navigation | Existing room/people directory and direct routes retained as equivalents to spatial movement |
| Content loops | Quests, seasonal programs, mini-games, Spotlight events, deterministic personal desk pods and production sessions retained and verified |
| Interaction flow | Shared nearby → choose → authority → confirm → run → complete/fail state machine for people, NPCs, objects and routes |
| Photo mode | Explicit local PNG capture of the rendered world canvas; no camera permission or remote upload |
| Cosmetic rewards | Twelve allowlisted quest/activity rewards mapped only to built-in character cosmetics, without paid currency or chance |
| Art | Six independent art directions and the existing generated-art integrity gates retained |

## Safety decisions

The following requests are intentionally delivered through safe equivalents rather than unsafe automation:

- Microphone and camera remain opt-in at the moment a user explicitly selects a media action.
- Existing direct routes remain available for accessibility and power users; the spatial world is not mandatory.
- User-authored executable scripts are not admitted. Interactions run only through the typed, allowlisted action registry.
- Rewards remain cosmetic and production-oriented. The bounded local inventory contains only twelve allowlisted IDs; no paid currency, loot box, random draw or gambling-style economy is introduced.
- NPCs may explain and navigate, but invitations, approvals, publishing, permissions and release actions remain explicit human confirmations.

## Acceptance gates

- No persistent mobile control smaller than 44 × 44 CSS pixels.
- Tap-to-move suppresses the joystick and does not auto-run an interaction.
- Reduced-motion selects the accessibility tier under Auto and disables environment motion.
- Nameplates hide beyond the bounded interest range and duplicates are distinguishable in lists/nearby labels.
- Dialogue history is memory-only and disappears on refresh.
- Photo mode captures only the existing rendered canvas after an explicit click; it never opens camera or screen-capture permission.
- Proximity alone never runs an action. Authority/collaborative actions pass through explicit confirmation states.
- Personal desk assignment is deterministic and role-aware without exposing document content.
- Runtime metrics contain no nickname, chat, document or audio content.
- Art style, NPC, semantic graph, event, blueprint and desk-pod inventory remain covered by deterministic tests.
- No entry-path `getUserMedia`, `eval`, or `new Function` execution.
