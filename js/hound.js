// 机器狗（Hound）模块 —— 从 js/game.js 独立出来的四足攻击机器人
//
// 模块职责：
//   - 几何工具：圆角盒、圆柱、管线、椭球、变换等（内联自 three.js BufferGeometryUtils）
//   - RigBuilder 烘焙骨骼与蒙皮网格，instantiateRig 实例化成场景对象
//   - solveLegIK 解算四条腿的外展 / 髋 / 膝关节角
//   - buildHoundRig() 烘焙整机模型（shell/metal/glow/lens 四个材质槽位）
//   - createHound() 创建单只实例：导航游走、交战状态机、扑咬、步态、瞄准、死亡残骸与联机同步
//
// 对外导出（由 js/game.js 引用）：
//   buildHoundRig()                          烘焙一次模型定义，供所有实例共享
//   createHound(ai, rigDef, materials, index) 创建实例
//   HOUND_TUNE                               战斗与运动调参
//   HOUND_SPEC                               骨架尺寸与步态规格
//
// createHound 参数契约：
//   ai        敌人 AI 管理器（{ G: 游戏上下文, rng, t, think, requestToken,
//             releaseToken, provoke, addWreck, retire, playerSpeed, mergeSimple, list }）
//   rigDef    buildHoundRig() 的返回值
//   materials { shell, metal, glow, lensBase }
//
// 注意：实例的 damage / _activate / _deactivate / _raycast / remoteHound / _update 方法，
// 以及 isRemote / remoteSpeed / remotePhase / sink / wreck 等字段由 game.js 直接调用，保持原名。
//
// 原压缩名对照（便于与历史代码比对）：
//   iu/pm→RigBuilder/instantiateRig  q_→solveLegIK  $v/ni→HOUND_SPEC  Kv/Gt→HOUND_TUNE
//   Z_→buildHoundRig  iM→createHound  A/_/M/E/w/S/z/H/O/q/U→各内部函数（见下方函数名）
//   sa/Ly→mergeGeometries/mergeAttributes  Wi/ot/Fn/su/Ur→createBeveledBox/createCylinder/createTube/createStrut/createEllipsoid
//   sM/nM→raySphere/rayCapsule  Mm/uo/xa→shortestAngleDelta/clamp/integrateSpring

import * as THREE from './vendor/three.module.js';

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
const Mesh = THREE.Mesh;
const PlaneGeometry = THREE.PlaneGeometry;
const BoxGeometry = THREE.BoxGeometry;
const Vector3 = THREE.Vector3;
const Group = THREE.Group;
const Matrix4 = THREE.Matrix4;
const CylinderGeometry = THREE.CylinderGeometry;
const Box3 = THREE.Box3;

