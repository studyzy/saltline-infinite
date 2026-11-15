// Third-person operator avatar for the co-op teammate.
//
// Modelled after the CC BY 4.0 "Tactical Operator" reference in
// tools/dev/avatar-refs.html (1799danly): a light infantry operator in an olive
// field jacket, a black plate carrier with three tall magazine pouches, a tan
// tee at the waist, baggy cargo trousers with fabric knee pads, tan boots and a
// soft field cap over a balaclava. No helmet, no goggles — the silhouette reads
// as a soldier rather than a machine.
//
// The body is a set of continuous, smoothly skinned shells with real anatomy
// under the kit; every surface carries procedurally generated cloth/leather/
// metal maps with baked ambient occlusion, in the same spirit as the Hound's
// layered panels.
//
// The rig and animation follow the Hound (js/hound.js): a small bone tree, one
// merged SkinnedMesh per material, and per-frame procedural animation — no
// clips, no assets.

import * as THREE from "../../shared/three.js";
import { createWeaponProp, PAC9_SPEC } from "../../js/weapon.js";

// ---------------------------------------------------------------------------
// proportions (metres, feet on y = 0, facing -Z)
// ---------------------------------------------------------------------------

const HIP_Y = 0.95;
const HIP_DROP = 0.3; // crouch
const THIGH = 0.44;
const SHIN = 0.4;
const ANKLE_Y = 0.09;
const ANKLE_X = 0.105;
const THIGH_DROP = 0.05; // thigh bone sits this far below the hips bone
const STEP = {
  swing: 0.38, // fraction of the cycle spent in the air
  lift: 0.11,
  strideMin: 0.14,
  strideMax: 0.46,
};

// Olive field jacket and trousers, tan tee and boots, black carrier and webbing,
// and a teal team patch that doubles as the downed indicator.
const PALETTE = {
  cloth: 0x6b7452,
  cap: 0x6d6647,
  mask: 0x5c6146,
  gear: 0x494a37,
  webbing: 0x565741,
  leather: 0x2e2b24,
  rubber: 0x1b1c1c,
  metal: 0x7d858a,
  skin: 0x96694f,
  hair: 0x3a2f25,
  tee: 0xa08c61,
  boot: 0x8b7b56,
  glove: 0x6a6249,
  accent: 0x2ad4b0,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------------------------------------------------------------------------
// hashing and tileable noise (used by both the textures and the AO jitter)
// ---------------------------------------------------------------------------

const mod = (a, n) => ((a % n) + n) % n;

function ihash(x, y, s) {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// Periodic value noise: `f` is the integer lattice frequency, so the field
// wraps exactly at u/v = 1 and the resulting texture tiles seamlessly.
function vnoise(u, v, f, seed) {
  const x = u * f;
  const y = v * f;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = mod(xi, f);
  const x1 = mod(xi + 1, f);
  const y0 = mod(yi, f);
  const y1 = mod(yi + 1, f);
  const a = ihash(x0, y0, seed);
  const b = ihash(x1, y0, seed);
  const c = ihash(x0, y1, seed);
  const d = ihash(x1, y1, seed);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

function fbm(u, v, f, oct, seed) {
  let amp = 0.5;
  let sum = 0;
  let tot = 0;
  let fr = f;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u, v, fr, seed + i * 37);
    tot += amp;
    amp *= 0.5;
    fr *= 2;
  }
  return sum / tot;
}

// Periodic voronoi (used for leather grain): jittered grid, wraps at `f`.
function voronoi(u, v, f, seed) {
  const x = u * f;
  const y = v * f;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 8;
  let second = 8;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const jx = 0.15 + 0.7 * ihash(mod(cx, f), mod(cy, f), seed);
      const jy = 0.15 + 0.7 * ihash(mod(cx, f), mod(cy, f), seed + 91);
      const dx = cx + jx - x;
      const dy = cy + jy - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) {
        second = best;
        best = d;
      } else if (d < second) second = d;
    }
  }
  return second - best; // 0 at cell borders, larger inside a cell
}

// ---------------------------------------------------------------------------
// procedural texture sets
//
// Every map is greyscale-ish so the material colour stays in charge of hue —
// exactly how the Hound's material library tints its detail maps. `tile` is
// the physical size in metres that one repeat covers.
// ---------------------------------------------------------------------------

const TEX_SIZE = 256;

const TEX_SETS = {
  // Twill fatigues. The weave is deliberately low-contrast: at game distance a
  // strong albedo weave turns into moire, so most of the cloth reads through the
  // normal map and the roughness break-up instead.
  fabric: {
    tile: 0.16,
    bump: 1.1,
    shade: (u, v) => {
      const weave = Math.sin((u + v) * Math.PI * 2 * 22);
      const weft = Math.sin(v * Math.PI * 2 * 44);
      const fuzz = fbm(u, v, 90, 3, 11) - 0.5;
      const fade = fbm(u, v, 5, 4, 23);
      const h = 0.5 + weave * 0.055 + weft * 0.03 + fuzz * 0.12;
      const lum = 0.95 + weave * 0.008 + fuzz * 0.04 + (fade - 0.5) * 0.09;
      return { lum, rough: 0.88 - fuzz * 0.05, metal: 0, h };
    },
  },
  // Nylon webbing: wide, soft ribs plus dust. Fewer, larger ribs than a real
  // weave so it survives mip-mapping.
  nylon: {
    tile: 0.12,
    bump: 1.3,
    shade: (u, v) => {
      const rib = Math.sin(v * Math.PI * 2 * 14);
      const rib2 = Math.sin(u * Math.PI * 2 * 60 + v * 4);
      const dust = fbm(u, v, 6, 4, 7);
      const fine = fbm(u, v, 70, 3, 31) - 0.5;
      const h = 0.5 + rib * 0.24 + rib2 * 0.03 + fine * 0.08;
      return {
        lum: 0.95 + rib * 0.03 + fine * 0.05 + (dust - 0.5) * 0.1,
        rough: 0.72 - rib * 0.03 + dust * 0.1,
        metal: 0.02,
        h,
      };
    },
  },
  // Painted hard armour: paint over polymer, chipped to bare substrate. Chips
  // are small and sparse; large blobs read as camouflage instead of wear.
  armor: {
    tile: 0.4,
    bump: 0.8,
    shade: (u, v) => {
      const chip = fbm(u, v, 26, 5, 3);
      const fine = fbm(u, v, 70, 3, 17) - 0.5;
      const grime = fbm(u, v, 4, 4, 41);
      const scratchN = fbm(u, v, 14, 3, 5);
      const scratch = Math.abs(Math.sin((u * 3.1 + v * 1.7 + scratchN * 3) * 40));
      const sc = Math.max(0, 1 - scratch * 12) * (0.3 + 0.7 * fbm(u, v, 7, 3, 55));
      const sub = smoothstep(0.8, 0.86, chip);
      const prim = smoothstep(0.74, 0.79, chip) * (1 - sub);
      const lum = 0.97 - sub * 0.35 - prim * 0.04 - sc * 0.1 - (grime - 0.5) * 0.1;
      const h = 0.62 + fine * 0.05 - sub * 0.25 - prim * 0.03 - sc * 0.07;
      return {
        lum,
        rough: 0.55 + sub * 0.25 + sc * 0.18 + (grime - 0.5) * 0.08,
        metal: sub * 0.45,
        h,
      };
    },
  },
  // Glove/boot leather: pebbled grain with creases.
  leather: {
    tile: 0.19,
    bump: 1.2,
    shade: (u, v) => {
      const cell = voronoi(u, v, 40, 5);
      const grain = smoothstep(0.0, 0.4, cell);
      const crease = smoothstep(0.5, 0.8, fbm(u, v, 7, 4, 13));
      const fine = fbm(u, v, 80, 3, 21) - 0.5;
      const h = 0.45 + grain * 0.28 - crease * 0.16 + fine * 0.07;
      return {
        lum: 0.95 + (grain - 0.5) * 0.1 - crease * 0.08 + fine * 0.05,
        rough: 0.64 + (1 - grain) * 0.2 + crease * 0.08,
        metal: 0,
        h,
      };
    },
  },
  // Boot sole / rubber: dense granule.
  rubber: {
    tile: 0.14,
    bump: 1.0,
    shade: (u, v) => {
      const g = fbm(u, v, 60, 3, 61) - 0.5;
      const g2 = voronoi(u, v, 32, 71);
      return {
        lum: 0.95 + g * 0.1 + (g2 - 0.3) * 0.06,
        rough: 0.95 - g * 0.04,
        metal: 0,
        h: 0.5 + g * 0.3 + smoothstep(0.0, 0.3, g2) * 0.12,
      };
    },
  },
  // Rifle steel: brushed along u, oily, worn bright on high spots.
  gunmetal: {
    tile: 0.22,
    bump: 0.5,
    shade: (u, v) => {
      const brush = fbm(u * 1.0, v, 140, 2, 9) - 0.5;
      const brush2 = vnoise(u, v, 180, 4) - 0.5;
      const oil = smoothstep(0.45, 0.78, fbm(u, v, 5, 4, 29));
      const wear = smoothstep(0.66, 0.88, fbm(u, v, 13, 4, 33));
      const h = 0.5 + brush * 0.08 + wear * 0.05;
      return {
        lum: 0.94 + (brush + brush2) * 0.08 + wear * 0.16 - oil * 0.1,
        rough: 0.46 + oil * 0.08 - wear * 0.18 + (brush2 + 0.5) * 0.1,
        metal: 0.85,
        h,
      };
    },
  },
  // Injection-moulded furniture: fine stipple.
  polymer: {
    tile: 0.15,
    bump: 0.7,
    shade: (u, v) => {
      const stipple = smoothstep(0.35, 0.55, voronoi(u, v, 48, 87));
      const fine = fbm(u, v, 90, 3, 43) - 0.5;
      const wear = smoothstep(0.7, 0.9, fbm(u, v, 9, 4, 47));
      return {
        lum: 0.95 + fine * 0.07 + wear * 0.09,
        rough: 0.7 - stipple * 0.12 - wear * 0.14,
        metal: 0,
        h: 0.5 + stipple * 0.18 + fine * 0.07,
      };
    },
  },
  // Exposed skin (neck, wrists): fine pores, no colour of its own.
  skin: {
    tile: 0.09,
    bump: 0.4,
    shade: (u, v) => {
      const pores = voronoi(u, v, 60, 101);
      const fine = fbm(u, v, 80, 3, 11) - 0.5;
      const blush = fbm(u, v, 4, 3, 19);
      return {
        lum: 0.97 + fine * 0.06 + (blush - 0.5) * 0.08,
        rough: 0.64 + (1 - smoothstep(0, 0.4, pores)) * 0.06,
        metal: 0,
        h: 0.5 + smoothstep(0.0, 0.35, pores) * 0.12 + fine * 0.07,
      };
    },
  },
};

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeTexSet(def) {
  const n = TEX_SIZE;
  const albedo = new Uint8Array(n * n * 4);
  const orm = new Uint8Array(n * n * 4);
  const height = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const v = y / n;
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const s = def.shade(u, v);
      const i = (y * n + x) * 4;
      // Keep procedural maps neutral; vertex tint and material colour define the kit hierarchy.
      const l = clamp(s.lum, 0, 1.35) * 240;
      albedo[i] = clamp(l, 0, 255);
      albedo[i + 1] = clamp(l * 0.995, 0, 255);
      albedo[i + 2] = clamp(l * 0.985, 0, 255);
      albedo[i + 3] = 255;
      orm[i] = 255; // ao: baked per vertex instead
      orm[i + 1] = clamp(clamp(s.rough, 0, 1) * 255, 0, 255);
      orm[i + 2] = clamp(clamp(s.metal, 0, 1) * 255, 0, 255);
      orm[i + 3] = 255;
      height[y * n + x] = s.h;
    }
  }

  const normal = new Uint8Array(n * n * 4);
  const strength = def.bump ?? 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const l = height[y * n + mod(x - 1, n)];
      const r = height[y * n + mod(x + 1, n)];
      const d = height[mod(y - 1, n) * n + x];
      const u2 = height[mod(y + 1, n) * n + x];
      let nx = (l - r) * strength;
      let ny = (d - u2) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * n + x) * 4;
      normal[i] = clamp((nx * 0.5 + 0.5) * 255, 0, 255);
      normal[i + 1] = clamp((ny * 0.5 + 0.5) * 255, 0, 255);
      normal[i + 2] = clamp((nz * 0.5 + 0.5) * 255, 0, 255);
      normal[i + 3] = 255;
    }
  }

  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(
      data,
      n,
      n,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };

  const repeat = 1 / def.tile;
  const map = mk(albedo, true);
  map.repeat.set(repeat, repeat);
  const normalMap = mk(normal, false);
  normalMap.repeat.set(repeat, repeat);
  const ormMap = mk(orm, false);
  ormMap.repeat.set(repeat, repeat);

  return { map, normalMap, ormMap, tile: def.tile, bytes: n * n * 4 * 3 };
}

const texCache = new Map();

function texSet(name) {
  let set = texCache.get(name);
  if (!set) {
    set = makeTexSet(TEX_SETS[name]);
    texCache.set(name, set);
  }
  return set;
}

// ---------------------------------------------------------------------------
// geometry kit
//
// Everything is built with UVs in metres, so one texture repeat covers the same
// physical area on a sleeve, a pouch or a helmet, and all of them are indexed
// so the merged result stays cheap to skin and to bake AO on.
// ---------------------------------------------------------------------------

