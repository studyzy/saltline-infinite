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
  }

  reset() {
    this.buffer.length = 0;
    for (const a of this.avatars.values()) a.dispose();
    this.avatars.clear();
    this.lastSeen.clear();
  }

  push(snap) {
    if (!snap || typeof snap.tick !== "number") return;
    const last = this.buffer[this.buffer.length - 1];
    if (last && snap.tick <= last.tick) return;
    this.buffer.push(snap);
    if (this.buffer.length > 60) this.buffer.shift();
  }

  update() {
    if (!this.buffer.length) return;
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
      avatar.setState({ pos, yaw, pitch, crouch, state, hp: other.hp });
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

    // Drop snapshots far behind the view.
    while (this.buffer.length > 2 && this.buffer[0].tick < target - 30)
      this.buffer.shift();
  }
}