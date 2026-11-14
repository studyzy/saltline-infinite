import test from "node:test";
import assert from "node:assert/strict";
import { hashBoxes, hashManifest, cityManifest } from "../../shared/hash.js";
import { Vector3 } from "../../shared/three.js";

function box(min, max, tag = "") {
  return {
    min: new Vector3(min[0], min[1], min[2]),
    max: new Vector3(max[0], max[1], max[2]),
    surface: "concrete",
    tag,
    noNav: false,
    bulletOnly: false,
    playerOnly: false,
  };
}

test("box order does not change the hash", () => {
  const a = [box([0, 0, 0], [1, 1, 1]), box([2, 0, 0], [3, 1, 1])];
  const b = [a[1], a[0]];
  assert.equal(hashBoxes(a), hashBoxes(b));
});

test("a moved box changes the hash", () => {
  const a = [box([0, 0, 0], [1, 1, 1])];
  const b = [box([0.01, 0, 0], [1, 1, 1])];
  assert.notEqual(hashBoxes(a), hashBoxes(b));
});

test("manifest hash covers anchors, not just colliders", () => {
  const boxes = [box([0, 0, 0], [1, 1, 1])];
  const base = {
    boxes,
    playerStart: { pos: [0, 0, 0], yaw: 0 },
    objectives: [{ id: "relay_a", pos: [1, 0, 1], radius: 0 }],
    extraction: { pos: [5, 0, 5], radius: 2.5 },
    enemySpawns: [{ type: "gull", pos: [3, 5, 3] }],
    coverPoints: [[1, 0, 2]],
  };
  const moved = {
    ...base,
    objectives: [{ id: "relay_a", pos: [2, 0, 1], radius: 0 }],
  };
  assert.equal(hashManifest(base), hashManifest({ ...base }));
  assert.notEqual(hashManifest(base), hashManifest(moved));
});

test("city manifest takes the 3x3 blocks around the spawn cell", () => {
  const boxes = [
    box([0, 0, 0], [1, 1, 1], "city"),
    box([40, 0, 0], [41, 1, 1], "city"),
    box([120, 0, 0], [121, 1, 1], "city"),
    box([5, 0, 5], [6, 1, 6], "level"),
  ];
  const m = cityManifest(boxes, new Vector3(0, 0, 0), 40, 1);
  assert.equal(m.boxes.length, 2);
  assert.equal(m.boxes.every((b) => b.tag === "city"), true);
});