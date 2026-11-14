// World fingerprints computed from the client's live level and city.
// The server compares these in the `ready` handshake; a mismatch means the two
// sides generated different collision, and the match must not start.

import { hashBoxes, hashManifest, cityManifest, manifestFromLevel } from "../../shared/hash.js";

export function computeWorldHashes(game) {
  const spawn =
    (game.level && game.level.playerStart && game.level.playerStart.pos) ||
    game.player.pos;
  const boxes = game.physics.boxes;
  const portBoxes = boxes.filter((b) => b.tag !== "city");
  const portHash = hashManifest(manifestFromLevel(game.level, portBoxes));
  const cityHash = hashBoxes(cityManifest(boxes, spawn, 40, 1).boxes);
  return { portHash, cityHash };
}