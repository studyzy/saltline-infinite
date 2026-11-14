// Headless check that the enemy module can run on the server.
import { Scene, MeshBasicMaterial, Color, Vector3 } from "../../shared/three.js";
import { createPhysics } from "../../shared/physics.js";
import { loadPort } from "../../shared/world/port.js";
import { createEnemies, createRng } from "../../js/game.js";

const port = loadPort();
const base = new MeshBasicMaterial({ color: new Color(0.5, 0.5, 0.5) });
const mats = {
  get: () => base.clone(),
  emissive: () => base.clone(),
  decal: () => ({ material: base.clone(), aspect: 3 }),
  label: () => ({ material: base.clone(), aspect: 3 }),
  names: () => [],
};
const fx = new Proxy({}, { get: () => () => {} });
const events = { on() {}, emit() {} };
const playerState = {
  pos: new Vector3(-32, 0, 6),
  eye: new Vector3(-60, 1.68, 12),
  vel: new Vector3(),
  alive: true,
  crouching: false,
  damage() {},
};
const player = {
  get pos() {
    return playerState.pos;
  },
  get eye() {
    return playerState.eye;
  },
  get vel() {
    return playerState.vel;
  },
  get alive() {
    return playerState.alive;
  },
  get crouching() {
    return playerState.crouching;
  },
  damage() {},
};
const game = {
  scene: new Scene(),
  mats,
  fx,
  events,
  physics: createPhysics({ level: port.level }),
  level: port.level,
  rng: createRng(4207),
  player,
  players: [player],
  render: null,
  camera: null,
};
for (const b of port.boxes)
  game.physics.addBox(b.min, b.max, {
    surface: b.surface,
    tag: b.tag,
    noNav: b.noNav,
    bulletOnly: b.bulletOnly,
    playerOnly: b.playerOnly,
  });
game.physics.build();

const enemies = await createEnemies(game);
const gull = enemies.spawn("gull", new Vector3(-60, 6, 6), { state: "alert" });
const hound = enemies.spawn("hound", new Vector3(-60, 0, 6), { state: "alert" });
console.log("spawned", gull && gull.id, hound && hound.id, "list", enemies.list.length);
for (let i = 0; i < 120; i++) enemies.update(1 / 30);
console.log(
  "after 4s",
  enemies.list.map((e) => ({
    id: e.id,
    type: e.type,
    mode: e.mode,
    hp: e.hp,
    pos: e.pos.toArray().map((n) => +n.toFixed(2)),
  })),
);
const hit = enemies.raycast(
  new Vector3(-60, 1.68, 12),
  new Vector3(1, 0, 0),
  100,
);
console.log("raycast", hit && { id: hit.enemy.id, part: hit.part, dist: hit.dist });