// Saltline — endless city.
//
// The port in the fixed level sits behind a fence. West of that fence the city
// runs on forever: blocks are generated from a deterministic hash of their grid
// coordinate, so a given street looks the same every time you come back to it,
// and nothing is ever stored. Near blocks are detailed (facades, windows, roof
// clutter, kerbs, lane paint) and carry colliders; far blocks are merged into a
// single silhouette layer so the skyline never ends.
//
// Everything here is built from boxes and cylinders with the game's own
// materials, so the city is lit, wet and dirty exactly like the port.

import * as THREE from "./vendor/three.module.js";

const CELL = 40; // metres per block, roads included
const NEAR = 2; // detailed blocks within +/-NEAR cells
const FAR = 8; // silhouette blocks out to +/-FAR cells
const ROAD = 9; // road strip on the west and south edge of a block
const PAVE = 2.4; // pavement band around a lot
const KERB = 0.14;

// The fixed level's footprint plus a ring road: no city here.
const RESERVED = { x0: -44, x1: 28, z0: -36, z1: 34 };
// The apron mesh already supplies ground inside this rect; the city only adds
// asphalt outside it so the port's puddle shader keeps working.
const APRON = { x0: -160, x1: 30, z0: -160, z1: 160 };

const MAT = {
  ground: "asphalt",
  pave: "concrete",
  kerb: "concrete_dirty",
  wallA: "brick",
  wallB: "concrete_dirty",
  wallC: "concrete",
  wallD: "corrugated_roof",
  metal: "steel_galv",
  dark: "steel_dark",
  glass: "glass_dirty",
  paint: "paint_white",
  paintY: "paint_yellow",
  wood: "wood_dark",
};

// ---------------------------------------------------------------- hashing ---

function hash(x, y, k) {
  let n =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul((k | 0) + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// A tiny per-block stream so content stays stable for a coordinate pair.
function stream(cx, cz) {
  let a = 0;
  const rnd = () => {
    a++;
    return hash(cx * 7919 + 13, cz * 104729 + 7, a * 31);
  };
  rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rnd());
  rnd.pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];
  rnd.chance = (p) => rnd() < p;
  return rnd;
}

// -------------------------------------------------------------- geometry ---

// Minimum collider thickness. A collider thinner than this can be tunnelled
// through by the capsule sweep at sprint speed, and reads as a paper wall.
const MIN_SOLID = 0.3;

// Box with UVs in metres per face, matching the game's material tiling.
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ax > 0.5) uv.setXY(i, z, y);
    else if (ay > 0.5) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  return g.toNonIndexed();
}

function cylGeo(r, h, seg = 10) {
  return new THREE.CylinderGeometry(r, r, h, seg, 1).toNonIndexed();
}

