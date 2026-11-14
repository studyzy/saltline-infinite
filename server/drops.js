// City supply drops. The city-life module generates these on the client in
// single-player; in co-op the server owns the rolls and pickup, and the client
// only draws what is in the snapshot.

import { createRng } from "../js/game.js";
import { CITY_LIFE } from "../shared/constants.js";

export class DropDirector {
  constructor(room) {
    this.room = room;
    this.rng = createRng((room.seed || 4207) + 53);
    this.drops = [];
    this.magT = CITY_LIFE.magEvery;
    this.medT = CITY_LIFE.medEvery;
    this.nextId = 1;
  }

  reset() {
    this.drops.length = 0;
    this.magT = CITY_LIFE.magEvery;
    this.medT = CITY_LIFE.medEvery;
  }

  update(dt) {
    this.magT -= dt;
    this.medT -= dt;
    if (this.magT <= 0) {
      this.magT = CITY_LIFE.magEvery;
      if (this.count("mag") < CITY_LIFE.magMax) this.spawn("mag");
    }
    if (this.medT <= 0) {
      this.medT = CITY_LIFE.medEvery;
      if (this.count("med") < CITY_LIFE.medMax) this.spawn("med");
    }
    this.pickups();
  }

  count(kind) {
    let n = 0;
    for (const d of this.drops) if (d.kind === kind) n++;
    return n;
  }

  spawn(kind) {
    const players = this.room.players.filter(
      (p) => p.connected && p.state.alive && !p.downed,
    );
    const outside = players.filter((p) => p.state.pos.x < -40);
    if (!outside.length) return null;
    const anchor = outside[Math.floor(this.rng() * outside.length)].state.pos;
    let pos = null;
    for (let i = 0; i < 8; i++) {
      try {
        pos = this.room.world.city.spawnPoint(anchor, 0, this.rng());
      } catch {
        pos = null;
      }
      if (pos && pos.x < -42) break;
      pos = null;
    }
    if (!pos) return null;
    pos.y = this.room.world.physics.groundHeight(pos.x, pos.z, pos.y + 2) + 0.18;
    const drop = { id: this.nextId++, kind, pos };
    this.drops.push(drop);
    this.room.event("drop", {
      id: drop.id,
      kind,
      pos: [pos.x, pos.y, pos.z],
    });
    return drop;
  }

  pickups() {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      for (const p of this.room.players) {
        if (!p.connected || !p.state.alive || p.downed) continue;
        const r = d.kind === "med" ? CITY_LIFE.medTake : CITY_LIFE.magTake;
        if (
          Math.hypot(p.state.pos.x - d.pos.x, p.state.pos.z - d.pos.z) > r ||
          Math.abs(p.state.pos.y - d.pos.y) > 2
        )
          continue;
        if (d.kind === "mag")
          p.reserve = Math.min(300, p.reserve + CITY_LIFE.magRounds);
        else p.medkits = Math.min(CITY_LIFE.medMax, (p.medkits || 0) + 1);
        this.drops.splice(i, 1);
        this.room.event("dropTaken", {
          id: d.id,
          kind: d.kind,
          playerId: p.id,
        });
        break;
      }
    }
  }

  snapshot(player) {
    const pos = player.state.pos;
    return this.drops
      .filter(
        (d) =>
          Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z) <= CITY_LIFE.lootKeep,
      )
      .map((d) => ({
        id: d.id,
        kind: d.kind,
        pos: [d.pos.x, d.pos.y, d.pos.z],
      }));
  }
}