function loft(rings, seg = 24, opts = {}) {
  const { k = 1, bulge = null, capBottom = false, capTop = false } = opts;
  const n = rings.length;
  let rMean = 0;
  for (const r of rings) rMean += (r.rx + r.rz) * 0.5;
  rMean /= n;
  const uSpan = 2 * Math.PI * rMean;
  const y0 = rings[0].y;
  const pos = [];
  const uv = [];
  const idx = [];

  for (let i = 0; i < n; i++) {
    const ring = rings[i];
    const e = ring.k ?? k;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      let x = Math.sign(c) * Math.pow(Math.abs(c), e) * ring.rx;
      let z = Math.sign(s) * Math.pow(Math.abs(s), e) * ring.rz;
      if (bulge) {
        const m = bulge(a, ring.y, ring);
        x *= m;
        z *= m;
      }
      // A cap's lower edge is not a horizontal ring: it sits lower over the
      // ears and occiput than at the brow. `yShift` lets a single loft carry
      // that shaped edge.
      const y = ring.y + (opts.yShift ? opts.yShift(a, ring) : 0);
      pos.push((ring.cx || 0) + x, y, (ring.cz || 0) + z);
      uv.push((j / seg) * uSpan, y - y0);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + j;
      const d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capBottom) {
    const ring = rings[0];
    const ci = pos.length / 3;
    pos.push(ring.cx || 0, ring.y, ring.cz || 0);
    uv.push(0, 0);
    for (let j = 0; j < seg; j++) {
      idx.push(ci, j, (j + 1) % seg);
    }
  }
  if (capTop) {
    const base = (n - 1) * seg;
    const ring = rings[n - 1];
    const ci = pos.length / 3;
    pos.push(ring.cx || 0, ring.y, ring.cz || 0);
    uv.push(0, 0);
    for (let j = 0; j < seg; j++) {
      idx.push(ci, base + ((j + 1) % seg), base + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A loft stacked along Z instead of Y: rings are cross-sections in the XY
// plane. Boots, gloves and anything that runs heel-to-toe need this, because a
// vertical loft cannot express a forward toe box.
function loftZ(rings, seg = 20, opts = {}) {
  const { k = 1, capStart = false, capEnd = false } = opts;
  const n = rings.length;
  let rMean = 0;
  for (const r of rings) rMean += (r.rx + r.ry) * 0.5;
  rMean /= n;
  const uSpan = 2 * Math.PI * rMean;
  const z0 = rings[0].z;
  const pos = [];
  const uv = [];
  const idx = [];

  for (let i = 0; i < n; i++) {
    const ring = rings[i];
    const e = ring.k ?? k;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = Math.sign(c) * Math.pow(Math.abs(c), e) * ring.rx;
      const y = Math.sign(s) * Math.pow(Math.abs(s), e) * ring.ry;
      pos.push((ring.cx || 0) + x, (ring.cy || 0) + y, ring.z);
      uv.push((j / seg) * uSpan, Math.abs(ring.z - z0));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + j;
      const d = (i + 1) * seg + ((j + 1) % seg);
      // Rings run counter-clockwise in XY while Z decreases, so this winding
      // is what puts the normal on the outside of the tube.
      idx.push(a, c, b, b, c, d);
    }
  }
  for (const [cap, at, flip] of [
    [capStart, 0, true],
    [capEnd, (n - 1) * seg, false],
  ]) {
    if (!cap) continue;
    const ring = rings[at / seg];
    const ci = pos.length / 3;
    pos.push(ring.cx || 0, ring.cy || 0, ring.z);
    uv.push(0, 0);
    for (let j = 0; j < seg; j++) {
      if (flip) idx.push(ci, at + j, at + ((j + 1) % seg));
      else idx.push(ci, at + ((j + 1) % seg), at + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 沿任意折线放样圆润管体，用于连续手指、拇指和袖口边缘。
function tubeAlongPath(points, radii, radialSegments = 20, upHint = [1, 0, 0]) {
  const path = points.map((point) =>
    point.isVector3 ? point.clone() : new THREE.Vector3(point[0], point[1], point[2]),
  );
  const positions = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(...upHint);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let distance = 0;
  const circumference = 2 * Math.PI * radii.reduce((sum, radius) => sum + radius, 0) / radii.length;

  for (let i = 0; i < path.length; i++) {
    if (i > 0) distance += path[i].distanceTo(path[i - 1]);
    tangent.subVectors(
      path[Math.min(path.length - 1, i + 1)],
      path[Math.max(0, i - 1)],
    ).normalize();
    side.crossVectors(up, tangent);
    if (side.lengthSq() < 1e-8) side.set(0, 1, 0).cross(tangent);
    side.normalize();
    normal.crossVectors(tangent, side).normalize();
    const radius = radii[Math.min(i, radii.length - 1)];
    for (let j = 0; j < radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const radialX = Math.cos(angle) * radius;
      const radialY = Math.sin(angle) * radius;
      positions.push(
        path[i].x + side.x * radialX + normal.x * radialY,
        path[i].y + side.y * radialX + normal.y * radialY,
        path[i].z + side.z * radialX + normal.z * radialY,
      );
      uvs.push((j / radialSegments) * circumference, distance);
    }
  }

  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, b, c, b, d, c);
    }
  }
  for (const [ringIndex, flip] of [[0, true], [path.length - 1, false]]) {
    const centerIndex = positions.length / 3;
    positions.push(path[ringIndex].x, path[ringIndex].y, path[ringIndex].z);
    uvs.push(0, ringIndex ? distance : 0);
    const base = ringIndex * radialSegments;
    for (let j = 0; j < radialSegments; j++) {
      const next = base + ((j + 1) % radialSegments);
      if (flip) indices.push(centerIndex, next, base + j);
      else indices.push(centerIndex, base + j, next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 参考 weapon.js 的掌面放样，但使用人物世界坐标和有效米制 UV。
function buildGlovePalm(centerX, centerY, centerZ, scale = 1) {
  return loftZ(
    [
      { z: centerZ + 0.042 * scale, rx: 0.032 * scale, ry: 0.032 * scale, cx: centerX, cy: centerY, k: 0.84 },
      { z: centerZ + 0.028 * scale, rx: 0.042 * scale, ry: 0.038 * scale, cx: centerX, cy: centerY, k: 0.82 },
      { z: centerZ + 0.008 * scale, rx: 0.047 * scale, ry: 0.041 * scale, cx: centerX, cy: centerY - 0.002, k: 0.8 },
      { z: centerZ - 0.018 * scale, rx: 0.045 * scale, ry: 0.04 * scale, cx: centerX, cy: centerY - 0.004, k: 0.82 },
      { z: centerZ - 0.046 * scale, rx: 0.039 * scale, ry: 0.036 * scale, cx: centerX, cy: centerY - 0.008, k: 0.86 },
      { z: centerZ - 0.07 * scale, rx: 0.032 * scale, ry: 0.03 * scale, cx: centerX, cy: centerY - 0.012, k: 0.9 },
    ],
    28,
    { capStart: true, capEnd: true },
  );
}

// 拇指沿掌侧外展并回扣到握把，使用同样的连续管体拓扑。
function buildGloveThumb(centerX, centerY, centerZ, side, scale = 1) {
  const points = [
    [centerX + side * 0.032, centerY - 0.02, centerZ + 0.008],
    [centerX + side * 0.047, centerY - 0.014, centerZ + 0.017],
    [centerX + side * 0.053, centerY - 0.004, centerZ + 0.026],
    [centerX + side * 0.046, centerY + 0.008, centerZ + 0.034],
    [centerX + side * 0.034, centerY + 0.015, centerZ + 0.038],
  ].map(([x, y, z]) => [
    centerX + (x - centerX) * scale,
    centerY + (y - centerY) * scale,
    centerZ + (z - centerZ) * scale,
  ]);
  return tubeAlongPath(
    points,
    [0.014, 0.013, 0.0115, 0.0105, 0.008].map((r) => r * scale),
    20,
    [1, 0, 0],
  );
}

// Rounded box with a face-projected metre UV (crisp corners, no stretching on
// the large faces) — the Hound's workhorse plate primitive.
function rbox(w, h, d, r = 0.01, seg = 5) {
  r = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position;
  const nrm = g.attributes.normal;
  const uvs = g.attributes.uv;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const cx = clamp(x, -hw, hw);
    const cy = clamp(y, -hh, hh);
    const cz = clamp(z, -hd, hd);
    v.set(x - cx, y - cy, z - cz);
    if (v.lengthSq() > 1e-12) {
      v.normalize();
      p.setXYZ(i, cx + v.x * r, cy + v.y * r, cz + v.z * r);
    }
  }
  g.computeVertexNormals();
  const ax = Math.abs(nrm.getX(0));
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    if (nx >= ny && nx >= nz) uvs.setXY(i, p.getZ(i), p.getY(i));
    else if (ny >= nx && ny >= nz) uvs.setXY(i, p.getX(i), p.getZ(i));
    else uvs.setXY(i, p.getX(i), p.getY(i));
  }
  void ax;
  return g;
}

// Sphere with cylindrical-ish metre UVs (u = arc length around Y).
function sph(r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 20, hs = 14) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, uv.getX(i) * 2 * Math.PI * r * Math.max(sx, sz), p.getY(i) * sy);
  }
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

// Cylinder with metre UVs (u = circumference, v = height). `axis` orients it.
function cyl(rTop, rBot, h, seg = 12, opts = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, opts.hSeg || 1);
  const uv = g.attributes.uv;
  const p = g.attributes.position;
  const circ = Math.PI * (rTop + rBot);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * circ, p.getY(i));
  }
  return g;
}

function torus(r, tube, rad = 8, tub = 16, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(r, tube, rad, tub, arc);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * 2 * Math.PI * r, uv.getY(i) * 2 * Math.PI * tube);
  }
  return g;
}

// ---------------------------------------------------------------- transforms

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v3 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function place(g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, "YXZ");
  _q.setFromEuler(_e);
  _v3.set(x, y, z);
  _one.set(sx, sy, sz);
  _m4.compose(_v3, _q, _one);
  g.applyMatrix4(_m4);
  return g;
}

// Bend a plate around the Y axis so it hugs a torso. The plate's mid-surface is
// laid on a cylinder of radius `R` whose axis sits behind it, and the plate's
// own depth is carried along that radius, so the thickness survives the bend.
// A negative `R` wraps the other way (used for back plates).
function bendX(g, R, back = false) {
  const p = g.attributes.position;
  const sgn = back ? -1 : 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = x / R;
    const rr = R - z;
    p.setXYZ(i, sgn * rr * Math.sin(a), p.getY(i), sgn * (R - rr * Math.cos(a)));
  }
  g.computeVertexNormals();
  return g;
}

