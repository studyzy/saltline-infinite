// Third-person operator avatar for the co-op teammate.
//
// Built the same way as the Hound in js/game.js: a small bone rig, primitives
// welded rigidly to bones (one bone per vertex), one merged SkinnedMesh per
// material, and animation derived per frame from speed and state — no clips,
// no assets. The hound is the reference; the differences are a humanoid
// skeleton, a two-bone leg IK and a rifle carried at low ready.

import * as THREE from "../../shared/three.js";

// ---------------------------------------------------------------------------
// proportions (metres, feet on y = 0, facing -Z)
// ---------------------------------------------------------------------------

const HIP_Y = 0.95;
const HIP_DROP = 0.3; // crouch
const THIGH = 0.44;
const SHIN = 0.4;
const ANKLE_Y = 0.09;
const ANKLE_X = 0.105;
const STEP = {
  swing: 0.38, // fraction of the cycle spent in the air
  lift: 0.11,
  strideMin: 0.14,
  strideMax: 0.46,
};

// shared tints — vertex colour is the albedo multiplier on top of the port
// material textures, exactly like the hound's per-part colour arrays.
const TINT = {
  uniform: [0.3, 0.335, 0.37],
  uniformDark: [0.24, 0.27, 0.3],
  armor: [0.45, 0.49, 0.54],
  webbing: [0.16, 0.18, 0.2],
  boot: [0.5, 0.52, 0.55],
  glove: [0.42, 0.44, 0.47],
  metal: [1.5, 1.6, 1.7],
  rifle: [0.7, 0.73, 0.76],
  rubber: [0.35, 0.36, 0.38],
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _down = new THREE.Vector3(0, -1, 0);
const _basisX = new THREE.Vector3();
const _basisY = new THREE.Vector3();
const _basisZ = new THREE.Vector3();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

// Rounded box: a BoxGeometry whose corner vertices are pushed onto a sphere.
// Same idea as Wi() in js/game.js:587, with fewer segments — these parts are
// seen from a few metres away.
function roundedBox(w, h, d, r = 0.02, seg = 2) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = geo.attributes.position;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const cx = clamp(x, -hw, hw);
    const cy = clamp(y, -hh, hh);
    const cz = clamp(z, -hd, hd);
    _v.set(x - cx, y - cy, z - cz);
    if (_v.lengthSq() > 1e-12) {
      _v.normalize();
      pos.setXYZ(i, cx + _v.x * r, cy + _v.y * r, cz + _v.z * r);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

// Cylinder with its axis along Y, then optionally rotated so it runs along Z.
function tube(rTop, rBot, h, seg = 10) {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg);
}

// Merge a list of non-indexed geometries that all carry the same attributes.
function mergeGeometries(list) {
  let total = 0;
  const parts = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    total += n.attributes.position.count;
    return n;
  });
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const color = new Float32Array(total * 3);
  const skinIndex = new Uint16Array(total * 4);
  const skinWeight = new Float32Array(total * 4);
  let o = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    position.set(g.attributes.position.array, o * 3);
    normal.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    color.set(g.attributes.color.array, o * 3);
    skinIndex.set(g.attributes.skinIndex.array, o * 4);
    skinWeight.set(g.attributes.skinWeight.array, o * 4);
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.BufferAttribute(color, 3));
  out.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
  out.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ---------------------------------------------------------------------------
// rig — a compact port of the Hound's rig class (js/game.js:32817)
// ---------------------------------------------------------------------------

