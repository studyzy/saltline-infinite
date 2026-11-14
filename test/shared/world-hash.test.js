import test from "node:test";
import assert from "node:assert/strict";
import { Scene, MeshBasicMaterial, Color } from "../../shared/three.js";
import { createPhysics } from "../../shared/physics.js";
import { loadPort } from "../../shared/world/port.js";
import { createCity } from "../../js/city.js";
import { computeWorldHashes } from "../../client/net/world-hash.js";

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

test("client manifest reproduces the exported port hash", () => {
  const port = loadPort();
  const game = {
    scene: new Scene(),
    mats: stubMats(),
    render: null,
    level: port.level,
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
  city.update(0, port.level.playerStart.pos);
  city.flush();

  const hashes = computeWorldHashes(game);
  assert.equal(hashes.portHash, port.hash);
  assert.match(hashes.cityHash, /^[0-9a-f]{8}$/);
});