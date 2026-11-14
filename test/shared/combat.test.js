import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "../../shared/three.js";
import { resolveShot } from "../../server/combat.js";

const noWorld = { raycast: () => null };

test("a hound body is hit by a level ray", () => {
  const hit = resolveShot(
    noWorld,
    new Vector3(0, 0.8, 0),
    new Vector3(0, 0, -1),
    50,
    {
      players: [],
      enemies: [{ id: 7, type: "hound", pos: [0, 0, -5], alive: true }],
    },
  );
  assert.equal(hit.kind, "enemy");
  assert.equal(hit.id, 7);
  assert.equal(hit.part, "body");
});

test("the hound head is a weak point", () => {
  const hit = resolveShot(
    noWorld,
    new Vector3(0, 1.65, 0),
    new Vector3(0, 0, -1),
    50,
    {
      players: [],
      enemies: [{ id: 8, type: "hound", pos: [0, 0.5, -5], alive: true }],
    },
  );
  assert.equal(hit.kind, "enemy");
  assert.equal(hit.part, "weak");
});

test("a teammate blocks the shot and takes no damage", () => {
  const hit = resolveShot(
    noWorld,
    new Vector3(0, 1, 0),
    new Vector3(0, 0, -1),
    50,
    {
      players: [
        { id: 2, pos: [0, 0, -3], crouch: false, alive: true },
      ],
      enemies: [{ id: 7, type: "hound", pos: [0, 0, -5], alive: true }],
    },
  );
  assert.equal(hit.kind, "player");
  assert.equal(hit.id, 2);
});

test("a wall closer than an enemy wins", () => {
  const hit = resolveShot(
    { raycast: () => ({ dist: 2, point: new Vector3(0, 1, -2), normal: new Vector3(0, 0, 1), surface: "metal" }) },
    new Vector3(0, 1, 0),
    new Vector3(0, 0, -1),
    50,
    {
      players: [],
      enemies: [{ id: 7, type: "hound", pos: [0, 0, -5], alive: true }],
    },
  );
  assert.equal(hit.kind, "world");
  assert.equal(hit.surface, "metal");
});

test("no hit returns a point at max range", () => {
  const hit = resolveShot(
    noWorld,
    new Vector3(0, 1, 0),
    new Vector3(0, 0, -1),
    30,
    { players: [], enemies: [] },
  );
  assert.equal(hit.kind, "none");
  assert.equal(hit.point.z, -30);
});