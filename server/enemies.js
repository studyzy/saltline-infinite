// Server-side enemy simulation. It runs the original enemy module headlessly:
// the same perception, pathfinding and attack code, with stub materials and a
// per-enemy target facade instead of a single local player.

import { Scene, Vector3 } from "../shared/three.js";
import { createEnemies, createRng } from "../js/game.js";
import { stubMats, fxStub } from "./stub-mats.js";
import { MATCH } from "../shared/constants.js";

export function makeFacade(room, player) {
  return {
    get pos() {
      return player.state.pos;
    },
    get eye() {
      return player.state.eye;
    },
    get vel() {
      return player.state.vel;
    },
    get alive() {
      return player.state.alive && !player.downed;
    },
    get crouching() {
      return player.state.crouching;
    },
    get speed() {
      return player.state.speed;
    },
    damage(amount, from) {
      room.damagePlayer(player, amount, from);
    },
    addShake() {},
  };
}

export async function createEnemySim(room) {
  room.facades = room.players.map((p) => makeFacade(room, p));
  const game = {
    scene: new Scene(),
    mats: stubMats(),
    fx: fxStub,
    events: room.bus,
    physics: room.world.physics,
    level: room.world.level,
    rng: createRng((room.seed || 4207) + 7),
    player: room.facades[0] || null,
    players: room.facades,
    render: null,
    camera: null,
    params: {},
  };
  const enemies = await createEnemies(game);
  room.enemyGame = game;
  room.enemies = enemies;
  return { game, enemies };
}

export class Director {
  constructor(room) {
    this.room = room;
    this.rng = createRng((room.seed || 4207) + 31);
    this.pursuitT = 0;
    this.pursuitLeft = 0;
  }

  alive() {
    try {
      return this.room.enemies.aliveCount();
    } catch {
      return 0;
    }
  }

  start() {
    const patrol = MATCH.patrol;
    for (let i = 0; i < patrol.gull; i++) this.spawn("gull", "patrol");
    for (let i = 0; i < patrol.hound; i++) this.spawn("hound", "patrol");
  }

  onCut(n) {
    const wave = MATCH.waves[Math.min(n, MATCH.waves.length - 1)];
    for (let i = 0; i < wave.gull; i++) this.spawn("gull", "alert");
    for (let i = 0; i < wave.hound; i++) this.spawn("hound", "alert");
    this.pursuitT = 12;
    this.pursuitLeft = MATCH.pursuitExtra;
  }

  update(dt) {
    if (!this.room.allCut) return;
    this.pursuitT -= dt;
    if (
      this.pursuitT <= 0 &&
      this.pursuitLeft > 0 &&
      this.alive() < MATCH.pursuitMinAlive
    ) {
      this.spawn(this.rng() < 0.6 ? "gull" : "hound", "alert");
      this.pursuitLeft--;
      this.pursuitT = MATCH.pursuitEvery;
    }
  }

  spawn(type, state = "alert") {
    if (this.alive() >= MATCH.maxAlive) return null;
    const pos = this.spawnPoint(type);
    if (!pos) return null;
    try {
      return this.room.enemies.spawn(type, pos, { state });
    } catch (err) {
      console.error("[director] spawn failed", err);
      return null;
    }
  }

  spawnPoint(type) {
    const players = this.room.players.filter(
      (p) => p.connected && p.state.alive,
    );
    if (!players.length) return null;
    const anchor = players[Math.floor(this.rng() * players.length)].state.pos;
    const spawns = this.room.world.level.enemySpawns || [];
    if (spawns.length) {
      for (let i = 0; i < 16; i++) {
        const s = spawns[Math.floor(this.rng() * spawns.length)];
        const d = Math.hypot(s.pos.x - anchor.x, s.pos.z - anchor.z);
        if (d < 10 || d > 70) continue;
        const p = s.pos.clone();
        if (type === "gull") p.y = Math.max(p.y, 5.5 + this.rng() * 2.5);
        else p.y = this.room.world.physics.groundHeight(p.x, p.z, p.y + 2);
        return p;
      }
    }
    let p = null;
    try {
      p = this.room.world.city.spawnPoint(anchor, 0, this.rng());
    } catch {
      p = null;
    }
    if (!p) {
      const a = this.rng() * Math.PI * 2;
      const r = 20 + this.rng() * 12;
      p = new Vector3(anchor.x + Math.cos(a) * r, 0, anchor.z + Math.sin(a) * r);
    }
    if (type === "gull") p.y = 6 + this.rng() * 3;
    else p.y = this.room.world.physics.groundHeight(p.x, p.z, p.y + 2);
    return p;
  }
}