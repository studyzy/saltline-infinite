// City self-check. Run with: node tools/city-audit.mjs
//
// The city generator is a pure function of a block coordinate, so it can be
// driven head-lessly: give createCity() a stub physics that records colliders
// and a stub material cache, walk the player around, and assert the invariants
// that make the blocks playable.
//
// It also pulls moveCapsule() out of the shipped js/game.js and uses THAT for
// the collision tests, so a change to the real movement code cannot silently
// invalidate the audit.
//
// Invariants:
//   1. every container a capsule can be dropped into pushes it back out
//   2. containers do not interpenetrate each other or anything else
//   3. nothing solid hangs in the air (awnings and signs must touch their wall)
//   4. a block's ground-level colliders are identical at both detail levels,
//      so a block cannot change shape while the player is standing in it
//   5. a walking player never ends up inside a collider
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- load the city module as ESM (the repo has no package.json) -----------
const tmp = mkdtempSync(join(tmpdir(), "saltline-audit-"));
mkdirSync(join(tmp, "js", "vendor"), { recursive: true });
for (const f of ["city.js", "vendor/three.module.js", "vendor/three.core.js"])
  copyFileSync(join(ROOT, "js", f), join(tmp, "js", f));
writeFileSync(join(tmp, "package.json"), '{"type":"module"}');

const THREE = await import(join(tmp, "js", "vendor", "three.module.js"));
const { createCity } = await import(join(tmp, "js", "city.js"));

// ---- the real moveCapsule, lifted out of the game bundle ------------------
const game = readFileSync(join(ROOT, "js", "game.js"), "utf8").split("\n");
const from = game.findIndex((l) => l.trim().startsWith("moveCapsule(_, M, E, w = 0.32"));
const to = game.findIndex((l, i) => i > from && l.trim().startsWith("nav: {"));
if (from < 0 || to < 0) throw new Error("could not find moveCapsule in js/game.js");
const body = game
  .slice(from, to)
  .join("\n")
  .replace("moveCapsule(_, M, E", "function moveCapsule(_, M, E")
  .trim()
  .replace(/,$/, "");
const makeMoveCapsule = new Function(
  "THREE",
  `const W = THREE.Vector3, u1 = 0.42, oi = { min: new W(-40,0,-30), max: new W(40,30,30), groundY: 0, seaY: -1.6, quayX: 30 }, Li = { x0: -1e9 }, i = {};
   return function (e) { ${body} return moveCapsule; };`,
)(THREE);

// ---- harness -------------------------------------------------------------
function snapshot(px, pz) {
  const boxes = [];
  const mats = new Map();
  const mat = (n) => {
    if (!mats.has(n)) mats.set(n, { name: n, isMaterial: true, clone() { return this; }, dispose() {} });
    return mats.get(n);
  };
  const physics = {
    boxes,
    addBox(min, max, o = {}) {
      const b = { min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), surface: o.surface || "concrete", tag: o.tag || "" };
      boxes.push(b);
      return b;
    },
    removeBox(b) {
      const i = boxes.indexOf(b);
      if (i >= 0) boxes.splice(i, 1);
    },
    cityBlocked: () => false,
  };
  const city = createCity({ scene: new THREE.Scene(), physics, mats: { get: mat, emissive: mat } });
  for (let i = 0; i < 4000; i++) {
    city.update(0.016, { x: px, y: 0, z: pz });
    if (city.stats.queued === 0) break;
  }
  // drawn boxes: a merged mesh of BoxGeometries is 36 vertices per box
  const drawn = [];
  for (const g of city.root.children) {
    if (!g.isGroup) continue;
    for (const mesh of g.children) {
      if (!mesh.isMesh) continue;
      const pos = mesh.geometry.attributes.position;
      if (pos.count % 36 !== 0) continue;
      for (let o = 0; o + 36 <= pos.count; o += 36) {
        const bb = new THREE.Box3();
        for (let i = o; i < o + 36; i++) bb.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        drawn.push({ bb, mat: mesh.material.name });
      }
    }
  }
  return { boxes, drawn, moveCapsule: makeMoveCapsule(boxes) };
}

const isContainer = (m) => /^paint_(red|blue|teal)$/.test(m);
const ov = (a, b, e) =>
  Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > e &&
  Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > e &&
  Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > e;

