// 无人机(Gull)模块 —— 从 js/game.js 独立出来的四旋翼攻击无人机
//
// 模块职责:
//   - 几何工具:圆角盒、圆柱、管线、椭球、支杆、变换(内联自 three.js BufferGeometryUtils)
//   - RigBuilder 烘焙骨骼与蒙皮网格;instantiateRig 实例化为 Group + SkinnedMesh + 骨骼层级
//   - buildGullRig() 烘焙整机模型(shell/metal/glow/lens 四个材质槽位 + 旋翼盘/光锥附加网格)
//   - createGull() 创建单架实例:巡逻/搜索/交战飞行、姿态与云台瞄准、攻击状态机、坠毁
//
// 对外导出(由 js/game.js 引用):
//   buildGullRig()                            烘焙一次模型定义,供所有实例共享
//   createGull(ai, rigDef, materials, index)  创建实例;ai=敌人AI管理器({G:游戏上下文,rng,t,
//                                             think,requestToken,releaseToken,fireBolt,retire,
//                                             playerSpeed}),rigDef=模型定义,
//                                             materials={shell,metal,glow,lensBase,disc,cone}
//   GULL_TUNE                                 战斗与飞行调参(hp/伤害/射速/高度/速度/散布等)
//   GULL_SPEC                                 骨骼布局(旋翼/云台/枪/灯的位置偏移)
//
// 原压缩名对照(便于与历史代码比对):
//   sa→mergeGeometries  Wi→makeRoundedBox  ot→makeCylinder  Fn→makeTube
//   Dc→transformGeometry  Ur→makeEllipsoid  su→makeStrut  FC→makeRotorHubProfile
//   iu→RigBuilder  pm→instantiateRig  K_→wrapAngle  bl→clamp
//   xm→GULL_SPEC  Zv→GULL_TUNE  ym→LENS_PATROL  UC→LENS_ENGAGE
//   $o/iz/Bs/Co/sz/ou→临时向量  Hf→V_UP上方向  J_→V_DOWN下方向
//   j_→buildGullRig  Q_→createGull  v→killGull  g→fallTick  x→flyTick

import * as THREE from './vendor/three.module.js';

const Vector2 = THREE.Vector2;
const LatheGeometry = THREE.LatheGeometry;
const TorusGeometry = THREE.TorusGeometry;
const Sphere = THREE.Sphere;
const BufferAttribute = THREE.BufferAttribute;
const Bone = THREE.Bone;
const Euler = THREE.Euler;
const CatmullRomCurve3 = THREE.CatmullRomCurve3;
const SkinnedMesh = THREE.SkinnedMesh;
const Skeleton = THREE.Skeleton;
const TubeGeometry = THREE.TubeGeometry;
const Quaternion = THREE.Quaternion;
const SphereGeometry = THREE.SphereGeometry;
const BufferGeometry = THREE.BufferGeometry;
const RingGeometry = THREE.RingGeometry;
const Mesh = THREE.Mesh;
const PlaneGeometry = THREE.PlaneGeometry;
const ConeGeometry = THREE.ConeGeometry;
const BoxGeometry = THREE.BoxGeometry;
const Vector3 = THREE.Vector3;
const Group = THREE.Group;
const Matrix4 = THREE.Matrix4;
const CylinderGeometry = THREE.CylinderGeometry;
const Box3 = THREE.Box3;

// ===== 几何合并工具（内联自 three.js BufferGeometryUtils） =====
// 合并多个 BufferGeometry（要求属性一致）；useGroups 为每个源几何划分材质组
function mergeGeometries(i, e = !1) {
    let t = i[0].index !== null,
      n = new Set(Object.keys(i[0].attributes)),
      s = new Set(Object.keys(i[0].morphAttributes)),
      o = {},
      r = {},
      a = i[0].morphTargetsRelative,
      l = new BufferGeometry(),
      c = 0;
    for (let u = 0; u < i.length; ++u) {
      let h = i[u],
        f = 0;
      if (t !== (h.index !== null))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              u +
              ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.",
          ),
          null
        );
      for (let p in h.attributes) {
        if (!n.has(p))
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
                u +
                '. All geometries must have compatible attributes; make sure "' +
                p +
                '" attribute exists among all geometries, or in none of them.',
            ),
            null
          );
        o[p] === void 0 && (o[p] = []), o[p].push(h.attributes[p]), f++;
      }
      if (f !== n.size)
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              u +
              ". Make sure all geometries have the same number of attributes.",
          ),
          null
        );
      if (a !== h.morphTargetsRelative)
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              u +
              ". .morphTargetsRelative must be consistent throughout all geometries.",
          ),
          null
        );
      for (let p in h.morphAttributes) {
        if (!s.has(p))
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
                u +
                ".  .morphAttributes must be consistent throughout all geometries.",
            ),
            null
          );
        r[p] === void 0 && (r[p] = []), r[p].push(h.morphAttributes[p]);
      }
      if (e) {
        let p;
        if (t) p = h.index.count;
        else if (h.attributes.position !== void 0)
          p = h.attributes.position.count;
        else
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
                u +
                ". The geometry must have either COLOR_DARK_METAL index or a position attribute",
            ),
            null
          );
        l.addGroup(c, p, u), (c += p);
      }
    }
    if (t) {
      let u = 0,
        h = [];
      for (let f = 0; f < i.length; ++f) {
        let p = i[f].index;
        for (let d = 0; d < p.count; ++d) h.push(p.getX(d) + u);
        u += i[f].attributes.position.count;
      }
      l.setIndex(h);
    }
    for (let u in o) {
      let h = mergeAttributes(o[u]);
      if (!h)
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
              u +
              " attribute.",
          ),
          null
        );
      l.setAttribute(u, h);
    }
    for (let u in r) {
      let h = r[u][0].length;
      if (h === 0) break;
      (l.morphAttributes = l.morphAttributes || {}),
        (l.morphAttributes[u] = []);
      for (let f = 0; f < h; ++f) {
        let p = [];
        for (let killGull = 0; killGull < r[u].length; ++killGull) p.push(r[u][killGull][f]);
        let d = mergeAttributes(p);
        if (!d)
          return (
            console.error(
              "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
                u +
                " morphAttribute.",
            ),
            null
          );
        l.morphAttributes[u].push(d);
      }
    }
    return l;
  }
// 合并同名 BufferAttribute 数组，返回拼接后的属性
function mergeAttributes(i) {
    let e,
      t,
      n,
      s = -1,
      o = 0;
    for (let c = 0; c < i.length; ++c) {
      let u = i[c];
      if (
        (e === void 0 && (e = u.array.constructor), e !== u.array.constructor)
      )
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.",
          ),
          null
        );
      if ((t === void 0 && (t = u.itemSize), t !== u.itemSize))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.",
          ),
          null
        );
      if ((n === void 0 && (n = u.normalized), n !== u.normalized))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.",
          ),
          null
        );
      if ((s === -1 && (s = u.gpuType), s !== u.gpuType))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.",
          ),
          null
        );
      o += u.count * t;
    }
    let r = new e(o),
      a = new BufferAttribute(r, t, n),
      l = 0;
    for (let c = 0; c < i.length; ++c) {
      let u = i[c];
      if (u.isInterleavedBufferAttribute) {
        let h = l / t;
        for (let f = 0, p = u.count; f < p; f++)
          for (let d = 0; d < t; d++) {
            let killGull = u.getComponent(f, d);
            a.setComponent(f + h, d, killGull);
          }
      } else r.set(u.array, l);
      l += u.count * t;
    }
    return s !== void 0 && (a.gpuType = s), a;
  }
  var _cornerNormal = new Vector3();

