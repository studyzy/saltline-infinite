#!/usr/bin/env node
// Build the fixed port level without a renderer and write its collision
// manifest to shared/world/port-colliders.json.
//
//   node tools/export-port-colliders.mjs          # write
//   node tools/export-port-colliders.mjs --check  # compare only
//
// The level code is the single source of truth: this tool runs C1 exactly as
// the browser does, just with stub materials and no DOM.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Scene, MeshBasicMaterial, Color } from "../shared/three.js";
import { createPhysics } from "../shared/physics.js";
import { hashManifest, canonicalManifest, manifestFromLevel } from "../shared/hash.js";
import { buildPortLevel, createProps, createRng } from "../js/game.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outFile = path.join(root, "shared/world/port-colliders.json");

function stubMats() {
  const base = new MeshBasicMaterial({ color: new Color(0.5, 0.5, 0.5) });
  const make = () => base.clone();
  return {
    get: () => make(),
    emissive: () => make(),
    decal: () => ({ material: make(), aspect: 3 }),
    label: () => ({ material: make(), aspect: 3 }),
    names: () => [],
  };
}

async function build() {
  const game = {
    scene: new Scene(),
    mats: stubMats(),
    params: { seed: "4207" },
    rng: createRng(4207),
    level: null,
    ground: null,
    camera: null,
    render: null,
    events: { on() {}, emit() {} },
  };
  game.props = createProps(game);
  game.physics = createPhysics(game);
  const level = await buildPortLevel(game);
  game.level = level;
  // Level updaters can register collision on their first few frames (doors,
  // gates). Run them once so the exported set matches what the browser has
  // before the first snapshot.
  for (let i = 0; i < 3; i++) level.update(1 / 60);
  game.physics.build();

  const boxes = game.physics.boxes.filter((b) => b.tag !== "city");
  const manifest = manifestFromLevel(level, boxes);
  const hash = hashManifest(manifest);
  return { version: 1, hash, manifest: canonicalManifest(manifest) };
}

const check = process.argv.includes("--check");
const data = await build();
const json = JSON.stringify(data, null, 2) + "\n";

if (check) {
  if (!fs.existsSync(outFile)) {
    console.error(`missing ${path.relative(root, outFile)}`);
    process.exit(1);
  }
  const current = JSON.parse(fs.readFileSync(outFile, "utf8"));
  if (current.hash !== data.hash) {
    console.error(
      `port collider mismatch: file ${current.hash}, current code ${data.hash}`,
    );
    process.exit(1);
  }
  console.log(`port colliders ok (${data.hash}, ${data.manifest.boxes.length} boxes)`);
} else {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, json);
  console.log(
    `wrote ${path.relative(root, outFile)} (${data.hash}, ${data.manifest.boxes.length} boxes)`,
  );
}