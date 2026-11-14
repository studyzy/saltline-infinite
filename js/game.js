// Saltline game code, extracted from the original single-file artifact.
// The original bundle inlined three.js r180. Those definitions were removed and
// the game now imports the official build from ./vendor/. The bundle's minified
// three.js identifiers are aliased to public exports below, so the game body
// itself stays byte-identical to the original (apart from formatting).
import * as THREE from './vendor/three.module.js';
import { t as tr, getLang, setLang, applyI18n, LANGS } from './i18n.js';
import { createCity } from './city.js';
import { createCityLife } from './city-life.js';
import { createAudio as c_ } from './audio.js';
import { buildHoundRig as Z_, createHound as iM } from './hound.js';
import { WEAPON_MODULE as Xv, createWeapon as dm } from './weapon.js';
import { BACKDROP_MODULE as mv, createBackdrop as pv } from './backdrop.js';
import { FX_MODULE as Sv, createFx as Cf } from './fx.js';
import { GROUND_MODULE as vv, createGround as O1 } from './ground.js';
import { RENDER_MODULE as Vg, createRender as Hg } from './render.js';
import { LEVEL_MODULE as cv, createLevel as C1 } from './level.js';
import { MATS_MODULE as qg, createMats as Gg } from './mats.js';
import { PROPS_MODULE as $g, createProps as Yg } from './props.js';
import { createHud as hM } from './hud.js';
import { createMission as mM } from './mission.js';
import { buildGullRig as j_, createGull as Q_ } from './drone.js';
import { VIEW, MOVE, ENEMY_TUNE, MATCH, WEAPON, PHYSICS } from '../shared/constants.js';
import { createPhysics } from '../shared/physics.js';
import { step as stepPlayer } from '../shared/player.js';
import { NetClient } from '../client/net/connection.js';

const _M = Object.defineProperty;
const br = (i, e) => {
  for (var t in e) _M(i, t, { get: e[t], enumerable: true });
};

const _n = THREE.RGBAFormat;
const $n = THREE.Box3;
const Ac = THREE.GLSL3;
const Ae = THREE.Vector2;
const ar = THREE.LatheGeometry;
const as = THREE.FloatType;
const Bi = THREE.ClampToEdgeWrapping;
const bo = THREE.DynamicDrawUsage;
const bs = THREE.MathUtils;
const Ci = THREE.TorusGeometry;
const cr = THREE.OrthographicCamera;
const D0 = THREE.WebGLCubeRenderTarget;
const Dn = THREE.Sphere;
const Dt = THREE.Vector4;
const ea = THREE.InstancedBufferGeometry;
const Eh = THREE.PCFSoftShadowMap;
const Er = THREE.LinearSRGBColorSpace;
const et = THREE.BufferAttribute;
const Fa = THREE.Bone;
const G0 = THREE.OneFactor;
const gc = THREE.PCFShadowMap;
const gf = THREE.WebGLRenderer;
const Gn = THREE.NearestFilter;
const go = THREE.Plane;
const H0 = THREE.ShapeGeometry;
const He = THREE.Float32BufferAttribute;
const hi = THREE.NoColorSpace;
const hr = THREE.AdditiveBlending;
const ia = THREE.PMREMGenerator;
const In = THREE.Euler;
const ir = THREE.Scene;
const Is = THREE.RepeatWrapping;
const It = THREE.ShaderChunk;
const J0 = THREE.RedFormat;
const ji = THREE.Shape;
const Jr = THREE.CatmullRomCurve3;
const js = THREE.HalfFloatType;
const k0 = THREE.Skeleton;
const ka = THREE.SkinnedMesh;
const Ki = THREE.BackSide;
const ko = THREE.NoBlending;
const Kr = THREE.TubeGeometry;
const Ln = THREE.LinearMipmapLinearFilter;
const ls = THREE.SphereGeometry;
const lt = THREE;
const Lt = THREE.Quaternion;
const Na = THREE.OctahedronGeometry;
const Nn = THREE.MeshBasicMaterial;
const nr = THREE.AddEquation;
const nt = THREE.BufferGeometry;
const O0 = THREE.RingGeometry;
const on = THREE.Object3D;
const or = THREE.Path;
const P0 = THREE.DataUtils;
const q0 = THREE.AlwaysDepth;
const Qe = THREE.Mesh;
const Qr = THREE.PointLight;
const Qt = THREE.MeshStandardMaterial;
const rn = THREE.PlaneGeometry;
const rr = THREE.ExtrudeGeometry;
const Sh = THREE.CustomBlending;
const si = THREE.WebGLRenderTarget;
const Sn = THREE.DoubleSide;
const Sr = THREE.InstancedMesh;
const Th = THREE.ZeroFactor;
const Tr = THREE.DepthTexture;
const U0 = THREE.CapsuleGeometry;
const Ua = THREE.ConeGeometry;
const ui = THREE.DataTexture;
const un = THREE.BoxGeometry;
const V0 = THREE.RawShaderMaterial;
const Ve = THREE.Color;
const Vn = THREE.SRGBColorSpace;
const W = THREE.Vector3;
const w0 = THREE.OneMinusSrcAlphaFactor;
const W0 = THREE.DirectionalLight;
const Wn = THREE.PerspectiveCamera;
const wt = THREE.Group;
const xc = THREE.ACESFilmicToneMapping;
const xs = THREE.CanvasTexture;
const Xs = THREE.ShapeUtils;
const Ye = THREE.Matrix4;
const yi = THREE.UnsignedByteType;
const ys = THREE.NoToneMapping;
const Ys = THREE.CylinderGeometry;
const z0 = THREE.CubeCamera;
const zn = THREE.ShaderMaterial;
const zs = THREE.InstancedBufferAttribute;
const Zs = THREE.UnsignedIntType;
const Zt = THREE.LinearFilter;