class Rig {
  constructor() {
    this.bones = [];
    this.index = {};
    this.slots = {};
    this.order = [];
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

  // Weld a part to a bone. Every vertex gets weight 1 on that bone, so parts
  // stay rigid — right for armour plates, pouches and a rifle.
  add(slot, boneName, geo, tint = [1, 1, 1]) {
    const bone = this.bones[this.index[boneName]];
    if (!bone) throw new Error("avatar rig: unknown bone " + boneName);
    geo = geo.index ? geo.toNonIndexed() : geo;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute(
        "uv",
        new THREE.BufferAttribute(
          new Float32Array(geo.attributes.position.count * 2),
          2,
        ),
      );
    }
    const count = geo.attributes.position.count;
    const color = new Float32Array(count * 3);
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    for (let i = 0; i < count; i++) {
      // Downward faces are darker: a cheap baked ambient occlusion.
      const shade = 0.8 + 0.2 * clamp(nrm.getY(i) * 0.5 + 0.5, 0, 1);
      const jitter =
        0.94 +
        0.12 * hash(pos.getX(i) * 3.1, pos.getY(i) * 3.7, pos.getZ(i) * 3.3);
      color[i * 3] = tint[0] * shade * jitter;
      color[i * 3 + 1] = tint[1] * shade * jitter;
      color[i * 3 + 2] = tint[2] * shade * jitter;
      skinIndex[i * 4] = bone.i;
      skinWeight[i * 4] = 1;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
    geo.translate(bone.world[0], bone.world[1], bone.world[2]);
    if (!this.slots[slot]) {
      this.slots[slot] = [];
      this.order.push(slot);
    }
    this.slots[slot].push(geo);
    return this;
  }

  build(slots = this.order) {
    const out = {};
    for (const slot of slots) {
      const list = this.slots[slot];
      if (!list || !list.length) continue;
      out[slot] = mergeGeometries(list);
    }
    return { slots: out, bones: this.bones };
  }
}

// ---------------------------------------------------------------------------
// arm posing: one static two-bone IK solve at build time. The rifle and both
// arms are children of the chest, so a baked pose stays glued to the weapon
// and needs no per-frame IK.
// ---------------------------------------------------------------------------

function solveArm(rig, armBone, foreBone, handBone, target, pole, handTwist) {
  const arm = rig.bones[rig.index[armBone]];
  const S = new THREE.Vector3(arm.world[0], arm.world[1], arm.world[2]);
  const T = new THREE.Vector3(target[0], target[1], target[2]);
  const d = T.clone().sub(S);
  const len = clamp(d.length(), 0.08, 0.56);
  d.normalize();

  const L1 = 0.29;
  const L2 = 0.275;
  const a = Math.acos(clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1));
  const k = Math.acos(clamp((L1 * L1 + L2 * L2 - len * len) / (2 * L1 * L2), -1, 1));

  const P = new THREE.Vector3(pole[0], pole[1], pole[2]).normalize();
  // Pole projected perpendicular to the shoulder-target line.
  const perp = P.clone().addScaledVector(d, -P.dot(d)).normalize();
  const u = d.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a));

  // Bone local axes: +Y points back up the limb, -Y along it; +Z is the
  // elbow plane, so a positive local X rotation bends away from the pole.
  _basisY.copy(u).negate();
  _basisX.crossVectors(_basisY, perp);
  if (_basisX.lengthSq() < 1e-8) _basisX.set(1, 0, 0).cross(_basisY);
  _basisX.normalize();
  _basisZ.crossVectors(_basisX, _basisY).normalize();
  _m.makeBasis(_basisX, _basisY, _basisZ);

  const elbow = S.clone().addScaledVector(u, L1);
  const v = T.clone().sub(elbow).normalize();
  const bend = Math.atan2(-v.dot(perp), v.dot(u));

  return {
    arm: new THREE.Quaternion().setFromRotationMatrix(_m),
    fore: bend,
    hand: -bend * 0.35 + (handTwist || 0),
    L1,
    L2,
    k,
  };
}

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

