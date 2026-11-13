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

## Run it

```sh
python3 -m http.server 8731
```

Then open http://localhost:8731 and click the page to capture the mouse and start the sound.

Files:

- `index.html` — markup shell (~1 KB)
- `css/game.css` — all styles (~30 KB)
- `js/game.js` — game code as an ES module, with a minified-name → three.js alias table (~1.2 MB)
- `js/vendor/three.module.js`, `js/vendor/three.core.js` — official three.js r180 build (unminified)
- `js/vendor/THREE-LICENSE.txt` — three.js MIT licence

Fonts load from Google Fonts. There are no other outside assets.