const fail = [];
const note = (ok, msg) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}`);
  if (!ok) fail.push(msg);
};

console.log("city audit");

// ---- 1-3: per-position geometry checks -----------------------------------
const POSITIONS = [
  [-50, 6], // the gate mouth: the first blocks outside the port fence
  [-160, 6],
  [-260, 60],
  [-360, -60],
  [-460, 140],
  [-560, -140],
];
let containers = 0, overlaps = 0, sunk = 0, floating = 0, lodPairs = 0, lodBad = 0;
const floatingSamples = [];
for (const [px, pz] of POSITIONS) {
  const a = snapshot(px, pz);
  const cs = a.drawn.filter((d) => isContainer(d.mat));
  containers += cs.length;
  // (1) solid: drop the capsule in the middle of each container.
  // moveCapsule takes a VELOCITY and applies dt itself, so pass metres per
  // second, not a per-frame step: -1.5 m/s settles it far enough to be pushed
  // out, and keeps the check honest.
  for (const c of cs) {
    const p = new THREE.Vector3((c.bb.min.x + c.bb.max.x) / 2, 0.2, (c.bb.min.z + c.bb.max.z) / 2);
    for (let t = 0; t < 20; t++) a.moveCapsule(p, new THREE.Vector3(0, -1.5, 0), 1 / 60, 0.36, 1.8, true);
    const still =
      p.x > c.bb.min.x + 0.05 && p.x < c.bb.max.x - 0.05 && p.z > c.bb.min.z + 0.05 && p.z < c.bb.max.z - 0.05 && p.y < c.bb.max.y - 0.3;
    if (still) fail.push(`container not solid at ${c.bb.min.x.toFixed(1)},${c.bb.min.z.toFixed(1)}`);
    // (3) the bottom layer stands on the yard slab (top at 0.30), not sunk
    // into it. Upper layers of a stack sit on the layer below, so they are
    // exempt.
    const stacked =
      c.bb.min.y > 0.5 &&
      cs.some(
        (o) =>
          o !== c &&
          Math.abs(o.bb.max.y - c.bb.min.y) < 0.06 &&
          Math.min(o.bb.max.x, c.bb.max.x) - Math.max(o.bb.min.x, c.bb.min.x) > 0.5 &&
          Math.min(o.bb.max.z, c.bb.max.z) - Math.max(o.bb.min.z, c.bb.min.z) > 0.5,
      );
    if (!stacked && Math.abs(c.bb.min.y - 0.3) > 0.06) sunk++;
  }
  // (2) interpenetration of containers with any other drawn box
  for (const c of cs)
    for (const o of a.drawn) {
      if (o === c) continue;
      if (ov(c.bb, o.bb, 0.05)) {
        overlaps++;
        if (fail.length < 8) fail.push(`container clips ${o.mat} at ${c.bb.min.x.toFixed(1)},${c.bb.min.z.toFixed(1)}`);
      }
    }
  // (3) floating solids: a box above 0.6 m that does not touch anything
  const M = 0.12;
  for (let i = 0; i < a.drawn.length; i++) {
    const x = a.drawn[i];
    if (x.bb.min.y < 0.6) continue;
    let attached = false;
    for (let j = 0; j < a.drawn.length && !attached; j++) {
      if (i === j) continue;
      const y = a.drawn[j].bb;
      if (
        Math.min(x.bb.max.x, y.max.x) - Math.max(x.bb.min.x, y.min.x) > -M &&
        Math.min(x.bb.max.y, y.max.y) - Math.max(x.bb.min.y, y.min.y) > -M &&
        Math.min(x.bb.max.z, y.max.z) - Math.max(x.bb.min.z, y.min.z) > -M
      )
        attached = true;
    }
    if (!attached) {
      floating++;
      if (floatingSamples.length < 5)
        floatingSamples.push(
          `${x.mat} ${(x.bb.max.x - x.bb.min.x).toFixed(1)}x${(x.bb.max.y - x.bb.min.y).toFixed(1)}x${(x.bb.max.z - x.bb.min.z).toFixed(1)} at y=${x.bb.min.y.toFixed(2)}`,
        );
    }
  }
  // (4) the same blocks at ring 4, i.e. massing detail
  const b = snapshot(px - 160, pz);
  const cellOf = (box) => `${Math.floor(((box.min.x + box.max.x) / 2) / 40)},${Math.floor(((box.min.z + box.max.z) / 2) / 40)}`;
  const keyOf = (box) => [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((n) => n.toFixed(2)).join(",");
  const group = (list) => {
    const m = new Map();
    for (const box of list) {
      if (box.min.y >= 2.5) continue; // roof kit is detail-only and above the capsule
      const k = cellOf(box);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(keyOf(box));
    }
    for (const v of m.values()) v.sort();
    return m;
  };
  const g2 = group(a.boxes);
  const g1 = group(b.boxes);
  for (const [k, list] of g2) {
    const other = g1.get(k);
    if (!other) continue;
    lodPairs++;
    if (list.length !== other.length || list.some((v, i) => v !== other[i])) lodBad++;
  }
}

note(containers > 0, `${containers} containers sampled`);
note(!fail.some((f) => f.startsWith("container not solid")), "every container pushes the capsule back out");
note(overlaps === 0, `containers interpenetrating anything: ${overlaps}`);
note(sunk === 0, `containers sunk into or lifted off the yard slab: ${sunk}`);
note(floating === 0, `solids floating more than 12 cm off their support: ${floating}${floatingSamples.length ? " e.g. " + floatingSamples.join("; ") : ""}`);
note(lodBad === 0, `${lodPairs} blocks, ground-level colliders identical at both detail levels: ${lodPairs - lodBad}`);

// ---- 5: a walking player never ends up inside a collider ------------------
let frames = 0, inside = 0;
for (let w = 0; w < 8; w++) {
  const s0 = snapshot(-100, 0);
  const pos = new THREE.Vector3(-70 - w * 40, 0.6, -100 + w * 30);
  let yaw = w * 1.1;
  for (let f = 0; f < 60 * 20; f++) {
    if (f % 90 === 0) yaw += 0.7;
    // moveCapsule takes a velocity and multiplies by dt itself. Pre-multiplying
    // dt here made the old walk test move at 12 cm/s, so it never actually
    // reached a wall.
    const vel = new THREE.Vector3(Math.cos(yaw) * 7, -9.8, Math.sin(yaw) * 7);
    s0.moveCapsule(pos, vel, 1 / 60, 0.36, 1.8, true);
    frames++;
    for (const b of s0.boxes) {
      if (pos.x > b.min.x + 0.02 && pos.x < b.max.x - 0.02 && pos.z > b.min.z + 0.02 && pos.z < b.max.z - 0.02 && b.min.y < pos.y + 1.6 && b.max.y > pos.y + 0.3) {
        inside++;
        pos.x += 0.6;
        break;
      }
    }
  }
}
note(inside === 0, `walking frames spent inside a solid: ${inside} of ${frames}`);

rmSync(tmp, { recursive: true, force: true });
if (fail.length) {
  console.log(`\n${fail.length} problem(s):`);
  for (const f of fail.slice(0, 20)) console.log("  - " + f);
  process.exit(1);
}
console.log("\nall invariants hold");