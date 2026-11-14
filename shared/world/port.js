// Loads the headless port manifest produced by tools/export-port-colliders.mjs.
// Server-only (uses node:fs); the browser builds the same level from source.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Vector3 } from "../three.js";
import { hashManifest } from "../hash.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, "port-colliders.json");

function boxFromRow(row) {
  return {
    min: new Vector3(row[0], row[1], row[2]),
    max: new Vector3(row[3], row[4], row[5]),
    surface: row[6] || "concrete",
    tag: row[7] || "",
    noNav: !!row[8],
    bulletOnly: !!row[9],
    playerOnly: !!row[10],
  };
}

function v3(p) {
  return new Vector3(p[0], p[1], p[2]);
}

export function loadPort() {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (!data || data.version !== 1) throw new Error("unsupported port manifest");
  const manifest = data.manifest;
  const actual = hashManifest(manifest);
  if (actual !== data.hash)
    throw new Error(`port manifest hash mismatch: ${actual} !== ${data.hash}`);

  const boxes = manifest.boxes.map(boxFromRow);
  const start = manifest.playerStart || { pos: [0, 0, 4], yaw: 0 };
  const objectives = (manifest.objectives || []).map((o) => ({
    id: o.id,
    pos: v3(o.pos),
    radius: o.radius,
  }));
  const extraction = manifest.extraction
    ? { pos: v3(manifest.extraction.pos), radius: manifest.extraction.radius }
    : { pos: new Vector3(), radius: 2.5 };
  const enemySpawns = (manifest.enemySpawns || []).map((s) =>
    Array.isArray(s)
      ? { type: s[0], pos: new Vector3(s[1], s[2], s[3]) }
      : { type: s.type, pos: v3(s.pos) },
  );
  const coverPoints = (manifest.coverPoints || []).map(v3);

  return {
    hash: data.hash,
    manifest,
    boxes,
    level: {
      playerStart: { pos: v3(start.pos), yaw: start.yaw },
      objectives,
      extraction,
      enemySpawns,
      coverPoints,
      zones: [],
      interiorBoxes: [],
      groundSurfaceAt: () => "concrete",
      update() {},
    },
  };
}