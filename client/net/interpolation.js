// Snapshot interpolation for the teammate and, later, enemies and drops.
// Snapshots are ordered by simulation tick; the view runs a fixed three-tick
// (100 ms at 30 Hz) delay behind the newest snapshot.

import { Avatar } from "./avatar.js";

const DELAY_TICKS = 3;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Interpolator {
  constructor(game) {
    this.game = game;
    this.buffer = [];
    this.avatars = new Map();
    this.lastSeen = new Map();
    this.enemySeen = new Map();
  }

  reset() {
    this.buffer.length = 0;
    for (const a of this.avatars.values()) a.dispose();
    this.avatars.clear();
    this.lastSeen.clear();
    this.enemySeen.clear();
  }

  push(snap) {
    if (!snap || typeof snap.tick !== "number") return;
    const last = this.buffer[this.buffer.length - 1];
    if (last && snap.tick <= last.tick) return;
    this.buffer.push(snap);
    if (this.buffer.length > 60) this.buffer.shift();
  }

  update(dt = 1 / 60) {
    if (!this.buffer.length) return;
    const step = Math.max(1 / 240, Math.min(0.1, dt));
    const newest = this.buffer[this.buffer.length - 1];
    const target = newest.tick - DELAY_TICKS;

    let before = null;
    let after = null;
    for (const snap of this.buffer) {
      if (snap.tick <= target) before = snap;
      if (snap.tick >= target && !after) after = snap;
    }
    if (!before) before = after || this.buffer[0];
    if (!after) after = before;
    const span = after.tick - before.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (target - before.tick) / span)) : 0;

    const seen = new Set();
    for (const other of after.players || []) {
      const prev =
        (before.players || []).find((p) => p.id === other.id) || other;
      const pos = [
        lerp(prev.pos[0], other.pos[0], t),
        lerp(prev.pos[1], other.pos[1], t),
        lerp(prev.pos[2], other.pos[2], t),
      ];
      const yaw = lerpAngle(prev.yaw, other.yaw, t);
      const pitch = lerp(prev.pitch, other.pitch, t);
      const crouch = t < 0.5 ? prev.crouch : other.crouch;
      const state = t < 0.5 ? prev.state : other.state;

      let avatar = this.avatars.get(other.id);
      if (!avatar) {
        avatar = new Avatar(this.game);
        this.avatars.set(other.id, avatar);
      }
      avatar.setState({
        pos,
        yaw,
        pitch,
        crouch,
        state,
        hp: other.hp,
        dt: step,
      });
      seen.add(other.id);
      this.lastSeen.set(other.id, newest.tick);
    }

    for (const [id, avatar] of this.avatars) {
      if (seen.has(id)) continue;
      const last = this.lastSeen.get(id) || 0;
      if (newest.tick - last > 90) {
        avatar.dispose();
        this.avatars.delete(id);
        this.lastSeen.delete(id);
      }
    }

    this.applyEnemies(before, after, t, newest.tick);
    if (
      this.game.game &&
      this.game.game.applyServerRelays &&
      after.relays
    )
      this.game.game.applyServerRelays(after.relays);
    if (
      this.game.game &&
      this.game.game.applyServerMatch &&
      after.match
    )
      this.game.game.applyServerMatch(after.match);

    // Drop snapshots far behind the view.
    while (this.buffer.length > 2 && this.buffer[0].tick < target - 30)
      this.buffer.shift();
  }

  applyEnemies(before, after, t, tick) {
    const em = this.game.enemies;
    if (!em || !em.applyRemote) return;
    const seen = new Set();
    for (const e of after.enemies || []) {
      const prev =
        (before.enemies || []).find((x) => x.id === e.id) || e;
      const pos = [
        lerp(prev.pos[0], e.pos[0], t),
        lerp(prev.pos[1], e.pos[1], t),
        lerp(prev.pos[2], e.pos[2], t),
      ];
      em.applyRemote(e.id, {
        type: e.type,
        pos,
        yaw: lerpAngle(prev.yaw, e.yaw, t),
        mode: e.mode,
        hp: e.hp,
        speed: e.speed || 0,
      });
      seen.add(e.id);
      this.enemySeen.set(e.id, tick);
    }
    for (const [id, last] of this.enemySeen) {
      if (seen.has(id)) continue;
      if (tick - last > 90) {
        em.removeRemote(id);
        this.enemySeen.delete(id);
      }
    }
  }
}