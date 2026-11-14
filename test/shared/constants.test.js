import test from "node:test";
import assert from "node:assert/strict";
import { VIEW, MOVE, MATCH, WEAPON, CITY_LIFE, PHYSICS } from "../../shared/constants.js";

test("key tuning values match the single-player game", () => {
  assert.equal(VIEW.eye, 1.68);
  assert.equal(VIEW.radius, 0.32);
  assert.equal(MOVE.walk, 3.8);
  assert.equal(MOVE.sprint, 6.4);
  assert.equal(MOVE.standHeight, VIEW.height);
  assert.equal(WEAPON.magSize, 30);
  assert.equal(WEAPON.rpm, 720);
  assert.equal(WEAPON.damage, 26);
  assert.equal(MATCH.interactRange, 2.2);
  assert.equal(MATCH.cutSeconds, 2.4);
  assert.equal(MATCH.maxAlive, 9);
  assert.equal(CITY_LIFE.aliveMax, 10);
  assert.equal(PHYSICS.nav.width, 902);
  assert.equal(PHYSICS.nav.height, 124);
});