// ===== 几何构造工具：圆角盒 / 圆柱 / 管线 / 变换 / 支撑杆 / 椭球 =====
// 圆角盒：细分盒体并把顶点向内收，形成倒角边缘（机身板件）
function createBeveledBox(i, e, t, n = 0.02, s = "center") {
    n = Math.min(n, i / 2 - 1e-4, e / 2 - 1e-4, t / 2 - 1e-4);
    let o = new BoxGeometry(i, e, t, 3, 3, 3),
      r = o.attributes.position,
      a = o.attributes.normal,
      l = o.attributes.uv,
      c = i / 2,
      u = e / 2,
      h = t / 2,
      f = (p, d) => {
        let killGull = Math.abs(p),
          fallTick = Math.sign(p);
        return killGull > d - 1e-5 ? fallTick * d : fallTick * (d - n);
      };
    for (let p = 0; p < r.count; p++) {
      let d = f(r.getX(p), c),
        killGull = f(r.getY(p), u),
        fallTick = f(r.getZ(p), h),
        flyTick = Math.max(-(c - n), Math.min(c - n, d)),
        y = Math.max(-(u - n), Math.min(u - n, killGull)),
        b = Math.max(-(h - n), Math.min(h - n, fallTick));
      if ((_cornerNormal.set(d - flyTick, killGull - y, fallTick - b), _cornerNormal.lengthSq() > 1e-10)) {
        _cornerNormal.normalize();
        let M = a.getX(p),
          E = a.getY(p),
          w = a.getZ(p);
        (Math.abs(d) > c - 1e-5 ? 1 : 0) +
          (Math.abs(killGull) > u - 1e-5 ? 1 : 0) +
          (Math.abs(fallTick) > h - 1e-5 ? 1 : 0) >=
        2
          ? ((d = flyTick + _cornerNormal.x * n),
            (killGull = y + _cornerNormal.y * n),
            (fallTick = b + _cornerNormal.z * n),
            a.setXYZ(p, _cornerNormal.x, _cornerNormal.y, _cornerNormal.z))
          : a.setXYZ(p, M, E, w);
      }
      r.setXYZ(p, d, killGull, fallTick);
      let m = Math.abs(a.getX(p)),
        A = Math.abs(a.getY(p)),
        _ = Math.abs(a.getZ(p));
      m >= A && m >= _
        ? l.setXY(p, fallTick, killGull)
        : A >= m && A >= _
          ? l.setXY(p, d, fallTick)
          : l.setXY(p, d, killGull);
    }
    return s === "bottom" && o.translate(0, e / 2, 0), o;
  }
// 圆柱体，并重算 UV 使侧面纹理按周长展开
function createCylinder(i, e, t, n = 16, s = !1, o = "center") {
    let r = new CylinderGeometry(i, e, t, n, 1, s),
      a = r.attributes.uv,
      l = r.attributes.position,
      c = r.attributes.normal,
      u = Math.PI * (i + e);
    for (let h = 0; h < a.count; h++)
      Math.abs(c.getY(h)) > 0.9
        ? a.setXY(h, l.getX(h), l.getZ(h))
        : a.setXY(h, a.getX(h) * u, l.getY(h));
    return o === "bottom" && r.translate(0, t / 2, 0), r;
  }
// 沿控制点生成 CatmullRom 管状几何（机臂、支架、线缆）
function createTube(i, e = 0.03, t = 8, n = !1, s = 0) {
    let o = i.map((h) => (h.isVector3 ? h : new Vector3(h[0], h[1], h[2]))),
      r = new CatmullRomCurve3(o, n, "catmullrom", s),
      a = r.getLength(),
      l = Math.max(2, Math.ceil(a / Math.max(0.08, e * 3))),
      c = new TubeGeometry(r, Math.min(l, 400), e, t, n),
      u = c.attributes.uv;
    for (let h = 0; h < u.count; h++)
      u.setXY(h, u.getX(h) * a, u.getY(h) * Math.PI * 2 * e);
    return c;
  }
  var _transformMatrix = new Matrix4(),
    _transformQuat = new Quaternion(),
    _transformEuler = new Euler(),
    _transformPos = new Vector3(),
    _transformScale = new Vector3();
// 对几何体应用平移 / 旋转 / 缩放矩阵
function transformGeometry(i, { position: e = [0, 0, 0], rotation: t = [0, 0, 0], scale: n = 1 } = {}) {
    return (
      _transformEuler.set(t[0], t[1], t[2]),
      _transformQuat.setFromEuler(_transformEuler),
      _transformPos.set(e[0], e[1], e[2]),
      typeof n == "number" ? _transformScale.set(n, n, n) : _transformScale.set(n[0], n[1], n[2]),
      _transformMatrix.compose(_transformPos, _transformQuat, _transformScale),
      i.applyMatrix4(_transformMatrix),
      i
    );
  }

// ===== 顶点色常量与几何快捷函数（颜色为 RGB 倍率，可 >1 表示自发光） =====
  var COLOR_HULL_WHITE = [1.15, 1.15, 1.15],
    COLOR_HULL_LIGHT = [0.95, 0.96, 0.97],
    COLOR_ORANGE = [1, 0.34, 0.08],
    COLOR_DARK_TRIM = [0.1, 0.11, 0.12],
    COLOR_RUBBER = [0.035, 0.035, 0.038],
    COLOR_AMBER = [1, 0.7, 0.07],
    COLOR_WHITE = [1, 1, 1],
    COLOR_BRIGHT_METAL = [2.4, 2.5, 2.6],
    COLOR_DARK_METAL = [0.45, 0.46, 0.48],
    HALF_PI = Math.PI / 2,
    roundedBox = (i, e, t, n = 0.008) => createBeveledBox(i, e, t, n),
    placeGeometry = (i, e, t, n, s = 0, o = 0, r = 0, a = 1) =>
      transformGeometry(i, { position: [e, t, n], rotation: [s, o, r], scale: a }),
    cylinder = (i, e, t, n = 12) => createCylinder(i, e, t, n),
    cylinderAlongX = (i, e, t, n = 12) => transformGeometry(createCylinder(i, e, t, n), { rotation: [0, 0, -HALF_PI] }),
    cylinderAlongZ = (i, e, t, n = 12) => transformGeometry(createCylinder(i, e, t, n), { rotation: [HALF_PI, 0, 0] }),
    _strutStart = new Vector3(),
    _strutEnd = new Vector3(),
    _strutQuat = new Quaternion(),
    WORLD_UP = new Vector3(0, 1, 0),
    _strutMatrix = new Matrix4(),
    UNIT_SCALE = new Vector3(1, 1, 1);

// 两点之间的锥形支撑杆（起落架、机臂连杆）
function createStrut(i, e, t, n = t, s = 8) {
    _strutStart.set(i[0], i[1], i[2]), _strutEnd.set(e[0], e[1], e[2]);
    let o = _strutStart.distanceTo(_strutEnd),
      r = createCylinder(n, t, o, s);
    return (
      _strutQuat.setFromUnitVectors(WORLD_UP, _strutEnd.clone().sub(_strutStart).normalize()),
      _strutMatrix.compose(_strutStart.clone().add(_strutEnd).multiplyScalar(0.5), _strutQuat, UNIT_SCALE),
      r.applyMatrix4(_strutMatrix),
      r
    );
  }

  var createEllipsoid = (i, e = 14, t = 10, n = 1, s = 1, o = 1) => {
      let r = new SphereGeometry(i, e, t);
      return r.scale(n, s, o), r;
    },
    createRivet = (i, e, t) => placeGeometry(cylinder(0.0075, 0.0075, 0.006, 6), i, e, t);