// ===== 几何合并工具（内联自 three.js BufferGeometryUtils） =====
// 合并多个 BufferGeometry（要求属性一致）；useGroups 为每个源几何划分材质组
function mergeGeometries(geometries, useGroups = !1) {
    let t = geometries[0].index !== null,
      n = new Set(Object.keys(geometries[0].attributes)),
      s = new Set(Object.keys(geometries[0].morphAttributes)),
      o = {},
      r = {},
      a = geometries[0].morphTargetsRelative,
      l = new BufferGeometry(),
      c = 0;
    for (let u = 0; u < geometries.length; ++u) {
      let h = geometries[u],
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
      if (useGroups) {
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
      for (let f = 0; f < geometries.length; ++f) {
        let p = geometries[f].index;
        for (let d = 0; d < p.count; ++d) h.push(p.getX(d) + u);
        u += geometries[f].attributes.position.count;
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
        for (let v = 0; v < r[u].length; ++v) p.push(r[u][v][f]);
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
function mergeAttributes(attributes) {
    let e,
      t,
      n,
      s = -1,
      o = 0;
    for (let c = 0; c < attributes.length; ++c) {
      let u = attributes[c];
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
    for (let c = 0; c < attributes.length; ++c) {
      let u = attributes[c];
      if (u.isInterleavedBufferAttribute) {
        let h = l / t;
        for (let f = 0, p = u.count; f < p; f++)
          for (let d = 0; d < t; d++) {
            let v = u.getComponent(f, d);
            a.setComponent(f + h, d, v);
          }
      } else r.set(u.array, l);
      l += u.count * t;
    }
    return s !== void 0 && (a.gpuType = s), a;
  }
  var _cornerNormal = new Vector3();

// ===== 几何构造工具：圆角盒 / 圆柱 / 管线 / 变换 / 支撑杆 / 椭球 =====
// 圆角盒：细分盒体并把顶点向内收，形成倒角边缘（躯干装甲板）
function createBeveledBox(width, height, depth, radius = 0.02, anchor = "center") {
    radius = Math.min(radius, width / 2 - 1e-4, height / 2 - 1e-4, depth / 2 - 1e-4);
    let o = new BoxGeometry(width, height, depth, 3, 3, 3),
      r = o.attributes.position,
      a = o.attributes.normal,
      l = o.attributes.uv,
      c = width / 2,
      u = height / 2,
      h = depth / 2,
      f = (p, d) => {
        let v = Math.abs(p),
          g = Math.sign(p);
        return v > d - 1e-5 ? g * d : g * (d - radius);
      };
    for (let p = 0; p < r.count; p++) {
      let d = f(r.getX(p), c),
        v = f(r.getY(p), u),
        g = f(r.getZ(p), h),
        x = Math.max(-(c - radius), Math.min(c - radius, d)),
        y = Math.max(-(u - radius), Math.min(u - radius, v)),
        b = Math.max(-(h - radius), Math.min(h - radius, g));
      if ((_cornerNormal.set(d - x, v - y, g - b), _cornerNormal.lengthSq() > 1e-10)) {
        _cornerNormal.normalize();
        let M = a.getX(p),
          E = a.getY(p),
          w = a.getZ(p);
        (Math.abs(d) > c - 1e-5 ? 1 : 0) +
          (Math.abs(v) > u - 1e-5 ? 1 : 0) +
          (Math.abs(g) > h - 1e-5 ? 1 : 0) >=
        2
          ? ((d = x + _cornerNormal.x * radius),
            (v = y + _cornerNormal.y * radius),
            (g = b + _cornerNormal.z * radius),
            a.setXYZ(p, _cornerNormal.x, _cornerNormal.y, _cornerNormal.z))
          : a.setXYZ(p, M, E, w);
      }
      r.setXYZ(p, d, v, g);
      let m = Math.abs(a.getX(p)),
        A = Math.abs(a.getY(p)),
        _ = Math.abs(a.getZ(p));
      m >= A && m >= _
        ? l.setXY(p, g, v)
        : A >= m && A >= _
          ? l.setXY(p, d, g)
          : l.setXY(p, d, v);
    }
    return anchor === "bottom" && o.translate(0, height / 2, 0), o;
  }
// 圆柱体，并重算 UV 使侧面纹理按周长展开
function createCylinder(radiusTop, radiusBottom, height, radialSegments = 16, openEnded = !1, anchor = "center") {
    let r = new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1, openEnded),
      a = r.attributes.uv,
      l = r.attributes.position,
      c = r.attributes.normal,
      u = Math.PI * (radiusTop + radiusBottom);
    for (let h = 0; h < a.count; h++)
      Math.abs(c.getY(h)) > 0.9
        ? a.setXY(h, l.getX(h), l.getZ(h))
        : a.setXY(h, a.getX(h) * u, l.getY(h));
    return anchor === "bottom" && r.translate(0, height / 2, 0), r;
  }
// 沿控制点生成 CatmullRom 管状几何（线缆、液压管、包边）
function createTube(points, radius = 0.03, radialSegments = 8, closed = !1, tension = 0) {
    let o = points.map((h) => (h.isVector3 ? h : new Vector3(h[0], h[1], h[2]))),
      r = new CatmullRomCurve3(o, closed, "catmullrom", tension),
      a = r.getLength(),
      l = Math.max(2, Math.ceil(a / Math.max(0.08, radius * 3))),
      c = new TubeGeometry(r, Math.min(l, 400), radius, radialSegments, closed),
      u = c.attributes.uv;
    for (let h = 0; h < u.count; h++)
      u.setXY(h, u.getX(h) * a, u.getY(h) * Math.PI * 2 * radius);
    return c;
  }
  var _transformMatrix = new Matrix4(),
    _transformQuat = new Quaternion(),
    _transformEuler = new Euler(),
    _transformPos = new Vector3(),
    _transformScale = new Vector3();
// 对几何体应用平移 / 旋转 / 缩放矩阵
function transformGeometry(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
    return (
      _transformEuler.set(rotation[0], rotation[1], rotation[2]),
      _transformQuat.setFromEuler(_transformEuler),
      _transformPos.set(position[0], position[1], position[2]),
      typeof scale == "number" ? _transformScale.set(scale, scale, scale) : _transformScale.set(scale[0], scale[1], scale[2]),
      _transformMatrix.compose(_transformPos, _transformQuat, _transformScale),
      geometry.applyMatrix4(_transformMatrix),
      geometry
    );
  }

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
    bone(name, parentName, x = 0, y = 0, z = 0) {
      let r = parentName ? this.bones[this.index[parentName]] : null;
      if (parentName && !r) throw new Error("rig: unknown parent bone " + parentName);
      let a = {
        name: name,
        parent: r ? r.i : -1,
        local: [x, y, z],
        world: [
          x + (r ? r.world[0] : 0),
          y + (r ? r.world[1] : 0),
          z + (r ? r.world[2] : 0),
        ],
        i: this.bones.length,
      };
      return (this.index[name] = a.i), this.bones.push(a), a;
    }
    // 把一块几何挂到指定骨骼，写入顶点色与蒙皮索引/权重
    add(slot, boneName, geometry, color = [1, 1, 1], shadeByNormal = !0) {
      let r = this.bones[this.index[boneName]];
      if (!r) throw new Error("rig: unknown bone " + boneName);
      let a = geometry;
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
        let d = shadeByNormal ? 0.74 + 0.26 * (f.getY(p) * 0.5 + 0.5) : 1;
        (c[p * 3] = color[0] * d),
          (c[p * 3 + 1] = color[1] * d),
          (c[p * 3 + 2] = color[2] * d),
          (u[p * 4] = r.i),
          (h[p * 4] = 1);
      }
      return (
        a.setAttribute("color", new BufferAttribute(c, 3)),
        a.setAttribute("skinIndex", new BufferAttribute(u, 4)),
        a.setAttribute("skinWeight", new BufferAttribute(h, 4)),
        this.slots[slot] || ((this.slots[slot] = []), this.order.push(slot)),
        this.slots[slot].push(a),
        this
      );
    }
    // 烘焙：按槽位合并几何，输出 { geometry, slots, bones, tris }
    build(slotOrder) {
      let t = (slotOrder || this.order).filter(
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
  // 把烘焙数据实例化为 Group + SkinnedMesh + Bone 层级 + Skeleton
  function instantiateRig(
    rigDef,
    materials,
    {
      castShadow = !0,
      receiveShadow = !0,
      radius = 1.5,
      center = [0, 0.5, 0],
      extra = null,
    } = {},
  ) {
    let a = rigDef.bones.map((p) => {
      let d = new Bone();
      return (
        (d.name = p.name), d.position.set(p.local[0], p.local[1], p.local[2]), d
      );
    });
    rigDef.bones.forEach((p, d) => {
      p.parent >= 0 && a[p.parent].add(a[d]);
    });
    let l = new Group(),
      c = new SkinnedMesh(
        rigDef.geometry,
        rigDef.slots.map((p) => materials[p]),
      );
    (c.castShadow = castShadow),
      (c.receiveShadow = receiveShadow),
      l.add(c),
      rigDef.bones.forEach((p, d) => {
        p.parent < 0 && c.add(a[d]);
      }),
      l.updateMatrixWorld(!0);
    let u = new Skeleton(a);
    c.bind(u),
      (c.boundingSphere = new Sphere(new Vector3(center[0], center[1], center[2]), radius)),
      (c.boundingBox = new Box3(
        new Vector3(center[0] - radius, center[1] - radius, center[2] - radius),
        new Vector3(center[0] + radius, center[1] + radius, center[2] + radius),
      ));
    let h = {};
    a.forEach((p) => {
      h[p.name] = p;
    });
    let f = { group: l, mesh: c, bones: h, skeleton: u, extraMesh: null };
    if (extra) {
      let p = new SkinnedMesh(
        extra.def.geometry,
        extra.def.slots.map((d) => materials[d]),
      );
      (p.castShadow = !1),
        (p.receiveShadow = !1),
        (p.renderOrder = 5),
        l.add(p),
        p.updateMatrixWorld(!0),
        p.bind(u, c.bindMatrix),
        (p.boundingSphere = new Sphere(new Vector3(center[0], center[1], center[2]), extra.radius || radius)),
        (p.boundingBox = new Box3().setFromCenterAndSize(
          p.boundingSphere.center,
          new Vector3(1, 1, 1).multiplyScalar(2 * (extra.radius || radius)),
        )),
        (f.extraMesh = p);
    }
    return f;
  }

// ===== 三关节腿部 IK 求解 =====
// 三关节腿 IK：由髋部到落足点的相对坐标，解出外展 / 髋 / 膝三个关节角
function solveLegIK(result, localX, localZ, localY, side, hipOffset, upperLeg, lowerLeg) {
    let l = localX * localX + localZ * localZ,
      c = Math.sqrt(Math.max(l - hipOffset * hipOffset, 1e-6));
    (result.abd = Math.atan2(localZ, localX) - Math.atan2(-c, side * hipOffset)),
      result.abd > Math.PI
        ? (result.abd -= 2 * Math.PI)
        : result.abd < -Math.PI && (result.abd += 2 * Math.PI);
    let u = Math.hypot(c, localY),
      h = (upperLeg + lowerLeg) * 0.995,
      f = Math.abs(upperLeg - lowerLeg) + 0.03;
    (result.reach = u / (upperLeg + lowerLeg)), u > h ? (u = h) : u < f && (u = f);
    let p = Math.atan2(localY, c),
      d = (upperLeg * upperLeg + u * u - lowerLeg * lowerLeg) / (2 * upperLeg * u),
      v = (upperLeg * upperLeg + lowerLeg * lowerLeg - u * u) / (2 * upperLeg * lowerLeg),
      g = Math.acos(d < -1 ? -1 : d > 1 ? 1 : d),
      x = Math.acos(v < -1 ? -1 : v > 1 ? 1 : v);
    return (result.hip = g - p), (result.knee = -(Math.PI - x)), result;
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
    COLOR_EMISSIVE = [9, 9, 9.6],
    COLOR_WARM_GLOW = [5.5, 4, 1.6],
    HALF_PI = Math.PI / 2,
    roundedBox = (width, height, depth, radius = 0.008) => createBeveledBox(width, height, depth, radius),
    placeGeometry = (geometry, x, y, z, rx = 0, ry = 0, rz = 0, scale = 1) =>
      transformGeometry(geometry, { position: [x, y, z], rotation: [rx, ry, rz], scale }),
    cylinder = (topRadius, bottomRadius, height, segments = 12) => createCylinder(topRadius, bottomRadius, height, segments),
    cylinderAlongX = (topRadius, bottomRadius, height, segments = 12) => transformGeometry(createCylinder(topRadius, bottomRadius, height, segments), { rotation: [0, 0, -HALF_PI] }),
    cylinderAlongZ = (topRadius, bottomRadius, height, segments = 12) => transformGeometry(createCylinder(topRadius, bottomRadius, height, segments), { rotation: [HALF_PI, 0, 0] }),
    _strutStart = new Vector3(),
    _strutEnd = new Vector3(),
    _strutQuat = new Quaternion(),
    WORLD_UP = new Vector3(0, 1, 0),
    _strutMatrix = new Matrix4(),
    UNIT_SCALE = new Vector3(1, 1, 1);
// 两点之间的锥形支撑杆（腿部连杆、天线）
function createStrut(from, to, radiusBottom, radiusTop = radiusBottom, segments = 8) {
    _strutStart.set(from[0], from[1], from[2]), _strutEnd.set(to[0], to[1], to[2]);
    let o = _strutStart.distanceTo(_strutEnd),
      r = createCylinder(radiusTop, radiusBottom, o, segments);
    return (
      _strutQuat.setFromUnitVectors(WORLD_UP, _strutEnd.clone().sub(_strutStart).normalize()),
      _strutMatrix.compose(_strutStart.clone().add(_strutEnd).multiplyScalar(0.5), _strutQuat, UNIT_SCALE),
      r.applyMatrix4(_strutMatrix),
      r
    );
  }
  var createEllipsoid = (radius, widthSegments = 14, heightSegments = 10, sx = 1, sy = 1, sz = 1) => {
      let geometry = new SphereGeometry(radius, widthSegments, heightSegments);
      return geometry.scale(sx, sy, sz), geometry;
    },
    createRivetAlongX = (x, y, z) => placeGeometry(cylinderAlongX(0.0075, 0.0075, 0.006, 6), x, y, z),
    createRivet = (x, y, z) => placeGeometry(cylinder(0.0075, 0.0075, 0.006, 6), x, y, z),
    createRivetAlongZ = (x, y, z) => placeGeometry(cylinderAlongZ(0.0075, 0.0075, 0.006, 6), x, y, z),
    // 骨架规格：站立高度、大小腿长、髋/足前后位置、四条腿命名与朝向、枪口/眼睛偏移
    HOUND_SPEC = {
      stand: 0.72,
      L1: 0.4,
      L2: 0.42,
      l0: 0.075,
      hipX: 0.165,
      hipY: -0.01,
      hipZ: 0.4,
      footX: 0.275,
      footZ: [0.37, 0.37, -0.42, -0.42],
      legs: ["FL", "FR", "RL", "RR"],
      side: [1, -1, 1, -1],
      fore: [1, 1, -1, -1],
      muzzle: [0, 0, 0.43],
      eye: [0, 0, 0.14],
      footR: 0.046,
    };

// ===== 骨架规格与整机建模 =====
// 烘焙整机：躯干 + 头颈 + 炮塔机炮 + 天线信标 + 四肢与关节，输出 shell/metal/glow/lens 主网格
function buildHoundRig() {
    // 骨架：root→body→{neck→head, turret→gun, antenna, beacon}，每条腿 abd→thigh→shin
    let spec = HOUND_SPEC,
      e = new RigBuilder();
    e.bone("root", null, 0, 0, 0),
      e.bone("body", "root", 0, spec.stand, 0),
      e.bone("neck", "body", 0, 0.06, 0.49),
      e.bone("head", "neck", 0, 0.13, 0.12),
      e.bone("turret", "body", 0, 0.152, -0.03),
      e.bone("gun", "turret", 0, 0.095, 0.02),
      e.bone("antenna", "body", -0.105, 0.15, -0.46),
      e.bone("beacon", "body", 0.105, 0.2, -0.455);
    for (let n = 0; n < 4; n++) {
      let s = spec.legs[n],
        o = spec.side[n];
      e.bone("abd" + s, "body", o * spec.hipX, spec.hipY, spec.fore[n] * spec.hipZ),
        e.bone("thigh" + s, "abd" + s, o * spec.l0, 0, 0),
        e.bone("shin" + s, "thigh" + s, 0, -spec.L1, 0);
    }
    // 向烘焙器添加一块零件（材质槽位、挂接骨骼、几何、顶点色、是否按法线加阴影）
    let addPart = (slot, boneName, geometry, color, shade) => e.add(slot, boneName, geometry, color, shade);
    addPart("metal", "body", placeGeometry(roundedBox(0.27, 0.2, 0.98, 0.02), 0, -0.01, 0), COLOR_DARK_METAL),
      addPart("shell", "body", placeGeometry(roundedBox(0.35, 0.05, 0.3, 0.014), 0, 0.125, 0.33), COLOR_HULL_WHITE),
      addPart("shell", "body", placeGeometry(roundedBox(0.35, 0.05, 0.36, 0.014), 0, 0.125, -0.012), COLOR_HULL_WHITE),
      addPart(
        "shell",
        "body",
        placeGeometry(roundedBox(0.1, 0.052, 0.36, 0.01), 0, 0.126, -0.012 + 0),
        COLOR_HULL_LIGHT,
      );
    for (let n of [-0.15, 0.15])
      for (let s of [0.21, 0.45, -0.17, 0.145])
        addPart("metal", "body", createRivet(n, 0.152, s), COLOR_BRIGHT_METAL);
    addPart("metal", "body", placeGeometry(roundedBox(0.31, 0.03, 0.25, 0.006), 0, 0.112, -0.335), COLOR_WHITE);
    for (let n = 0; n < 10; n++)
      addPart(
        "metal",
        "body",
        placeGeometry(roundedBox(0.007, 0.062, 0.225, 0.002), -0.126 + n * 0.028, 0.155, -0.335),
        COLOR_BRIGHT_METAL,
      );
    addPart("metal", "body", placeGeometry(roundedBox(0.3, 0.012, 0.02, 0.003), 0, 0.186, -0.24), COLOR_DARK_METAL),
      addPart("metal", "body", placeGeometry(roundedBox(0.3, 0.012, 0.02, 0.003), 0, 0.186, -0.43), COLOR_DARK_METAL);
    for (let n of [1, -1]) {
      addPart(
        "shell",
        "body",
        placeGeometry(roundedBox(0.032, 0.15, 0.31, 0.012), n * 0.15, 0.022, -0.075),
        COLOR_HULL_WHITE,
      ),
        addPart(
          "shell",
          "body",
          placeGeometry(roundedBox(0.032, 0.15, 0.135, 0.012), n * 0.15, 0.022, 0.1625),
          COLOR_HULL_LIGHT,
        ),
        addPart(
          "metal",
          "body",
          createTube(
            [
              [n * 0.168, 0.06, 0.125],
              [n * 0.182, 0.06, 0.135],
              [n * 0.182, 0.06, 0.19],
              [n * 0.168, 0.06, 0.2],
            ],
            0.005,
            5,
          ),
          COLOR_BRIGHT_METAL,
        ),
        addPart(
          "shell",
          "body",
          placeGeometry(roundedBox(0.034, 0.016, 0.135, 0.004), n * 0.151, -0.035, 0.1625),
          COLOR_AMBER,
        ),
        addPart(
          "shell",
          "body",
          placeGeometry(roundedBox(0.034, 0.042, 0.46, 0.008), n * 0.151, -0.078, 0),
          COLOR_ORANGE,
        ),
        addPart(
          "shell",
          "body",
          placeGeometry(roundedBox(0.028, 0.1, 0.11, 0.008), n * 0.146, 0.01, 0.305),
          COLOR_DARK_TRIM,
        );
      for (let s = 0; s < 4; s++)
        addPart(
          "metal",
          "body",
          placeGeometry(
            roundedBox(0.004, 0.012, 0.085, 0.001),
            n * 0.161,
            -0.02 + s * 0.022,
            0.305,
          ),
          COLOR_DARK_METAL,
        );
      for (let s of [-0.035, 0.08])
        for (let o of [-0.21, 0.06, 0.115, 0.21])
          addPart("metal", "body", createRivetAlongX(n * 0.167, s, o), COLOR_BRIGHT_METAL);
      addPart(
        "metal",
        "body",
        createTube(
          [
            [n * 0.135, 0.148, -0.19],
            [n * 0.135, 0.205, -0.16],
            [n * 0.135, 0.212, 0],
            [n * 0.135, 0.205, 0.43],
            [n * 0.135, 0.148, 0.465],
          ],
          0.0105,
          6,
        ),
        COLOR_BRIGHT_METAL,
      );
      for (let s of [0, 0.26])
        addPart(
          "metal",
          "body",
          placeGeometry(cylinder(0.008, 0.008, 0.06, 6), n * 0.135, 0.178, s),
          COLOR_BRIGHT_METAL,
        );
      addPart(
        "shell",
        "body",
        createTube(
          [
            [n * 0.118, -0.105, -0.36],
            [n * 0.132, -0.118, -0.2],
            [n * 0.13, -0.112, 0.1],
            [n * 0.118, -0.1, 0.36],
          ],
          0.009,
          5,
        ),
        COLOR_RUBBER,
      ),
        addPart(
          "metal",
          "body",
          placeGeometry(new TorusGeometry(0.02, 0.005, 5, 10), n * 0.17, 0.085, -0.335, 0, HALF_PI, 0),
          COLOR_BRIGHT_METAL,
        );
    }
    addPart("shell", "body", placeGeometry(roundedBox(0.3, 0.15, 0.075, 0.018), 0, -0.005, 0.505), COLOR_ORANGE),
      addPart("shell", "body", placeGeometry(roundedBox(0.2, 0.07, 0.02, 0.006), 0, 0.012, 0.545), COLOR_DARK_TRIM);
    for (let n = 0; n < 6; n++)
      addPart(
        "shell",
        "body",
        placeGeometry(
          roundedBox(0.05, 0.034, 0.014, 0.003),
          -0.125 + n * 0.05,
          -0.098,
          0.538,
          0,
          0,
          0,
        ),
        n % 2 ? COLOR_DARK_TRIM : COLOR_AMBER,
      );
    for (let n of [-0.115, 0.115])
      addPart("metal", "body", placeGeometry(cylinderAlongZ(0.021, 0.021, 0.014, 10), n, 0.012, 0.547), COLOR_DARK_METAL),
        addPart(
          "glow",
          "body",
          placeGeometry(cylinderAlongZ(0.015, 0.015, 0.004, 10), n, 0.012, 0.556),
          [6.5, 4.6, 2.2],
          !1,
        );
    addPart("metal", "body", placeGeometry(roundedBox(0.24, 0.095, 0.56, 0.02), 0, -0.145, 0), COLOR_WHITE),
      addPart("shell", "body", placeGeometry(roundedBox(0.246, 0.03, 0.09, 0.006), 0, -0.14, 0.12), COLOR_ORANGE),
      addPart("shell", "body", placeGeometry(roundedBox(0.246, 0.03, 0.09, 0.006), 0, -0.14, -0.12), COLOR_ORANGE),
      addPart("shell", "body", placeGeometry(roundedBox(0.29, 0.15, 0.05, 0.014), 0, 0, -0.495), COLOR_HULL_WHITE),
      addPart("shell", "body", placeGeometry(roundedBox(0.17, 0.05, 0.012, 0.004), 0, 0.03, -0.523), COLOR_DARK_TRIM),
      addPart(
        "glow",
        "body",
        placeGeometry(roundedBox(0.13, 0.012, 0.004, 0.001), 0, 0.03, -0.531),
        [5, 0.3, 0.1],
        !1,
      ),
      addPart(
        "metal",
        "body",
        placeGeometry(cylinderAlongZ(0.022, 0.022, 0.02, 10), 0.085, -0.035, -0.525),
        COLOR_BRIGHT_METAL,
      ),
      addPart(
        "metal",
        "body",
        placeGeometry(new TorusGeometry(0.024, 0.006, 5, 10), -0.07, -0.05, -0.528, HALF_PI, 0, 0),
        COLOR_BRIGHT_METAL,
      );
    for (let n of [-0.125, 0.125])
      for (let s of [-0.055, 0.055]) addPart("metal", "body", createRivetAlongZ(n, s, -0.523), COLOR_BRIGHT_METAL);
    addPart(
      "shell",
      "body",
      createTube(
        [
          [0.09, 0.15, -0.2],
          [0.13, 0.2, -0.16],
          [0.12, 0.2, -0.08],
          [0.09, 0.165, -0.05],
        ],
        0.009,
        5,
      ),
      COLOR_RUBBER,
    ),
      addPart(
        "metal",
        "neck",
        createStrut([0, -0.02, -0.02], [0, 0.11, 0.1], 0.045, 0.036, 10),
        COLOR_DARK_METAL,
      );
    for (let n = 0; n < 3; n++) {
      let s = 0.2 + n * 0.28;
      addPart(
        "shell",
        "neck",
        createStrut(
          [0, -0.02 + 0.13 * s - 0.008, -0.02 + 0.12 * s - 0.0075],
          [0, -0.02 + 0.13 * s + 0.008, -0.02 + 0.12 * s + 0.0075],
          0.052,
          0.052,
          10,
        ),
        COLOR_RUBBER,
      );
    }
    addPart("shell", "neck", placeGeometry(roundedBox(0.13, 0.05, 0.1, 0.012), 0, -0.01, -0.03), COLOR_HULL_WHITE),
      addPart(
        "shell",
        "neck",
        createTube(
          [
            [0.05, -0.02, -0.04],
            [0.07, 0.05, 0.02],
            [0.06, 0.11, 0.07],
            [0.045, 0.12, 0.1],
          ],
          0.007,
          5,
        ),
        COLOR_RUBBER,
      ),
      addPart("shell", "head", placeGeometry(roundedBox(0.19, 0.118, 0.25, 0.03), 0, 0, 0), COLOR_HULL_WHITE),
      addPart(
        "shell",
        "head",
        placeGeometry(roundedBox(0.168, 0.074, 0.03, 0.012), 0, -0.004, 0.118),
        COLOR_DARK_TRIM,
      ),
      addPart(
        "lens",
        "head",
        placeGeometry(roundedBox(0.128, 0.024, 0.006, 0.002), 0, 0.006, 0.1345),
        [1, 1, 1],
        !1,
      );
    for (let n of [-0.056, 0.056])
      addPart("metal", "head", placeGeometry(cylinderAlongZ(0.015, 0.015, 0.012, 10), n, -0.022, 0.132), COLOR_DARK_METAL),
        addPart(
          "metal",
          "head",
          placeGeometry(cylinderAlongZ(0.009, 0.009, 0.004, 8), n, -0.022, 0.139),
          [0.1, 0.12, 0.2],
        );
    addPart("shell", "head", placeGeometry(roundedBox(0.062, 0.008, 0.2, 0.003), 0, 0.06, -0.005), COLOR_ORANGE),
      addPart("metal", "head", placeGeometry(cylinderAlongX(0.032, 0.032, 0.214, 12), 0, 0, -0.055), COLOR_DARK_METAL);
    for (let n of [1, -1])
      addPart(
        "shell",
        "head",
        placeGeometry(cylinderAlongX(0.022, 0.022, 0.006, 10), n * 0.108, 0, -0.055),
        COLOR_ORANGE,
      );
    addPart("metal", "head", placeGeometry(cylinder(0.036, 0.036, 0.026, 14), 0, 0.072, -0.05), COLOR_DARK_METAL),
      addPart(
        "metal",
        "head",
        placeGeometry(cylinder(0.037, 0.037, 0.006, 14), 0, 0.074, -0.05),
        [0.2, 0.3, 0.5],
      ),
      addPart("metal", "head", placeGeometry(roundedBox(0.12, 0.03, 0.13, 0.008), 0, -0.068, 0.02), COLOR_WHITE);
    for (let n of [-0.08, 0.08])
      for (let s of [-0.09, 0.07]) addPart("metal", "head", createRivet(n, 0.061, s), COLOR_BRIGHT_METAL);
    addPart("metal", "turret", placeGeometry(cylinder(0.105, 0.118, 0.034, 18), 0, 0, 0), COLOR_DARK_METAL),
      addPart("metal", "turret", placeGeometry(roundedBox(0.18, 0.02, 0.16, 0.005), 0, 0.026, 0), COLOR_WHITE);
    for (let n of [1, -1])
      addPart(
        "shell",
        "turret",
        placeGeometry(roundedBox(0.028, 0.115, 0.15, 0.012), n * 0.078, 0.085, 0.005),
        COLOR_HULL_WHITE,
      ),
        addPart(
          "metal",
          "turret",
          placeGeometry(cylinderAlongX(0.022, 0.022, 0.008, 10), n * 0.094, 0.095, 0.02),
          COLOR_BRIGHT_METAL,
        );
    addPart("shell", "gun", placeGeometry(roundedBox(0.108, 0.086, 0.21, 0.016), 0, 0, -0.012), COLOR_HULL_WHITE),
      addPart(
        "shell",
        "gun",
        placeGeometry(roundedBox(0.11, 0.02, 0.212, 0.006), 0, -0.022, -0.012),
        COLOR_ORANGE,
      ),
      addPart("metal", "gun", placeGeometry(cylinderAlongZ(0.035, 0.035, 0.11, 12), 0, 0, 0.145), COLOR_DARK_METAL);
    for (let n = 0; n < 4; n++)
      addPart(
        "metal",
        "gun",
        placeGeometry(cylinderAlongZ(0.039, 0.039, 0.008, 12), 0, 0, 0.105 + n * 0.026),
        COLOR_WHITE,
      );
    addPart("metal", "gun", placeGeometry(cylinderAlongZ(0.022, 0.024, 0.3, 12), 0, 0, 0.25), COLOR_WHITE),
      addPart("metal", "gun", placeGeometry(cylinderAlongZ(0.036, 0.036, 0.06, 10), 0, 0, 0.395), COLOR_DARK_METAL),
      addPart(
        "metal",
        "gun",
        placeGeometry(roundedBox(0.08, 0.012, 0.025, 0.003), 0, 0, 0.395),
        [0.15, 0.15, 0.15],
      ),
      addPart(
        "metal",
        "gun",
        placeGeometry(cylinderAlongX(0.056, 0.056, 0.06, 14), 0.084, -0.004, -0.045),
        COLOR_DARK_METAL,
      ),
      addPart(
        "metal",
        "gun",
        placeGeometry(cylinderAlongX(0.02, 0.02, 0.066, 8), 0.084, -0.004, -0.045),
        COLOR_WARM_GLOW,
      ),
      addPart("metal", "gun", placeGeometry(roundedBox(0.036, 0.036, 0.095, 0.008), -0.03, 0.06, 0), COLOR_DARK_METAL),
      addPart(
        "glow",
        "gun",
        placeGeometry(cylinderAlongZ(0.011, 0.011, 0.003, 8), -0.03, 0.06, 0.049),
        [1.6, 0.12, 0.05],
        !1,
      ),
      addPart(
        "shell",
        "gun",
        createTube(
          [
            [0.05, -0.03, -0.11],
            [0.06, -0.07, -0.13],
            [0.04, -0.09, -0.1],
          ],
          0.008,
          5,
        ),
        COLOR_RUBBER,
      ),
      addPart(
        "metal",
        "body",
        placeGeometry(cylinder(0.022, 0.026, 0.05, 10), 0.105, 0.175, -0.455),
        COLOR_DARK_METAL,
      ),
      addPart(
        "glow",
        "beacon",
        placeGeometry(createEllipsoid(0.02, 10, 6, 1, 1.25, 1), 0, 0.012, 0),
        [14, 5.5, 0.5],
        !1,
      ),
      addPart("metal", "antenna", placeGeometry(cylinder(0.011, 0.014, 0.05, 8), 0, 0.025, 0), COLOR_DARK_METAL),
      addPart("metal", "antenna", placeGeometry(cylinder(0.0028, 0.005, 0.62, 5), 0, 0.36, 0), COLOR_DARK_METAL),
      addPart("shell", "antenna", placeGeometry(createEllipsoid(0.009, 6, 4), 0, 0.67, 0), COLOR_ORANGE);
    for (let n = 0; n < 4; n++) {
      let s = spec.legs[n],
        o = spec.side[n],
        r = "abd" + s,
        a = "thigh" + s,
        l = "shin" + s;
      addPart("metal", r, placeGeometry(cylinderAlongZ(0.06, 0.06, 0.17, 14), -o * 0.02, 0, 0), COLOR_DARK_METAL),
        addPart("shell", r, placeGeometry(roundedBox(0.11, 0.05, 0.155, 0.014), o * 0, 0.058, 0), COLOR_HULL_WHITE),
        addPart("metal", r, placeGeometry(cylinderAlongZ(0.03, 0.03, 0.18, 8), -o * 0.02, 0, 0), COLOR_BRIGHT_METAL),
        addPart("shell", a, placeGeometry(cylinderAlongX(0.078, 0.078, 0.07, 18), 0, 0, 0), COLOR_HULL_WHITE),
        addPart("shell", a, placeGeometry(cylinderAlongX(0.081, 0.081, 0.016, 18), o * 0.012, 0, 0), COLOR_ORANGE),
        addPart("metal", a, placeGeometry(cylinderAlongX(0.048, 0.048, 0.082, 12), 0, 0, 0), COLOR_DARK_METAL);
      for (let c = 0; c < 5; c++) {
        let u = c * 1.2566;
        addPart(
          "metal",
          a,
          createRivetAlongX(o * 0.039, Math.cos(u) * 0.062, Math.sin(u) * 0.062),
          COLOR_BRIGHT_METAL,
        );
      }
      addPart(
        "shell",
        a,
        placeGeometry(roundedBox(0.062, spec.L1 - 0.07, 0.1, 0.022), 0, -spec.L1 * 0.5 - 0.005, 0.004),
        COLOR_HULL_WHITE,
      ),
        addPart(
          "metal",
          a,
          placeGeometry(roundedBox(0.044, spec.L1 - 0.04, 0.06, 0.012), 0, -spec.L1 * 0.5, -0.035),
          COLOR_DARK_METAL,
        ),
        addPart("shell", a, placeGeometry(roundedBox(0.065, 0.045, 0.103, 0.01), 0, -0.145, 0.004), COLOR_ORANGE),
        addPart("shell", a, placeGeometry(roundedBox(0.064, 0.012, 0.102, 0.004), 0, -0.26, 0.004), COLOR_DARK_TRIM),
        addPart(
          "metal",
          a,
          createStrut([0, -0.06, -0.082], [0, -spec.L1 * 0.62, -0.078], 0.021, 0.021, 10),
          COLOR_BRIGHT_METAL,
        ),
        addPart(
          "metal",
          a,
          createStrut(
            [0, -spec.L1 * 0.62, -0.078],
            [0, -spec.L1 + 0.025, -0.058],
            0.009,
            0.009,
            6,
          ),
          COLOR_EMISSIVE,
        ),
        addPart("metal", a, placeGeometry(roundedBox(0.05, 0.03, 0.035, 0.006), 0, -0.055, -0.07), COLOR_WHITE),
        addPart(
          "shell",
          a,
          createTube(
            [
              [o * 0.036, -0.02, 0.05],
              [o * 0.044, -0.13, 0.062],
              [o * 0.042, -0.28, 0.058],
              [o * 0.034, -spec.L1 + 0.03, 0.035],
            ],
            0.0065,
            5,
          ),
          COLOR_RUBBER,
        ),
        addPart("metal", a, placeGeometry(cylinderAlongX(0.05, 0.05, 0.086, 14), 0, -spec.L1, 0), COLOR_DARK_METAL),
        addPart("shell", a, placeGeometry(cylinderAlongX(0.036, 0.036, 0.092, 12), 0, -spec.L1, 0), COLOR_HULL_LIGHT),
        addPart(
          "metal",
          l,
          placeGeometry(cylinder(0.03, 0.021, spec.L2 - 0.08, 10), 0, -(spec.L2 - 0.08) / 2 - 0.01, 0),
          COLOR_DARK_METAL,
        ),
        addPart("shell", l, placeGeometry(roundedBox(0.052, 0.21, 0.04, 0.014), 0, -0.14, 0.02), COLOR_HULL_WHITE),
        addPart("shell", l, placeGeometry(roundedBox(0.054, 0.02, 0.042, 0.006), 0, -0.215, 0.02), COLOR_ORANGE),
        addPart("metal", l, placeGeometry(roundedBox(0.03, 0.06, 0.05, 0.008), 0, -0.02, -0.03), COLOR_WHITE),
        addPart("metal", l, placeGeometry(cylinder(0.024, 0.03, 0.03, 10), 0, -spec.L2 + 0.085, 0), COLOR_BRIGHT_METAL),
        addPart(
          "shell",
          l,
          placeGeometry(
            createEllipsoid(spec.footR + 0.002, 12, 8, 1, 0.86, 1.08),
            0,
            -spec.L2 + spec.footR * 0.86,
            0.004,
          ),
          COLOR_RUBBER,
        );
    }
    return e.build(["shell", "metal", "glow", "lens"]);
  }

// ===== 战斗调参、复用临时向量、对角步态表与平滑工具 =====
  // 战斗与运动调参：血量、点射、射程、跑动/潜行速度、转向、扑咬、路径重规划、残血冒烟
  var HOUND_TUNE = {
      hp: 140,
      shotDamage: 5,
      burst: 4,
      burstGap: 0.11,
      telegraph: 0.5,
      cooldown: [1.8, 3],
      runSpeed: 4.5,
      stalkSpeed: 2,
      patrolSpeed: 1.5,
      accel: 7,
      turnRate: 2.5,
      rangeMin: 8,
      rangeMax: 18,
      spreadFar: 0.12,
      spreadNear: 0.045,
      lungeRange: 3,
      lungeDamage: 15,
      lungeCooldown: 3.5,
      lungeSpeed: 9.5,
      replan: 0.6,
      smokeBelow: 0.4,
    },
    _tmpVecA = new Vector3(),
    _tmpVecB = new Vector3(),
    _aimDir = new Vector3(),
    _tmpMuzzle = new Vector3(),
    _tracerEnd = new Vector3(),
    _targetPoint = new Vector3(),
    UP_AXIS = new Vector3(0, 1, 0),
    legIK = { abd: 0, hip: 0, knee: 0, reach: 0 },
    LENS_COLOR_PATROL = [8, 4, 0.7],
    LENS_COLOR_ENGAGE = [14, 1, 0.35],
    // 求两角之间的最短夹角（结果落在 -π..π）
    shortestAngleDelta = (target, current) => {
      let delta = (target - current) % (Math.PI * 2);
      return (
        delta > Math.PI ? (delta -= Math.PI * 2) : delta < -Math.PI && (delta += Math.PI * 2), delta
      );
    },
    // 把数值限制在 [min, max]
    clamp = (value, min, max) => (value < min ? min : value > max ? max : value),
    // 对角步态：两组交替抬腿的腿编号（[0,3] 与 [1,2]）
    DIAGONAL_LEG_PAIRS = [
      [0, 3],
      [1, 2],
    ];
  // 弹簧-阻尼积分：让姿态量（俯仰/横滚/起伏等）平滑趋向目标
  function integrateSpring(spring, target, stiffness, damping, dt) {
    return (spring.v += ((target - spring.x) * stiffness - spring.v * damping) * dt), (spring.x += spring.v * dt), spring.x;
  }

// ===== 机器狗实例工厂：状态、步态、瞄准、开火、死亡与残骸 =====
// 创建一只机器狗实例（对象池成员），返回带 damage/_update 等方法的状态对象
function createHound(ai, rigDef, materials, index) {
    let ctx = ai.G,
      rng = ai.rng,
      lensMaterial = materials.lensBase.clone(),
      rig = instantiateRig(
        rigDef,
        { shell: materials.shell, metal: materials.metal, glow: materials.glow, lens: lensMaterial },
        { radius: 1.5, center: [0, 0.6, 0] },
      ),
      bones = rig.bones;
    rig.group.visible = !1;
    let abdBones = [],
      thighBones = [],
      shinBones = [];
    for (let T = 0; T < 4; T++)
      abdBones.push(bones["abd" + HOUND_SPEC.legs[T]]),
        thighBones.push(bones["thigh" + HOUND_SPEC.legs[T]]),
        shinBones.push(bones["shin" + HOUND_SPEC.legs[T]]);
    let f = ctx.mats.label("H-" + String(index + 3).padStart(2, "0"), {
        color: "black",
        font: "stencil",
        distress: 0.3,
      }),
      p = 0.2,
      d = Math.min(0.085, p / (f.aspect || 3)),
      v = new PlaneGeometry(p, d);
    v.rotateY(Math.PI / 2), v.translate(0.1675, 0.03, -0.085);
    let g = new PlaneGeometry(p, d);
    g.rotateY(-Math.PI / 2), g.translate(-0.1675, 0.03, -0.085);
    let x = ai.mergeSimple([v, g]),
      y = new Mesh(x, f.material);
    (y.castShadow = !1), (y.receiveShadow = !0), bones.body.add(y);
    let feet = [0, 1, 2, 3].map(() => ({
        p: new Vector3(),
        from: new Vector3(),
        to: new Vector3(),
        slide: new Vector3(),
      })),
      // 实例状态：基础 / 导航 / 感知交战 / 攻击状态机 / 步态 / 姿态弹簧 / 死亡残骸
      hound = {
        id: 0,
        type: "hound",
        pos: rig.group.position,
        alive: !1,
        hp: HOUND_TUNE.hp,
        active: !1,
        rig: rig,
        lens: lensMaterial,
        feet: feet,
        yaw: 0,
        speed: 0,
        yawRate: 0,
        home: new Vector3(),
        lastKnown: new Vector3(),
        goal: new Vector3(),
        firePos: new Vector3(),
        firePlayer: new Vector3(),
        sensor: new Vector3(),
        fwd: new Vector3(0, 0, 1),
        muzzle: new Vector3(),
        headPos: new Vector3(),
        push: new Vector3(),
        mode: "patrol",
        los: !1,
        seeT: 0,
        noSeeT: 0,
        senseT: 0,
        exposure: 0,
        modeT: 0,
        passive: !1,
        hasToken: !1,
        es: "move",
        esT: 0,
        cool: 1,
        shots: 0,
        bursts: 0,
        lungeCd: 0,
        path: null,
        wp: 0,
        planT: 0,
        hasGoal: !1,
        waitT: 0,
        moveT: 0,
        stuckT: 0,
        sw: -1,
        swT: 0,
        swDur: 0.2,
        lastPair: 1,
        idleT: 0,
        lift: 0.08,
        sY: { x: 0, v: 0 },
        sP: { x: 0, v: 0 },
        sR: { x: 0, v: 0 },
        sL: { x: 0, v: 0 },
        sA: { x: 0, v: 0 },
        sA2: { x: 0, v: 0 },
        crouch: 0,
        tyaw: 0,
        tpitch: 0,
        hyaw: 0,
        hpitch: 0,
        flare: 0,
        lensC: [LENS_COLOR_PATROL[0], LENS_COLOR_PATROL[1], LENS_COLOR_PATROL[2]],
        smokeT: 0,
        phase: 0,
        scan: 0,
        dieT: 0,
        vy: 0,
        dieRoll: 0,
        diePitch: 0,
        wreck: !1,
        sink: 0,
        loop: null,
        prevSpeed: 0,
        maxSpeed: HOUND_TUNE.patrolSpeed,
      // 受伤：扣血、发命中事件、按冲击方向晃动弹簧；血量归零进入死亡
      damage(amount, point, impulse, part) {
          if (!hound.alive) return !1;
          if (
            ((hound.hp -= amount),
            ctx.events.emit("enemy:hit", {
              enemy: hound,
              point: point,
              part: part || "body",
            }),
            impulse)
          ) {
            let j = Math.cos(hound.yaw),
              N = Math.sin(hound.yaw),
              Q = Math.min(1.6, amount / 28),
              K = impulse.x * N + impulse.z * j,
              ie = impulse.x * j - impulse.z * N;
            (hound.sL.v += ie * 1.4 * Q),
              (hound.sR.v += -ie * 3.2 * Q),
              (hound.sP.v += K * 2.4 * Q * (part === "weak" ? 1.6 : 1)),
              (hound.sY.v -= 0.5 * Q);
          }
          return ai.provoke(hound), hound.hp <= 0 ? (beginDeath(impulse), !0) : !1;
        },
      // 激活（对象池取出）：贴地放置、重置全部状态、初始化四足落点、开启伺服音效
      _activate(spawnPos, options = {}) {
          (hound.active = !0),
            (hound.alive = !0),
            (hound.wreck = !1),
            (hound.hp = HOUND_TUNE.hp),
            (hound.passive = !!options.passive),
            (hound.sink = 0),
            hound.pos.copy(spawnPos),
            (hound.pos.y = ctx.physics.groundHeight(spawnPos.x, spawnPos.z, spawnPos.y + 1)),
            hound.home.copy(hound.pos),
            (hound.yaw = options.yaw ?? rng() * 6.283),
            (hound.speed = 0),
            (hound.yawRate = 0),
            hound.push.set(0, 0, 0),
            (hound.mode = options.state === "alert" ? "investigate" : "patrol"),
            (hound.modeT = 10),
            (hound.modeSeen = hound.mode),
            hound.lastKnown.copy(options.target || (ctx.player ? ctx.player.pos : spawnPos)),
            (hound.los = !1),
            (hound.seeT = hound.noSeeT = 0),
            (hound.exposure = 0),
            (hound.senseT = rng() * 0.2),
            (hound.hasToken = !1),
            (hound.patrolR = options.patrolRadius ?? 7),
            (hound.patrolLine = options.patrolLine || null),
            (hound.patrolI = 0),
            (hound.es = "move"),
            (hound.cool = 0.6 + rng()),
            (hound.lungeCd = 0.3),
            (hound.path = null),
            (hound.hasGoal = !1),
            (hound.waitT = rng() * 1.5),
            (hound.planT = 0),
            (hound.sw = -1),
            (hound.idleT = 0),
            (hound.crouch = 0),
            (hound.feelT = 0),
            (hound.blocked = !1),
            (hound.flare = 0),
            (hound.phase = rng() * 6.283),
            (hound.dieT = 0),
            (hound.tyaw = hound.hyaw = 0),
            (hound.tpitch = hound.hpitch = 0);
          for (let C of [hound.sY, hound.sP, hound.sR, hound.sL, hound.sA, hound.sA2])
            (C.x = 0), (C.v = 0);
          for (let C = 0; C < 4; C++) placeFootHome(feet[C].p, C, hound.pos.x, hound.pos.z, hound.yaw);
          if (
            (bones.neck.rotation.set(0, 0, 0),
            bones.gun.rotation.set(0, 0, 0),
            (rig.group.visible = !0),
            updatePose(0.016),
            ctx.audio && ctx.audio.loop && !hound.loop)
          )
            try {
              hound.loop = ctx.audio.loop("hound_servo", { pos: hound.pos, gain: 0 });
            } catch {
              hound.loop = null;
            }
        },
      // 回收进对象池：隐藏模型、释放攻击令牌、停止伺服音效
      _deactivate() {
          if (
            ((hound.active = !1),
            (hound.alive = !1),
            (hound.wreck = !1),
            (rig.group.visible = !1),
            ai.releaseToken(hound),
            hound.loop)
          ) {
            try {
              hound.loop.stop();
            } catch {}
            hound.loop = null;
          }
        },
      // 子弹命中检测：头部按球体（弱点）、躯干按两段胶囊求交
      _raycast(origin, dir, maxDist, hit) {
          let j = !1;
          raySphere(origin, dir, hound.headPos, 0.155, maxDist, hit) &&
            ((hit.part = "weak"), (hit.enemy = hound), (j = !0));
          let N = Math.cos(hound.yaw),
            Q = Math.sin(hound.yaw),
            K = hound.pos.y + HOUND_SPEC.stand + hound.sY.x - hound.crouch;
          return (
            _tmpVecA.set(hound.pos.x - Q * 0.45, K + 0.03, hound.pos.z - N * 0.45),
            _tmpVecB.set(hound.pos.x + Q * 0.47, K + 0.03, hound.pos.z + N * 0.47),
            rayCapsule(origin, dir, _tmpVecA, _tmpVecB, 0.27, maxDist, hit) &&
              ((hit.part = "body"), (hit.enemy = hound), (j = !0)),
            (_tmpVecA.y = _tmpVecB.y = hound.pos.y + (K - hound.pos.y) * 0.45),
            rayCapsule(origin, dir, _tmpVecA, _tmpVecB, 0.25, maxDist, hit) &&
              ((hit.part = "body"), (hit.enemy = hound), (j = !0)),
            j
          );
        },
      // 联机远端机器狗的简化表现：只同步朝向与腿部摆动
      remoteHound(dt) {
          if (!hound.active) return;
          if (!hound.alive) {
            updateWreck(dt);
            return;
          }
          rig.group.visible = true;
          rig.group.rotation.y = hound.yaw;
          const speed = hound.remoteSpeed || 0;
          hound.remotePhase = (hound.remotePhase || 0) + dt * (1.5 + speed * 1.4);
          const swing =
            Math.sin(hound.remotePhase) * Math.min(0.45, 0.08 + speed * 0.1);
          for (let legIndex = 0; legIndex < 4; legIndex++) {
            const thigh = bones["thigh" + HOUND_SPEC.legs[legIndex]];
            const shin = bones["shin" + HOUND_SPEC.legs[legIndex]];
            if (thigh) thigh.rotation.x = swing * (legIndex % 2 ? 1 : -1);
            if (shin) shin.rotation.x = -swing * 0.6 * (legIndex % 2 ? 1 : -1);
          }
        },
      // 每帧入口：远端 → remoteHound，存活 → updateAlive，死亡 → updateWreck
      _update(dt) {
          if (hound.isRemote) return hound.remoteHound(dt);
          hound.alive ? updateAlive(dt) : updateWreck(dt);
        },
      };
    // 按机体中心与朝向，算出某条腿的默认落足点（步态基准）
    function placeFootHome(footPos, legIndex, centerX, centerZ, yaw) {
      let N = HOUND_SPEC.side[legIndex] * HOUND_SPEC.footX,
        Q = HOUND_SPEC.footZ[legIndex],
        K = Math.cos(yaw),
        ie = Math.sin(yaw);
      return footPos.set(centerX + N * K + Q * ie, 0, centerZ - N * ie + Q * K), footPos;
    }
    // 设置导航目标；非强制时若目标几乎没变则保留现有路径
    function setGoal(goalPoint, force) {
      (!force && hound.hasGoal && hound.goal.distanceToSquared(goalPoint) < 0.25) ||
        (hound.goal.copy(goalPoint), (hound.hasGoal = !0), (hound.planT = 0), (hound.stuckT = 0));
    }
    // 调用导航网格重新规划路径，并跳过起点附近的冗余路点
    function replanPath() {
      hound.planT = HOUND_TUNE.replan + rng() * 0.15;
      let T = null;
      try {
        T = ctx.physics.nav.findPath(hound.pos, hound.goal);
      } catch {
        T = null;
      }
      (hound.path = T && T.length ? T : null),
        (hound.wp = 0),
        hound.path &&
          hound.path.length > 1 &&
          hound.path[0].distanceToSquared(hound.pos) < 0.36 &&
          (hound.wp = 1);
    }
    // 沿路径行走：求期望偏航与限速，返回是否已抵达目标
    function followPath(dt, maxSpeed) {
      if (!hound.hasGoal) return (hound.maxSpeed = 0), !0;
      (hound.planT -= dt), hound.planT <= 0 && replanPath();
      let C = hound.goal;
      if (hound.path) {
        for (
          ;
          hound.wp < hound.path.length - 1 &&
          Math.hypot(hound.path[hound.wp].x - hound.pos.x, hound.path[hound.wp].z - hound.pos.z) < 0.55;

        )
          hound.wp++;
        C = hound.path[Math.min(hound.wp, hound.path.length - 1)];
      }
      let G = hound.goal.x - hound.pos.x,
        j = hound.goal.z - hound.pos.z,
        N = Math.hypot(G, j);
      if (N < 0.45) return (hound.hasGoal = !1), (hound.maxSpeed = 0), !0;
      let Q = C.x - hound.pos.x,
        K = C.z - hound.pos.z;
      hound.wantYaw = Math.atan2(Q, K);
      let ie = Math.abs(shortestAngleDelta(hound.wantYaw, hound.yaw));
      return (
        (hound.maxSpeed =
          ie > 1.1 ? 0 : Math.min(maxSpeed * (1 - ie * 0.5), 0.4 + N * 2.6)),
        !1
      );
    }
    // 挑选射击阵位：评估掩体点与随机点，避开同伴火线并保证对玩家有视线
    function pickFiringPosition() {
      let T = ctx.player;
      if (!T) return;
      let D = 1 / 0,
        C = T.eye || T.pos,
        G = (Q, K) => {
          let ie = Math.hypot(Q.x - T.pos.x, Q.z - T.pos.z);
          if (
            ie < HOUND_TUNE.rangeMin ||
            ie > HOUND_TUNE.rangeMax ||
            (ctx.physics.nav.isWalkable && !ctx.physics.nav.isWalkable(Q.x, Q.z))
          )
            return;
          let F = Math.hypot(Q.x - hound.pos.x, Q.z - hound.pos.z) * 0.9 + K + rng() * 3,
            X = Q.x - T.pos.x,
            ne = Q.z - T.pos.z;
          for (let re of ai.list) {
            if (
              re === hound ||
              !re.alive ||
              re.type !== "hound" ||
              re.mode !== "engage"
            )
              continue;
            let $ = re.es === "move" ? re.firePos : re.pos,
              ue = $.x - T.pos.x,
              me = $.z - T.pos.z,
              ee =
                (X * ue + ne * me) /
                (Math.hypot(X, ne) * Math.hypot(ue, me) + 1e-4);
            ee > 0.86 && (F += (14 * (ee - 0.86)) / 0.14),
              Math.hypot(Q.x - $.x, Q.z - $.z) < 3 && (F += 16);
          }
          F >= D ||
            (_targetPoint.set(Q.x, Q.y + 0.95, Q.z),
            ctx.physics.lineOfSight(_targetPoint, C) || (F += 22),
            F < D && ((D = F), hound.firePos.set(Q.x, Q.y, Q.z)));
        },
        j = ctx.level && ctx.level.coverPoints;
      if (j) for (let Q = 0; Q < j.length; Q++) G(j[Q], -2);
      for (let Q = 0; Q < 7; Q++) {
        let K = ctx.physics.nav.randomPoint(T.pos, HOUND_TUNE.rangeMax);
        K && G(K, 0);
      }
      let N = Math.atan2(hound.pos.z - T.pos.z, hound.pos.x - T.pos.x);
      for (let Q = 0; Q < 5; Q++) {
        let K = N + (rng() - 0.5) * 2.6,
          ie = HOUND_TUNE.rangeMin + 1 + rng() * (HOUND_TUNE.rangeMax - HOUND_TUNE.rangeMin - 2);
        _tmpMuzzle.set(T.pos.x + Math.cos(K) * ie, T.pos.y, T.pos.z + Math.sin(K) * ie),
          (_tmpMuzzle.y = ctx.physics.groundHeight(_tmpMuzzle.x, _tmpMuzzle.z, T.pos.y + 1)),
          G(_tmpMuzzle, 1);
      }
      D === 1 / 0 && hound.firePos.copy(hound.pos),
        hound.firePlayer.copy(T.pos),
        setGoal(hound.firePos, !0),
        (hound.es = "move"),
        (hound.esT = 0),
        (hound.moveT = 0),
        (hound.bursts = 0);
    }
    // 存活逐帧：模式切换、攻击状态机、转向/加减速、避障、炮塔瞄准、步态与 IK
    function updateAlive(dt) {
      let D = ctx.player,
        C = ai.t;
      hound.fwd.set(Math.sin(hound.yaw), 0, Math.cos(hound.yaw)),
        hound.sensor.copy(hound.headPos),
        ai.think(hound, dt, 0.55),
        hound.mode !== hound.modeSeen &&
          ((hound.modeSeen = hound.mode),
          (hound.hasGoal = !1),
          (hound.path = null),
          (hound.waitT = 0),
          hound.mode === "engage"
            ? pickFiringPosition()
            : (hound.es === "tele" || hound.es === "burst") &&
              (ai.releaseToken(hound), (hound.es = "move"))),
        (hound.wantYaw = hound.yaw),
        (hound.maxSpeed = 0),
        (hound.cool -= dt),
        (hound.lungeCd -= dt);
      let G = null,
        j = null,
        N = 0,
        Q = !1,
        K = D ? Math.hypot(D.pos.x - hound.pos.x, D.pos.z - hound.pos.z) : 1e9;
      // 巡逻：在出生点附近随机游走，到达后停留片刻
      if (hound.mode === "patrol") {
        if (hound.hasGoal) followPath(dt, HOUND_TUNE.patrolSpeed) && (hound.waitT = 1.5 + rng() * 3);
        else if (((hound.waitT -= dt), hound.waitT <= 0))
          if (hound.patrolLine)
            (hound.patrolI = (hound.patrolI + 1) % hound.patrolLine.length),
              setGoal(hound.patrolLine[hound.patrolI], !0);
          else {
            let I = ctx.physics.nav.randomPoint(hound.home, hound.patrolR);
            I ? setGoal(I, !0) : (hound.waitT = 1);
          }
      } else if (hound.mode === "investigate" || hound.mode === "search") {
        j = hound.lastKnown;
        let I = Math.hypot(hound.lastKnown.x - hound.pos.x, hound.lastKnown.z - hound.pos.z);
        I > 2.2
          ? (setGoal(hound.lastKnown), followPath(dt, I < 8 ? HOUND_TUNE.stalkSpeed : HOUND_TUNE.runSpeed))
          : ((hound.hasGoal = !1),
            (hound.scan += dt),
            (hound.wantYaw = hound.yaw + Math.sin(hound.scan * 0.8) * 0.9),
            (j = null));
      } else if (D) {
        (G = D.pos), (j = D.pos);
        let I = Math.atan2(D.pos.x - hound.pos.x, D.pos.z - hound.pos.z);
        // 交战状态机：move→aim→tele→burst；近身时 wind→lunge→recover 扑咬
        switch (
          ((hound.es === "move" || hound.es === "aim" || hound.es === "cool") &&
            K < HOUND_TUNE.lungeRange &&
            hound.lungeCd <= 0 &&
            D.alive &&
            ((hound.es = "wind"),
            (hound.esT = 0.28),
            ai.releaseToken(hound),
            ctx.events.emit("enemy:telegraph", {
              enemy: hound,
              type: "hound",
              time: 0.28,
              pos: hound.pos,
              melee: !0,
            })),
          hound.es)
        ) {
          case "move": {
            hound.moveT += dt;
            let se = followPath(dt, HOUND_TUNE.runSpeed),
              ae = K > HOUND_TUNE.rangeMin - 1 && K < HOUND_TUNE.rangeMax + 2;
            se || (hound.moveT > 1.4 && hound.los && ae && rng() < dt * 0.7) || hound.moveT > 7
              ? ((hound.es = "aim"), (hound.esT = 0), (hound.hasGoal = !1))
              : D.pos.distanceToSquared(hound.firePlayer) > 49 && pickFiringPosition();
            break;
          }
          case "aim":
          case "cool": {
            (hound.wantYaw = I),
              (hound.esT += dt),
              hound.los
                ? K < HOUND_TUNE.rangeMin - 3 && hound.esT > 0.8
                  ? pickFiringPosition()
                  : hound.cool <= 0 &&
                    D.alive &&
                    Math.abs(shortestAngleDelta(I - hound.yaw, hound.tyaw)) < 0.14 &&
                    ai.requestToken(hound) &&
                    ((hound.es = "tele"),
                    (hound.esT = HOUND_TUNE.telegraph),
                    ctx.events.emit("enemy:telegraph", {
                      enemy: hound,
                      type: "hound",
                      time: HOUND_TUNE.telegraph,
                      pos: hound.pos,
                    }))
                : (hound.noSeeT > 1.1 || hound.esT > 3) && pickFiringPosition();
            break;
          }
          case "tele": {
            (hound.wantYaw = I),
              (hound.esT -= dt),
              (hound.flare = Math.min(1, hound.flare + dt * 5)),
              (N = 0.05),
              hound.esT <= 0 &&
                ((hound.es = "burst"), (hound.shots = HOUND_TUNE.burst), (hound.esT = 0));
            break;
          }
          case "burst": {
            (hound.wantYaw = I),
              (hound.esT -= dt),
              (hound.flare = 1),
              (N = 0.05),
              hound.esT <= 0 && ((hound.esT = HOUND_TUNE.burstGap), hound.shots--, fireShot(D)),
              hound.shots <= 0 &&
                (ai.releaseToken(hound),
                (hound.cool =
                  HOUND_TUNE.cooldown[0] + rng() * (HOUND_TUNE.cooldown[1] - HOUND_TUNE.cooldown[0])),
                hound.bursts++,
                hound.bursts >= 1 + (rng() < 0.4 ? 1 : 0)
                  ? pickFiringPosition()
                  : ((hound.es = "cool"), (hound.esT = 0)));
            break;
          }
          case "wind": {
            (hound.wantYaw = I),
              (hound.esT -= dt),
              (N = 0.16),
              (hound.sP.v += 3 * dt),
              hound.esT <= 0 &&
                ((hound.es = "lunge"),
                (hound.esT = 0.36),
                (hound.speed = HOUND_TUNE.lungeSpeed),
                (hound.yaw = I));
            break;
          }
          case "lunge": {
            (Q = !0),
              (hound.esT -= dt),
              (hound.wantYaw = I),
              (hound.maxSpeed = HOUND_TUNE.lungeSpeed),
              (hound.speed = HOUND_TUNE.lungeSpeed),
              K < 1.35 &&
                D.alive &&
                (D.damage(HOUND_TUNE.lungeDamage, hound.pos),
                ctx.events.emit("enemy:melee", { enemy: hound, pos: hound.pos }),
                (hound.esT = 0),
                (hound.sP.v -= 4)),
              hound.esT <= 0 &&
                ((hound.es = "recover"),
                (hound.esT = 0.55),
                (hound.lungeCd = HOUND_TUNE.lungeCooldown),
                (hound.speed *= 0.3));
            break;
          }
          case "recover": {
            (hound.esT -= dt), (hound.wantYaw = I), hound.esT <= 0 && pickFiringPosition();
            break;
          }
        }
      }
      let ie = shortestAngleDelta(hound.wantYaw, hound.yaw),
        F = clamp(ie * 6, -HOUND_TUNE.turnRate, HOUND_TUNE.turnRate) * (Q ? 2 : 1);
      (hound.yawRate += (F - hound.yawRate) * (1 - Math.exp(-10 * dt))),
        (hound.yaw += hound.yawRate * dt);
      let X = hound.maxSpeed > hound.speed ? HOUND_TUNE.accel : -HOUND_TUNE.accel * 1.4;
      (hound.prevSpeed = hound.speed),
        (hound.speed = Q
          ? hound.speed
          : clamp(hound.speed + X * dt, 0, Math.max(hound.maxSpeed, 0))),
        !Q && X < 0 && hound.speed < hound.maxSpeed && (hound.speed = hound.maxSpeed);
      let ne = Math.sin(hound.yaw),
        re = Math.cos(hound.yaw);
      // 与同伴、玩家做软性分离，避免挤在一起
      for (let I of ai.list) {
        if (I === hound || I.type !== "hound" || !I.active) continue;
        let se = hound.pos.x - I.pos.x,
          ae = hound.pos.z - I.pos.z,
          k = Math.hypot(se, ae);
        if (k < 1.7 && k > 0.001) {
          let ce = ((1.7 - k) * 2.2) / k;
          (hound.push.x += se * ce * dt * 6), (hound.push.z += ae * ce * dt * 6);
        }
      }
      if (D && !Q && K < 1.25 && K > 0.001) {
        let I = ((1.25 - K) * 3) / K;
        (hound.push.x += (hound.pos.x - D.pos.x) * I * dt * 6),
          (hound.push.z += (hound.pos.z - D.pos.z) * I * dt * 6);
      }
      hound.push.multiplyScalar(Math.exp(-5 * dt));
      let $ = hound.pos.x + (ne * hound.speed + hound.push.x) * dt,
        ue = hound.pos.z + (re * hound.speed + hound.push.z) * dt,
        me = ctx.physics.nav;
      if (((hound.feelT -= dt), hound.feelT <= 0 && hound.speed > 0.3)) {
        (hound.feelT = 0.12),
          _tmpMuzzle.set(hound.pos.x, hound.pos.y + 0.55, hound.pos.z),
          _aimDir.set(ne, 0, re);
        let I = ctx.physics.raycast(_tmpMuzzle, _aimDir, 0.75 + hound.speed * 0.12);
        hound.blocked = !!I;
      } else hound.speed <= 0.3 && (hound.blocked = !1);
      ((me.isWalkable && !me.isWalkable($, ue)) ||
        (hound.blocked && !Q) ||
        (hound.blocked && Q && hound.esT < 0.3)) &&
        (console.log('ENTER blocked=', hound.blocked, 'gateish=', ((me.isWalkable && !me.isWalkable($, ue)) || (hound.blocked && !Q) || (hound.blocked && Q && hound.esT < 0.3))),
        hound.blocked
          ? (($ = hound.pos.x + hound.push.x * dt),
            (ue = hound.pos.z + hound.push.z * dt),
            (hound.yawRate += (hound.phase > 3.14 ? 1 : -1) * 4 * dt))
          : me.isWalkable($, hound.pos.z)
            ? (ue = hound.pos.z)
            : me.isWalkable(hound.pos.x, ue)
              ? ($ = hound.pos.x)
              : (($ = hound.pos.x), (ue = hound.pos.z)),
        (hound.speed *= 0.6),
        (hound.stuckT += dt),
        hound.stuckT > 0.5 &&
          ((hound.stuckT = 0),
          (hound.planT = 0),
          hound.mode === "engage" && hound.es === "move"
            ? pickFiringPosition()
            : hound.mode === "patrol" && (hound.hasGoal = !1))),
        (hound.pos.x = $),
        (hound.pos.z = ue),
        (hound.pos.y +=
          (ctx.physics.groundHeight($, ue, hound.pos.y + 0.6) - hound.pos.y) *
          (1 - Math.exp(-12 * dt))),
        updateGait(dt),
        (hound.crouch += (N - hound.crouch) * (1 - Math.exp(-12 * dt)));
      let ee = Math.cos(hound.yaw),
        B = Math.sin(hound.yaw),
        P = 0,
        V = 0,
        Y = 0,
        L = 0.05,
        Z = hound.pos.y + HOUND_SPEC.stand + hound.sY.x - hound.crouch;
      // 炮塔瞄准玩家 / 最后已知位置，头部另做扫视
      if (G) {
        let I = G.x - hound.pos.x,
          se = G.z - hound.pos.z,
          ae = G.y + 1 - (Z + 0.25);
        (P = Math.atan2(I * ee - se * B, I * B + se * ee)),
          (V = clamp(Math.atan2(-ae, Math.hypot(I, se)), -0.9, 0.35));
      } else (hound.scan += dt * 0.5), (P = Math.sin(hound.scan * 0.9 + hound.phase) * 1.1);
      if (j) {
        let I = j.x - hound.pos.x,
          se = j.z - hound.pos.z,
          ae = j.y + 1.2 - (Z + 0.2);
        (Y = clamp(Math.atan2(I * ee - se * B, I * B + se * ee), -1.2, 1.2)),
          (L = clamp(Math.atan2(-ae, Math.hypot(I, se)), -0.6, 0.5));
      } else
        Y =
          Math.sin(ai.t * 0.7 + hound.phase) * 0.5 + clamp(hound.yawRate * 0.25, -0.6, 0.6);
      let J = clamp(4.5 * dt, 0, 1);
      (hound.tyaw += clamp(shortestAngleDelta(P, hound.tyaw), -J, J)),
        (hound.tpitch += (V - hound.tpitch) * (1 - Math.exp(-10 * dt)));
      let oe = 1 - Math.exp(-7 * dt);
      (hound.hyaw += (Y - hound.hyaw) * oe), (hound.hpitch += (L - hound.hpitch) * oe), updatePose(dt);
      let fe = (ai.t * (hound.mode === "patrol" ? 0.8 : 2.2) + hound.phase) % 1;
      bones.beacon.scale.setScalar(fe < 0.12 || (fe > 0.22 && fe < 0.3) ? 1 : 1e-4);
      // 镜头颜色在巡逻暖白与交战红之间渐变；残血时冒烟
      let le = hound.mode === "engage" ? LENS_COLOR_ENGAGE : LENS_COLOR_PATROL,
        R = 1 + hound.flare * 3.5;
      for (let I = 0; I < 3; I++)
        hound.lensC[I] += (le[I] - hound.lensC[I]) * (1 - Math.exp(-8 * dt));
      lensMaterial.color.setRGB(hound.lensC[0] * R, hound.lensC[1] * R, hound.lensC[2] * R),
        (hound.flare = Math.max(0, hound.flare - dt * 2)),
        hound.hp < HOUND_TUNE.hp * HOUND_TUNE.smokeBelow &&
          ((hound.smokeT -= dt),
          hound.smokeT <= 0 &&
            ((hound.smokeT = 0.2),
            _tmpVecA.set(hound.pos.x - ne * 0.3, Z + 0.2, hound.pos.z - re * 0.3),
            ctx.fx.smoke(_tmpVecA, {
              size: 0.35,
              life: 1.3,
              color: 2303272,
              rise: 0.9,
            }),
            rng() < 0.2 && ctx.fx.sparks(_tmpVecA, UP_AXIS, 3))),
        hound.loop &&
          (hound.loop.setPos(hound.pos),
          hound.loop.setGain(
            clamp(0.12 + hound.speed * 0.12 + Math.abs(hound.yawRate) * 0.1, 0, 0.8),
          ),
          hound.loop.setPitch(0.8 + hound.speed * 0.08));
    }
    // 开一枪：由炮口世界坐标做射线，计算弹道散布、曳光、枪口焰与后坐
    function fireShot(player) {
      let D = Math.cos(hound.yaw + hound.tyaw),
        C = Math.sin(hound.yaw + hound.tyaw);
      _tmpMuzzle.setFromMatrixPosition(bones.gun.matrixWorld),
        (_tmpMuzzle.lengthSq() < 1e-6 || Math.abs(_tmpMuzzle.x - hound.pos.x) > 2) &&
          _tmpMuzzle.set(hound.pos.x, hound.pos.y + HOUND_SPEC.stand + 0.25, hound.pos.z),
        _targetPoint.set(player.pos.x, player.pos.y + 1, player.pos.z),
        _aimDir.copy(_targetPoint).sub(_tmpMuzzle).normalize(),
        hound.muzzle.copy(_tmpMuzzle).addScaledVector(_aimDir, 0.43);
      let G =
        (HOUND_TUNE.spreadFar + (HOUND_TUNE.spreadNear - HOUND_TUNE.spreadFar) * hound.exposure) *
        (1 + ai.playerSpeed * 0.3);
      (_aimDir.x += (rng() - 0.5) * 2 * G),
        (_aimDir.y += (rng() - 0.5) * 2 * G),
        (_aimDir.z += (rng() - 0.5) * 2 * G),
        _aimDir.normalize();
      let j = ctx.physics.raycast(hound.muzzle, _aimDir, 200),
        Q = ctx.combat.enemyShot(hound.muzzle, _aimDir, {
          damage: HOUND_TUNE.shotDamage,
          range: 200,
        })
          ? hound.muzzle.distanceTo(_targetPoint)
          : j
            ? j.dist
            : 90;
      _tracerEnd.copy(hound.muzzle).addScaledVector(_aimDir, Q),
        ctx.fx.tracer(hound.muzzle, _tracerEnd, {
          color: 16760944,
          speed: 260,
          width: 0.035,
        }),
        ctx.fx.muzzleFlash(hound.muzzle, _aimDir, { scale: 0.9 }),
        ctx.render &&
          ctx.render.lightPool &&
          ctx.render.lightPool.flash(hound.muzzle, 16756832, 22, 7, 0.05),
        ctx.events.emit("enemy:fire", {
          enemy: hound,
          pos: hound.muzzle,
          dir: _aimDir,
          type: "hound",
        }),
        (hound.sP.v += 1.1),
        (hound.sY.v -= 0.25);
    }
    // 步态：按对角腿组交替摆腿，落足时发出脚步事件并扰动机身弹簧
    function updateGait(dt) {
      let D = Math.sin(hound.yaw) * hound.speed + hound.push.x,
        C = Math.cos(hound.yaw) * hound.speed + hound.push.z,
        G = hound.speed > 0.15 || Math.abs(hound.yawRate) > 0.25;
      if (hound.sw < 0) {
        hound.idleT = G ? 0 : hound.idleT + dt;
        let j = hound.speed + Math.abs(hound.yawRate) * 0.5,
          N = clamp(0.27 - j * 0.026, 0.14, 0.27),
          Q = -1,
          K = 0;
        for (let F = 0; F < 2; F++) {
          let X = 0;
          for (let ne of DIAGONAL_LEG_PAIRS[F]) {
            placeFootHome(_tmpVecA, ne, hound.pos.x + D * N, hound.pos.z + C * N, hound.yaw + hound.yawRate * N);
            let re = Math.hypot(_tmpVecA.x - feet[ne].p.x, _tmpVecA.z - feet[ne].p.z);
            re > X && (X = re);
          }
          F !== hound.lastPair && (X *= 1.25), X > K && ((K = X), (Q = F));
        }
        let ie = G ? 0.09 : hound.idleT > 0.25 ? 0.035 : 1e9;
        if (Q >= 0 && K > ie) {
          (hound.sw = Q),
            (hound.swT = 0),
            (hound.swDur = N),
            (hound.lift = 0.065 + Math.min(0.09, j * 0.02));
          for (let F of DIAGONAL_LEG_PAIRS[Q]) {
            let X = feet[F];
            X.from.copy(X.p),
              placeFootHome(
                X.to,
                F,
                hound.pos.x + D * N * 1.5,
                hound.pos.z + C * N * 1.5,
                hound.yaw + hound.yawRate * N * 1.5,
              ),
              (X.to.y = ctx.physics.groundHeight(X.to.x, X.to.z, hound.pos.y + 0.6));
          }
        }
      } else {
        hound.swT += dt / hound.swDur;
        let j = hound.swT >= 1 ? 1 : hound.swT,
          N = j * j * (3 - 2 * j);
        for (let Q of DIAGONAL_LEG_PAIRS[hound.sw]) {
          let K = feet[Q];
          K.p.lerpVectors(K.from, K.to, N),
            (K.p.y += Math.sin(Math.PI * j) * hound.lift);
        }
        if (hound.swT >= 1) {
          let Q = feet[DIAGONAL_LEG_PAIRS[hound.sw][0]];
          ctx.events.emit("enemy:step", {
            pos: Q.p,
            type: "hound",
            enemy: hound,
            speed: hound.speed,
          }),
            (hound.sY.v -= 0.12 + hound.speed * 0.03),
            (hound.lastPair = hound.sw),
            (hound.sw = -1);
        }
      }
    }
    // 姿态求解：四足落点反解机身俯仰/横滚，弹簧平滑后写入骨骼并用 IK 驱动四条腿
    function updatePose(dt) {
      let D = Math.cos(hound.yaw),
        C = Math.sin(hound.yaw),
        G = (feet[0].p.y + feet[1].p.y) * 0.5,
        j = (feet[2].p.y + feet[3].p.y) * 0.5,
        N = (feet[0].p.y + feet[2].p.y) * 0.5,
        Q = (feet[1].p.y + feet[3].p.y) * 0.5,
        K = (G + j) * 0.5 - hound.pos.y,
        ie = dt > 0 ? (hound.speed - hound.prevSpeed) / dt : 0,
        F = Math.atan2(j - G, 0.8) * 0.6 + clamp(ie * 0.006, -0.07, 0.07),
        X =
          Math.atan2(N - Q, 0.55) * 0.6 +
          clamp(hound.yawRate * hound.speed * 0.02, -0.12, 0.12),
        ne = K * 0.45 - Math.min(0.05, hound.speed * 0.011);
      hound.alive || ((F = hound.diePitch), (X = hound.dieRoll), (ne = 0)),
        hound.alive &&
          (integrateSpring(hound.sY, ne, 160, 17, dt),
          integrateSpring(hound.sP, F, 130, 15, dt),
          integrateSpring(hound.sR, X, 130, 15, dt),
          integrateSpring(hound.sL, 0, 110, 13, dt));
      let re = hound.alive ? Math.sin(ai.t * 1.7 + hound.phase) * 0.004 : 0,
        $ = hound.sL.x,
        ue = HOUND_SPEC.stand + hound.sY.x - hound.crouch + re,
        me = hound.sP.x,
        ee = hound.sR.x;
      (rig.group.rotation.y = hound.yaw),
        bones.body.position.set($, ue, 0),
        bones.body.rotation.set(me, 0, ee),
        (bones.turret.rotation.y = hound.tyaw),
        (bones.gun.rotation.x = hound.tpitch - me * 0.5),
        bones.head.rotation.set(hound.hpitch, hound.hyaw, 0),
        integrateSpring(hound.sA, clamp(-ie * 0.03 - me, -0.6, 0.6), 60, 5, dt),
        integrateSpring(hound.sA2, clamp(hound.yawRate * 0.12 - ee, -0.6, 0.6), 60, 5, dt),
        bones.antenna.rotation.set(hound.sA.x, 0, hound.sA2.x);
      let B = Math.cos(me),
        P = Math.sin(me),
        V = Math.cos(ee),
        Y = Math.sin(ee);
      for (let L = 0; L < 4; L++) {
        let Z = feet[L].p,
          J = Z.x - hound.pos.x,
          oe = Z.y + HOUND_SPEC.footR * 0.6 - hound.pos.y,
          fe = Z.z - hound.pos.z,
          le = J * D - fe * C - $,
          R = oe - ue,
          I = J * C + fe * D,
          se = R * B + I * P,
          ae = -R * P + I * B,
          k = le * V + se * Y,
          ce = -le * Y + se * V;
        solveLegIK(
          legIK,
          k - HOUND_SPEC.side[L] * HOUND_SPEC.hipX,
          ce - HOUND_SPEC.hipY,
          ae - HOUND_SPEC.fore[L] * HOUND_SPEC.hipZ,
          HOUND_SPEC.side[L],
          HOUND_SPEC.l0,
          HOUND_SPEC.L1,
          HOUND_SPEC.L2 - HOUND_SPEC.footR * 0.6,
        ),
          (abdBones[L].rotation.z = legIK.abd),
          (thighBones[L].rotation.x = legIK.hip),
          (shinBones[L].rotation.x = legIK.knee);
      }
      rig.group.updateMatrixWorld(!0),
        hound.headPos.setFromMatrixPosition(bones.head.matrixWorld);
    }
    // 判定死亡：趴下、四足滑散、喷火花碎片、发击杀事件并登记残骸
    function beginDeath(impulse) {
      (hound.alive = !1),
        ai.releaseToken(hound),
        (hound.dieT = 0),
        (hound.vy = 0),
        (hound.es = "move"),
        bones.beacon.scale.setScalar(1e-4),
        (hound.dieRoll = (rng() < 0.5 ? -1 : 1) * (0.25 + rng() * 0.3)),
        (hound.diePitch = (rng() - 0.5) * 0.25),
        (hound.sR.v += hound.dieRoll * 3),
        (hound.sP.v += (rng() - 0.5) * 2);
      for (let D = 0; D < 4; D++) {
        let C = feet[D];
        hound.sw >= 0 && (C.p.y = hound.pos.y);
        let G = hound.yaw,
          j = HOUND_SPEC.side[D] * (0.16 + rng() * 0.2),
          N = HOUND_SPEC.fore[D] * (0.05 + rng() * 0.22) + (rng() - 0.5) * 0.1;
        C.slide.set(
          j * Math.cos(G) + N * Math.sin(G),
          0,
          -j * Math.sin(G) + N * Math.cos(G),
        );
      }
      (hound.sw = -1),
        (hound.speed *= 0.3),
        _tmpVecA.copy(hound.headPos),
        ctx.fx.sparks(_tmpVecA, UP_AXIS, 16),
        ctx.fx.debris(_tmpVecA, { count: 4 }),
        ctx.events.emit("enemy:killed", { enemy: hound, pos: hound.pos, type: "hound" }),
        ctx.events.emit("enemy:crashed", {
          enemy: hound,
          pos: hound.pos,
          type: "hound",
        }),
        ai.addWreck(hound);
    }
    // 残骸逐帧：坠落弹跳、冒烟、镜头闪烁，超时后沉入地面并回收
    function updateWreck(dt) {
      if (hound.sink > 0) {
        (hound.sink += dt), (hound.pos.y -= 0.22 * dt), hound.sink > 3.2 && ai.retire(hound);
        return;
      }
      hound.dieT += dt;
      let D = hound.dieT;
      if (D < 2.2) {
        let C = 0.215 - HOUND_SPEC.stand;
        (hound.vy -= 9.8 * dt * (D < 0.12 ? 0.3 : 1)),
          (hound.sY.x += hound.vy * dt),
          hound.sY.x < C &&
            ((hound.sY.x = C),
            hound.vy < -1.2 &&
              (ctx.events.emit("enemy:step", {
                pos: hound.pos,
                type: "hound",
                enemy: hound,
                speed: 5,
                crash: !0,
              }),
              ctx.fx.dust(hound.pos, UP_AXIS)),
            (hound.vy = -hound.vy * 0.22)),
          integrateSpring(hound.sP, hound.diePitch, 60, 9, dt),
          integrateSpring(hound.sR, hound.dieRoll, 60, 9, dt),
          integrateSpring(hound.sL, 0, 40, 8, dt);
        let G = Math.exp(-3.2 * dt);
        for (let N = 0; N < 4; N++) {
          let Q = feet[N];
          (Q.p.x += Q.slide.x * (1 - G)),
            (Q.p.z += Q.slide.z * (1 - G)),
            Q.slide.multiplyScalar(G);
        }
        (hound.pos.x += Math.sin(hound.yaw) * hound.speed * dt),
          (hound.pos.z += Math.cos(hound.yaw) * hound.speed * dt),
          (hound.speed *= Math.exp(-5 * dt)),
          (hound.hpitch += (0.55 - hound.hpitch) * (1 - Math.exp(-5 * dt))),
          (hound.hyaw += (hound.dieRoll - hound.hyaw) * (1 - Math.exp(-3 * dt))),
          (hound.tpitch += (0.3 - hound.tpitch) * (1 - Math.exp(-4 * dt)));
        let j = D < 1.2 ? (Math.sin(D * 60) > 0.2 ? 1 - D / 1.2 : 0.05) : 0.02;
        lensMaterial.color.setRGB(6 * j + 0.05, 0.6 * j + 0.01, 0.2 * j), updatePose(dt);
      }
      if (D < 6.5)
        (hound.smokeT -= dt),
          hound.smokeT <= 0 &&
            ((hound.smokeT = D < 2 ? 0.09 : 0.2),
            _tmpVecA.set(
              hound.pos.x + (rng() - 0.5) * 0.4,
              hound.pos.y + 0.42,
              hound.pos.z + (rng() - 0.5) * 0.4,
            ),
            ctx.fx.smoke(_tmpVecA, {
              size: 0.5 + rng() * 0.3,
              life: 1.8,
              color: 1513499,
              rise: 1.1,
            }),
            D < 4 &&
              rng() < 0.55 &&
              (_tmpVecB.set(rng() - 0.5, 1, rng() - 0.5).normalize(),
              ctx.fx.sparks(_tmpVecA, _tmpVecB, D < 1 ? 8 : 3)),
            D < 3.5 &&
              rng() < 0.4 &&
              ctx.fx.smoke(_tmpVecA, {
                size: 0.22,
                life: 0.45,
                color: 16742946,
                rise: 1.6,
              }));
      else if (!hound.wreck && ((hound.wreck = !0), hound.loop)) {
        try {
          hound.loop.stop();
        } catch {}
        hound.loop = null;
      }
      hound.loop && hound.loop.setGain(Math.max(0, 0.4 - D * 0.3));
    }
    return hound;
  }
  // 射线与球体求交，命中时写入 hit（头部弱点判定）
  function raySphere(origin, dir, center, radius, maxDist, hit) {
    let r = origin.x - center.x,
      a = origin.y - center.y,
      l = origin.z - center.z,
      c = r * dir.x + a * dir.y + l * dir.z,
      u = r * r + a * a + l * l - radius * radius,
      h = c * c - u;
    if (h < 0) return !1;
    let f = -c - Math.sqrt(h);
    return f < 0 || f > maxDist || f >= hit.dist
      ? !1
      : ((hit.dist = f),
        hit.point.copy(origin).addScaledVector(dir, f),
        hit.normal.copy(hit.point).sub(center).normalize(),
        !0);
  }
  var _capAxis = new Vector3(),
    _capOriginOffset = new Vector3(),
    _closestOnAxis = new Vector3();
  // 射线与胶囊求交：先求轴线上最近点，再转为球体求交（躯干命中判定）
  function rayCapsule(origin, dir, capStart, capEnd, radius, maxDist, hit) {
    _capAxis.copy(capEnd).sub(capStart), _capOriginOffset.copy(origin).sub(capStart);
    let a = _capAxis.dot(_capAxis),
      l = _capAxis.dot(dir),
      c = _capAxis.dot(_capOriginOffset),
      u = dir.dot(_capOriginOffset),
      h = a - l * l,
      f = h > 1e-8 ? (c - l * u) / h : 0;
    return (
      (f = f < 0 ? 0 : f > 1 ? 1 : f),
      _closestOnAxis.copy(capStart).addScaledVector(_capAxis, f),
      raySphere(origin, dir, _closestOnAxis, radius, maxDist, hit)
    );
  }

export { buildHoundRig, createHound, HOUND_TUNE, HOUND_SPEC };