function buildModel() {
  const rig = new Rig();

  rig.bone("root", null, 0, 0, 0);
  rig.bone("hips", "root", 0, HIP_Y, 0);
  rig.bone("spine", "hips", 0, 0.14, 0);
  rig.bone("chest", "spine", 0, 0.16, 0);
  rig.bone("neck", "chest", 0, 0.17, 0);
  rig.bone("head", "neck", 0, 0.1, 0);

  rig.bone("clavR", "chest", 0.06, 0.13, 0);
  rig.bone("armR", "clavR", 0.145, 0, 0);
  rig.bone("foreR", "armR", 0, -0.29, 0);
  rig.bone("handR", "foreR", 0, -0.275, 0);
  rig.bone("clavL", "chest", -0.06, 0.13, 0);
  rig.bone("armL", "clavL", -0.145, 0, 0);
  rig.bone("foreL", "armL", 0, -0.29, 0);
  rig.bone("handL", "foreL", 0, -0.275, 0);

  rig.bone("thighR", "hips", ANKLE_X, -0.05, 0);
  rig.bone("shinR", "thighR", 0, -THIGH, 0);
  rig.bone("footR", "shinR", 0, -SHIN, 0);
  rig.bone("thighL", "hips", -ANKLE_X, -0.05, 0);
  rig.bone("shinL", "thighL", 0, -THIGH, 0);
  rig.bone("footL", "shinL", 0, -SHIN, 0);

  rig.bone("weapon", "chest", 0.055, -0.045, -0.2);

  // ---- pelvis and webbing ----
  rig.add("plate", "hips", roundedBox(0.3, 0.2, 0.2, 0.035), TINT.uniform);
  rig.add("gear", "hips", roundedBox(0.32, 0.055, 0.215, 0.014), TINT.webbing);
  // belt pouches, front left and rear right
  rig.add("gear", "hips", roundedBox(0.075, 0.1, 0.055, 0.012).translate(-0.085, -0.01, -0.1), TINT.webbing);
  rig.add("gear", "hips", roundedBox(0.07, 0.085, 0.05, 0.012).translate(0.09, -0.005, 0.09), TINT.webbing);

  // ---- torso ----
  rig.add("plate", "spine", roundedBox(0.31, 0.2, 0.21, 0.03), TINT.uniform);
  rig.add("plate", "chest", roundedBox(0.38, 0.28, 0.24, 0.045), TINT.uniform);
  rig.add("plate", "chest", roundedBox(0.3, 0.22, 0.045, 0.012).translate(0, 0.005, -0.125), TINT.armor);
  rig.add("plate", "chest", roundedBox(0.28, 0.09, 0.03, 0.01).translate(0, -0.12, -0.115), TINT.uniformDark);
  // shoulder straps
  rig.add("gear", "chest", box(0.055, 0.3, 0.02).translate(-0.115, 0.02, -0.12), TINT.webbing);
  rig.add("gear", "chest", box(0.055, 0.3, 0.02).translate(0.115, 0.02, -0.12), TINT.webbing);
  // chest pouches
  rig.add("gear", "chest", roundedBox(0.085, 0.09, 0.045, 0.01).translate(-0.095, -0.075, -0.15), TINT.webbing);
  rig.add("gear", "chest", roundedBox(0.085, 0.09, 0.045, 0.01).translate(0.095, -0.075, -0.15), TINT.webbing);
  // backpack with a small radio and an amber status lamp
  rig.add("gear", "chest", roundedBox(0.3, 0.34, 0.16, 0.025).translate(0, 0.02, 0.2), TINT.webbing);
  rig.add("gear", "chest", roundedBox(0.19, 0.2, 0.05, 0.01).translate(0, 0.04, 0.29), TINT.uniformDark);
  rig.add("metal", "chest", tube(0.006, 0.006, 0.28, 6).translate(0.115, 0.16, 0.19), TINT.metal);
  rig.add("lamp", "chest", roundedBox(0.03, 0.012, 0.006, 0.002).translate(-0.1, 0.16, 0.285), [1, 1, 1]);

  // ---- neck and head ----
  rig.add("gear", "neck", tube(0.055, 0.06, 0.11, 10), TINT.webbing);
  rig.add("plate", "head", roundedBox(0.22, 0.2, 0.24, 0.05), TINT.armor);
  rig.add("plate", "head", roundedBox(0.23, 0.035, 0.07, 0.012).translate(0, 0.035, -0.11), TINT.uniformDark);
  rig.add("gear", "head", roundedBox(0.17, 0.13, 0.07, 0.022).translate(0, -0.035, -0.095), TINT.webbing);
  rig.add("gear", "head", roundedBox(0.155, 0.055, 0.03, 0.012).translate(0, -0.085, -0.1), TINT.webbing);
  rig.add("visor", "head", roundedBox(0.15, 0.042, 0.014, 0.005).translate(0, 0.012, -0.132), [1, 1, 1]);
  rig.add("gear", "head", roundedBox(0.05, 0.05, 0.02, 0.008).translate(0, -0.062, -0.135), TINT.webbing);

  // ---- shoulders and arms ----
  for (const [side, sx] of [["R", 1], ["L", -1]]) {
    const arm = "arm" + side;
    const fore = "fore" + side;
    const hand = "hand" + side;
    // shoulder pad stays with the clavicle so it does not swing
    rig.add("plate", "clav" + side, roundedBox(0.14, 0.1, 0.17, 0.03).translate(sx * 0.04, 0.01, 0), [0.5, 0.54, 0.58]);
    rig.add("plate", arm, roundedBox(0.1, 0.26, 0.11, 0.03).translate(0, -0.15, 0), TINT.uniform);
    rig.add("gear", arm, roundedBox(0.105, 0.08, 0.115, 0.02).translate(0, -0.27, 0), TINT.webbing);
    rig.add("plate", fore, roundedBox(0.095, 0.24, 0.1, 0.025).translate(0, -0.13, 0), TINT.uniform);
    rig.add("gear", fore, roundedBox(0.1, 0.06, 0.105, 0.015).translate(0, -0.25, 0), TINT.webbing);
    rig.add("gear", hand, roundedBox(0.082, 0.1, 0.1, 0.022).translate(0, -0.05, -0.01), TINT.glove);
  }

  // ---- legs ----
  for (const [side, sx] of [["R", 1], ["L", -1]]) {
    const thigh = "thigh" + side;
    const shin = "shin" + side;
    const foot = "foot" + side;
    rig.add("plate", thigh, roundedBox(0.15, 0.38, 0.17, 0.04).translate(0, -0.21, 0), TINT.uniform);
    rig.add("gear", thigh, roundedBox(0.12, 0.16, 0.13, 0.02).translate(sx * 0.045, -0.24, -0.015), TINT.webbing);
    rig.add("gear", shin, roundedBox(0.125, 0.1, 0.07, 0.02).translate(0, -0.02, -0.085), TINT.webbing);
    rig.add("plate", shin, roundedBox(0.125, 0.34, 0.14, 0.03).translate(0, -0.19, 0), TINT.uniform);
    rig.add("gear", shin, roundedBox(0.11, 0.16, 0.03, 0.01).translate(0, -0.17, -0.075), TINT.webbing);
    rig.add("gear", foot, roundedBox(0.135, 0.11, 0.27, 0.03).translate(0, -0.035, -0.055), TINT.boot);
    rig.add("rubber", foot, roundedBox(0.14, 0.035, 0.28, 0.012).translate(0, -0.088, -0.055), TINT.rubber);
  }

  // ---- rifle, rigid on the weapon bone, muzzle forward (-Z) ----
  rig.add("gear", "weapon", roundedBox(0.062, 0.095, 0.34, 0.014).translate(0, 0, 0), TINT.rifle);
  rig.add("gear", "weapon", roundedBox(0.056, 0.062, 0.24, 0.012).translate(0, 0.002, -0.29), TINT.rifle);
  rig.add("metal", "weapon", tube(0.011, 0.011, 0.18, 8).rotateX(Math.PI / 2).translate(0, 0.004, -0.5), TINT.metal);
  rig.add("metal", "weapon", tube(0.017, 0.017, 0.06, 8).rotateX(Math.PI / 2).translate(0, 0.004, -0.6), TINT.metal);
  rig.add("gear", "weapon", roundedBox(0.05, 0.085, 0.22, 0.014).translate(0, -0.005, 0.26), TINT.rifle);
  rig.add("gear", "weapon", roundedBox(0.05, 0.09, 0.06, 0.012).translate(0, -0.09, 0.09).rotateX(-0.35), TINT.webbing);
  rig.add("gear", "weapon", roundedBox(0.045, 0.16, 0.075, 0.012).translate(0, -0.11, -0.02).rotateX(0.12), TINT.webbing);
  rig.add("gear", "weapon", roundedBox(0.042, 0.055, 0.11, 0.01).translate(0, 0.075, -0.01), TINT.webbing);
  rig.add("metal", "weapon", tube(0.02, 0.02, 0.012, 10).rotateX(Math.PI / 2).translate(0, 0.093, -0.055), TINT.metal);

  // ---- bake the carry pose ----
  // Grip points are expressed in model space; the chest sits at y = 1.25.
  const gripR = [0.069, 1.13, -0.111];
  const gripL = [0.03, 1.205, -0.358];
  const armR = solveArm(rig, "armR", "foreR", "handR", gripR, [0.7, -0.2, 0.6], 0.15);
  const armL = solveArm(rig, "armL", "foreL", "handL", gripL, [-0.7, -0.2, 0.6], -0.1);

  return { rig, pose: { armR, armL } };
}