// Sweep a rectangular cross-section along a polyline: straps, belts, slings.
function ribbon(pts, width, thick, upHint = [0, 1, 0]) {
  const P = pts.map((p) =>
    Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p.clone(),
  );
  const pos = [];
  const uv = [];
  const idx = [];
  const up = new THREE.Vector3(...upHint);
  let run = 0;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(P.length - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    let side = new THREE.Vector3().crossVectors(t, up);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0).cross(t);
    side.normalize();
    const nrm = new THREE.Vector3().crossVectors(side, t).normalize();
    if (i > 0) run += p.distanceTo(P[i - 1]);
    for (const [sx, sy] of corners) {
      pos.push(
        p.x + side.x * sx * width * 0.5 + nrm.x * sy * thick * 0.5,
        p.y + side.y * sx * width * 0.5 + nrm.y * sy * thick * 0.5,
        p.z + side.z * sx * width * 0.5 + nrm.z * sy * thick * 0.5,
      );
      uv.push(sx * width * 0.5, run);
    }
  }
  for (let i = 0; i < P.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j;
      const b = i * 4 + ((j + 1) % 4);
      const c = (i + 1) * 4 + j;
      const d = (i + 1) * 4 + ((j + 1) % 4);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Caps.
  for (const [at, flip] of [
    [0, true],
    [(P.length - 1) * 4, false],
  ]) {
    const base = pos.length / 3;
    const p = P[at / 4];
    pos.push(p.x, p.y, p.z);
    uv.push(0, 0);
    for (let j = 0; j < 4; j++) {
      if (flip) idx.push(base, at + j, at + ((j + 1) % 4));
      else idx.push(base, at + ((j + 1) % 4), at + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A curved slab: still a box topology, but bowed in X and Y so plates and
// pouches sit on the body instead of floating.
function curvedPlate(w, h, d, r, curveX = 0, curveY = 0, seg = 5) {
  const g = rbox(w, h, d, r, seg);
  if (curveX || curveY) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const bx = curveX ? (x * x) / (curveX * 2) : 0;
      const by = curveY ? (y * y) / (curveY * 2) : 0;
      p.setXYZ(i, x, y, z + bx + by);
    }
    g.computeVertexNormals();
  }
  return g;
}

// ---------------------------------------------------------------------------
// rig — a compact port of the Hound's rig class (js/hound.js iu)
// ---------------------------------------------------------------------------

// Blend a chain of keyframes [[coord, boneName], ...] sorted ascending. Returns
// a weight function that yields two-bone blends inside each transition band, so
// joints bend as one continuous surface instead of rigid segments.
function chainKeys(keys) {
  return (x, y) => {
    if (y <= keys[0][0]) return [[keys[0][1], 1]];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (y >= a[0] && y <= b[0]) {
        if (a[1] === b[1]) return [[a[1], 1]];
        let t = (y - a[0]) / (b[0] - a[0] || 1e-6);
        t = t * t * (3 - 2 * t);
        if (t < 0.02) return [[a[1], 1]];
        if (t > 0.98) return [[b[1], 1]];
        return [
          [a[1], 1 - t],
          [b[1], t],
        ];
      }
    }
    return [[keys[keys.length - 1][1], 1]];
  };
}

class Rig {
  constructor() {
    this.bones = [];
    this.index = {};
    this.parts = [];
    this.slotOrder = [];
  }

  bone(name, parent, x = 0, y = 0, z = 0) {
    const p = parent ? this.bones[this.index[parent]] : null;
    if (parent && !p) throw new Error("avatar rig: unknown parent " + parent);
    const b = {
      name,
      parent: p ? p.i : -1,
      local: [x, y, z],
      world: [
        x + (p ? p.world[0] : 0),
        y + (p ? p.world[1] : 0),
        z + (p ? p.world[2] : 0),
      ],
      i: this.bones.length,
    };
    this.index[name] = b.i;
    this.bones.push(b);
    return b;
  }

  // `bind` is either a bone name (rigid) or a weight function (smooth skin).
  // Accept the older numeric shade form while keeping optional tint data alive.
  add(slot, bind, geo, opts = {}, legacyTint = null) {
    if (typeof opts === "number") opts = { shade: opts, tint: legacyTint };
    if (!opts || typeof opts !== "object") throw new TypeError("avatar part options must be an object");
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(geo.attributes.position.count * 2),
          2,
        ),
      );
    }
    this.parts.push({
      slot,
      geo,
      bind,
      shade: opts.shade ?? 1,
      tint: opts.tint || null,
      // AO is baked from the rest pose. Small inset parts (the eye slit, a
      // buckle in a pocket) would otherwise be blackened by their own socket,
      // so they can dial the bake down.
      ao: opts.ao ?? 1,
    });
    if (!this.slotOrder.includes(slot)) this.slotOrder.push(slot);
    return this;
  }

  // Bake vertex AO and skin weights, then merge each slot into one geometry.
  build(slots = this.slotOrder) {
    const parts = this.parts;
    const bi = this.index;

    // ---- occupancy grid over the whole rest pose ----
    const CELL = 0.018;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const part of parts) {
      if (!part.geo.boundingBox) part.geo.computeBoundingBox();
      const bb = part.geo.boundingBox;
      const mn = bb.min;
      const mx = bb.max;
      const mx2 = bb.max;
      if (mn.x < minX) minX = mn.x;
      if (mn.y < minY) minY = mn.y;
      if (mn.z < minZ) minZ = mn.z;
      if (mx2.x > maxX) maxX = mx2.x;
      if (mx2.y > maxY) maxY = mx2.y;
      if (mx2.z > maxZ) maxZ = mx2.z;
    }
    const ox = minX - 0.02;
    const oy = minY - 0.02;
    const oz = minZ - 0.02;
    const gx = Math.ceil((maxX - minX + 0.04) / CELL);
    const gy = Math.ceil((maxY - minY + 0.04) / CELL);
    const gz = Math.ceil((maxZ - minZ + 0.04) / CELL);
    const grid = new Uint8Array(gx * gy * gz);

    const mark = (x, y, z) => {
      const i = Math.floor((x - ox) / CELL);
      const j = Math.floor((y - oy) / CELL);
      const k = Math.floor((z - oz) / CELL);
      if (i < 0 || j < 0 || k < 0 || i >= gx || j >= gy || k >= gz) return;
      grid[(k * gy + j) * gx + i] = 1;
    };

    for (const part of parts) {
      const p = part.geo.attributes.position;
      const index = part.geo.index;
      const triCount = index ? index.count / 3 : p.count / 3;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let t = 0; t < triCount; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(p, i0);
        b.fromBufferAttribute(p, i1);
        c.fromBufferAttribute(p, i2);
        const e = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
        const n = Math.min(10, Math.max(1, Math.ceil(e / (CELL * 0.9))));
        for (let i = 0; i <= n; i++) {
          for (let j = 0; j <= n - i; j++) {
            const u = i / n;
            const v = j / n;
            const w = 1 - u - v;
            mark(
              a.x * w + b.x * u + c.x * v,
              a.y * w + b.y * u + c.y * v,
              a.z * w + b.z * u + c.z * v,
            );
          }
        }
      }
    }

    // Cosine-ish hemisphere directions in tangent space (z = surface normal).
    const DIRS = [
      [0, 0, 1],
      [0.62, 0, 0.78],
      [-0.62, 0, 0.78],
      [0, 0.62, 0.78],
      [0, -0.62, 0.78],
      [0.72, 0.72, 0.32],
      [-0.72, 0.72, 0.32],
      [0.72, -0.72, 0.32],
      [-0.72, -0.72, 0.32],
      [0.3, 0.95, 0.42],
    ];
    const STEPS = 7;
    // Start the rays clear of the vertex's own shell: the grid marks surfaces,
    // so a ray from the surface immediately re-enters its own cell and the
    // model would shade itself black.
    const LIFT = CELL * 1.9;
    const REACH = 0.13;

    const merged = {};
    for (const slot of slots) {
      const list = parts.filter((p) => p.slot === slot);
      if (!list.length) continue;
      const out = mergeParts(list, (part, geo, vi) => {
        const p = geo.attributes.position;
        const nrm = geo.attributes.normal;
        const x = p.getX(vi);
        const y = p.getY(vi);
        const z = p.getZ(vi);
        const nx = nrm.getX(vi);
        const ny = nrm.getY(vi);
        const nz = nrm.getZ(vi);

        // AO: march a few centimetres through the occupancy grid.
        let hits = 0;
        if (nx || ny || nz) {
          const t1 = new THREE.Vector3();
          const up = Math.abs(ny) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
          t1.crossVectors(up, new THREE.Vector3(nx, ny, nz)).normalize();
          const t2 = new THREE.Vector3(nx, ny, nz)
            .cross(t1)
            .normalize();
          const sx = x + nx * LIFT;
          const sy = y + ny * LIFT;
          const sz = z + nz * LIFT;
          for (const d of DIRS) {
            let blocked = false;
            for (let s = 1; s <= STEPS; s++) {
              const step = LIFT + (s / STEPS) * REACH;
              const px = sx + (t1.x * d[0] + t2.x * d[1] + nx * d[2]) * step;
              const py = sy + (t1.y * d[0] + t2.y * d[1] + ny * d[2]) * step;
              const pz = sz + (t1.z * d[0] + t2.z * d[1] + nz * d[2]) * step;
              const i = Math.floor((px - ox) / CELL);
              const j = Math.floor((py - oy) / CELL);
              const k = Math.floor((pz - oz) / CELL);
              if (i < 0 || j < 0 || k < 0 || i >= gx || j >= gy || k >= gz)
                continue;
              if (grid[(k * gy + j) * gx + i]) {
                blocked = true;
                break;
              }
            }
            if (blocked) hits++;
          }
        }
        // Contact shadows stay visible without crushing the dark tactical palette.
        const ao = 1 - (hits / DIRS.length) * 0.42 * part.ao;

        // A gentle sky term keeps upward-facing cloth from going flat.
        const sky = 0.84 + 0.16 * clamp(ny * 0.5 + 0.5, 0, 1);
        const jitter = 0.965 + 0.07 * ihash(x * 431, y * 397, z * 373);
        let cr = ao * sky * jitter * part.shade;
        let cg = cr;
        let cb = cr;
        if (part.tint) {
          cr *= part.tint[0];
          cg *= part.tint[1];
          cb *= part.tint[2];
        }

        // Skin weights.
        const w =
          typeof part.bind === "function" ? part.bind(x, y, z) : [[part.bind, 1]];
        const si = [0, 0, 0, 0];
        const sw = [0, 0, 0, 0];
        let total = 0;
        for (let m = 0; m < Math.min(4, w.length); m++) {
          si[m] = bi[w[m][0]];
          sw[m] = w[m][1];
          total += w[m][1];
        }
        if (total > 0) for (let m = 0; m < 4; m++) sw[m] /= total;
        return { cr, cg, cb, si, sw };
      });
      out.computeBoundingSphere();
      out.computeBoundingBox();
      merged[slot] = out;
    }

    return { slots: merged, bones: this.bones, tris: countTris(merged) };
  }
}

function countTris(slots) {
  let n = 0;
  for (const g of Object.values(slots))
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  return n;
}

// Merge parts that share a material into one indexed geometry, calling `extra`
// once per vertex to produce the per-vertex attributes.
function mergeParts(list, extra) {
  const geos = list.map((p) => (p.geo.index ? p.geo : indexify(p.geo)));
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const color = new Float32Array(vCount * 3);
  const skinIndex = new Uint16Array(vCount * 4);
  const skinWeight = new Float32Array(vCount * 4);
  const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);

  let vo = 0;
  let io = 0;
  for (let n = 0; n < geos.length; n++) {
    const g = geos[n];
    const part = list[n];
    const cnt = g.attributes.position.count;
    position.set(g.attributes.position.array, vo * 3);
    normal.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < cnt; i++) {
      const s = extra(part, g, i);
      color[(vo + i) * 3] = s.cr;
      color[(vo + i) * 3 + 1] = s.cg;
      color[(vo + i) * 3 + 2] = s.cb;
      skinIndex[(vo + i) * 4] = s.si[0];
      skinIndex[(vo + i) * 4 + 1] = s.si[1];
      skinIndex[(vo + i) * 4 + 2] = s.si[2];
      skinIndex[(vo + i) * 4 + 3] = s.si[3];
      skinWeight[(vo + i) * 4] = s.sw[0];
      skinWeight[(vo + i) * 4 + 1] = s.sw[1];
      skinWeight[(vo + i) * 4 + 2] = s.sw[2];
      skinWeight[(vo + i) * 4 + 3] = s.sw[3];
    }
    const idx = g.index;
    for (let i = 0; i < idx.count; i++) index[io + i] = idx.getX(i) + vo;
    vo += cnt;
    io += idx.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.BufferAttribute(color, 3));
  out.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
  out.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

// Convert a non-indexed geometry to an indexed one without merging coincident
// vertices (safe: only needed so the merge stays cheap on the GPU).
function indexify(g) {
  if (g.index) return g;
  const n = g.attributes.position.count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ---------------------------------------------------------------------------
// static two-bone arm IK, solved at build time so the hands stay welded
// ---------------------------------------------------------------------------

function solveArm(rig, armBone, target, pole, twist = 0) {
  const arm = rig.bones[rig.index[armBone]];
  const S = new THREE.Vector3(arm.world[0], arm.world[1], arm.world[2]);
  const T = new THREE.Vector3(target[0], target[1], target[2]);
  const d = T.clone().sub(S);
  const len = clamp(d.length(), 0.08, 0.56);
  d.normalize();

  const L1 = 0.29;
  const L2 = 0.275;
  const a = Math.acos(
    clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1),
  );

  const P = new THREE.Vector3(pole[0], pole[1], pole[2]).normalize();
  const perp = P.clone().addScaledVector(d, -P.dot(d)).normalize();
  const u = d
    .clone()
    .multiplyScalar(Math.cos(a))
    .addScaledVector(perp, Math.sin(a));

  const basisY = u.clone().negate();
  const basisX = new THREE.Vector3().crossVectors(basisY, perp);
  if (basisX.lengthSq() < 1e-8) basisX.set(1, 0, 0).cross(basisY);
  basisX.normalize();
  const basisZ = new THREE.Vector3().crossVectors(basisX, basisY).normalize();
  _m4.makeBasis(basisX, basisY, basisZ);

  const elbow = S.clone().addScaledVector(u, L1);
  const v = T.clone().sub(elbow).normalize();
  const armQ = new THREE.Quaternion().setFromRotationMatrix(_m4);
  // Swing the upper arm's direction onto the forearm target, then re-express it
  // under the upper arm. Deriving the forearm this way (rather than from a
  // signed elbow angle) keeps the twist continuous and puts the wrist exactly on
  // target, which is what welds the glove to the grip.
  const swing = new THREE.Quaternion().setFromUnitVectors(u, v);
  const foreWorldQ = swing.multiply(armQ);
  const bendQ = armQ.clone().invert().multiply(foreWorldQ);
  return { armQ, bendQ, foreWorldQ, elbow, L1, L2 };
}

// Orientation for a fist whose local +X is the axis of the gripped object and
// whose local +Z is the palm normal.
function gripQuat(axis, palm) {
  const x = new THREE.Vector3(...axis).normalize();
  const p = new THREE.Vector3(...palm);
  const z = p.clone().addScaledVector(x, -p.dot(x));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1);
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  _m4.makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(_m4);
}

// ---------------------------------------------------------------------------
// the rifle
//
// The carbine is the game's own PAC-9, the same one the player carries in first
// person (js/weapon.js). One shared prop is cloned onto each avatar's weapon
// bone, so the teammate's gun has the player's materials, markings and optic.
// PAC9_SPEC supplies the grip anchors, so hands and gun cannot disagree.
// ---------------------------------------------------------------------------

// Offset from the wrist bone to the centre of the fist, in hand-local space.
// bakePose() uses the same number to place the hand on the grip, so the glove
// and the rifle agree by construction.
const FIST_Y = -0.052;
const FIST_Z = 0.04;

const RIFLE = {
  // The viewmodel's pistol grip and handguard, in weapon space.
  pistolGrip: [
    PAC9_SPEC.grip[0],
    PAC9_SPEC.grip[1] + 0.028,
    PAC9_SPEC.grip[2] - 0.018,
  ],
  gripAxis: [0, -0.94, 0.34],
  gripPalm: [-0.1, -1, 0.05],
  handguard: [0, PAC9_SPEC.handguard[1] - 0.002, PAC9_SPEC.handguard[2] + 0.09],
  hgAxis: [0, 0, -1],
  hgPalm: [0.55, 1, 0.1],
  // Bone-local rest pose of the weapon relative to the chest.
  rest: { pos: [0.12, -0.1, -0.26], rot: [-0.32, 0.26, 0.08] },
  // Raised and canted for the sprint carry.
  sprint: { pos: [0.119, 0.054, -0.183], rot: [-0.5, 0.44, 0.28] },
};

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