// ===== 骨骼烘焙器与骨架场景实例化 =====
// 骨骼烘焙器：登记骨骼层级，把网格按骨骼蒙皮并按材质槽位合并
class RigBuilder {
    constructor() {
      (this.bones = []),
        (this.index = {}),
        (this.slots = {}),
        (this.order = []);
    }
    // 添加一根骨骼（名称、父骨骼、相对坐标），world 为累计世界坐标
    bone(e, t, n = 0, s = 0, o = 0) {
      let r = t ? this.bones[this.index[t]] : null;
      if (t && !r) throw new Error("rig: unknown parent bone " + t);
      let a = {
        name: e,
        parent: r ? r.i : -1,
        local: [n, s, o],
        world: [
          n + (r ? r.world[0] : 0),
          s + (r ? r.world[1] : 0),
          o + (r ? r.world[2] : 0),
        ],
        i: this.bones.length,
      };
      return (this.index[e] = a.i), this.bones.push(a), a;
    }
    // 把一块几何挂到指定骨骼，写入顶点色与蒙皮索引/权重
    add(e, t, n, s = [1, 1, 1], o = !0) {
      let r = this.bones[this.index[t]];
      if (!r) throw new Error("rig: unknown bone " + t);
      let a = n;
      a.attributes.normal || a.computeVertexNormals();
      for (let p of Object.keys(a.attributes))
        p !== "position" &&
          p !== "normal" &&
          p !== "uv" &&
          a.deleteAttribute(p);
      let l = a.attributes.position.count;
      a.attributes.uv ||
        a.setAttribute("uv", new BufferAttribute(new Float32Array(l * 2), 2)),
        a.translate(r.world[0], r.world[1], r.world[2]);
      let c = new Float32Array(l * 3),
        u = new Uint16Array(l * 4),
        h = new Float32Array(l * 4),
        f = a.attributes.normal;
      for (let p = 0; p < l; p++) {
        let d = o ? 0.74 + 0.26 * (f.getY(p) * 0.5 + 0.5) : 1;
        (c[p * 3] = s[0] * d),
          (c[p * 3 + 1] = s[1] * d),
          (c[p * 3 + 2] = s[2] * d),
          (u[p * 4] = r.i),
          (h[p * 4] = 1);
      }
      return (
        a.setAttribute("color", new BufferAttribute(c, 3)),
        a.setAttribute("skinIndex", new BufferAttribute(u, 4)),
        a.setAttribute("skinWeight", new BufferAttribute(h, 4)),
        this.slots[e] || ((this.slots[e] = []), this.order.push(e)),
        this.slots[e].push(a),
        this
      );
    }
    // 烘焙：按槽位合并几何，输出 { geometry, slots, bones, tris }
    build(e) {
      let t = (e || this.order).filter(
          (o) => this.slots[o] && this.slots[o].length,
        ),
        n = t.map((o) => {
          let r = this.slots[o],
            l = r.some((u) => !u.index)
              ? r.map((u) => (u.index ? u.toNonIndexed() : u))
              : r,
            c = mergeGeometries(l, !1);
          return c.index ? c.toNonIndexed() : c;
        }),
        s = mergeGeometries(n, !0);
      return (
        s.computeBoundingSphere(),
        s.computeBoundingBox(),
        {
          geometry: s,
          slots: t,
          bones: this.bones,
          tris: s.attributes.position.count / 3,
        }
      );
    }
  }
// 把烘焙数据实例化为 Group + SkinnedMesh + Bone 层级 + Skeleton；extra 为附加网格
function instantiateRig(
    i,
    e,
    {
      castShadow: t = !0,
      receiveShadow: n = !0,
      radius: s = 1.5,
      center: o = [0, 0.5, 0],
      extra: r = null,
    } = {},
  ) {
    let a = i.bones.map((p) => {
      let d = new Bone();
      return (
        (d.name = p.name), d.position.set(p.local[0], p.local[1], p.local[2]), d
      );
    });
    i.bones.forEach((p, d) => {
      p.parent >= 0 && a[p.parent].add(a[d]);
    });
    let l = new Group(),
      c = new SkinnedMesh(
        i.geometry,
        i.slots.map((p) => e[p]),
      );
    (c.castShadow = t),
      (c.receiveShadow = n),
      l.add(c),
      i.bones.forEach((p, d) => {
        p.parent < 0 && c.add(a[d]);
      }),
      l.updateMatrixWorld(!0);
    let u = new Skeleton(a);
    c.bind(u),
      (c.boundingSphere = new Sphere(new Vector3(o[0], o[1], o[2]), s)),
      (c.boundingBox = new Box3(
        new Vector3(o[0] - s, o[1] - s, o[2] - s),
        new Vector3(o[0] + s, o[1] + s, o[2] + s),
      ));
    let h = {};
    a.forEach((p) => {
      h[p.name] = p;
    });
    let f = { group: l, mesh: c, bones: h, skeleton: u, extraMesh: null };
    if (r) {
      let p = new SkinnedMesh(
        r.def.geometry,
        r.def.slots.map((d) => e[d]),
      );
      (p.castShadow = !1),
        (p.receiveShadow = !1),
        (p.renderOrder = 5),
        l.add(p),
        p.updateMatrixWorld(!0),
        p.bind(u, c.bindMatrix),
        (p.boundingSphere = new Sphere(new Vector3(o[0], o[1], o[2]), r.radius || s)),
        (p.boundingBox = new Box3().setFromCenterAndSize(
          p.boundingSphere.center,
          new Vector3(1, 1, 1).multiplyScalar(2 * (r.radius || s)),
        )),
        (f.extraMesh = p);
    }
    return f;
  }

// ===== 无人机挂点规格、旋翼毂轮廓与整机建模 =====
// 无人机挂点坐标（相对机身原点，单位米）：四旋翼、云台、球头、机炮、枪口、探照灯
var GULL_SPEC = {
    rotors: [
      [0.33, 0.035, 0.3],
      [-0.33, 0.035, 0.3],
      [0.33, 0.035, -0.3],
      [-0.33, 0.035, -0.3],
    ],
    gimbal: [0, -0.095, 0.275],
    ball: [0, -0.072, 0],
    gun: [0, -0.085, -0.1],
    muzzle: [0, -0.032, 0.27],
    lamp: [0, -0.066, 0.025],
  };
// 旋翼电机整流罩：由二维轮廓旋转生成的回转体
function createRotorHubFairing() {
    let i = [
      [0.176, -0.036],
      [0.196, -0.032],
      [0.206, 0],
      [0.202, 0.03],
      [0.19, 0.04],
      [0.178, 0.032],
      [0.173, 0],
      [0.176, -0.036],
    ].map((e) => new Vector2(e[0], e[1]));
    return new LatheGeometry(i, 28);
  }