var oi = {
      min: new W(-40, 0, -30),
      max: new W(40, 30, 30),
      groundY: PHYSICS.groundY,
      seaY: PHYSICS.seaY,
      quayX: PHYSICS.quayX,
    },
    Mn = {
      dir: new W(0.916, 0.225, 0.331).normalize(),
      color: new Ve(1, 0.72, 0.42),
      intensity: 9,
    },
    en = {
      zenith: new Ve(0.055, 0.085, 0.13),
      horizon: new Ve(0.95, 0.55, 0.28),
      horizonAway: new Ve(0.16, 0.22, 0.3),
      fog: new Ve(0.42, 0.47, 0.52),
    },
    Pi = VIEW,
    vf = 0,
    zc = 1,
    Pr = {
      test: {
        name: "test",
        scale: 1,
        msaa: 0,
        shadow: 1024,
        tex: 256,
        volSteps: 10,
        ao: !0,
        planar: 0.5,
        bloom: !0,
        motionBlur: !1,
        rain: 0.4,
      },
      low: {
        name: "low",
        scale: 0.7,
        msaa: 0,
        shadow: 2048,
        tex: 512,
        volSteps: 12,
        ao: !1,
        planar: 0,
        bloom: !0,
        motionBlur: !1,
        rain: 0.5,
      },
      medium: {
        name: "medium",
        scale: 0.85,
        msaa: 2,
        shadow: 2048,
        tex: 1024,
        volSteps: 16,
        ao: !0,
        planar: 0.5,
        bloom: !0,
        motionBlur: !1,
        rain: 0.8,
      },
      high: {
        name: "high",
        scale: 1,
        msaa: 4,
        shadow: 4096,
        tex: 1024,
        volSteps: 24,
        ao: !0,
        planar: 0.5,
        bloom: !0,
        motionBlur: !0,
        rain: 1,
      },
      ultra: {
        name: "ultra",
        scale: 1,
        msaa: 4,
        shadow: 4096,
        tex: 2048,
        volSteps: 40,
        ao: !0,
        planar: 1,
        bloom: !0,
        motionBlur: !0,
        rain: 1,
      },
    };
  function zy(i) {
    if (i && Pr[i]) return { ...Pr[i] };
    if (
      /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 &&
        Math.min(screen.width, screen.height) < 900)
    )
      return { ...Pr.low };
    let t = "";
    try {
      let s = document.createElement("canvas"),
        o = s.getContext("webgl2") || s.getContext("webgl");
      if (o) {
        let r = o.getExtension("WEBGL_debug_renderer_info");
        t = String(
          r
            ? o.getParameter(r.UNMASKED_RENDERER_WEBGL)
            : o.getParameter(o.RENDERER),
        );
        let a = o.getExtension("WEBGL_lose_context");
        a && a.loseContext();
      }
    } catch {}
    return {
      ...(/SwiftShader|llvmpipe|Software|Mali|Adreno|PowerVR/i.test(t) ||
      (/Intel/i.test(t) && !/Arc/i.test(t))
        ? Pr.medium
        : Pr.high),
    };
  }
  function Dy() {
    let i = new Map();
    return {
      on(e, t) {
        return i.has(e) || i.set(e, []), i.get(e).push(t), () => this.off(e, t);
      },
      off(e, t) {
        let n = i.get(e);
        if (n) {
          let s = n.indexOf(t);
          s >= 0 && n.splice(s, 1);
        }
      },
      emit(e, t) {
        let n = i.get(e);
        if (n)
          for (let s = 0; s < n.length; s++)
            try {
              n[s](t);
            } catch (o) {
              console.error(`[events] handler for "${e}" threw`, o);
            }
      },
    };
  }
  function il(i = 1337) {
    let e = i >>> 0,
      t = () => {
        (e |= 0), (e = (e + 1831565813) | 0);
        let n = Math.imul(e ^ (e >>> 15), 1 | e);
        return (
          (n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n),
          ((n ^ (n >>> 14)) >>> 0) / 4294967296
        );
      };
    return (
      (t.range = (n, s) => n + (s - n) * t()),
      (t.int = (n, s) => Math.floor(n + (s - n + 1) * t())),
      (t.pick = (n) => n[Math.floor(t() * n.length)]),
      (t.sign = () => (t() < 0.5 ? -1 : 1)),
      (t.fork = () => il(Math.floor(t() * 4294967296))),
      t
    );
  }
  var Zn = (i, e, t) => Math.min(t, Math.max(e, i)),
    bi = (i, e, t) => i + (e - i) * t,
    Fo = (i) => Math.min(1, Math.max(0, i)),
    sl = (i, e, t) => {
      let n = Fo((t - i) / (e - i));
      return n * n * (3 - 2 * n);
    },
    kn = (i, e, t, n) => e + (i - e) * Math.exp(-t * n);
  var Wt = () => {},
    dr = {
      ground: () => ({
        stub: !0,
        update: Wt,
        wetnessAt: () => 0.5,
        isPuddle: () => !1,
      }),
      backdrop: () => ({ stub: !0, update: Wt }),
      city: () => ({
        stub: !0,
        update: Wt,
        stats: { cells: 0, tris: 0 },
        spawnPoint: () => null,
        blockedAt: () => !1,
      }),
      fx: () => ({
        stub: !0,
        update: Wt,
        muzzleFlash: Wt,
        tracer: Wt,
        impact: Wt,
        sparks: Wt,
        smoke: Wt,
        explosion: Wt,
        debris: Wt,
        shell: Wt,
        decal: Wt,
        dust: Wt,
        clear: Wt,
        splash: Wt,
        addEmitter: () => ({ stop: Wt, setPos: Wt }),
      }),
      audio: () => {
        let i = { setPos: Wt, setGain: Wt, setPitch: Wt, stop: Wt };
        return {
          stub: !0,
          update: Wt,
          resume: Wt,
          play: Wt,
          loop: () => i,
          setIntensity: Wt,
          setInterior: Wt,
          setVolume: Wt,
          setPaused: Wt,
        };
      },
      weapon: () => ({
        stub: !0,
        update: Wt,
        reset: Wt,
        setVisible: Wt,
        ammo: 30,
        magSize: 30,
        reserve: 120,
        state: "idle",
        name: "KR-7",
        ads: 0,
        spread: 0.01,
      }),
      enemies: () => ({
        stub: !0,
        list: [],
        update: Wt,
        spawn: () => null,
        raycast: () => null,
        aliveCount: () => 0,
        clear: Wt,
        alert: Wt,
      }),
      hud: () => ({
        stub: !0,
        update: Wt,
        show: Wt,
        setObjective: Wt,
        message: Wt,
        hitmarker: Wt,
      }),
      mats: () => {
        let i = new Map();
        return {
          stub: !0,
          get: (t) => (
            i.has(t) || i.set(t, new Qt({ color: 7829367, roughness: 0.7 })),
            i.get(t)
          ),
          emissive: (t = 16777215, n = 4) =>
            new Nn({ color: new Ve(t).multiplyScalar(n) }),
          names: [],
          decal: () => ({
            material: new Nn({ transparent: !0, opacity: 0 }),
            aspect: 1,
          }),
          label: () => ({
            material: new Nn({ transparent: !0, opacity: 0 }),
            aspect: 4,
          }),
          uniforms: { wet: { value: 1 } },
          update: Wt,
        };
      },
    };
  function sa(i, e = !1) {
    let t = i[0].index !== null,
      n = new Set(Object.keys(i[0].attributes)),
      s = new Set(Object.keys(i[0].morphAttributes)),
      o = {},
      r = {},
      a = i[0].morphTargetsRelative,
      l = new nt(),
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
      for (let f = 0; f < i.length; ++f) {
        let p = i[f].index;
        for (let d = 0; d < p.count; ++d) h.push(p.getX(d) + u);
        u += i[f].attributes.position.count;
      }
      l.setIndex(h);
    }
    for (let u in o) {
      let h = Ly(o[u]);
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
        let d = Ly(p);
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
  function Ly(i) {
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
      a = new et(r, t, n),
      l = 0;
    for (let c = 0; c < i.length; ++c) {
      let u = i[c];
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
  var oa = new W();
  function $e(i, e, t, n = "center") {
    let s = new un(i, e, t),
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
    return n === "bottom" && s.translate(0, e / 2, 0), s;
  }
  function Wi(i, e, t, n = 0.02, s = "center") {
    n = Math.min(n, i / 2 - 1e-4, e / 2 - 1e-4, t / 2 - 1e-4);
    let o = new un(i, e, t, 3, 3, 3),
      r = o.attributes.position,
      a = o.attributes.normal,
      l = o.attributes.uv,
      c = i / 2,
      u = e / 2,
      h = t / 2,
      f = (p, d) => {
        let v = Math.abs(p),
          g = Math.sign(p);
        return v > d - 1e-5 ? g * d : g * (d - n);
      };
    for (let p = 0; p < r.count; p++) {
      let d = f(r.getX(p), c),
        v = f(r.getY(p), u),
        g = f(r.getZ(p), h),
        x = Math.max(-(c - n), Math.min(c - n, d)),
        y = Math.max(-(u - n), Math.min(u - n, v)),
        b = Math.max(-(h - n), Math.min(h - n, g));
      if ((oa.set(d - x, v - y, g - b), oa.lengthSq() > 1e-10)) {
        oa.normalize();
        let M = a.getX(p),
          E = a.getY(p),
          w = a.getZ(p);
        (Math.abs(d) > c - 1e-5 ? 1 : 0) +
          (Math.abs(v) > u - 1e-5 ? 1 : 0) +
          (Math.abs(g) > h - 1e-5 ? 1 : 0) >=
        2
          ? ((d = x + oa.x * n),
            (v = y + oa.y * n),
            (g = b + oa.z * n),
            a.setXYZ(p, oa.x, oa.y, oa.z))
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
    return s === "bottom" && o.translate(0, e / 2, 0), o;
  }
  function ot(i, e, t, n = 16, s = !1, o = "center") {
    let r = new Ys(i, e, t, n, 1, s),
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
  function Fn(i, e = 0.03, t = 8, n = !1, s = 0) {
    let o = i.map((h) => (h.isVector3 ? h : new W(h[0], h[1], h[2]))),
      r = new Jr(o, n, "catmullrom", s),
      a = r.getLength(),
      l = Math.max(2, Math.ceil(a / Math.max(0.08, e * 3))),
      c = new Kr(r, Math.min(l, 400), e, t, n),
      u = c.attributes.uv;
    for (let h = 0; h < u.count; h++)
      u.setXY(h, u.getX(h) * a, u.getY(h) * Math.PI * 2 * e);
    return c;
  }
  var ky = new Ye(),
    Fy = new Lt(),
    Uy = new In(),
    Ny = new W(),
    Fg = new W();
  function Dc(i, { p: e = [0, 0, 0], r: t = [0, 0, 0], s: n = 1 } = {}) {
    return (
      Uy.set(t[0], t[1], t[2]),
      Fy.setFromEuler(Uy),
      Ny.set(e[0], e[1], e[2]),
      typeof n == "number" ? Fg.set(n, n, n) : Fg.set(n[0], n[1], n[2]),
      ky.compose(Ny, Fy, Fg),
      i.applyMatrix4(ky),
      i
    );
  }
  function Lc(i, e) {
    let t = i.attributes.position,
      n = t.count,
      s = new Float32Array(n * 3);
    for (let o = 0; o < n; o++) {
      let r = typeof e == "function" ? e(t.getX(o), t.getY(o), t.getZ(o)) : e;
      (s[o * 3] = r[0]), (s[o * 3 + 1] = r[1]), (s[o * 3 + 2] = r[2]);
    }
    return i.setAttribute("color", new et(s, 3)), i;
  }
  function Ii(i) {
    let e = i
      .filter(Boolean)
      .map(
        (l) => (
          l.attributes.uv ||
            l.setAttribute(
              "uv",
              new et(new Float32Array(l.attributes.position.count * 2), 2),
            ),
          l.attributes.normal || l.computeVertexNormals(),
          l
        ),
      );
    if (!e.length) return new nt();
    let t = e.some((l) => l.attributes.color),
      n = e.map((l) => {
        let c = (l.index, l);
        if (t && !c.attributes.color) {
          let u = new Float32Array(c.attributes.position.count * 3).fill(1);
          c.setAttribute("color", new et(u, 3));
        }
        for (let u of Object.keys(c.attributes))
          ["position", "normal", "uv", "color"].includes(u) ||
            c.deleteAttribute(u);
        return c;
      }),
      s = n.every((l) => l.index),
      o = n.every((l) => !l.index),
      r = s || o ? n : n.map((l) => (l.index ? l.toNonIndexed() : l));
    return sa(r, !1) || new nt();
  }
  function By(i, { castShadow: e = !0, receiveShadow: t = !0 } = {}) {
    i.updateMatrixWorld(!0);
    let n = new Map(),
      s = [];
    i.traverse((r) => {
      if (!r.isMesh) return;
      let a = r,
        l = !1;
      for (; a; ) {
        if (a.userData && a.userData.noMerge) {
          l = !0;
          break;
        }
        a = a.parent;
      }
      if (
        l ||
        r.isSkinnedMesh ||
        r.isInstancedMesh ||
        Array.isArray(r.material)
      ) {
        s.push(r);
        return;
      }
      let c =
        r.material.uuid +
        (r.castShadow ? "c" : "n") +
        (r.receiveShadow ? "r" : "n") +
        ":" +
        r.layers.mask;
      n.has(c) ||
        n.set(c, {
          mat: r.material,
          geos: [],
          cast: r.castShadow,
          recv: r.receiveShadow,
          layers: r.layers.mask,
        });
      let u = r.geometry.clone();
      u.applyMatrix4(r.matrixWorld), n.get(c).geos.push(u);
    });
    let o = new wt();
    for (let r of n.values()) {
      let a = new Qe(Ii(r.geos), r.mat);
      (a.castShadow = r.cast && e),
        (a.receiveShadow = r.recv && t),
        (a.layers.mask = r.layers),
        o.add(a);
    }
    for (let r of s) {
      r.updateMatrixWorld(!0);
      let a = r.matrixWorld.clone();
      o.add(r),
        r.matrix.copy(a),
        r.matrix.decompose(r.position, r.quaternion, r.scale);
    }
    return o;
  }
  function Qi(i, e, { cast: t = !0, recv: n = !0 } = {}) {
    let s = new Qe(i, e);
    return (s.castShadow = t), (s.receiveShadow = n), s;
  }
  function v_(i) {
    let e =
        (i.renderer && i.renderer.domElement) ||
        document.getElementById("view"),
      t = document.getElementById("ui"),
      n = new Set(),
      s = new Set(),
      o = {
        key: new Set(),
        mouse: new Set(),
        touch: new Set(),
        pad: new Set(),
      },
      r = !1,
      a = !1,
      l = 0,
      c = 0,
      u = 0,
      h = [],
      f = {
        move: { x: 0, y: 0 },
        look: { dx: 0, dy: 0 },
        fire: !1,
        ads: !1,
        sprint: !1,
        crouch: !1,
        locked: !1,
        touch: !1,
        gamepad: !1,
        sensitivity: 1,
        invertY: !1,
        mode: "lock",
        down(P) {
          return n.has(P) && (r || g_[P] === 1);
        },
        pressed(P) {
          return s.has(P) && (r || g_[P] === 1);
        },
        update: ee,
        endFrame: B,
        requestLock: A,
        exitLock: _,
        setGameplay(P) {
          (P = !!P),
            P !== r &&
              ((r = P),
              P || v(),
              M && M.root.classList.toggle("on", P && f.touch));
        },
        setPrompt(P) {
          M && M.btn.interact.classList.toggle("on", !!P);
        },
        onModeChange(P) {
          h.push(P);
        },
        describeMode() {
          return f.mode === "touch"
            ? tr("mode_touch")
            : f.mode === "drag"
              ? tr("mode_drag")
              : f.locked
                ? tr("mode_locked")
                : tr("mode_click");
        },
      };
    function p(P) {
      if (f.mode !== P) {
        f.mode = P;
        for (let V of h)
          try {
            V(P);
          } catch (Y) {
            console.error(Y);
          }
      }
    }
    function d(P, V, Y) {
      if (!V) return;
      let L = o[P];
      if (Y) {
        if (L.has(V)) return;
        L.add(V), n.has(V) || (n.add(V), s.add(V));
      } else {
        if (!L.delete(V)) return;
        !o.key.has(V) &&
          !o.mouse.has(V) &&
          !o.touch.has(V) &&
          !o.pad.has(V) &&
          n.delete(V);
      }
    }
    function v() {
      for (let P in o) o[P].clear();
      n.clear(),
        (u = 0),
        (j = !1),
        M && (M.btn.ads.classList.remove("active"), ie(), (q = -1), (D = -1));
    }
    addEventListener("keydown", (P) => {
      let V = h_[P.code];
      if (!V) return;
      let Y = P.target;
      (Y &&
        (Y.tagName === "INPUT" ||
          Y.tagName === "SELECT" ||
          Y.tagName === "TEXTAREA")) ||
        (Y &&
          Y.tagName === "BUTTON" &&
          (P.code === "Space" ||
            P.code === "Enter" ||
            P.code === "NumpadEnter")) ||
        (r &&
          (P.code === "Space" ||
            P.code.startsWith("Arrow") ||
            P.code === "ControlLeft") &&
          P.preventDefault(),
        !P.repeat && d("key", V, !0));
    }),
      addEventListener("keyup", (P) => {
        d("key", h_[P.code], !1);
      }),
      addEventListener("blur", () => {
        v();
      });
    let g = (P) =>
      P === 0 ? "fire" : P === 2 ? "ads" : P === 1 ? "melee" : null;
    e.addEventListener("mousedown", (P) => {
      if (!(f.touch && performance.now() - E < 800) && r) {
        if (!f.locked && f.mode === "lock") {
          A(), P.preventDefault();
          return;
        }
        (u |= 1 << P.button), d("mouse", g(P.button), !0), P.preventDefault();
      }
    }),
      addEventListener("mouseup", (P) => {
        (u &= ~(1 << P.button)), d("mouse", g(P.button), !1);
      }),
      addEventListener("contextmenu", (P) => {
        (P.target === e || r) && P.preventDefault();
      }),
      addEventListener("mousemove", (P) => {
        if (
          r &&
          (f.mode === "drag" &&
            ((x = P.clientX / Math.max(1, innerWidth)),
            (y = P.clientY / Math.max(1, innerHeight)),
            (b = !0)),
          f.locked || f.mode === "drag")
        ) {
          let V = P.movementX || 0,
            Y = P.movementY || 0;
          if (Math.abs(V) > 400 || Math.abs(Y) > 400) return;
          (f.look.dx += V * f_ * f.sensitivity),
            (f.look.dy += Y * f_ * f.sensitivity * (f.invertY ? -1 : 1));
        }
      }),
      document.addEventListener("pointerlockchange", () => {
        if (((f.locked = document.pointerLockElement === e), f.locked))
          (a = !0), (l = 0), (c = 0), f.touch || p("lock");
        else {
          o.mouse.clear(), n.delete("fire"), n.delete("ads");
          for (let P of o.key) n.add(P);
          u = 0;
        }
        i.events.emit("input:lock", { locked: f.locked });
      }),
      document.addEventListener("pointerlockerror", () => m());
    let x = 0.5,
      y = 0.5,
      b = !1;
    document.addEventListener("mouseleave", () => {
      b = !1;
    });
    function m() {
      (l = 0), !(f.locked || f.touch) && (c++, a || p("drag"));
    }
    function A() {
      if (!(f.touch || f.locked)) {
        if (!e.requestPointerLock) {
          m();
          return;
        }
        try {
          l = performance.now();
          let P = e.requestPointerLock();
          P && P.catch && P.catch(() => m());
        } catch {
          m();
        }
        try {
          e.focus({ preventScroll: !0 });
        } catch {}
      }
    }
    function _() {
      try {
        document.pointerLockElement && document.exitPointerLock();
      } catch {}
    }
    let M = null,
      E = 0,
      w = -1,
      S = 0,
      z = 0,
      H = 0,
      O = 0,
      q = -1,
      U = 0,
      T = 0,
      D = -1,
      C = 0,
      G = 0,
      j = !1;
    function N() {
      let P = document.createElement("div");
      (P.className = "touch"),
        (P.innerHTML =
          `<div class="t-stick"><i class="t-ring"></i><i class="t-nub"></i></div><button class="t-btn t-fire" data-a="fire" aria-label="${tr("keys_fire")}"><span>${tr("tbtn_fire")}</span></button><button class="t-btn t-ads" data-a="ads" aria-label="${tr("keys_aim")}"><span>${tr("tbtn_aim")}</span></button><button class="t-btn t-reload" data-a="reload" aria-label="${tr("keys_reload")}"><span>${tr("tbtn_reload")}</span></button><button class="t-btn t-jump" data-a="jump" aria-label="${tr("keys_jump")}"><span>${tr("tbtn_jump")}</span></button><button class="t-btn t-interact" data-a="interact" aria-label="${tr("tbtn_use")}"><span>${tr("tbtn_use")}</span></button><button class="t-btn t-pause" data-a="pause" aria-label="${tr("keys_pause")}"><span>${tr("tbtn_pause")}</span></button>`),
        t.appendChild(P);
      let V = (L) => P.querySelector(L),
        Y = {
          root: P,
          stick: V(".t-stick"),
          nub: V(".t-nub"),
          btn: {
            fire: V(".t-fire"),
            ads: V(".t-ads"),
            reload: V(".t-reload"),
            jump: V(".t-jump"),
            interact: V(".t-interact"),
            pause: V(".t-pause"),
          },
        };
      for (let L in Y.btn) {
        let Z = Y.btn[L];
        Z.addEventListener(
          "touchstart",
          (oe) => {
            oe.preventDefault(), oe.stopPropagation(), (E = performance.now());
            let fe = oe.changedTouches[0];
            if (L === "ads") {
              (j = !j), Z.classList.toggle("active", j);
              return;
            }
            L === "fire" &&
              ((D = fe.identifier), (C = fe.clientX), (G = fe.clientY)),
              Z.classList.add("active"),
              d("touch", L, !0);
          },
          { passive: !1 },
        );
        let J = (oe) => {
          if ((oe.preventDefault(), oe.stopPropagation(), L !== "ads")) {
            if (L === "fire") {
              let fe = !1;
              for (let le of oe.changedTouches)
                le.identifier === D && (fe = !0);
              if (!fe) return;
              D = -1;
            }
            Z.classList.remove("active"), d("touch", L, !1);
          }
        };
        Z.addEventListener("touchend", J, { passive: !1 }),
          Z.addEventListener("touchcancel", J, { passive: !1 }),
          Z.addEventListener(
            "touchmove",
            (oe) => {
              if ((oe.preventDefault(), L === "fire"))
                for (let fe of oe.changedTouches)
                  fe.identifier === D &&
                    (Q(fe.clientX - C, fe.clientY - G),
                    (C = fe.clientX),
                    (G = fe.clientY));
            },
            { passive: !1 },
          ),
          Z.addEventListener("contextmenu", (oe) => oe.preventDefault());
      }
      return Y;
    }
    function Q(P, V) {
      (f.look.dx += P * d_ * f.sensitivity),
        (f.look.dy += V * d_ * f.sensitivity * (f.invertY ? -1 : 1));
    }
    function K() {
      f.touch ||
        ((f.touch = !0),
        _(),
        M || (M = N()),
        M.root.classList.toggle("on", r),
        document.documentElement.classList.add("is-touch"),
        p("touch"));
    }
    function ie() {
      (w = -1), (H = O = 0), M && M.stick.classList.remove("on");
    }
    addEventListener(
      "touchstart",
      () => {
        (E = performance.now()), K();
      },
      { passive: !0, capture: !0 },
    ),
      e.addEventListener(
        "touchstart",
        (P) => {
          if ((P.preventDefault(), !!r))
            for (let V of P.changedTouches)
              V.clientX < innerWidth * 0.45 && w < 0
                ? ((w = V.identifier),
                  (S = V.clientX),
                  (z = V.clientY),
                  (H = O = 0),
                  M &&
                    ((M.stick.style.transform = `translate3d(${S}px,${z}px,0)`),
                    (M.nub.style.transform = "translate3d(0,0,0)"),
                    M.stick.classList.add("on")))
                : q < 0 &&
                  ((q = V.identifier), (U = V.clientX), (T = V.clientY));
        },
        { passive: !1 },
      ),
      e.addEventListener(
        "touchmove",
        (P) => {
          if ((P.preventDefault(), !!r))
            for (let V of P.changedTouches)
              if (V.identifier === w) {
                let Y = V.clientX - S,
                  L = V.clientY - z,
                  Z = Math.hypot(Y, L);
                Z > If && ((Y *= If / Z), (L *= If / Z)),
                  (H = Y / If),
                  (O = -L / If),
                  M &&
                    (M.nub.style.transform = `translate3d(${Y.toFixed(1)}px,${L.toFixed(1)}px,0)`);
              } else
                V.identifier === q &&
                  (Q(V.clientX - U, V.clientY - T),
                  (U = V.clientX),
                  (T = V.clientY));
        },
        { passive: !1 },
      );
    let F = (P) => {
      for (let V of P.changedTouches)
        V.identifier === w ? ie() : V.identifier === q && (q = -1);
    };
    e.addEventListener("touchend", F, { passive: !1 }),
      e.addEventListener("touchcancel", F, { passive: !1 });
    let X = {
        0: "jump",
        1: "crouch",
        2: "reload",
        3: "interact",
        5: "melee",
        6: "ads",
        7: "fire",
        9: "pause",
        10: "sprint",
        11: "melee",
      },
      ne = typeof navigator < "u" && !!navigator.getGamepads,
      re = 0,
      $ = 0,
      ue = (P) => {
        let V = Math.abs(P);
        return V < 0.16 ? 0 : (Math.sign(P) * (V - 0.16)) / 0.84;
      };
    function me(P) {
      if (((re = $ = 0), !ne)) return;
      let V;
      try {
        V = navigator.getGamepads();
      } catch {
        ne = !1;
        return;
      }
      let Y = null;
      for (let J = 0; V && J < V.length; J++)
        if (V[J] && V[J].connected && V[J].mapping === "standard") {
          Y = V[J];
          break;
        }
      if (!Y) {
        f.gamepad && ((f.gamepad = !1), o.pad.clear());
        return;
      }
      (f.gamepad = !0), (re = ue(Y.axes[0] || 0)), ($ = -ue(Y.axes[1] || 0));
      let L = ue(Y.axes[2] || 0),
        Z = ue(Y.axes[3] || 0);
      r &&
        ((f.look.dx += L * Math.abs(L) * m_ * P * f.sensitivity),
        (f.look.dy +=
          Z *
          Math.abs(Z) *
          m_ *
          0.7 *
          P *
          f.sensitivity *
          (f.invertY ? -1 : 1)));
      for (let J in X) {
        let oe = Y.buttons[J];
        d("pad", X[J], !!oe && (oe.pressed || oe.value > 0.4));
      }
    }
    function ee(P) {
      if (
        (me(P),
        l && performance.now() - l > 1200 && !f.locked && m(),
        f.mode === "drag" && r && b && !f.locked)
      ) {
        let Z =
            x < 0.12 ? -(0.12 - x) / 0.12 : x > 0.88 ? (x - 0.88) / 0.12 : 0,
          J = y < 0.1 ? -(0.1 - y) / 0.1 : y > 0.9 ? (y - 0.9) / 0.1 : 0;
        (f.look.dx += Z * 2.4 * P * f.sensitivity),
          (f.look.dy += J * 1.2 * P * f.sensitivity * (f.invertY ? -1 : 1));
      }
      let V = 0,
        Y = 0,
        L = !1;
      if (r) {
        (V = (n.has("right") ? 1 : 0) - (n.has("left") ? 1 : 0)),
          (Y = (n.has("forward") ? 1 : 0) - (n.has("back") ? 1 : 0)),
          (L = n.has("sprint")),
          w >= 0 &&
            ((V += H),
            (Y += O),
            Math.hypot(H, O) > 0.93 && O > 0.8 && (L = !0)),
          (V += re),
          (Y += $);
        let Z = Math.hypot(V, Y);
        Z > 1 && ((V /= Z), (Y /= Z));
        let J = (n.has("turnR") ? 1 : 0) - (n.has("turnL") ? 1 : 0),
          oe = (n.has("turnD") ? 1 : 0) - (n.has("turnU") ? 1 : 0);
        J && (f.look.dx += J * p_ * P), oe && (f.look.dy += oe * p_ * 0.6 * P);
      }
      (f.move.x = V),
        (f.move.y = Y),
        (f.fire = r && n.has("fire")),
        (f.ads = r && (n.has("ads") || j)),
        (f.sprint = r && L),
        (f.crouch = r && n.has("crouch"));
    }
    function B() {
      s.clear(), (f.look.dx = 0), (f.look.dy = 0);
    }
    return f;
  }
  var Mt = MOVE,
    rC = Math.sqrt(2 * Mt.gravity * Mt.jumpApex);
  function x_(i) {
    let e = i.camera,
      t = () => (i.render && i.render.post) || n,
      n = {},
      s = Pi.eye,
      o = Mt.standHeight,
      r = 0,
      a = 0,
      l = !0,
      c = 0,
      u = 0,
      h = 0,
      f = 0,
      p = 0,
      d = 0,
      v = 0,
      g = { x: 0, v: 0 },
      x = 0,
      y = 0,
      b = 0,
      m = 0,
      A = 0,
      _ = 0,
      M = 0,
      E = 99,
      w = 0,
      S = 0,
      z = 0,
      H = Pi.fov,
      O = 0,
      q = "concrete",
      U = new W(),
      T = new In(0, 0, 0, "YXZ"),
      D = new W(),
      C = {
        pos: new W(),
        eye: new W(),
        vel: new W(),
        forward: new W(0, 0, -1),
        yaw: 0,
        pitch: 0,
        health: 100,
        maxHealth: 100,
        medkits: 0,
        medkitMax: Mt.medkitMax,
        alive: !0,
        onGround: !0,
        sprinting: !1,
        crouching: !1,
        ads: 0,
        speed: 0,
        enabled: !0,
        invulnerable: !1,
        baseFov: Pi.fov,
        hurtPulse: 0,
        lookScale: 1,
        lastSafe: D,
        tuning: Mt,
        coyote: 0,
        jumpBuffer: 0,
        airTime: 0,
        fallSpeed: 0,
        stepPhase: 0,
        surface: "concrete",
        reset(F) {
          let X = F ||
            (i.level && i.level.playerStart) || { pos: new W(), yaw: 0 };
          C.pos.copy(X.pos),
            (C.yaw = X.yaw || 0),
            (C.pitch = 0),
            C.vel.set(0, 0, 0),
            (C.health = C.maxHealth),
            (C.medkits = 0),
            (C.alive = !0),
            (C.onGround = !0),
            (C.sprinting = !1),
            (C.crouching = !1),
            (C.invulnerable = !1),
            (C.speed = 0),
            (s = Pi.eye),
            (o = Mt.standHeight),
            (r = 0),
            (a = 0),
            (l = !0),
            (c = 0),
            (u = 0),
            (h = 0),
            (f = 0),
            (p = d = 0),
            (v = 0),
            (g.x = g.v = 0),
            (x = y = b = m = 0),
            (A = 0),
            (_ = 0),
            (E = 99),
            (w = 0),
            (S = 0),
            (z = 0),
            (C.hurtPulse = 0),
            D.copy(C.pos);
          let ne = t();
          (ne.damage = 0), (ne.lowHealth = 0), (ne.ads = 0), K(0);
        },
        damage(F, X) {
          !C.alive ||
            C.invulnerable ||
            !(F > 0) ||
            ((C.health = Math.max(0, C.health - F)),
            (E = 0),
            (w = Math.min(1, w + 0.35 + F / 40)),
            C.addShake(0.22 + F / 70),
            i.events.emit("player:hit", { amount: F, fromPos: X }),
            C.health <= 0 &&
              ((C.alive = !1),
              (z = 0),
              (C.sprinting = !1),
              i.events.emit("player:dead", {})));
        },
        heal(F) {
          C.alive && (C.health = Math.min(C.maxHealth, C.health + F));
        },
        addMedkit(F = 1) {
          let X = Math.max(0, Math.min(C.medkitMax, C.medkits + F));
          let ne = X - C.medkits;
          return (C.medkits = X), ne;
        },
        useMedkit() {
          if (!C.alive || C.medkits <= 0 || C.health >= C.maxHealth - 0.5)
            return !1;
          let F = Math.min(Mt.medkitHeal, C.maxHealth - C.health);
          return (
            C.medkits--,
            C.heal(F),
            i.events.emit("player:heal", {
              amount: F,
              health: C.health,
              left: C.medkits,
            }),
            !0
          );
        },
        addRecoil(F = 0, X = 0) {
          let ne = Mt.recoilKeep;
          (C.pitch = Zn(C.pitch + F * ne, -Mt.pitchLimit, Mt.pitchLimit)),
            (C.yaw += X * ne),
            (x += F * (1 - ne)),
            (y += X * (1 - ne)),
            (x = Zn(x, -0.3, 0.3)),
            (y = Zn(y, -0.2, 0.2)),
            (A = Mt.recoilHold);
        },
        addShake(F = 0.3) {
          _ = Math.min(1, _ + F);
        },
        setFov(F) {
          C.baseFov = Zn(+F || Pi.fov, 55, 100);
        },
        update: N,
      };
    i.events.on("explosion", (F) => {
      if (!F || !F.pos) return;
      let X = C.eye.distanceTo(F.pos),
        ne = F.size || 1,
        re = Fo(1 - X / (14 + ne * 10)) * (0.35 + 0.35 * ne);
      re > 0.01 && C.addShake(re);
    });
    function G() {
      let F = i.physics && i.physics.boxes;
      if (!F) return !0;
      let X = Pi.radius * 0.9,
        ne = C.pos.y + Mt.crouchHeight - 0.05,
        re = C.pos.y + Mt.standHeight;
      for (let $ = 0; $ < F.length; $++) {
        let ue = F[$];
        if (
          !ue.bulletOnly &&
          !(
            C.pos.x + X < ue.min.x ||
            C.pos.x - X > ue.max.x ||
            C.pos.z + X < ue.min.z ||
            C.pos.z - X > ue.max.z
          ) &&
          ue.min.y < re &&
          ue.max.y > ne
        )
          return !1;
      }
      return !0;
    }
    function j() {
      let F = C.pos.x,
        X = C.pos.z;
      try {
        if (
          i.ground &&
          i.ground.isPuddle &&
          C.pos.y < 0.05 &&
          i.ground.isPuddle(F, X)
        )
          return "water";
      } catch {}
      if (q && q !== "concrete") return q;
      try {
        return (
          (i.level &&
            i.level.groundSurfaceAt &&
            i.level.groundSurfaceAt(F, X)) ||
          q ||
          "concrete"
        );
      } catch {
        return q || "concrete";
      }
    }
    function netTick(F) {
      if (i.net && i.net.spectate) return;
      let X = i.input,
        ne = i.weapon || {},
        viewAds =
          ne.stub || typeof ne.ads != "number"
            ? (O = kn(O, C.enabled && X.ads ? 1 : 0, 14, F))
            : Fo(ne.ads);
      C.lookScale = bi(1, Mt.adsLook, viewAds);
      if (C.alive) {
        (C.yaw -= X.look.dx * C.lookScale),
          (C.pitch = Zn(
            C.pitch - X.look.dy * C.lookScale,
            -Mt.pitchLimit,
            Mt.pitchLimit,
          )),
          (C.yaw > Math.PI * 4 || C.yaw < -Math.PI * 4) &&
            (C.yaw = C.yaw % (Math.PI * 2));
      }
      const cmd = {
        mx: X.move ? X.move.x : 0,
        my: X.move ? X.move.y : 0,
        yaw: C.yaw,
        pitch: C.pitch,
        sprint: !!X.sprint,
        crouch: !!X.crouch,
        jumpPressed: X.pressed("jump"),
        ads: viewAds,
        fire: !!X.fire,
      };
      const events = stepPlayer(C, cmd, F, i.physics);
      C.ads = viewAds;
      for (const ev of events) {
        if (ev.kind === "jump") {
          i.events.emit("player:jump", { pos: C.pos });
        } else if (ev.kind === "land") {
          const ce = Math.max(0, ev.speed, 0);
          (g.v -= Math.min(ce * Mt.landDip, 3.2)),
            ce > 7.5 && C.addShake(Math.min(0.5, (ce - 7.5) * 0.06)),
            i.events.emit("player:land", {
              speed: ce,
              surface: ev.surface,
              pos: C.pos,
            }),
            (h = 0.35);
        } else if (ev.kind === "step") {
          i.events.emit("player:step", {
            surface: ev.surface,
            sprint: !!ev.sprint,
            pos: C.pos,
          });
        } else if (ev.kind === "seaRescue") {
          C.addShake(0.6), i.events.emit("player:rescued", {});
        }
      }
      h = C.stepPhase;
      const Y = Math.cos(C.yaw),
        V = Math.sin(C.yaw),
        k = C.vel.x * Y - C.vel.z * V;
      (f = kn(
        f,
        C.onGround
          ? Fo(C.speed / Mt.walk) *
              (C.sprinting ? Mt.bobSprint : 1) *
              bi(1, Mt.bobAds, C.ads) *
              (C.crouching ? 0.7 : 1)
          : 0,
        9,
        F,
      )),
        (d = -Math.cos(h * Math.PI * 2) * Mt.bobY * f),
        (p = Math.sin(h * Math.PI) * Mt.bobX * f),
        (v = kn(
          v,
          (-k / Mt.sprint) * Mt.rollStrafe * bi(1, 0.4, C.ads),
          8,
          F,
        )),
        K(F),
        ie(F);
    }
    function N(F) {
      if (i.net && i.net.active) return netTick(F);
      let X = i.input,
        ne = i.weapon || {};
      if (
        (ne.stub || typeof ne.ads != "number"
          ? ((O = kn(O, C.enabled && X.ads ? 1 : 0, 14, F)), (C.ads = O))
          : (C.ads = Fo(ne.ads)),
        !C.alive)
      ) {
        (z += F), Q(F), K(F), ie(F);
        return;
      }
      let re = C.enabled;
      re && X.pressed("heal") && C.useMedkit();
      (C.lookScale = bi(1, Mt.adsLook, C.ads)),
        re &&
          ((C.yaw -= X.look.dx * C.lookScale),
          (C.pitch = Zn(
            C.pitch - X.look.dy * C.lookScale,
            -Mt.pitchLimit,
            Mt.pitchLimit,
          )),
          (C.yaw > Math.PI * 4 || C.yaw < -Math.PI * 4) &&
            (C.yaw = C.yaw % (Math.PI * 2))),
        re && X.crouch
          ? (C.crouching = !0)
          : C.crouching && G() && (C.crouching = !1),
        (o = C.crouching ? Mt.crouchHeight : Mt.standHeight);
      let ue = re ? X.move.x : 0,
        me = re ? X.move.y : 0,
        ee = ue * ue + me * me > 0.01,
        B =
          re &&
          X.sprint &&
          me > 0.55 &&
          Math.abs(ue) < 0.6 &&
          !C.crouching &&
          C.ads < 0.35 &&
          !X.fire;
      C.sprinting =
        (B && C.onGround && C.speed > Mt.walk * 0.6) ||
        (B && !C.onGround && C.sprinting);
      let P = Mt.walk;
      C.crouching ? (P = Mt.crouch) : B && (P = Mt.sprint),
        (P = bi(P, Math.min(P, Mt.ads), C.ads)),
        me < 0 && (P *= bi(1, 0.82, -me));
      let V = Math.sin(C.yaw),
        Y = Math.cos(C.yaw);
      U.set(ue * Y - me * V, 0, -ue * V - me * Y).multiplyScalar(P);
      let L = C.onGround
          ? ee
            ? Mt.accelGround
            : Mt.decelGround
          : ee
            ? Mt.accelAir
            : 0.6,
        Z = U.x - C.vel.x,
        J = U.z - C.vel.z;
      !C.onGround && !ee && ((Z = -C.vel.x), (J = -C.vel.z));
      let oe = Math.hypot(Z, J),
        fe = L * F;
      oe <= fe || oe < 1e-6
        ? (C.onGround || ee) && ((C.vel.x = U.x), (C.vel.z = U.z))
        : ((C.vel.x += (Z / oe) * fe), (C.vel.z += (J / oe) * fe)),
        (r = C.onGround ? Mt.coyote : Math.max(0, r - F)),
        (a = re && X.pressed("jump") ? Mt.jumpBuffer : Math.max(0, a - F)),
        a > 0 &&
          r > 0 &&
          (!C.crouching || G()) &&
          ((C.vel.y = rC),
          (a = 0),
          (r = 0),
          (C.onGround = !1),
          (C.crouching = !1),
          (o = Mt.standHeight),
          i.events.emit("player:jump", { pos: C.pos })),
        (C.vel.y -= Mt.gravity * F * 0.5),
        C.vel.y < -40 && (C.vel.y = -40);
      let le = C.vel.y,
        R = i.physics.moveCapsule(C.pos, C.vel, F, Pi.radius, o, l) || {};
      R.onGround || (C.vel.y -= Mt.gravity * F * 0.5);
      let I = i.physics.bounds;
      if (
        (I &&
          ((C.pos.x = Zn(C.pos.x, I.min.x + 0.4, I.max.x - 0.4)),
          (C.pos.z = Zn(C.pos.z, I.min.z + 0.4, I.max.z - 0.4))),
        (C.onGround = !!R.onGround),
        R.surface && (q = R.surface),
        C.onGround)
      ) {
        if (!l && c > 0.12) {
          let ce = Math.max(0, -le, u);
          (g.v -= Math.min(ce * Mt.landDip, 3.2)),
            ce > 7.5 && C.addShake(Math.min(0.5, (ce - 7.5) * 0.06)),
            i.events.emit("player:land", {
              speed: ce,
              surface: j(),
              pos: C.pos,
            }),
            ce > 13 && C.damage((ce - 13) * 7, null),
            (h = 0.35);
        }
        (c = 0),
          (u = 0),
          C.pos.x <= oi.quayX - 1.2 && C.pos.y > -0.5 && D.copy(C.pos);
      } else (c += F), (u = Math.max(u, -C.vel.y));
      (l = C.onGround),
        C.pos.y < oi.seaY - 2.2 &&
          (C.pos.copy(D),
          C.vel.set(0, 0, 0),
          (C.onGround = !0),
          (l = !0),
          (_ = 0.6),
          (C.yaw += Math.PI),
          C.damage(12, null),
          i.events.emit("player:rescued", {})),
        (C.speed = Math.hypot(C.vel.x, C.vel.z));
      let se = C.crouching
        ? Mt.stride.crouch
        : C.sprinting
          ? Mt.stride.sprint
          : Mt.stride.walk;
      if (C.onGround && C.speed > 0.5) {
        let ce = h;
        (h += (C.speed * F) / se),
          Math.floor(h) > Math.floor(ce) &&
            i.events.emit("player:step", {
              surface: j(),
              sprint: C.sprinting,
              pos: C.pos,
            });
      } else C.onGround && (h = kn(h, Math.round(h), 8, F));
      let ae = C.onGround
        ? Fo(C.speed / Mt.walk) *
          (C.sprinting ? Mt.bobSprint : 1) *
          bi(1, Mt.bobAds, C.ads) *
          (C.crouching ? 0.7 : 1)
        : 0;
      (f = kn(f, ae, 9, F)),
        (d = -Math.cos(h * Math.PI * 2) * Mt.bobY * f),
        (p = Math.sin(h * Math.PI) * Mt.bobX * f);
      let k = C.vel.x * Y - C.vel.z * V;
      (v = kn(v, (-k / Mt.sprint) * Mt.rollStrafe * bi(1, 0.4, C.ads), 8, F)),
        (E += F),
        E > Mt.regenDelay &&
          C.health < C.maxHealth &&
          (C.health = Math.min(C.maxHealth, C.health + Mt.regenRate * F)),
        K(F),
        ie(F);
    }
    function Q(F) {
      (C.vel.x = kn(C.vel.x, 0, 5, F)),
        (C.vel.z = kn(C.vel.z, 0, 5, F)),
        (C.vel.y -= Mt.gravity * F);
      try {
        let X = i.physics.moveCapsule(C.pos, C.vel, F, Pi.radius, 0.6, l);
        l = !!(X && X.onGround);
      } catch {}
      C.pos.y < oi.seaY - 1 && ((C.pos.y = oi.seaY - 1), (C.vel.y = 0)),
        (C.speed = 0),
        (C.sprinting = !1),
        (f = kn(f, 0, 10, F)),
        (p *= 0.9),
        (d *= 0.9);
    }
    function K(F) {
      let X = C.crouching ? Pi.crouchEye : Pi.eye,
        ne = 0,
        re = 0;
      if (C.alive) F > 0 ? (s = kn(s, X, Mt.eyeRate, F)) : (s = X);
      else {
        let Z = sl(0, 0.85, z),
          J = Z * Z;
        (X = bi(Pi.eye, 0.22, J)),
          (s = kn(s, X, 18, F)),
          (ne = 1.15 * J),
          (re = -0.25 * Z + 0.12 * Math.sin(Z * Math.PI));
      }
      if (F > 0) {
        let Z = -g.x * 150 - g.v * 17;
        (g.v += Z * F),
          (g.x += g.v * F),
          (g.x = Zn(g.x, -Mt.landDipMax, 0.05)),
          (A -= F),
          A <= 0 &&
            ((x = kn(x, 0, Mt.recoilRecover, F)),
            (y = kn(y, 0, Mt.recoilRecover, F))),
          (b = kn(b, x, Mt.recoilApply, F)),
          (m = kn(m, y, Mt.recoilApply, F)),
          (_ = Math.max(0, _ - Mt.shakeDecay * F)),
          (M += F);
      }
      let $ = Math.sin(C.yaw),
        ue = Math.cos(C.yaw);
      C.eye.set(C.pos.x + p * ue, C.pos.y + s + d + g.x, C.pos.z - p * $);
      let me = Zn(C.pitch + b, -1.55, 1.55),
        ee = C.yaw + m;
      T.set(me, ee, 0, "YXZ"), C.forward.set(0, 0, -1).applyEuler(T);
      let B = _ * _,
        P = M,
        V =
          B *
          Mt.shakePitch *
          (Math.sin(P * 43.1) + 0.6 * Math.sin(P * 71.7 + 1.3)),
        Y =
          B *
          Mt.shakeYaw *
          (Math.sin(P * 37.3 + 2.1) + 0.6 * Math.sin(P * 83.9)),
        L =
          B *
          Mt.shakeRoll *
          (Math.sin(P * 29.7 + 0.7) + 0.5 * Math.sin(P * 61.3 + 4));
      if (
        (e.position.copy(C.eye),
        e.rotation.set(
          me + V + re + g.x * 0.12,
          ee + Y,
          v + L + ne + p * 0.35,
          "YXZ",
        ),
        !i.params || !i.params.fov)
      ) {
        let Z = bi(
          C.baseFov + (C.sprinting ? Mt.fovSprint : 0),
          Mt.fovAds,
          C.ads,
        );
        (H = F > 0 ? kn(H, Z, C.ads > 0.02 && C.ads < 0.98 ? 30 : 7, F) : Z),
          Math.abs(e.fov - H) > 0.01 &&
            ((e.fov = H), e.updateProjectionMatrix());
      }
    }
    function ie(F) {
      (w = Math.max(0, w - F * 1.9)), (C.hurtPulse = w);
      let X = C.alive ? sl(0.55, 0.12, C.health / C.maxHealth) : 1;
      S = kn(S, X, 4, F);
      let ne = t();
      (ne.damage = w), (ne.lowHealth = S), (ne.ads = C.ads);
    }
    return C;
  }
  function zv(i) {
    let e = { shots: 0, hits: 0, kills: 0 };
    return (
      i.events.on("enemy:killed", () => {
        e.kills++;
      }),
      {
        stats: e,
        reset() {
          e.shots = e.hits = e.kills = 0;
        },
        playerShot(
          n,
          s,
          { damage: o = 28, range: r = 300, impulse: a = 1 } = {},
        ) {
          if (i.net && i.net.active) {
            e.shots++;
            const l = i.physics.raycast(n, s, r);
            const c = i.enemies.raycast(n, s, l ? l.dist : r);
            i.net.sendFire(n, s);
            if (c)
              return {
                dist: c.dist,
                point: c.point,
                normal: c.normal,
                surface: "enemy",
                enemy: c.enemy,
                part: c.part,
                dir: s,
                from: "player",
                killed: !1,
                visual: !0,
              };
            if (l)
              return {
                dist: l.dist,
                point: l.point,
                normal: l.normal,
                surface: l.surface,
                enemy: null,
                dir: s,
                from: "player",
                visual: !0,
              };
            return null;
          }
          e.shots++;
          let l = i.physics.raycast(n, s, r),
            c = i.enemies.raycast(n, s, l ? l.dist : r);
          if (c) {
            e.hits++;
            let u = c.part === "weak" ? 2.2 : 1,
              h = c.enemy.damage(o * u, c.point, s, c.part) === !0,
              f = {
                point: c.point,
                normal: c.normal || s.clone().negate(),
                dist: c.dist,
                surface: "enemy",
                enemy: c.enemy,
                part: c.part,
                dir: s,
                from: "player",
                killed: h,
              };
            return (
              i.events.emit("impact", f),
              i.events.emit("player:hitEnemy", {
                enemy: c.enemy,
                part: c.part,
                killed: h,
                weak: c.part === "weak",
              }),
              f
            );
          }
          if (l) {
            let u = {
              point: l.point,
              normal: l.normal,
              dist: l.dist,
              surface: l.surface,
              enemy: null,
              dir: s,
              from: "player",
            };
            return i.events.emit("impact", u), u;
          }
          return null;
        },
        enemyShot(n, s, { damage: o = 6, range: r = 200 } = {}) {
          let a = i.physics.raycast(n, s, r),
            l = a ? a.dist : r,
            c = i.player;
          if (c && c.alive) {
            let u = nm.copy(c.pos);
            u.y += 1;
            let h = u.sub(n).dot(s);
            if (h > 0 && h < l) {
              zf.copy(n).addScaledVector(s, h);
              let f = Math.abs(zf.y - (c.pos.y + 0.95));
              if (Math.hypot(zf.x - c.pos.x, zf.z - c.pos.z) < 0.38 && f < 0.95)
                return c.damage(o, n), !0;
            }
          }
          return (
            a &&
              i.events.emit("impact", {
                point: a.point,
                normal: a.normal,
                dist: a.dist,
                surface: a.surface,
                enemy: null,
                dir: s,
                from: "enemy",
              }),
            !1
          );
        },
        explode(n, s = 5, o = 80, r = "player") {
          for (let l of i.enemies.list) {
            if (!l.alive) continue;
            let c = l.pos.distanceTo(n);
            c < s &&
              i.physics.lineOfSight(n, nm.copy(l.pos).setY(l.pos.y + 0.5)) &&
              l.damage(
                o * (1 - c / s),
                l.pos,
                zf.copy(l.pos).sub(n).normalize(),
                "body",
              );
          }
          let a = i.player;
          if (a && a.alive) {
            let l = nm
              .copy(a.pos)
              .setY(a.pos.y + 1)
              .distanceTo(n);
            l < s &&
              i.physics.lineOfSight(n, nm.copy(a.pos).setY(a.pos.y + 1)) &&
              a.damage(o * 0.5 * (1 - l / s), n);
          }
        },
      }
    );
  }
  var nm = new W(),
    zf = new W();
  var ex = {};
  br(ex, { TUNE: () => Ui, create: () => Em, showcase: () => VC });
  var Ui = ENEMY_TUNE,
    BC = Math.cos(((Ui.sightCone / 2) * Math.PI) / 180),
    oM = new W(),
    pz = new W(),
    Qv = new W(),
    rM = new Lt(),
    aM = new Ye(),
    lM = new W(1, 1, 1),
    OC = new W(0, 0, 1),
    mz = new W(0, -1, 0),
    cM = new W(),
    uM = new W();
  async function Em(i) {
    let e = il(+((i.params && i.params.eseed) || 9001)),
      t = [],
      n = [],
      s = new wt();
    (s.name = "enemies"), i.scene.add(s);
    let o = i.mats.emissive(16777215, 1),
      r = o && o.isMeshBasicMaterial ? o.clone() : new Nn();
    r.color.setRGB(1, 1, 1), (r.vertexColors = !0), (r.needsUpdate = !0);
    let a = i.mats.emissive(16752704, 6),
      l = a && a.isMeshBasicMaterial ? a : new Nn({ color: 16752704 }),
      c = o && o.toneMapped !== void 0 ? o.toneMapped : !0,
      u = {
        shell: i.mats.get("armor_white", { triplanar: !0, vertexColors: !0 }),
        metal: i.mats.get("gunmetal", { triplanar: !0, vertexColors: !0 }),
        glow: r,
        lensBase: l,
        disc: new Nn({
          color: 789775,
          transparent: !0,
          opacity: 0.42,
          depthWrite: !1,
          side: Sn,
          toneMapped: c,
        }),
        cone: new zn({
          uniforms: {
            uColor: { value: new Ve(1, 0.9, 0.74) },
            uGain: { value: 0.085 },
          },
          vertexShader: `
        #include <common>
        #include <skinning_pars_vertex>
        varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          #include <beginnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
          vN = normalMatrix * objectNormal; vV = -mv.xyz; vT = 1.0 - uv.y;
          gl_Position = projectionMatrix * mv;
        }`,
          fragmentShader: `
        uniform vec3 uColor; uniform float uGain;
        varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = abs(dot(normalize(vN), normalize(vV)));
          f = f * f * (3.0 - 2.0 * f);
          float t = clamp(vT, 0.0, 1.0);
          float k = pow(1.0 - t, 1.7) * (0.35 + 0.65 * smoothstep(0.0, 0.06, t));
          gl_FragColor = vec4(uColor * (uGain * f * k), 1.0);
        }`,
          transparent: !0,
          blending: hr,
          depthWrite: !1,
          side: Sn,
          fog: !1,
        }),
      },
      h = {
        G: i,
        rng: e,
        list: t,
        t: 0,
        playerSpeed: 0,
        tokens: 0,
        tokenT: -9,
        lastType: "",
        wantT: { gull: -9, hound: -9 },
        mergeSimple: (T) => sa(T, !1),
        requestToken(T) {
          if (T.hasToken) return !0;
          let D = 0;
          for (let Q of t) Q.alive && D++;
          let C = D > 5 ? Ui.maxTokensCrowd : Ui.maxTokens,
            G = h.t - h.tokenT,
            j = T.type === "gull" ? "hound" : "gull",
            N =
              h.lastType === T.type &&
              h.t - h.wantT[j] < 0.5 &&
              G < Ui.tokenGap * 2.2;
          return h.tokens >= C || G < Ui.tokenGap || N
            ? ((h.wantT[T.type] = h.t), !1)
            : (h.tokens++,
              (h.tokenT = h.t),
              (h.lastType = T.type),
              (T.hasToken = !0),
              !0);
        },
        releaseToken(T) {
          T.hasToken &&
            ((T.hasToken = !1), (h.tokens = Math.max(0, h.tokens - 1)));
        },
        think(T, D, C) {
          let G = i.player;
          if (T.passive || !G) {
            T.los = !1;
            return;
          }
          if (((T.senseT -= D), T.senseT <= 0)) {
            T.senseT = 0.11 + e() * 0.08;
            let j = !1;
            if (G.alive !== !1) {
              let N = G.eye || G.pos,
                Q = N.x - T.sensor.x,
                K = N.y - T.sensor.y,
                ie = N.z - T.sensor.z,
                F = Math.hypot(Q, K, ie);
              if (F < Ui.sightRange) {
                let X = Math.hypot(Q, ie) || 1e-4,
                  ne = (Q * T.fwd.x + ie * T.fwd.z) / X;
                (T.mode === "engage" || ne > BC || F < 3.5) &&
                  (j = i.physics.lineOfSight(T.sensor, N));
              }
            }
            T.los = j;
          }
          T.los
            ? ((T.seeT += D),
              (T.noSeeT = 0),
              T.lastKnown.copy(G.pos),
              (T.exposure = Math.min(1, T.exposure + D * Ui.exposureUp)))
            : ((T.noSeeT += D),
              (T.seeT = Math.max(0, T.seeT - D * 0.6)),
              (T.exposure = Math.max(0, T.exposure - D * Ui.exposureDown))),
            T.mode === "engage"
              ? (T.noSeeT > Ui.loseSight || G.alive === !1) &&
                ((T.mode = "search"),
                (T.modeT = Ui.searchTime + e() * 3),
                h.releaseToken(T))
              : T.los && T.seeT > (T.mode === "patrol" ? C : C * 0.45)
                ? ((T.mode = "engage"),
                  (T.noSeeT = 0),
                  i.events.emit("enemy:alert", { enemy: T }),
                  h.rally(T.pos, 18, G.pos, T))
                : T.mode !== "patrol" &&
                  ((T.modeT -= D),
                  T.modeT <= 0 &&
                    ((T.mode = "patrol"),
                    (T.home.x = T.pos.x),
                    (T.home.z = T.pos.z)));
        },
        rally(T, D, C, G) {
          for (let j of t)
            j === G ||
              !j.alive ||
              j.passive ||
              j.mode === "engage" ||
              j.pos.distanceToSquared(T) > D * D ||
              (j.lastKnown.copy(C),
              (j.mode = "investigate"),
              (j.modeT = 9 + e() * 4));
        },
        provoke(T) {
          let D = i.player;
          !D ||
            T.passive ||
            !T.alive ||
            (T.mode !== "engage" &&
              (T.lastKnown.copy(D.pos),
              (T.mode = "investigate"),
              (T.modeT = 10),
              (T.seeT = 1),
              (T.senseT = 0)),
            h.rally(T.pos, 20, D.pos, T));
        },
        fireBolt(T, D, C) {
          let G = null;
          for (let j = 0; j < g.length; j++)
            if (!g[j].on) {
              G = g[j];
              break;
            }
          G &&
            ((G.on = !0),
            (G.life = 1.3),
            G.pos.copy(T),
            G.dir.copy(D),
            G.from.copy(T),
            (G.len = 0));
        },
        addWreck(T) {
          for (n.push(T); n.length > Ui.maxWrecks; ) {
            let D = n.shift();
            D.active && (D.sink = 0.001);
          }
        },
        retire(T) {
          T._deactivate();
          let D = t.indexOf(T);
          D >= 0 && t.splice(D, 1),
            (D = n.indexOf(T)),
            D >= 0 && n.splice(D, 1);
        },
      },
      f = j_(),
      p = Z_(),
      d = [],
      v = [];
    for (let T = 0; T < Ui.poolGulls; T++) {
      let D = Q_(h, f, u, T);
      d.push(D), s.add(D.rig.group);
    }
    for (let T = 0; T < Ui.poolHounds; T++) {
      let D = iM(h, p, u, T);
      v.push(D), s.add(D.rig.group);
    }
    let g = [];
    for (let T = 0; T < Ui.maxBolts; T++)
      g.push({
        on: !1,
        life: 0,
        len: 0,
        pos: new W(),
        dir: new W(),
        from: new W(),
      });
    let x = new Ys(0.016, 0.03, 1, 6, 1);
    x.rotateX(Math.PI / 2), x.translate(0, 0, -0.5);
    let y = i.mats.emissive(16738858, 14),
      b =
        y && y.isMeshBasicMaterial
          ? y
          : new Nn({ color: new Ve(16738858).multiplyScalar(14) }),
      m = new Sr(x, b, Ui.maxBolts);
    (m.frustumCulled = !1),
      (m.castShadow = !1),
      (m.receiveShadow = !1),
      (m.count = 0),
      m.instanceMatrix.setUsage(bo),
      s.add(m);
    let A = {
      point: new W(),
      normal: new W(),
      dist: 0,
      surface: "concrete",
      enemy: null,
      part: null,
      dir: new W(),
      from: "enemy",
    };
    function _(T) {
      let D = i.player,
        targets = i.players && i.players.length ? i.players : D ? [D] : [],
        C = 0;
      for (let G = 0; G < g.length; G++) {
        let j = g[G];
        if (!j.on) continue;
        let N = Ui.gull.boltSpeed * T;
        j.life -= T;
        let Q = i.physics.raycast(j.pos, j.dir, N),
          K = Q ? Q.dist : N,
          ie = !1,
          hitTarget = null;
        for (const target of targets) {
          if (!target || target.alive === false) continue;
          oM.copy(j.pos).addScaledVector(j.dir, K);
          cM.set(target.pos.x, target.pos.y + 0.35, target.pos.z);
          uM.set(
            target.pos.x,
            target.pos.y + (target.crouching ? 1 : 1.5),
            target.pos.z,
          );
          if (HC(j.pos, oM, cM, uM) < 0.36 * 0.36) {
            ie = true;
            hitTarget = target;
            break;
          }
        }
        if (ie) {
          hitTarget.damage(Ui.gull.boltDamage, j.from), (j.on = !1);
          continue;
        }
        if (Q) {
          A.point.copy(Q.point),
            A.normal.copy(Q.normal),
            (A.dist = Q.dist),
            (A.surface = Q.surface),
            A.dir.copy(j.dir),
            i.events.emit("impact", A),
            (j.on = !1);
          continue;
        }
        if (j.life <= 0) {
          j.on = !1;
          continue;
        }
        j.pos.addScaledVector(j.dir, N),
          (j.len = Math.min(1.5, j.len + N)),
          rM.setFromUnitVectors(OC, j.dir),
          lM.set(1, 1, Math.max(0.2, j.len)),
          aM.compose(j.pos, rM, lM),
          m.setMatrixAt(C++, aM);
      }
      (C || m.count) && ((m.count = C), (m.instanceMatrix.needsUpdate = !0));
    }
    let M = null,
      E = !1,
      w = 0,
      S = new W(),
      z = 0;
    function H(T) {
      if (!E) {
        E = !0;
        try {
          M =
            i.render && i.render.lightPool && i.render.lightPool.acquire
              ? i.render.lightPool.acquire()
              : null;
        } catch {
          M = null;
        }
        M &&
          M.light &&
          (M.light.color.setRGB(1, 0.9, 0.75), (M.light.distance = 9));
      }
      if (!M || !M.light) return;
      let D = null,
        C = 3600,
        G = i.camera ? i.camera.position : null;
      for (let N of t) {
        if (N.type !== "gull" || !N.alive) continue;
        let Q = G ? N.pos.distanceToSquared(G) : 0;
        Q < C && ((C = Q), (D = N));
      }
      let j = 0;
      if (D) {
        if (((w -= T), w <= 0)) {
          w = 0.1;
          let N = D.yaw + D.gy,
            Q = Math.cos(D.gp);
          Qv.set(Math.sin(N) * Q, -Math.sin(D.gp), Math.cos(N) * Q).normalize();
          let K = i.physics.raycast(D.sensor, Qv, 14);
          S.copy(D.sensor).addScaledVector(Qv, (K ? K.dist : 8) - 0.6),
            (z = K ? 1 : 0.3);
        }
        (j = 26 * z), M.light.position.lerp(S, 1 - Math.exp(-12 * T));
      }
      M.light.intensity += (j - M.light.intensity) * (1 - Math.exp(-8 * T));
    }
    let O = 1,
      q = 0,
      U = {
        list: t,
        TUNE: Ui,
        spawn(T, D, C = {}) {
          let G = T === "gull" ? d : T === "hound" ? v : null;
          if (!G) return null;
          let j = null;
          for (let N of G)
            if (!N.active) {
              j = N;
              break;
            }
          if (!j && T === "hound" && n.length) {
            let N = n[0];
            h.retire(N), (j = N);
          }
          return j
            ? ((j.id = O++),
              t.push(j),
              j._activate(D, C),
              i.events.emit("enemy:spawn", { enemy: j }),
              j)
            : null;
        },
        byId(T) {
          return t.find((D) => D.id === T) || null;
        },
        spawnRemote(T, D, C, G) {
          const j = U.spawn(D, C, {
            state: G === "patrol" ? "patrol" : "alert",
            passive: !0,
          });
          if (!j) return null;
          (j.id = T), (j.isRemote = !0), (j.remoteSpeed = 0);
          if (G) j.mode = G;
          return j;
        },
        applyRemote(T, D) {
          if (!D) return null;
          let C = U.byId(T);
          if (!C)
            C = U.spawnRemote(
              T,
              D.type,
              new W(D.pos[0], D.pos[1], D.pos[2]),
              D.mode,
            );
          if (!C) return null;
          C.isRemote = !0;
          C.pos.set(D.pos[0], D.pos[1], D.pos[2]);
          C.yaw = D.yaw;
          C.mode = D.mode;
          C.hp = D.hp;
          C.remoteSpeed = D.speed || 0;
          if (D.hp > 0) {
            C.alive = !0;
            C.active = !0;
          } else if (C.alive) {
            U.killRemote(T);
          }
          return C;
        },
        killRemote(T) {
          const D = U.byId(T);
          if (!D || !D.alive) return;
          (D.alive = !1), (D.dieT = 0);
          if (D.type === "gull" && (D.lostRotor == null || D.lostRotor < 0))
            D.lostRotor = 0;
          if (D.type === "hound") (D.wreck = !1), (D.sink = 0);
        },
        removeRemote(T) {
          const D = U.byId(T);
          if (D) D._deactivate();
        },
        raycast(T, D, C = 300) {
          let G = null;
          for (let j = 0; j < t.length; j++) {
            let N = t[j];
            if (!N.alive) continue;
            let Q = N.pos.x - T.x,
              K = N.pos.y + (N.type === "hound" ? 0.6 : 0) - T.y,
              ie = N.pos.z - T.z,
              F = Q * D.x + K * D.y + ie * D.z;
            F < -1.5 ||
              F > C + 1.5 ||
              Q * Q + K * K + ie * ie - F * F > 1.7 ||
              (G ||
                (G = {
                  dist: 1 / 0,
                  point: new W(),
                  normal: new W(),
                  enemy: null,
                  part: "body",
                }),
              N._raycast(T, D, C, G));
          }
          return G && G.enemy ? G : null;
        },
        aliveCount() {
          let T = 0;
          for (let D of t) D.alive && T++;
          return T;
        },
        clear() {
          for (let T of d) T.active && T._deactivate();
          for (let T of v) T.active && T._deactivate();
          (t.length = 0), (n.length = 0), (h.tokens = 0);
          for (let T of g) T.on = !1;
          (m.count = 0), M && M.light && (M.light.intensity = 0);
        },
        alert(T, D = 40) {
          for (let C of t)
            !C.alive ||
              C.passive ||
              C.mode === "engage" ||
              C.pos.distanceToSquared(T) > D * D ||
              (C.lastKnown.copy(T),
              (C.lastKnown.y = Math.max(0, T.y - 1.6)),
              C.mode === "patrol" &&
                i.events.emit("enemy:alert", { enemy: C, noise: !0 }),
              (C.mode = "investigate"),
              (C.modeT = 9 + e() * 4));
        },
        update(T) {
          if (T <= 0) return;
          T > 0.05 && (T = 0.05), (h.t += T), (q -= T);
          let D = i.player;
          if (i.players && i.players.length) D = i.players[0];
          if (D) {
            let C = D.vel ? Math.hypot(D.vel.x, D.vel.z) : D.speed || 0;
            h.playerSpeed += (C - h.playerSpeed) * (1 - Math.exp(-6 * T));
          }
          for (let C = t.length - 1; C >= 0; C--) {
            const enemy = t[C];
            if (i.players && i.players.length) {
              let best = i.players[0],
                bestD = Infinity;
              for (const p of i.players) {
                if (!p || p.alive === false) continue;
                const dx = p.pos.x - enemy.pos.x;
                const dz = p.pos.z - enemy.pos.z;
                const d2 = dx * dx + dz * dz;
                if (d2 < bestD) {
                  bestD = d2;
                  best = p;
                }
              }
              i.player = best;
            }
            enemy._update(T);
          }
          _(T), H(T);
        },
        debug: {
          ctx: h,
          gulls: d,
          hounds: v,
          wrecks: n,
          bolts: g,
          mats: u,
          tris: { gull: f.tris + f.extra.tris, hound: p.tris },
        },
      };
    return (
      i.events.on("weapon:fire", (T) => {
        if (q > 0) return;
        q = 0.3;
        let D = (T && (T.origin || T.muzzle)) || (i.player && i.player.pos);
        D && U.alert(D, Ui.hearRadius);
      }),
      i.events.on("explosion", (T) => {
        T && T.pos && U.alert(T.pos, 30);
      }),
      i.events.on("game:state", (T) => {
        T && T.state === "title" && U.clear();
      }),
      U
    );
  }
  var o0 = new W(),
    r0 = new W(),
    a0 = new W();
  function HC(i, e, t, n) {
    o0.copy(e).sub(i), r0.copy(n).sub(t), a0.copy(i).sub(t);
    let s = o0.dot(o0),
      o = r0.dot(r0),
      r = r0.dot(a0),
      a,
      l;
    if (s <= 1e-9 && o <= 1e-9) return a0.dot(a0);
    if (s <= 1e-9) (a = 0), (l = Math.min(1, Math.max(0, r / o)));
    else {
      let f = o0.dot(a0);
      if (o <= 1e-9) (l = 0), (a = Math.min(1, Math.max(0, -f / s)));
      else {
        let p = o0.dot(r0),
          d = s * o - p * p;
        (a = d > 1e-9 ? Math.min(1, Math.max(0, (p * r - f * o) / d)) : 0),
          (l = (p * a + r) / o),
          l < 0
            ? ((l = 0), (a = Math.min(1, Math.max(0, -f / s))))
            : l > 1 && ((l = 1), (a = Math.min(1, Math.max(0, (p - f) / s))));
      }
    }
    let c = a0.x + o0.x * a - r0.x * l,
      u = a0.y + o0.y * a - r0.y * l,
      h = a0.z + o0.z * a - r0.z * l;
    return c * c + u * u + h * h;
  }
  async function VC(i) {
    let e = await Em(i);
    i.enemies = e;
    let t = (l, c, u) => new W(l, c, u),
      n = i.params.eshow || "both",
      s = [3, 1.45, 3.9],
      o = [0.5, 0.95, 0],
      r = 2.6;
    if (n === "gull")
      e.spawn("gull", t(0, 1.6, 0), {
        passive: !0,
        hover: 1.6,
        patrolRadius: 0.02,
        yaw: 0.7,
      }),
        (s = [1.25, 1.95, 1.45]),
        (o = [0, 1.52, 0]),
        (r = 1.2);
    else if (n === "hound")
      e.spawn("hound", t(0, 0, 0), {
        passive: !0,
        yaw: 0.9,
        patrolLine: [t(1.6, 0, 1.3), t(-1.6, 0, -1.3)],
      }),
        (s = [2.1, 1, 2.3]),
        (o = [0.5, 0.62, 0.4]),
        (r = 1.25);
    else if (n === "fight")
      e.spawn("hound", t(-7, 0, -9), { state: "alert" }),
        e.spawn("hound", t(8, 0, -7), { state: "alert" }),
        e.spawn("hound", t(0, 0, -14), { state: "alert" }),
        e.spawn("gull", t(-5, 6, -13), { state: "alert" }),
        e.spawn("gull", t(9, 6, -11), { state: "alert" }),
        (s = [5, 2.6, 10]),
        (o = [0, 2.2, -5]),
        (r = 7);
    else if (n === "dead") {
      let l = e.spawn("hound", t(0, 0, 0), { passive: !0, yaw: 0.8 }),
        c = e.spawn("gull", t(-1.6, 3.4, -0.5), {
          passive: !0,
          hover: 3.4,
          patrolRadius: 0.02,
        });
      e.spawn("hound", t(2.2, 0, -1.6), {
        passive: !0,
        yaw: -0.6,
        patrolLine: [t(2.2, 0, -1.6), t(3.4, 0, -3)],
      });
      for (let u = 0; u < 30; u++) e.update(1 / 60);
      l.damage(999, l.pos, t(0.6, 0, -0.8), "body");
      for (let u = 0; u < 110; u++) e.update(1 / 60);
      c.damage(999, c.pos, t(0, 0, 1), "body"),
        (s = [2.6, 1.3, 3.2]),
        (o = [0, 0.5, 0]),
        (r = 0.42);
    } else
      e.spawn("gull", t(-0.9, 2.2, -0.2), {
        passive: !0,
        hover: 2.2,
        patrolRadius: 0.25,
        yaw: 0.5,
      }),
        e.spawn("hound", t(0.2, 0, 0.6), {
          passive: !0,
          yaw: 1.2,
          patrolLine: [t(2.6, 0, 1.2), t(-1.8, 0, 0.2)],
        });
    i.params.epre != null && (r = +i.params.epre);
    for (let l = 0, c = Math.round(r * 60); l < c; l++) e.update(1 / 60);
    let a = !!i.params.efreeze;
    return {
      cam: s,
      target: o,
      update(l) {
        a || e.update(l);
      },
    };
  }
  var gM = {
    mats: qg,
    level: cv,
    backdrop: mv,
    ground: vv,
    fx: Sv,
    weapon: Xv,
    enemies: ex,
    props: $g,
    render: Vg,
  };
  if (typeof window !== "undefined") {
    window.__frames = 0;
    window.__ready = !1;
    window.__fatal = null;
    window.__errors = [];
  }
  var vM = null,
    xM = null,
    yM = null;
  if (typeof document !== "undefined") {
    vM = document.getElementById("boot");
    xM = document.getElementById("boot-msg");
    yM = document.getElementById("boot-fill");
    try {
      xM && (xM.textContent = tr("boot_raising"));
    } catch {}
  }
  function bM(i) {
    if (typeof window !== "undefined") window.__fatal = String(i);
    console.error("[fatal] " + i);
    if (typeof document === "undefined") return;
    let e = document.getElementById("fatal");
    e ||
      ((e = document.createElement("div")),
      (e.id = "fatal"),
      document.getElementById("app").appendChild(e)),
      (e.textContent = tr("boot_fatal") + i);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("error", (i) => {
      window.__errors.push(String(i.message));
    });
    {
      let i = console.error.bind(console);
      console.error = (...e) => {
        try {
          window.__errors.push(
            e
              .map((t) => (t && t.stack) || String(t))
              .join(" ")
              .slice(0, 400),
          );
        } catch {}
        i(...e);
      };
    }
  }
  var KC = () => new Promise((i) => setTimeout(i, 0));
  async function Nr(i, e) {
    xM && (xM.textContent = i),
      yM && (yM.style.width = Math.round(e * 100) + "%"),
      await KC();
  }
  async function QC() {
    let i = Object.fromEntries(new URLSearchParams(location.search)),
      e = !!i.bench || location.hash === "#bench";
    e && ((i.noaudio = "1"), (i.autostart = "1"));
    let t = {
      THREE: lt,
      params: i,
      events: Dy(),
      rng: il(+(i.seed || 4207)),
      time: { t: 0, dt: 0, frame: 0, real: 0 },
      quality: zy(i.q || (i.shot ? "test" : "")),
    };
    window.__G = t;
    let n = i.show && gM[i.show] ? i.show : null;
    t.showcase = n;
    let s = null;
    function o(h) {
      if (h.cam) {
        let f = String(h.cam).split(",").map(Number);
        s = {
          pos: new W(f[0], f[1], f[2]),
          look: new W(f[3] ?? 0, f[4] ?? 1, f[5] ?? 0),
        };
      }
      h.cam === "" && (s = null),
        h.fov && ((t.camera.fov = +h.fov), t.camera.updateProjectionMatrix()),
        h.exposure && (t.render.exposure = +h.exposure);
    }
    window.__setShot = o;
    async function r(h, f, p, d = !1) {
      let v = performance.now();
      try {
        t[h] = await p();
      } catch (x) {
        if (
          (console.error(`[boot] module "${h}" failed: ${(x && x.stack) || x}`),
          d || !dr[h])
        )
          throw x;
        t[h] = dr[h]();
      }
      let g = performance.now() - v;
      g > 150 && console.log(`[boot] ${h} ${g.toFixed(0)}ms`);
    }
    if (
      (await Nr(tr("boot_renderer"), 0.04),
      await r("render", "render", () => Hg(t), !0),
      (t.renderer = t.render.renderer),
      (t.scene = t.render.scene),
      (t.camera = t.render.camera),
      (t.viewCamera = t.render.viewCamera),
      await Nr(tr("boot_materials"), 0.12),
      await r("mats", "materials", () => Gg(t)),
      (t.physics = createPhysics(t)),
      (t.props = Yg(t)),
      (t.input = n ? tP() : v_(t)),
      n)
    ) {
      let h = Qi(new rn(80, 80).rotateX(-Math.PI / 2), t.mats.get("concrete"), {
        cast: !1,
      });
      if (
        (t.scene.add(h),
        (t.level = {
          stub: !0,
          playerStart: { pos: new W(0, 0, 4), yaw: 0 },
          objectives: [],
          enemySpawns: [],
          zones: [],
          interiorBoxes: [],
          cinematicPath: [],
          extraction: { pos: new W(), radius: 2 },
          groundSurfaceAt: () => "concrete",
          update() {},
        }),
        (t.backdrop = dr.backdrop()),
        (t.ground = dr.ground()),
        t.physics.build(),
        n === "fx")
      )
        await r("fx", "fx", () => Cf(t));
      else
        try {
          t.fx = await Cf(t);
        } catch {
          t.fx = dr.fx();
        }
      (t.audio = dr.audio()),
        (t.hud = dr.hud()),
        (t.player = nP(t)),
        (t.combat = zv(t)),
        (t.weapon = dr.weapon()),
        (t.enemies = dr.enemies()),
        (t.game = { state: "showcase", update: () => !1, start() {} });
      let f = null;
      try {
        f = await gM[n].showcase(t);
      } catch (p) {
        bM(`showcase "${n}" threw: ${(p && p.stack) || p}`);
      }
      (t.showcaseInfo = f || {}),
        f &&
          f.cam &&
          o({ cam: [...f.cam, ...(f.target || [0, 1, 0])].join(",") });
    } else {
      if (
        (await Nr(tr("boot_containers"), 0.34),
        await r("level", "level", () => C1(t), !0),
        await Nr(tr("boot_cranes"), 0.5),
        await r("backdrop", "backdrop", () => pv(t)),
        await Nr(tr("boot_apron"), 0.58),
        await r("ground", "ground", () => O1(t)),
        t.ground.stub)
      ) {
        let h = Qi(
          new rn(400, 400).rotateX(-Math.PI / 2),
          t.mats.get("asphalt"),
          { cast: !1 },
        );
        t.scene.add(h);
      }
      t.physics.build(),
        await Nr(tr("boot_city"), 0.62),
        i.nocity
          ? (t.city = dr.city())
          : await r("city", "city", () => createCity(t), !0),
        t.city &&
          t.city.update(0, (t.player && t.player.pos) || { x: -32, y: 0, z: 6 }),
        await Nr(tr("boot_tracers"), 0.66),
        await r("fx", "fx", () => Cf(t)),
        await r("audio", "audio", () => (i.noaudio ? dr.audio() : c_(t))),
        (t.player = x_(t)),
        (() => {
          try {
            t.player.reset && t.player.reset(t.level && t.level.playerStart);
          } catch {}
        })(),
        (t.combat = zv(t)),
        await Nr(tr("boot_rifle"), 0.74),
        await r("weapon", "weapon", () => dm(t)),
        await Nr(tr("boot_harbormaster"), 0.82),
        await r("enemies", "enemies", () => Em(t)),
        await r("hud", "hud", () => hM(t)),
        (t.game = mM(t)),
        t.city &&
          !t.city.stub &&
          (() => {
            try {
              t.cityLife = createCityLife(t);
            } catch (err) {
              console.error(
                "[boot] city life failed: " + ((err && err.stack) || err),
              );
            }
          })(),
        !n &&
          (() => {
            try {
              t.net = new NetClient(t);
            } catch (err) {
              console.error("[boot] net init failed", err);
            }
          })(),
        t.events.on("lang:change", () => {
          try {
            t.game.refreshLabels && t.game.refreshLabels();
          } catch (h) {
            console.error("[i18n] relabel failed", h);
          }
        });
    }
    await Nr(tr("boot_light"), 0.92);
    try {
      await t.render.onLevelReady();
    } catch (h) {
      console.error(
        "[boot] render.onLevelReady failed: " + ((h && h.stack) || h),
      );
    }
    let a = 0;
    if (
      ((window.__stats = () => ({
        ...(t.render.stats ? t.render.stats() : {}),
        fps: a ? +(1 / a).toFixed(1) : 0,
        state: t.game && t.game.state,
      })),
      i.cam && o(i),
      i.fov && o({ fov: i.fov }),
      !n && (i.shot || i.autostart))
    )
      try {
        t.game.start({ skipIntro: !0 });
      } catch (h) {
        console.error("[boot] game.start failed", h);
      }
    i.noweapon && t.weapon.setVisible && t.weapon.setVisible(!1),
      e && eP(t),
      await Nr(tr("boot_ready"), 1),
      vM.classList.add("done"),
      setTimeout(() => {
        vM.hidden = !0;
      }, 700);
    let l = performance.now(),
      c = 1,
      u = (h, f) => {
        let p = t[h];
        if (p && p.update)
          try {
            p.update(f);
          } catch (d) {
            u.err[h] ||
              ((u.err[h] = 1),
              console.error(
                `[loop] ${h}.update threw: ${(d && d.stack) || d}`,
              ));
          }
      };
    (u.err = {}),
      t.renderer.setAnimationLoop(() => {
        // The whole frame is wrapped: setAnimationLoop stops rescheduling the
        // moment its callback throws, and a stopped loop looks exactly like
        // "the player cannot move" with a frozen picture. One bad subsystem
        // must never take the game down, so the frame is isolated and the
        // first failure of each stage is reported once.
        try {
        let h = performance.now(),
          f = (h - l) / 1e3;
        (l = h), (a = a ? a * 0.95 + f * 0.05 : f);
        let p = Math.min(f, 0.05);
        i.dt && (p = +i.dt),
          (t.time.dt = p),
          (t.time.t += p),
          (t.time.real = h / 1e3),
          t.time.frame++,
          u("input", p);
        let d = !1;
        try {
          d =
            t.game.update(p) !== !1 &&
            t.game.state !== "title" &&
            t.game.state !== "paused";
        } catch (v) {
          u.err.game ||
            ((u.err.game = 1),
            console.error(
              "[loop] game.update threw: " + ((v && v.stack) || v),
            ));
        }
        if (n) {
          if (t.showcaseInfo.update)
            try {
              t.showcaseInfo.update(p);
            } catch (v) {
              u.err.sc ||
                ((u.err.sc = 1),
                console.error(
                  "[loop] showcase update threw: " + ((v && v.stack) || v),
                ));
            }
        } else
          d &&
            (u("player", p),
            u("weapon", p),
            u("enemies", p),
            !(t.net && t.net.active) && u("cityLife", p),
            t.net && u("net", p));
        if (
          t.weapon &&
          t.weapon.setWetness &&
          t.level &&
          t.level.interiorBoxes &&
          t.level.interiorBoxes[0]
        ) {
          let v = t.level.interiorBoxes[0],
            g = t.camera.position,
            x =
              g.x > v.min.x &&
              g.x < v.max.x &&
              g.z > v.min.z &&
              g.z < v.max.z &&
              g.y < v.max.y;
          c += ((x ? 0.3 : 1) - c) * Math.min(1, p * (x ? 0.25 : 0.6));
          try {
            t.weapon.setWetness(c);
          } catch {}
        }
        t.game.state !== "paused" &&
          (u("fx", p),
          u("ground", p),
          u("level", p),
          u("backdrop", p),
          u("mats", p)),
          // The city is generated content and can throw (a bad block, a
          // material that fails to compile on some driver). An uncaught throw
          // here kills the requestAnimationFrame chain for good, which reads as
          // "the player cannot move" — so it must never escape this frame.
          t.city &&
            (() => {
              try {
                t.city.update(
                  p,
                  t.player && t.player.pos ? t.player.pos : t.camera.position,
                );
              } catch (err) {
                window.__cityError ||
                  ((window.__cityError = String((err && err.stack) || err)),
                  console.error("[loop] city.update threw: " + window.__cityError));
                t.cityDisabled ||
                  ((t.cityDisabled = !0),
                  t.city.setEnabled && t.city.setEnabled(!1));
              }
            })(),
          u("audio", p),
          u("hud", p),
          s && (t.camera.position.copy(s.pos), t.camera.lookAt(s.look)),
          t.bench && t.bench.frame(f);
        try {
          t.render.frame(p);
        } catch (v) {
          u.err.render ||
            ((u.err.render = 1),
            console.error(
              "[loop] render.frame threw: " + ((v && v.stack) || v),
            ));
        }
        // endFrame() clears per-frame input state. If it ever throws, the
        // exception escapes the animation-loop callback and Three.js never
        // re-schedules it: the whole game freezes on one frame, which the
        // player experiences as "I cannot move any more". Never let that
        // happen — the loop must survive any single subsystem failing.
        try {
          t.input.endFrame && t.input.endFrame();
        } catch (v) {
          u.err.endFrame ||
            ((u.err.endFrame = 1),
            console.error(
              "[loop] input.endFrame threw: " + ((v && v.stack) || v),
            ));
        }
        } catch (e) {
          window.__loopError ||
            ((window.__loopError = String((e && e.stack) || e)),
            console.error("[loop] frame threw: " + window.__loopError));
        }
        // Outside the try: the frame counter must advance even after a failure,
        // otherwise the game looks hung to anything watching it.
        window.__frames++,
          window.__frames === 2 && (window.__ready = !0);
      });
  }
  function eP(i) {
    let e = document.createElement("pre");
    (e.id = "bench"),
      (e.style.cssText =
        'position:absolute;left:12px;top:12px;z-index:90;margin:0;padding:10px 12px;font:12px/1.45 "IBM Plex Mono",ui-monospace,monospace;color:#d8f0d0;background:rgba(0,0,0,.72);white-space:pre-wrap;max-width:min(560px,90vw);pointer-events:none'),
      document.getElementById("app").appendChild(e);
    let t = "unknown";
    try {
      let f = i.renderer.getContext(),
        p = f.getExtension("WEBGL_debug_renderer_info");
      t = p
        ? f.getParameter(p.UNMASKED_RENDERER_WEBGL)
        : f.getParameter(f.RENDERER);
    } catch {}
    let n =
        i.level.cinematicPath && i.level.cinematicPath.length >= 2
          ? i.level.cinematicPath
          : [
              { pos: [-32, 1.7, 6], look: [0, 2, 5] },
              { pos: [10, 1.7, 6], look: [30, 6, 0] },
            ],
      s = [],
      o = 0,
      r = 0,
      a = 30,
      l = new W(),
      c = new W(),
      u = new W(),
      h = new W();
    i.player && (i.player.enabled = !1),
      (i.bench = {
        frame(f) {
          o += f;
          let p = ((o / a) % 1) * (n.length - 1),
            d = Math.min(n.length - 2, Math.floor(p)),
            v = p - d,
            g = v * v * (3 - 2 * v);
          if (
            (l.fromArray(n[d].pos),
            c.fromArray(n[d + 1].pos),
            u.fromArray(n[d].look),
            h.fromArray(n[d + 1].look),
            i.camera.position.lerpVectors(l, c, g),
            i.camera.lookAt(u.lerp(h, g)),
            o > 2 && s.push(f * 1e3),
            s.length > 3e3 && s.shift(),
            o - r > 1 && s.length > 10)
          ) {
            r = o;
            let x = s.slice().sort((M, E) => M - E),
              y = x.reduce((M, E) => M + E, 0) / x.length,
              b = x[Math.floor(x.length * 0.99)],
              m = x[x.length >> 1],
              A = i.render.stats ? i.render.stats() : {},
              _ = i.renderer.getDrawingBufferSize(new Ae());
            e.textContent = `SALTLINE BENCH  t=${o.toFixed(0)}s
GPU: ${t}
buffer ${_.x}x${_.y}  quality ${i.quality.name}  dpr ${window.devicePixelRatio}
frame ms avg ${y.toFixed(1)}  median ${m.toFixed(1)}  p99 ${b.toFixed(1)}  => ${(1e3 / y).toFixed(0)} fps
stats ${JSON.stringify(A)}
errors ${window.__errors.length}${
              window.__errors.length
                ? `
 - ` +
                  window.__errors.slice(0, 6).join(`
 - `)
                : ""
            }`;
          }
        },
      });
  }
  function tP() {
    let i = () => {};
    return {
      move: { x: 0, y: 0 },
      look: { dx: 0, dy: 0 },
      fire: !1,
      ads: !1,
      sprint: !1,
      crouch: !1,
      locked: !1,
      touch: !1,
      sensitivity: 1,
      down: () => !1,
      pressed: () => !1,
      update: i,
      endFrame: i,
      requestLock: i,
      exitLock: i,
    };
  }
  function nP(i) {
    return {
      pos: new W(0, 0, 4),
      vel: new W(),
      yaw: 0,
      pitch: 0,
      health: 100,
      maxHealth: 100,
      medkits: 0,
      medkitMax: 5,
      alive: !0,
      onGround: !0,
      sprinting: !1,
      crouching: !1,
      ads: 0,
      speed: 0,
      eye: new W(0, Pi.eye, 4),
      forward: new W(0, 0, -1),
      enabled: !1,
      reset() {},
      damage() {},
      heal() {},
      addMedkit() {
        return 0;
      },
      useMedkit() {
        return !1;
      },
      addRecoil() {},
      addShake() {},
      update() {},
    };
  }
  // Exports for the headless tools. Keeping the boot behind a document guard
// lets tools/export-port-colliders.mjs import the level builder in Node
// without starting a renderer.
export {
  C1 as buildPortLevel,
  Yg as createProps,
  il as createRng,
  Em as createEnemies,
};

if (typeof document !== "undefined") {
  QC().catch((i) => bM((i && i.stack) || i));
}