function buildModel(gameMats) {
  // The rig needs the game's material library to build the rifle prop; keep it
  // on the rig so bakePose can reach it without threading an argument through.
  const rigMats = gameMats || null;
  const rig = new Rig();
  rig.gameMats = rigMats;

  rig.bone("root", null, 0, 0, 0);
  rig.bone("hips", "root", 0, HIP_Y, 0);
  rig.bone("spine", "hips", 0, 0.13, 0);
  rig.bone("chest", "spine", 0, 0.17, 0);
  rig.bone("neck", "chest", 0, 0.17, 0);
  rig.bone("head", "neck", 0, 0.09, 0);

  rig.bone("clavR", "chest", 0.05, 0.145, 0);
  rig.bone("armR", "clavR", 0.135, 0, 0);
  rig.bone("foreR", "armR", 0, -0.3, 0);
  rig.bone("handR", "foreR", 0, -0.275, 0);
  rig.bone("clavL", "chest", -0.05, 0.145, 0);
  rig.bone("armL", "clavL", -0.135, 0, 0);
  rig.bone("foreL", "armL", 0, -0.3, 0);
  rig.bone("handL", "foreL", 0, -0.275, 0);

  rig.bone("thighR", "hips", ANKLE_X, -THIGH_DROP, 0);
  rig.bone("shinR", "thighR", 0, -THIGH, 0);
  rig.bone("footR", "shinR", 0, -SHIN, 0);
  rig.bone("thighL", "hips", -ANKLE_X, -THIGH_DROP, 0);
  rig.bone("shinL", "thighL", 0, -THIGH, 0);
  rig.bone("footL", "shinL", 0, -SHIN, 0);

  rig.bone("weapon", "chest", ...RIFLE.rest.pos);

  // -------------------------------------------------------------------------
  // torso — field jacket over a tan tee, pelvis to trapezius
  //
  // Reference silhouette: broad padded shoulders, chest 0.31 wide, a waist that
  // pulls in to 0.23 under the carrier, then a short flare over the hips. The
  // jacket is one smoothly skinned shell so the lean and twist stay continuous.
  // -------------------------------------------------------------------------
  const torsoW = chainKeys([
    [0.72, "hips"],
    [1.0, "hips"],
    [1.09, "spine"],
    [1.18, "spine"],
    [1.27, "chest"],
    [1.7, "chest"],
  ]);
  rig.add(
    "cloth",
    torsoW,
    loft(
      [
        { y: 0.735, rx: 0.104, rz: 0.083 },
        { y: 0.78, rx: 0.118, rz: 0.092 },
        { y: 0.83, rx: 0.122, rz: 0.095 },
        { y: 0.88, rx: 0.119, rz: 0.093 },
        { y: 0.93, rx: 0.112, rz: 0.088 },
        { y: 0.98, rx: 0.106, rz: 0.084 },
        { y: 1.03, rx: 0.109, rz: 0.086 },
        { y: 1.09, rx: 0.119, rz: 0.092 },
        { y: 1.15, rx: 0.132, rz: 0.098 },
        { y: 1.21, rx: 0.142, rz: 0.103 },
        { y: 1.26, rx: 0.145, rz: 0.103 },
        { y: 1.305, rx: 0.146, rz: 0.101 },
        { y: 1.34, rx: 0.143, rz: 0.098 },
        { y: 1.37, rx: 0.132, rz: 0.093 },
        { y: 1.4, rx: 0.117, rz: 0.085 },
        { y: 1.43, rx: 0.1, rz: 0.077 },
        { y: 1.455, rx: 0.085, rz: 0.07 },
        { y: 1.475, rx: 0.075, rz: 0.065 },
      ],
      42,
      {
        k: 0.84,
        capBottom: true,
        capTop: true,
        bulge: (a, y) => {
          // The operator faces -Z: sin(a) is the front/back axis of a loft ring.
          const front = -Math.sin(a);
          const back = Math.sin(a);
          let m = 1;
          const pec = smoothstep(1.17, 1.22, y) * (1 - smoothstep(1.26, 1.31, y));
          if (pec > 0 && front > 0.2) m += 0.055 * pec * Math.pow(front, 2);
          const abs = smoothstep(0.98, 1.03, y) * (1 - smoothstep(1.1, 1.15, y));
          if (abs > 0 && front > 0.45) m += 0.016 * abs * Math.cos(y * 74) * front;
          const erect = smoothstep(0.94, 1.02, y) * (1 - smoothstep(1.16, 1.24, y));
          if (erect > 0 && back > 0.3)
            m += 0.022 * erect * Math.pow(back, 3) * Math.cos(a * 7);
          const blade = smoothstep(1.12, 1.18, y) * (1 - smoothstep(1.23, 1.28, y));
          if (blade > 0 && back > 0.5)
            m += 0.024 * blade * Math.pow(back, 2) * Math.abs(Math.cos(a * 4));
          return m;
        },
      },
    ),
  );

  // Tan tee showing between the carrier hem and the belt. Sits just proud of
  // the jacket so the layer break is readable at gameplay distance.
  rig.add(
    "tee",
    chainKeys([
      [0.97, "hips"],
      [1.02, "hips"],
      [1.06, "spine"],
    ]),
    loft(
      [
        { y: 0.975, rx: 0.108, rz: 0.087 },
        { y: 1.0, rx: 0.111, rz: 0.09 },
        { y: 1.025, rx: 0.11, rz: 0.089 },
        { y: 1.055, rx: 0.105, rz: 0.085 },
      ],
      36,
      {
        k: 0.84,
        bulge: (a, y) => 1 + 0.014 * Math.cos(y * 92) * (1 - Math.abs(Math.sin(a)) * 0.4),
      },
    ),
    { shade: 0.98 },
  );

  // Jacket collar: a short stand collar that hides the balaclava's lower edge.
  rig.add(
    "mask",
    chainKeys([
      [1.42, "chest"],
      [1.45, "neck"],
      [1.5, "neck"],
    ]),
    loft(
      [
        { y: 1.43, rx: 0.102, rz: 0.09 },
        { y: 1.455, rx: 0.094, rz: 0.083 },
        { y: 1.472, rx: 0.078, rz: 0.07 },
        { y: 1.492, rx: 0.073, rz: 0.066 },
        { y: 1.512, rx: 0.069, rz: 0.063 },
        { y: 1.532, rx: 0.065, rz: 0.06 },
      ],
      30,
      { k: 0.86 },
    ),
    { shade: 0.96 },
  );

  // -------------------------------------------------------------------------
  // head — balaclava and six-panel field cap (built in buildHead below)
  // -------------------------------------------------------------------------
  buildHead(rig);

  // -------------------------------------------------------------------------
  // plate carrier — black front/back bags over the olive jacket
  // -------------------------------------------------------------------------
  const chestW = () => [["chest", 1]];

  // Front plate bag: the lower half is wide (magazines ride on it), the upper
  // half narrows toward the sternum, which gives the carrier a neckline instead
  // of a slab across the collarbones.
  rig.add(
    "gear",
    chestW,
    place(
      bendX(curvedPlate(0.302, 0.21, 0.038, 0.026, 0.42, 0.8), 0.42),
      0,
      1.14,
      -0.118,
    ),
    1,
  );
  rig.add(
    "gear",
    chestW,
    place(
      bendX(curvedPlate(0.258, 0.1, 0.034, 0.022, 0.4, 0.8), 0.4),
      0,
      1.288,
      -0.117,
    ),
    0.97,
  );

  // Plate edging top and bottom.
  for (const [yy, w, sh] of [
    [1.338, 0.264, 0.84],
    [1.043, 0.31, 0.84],
    [1.238, 0.306, 0.8],
  ])
    rig.add(
      "gear",
      chestW,
      place(bendX(curvedPlate(w, 0.014, 0.046, 0.006, 0.42), 0.42), 0, yy, -0.119),
      sh,
    );
  // Back plate bag and drag handle.
  rig.add(
    "gear",
    chestW,
    place(
      bendX(curvedPlate(0.298, 0.31, 0.04, 0.014, 0.44, 0.8), 0.44, true),
      0,
      1.18,
      0.112,
    ),
    0.98,
  );
  rig.add(
    "webbing",
    chestW,
    place(bendX(curvedPlate(0.066, 0.09, 0.022, 0.007, -0.42), -0.42), 0, 1.31, 0.134),
    0.84,
  );
  rig.add(
    "webbing",
    chestW,
    place(rbox(0.012, 0.026, 0.006, 0.002), 0, 1.25, 0.136),
    0.8,
  );

  // Shoulder straps: wide, padded, arcing over the trapezius.
  for (const sx of [-1, 1]) {
    rig.add(
      "webbing",
      chestW,
      ribbon(
        [
          [sx * 0.064, 1.318, -0.13],
          [sx * 0.076, 1.378, -0.062],
          [sx * 0.08, 1.414, 0.0],
          [sx * 0.072, 1.378, 0.058],
          [sx * 0.06, 1.314, 0.108],
        ],
        0.058,
        0.016,
      ),
      0.94,
    );
    rig.add(
      "gear",
      chestW,
      place(rbox(0.05, 0.026, 0.018, 0.006), sx * 0.069, 1.355, -0.096, 0.5),
      0.88,
    );
    rig.add(
      "metal",
      chestW,
      place(rbox(0.03, 0.02, 0.011, 0.004), sx * 0.066, 1.318, -0.142),
      0.92,
    );
  }

  // Cummerbund around the lower ribs.
  rig.add(
    "gear",
    chestW,
    loft(
      [
        { y: 1.03, rx: 0.148, rz: 0.113 },
        { y: 1.075, rx: 0.154, rz: 0.117 },
        { y: 1.14, rx: 0.152, rz: 0.115 },
        { y: 1.2, rx: 0.149, rz: 0.112 },
        { y: 1.235, rx: 0.145, rz: 0.109 },
      ],
      36,
      { k: 0.82 },
    ),
    0.92,
  );

  // Three tall magazine pouches across the lower carrier. They are the single
  // strongest read in the reference silhouette, so they sit proud of the bag.
  for (const x of [-0.078, 0, 0.078]) {
    rig.add(
      "webbing",
      chestW,
      place(curvedPlate(0.07, 0.148, 0.05, 0.012, 0.28), x, 1.105, -0.155),
      0.97,
    );
    rig.add(
      "webbing",
      chestW,
      place(curvedPlate(0.072, 0.038, 0.056, 0.01, 0.28), x, 1.184, -0.156, 0.14),
      0.9,
    );
    rig.add(
      "webbing",
      chestW,
      place(rbox(0.014, 0.05, 0.007, 0.0025), x, 1.166, -0.186),
      0.78,
    );
    rig.add(
      "metal",
      chestW,
      place(rbox(0.019, 0.014, 0.007, 0.002), x, 1.181, -0.187),
      0.9,
    );
    for (const sy of [1.075, 1.125])
      rig.add(
        "webbing",
        chestW,
        place(rbox(0.062, 0.003, 0.004, 0.001), x, sy, -0.179),
        0.66,
      );
  }
  // Admin panel and IR patch above the mags.
  rig.add(
    "webbing",
    chestW,
    place(curvedPlate(0.152, 0.05, 0.026, 0.008, 0.32), 0, 1.258, -0.144),
    0.92,
  );
  rig.add(
    "webbing",
    chestW,
    place(rbox(0.03, 0.011, 0.006, 0.002), 0, 1.258, -0.159),
    0.8,
  );
  rig.add(
    "webbing",
    chestW,
    place(rbox(0.04, 0.013, 0.005, 0.002), 0.088, 1.3, -0.143),
    0.7,
  );
  // Sternum strap and a small PTT on the left strap.
  rig.add(
    "webbing",
    chestW,
    place(rbox(0.148, 0.018, 0.012, 0.004), 0, 1.305, -0.142),
    0.86,
  );
  rig.add(
    "gear",
    chestW,
    place(rbox(0.022, 0.03, 0.018, 0.005), -0.062, 1.335, -0.128, 0.2),
    0.9,
  );

  // -------------------------------------------------------------------------
  // belt and hip gear
  // -------------------------------------------------------------------------
  const hipsW = () => [["hips", 1]];
  rig.add(
    "webbing",
    hipsW,
    loft(
      [
        { y: 0.898, rx: 0.133, rz: 0.105 },
        { y: 0.922, rx: 0.137, rz: 0.108 },
        { y: 0.946, rx: 0.131, rz: 0.103 },
      ],
      28,
      { k: 0.86 },
    ),
    0.94,
  );
  rig.add(
    "metal",
    hipsW,
    place(rbox(0.05, 0.036, 0.012, 0.004), 0, 0.922, -0.108),
    0.92,
  );
  // Large utility pouch on his left hip, a smaller one on the right, a rear
  // pouch, and the drop-leg holster on the right thigh.
  rig.add(
    "webbing",
    hipsW,
    place(rbox(0.088, 0.078, 0.05, 0.012), -0.128, 0.878, -0.036, 0, 0.42),
    0.96,
  );
  rig.add(
    "webbing",
    hipsW,
    place(rbox(0.09, 0.022, 0.054, 0.006), -0.128, 0.918, -0.036, 0, 0.42),
    0.82,
  );
  rig.add(
    "webbing",
    hipsW,
    place(rbox(0.064, 0.062, 0.044, 0.01), 0.142, 0.882, 0.012, 0, -0.35),
    0.92,
  );
  rig.add(
    "webbing",
    hipsW,
    place(rbox(0.082, 0.078, 0.042, 0.011), 0.012, 0.872, 0.104, 0.08),
    0.9,
  );

  // -------------------------------------------------------------------------
  // arms — olive sleeves, a padded shoulder on the right, a unit patch left
  // -------------------------------------------------------------------------
  for (const [side, sx] of [
    ["R", 1],
    ["L", -1],
  ]) {
    const arm = "arm" + side;
    const fore = "fore" + side;
    const hand = "hand" + side;
    const aw = rig.bones[rig.index[arm]].world;
    const fw = rig.bones[rig.index[fore]].world;
    const hw = rig.bones[rig.index[hand]].world;
    const ax = aw[0];
    const AY = aw[1];
    const EY = fw[1];
    const WY = hw[1];

    // 上臂：参考里是沙色战斗衬衫的短袖，肩头再罩一层橄榄色护肩。
    rig.add(
      "tee",
      chainKeys([
        [EY + 0.06, arm],
        [EY + 0.16, arm],
      ]),
      loft(
        [
          { y: AY + 0.018, rx: 0.03, rz: 0.032, cx: ax * 0.62, cz: 0.002 },
          { y: AY - 0.006, rx: 0.049, rz: 0.052, cx: ax * 0.85, cz: 0.001 },
          { y: AY - 0.042, rx: 0.051, rz: 0.053, cx: ax },
          { y: AY - 0.1, rx: 0.047, rz: 0.049, cx: ax },
          { y: EY + 0.1, rx: 0.045, rz: 0.047, cx: ax },
          { y: EY + 0.055, rx: 0.043, rz: 0.045, cx: ax },
        ],
        28,
        {
          capBottom: true,
          bulge: (a, y) => 1 + 0.02 * Math.cos(y * 110) * (1 - Math.abs(Math.sin(a)) * 0.3),
        },
      ),
    );
    // 前臂：橄榄色卷起的袖子，肘部略鼓、腕部收口。
    rig.add(
      "cloth",
      chainKeys([
        [WY + 0.03, hand],
        [WY + 0.06, fore],
        [EY + 0.02, fore],
      ]),
      loft(
        [
          { y: EY + 0.028, rx: 0.053, rz: 0.055, cx: ax, cz: 0.002 },
          { y: EY, rx: 0.055, rz: 0.057, cx: ax, cz: 0.002 },
          { y: EY - 0.05, rx: 0.05, rz: 0.052, cx: ax },
          { y: EY - 0.1, rx: 0.047, rz: 0.049, cx: ax },
          { y: WY + 0.08, rx: 0.044, rz: 0.046, cx: ax },
          { y: WY + 0.035, rx: 0.039, rz: 0.041, cx: ax },
        ],
        26,
        { capBottom: true, bulge: (a, y) => 1 + 0.012 * Math.cos(y * 130) * Math.abs(Math.sin(a)) },
      ),
    );
    // 肘关节：小圆球盖住上臂与前臂之间的折角，避免弯曲时露出空腔。
    rig.add(
      "cloth",
      fore,
      sph(0.054, ax, EY, 0.002, 1.0, 1.0, 1.0, 18, 12),
      { shade: 0.9 },
    );
    // 肘垫：深橄榄色，贴在前臂上端后侧。
    rig.add(
      "gear",
      fore,
      place(curvedPlate(0.07, 0.075, 0.03, 0.018, 0.08, 0.22), ax + sx * 0.02, EY - 0.015, 0.046, 0.1, sx * 0.2, 0),
      { shade: 0.8 },
    );
    // 左臂的单位色标：薄片贴在袖子外侧，不再悬空。
    if (sx < 0)
      rig.add(
        "accent",
        arm,
        place(rbox(0.005, 0.046, 0.034, 0.002), ax - 0.048, AY - 0.125, -0.042),
        { shade: 1 },
      );

    // Wrist cuff.
    rig.add(
      "webbing",
      chainKeys([
        [WY - 0.02, hand],
        [WY + 0.012, fore],
      ]),
      loft(
        [
          { y: WY - 0.018, rx: 0.037, rz: 0.038, cx: ax },
          { y: WY + 0.014, rx: 0.039, rz: 0.04, cx: ax },
        ],
        18,
      ),
      0.9,
    );

    // ---- glove ----
    const handW = () => [[hand, 1]];
    const hx = ax;
    const wy = WY;
    const gy = wy + FIST_Y;
    const gz = FIST_Z;

    // Tan palm and back of hand.
    rig.add(
      "glove",
      handW,
      buildGlovePalm(hx, wy - 0.026, 0.014, 0.86),
      { shade: 0.97, tint: [1, 0.98, 0.92] },
    );
    // Black hard knuckle plate and a wrist strap.
    rig.add(
      "gear",
      handW,
      place(rbox(0.074, 0.04, 0.022, 0.009), hx, wy - 0.02, -0.002, 0, 0, sx * 0.08),
      { shade: 0.92 },
    );
    rig.add(
      "webbing",
      handW,
      place(rbox(0.064, 0.018, 0.012, 0.004), hx, wy - 0.05, 0.014, 0, 0, sx * 0.1),
      { shade: 0.84 },
    );
    // 握拳：四指并成一块圆角拳体，指节用细槽分开，比四根独立手指干净。
    rig.add(
      "leather",
      handW,
      place(rbox(0.07, 0.056, 0.062, 0.014, 6), hx, gy + 0.004, gz - 0.004, -0.28, 0, sx * 0.06),
      { shade: 0.95 },
    );
    for (let finger = 0; finger < 3; finger++)
      rig.add(
        "leather",
        handW,
        place(rbox(0.066, 0.0035, 0.005, 0.0012), hx, gy + 0.026 - finger * 0.017, gz + 0.026, -0.28),
        { shade: 0.55 },
      );
    // 拇指压住握把，保留参考里那根横搭的拇指。
    rig.add(
      "glove",
      handW,
      buildGloveThumb(hx, gy, gz, sx, 0.94),
      { shade: 0.94 },
    );
    // Glove cuff over the sleeve.
    rig.add(
      "webbing",
      handW,
      loft(
        [
          { y: WY - 0.022, rx: 0.039, rz: 0.04, cx: hx, cz: 0.012 },
          { y: WY + 0.004, rx: 0.043, rz: 0.043, cx: hx, cz: 0.012 },
          { y: WY + 0.022, rx: 0.041, rz: 0.041, cx: hx, cz: 0.012 },
        ],
        22,
        { k: 0.86 },
      ),
      0.9,
    );
  }

  // -------------------------------------------------------------------------
  // legs — baggy cargo trousers, olive knee pads, tan boots
  // -------------------------------------------------------------------------
  for (const [side, sx] of [
    ["R", 1],
    ["L", -1],
  ]) {
    const thigh = "thigh" + side;
    const shin = "shin" + side;
    const foot = "foot" + side;
    const lx = sx * ANKLE_X;

    rig.add(
      "cloth",
      chainKeys([
        [0.02, foot],
        [0.1, foot],
        [0.15, shin],
        [0.34, shin],
        [0.47, thigh],
        [0.8, thigh],
        [0.9, "hips"],
      ]),
      loft(
        [
          { y: 0.905, rx: 0.11, rz: 0.114, cx: lx, cz: 0.004 },
          { y: 0.87, rx: 0.114, rz: 0.117, cx: lx, cz: 0.002 },
          { y: 0.81, rx: 0.107, rz: 0.11, cx: lx },
          { y: 0.73, rx: 0.098, rz: 0.102, cx: lx },
          { y: 0.64, rx: 0.09, rz: 0.094, cx: lx },
          { y: 0.56, rx: 0.083, rz: 0.087, cx: lx },
          { y: 0.49, rx: 0.079, rz: 0.083, cx: lx },
          { y: 0.44, rx: 0.077, rz: 0.081, cx: lx },
          { y: 0.37, rx: 0.079, rz: 0.083, cx: lx },
          { y: 0.32, rx: 0.083, rz: 0.087, cx: lx },
          { y: 0.285, rx: 0.088, rz: 0.092, cx: lx },
          { y: 0.255, rx: 0.083, rz: 0.087, cx: lx },
          { y: 0.235, rx: 0.072, rz: 0.076, cx: lx },
        ],
        30,
        {
          bulge: (a, y) => {
            const front = -Math.sin(a);
            const back = Math.sin(a);
            let m = 1;
            const calf = smoothstep(0.22, 0.28, y) * (1 - smoothstep(0.32, 0.38, y));
            if (calf > 0 && back > 0) m += 0.075 * calf * back;
            // cloth folds above the blouse and behind the knee
            if (y < 0.3) m += 0.014 * Math.cos(y * 150) * Math.abs(back);
            if (y > 0.7 && front > 0.4) m += 0.012 * Math.cos(y * 90) * front;
            return m;
          },
        },
      ),
    );
    // Trousers bloused over the boot collar.
    rig.add(
      "cloth",
      chainKeys([
        [0.2, shin],
        [0.24, shin],
      ]),
      loft(
        [
          { y: 0.248, rx: 0.07, rz: 0.074, cx: lx },
          { y: 0.266, rx: 0.078, rz: 0.082, cx: lx },
          { y: 0.288, rx: 0.09, rz: 0.094, cx: lx },
          { y: 0.312, rx: 0.087, rz: 0.091, cx: lx },
        ],
        26,
        { k: 0.9 },
      ),
      { shade: 0.95 },
    );

    // Fabric knee pad with a raised centre and two retention bands.
    rig.add(
      "webbing",
      chainKeys([
        [0.4, shin],
        [0.44, shin],
        [0.47, thigh],
      ]),
      place(curvedPlate(0.108, 0.142, 0.038, 0.026, 0.12, 0.26), lx, 0.468, -0.062, 0.04),
      { shade: 0.74 },
    );
    rig.add(
      "cloth",
      chainKeys([
        [0.4, shin],
        [0.44, shin],
        [0.47, thigh],
      ]),
      place(curvedPlate(0.098, 0.124, 0.048, 0.024, 0.11, 0.24), lx, 0.47, -0.07, 0.04),
      { shade: 0.66 },
    );
    rig.add(
      "webbing",
      chainKeys([
        [0.39, shin],
        [0.42, shin],
      ]),
      place(rbox(0.096, 0.015, 0.052, 0.006), lx, 0.412, -0.058, 0.04),
      0.7,
    );

    // Left thigh cargo pocket (his left, -x), right thigh drop-leg holster.
    if (sx < 0) {
      rig.add(
        "cloth",
        chainKeys([
          [0.58, thigh],
          [0.72, thigh],
        ]),
        place(rbox(0.062, 0.108, 0.05, 0.01), lx - 0.066, 0.665, -0.004, 0, 0, 0.08),
        { shade: 0.95 },
      );
      rig.add(
        "cloth",
        chainKeys([[0.71, thigh]]),
        place(rbox(0.056, 0.024, 0.014, 0.004), lx - 0.066, 0.716, -0.03, 0, 0, 0.08),
        { shade: 0.9 },
      );
    } else {
      // Holster body and a pistol grip.
      rig.add(
        "gear",
        chainKeys([
          [0.58, thigh],
          [0.68, thigh],
        ]),
        place(rbox(0.048, 0.132, 0.07, 0.011), lx + 0.088, 0.66, 0.004, 0, 0, -0.06),
        { shade: 0.94 },
      );
      rig.add(
        "leather",
        chainKeys([[0.72, thigh]]),
        place(rbox(0.026, 0.052, 0.032, 0.008), lx + 0.084, 0.742, 0.014, -0.35),
        { shade: 0.95 },
      );
      // Two straps from the belt around the thigh.
      for (const yy of [0.79, 0.705])
        rig.add(
          "webbing",
          chainKeys([
            [yy - 0.02, thigh],
            [yy + 0.02, thigh],
          ]),
          loft(
            [
              { y: yy - 0.009, rx: 0.084, rz: 0.088, cx: lx },
              { y: yy + 0.009, rx: 0.086, rz: 0.09, cx: lx },
            ],
            22,
          ),
          0.82,
        );
      rig.add(
        "metal",
        chainKeys([[0.77, thigh]]),
        place(rbox(0.02, 0.014, 0.014, 0.004), lx + 0.058, 0.77, -0.052),
        { shade: 0.9 },
      );
    }

    // ---- boot ----
    const bootW = () => [[foot, 1]];
    const BX = lx;
    rig.add(
      "boot",
      bootW,
      loft(
        [
          { y: 0.284, rx: 0.068, rz: 0.072, cx: BX, cz: -0.004 },
          { y: 0.24, rx: 0.071, rz: 0.076, cx: BX, cz: -0.008 },
          { y: 0.19, rx: 0.073, rz: 0.08, cx: BX, cz: -0.012 },
          { y: 0.148, rx: 0.074, rz: 0.085, cx: BX, cz: -0.016 },
          { y: 0.105, rx: 0.072, rz: 0.087, cx: BX, cz: -0.02 },
        ],
        26,
        { k: 0.88 },
      ),
      0.97,
    );
    rig.add(
      "boot",
      bootW,
      loftZ(
        [
          { z: 0.078, rx: 0.048, ry: 0.05, cx: BX, cy: 0.07, k: 0.66 },
          { z: 0.05, rx: 0.056, ry: 0.058, cx: BX, cy: 0.068, k: 0.6 },
          { z: 0.008, rx: 0.061, ry: 0.058, cx: BX, cy: 0.064, k: 0.55 },
          { z: -0.045, rx: 0.062, ry: 0.05, cx: BX, cy: 0.054, k: 0.52 },
          { z: -0.098, rx: 0.061, ry: 0.038, cx: BX, cy: 0.045, k: 0.52 },
          { z: -0.145, rx: 0.058, ry: 0.028, cx: BX, cy: 0.037, k: 0.56 },
          { z: -0.176, rx: 0.053, ry: 0.021, cx: BX, cy: 0.032, k: 0.62 },
          { z: -0.192, rx: 0.048, ry: 0.018, cx: BX, cy: 0.03, k: 0.68 },
        ],
        30,
        { capStart: true, capEnd: true },
      ),
      0.96,
    );
    // Sole: dark rubber slab under the same outline.
    rig.add(
      "rubber",
      bootW,
      loftZ(
        [
          { z: 0.08, rx: 0.055, ry: 0.024, cx: BX, cy: 0.024, k: 0.65 },
          { z: 0.02, rx: 0.069, ry: 0.026, cx: BX, cy: 0.026, k: 0.6 },
          { z: -0.07, rx: 0.07, ry: 0.026, cx: BX, cy: 0.026, k: 0.58 },
          { z: -0.15, rx: 0.066, ry: 0.024, cx: BX, cy: 0.024, k: 0.6 },
          { z: -0.194, rx: 0.054, ry: 0.021, cx: BX, cy: 0.026, k: 0.7 },
        ],
        26,
        { capStart: true, capEnd: true },
      ),
      0.9,
    );
    // Tongue lying on the instep, with four lace rungs across it.
    rig.add(
      "boot",
      bootW,
      place(curvedPlate(0.056, 0.11, 0.014, 0.005, 0, 0.05), BX, 0.108, -0.072, 1.06),
      { shade: 0.66 },
    );
    for (let i = 0; i < 4; i++)
      rig.add(
        "webbing",
        bootW,
        place(
          rbox(0.052, 0.006, 0.007, 0.0018),
          BX,
          0.128 - i * 0.019,
          -0.058 - i * 0.022,
          1.12,
        ),
        1.02,
      );
    rig.add(
      "rubber",
      bootW,
      place(rbox(0.082, 0.03, 0.066, 0.008), BX, 0.028, 0.054, 0),
      0.8,
    );
    // 鞋头橡胶包边，把“拖鞋”前脸压暗。
    rig.add(
      "rubber",
      bootW,
      place(curvedPlate(0.096, 0.05, 0.02, 0.01, 0, 0.1), BX, 0.062, -0.168, 0.32),
      0.86,
    );
    rig.add(
      "boot",
      bootW,
      place(rbox(0.05, 0.05, 0.012, 0.006), BX, 0.078, 0.088, -0.12),
      0.9,
    );
    rig.add(
      "webbing",
      bootW,
      place(rbox(0.06, 0.013, 0.014, 0.005), BX, 0.245, -0.022, 0.12),
      0.8,
    );
    rig.add(
      "webbing",
      bootW,
      place(rbox(0.018, 0.03, 0.007, 0.003), BX, 0.247, 0.05, -0.14),
      0.76,
    );
  }

  // -------------------------------------------------------------------------
  // rifle + the two baked carry poses
  // -------------------------------------------------------------------------
  const weaponBone = rig.bones[rig.index.weapon];
  const readyWeapon = {
    pos: [weaponBone.local[0], weaponBone.local[1], weaponBone.local[2]],
    rot: RIFLE.rest.rot,
  };
  const sprintWeapon = {
    pos: [
      weaponBone.local[0] + RIFLE.sprint.pos[0],
      weaponBone.local[1] + RIFLE.sprint.pos[1],
      weaponBone.local[2] + RIFLE.sprint.pos[2],
    ],
    rot: RIFLE.sprint.rot,
  };

  // Bake a ladder of carry poses between ready and sprint. Blending adjacent
  // samples (rather than one big slerp) keeps the gloves welded to the rifle
  // through the whole raise: every sample is solved by the same IK, so the
  // interpolation error is a quarter of the arc instead of the whole arc.
  const CARRY_STEPS = 4;
  const readyQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(readyWeapon.rot[0], readyWeapon.rot[1], readyWeapon.rot[2], "YXZ"),
  );
  const sprintQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(sprintWeapon.rot[0], sprintWeapon.rot[1], sprintWeapon.rot[2], "YXZ"),
  );
  const samples = [];
  for (let i = 0; i <= CARRY_STEPS; i++) {
    const t = i / CARRY_STEPS;
    const q = readyQ.clone().slerp(sprintQ, t);
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    samples.push(
      bakePose(rig, {
        pos: [
          readyWeapon.pos[0] + (sprintWeapon.pos[0] - readyWeapon.pos[0]) * t,
          readyWeapon.pos[1] + (sprintWeapon.pos[1] - readyWeapon.pos[1]) * t,
          readyWeapon.pos[2] + (sprintWeapon.pos[2] - readyWeapon.pos[2]) * t,
        ],
        rot: [e.x, e.y, e.z],
      }),
    );
  }
  const poses = {
    ready: samples[0],
    sprint: samples[samples.length - 1],
    samples,
  };

  return { rig, poses };
}

