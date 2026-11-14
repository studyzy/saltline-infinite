// 背景场景模块 —— 天空、海面、盘旋海鸥、货轮、小艇、岸桥与远景天际线。
// 由 js/game.js（压缩混淆的单文件）中原 ~16154-19292 行原样提取而来。
//
// 模块结构（括号内为原压缩名）：
//   mergeGeometries (sa) / mergeAttributes (Ly)   几何体与属性合并
//   createBoxWithPlanarUV ($e) / createBeveledBox (Wi) / createCylinder (ot)
//                                                  基础几何构造
//   createBoxBetween (Ee) / createCylinderAt (xt) / createRodBetween (Ke)
//   createBeamBetween (jt) / createRodChain (kr) / createSaggingCable (ua)
//   addRailing (ns) / createOctahedronLamp (Bn)    港口构件快捷函数
//   GeometryBatcher (io)                           按材质批量合并几何体
//   MeshAssembler (D1)                             逐四边形写顶点数据
//   hash3D (t0) / valueNoise3D (rl) / createRng (uv)
//   tintVertexColor (hv) / getTintedMaterial (so)  着色与材质登记
//   buildCrane (z1) / buildPortCrane (mb)          岸桥与可复用门吊骨架
//   hullSurfacePoint (fn) / hullSurfaceNormal (ha) / createHullPatch (ul)
//                                                  货轮船体曲面
//   buildShip (vb) / buildBoat (xb)                 货轮与小艇
//   buildSkyline (Mb)                              远景天际线
//   buildGullFlock (wb)                            海鸥群（shader 动画）
//   buildBackdrop (Eb)                             场景组装与碰撞注册
//   createBackdrop (pv) / showcaseBackdrop (MR)    工厂与展示入口
//   BACKDROP_MODULE (mv)                           导出对象 { create, showcase }
//
// createBackdrop(ctx) 需要 ctx 提供：
//   mats.get(name, options) / mats.emissive(color, intensity) —— 材质工厂
//   scene.add(group) —— 场景挂载
//   physics.addBox(min, max, opts)（可选）—— 碰撞盒注册
//   params.bshow（可选）—— 展示模式下只建指定部件
//
// 返回对象字段（被 game.js 直接使用，保持原名）：
//   update / root / boat / crane / ship / skyline / gulls / lamps / colliders
//   spreader / boatBase / extractionPoint / shipName / craneId / stats
//
// 重构只改了内部命名与注释，行为与提取前逐字一致；调用点零改动。

import * as THREE from './vendor/three.module.js';

const TorusGeometry = THREE.TorusGeometry;
const Float32BufferAttribute = THREE.Float32BufferAttribute;
const CatmullRomCurve3 = THREE.CatmullRomCurve3;
const TubeGeometry = THREE.TubeGeometry;
const Quaternion = THREE.Quaternion;
const OctahedronGeometry = THREE.OctahedronGeometry;
const MeshBasicMaterial = THREE.MeshBasicMaterial;
const Mesh = THREE.Mesh;
const DoubleSide = THREE.DoubleSide;
const CapsuleGeometry = THREE.CapsuleGeometry;
const Color = THREE.Color;
const Vector3 = THREE.Vector3;
const Matrix4 = THREE.Matrix4;
const BufferAttribute = THREE.BufferAttribute;
const PCFShadowMap = THREE.PCFShadowMap;
const BufferGeometry = THREE.BufferGeometry;
const Object3D = THREE.Object3D;
const PlaneGeometry = THREE.PlaneGeometry;
const Group = THREE.Group;
const BoxGeometry = THREE.BoxGeometry;
const CylinderGeometry = THREE.CylinderGeometry;

// --- exporter wrapper ---
const defineProperty = Object.defineProperty;
// 给导出对象挂惰性 getter，保持 game.js 里 mv.create / mv.showcase 的调用方式
const defineLazyGetters = (target, getters) => {
  for (var t in getters) defineProperty(target, t, { get: getters[t], enumerable: true });
};

