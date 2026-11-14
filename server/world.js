// One authoritative room world: the fixed port plus the collider-only city
// around the players' spawn. No renderer, no materials with textures.

import { Scene } from "../shared/three.js";
import { createPhysics } from "../shared/physics.js";
import { loadPort } from "../shared/world/port.js";
import { hashBoxes, cityManifest } from "../shared/hash.js";
import { createCity } from "../js/city.js";
import { stubMats } from "./stub-mats.js";

const port = loadPort();

export function createRoomWorld() {
  const game = {
    scene: new Scene(),
    mats: stubMats(),
    render: null,
    level: port.level,
    params: {},
  };
  game.physics = createPhysics(game);
  for (const b of port.boxes)
    game.physics.addBox(b.min, b.max, {
      surface: b.surface,
      tag: b.tag,
      noNav: b.noNav,
      bulletOnly: b.bulletOnly,
      playerOnly: b.playerOnly,
    });
  game.physics.build();

  const city = createCity(game, { collideOnly: true });
  const spawn = port.level.playerStart.pos;
  city.update(0, spawn);
  city.flush();

  const cityHash = hashBoxes(cityManifest(game.physics.boxes, spawn, 40, 1).boxes);
  return {
    game,
    physics: game.physics,
    city,
    level: port.level,
    portHash: port.hash,
    cityHash,
  };
}

export { port };