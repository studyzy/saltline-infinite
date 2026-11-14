import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "../../shared/three.js";
import { createPhysics } from "../../shared/physics.js";

function world() {
  const game = {
    level: { groundSurfaceAt: () => "concrete" },
  };
  const p = createPhysics(game, () => 0.5);
  p.addBox([-20, 0, -20], [20, 0.1, 20], { surface: "concrete" });
  p.build();
  return p;
}

test("raycast hits a box face and reports its normal", () => {
  const p = world();
  p.addBox([4, 0, -1], [5, 2, 1], { surface: "metal" });
  p.build();
  const hit = p.raycast(new Vector3(0, 1, 0), new Vector3(1, 0, 0), 20);
  assert.ok(hit);
  assert.equal(hit.surface, "metal");
  assert.ok(Math.abs(hit.dist - 4) < 1e-6);
  assert.equal(hit.normal.x, -1);
  assert.equal(hit.normal.y, 0);
});

test("lineOfSight is blocked by a wall", () => {
  const p = world();
  p.addBox([2, 0, -2], [2.5, 3, 2]);
  p.build();
  const a = new Vector3(0, 1, 0);
  assert.equal(p.lineOfSight(a, new Vector3(4, 1, 0)), false);
  assert.equal(p.lineOfSight(a, new Vector3(0, 1, 4)), true);
});

test("capsule slides along a wall instead of stopping", () => {
  const p = world();
  p.addBox([2, 0, -4], [3, 4, 4]);
  p.build();
  const pos = new Vector3(0, 0.1, 0);
  const vel = new Vector3(4, 0, 0);
  p.moveCapsule(pos, vel, 1, 0.32, 1.8, true);
  assert.ok(pos.x <= 2 - 0.32 + 1e-4);
  assert.ok(vel.x <= 0);
});

test("capsule steps onto a low kerb", () => {
  const p = world();
  p.addBox([1, 0, -1], [2, 0.3, 1], { surface: "concrete" });
  p.build();
  const pos = new Vector3(0, 0.1, 0);
  const vel = new Vector3(2, 0, 0);
  for (let i = 0; i < 30; i++) {
    vel.y = 0;
    p.moveCapsule(pos, vel, 1 / 30, 0.32, 1.8, true);
  }
  assert.ok(pos.x > 1.1, `expected to climb, x=${pos.x}`);
  assert.ok(Math.abs(pos.y - 0.3) < 0.02, `y=${pos.y}`);
});

test("groundHeight picks the highest box below the limit", () => {
  const p = world();
  p.addBox([0, 0, 0], [2, 1, 2]);
  p.addBox([0, 0, 0], [2, 2, 2]);
  p.build();
  assert.equal(p.groundHeight(1, 1), 2);
  assert.equal(p.groundHeight(1, 1, 1.5), 1);
});

test("nav finds a path around a wall", () => {
  const p = world();
  p.addBox([1, 0, -3], [2, 3, 3]);
  p.build();
  const path = p.nav.findPath(new Vector3(0, 0, 0), new Vector3(4, 0, 0));
  assert.ok(path && path.length > 0);
  const last = path[path.length - 1];
  assert.ok(last.x > 2);
});

test("cityBlocked only consults city-tagged boxes", () => {
  const p = world();
  p.addBox([0, 0, 0], [1, 3, 1], { tag: "city" });
  p.addBox([5, 0, 0], [6, 3, 1], { tag: "level" });
  p.build();
  assert.equal(p.cityBlocked(0.5, 0.5), true);
  assert.equal(p.cityBlocked(5.5, 0.5), false);
});