// --- geometry merge + helpers ---
  // 合并多个 BufferGeometry（内联自 BufferGeometryUtils），按属性对齐拼接
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
                ". The geometry must have either an index or a position attribute",
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
  // 合并多个同名顶点属性数组
  function mergeAttributes(attribute) {
    let e,
      t,
      n,
      s = -1,
      o = 0;
    for (let c = 0; c < attribute.length; ++c) {
      let u = attribute[c];
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
    for (let c = 0; c < attribute.length; ++c) {
      let u = attribute[c];
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

  var _scratchNormal = new Vector3();
  // 构造长方体，并按主法线方向展开平面 UV（避免贴图拉伸）
  function createBoxWithPlanarUV(width, height, depth, anchor = "center") {
    let s = new BoxGeometry(width, height, depth),
      o = s.attributes.uv,
      r = s.attributes.position,
      a = s.attributes.normal;
    for (let l = 0; l < o.count; l++) {
      let c = Math.abs(a.getX(l)),
        u = Math.abs(a.getY(l)),
        h = r.getX(l),
        f = r.getY(l),
        p = r.getZ(l);
      c > 0.5
        ? o.setXY(l, p, f)
        : u > 0.5
          ? o.setXY(l, h, p)
          : o.setXY(l, h, f);
    }
    return anchor === "bottom" && s.translate(0, height / 2, 0), s;
  }

  // 构造圆角长方体：把顶点朝外推挤成倒角并重算法线与 UV
  function createBeveledBox(width, height, depth, bevelRadius = 0.02, anchor = "center") {
    bevelRadius = Math.min(bevelRadius, width / 2 - 1e-4, height / 2 - 1e-4, depth / 2 - 1e-4);
    let o = new BoxGeometry(width, height, depth, 3, 3, 3),
      r = o.attributes.position,
      a = o.attributes.normal,
      l = o.attributes.uv,
      c = width / 2,
      u = height / 2,
      h = depth / 2,
      f = (coord, halfExtent) => {
        let v = Math.abs(coord),
          g = Math.sign(coord);
        return v > halfExtent - 1e-5 ? g * halfExtent : g * (halfExtent - bevelRadius);
      };
    for (let p = 0; p < r.count; p++) {
      let d = f(r.getX(p), c),
        v = f(r.getY(p), u),
        g = f(r.getZ(p), h),
        x = Math.max(-(c - bevelRadius), Math.min(c - bevelRadius, d)),
        y = Math.max(-(u - bevelRadius), Math.min(u - bevelRadius, v)),
        b = Math.max(-(h - bevelRadius), Math.min(h - bevelRadius, g));
      if ((_scratchNormal.set(d - x, v - y, g - b), _scratchNormal.lengthSq() > 1e-10)) {
        _scratchNormal.normalize();
        let M = a.getX(p),
          E = a.getY(p),
          w = a.getZ(p);
        (Math.abs(d) > c - 1e-5 ? 1 : 0) +
          (Math.abs(v) > u - 1e-5 ? 1 : 0) +
          (Math.abs(g) > h - 1e-5 ? 1 : 0) >=
        2
          ? ((d = x + _scratchNormal.x * bevelRadius),
            (v = y + _scratchNormal.y * bevelRadius),
            (g = b + _scratchNormal.z * bevelRadius),
            a.setXYZ(p, _scratchNormal.x, _scratchNormal.y, _scratchNormal.z))
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

  // 构造圆柱并重算 UV（顶面按半径、侧面按周长展开）
  function createCylinder(radiusTop, radiusBottom, height, segments = 16, openEnded = !1, anchor = "center") {
    let r = new CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded),
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

  // 按顶点坐标给几何体写入 color 属性
  function paintVertexColors(geometry, colorSource) {
    let t = geometry.attributes.position,
      n = t.count,
      s = new Float32Array(n * 3);
    for (let o = 0; o < n; o++) {
      let r = typeof colorSource == "function" ? colorSource(t.getX(o), t.getY(o), t.getZ(o)) : colorSource;
      (s[o * 3] = r[0]), (s[o * 3 + 1] = r[1]), (s[o * 3 + 2] = r[2]);
    }
    return geometry.setAttribute("color", new BufferAttribute(s, 3)), geometry;
  }

  // 合并几何体列表；自动统一为全有索引或全无索引
  function mergeGeometryList(geometries) {
    let e = geometries
      .filter(Boolean)
      .map(
        (l) => (
          l.attributes.uv ||
            l.setAttribute(
              "uv",
              new BufferAttribute(new Float32Array(l.attributes.position.count * 2), 2),
            ),
          l.attributes.normal || l.computeVertexNormals(),
          l
        ),
      );
    if (!e.length) return new BufferGeometry();
    let t = e.some((l) => l.attributes.color),
      n = e.map((l) => {
        let c = (l.index, l);
        if (t && !c.attributes.color) {
          let u = new Float32Array(c.attributes.position.count * 3).fill(1);
          c.setAttribute("color", new BufferAttribute(u, 3));
        }
        for (let u of Object.keys(c.attributes))
          ["position", "normal", "uv", "color"].includes(u) ||
            c.deleteAttribute(u);
        return c;
      }),
      s = n.every((l) => l.index),
      o = n.every((l) => !l.index),
      r = s || o ? n : n.map((l) => (l.index ? l.toNonIndexed() : l));
    return mergeGeometries(r, !1) || new BufferGeometry();
  }

// --- backdrop: export object, scenery builder, factory, showcase ---
  // 模块导出对象：{ create, showcase }
  var BACKDROP_MODULE = {};
  defineLazyGetters(BACKDROP_MODULE, { create: () => createBackdrop, showcase: () => showcaseBackdrop });
  var vec3 = (x, y, z) => new Vector3(x, y, z),
    toVector3 = (value) => (value.isVector3 ? value : new Vector3(value[0], value[1], value[2])),
    UP_AXIS = new Vector3(0, 1, 0),
    UNIT_SCALE = new Vector3(1, 1, 1),
    _scratchQuaternion = new Quaternion(),
    _scratchMatrix = new Matrix4();
  // 三维整数哈希，返回 [0,1)
  function hash3D(x, y, z) {
    let n =
      Math.imul(x, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(z, 1274126177);
    return (
      (n = Math.imul(n ^ (n >>> 13), 1274126177)),
      ((n ^ (n >>> 16)) >>> 0) / 4294967295
    );
  }
  // 三维值噪声：八个角点哈希后做三次平滑插值
  function valueNoise3D(x, y, z) {
    let n = Math.floor(x),
      s = Math.floor(y),
      o = Math.floor(z),
      r = x - n,
      a = y - s,
      l = z - o;
    (r = r * r * (3 - 2 * r)),
      (a = a * a * (3 - 2 * a)),
      (l = l * l * (3 - 2 * l));
    let c = (u, h, f) => u + (h - u) * f;
    return c(
      c(
        c(hash3D(n, s, o), hash3D(n + 1, s, o), r),
        c(hash3D(n, s + 1, o), hash3D(n + 1, s + 1, o), r),
        a,
      ),
      c(
        c(hash3D(n, s, o + 1), hash3D(n + 1, s, o + 1), r),
        c(hash3D(n, s + 1, o + 1), hash3D(n + 1, s + 1, o + 1), r),
        a,
      ),
      l,
    );
  }
  // 线性同余伪随机数发生器（固定种子保证建模可复现）
  function createRng(seed) {
    let e = seed >>> 0;
    return () => (
      (e = (Math.imul(e, 1664525) + 1013904223) >>> 0), e / 4294967296
    );
  }
  var _tintResult = [1, 1, 1],
    DEFAULT_TINT = [1, 1, 1];
  // 按世界坐标扰动顶点着色，模拟旧漆、锈迹与污渍
  function tintVertexColor(x, y, z, tint = DEFAULT_TINT, strength = 1) {
    let o = valueNoise3D(x * 0.31 + 11.3, y * 0.23 + 5.1, z * 0.31 + 3.7),
      r = valueNoise3D(x * 1.7 + 40.2, 9.5, z * 1.7 + 17.9),
      a = 1 - strength * (0.3 - 0.36 * o),
      l = tint[0] * a,
      c = tint[1] * a,
      u = tint[2] * a;
    if (r > 0.68) {
      let h =
        Math.min(1, (r - 0.68) / 0.3) *
        0.6 *
        strength *
        (0.35 + 0.65 * valueNoise3D(x * 0.9, y * 0.45, z * 0.9));
      (l *= 1 + 0.45 * h), (c *= 1 - 0.3 * h), (u *= 1 - 0.6 * h);
    }
    return (_tintResult[0] = l), (_tintResult[1] = c), (_tintResult[2] = u), _tintResult;
  }
  var TINTED_MATERIALS = new WeakSet();
  // 取材质并登记到「需要顶点色」的材质集合
  function getTintedMaterial(ctx, materialName, options = {}) {
    let n = ctx.mats.get(materialName, { vertexColors: !0, ...options });
    return TINTED_MATERIALS.add(n), n;
  }
  // 几何批处理器：按材质累积几何体，build() 时合并成少量 Mesh 以减少 draw call
  var GeometryBatcher = class {
    constructor() {
      (this.buckets = new Map()),
        (this.tris = 0),
        (this.remap = null),
        (this.dz = 0),
        (this.minSize = 0);
    }
    add(e, t, n) {
      if (!t) return;
      if (Array.isArray(t)) {
        for (let o of t) this.add(e, o, n);
        return;
      }
      if (this.remap) {
        let o = this.remap(e, n);
        if (!o) return;
        if (this.minSize) {
          t.computeBoundingBox();
          let r = t.boundingBox;
          if (
            Math.max(r.max.x - r.min.x, r.max.y - r.min.y, r.max.z - r.min.z) <
            this.minSize
          )
            return;
        }
        (e = o[0]), (n = o[1]), this.dz && t.translate(0, 0, this.dz);
      }
      TINTED_MATERIALS.has(e) &&
        !t.attributes.color &&
        paintVertexColors(t, (o, r, a) => tintVertexColor(o, r, a, n || DEFAULT_TINT));
      let s = this.buckets.get(e.uuid);
      s || ((s = { mat: e, geos: [] }), this.buckets.set(e.uuid, s)),
        s.geos.push(t),
        (this.tris +=
          (t.index ? t.index.count : t.attributes.position.count) / 3);
    }
    build({ cast: e = !0, recv: t = !0 } = {}) {
      let n = new Group();
      for (let s of this.buckets.values()) {
        let o = mergeGeometryList(s.geos),
          r = new Mesh(o, s.mat),
          a = s.mat.isMeshBasicMaterial || s.mat.transparent;
        (r.castShadow = e && !a), (r.receiveShadow = t && !a), n.add(r);
      }
      return this.buckets.clear(), n;
    }
  };
  // 由两个对角点构造长方体（可选倒角）
  function createBoxBetween(x0, y0, z0, x1, y1, z1, bevelRadius = 0) {
    let a = Math.abs(x1 - x0),
      l = Math.abs(y1 - y0),
      c = Math.abs(z1 - z0),
      u = bevelRadius > 0 ? createBeveledBox(a, l, c, bevelRadius) : createBoxWithPlanarUV(a, l, c);
    return u.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), u;
  }
  // 按指定轴向旋转、平移圆柱
  function createCylinderAt(radiusTop, radiusBottom, height, axis, x, y, z, segments = 12, openEnded = !1) {
    let c = createCylinder(radiusTop, radiusBottom, height, segments, openEnded);
    return (
      axis === "x" ? c.rotateZ(Math.PI / 2) : axis === "z" && c.rotateX(Math.PI / 2),
      c.translate(x, y, z),
      c
    );
  }
  // 两点之间的细圆柱杆件
  function createRodBetween(start, end, radius = 0.03, segments = 5, openEnded = !1) {
    (start = toVector3(start)), (end = toVector3(end));
    let o = new Vector3().subVectors(end, start),
      r = o.length();
    if (r < 1e-5) return null;
    let a = createCylinder(radius, radius, r, segments, !openEnded);
    return (
      _scratchQuaternion.setFromUnitVectors(UP_AXIS, o.multiplyScalar(1 / r)),
      _scratchMatrix.compose(new Vector3().addVectors(start, end).multiplyScalar(0.5), _scratchQuaternion, UNIT_SCALE),
      a.applyMatrix4(_scratchMatrix),
      a
    );
  }
  // 两点之间的方梁（带朝向基）
  function createBeamBetween(start, end, width = 0.3, depth = 0.3, bevelRadius = 0) {
    (start = toVector3(start)), (end = toVector3(end));
    let o = new Vector3().subVectors(end, start),
      r = o.length();
    o.multiplyScalar(1 / r);
    let a = new Vector3().crossVectors(o, UP_AXIS);
    a.lengthSq() < 1e-6 ? a.set(1, 0, 0) : a.normalize();
    let l = new Vector3().crossVectors(a, o),
      c = bevelRadius > 0 ? createBeveledBox(width, r, depth, bevelRadius) : createBoxWithPlanarUV(width, r, depth);
    return (
      _scratchMatrix.makeBasis(a, o, l).setPosition(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        (start.z + end.z) / 2,
      ),
      c.applyMatrix4(_scratchMatrix),
      c
    );
  }
  // 点列折线转成一串首尾相接的圆柱段
  function createRodChain(points, radius = 0.03, segments = 5) {
    let n = [];
    for (let s = 0; s < points.length - 1; s++) {
      let o = createRodBetween(points[s], points[s + 1], radius, segments);
      o && n.push(o);
    }
    return n;
  }
  // 生成带下垂弧度的缆绳点列
  function createSaggingCable(start, end, sag = 1, segments = 10) {
    (start = toVector3(start)), (end = toVector3(end));
    let s = [];
    for (let o = 0; o <= segments; o++) {
      let r = o / segments,
        a = new Vector3().lerpVectors(start, end, r);
      (a.y -= sag * 4 * r * (1 - r)), s.push(a);
    }
    return s;
  }
  // 可绕 X/Y 旋转并平移的平面
  function createRotatedPlane(width, height, x, y, z, rotY = 0, rotX = 0) {
    let a = new PlaneGeometry(width, height);
    return rotX && a.rotateX(rotX), rotY && a.rotateY(rotY), a.translate(x, y, z), a;
  }
  // 沿点列生成护栏：立柱 + 上/中横杆
  function addRailing(
    batcher,
    material,
    points,
    { h: railHeight = 1.1, post: postSpacing = 2.2, r: railRadius = 0.022, tint: tint, mid: midRail = !0 } = {},
  ) {
    points = points.map(toVector3);
    for (let l = 0; l < points.length - 1; l++) {
      let c = points[l],
        u = points[l + 1],
        h = c.distanceTo(u),
        f = Math.max(1, Math.round(h / postSpacing));
      for (let p = l === 0 ? 0 : 1; p <= f; p++) {
        let d = new Vector3().lerpVectors(c, u, p / f);
        batcher.add(material, createRodBetween(d, vec3(d.x, d.y + railHeight, d.z), railRadius, 4), tint);
      }
      batcher.add(
        material,
        createRodBetween(vec3(c.x, c.y + railHeight, c.z), vec3(u.x, u.y + railHeight, u.z), railRadius * 1.15, 5),
        tint,
      ),
        midRail &&
          batcher.add(
            material,
            createRodBetween(
              vec3(c.x, c.y + railHeight * 0.5, c.z),
              vec3(u.x, u.y + railHeight * 0.5, u.z),
              railRadius * 0.9,
              4,
            ),
            tint,
          );
    }
  }
  // 闪烁灯集合：自定义 shader 按 blink 属性做周期性明灭
  function createBlinkLights() {
    let i = { value: 0 },
      e = new MeshBasicMaterial({ vertexColors: !0, fog: !1 });
    (e.onBeforeCompile = (n) => {
      (n.uniforms.uTime = i),
        (n.vertexShader =
          `attribute vec3 blink;
uniform float uTime;
varying float vBlink;
` +
          n.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
 float bph = fract(uTime / max(blink.x, 0.001) + blink.y);
 vBlink = blink.x <= 0.0 ? 1.0 : mix(0.02, 1.0, smoothstep(0.0, 0.06, bph) * (1.0 - smoothstep(blink.z, blink.z + 0.12, bph)));`,
          )),
        (n.fragmentShader =
          `varying float vBlink;
` +
          n.fragmentShader.replace(
            "#include <color_fragment>",
            `#include <color_fragment>
 diffuseColor.rgb *= vBlink;`,
          ));
    }),
      (e.customProgramCacheKey = () => "saltline-blink");
    let t = [];
    return {
      uTime: i,
      mat: e,
      add(n, s, o = 0, r = 0, a = 0.5) {
        if (!n) return;
        let l = n.index ? n.toNonIndexed() : n,
          c = l.attributes.position.count,
          u = new Float32Array(c * 3),
          h = new Float32Array(c * 3);
        for (let p = 0; p < c; p++)
          (u[p * 3] = s[0]),
            (u[p * 3 + 1] = s[1]),
            (u[p * 3 + 2] = s[2]),
            (h[p * 3] = o),
            (h[p * 3 + 1] = r),
            (h[p * 3 + 2] = a);
        let f = new BufferGeometry();
        f.setAttribute("position", l.attributes.position),
          f.setAttribute("color", new BufferAttribute(u, 3)),
          f.setAttribute("blink", new BufferAttribute(h, 3)),
          t.push(f);
      },
      build() {
        if (!t.length) return null;
        let n = new Mesh(mergeGeometries(t.splice(0), !1), e);
        return (n.castShadow = !1), (n.receiveShadow = !1), n;
      },
    };
  }
  var createOctahedronLamp = (x, y, z, radius = 0.12) => {
    let s = new OctahedronGeometry(radius, 0);
    return s.translate(x, y, z), s;
  };
  // 岸桥尺寸常量（塔身 X 边界、横梁高度、吊臂端点等）与顶点色配比
  var CRANE_LEFT_X = 18.5,
    CRANE_RIGHT_X = 28.5,
    CRANE_HALF_WIDTH = 5.4,
    CRANE_BEAM_LOW_Y = 21.2,
    CRANE_BEAM_HIGH_Y = 22.8,
    CRANE_MAST_Z = 1.8,
    CRANE_CAB_X = 12,
    CRANE_JIB_TIP_X = 62,
    CRANE_SPREADER_X = 41,
    TINT_HULL = [0.82, 0.95, 1.12],
    TINT_STEEL = [0.6, 0.72, 0.86],
    TINT_DECK = [1, 0.95, 0.85],
    TINT_GLASS = [0.95, 0.96, 0.97];
  // 建模：港口岸桥——塔腿轮组、塔身桁架、机房、吊臂、吊具、梯子、栏杆与碰撞盒
  // 局部量：a=灰漆 l=黄漆 c=白漆 u=红漆 h=深钢 f=镀锌钢 p=警示条 d=玻璃；g()=按材质累加几何；x=碰撞盒列表
  function buildCrane(ctx, blinkLights, options = {}) {
    let n = !!options.into,
      s = options.dz || 0,
      o = options.into || new GeometryBatcher(),
      r = n
        ? {
            add(R, I, se, ae, k) {
              R.translate(0, 0, s), blinkLights.add(R, I, se, ae, k);
            },
          }
        : blinkLights,
      a = getTintedMaterial(ctx, "paint_grey"),
      l = getTintedMaterial(ctx, "paint_yellow"),
      c = getTintedMaterial(ctx, "paint_white"),
      u = getTintedMaterial(ctx, "paint_red"),
      h = ctx.mats.get("steel_galv"),
      f = ctx.mats.get("steel_dark"),
      p = ctx.mats.get("hazard_stripes"),
      d = ctx.mats.get("glass"),
      v = ctx.mats.emissive(16769716, 6),
      addPart = (R, I, se) => o.add(R, I, se),
      x = [];
    if (n) {
      let R = new Map([
          [a.uuid, [0.2, 0.25, 0.31]],
          [l.uuid, [0.72, 0.52, 0.12]],
          [c.uuid, [0.78, 0.78, 0.76]],
          [u.uuid, [0.5, 0.14, 0.1]],
          [h.uuid, [0.5, 0.52, 0.54]],
          [f.uuid, [0.1, 0.1, 0.11]],
          [p.uuid, [0.7, 0.5, 0.1]],
        ]),
        I = options.mat;
      (o.remap = (se, ae) => {
        let k = R.get(se.uuid);
        return k
          ? [I, ae ? [k[0] * ae[0], k[1] * ae[1], k[2] * ae[2]] : k]
          : null;
      }),
        (o.dz = s),
        (o.minSize = 2.6);
    }
    function addCraneWheelBase(legX, legZ) {
      let se = legX < 23.5 ? 1 : -1;
      for (let ae of [-1.12, 1.12]) {
        let k = legZ + ae;
        addPart(l, createBoxBetween(legX - 0.3, 0.36, k - 0.98, legX + 0.3, 0.84, k + 0.98, 0.04), TINT_DECK);
        for (let ce of [-0.56, 0.56])
          addPart(f, createCylinderAt(0.33, 0.33, 0.14, "x", legX, 0.33, k + ce, 16)),
            addPart(f, createCylinderAt(0.37, 0.37, 0.025, "x", legX - 0.085, 0.33, k + ce, 16)),
            addPart(f, createCylinderAt(0.37, 0.37, 0.025, "x", legX + 0.085, 0.33, k + ce, 16)),
            addPart(h, createCylinderAt(0.11, 0.11, 0.7, "x", legX, 0.33, k + ce, 8));
        addPart(f, createCylinderAt(0.16, 0.16, 0.5, "z", legX + se * 0.5, 0.6, k, 10)),
          addPart(
            l,
            createBoxBetween(
              legX + se * 0.3,
              0.42,
              k - 0.56 - 0.16,
              legX + se * 0.62,
              0.8,
              k - 0.3,
              0.03,
            ),
            TINT_DECK,
          );
      }
      addPart(f, createBoxBetween(legX - 0.2, 0.1, legZ - 0.22, legX + 0.2, 0.9, legZ + 0.22, 0.03)),
        addPart(a, createBoxBetween(legX - 0.34, 0.9, legZ - 1.8, legX + 0.34, 1.42, legZ + 1.8, 0.05), TINT_HULL);
      for (let ae of [-1.12, 0, 1.12])
        addPart(h, createCylinderAt(0.14, 0.14, 0.8, "x", legX, ae ? 1.08 : 1.22, legZ + ae, 10));
      addPart(a, createBoxBetween(legX - 0.54, 1.42, legZ - 0.54, legX + 0.54, 1.6, legZ + 0.54, 0.03), TINT_STEEL);
      for (let ae of [-1, 1]) {
        let k = legZ + ae * 2.1;
        addPart(l, createBoxBetween(legX - 0.16, 0.44, k - 0.12, legX + 0.16, 0.8, k + 0.12, 0.02), TINT_DECK),
          addPart(h, createCylinderAt(0.08, 0.08, 0.34, "z", legX, 0.62, k + ae * 0.28, 8)),
          addPart(f, createCylinderAt(0.17, 0.15, 0.12, "z", legX, 0.62, k + ae * 0.5, 12)),
          addPart(p, createBoxBetween(legX - 0.28, 0.04, k + ae * 0.13, legX + 0.28, 0.4, k + ae * 0.16));
      }
      x.push({ min: [legX - 0.5, 0, legZ - 2.7], max: [legX + 0.5, 1.5, legZ + 2.7] }),
        x.push({ min: [legX - 0.62, 0, legZ - 0.62], max: [legX + 0.62, 24, legZ + 0.62] });
    }
    let b = [3.6, 7.6, 11.2, 12.5, 13.5, 17.2, 20.6, 23.8];
    for (let R of [CRANE_LEFT_X, CRANE_RIGHT_X])
      for (let I of [-CRANE_HALF_WIDTH, CRANE_HALF_WIDTH]) {
        addCraneWheelBase(R, I), addPart(p, createBoxBetween(R - 0.6, 1.6, I - 0.6, R + 0.6, 3.6, I + 0.6, 0.04));
        for (let se = 0; se < b.length - 1; se++)
          addPart(
            a,
            createBoxBetween(R - 0.6, b[se], I - 0.6, R + 0.6, b[se + 1], I + 0.6, 0.05),
            TINT_HULL,
          ),
            (se === 0 || se === 1 || se === 5) &&
              addPart(
                a,
                createBoxBetween(
                  R - 0.64,
                  b[se] - 0.05,
                  I - 0.64,
                  R + 0.64,
                  b[se] + 0.05,
                  I + 0.64,
                ),
                TINT_STEEL,
              );
      }
    let m = ctx.mats.decal("hazard_voltage");
    for (let R of [-CRANE_HALF_WIDTH, CRANE_HALF_WIDTH]) {
      let I = CRANE_LEFT_X - 0.6;
      addPart(
        c,
        createBoxBetween(I - 0.035, 1.72, R - 0.36, I, 3.48, R + 0.36, 0.012),
        [0.62, 0.66, 0.7],
      ),
        addPart(f, createBoxBetween(I - 0.05, 1.66, R - 0.42, I - 0.005, 1.72, R + 0.42)),
        addPart(f, createBoxBetween(I - 0.05, 3.48, R - 0.42, I - 0.005, 3.54, R + 0.42)),
        addPart(f, createBoxBetween(I - 0.05, 1.66, R - 0.42, I - 0.005, 3.54, R - 0.36)),
        addPart(f, createBoxBetween(I - 0.05, 1.66, R + 0.36, I - 0.005, 3.54, R + 0.42)),
        addPart(
          h,
          createRodBetween([I - 0.08, 2.45, R + 0.26], [I - 0.08, 2.75, R + 0.26], 0.014, 5),
        );
      for (let se of [2, 3.2])
        addPart(f, createBoxBetween(I - 0.06, se - 0.07, R - 0.37, I - 0.03, se + 0.07, R - 0.33));
      addPart(h, createBoxBetween(I - 0.3, 1.5, R - 0.4, I, 1.56, R + 0.4)),
        addPart(h, createBoxBetween(I - 0.3, 1, R - 0.4, I - 0.02, 1.05, R + 0.4)),
        addPart(m.material, createRotatedPlane(0.3, 0.3, I - 0.04, 3.1, R, -Math.PI / 2));
    }
    for (let R of [CRANE_LEFT_X, CRANE_RIGHT_X]) {
      addPart(a, createBoxBetween(R - 0.45, 3.6, -CRANE_HALF_WIDTH + 0.6, R + 0.45, 4.6, CRANE_HALF_WIDTH - 0.6, 0.05), TINT_HULL);
      for (let I of [-2.4, 0, 2.4])
        addPart(a, createBoxBetween(R - 0.48, 3.58, I - 0.03, R + 0.48, 4.62, I + 0.03), TINT_STEEL);
    }
    addPart(l, createCylinderAt(1.15, 1.15, 0.06, "x", CRANE_LEFT_X - 0.62, 5.85, -2.2, 24), TINT_DECK),
      addPart(l, createCylinderAt(1.15, 1.15, 0.06, "x", CRANE_LEFT_X - 1.02, 5.85, -2.2, 24), TINT_DECK),
      addPart(f, createCylinderAt(0.7, 0.7, 0.36, "x", CRANE_LEFT_X - 0.82, 5.85, -2.2, 20)),
      addPart(h, createCylinderAt(0.12, 0.12, 0.9, "x", CRANE_LEFT_X - 0.6, 5.85, -2.2, 8)),
      addPart(a, createBoxBetween(CRANE_LEFT_X - 0.5, 4.6, -2.5, CRANE_LEFT_X + 0.3, 5.9, -1.9, 0.03), TINT_STEEL),
      addPart(
        f,
        createRodBetween(
          [CRANE_LEFT_X - 0.82, 4.75, -2.2 + 1],
          [CRANE_LEFT_X - 0.82, 0.02, -1.2 + 0.3],
          0.035,
          6,
        ),
      ),
      addPart(h, createBoxBetween(CRANE_LEFT_X - 1, 0, -1.15, CRANE_LEFT_X - 0.64, 0.5, -0.65, 0.02)),
      x.push({ min: [CRANE_LEFT_X - 1, 0, -1.15], max: [CRANE_LEFT_X - 0.64, 0.5, -0.65] }),
      addPart(c, createBoxBetween(CRANE_LEFT_X - 0.42, 4.6, 1, CRANE_LEFT_X + 0.42, 6.3, 3.6, 0.03), TINT_GLASS);
    for (let R of [1.65, 2.3, 2.95])
      addPart(f, createBoxBetween(CRANE_LEFT_X - 0.44, 4.7, R - 0.01, CRANE_LEFT_X - 0.42, 6.2, R + 0.01));
    addPart(h, createBoxBetween(CRANE_LEFT_X - 0.47, 5.6, 1.2, CRANE_LEFT_X - 0.42, 6.1, 1.55));
    for (let R of [-CRANE_HALF_WIDTH, CRANE_HALF_WIDTH]) {
      addPart(a, createBoxBetween(CRANE_LEFT_X + 0.6, 12.5, R - 0.45, CRANE_RIGHT_X - 0.6, 13.5, R + 0.45, 0.05), TINT_HULL);
      for (let se of [21, 23.5, 26])
        addPart(a, createBoxBetween(se - 0.03, 12.48, R - 0.48, se + 0.03, 13.52, R + 0.48), TINT_STEEL);
      let I = Math.sign(R);
      addPart(a, createBeamBetween([CRANE_LEFT_X + 0.5, 9.6, R], [CRANE_LEFT_X + 3.4, 12.6, R], 0.4, 0.4, 0.03), TINT_HULL),
        addPart(a, createBeamBetween([CRANE_RIGHT_X - 0.5, 9.6, R], [CRANE_RIGHT_X - 3.4, 12.6, R], 0.4, 0.4, 0.03), TINT_HULL);
      for (let se of [CRANE_LEFT_X, CRANE_RIGHT_X])
        addPart(
          a,
          createBeamBetween([se, 9.6, R - I * 0.5], [se, 12.6, R - I * 3.4], 0.4, 0.4, 0.03),
          TINT_HULL,
        );
      addPart(a, createRodBetween([CRANE_RIGHT_X - 0.4, 13.7, R], [CRANE_LEFT_X + 0.4, 22.7, R], 0.2, 10), TINT_HULL),
        addPart(a, createRodBetween([CRANE_LEFT_X + 0.4, 13.7, R], [CRANE_RIGHT_X - 0.4, 22.7, R], 0.2, 10), TINT_HULL),
        addPart(
          a,
          createBoxBetween(23.5 - 0.5, 17.7, R - 0.24, 23.5 + 0.5, 18.7, R + 0.24, 0.03),
          TINT_STEEL,
        ),
        addPart(a, createBoxBetween(CRANE_LEFT_X + 0.6, 22.95, R - 0.35, CRANE_RIGHT_X - 0.6, 23.7, R + 0.35, 0.04), TINT_HULL);
    }
    for (let R of [CRANE_LEFT_X, CRANE_RIGHT_X]) {
      addPart(a, createBoxBetween(R - 0.45, 12.5, -CRANE_HALF_WIDTH + 0.6, R + 0.45, 13.5, CRANE_HALF_WIDTH - 0.6, 0.05), TINT_HULL),
        addPart(a, createBoxBetween(R - 0.45, 22.8, -CRANE_HALF_WIDTH + 0.6, R + 0.45, 23.8, CRANE_HALF_WIDTH - 0.6, 0.05), TINT_HULL);
      for (let I of [-1, 1])
        addPart(
          a,
          createBeamBetween(
            [R, 20.2, I * (CRANE_HALF_WIDTH - 0.5)],
            [R, 22.8, I * (CRANE_MAST_Z + 1.2)],
            0.36,
            0.36,
            0.03,
          ),
          TINT_HULL,
        );
    }
    addPart(h, createBoxBetween(CRANE_LEFT_X + 0.9, 13.5, 4.05, CRANE_RIGHT_X - 0.9, 13.55, 4.95)),
      addRailing(
        o,
        l,
        [
          [CRANE_LEFT_X + 0.9, 13.55, 4.08],
          [CRANE_RIGHT_X - 0.9, 13.55, 4.08],
        ],
        { tint: TINT_DECK },
      ),
      addPart(h, createBoxBetween(CRANE_LEFT_X + 0.45, 13.45, -4.6, CRANE_LEFT_X + 1.25, 13.5, 4.05)),
      addRailing(
        o,
        l,
        [
          [CRANE_LEFT_X + 1.22, 13.5, -4.6],
          [CRANE_LEFT_X + 1.22, 13.5, 4.05],
        ],
        { tint: TINT_DECK },
      );
    let A = CRANE_RIGHT_X + 1.3;
    for (let R of [-1, 1]) {
      let I = R * CRANE_MAST_Z,
        se = [
          CRANE_CAB_X,
          15.4,
          CRANE_LEFT_X,
          22,
          25.2,
          CRANE_RIGHT_X,
          A - 0.15,
          A + 0.15,
          34.6,
          39.2,
          43.8,
          48.4,
          53,
          57.6,
          CRANE_JIB_TIP_X,
        ];
      for (let ce = 0; ce < se.length - 1; ce++)
        ce !== 6 &&
          (addPart(a, createBoxBetween(se[ce], CRANE_BEAM_LOW_Y, I - 0.45, se[ce + 1], CRANE_BEAM_HIGH_Y, I + 0.45, 0.05), TINT_HULL),
          ce > 0 &&
            ce !== 7 &&
            addPart(
              a,
              createBoxBetween(
                se[ce] - 0.035,
                CRANE_BEAM_LOW_Y - 0.05,
                I - 0.5,
                se[ce] + 0.035,
                CRANE_BEAM_HIGH_Y + 0.05,
                I + 0.5,
              ),
              TINT_STEEL,
            ));
      addPart(
        a,
        createBoxBetween(A - 0.7, CRANE_BEAM_HIGH_Y - 0.1, I - 0.52, A + 0.7, CRANE_BEAM_HIGH_Y + 0.55, I - 0.4, 0.03),
        TINT_STEEL,
      ),
        addPart(
          a,
          createBoxBetween(A - 0.7, CRANE_BEAM_HIGH_Y - 0.1, I + 0.4, A + 0.7, CRANE_BEAM_HIGH_Y + 0.55, I + 0.52, 0.03),
          TINT_STEEL,
        ),
        addPart(h, createCylinderAt(0.16, 0.16, 1.2, "z", A, CRANE_BEAM_HIGH_Y + 0.22, I, 12)),
        addPart(
          f,
          createBoxBetween(
            CRANE_CAB_X + 0.3,
            CRANE_BEAM_HIGH_Y,
            I - R * 0.32 - 0.05,
            CRANE_JIB_TIP_X - 0.3,
            CRANE_BEAM_HIGH_Y + 0.09,
            I - R * 0.32 + 0.05,
          ),
        );
      let ae = I + R * 0.45,
        k = I + R * 1.35;
      addPart(
        h,
        createBoxBetween(CRANE_CAB_X + 0.2, 21.86, Math.min(ae, k), CRANE_JIB_TIP_X - 0.2, 21.9, Math.max(ae, k)),
      );
      for (let ce = CRANE_CAB_X + 0.6; ce < CRANE_JIB_TIP_X; ce += 2.45)
        addPart(a, createBeamBetween([ce, 21.84, ae], [ce, 21.3, ae], 0.07, 0.07), TINT_STEEL),
          addPart(a, createBeamBetween([ce, 21.82, k], [ce, 21.36, ae], 0.06, 0.08), TINT_STEEL);
      addRailing(
        o,
        l,
        [
          [CRANE_CAB_X + 0.2, 21.9, k - R * 0.03],
          [CRANE_JIB_TIP_X - 0.2, 21.9, k - R * 0.03],
        ],
        { post: 2.45, tint: TINT_DECK },
      ),
        addPart(
          l,
          createBoxBetween(
            CRANE_CAB_X + 0.2,
            21.9,
            k - R * 0.03 - 0.008,
            CRANE_JIB_TIP_X - 0.2,
            22.02,
            k - R * 0.03 + 0.008,
          ),
          TINT_DECK,
        );
      for (let ce of [44, 58])
        addPart(
          a,
          createBoxBetween(ce - 0.18, CRANE_BEAM_HIGH_Y, I - 0.2, ce + 0.18, CRANE_BEAM_HIGH_Y + 1.5, I + 0.2, 0.03),
          TINT_HULL,
        );
    }
    for (let R of [44, 58])
      addPart(
        a,
        createBoxBetween(R - 0.2, CRANE_BEAM_HIGH_Y + 1.2, -CRANE_MAST_Z - 0.3, R + 0.2, CRANE_BEAM_HIGH_Y + 1.6, CRANE_MAST_Z + 0.3, 0.04),
        TINT_HULL,
      );
    for (let R of [CRANE_CAB_X + 0.25, CRANE_JIB_TIP_X - 0.25]) {
      addPart(
        a,
        createBoxBetween(R - 0.25, CRANE_BEAM_LOW_Y + 0.1, -CRANE_MAST_Z + 0.45, R + 0.25, CRANE_BEAM_HIGH_Y - 0.1, CRANE_MAST_Z - 0.45, 0.05),
        TINT_HULL,
      );
      let I = R < 30 ? 1 : -1;
      for (let se of [-0.8, 0.8])
        addPart(f, createCylinderAt(0.14, 0.14, 0.4, "x", R + I * 0.45, 22, se, 10));
    }
    addPart(h, createBoxBetween(CRANE_JIB_TIP_X - 0.1, 21.86, -CRANE_MAST_Z - 1.35, CRANE_JIB_TIP_X + 0.9, 21.9, CRANE_MAST_Z + 1.35)),
      addRailing(
        o,
        l,
        [
          [CRANE_JIB_TIP_X - 0.1, 21.9, -CRANE_MAST_Z - 1.32],
          [CRANE_JIB_TIP_X + 0.87, 21.9, -CRANE_MAST_Z - 1.32],
          [CRANE_JIB_TIP_X + 0.87, 21.9, CRANE_MAST_Z + 1.32],
          [CRANE_JIB_TIP_X - 0.1, 21.9, CRANE_MAST_Z + 1.32],
        ],
        { post: 1.4, tint: TINT_DECK },
      ),
      addPart(h, createRodBetween([CRANE_JIB_TIP_X + 0.6, 21.9, 0], [CRANE_JIB_TIP_X + 0.6, 25.2, 0], 0.035, 6)),
      addPart(h, createRodBetween([CRANE_JIB_TIP_X + 0.6, 24.8, -0.45], [CRANE_JIB_TIP_X + 0.6, 24.8, 0.45], 0.015, 4)),
      r.add(createOctahedronLamp(CRANE_JIB_TIP_X + 0.6, 25.32, 0, 0.13), [9, 0.5, 0.25], 2.6, 0.5, 0.45),
      addPart(f, createCylinderAt(0.1, 0.12, 0.1, "y", CRANE_JIB_TIP_X + 0.6, 25.2, 0, 8));
    let _ = 27.6,
      M = 30,
      E = 1.5;
    for (let R of [-1, 1]) {
      addPart(a, createBeamBetween([CRANE_RIGHT_X, 23.8, R * CRANE_HALF_WIDTH], [_, M, R * E], 0.55, 0.55, 0.04), TINT_HULL),
        addPart(a, createBeamBetween([CRANE_LEFT_X, 23.8, R * CRANE_HALF_WIDTH], [_, M, R * E], 0.5, 0.5, 0.04), TINT_HULL);
      for (let [I, se] of [
        [44, 0.1],
        [58, 0.1],
      ]) {
        let ae = vec3(_ + 0.3, M, R * E),
          k = vec3(I, CRANE_BEAM_HIGH_Y + 1.45, R * CRANE_MAST_Z);
        addPart(a, createRodBetween(ae, k, se, 8), TINT_HULL);
        let ce = ae.clone().lerp(k, 0.5);
        addPart(
          a,
          createBoxBetween(
            ce.x - 0.3,
            ce.y - 0.16,
            ce.z - 0.14,
            ce.x + 0.3,
            ce.y + 0.16,
            ce.z + 0.14,
            0.03,
          ),
          TINT_STEEL,
        );
      }
      addPart(f, createRodBetween([_ + 0.2, M + 0.35, R * 0.9], [50, CRANE_BEAM_HIGH_Y + 0.2, R * 1], 0.022, 5)),
        addPart(f, createCylinderAt(0.5, 0.5, 0.18, "z", _, M + 0.25, R * 0.9, 16));
    }
    addPart(
      a,
      createBoxBetween(_ - 0.45, M - 0.35, -E - 0.5, _ + 0.45, M + 0.3, E + 0.5, 0.05),
      TINT_HULL,
    );
    {
      let R = (k, ce) =>
          vec3(
            CRANE_RIGHT_X + (_ - CRANE_RIGHT_X) * k,
            23.8 + (M - 23.8) * k,
            ce * (CRANE_HALF_WIDTH + (E - CRANE_HALF_WIDTH) * k),
          ),
        I = (k, ce) =>
          vec3(
            CRANE_LEFT_X + (_ - CRANE_LEFT_X) * k,
            23.8 + (M - 23.8) * k,
            ce * (CRANE_HALF_WIDTH + (E - CRANE_HALF_WIDTH) * k),
          );
      addPart(a, createBeamBetween(R(0.5, -1), R(0.5, 1), 0.3, 0.3, 0.02), TINT_HULL),
        addPart(a, createBeamBetween(I(0.55, -1), I(0.55, 1), 0.3, 0.3, 0.02), TINT_HULL),
        addPart(a, createRodBetween(I(0.55, -1), R(0.5, -1), 0.09, 6), TINT_HULL),
        addPart(a, createRodBetween(I(0.55, 1), R(0.5, 1), 0.09, 6), TINT_HULL);
      let se = R(0.02, 1),
        ae = R(0.97, 1);
      for (let k of [-0.22, 0.22])
        addPart(
          h,
          createRodBetween(
            [se.x - 0.42, se.y, se.z + k],
            [ae.x - 0.42, ae.y, ae.z + k],
            0.02,
            4,
          ),
        );
      for (let k = 0.03; k < 1; k += 0.045) {
        let ce = se.clone().lerp(ae, k);
        addPart(
          h,
          createRodBetween(
            [ce.x - 0.42, ce.y, ce.z - 0.22],
            [ce.x - 0.42, ce.y, ce.z + 0.22],
            0.012,
            4,
          ),
        );
      }
    }
    addPart(a, createBoxBetween(CRANE_CAB_X + 0.05, CRANE_BEAM_HIGH_Y, -3.6, CRANE_CAB_X + 0.55, CRANE_BEAM_HIGH_Y + 0.4, 3.6, 0.04), TINT_HULL);
    for (let R of [-1, 1])
      addPart(
        a,
        createBoxBetween(
          CRANE_CAB_X + 0.08,
          CRANE_BEAM_HIGH_Y + 0.4,
          R * 3.3 - 0.2,
          CRANE_CAB_X + 0.52,
          CRANE_BEAM_HIGH_Y + 1,
          R * 3.3 + 0.2,
          0.03,
        ),
        TINT_STEEL,
      ),
        addPart(
          a,
          createRodBetween([_ - 0.3, M, R * E], [CRANE_CAB_X + 0.3, CRANE_BEAM_HIGH_Y + 0.8, R * 3.3], 0.1, 8),
          TINT_HULL,
        ),
        addPart(h, createCylinderAt(0.12, 0.12, 0.6, "z", CRANE_CAB_X + 0.3, CRANE_BEAM_HIGH_Y + 0.8, R * 3.3, 10));
    addPart(h, createBoxBetween(_ - 1, M + 0.3, -E - 0.6, _ + 1, M + 0.34, E + 0.6)),
      addRailing(
        o,
        l,
        [
          [_ - 0.98, M + 0.34, -E - 0.58],
          [_ + 0.98, M + 0.34, -E - 0.58],
          [_ + 0.98, M + 0.34, E + 0.58],
          [_ - 0.98, M + 0.34, E + 0.58],
          [_ - 0.98, M + 0.34, -E - 0.58],
        ],
        { post: 1.2, tint: TINT_DECK },
      ),
      addPart(h, createRodBetween([_, M + 0.34, 0], [_, M + 2, 0], 0.045, 6)),
      addPart(h, createRodBetween([_, M + 2, 0], [_, M + 3.6, 0], 0.016, 4)),
      addPart(h, createRodBetween([_ - 0.5, M + 1.5, 0], [_ + 0.5, M + 1.5, 0], 0.018, 4));
    for (let R of [-0.5, 0.5])
      addPart(f, createCylinderAt(0.1, 0.12, 0.1, "y", _ + R, M + 1.56, 0, 8)),
        r.add(createOctahedronLamp(_ + R, M + 1.72, 0, 0.15), [10, 0.5, 0.25], 2.6, 0, 0.45);
    let w = 20.4,
      S = 27.9,
      z = CRANE_BEAM_HIGH_Y,
      H = 26,
      O = 2.9;
    addPart(c, createBoxBetween(w, z, -O, S, H, O, 0.06), TINT_GLASS),
      addPart(
        a,
        createBoxBetween(w - 0.15, z - 0.12, -O - 0.15, S + 0.15, z + 0.1, O + 0.15, 0.03),
        TINT_STEEL,
      ),
      addPart(h, createBoxBetween(w - 0.2, H, -O - 0.2, S + 0.2, H + 0.12, O + 0.2, 0.03));
    for (let R = w + 1.3; R < S; R += 1.3)
      for (let I of [-1, 1])
        addPart(
          c,
          createBoxBetween(R - 0.02, z + 0.1, I * O - 0.015, R + 0.02, H, I * O + 0.015),
          [0.7, 0.72, 0.74],
        );
    function addLouverPanel(x, y, z, width, height, rotation) {
      let ve = [createBoxBetween(-width / 2, -height / 2, 0, width / 2, height / 2, 0.02)],
        _e = Math.round(height / 0.12);
      for (let Te = 0; Te < _e; Te++) {
        let Pe = createBoxBetween(-width / 2 + 0.03, -0.012, 0, width / 2 - 0.03, 0.012, 0.11);
        Pe.rotateX(0.7),
          Pe.translate(0, -height / 2 + (Te + 0.5) * (height / _e), 0.03),
          ve.push(Pe);
      }
      for (let Te of ve) Te.rotateY(rotation), Te.translate(x, y, z);
      addPart(f, ve.shift()), addPart(h, ve);
    }
    for (let R of [-1, 1])
      for (let I of [w + 1.4, w + 3.9, w + 6.1])
        addLouverPanel(I, 24.5, R * (O + 0.005), 1.5, 1.3, R > 0 ? 0 : Math.PI);
    addLouverPanel(w - 0.005, 23.75, -1.9, 1.4, 1.1, -Math.PI / 2),
      addPart(
        c,
        createBoxBetween(w - 0.03, z + 0.15, 0.8, w, z + 2.15, 1.7, 0.01),
        [0.6, 0.64, 0.68],
      ),
      addPart(h, createRodBetween([w - 0.06, z + 1, 1.55], [w - 0.06, z + 1.3, 1.55], 0.014, 5)),
      addPart(h, createBoxBetween(w - 0.9, z + 0.05, 0.3, w, z + 0.1, 2.2)),
      addRailing(
        o,
        l,
        [
          [w, z + 0.1, 0.32],
          [w - 0.88, z + 0.1, 0.32],
          [w - 0.88, z + 0.1, 2.18],
          [w, z + 0.1, 2.18],
        ],
        { post: 1, tint: TINT_DECK },
      );
    let U = ctx.mats.decal("logo_a");
    addPart(
      U.material,
      createRotatedPlane(
        1.1 * Math.min(3, U.aspect || 1),
        1.1,
        w - 0.012,
        25.2,
        0,
        -Math.PI / 2,
      ),
    ),
      addRailing(
        o,
        l,
        [
          [w, H + 0.12, -O],
          [S, H + 0.12, -O],
          [S, H + 0.12, O],
          [w, H + 0.12, O],
          [w, H + 0.12, -O],
        ],
        { post: 1.95, tint: TINT_DECK },
      );
    for (let R of [w + 1.9, w + 5.6])
      addPart(h, createCylinderAt(0.28, 0.28, 0.5, "y", R, H + 0.37, -1.2, 10)),
        addPart(h, createCylinderAt(0.1, 0.5, 0.22, "y", R, H + 0.72, -1.2, 10));
    addPart(f, createCylinderAt(0.13, 0.13, 1.6, "y", w + 3.7, H + 0.9, 1.9, 8)),
      addPart(f, createCylinderAt(0.2, 0.14, 0.2, "y", w + 3.7, H + 1.75, 1.9, 8)),
      addPart(
        c,
        createBoxBetween(w + 5.4, H + 0.12, 0.4, w + 6.7, H + 0.85, 1.8, 0.03),
        [0.7, 0.72, 0.75],
      ),
      addPart(h, createRodBetween([w + 0.3, H + 0.12, 2.5], [w + 0.3, H + 1.9, 2.5], 0.03, 5)),
      r.add(createOctahedronLamp(w + 0.3, H + 2.02, 2.5, 0.13), [9, 0.5, 0.25], 2.6, 0.25, 0.45);
    let T = 6.15,
      D = 6.97,
      C = 7.8,
      G = [19.4, 20.6],
      j = [26.4, 27.6];
    function addHandrail(startX, startY, endX, endY, zNear, zFar) {
      let ve = endY - startY,
        _e = Math.max(2, Math.round(ve / 0.21));
      for (let Te of [zNear + 0.03, zFar - 0.03]) {
        addPart(h, createBeamBetween([startX, startY - 0.12, Te], [endX, endY - 0.12, Te], 0.05, 0.24)),
          addPart(l, createRodBetween([startX, startY + 1, Te], [endX, endY + 1, Te], 0.024, 5), TINT_DECK),
          addPart(l, createRodBetween([startX, startY + 0.5, Te], [endX, endY + 0.5, Te], 0.018, 4), TINT_DECK);
        for (let Pe = 0; Pe <= 4; Pe++) {
          let Re = Pe / 4,
            Fe = startX + (endX - startX) * Re,
            ze = startY + ve * Re;
          addPart(l, createRodBetween([Fe, ze - 0.05, Te], [Fe, ze + 1, Te], 0.02, 4), TINT_DECK);
        }
      }
      for (let Te = 1; Te <= _e; Te++) {
        let Pe = (Te - 0.5) / _e,
          Re = startX + (endX - startX) * Pe,
          Fe = startY + ve * (Te / _e);
        addPart(h, createBoxBetween(Re - 0.13, Fe - 0.03, zNear + 0.06, Re + 0.13, Fe, zFar - 0.06));
      }
    }
    function addPlatformEdge(startX, endX, y, direction) {
      addPart(h, createBoxBetween(startX, y - 0.05, T, endX, y, C)),
        addPart(h, createBoxBetween(startX, y - 0.2, T, endX, y - 0.05, T + 0.06)),
        addPart(h, createBoxBetween(startX, y - 0.2, C - 0.06, endX, y - 0.05, C));
      let k = direction > 0 ? endX - 0.03 : startX + 0.03,
        ce = direction > 0 ? startX : endX;
      addRailing(
        o,
        l,
        [
          [ce, y, C - 0.03],
          [k, y, C - 0.03],
          [k, y, T + 0.03],
        ],
        { post: 0.9, tint: TINT_DECK },
      );
    }
    let K = [3.6, 6.9, 10.2, 13.5, 16.8, 20.1];
    for (let R = 0; R < 5; R++)
      R % 2 === 0
        ? (addPlatformEdge(G[0], G[1], K[R], -1), addHandrail(G[1], K[R], j[0], K[R + 1], T, D))
        : (addPlatformEdge(j[0], j[1], K[R], 1), addHandrail(j[0], K[R], G[1], K[R + 1], D, C));
    addPlatformEdge(j[0], j[1], K[5], 1),
      addHandrail(j[0], K[5], 23.4, 21.9, D, C),
      addPart(h, createBoxBetween(22.5, 21.85, CRANE_MAST_Z + 1.35, 23.4, 21.9, C)),
      addRailing(
        o,
        l,
        [
          [22.53, 21.9, CRANE_MAST_Z + 1.4],
          [22.53, 21.9, C - 0.03],
          [23.37, 21.9, C - 0.03],
        ],
        { post: 1.3, tint: TINT_DECK },
      ),
      addRailing(
        o,
        l,
        [
          [23.37, 21.9, CRANE_MAST_Z + 1.4],
          [23.37, 21.9, D],
        ],
        { post: 1.3, tint: TINT_DECK },
      ),
      addPart(h, createBoxBetween(j[0], 13.45, 4.95, j[1], 13.5, T));
    for (let R of [G[0], j[1]])
      for (let I of [T - 0.05, C + 0.05])
        addPart(a, createBoxBetween(R - 0.07, 3.3, I - 0.07, R + 0.07, 21.4, I + 0.07), TINT_HULL);
    for (let R = 0; R < K.length; R++) {
      let I = K[R] - 0.25;
      addPart(a, createBoxBetween(G[0], I - 0.06, C + 0, j[1], I + 0.06, C + 0.1), TINT_STEEL);
      for (let se of [G[0], j[1]])
        addPart(a, createBoxBetween(se - 0.05, I - 0.06, 5.9, se + 0.05, I + 0.06, C + 0.1), TINT_STEEL);
      if (R < K.length - 1) {
        let se = K[R + 1] - 0.25;
        addPart(a, createRodBetween([G[0], I, C + 0.05], [j[1], se, C + 0.05], 0.03, 5), TINT_HULL),
          addPart(a, createRodBetween([j[1], I, C + 0.05], [G[0], se, C + 0.05], 0.03, 5), TINT_HULL);
      }
    }
    {
      let R = G[0] - 0.05,
        I = 7.35;
      for (let ae of [-0.22, 0.22])
        addPart(h, createRodBetween([R, 0.05, I + ae], [R, 4.75, I + ae], 0.022, 5));
      for (let ae = 0.3; ae < 4.7; ae += 0.3)
        addPart(h, createRodBetween([R, ae, I - 0.22], [R, ae, I + 0.22], 0.012, 4));
      let arcPoints = (height) => {
        let k = [];
        for (let ce = 0; ce <= 8; ce++) {
          let ve = (Math.PI * ce) / 8;
          k.push(vec3(R - Math.sin(ve) * 0.7, height, I - Math.cos(ve) * 0.36));
        }
        return k;
      };
      for (let ae = 2.3; ae <= 4.75; ae += 0.6) addPart(h, createRodChain(arcPoints(ae), 0.012, 4));
      for (let ae = 1; ae < 8; ae += 1.5) {
        let k = (Math.PI * ae) / 8;
        addPart(
          h,
          createRodBetween(
            [R - Math.sin(k) * 0.7, 2.3, I - Math.cos(k) * 0.36],
            [R - Math.sin(k) * 0.7, 4.75, I - Math.cos(k) * 0.36],
            0.01,
            4,
          ),
        );
      }
      x.push({
        min: [R - 0.72, 0, I - 0.4],
        max: [R + 0.05, 4.7, I + 0.4],
        bulletOnly: !1,
      });
    }
    addPart(f, createBoxBetween(13, 21.02, -CRANE_MAST_Z - 0.95, CRANE_SPREADER_X - 1.2, 21.12, -CRANE_MAST_Z - 0.85));
    for (let R = 13.5; R < CRANE_SPREADER_X - 1.2; R += 3.3)
      addPart(f, createBoxBetween(R - 0.03, 21.1, -CRANE_MAST_Z - 0.93, R + 0.03, 21.86, -CRANE_MAST_Z - 0.87));
    {
      let se = (CRANE_SPREADER_X - 1.6 - 13.6) / 15;
      for (let ae = 0; ae < 15; ae++) {
        let k = 13.6 + ae * se,
          ce = 1.1 + 0.25 * Math.sin(ae * 2.1);
        addPart(f, createBoxBetween(k - 0.1, 20.9, -CRANE_MAST_Z - 0.98, k + 0.1, 21.02, -CRANE_MAST_Z - 0.82));
        for (let ve of [-0.05, 0.05]) {
          let _e = [];
          for (let Te = 0; Te <= 7; Te++) {
            let Pe = Te / 7;
            _e.push(
              vec3(
                k + se * Pe,
                20.92 - ce * (1 - (2 * Pe - 1) ** 2),
                -CRANE_MAST_Z - 0.9 + ve,
              ),
            );
          }
          addPart(f, createRodChain(_e, 0.03, 4));
        }
      }
    }
    function addLadderRungs(x, y, z, rungCount, axis = "z") {
      let ce = rungCount * 0.46;
      axis === "z"
        ? addPart(f, createBoxBetween(x - 0.03, y, z - ce / 2, x + 0.03, y + 0.06, z + ce / 2))
        : addPart(f, createBoxBetween(x - ce / 2, y, z - 0.03, x + ce / 2, y + 0.06, z + 0.03));
      for (let ve = 0; ve < rungCount; ve++) {
        let _e = (ve - (rungCount - 1) / 2) * 0.46,
          Te = axis === "z" ? x : x + _e,
          Pe = axis === "z" ? z + _e : z;
        addPart(f, createBoxBetween(Te - 0.17, y - 0.2, Pe - 0.17, Te + 0.17, y, Pe + 0.17, 0.02)),
          addPart(
            v,
            createBoxBetween(Te - 0.14, y - 0.215, Pe - 0.14, Te + 0.14, y - 0.2, Pe + 0.14),
          );
      }
    }
    for (let R of [33, 47.5, 59.5])
      for (let I of [-1, 1]) addLadderRungs(R, 21.3, I * (CRANE_MAST_Z + 1.3), 3, "x");
    for (let R of [-1, 1])
      addLadderRungs(23.5, 12.28, R * (CRANE_HALF_WIDTH - 0.2), 4, "x"),
        addLadderRungs(15, 21.3, R * (CRANE_MAST_Z + 1.3), 2, "x");
    addLadderRungs(CRANE_RIGHT_X + 0.1, 12.28, 0, 3, "z"),
      addLadderRungs(CRANE_LEFT_X - 0.1, 12.28, 0, 3, "z"),
      addLadderRungs(_ + 0.6, M - 0.55, 0, 3, "z"),
      addPart(l, createBoxBetween(CRANE_SPREADER_X - 2.3, 21.35, -1.25, CRANE_SPREADER_X + 2.3, 22.2, 1.25, 0.06), TINT_DECK),
      addPart(l, createBoxBetween(CRANE_SPREADER_X - 1.6, 20.7, -1.1, CRANE_SPREADER_X + 1.6, 21.35, 1.1, 0.05), TINT_DECK);
    for (let R of [-1.8, 1.8])
      for (let I of [-1, 1])
        addPart(f, createCylinderAt(0.24, 0.24, 0.16, "z", CRANE_SPREADER_X + R, 22.42, I * 1.3, 12)),
          addPart(
            l,
            createBoxBetween(
              CRANE_SPREADER_X + R - 0.35,
              22.1,
              I * 1.3 - 0.14,
              CRANE_SPREADER_X + R + 0.35,
              22.5,
              I * 1.3 + 0.14,
              0.03,
            ),
            TINT_DECK,
          );
    addPart(f, createCylinderAt(0.42, 0.42, 1.5, "z", CRANE_SPREADER_X - 0.9, 22.35, 0, 14)),
      addPart(f, createCylinderAt(0.42, 0.42, 1.5, "z", CRANE_SPREADER_X + 0.9, 22.35, 0, 14));
    let F = CRANE_SPREADER_X + 0.25,
      X = CRANE_SPREADER_X + 2.65,
      ne = 2.35,
      re = 4.4,
      $ = 18.3,
      ue = 20.7;
    for (let R of [F + 0.12, X - 0.3]) {
      addPart(l, createBoxBetween(R - 0.12, 20.88, -1, R + 0.12, 21.16, re, 0.03), TINT_DECK);
      for (let I of [ne + 0.1, re - 0.1])
        addPart(l, createBoxBetween(R - 0.06, ue, I - 0.06, R + 0.06, 20.9, I + 0.06), TINT_DECK);
    }
    addPart(c, createBoxBetween(F, $, ne, X, $ + 0.14, re, 0.03), TINT_GLASS),
      addPart(
        c,
        createBoxBetween(
          F - 0.08,
          ue - 0.02,
          ne - 0.08,
          X + 0.12,
          ue + 0.12,
          re + 0.08,
          0.03,
        ),
        TINT_GLASS,
      ),
      addPart(c, createBoxBetween(F, $ + 0.14, ne, F + 0.08, ue, re), TINT_GLASS);
    for (let R of [ne, re - 0.06])
      addPart(c, createBoxBetween(F, $ + 0.14, R, X - 0.5, $ + 0.95, R + 0.06), TINT_GLASS),
        addPart(d, createBoxBetween(F + 0.08, $ + 0.95, R + 0.02, X - 0.06, ue, R + 0.04)),
        addPart(d, createBoxBetween(X - 0.5, $ + 0.14, R + 0.02, X - 0.06, $ + 0.95, R + 0.04));
    for (let R of [X - 0.06])
      for (let I of [ne, re - 0.06, (ne + re) / 2 - 0.03])
        addPart(c, createBoxBetween(R, $ + 0.14, I, R + 0.06, ue, I + 0.06), TINT_GLASS);
    addPart(d, createBoxBetween(X - 0.04, $ + 0.14, ne + 0.06, X - 0.02, ue, re - 0.06)),
      addPart(d, createBoxBetween(X - 0.9, $ + 0.02, ne + 0.3, X - 0.1, $ + 0.04, re - 0.3)),
      addPart(f, createBoxBetween(F + 0.9, $ + 0.14, 3.1, F + 1.45, $ + 0.6, 3.65, 0.04)),
      addPart(f, createBoxBetween(F + 0.82, $ + 0.6, 3.1, F + 0.96, $ + 1.35, 3.65, 0.04));
    for (let R of [2.75, 4])
      addPart(f, createBoxBetween(F + 1.2, $ + 0.14, R - 0.16, F + 1.75, $ + 0.85, R + 0.16, 0.03)),
        r.add(
          createBoxBetween(F + 1.3, $ + 0.855, R - 0.1, F + 1.6, $ + 0.865, R + 0.1),
          [0.75, 0.5, 0.26],
          0,
        );
    r.add(
      createBoxBetween(F + 0.5, ue - 0.045, 3, F + 1.5, ue - 0.03, 3.2),
      [0.75, 0.5, 0.26],
      0,
    ),
      addLadderRungs(X + 0.15, $ + 0.1, 3.37, 2, "z"),
      addPart(h, createBoxBetween(F - 0.9, $ + 0.1, ne, F, $ + 0.14, re)),
      addRailing(
        o,
        l,
        [
          [F, $ + 0.14, ne + 0.03],
          [F - 0.87, $ + 0.14, ne + 0.03],
          [F - 0.87, $ + 0.14, re - 0.03],
          [F, $ + 0.14, re - 0.03],
        ],
        { post: 1, tint: TINT_DECK },
      );
    let me = ctx.mats.label("DEEP BLUE 04", {
        color: "white",
        font: "stencil",
        distress: 0.35,
      }),
      ee = Math.max(1, me.aspect || 6);
    {
      let R = Math.min(1.15, 8.6 / ee);
      for (let I of [-1, 1])
        addPart(
          me.material,
          createRotatedPlane(R * ee, R, 36.9, 22, I * (CRANE_MAST_Z + 0.453), I > 0 ? 0 : Math.PI),
        );
    }
    {
      let R = Math.min(0.86, 9.4 / ee);
      addPart(me.material, createRotatedPlane(R * ee, R, CRANE_LEFT_X - 0.453, 13, 0, -Math.PI / 2));
    }
    if (n) return (o.remap = null), (o.dz = 0), (o.minSize = 0), null;
    let B = o.build({ cast: !0, recv: !0 });
    B.name = "crane";
    let P = new GeometryBatcher(),
      V = (R, I, se) => P.add(R, I, se),
      Y = 8.3;
    for (let R of [-0.9, 0.9])
      for (let I of [-0.8, 0.8])
        V(f, createRodBetween([R, 0, I], [R * 0.8, -Y, I * 0.7], 0.022, 5));
    V(l, createBoxBetween(-0.95, -Y - 0.55, -0.75, 0.95, -Y, 0.75, 0.05), TINT_DECK);
    for (let R of [-0.45, 0.45])
      V(f, createCylinderAt(0.3, 0.3, 0.12, "z", 0, -Y + 0.12, R, 12));
    let L = -Y - 0.55,
      Z = L - 0.34;
    for (let R of [-0.6, 0.6])
      V(l, createBoxBetween(R - 0.16, Z, -6.02, R + 0.16, L, 6.02, 0.03), TINT_DECK);
    for (let R of [-5.92, 5.92])
      V(l, createBoxBetween(-1.22, Z, R - 0.14, 1.22, L, R + 0.14, 0.03), TINT_DECK);
    V(l, createBoxBetween(-0.9, Z - 0.02, -1.3, 0.9, L + 0.1, 1.3, 0.04), TINT_DECK);
    for (let R of [-1.2, 1.2])
      for (let I of [-6, 6])
        V(f, createBoxBetween(R - 0.1, Z - 0.1, I - 0.1, R + 0.1, Z + 0.05, I + 0.1)),
          V(
            l,
            createBeamBetween(
              [R * 1.02, Z, I * 1.01],
              [R * 1.22, Z - 0.55, I * 1.04],
              0.28,
              0.03,
            ),
            TINT_DECK,
          );
    let J = Z - 0.08,
      oe = J - 2.59,
      fe = [0.9, 0.82, 0.8];
    V(u, createBoxBetween(-1.2, oe, -6.08, 1.2, J, 6.08, 0.03), fe);
    for (let R of [-1.22, 1.22])
      for (let I = -5.7; I <= 5.71; I += 0.57)
        V(u, createBoxBetween(R - 0.02, oe + 0.16, I - 0.1, R + 0.02, J - 0.12, I + 0.1), fe);
    for (let R of [-6.095, 6.095])
      for (let I of [-1.22, 1.22])
        V(
          u,
          createBoxBetween(I - 0.08, oe, R - 0.08, I + 0.08, J, R + 0.08),
          [0.7, 0.62, 0.6],
        );
    for (let R of [-0.8, -0.3, 0.3, 0.8])
      V(f, createRodBetween([R, oe + 0.08, 6.1], [R, J - 0.08, 6.1], 0.02, 5));
    let le = P.build({ cast: !0, recv: !0 });
    return (
      le.position.set(CRANE_SPREADER_X, 20.7, 0),
      (le.userData.noMerge = !0),
      (le.name = "crane-spreader"),
      B.add(le),
      { root: B, spreader: le, colliders: x, tris: o.tris + P.tris }
    );
  }
  // 建模：可复用的门式塔吊骨架（远景天际线也调用它批量摆放）
  function buildPortCrane(
    batcher,
    material,
    offsetX,
    offsetZ,
    { s: scale = 1, up: upright = !1, tint: tint = [0.3, 0.36, 0.44] } = {},
  ) {
    let a = [],
      l = (c, u, h, f, p, d) => a.push(createBoxBetween(c, u, h, f, p, d));
    for (let c of [-5, 5])
      for (let u of [-5.4, 5.4]) l(c - 0.6, 0, u - 0.6, c + 0.6, 24, u + 0.6);
    for (let c of [-5.4, 5.4])
      l(-5, 12.5, c - 0.45, 5, 13.5, c + 0.45),
        l(-5, 23, c - 0.4, 5, 23.8, c + 0.4),
        a.push(createBeamBetween([-5, 13.5, c], [5, 23, c], 0.4, 0.4));
    for (let c of [-5, 5])
      l(c - 0.45, 12.5, -5.4, c + 0.45, 13.5, 5.4),
        l(c - 0.45, 22.8, -5.4, c + 0.45, 23.8, 5.4),
        l(c - 0.45, 3.6, -5.4, c + 0.45, 4.6, 5.4);
    l(-11.5, 21.2, -2.3, 6.3, 22.8, 2.3), l(-10.9, 22.8, -2.9, -3.1, 26, 2.9);
    for (let c of [-1, 1])
      a.push(createBeamBetween([5, 23.8, c * 5.4], [4.1, 30, c * 1.5], 0.6, 0.6)),
        a.push(createBeamBetween([-5, 23.8, c * 5.4], [4.1, 30, c * 1.5], 0.5, 0.5));
    l(3.6, 29.6, -2, 4.6, 30.4, 2),
      upright
        ? (a.push(createBeamBetween([6.6, 22, 0], [10.5, 52, 0], 4.6, 1.6)),
          a.push(createBeamBetween([4.1, 30, 0], [9.4, 44, 0], 0.3, 0.3)))
        : (l(6.6, 21.2, -2.3, 38.5, 22.8, 2.3),
          a.push(createBeamBetween([4.1, 30, 0], [20.5, 24.3, 0], 0.3, 0.3)),
          a.push(createBeamBetween([4.1, 30, 0], [34.5, 24.3, 0], 0.3, 0.3)),
          l(15, 18.3, 2.4, 19.5, 22.2, 4.4));
    for (let c of a) c.scale(scale, scale, scale), c.translate(offsetX, 0, offsetZ), batcher.add(material, c, tint);
    return upright ? [offsetX + 10.5 * scale, 52.6 * scale, offsetZ] : [offsetX + 4.1 * scale, 31 * scale, offsetZ];
  }
  // 货轮船型参数：船长、型宽、吃水、甲板高、舷弧与外飘曲线
  var SHIP_ORIGIN_X = 41,
    SHIP_BEAM = 8,
    SHIP_BOW_Z = -9,
    SHIP_LENGTH = 63,
    SHIP_KEEL_Y = -4.4,
    SHIP_DECK_Y = 13,
    SHIP_WATERLINE_Y = -1.6,
    smoothstep = (i, e, t) => {
      let n = Math.min(1, Math.max(0, (t - i) / (e - i)));
      return n * n * (3 - 2 * n);
    },
    hullSheer = (i) =>
      1.7 * Math.pow(Math.max(0, 1 - i / 20), 2) +
      0.5 * Math.pow(Math.max(0, (i - (SHIP_LENGTH - 12)) / 12), 2),
    deckHeight = (i) => SHIP_DECK_Y + hullSheer(i),
    hullFlare = (i) => 1.15 * (1 - smoothstep(14.5, 18, i) + smoothstep(SHIP_LENGTH - 10.5, SHIP_LENGTH - 8, i)),
    hullTopEdge = (i) => deckHeight(i) + hullFlare(i),
    BOW_BASELINE = hullTopEdge(0);
  // 船体曲面上的点：沿船长 station、高度 height、左右 side
  function hullSurfacePoint(station, height, side) {
    let n = (BOW_BASELINE - height) * 0.22,
      s = Math.max(0, 1 - station / 22),
      o = SHIP_BOW_Z - station - n * s,
      r = Math.min(1, Math.max(0, (height - SHIP_WATERLINE_Y) / (SHIP_DECK_Y - SHIP_WATERLINE_Y))),
      a = 17 - 8.5 * Math.pow(r, 1.3),
      l = station / a,
      c = l >= 1 ? 1 : Math.pow(Math.sin((l * Math.PI) / 2), 0.72),
      u = 0.2 + (SHIP_BEAM - 0.2) * c,
      h = (station - (SHIP_LENGTH - 10)) / 10;
    return (
      h > 0 && (u *= 1 - 0.24 * h * h * (1 - 0.6 * r)), new Vector3(SHIP_ORIGIN_X + side * u, height, o)
    );
  }
  // 船体曲面法线（对曲面点做中心差分）
  function hullSurfaceNormal(station, height, side) {
    let s = hullSurfacePoint(station + 0.05, height, side).sub(hullSurfacePoint(Math.max(0, station - 0.05), height, side)),
      o = hullSurfacePoint(station, height + 0.05, side).sub(hullSurfacePoint(station, height - 0.05, side)),
      r = s.cross(o).normalize();
    return r.x * side + r.z * 0.25 < 0 && r.negate(), r;
  }
  // 生成船体曲面网格片（可指定偏移量做双层壳）
  function createHullPatch(stationStart, stationEnd, heightStart, heightEnd, side, offset = 0.012, stationSegments = 6, heightSegments = 1) {
    let l = [],
      c = [],
      u = [],
      h = [];
    for (let d = 0; d <= heightSegments; d++)
      for (let v = 0; v <= stationSegments; v++) {
        let g = stationStart + ((stationEnd - stationStart) * v) / stationSegments,
          x = heightStart + ((heightEnd - heightStart) * d) / heightSegments,
          y = hullSurfaceNormal(g, x, side),
          b = hullSurfacePoint(g, x, side).addScaledVector(y, offset);
        l.push(b.x, b.y, b.z),
          u.push(y.x, y.y, y.z),
          c.push(side < 0 ? 1 - v / stationSegments : v / stationSegments, d / heightSegments);
      }
    let f = stationSegments + 1;
    for (let d = 0; d < heightSegments; d++)
      for (let v = 0; v < stationSegments; v++) {
        let g = d * f + v,
          x = g + 1,
          y = g + f + 1,
          b = g + f;
        side > 0 ? h.push(g, x, y, g, y, b) : h.push(g, y, x, g, b, y);
      }
    let p = new BufferGeometry();
    return (
      p.setAttribute("position", new Float32BufferAttribute(l, 3)),
      p.setAttribute("normal", new Float32BufferAttribute(u, 3)),
      p.setAttribute("uv", new Float32BufferAttribute(c, 2)),
      p.setIndex(h),
      p
    );
  }
  // 网格装配器：逐四边形写入 position / normal / uv / color，最后合成一个几何体
  var MeshAssembler = class {
      constructor() {
        (this.positions = []), (this.normals = []), (this.uvs = []), (this.colors = []);
      }
      // 写入一个顶点
      pushVertex(point, normal, u, v, color) {
        this.positions.push(point.x, point.y, point.z),
          this.normals.push(normal.x, normal.y, normal.z),
          this.uvs.push(u, v),
          this.colors.push(color[0], color[1], color[2]);
      }
      // 按绕序拆两个三角形写入一个四边形
      pushQuad(corners, normals, uvs, colors) {
        let edgeA = corners[1].clone().sub(corners[0]),
          edgeB = corners[3].clone().sub(corners[0]);
        let order =
          edgeA.cross(edgeB).dot(normals[0]) >= 0
            ? [0, 1, 2, 0, 2, 3]
            : [0, 2, 1, 0, 3, 2];
        for (let idx of order)
          this.pushVertex(corners[idx], normals[idx], uvs[idx][0], uvs[idx][1], colors[idx]);
      }
      toGeometry() {
        let geo = new BufferGeometry();
        return (
          geo.setAttribute("position", new Float32BufferAttribute(this.positions, 3)),
          geo.setAttribute("normal", new Float32BufferAttribute(this.normals, 3)),
          geo.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2)),
          geo.setAttribute("color", new Float32BufferAttribute(this.colors, 3)),
          geo
        );
      }
    },
    // 二维整数哈希，返回 [0,1)
    hash2D = (x, y) => {
      let t = Math.imul(x + 31, 374761393) ^ Math.imul(y + 17, 668265263);
      return (
        (t = Math.imul(t ^ (t >>> 13), 1274126177)),
        ((t ^ (t >>> 16)) >>> 0) / 4294967295
      );
    };
  // 建模：货轮 KITTIWAKE——船体曲面、甲板、上层建筑、雷达、舷梯与系泊缆绳
  function buildShip(ctx, blinkLights) {
    let t = new GeometryBatcher(),
      n = getTintedMaterial(ctx, "hull_paint"),
      s = getTintedMaterial(ctx, "hull_red"),
      o = getTintedMaterial(ctx, "paint_white"),
      r = ctx.mats.get("steel_dark"),
      a = ctx.mats.get("steel_galv"),
      l = ctx.mats.get("rope"),
      c = ctx.mats.get("rubber"),
      u = [2.6, 1.75, 0.95],
      addLamp = ($) => blinkLights.add($, u, 0),
      addHullPart = ($, ue, me) => t.add($, ue, me),
      p = [0, 0.35, 0.9, 1.8, 3, 4.5, 6, 8, 10, 12, 14.5, 17, 20];
    for (let $ = 23; $ < SHIP_LENGTH - 0.5; $ += 3) p.push($);
    p.push(SHIP_LENGTH);
    let d = [0, 0.17, 0.34, 0.5, 0.66, 0.83, 1],
      hullSectionHeights = (station) => {
        let ue = deckHeight(station),
          me = [SHIP_KEEL_Y, -2.3, -0.4, 1];
        for (let ee = 1; ee < d.length; ee++) me.push(1 + (ue - 1) * d[ee]);
        return me.push(hullTopEdge(station)), me;
      },
      g = 10,
      x = 3,
      y = new MeshAssembler(),
      b = new MeshAssembler(),
      shadeHullColor = (point, bandIndex, isUpper, brightness) => {
        let B = tintVertexColor(point.x * 0.6, point.y, point.z * 0.6, void 0, 0.8),
          P = [B[0] * brightness, B[1] * brightness, B[2] * brightness];
        return (
          bandIndex < x
            ? point.y < -0.2
              ? ((P[0] *= 0.55), (P[1] *= 0.72), (P[2] *= 0.55))
              : isUpper && ((P[0] *= 1.12), (P[1] *= 1), (P[2] *= 0.92))
            : point.y < 1.1 && ((P[0] *= 1.7), (P[1] *= 1.62), (P[2] *= 1.45)),
          P
        );
      };
    for (let $ of [-1, 1])
      for (let ue = 0; ue < p.length - 1; ue++) {
        let me = p[ue],
          ee = p[ue + 1],
          B = hullSectionHeights(me),
          P = hullSectionHeights(ee);
        for (let V = 0; V < g; V++) {
          if (V === g - 1 && hullFlare(me) < 0.02 && hullFlare(ee) < 0.02) continue;
          let Y =
              (V < x ? 0.8 : 0.58) + 0.36 * hash2D(ue * 7 + ($ > 0 ? 100 : 0), V),
            L = [
              hullSurfacePoint(me, B[V], $),
              hullSurfacePoint(ee, P[V], $),
              hullSurfacePoint(ee, P[V + 1], $),
              hullSurfacePoint(me, B[V + 1], $),
            ],
            Z = [
              hullSurfaceNormal(me, B[V], $),
              hullSurfaceNormal(ee, P[V], $),
              hullSurfaceNormal(ee, P[V + 1], $),
              hullSurfaceNormal(me, B[V + 1], $),
            ],
            J = [
              [me, B[V]],
              [ee, P[V]],
              [ee, P[V + 1]],
              [me, B[V + 1]],
            ],
            oe = [
              shadeHullColor(L[0], V, !1, Y),
              shadeHullColor(L[1], V, !1, Y),
              shadeHullColor(L[2], V, !0, Y),
              shadeHullColor(L[3], V, !0, Y),
            ];
          if (me > 1.5 && V >= 2 && V < g - 1) {
            let fe = L[0]
              .clone()
              .add(L[1])
              .add(L[2])
              .add(L[3])
              .multiplyScalar(0.25);
            for (let le = 0; le < 4; le++)
              Z[le]
                .addScaledVector(fe.clone().sub(L[le]).normalize(), 0.075)
                .normalize();
          }
          (V < x ? y : b).pushQuad(L, Z, J, oe);
        }
      }
    {
      let $ = hullSectionHeights(0),
        ue = hullSectionHeights(SHIP_LENGTH),
        me = vec3(0, 0.2, 1).normalize(),
        ee = vec3(0, 0, -1),
        B = vec3(0, 1, 0);
      for (let P = 0; P < g; P++) {
        let V = P < x ? [0.8, 0.8, 0.8] : [0.9, 0.9, 0.9];
        (P < x ? y : b).pushQuad(
          [
            hullSurfacePoint(0, $[P], -1),
            hullSurfacePoint(0, $[P], 1),
            hullSurfacePoint(0, $[P + 1], 1),
            hullSurfacePoint(0, $[P + 1], -1),
          ],
          [me, me, me, me],
          [
            [0, $[P]],
            [0.4, $[P]],
            [0.4, $[P + 1]],
            [0, $[P + 1]],
          ],
          [V, V, V, V],
        ),
          (P < x ? y : b).pushQuad(
            [
              hullSurfacePoint(SHIP_LENGTH, ue[P], -1),
              hullSurfacePoint(SHIP_LENGTH, ue[P], 1),
              hullSurfacePoint(SHIP_LENGTH, ue[P + 1], 1),
              hullSurfacePoint(SHIP_LENGTH, ue[P + 1], -1),
            ],
            [ee, ee, ee, ee],
            [
              [0, ue[P]],
              [14, ue[P]],
              [14, ue[P + 1]],
              [0, ue[P + 1]],
            ],
            [V, V, V, V],
          );
      }
      for (let P = 0; P < p.length - 1; P++) {
        let V = hullSurfacePoint(p[P], deckHeight(p[P]), -1),
          Y = hullSurfacePoint(p[P], deckHeight(p[P]), 1),
          L = hullSurfacePoint(p[P + 1], deckHeight(p[P + 1]), 1),
          Z = hullSurfacePoint(p[P + 1], deckHeight(p[P + 1]), -1),
          J = [0.75, 0.72, 0.7];
        y.pushQuad(
          [V, Y, L, Z],
          [B, B, B, B],
          [
            [V.x, V.z],
            [Y.x, Y.z],
            [L.x, L.z],
            [Z.x, Z.z],
          ],
          [J, J, J, J],
        );
      }
    }
    addHullPart(s, y.toGeometry()), addHullPart(n, b.toGeometry());
    {
      let $ = (me, ee) => hullSurfacePoint(me, ee, -1).addScaledVector(hullSurfaceNormal(me, ee, -1), 0.012),
        ue = [1.05, 0.92, 0.8];
      for (let me = 2; me < p.length - 1; me++) {
        let ee = hullSectionHeights(p[me]),
          B = hullSectionHeights(p[me + 1]);
        for (let P = 4; P <= 9; P++)
          addHullPart(n, createBeamBetween($(p[me], ee[P]), $(p[me + 1], B[P]), 0.03, 0.045), ue);
        for (let P = 3; P < 9; P++)
          (me + P) % 2 === 0 &&
            addHullPart(n, createBeamBetween($(p[me], ee[P]), $(p[me], ee[P + 1]), 0.035, 0.03), ue);
      }
    }
    for (let $ of [-1, 1]) {
      for (let Y = 3; Y < p.length - 1; Y++) {
        let L = (Z, J) => hullSurfacePoint(Z, J, $).addScaledVector(hullSurfaceNormal(Z, J, $), 0.07);
        addHullPart(n, createBeamBetween(L(p[Y], 9.6), L(p[Y + 1], 9.6), 0.16, 0.3), [0.55, 0.55, 0.55]),
          hullFlare(p[Y]) > 0.6 &&
            hullFlare(p[Y + 1]) > 0.6 &&
            addHullPart(
              r,
              createRodBetween(hullSurfacePoint(p[Y], hullTopEdge(p[Y]), $), hullSurfacePoint(p[Y + 1], hullTopEdge(p[Y + 1]), $), 0.07, 6),
            );
      }
      for (let Y = 0; Y < 3; Y++)
        addHullPart(r, createRodBetween(hullSurfacePoint(p[Y], hullTopEdge(p[Y]), $), hullSurfacePoint(p[Y + 1], hullTopEdge(p[Y + 1]), $), 0.07, 6));
      let ue = [];
      for (let Y = 18; Y <= SHIP_LENGTH - 10.4; Y += 3)
        ue.push(hullSurfacePoint(Y, deckHeight(Y), $).add(vec3(-$ * 0.12, 0, 0)));
      addRailing(t, r, ue, { h: 1.05, post: 1.5, r: 0.028 });
      let me = 4.6,
        ee = deckHeight(me) - 2.3,
        B = hullSurfacePoint(me, ee, $),
        P = hullSurfaceNormal(me, ee, $);
      addHullPart(
        r,
        createRodBetween(
          B.clone().addScaledVector(P, -0.3),
          B.clone().addScaledVector(P, 0.22),
          0.5,
          12,
          !0,
        ),
      );
      let V = (Y, L, Z) => hullSurfacePoint(Y, L, $).addScaledVector(hullSurfaceNormal(Y, L, $), Z);
      addHullPart(r, createBeamBetween(V(me, ee - 0.1, 0.34), V(me, ee - 2.3, 0.3), 0.22, 0.22, 0.03)),
        addHullPart(
          r,
          createBeamBetween(
            V(me - 0.95, ee - 2.45, 0.34),
            V(me + 0.95, ee - 2.45, 0.34),
            0.42,
            0.42,
            0.05,
          ),
        );
      for (let Y of [-0.8, 0.8])
        addHullPart(
          r,
          createBeamBetween(
            V(me + Y, ee - 2.4, 0.3),
            V(me + Y * 1.1, ee - 1.1, 0.34),
            0.5,
            0.12,
            0.02,
          ),
        );
    }
    let A = ctx.mats.label("KITTIWAKE", {
      color: "white",
      font: "sans",
      distress: 0.3,
    });
    {
      let ue = Math.min(12, 1.7 * Math.max(2, A.aspect || 6));
      addHullPart(A.material, createHullPatch(7.6, 7.6 + ue, 10.25, 10.25 + 1.7, -1, 0.014, 10, 1)),
        addHullPart(A.material, createHullPatch(7.6, 7.6 + ue, 10.25, 10.25 + 1.7, 1, 0.014, 10, 1));
    }
    let _ = ctx.mats.decal("rust_run");
    addHullPart(
      _.material,
      createHullPatch(4.6 - 0.8, 4.6 + 0.8, deckHeight(4.6) - 9.5, deckHeight(4.6) - 2.6, -1, 0.012, 2, 3),
    );
    for (let $ = 21.5; $ < SHIP_LENGTH - 11; $ += 5.5) {
      let ue = hullSurfacePoint($, SHIP_DECK_Y - 0.45, -1);
      addHullPart(
        r,
        createBoxBetween(
          ue.x - 0.04,
          ue.y - 0.09,
          ue.z - 0.3,
          ue.x + 0.01,
          ue.y + 0.09,
          ue.z + 0.3,
        ),
      );
      let me = 2.6 + 3.2 * hash2D(Math.round($ * 10), 5);
      addHullPart(
        _.material,
        createHullPatch($ - 0.45, $ + 0.45, SHIP_DECK_Y - 0.5 - me, SHIP_DECK_Y - 0.5, -1, 0.012, 1, 1),
      );
    }
    for (let $ of [6.4, SHIP_LENGTH - 7])
      for (let ue = 0; ue < 9; ue++) {
        let me = 1.6 + ue * 0.62;
        addHullPart(
          o,
          createHullPatch($, $ + (ue % 2 ? 0.28 : 0.5), me, me + 0.13, -1, 0.01, 1, 1),
          [1.1, 1.1, 1.05],
        );
      }
    addHullPart(o, createHullPatch(33, 33.9, 3.2, 3.3, -1, 0.01, 1, 1), [1.1, 1.1, 1.05]),
      addHullPart(o, createHullPatch(33.4, 33.5, 2.4, 4.1, -1, 0.01, 1, 1), [1.1, 1.1, 1.05]);
    let M = deckHeight(7);
    for (let $ of [-1, 1]) {
      addHullPart(r, createCylinderAt(0.55, 0.55, 0.9, "x", SHIP_ORIGIN_X + $ * 1.5, M + 0.75, SHIP_BOW_Z - 6.2, 12)),
        addHullPart(
          r,
          createBoxBetween(SHIP_ORIGIN_X + $ * 0.5, M, SHIP_BOW_Z - 6.9, SHIP_ORIGIN_X + $ * 2.6, M + 0.5, SHIP_BOW_Z - 5.5, 0.04),
        );
      for (let ue of [0, 0.7])
        addHullPart(
          r,
          createCylinderAt(0.16, 0.16, 0.7, "y", SHIP_ORIGIN_X + $ * 4.2, M + 0.35, SHIP_BOW_Z - 8.5 - ue, 8),
        );
    }
    let E = SHIP_BOW_Z - 10.5,
      w = M + 15;
    addHullPart(o, createCylinderAt(0.26, 0.42, 15, "y", SHIP_ORIGIN_X, M + 7.5, E, 10), [0.85, 0.8, 0.7]),
      addHullPart(
        o,
        createBoxBetween(SHIP_ORIGIN_X - 2.6, M + 10, E - 0.12, SHIP_ORIGIN_X + 2.6, M + 10.24, E + 0.12),
        [0.85, 0.8, 0.7],
      ),
      addHullPart(r, createRodBetween([SHIP_ORIGIN_X, w, E], [SHIP_ORIGIN_X, w + 2.4, E], 0.03, 5));
    for (let $ of [-1, 1])
      addHullPart(
        r,
        createRodBetween(
          [SHIP_ORIGIN_X + $ * 2.5, M + 10.2, E],
          [SHIP_ORIGIN_X + $ * 5.6, M + 0.6, E - 1.2],
          0.022,
          4,
        ),
      ),
        addHullPart(r, createRodBetween([SHIP_ORIGIN_X + $ * 2.5, M + 10.2, E], [SHIP_ORIGIN_X, w, E], 0.02, 4));
    addHullPart(r, createRodBetween([SHIP_ORIGIN_X, w, E], [SHIP_ORIGIN_X, hullTopEdge(0) + 0.3, SHIP_BOW_Z - 0.4], 0.022, 4)),
      addHullPart(r, createRodBetween([SHIP_ORIGIN_X, hullTopEdge(0), SHIP_BOW_Z - 0.3], [SHIP_ORIGIN_X, hullTopEdge(0) + 2.6, SHIP_BOW_Z - 0.15], 0.03, 5));
    let S = vec3(SHIP_ORIGIN_X, M + 2.2, E - 0.5),
      z = vec3(SHIP_ORIGIN_X + 1.2, M + 9.5, E - 11.5);
    addHullPart(o, createRodBetween(S, z, 0.2, 8, !0), [0.85, 0.8, 0.7]),
      addHullPart(r, createRodBetween(z, [SHIP_ORIGIN_X, w - 0.4, E], 0.022, 4)),
      addHullPart(r, createRodBetween(z, [z.x, SHIP_DECK_Y + 4, z.z], 0.018, 4)),
      addHullPart(
        r,
        createBoxBetween(
          z.x - 0.18,
          SHIP_DECK_Y + 3.4,
          z.z - 0.18,
          z.x + 0.18,
          SHIP_DECK_Y + 4,
          z.z + 0.18,
          0.04,
        ),
      ),
      blinkLights.add(createOctahedronLamp(SHIP_ORIGIN_X, w - 0.6, E + 0.5, 0.14), [5, 4.6, 3.8], 0);
    let H = [
      [0.62, 0.17, 0.13],
      [0.17, 0.29, 0.5],
      [0.2, 0.42, 0.3],
      [0.78, 0.36, 0.12],
      [0.8, 0.62, 0.16],
      [0.82, 0.83, 0.8],
      [0.4, 0.43, 0.47],
      [0.16, 0.42, 0.45],
    ];
    [
      [-45.6, 12.19],
      [-32.7, 12.19],
      [-22.8, 6.06],
    ].forEach(([$, ue], me) => {
      addHullPart(
        s,
        createBoxBetween(
          SHIP_ORIGIN_X - 7.7,
          SHIP_DECK_Y,
          $ - ue / 2 - 0.2,
          SHIP_ORIGIN_X + 7.7,
          SHIP_DECK_Y + 0.42,
          $ + ue / 2 + 0.2,
          0.04,
        ),
        [0.6, 0.6, 0.62],
      );
      for (let ee = 0; ee < 6; ee++) {
        let B = SHIP_ORIGIN_X + (ee - 2.5) * 2.52,
          P = me === 2 ? 2 : 2 + (hash2D(ee * 3 + me, 9) > 0.4 ? 1 : 0);
        for (let V = 0; V < P; V++) {
          let Y = SHIP_DECK_Y + 0.44 + V * 2.61,
            L = H[Math.floor(hash2D(ee * 5 + V * 13 + me * 29, 2) * H.length)];
          if (
            (addHullPart(
              o,
              createBoxBetween(
                B - 1.22,
                Y,
                $ - ue / 2,
                B + 1.22,
                Y + 2.59,
                $ + ue / 2,
                0.035,
              ),
              L,
            ),
            ee === 0)
          )
            for (let Z = $ - ue / 2 + 0.5; Z < $ + ue / 2 - 0.3; Z += 0.58)
              addHullPart(
                o,
                createBoxBetween(B - 1.24, Y + 0.15, Z - 0.1, B - 1.21, Y + 2.45, Z + 0.1),
                L,
              );
        }
      }
      for (let ee of [$ - ue / 2 - 0.45, $ + ue / 2 + 0.45]) {
        for (let B = 0; B <= 6; B++)
          addHullPart(
            r,
            createBoxBetween(
              SHIP_ORIGIN_X + (B - 3) * 2.52 - 0.05,
              SHIP_DECK_Y,
              ee - 0.05,
              SHIP_ORIGIN_X + (B - 3) * 2.52 + 0.05,
              SHIP_DECK_Y + 5.6,
              ee + 0.05,
            ),
          );
        for (let B of [SHIP_DECK_Y + 2.9, SHIP_DECK_Y + 5.6])
          addHullPart(
            r,
            createBoxBetween(SHIP_ORIGIN_X - 7.6, B - 0.05, ee - 0.12, SHIP_ORIGIN_X + 7.6, B + 0.05, ee + 0.12),
          );
      }
    });
    let q = [0.92, 0.93, 0.92],
      U = -53,
      T = -66.5;
    [
      [7.2, 13, 15.9, 0],
      [6.7, 15.9, 18.7, 0.5],
      [6.3, 18.7, 21.5, 1],
      [6.5, 21.5, 24.4, 1.5],
    ].forEach(([$, ue, me, ee], B) => {
      addHullPart(o, createBoxBetween(SHIP_ORIGIN_X - $, ue, T + ee * 0.4, SHIP_ORIGIN_X + $, me, U - ee, 0.08), q),
        addHullPart(
          o,
          createBoxBetween(
            SHIP_ORIGIN_X - $ - 0.7,
            me - 0.06,
            T + ee * 0.4 - 0.3,
            SHIP_ORIGIN_X + $ + 0.7,
            me + 0.06,
            U - ee + 1,
          ),
          [0.7, 0.72, 0.72],
        );
      let P = me + 0.06,
        V = SHIP_ORIGIN_X - $ - 0.67,
        Y = SHIP_ORIGIN_X + $ + 0.67,
        L = U - ee + 0.97,
        Z = T + ee * 0.4 - 0.27;
      if (
        (addRailing(
          t,
          a,
          [
            [V, P, Z],
            [V, P, L],
            [Y, P, L],
            [Y, P, Z],
          ],
          { h: 1.05, post: 1.6, r: 0.026 },
        ),
        B < 3)
      )
        for (let J = U - ee - 1.2, oe = 0; J > T + 1.5; J -= 1.45, oe++) {
          let fe = hash2D(oe * 3 + B * 11, 4) > 0.8;
          for (let le of [-1, 1]) {
            let R = createBoxBetween(
              SHIP_ORIGIN_X + le * ($ + 0.012) - 0.012,
              ue + 1.25,
              J - 0.33,
              SHIP_ORIGIN_X + le * ($ + 0.012) + 0.012,
              ue + 1.85,
              J + 0.33,
            );
            fe && le < 0 ? addLamp(R) : addHullPart(r, R);
          }
        }
      if (B < 3)
        for (let J = SHIP_ORIGIN_X - $ + 1, oe = 0; J < SHIP_ORIGIN_X + $ - 0.6; J += 1.5, oe++) {
          let fe = createBoxBetween(
            J - 0.33,
            ue + 1.25,
            U - ee - 0.01,
            J + 0.33,
            ue + 1.85,
            U - ee + 0.014,
          );
          hash2D(oe + B * 7, 8) > 0.84 ? addLamp(fe) : addHullPart(r, fe);
        }
    });
    let C = 21.5,
      G = U - 1.5,
      j = 6.5;
    addHullPart(r, createBoxBetween(SHIP_ORIGIN_X - j + 0.2, C + 1.3, G - 0.01, SHIP_ORIGIN_X + j - 0.2, C + 2.25, G + 0.02));
    for (let $ = SHIP_ORIGIN_X - j + 0.75, ue = 0; $ < SHIP_ORIGIN_X + j - 0.4; $ += 1.05, ue++)
      hash2D(ue, 21) > 0.62 &&
        addLamp(createBoxBetween($ - 0.44, C + 1.36, G + 0.02, $ + 0.44, C + 2.19, G + 0.03)),
        addHullPart(o, createBoxBetween($ + 0.48, C + 1.3, G, $ + 0.57, C + 2.25, G + 0.04), q);
    for (let $ of [-1, 1])
      addHullPart(
        r,
        createBoxBetween(
          SHIP_ORIGIN_X + $ * j - 0.02,
          C + 1.3,
          G - 5,
          SHIP_ORIGIN_X + $ * j + 0.02,
          C + 2.25,
          G - 0.2,
        ),
      ),
        addHullPart(
          o,
          createBoxBetween(
            SHIP_ORIGIN_X + $ * 6.4,
            C - 0.12,
            G - 3.4,
            SHIP_ORIGIN_X + $ * 8.3,
            C + 0.02,
            G + 0.9,
            0.03,
          ),
          q,
        ),
        addHullPart(o, createBoxBetween(SHIP_ORIGIN_X + $ * 8.22, C, G - 3.4, SHIP_ORIGIN_X + $ * 8.3, C + 1.1, G + 0.9), q),
        addHullPart(o, createBoxBetween(SHIP_ORIGIN_X + $ * 6.5, C, G + 0.82, SHIP_ORIGIN_X + $ * 8.3, C + 1.1, G + 0.9), q),
        addHullPart(
          r,
          createBeamBetween(
            [SHIP_ORIGIN_X + $ * 6.6, C - 2.6, G - 1.2],
            [SHIP_ORIGIN_X + $ * 8.1, C - 0.1, G - 1.2],
            0.12,
            0.12,
          ),
        ),
        blinkLights.add(
          createOctahedronLamp(SHIP_ORIGIN_X + $ * 8.25, C + 1.35, G - 0.4, 0.13),
          $ < 0 ? [0.3, 5, 1.6] : [6, 0.4, 0.3],
          0,
        );
    addLamp(createBoxBetween(SHIP_ORIGIN_X - 2.2, 24.42, G + 0.6, SHIP_ORIGIN_X - 1.6, 24.52, G + 0.9)),
      addLamp(createBoxBetween(SHIP_ORIGIN_X + 1.6, 24.42, G + 0.6, SHIP_ORIGIN_X + 2.2, 24.52, G + 0.9));
    let N = vec3(SHIP_ORIGIN_X, 24.46, -57.5);
    addHullPart(o, createCylinderAt(0.16, 0.28, 8.5, "y", N.x, N.y + 4.25, N.z, 8), q),
      addHullPart(
        o,
        createBoxBetween(N.x - 2.4, N.y + 5.2, N.z - 0.08, N.x + 2.4, N.y + 5.36, N.z + 0.08),
        q,
      ),
      addHullPart(
        o,
        createBoxBetween(N.x - 1.3, N.y + 7.3, N.z - 0.06, N.x + 1.3, N.y + 7.42, N.z + 0.06),
        q,
      ),
      addHullPart(o, createBoxBetween(N.x - 0.5, N.y + 3.2, N.z, N.x + 0.5, N.y + 3.3, N.z + 1.2), q);
    for (let $ of [-2.3, -1.2, 1.2, 2.3])
      addHullPart(
        r,
        createRodBetween(
          [N.x + $, N.y + 5.36, N.z],
          [N.x + $, N.y + 5.36 + (Math.abs($) > 2 ? 3.2 : 1.2), N.z],
          0.012,
          4,
        ),
      );
    addHullPart(r, createRodBetween([N.x, N.y + 8.5, N.z], [N.x, N.y + 10.8, N.z], 0.015, 4));
    for (let $ of [-1, 1])
      addHullPart(
        r,
        createRodBetween(
          [N.x + $ * 2.3, N.y + 5.3, N.z],
          [SHIP_ORIGIN_X + $ * 6, 24.5, T + 2],
          0.014,
          4,
        ),
      );
    blinkLights.add(createOctahedronLamp(N.x, N.y + 8.7, N.z + 0.3, 0.14), [5, 4.6, 3.8], 0),
      blinkLights.add(createOctahedronLamp(N.x, N.y + 7.6, N.z, 0.12), [8, 0.4, 0.25], 3.4, 0.6, 0.4);
    let Q = -62.6;
    addHullPart(
      o,
      createBoxBetween(SHIP_ORIGIN_X - 1.7, 24.4, Q - 2.3, SHIP_ORIGIN_X + 1.7, 29.3, Q + 2.1, 0.25),
      [0.2, 0.34, 0.5],
    ),
      addHullPart(
        o,
        createBoxBetween(SHIP_ORIGIN_X - 1.72, 27.2, Q - 2.32, SHIP_ORIGIN_X + 1.72, 28.1, Q + 2.12, 0.1),
        [0.9, 0.88, 0.8],
      ),
      addHullPart(
        o,
        createBoxBetween(SHIP_ORIGIN_X - 1.75, 29.3, Q - 2.35, SHIP_ORIGIN_X + 1.75, 30.3, Q + 2.15, 0.2),
        [0.07, 0.07, 0.08],
      );
    for (let $ of [-0.9, 0.5])
      addHullPart(r, createCylinderAt(0.28, 0.28, 1.1, "y", SHIP_ORIGIN_X, 30.7, Q + $, 10));
    let K = ctx.mats.decal("logo_b");
    addHullPart(
      K.material,
      createRotatedPlane(
        2.6,
        2.6 / Math.max(1, K.aspect || 1),
        SHIP_ORIGIN_X - 1.705,
        26.1,
        Q - 0.1,
        -Math.PI / 2,
      ),
    );
    {
      let $ = SHIP_ORIGIN_X - 7.9,
        ue = 17.5,
        me = -61,
        ee = [1.25, 0.42, 0.1],
        B = new CapsuleGeometry(1.15, 3.6, 4, 12);
      B.rotateX(Math.PI / 2),
        B.scale(0.95, 0.82, 1),
        B.translate($, ue, me),
        addHullPart(o, B, ee),
        addHullPart(
          o,
          createBoxBetween($ - 0.6, ue + 0.7, me - 1.2, $ + 0.6, ue + 1.25, me + 0.9, 0.12),
          ee,
        );
      for (let P of [-2.1, 2.1])
        addHullPart(
          r,
          createBeamBetween([SHIP_ORIGIN_X - 6.9, 15.9, me + P], [$ - 0.2, ue + 2.3, me + P], 0.16, 0.22),
        ),
          addHullPart(
            r,
            createRodBetween(
              [$ - 0.2, ue + 2.2, me + P],
              [$, ue + 0.9, me + P * 0.8],
              0.02,
              4,
            ),
          );
    }
    addHullPart(
      r,
      createRodBetween(
        [SHIP_ORIGIN_X, hullTopEdge(SHIP_LENGTH), SHIP_BOW_Z - SHIP_LENGTH + 0.4],
        [SHIP_ORIGIN_X, hullTopEdge(SHIP_LENGTH) + 3.4, SHIP_BOW_Z - SHIP_LENGTH - 0.3],
        0.03,
        5,
      ),
    ),
      blinkLights.add(createOctahedronLamp(SHIP_ORIGIN_X, hullTopEdge(SHIP_LENGTH) + 0.6, SHIP_BOW_Z - SHIP_LENGTH - 0.1, 0.1), [4, 3.7, 3], 0);
    {
      let $ = vec3(32.55, 13, -51.5),
        ue = vec3(31.4, 1.25, -38.5);
      for (let me of [-0.4, 0.4])
        addHullPart(
          a,
          createBeamBetween(
            [$.x + me, $.y - 0.1, $.z],
            [ue.x + me, ue.y - 0.1, ue.z],
            0.05,
            0.3,
          ),
        ),
          addHullPart(
            a,
            createRodBetween([$.x + me, $.y + 1, $.z], [ue.x + me, ue.y + 1, ue.z], 0.025, 5),
          ),
          addHullPart(
            a,
            createRodBetween(
              [$.x + me, $.y + 0.5, $.z],
              [ue.x + me, ue.y + 0.5, ue.z],
              0.02,
              4,
            ),
          );
      for (let me = 0; me <= 8; me++) {
        let ee = $.clone().lerp(ue, me / 8);
        for (let B of [-0.4, 0.4])
          addHullPart(
            a,
            createRodBetween(
              [ee.x + B, ee.y - 0.1, ee.z],
              [ee.x + B, ee.y + 1, ee.z],
              0.02,
              4,
            ),
          );
      }
      for (let me = 1; me < 44; me++) {
        let ee = $.clone().lerp(ue, me / 44);
        addHullPart(
          a,
          createBoxBetween(
            ee.x - 0.38,
            ee.y - 0.02,
            ee.z - 0.12,
            ee.x + 0.38,
            ee.y,
            ee.z + 0.12,
          ),
        );
      }
      addHullPart(a, createBoxBetween(31, 1.15, -38.5, 32, 1.2, -37.3)),
        addHullPart(a, createBeamBetween([31.2, 1.2, -37.9], [29.2, 0.12, -37.9], 0.8, 0.06)),
        addRailing(
          t,
          a,
          [
            [31, 1.2, -37.32],
            [32, 1.2, -37.32],
            [32, 1.2, -38.5],
          ],
          { post: 1.1 },
        ),
        addHullPart(
          r,
          createRodBetween(
            [$.x, $.y + 3.2, $.z + 4],
            [ue.x, ue.y + 1.2, ue.z + 0.3],
            0.014,
            4,
          ),
        ),
        addHullPart(r, createBeamBetween([33.2, 13.2, $.z + 4], [32.2, 16.4, $.z + 4], 0.14, 0.14));
    }
    let addMooringLine = (station, targetX, targetZ, sag) => {
      let B = hullSurfacePoint(station, targetX, -1);
      (B.x -= 0.1), addHullPart(l, createRodChain(createSaggingCable(B, targetZ, sag, 12), 0.042, 5));
      let P = createSaggingCable(B, targetZ, sag, 12)[3],
        V = createSaggingCable(B, targetZ, sag, 12)[4].clone().sub(P).normalize(),
        Y = createCylinderAt(0.42, 0.42, 0.012, "y", 0, 0, 0, 12);
      Y.applyQuaternion(new Quaternion().setFromUnitVectors(vec3(0, 1, 0), V)),
        Y.translate(P.x, P.y, P.z),
        addHullPart(a, Y),
        addHullPart(
          r,
          createBoxBetween(
            B.x - 0.12,
            B.y - 0.28,
            B.z - 0.35,
            B.x + 0.12,
            B.y + 0.28,
            B.z + 0.35,
            0.05,
          ),
        );
    };
    addMooringLine(4.4, deckHeight(4.4) + 0.55, vec3(29.2, 0.5, -12), 1.3),
      addMooringLine(4.9, deckHeight(4.9) + 0.55, vec3(29.2, 0.36, -12.1), 1.7),
      addMooringLine(1.6, deckHeight(1.6) + 0.6, vec3(29.2, 0.5, -2), 1.6),
      addMooringLine(2.2, deckHeight(2.2) + 0.6, vec3(29.2, 0.36, -2.1), 2.2),
      addMooringLine(SHIP_LENGTH - 5, deckHeight(SHIP_LENGTH - 5) + 0.6, vec3(29.2, 0.5, -82), 1.6),
      addMooringLine(SHIP_LENGTH - 9, deckHeight(SHIP_LENGTH - 9) + 0.6, vec3(29.2, 0.45, -58), 1.2);
    for (let $ of [-82, -58])
      addHullPart(r, createCylinderAt(0.2, 0.26, 0.55, "y", 29.2, 0.27, $, 10)),
        addHullPart(r, createCylinderAt(0.34, 0.3, 0.14, "y", 29.2, 0.6, $, 10));
    for (let $ of [-17.6, -37, -54])
      addHullPart(c, createCylinderAt(1.25, 1.25, 2.2, "z", 31.55, SHIP_WATERLINE_Y + 0.35, $, 14)),
        addHullPart(c, createCylinderAt(0.45, 1.25, 0.5, "z", 31.55, SHIP_WATERLINE_Y + 0.35, $ + 1.35, 14)),
        addHullPart(c, createCylinderAt(1.25, 0.45, 0.5, "z", 31.55, SHIP_WATERLINE_Y + 0.35, $ - 1.35, 14)),
        addHullPart(l, createRodBetween([31.55, SHIP_WATERLINE_Y + 1.6, $], [29.9, 0.1, $ + 0.6], 0.03, 4));
    let F = t.build({ cast: !0, recv: !0 });
    F.name = "ship";
    let X = new GeometryBatcher();
    X.add(o, createBoxBetween(-1.25, -0.07, -0.1, 1.25, 0.07, 0.1, 0.02), q),
      X.add(o, createCylinderAt(0.1, 0.12, 0.25, "y", 0, -0.18, 0, 8), q);
    let ne = X.build({ cast: !1 });
    ne.position.set(N.x, N.y + 3.62, N.z + 0.8),
      (ne.userData.noMerge = !0),
      F.add(ne);
    let re = [
      { min: [33, -5, SHIP_BOW_Z - SHIP_LENGTH], max: [49, 15, -17.5] },
      { min: [34.9, -5, -17.5], max: [47.1, 15.5, -13] },
      { min: [37.7, -5, -13], max: [44.3, 16, -9.3] },
      { min: [SHIP_ORIGIN_X - 7.2, 13, T], max: [SHIP_ORIGIN_X + 7.2, 24.4, U] },
    ];
    return {
      root: F,
      radar: ne,
      colliders: re,
      tris: t.tris,
      name: "KITTIWAKE",
    };
  }
  // 建模：橙色小艇——充气艇身、护舷、舷外机与栏杆
  function buildBoat(ctx, blinkLights) {
    let t = new GeometryBatcher(),
      n = getTintedMaterial(ctx, "plastic_grey"),
      s = getTintedMaterial(ctx, "paint_orange"),
      o = ctx.mats.get("polymer_black"),
      r = ctx.mats.get("steel_galv"),
      a = ctx.mats.get("glass"),
      l = (U, T, D) => t.add(U, T, D),
      c = [2, 2.02, 2.08],
      u = [0.5, 0.5, 0.52],
      h = [1.9, 1.7, 1.2],
      f = [
        [-3.35, 0.5, 1.03],
        [-1.6, 0.5, 1.06],
        [0.5, 0.52, 1.05],
        [1.8, 0.58, 0.93],
        [2.75, 0.68, 0.6],
        [3.3, 0.78, 0.22],
      ],
      p = [
        ...f.map((U) => vec3(U[0], U[1], U[2])),
        vec3(3.43, 0.8, 0),
        ...f
          .slice()
          .reverse()
          .map((U) => vec3(U[0], U[1], -U[2])),
      ],
      d = new CatmullRomCurve3(p, !1, "centripetal"),
      v = new TubeGeometry(d, 60, 0.27, 12, !1);
    {
      let U = v.attributes.uv,
        T = d.getLength();
      for (let D = 0; D < U.count; D++)
        U.setXY(D, U.getX(D) * T, U.getY(D) * 1.7);
    }
    l(n, v, c);
    for (let U of [-1, 1])
      l(n, createCylinderAt(0.07, 0.27, 0.42, "x", -3.56, 0.5, U * 1.03, 12), c);
    let g = 11,
      x = [];
    for (let U = 0; U < g; U++) {
      let T = 0.04 + (0.92 * U) / (g - 1),
        D = d.getPointAt(T),
        C = d.getTangentAt(T),
        G = new TorusGeometry(0.276, 0.016, 5, 14);
      G.applyQuaternion(new Quaternion().setFromUnitVectors(vec3(0, 0, 1), C)),
        G.translate(D.x, D.y, D.z),
        l(n, G, u);
      let j = vec3(D.x, 0, D.z)
        .sub(vec3(Math.min(D.x, 2.2), 0, 0))
        .normalize();
      x.push(
        D.clone()
          .addScaledVector(j, 0.2)
          .add(vec3(0, 0.2, 0)),
      );
    }
    for (let U = 0; U < g - 1; U++)
      l(n, createRodChain(createSaggingCable(x[U], x[U + 1], 0.1, 4), 0.012, 4), h);
    let y = [-3.4, -2, -0.5, 1, 2, 2.8, 3.3],
      b = [0.9, 0.93, 0.93, 0.85, 0.62, 0.34, 0.08],
      m = [0.22, 0.22, 0.24, 0.3, 0.42, 0.56, 0.7],
      A = [-0.3, -0.32, -0.33, -0.3, -0.15, 0.15, 0.62],
      _ = [],
      addHullTriangle = (p0, p1, p2) => {
        let C = p1.clone().sub(p0).cross(p2.clone().sub(p0)),
          G = p0.clone()
            .add(p1)
            .add(p2)
            .multiplyScalar(1 / 3),
          j = vec3(0, G.y - 0.45, G.z);
        Math.abs(G.x) > 3.39 && j.set(G.x, 0, 0),
          C.dot(j) < 0
            ? _.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z)
            : _.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      };
    for (let U of [-1, 1]) {
      for (let T = 0; T < y.length - 1; T++) {
        let D = vec3(y[T], A[T], 0),
          C = vec3(y[T + 1], A[T + 1], 0),
          G = vec3(y[T], m[T], U * b[T]),
          j = vec3(y[T + 1], m[T + 1], U * b[T + 1]),
          N = vec3(y[T], 0.5 + Math.max(0, m[T] - 0.22) * 0.6, U * (b[T] + 0.1)),
          Q = vec3(
            y[T + 1],
            0.5 + Math.max(0, m[T + 1] - 0.22) * 0.6,
            U * (b[T + 1] + 0.1),
          );
        addHullTriangle(D, C, j), addHullTriangle(D, j, G), addHullTriangle(G, j, Q), addHullTriangle(G, Q, N);
      }
      addHullTriangle(
        vec3(-3.4, A[0], 0),
        vec3(-3.4, m[0], U * b[0]),
        vec3(-3.4, 0.78, U * (b[0] + 0.1)),
      ),
        addHullTriangle(
          vec3(-3.4, A[0], 0),
          vec3(-3.4, 0.78, U * (b[0] + 0.1)),
          vec3(-3.4, 0.78, 0),
        );
    }
    let E = new BufferGeometry();
    E.setAttribute("position", new Float32BufferAttribute(_, 3)),
      E.computeVertexNormals(),
      l(o, E),
      l(n, createBoxBetween(-3.38, 0.2, -0.86, 2.1, 0.26, 0.86), u),
      l(n, createBoxBetween(2, 0.26, -0.62, 2.85, 0.56, 0.62, 0.05), u),
      l(o, createBoxBetween(-3.46, 0.1, -0.92, -3.34, 0.8, 0.92, 0.02)),
      l(r, createRodBetween([3.2, 0.95, -0.12], [3.2, 0.95, 0.12], 0.02, 5)),
      l(r, createRodBetween([3.2, 0.8, 0], [3.2, 0.95, 0], 0.018, 5)),
      l(s, createBoxBetween(0.3, 0.26, -0.4, 1, 1.12, 0.4, 0.05), [1, 0.9, 0.85]),
      l(o, createBeamBetween([0.28, 1.14, 0], [0.86, 1.3, 0], 0.76, 0.05));
    let w = createBoxBetween(-0.012, 0, -0.42, 0.012, 0.5, 0.42);
    w.rotateZ(0.42), w.translate(0.95, 1.2, 0), l(a, w);
    for (let U of [-0.43, 0.43])
      l(
        r,
        createRodBetween(
          [0.95, 1.2, U],
          [0.95 - Math.sin(0.42) * 0.52, 1.2 + Math.cos(0.42) * 0.52, U],
          0.016,
          5,
        ),
      );
    l(
      r,
      createRodBetween(
        [0.95 - Math.sin(0.42) * 0.52, 1.2 + Math.cos(0.42) * 0.52, -0.43],
        [0.95 - Math.sin(0.42) * 0.52, 1.2 + Math.cos(0.42) * 0.52, 0.43],
        0.016,
        5,
      ),
    );
    let S = new TorusGeometry(0.18, 0.017, 6, 18);
    S.rotateY(Math.PI / 2),
      S.rotateZ(-0.5),
      S.translate(0.2, 1.12, -0.12),
      l(o, S),
      l(r, createRodBetween([0.2, 1.12, -0.12], [0.36, 1.03, -0.12], 0.02, 5));
    for (let U of [0, 2.1, 4.2])
      l(
        r,
        createRodBetween(
          [0.2, 1.12, -0.12],
          [
            0.2 + Math.sin(-0.5) * Math.cos(U) * -0.17,
            1.12 + Math.cos(-0.5) * Math.cos(U) * 0.17,
            -0.12 + Math.sin(U) * 0.17,
          ],
          0.01,
          4,
        ),
      );
    l(o, createBoxBetween(0.34, 1.16, 0.16, 0.5, 1.34, 0.3, 0.02)),
      l(r, createRodBetween([0.42, 1.34, 0.23], [0.36, 1.48, 0.23], 0.012, 4)),
      l(r, createRodBetween([0.35, 0.3, -0.46], [0.35, 1, -0.46], 0.02, 5)),
      l(r, createRodBetween([0.35, 1, -0.46], [0.95, 1, -0.46], 0.02, 5)),
      l(r, createRodBetween([0.35, 0.3, 0.46], [0.35, 1, 0.46], 0.02, 5)),
      l(r, createRodBetween([0.35, 1, 0.46], [0.95, 1, 0.46], 0.02, 5));
    for (let U of [-0.75, -1.75])
      l(s, createBoxBetween(U - 0.28, 0.26, -0.2, U + 0.28, 0.82, 0.2, 0.05), [1, 0.9, 0.85]),
        l(o, createBoxBetween(U - 0.3, 0.82, -0.22, U + 0.3, 0.93, 0.22, 0.04)),
        l(o, createBoxBetween(U - 0.34, 0.93, -0.2, U - 0.26, 1.2, 0.2, 0.03)),
        l(r, createRodBetween([U + 0.3, 0.6, -0.22], [U + 0.3, 1.02, 0], 0.014, 4)),
        l(r, createRodBetween([U + 0.3, 0.6, 0.22], [U + 0.3, 1.02, 0], 0.014, 4));
    l(s, createBoxBetween(-2.9, 0.26, -0.3, -2.45, 0.58, 0.3, 0.04), [1.1, 0.5, 0.4]);
    for (let U of [-1, 1])
      l(r, createRodBetween([-2.95, 0.55, U * 0.9], [-2.75, 2, U * 0.55], 0.03, 6)),
        l(r, createRodBetween([-2.3, 0.55, U * 0.9], [-2.75, 1.3, U * 0.7], 0.022, 5));
    l(r, createRodBetween([-2.75, 2, -0.55], [-2.75, 2, 0.55], 0.03, 6)),
      l(r, createBoxBetween(-2.88, 2, -0.2, -2.62, 2.04, 0.2)),
      l(o, createCylinderAt(0.05, 0.06, 0.1, "y", -2.75, 2.09, 0, 8)),
      l(o, createRodBetween([-2.75, 2, 0.42], [-2.9, 3.7, 0.46], 0.011, 5)),
      l(o, createCylinderAt(0.16, 0.16, 0.07, "y", -2.75, 2.1, -0.36, 10));
    for (let U of [-0.36, 0.36])
      l(r, createBoxBetween(-3.6, 0.42, U - 0.16, -3.44, 0.78, U + 0.16, 0.02)),
        l(o, createBoxBetween(-4.1, 0.78, U - 0.23, -3.48, 1.4, U + 0.23, 0.09)),
        l(n, createBoxBetween(-4.11, 1, U - 0.235, -3.47, 1.05, U + 0.235), [1.4, 1.4, 1.4]),
        l(o, createBoxBetween(-3.92, -0.05, U - 0.085, -3.62, 0.8, U + 0.085, 0.03)),
        l(o, createBoxBetween(-4.02, -0.52, U - 0.04, -3.6, -0.05, U + 0.04, 0.015)),
        l(o, createCylinderAt(0.07, 0.03, 0.42, "x", -3.9, -0.3, U, 8));
    for (let U of [-1.8, 0.4, 1.7])
      l(s, createCylinderAt(0.11, 0.11, 0.42, "y", U, 0.42, 1.36, 10), [1.2, 0.8, 0.7]),
        l(n, createRodBetween([U, 0.63, 1.36], [U, 0.78, 1.12], 0.01, 4), h);
    let z = new TorusGeometry(0.26, 0.07, 6, 16);
    z.rotateY(Math.PI / 2),
      z.translate(1.02, 0.72, 0),
      l(s, z, [1.3, 0.6, 0.45]);
    let H = t.build({ cast: !0, recv: !0 });
    blinkLights.add(createOctahedronLamp(-2.75, 2.2, 0, 0.075), [1.2, 11, 3.2], 1.5, 0, 0.1),
      blinkLights.add(createOctahedronLamp(-2.75, 2.2, 0, 0.074), [1.2, 11, 3.2], 1.5, 0.2, 0.08);
    let O = blinkLights.build();
    O && ((O.frustumCulled = !1), H.add(O));
    let q = new Group();
    return (
      (q.name = "boat"),
      q.add(H),
      (q.userData.noMerge = !0),
      { root: q, hullGrp: H, tris: t.tris }
    );
  }
  // 天际线配色表：把十六进制色按参考色归一化成顶点色系数
  var TINT_REFERENCE_COLOR = new Color(12172214),
    normalizeColor = (hexColor, gain = 1) => {
      let t = new Color(hexColor);
      return [(gain * t.r) / TINT_REFERENCE_COLOR.r, (gain * t.g) / TINT_REFERENCE_COLOR.g, (gain * t.b) / TINT_REFERENCE_COLOR.b];
    },
    BUILDING_PALETTE = [
      8200729, 8200729, 6957596, 2047846, 2047846, 2307146, 2906692, 2906692,
      11751962, 9062946, 5922920, 5922920, 4146764, 2055523, 10121752, 8093308,
      6962468, 6962468,
    ].map((i) => normalizeColor(i)),
    WINDOW_PALETTE = [
      [0.6, 0.17, 0.13],
      [0.17, 0.29, 0.5],
      [0.2, 0.42, 0.3],
      [0.76, 0.35, 0.12],
      [0.78, 0.6, 0.16],
      [0.8, 0.81, 0.78],
      [0.4, 0.43, 0.47],
      [0.16, 0.42, 0.45],
      [0.55, 0.2, 0.15],
      [0.2, 0.3, 0.45],
    ],
    smoothstep01 = (edge0, edge1, x) => {
      let n = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
      return n * n * (3 - 2 * n);
    },
    distanceFade = (x, z) => 1 - 0.6 * smoothstep01(38, 160, Math.hypot(x + 5, z));
  // 建模：远景天际线——仓库楼群、龙门吊、烟囱、海面与远处集装箱吊
  // 内部：addCityPart() 批量加几何、addQuad()/addWindowQuad() 写面片、addWarehouse() 生成厂房、addGantryCrane() 生成龙门吊
  function buildSkyline(ctx, blinkLights) {
    let t = new GeometryBatcher(),
      n = getTintedMaterial(ctx, "paint_white"),
      s = createRng(90417),
      o = [5.5, 4.3, 2.9],
      r = [8, 0.45, 0.25],
      a = [0, 0, 0];
    function shadeBuildingColor(baseColor, x, y, z, brightness = 1) {
      let Q = valueNoise3D(x * 0.23 + 1.3, y * 0.31, z * 0.23 + 7.7),
        K = valueNoise3D(x * 1.9 + 4.1, 2.2, z * 1.9 + 9.3),
        ie = brightness * (0.56 + 0.52 * Q) * (0.62 + 0.38 * smoothstep01(0, 5, y)),
        F = baseColor[0] * ie,
        X = baseColor[1] * ie,
        ne = baseColor[2] * ie;
      if (K > 0.62) {
        let re = Math.min(1, (K - 0.62) / 0.3) * 0.55;
        (F = F * (1 - re) + 0.3 * re * ie),
          (X = X * (1 - re) + 0.15 * re * ie),
          (ne = ne * (1 - re) + 0.08 * re * ie);
      }
      return (a[0] = F), (a[1] = X), (a[2] = ne), a;
    }
    let addCityPart = (geometry, tint) => {
        if (!geometry) return;
        if (Array.isArray(geometry)) {
          for (let Q of geometry) addCityPart(Q, tint);
          return;
        }
        geometry.computeBoundingBox();
        let G = geometry.boundingBox,
          j = (G.min.x + G.max.x) / 2,
          N = (G.min.z + G.max.z) / 2;
        if (j < 31) {
          let Q = distanceFade(j, N);
          paintVertexColors(geometry, (K, ie, F) => shadeBuildingColor(tint, K, ie, F, Q)), t.add(n, geometry);
        } else t.add(n, geometry, tint);
      },
      u = [],
      h = [],
      f = [],
      p = [];
    function addQuad(corners, normal, colors) {
      let j = corners[1][0] - corners[0][0],
        N = corners[1][1] - corners[0][1],
        Q = corners[1][2] - corners[0][2],
        K = corners[3][0] - corners[0][0],
        ie = corners[3][1] - corners[0][1],
        F = corners[3][2] - corners[0][2],
        X =
          (N * F - Q * ie) * normal[0] +
            (Q * K - j * F) * normal[1] +
            (j * ie - N * K) * normal[2] <
          0;
      for (let ne of X ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
        let re = corners[ne];
        u.push(re[0], re[1], re[2]),
          h.push(normal[0], normal[1], normal[2]),
          p.push(colors[ne][0], colors[ne][1], colors[ne][2]),
          Math.abs(normal[0]) > 0.5
            ? f.push(re[2], re[1])
            : Math.abs(normal[1]) > 0.5
              ? f.push(re[0], re[2])
              : f.push(re[0], re[1]);
      }
    }
    let v = [0.866, -0.5, 0],
      shadeQuadCorners = (D, C, G) => C.map((j) => shadeBuildingColor(D, j[0], j[1], j[2], G).slice());
    function addBuildingFaces(x0, y0, z0, x1, y1, z1, palette, faces, brightness) {
      for (let X of faces) {
        let ne, re;
        X === "E"
          ? ((ne = [
              [x1, y0, z1],
              [x1, y0, z0],
              [x1, y1, z0],
              [x1, y1, z1],
            ]),
            (re = v))
          : X === "W"
            ? ((ne = [
                [x0, y0, z0],
                [x0, y0, z1],
                [x0, y1, z1],
                [x0, y1, z0],
              ]),
              (re = [-1, 0, 0]))
            : X === "S"
              ? ((ne = [
                  [x0, y0, z1],
                  [x1, y0, z1],
                  [x1, y1, z1],
                  [x0, y1, z1],
                ]),
                (re = [0, 0, 1]))
              : X === "N"
                ? ((ne = [
                    [x1, y0, z0],
                    [x0, y0, z0],
                    [x0, y1, z0],
                    [x1, y1, z0],
                  ]),
                  (re = [0, 0, -1]))
                : ((ne = [
                    [x0, y1, z1],
                    [x1, y1, z1],
                    [x1, y1, z0],
                    [x0, y1, z0],
                  ]),
                  (re = [0, 1, 0]));
        let $ = shadeQuadCorners(palette, ne, X === "T" ? brightness * 0.8 : X === "E" ? brightness * 0.92 : brightness);
        if (y0 < 0.1 && X !== "T")
          for (let ue of [0, 1])
            ($[ue][0] *= 0.62), ($[ue][1] *= 0.62), ($[ue][2] *= 0.62);
        addQuad(ne, re, $);
      }
    }
    function addWarehouse(
      xPositions,
      zStart,
      zEnd,
      { faceZ: faceZ = 0, ribs: ribs = !1, doorRows: doorRows = 0, west: west = !1 } = {},
    ) {
      let ie = Math.sign(zEnd - zStart),
        F = [];
      for (let re = zStart, $ = 1; ie > 0 ? re < zEnd : re > zEnd; re += ie * 2.62, $++)
        $ % 8 >= 1 &&
          $ % 8 <= 5 &&
          F.push({ z: re, blk: Math.floor($ / 8), first: $ === 1 });
      let X = F.map((re, $) =>
          xPositions.map((ue, me) => {
            let ee = valueNoise3D(ue * 0.04 + 3, 0.5, re.z * 0.05 + 7),
              B = Math.round(0.2 + ee * 5.4 + (s() - 0.5) * 2.4);
            return (
              !re.first && s() < 0.07 && (B = 0),
              Math.max(re.first ? 2 : 0, Math.min(5, B))
            );
          }),
        ),
        ne = (re, $) =>
          re >= 0 && re < F.length && $ >= 0 && $ < xPositions.length ? X[re][$] : 0;
      F.forEach((re, $) =>
        xPositions.forEach((ue, me) => {
          let ee = X[$][me],
            B = re.z,
            P = distanceFade(ue, B),
            V = Math.max(Math.abs(ue + 5) - 40, Math.abs(B) - 30) < 55,
            Y = (L, Z) =>
              L >= 0 &&
              Z >= 0 &&
              L < xPositions.length &&
              Z < xPositions.length &&
              Math.abs(xPositions[L] - xPositions[Z]) < 12.8;
          for (let L = 0; L < ee; L++) {
            let Z = BUILDING_PALETTE[Math.floor(s() * BUILDING_PALETTE.length)],
              J = 0.6 + s() * 0.4,
              oe = [Z[0] * J, Z[1] * J, Z[2] * J],
              fe = (s() - 0.5) * 0.22,
              le = L * 2.6,
              R = ue - 6.095 + fe,
              I = ue + 6.095 + fe,
              se = B - 1.22,
              ae = B + 1.22,
              k = L === ee - 1 ? "T" : "";
            for (let Pe of faceZ ? [faceZ] : [-1, 1]) {
              let Re = $ + Pe * ie;
              (!(
                Re >= 0 &&
                Re < F.length &&
                F[Re].blk === re.blk &&
                Math.abs(F[Re].z - B) < 2.7
              ) ||
                ne(Re, me) <= L) &&
                (k += Pe > 0 ? "S" : "N");
            }
            let ce = !(Y(me - 1, me) && ne($, me - 1) > L),
              ve = !west && !(Y(me + 1, me) && ne($, me + 1) > L);
            ce && (k += "E"),
              ve && (k += "W"),
              addBuildingFaces(R, le, se, I, le + 2.59, ae, oe, k, P);
            let _e = [oe[0] * 0.45, oe[1] * 0.45, oe[2] * 0.45],
              Te = re.first
                ? faceZ
                  ? [faceZ]
                  : [-ie]
                : me === 0 && west && Math.abs(B) < 42
                  ? [-1, 1].filter((Pe) => k.includes(Pe > 0 ? "S" : "N"))
                  : [];
            if (ribs && V && Te.length) {
              let Pe = Te;
              for (let Re of Pe) {
                let Fe = Re > 0 ? ae : se,
                  ze = Fe + Re * 0.04,
                  We = le + 0.15,
                  Ne = le + 2.45,
                  dt = [oe[0] * 0.7, oe[1] * 0.7, oe[2] * 0.7];
                for (let xe = R + 0.24; xe < I - 0.3; xe += 0.575) {
                  let Ie = [
                    [xe, We, Fe],
                    [xe + 0.07, We, ze],
                    [xe + 0.07, Ne, ze],
                    [xe, Ne, Fe],
                  ];
                  addQuad(Ie, [-0.5, 0, Re * 0.87], shadeQuadCorners(dt, Ie, P)),
                    (Ie = [
                      [xe + 0.07, We, ze],
                      [xe + 0.2, We, ze],
                      [xe + 0.2, Ne, ze],
                      [xe + 0.07, Ne, ze],
                    ]),
                    addQuad(Ie, [0, 0, Re], shadeQuadCorners(oe, Ie, P)),
                    (Ie = [
                      [xe + 0.2, We, ze],
                      [xe + 0.27, We, Fe],
                      [xe + 0.27, Ne, Fe],
                      [xe + 0.2, Ne, ze],
                    ]),
                    addQuad(Ie, [0.42, -0.52, Re * 0.74], shadeQuadCorners(dt, Ie, P));
                }
                for (let [xe, Ie] of [
                  [le, We],
                  [Ne, le + 2.59],
                ]) {
                  let Be = Fe + Re * 0.05,
                    Xe = [
                      [R, xe, Be],
                      [I, xe, Be],
                      [I, Ie, Be],
                      [R, Ie, Be],
                    ];
                  addQuad(Xe, [0, 0, Re], shadeQuadCorners(_e, Xe, P)),
                    (Xe = [
                      [R, Ie, Fe],
                      [I, Ie, Fe],
                      [I, Ie, Be],
                      [R, Ie, Be],
                    ]),
                    addQuad(Xe, [0, xe === le ? 1 : -1, 0], shadeQuadCorners(_e, Xe, P));
                }
              }
            }
            if (ce && me === 0 && $ < doorRows) {
              let Pe = I + 0.03,
                Re = I + 0.055,
                Fe = le + 0.02,
                ze = le + 2.57,
                We = [oe[0] * 0.55, oe[1] * 0.55, oe[2] * 0.55],
                Ne = [0.34, 0.35, 0.36],
                dt = [0.05, 0.05, 0.055],
                addWindowQuad = (wallX, zMin, zMax, yMin, yMax, shades) => {
                  let Oe = [
                      [wallX, yMin, zMax],
                      [wallX, yMin, zMin],
                      [wallX, yMax, zMin],
                      [wallX, yMax, zMax],
                    ],
                    pt = shadeQuadCorners(shades, Oe, P);
                  if (le < 0.1 && yMin < 0.3)
                    for (let ut of [0, 1])
                      (pt[ut][0] *= 0.62),
                        (pt[ut][1] *= 0.62),
                        (pt[ut][2] *= 0.62);
                  addQuad(Oe, v, pt);
                };
              addWindowQuad(Pe, se, se + 0.13, Fe, ze, We),
                addWindowQuad(Pe, ae - 0.13, ae, Fe, ze, We),
                addWindowQuad(Pe, se + 0.13, ae - 0.13, le, le + 0.15, We),
                addWindowQuad(Pe, se + 0.13, ae - 0.13, le + 2.44, le + 2.59, We),
                addWindowQuad(Pe, B - 0.018, B + 0.018, le + 0.15, le + 2.44, dt);
              for (let Ie of [-0.8, -0.32, 0.32, 0.8])
                if (
                  (addWindowQuad(
                    Re,
                    B + Ie - 0.024,
                    B + Ie + 0.024,
                    le + 0.1,
                    le + 2.5,
                    Ne,
                  ),
                  $ < 8)
                )
                  for (let Be of [0.32, 2.2])
                    addWindowQuad(
                      Re + 0.01,
                      B + Ie - 0.07,
                      B + Ie + 0.07,
                      le + Be,
                      le + Be + 0.09,
                      Ne,
                    );
              if ($ < 8)
                for (let Ie of [-0.56, 0.56])
                  addWindowQuad(
                    Re + 0.01,
                    B + Ie - 0.1,
                    B + Ie + 0.1,
                    le + 1.02,
                    le + 1.1,
                    Ne,
                  );
            }
          }
        }),
      );
    }
    let b = [-48.6, -61.2, -73.8, -90.5, -103.1, -115.7, -132, -144.6],
      m = [6.3, -6.3, -18.9, -31.5];
    addWarehouse(b, -4.9, -112, { ribs: !0, doorRows: 15, west: !0 }),
      addWarehouse(b, 14.9, 112, { ribs: !0, doorRows: 15, west: !0 }),
      addWarehouse(m, -36.4, -110, { faceZ: 1, ribs: !0, doorRows: 12 }),
      addWarehouse(m, 33.9, 110, { faceZ: -1, ribs: !0, doorRows: 12 });
    {
      let D = new BufferGeometry();
      D.setAttribute("position", new Float32BufferAttribute(u, 3)),
        D.setAttribute("normal", new Float32BufferAttribute(h, 3)),
        D.setAttribute("uv", new Float32BufferAttribute(f, 2)),
        D.setAttribute("color", new Float32BufferAttribute(p, 3)),
        t.add(n, D);
    }
    let A = normalizeColor(5922920, 0.85),
      _ = [0.1, 0.1, 0.11],
      M = [0.36, 0.38, 0.4],
      E = normalizeColor(12159516, 0.5),
      w = [0.5, 0.5, 0.48];
    function addGantryCrane(centerX, centerZ, color, cabinZOffset, mastDrop) {
      let K = color,
        ie = [K[0] * 0.7, K[1] * 0.7, K[2] * 0.7];
      for (let ne of [-1, 1]) {
        let re = centerZ + ne * 9.5;
        for (let $ of [-1, 1]) {
          let ue = centerX + $ * 7.5;
          addCityPart(createBoxBetween(ue - 1.5, 0.05, re - 0.28, ue + 1.5, 0.8, re + 0.28), _),
            addCityPart(createBoxBetween(ue - 0.36, 0.8, re - 0.36, ue + 0.36, 19.1, re + 0.36), K),
            addCityPart(createBoxBetween(ue - 0.4, 6.9, re - 0.4, ue + 0.4, 7, re + 0.4), ie),
            addCityPart(createBoxBetween(ue - 0.4, 13, re - 0.4, ue + 0.4, 13.1, re + 0.4), ie),
            addCityPart(createBeamBetween([ue, 14.6, re], [ue - $ * 3.2, 19.1, re], 0.3, 0.3), K);
        }
        addCityPart(createBoxBetween(centerX - 9.3, 0.8, re - 0.4, centerX + 9.3, 1.7, re + 0.4), K),
          addCityPart(createBoxBetween(centerX - 8, 19.1, re - 0.45, centerX + 8, 20.2, re + 0.45), K),
          addCityPart(createBoxBetween(centerX - 2.4, 1.7, re - 0.5, centerX + 0.8, 3.9, re + 0.5), w);
      }
      for (let ne of [-1, 1]) {
        let re = centerX + ne * 3.3,
          $ = centerZ - 9.5 - 5.6,
          ue = centerZ + 9.5 + 5.6;
        addCityPart(createBoxBetween(re - 0.45, 20.2, $, re + 0.45, 21.9, ue), K);
        for (let me = $ + 4.4; me < ue; me += 4.4)
          addCityPart(createBoxBetween(re - 0.48, 20.15, me - 0.03, re + 0.48, 21.95, me + 0.03), ie);
        addCityPart(createBoxBetween(re + ne * 0.45, 21, $, re + ne * 1.3, 21.05, ue), M),
          addRailing(
            z,
            null,
            [
              [re + ne * 1.27, 21.05, $],
              [re + ne * 1.27, 21.05, ue],
            ],
            { post: 3.3, r: 0.035, mid: !1, tint: E },
          ),
          addCityPart(
            createRodBetween([re, 20.2, centerZ - 9.5 + 0.5], [re, 20.2, centerZ + 9.5 - 0.5], 0.05, 4),
            _,
          );
      }
      for (let ne of [centerZ - 9.5 - 5.4, centerZ + 9.5 + 5.4])
        addCityPart(createBoxBetween(centerX - 3.3, 20.4, ne - 0.25, centerX + 3.3, 21.7, ne + 0.25), K);
      let F = centerZ + cabinZOffset;
      addCityPart(createBoxBetween(centerX - 4, 21.9, F - 2.3, centerX + 4, 22.5, F + 2.3), E),
        addCityPart(createBoxBetween(centerX - 2.6, 22.5, F - 1.7, centerX + 1.4, 24.5, F + 1.7), w),
        addCityPart(createBoxBetween(centerX + 1.8, 22.5, F - 0.9, centerX + 3.4, 23.3, F + 0.9), _),
        addCityPart(createBoxBetween(centerX + 4.3, 17.2, F - 1, centerX + 6.1, 19.5, F + 1), w),
        addCityPart(
          createBoxBetween(centerX + 4.4, 18.2, F - 1.02, centerX + 6.12, 19.2, F + 1.02),
          [0.08, 0.1, 0.12],
        );
      for (let ne of [-0.9, 0.9])
        addCityPart(createBoxBetween(centerX + 4.9, 19.5, F + ne - 0.06, centerX + 5.05, 21.9, F + ne + 0.06), E);
      let X = 21.9 - mastDrop;
      for (let ne of [-2.2, 2.2])
        for (let re of [-0.8, 0.8])
          addCityPart(createRodBetween([centerX + ne, 21.9, F + re], [centerX + ne, X, F + re], 0.03, 4), _);
      addCityPart(createBoxBetween(centerX - 6.1, X - 0.4, F - 1.22, centerX + 6.1, X, F + 1.22), E),
        addCityPart(createBoxBetween(centerX - 2.4, X, F - 0.9, centerX + 2.4, X + 0.5, F + 0.9), E);
      {
        let ne = centerX - 7.5 - 0.5,
          re = centerZ - 9.5,
          $ = 1.7;
        for (let ue = 0; ue < 6; ue++) {
          let me = re + (ue % 2 ? 1.9 : -1.9),
            ee = re + (ue % 2 ? -1.9 : 1.9),
            B = Math.min(20.2, $ + 3.1);
          addCityPart(createBeamBetween([ne, $, me], [ne, B, ee], 0.6, 0.07), M),
            addCityPart(createRodBetween([ne - 0.3, $ + 1, me], [ne - 0.3, B + 1, ee], 0.03, 4), E),
            addCityPart(createBoxBetween(ne - 0.35, B - 0.04, ee - 0.5, ne + 0.35, B, ee + 0.5), M),
            ($ = B);
        }
        for (let ue of [-2.4, 2.4])
          addCityPart(
            createBoxBetween(ne - 0.3, 1.7, re + ue - 0.05, ne - 0.2, 20.2, re + ue + 0.05),
            ie,
          );
        addCityPart(createCylinderAt(1.25, 1.25, 0.5, "z", centerX + 7.5 + 1, 3.3, centerZ + 9.5 + 0.9, 12), E),
          addCityPart(createCylinderAt(0.5, 0.5, 0.6, "z", centerX + 7.5 + 1, 3.3, centerZ + 9.5 + 0.9, 8), _);
        for (let ue of [-0.2, 0.2])
          addCityPart(
            createRodBetween(
              [centerX + 7.5 + 0.45, 1.7, centerZ - 9.5 + ue],
              [centerX + 7.5 + 0.45, 20.2, centerZ - 9.5 + ue],
              0.022,
              4,
            ),
            M,
          );
      }
      blinkLights.add(createOctahedronLamp(centerX, 24.9, F, 0.3), r, 3.1, s(), 0.4),
        blinkLights.add(createOctahedronLamp(centerX - 3.3, 20, centerZ - 4, 0.24), o, 0),
        blinkLights.add(createOctahedronLamp(centerX + 3.3, 20, centerZ + 4, 0.24), o, 0);
    }
    let z = { add: (D, C, G) => addCityPart(C, G) },
      H = normalizeColor(6172444, 0.7);
    addGantryCrane(-61, -52.06, A, -3, 4.5),
      addGantryCrane(-61, 41.1, H, 5, 9),
      addGantryCrane(-103, -10.14, H, 2, 3),
      addGantryCrane(-6, -62.6, A, -6, 7),
      addGantryCrane(-12, 60.1, A, 4, 5);
    for (let [D, C, G] of [
      [-67.5, -22, 32],
      [-67.5, 31, 32],
      [-122, 4, 34],
      [-12.6, -53, 30],
      [-12.6, 51, 30],
      [-140, -84, 34],
      [-96, 96, 34],
      [0.2, -100, 30],
      [-52, -70, 28],
      [-55, 72, 28],
      [-84, -45, 34],
      [-84, 24, 34],
      [-25, -84, 30],
      [-28, 90, 30],
      [-120, 60, 34],
      [10.5, 49, 26],
    ]) {
      addCityPart(createCylinderAt(0.14, 0.3, G, "y", D, G / 2, C, 6), M),
        addCityPart(createCylinderAt(1.5, 1.5, 0.18, "y", D, G - 0.5, C, 8), _);
      for (let [j, N] of [
        [-1.4, 0],
        [1.4, 0],
        [0, -1.4],
        [0, 1.4],
      ])
        addCityPart(
          createBoxBetween(
            D + j - 0.25,
            G - 0.95,
            C + N - 0.25,
            D + j + 0.25,
            G - 0.6,
            C + N + 0.25,
          ),
          _,
        ),
          blinkLights.add(createOctahedronLamp(D + j, G - 1.05, C + N, 0.2), o, 0);
    }
    for (let [D, C, G] of [
      [-158, -30, 62],
      [-76, -128, 48],
      [-150, 104, 54],
    ]) {
      let N = [
        [-1.1, -0.638],
        [1.1, -0.638],
        [0, 1.265],
      ];
      for (let [Q, K] of N)
        addCityPart(
          createRodBetween([D + Q, 0, C + K], [D + Q * 0.3, G, C + K * 0.3], 0.07, 4),
          [0.42, 0.14, 0.1],
        );
      for (let Q = 3, K = 0; Q < G; Q += 6, K++)
        for (let ie = 0; ie < 3; ie++) {
          let F = N[ie],
            X = N[(ie + 1) % 3],
            ne = 1 - (0.7 * Q) / G,
            re = 1 - (0.7 * Math.min(G, Q + 6)) / G;
          addCityPart(
            createRodBetween(
              [D + F[0] * ne, Q, C + F[1] * ne],
              [D + X[0] * re, Math.min(G, Q + 6), C + X[1] * re],
              0.04,
              3,
            ),
            K % 2 ? w : [0.42, 0.14, 0.1],
          );
        }
      for (let Q of [0.5, 2.6, 4.7])
        addCityPart(
          createRodBetween(
            [D, G * 0.72, C],
            [D + Math.cos(Q) * G * 0.5, 0, C + Math.sin(Q) * G * 0.5],
            0.025,
            3,
          ),
          _,
        );
      addCityPart(createRodBetween([D, G, C], [D, G + 5, C], 0.04, 3), _),
        addCityPart(createBoxBetween(D - 0.9, G * 0.8, C - 0.25, D + 0.9, G * 0.8 + 1.6, C + 0.25), w),
        blinkLights.add(createOctahedronLamp(D, G + 0.4, C, 0.35), r, 2.4, s(), 0.45),
        blinkLights.add(createOctahedronLamp(D, G * 0.55, C, 0.28), r, 0);
    }
    for (let [D, C, G] of [
      [-178, -70, 90],
      [-182, 40, 110],
      [-60, -150, 70],
      [-70, 150, 80],
    ]) {
      let j = Math.abs(C) > 120,
        N = (Q, K, ie, F, X, ne, re) =>
          addCityPart(
            j
              ? createBoxBetween(D + Q, K, C + ie, D + F, X, C + ne)
              : createBoxBetween(D + ie, K, C + Q, D + ne, X, C + F),
            re,
          );
      N(-G / 2, 0, -16, G / 2, 9.5, 16, [0.2, 0.22, 0.24]),
        N(-G / 2, 9.5, -16.4, G / 2, 9.9, 16.4, [0.12, 0.12, 0.13]),
        N(-G / 2, 9.9, -10, G / 2, 12.2, 10, [0.17, 0.18, 0.2]),
        N(-G / 2 + 4, 12.2, -1.2, G / 2 - 4, 13.3, 1.2, [0.13, 0.13, 0.14]);
      for (let Q = -G / 2 + 6; Q < G / 2 - 5; Q += 12)
        N(Q - 0.25, 0, -16.2, Q + 0.25, 9.5, 16.2, [0.13, 0.14, 0.15]),
          (Q | 0) % 3 === 0 &&
            N(Q + 2, 0, -16.1, Q + 8, 6.2, 16.1, [0.06, 0.06, 0.07]);
    }
    buildCrane(ctx, blinkLights, { into: t, mat: n, dz: 66 }),
      [
        [-132, 1.15, !0, [0.14, 0.17, 0.21]],
        [-186, 1.25, !1, [0.14, 0.17, 0.21]],
        [-252, 1.35, !0, [0.26, 0.12, 0.06]],
        [-336, 1.4, !1, [0.26, 0.12, 0.06]],
        [128, 1.2, !1, [0.14, 0.17, 0.21]],
        [182, 1.3, !0, [0.24, 0.25, 0.27]],
        [250, 1.4, !1, [0.24, 0.25, 0.27]],
        [330, 1.45, !0, [0.26, 0.12, 0.06]],
      ].forEach(([D, C, G, j], N) => {
        let Q = buildPortCrane(t, n, 23.5, D, { s: C, up: G, tint: j });
        blinkLights.add(
          createOctahedronLamp(Q[0], Q[1], Q[2], 0.45 * C),
          r,
          2.6 + (N % 3) * 0.35,
          N * 0.37,
          0.45,
        );
      }),
      addCityPart(createBoxBetween(-230, -1.6, -384, 30, -0.12, 425), [0.24, 0.24, 0.25]);
    function addDistantBlock(x0, x1, z0, z1, height, color, centerRatio) {
      addCityPart(createBoxBetween(x0, -1.6, z0, x1, height, z1), color),
        addCityPart(createBoxBetween(x0, -1.6, z0, x1, 0.8, z1 + 0.2), [0.42, 0.14, 0.1]);
      let ie = z1 - z0,
        F = z0 + ie * centerRatio;
      addCityPart(createBoxBetween(x0 + 2, height, F - 7, x1 - 2, height + 17, F + 7), [0.72, 0.73, 0.7]),
        addCityPart(
          createBoxBetween((x0 + x1) / 2 - 3, height + 17, F - 5, (x0 + x1) / 2 + 3, height + 24, F + 1),
          [0.2, 0.3, 0.45],
        );
      for (let X = z0 + 12; X < z1 - 12; X += 13.2) {
        if (Math.abs(X + 6 - F) < 14) continue;
        let ne = 2.6 * (2 + Math.floor(s() * 4)),
          re = WINDOW_PALETTE[Math.floor(s() * WINDOW_PALETTE.length)];
        addCityPart(createBoxBetween(x0 + 1, height, X, (x0 + x1) / 2 - 0.2, height + ne, X + 12.2), re);
        let $ = WINDOW_PALETTE[Math.floor(s() * WINDOW_PALETTE.length)];
        addCityPart(
          createBoxBetween(
            (x0 + x1) / 2 + 0.2,
            height,
            X,
            x1 - 1,
            height + ne - 2.6 * Math.floor(s() * 2),
            X + 12.2,
          ),
          $,
        );
      }
      blinkLights.add(createOctahedronLamp((x0 + x1) / 2, height + 26, F, 0.4), [5, 4.6, 3.8], 0);
    }
    addDistantBlock(34, 62, 140, 345, 11, [0.1, 0.13, 0.2], 0.78),
      addDistantBlock(34, 58, -360, -205, 10, [0.2, 0.08, 0.07], 0.2),
      addDistantBlock(470, 500, -190, -40, 9, [0.12, 0.14, 0.17], 0.8),
      addDistantBlock(600, 626, 160, 300, 9, [0.16, 0.12, 0.1], 0.2);
    for (let D = 340; D > -66; D -= 12.5) {
      let C = 398 + Math.sin(D * 0.013) * 14 + (s() - 0.5) * 3,
        G = createBoxBetween(-6 - s() * 2, -1.6, -7, 6 + s() * 2, 2.2 + s() * 1.2, 7);
      G.rotateY((s() - 0.5) * 0.5),
        G.translate(C, 0, D),
        addCityPart(G, [0.2, 0.21, 0.22]);
    }
    {
      addCityPart(createCylinderAt(5, 6, 3.6, "y", 399, 0.2, -72, 10), [0.3, 0.3, 0.3]),
        addCityPart(createCylinderAt(1.7, 2.3, 6, "y", 399, 5, -72, 10), [0.85, 0.85, 0.82]),
        addCityPart(createCylinderAt(1.5, 1.7, 4, "y", 399, 10, -72, 10), [0.62, 0.14, 0.1]),
        addCityPart(createCylinderAt(1.3, 1.5, 4, "y", 399, 14, -72, 10), [0.85, 0.85, 0.82]),
        addCityPart(createCylinderAt(2, 2, 0.3, "y", 399, 16.1, -72, 10), [0.3, 0.3, 0.32]),
        addCityPart(createCylinderAt(0.2, 1.3, 1.2, "y", 399, 18.9, -72, 8), [0.25, 0.25, 0.27]);
      for (let G = 0; G < 6; G++) {
        let j = (G / 6) * 6.283;
        addCityPart(
          createBoxBetween(
            399 + Math.cos(j) * 1.1 - 0.06,
            16.2,
            -72 + Math.sin(j) * 1.1 - 0.06,
            399 + Math.cos(j) * 1.1 + 0.06,
            18.3,
            -72 + Math.sin(j) * 1.1 + 0.06,
          ),
          [0.25, 0.25, 0.27],
        );
      }
      blinkLights.add(createOctahedronLamp(399, 17.25, -72, 0.85), [16, 15, 11], 6, 0, 0.09);
    }
    let U = 300;
    addCityPart(createBoxBetween(U - 330, -1.6, -520, U + 330, 2.2, -430), [0.16, 0.17, 0.18]);
    for (let [D, C, G, j] of [
      [-150, -452, 17, 15],
      [-112, -458, 17, 15],
      [-76, -450, 13, 18],
      [20, -455, 20, 14],
      [64, -462, 20, 14],
      [104, -452, 14, 19],
      [136, -462, 14, 19],
      [210, -456, 22, 12],
    ])
      addCityPart(createCylinderAt(G, G, j, "y", U + D, 2.2 + j / 2, C, 14), [0.62, 0.63, 0.62]),
        addCityPart(
          createCylinderAt(G * 0.2, G, j * 0.12, "y", U + D, 2.2 + j * 1.06, C, 14),
          [0.52, 0.53, 0.53],
        );
    for (let [D, C, G, j] of [
      [-32, -470, 96, 3.2],
      [168, -475, 70, 2.6],
    ]) {
      addCityPart(createCylinderAt(j * 0.62, j, G, "y", U + D, 2.2 + G / 2, C, 10), [0.5, 0.5, 0.5]);
      for (let N of [0.82, 0.94])
        addCityPart(
          createCylinderAt(j * 0.66, j * 0.7, G * 0.05, "y", U + D, 2.2 + G * N, C, 10),
          [0.6, 0.15, 0.1],
        );
      blinkLights.add(createOctahedronLamp(U + D, 3.2 + G, C, 0.9), r, 2.2, s(), 0.5),
        blinkLights.add(createOctahedronLamp(U + D + j, 2.2 + G * 0.55, C, 0.7), r, 2.2, s(), 0.5);
    }
    for (let [D, C, G, j, N] of [
      [-230, -455, 70, 16, 30],
      [-10, -445, 30, 22, 18],
      [0, -452, 8, 44, 8],
      [-18, -450, 5, 36, 5],
      [270, -450, 60, 12, 30],
      [150, -448, 26, 28, 14],
    ])
      addCityPart(
        createBoxBetween(U + D - G / 2, 2.2, C - N / 2, U + D + G / 2, 2.2 + j, C + N / 2),
        [0.34, 0.36, 0.38],
      );
    for (let D = 0; D < 26; D++)
      blinkLights.add(
        createOctahedronLamp(U - 300 + s() * 600, 6 + s() * 26, -436 + s() * 6, 0.55),
        s() > 0.3 ? o : [3, 3.4, 3.8],
        0,
      );
    let T = t.build({ cast: !1, recv: !1 });
    return (T.name = "skyline"), { root: T, tris: t.tris };
  }
  // 生成盘旋的海鸥群：顶点属性驱动，shader 里做扇翅与滑翔动画
  function buildGullFlock(ctx, timeUniform, gullCount = 12) {
    let n = createRng(5521),
      s = [],
      o = [],
      r = [];
    for (let u = 0; u < gullCount; u++) {
      let f =
          u % 3 === 0
            ? [54 + n() * 30, 9 + n() * 14, -4 + n() * 56]
            : [16 + n() * 26, 33 + n() * 12, -14 + n() * 28],
        p = 9 + n() * 16,
        d = (0.16 + n() * 0.16) * (n() > 0.5 ? 1 : -1),
        v = n() * 6.283,
        g = 5 + n() * 3,
        x = [
          [0.15, 0, 0, 0],
          [-0.13, 0, 0, 0],
          [-0.24, 0, 0.8, 1],
          [0.15, 0, 0, 0],
          [-0.24, 0, -0.8, 1],
          [-0.13, 0, 0, 0],
        ];
      for (let y of x)
        s.push(y[0], y[1] - 60, y[2]),
          o.push(f[0], f[1], f[2], p),
          r.push(d, v, g, y[3]);
    }
    let a = new BufferGeometry();
    a.setAttribute("position", new Float32BufferAttribute(s, 3)),
      a.setAttribute("aOrbit", new Float32BufferAttribute(o, 4)),
      a.setAttribute("aPar", new Float32BufferAttribute(r, 4));
    let l = new MeshBasicMaterial({ color: new Color(0.2, 0.21, 0.23), side: DoubleSide, fog: !1 });
    (l.onBeforeCompile = (u) => {
      (u.uniforms.uTime = timeUniform),
        (u.vertexShader =
          `attribute vec4 aOrbit;
attribute vec4 aPar;
uniform float uTime;
` +
          u.vertexShader.replace(
            "#include <begin_vertex>",
            `
      float ga = aPar.y + uTime * aPar.x;
      float gdir = sign(aPar.x);
      vec3 gfw = vec3(-sin(ga), 0.0, cos(ga)) * gdir;
      vec3 grt = vec3(gfw.z, 0.0, -gfw.x);
      vec3 gl = position + vec3(0.0, 60.0, 0.0);
      float glide = smoothstep(-0.2, 0.5, sin(uTime * 0.31 + aPar.y * 3.0));
      float gflap = sin(uTime * aPar.z + aPar.y * 7.0) * mix(0.12, 0.55, glide) + 0.18;
      gl.y += aPar.w * gflap * abs(gl.z);
      gl.z *= mix(1.0, 0.86, aPar.w * abs(gflap));
      vec3 gc = aOrbit.xyz + vec3(cos(ga), 0.0, sin(ga)) * aOrbit.w + vec3(0.0, sin(ga * 0.7 + aPar.y) * 2.2 + sin(uTime * 0.23 + aPar.y) * 1.5, 0.0);
      vec3 transformed = gc + gfw * gl.x + grt * gl.z + vec3(0.0, gl.y - 0.3 * gdir * gl.z, 0.0);`,
          ));
    }),
      (l.customProgramCacheKey = () => "saltline-gulls");
    let c = new Mesh(a, l);
    return (
      (c.frustumCulled = !1),
      (c.castShadow = !1),
      (c.receiveShadow = !1),
      (c.name = "gulls"),
      c
    );
  }
  // 可用 ?bshow= 单独展示的场景部件
  var SCENERY_PARTS = ["crane", "ship", "boat", "sky"];
  // 组装整个背景：按需创建小艇/岸桥/货轮/天际线/海鸥，注册碰撞盒，统计三角面与 draw call
  function buildBackdrop(ctx, { only: only = null, showcase: showcase = !1 } = {}) {
    let n = (b) => !only || only === b,
      s = new Group();
    s.name = "backdrop";
    let o = createBlinkLights(),
      r = new Vector3(31.5, -1.6, 21);
    showcase && r.set(24, 0.34, 15);
    let a = null,
      l = null,
      c = null,
      u = null,
      h = null;
    if (
      (n("boat") &&
        ((a = buildBoat(ctx, o)),
        a.root.position.copy(r),
        (a.root.rotation.y = -Math.PI / 2),
        s.add(a.root)),
      a && !showcase)
    ) {
      let b = new GeometryBatcher(),
        m = ctx.mats.get("rope");
      b.add(
        m,
        createRodChain(createSaggingCable(vec3(3.2, 0.95, 0.05), vec3(4.6, 2.12, 2.3), 0.22, 7), 0.016, 5),
      ),
        b.add(
          m,
          createRodChain(createSaggingCable(vec3(-3.25, 0.82, 0.95), vec3(-4.6, 2.12, 2.3), 0.2, 7), 0.016, 5),
        ),
        a.root.add(b.build({ cast: !1, recv: !1 }));
    }
    n("crane") && ((l = buildCrane(ctx, o)), s.add(l.root)),
      n("ship") && ((c = buildShip(ctx, o)), s.add(c.root)),
      n("sky") && ((u = buildSkyline(ctx, o)), s.add(u.root)),
      (n("sky") || n("crane")) && ((h = buildGullFlock(ctx, o.uTime, 12)), s.add(h));
    // 合并所有闪烁灯几何体，作为一个 Mesh 加入背景
    let f = o.build();
    f && ((f.name = "backdrop-lamps"), (f.frustumCulled = !1), s.add(f)),
      // 背景组一次性挂入场景
      ctx.scene.add(s);
    let p = [],
      // 把建模时记录的碰撞盒注册进物理世界
      registerCollider = (box, surface) => {
        ctx.physics &&
          ctx.physics.addBox &&
          p.push(
            ctx.physics.addBox(box.min, box.max, {
              surface: surface,
              tag: "backdrop",
              noNav: !!box.noNav,
            }),
          );
      };
    if (l) for (let b of l.colliders) registerCollider(b, "metal");
    if (c) for (let b of c.colliders) registerCollider(b, "metal");
    a &&
      !showcase &&
      registerCollider({ min: [30.25, -1.7, 17.4], max: [32.8, -0.7, 24.6] }, "rubber");
    let v = 0,
      g = 0;
    s.traverse((b) => {
      if (b.isMesh) {
        g++;
        let m = b.geometry;
        v += (m.index ? m.index.count : m.attributes.position.count) / 3;
      }
    });
    let x = 0;
    // 每帧更新：推进时间 uniform、吊具摆动、雷达旋转、小艇随浪起伏
    function updateBackdrop(dt) {
      if (((x += dt), (o.uTime.value = x), l)) {
        let m = l.spreader;
        (m.rotation.x =
          0.012 * Math.sin(x * 0.52) + 0.004 * Math.sin(x * 1.31 + 1)),
          (m.rotation.z = 0.009 * Math.sin(x * 0.41 + 1.1));
      }
      c && (c.radar.rotation.y = x * 1.9),
        a &&
          ((a.root.position.y =
            r.y +
            (showcase
              ? 0
              : 0.05 * Math.sin(x * 1.15) + 0.025 * Math.sin(x * 2.3 + 1.3))),
          (a.hullGrp.rotation.x =
            0.05 * Math.sin(x * 0.9 + 0.4) + 0.016 * Math.sin(x * 2.1)),
          (a.hullGrp.rotation.z = 0.02 * Math.sin(x * 1.3 + 2)));
    }
    return (
      updateBackdrop(0),
      {
        update: updateBackdrop,
        root: s,
        boat: a ? a.root : new Object3D(),
        crane: l ? l.root : null,
        ship: c ? c.root : null,
        skyline: u ? u.root : null,
        gulls: h,
        lamps: f,
        colliders: p,
        spreader: l ? l.spreader : null,
        boatBase: r,
        extractionPoint: new Vector3(30, 0, 20),
        shipName: "KITTIWAKE",
        craneId: "DEEP BLUE 04",
        stats: { tris: Math.round(v), drawCalls: g },
      }
    );
  }
  // 工厂：创建完整背景并挂到 scene，返回可 update 的实例对象
  async function createBackdrop(ctx) {
    return buildBackdrop(ctx, {});
  }
  // 展示模式：按 ?bshow= 只建一个部件，返回相机与目标点
  function showcaseBackdrop(ctx) {
    let e = ctx.params && SCENERY_PARTS.includes(ctx.params.bshow) ? ctx.params.bshow : null,
      t = buildBackdrop(ctx, { only: e, showcase: !0 });
    console.log("[backdrop] " + JSON.stringify(t.stats));
    let n = {
      crane: { cam: [0, 1.7, 27], target: [33, 13, 0] },
      ship: { cam: [24, 1.7, -2], target: [38, 9, -24] },
      boat: { cam: [19.5, 1.7, 11.5], target: [24, 0.9, 15] },
      sky: { cam: [-32, 1.7, 6], target: [30, 9, 0] },
    };
    return { ...(n[e] || n.crane), update: (s) => t.update(s) };
  }

export { BACKDROP_MODULE, createBackdrop, showcaseBackdrop };