// ---------------------------------------------------------------------------
// avatar
// ---------------------------------------------------------------------------

export class Avatar {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = "mp-avatar";

    const { rig, pose } = buildModel();
    this.rig = rig;
    this.pose = pose;

    // bones
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

    // baked arm pose, kept so the pose can be re-applied after a fall
    this.bones[rig.index["armR"]].quaternion.copy(pose.armR.arm);
    this.bones[rig.index["foreR"]].rotation.x = pose.armR.fore;
    this.bones[rig.index["handR"]].rotation.x = pose.armR.hand;
    this.bones[rig.index["armL"]].quaternion.copy(pose.armL.arm);
    this.bones[rig.index["foreL"]].rotation.x = pose.armL.fore;
    this.bones[rig.index["handL"]].rotation.x = pose.armL.hand;

    // materials — the port's procedural library when available, a plain
    // standard material otherwise (tests, preview harness).
    this._owned = [];
    const mat = (name, opts) => {
      const lib = game && game.mats;
      if (lib && lib.get) {
        try {
          return lib.get(name, opts);
        } catch {
          /* fall through */
        }
      }
      const m = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.1,
        vertexColors: true,
      });
      this._owned.push(m);
      return m;
    };

    this.slotMats = {
      plate: mat("armor_white", {
        triplanar: true,
        vertexColors: true,
        scale: 1.5,
      }),
      gear: mat("polymer_black", {
        triplanar: true,
        vertexColors: true,
        scale: 1.2,
      }),
      rubber: mat("rubber", { triplanar: true, vertexColors: true, scale: 1 }),
      metal: mat("gunmetal", { triplanar: true, vertexColors: true, scale: 2 }),
      lamp: null,
      visor: null,
    };

    this.visorMat = new THREE.MeshStandardMaterial({
      color: 0x7fe6c4,
      emissive: new THREE.Color(0x7fe6c4),
      emissiveIntensity: 2.2,
      roughness: 0.3,
      metalness: 0.1,
      toneMapped: true,
    });
    this.lampMat = new THREE.MeshStandardMaterial({
      color: 0xffb24a,
      emissive: new THREE.Color(0xffb24a),
      emissiveIntensity: 3,
      roughness: 0.4,
      metalness: 0,
    });
    this.slotMats.visor = this.visorMat;
    this.slotMats.lamp = this.lampMat;

    // skinned meshes, one per material slot
    const built = rig.build(["plate", "gear", "rubber", "metal", "visor", "lamp"]);
    this.geometries = [];
    const skeleton = new THREE.Skeleton(this.bones);
    this.meshes = [];
    for (const [slot, geo] of Object.entries(built.slots)) {
      const mesh = new THREE.SkinnedMesh(geo, this.slotMats[slot]);
      mesh.name = "avatar-" + slot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2);
      mesh.bind(skeleton, new THREE.Matrix4());
      this.group.add(mesh);
      this.geometries.push(geo);
      this.meshes.push(mesh);
    }
    this.skeleton = skeleton;

    // ---- animation state ----
    this.t = 0;
    this.speed = 0;
    this.phase = 0;
    this.crouchK = 0;
    this.downK = 0;
    this.gait = 0;
    this.lastPos = new THREE.Vector3(0, 0, 0);
    this.hasLast = false;
    this.state = "alive";
    this.hp = 100;
    this.fall = 0;
    this.footTarget = [0, 1, 2, 3].map(() => new THREE.Vector3());

    this.group.visible = false;
    game.scene.add(this.group);
  }

  // -------------------------------------------------------------------------
  // per-frame state from the interpolation layer
  // -------------------------------------------------------------------------
  setState({ pos, yaw, pitch, crouch, state, hp, dt }) {
    const step = clamp(dt || 1 / 60, 1 / 240, 0.1);
    this.t += step;

    // speed from the interpolated position; snapshots do not carry velocity
    _v.set(pos[0], pos[1], pos[2]);
    if (this.hasLast) {
      const d = _v.distanceTo(this.lastPos);
      const inst = d / step;
      this.speed = damp(this.speed, inst > 12 ? 0 : inst, 9, step);
    }
    this.lastPos.copy(_v);
    this.hasLast = true;

    this.group.visible = state !== "dead" && state !== "hidden";
    this.state = state || "alive";
    this.hp = hp == null ? 100 : hp;

    const down = state === "downed" || state === "dead";
    this.crouchK = damp(this.crouchK, crouch ? 1 : 0, 10, step);
    this.downK = damp(this.downK, down ? 1 : 0, 6.5, step);
    this.fall = damp(this.fall, down ? 1 : 0, 4.2, step);

    this.poseBody(pos, yaw || 0, pitch || 0, step);
  }

  // -------------------------------------------------------------------------
  // procedural pose
  // -------------------------------------------------------------------------
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

    // ---- gait phase ----
    const stride = clamp(
      STEP.strideMin + this.speed * 0.085,
      STEP.strideMin,
      STEP.strideMax,
    );
    const rate = moving ? 1.7 + this.speed * 1.25 : 0;
    this.phase = (this.phase + dt * rate) % 1;
    this.gait = damp(this.gait, moving, 8, dt);
    this.stride = stride;

    // Two steps per cycle: a foot is planted while the other swings.
    const bob = Math.sin(this.phase * Math.PI * 4) * 0.018 * this.gait;
    const sway = Math.sin(this.phase * Math.PI * 2) * 0.02 * this.gait;

    const hipY =
      HIP_Y - crouch * HIP_DROP - down * 0.4 + bob - down * 0.02;
    hips.position.set(sway * 0.5, hipY, 0);

    // lean into movement, fold forward when crouched, arch back when downed
    const lean = clamp(this.speed * 0.022, 0, 0.12) + crouch * 0.2;
    hips.rotation.set(lean * 0.55, 0, -sway * 0.6);
    spine.rotation.set(lean * 0.25, 0, 0);
    chest.rotation.set(lean * 0.2 + Math.sin(this.t * 1.3) * 0.01, 0, sway * 0.4);

    // aim: the head does most of the work, the chest a little
    head.rotation.set(
      clamp(pitch * 0.6, -0.7, 0.7) - lean * 0.5 * (1 - down) + down * 0.25,
      0,
      down * 0.2,
    );
    neck.rotation.set(clamp(pitch * 0.2, -0.25, 0.25), 0, 0);

    // ---- feet: targets in model space, converted into hips space ----
    const hipsQ = _q.setFromEuler(hips.rotation).invert();
    const hipPos = _v2.set(0, hipY, 0);

    for (let leg = 0; leg < 2; leg++) {
      const sx = leg === 0 ? 1 : -1;
      // leg 0 = right, leg 1 = left; opposite phase
      const p = (this.phase + (leg ? 0.5 : 0)) % 1;
      const swing = p < STEP.swing;
      let t = swing ? p / STEP.swing : (p - STEP.swing) / (1 - STEP.swing);
      t = t * t * (3 - 2 * t);

      let z;
      let lift;
      if (swing) {
        z = stride - 2 * stride * t; // behind -> front (-Z is forward)
        lift = Math.sin(Math.PI * t) * STEP.lift * this.gait;
      } else {
        z = -stride + 2 * stride * t; // planted, sliding back
        lift = 0;
      }
      if (!this.gait) {
        z = 0;
        lift = 0;
      }

      // downed: legs fold under the body
      const tx = sx * (ANKLE_X + down * 0.09 + crouch * 0.015);
      const ty = ANKLE_Y + lift + down * 0.26;
      const tz = z * (1 - down) + down * 0.16 + crouch * 0.03 * sx;

      _v3.set(tx, ty, tz).sub(hipPos).applyQuaternion(hipsQ);

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
      foot.rotation.x = -(thigh.rotation.x + shin.rotation.x) + toeUp + down * 0.4;
    }

    // ---- weapon and arms follow the chest ----
    // A sprint tucks the rifle closer and angles the muzzle up a little.
    const sprint = clamp((this.speed - 3.4) / 2.2, 0, 1);
    const weapon = b[idx.weapon];
    weapon.position.set(
      0.055 + sprint * 0.02,
      -0.045 + sprint * 0.05 - crouch * 0.02,
      -0.2 + sprint * 0.055,
    );
    weapon.rotation.set(-sprint * 0.55 + down * 0.5, 0.16 - sprint * 0.1, 0);
    weapon.scale.setScalar(1 - down * 0.15);

    // ---- whole-body transform ----
    // Fall rotates about the feet: the body sweeps to the left and ends on
    // its side, which reads as a controlled collapse for a blockout.
    this.group.position.set(pos[0], pos[1] + down * 0.02, pos[2]);
    this.group.rotation.set(0, yaw, down * 1.34);
    this.group.scale.y = 1 - crouch * 0.02;

    // ---- visor ----
    const injured = this.hp < 35 && this.state !== "downed" && this.state !== "dead";
    const pulse = injured ? 0.65 + 0.35 * Math.sin(this.t * 9) : 1;
    const red = this.state === "downed" || this.state === "dead";
    this.visorMat.color.setHex(red ? 0xff5a3c : 0x7fe6c4);
    this.visorMat.emissive.setHex(red ? 0xff5a3c : 0x7fe6c4);
    this.visorMat.emissiveIntensity = 2.2 * pulse;

    this.lampMat.emissiveIntensity = 2.4 + Math.sin(this.t * 2.4) * 0.8 * (1 - down);
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.game.scene.remove(this.group);
    for (const g of this.geometries) g.dispose();
    for (const m of this._owned) m.dispose();
    this.visorMat.dispose();
    this.lampMat.dispose();
  }
}