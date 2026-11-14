import test from "node:test";
import assert from "node:assert/strict";
import { Scene, MeshBasicMaterial, Color, Vector3 } from "../../shared/three.js";
import { createPhysics } from "../../shared/physics.js";
import { hashBoxes, cityManifest } from "../../shared/hash.js";
import { createCity } from "../../js/city.js";

function stubMats() {
  const base = new MeshBasicMaterial({ color: new Color(0.5, 0.5, 0.5) });
  return {
    get: () => base.clone(),
    emissive: () => base.clone(),
    decal: () => ({ material: base.clone(), aspect: 3 }),
    label: () => ({ material: base.clone(), aspect: 3 }),
    names: () => [],
  };
}

function makeCity() {
  const game = {
    scene: new Scene(),
    mats: stubMats(),
    render: null,
    level: { groundSurfaceAt: () => "concrete" },
  };
  game.physics = createPhysics(game, () => 0.5);
  const city = createCity(game, { collideOnly: true });
  return { game, city };
}

test("collide-only city is deterministic and registers city boxes", () => {
  const a = makeCity();
  const spawn = new Vector3(-60, 0, 6);
  a.city.update(0, spawn);
  a.city.flush();
  const boxesA = a.game.physics.boxes.filter((b) => b.tag === "city");
  assert.ok(boxesA.length > 0);

  const b = makeCity();
  b.city.update(0, spawn);
  b.city.flush();
  const boxesB = b.game.physics.boxes.filter((b) => b.tag === "city");

  assert.equal(hashBoxes(boxesA), hashBoxes(boxesB));
  const m = cityManifest(boxesA, spawn, 40, 1);
  assert.ok(m.boxes.length > 0);
  assert.equal(hashBoxes(m.boxes), hashBoxes(cityManifest(boxesB, spawn, 40, 1).boxes));
});

test("two distant focuses keep both neighbourhoods solid", () => {
  const { game, city } = makeCity();
  const a = new Vector3(-60, 0, 6);
  const b = new Vector3(-360, 0, 6);
  city.update(0, a);
  city.flush();
  const nearA = city.stats.cells;
  city.update(0, [a, b]);
  city.flush();
  assert.ok(city.stats.cells > nearA, `${city.stats.cells} vs ${nearA}`);
  assert.ok(
    game.physics.boxes.some(
      (box) => box.tag === "city" && Math.abs(box.min.x + 360) < 60,
    ),
    "boxes around the second focus exist",
  );
});

test("dropping a focus releases its blocks", () => {
  const { game, city } = makeCity();
  const a = new Vector3(-60, 0, 6);
  const b = new Vector3(-360, 0, 6);
  city.update(0, [a, b]);
  city.flush();
  const both = city.stats.cells;
  city.update(0, a);
  city.flush();
  assert.ok(city.stats.cells < both);
  assert.ok(game.physics.boxes.some((box) => box.tag === "city"));
});