// 烘焙整机：主机身 + 4 旋翼 + 云台球头 + 机炮 + 频闪灯；另烘焙旋翼盘/光锥附加网格
function buildGullRig() {
    let i = GULL_SPEC,
      e = new RigBuilder(),
      t = new RigBuilder(),
      // 主、附加两套烘焙器同步添加骨骼
      defineBone = (l, c, u, h, f) => {
        e.bone(l, c, u, h, f), t.bone(l, c, u, h, f);
      };
    // 骨架：root→body→{4 旋翼, 云台摇头→球头→灯, 机炮, 三色频闪灯}
    defineBone("root", null, 0, 0, 0), defineBone("body", "root", 0, 0, 0);
    for (let l = 0; l < 4; l++)
      defineBone("rotor" + l, "body", i.rotors[l][0], i.rotors[l][1], i.rotors[l][2]);
    defineBone("gimbalYaw", "body", i.gimbal[0], i.gimbal[1], i.gimbal[2]),
      defineBone("ball", "gimbalYaw", i.ball[0], i.ball[1], i.ball[2]),
      defineBone("lamp", "ball", i.lamp[0], i.lamp[1], i.lamp[2]),
      defineBone("gun", "body", i.gun[0], i.gun[1], i.gun[2]),
      defineBone("strobeG", "body", 0, 0, 0),
      defineBone("strobeR", "body", 0, 0, 0),
      defineBone("strobeW", "body", 0, 0, 0);
    // 向主烘焙器添加一块零件（槽位、骨骼、几何、顶点色、是否按法线加阴影）
    let addMainPart = (l, c, u, h, f) => e.add(l, c, u, h, f);
    // 机身外壳、散热格栅与顶部铭牌底座
    addMainPart("shell", "body", placeGeometry(createEllipsoid(1, 20, 12, 0.118, 0.074, 0.27), 0, 0.02, 0), COLOR_HULL_WHITE),
      addMainPart(
        "shell",
        "body",
        placeGeometry(createCylinder(1, 0.9, 1, 20), 0, 0.02, 0.165, HALF_PI, 0, 0, [0.094, 0.05, 0.06]),
        COLOR_ORANGE,
      ),
      addMainPart(
        "shell",
        "body",
        placeGeometry(createCylinder(1, 1, 1, 20), 0, 0.02, -0.02, HALF_PI, 0, 0, [0.121, 0.012, 0.0765]),
        COLOR_DARK_TRIM,
      ),
      addMainPart("shell", "body", placeGeometry(roundedBox(0.118, 0.014, 0.2, 0.005), 0, 0.089, -0.03), COLOR_HULL_LIGHT),
      addMainPart("shell", "body", placeGeometry(roundedBox(0.03, 0.006, 0.2, 0.002), 0, 0.0975, -0.03), COLOR_ORANGE);
    for (let l of [-0.05, 0.05])
      for (let c of [-0.12, 0.06]) addMainPart("metal", "body", createRivet(l, 0.097, c), COLOR_BRIGHT_METAL);
    addMainPart("metal", "body", placeGeometry(roundedBox(0.175, 0.06, 0.37, 0.016), 0, -0.035, -0.005), COLOR_DARK_METAL),
      addMainPart(
        "metal",
        "body",
        placeGeometry(roundedBox(0.12, 0.075, 0.11, 0.014), 0, 0.005, -0.265),
        COLOR_WHITE,
      ),
      addMainPart("shell", "body", placeGeometry(roundedBox(0.124, 0.02, 0.03, 0.005), 0, 0.03, -0.3), COLOR_ORANGE),
      addMainPart(
        "glow",
        "body",
        placeGeometry(roundedBox(0.05, 0.006, 0.003, 0.001), 0, 0, -0.321),
        [0.3, 1.6, 0.4],
        !1,
      );
    for (let l of [1, -1]) {
      for (let c = 0; c < 4; c++)
        addMainPart(
          "metal",
          "body",
          placeGeometry(
            roundedBox(0.004, 0.01, 0.06, 0.001),
            l * 0.0885,
            -0.045 + c * 0.016,
            -0.06,
          ),
          [0.2, 0.2, 0.2],
        );
      addMainPart(
        "metal",
        "body",
        createTube(
          [
            [l * 0.075, -0.055, 0.13],
            [l * 0.135, -0.175, 0.16],
            [l * 0.135, -0.192, 0.11],
            [l * 0.135, -0.192, -0.14],
            [l * 0.135, -0.175, -0.19],
            [l * 0.075, -0.055, -0.15],
          ],
          0.0085,
          6,
          !1,
          0.5,
        ),
        COLOR_BRIGHT_METAL,
      );
      for (let c of [0.07, -0.1])
        addMainPart(
          "shell",
          "body",
          placeGeometry(cylinderAlongZ(0.0135, 0.0135, 0.07, 8), l * 0.135, -0.192, c),
          COLOR_RUBBER,
        );
      addMainPart(
        "metal",
        "body",
        createStrut([l * 0.04, 0.07, -0.17], [l * 0.085, 0.37, -0.27], 0.004, 0.002, 5),
        COLOR_DARK_METAL,
      ),
        addMainPart(
          "metal",
          "body",
          placeGeometry(cylinder(0.008, 0.01, 0.025, 6), l * 0.04, 0.078, -0.17),
          COLOR_BRIGHT_METAL,
        );
    }
    addMainPart("metal", "body", placeGeometry(cylinder(0.007, 0.007, 0.04, 6), 0, 0.105, 0.1), COLOR_BRIGHT_METAL),
      addMainPart("shell", "body", placeGeometry(cylinder(0.034, 0.036, 0.018, 14), 0, 0.132, 0.1), COLOR_HULL_WHITE),
      addMainPart("metal", "body", placeGeometry(roundedBox(0.07, 0.03, 0.09, 0.008), 0, -0.075, 0.235), COLOR_WHITE);
    // 四条机臂、电机座、整流罩、旋翼桨叶与旋翼盘（附加网格）
    let o = createRotorHubFairing();
    for (let l = 0; l < 4; l++) {
      let [c, u, h] = i.rotors[l],
        f = Math.sign(c),
        p = Math.sign(h);
      addMainPart(
        "metal",
        "body",
        createStrut([f * 0.07, 0, p * 0.09], [c, u - 0.05, h], 0.017, 0.015, 8),
        COLOR_DARK_METAL,
      ),
        addMainPart(
          "shell",
          "body",
          placeGeometry(
            roundedBox(0.07, 0.045, 0.07, 0.014),
            f * 0.085,
            0,
            p * 0.1,
            0,
            f * p * 0.74,
            0,
          ),
          COLOR_HULL_WHITE,
        ),
        addMainPart(
          "shell",
          "body",
          createTube(
            [
              [f * 0.09, 0.02, p * 0.12],
              [f * 0.18, 0.012, p * 0.19],
              [c - f * 0.05, u - 0.03, h - p * 0.04],
            ],
            0.005,
            5,
          ),
          COLOR_RUBBER,
        ),
        addMainPart("metal", "body", placeGeometry(cylinder(0.04, 0.03, 0.075, 12), c, u - 0.05, h), COLOR_DARK_METAL),
        addMainPart("metal", "body", placeGeometry(cylinder(0.042, 0.042, 0.012, 12), c, u - 0.02, h), COLOR_BRIGHT_METAL),
        addMainPart("shell", "body", placeGeometry(o.clone(), c, u, h), COLOR_HULL_WHITE),
        addMainPart(
          "shell",
          "body",
          placeGeometry(new TorusGeometry(0.196, 0.0085, 6, 28), c, u + 0.036, h, HALF_PI, 0, 0),
          COLOR_ORANGE,
        );
      for (let killGull = 0; killGull < 3; killGull++) {
        let fallTick = killGull * 2.094 + 0.5 + l;
        addMainPart(
          "metal",
          "body",
          placeGeometry(
            roundedBox(0.145, 0.007, 0.016, 0.002),
            c + Math.cos(fallTick) * 0.105,
            u - 0.022,
            h - Math.sin(fallTick) * 0.105,
            0,
            fallTick,
            0,
          ),
          COLOR_DARK_METAL,
        );
      }
      for (let killGull = -1; killGull <= 1; killGull++) {
        let fallTick = Math.atan2(p, f) + killGull * 0.2;
        addMainPart(
          "shell",
          "body",
          placeGeometry(
            roundedBox(0.012, 0.05, 0.036, 0.003),
            c + Math.cos(fallTick) * 0.205,
            u,
            h + Math.sin(fallTick) * 0.205,
            0,
            -fallTick,
            0,
          ),
          killGull === 0 ? COLOR_DARK_TRIM : COLOR_AMBER,
        );
      }
      addMainPart("metal", "rotor" + l, placeGeometry(cylinder(0.017, 0.02, 0.03, 8), 0, -0.002, 0), COLOR_BRIGHT_METAL),
        addMainPart(
          "metal",
          "rotor" + l,
          placeGeometry(roundedBox(0.158, 0.0035, 0.03, 0.001), 0.088, 0.008, 0, 0.22, 0, 0),
          COLOR_DARK_METAL,
        ),
        addMainPart(
          "metal",
          "rotor" + l,
          placeGeometry(roundedBox(0.158, 0.0035, 0.03, 0.001), -0.088, 0.008, 0, -0.22, 0, 0),
          COLOR_DARK_METAL,
        ),
        addMainPart(
          "shell",
          "rotor" + l,
          placeGeometry(roundedBox(0.02, 0.004, 0.031, 0.001), 0.158, 0.008, 0, 0.22, 0, 0),
          COLOR_AMBER,
        ),
        addMainPart(
          "shell",
          "rotor" + l,
          placeGeometry(roundedBox(0.02, 0.004, 0.031, 0.001), -0.158, 0.008, 0, -0.22, 0, 0),
          COLOR_AMBER,
        );
      let d = new RingGeometry(0.03, 0.168, 24, 1);
      d.rotateX(-HALF_PI),
        t.add("disc", "body", placeGeometry(d, c, u + 0.008, h), [1, 1, 1], !1);
    }
    // 翼尖红/绿频闪灯与尾部白色频闪灯
    addMainPart(
      "glow",
      "strobeR",
      placeGeometry(createEllipsoid(0.012, 8, 6), 0.33 + 0.215, 0.035, 0.3),
      [10, 0.4, 0.2],
      !1,
    ),
      addMainPart(
        "glow",
        "strobeR",
        placeGeometry(createEllipsoid(0.012, 8, 6), 0.33 + 0.215, 0.035, -0.3),
        [10, 0.4, 0.2],
        !1,
      ),
      addMainPart(
        "glow",
        "strobeG",
        placeGeometry(createEllipsoid(0.012, 8, 6), -0.33 - 0.215, 0.035, 0.3),
        [0.3, 9, 1],
        !1,
      ),
      addMainPart(
        "glow",
        "strobeG",
        placeGeometry(createEllipsoid(0.012, 8, 6), -0.33 - 0.215, 0.035, -0.3),
        [0.3, 9, 1],
        !1,
      ),
      addMainPart("glow", "strobeW", placeGeometry(createEllipsoid(0.011, 8, 6), 0, 0.05, -0.325), [9, 9, 9], !1),
      addMainPart(
        "metal",
        "gimbalYaw",
        placeGeometry(cylinder(0.036, 0.036, 0.014, 12), 0, -0.004, 0),
        COLOR_DARK_METAL,
      ),
      addMainPart(
        "metal",
        "gimbalYaw",
        placeGeometry(roundedBox(0.156, 0.01, 0.03, 0.003), 0, -0.014, 0),
        COLOR_WHITE,
      );
    for (let l of [1, -1])
      addMainPart(
        "metal",
        "gimbalYaw",
        placeGeometry(roundedBox(0.009, 0.075, 0.03, 0.003), l * 0.0735, -0.05, 0),
        COLOR_WHITE,
      );
    // 云台摇头机构、球头相机、镜头、探照灯与光锥
    addMainPart("metal", "ball", placeGeometry(createEllipsoid(0.06, 18, 12), 0, 0, 0), COLOR_DARK_METAL),
      addMainPart("metal", "ball", placeGeometry(cylinderAlongX(0.013, 0.013, 0.142, 8), 0, 0, 0), COLOR_BRIGHT_METAL),
      addMainPart("metal", "ball", placeGeometry(cylinderAlongZ(0.031, 0.036, 0.03, 14), 0, 0.004, 0.048), COLOR_WHITE),
      addMainPart(
        "lens",
        "ball",
        placeGeometry(cylinderAlongZ(0.025, 0.025, 0.004, 14), 0, 0.004, 0.0645),
        [1, 1, 1],
        !1,
      ),
      addMainPart(
        "metal",
        "ball",
        placeGeometry(cylinderAlongZ(0.012, 0.012, 0.01, 8), 0.03, 0.036, 0.04),
        [0.1, 0.12, 0.2],
      ),
      addMainPart(
        "metal",
        "ball",
        placeGeometry(
          cylinderAlongZ(0.019, 0.023, 0.045, 10),
          i.lamp[0],
          i.lamp[1],
          i.lamp[2] - 0.022,
        ),
        COLOR_DARK_METAL,
      ),
      addMainPart(
        "glow",
        "lamp",
        placeGeometry(cylinderAlongZ(0.016, 0.016, 0.003, 10), 0, 0, 0.001),
        [11, 9.8, 7.6],
        !1,
      );
    {
      let u = new ConeGeometry(1.25, 9, 20, 6, !0);
      u.translate(0, -9 / 2, 0),
        u.rotateX(-HALF_PI),
        t.add("cone", "lamp", u, [1, 1, 1], !1);
    }
    // 机炮主体、双联炮管与炮口
    addMainPart("metal", "gun", placeGeometry(roundedBox(0.05, 0.03, 0.05, 0.006), 0, 0.012, 0), COLOR_WHITE),
      addMainPart("metal", "gun", placeGeometry(cylinderAlongX(0.012, 0.012, 0.07, 8), 0, -0.005, 0), COLOR_BRIGHT_METAL),
      addMainPart("metal", "gun", placeGeometry(roundedBox(0.052, 0.046, 0.13, 0.008), 0, -0.032, 0), COLOR_WHITE),
      addMainPart("shell", "gun", placeGeometry(roundedBox(0.054, 0.012, 0.05, 0.003), 0, -0.02, -0.03), COLOR_ORANGE);
    for (let l of [-0.014, 0.014])
      addMainPart("metal", "gun", placeGeometry(cylinderAlongZ(0.0085, 0.0085, 0.2, 8), l, -0.032, 0.16), COLOR_DARK_METAL),
        addMainPart("metal", "gun", placeGeometry(cylinderAlongZ(0.012, 0.012, 0.03, 8), l, -0.032, 0.255), COLOR_WHITE);
    addMainPart("metal", "gun", placeGeometry(roundedBox(0.045, 0.012, 0.012, 0.002), 0, -0.032, 0.2), COLOR_BRIGHT_METAL),
      addMainPart(
        "metal",
        "gun",
        placeGeometry(roundedBox(0.03, 0.05, 0.05, 0.006), 0.04, -0.035, -0.02),
        COLOR_DARK_METAL,
      );
    // 分别烘焙主网格与附加网格
    let r = e.build(["shell", "metal", "glow", "lens"]),
      a = t.build(["disc", "cone"]);
    return (r.extra = a), r;
  }

