// World fingerprints computed from the client's live level and city.
// The server compares these in the `ready` handshake; a mismatch means the two
// sides generated different collision, and the match must not start.

import { hashBoxes, hashManifest, cityManifest, manifestFromLevel } from "../../shared/hash.js";

export function computeWorldHashes(game) {
  // The client city is built on a frame budget. Force the near ring to finish
  // before hashing, so the hash covers the same block set the server built.
  try {
    if (game.city && game.city.flushNear) game.city.flushNear();
  } catch {}
  const spawn =
    (game.level && game.level.playerStart && game.level.playerStart.pos) ||
    game.player.pos;
  const boxes = game.physics.boxes;
  // The fixed port level is the authoritative static world. Backdrop cranes
  // and ships are scenery outside the playable quay and are not part of the
  // server manifest.
  const portBoxes = boxes.filter((b) => b.tag !== "city" && b.tag !== "backdrop");
  const portHash = hashManifest(manifestFromLevel(game.level, portBoxes));
  const cityHash = hashBoxes(cityManifest(boxes, spawn, 40, 1).boxes);
  return { portHash, cityHash };
}