import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../../server/room.js";
import { BTN } from "../../shared/protocol.js";
import { MATCH } from "../../shared/constants.js";

function makeRoom() {
  const downed = {
    id: 1,
    connected: true,
    downed: true,
    downT: MATCH.bleedoutSeconds,
    reviveT: 0,
    lastBtn: 0,
    lastFireAt: -999,
    state: {
      alive: true,
      enabled: false,
      health: 0,
      speed: 0,
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
    },
  };
  const rescuer = {
    id: 2,
    connected: true,
    downed: false,
    lastBtn: BTN.INTERACT,
    lastFireAt: -999,
    state: {
      alive: true,
      enabled: true,
      health: 100,
      speed: 0,
      pos: { x: 0, y: 0, z: 1 },
      vel: { x: 0, y: 0, z: 0 },
    },
  };
  return {
    players: [downed, rescuer],
    time: 10,
    started: true,
    state: "playing",
    event() {},
    finish() {},
  };
}

test("holding interact revives a downed teammate at 40 hp", () => {
  const room = makeRoom();
  Room.prototype.updateDowned.call(room, MATCH.reviveSeconds + 0.1);
  assert.equal(room.players[0].downed, false);
  assert.equal(room.players[0].state.health, MATCH.reviveHealth);
  assert.equal(room.players[0].state.alive, true);
});

test("a moving rescuer interrupts the revive", () => {
  const room = makeRoom();
  room.players[1].state.speed = 3;
  Room.prototype.updateDowned.call(room, 1);
  assert.equal(room.players[0].downed, true);
  assert.ok(room.players[0].reviveT < 0.01);
});

test("bleedout kills the player", () => {
  const room = makeRoom();
  room.players[1].lastBtn = 0;
  Room.prototype.updateDowned.call(room, MATCH.bleedoutSeconds + 1);
  assert.equal(room.players[0].downed, false);
  assert.equal(room.players[0].state.alive, false);
});