// ===== 战斗调参、复用临时向量与数学工具 =====
// 战斗与飞行调参：血量、弹丸、连发、射程、速度、加速度、爆炸
var GULL_TUNE = {
      hp: 45,
      boltDamage: 7,
      boltSpeed: 70,
      burst: 3,
      burstGap: 0.12,
      telegraph: 0.55,
      cooldown: [1.9, 3.3],
      rangeMin: 12,
      rangeMax: 25,
      altMin: 4,
      altMax: 8,
      maxSpeed: 8,
      patrolSpeed: 3,
      accel: 11,
      spreadFar: 0.065,
      spreadNear: 0.018,
      fireRange: 42,
      explodeRadius: 3,
      explodeDamage: 30,
    },
    _scratchVec = new Vector3(),
    _tmpDir = new Vector3(),
    _steerVec = new Vector3(),
    _aimPoint = new Vector3(),
    UP = new Vector3(0, 1, 0),
    DOWN = new Vector3(0, -1, 0),
    LENS_COLOR_PATROL = [8, 4, 0.7],
    LENS_COLOR_ENGAGE = [14, 1, 0.35],
    shortestAngleDelta = (i, e) => {
      let t = (i - e) % (Math.PI * 2);
      return (
        t > Math.PI ? (t -= Math.PI * 2) : t < -Math.PI && (t += Math.PI * 2), t
      );
    },
    clamp = (i, e, t) => (i < e ? e : i > t ? t : i);