// ---------------------------------------------------------------------------
// head
//
// The reference wears a snug olive balaclava under a soft six-panel cap, and
// almost nothing else: the only skin is a wide, shallow opening around the
// eyes. The cap crown stands nearly ten centimetres above its band and the
// brim juts out over the brow, which is what makes the silhouette read as a
// field cap rather than a helmet. The head shell is deeper front-to-back than
// it is wide, so it does not turn into a ball at gameplay distance.
// ---------------------------------------------------------------------------

const HEAD = {
  chin: 1.532,
  eyeY: 1.5915,
  cy: 1.614, // cranium centre the face surface is measured from
  rx: 0.082, // half-width
  ry: 0.101, // half-depth (front-to-back)
  rz: 0.1,
  capTop: 1.735,
};

// Point on the front of the head ellipsoid. The operator faces -Z, so forward
// is negative z.
function headFaceZ(x, y) {
  const q = 1 - (x / HEAD.rx) ** 2 - ((y - HEAD.cy) / HEAD.ry) ** 2;
  return -HEAD.rz * Math.sqrt(Math.max(0.02, q));
}

// A curved disc that hugs the head: concentric rings, each vertex projected
// onto the ellipsoid and pushed `offset` forward.
function facePatchGeo(cy, rx, ry, offset, rings = 4, seg = 30) {
  const pos = [];
  const uv = [];
  const idx = [];
  const push = (x, y) => {
    pos.push(x, y, headFaceZ(x, y) - offset);
    uv.push(x, y);
  };
  push(0, cy);
  for (let r = 1; r <= rings; r++) {
    const k = r / rings;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      push(Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let r = 0; r < rings - 1; r++) {
    const a0 = 1 + r * seg;
    const b0 = 1 + (r + 1) * seg;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Cap crown profile, shared by the shell and the panel seams. The crown is a
// tall dome: 17.6 cm wide and 21.4 cm deep at the band, closing over the scalp.
// The cap is a tall, nearly straight band with a shallow dome on top — not a
// single hemisphere. That split is what makes it read as a worn field cap.
const CROWN_RINGS = [
  { y: 1.592, rx: 0.0855, rz: 0.1035, cz: 0.004 },
  { y: 1.606, rx: 0.0862, rz: 0.1042, cz: 0.004 },
  { y: 1.62, rx: 0.0864, rz: 0.1044, cz: 0.005 },
  { y: 1.633, rx: 0.086, rz: 0.1038, cz: 0.006 },
  { y: 1.645, rx: 0.0848, rz: 0.1022, cz: 0.007 },
  { y: 1.656, rx: 0.0828, rz: 0.0996, cz: 0.008 },
  { y: 1.666, rx: 0.0794, rz: 0.0952, cz: 0.01 },
  { y: 1.675, rx: 0.0742, rz: 0.0888, cz: 0.012 },
  { y: 1.682, rx: 0.0666, rz: 0.0796, cz: 0.014 },
  { y: 1.688, rx: 0.0552, rz: 0.066, cz: 0.015 },
  { y: 1.6925, rx: 0.0392, rz: 0.047, cz: 0.016 },
  { y: 1.695, rx: 0.018, rz: 0.022, cz: 0.016 },
  { y: 1.696, rx: 0.004, rz: 0.005, cz: 0.016 },
];

// Visor built as a swept section rather than a bent box: the outline widens
// from the band to the tip and rounds off at the corners, the section wedges
// from thick at the band to thin at the edge, and the surface curls down toward
// the tip and the temples.
function brimGeo(width, length, thick, droop) {
  const NX = 12;
  const NT = 8;
  const pos = [];
  const uv = [];
  const idx = [];
  const halfWidth = (t) => {
    const grow = 0.74 + 0.26 * Math.sin(Math.min(1, t * 1.9) * Math.PI * 0.5);
    const round =
      t > 0.8 ? Math.sqrt(Math.max(0, 1 - 0.32 * ((t - 0.8) / 0.2) ** 2)) : 1;
    return (width / 2) * grow * round;
  };
  const topAt = (x, t, hw) =>
    0.004 - droop * t * t - 0.014 * (Math.abs(x) / hw) ** 2 * t;
  const thickAt = (t) => thick * (1 - 0.62 * t);

  // Two surfaces, top (y+) then bottom (y-), each a (NT+1) x (NX+1) grid.
  for (const side of [1, -1]) {
    for (let i = 0; i <= NT; i++) {
      const t = i / NT;
      const hw = halfWidth(t);
      for (let j = 0; j <= NX; j++) {
        const x = (-1 + (2 * j) / NX) * hw;
        const z = length / 2 - t * length;
        const y =
          side > 0
            ? topAt(x, t, hw)
            : topAt(x, t, hw) - thickAt(t);
        pos.push(x, y, z);
        uv.push(x, t * length);
      }
    }
  }
  const rowVerts = (NT + 1) * (NX + 1);
  const quad = (a, b, c, d, flip) => {
    if (flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  };
  for (let i = 0; i < NT; i++) {
    for (let j = 0; j < NX; j++) {
      const a = i * (NX + 1) + j;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      quad(a, b, c, d, false); // top
      quad(a + rowVerts, b + rowVerts, c + rowVerts, d + rowVerts, true); // bottom
    }
  }
  // Rim: stitch the top and bottom outlines together.
  const rimLoop = [];
  for (let j = 0; j <= NX; j++) rimLoop.push(j); // band edge
  for (let i = 1; i <= NT; i++) rimLoop.push(i * (NX + 1) + NX); // right edge
  for (let j = NX - 1; j >= 0; j--) rimLoop.push(NT * (NX + 1) + j); // tip edge
  for (let i = NT - 1; i >= 1; i--) rimLoop.push(i * (NX + 1)); // left edge
  for (let k = 0; k < rimLoop.length; k++) {
    const a = rimLoop[k];
    const b = rimLoop[(k + 1) % rimLoop.length];
    idx.push(a, b, a + rowVerts, b, b + rowVerts, a + rowVerts);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildHead(rig) {
  const headBind = () => [["head", 1]];
  // The gaiter has to follow the neck; everything from the jaw up is rigid on
  // the head bone so the cap and eye rim never shear.
  const headW = chainKeys([
    [1.455, "neck"],
    [1.49, "neck"],
    [1.548, "head"],
    [1.8, "head"],
  ]);

  // ---- balaclava shell ----
  rig.add(
    "mask",
    headW,
    loft(
      [
        { y: 1.506, rx: 0.045, rz: 0.05, cz: 0.002 },
        { y: 1.521, rx: 0.055, rz: 0.064, cz: -0.006 },
        { y: 1.535, rx: 0.058, rz: 0.073, cz: -0.012 },
        { y: 1.552, rx: 0.067, rz: 0.083, cz: -0.012 },
        { y: 1.568, rx: 0.074, rz: 0.092, cz: -0.007 },
        { y: 1.588, rx: 0.079, rz: 0.098, cz: -0.003 },
        { y: 1.608, rx: 0.0805, rz: 0.1, cz: -0.001 },
        { y: 1.628, rx: 0.0805, rz: 0.1, cz: 0.001 },
        { y: 1.648, rx: 0.0772, rz: 0.0966, cz: 0.003 },
        { y: 1.666, rx: 0.0692, rz: 0.0866, cz: 0.005 },
        { y: 1.681, rx: 0.0576, rz: 0.072, cz: 0.006 },
        { y: 1.691, rx: 0.0408, rz: 0.051, cz: 0.007 },
        { y: 1.696, rx: 0.018, rz: 0.0225, cz: 0.007 },
      ],
      44,
      {
        k: 0.9,
        capTop: true,
        bulge: (a, y) => {
          const front = -Math.sin(a);
          const back = Math.sin(a);
          let m = 1;
          // A real socket around the whole opening: the skin sits a couple of
          // millimetres below the lips of the mask, not on a sphere.
          const socket =
            smoothstep(1.548, 1.568, y) * (1 - smoothstep(1.62, 1.638, y));
          if (socket > 0 && front > 0.1)
            m -= 0.042 * socket * smoothstep(0.1, 0.5, front);
          // Nose bridge: narrow, and it grows through the bottom of the
          // opening so the mask edge dips between the eyes.
          const nose = smoothstep(1.568, 1.584, y) * (1 - smoothstep(1.598, 1.61, y));
          if (nose > 0 && front > 0.4)
            m += 0.06 * nose * Math.pow(front, 5);
          // Cheekbones beside the opening.
          const cheek =
            smoothstep(1.578, 1.594, y) * (1 - smoothstep(1.612, 1.628, y));
          if (cheek > 0 && front > 0.1)
            m +=
              0.02 *
              cheek *
              Math.pow(front, 2) *
              (0.35 + 0.65 * Math.abs(Math.cos(a)));
          // Chin and jaw.
          const chin =
            smoothstep(1.534, 1.546, y) * (1 - smoothstep(1.558, 1.57, y));
          if (chin > 0 && front > 0.2)
            m += 0.036 * chin * Math.pow(front, 3);
          // Occiput: the back of the skull, not a flat wall.
          const occ =
            smoothstep(1.596, 1.616, y) * (1 - smoothstep(1.642, 1.662, y));
          if (occ > 0 && back > 0.2)
            m += 0.014 * occ * Math.pow(back, 2);
          // Jawline: pull the back of the jaw in so the head sits on a neck
          // instead of flowing into it as one ball.
          const jaw =
            smoothstep(1.592, 1.566, y) * (1 - smoothstep(1.532, 1.548, y));
          if (jaw > 0 && back > 0.1) m -= 0.1 * jaw * Math.pow(back, 2);
          // Nose and mouth under the opening: a real ridge, so the profile does
          // not fall away as a smooth ball below the eyes.
          const noseLow =
            smoothstep(1.535, 1.552, y) * (1 - smoothstep(1.568, 1.582, y));
          if (noseLow > 0 && front > 0.5)
            m += 0.022 * noseLow * Math.pow(front, 4);
          // Mouth and chin creases under the mask.
          const mouth =
            smoothstep(1.552, 1.558, y) * (1 - smoothstep(1.564, 1.57, y));
          if (mouth > 0 && front > 0.4)
            m -= 0.02 * mouth * Math.pow(front, 2);
          const chinCrease =
            smoothstep(1.536, 1.54, y) * (1 - smoothstep(1.544, 1.55, y));
          if (chinCrease > 0 && front > 0.3)
            m -= 0.014 * chinCrease * front;
          // Cloth folds across the jaw and under the eye rim.
          m +=
            0.005 *
            Math.cos(a * 8 + y * 140) *
            smoothstep(1.54, 1.56, y) *
            (1 - smoothstep(1.596, 1.62, y));
          return m;
        },
      },
    ),
    { shade: 1 },
  );

  // ---- neck gaiter into the jacket collar ----
  rig.add(
    "mask",
    headW,
    loft(
      [
        { y: 1.452, rx: 0.06, rz: 0.068 },
        { y: 1.472, rx: 0.057, rz: 0.065 },
        { y: 1.494, rx: 0.053, rz: 0.061 },
        { y: 1.514, rx: 0.05, rz: 0.057 },
        { y: 1.53, rx: 0.048, rz: 0.053 },
      ],
      30,
      {
        k: 0.9,
        bulge: (a, y) => 1 + 0.014 * Math.cos(y * 150 + a * 3),
      },
    ),
    { shade: 0.95 },
  );

  // ---- eye opening ----
  // Skin patch, 11.6 cm wide and 4.2 cm tall: the only exposed skin. The bake
  // is dialled right down — the patch sits inside a real fabric socket and
  // would otherwise come out black.
  rig.add("skin", headBind, facePatchGeo(1.591, 0.062, 0.029, -0.001), {
    shade: 1,
    tint: [0.9, 0.83, 0.76],
    ao: 0.16,
  });

  // Fabric edge around the opening. Its top half disappears under the cap band,
  // which is exactly how the reference's brim cuts the opening off.
  {
    const pts = [];
    const seg = 36;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const x = Math.cos(a) * 0.0638;
      const y = 1.591 + Math.sin(a) * 0.0305;
      pts.push([x, y, headFaceZ(x, y) - 0.001]);
    }
    rig.add("mask", headBind, tubeAlongPath(pts, pts.map(() => 0.0031), 8, [0, 1, 0]), {
      shade: 0.82,
      ao: 0.5,
    });
  }

  // Eyes: sclera, iris, upper/lower lids, lash line, then a dark brow. The lids
  // overlap the eyeball so the opening reads as an almond, not a bead.
  for (const sx of [-1, 1]) {
    const ex = sx * 0.029;
    const ez = headFaceZ(ex, HEAD.eyeY) - 0.0005;
    rig.add(
      "eye",
      headBind,
      sph(0.0095, ex, HEAD.eyeY, ez, 1.0, 0.6, 0.45, 18, 12),
      { shade: 1, tint: [0.2, 0.16, 0.13], ao: 0.08 },
    );
    rig.add(
      "eye",
      headBind,
      sph(0.0048, ex, HEAD.eyeY - 0.0004, ez - 0.0042, 1.0, 1.0, 0.28, 12, 8),
      { shade: 0.95, tint: [0.03, 0.025, 0.02], ao: 0.05 },
    );
    rig.add(
      "skin",
      headBind,
      sph(0.0102, ex, HEAD.eyeY + 0.0072, ez + 0.0015, 1.02, 0.48, 0.48, 16, 10),
      { shade: 0.9, tint: [0.6, 0.54, 0.48], ao: 0.12 },
    );
    rig.add(
      "skin",
      headBind,
      sph(0.0098, ex, HEAD.eyeY - 0.0074, ez + 0.0018, 1.0, 0.42, 0.46, 16, 10),
      { shade: 1, tint: [0.62, 0.56, 0.5], ao: 0.12 },
    );
    // Upper lash line: a thin dark edge just above the eye.
    const lash = [];
    for (let i = 0; i <= 4; i++) {
      const x = ex + sx * (-0.0104 + i * 0.0052);
      const y = HEAD.eyeY + 0.0044 - Math.abs(i - 2) * 0.0006;
      lash.push([x, y, headFaceZ(x, y) - 0.0064]);
    }
    rig.add("hair", headBind, tubeAlongPath(lash, lash.map(() => 0.0008), 5, [0, 1, 0]), {
      shade: 0.8,
      ao: 0.05,
    });
    const browPts = [];
    const browY = [1.6125, 1.6132, 1.6126, 1.6112, 1.6094];
    for (let i = 0; i < 5; i++) {
      const x = sx * (0.0115 + i * 0.0096);
      const y = browY[i];
      browPts.push([x, y, headFaceZ(x, y) - 0.0032]);
    }
    rig.add(
      "hair",
      headBind,
      tubeAlongPath(browPts, [0.0028, 0.0034, 0.0031, 0.0024, 0.0015], 7, [0, 1, 0]),
      { shade: 0.6, ao: 0.15 },
    );
  }

  // ---- cap ----
  // One shell from the shaped lower edge to the crown: the edge rides at the
  // brow in front but drops over the ears and occiput, which is what separates
  // a field cap from a helmet liner.
  rig.add(
    "cap",
    headBind,
    loft(CROWN_RINGS, 44, {
      k: 0.9,
      capTop: true,
      yShift: (a, ring) => {
        if (ring.y > 1.63) return 0;
        const front = -Math.sin(a);
        const k = 1 - smoothstep(1.592, 1.63, ring.y);
        return k * (0.004 * Math.max(0, front) - 0.006 * Math.max(0, -front));
      },
    }),
    { shade: 1 },
  );

  // Six-panel seams: one meridian per panel, standing 0.5 mm proud. They start
  // above the shaped edge so none of them poke out under the cap.
  for (let k = 0; k < 6; k++) {
    const theta = -Math.PI / 2 + (k * Math.PI) / 3;
    const pts = [];
    for (let i = 2; i < CROWN_RINGS.length - 1; i++) {
      const r = CROWN_RINGS[i];
      pts.push([
        Math.cos(theta) * r.rx * 1.004,
        r.y,
        Math.sin(theta) * r.rz * 1.004 + r.cz,
      ]);
    }
    rig.add(
      "cap",
      headBind,
      tubeAlongPath(pts, pts.map(() => 0.0012), 6, [1, 0, 0]),
      { shade: 0.88 },
    );
  }

  // Vent eyelets, one per panel.
  for (let k = 0; k < 6; k++) {
    const theta = -Math.PI / 2 + Math.PI / 6 + (k * Math.PI) / 3;
    rig.add(
      "cap",
      headBind,
      sph(
        0.0024,
        Math.cos(theta) * 0.0836,
        1.63,
        Math.sin(theta) * 0.1012 + 0.005,
        1,
        1,
        0.45,
        8,
        6,
      ),
      { shade: 0.42 },
    );
  }

  // Sewn binding around the shaped lower edge, so the cap ends on a visible
  // seam instead of dissolving into the balaclava.
  {
    const pts = [];
    const seg = 44;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const front = -Math.sin(a);
      const y =
        1.592 + 0.004 * Math.max(0, front) - 0.006 * Math.max(0, -front);
      pts.push([
        Math.cos(a) * 0.082,
        y,
        Math.sin(a) * 0.0998 + 0.004,
      ]);
    }
    rig.add("cap", headBind, tubeAlongPath(pts, pts.map(() => 0.0022), 6, [0, 1, 0]), {
      shade: 0.7,
    });
  }

  // Brim: tapered visor seated on the cap's front edge.
  rig.add(
    "cap",
    headBind,
    place(brimGeo(0.174, 0.088, 0.018, 0.014), 0, 1.6175, -0.0985, -0.07),
    { shade: 0.9 },
  );

  // Crown button, and the stitched tab of the rear adjuster sitting flush on the
  // shell (no separate buckle: from behind it read as a floating dot).
  rig.add(
    "cap",
    headBind,
    place(cyl(0.0082, 0.009, 0.0042, 14), 0, 1.6975, 0.016),
    { shade: 0.82 },
  );
  rig.add(
    "cap",
    headBind,
    place(rbox(0.026, 0.012, 0.004, 0.0015), 0, 1.632, 0.1045),
    { shade: 0.72 },
  );
}

function bakePose(rig, wp) {
  // `wp.pos` is bone-local (relative to the chest); the IK works in model space,
  // so lift the weapon transform by the chest's rest offset first.
  const chest = rig.bones[rig.index.chest];
  const m = new THREE.Matrix4();
  _e.set(wp.rot[0], wp.rot[1], wp.rot[2], "YXZ");
  _q.setFromEuler(_e);
  _v3.set(
    wp.pos[0] + chest.world[0],
    wp.pos[1] + chest.world[1],
    wp.pos[2] + chest.world[2],
  );
  _one.set(1, 1, 1);
  m.compose(_v3, _q, _one);

  const weaponQ = _q.clone();

  // Grip anchors in world space, from the weapon transform.
  const pgLocal = new THREE.Vector3(...RIFLE.pistolGrip);
  const hgLocal = new THREE.Vector3(...RIFLE.handguard);
  const pg = pgLocal.clone().applyMatrix4(m);
  const hg = hgLocal.clone().applyMatrix4(m);
  const axisR = new THREE.Vector3(...RIFLE.gripAxis)
    .transformDirection(m)
    .normalize();
  const axisL = new THREE.Vector3(...RIFLE.hgAxis)
    .transformDirection(m)
    .normalize();
  const palmR = new THREE.Vector3(...RIFLE.gripPalm)
    .transformDirection(m)
    .normalize();
  const palmL = new THREE.Vector3(...RIFLE.hgPalm)
    .transformDirection(m)
    .normalize();

  const qR = gripQuat(axisR.toArray(), palmR.toArray());
  const qL = gripQuat(axisL.toArray(), palmL.toArray());

  // The fist's grip axis sits this far from the wrist, in hand-local space.
  const fistOffset = new THREE.Vector3(0, FIST_Y, FIST_Z);

  const wristR = pg.clone().sub(fistOffset.clone().applyQuaternion(qR));
  const wristL = hg.clone().sub(fistOffset.clone().applyQuaternion(qL));

  const armR = solveArm(rig, "armR", wristR.toArray(), [0.55, -0.64, -0.09], 0.1);
  const armL = solveArm(rig, "armL", wristL.toArray(), [-0.53, -0.89, 0.33], -0.1);

  // Both bones share the same parent (the chest), so the world orientation of
  // each is exactly its local rotation. The forearm's local rotation is the
  // elbow bend; the hand undoes that to reach the grip orientation.
  return {
    weapon: { pos: wp.pos.slice(), quat: weaponQ },
    armR: armR.armQ,
    foreR: armR.bendQ,
    handR: handLocal(armR.foreWorldQ, qR),
    armL: armL.armQ,
    foreL: armL.bendQ,
    handL: handLocal(armL.foreWorldQ, qL),
  };
}

// Express a desired hand world orientation as a local rotation under the
// forearm.
function handLocal(foreWorldQ, desiredWorldQ) {
  return foreWorldQ.clone().invert().multiply(desiredWorldQ);
}


// ---------------------------------------------------------------------------
// shared build cache: one set of geometry and textures for every teammate
// ---------------------------------------------------------------------------

const propCache = { mats: null, group: null };

// The rifle is the game's PAC-9. Its materials come from the game's material
// library when one is available (so the teammate's gun matches the player's),
// and fall back to the avatar's own metal so the preview page can run standalone.
function getWeaponProp(rigMats) {
  if (propCache.group && propCache.mats === rigMats) return propCache.group;
  try {
    const prop = createWeaponProp({ mats: rigMats || fallbackMatLib() });
    propCache.group = prop;
    propCache.mats = rigMats || null;
    return prop;
  } catch (err) {
    console.warn("[avatar] rifle prop unavailable: " + ((err && err.message) || err));
    return null;
  }
}

// A mats-compatible stub for contexts without the game's material library.
function fallbackMatLib() {
  return {
    get: () =>
      new THREE.MeshStandardMaterial({
        color: 0x2a2d30,
        roughness: 0.55,
        metalness: 0.7,
        vertexColors: true,
      }),
    emissive: () =>
      new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }),
    decal: () => ({ material: new THREE.MeshBasicMaterial(), aspect: 3 }),
    label: () => ({ material: new THREE.MeshBasicMaterial(), aspect: 3 }),
    names: [],
  };
}

const shared = {
  built: null,
  models: 0,
};

function acquire(game) {
  if (!shared.built) {
    shared.gameMats = (game && game.mats) || null;
    shared.built = buildModel(shared.gameMats);
  }
  shared.models++;
  return shared.built;
}

function releaseShared() {
  shared.models--;
  if (shared.models > 0) return;
  shared.models = 0;
  if (!shared.built) return;
  const { rig } = shared.built;
  for (const g of rig.geometries || []) g.dispose();
  shared.built.geometry.dispose?.();
  for (const set of texCache.values()) {
    set.map.dispose();
    set.normalMap.dispose();
    set.ormMap.dispose();
  }
  texCache.clear();
  shared.built = null;
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

function makeMats() {
  const mk = (
    texName,
    color,
    opts = {},
  ) => {
    const set = texSet(texName);
    const m = new THREE.MeshStandardMaterial({
      color,
      map: set.map,
      normalMap: set.normalMap,
      roughnessMap: set.ormMap,
      metalnessMap: set.ormMap,
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 0,
      vertexColors: true,
    });
    m.normalScale.set(opts.normal ?? 1, opts.normal ?? 1);
    return m;
  };

  return {
    cloth: mk("fabric", PALETTE.cloth, { roughness: 1.0, normal: 0.9 }),
    cap: mk("fabric", PALETTE.cap, { roughness: 1.0, normal: 0.85 }),
    mask: mk("fabric", PALETTE.mask, { roughness: 1.0, normal: 0.7 }),
    gear: mk("armor", PALETTE.gear, { roughness: 1.0, metalness: 0.12, normal: 0.85 }),
    webbing: mk("nylon", PALETTE.webbing, { roughness: 1.0, normal: 1.0 }),
    leather: mk("leather", PALETTE.leather, { roughness: 0.92, normal: 1.0 }),
    rubber: mk("rubber", PALETTE.rubber, { roughness: 1.0, normal: 0.8 }),
    metal: mk("gunmetal", PALETTE.metal, { roughness: 0.7, metalness: 0.85, normal: 0.7 }),
    tee: mk("fabric", PALETTE.tee, { roughness: 1.0, normal: 0.8 }),
    boot: mk("fabric", PALETTE.boot, { roughness: 1.0, normal: 0.5 }),
    glove: mk("fabric", PALETTE.glove, { roughness: 0.95, normal: 0.7 }),
    skin: new THREE.MeshStandardMaterial({
      color: PALETTE.skin,
      roughness: 0.78,
      metalness: 0,
      // A touch of warm bounce keeps the eye slit readable under the brim
      // without pretending the face is lit from inside.
      emissive: 0x1a0e07,
      emissiveIntensity: 0.35,
      vertexColors: true,
    }),
    hair: new THREE.MeshStandardMaterial({
      color: PALETTE.hair,
      roughness: 0.86,
      metalness: 0,
      vertexColors: true,
    }),
    eye: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0,
      vertexColors: true,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: PALETTE.accent,
      emissive: new THREE.Color(PALETTE.accent),
      emissiveIntensity: 1.4,
      roughness: 0.4,
      metalness: 0,
      vertexColors: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// avatar
// ---------------------------------------------------------------------------

export class Avatar {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = "mp-avatar";

    const built = acquire(game);
    const { rig, poses } = built;
    this.rig = rig;
    this.poses = poses;

    this.bones = rig.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.set(b.local[0], b.local[1], b.local[2]);
      return bone;
    });
    for (let i = 0; i < rig.bones.length; i++) {
      const parent = rig.bones[i].parent;
      if (parent >= 0) this.bones[parent].add(this.bones[i]);
    }
    this.group.add(this.bones[0]);
    this.group.updateMatrixWorld(true);

    // Bind in the rest pose, before any carry pose is applied, so the inverse
    // bind matrices do not capture the posed arms.
    this.skeleton = new THREE.Skeleton(this.bones);

    this.mats = makeMats();
    this.accentMat = this.mats.accent;

    // Build once, share the buffers; each avatar owns only its skeleton and
    // its own accent material (the team patch animates per player).
    if (!built.geometry) {
      const slots = [
        "cloth",
        "cap",
        "mask",
        "gear",
        "webbing",
        "leather",
        "rubber",
        "metal",
        "tee",
        "boot",
        "glove",
        "skin",
        "hair",
        "eye",
        "accent",
      ];
      built.geometry = buildMergedSlots(rig, slots);
      rig.geometries = Object.values(built.geometry);
    }

    this.geometries = [];
    for (const [slot, geo] of Object.entries(built.geometry)) {
      const mesh = new THREE.SkinnedMesh(geo, this.mats[slot]);
      mesh.name = "avatar-" + slot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.bind(this.skeleton, new THREE.Matrix4());
      this.group.add(mesh);
      this.geometries.push(geo);
    }

    // The rifle is the game's own PAC-9, attached rigidly to the weapon bone so
    // its materials, markings and optics are the ones the player sees in first
    // person. It is a plain child of the bone, not a skinned mesh, because the
    // whole gun is rigid.
    this.prop = getWeaponProp(this.game && this.game.mats);
    this.propOwned = false;
    if (this.prop) {
      const clone = this.prop.clone(true);
      // Materials are shared with the prop cache on purpose: the gun keeps its
      // PAC-9 finishes, and every teammate's rifle costs no extra material.
      this.propRoot = clone;
      this.propRoot.name = "avatar-rifle";
      clone.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
        }
      });
      this.bones[this.rig.index.weapon].add(clone);
    }

    // ---- animation state ----
    this.t = 0;
    this.speed = 0;
    this.phase = 0;
    this.crouchK = 0;
    this.downK = 0;
    this.gait = 0;
    this.sprintK = 0;
    this.lastPos = new THREE.Vector3(0, 0, 0);
    this.hasLast = false;
    this.state = "alive";
    this.hp = 100;

    this.applyPose(0);

    this.group.visible = false;
    game.scene.add(this.group);
  }

  // Blend between the ready and sprint carry poses. Both are baked with the
  // hands welded to the rifle, so the hands never leave it.
  applyPose(k) {
    const p = this.poses;
    const b = this.bones;
    const idx = this.rig.index;
    const kk = clamp(k, 0, 1);

    // Blend the two nearest baked carry samples. Endpoints are exact.
    const samples = p.samples;
    let from = p.ready;
    let to = p.sprint;
    let t = kk;
    if (samples) {
      const scaled = kk * (samples.length - 1);
      const i = Math.min(samples.length - 2, Math.floor(scaled));
      from = samples[i];
      to = samples[i + 1];
      t = scaled - i;
    }

    const weapon = b[idx.weapon];
    weapon.position.set(
      from.weapon.pos[0] + (to.weapon.pos[0] - from.weapon.pos[0]) * t,
      from.weapon.pos[1] + (to.weapon.pos[1] - from.weapon.pos[1]) * t,
      from.weapon.pos[2] + (to.weapon.pos[2] - from.weapon.pos[2]) * t,
    );
    if (t <= 0) weapon.quaternion.copy(from.weapon.quat);
    else if (t >= 1) weapon.quaternion.copy(to.weapon.quat);
    else weapon.quaternion.copy(from.weapon.quat).slerp(to.weapon.quat, t);

    const blend = (name) => {
      const bone = b[idx[name]];
      if (t <= 0) bone.quaternion.copy(from[name]);
      else if (t >= 1) bone.quaternion.copy(to[name]);
      else bone.quaternion.copy(from[name]).slerp(to[name], t);
    };
    blend("armR");
    blend("foreR");
    blend("handR");
    blend("armL");
    blend("foreL");
    blend("handL");
  }

  setState({ pos, yaw, pitch, crouch, state, hp, dt }) {
    const step = clamp(dt || 1 / 60, 1 / 240, 0.1);
    this.t += step;

    _v3.set(pos[0], pos[1], pos[2]);
    if (this.hasLast) {
      const inst = _v3.distanceTo(this.lastPos) / step;
      this.speed = damp(this.speed, inst > 12 ? 0 : inst, 9, step);
    }
    this.lastPos.copy(_v3);
    this.hasLast = true;

    this.group.visible = state !== "dead" && state !== "hidden";
    this.state = state || "alive";
    this.hp = hp == null ? 100 : hp;

    const down = state === "downed" || state === "dead";
    this.crouchK = damp(this.crouchK, crouch ? 1 : 0, 10, step);
    this.downK = damp(this.downK, down ? 1 : 0, 6.5, step);

    this.poseBody(pos, yaw || 0, pitch || 0, step);
  }

  poseBody(pos, yaw, pitch, dt) {
    const b = this.bones;
    const idx = this.rig.index;
    const hips = b[idx.hips];
    const spine = b[idx.spine];
    const chest = b[idx.chest];
    const neck = b[idx.neck];
    const head = b[idx.head];

    const crouch = this.crouchK;
    const down = this.downK;
    const moving = this.speed > 0.12 ? 1 : 0;

    const stride = clamp(
      STEP.strideMin + this.speed * 0.085,
      STEP.strideMin,
      STEP.strideMax,
    );
    const rate = moving ? 1.7 + this.speed * 1.25 : 0;
    this.phase = (this.phase + dt * rate) % 1;
    this.gait = damp(this.gait, moving, 8, dt);

    const bob = Math.sin(this.phase * Math.PI * 4) * 0.018 * this.gait;
    const sway = Math.sin(this.phase * Math.PI * 2) * 0.02 * this.gait;

    const hipY =
      HIP_Y -
      crouch * HIP_DROP -
      down * 0.4 +
      bob -
      down * 0.02 -
      stride * 0.09 * this.gait;
    hips.position.set(sway * 0.5, hipY, 0);

    const lean = clamp(this.speed * 0.03, 0, 0.17) + crouch * 0.2;
    hips.rotation.set(lean * 0.45, 0, -sway * 0.6);
    spine.rotation.set(lean * 0.3, 0, 0);
    chest.rotation.set(
      lean * 0.2 + Math.sin(this.t * 1.3) * 0.008,
      0,
      sway * 0.4,
    );

    head.rotation.set(
      clamp(pitch * 0.6, -0.7, 0.7) - lean * 0.5 * (1 - down) + down * 0.25,
      0,
      down * 0.2,
    );
    neck.rotation.set(clamp(pitch * 0.2, -0.25, 0.25), 0, 0);

    // Sprint carry pose: arms and rifle together, still welded.
    const sprintTarget = clamp((this.speed - 2.6) / 2.4, 0, 1) * (1 - down) * (1 - crouch * 0.7);
    this.sprintK = damp(this.sprintK, sprintTarget, 7, dt);
    this.applyPose(this.sprintK);

    const hipsQ = _q.setFromEuler(hips.rotation).invert();
    const hipPos = _v2.set(0, hipY, 0);

    for (let leg = 0; leg < 2; leg++) {
      const sx = leg === 0 ? 1 : -1;
      const p = (this.phase + (leg ? 0.5 : 0)) % 1;
      const swing = p < STEP.swing;
      let t = swing ? p / STEP.swing : (p - STEP.swing) / (1 - STEP.swing);
      t = t * t * (3 - 2 * t);

      let z;
      let lift;
      if (swing) {
        z = stride - 2 * stride * t;
        lift = Math.sin(Math.PI * t) * STEP.lift * this.gait;
      } else {
        z = -stride + 2 * stride * t;
        lift = 0;
      }
      if (!this.gait) {
        z = 0;
        lift = 0;
      }

      const tx = sx * (ANKLE_X + down * 0.09 + crouch * 0.015);
      const ty = ANKLE_Y + lift + down * 0.26;
      const tz = z * (1 - down) + down * 0.16 + crouch * 0.03 * sx;

      // Solve from the actual thigh root, which sits below and beside the
      // hips origin — otherwise the knee angle is wrong for a skinned leg.
      _v3.set(tx, ty, tz).sub(hipPos).applyQuaternion(hipsQ);
      _v3.x -= sx * (ANKLE_X + down * 0.09);
      _v3.y += THIGH_DROP;

      const dY = _v3.y;
      const dZ = _v3.z;
      let L = Math.hypot(dY, dZ);
      L = clamp(L, 0.2, THIGH + SHIN - 0.004);
      const phi = Math.atan2(-dZ, -dY);
      const a = Math.acos(
        clamp(
          (THIGH * THIGH + L * L - SHIN * SHIN) / (2 * THIGH * L),
          -1,
          1,
        ),
      );
      const k = Math.acos(
        clamp(
          (THIGH * THIGH + SHIN * SHIN - L * L) / (2 * THIGH * SHIN),
          -1,
          1,
        ),
      );

      const thigh = b[idx["thigh" + (leg ? "L" : "R")]];
      const shin = b[idx["shin" + (leg ? "L" : "R")]];
      const foot = b[idx["foot" + (leg ? "L" : "R")]];

      thigh.rotation.set(phi + a, 0, sx * (0.02 + down * 0.25));
      shin.rotation.x = -(Math.PI - k);
      const toeUp = swing && this.gait ? 0.28 * Math.sin(Math.PI * t) : 0;
      foot.rotation.x =
        -(thigh.rotation.x + shin.rotation.x) + toeUp + down * 0.4;
    }

    this.group.position.set(pos[0], pos[1] + down * 0.02, pos[2]);
    this.group.rotation.set(0, yaw, down * 1.34);
    this.group.scale.y = 1 - crouch * 0.02;

    // Team patch: teal when up, red when down, pulsing when hurt.
    const red = this.state === "downed" || this.state === "dead";
    const hurt =
      this.hp < 35 && this.state !== "downed" && this.state !== "dead";
    const pulse = hurt ? 0.55 + 0.45 * Math.sin(this.t * 9) : 1;
    this.accentMat.color.setHex(red ? 0xff5a3c : PALETTE.accent);
    this.accentMat.emissive.setHex(red ? 0xff5a3c : PALETTE.accent);
    this.accentMat.emissiveIntensity = 1.4 * pulse;

    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.game.scene.remove(this.group);
    for (const mesh of this.group.children) {
      if (mesh.isSkinnedMesh) mesh.dispose?.();
    }
    for (const m of Object.values(this.mats)) m.dispose();
    this.geometries = [];
    releaseShared();
  }
}

// The merged geometry is built once and shared, so it is created outside the
// per-avatar path and cached on the shared model.
function buildMergedSlots(rig, slots) {
  const built = rig.build(slots);
  const out = {};
  for (const [slot, geo] of Object.entries(built.slots)) out[slot] = geo;
  return out;
}