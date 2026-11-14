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

// Every block you can physically reach must be the solid, collidered version.
// The old split was NET detailed blocks within +/-NEAR cells (about +/-80 m) and
// bare silhouettes beyond, which meant that past 80 m the city was scenery you
// walked straight through. The horizon layer now starts only past SOLID ring,
// and the fog closes well before it, so nothing interactive is ever a prop.
const SOLID = 5; // collidered blocks out to +/-SOLID cells (+/-200 m)
const FAR = 9; // flat silhouette blocks out to +/-FAR cells
const ROAD = 9; // road strip on the west and south edge of a block
const PAVE = 2.4; // pavement band around a lot
const KERB = 0.14;

// The fixed level's footprint: no city here. x0 is the west fence line, not
// the old -44 ring road — the city's own pavement leaves a five metre verge
// outside the fence, and testing the whole 40 m cell instead of its lot used
// to push the first solid block another 40 m west, leaving a strip of static
// backdrop scenery that the player could walk straight through.
const RESERVED = { x0: -38, x1: 28, z0: -36, z1: 34 };
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

  // ---- the static backdrop ----------------------------------------------
  //
  // The fixed port ships with a decorative terminal west of the fence: one
  // merged mesh (`skyline`) of container rows, sheds and cranes, built for the
  // view from behind a closed gate. Opening the gate put it inside the map.
  // It is scenery — every one of those containers is walk-through, and the
  // generated blocks grow straight through the rows because both occupy the
  // same ground. The endless city now owns everything west of the quay, so
  // cut the backdrop back to the far shore once, at startup. What is left is
  // only ever seen across the water, where the city never builds.
  {
    const KEEP_X = 24; // east of the city's build limit (wanted(): mx > 24)
    // `skyline` is a group of merged meshes, `backdrop-lamps` is a mesh; clip
    // every mesh under either name.
    const meshes = [];
    for (const name of ["skyline", "backdrop-lamps"]) {
      const top = scene.getObjectByName(name);
      if (top) top.traverse((o) => { if (o.isMesh) meshes.push(o); });
    }
    for (const m of meshes) {
      const g = m.geometry;
      if (!g || !g.attributes.position) continue;
      const src = g.index ? g.toNonIndexed() : g;
      const pos = src.attributes.position;
      const tris = Math.floor(pos.count / 3);
      const keep = [];
      for (let t = 0; t < tris; t++) {
        const cx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
        if (cx >= KEEP_X) keep.push(t);
      }
      if (keep.length === tris) {
        if (src !== g) m.geometry = src;
        continue;
      }
      if (!keep.length) {
        m.visible = false;
        continue;
      }
      const out = new THREE.BufferGeometry();
      for (const key of Object.keys(src.attributes)) {
        const a = src.attributes[key];
        const item = a.itemSize;
        const arr = new Float32Array(keep.length * 3 * item);
        let w = 0;
        for (const t of keep)
          for (let v = 0; v < 3; v++) {
            const b = (t * 3 + v) * item;
            for (let k = 0; k < item; k++) arr[w++] = a.array[b + k];
          }
        out.setAttribute(key, new THREE.BufferAttribute(arr, item));
      }
      out.computeBoundingSphere();
      m.geometry = out;
      if (src !== g) src.dispose();
      g.dispose();
    }
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

  // ---- one block ----------------------------------------------------------
  //
  // A block is laid out ONCE, by planBlock(), and then drawn at whatever detail
  // level is being asked for. The plan owns every solid volume in the block:
  // the yard fence, the container stacks, the drums, the tower bodies, the
  // street furniture, the lamp mast. Both detail levels draw that same plan and
  // register their colliders through the same function, so a block can never
  // change shape underneath the player.
  //
  // That was the real bug behind "the containers are walk-through". The layout
  // used to be re-rolled per detail level: the massing build and the detailed
  // build each pulled the block out of their own random stream, so walking up
  // to a yard rebuilt it with the containers at different coordinates and, at
  // the inner ring, dropped a 2.2 m fence around it. Standing where the new
  // container landed meant standing inside a solid, and two overlapping boxes
  // then pushed the capsule back and forth every frame — you were inside the
  // container, and you could not get out. Detail now only adds decoration.

  const GAP = 0.16; // clearance between separate props
  const EPS = 0.001; // faces that merely touch are not an overlap

  // One occupancy registry per block. Every solid volume claims its footprint;
  // random props must find a free spot before they are drawn.
  function makeOcc() {
    const taken = [];
    const footprint = (w, d, x, z, ry) => {
      const c = Math.abs(Math.cos(ry));
      const s = Math.abs(Math.sin(ry));
      const hw = (w * c + d * s) / 2 + GAP;
      const hd = (w * s + d * c) / 2 + GAP;
      return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
    };
    const hit = (f, minY, maxY) => {
      for (const o of taken)
        if (
          f.minX < o.maxX &&
          f.maxX > o.minX &&
          f.minZ < o.maxZ &&
          f.maxZ > o.minZ &&
          minY < o.maxY - EPS &&
          maxY > o.minY + EPS
        )
          return true;
      return false;
    };
    return {
      free: (w, h, d, x, y, z, ry = 0) => !hit(footprint(w, d, x, z, ry), y - h / 2, y + h / 2),
      claim: (w, h, d, x, y, z, ry = 0) => {
        taken.push({ ...footprint(w, d, x, z, ry), minY: y - h / 2, maxY: y + h / 2 });
      },
      freeBox: (minX, minZ, maxX, maxZ, minY, maxY) => !hit({ minX, maxX, minZ, maxZ }, minY, maxY),
      claimBox: (minX, minZ, maxX, maxZ, minY, maxY) => {
        taken.push({ minX, maxX, minZ, maxZ, minY, maxY });
      },
    };
  }

  // A collider derived from a visible volume: inflated to MIN_SOLID on every
  // axis (a zero-thickness pane or a 6 cm pipe is otherwise walked through) and
  // widened to the swept footprint when the box is rotated. solid() uses this
  // too, so a planned collider and a drawn one can never drift apart.
  function boxCol(w, h, d, x, y, z, ry, surface) {
    const cw = Math.max(w, MIN_SOLID);
    const ch = Math.max(h, MIN_SOLID);
    const cd = Math.max(d, MIN_SOLID);
    if (Math.abs(ry) > 1e-3) {
      const c = Math.abs(Math.cos(ry));
      const s = Math.abs(Math.sin(ry));
      const sw = cw * c + cd * s;
      const sd = cw * s + cd * c;
      return {
        min: [x - sw / 2, y - ch / 2, z - sd / 2],
        max: [x + sw / 2, y + ch / 2, z + sd / 2],
        surface,
      };
    }
    return {
      min: [x - cw / 2, y - ch / 2, z - cd / 2],
      max: [x + cw / 2, y + ch / 2, z + cd / 2],
      surface,
    };
  }

  // ---- block layout ------------------------------------------------------

  function planBlock(cx, cz) {
    const r = stream(cx * 7 + 3, cz * 11 - 5);
    const occ = makeOcc();
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const lx = x0 + ROAD + PAVE * 0.5;
    const lz = z0 + ROAD + PAVE * 0.5;
    const lw = CELL - ROAD - PAVE * 1.5;
    const ld = CELL - ROAD - PAVE * 1.5;
    const baseY = KERB;
    const lot = { x: lx + 0.9, z: lz + 0.9, w: lw - 1.8, d: ld - 1.8 };
    const plan = {
      x0,
      z0,
      lx,
      lz,
      lw,
      ld,
      lot,
      baseY,
      type: "towers",
      fence: null,
      stacks: [],
      drums: [],
      towers: [],
      props: [],
      lamp: null,
    };

    const kind = r();
    if (kind < 0.22) {
      // ---- container yard ----
      plan.type = "yard";
      const fenceH = 2.2;
      const fw = MIN_SOLID;
      const x1 = lot.x + lot.w;
      const z1 = lot.z + lot.d;
      const fh = baseY + fenceH;
      plan.fence = { x0: lot.x, z0: lot.z, x1, z1, h: fenceH, fw, baseY };
      // One wall per side, and the four walls are claimed so no prop can be
      // dropped inside them.
      const walls = [
        { minX: lot.x, maxX: x1, minZ: lot.z - fw / 2, maxZ: lot.z + fw / 2 },
        { minX: lot.x, maxX: x1, minZ: z1 - fw / 2, maxZ: z1 + fw / 2 },
        { minX: lot.x - fw / 2, maxX: lot.x + fw / 2, minZ: lot.z, maxZ: z1 },
        { minX: x1 - fw / 2, maxX: x1 + fw / 2, minZ: lot.z, maxZ: z1 },
      ];
      for (const w of walls) occ.claimBox(w.minX, w.minZ, w.maxX, w.maxZ, 0, fh);

      for (let i = 0, n = r.int(2, 4); i < n; i++)
        for (let attempt = 0; attempt < 8; attempt++) {
          const cw = r.chance(0.5) ? 6.06 : 12.19;
          const cd = 2.44;
          const scx = lot.x + r.range(1, Math.max(1.2, lot.w - cw - 1)) + cw / 2;
          const scz = lot.z + r.range(2.5, Math.max(3, lot.d - cd - 1)) + cd / 2;
          const layers = r.int(1, 3);
          const stackH = 0.16 + layers * 2.59;
          if (!occ.free(cw, stackH, cd, scx, baseY + stackH / 2, scz)) continue;
          const mats = [];
          for (let k = 0; k < layers; k++)
            mats.push(r.chance(0.5) ? "paint_red" : r.chance(0.5) ? "paint_blue" : "paint_teal");
          occ.claim(cw, stackH, cd, scx, baseY + stackH / 2, scz);
          plan.stacks.push({ cw, cd, layers, cx: scx, cz: scz, mats, h: stackH });
          break;
        }

      // Drums: 90 cm tall, so they need a footprint or you walk through them.
      // They carry a collider at every detail level, so they are planned here
      // and simply drawn at both levels.
      for (let i = 0, n = r.int(2, 5); i < n; i++)
        for (let attempt = 0; attempt < 8; attempt++) {
          const dx = lot.x + r.range(1, lot.w - 1);
          const dz = lot.z + r.range(1, lot.d - 1);
          const top = baseY + 0.16 + 0.9;
          if (!occ.free(0.6, top, 0.6, dx, top / 2, dz)) continue;
          const mat = r.chance(0.5) ? "paint_yellow" : "paint_green";
          occ.claim(0.6, top, 0.6, dx, top / 2, dz);
          plan.drums.push({ x: dx, z: dz, mat });
          break;
        }
    } else {
      // ---- towers ----
      const cols = kind < 0.6 ? 1 : 2;
      const rows = r() < 0.5 ? 1 : 2;
      const cw = lot.w / cols;
      const cd = lot.d / rows;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if (cols * rows > 1 && r() < 0.16) continue;
          const pad = 1.2 + r() * 1.6;
          const w = Math.min(cw - pad, 26);
          const d = Math.min(cd - pad, 26);
          if (w < 3 || d < 3) continue;
          const tall = r.chance(0.55);
          const floors = tall ? r.int(4, 11) : r.int(1, 4);
          const fh = r.range(3.0, 3.6);
          const wall = r.pick([MAT.wallA, MAT.wallB, MAT.wallC, MAT.wallA, MAT.wallB]);
          const x = lot.x + i * cw + pad * 0.5 + w / 2;
          const z = lot.z + j * cd + pad * 0.5 + d / 2;
          plan.towers.push({ x, z, w, d, floors, fh, h: floors * fh, wall, tall });
          // The ground-floor plinth is 12 cm proud of the body, so the claim
          // is the plinth, not the body.
          occ.claimBox(x - w / 2 - 0.12, z - d / 2 - 0.12, x + w / 2 + 0.12, z + d / 2 + 0.12, baseY, baseY + floors * fh);
        }
    }

    // Street furniture along the road edge, planned like everything else so it
    // does not pop into existence when the block upgrades.
    for (let i = 0, n = r.int(0, 3); i < n; i++)
      for (let attempt = 0; attempt < 6; attempt++) {
        const px = x0 + ROAD - 1.1 + r.range(-0.5, 0.5);
        const pz = z0 + r.range(6, CELL - 4);
        const k = r();
        if (k < 0.4) {
          const ry = r.range(-0.4, 0.4);
          if (!occ.free(1.9, 1.35, 1.1, px, 0.68, pz, ry)) continue;
          occ.claim(1.9, 1.35, 1.1, px, 0.68, pz, ry);
          plan.props.push({ kind: "dumpster", x: px, z: pz, ry });
        } else if (k < 0.72) {
          const spots = [
            { x: px, z: pz },
            { x: px + 0.7, z: pz + 0.2 },
          ];
          if (!spots.every((s) => occ.free(0.36, 0.7, 0.36, s.x, 0.35, s.z))) continue;
          for (const s of spots) occ.claim(0.36, 0.7, 0.36, s.x, 0.35, s.z);
          plan.props.push({ kind: "bollards", spots });
        } else {
          const ry = r.range(0, 3);
          if (!occ.free(1.2, 1.1, 1.0, px, 0.55, pz, ry)) continue;
          occ.claim(1.2, 1.1, 1.0, px, 0.55, pz, ry);
          plan.props.push({ kind: "bin", x: px, z: pz, ry });
        }
        break;
      }

    // One light mast per block, on the pavement corner.
    {
      const mx = x0 + ROAD + 0.6;
      const mz = z0 + ROAD + 0.6;
      const h = r.range(7, 11);
      if (occ.free(0.22, h, 0.22, mx, h / 2, mz)) {
        occ.claim(0.22, h, 0.22, mx, h / 2, mz);
        plan.lamp = { x: mx, z: mz, h };
      }
    }

    return plan;
  }

  // Every collider in a block comes from here — once — so the massing build and
  // the detailed build expose exactly the same collision at ground level.
  function planColliders(plan) {
    const out = [];
    const { baseY } = plan;
    if (plan.fence) {
      const f = plan.fence;
      const fh = baseY + f.h;
      const fw = f.fw;
      out.push(boxCol(f.x1 - f.x0, fh, fw, (f.x0 + f.x1) / 2, fh / 2, f.z0, 0, "metal"));
      out.push(boxCol(f.x1 - f.x0, fh, fw, (f.x0 + f.x1) / 2, fh / 2, f.z1, 0, "metal"));
      out.push(boxCol(fw, fh, f.z1 - f.z0, f.x0, fh / 2, (f.z0 + f.z1) / 2, 0, "metal"));
      out.push(boxCol(fw, fh, f.z1 - f.z0, f.x1, fh / 2, (f.z0 + f.z1) / 2, 0, "metal"));
    }
    for (const s of plan.stacks)
      out.push(boxCol(s.cw, s.h, s.cd, s.cx, baseY + s.h / 2, s.cz, 0, "metal"));
    for (const d of plan.drums) {
      const top = baseY + 0.16 + 0.9;
      out.push(boxCol(0.6, top, 0.6, d.x, top / 2, d.z, 0, "metal"));
    }
    for (const t of plan.towers) {
      out.push(boxCol(t.w, t.h, t.d, t.x, baseY + t.h / 2, t.z, 0, "concrete"));
      out.push(boxCol(t.w + 0.24, t.fh * 0.9, t.d + 0.24, t.x, baseY + t.fh * 0.45, t.z, 0, "concrete"));
    }
    for (const p of plan.props) {
      if (p.kind === "dumpster") out.push(boxCol(1.9, 1.35, 1.1, p.x, 0.68, p.z, p.ry, "metal"));
      else if (p.kind === "bollards") for (const s of p.spots) out.push(boxCol(0.36, 0.7, 0.36, s.x, 0.35, s.z, 0, "concrete"));
      else out.push(boxCol(1.2, 1.1, 1.0, p.x, 0.55, p.z, p.ry, "metal"));
    }
    if (plan.lamp) out.push(boxCol(0.22, plan.lamp.h, 0.22, plan.lamp.x, plan.lamp.h / 2, plan.lamp.z, 0, "metal"));
    return out;
  }

  // Massing: the same plan, drawn cheap. Same colliders as the detailed build
  // because both call planColliders(); only the geometry is simpler.
  function drawMassing(push, plan) {
    const { lot, baseY } = plan;
    push(MAT.pave, placed(boxGeo(plan.lw, KERB, plan.ld), plan.lx + plan.lw / 2, KERB / 2, plan.lz + plan.ld / 2));
    if (plan.fence) {
      // Yard floor: the 16 cm slab the containers stand on.
      push(MAT.dark, placed(boxGeo(plan.lot.w, 0.16, plan.lot.d), plan.lot.x + plan.lot.w / 2, baseY + 0.08, plan.lot.z + plan.lot.d / 2));
      const f = plan.fence;
      const fw = f.fw;
      push(MAT.metal, placed(boxGeo(f.x1 - f.x0, f.h, fw), (f.x0 + f.x1) / 2, baseY + f.h / 2, f.z0));
      push(MAT.metal, placed(boxGeo(f.x1 - f.x0, f.h, fw), (f.x0 + f.x1) / 2, baseY + f.h / 2, f.z1));
      push(MAT.metal, placed(boxGeo(fw, f.h, f.z1 - f.z0), f.x0, baseY + f.h / 2, (f.z0 + f.z1) / 2));
      push(MAT.metal, placed(boxGeo(fw, f.h, f.z1 - f.z0), f.x1, baseY + f.h / 2, (f.z0 + f.z1) / 2));
    }
    for (const s of plan.stacks)
      // s.h includes the 16 cm it stands on, so the drawn box starts at the
      // slab top: at baseY it was sunk into the yard slab and read as a
      // container clipping through the ground.
      push(s.mats[0], placed(boxGeo(s.cw, s.h - 0.16, s.cd), s.cx, baseY + 0.16 + (s.h - 0.16) / 2, s.cz));
    for (const d of plan.drums)
      push(d.mat, placed(boxGeo(0.6, 0.9, 0.6), d.x, baseY + 0.16 + 0.45, d.z)); // box, not a 10-segment cylinder: 12 tris at 40 m
    for (const t of plan.towers) {
      push(t.wall, placed(boxGeo(t.w, t.h, t.d), t.x, baseY + t.h / 2, t.z));
      push(MAT.wallC, placed(boxGeo(t.w + 0.24, t.fh * 0.9, t.d + 0.24), t.x, baseY + t.fh * 0.45, t.z));
    }
    for (const p of plan.props) {
      if (p.kind === "dumpster") push(MAT.dark, placed(boxGeo(1.9, 1.35, 1.1), p.x, 0.68, p.z, p.ry));
      else if (p.kind === "bollards") for (const s of p.spots) push(MAT.paintY, placed(boxGeo(0.36, 0.7, 0.36), s.x, 0.35, s.z));
      else push(MAT.metal, placed(boxGeo(1.2, 1.1, 1.0), p.x, 0.55, p.z, p.ry));
    }
    if (plan.lamp) push(MAT.dark, placed(boxGeo(0.22, plan.lamp.h, 0.22), plan.lamp.x, plan.lamp.h / 2, plan.lamp.z));
  }

  function drawFence(push, plan) {
    const f = plan.fence;
    const { baseY } = plan;
    const step = 3.2;
    for (let x = f.x0; x <= f.x1; x += step) {
      push(MAT.metal, placed(boxGeo(0.1, f.h, 0.1), x, baseY + f.h / 2, f.z0));
      push(MAT.metal, placed(boxGeo(0.1, f.h, 0.1), x, baseY + f.h / 2, f.z1));
    }
    // The corner posts are already emitted by the x loop above. Drawing them
    // again here puts two identical boxes in the same place, which z-fights.
    for (let z = f.z0 + step; z < f.z1 - 1e-6; z += step) {
      push(MAT.metal, placed(boxGeo(0.1, f.h, 0.1), f.x0, baseY + f.h / 2, z));
      push(MAT.metal, placed(boxGeo(0.1, f.h, 0.1), f.x1, baseY + f.h / 2, z));
    }
    push(MAT.metal, placed(boxGeo(f.x1 - f.x0, 0.08, 0.08), (f.x0 + f.x1) / 2, baseY + f.h, f.z0));
    push(MAT.metal, placed(boxGeo(f.x1 - f.x0, 0.08, 0.08), (f.x0 + f.x1) / 2, baseY + f.h, f.z1));
    push(MAT.metal, placed(boxGeo(0.08, 0.08, f.z1 - f.z0), f.x0, baseY + f.h, (f.z0 + f.z1) / 2));
    push(MAT.metal, placed(boxGeo(0.08, 0.08, f.z1 - f.z0), f.x1, baseY + f.h, (f.z0 + f.z1) / 2));
  }

  function drawYard(push, plan) {
    const { baseY } = plan;
    // Yard slab: a 16 cm platform, low enough to step onto, so no collider.
    push(MAT.dark, placed(boxGeo(plan.lot.w, 0.16, plan.lot.d), plan.lot.x + plan.lot.w / 2, baseY + 0.08, plan.lot.z + plan.lot.d / 2));
    drawFence(push, plan);
    for (const s of plan.stacks) {
      for (let k = 0; k < s.layers; k++) {
        const ch = 2.59;
        push(s.mats[k], placed(boxGeo(s.cw, ch, s.cd), s.cx, baseY + 0.16 + ch / 2 + k * ch, s.cz));
        // Corrugation ribs so the container is not a plain slab. They are 4 cm
        // proud of the wall and belong to the container's own collider, so they
        // are drawn only — a collider here would fight the container box.
        for (let i2 = 0; i2 < 4; i2++)
          push(
            MAT.metal,
            placed(boxGeo(s.cw * 0.9, 0.04, 0.08), s.cx, baseY + 0.16 + 0.5 + i2 * 0.55 + k * ch, s.cz + s.cd / 2 + 0.04),
          );
      }
    }
    for (const d of plan.drums) push(d.mat, placed(cylGeo(0.3, 0.9, 10), d.x, baseY + 0.16 + 0.45, d.z));
  }

  function drawProps(push, plan) {
    for (const p of plan.props) {
      if (p.kind === "dumpster") {
        push(MAT.dark, placed(boxGeo(1.9, 1.35, 1.1), p.x, 0.68, p.z, p.ry));
        push(MAT.paintY, placed(boxGeo(1.94, 0.1, 1.14), p.x, 1.38, p.z, p.ry));
      } else if (p.kind === "bollards") {
        for (const s of p.spots) push(MAT.paintY, placed(boxGeo(0.36, 0.7, 0.36), s.x, 0.35, s.z));
      } else {
        push(MAT.metal, placed(boxGeo(1.2, 1.1, 1.0), p.x, 0.55, p.z, p.ry));
        push(MAT.wood, placed(boxGeo(1.1, 0.14, 0.9), p.x, 1.17, p.z, p.ry));
      }
    }
  }

  function drawLamp(push, plan) {
    const l = plan.lamp;
    if (!l) return;
    push(MAT.dark, placed(boxGeo(0.22, l.h, 0.22), l.x, l.h / 2, l.z));
    push(MAT.dark, placed(boxGeo(1.5, 0.1, 0.1), l.x + 0.75, l.h - 0.1, l.z));
    push("__neonC", placed(boxGeo(0.7, 0.16, 0.4), l.x + 1.35, l.h - 0.25, l.z));
  }

  // Facade detail for one tower. The body and its plinth are drawn, not
  // registered: their colliders came from planColliders() and adding a second
  // set here is how a wall ends up with two boxes and a lip to snag on.
  function buildTower(push, solid, r, t, baseY) {
    const { w, d, h, floors, fh, wall, tall } = t;
    const cxw = t.x;
    const czw = t.z;
    push(wall, placed(boxGeo(w, h, d), cxw, baseY + h / 2, czw));
    // Ground-floor plinth: it sticks out 12 cm past the body on all sides.
    push(MAT.wallC, placed(boxGeo(w + 0.24, fh * 0.9, d + 0.24), cxw, baseY + fh * 0.45, czw));

    // Parapet lip. These are 36 cm bands sitting on the roof edge, above any
    // height a player can reach, so their colliders appearing with the detail
    // level cannot trap anyone.
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
          const wx = cxw + f.ox + (f.nz ? lx : 0);
          const wz = czw + f.oz + (f.nx ? -lx : 0);
          // A window is a thin solid pane, not a zero-thickness plane: a
          // plane disappears when seen from behind and reads as a decal.
          const pane = f.nz ? boxGeo(1.25, 1.55, 0.08) : boxGeo(0.08, 1.55, 1.25);
          const lit = r.chance(0.42);
          const name = lit ? (r.chance(0.55) ? "__winLit" : "__winDim") : "__glass";
          push(name, placed(pane, wx, y, wz));
          // frame reveal — the detail that makes a flat wall read as a facade
          if (r.chance(0.35))
            push(
              MAT.wallB,
              placed(boxGeo(f.nx ? 0.06 : 1.5, 0.1, f.nx ? 1.5 : 0.06), cxw + f.ox + (f.nz ? lx : 0), y - 0.9, czw + f.oz + (f.nx ? -lx : 0)),
            );
        }
      }
    }

    // Ground floor: roll-up door, awning, sometimes a neon sign. The door is a
    // 12 cm shutter let into the wall, so it is drawn but NOT given a collider
    // of its own — the body box already covers it.
    //
    // df.ox / df.oz already point AT the wall face, so everything here steps
    // out from that point along the face normal. Multiplying the face offset a
    // second time (the old df.ox * 1.9 / * 1.35) parked the awning and the
    // neon 2-4 m off the facade, hanging in mid-air over the street.
    const doorFace = r.int(0, 3);
    const df = faces[doorFace];
    const dl = df.len * 0.32;
    const nX = df.nx;
    const nZ = df.nz;
    const fx = cxw + df.ox; // a point on the wall face
    const fz = czw + df.oz;
    push(MAT.dark, placed(boxGeo(nX ? 0.12 : dl, 2.6, nX ? dl : 0.12), fx, baseY + 1.3, fz));
    // Both of these hang off the wall, so they are clamped to the building:
    // on a one-storey block a fixed 3.1 m awning or 4.4 m sign sits above the
    // roofline and floats in the air on its own.
    const wantsAwning = r.chance(0.5);
    if (wantsAwning && h > 3.4) {
      // Awning: a real ledge you can walk under. Half its 1.6 m depth out from
      // the face, so its inner edge sits on the wall instead of in the air.
      // Its collider sits at 3.1 m, far above the 1.8 m capsule, so it can
      // appear with the detail level without pushing a player around.
      const canopyW = nX ? 1.6 : dl + 1.2;
      const canopyD = nX ? dl + 1.2 : 1.6;
      solid(MAT.metal, canopyW, 0.16, canopyD, fx + nX * 0.8, baseY + 3.1, fz + nZ * 0.8, { surface: "metal" });
    }
    const wantsSign = r.chance(0.42);
    if (wantsSign && h > 3.6) {
      const neon = r.chance(0.5) ? "__neonA" : r.chance(0.5) ? "__neonB" : "__neonC";
      const nw = nX ? 0.14 : Math.min(dl * 1.1, 5);
      const nd = nX ? Math.min(dl * 1.1, 5) : 0.14;
      const signY = baseY + Math.min(4.4, h - 0.6);
      push(neon, placed(boxGeo(nw, 0.5, nd), fx + nX * 0.09, signY, fz + nZ * 0.09));
    }

    // a run of service pipes up one corner
    if (r.chance(0.6)) {
      const px = r.chance(0.5) ? cxw - w / 2 - 0.12 : cxw + w / 2 + 0.12;
      const pz = czw + r.range(-d / 3, d / 3);
      for (let k = 0; k < 2; k++) push(MAT.dark, placed(cylGeo(0.09, h * 0.9, 6), px + k * 0.22, baseY + h * 0.45, pz));
    }

    // rooftop clutter: AC blocks, a tank, an antenna, a stair bulkhead
    const roofY = baseY + h;
    // Roof kit shares the slab with the tower body, so the body cannot be used
    // as an occupancy test. Give the roof its own registry: without it the AC
    // units, tank and stair bulkhead land at independent random points and
    // interpenetrate.
    const roofTaken = [];
    const roofSpot = (rw, rd) => {
      const loX = cxw - w / 2 + rw / 2 + 1.2;
      const hiX = cxw + w / 2 - rw / 2 - 1.2;
      const loZ = czw - d / 2 + rd / 2 + 1.2;
      const hiZ = czw + d / 2 - rd / 2 - 1.2;
      if (loX >= hiX || loZ >= hiZ) return null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const rx = r.range(loX, hiX);
        const rz = r.range(loZ, hiZ);
        const hit = roofTaken.some(
          (o) =>
            rx - rw / 2 < o.x + o.w / 2 + 0.15 &&
            rx + rw / 2 > o.x - o.w / 2 - 0.15 &&
            rz - rd / 2 < o.z + o.d / 2 + 0.15 &&
            rz + rd / 2 > o.z - o.d / 2 - 0.15,
        );
        if (hit) continue;
        roofTaken.push({ x: rx, z: rz, w: rw, d: rd });
        return { x: rx, z: rz };
      }
      return null;
    };

    const ac = r.int(1, 4);
    for (let i = 0; i < ac; i++) {
      const bw = r.range(0.9, 2.1);
      const bd = r.range(0.8, 1.6);
      const bh = r.range(0.5, 1.1);
      // Claim the swept square so the rotated box stays inside its spot.
      const span = Math.hypot(bw, bd);
      const spot = roofSpot(span, span);
      const ry = r.range(0, Math.PI);
      if (spot) push(MAT.metal, placed(boxGeo(bw, bh, bd), spot.x, roofY + bh / 2, spot.z, ry));
    }
    if (r.chance(0.35) && Math.min(w, d) > 8) {
      const spot = roofSpot(2.6, 2.6);
      if (spot) {
        const tx = spot.x;
        const tz = spot.z;
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
    }
    if (r.chance(0.4)) {
      const spot = roofSpot(0.6, 0.6);
      // Mast height is random, so it is laid out from the roof up. Centring it
      // on a fixed point above the roof left the whole mast — and the arm on
      // top of it — hanging in the air.
      const mastH = r.range(3, 7);
      if (spot) {
        push(MAT.dark, placed(boxGeo(0.07, mastH, 0.07), spot.x, roofY + mastH / 2, spot.z));
        push(MAT.dark, placed(boxGeo(0.5, 0.05, 0.05), spot.x, roofY + mastH - 0.1, spot.z));
      }
    }
    if (r.chance(0.5)) {
      const spot = roofSpot(2.6, 2.2);
      if (spot) push(MAT.wallB, placed(boxGeo(2.6, 2.3, 2.2), spot.x, roofY + 1.15, spot.z));
    }
  }

  // ---- one block ---------------------------------------------------------

  function buildNear(cx, cz, detail = 2) {
    const plan = planBlock(cx, cz);
    const geos = new Map();
    const gc = [];
    const push = (bucketName, geo) => {
      bucket(geos, bucketName).push(geo);
      gc.push(geo);
    };
    const boxes = planColliders(plan);
    const solid = (name, w, h, d, x, y, z, opts = {}) => {
      const ry = opts.ry || 0;
      push(name, placed(boxGeo(w, h, d), x, y, z, ry));
      if (!opts.noCol) boxes.push(boxCol(w, h, d, x, y, z, ry, opts.surface || "concrete"));
    };

    if (detail < 2) {
      // Old road paint is skipped here on purpose: at 40 m it is a few pixels.
      drawMassing(push, plan);
      return { geos, boxes, gc };
    }

    // Detail decoration draws from its own stream, so adding or removing a
    // window, a rib or a roof unit can never move a container.
    const r = stream(cx * 13 + 5, cz * 29 - 3);

    push(MAT.pave, placed(boxGeo(plan.lw, KERB, plan.ld), plan.lx + plan.lw / 2, KERB / 2, plan.lz + plan.ld / 2));
    push(MAT.kerb, placed(boxGeo(plan.lw + 0.3, 0.06, 0.3), plan.lx + plan.lw / 2, KERB + 0.03, plan.lz + plan.ld));
    push(MAT.kerb, placed(boxGeo(0.3, 0.06, plan.ld + 0.3), plan.lx + plan.lw, KERB + 0.03, plan.lz + plan.ld / 2));

    // road paint on the west/south strips
    for (let k = 0; k < 3; k++) {
      const t = plan.z0 + 6 + k * 12;
      const dash = new THREE.PlaneGeometry(0.16, 4).rotateX(-Math.PI / 2);
      dash.translate(plan.x0 + ROAD * 0.5, 0.02, t);
      push(MAT.paintY, dash.toNonIndexed());
    }
    for (let k = 0; k < 3; k++) {
      const dash = new THREE.PlaneGeometry(4, 0.16).rotateX(-Math.PI / 2);
      dash.translate(plan.x0 + 20 + k * 6, 0.02, plan.z0 + ROAD * 0.5);
      push(MAT.paintY, dash.toNonIndexed());
    }

    if (plan.type === "yard") drawYard(push, plan);
    else for (const t of plan.towers) buildTower(push, solid, r, t, plan.baseY);
    drawProps(push, plan);
    drawLamp(push, plan);

    return { geos, boxes, gc };
  }

  // ---- silhouettes out to the horizon ------------------------------------

  function buildFar(cx, cz) {
    const r = stream(cx * 3 + 11, cz * 5 - 7);
    const out = [];
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    const blocks = r.int(1, 3);
    const taken = [];
    for (let i = 0; i < blocks; i++)
      for (let attempt = 0; attempt < 6; attempt++) {
        const w = r.range(12, 30);
        const d = r.range(12, 30);
        const h = r.range(9, 52);
        const x = x0 + r.range(3, CELL - w - 3) + w / 2;
        const z = z0 + r.range(3, CELL - d - 3) + d / 2;
        const box = {
          minX: x - w / 2,
          maxX: x + w / 2,
          minZ: z - d / 2,
          maxZ: z + d / 2,
        };
        if (taken.some((o) => box.minX < o.maxX && box.maxX > o.minX && box.minZ < o.maxZ && box.maxZ > o.minZ))
          continue;
        taken.push(box);
        out.push({ geo: placed(boxGeo(w, h, d), x, h / 2, z), lit: false });
        if (r.chance(0.55)) {
          // A lit band is a thin solid box on one of the four faces. A
          // zero-thickness plane has no volume, vanishes when seen from
          // behind and, rotated 90 degrees but still offset on +Z, cuts
          // straight through the building it belongs to.
          const face = r.int(0, 3);
          const band = face < 2 ? w * 0.8 : d * 0.8;
          const by = r.range(4, Math.max(4.5, h - 2));
          const t = 0.08;
          let geo;
          if (face === 0) geo = placed(boxGeo(band, 0.5, t), x, by, z - d / 2 - t / 2);
          else if (face === 1) geo = placed(boxGeo(band, 0.5, t), x, by, z + d / 2 + t / 2);
          else if (face === 2) geo = placed(boxGeo(t, 0.5, band), x - w / 2 - t / 2, by, z);
          else geo = placed(boxGeo(t, 0.5, band), x + w / 2 + t / 2, by, z);
          out.push({ geo, lit: true });
        }
        break;
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

  // Detail level for a block, from its ring distance to the player.
  //   0-1 cells  -> 2 (full facade, windows, roof clutter, street props)
  //   2+ cells   -> 1 (solid massing: same collision, no micro-detail)
  // Both are collidered, so there is no radius beyond which you can walk
  // through the city — only one beyond which it stops being pretty up close.
  const DETAIL_RING = 1;
  let originCell = { x: 0, z: 0 };

  function detailFor(cx, cz) {
    return Math.max(Math.abs(cx - originCell.x), Math.abs(cz - originCell.z)) <= DETAIL_RING ? 2 : 1;
  }

  function addNear(cx, cz) {
    const key = cx + "," + cz;
    if (nearCells.has(key)) return;
    // Reserve the slot first so a queued block is never built twice.
    const cell = { key, cx, cz, group: null, boxRefs: [], detail: 0 };
    nearCells.set(key, cell);
    cell.detail = detailFor(cx, cz);
    const data = buildNear(cx, cz, cell.detail);
    cell.group = buildCellGroup(data.geos, cityMat, true);
    root.add(cell.group);
    for (const b of data.boxes) {
      cell.boxRefs.push(physics.addBox(b.min, b.max, { surface: b.surface, tag: "city" }));
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
      // clone: merge() disposes its inputs, and the cache keeps them alive.
      // Bucket by what the geometry actually is, not by array index: the old
      // index-parity split handed whole buildings the window material and
      // handed flat quads the concrete material whenever a block had no band.
      for (const item of list) bucket(geos, item.lit ? "__winLit" : "concrete_dirty").push(item.geo.clone());
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
        // terminal is never built over and the gate opens onto a street. The
        // lot is smaller than the cell: checking the cell (the old lx..lx+CELL)
        // rejected the block immediately west of the fence even though its
        // buildings stop five metres short of it, which is why the gate opened
        // onto a strip of non-solid backdrop instead of the city.
        const lx = cx * CELL + ROAD + PAVE * 0.5 + 0.9;
        const lz = cz * CELL + ROAD + PAVE * 0.5 + 0.9;
        const ls = CELL - ROAD - PAVE * 1.5 - 1.8;
        if (lx < RESERVED.x1 && lx + ls > RESERVED.x0 && lz < RESERVED.z1 && lz + ls > RESERVED.z0) continue;
        const mx = cx * CELL + CELL / 2;
        if (mx > 24) continue; // east of the quay is water
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        if (ring <= SOLID) near.add(cx + "," + cz);
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
        if (c.group) for (const m of c.group.children) tris += m.geometry.attributes.position.count / 3;
      if (farGroup) for (const m of farGroup.children) tris += m.geometry.attributes.position.count / 3;
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
      if (!playerPos || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) return;
      lastCell = { x: playerPos.x, z: playerPos.z };
      const cx = Math.round(playerPos.x / CELL);
      const cz = Math.round(playerPos.z / CELL);
      if (!api._c || api._c.x !== cx || api._c.z !== cz) {
        api._c = { x: cx, z: cz };
        originCell = { x: cx, z: cz };
        plan(cx, cz);
      }
      // A block that is now close enough to deserve full detail is rebuilt.
      // Cheap to test, and it only ever fires for the handful of blocks that
      // just entered the inner ring.
      for (const cell of nearCells.values()) {
        if (cell.detail === 2) continue;
        if (detailFor(cell.cx, cell.cz) < 2) continue;
        removeNear(cell.key);
        pending.unshift({ cx: cell.cx, cz: cell.cz, far: false });
        queued = pending.length;
        break;
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

export const CITY_GRID = { CELL, SOLID, FAR, RESERVED };