// ===== 无人机实例工厂：状态、飞行、瞄准、开火、坠毁 =====
// 创建一架无人机实例（对象池成员），返回带 damage/_update 等方法的状态对象
function createGull(i, e, t, n) {
    let s = i.G,
      o = i.rng,
      r = t.lensBase.clone(),
      a = instantiateRig(
        e,
        {
          shell: t.shell,
          metal: t.metal,
          glow: t.glow,
          lens: r,
          disc: t.disc,
          cone: t.cone,
        },
        { radius: 0.9, center: [0, 0, 0], extra: { def: e.extra, radius: 10 } },
      ),
      l = a.bones;
    (a.group.rotation.order = "YXZ"), (a.group.visible = !1);
    let c = s.mats.label("G-" + String(n + 11), {
        color: "black",
        font: "stencil",
        distress: 0.35,
      }),
      u = 0.105,
      h = Math.min(0.045, u / (c.aspect || 3)),
      f = new PlaneGeometry(u, h);
    f.rotateX(-Math.PI / 2), f.rotateY(Math.PI);
    let p = new Mesh(f, c.material);
    p.position.set(0, 0.0985, -0.085),
      (p.castShadow = !1),
      (p.receiveShadow = !0),
      l.body.add(p);
    // 实例状态：基础 / 飞行 / 感知交战 / 攻击 / 死亡字段集中在此
    let d = {
      id: 0,
      type: "gull",
      pos: a.group.position,
      alive: !1,
      hp: GULL_TUNE.hp,
      active: !1,
      rig: a,
      lens: r,
      vel: new Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      home: new Vector3(),
      lastKnown: new Vector3(),
      sensor: new Vector3(),
      fwd: new Vector3(0, 0, 1),
      muzzle: new Vector3(),
      mode: "patrol",
      los: !1,
      seeT: 0,
      noSeeT: 0,
      senseT: 0,
      exposure: 0,
      modeT: 0,
      passive: !1,
      hasToken: !1,
      orbitA: 0,
      orbitDir: 1,
      orbitR: 16,
      alt: 6,
      hoverY: 0,
      phase: 0,
      ceil: 1e9,
      ceilT: 0,
      flipT: 0,
      avoid: new Vector3(),
      atk: "idle",
      atkT: 0,
      cool: 1,
      shots: 0,
      smokeT: 0,
      feeler: 0,
      strobeT: 0,
      flare: 0,
      lensC: [LENS_COLOR_PATROL[0], LENS_COLOR_PATROL[1], LENS_COLOR_PATROL[2]],
      dieT: 0,
      spin: 0,
      lostRotor: 0,
      gy: 0,
      gp: 0,
      loop: null,
      sweep: 0,
      thr: 1,
      // 受伤：扣血、发命中事件、受击晃动、唤起同伴；血量归零进入坠毁
      damage(y, b, m, A) {
        return d.alive
          ? ((d.hp -= y),
            s.events.emit("enemy:hit", {
              enemy: d,
              point: b,
              part: A || "body",
            }),
            m &&
              (d.vel.addScaledVector(m, Math.min(3, y * 0.09)),
              (d.roll += (o() - 0.5) * 0.5),
              (d.pitch += (o() - 0.5) * 0.4)),
            i.provoke(d),
            d.hp <= 0 ? (beginCrash(m), !0) : !1)
          : !1;
      },
      // 激活（对象池取出）：重置全部状态、随机巡逻参数、开启旋翼音效
      _activate(y, b = {}) {
        (d.active = !0),
          (d.alive = !0),
          (d.hp = GULL_TUNE.hp),
          (d.passive = !!b.passive),
          d.pos.copy(y),
          d.home.copy(y),
          d.vel.set(0, 0, 0),
          (d.yaw = b.yaw ?? o() * 6.283),
          (d.pitch = d.roll = 0),
          (d.mode = b.state === "alert" ? "investigate" : "patrol"),
          (d.modeT = 8),
          d.lastKnown.copy(b.target || (s.player ? s.player.pos : y)),
          (d.los = !1),
          (d.seeT = d.noSeeT = 0),
          (d.exposure = 0),
          (d.senseT = o() * 0.2),
          (d.hasToken = !1),
          (d.orbitDir = o() < 0.5 ? 1 : -1),
          (d.orbitR = GULL_TUNE.rangeMin + 2 + o() * (GULL_TUNE.rangeMax - GULL_TUNE.rangeMin - 5)),
          (d.alt =
            b.hover ?? GULL_TUNE.altMin + 0.8 + o() * (GULL_TUNE.altMax - GULL_TUNE.altMin - 1.6)),
          (d.hoverFixed = b.hover != null),
          (d.patrolR = b.patrolRadius ?? 4 + o() * 5),
          (d.phase = o() * 6.283),
          (d.orbitA = o() * 6.283),
          (d.ceil = 1e9),
          (d.flipT = 3 + o() * 4),
          (d.atk = "idle"),
          (d.cool = 1 + o() * 1.5),
          (d.dieT = 0),
          (d.spin = 0),
          (d.lostRotor = -1),
          (d.flare = 0),
          (d.thr = 1);
        for (let m = 0; m < 4; m++) l["rotor" + m].scale.setScalar(1);
        if (
          (l.lamp.scale.setScalar(1),
          l.body.rotation.set(0, 0, 0),
          (a.group.visible = !0),
          a.group.rotation.set(0, d.yaw, 0),
          s.audio && s.audio.loop && !d.loop)
        )
          try {
            d.loop = s.audio.loop("gull_rotor", { pos: d.pos, gain: 0.5 });
          } catch {
            d.loop = null;
          }
      },
      // 回收进对象池：隐藏模型、释放攻击令牌、停止旋翼音效
      _deactivate() {
        if (
          ((d.active = !1),
          (d.alive = !1),
          (a.group.visible = !1),
          i.releaseToken(d),
          d.loop)
        ) {
          try {
            d.loop.stop();
          } catch {}
          d.loop = null;
        }
      },
      // 子弹命中检测：把机身近似为竖直拉伸的椭球做射线求交
      _raycast(y, b, m, A) {
        let E = y.x - d.pos.x,
          w = (y.y - d.pos.y + 0.03) * 2.3,
          S = y.z - d.pos.z,
          z = b.x,
          H = b.y * 2.3,
          O = b.z,
          q = z * z + H * H + O * O,
          U = E * z + w * H + S * O,
          T = E * E + w * w + S * S - 0.5 * 0.5,
          D = U * U - q * T;
        if (D < 0) return !1;
        let C = (-U - Math.sqrt(D)) / q;
        return C < 0 || C > m || C >= A.dist
          ? !1
          : ((A.dist = C),
            (A.part = "body"),
            (A.enemy = d),
            A.point.copy(y).addScaledVector(b, C),
            A.normal.copy(A.point).sub(d.pos),
            (A.normal.y *= 2.3),
            A.normal.normalize(),
            !0);
      },
      // 联机远端无人机的简化表现：只同步朝向、旋翼转动与轻微摇摆
      remote(y) {
        if (!d.active) return;
        if (!d.alive) {
          updateCrash(y);
          return;
        }
        a.group.visible = true;
        a.group.rotation.y = d.yaw;
        const speed = d.remoteSpeed || 0;
        for (let i = 0; i < 4; i++) {
          const rotor = l["rotor" + i];
          if (rotor) rotor.rotation.y += y * (16 + speed * 2) * (i % 2 ? -1 : 1);
        }
        if (l.body)
          l.body.rotation.z =
            Math.sin((performance.now() / 1000) * 3 + d.id) * 0.05;
      },
      // 每帧入口：远端 → remote，存活 → updateFlight，死亡 → updateCrash
      _update(y) {
        if (d.isRemote) return d.remote(y);
        d.alive ? updateFlight(y) : updateCrash(y);
      },
    };
// 判定死亡：随机炸掉一个旋翼、喷火花碎片浓烟、熄灭灯光与镜头、发出击杀事件
function beginCrash(y) {
      (d.alive = !1),
        i.releaseToken(d),
        (d.dieT = 0),
        (d.lostRotor = Math.floor(o() * 4)),
        l["rotor" + d.lostRotor].scale.setScalar(1e-4),
        _scratchVec
          .set(GULL_SPEC.rotors[d.lostRotor][0], 0.05, GULL_SPEC.rotors[d.lostRotor][2])
          .applyAxisAngle(UP, d.yaw)
          .add(d.pos),
        s.fx.sparks(_scratchVec, UP, 14),
        s.fx.debris(_scratchVec, { count: 3 }),
        s.fx.smoke(_scratchVec, { size: 0.5, life: 1 }),
        (d.spin = (o() < 0.5 ? -1 : 1) * (5 + o() * 3)),
        (d.vel.y += 1.5),
        y && d.vel.addScaledVector(y, 2.5),
        l.lamp.scale.setScalar(1e-4),
        l.strobeG.scale.setScalar(1e-4),
        l.strobeR.scale.setScalar(1e-4),
        l.strobeW.scale.setScalar(1e-4),
        r.color.setRGB(0.3, 0.05, 0.02),
        s.events.emit("enemy:killed", { enemy: d, pos: d.pos, type: "gull" });
    }
// 坠毁逐帧：重力加速、自旋翻滚、触地爆炸并回收进对象池
function updateCrash(y) {
      (d.dieT += y),
        (d.vel.y -= 9.5 * y),
        (d.vel.x *= 1 - 0.4 * y),
        (d.vel.z *= 1 - 0.4 * y),
        (d.spin += Math.sign(d.spin) * 7 * y),
        (d.yaw += d.spin * y),
        (d.roll += d.spin * 0.35 * y),
        (d.pitch += 0.9 * y);
      let b = d.vel.length(),
        m = b * y,
        A = d.dieT > 5 || d.pos.y < -3;
      if (!A && b > 0.01) {
        _tmpDir.copy(d.vel).multiplyScalar(1 / b);
        let _ = s.physics.raycast(d.pos, _tmpDir, m + 0.3);
        _ && (d.pos.copy(_.point).addScaledVector(_.normal, 0.2), (A = !0));
      }
      A || d.pos.addScaledVector(d.vel, y),
        a.group.rotation.set(d.pitch, d.yaw, d.roll);
      for (let _ = 0; _ < 4; _++)
        _ !== d.lostRotor &&
          (l["rotor" + _].rotation.y +=
            (_ % 3 === 0 ? 1 : -1) * 30 * Math.max(0.2, 1 - d.dieT * 0.5) * y);
      (d.smokeT -= y),
        d.smokeT <= 0 &&
          ((d.smokeT = 0.045),
          s.fx.smoke(d.pos, {
            size: 0.45,
            life: 1.3,
            color: 1381914,
            rise: 0.6,
          }),
          o() < 0.5 &&
            (_scratchVec.set(o() - 0.5, o(), o() - 0.5).normalize(),
            s.fx.sparks(d.pos, _scratchVec, 3))),
        d.loop &&
          (d.loop.setPos(d.pos),
          d.loop.setPitch(Math.max(0.4, 1.25 - d.dieT * 0.4)),
          d.loop.setGain(0.5)),
        A &&
          (s.fx.explosion(d.pos, 1.2),
          s.combat &&
            s.combat.explode &&
            s.combat.explode(
              d.pos,
              GULL_TUNE.explodeRadius,
              GULL_TUNE.explodeDamage,
              "enemy",
            ),
          s.events.emit("enemy:crashed", {
            enemy: d,
            pos: d.pos,
            type: "gull",
          }),
          i.retire(d));
    }
// 存活逐帧：飞行控制 + 姿态 + 旋翼 + 频闪灯 + 云台瞄准 + 开火状态机
function updateFlight(y) {
      let b = s.player,
        m = i.t;
      d.fwd.set(Math.sin(d.yaw), 0, Math.cos(d.yaw)),
        d.sensor.set(0, -0.17, 0.27).applyAxisAngle(UP, d.yaw).add(d.pos),
        i.think(d, y, 0.4);
      let A = d.mode === "engage",
        _ = d.hp < GULL_TUNE.hp * 0.5,
        M = GULL_TUNE.patrolSpeed,
        E,
        w,
        S;
      // 交战时绕玩家盘旋；丢失视野超过 1.5s 则飞向最后已知位置
      if (A && b) {
        M = GULL_TUNE.maxSpeed;
        let P = d.atk !== "idle";
        (d.flipT -= y),
          d.flipT <= 0 &&
            ((d.flipT = 3 + o() * 5),
            o() < 0.6 && (d.orbitDir = -d.orbitDir),
            (d.orbitR = clamp(
              d.orbitR + (o() - 0.5) * 6,
              GULL_TUNE.rangeMin + 1,
              GULL_TUNE.rangeMax - 2,
            ))),
          d.noSeeT > 1.5
            ? ((E = d.lastKnown.x),
              (S = d.lastKnown.z),
              (w = d.lastKnown.y + d.alt + 1),
              (d.orbitA = Math.atan2(
                d.pos.z - d.lastKnown.z,
                d.pos.x - d.lastKnown.x,
              )))
            : ((d.orbitA += ((d.orbitDir * (P ? 0.9 : 3.6)) / d.orbitR) * y),
              (E = b.pos.x + Math.cos(d.orbitA) * d.orbitR),
              (S = b.pos.z + Math.sin(d.orbitA) * d.orbitR),
              (w = b.pos.y + d.alt));
      } else
        d.mode === "investigate" || d.mode === "search"
          ? ((M = 5.5),
            (d.orbitA += 0.5 * y),
            (E = d.lastKnown.x + Math.cos(d.orbitA) * 4.5),
            (S = d.lastKnown.z + Math.sin(d.orbitA) * 4.5),
            (w = d.lastKnown.y + Math.min(d.alt, 5.5)))
          : ((d.orbitA += 0.28 * y * d.orbitDir),
            (E = d.home.x + Math.cos(d.orbitA) * d.patrolR),
            (S = d.home.z + Math.sin(d.orbitA) * d.patrolR),
            (w = d.hoverFixed ? d.alt : d.home.y));
      w > d.ceil && (w = d.ceil),
        !d.hoverFixed && w < 2.2 && (w = 2.2),
        _steerVec.set(
          (E - d.pos.x) * 2.2 - d.vel.x * 2.4,
          (w - d.pos.y) * 5 - d.vel.y * 3.6,
          (S - d.pos.z) * 2.2 - d.vel.z * 2.4,
        ),
        (d.feeler = (d.feeler + 1) % 3);
      // 三根「触须」轮流探测：前方障碍、下方地面、上方天花板
      let z = Math.hypot(d.vel.x, d.vel.z);
      if (d.feeler === 0 && z > 0.6) {
        _tmpDir.set(d.vel.x / z, 0, d.vel.z / z);
        let P = 2.2 + z * 0.5,
          V = s.physics.raycast(d.pos, _tmpDir, P);
        if (V) {
          let Y = 1 - V.dist / P;
          d.avoid.copy(V.normal).multiplyScalar(26 * Y),
            (d.avoid.y += 9 * Y),
            Y > 0.5 && ((d.orbitDir = -d.orbitDir), (d.flipT = 2.5));
        }
      } else if (d.feeler === 1) {
        let P = s.physics.raycast(d.pos, DOWN, 2.4);
        P && !d.hoverFixed && (d.avoid.y += (2.4 - P.dist) * 10);
      } else if (d.feeler === 2 && ((d.ceilT -= y * 3), d.ceilT <= 0)) {
        d.ceilT = 0.35;
        let P = s.physics.raycast(d.pos, UP, 4);
        d.ceil = P ? d.pos.y + P.dist - 1.3 : 1e9;
      }
      _steerVec.add(d.avoid),
        d.avoid.multiplyScalar(Math.exp(-6 * y)),
        _ &&
          ((_steerVec.x += Math.sin(m * 7.3 + d.phase) * 5),
          (_steerVec.z += Math.cos(m * 6.1 + d.phase) * 5),
          (_steerVec.y += Math.sin(m * 9.7) * 3));
      let H = _steerVec.length();
      H > GULL_TUNE.accel && _steerVec.multiplyScalar(GULL_TUNE.accel / H),
        d.vel.addScaledVector(_steerVec, y);
      let O = d.vel.length();
      O > M && (d.vel.multiplyScalar(M / O), (O = M));
      for (let P = 0; P < 3; P++) {
        let V = P === 0 ? d.vel.x : P === 1 ? d.vel.y : d.vel.z;
        if (Math.abs(V) < 0.02) continue;
        let Y = V > 0 ? 1 : -1,
          L = P === 1 ? 0.35 : 0.62;
        _tmpDir.set(P === 0 ? Y : 0, P === 1 ? Y : 0, P === 2 ? Y : 0);
        let Z = s.physics.raycast(d.pos, _tmpDir, Math.abs(V) * y + L);
        Z &&
          (d.vel.setComponent(P, -V * 0.25),
          d.avoid.setComponent(P, d.avoid.getComponent(P) - Y * 8),
          Z.dist < L &&
            d.pos.setComponent(P, d.pos.getComponent(P) - Y * (L - Z.dist)));
      }
      if ((d.pos.addScaledVector(d.vel, y), !d.hoverFixed)) {
        let P = s.physics.groundHeight(d.pos.x, d.pos.z, d.pos.y + 0.5) + 1.1;
        d.pos.y < P && ((d.pos.y = P), d.vel.y < 0 && (d.vel.y = 0));
      }
      // 偏航朝向目标（交战/搜索）或速度方向（巡逻），并推算俯仰/横滚
      let q = d.yaw;
      if ((A || d.mode === "search" || d.mode === "investigate") && b) {
        let P = A && d.noSeeT < 1.5 ? b.pos : d.lastKnown;
        q = Math.atan2(P.x - d.pos.x, P.z - d.pos.z);
      } else z > 0.4 && (q = Math.atan2(d.vel.x, d.vel.z));
      let U = shortestAngleDelta(q, d.yaw);
      d.yaw += clamp(U, -3.2 * y, 3.2 * y);
      let T = Math.cos(d.yaw),
        D = Math.sin(d.yaw),
        C = _steerVec.x * D + _steerVec.z * T,
        G = _steerVec.x * T - _steerVec.z * D,
        j = clamp(C * 0.04, -0.42, 0.42),
        N = clamp(-G * 0.04, -0.42, 0.42);
      _ &&
        ((j += Math.sin(m * 11 + d.phase) * 0.1),
        (N += Math.cos(m * 8.7 + d.phase * 2) * 0.13));
      let Q = 1 - Math.exp(-7 * y);
      (d.pitch += (j - d.pitch) * Q),
        (d.roll += (N - d.roll) * Q),
        a.group.rotation.set(d.pitch, d.yaw, d.roll),
        (l.body.position.y =
          Math.sin(m * 2.1 + d.phase) * 0.045 +
          Math.sin(m * 3.7 + d.phase * 1.7) * 0.018),
        (d.thr += (1 + clamp(_steerVec.y * 0.03, -0.25, 0.4) + z * 0.02 - d.thr) * Q);
      // 四个旋翼按油门差速反向旋转，残血时额外抖动
      let K = 41 * d.thr * y;
      (l.rotor0.rotation.y += K),
        (l.rotor1.rotation.y -= K * 1.03),
        (l.rotor2.rotation.y -= K * 0.98),
        (l.rotor3.rotation.y += K * 1.01);
      // 翼尖红/绿频闪与尾部白灯按时间片闪烁
      let ie = (m * 0.9 + d.phase * 0.1) % 1,
        F = ie < 0.05 || (ie > 0.13 && ie < 0.18) ? 1 : 1e-4;
      if (
        (l.strobeR.scale.setScalar(F),
        l.strobeG.scale.setScalar(F),
        l.strobeW.scale.setScalar(ie > 0.5 && ie < 0.56 ? 1 : 1e-4),
        A && b)
      )
        _aimPoint.set(b.pos.x, b.pos.y + 1.1, b.pos.z);
      else if (d.mode !== "patrol")
        (d.sweep += y),
          _aimPoint.set(
            d.lastKnown.x + Math.sin(d.sweep * 0.9) * 3,
            d.lastKnown.y,
            d.lastKnown.z + Math.cos(d.sweep * 0.7) * 3,
          );
      else {
        d.sweep += y;
        let P = d.yaw + Math.sin(d.sweep * 0.5 + d.phase) * 0.9;
        _aimPoint.set(
          d.pos.x + Math.sin(P) * 5,
          d.pos.y - (d.hoverFixed ? 1.6 : 5),
          d.pos.z + Math.cos(P) * 5,
        );
      }
      // 云台偏航、球头俯仰、机炮俯仰平滑追踪注视点
      _scratchVec.copy(_aimPoint).sub(d.sensor);
      let X = _scratchVec.x * T - _scratchVec.z * D,
        ne = _scratchVec.x * D + _scratchVec.z * T,
        re = _scratchVec.y,
        $ = Math.atan2(X, ne),
        ue = clamp(Math.atan2(-re, Math.hypot(X, ne)), -0.5, 1.5),
        me = 1 - Math.exp(-9 * y);
      (d.gy += shortestAngleDelta($, d.gy) * me),
        (d.gp += (ue - d.gp) * me),
        (l.gimbalYaw.rotation.y = d.gy),
        (l.ball.rotation.x = d.gp - d.pitch),
        (l.gun.rotation.x = clamp(d.gp, -0.2, 1.3) - d.pitch);
      // 镜头颜色在巡逻暖白与交战红之间渐变，开火前蓄能闪亮
      let ee = A ? LENS_COLOR_ENGAGE : LENS_COLOR_PATROL,
        B = 1 + d.flare * 3.2 + (A ? 0 : Math.sin(m * 3 + d.phase) * 0.15);
      for (let P = 0; P < 3; P++)
        d.lensC[P] += (ee[P] - d.lensC[P]) * (1 - Math.exp(-8 * y));
      // 开火状态机：idle → tele（蓄能预警）→ burst（三连发：弹道预判 + 散布）→ idle
      if (
        (r.color.setRGB(d.lensC[0] * B, d.lensC[1] * B, d.lensC[2] * B),
        (d.flare = Math.max(0, d.flare - y * 1.5)),
        d.muzzle.set(0, -0.12, 0.17).applyAxisAngle(UP, d.yaw).add(d.pos),
        (d.cool -= y),
        d.atk === "idle")
      )
        A &&
          d.los &&
          d.cool <= 0 &&
          b &&
          b.alive &&
          Math.abs(U) < 0.35 &&
          d.pos.distanceTo(b.pos) < GULL_TUNE.fireRange &&
          i.requestToken(d) &&
          ((d.atk = "tele"),
          (d.atkT = GULL_TUNE.telegraph),
          s.events.emit("enemy:telegraph", {
            enemy: d,
            type: "gull",
            time: GULL_TUNE.telegraph,
            pos: d.pos,
          }));
      else if (d.atk === "tele")
        (d.atkT -= y),
          (d.flare = Math.min(1, d.flare + y * 4.5)),
          A
            ? d.atkT <= 0 &&
              ((d.atk = "burst"),
              (d.shots = GULL_TUNE.burst),
              (d.atkT = 0),
              (d.lead = 0.2 + o() * 0.65))
            : ((d.atk = "idle"), i.releaseToken(d));
      else if (
        d.atk === "burst" &&
        ((d.atkT -= y), (d.flare = 1), d.atkT <= 0)
      ) {
        if (((d.atkT = GULL_TUNE.burstGap), d.shots--, b)) {
          let P = d.muzzle.distanceTo(b.pos),
            V = P / GULL_TUNE.boltSpeed;
          _aimPoint.set(
            b.pos.x + b.vel.x * V * d.lead,
            b.pos.y + 1.05,
            b.pos.z + b.vel.z * V * d.lead,
          ),
            _tmpDir.copy(_aimPoint).sub(d.muzzle).normalize();
          let Y =
            (GULL_TUNE.spreadFar + (GULL_TUNE.spreadNear - GULL_TUNE.spreadFar) * d.exposure) *
            (1 + i.playerSpeed * 0.45) *
            (_ ? 1.5 : 1);
          (_tmpDir.x += (o() - 0.5) * 2 * Y),
            (_tmpDir.y += (o() - 0.5) * 2 * Y),
            (_tmpDir.z += (o() - 0.5) * 2 * Y),
            _tmpDir.normalize(),
            i.fireBolt(d.muzzle, _tmpDir, d),
            s.fx.muzzleFlash(d.muzzle, _tmpDir, { scale: 0.55 }),
            s.events.emit("enemy:fire", {
              enemy: d,
              pos: d.muzzle,
              dir: _tmpDir,
              type: "gull",
            }),
            d.vel.addScaledVector(_tmpDir, -0.35);
        }
        d.shots <= 0 &&
          ((d.atk = "idle"),
          (d.cool = GULL_TUNE.cooldown[0] + o() * (GULL_TUNE.cooldown[1] - GULL_TUNE.cooldown[0])),
          i.releaseToken(d));
      }
      // 残血冒烟，旋翼音效随油门变调
      _ &&
        ((d.smokeT -= y),
        d.smokeT <= 0 &&
          ((d.smokeT = 0.16),
          s.fx.smoke(d.pos, {
            size: 0.3,
            life: 1.1,
            color: 2500652,
            rise: 0.8,
          }),
          o() < 0.15 && s.fx.sparks(d.pos, DOWN, 2))),
        d.loop &&
          (d.loop.setPos(d.pos),
          d.loop.setPitch(
            0.85 + d.thr * 0.2 + (_ ? Math.sin(m * 13) * 0.05 : 0),
          ));
    }
    return d;
  }

export { buildGullRig, createGull, GULL_TUNE, GULL_SPEC };