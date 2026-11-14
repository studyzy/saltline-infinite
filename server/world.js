// One authoritative room world: the fixed port plus the collider-only city
// around the players' spawn. No renderer, no materials with textures.

import { Scene, MeshBasicMaterial, Color } from "../shared/three.js";
import { createPhysics } from "../shared/physics.js";
import { loadPort } from "../shared/world/port.js";
import { hashBoxes, cityManifest } from "../shared/hash.js";
import { createCity } from "../js/city.js";

const port = loadPort();

function stubMats() {
  const base = new MeshBasicMaterial({ color: new Color(0.5, 0.5, 0.5) });
  return {
    get: () => base.clone(),
    emissive: () => base.clone(),
    decal: () => ({ material: base.clone(), aspect: 3 }),
    label: () => ({ material: base.clone(), aspect: 3 }),
    names: () => [],
  };
}

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