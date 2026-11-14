// Canonical world fingerprints. The server and the client must produce the
// same hash from the same generated world before a match may start.

import { Vector3 } from "./three.js";

function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function vec(v) {
  if (!v) return [0, 0, 0];
  if (v.isVector3) return [num(v.x), num(v.y), num(v.z)];
  return [num(v[0]), num(v[1]), num(v[2])];
}

export function canonicalBox(b) {
  if (Array.isArray(b)) {
    return [
      num(b[0]),
      num(b[1]),
      num(b[2]),
      num(b[3]),
      num(b[4]),
      num(b[5]),
      String(b[6] || "concrete"),
      String(b[7] || ""),
      b[8] ? 1 : 0,
      b[9] ? 1 : 0,
      b[10] ? 1 : 0,
    ];
  }
  return [
    num(b.min.x ?? b.min[0]),
    num(b.min.y ?? b.min[1]),
    num(b.min.z ?? b.min[2]),
    num(b.max.x ?? b.max[0]),
    num(b.max.y ?? b.max[1]),
    num(b.max.z ?? b.max[2]),
    String(b.surface || "concrete"),
    String(b.tag || ""),
    b.noNav ? 1 : 0,
    b.bulletOnly ? 1 : 0,
    b.playerOnly ? 1 : 0,
  ];
}

export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashBoxes(boxes) {
  const rows = boxes.map(canonicalBox);
  rows.sort((a, b) => {
    const ka = JSON.stringify(a);
    const kb = JSON.stringify(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return hashString(JSON.stringify(rows));
}

export function canonicalManifest(manifest) {
  const objectives = (manifest.objectives || [])
    .map((o) => ({
      id: String(o.id || ""),
      pos: vec(o.pos),
      radius: num(o.radius ?? 0),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const spawns = (manifest.enemySpawns || [])
    .map((s) =>
      Array.isArray(s)
        ? [String(s[0] || ""), num(s[1]), num(s[2]), num(s[3])]
        : [String(s.type || ""), ...vec(s.pos)],
    )
    .sort((a, b) => {
      const ka = JSON.stringify(a);
      const kb = JSON.stringify(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  const cover = (manifest.coverPoints || [])
    .map((p) => vec(p))
    .sort((a, b) => {
      const ka = JSON.stringify(a);
      const kb = JSON.stringify(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  const start = manifest.playerStart || {};
  return {
    boxes: manifest.boxes.map(canonicalBox).sort((a, b) => {
      const ka = JSON.stringify(a);
      const kb = JSON.stringify(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    }),
    playerStart: {
      pos: vec(start.pos),
      yaw: num(start.yaw || 0),
    },
    objectives,
    extraction: manifest.extraction
      ? {
          pos: vec(manifest.extraction.pos),
          radius: num(manifest.extraction.radius || 0),
        }
      : null,
    enemySpawns: spawns,
    coverPoints: cover,
  };
}

export function hashManifest(manifest) {
  return hashString(JSON.stringify(canonicalManifest(manifest)));
}

export function cityManifest(boxes, spawn, cell = 40, ring = 1) {
  const cx = Math.round(spawn.x / cell);
  const cz = Math.round(spawn.z / cell);
  const picked = boxes.filter((b) => {
    if (b.tag !== "city") return false;
    const mx = (b.min.x + b.max.x) * 0.5;
    const mz = (b.min.z + b.max.z) * 0.5;
    return (
      Math.abs(Math.round(mx / cell) - cx) <= ring &&
      Math.abs(Math.round(mz / cell) - cz) <= ring
    );
  });
  return {
    boxes: picked,
    playerStart: { pos: [spawn.x, spawn.y, spawn.z], yaw: 0 },
    objectives: [],
    extraction: null,
    enemySpawns: [],
    coverPoints: [],
  };
}

export function manifestFromLevel(level, boxes) {
  const start = level.playerStart || { pos: new Vector3(), yaw: 0 };
  return {
    boxes,
    playerStart: { pos: vec(start.pos), yaw: num(start.yaw || 0) },
    objectives: (level.objectives || []).map((o) => ({
      id: o.id,
      pos: vec(o.pos),
      radius: num(o.radius || 0),
    })),
    extraction: level.extraction
      ? {
          pos: vec(level.extraction.pos),
          radius: num(level.extraction.radius || 0),
        }
      : null,
    enemySpawns: (level.enemySpawns || []).map((s) => ({
      type: s.type,
      pos: vec(s.pos),
    })),
    coverPoints: (level.coverPoints || []).map((p) => vec(p)),
  };
}