function quadGeo(w, h, vertical = true) {
  const g = new THREE.PlaneGeometry(w, h);
  if (vertical) g.rotateX(0);
  else g.rotateX(-Math.PI / 2);
  return g.toNonIndexed();
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function placed(geo, x, y, z, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _m.compose(_v, _q, _s);
  const out = geo.clone();
  out.applyMatrix4(_m);
  geo.dispose();
  return out;
}

// Merge a list of geometries into one non-indexed buffer.
function merge(list) {
  if (!list.length) return null;
  let verts = 0;
  for (const g of list) verts += g.attributes.position.count;
  const pos = new Float32Array(verts * 3);
  const nrm = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  let o = 0;
  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    pos.set(p.array.subarray(0, p.count * 3), o * 3);
    if (n) nrm.set(n.array.subarray(0, n.count * 3), o * 3);
    if (u) uv.set(u.array.subarray(0, u.count * 2), o * 2);
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// ------------------------------------------------------------------ city ---

export function createCity(game) {
  const scene = game.scene;
  const physics = game.physics;
  const mats = game.mats;

  const root = new THREE.Group();
  root.name = "city";
  scene.add(root);

  // One asphalt slab under the whole city, a hair below the port's apron so
  // the two never fight. It stops at the quay line: east of it is water.
  {
    const W = 940;
    const D = 1800;
    const g = new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2);
    g.translate(28 - W / 2, -0.015, 0);
    const m = new THREE.Mesh(
      g.toNonIndexed(),
      (() => {
        try {
          return mats.get("asphalt", { triplanar: true, scale: 1 });
        } catch {
          return mats.get("asphalt");
        }
      })(),
    );
    m.name = "city-ground";
    m.receiveShadow = true;
    m.castShadow = false;
    m.frustumCulled = false;
    root.add(m);
  }

  const nearCells = new Map(); // "cx,cz" -> { group, boxRefs }
  // (far silhouettes live in one merged batch, see rebuildFarBatch)

  const winLit = mats.emissive(0xffb877, 2.1);
  const winDim = mats.emissive(0x8fa8b8, 0.55);
  const neonA = mats.emissive(0xff5a2a, 3.4);
  const neonB = mats.emissive(0x37d6ff, 3.0);
  const neonC = mats.emissive(0xffd08a, 2.6);

  let built = -1e9;
  let lastCell = null;
  let active = true;
  const stats = { cells: 0, tris: 0 };

  function bucket(map, name) {
    let a = map.get(name);
    if (!a) map.set(name, (a = []));
    return a;
  }

  function matFor(name) {
    try {
      return mats.get(name);
    } catch {
      return mats.get("concrete");
    }
  }

  // ---- one detailed block -------------------------------------------------

  function buildNear(cx, cz) {
    const r = stream(cx, cz);
    const geos = new Map();
    const boxes = [];
    const gc = []; // geometries to dispose with the cell
    const push = (bucketName, geo) => {
      bucket(geos, bucketName).push(geo);
      gc.push(geo);
    };

    // Emit one solid volume: the visible box and its collider are derived from
    // the same numbers, so nothing can be drawn without also being solid.
    // Colliders are inflated to MIN_SOLID on every axis (a zero-thickness pane
    // or a 6 cm pipe is otherwise walked straight through).
    const solid = (name, w, h, d, x, y, z, opts = {}) => {
      const ry = opts.ry || 0;
      push(name, placed(boxGeo(w, h, d), x, y, z, ry));
      const cw = Math.max(w, MIN_SOLID);
      const ch = Math.max(h, MIN_SOLID);
      const cd = Math.max(d, MIN_SOLID);
      if (opts.noCol) return;
      // Rotated boxes get their collider widened to the swept footprint so the
      // player can never clip a corner.
      if (Math.abs(ry) > 1e-3) {
        const c = Math.abs(Math.cos(ry));
        const sn = Math.abs(Math.sin(ry));
        const sw = cw * c + cd * sn;
        const sd = cw * sn + cd * c;
        boxes.push({
          min: [x - sw / 2, y - ch / 2, z - sd / 2],
          max: [x + sw / 2, y + ch / 2, z + sd / 2],
          surface: opts.surface || "concrete",
        });
        return;
      }
      boxes.push({
        min: [x - cw / 2, y - ch / 2, z - cd / 2],
        max: [x + cw / 2, y + ch / 2, z + cd / 2],
        surface: opts.surface || "concrete",
      });
    };

    const x0 = cx * CELL;
    const z0 = cz * CELL;

    // road paint on the west/south strips
    for (let k = 0; k < 3; k++) {
      const t = z0 + 6 + k * 12;
      const dash = new THREE.PlaneGeometry(0.16, 4).rotateX(-Math.PI / 2);
      dash.translate(x0 + ROAD * 0.5, 0.02, t);
      push(MAT.paintY, dash.toNonIndexed());
    }
    for (let k = 0; k < 3; k++) {
      const dash = new THREE.PlaneGeometry(4, 0.16).rotateX(-Math.PI / 2);
      dash.translate(x0 + 20 + k * 6, 0.02, z0 + ROAD * 0.5);
      push(MAT.paintY, dash.toNonIndexed());
    }

    // lot: pavement plinth
    const lx = x0 + ROAD + PAVE * 0.5;
    const lz = z0 + ROAD + PAVE * 0.5;
    const lw = CELL - ROAD - PAVE * 1.5;
    const ld = CELL - ROAD - PAVE * 1.5;
    push(MAT.pave, placed(boxGeo(lw, KERB, ld), lx + lw / 2, KERB / 2, lz + ld / 2));
    push(MAT.kerb, placed(boxGeo(lw + 0.3, 0.06, 0.3), lx + lw / 2, KERB + 0.03, lz + ld));
    push(MAT.kerb, placed(boxGeo(0.3, 0.06, ld + 0.3), lx + lw, KERB + 0.03, lz + ld / 2));

    const baseY = KERB;
    const lot = { x: lx + 0.9, z: lz + 0.9, w: lw - 1.8, d: ld - 1.8 };

    const kind = r();
    if (kind < 0.22) {
      // low yard: container stacks, fenced compound
      buildYard(push, solid, boxes, r, lot, baseY);
    } else {
      const cols = kind < 0.6 ? 1 : 2;
      const rows = r() < 0.5 ? 1 : 2;
      const cw = lot.w / cols;
      const cd = lot.d / rows;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if (cols * rows > 1 && r() < 0.16) continue;
          const pad = 1.2 + r() * 1.6;
          buildTower(
            push,
            solid,
            r,
            {
              x: lot.x + i * cw + pad * 0.5,
              z: lot.z + j * cd + pad * 0.5,
              w: cw - pad,
              d: cd - pad,
            },
            baseY,
            cx,
            cz,
          );
        }
    }

    // street clutter along the road edge
    const clutter = r.int(0, 3);
    for (let i = 0; i < clutter; i++) {
      const px = x0 + ROAD - 1.1 + r.range(-0.5, 0.5);
      const pz = z0 + r.range(6, CELL - 4);
      buildClutter(push, solid, boxes, r, px, pz);
    }
    // one light mast per block, on the pavement corner
    buildLamp(push, solid, r, x0 + ROAD + 0.6, z0 + ROAD + 0.6);

    return { geos, boxes, gc };
  }

  function buildTower(push, solid, r, lot, baseY, cx, cz) {
    if (lot.w < 3 || lot.d < 3) return;
    const w = Math.min(lot.w, 26);
    const d = Math.min(lot.d, 26);
    const cxw = lot.x + w / 2;
    const czw = lot.z + d / 2;
    const tall = r.chance(0.55);
    const floors = tall ? r.int(4, 11) : r.int(1, 4);
    const fh = r.range(3.0, 3.6);
    const h = floors * fh;
    const wall = r.pick([MAT.wallA, MAT.wallB, MAT.wallC, MAT.wallA, MAT.wallB]);
    const style = r();

    // Main volume. baseY is the pavement top, so the box is centred half a
    // height above it; the collider comes from the same call.
    solid(wall, w, h, d, cxw, baseY + h / 2, czw, { surface: "concrete" });

    // Ground-floor plinth: it sticks out 12 cm past the body on all sides, so
    // it needs its own collider or the player can stand inside the wall.
    solid(MAT.wallC, w + 0.24, fh * 0.9, d + 0.24, cxw, baseY + fh * 0.45, czw, {
      surface: "concrete",
    });

    // Parapet lip. These are 36 cm bands sitting on the roof edge; solid()
    // keeps them above the collider minimum so the roof reads as enclosed.
    const lip = 0.36;
    const lipH = 0.7;
    const lipY = baseY + h + lipH / 2;
    solid(MAT.wallB, w + lip, lipH, lip, cxw, lipY, czw - d / 2, { surface: "concrete" });
    solid(MAT.wallB, w + lip, lipH, lip, cxw, lipY, czw + d / 2, { surface: "concrete" });
    solid(MAT.wallB, lip, lipH, d, cxw - w / 2, lipY, czw, { surface: "concrete" });
    solid(MAT.wallB, lip, lipH, d, cxw + w / 2, lipY, czw, { surface: "concrete" });

    // windows: rows of thin panes on all four faces, capped for budget
    const rows = Math.max(1, floors - 1);
    const rowH = 3.2;
    const colW = 2.9;
    let budget = tall ? 130 : 46;
    const faces = [
      { nx: 0, nz: -1, len: w, ox: 0, oz: -d / 2 - 0.03 },
      { nx: 0, nz: 1, len: w, ox: 0, oz: d / 2 + 0.03 },
      { nx: -1, nz: 0, len: d, ox: -w / 2 - 0.03, oz: 0 },
      { nx: 1, nz: 0, len: d, ox: w / 2 + 0.03, oz: 0 },
    ];
    for (const f of faces) {
      if (budget <= 0) break;
      const n = Math.max(1, Math.floor((f.len - 1.6) / colW));
      for (let row = 1; row <= rows && budget > 0; row++) {
        const y = baseY + fh + (row - 1) * rowH + 1.7;
        if (y + 0.6 > baseY + h - 0.2) break;
        for (let i = 0; i < n && budget > 0; i++) {
          budget--;
          const lx = (i + 0.5) * (f.len / n) - f.len / 2;
          const q = new THREE.PlaneGeometry(1.25, 1.55);
          q.rotateY(Math.atan2(f.nx, f.nz));
          q.translate(
            cxw + f.ox + (f.nz ? lx : 0),
            y,
            czw + f.oz + (f.nx ? -lx : 0),
          );
          const lit = r.chance(0.42);
          const name = lit
            ? r.chance(0.55)
              ? "__winLit"
              : "__winDim"
            : "__glass";
          push(name, q.toNonIndexed());
          // frame reveal — the detail that makes a flat wall read as a facade
          if (r.chance(0.35))
            push(
              MAT.wallB,
              placed(
                boxGeo(f.nx ? 0.06 : 1.5, 0.1, f.nx ? 1.5 : 0.06),
                cxw + f.ox + (f.nz ? lx : 0),
                y - 0.9,
                czw + f.oz + (f.nx ? -lx : 0),
              ),
            );
        }
      }
    }

    // Ground floor: roll-up door, awning, sometimes a neon sign. The door is a
    // 12 cm shutter let into the wall, so it is drawn but NOT given a collider
    // of its own — the body box already covers it, and a thin extra box here
    // would only produce a lip the player snags on.
    const doorFace = r.int(0, 3);
    const df = faces[doorFace];
    const dl = df.len * 0.32;
    push(
      MAT.dark,
      placed(
        boxGeo(df.nx ? 0.12 : dl, 2.6, df.nx ? dl : 0.12),
        cxw + df.ox * 1.02,
        baseY + 1.3,
        czw + df.oz * 1.02,
      ),
    );
    if (r.chance(0.5)) {
      // Awning: a real ledge you can walk under, so it gets a collider (it is
      // 3.1 m up and would otherwise be an invisible ceiling-less shelf).
      const canopyW = df.nx ? 1.6 : dl + 1.2;
      const canopyD = df.nx ? dl + 1.2 : 1.6;
      solid(MAT.metal, canopyW, 0.16, canopyD, cxw + df.ox * 1.9, baseY + 3.1, czw + df.oz * 1.9, {
        surface: "metal",
      });
    }
    if (r.chance(0.42)) {
      const neon = r.chance(0.5) ? "__neonA" : r.chance(0.5) ? "__neonB" : "__neonC";
      const nw = df.nx ? 0.14 : Math.min(dl * 1.1, 5);
      const nd = df.nx ? Math.min(dl * 1.1, 5) : 0.14;
      push(neon, placed(boxGeo(nw, 0.5, nd), cxw + df.ox * 1.35, baseY + 4.4, czw + df.oz * 1.35));
    }

    // a run of service pipes up one corner
    if (r.chance(0.6)) {
      const px = r.chance(0.5) ? cxw - w / 2 - 0.12 : cxw + w / 2 + 0.12;
      const pz = czw + r.range(-d / 3, d / 3);
      for (let k = 0; k < 2; k++)
        push(
          MAT.dark,
          placed(cylGeo(0.09, h * 0.9, 6), px + k * 0.22, baseY + h * 0.45, pz),
        );
    }

    // rooftop clutter: AC blocks, a tank, an antenna, a stair bulkhead
    const roofY = baseY + h;
    const ac = r.int(1, 4);
    for (let i = 0; i < ac; i++) {
      const bw = r.range(0.9, 2.1);
      const bd = r.range(0.8, 1.6);
      const bh = r.range(0.5, 1.1);
      push(
        MAT.metal,
        placed(
          boxGeo(bw, bh, bd),
          cxw + r.range(-w / 2 + 1.2, w / 2 - 1.2),
          roofY + bh / 2,
          czw + r.range(-d / 2 + 1.2, d / 2 - 1.2),
          r.range(0, Math.PI),
        ),
      );
    }
    if (r.chance(0.35) && Math.min(w, d) > 8) {
      const tx = cxw + r.range(-w / 4, w / 4);
      const tz = czw + r.range(-d / 4, d / 4);
      push(MAT.wood, placed(cylGeo(1.15, 2.0, 12), tx, roofY + 1.9, tz));
      push(MAT.wood, placed(cylGeo(1.22, 0.14, 12), tx, roofY + 2.95, tz));
      for (const [ox, oz] of [
        [-0.7, -0.7],
        [0.7, -0.7],
        [-0.7, 0.7],
        [0.7, 0.7],
      ])
        push(MAT.dark, placed(boxGeo(0.1, 0.9, 0.1), tx + ox, roofY + 0.45, tz + oz));
    }
    if (r.chance(0.4)) {
      push(
        MAT.dark,
        placed(boxGeo(0.07, r.range(3, 7), 0.07), cxw, roofY + 2.4, czw + r.range(-2, 2)),
      );
      push(MAT.dark, placed(boxGeo(0.5, 0.05, 0.05), cxw, roofY + 4.4, czw));
    }
    if (r.chance(0.5)) {
      push(
        MAT.wallB,
        placed(boxGeo(2.6, 2.3, 2.2), cxw + r.range(-w / 5, w / 5), roofY + 1.15, czw + r.range(-d / 5, d / 5)),
      );
    }
  }

  // A container yard: low, greasy, good for fighting in.
  function buildYard(push, solid, boxes, r, lot, baseY) {
    const fenceH = 2.2;
    // Yard slab: a 16 cm platform, low enough to step onto, so no collider.
    push(MAT.dark, placed(boxGeo(lot.w, 0.16, lot.d), lot.x + lot.w / 2, baseY + 0.08, lot.z + lot.d / 2));

    // Perimeter fence on ALL FOUR sides. The old code only collided the south
    // rail, which left three sides of every yard as a fence you walk through.
    const step = 3.2;
    const x1 = lot.x + lot.w;
    const z1 = lot.z + lot.d;
    for (let x = lot.x; x <= x1; x += step) {
      push(MAT.metal, placed(boxGeo(0.1, fenceH, 0.1), x, baseY + fenceH / 2, lot.z));
      push(MAT.metal, placed(boxGeo(0.1, fenceH, 0.1), x, baseY + fenceH / 2, z1));
    }
    for (let z = lot.z; z <= z1; z += step) {
      push(MAT.metal, placed(boxGeo(0.1, fenceH, 0.1), lot.x, baseY + fenceH / 2, z));
      push(MAT.metal, placed(boxGeo(0.1, fenceH, 0.1), x1, baseY + fenceH / 2, z));
    }
    push(MAT.metal, placed(boxGeo(lot.w, 0.08, 0.08), lot.x + lot.w / 2, baseY + fenceH, lot.z));
    push(MAT.metal, placed(boxGeo(lot.w, 0.08, 0.08), lot.x + lot.w / 2, baseY + fenceH, z1));
    push(MAT.metal, placed(boxGeo(0.08, 0.08, lot.d), lot.x, baseY + fenceH, lot.z + lot.d / 2));
    push(MAT.metal, placed(boxGeo(0.08, 0.08, lot.d), x1, baseY + fenceH, lot.z + lot.d / 2));

    // One collider per side, not per post: fewer boxes, same wall.
    const fw = MIN_SOLID;
    const fh = baseY + fenceH;
    boxes.push({ min: [lot.x, 0, lot.z - fw / 2], max: [x1, fh, lot.z + fw / 2], surface: "metal" });
    boxes.push({ min: [lot.x, 0, z1 - fw / 2], max: [x1, fh, z1 + fw / 2], surface: "metal" });
    boxes.push({ min: [lot.x - fw / 2, 0, lot.z], max: [lot.x + fw / 2, fh, z1], surface: "metal" });
    boxes.push({ min: [x1 - fw / 2, 0, lot.z], max: [x1 + fw / 2, fh, z1], surface: "metal" });

    const stacks = r.int(2, 4);
    for (let i = 0; i < stacks; i++) {
      const cw = r.chance(0.5) ? 6.06 : 12.19;
      const cd = 2.44;
      const cx = lot.x + r.range(1, Math.max(1.2, lot.w - cw - 1)) + cw / 2;
      const cz = lot.z + r.range(2.5, Math.max(3, lot.d - cd - 1)) + cd / 2;
      const n = r.int(1, 3);
      for (let k = 0; k < n; k++) {
        const ch = 2.59;
        push(
          r.chance(0.5) ? "paint_red" : r.chance(0.5) ? "paint_blue" : "paint_teal",
          placed(
            boxGeo(cw, ch, cd),
            cx,
            baseY + 0.16 + ch / 2 + k * ch,
            cz,
            r.range(-0.03, 0.03),
          ),
        );
        // Corrugation ribs so the container is not a plain slab. They are 4 cm
        // proud of the wall and belong to the container's own collider, so they
        // are drawn only — a collider here would fight the container box.
        for (let i2 = 0; i2 < 4; i2++)
          push(
            MAT.metal,
            placed(
              boxGeo(cw * 0.9, 0.04, 0.08),
              cx,
              baseY + 0.16 + 0.5 + i2 * 0.55 + k * ch,
              cz + cd / 2 + 0.04,
            ),
          );
      }
      boxes.push({
        min: [cx - cw / 2, baseY, cz - cd / 2],
        max: [cx + cw / 2, baseY + 0.16 + n * 2.59, cz + cd / 2],
        surface: "metal",
      });
    }
    // Drums: 90 cm tall, so they need a footprint or you walk through them.
    for (let i = 0; i < r.int(2, 5); i++) {
      const dx = lot.x + r.range(1, lot.w - 1);
      const dz = lot.z + r.range(1, lot.d - 1);
      push(r.chance(0.5) ? "paint_yellow" : "paint_green", placed(cylGeo(0.3, 0.9, 10), dx, baseY + 0.45, dz));
      boxes.push({
        min: [dx - 0.3, 0, dz - 0.3],
        max: [dx + 0.3, baseY + 0.9, dz + 0.3],
        surface: "metal",
      });
    }
  }

  // Street furniture. Everything here is waist height or taller, so every piece
  // gets a collider — a dumpster you can walk through breaks the illusion as
  // badly as a wall you can walk through.
  function buildClutter(push, solid, boxes, r, x, z) {
    const k = r();
    if (k < 0.4) {
      const ry = r.range(-0.4, 0.4);
      solid(MAT.dark, 1.9, 1.35, 1.1, x, 0.68, z, { ry, surface: "metal" });
      push(MAT.paintY, placed(boxGeo(1.94, 0.1, 1.14), x, 1.38, z, ry));
    } else if (k < 0.72) {
      for (let i = 0; i < 2; i++) {
        const cx2 = x + i * 0.7;
        const cz2 = z + i * 0.2;
        solid(MAT.paintY, 0.36, 0.7, 0.36, cx2, 0.35, cz2, { surface: "concrete" });
      }
    } else {
      const ry = r.range(0, 3);
      solid(MAT.metal, 1.2, 1.1, 1.0, x, 0.55, z, { ry, surface: "metal" });
      push(MAT.wood, placed(boxGeo(1.1, 0.14, 0.9), x, 1.17, z, ry));
    }
  }

  function buildLamp(push, solid, r, x, z) {
    const h = r.range(7, 11);
    // The mast is an 11 cm cylinder: solid() gives it a 30 cm collider so you
    // cannot walk through the pole.
    solid(MAT.dark, 0.22, h, 0.22, x, h / 2, z, { surface: "metal" });
    push(MAT.dark, placed(boxGeo(1.5, 0.1, 0.1), x + 0.75, h - 0.1, z));
    push("__neonC", placed(boxGeo(0.7, 0.16, 0.4), x + 1.35, h - 0.25, z));
  }

  // ---- silhouettes out to the horizon ------------------------------------

  function buildFar(cx, cz) {
    const r = stream(cx * 3 + 11, cz * 5 - 7);
    const out = [];
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const blocks = r.int(1, 3);
    for (let i = 0; i < blocks; i++) {
      const w = r.range(12, 30);
      const d = r.range(12, 30);
      const h = r.range(9, 52);
      const x = x0 + r.range(3, CELL - w - 3) + w / 2;
      const z = z0 + r.range(3, CELL - d - 3) + d / 2;
      out.push(placed(boxGeo(w, h, d), x, h / 2, z));
      if (r.chance(0.55)) {
        const q = new THREE.PlaneGeometry(w * 0.8, 0.5);
        q.rotateY(r.chance(0.5) ? 0 : Math.PI / 2);
        q.translate(x, r.range(4, h - 2), z + d / 2 + 0.05);
        out.push(q.toNonIndexed());
      }
    }
    return out;
  }

  // ---- assembly ----------------------------------------------------------
  //
  // Each block owns its meshes and its colliders. Nothing is merged globally:
  // a global merge meant rebuilding every visible block whenever the player
  // crossed a cell line, which is what froze the main thread. Per-block
  // batches keep a rebuild proportional to one block and let a block be freed
  // the moment it leaves the ring.
  //
  // Generation is also spliced: at most BUDGET_MS of work per frame, so
  // crossing into new ground never stalls a frame.

  const BUDGET_MS = 6;
  const pending = []; // { cx, cz, far }

  // Far blocks get a distance haze so the skyline dissolves into the same
  // colour the sky carries near the horizon.
  const haze = { value: new THREE.Color(0.42, 0.47, 0.52) };
  const matCache = new Map();
  const farCache = new Map();

  function cityMat(name) {
    let m = matCache.get(name);
    if (m) return m;
    if (name === "__winLit") m = winLit;
    else if (name === "__winDim") m = winDim;
    else if (name === "__neonA") m = neonA;
    else if (name === "__neonB") m = neonB;
    else if (name === "__neonC") m = neonC;
    else if (name === "__glass") m = matFor(MAT.glass);
    else m = matFor(name);
    matCache.set(name, m);
    return m;
  }

  function farMat(name) {
    let m = farCache.get(name);
    if (m) return m;
    const base = cityMat(name);
    m = base.clone();
    m.name = (base.name || name) + "_far";
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHazeCol = haze;
      sh.vertexShader =
        "varying float vHazeD;\n" +
        sh.vertexShader.replace(
          "#include <project_vertex>",
          "#include <project_vertex>\n  vHazeD = -(modelViewMatrix * vec4(transformed, 1.0)).z;",
        );
      sh.fragmentShader =
        "uniform vec3 uHazeCol; varying float vHazeD;\n" +
        sh.fragmentShader.replace(
          "#include <dithering_fragment>",
          "#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, smoothstep(80.0, 400.0, vHazeD) * 0.9);",
        );
    };
    m.customProgramCacheKey = () => "city-far";
    farCache.set(name, m);
    return m;
  }

  function buildCellGroup(geos, matOf, shadows) {
    const g = new THREE.Group();
    for (const [name, list] of geos) {
      const geo = merge(list);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, matOf(name));
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      g.add(m);
    }
    return g;
  }

  function addNear(cx, cz) {
    const key = cx + "," + cz;
    if (nearCells.has(key)) return;
    // Reserve the slot first so a queued block is never built twice.
    const cell = { key, cx, cz, group: null, boxRefs: [] };
    nearCells.set(key, cell);
    const data = buildNear(cx, cz);
    cell.group = buildCellGroup(data.geos, cityMat, true);
    root.add(cell.group);
    for (const b of data.boxes) {
      cell.boxRefs.push(
        physics.addBox(b.min, b.max, { surface: b.surface, tag: "city" }),
      );
    }
    stats.cells = nearCells.size;
  }

  function removeNear(key) {
    const cell = nearCells.get(key);
    if (!cell) return;
    for (const b of cell.boxRefs) physics.removeBox(b);
    if (cell.group) {
      for (const m of cell.group.children) m.geometry.dispose();
      root.remove(cell.group);
    }
    nearCells.delete(key);
    stats.cells = nearCells.size;
  }

  // Far blocks are collected into one batch that is re-merged only when the
  // set of visible silhouette blocks changes. One draw call for the whole
  // horizon instead of hundreds.
  const farSet = new Set();
  let farDirty = true;
  let farGroup = null;
  const farCacheGeo = new Map(); // key -> [geometry] so re-merges never regenerate
  let lastFarBuild = -1e9;

  function addFar(cx, cz) {
    farSet.add("f" + cx + "," + cz);
    farDirty = true;
  }

  function removeFar(key) {
    if (farSet.delete(key)) farDirty = true;
  }

  function rebuildFarBatch() {
    if (!farDirty) return;
    farDirty = false;
    if (farGroup) {
      for (const m of farGroup.children) m.geometry.dispose();
      root.remove(farGroup);
      farGroup = null;
    }
    if (!farSet.size) return;
    const geos = new Map();
    for (const key of farSet) {
      let list = farCacheGeo.get(key);
      if (!list) {
        const [cx, cz] = key.slice(1).split(",").map(Number);
        list = buildFar(cx, cz);
        farCacheGeo.set(key, list);
      }
      // clone: merge() disposes its inputs, and the cache keeps them alive
      for (let i = 0; i < list.length; i++)
        bucket(geos, i % 2 === 0 ? "concrete_dirty" : "__farLit").push(list[i].clone());
    }
    farGroup = buildCellGroup(geos, farMat, false);
    farGroup.name = "city-horizon";
    root.add(farGroup);
  }

  function wanted(ccx, ccz) {
    const near = new Set();
    const far = new Set();
    for (let dx = -FAR; dx <= FAR; dx++)
      for (let dz = -FAR; dz <= FAR; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        // Skip any block whose built lot would overlap the port itself, so the
        // terminal is never built over and the gate opens onto a plaza.
        const lx = cx * CELL + ROAD;
        const lz = cz * CELL + ROAD;
        if (
          lx < RESERVED.x1 &&
          lx + CELL > RESERVED.x0 &&
          lz < RESERVED.z1 &&
          lz + CELL > RESERVED.z0
        )
          continue;
        const mx = cx * CELL + CELL / 2;
        if (mx > 24) continue; // east of the quay is water
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        if (ring <= NEAR) near.add(cx + "," + cz);
        else far.add(cx + "," + cz);
      }
    return { near, far };
  }

  let wantNear = new Set();
  let wantFar = new Set();
  let queued = 0;

  let farAnchor = null;
  function plan(ccx, ccz) {
    const w = wanted(ccx, ccz);
    wantNear = w.near;
    // widen the horizon window a little before rebuilding it
    if (!farAnchor || Math.abs(ccx - farAnchor.x) >= 2 || Math.abs(ccz - farAnchor.z) >= 2) {
      farAnchor = { x: ccx, z: ccz };
      wantFar = w.far;
    }
    for (const key of [...nearCells.keys()]) if (!wantNear.has(key)) removeNear(key);
    for (const key of [...farSet]) if (!wantFar.has(key.slice(1))) removeFar(key);
    // Queue what is missing, nearest first so the visible ring fills in first.
    pending.length = 0;
    const missing = [];
    for (const key of wantNear) if (!nearCells.has(key)) missing.push(key);
    for (const key of wantFar) if (!farSet.has("f" + key)) missing.push(key);
    const d = (key) => {
      const [cx, cz] = key.split(",").map(Number);
      return (cx - ccx) ** 2 + (cz - ccz) ** 2;
    };
    missing.sort((a, b) => d(a) - d(b));
    for (const key of missing) {
      const [cx, cz] = key.split(",").map(Number);
      pending.push({ cx, cz, far: !wantNear.has(key) });
    }
    queued = pending.length;
  }

  // Drain the queue within a per-frame time budget.
  function pump() {
    const t0 = performance.now();
    while (pending.length && performance.now() - t0 < BUDGET_MS) {
      const job = pending.shift();
      if (job.far) {
        if (wantFar.has(job.cx + "," + job.cz)) addFar(job.cx, job.cz);
      } else if (wantNear.has(job.cx + "," + job.cz)) addNear(job.cx, job.cz);
    }
    queued = pending.length;
    // The horizon batch is expensive to re-merge and upload; it only needs to
    // change when the player has actually travelled, and never more than about
    // once a second. A stale silhouette 300 m out is invisible.
    //
    // It used to run unconditionally here and cost ~80 ms in one go, which is a
    // visible hitch every time the player crossed a cell line. It now runs only
    // if the near-field queue finished and this frame still has budget left.
    if (
      farDirty &&
      pending.length === 0 &&
      performance.now() - lastFarBuild > 1100 &&
      performance.now() - t0 < BUDGET_MS * 0.5
    ) {
      lastFarBuild = performance.now();
      rebuildFarBatch();
    }
  }

  // ---- shadow follow -----------------------------------------------------

  const sun = game.render && game.render.sun;
  const sunDir = (game.render && game.render.sunDir) || new THREE.Vector3(0.9, 0.3, 0.3);
  const shadowTarget = new THREE.Vector3(0, 0, 0);
  let followOn = false;
  const SHADOW_SPAN = 62;

  function setShadowFollow(on, px, pz) {
    if (!sun) return;
    if (on === followOn) {
      if (on) moveShadow(px, pz);
      return;
    }
    followOn = on;
    const cam = sun.shadow.camera;
    if (on) {
      cam.left = -SHADOW_SPAN;
      cam.right = SHADOW_SPAN;
      cam.top = SHADOW_SPAN;
      cam.bottom = -SHADOW_SPAN;
      cam.near = 1;
      cam.far = 420;
      cam.updateProjectionMatrix();
      moveShadow(px, pz);
    }
  }

  function moveShadow(px, pz) {
    if (!sun) return;
    const step = 4;
    const tx = Math.round(px / step) * step;
    const tz = Math.round(pz / step) * step;
    if (Math.abs(tx - shadowTarget.x) < 0.01 && Math.abs(tz - shadowTarget.z) < 0.01) return;
    shadowTarget.set(tx, 0, tz);
    sun.target.position.copy(shadowTarget);
    sun.position.copy(shadowTarget).addScaledVector(sunDir, 220);
    sun.target.updateMatrixWorld(true);
    sun.updateMatrixWorld(true);
  }

  // ---- public ------------------------------------------------------------

  function inPort(px, pz) {
    return px > RESERVED.x0 - 2 && px < RESERVED.x1 + 2 && pz > RESERVED.z0 - 2 && pz < RESERVED.z1 + 2;
  }

  const api = {
    root,
    get active() {
      return active;
    },
    get stats() {
      let tris = 0;
      for (const c of nearCells.values())
        if (c.group)
          for (const m of c.group.children) tris += m.geometry.attributes.position.count / 3;
      if (farGroup)
        for (const m of farGroup.children) tris += m.geometry.attributes.position.count / 3;
      return {
        cells: stats.cells,
        far: farSet.size,
        queued,
        tris: Math.round(tris),
        shadowsFollow: followOn,
      };
    },
    // True once the player is out of the port; drives the radio line and the
    // bigger shadow frustum.
    get outside() {
      return !!lastCell && !inPort(lastCell.x, lastCell.z);
    },
    update(dt, playerPos) {
      if (!playerPos) return;
      lastCell = { x: playerPos.x, z: playerPos.z };
      const cx = Math.round(playerPos.x / CELL);
      const cz = Math.round(playerPos.z / CELL);
      if (!api._c || api._c.x !== cx || api._c.z !== cz) {
        api._c = { x: cx, z: cz };
        plan(cx, cz);
      }
      pump();
      setShadowFollow(!inPort(playerPos.x, playerPos.z), playerPos.x, playerPos.z);
    },
    // A spawn point for the pursuit waves: open ground 22-34 m out, behind the
    // player's back where possible.
    spawnPoint(playerPos, yaw) {
      const back = (yaw || 0) + Math.PI;
      for (let i = 0; i < 14; i++) {
        const a = back + (i / 14) * Math.PI * 2 + hash(i, 3, 7) * 0.7;
        const d = 22 + hash(i, 9, 5) * 12;
        const x = playerPos.x + Math.cos(a) * d;
        const z = playerPos.z + Math.sin(a) * d;
        if (z < RESERVED.z0 || z > RESERVED.z1) {
          if (!api.blockedAt(x, z)) return new THREE.Vector3(x, 0, z);
        } else if (x < RESERVED.x0 && !api.blockedAt(x, z)) {
          return new THREE.Vector3(x, 0, z);
        }
      }
      return new THREE.Vector3(playerPos.x + Math.cos(back) * 26, 0, playerPos.z + Math.sin(back) * 26);
    },
    blockedAt(x, z) {
      const boxes = physics.boxes;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.tag !== "city") continue;
        if (x > b.min.x - 0.5 && x < b.max.x + 0.5 && z > b.min.z - 0.5 && z < b.max.z + 0.5 && b.max.y > 0.5)
          return true;
      }
      return false;
    },
    // City material for the level's ground-surface query.
    surfaceAt() {
      return "concrete";
    },
    setEnabled(on) {
      active = !!on;
      root.visible = active;
    },
    dispose() {
      pending.length = 0;
      for (const key of [...nearCells.keys()]) removeNear(key);
      farSet.clear();
      farDirty = true;
      rebuildFarBatch();
    },
  };

  return api;
}

export const CITY_GRID = { CELL, NEAR, FAR, RESERVED };