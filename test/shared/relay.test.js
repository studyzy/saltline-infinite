import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../../server/room.js";
import { BTN } from "../../shared/protocol.js";
import { MATCH } from "../../shared/constants.js";

function fakeRoom(players) {
  return {
    relays: [
      {
        id: "relay_a",
        pos: { x: 0, y: 0, z: -1.5 },
        progress: 0,
        cut: false,
        short: "A",
      },
    ],
    players,
    cutCount: 0,
    allCut: false,
    extractT: 0,
    director: { onCut() {} },
    event() {},
    finish() {},
  };
}

function player(id, x = 0) {
  return {
    id,
    connected: true,
    downed: false,
    lastBtn: BTN.INTERACT,
    state: {
      alive: true,
      pos: { x, y: 0, z: 0 },
      forward: { x: 0, y: 0, z: -1 },
    },
  };
}

test("holding interact cuts a relay", () => {
  const room = fakeRoom([player(1)]);
  Room.prototype.updateRelays.call(room, MATCH.cutSeconds * 0.5);
  assert.ok(Math.abs(room.relays[0].progress - 0.5) < 1e-6);
  Room.prototype.updateRelays.call(room, MATCH.cutSeconds * 0.5);
  assert.equal(room.relays[0].cut, true);
  assert.equal(room.cutCount, 1);
});

test("two players cut twice as fast", () => {
  const room = fakeRoom([player(1, -0.5), player(2, 0.5)]);
  Room.prototype.updateRelays.call(room, MATCH.cutSeconds * 0.25);
  assert.ok(room.relays[0].progress > 0.45);
});

test("releasing interact decays progress", () => {
  const room = fakeRoom([player(1)]);
  Room.prototype.updateRelays.call(room, MATCH.cutSeconds * 0.5);
  const partial = room.relays[0].progress;
  room.players[0].lastBtn = 0;
  Room.prototype.updateRelays.call(room, 0.2);
  assert.ok(room.relays[0].progress < partial);
});

test("a player facing away cannot cut", () => {
  const room = fakeRoom([player(1)]);
  room.players[0].state.forward = { x: 0, y: 0, z: 1 };
  Room.prototype.updateRelays.call(room, MATCH.cutSeconds);
  assert.ok(room.relays[0].progress < 1);
});