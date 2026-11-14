import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "../../shared/three.js";
import { createPhysics } from "../../shared/physics.js";
import { createPlayerState, step, canStand } from "../../shared/player.js";
import { MOVE } from "../../shared/constants.js";

function flatWorld() {
  const game = { level: { groundSurfaceAt: () => "concrete" } };
  const p = createPhysics(game, () => 0.5);
  p.addBox([-50, 0, -50], [50, 0.1, 50]);
  p.build();
  return p;
}

function walk(state, cmd, seconds, physics) {
  const dt = 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) step(state, cmd, dt, physics);
}

test("walking reaches the configured speed", () => {
  const p = flatWorld();
  const s = createPlayerState({ pos: new Vector3(0, 0.1, 0) });
  walk(s, { mx: 0, my: 1, yaw: 0 }, 2, p);
  assert.ok(Math.abs(s.pos.z) > 3.5, `z=${s.pos.z}`);
  assert.ok(Math.abs(s.speed - MOVE.walk) < 0.05, `speed=${s.speed}`);
});

test("jump leaves the ground and returns", () => {
  const p = flatWorld();
  const s = createPlayerState({ pos: new Vector3(0, 0.1, 0) });
  step(s, { mx: 0, my: 0, yaw: 0, jumpPressed: true }, 1 / 60, p);
  walk(s, { mx: 0, my: 0, yaw: 0 }, 0.15, p);
  assert.ok(s.pos.y > 0.5, `y=${s.pos.y}`);
  assert.equal(s.onGround, false);
  walk(s, { mx: 0, my: 0, yaw: 0 }, 2, p);
  assert.ok(s.onGround);
});

test("crouch keeps the player under a low ceiling", () => {
  const p = flatWorld();
  p.addBox([-1, 1.2, -1], [1, 2.2, 1], { noNav: true });
  p.build();
  const s = createPlayerState({ pos: new Vector3(0, 0.1, 0) });
  assert.equal(canStand(p, s), false);
  s.crouching = true;
  assert.equal(s.crouching, true);
});

test("falling into the sea resets to the last safe point", () => {
  const game = { level: { groundSurfaceAt: () => "concrete" } };
  const p = createPhysics(game, () => 0.5);
  p.addBox([-50, 0, -50], [30, 0.1, 50]);
  p.build();
  const s = createPlayerState({ pos: new Vector3(36, 0.1, 0) });
  s.lastSafe.set(36, 0.1, 0);
  let rescued = false;
  for (let i = 0; i < 300; i++) {
    const events = step(s, { mx: 0, my: 0, yaw: 0 }, 1 / 60, p);
    if (events.some((e) => e.kind === "seaRescue")) rescued = true;
  }
  assert.equal(rescued, true);
  assert.equal(s.pos.x, 36);
});

test("absolute yaw and pitch are applied and clamped", () => {
  const p = flatWorld();
  const s = createPlayerState({ pos: new Vector3(0, 0.1, 0) });
  step(s, { mx: 0, my: 0, yaw: 1.2, pitch: 99 }, 1 / 60, p);
  assert.equal(s.yaw, 1.2);
  assert.ok(s.pitch <= MOVE.pitchLimit);
  assert.equal(s.forward.length() > 0.99, true);
});