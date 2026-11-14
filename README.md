# Saltline — Fable 5.2 FPS

A small browser first-person shooter: one level in a rainy container port. Cut three uplink relays while drones ("Gulls") and robot dogs ("Hounds") hunt you.
<img width="1685" height="906" alt="image" src="https://github.com/user-attachments/assets/8dd32149-90f4-4d69-a573-4411a49a9ba9" />


## Demo
https://realcodebear.github.io/saltline-fable-5.2/

## Where it comes from

- Built by **Claude Fable 5.2**. The run was set up by Felix Rieseberg (Anthropic) and shared on X on 2026-11-09:
  https://x.com/felixrieseberg/status/2119925633564463609
- Original playable artifact: https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp
- Per his post: one prompt, no human feedback, about 8 hours, about 2.7M output and 445M input tokens (heavily cached), about $550 at API pricing. Models, sounds and textures are all made in code. These numbers are his own and not checked here.

All credit for the game goes to its original author. This repo is a mirror so people can run it locally. If you are the author and want it taken down, open an issue.

## What changed from the artifact

Nothing in the game code. The claude.ai frame-runtime scripts were removed from `<head>`, and a doctype, charset and viewport tag were added so the file runs as a plain web page.

The original single `index.html` was split into `index.html` (markup shell), `css/game.css` (styles) and `js/game.js` (the game code). The inlined three.js r180 build was removed from the bundle and replaced with the official `three@0.180.0` ES modules (`js/vendor/`). Game logic is unchanged; it now runs as an ES module and references the 89 three.js exports it actually uses (plus the namespace object) through a short alias table at the top of `js/game.js`.

## Infinite city & languages (this fork)

Two additions on top of the original level:

- **Bilingual UI** — English and Simplified Chinese, ~170 strings covering the start menu, settings, HUD, debrief, radio chatter, compass and touch controls. Language is picked from `?lang=zh|en`, then `localStorage`, then `navigator.language`, and can be switched live from Settings → Language without a reload. See `js/i18n.js`.
- **Endless city** — the perimeter fence now has an open gate on the west side (z 2..8). Past it the port gives way to a procedurally generated city that never ends: 40 m blocks laid out on a grid, each one derived deterministically from a hash of its coordinates, so leaving and coming back rebuilds the same streets. Blocks are built in a frame-budgeted queue, so crossing a cell boundary costs ~12 ms and never stalls the frame, and old blocks are disposed as you leave them. See `js/city.js`.

  Every block within reach is **solid**: buildings, container stacks, yard fences, dumpsters, drums, bollards and lamp masts all register real collision boxes. Two detail levels keep that affordable — the block you are standing in gets the full treatment (facades, windows, parapets, roof clutter, street props), and everything out to ±200 m gets solid massing with the same collision but no micro-detail. Past that the fog has already swallowed the city, so the flat silhouette layer is only ever seen at a distance. Nothing you can physically walk to is scenery.

The city plugs into the existing systems rather than working around them: buildings register real collision boxes tagged `city`, the nav grid reports off-grid cells through `city.blockedAt`, enemy spawns fall back to the city when no port spawn is in range, and the shadow caster widens to follow you once you are outside the fence.

## Run it

```sh
python3 -m http.server 8731
```

Then open http://localhost:8731 and click the page to capture the mouse and start the sound.

## Two-player co-op

The single-player page still runs from any static server. Co-op needs the Node
authority, which serves the same files and the WebSocket on one port:

```sh
npm install
npm start            # http://localhost:8731
```

Open the page in two browsers, click **Co-op**, and use the same room code (or
open `?room=ABCDE` directly). One player creates the room; the second joins it.

- The server owns players, enemies, hitscan, relays, extraction, downed/revive,
  supplies and the reconnect window (90 s).
- The city is generated locally on both sides from the same coordinates; the
  handshake compares collision hashes before the match starts.
- `?netlag=120` on one client adds a fixed send/receive delay for testing.
- `node --test test/shared/*.test.js test/integration/*.test.js` runs the
  shared and headless integration tests.

Files:

- `shared/` — simulation, protocol, constants and the exported port colliders
- `server/` — HTTP + WebSocket authority, rooms, enemies, combat and supplies
- `client/net/` — handshake, prediction, interpolation, avatars and co-op HUD

- `index.html` — markup shell (~1 KB)
- `css/game.css` — all styles (~30 KB)
- `js/game.js` — game code as an ES module, with a minified-name → three.js alias table (~1.2 MB)
- `js/vendor/three.module.js`, `js/vendor/three.core.js` — official three.js r180 build (unminified)
- `js/vendor/THREE-LICENSE.txt` — three.js MIT licence
- `js/i18n.js` — English / Simplified Chinese dictionaries and language switching
- `js/city.js` — seamless infinite city generator west of the port

Fonts load from Google Fonts. There are no other outside assets.
