// Client-side prediction and reconciliation for the local player.
//
// The server acknowledges an input sequence; everything after it is replayed
// with the shared movement step. Aim is client-authoritative (the server uses
// the reported angles for hitscan), so yaw/pitch are never overwritten here.

import { inputCommand } from "../../shared/protocol.js";
import { step } from "../../shared/player.js";

export class Prediction {
  constructor(game) {
    this.game = game;
    this.queue = [];
  }

  reset() {
    this.queue.length = 0;
  }

  record(input) {
    this.queue.push(input);
    if (this.queue.length > 240) this.queue.shift();
  }

  onSnapshot(self) {
    const player = this.game.player;
    if (!player || !self) return;
    const ack = self.ack || 0;
    while (this.queue.length && this.queue[0].seq <= ack) this.queue.shift();

    if (typeof self.hp === "number") player.health = self.hp;
    if (typeof self.med === "number") player.medkits = self.med;
    if (typeof self.state === "string") player.alive = self.state !== "dead";
    if (typeof self.downT === "number") player.downT = self.downT;

    const dx = player.pos.x - self.pos[0];
    const dy = player.pos.y - self.pos[1];
    const dz = player.pos.z - self.pos[2];
    const error = Math.hypot(dx, dy, dz);
    if (error < 0.08) return;

    // Rebase onto the authoritative state, then replay the unacknowledged
    // inputs. Reset the transient movement state that snapshots do not carry.
    player.pos.set(self.pos[0], self.pos[1], self.pos[2]);
    player.vel.set(self.vel[0], self.vel[1], self.vel[2]);
    player.onGround = !!self.onGround;
    player.crouching = !!self.crouch;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.airTime = 0;
    player.fallSpeed = 0;
    for (const input of this.queue)
      step(player, inputCommand(input, false), input.dt, this.game.physics);
    player.speed = Math.hypot(player.vel.x, player.vel.z);
  }
}