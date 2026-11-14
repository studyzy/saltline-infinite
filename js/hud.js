// HUD 模块 —— 屏幕界面与输入:罗盘、血量、弹药、无线电字幕、菜单、
// 键盘/鼠标/触控输入装配、构建版本徽标,从 js/game.js 独立出来
//
// 模块职责:
//   - makeElement() DOM 元素工厂(所有 HUD 节点都由它创建)
//   - createHud() 异步工厂:装配罗盘/血条/弹药/设置菜单,绑定输入与事件,返回 update
//   - createInputState() 输入状态映射(键盘 + 鼠标 + 触控统一成移动/瞄准/开火指令)
//   - keysKb/keysTouch 键位帮助表(设置菜单里渲染)
//   - loadSettings/saveSettings localStorage 设置读写
//   - paintVertexColors 顶点着色(LOD 简化网格的渐变)
//
// 对外导出(由 js/game.js 引用):
//   createHud(ctx)  创建 HUD;ctx 需要 renderer/camera/player/weapon/events/mats
//
// 原压缩名对照:
//   fM→SETTINGS_KEY  DEFAULT_SETTINGS→DEFAULT_SETTINGS  dM→QUALITY_TIERS  YC→loadSettings
//   Wf→saveSettings  tx→COMPASS_TICK_W  Lc→paintVertexColors  li→makeElement
//   hM→createHud  pM→createInputState

import * as THREE from './vendor/three.module.js';
import { t as tr, getLang, setLang, applyI18n, LANGS } from './i18n.js';
import { VIEW, MATCH } from '../shared/constants.js';


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
const lt = THREE;

// --- shared helpers, constants (copies; game.js keeps the originals) ---
  function paintVertexColors(i, e) {
    let t = i.attributes.position,
      n = t.count,
      s = new Float32Array(n * 3);
    for (let o = 0; o < n; o++) {
      let r = typeof e == "function" ? e(t.getX(o), t.getY(o), t.getZ(o)) : e;
      (s[o * 3] = r[0]), (s[o * 3 + 1] = r[1]), (s[o * 3 + 2] = r[2]);
    }
    return i.setAttribute("color", new et(s, 3)), i;
  }

var Pi = VIEW;

var Pr = {
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
  var COMPASS_TICK_W = 4,
    nx = -90,
    WC = 450,
    GC = {
      0: "N",
      45: "NE",
      90: "E",
      135: "SE",
      180: "S",
      225: "SW",
      270: "W",
      315: "NW",
    },
    ix = 2 * Math.PI * 19;

// --- HUD: element factory, panels, input wiring, build check ---
  function makeElement(i, e, t) {
    let n = document.createElement(i);
    return e && (n.className = e), t != null && (n.innerHTML = t), n;
  }
  function createHud(i) {
    let e = document.getElementById("ui"),
      hud = makeElement("div", "hud");
    hud.setAttribute("aria-hidden", "true");
    let n = makeElement("div", "h-compass"),
      s = makeElement("div", "h-tape"),
      o = "";
    for (let k = nx; k <= WC; k += 5) {
      let ce = (k - nx) * COMPASS_TICK_W,
        ve = ((k % 360) + 360) % 360,
        _e = ve % 45 === 0,
        Te = ve % 15 === 0;
      (o += `<i class="${_e ? "mj" : Te ? "md" : "mn"}" style="left:${ce}px"></i>`),
        _e
          ? (o += `<b class="${ve % 90 === 0 ? "card" : "ic"}" style="left:${ce}px">${GC[ve]}</b>`)
          : ve % 15 === 0 &&
            (o += `<b class="num" style="left:${ce}px">${String(ve).padStart(3, "0")}</b>`);
    }
    s.innerHTML = o;
    let r = makeElement("div", "h-tape-wrap");
    r.appendChild(s);
    let a = makeElement("div", "h-cmarks"),
      l = makeElement("div", "h-heading", "000");
    n.append(r, makeElement("i", "h-needle"), a, l);
    let c = makeElement(
        "div",
        "h-obj",
        `<div class="h-k">${tr("hud_objective")}</div><div class="h-obj-t"></div><div class="h-relays"><span>${tr("hud_relays")}</span><i></i><i></i><i></i><b>0/3</b></div>`,
      ),
      u = c.querySelector(".h-obj-t"),
      h = c.querySelector(".h-relays"),
      f = h.querySelector("b"),
      p = [...h.querySelectorAll("i")],
      d = makeElement("div", "h-warn"),
      v = makeElement(
        "div",
        "h-cross",
        '<i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><i class="c-dot"></i>',
      ),
      g = v.querySelectorAll("i"),
      x = makeElement("div", "h-hit", "<i></i><i></i><i></i><i></i>"),
      y = makeElement("div", "h-arcs"),
      b = [];
    for (let k = 0; k < 4; k++) {
      let ce = makeElement(
        "div",
        "h-arc",
        '<svg viewBox="-100 -100 200 200"><path d="M -38 -84 A 92 92 0 0 1 38 -84" /><path class="tip" d="M -7 -97 L 0 -106 L 7 -97" /></svg>',
      );
      y.appendChild(ce),
        b.push({ el: ce, life: 0, src: new W(), op: -1, rot: 1e9 });
    }
    let m = makeElement(
        "div",
        "h-prompt",
        `<svg viewBox="-24 -24 48 48"><circle class="bg" r="19"/><circle class="fg" r="19" stroke-dasharray="${ix.toFixed(2)}" stroke-dashoffset="${ix.toFixed(2)}" transform="rotate(-90)"/></svg><span class="h-key">E</span><span class="h-plabel"></span>`,
      ),
      A = m.querySelector(".fg"),
      _ = m.querySelector(".h-key"),
      M = m.querySelector(".h-plabel"),
      E = makeElement("div", "h-feed"),
      w = makeElement("div", "h-msg"),
      S = makeElement(
        "div",
        "h-health",
        `<div class="h-k">${tr("hud_vitals")}</div><div class="h-hp-row"><b class="h-hp-n">100</b><div class="h-hp-bar">` +
          "<i></i>".repeat(10) +
          `</div></div><div class="h-med"><span class="h-med-k">H</span><span class="h-med-l">${tr(
            "hud_medkit",
          )}</span><b class="h-med-n">0</b></div>`,
      ),
      z = S.querySelector(".h-hp-n"),
      H = [...S.querySelectorAll(".h-hp-bar i")],
      medEl = S.querySelector(".h-med"),
      medN = S.querySelector(".h-med-n"),
      O = makeElement(
        "div",
        "h-ammo",
        '<div class="h-cue"></div><div class="h-ammo-row"><b class="h-ammo-n">30</b><span class="h-ammo-r">120</span></div><div class="h-pips"></div><div class="h-wname"></div>',
      ),
      q = O.querySelector(".h-ammo-n"),
      U = O.querySelector(".h-ammo-r"),
      T = O.querySelector(".h-pips"),
      D = O.querySelector(".h-wname"),
      C = O.querySelector(".h-cue"),
      G = makeElement("div", "h-marks");
    hud.append(G, n, c, d, y, v, x, m, E, w, S, O), e.appendChild(hud);
    medEl.addEventListener("pointerdown", (k) => {
      k.preventDefault(), k.stopPropagation();
      i.player && i.player.useMedkit && i.player.useMedkit();
    });
    let j = makeElement(
      "div",
      "comms",
      `<span class="comms-who">${tr("hud_control")}</span><span class="comms-t"></span>`,
    );
    j.setAttribute("role", "status"), j.setAttribute("aria-live", "polite");
    let N = j.querySelector(".comms-t");
    e.appendChild(j);
    let Q = !1,
      K = 420,
      ie = innerWidth,
      F = innerHeight,
      X = {
        ammo: -1,
        mag: -1,
        reserve: -1,
        name: null,
        cue: null,
        low: null,
        hp: -1,
        hpSeg: -1,
        med: -1,
        vitalsOn: null,
        head: -1,
        tapeX: 1e9,
        gap: -1,
        crossOn: null,
        promptOn: null,
        promptText: null,
        promptT: -1,
        promptKey: null,
        marksOn: null,
        done: -1,
        total: -1,
      },
      ne = [],
      re = "",
      $ = 0,
      ue = 0,
      me = [],
      ee = null,
      B = 0,
      P = 0,
      V = 0,
      Y = 0,
      L = 0,
      Z = [],
      J = [],
      oe = new W(),
      fe = null,
      le = -1;
    function R() {
      (ie = innerWidth),
        (F = innerHeight),
        (K = n.clientWidth || Math.min(420, ie * 0.6)),
        (X.tapeX = 1e9),
        (X.gap = -1);
      for (let k of J) (k.lastC = 1e9), (k.lastW = "");
    }
    addEventListener("resize", R),
      i.events.on("player:hitEnemy", (k) => {
        I.hitmarker(
          k && k.killed
            ? "kill"
            : k && (k.weak || k.part === "weak")
              ? "weak"
              : "hit",
        ),
          k &&
            k.killed &&
            k.weak &&
            fe &&
            le === i.time.frame &&
            !fe.weak &&
            ((fe.weak = !0), (fe.el.innerHTML += `<em>${tr("hud_weak")}</em>`));
      }),
      i.events.on("enemy:killed", (k) => {
        let ce = String(
          (k && (k.type || (k.enemy && k.enemy.type))) || "machine",
        ).toUpperCase();
        (fe = I.feed(`<b>${ce}</b> ${tr("hud_destroyed")}`)), (le = i.time.frame);
      }),
      i.events.on("player:hit", (k) => {
        if (!k || !k.fromPos) return;
        let ce = b[0];
        for (let ve of b) {
          if (ve.life <= 0) {
            ce = ve;
            break;
          }
          ve.life < ce.life && (ce = ve);
        }
        ce.src.copy(k.fromPos), (ce.life = 1.5), (ce.max = 1.5);
      }),
      i.events.on("player:heal", (k) => {
        let ce = Math.round((k && k.amount) || 0);
        I.message(tr("hud_healed", { n: ce }), 1.4);
        S.classList.remove("healed"),
          void S.offsetWidth,
          S.classList.add("healed"),
          setTimeout(() => S.classList.remove("healed"), 520);
      });
    let I = {
      root: hud,
      show(k) {
        (k = !!k), k !== Q && ((Q = k), hud.classList.toggle("on", k), k && R());
      },
      setObjective(k) {
        (k = k || ""),
          k !== re &&
            ((re = k),
            ($ = 0),
            (ue = 0),
            (u.textContent = ""),
            c.classList.toggle("has", !!k),
            c.classList.remove("flash"),
            c.offsetWidth,
            c.classList.add("flash"));
      },
      setRelays(k, ce) {
        if (!(k === X.done && ce === X.total)) {
          if (ce !== X.total) {
            p.forEach((ve) => ve.remove()), (p = []);
            for (let ve = 0; ve < ce; ve++) {
              let _e = document.createElement("i");
              h.insertBefore(_e, f), p.push(_e);
            }
          }
          (X.done = k),
            (X.total = ce),
            p.forEach((ve, _e) => ve.classList.toggle("cut", _e < k)),
            (f.textContent = `${k}/${ce}`),
            h.classList.toggle("all", k >= ce && ce > 0);
        }
      },
      setMarkers(k) {
        for (let ce of J) ce.cEl.remove(), ce.wEl.remove();
        J = (k || []).map((ce) => {
          let ve = makeElement(
              "div",
              "h-cm " + (ce.kind || "relay"),
              `<i></i><b>${ce.short || ""}</b><span></span>`,
            ),
            _e = makeElement(
              "div",
              "h-wm " + (ce.kind || "relay"),
              `<i></i><b>${ce.short || ""}</b><span></span>`,
            );
          return (
            a.appendChild(ve),
            G.appendChild(_e),
            {
              ...ce,
              cEl: ve,
              wEl: _e,
              cDist: ve.querySelector("span"),
              wDist: _e.querySelector("span"),
              lastD: -1,
              lastC: 1e9,
              lastW: "",
              vis: null,
            }
          );
        });
      },
      setPrompt(k, ce = 0) {
        let ve = !!k;
        if (
          (ve !== X.promptOn &&
            ((X.promptOn = ve),
            m.classList.toggle("on", ve),
            i.input.setPrompt && i.input.setPrompt(ve)),
          !ve)
        )
          return;
        let _e = i.input.touch
          ? "USE"
          : i.input.gamepad && !i.input.locked
            ? "Y"
            : "E";
        _e !== X.promptKey &&
          ((X.promptKey = _e),
          (_.textContent = _e),
          _.classList.toggle("wide", _e.length > 1));
        let Te = tr("hud_hold", { key: _e, label: k });
        Te !== X.promptText && ((X.promptText = Te), (M.textContent = Te));
        let Pe = Math.round(ce * 200) / 200;
        Pe !== X.promptT &&
          ((X.promptT = Pe),
          A.setAttribute("stroke-dashoffset", (ix * (1 - Pe)).toFixed(2)),
          m.classList.toggle("busy", Pe > 0));
      },
      radio(k, ce = 4.5) {
        k && me.push({ text: k, secs: ce });
      },
      clearRadio() {
        (me.length = 0), (ee = null), j.classList.remove("on");
      },
      warn(k, ce = 3) {
        (d.textContent = k),
          (Y = ce),
          d.classList.remove("on"),
          d.offsetWidth,
          d.classList.add("on");
      },
      message(k, ce = 3) {
        (w.textContent = k || ""),
          (L = k ? ce : 0),
          w.classList.toggle("on", !!k);
      },
      feed(k) {
        let ce = makeElement("div", "h-fl", k);
        E.appendChild(ce);
        let ve = { el: ce, life: 4.2, weak: !1 };
        for (Z.push(ve); Z.length > 4; ) Z.shift().el.remove();
        return ve;
      },
      hitmarker(k = "hit") {
        x.className = "h-hit " + k;
        let ce = k === "weak" || k === "kill" ? 1.5 : 1.15;
        try {
          x.animate(
            [
              { opacity: 1, transform: `translate(-50%,-50%) scale(${ce})` },
              {
                opacity: 1,
                transform: "translate(-50%,-50%) scale(1)",
                offset: 0.35,
              },
              { opacity: 0, transform: "translate(-50%,-50%) scale(0.92)" },
            ],
            { duration: k === "kill" ? 420 : 240, easing: "ease-out" },
          );
        } catch {}
      },
      reset() {
        (me.length = 0), (ee = null), j.classList.remove("on");
        for (let k of Z) k.el.remove();
        Z.length = 0;
        for (let k of b) k.life = 0;
        (Y = 0),
          d.classList.remove("on"),
          I.message(""),
          I.setPrompt(null),
          I.setObjective(""),
          (X.hp = -1);
      },
      relabel() {
        let k = c.querySelector(".h-k"),
          ve = h.querySelector("span"),
          _e = j.querySelector(".comms-who"),
          Te = S.querySelector(".h-k"),
          mk = S.querySelector(".h-med-l");
        k && (k.textContent = tr("hud_objective")),
          ve && (ve.textContent = tr("hud_relays")),
          Te && (Te.textContent = tr("hud_vitals")),
          mk && (mk.textContent = tr("hud_medkit")),
          _e && (_e.textContent = tr("hud_control")),
          (X.cue = null),
          (X.promptText = null);
        let Pe = {
          fire: ["tbtn_fire", "keys_fire"],
          ads: ["tbtn_aim", "keys_aim"],
          reload: ["tbtn_reload", "keys_reload"],
          jump: ["tbtn_jump", "keys_jump"],
          interact: ["tbtn_use", "tbtn_use"],
          pause: ["tbtn_pause", "keys_pause"],
        };
        document.querySelectorAll(".touch .t-btn").forEach((Re) => {
          let Fe = Pe[Re.dataset.a];
          if (!Fe) return;
          let we = Re.querySelector("span");
          // tr(), not t(): in this scope t is the HUD root element, and
          // calling t("tbtn_fire") on it threw inside relabel(), which aborted
          // the rest of the relabel pass.
          we && (we.textContent = tr(Fe[0])),
            Re.setAttribute("aria-label", tr(Fe[1]));
        });
      },
      update: se,
    };
    function se(k) {
      if ((ae(k), !Q)) return;
      let ce = i.player,
        ve = i.weapon || {},
        _e = i.camera,
        Te = ce.ads || 0,
        Pe = ((-ce.yaw * 180) / Math.PI) % 360;
      Pe < 0 && (Pe += 360);
      let Re = Math.round((K / 2 - (Pe - nx) * COMPASS_TICK_W) * 2) / 2;
      Re !== X.tapeX &&
        ((X.tapeX = Re), (s.style.transform = `translate3d(${Re}px,0,0)`));
      let Fe = Math.round(Pe) % 360;
      Fe !== X.head &&
        ((X.head = Fe), (l.textContent = String(Fe).padStart(3, "0")));
      let ze = Te < 0.5;
      if (
        (ze !== X.marksOn && ((X.marksOn = ze), G.classList.toggle("off", !ze)),
        J.length)
      ) {
        _e.updateMatrixWorld(),
          _e.matrixWorldInverse.copy(_e.matrixWorld).invert();
        let we = K / 2 - 14;
        for (let be of J) {
          let Oe = be.pos.x - ce.pos.x,
            pt = be.pos.z - ce.pos.z,
            ut = Math.round(Math.hypot(Oe, pt));
          if (ut !== be.lastD) {
            be.lastD = ut;
            let Un = ut + "m";
            (be.cDist.textContent = Un), (be.wDist.textContent = Un);
          }
          let nn = (Math.atan2(Oe, -pt) * 180) / Math.PI - Pe;
          nn = ((nn + 540) % 360) - 180;
          let bt = Math.round(Math.max(-we, Math.min(we, nn * COMPASS_TICK_W)));
          bt !== be.lastC &&
            ((be.lastC = bt),
            (be.cEl.style.transform = `translate3d(${bt}px,0,0)`),
            be.cEl.classList.toggle("edge", Math.abs(bt) >= we)),
            oe
              .set(
                be.pos.x,
                be.pos.y + (be.kind === "extract" ? 1.2 : 1.9),
                be.pos.z,
              )
              .project(_e);
          let Os,
            pn,
            Ti = !1;
          if (
            (oe.z > 1 && ((Ti = !0), (oe.x = -oe.x), (oe.y = -oe.y)),
            Ti || Math.abs(oe.x) > 0.9 || Math.abs(oe.y) > 0.82)
          ) {
            Ti = !0;
            let Un = Math.max(
              Math.abs(oe.x) / 0.9,
              Math.abs(oe.y) / 0.82,
              0.001,
            );
            if (((oe.x /= Un), (oe.y /= Un), oe.z > 1)) {
              let zo = Math.max(Math.abs(oe.x) / 0.9, Math.abs(oe.y) / 0.82);
              zo < 0.999 && ((oe.x /= zo), (oe.y /= zo));
            }
          }
          (Os = Math.round((oe.x * 0.5 + 0.5) * ie)),
            (pn = Math.round((-oe.y * 0.5 + 0.5) * F));
          let ho = !Ti && Math.hypot(oe.x, oe.y * 0.6) < 0.16,
            Rs =
              Os +
              "," +
              pn +
              (Ti ? "o" : "") +
              (ut < 3 ? "n" : "") +
              (ho ? "d" : "");
          Rs !== be.lastW &&
            ((be.lastW = Rs),
            (be.wEl.style.transform = `translate3d(${Os}px,${pn}px,0)`),
            be.wEl.classList.toggle("offscreen", Ti),
            be.wEl.classList.toggle("near", ut < 3),
            be.wEl.classList.toggle("dim", ho));
        }
      }
      let We = Te <= 0.6 && ce.alive && ve.state !== "reloading_hidden";
      if (
        (We !== X.crossOn && ((X.crossOn = We), v.classList.toggle("off", !We)),
        We)
      ) {
        let we = typeof ve.spread == "number" ? ve.spread : 0.012,
          be = (_e.fov * Math.PI) / 360,
          Oe =
            (Math.tan(we) / Math.tan(be)) * (F / 2) +
            4 +
            (ce.sprinting ? 10 : 0);
        (Oe = Math.round(Math.max(4, Math.min(70, Oe)) * 2) / 2),
          Oe !== X.gap &&
            ((X.gap = Oe),
            (g[0].style.transform = `translate3d(-50%,${-Oe}px,0) translateY(-100%)`),
            (g[1].style.transform = `translate3d(-50%,${Oe}px,0)`),
            (g[2].style.transform = `translate3d(${-Oe}px,-50%,0) translateX(-100%)`),
            (g[3].style.transform = `translate3d(${Oe}px,-50%,0)`));
      }
      let Ne = Math.max(1, Math.min(60, ve.magSize | 0 || 30)),
        dt = Math.max(0, ve.ammo | 0),
        xe = Math.max(0, ve.reserve | 0);
      if (
        (Ne !== X.mag &&
          ((X.mag = Ne),
          (T.innerHTML = "<i></i>".repeat(Ne)),
          (ne = [...T.children]),
          (X.ammo = -1)),
        dt !== X.ammo)
      ) {
        (X.ammo = dt), (q.textContent = String(dt).padStart(2, "0"));
        for (let we = 0; we < ne.length; we++)
          ne[we].className = we < dt ? "" : "off";
      }
      xe !== X.reserve &&
        ((X.reserve = xe), (U.textContent = String(xe).padStart(3, "0"))),
        ve.name !== X.name &&
          ((X.name = ve.name), (D.textContent = ve.name || ""));
      let Ie = dt <= Math.ceil(Ne * 0.27),
        Be =
          ve.state === "reloading"
            ? tr("hud_reloading")
            : dt === 0
              ? xe > 0
                ? i.input.touch
                  ? tr("hud_reload")
                  : tr("hud_reload_key")
                : tr("hud_empty")
              : Ie
                ? tr("hud_low")
                : "";
      Be !== X.cue &&
        ((X.cue = Be),
        (C.textContent = Be),
        (C.className =
          "h-cue" +
          (Be ? " on" : "") +
          (dt === 0 && ve.state !== "reloading" ? " urgent" : ""))),
        Ie !== X.low && ((X.low = Ie), O.classList.toggle("low", Ie));
      let Xe = Math.max(0, Math.ceil(ce.health)),
        Me = ce.health < ce.maxHealth - 0.5;
      if (Xe !== X.hp) {
        (X.hp = Xe), (z.textContent = String(Xe));
        let we = Math.ceil((Xe / ce.maxHealth) * H.length);
        if (we !== X.hpSeg) {
          X.hpSeg = we;
          for (let be = 0; be < H.length; be++)
            H[be].className = be < we ? "" : "off";
          S.classList.toggle("crit", we <= 3);
        }
      }
      let mk = Math.max(0, ce.medkits | 0);
      mk !== X.med &&
        ((X.med = mk),
        (medN.textContent = String(mk)),
        medEl.classList.toggle("has", mk > 0));
      let vitalsOn = Me || mk > 0;
      vitalsOn !== X.vitalsOn &&
        ((X.vitalsOn = vitalsOn), S.classList.toggle("on", vitalsOn));
      for (let we of b) {
        if (we.life <= 0) {
          we.op !== 0 && ((we.op = 0), (we.el.style.opacity = "0"));
          continue;
        }
        we.life -= k;
        let be =
            Math.atan2(we.src.x - ce.pos.x, -(we.src.z - ce.pos.z)) + ce.yaw,
          Oe = Math.round((be * 180) / Math.PI);
        Oe !== we.rot &&
          ((we.rot = Oe),
          (we.el.style.transform = `translate(-50%,-50%) rotate(${Oe}deg)`));
        let pt = Math.round(Math.min(1, Math.max(0, we.life / 0.6)) * 20) / 20;
        pt !== we.op && ((we.op = pt), (we.el.style.opacity = String(pt)));
      }
      if ($ < re.length) {
        ue += k * 46;
        let we = Math.min(re.length, Math.floor(ue));
        we !== $ && (($ = we), (u.textContent = re.slice(0, we)));
      }
      Y > 0 && ((Y -= k), Y <= 0 && d.classList.remove("on")),
        L > 0 && ((L -= k), L <= 0 && w.classList.remove("on"));
      for (let we = Z.length - 1; we >= 0; we--) {
        let be = Z[we];
        (be.life -= k),
          be.life <= 0
            ? (be.el.remove(), Z.splice(we, 1))
            : be.life < 0.6 &&
              !be.out &&
              ((be.out = !0), be.el.classList.add("out"));
      }
    }
    function ae(k) {
      if (!ee) {
        if (!me.length) return;
        (ee = me.shift()),
          (B = 0),
          (P = 0),
          (V = ee.secs),
          (N.textContent = ""),
          j.classList.add("on"),
          i.events.emit("radio:line", { text: ee.text });
      }
      let ce = ee.text;
      if (B < ce.length) {
        P += k * 58;
        let ve = Math.min(ce.length, Math.floor(P));
        ve !== B && ((B = ve), (N.textContent = ce.slice(0, ve)));
      } else
        (V -= k),
          V <= 0 && ((ee = null), me.length || j.classList.remove("on"));
    }
    return R(), I;
  }
  var SETTINGS_KEY = "saltline.settings.v1",
    DEFAULT_SETTINGS = { quality: "auto", sens: 1, invertY: !1, volume: 0.8, fov: Pi.fov },
    QUALITY_TIERS = ["low", "medium", "high", "ultra"];
  function loadSettings() {
    let i = { ...DEFAULT_SETTINGS };
    try {
      let e = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      e &&
        typeof e == "object" &&
        ((e.quality === "auto" || QUALITY_TIERS.includes(e.quality)) &&
          (i.quality = e.quality),
        Number.isFinite(e.sens) &&
          (i.sens = Math.min(3, Math.max(0.2, e.sens))),
        (i.invertY = !!e.invertY),
        Number.isFinite(e.volume) &&
          (i.volume = Math.min(1, Math.max(0, e.volume))),
        Number.isFinite(e.fov) && (i.fov = Math.min(95, Math.max(60, e.fov))));
    } catch {}
    return i;
  }
  function saveSettings(i) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(i));
    } catch {}
  }
  function keysKb() {
    return `<dl class="keys">
    <div><dt>${tr("keys_move")}</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dd></div>
    <div><dt>${tr("keys_look")}</dt><dd>${tr("mouse")}</dd></div>
    <div><dt>${tr("keys_fire")}</dt><dd>${tr("lmb")}</dd></div>
    <div><dt>${tr("keys_aim")}</dt><dd>${tr("rmb")}</dd></div>
    <div><dt>${tr("keys_reload")}</dt><dd><kbd>R</kbd></dd></div>
    <div><dt>${tr("keys_cut")}</dt><dd><kbd>E</kbd></dd></div>
    <div><dt>${tr("keys_jump")}</dt><dd><kbd>Space</kbd></dd></div>
    <div><dt>${tr("keys_sprint")}</dt><dd><kbd>Shift</kbd></dd></div>
    <div><dt>${tr("keys_crouch")}</dt><dd><kbd>C</kbd> / <kbd>Ctrl</kbd></dd></div>
    <div><dt>${tr("keys_melee")}</dt><dd><kbd>F</kbd></dd></div>
    <div><dt>${tr("keys_pause")}</dt><dd><kbd>Esc</kbd> / <kbd>P</kbd></dd></div>
  </dl>`;
  }
  function keysTouch() {
    return `<dl class="keys">
    <div><dt>${tr("keys_move")}</dt><dd>${tr("touch_move")}</dd></div>
    <div><dt>${tr("keys_look")}</dt><dd>${tr("touch_look")}</dd></div>
    <div><dt>${tr("keys_fire")}</dt><dd>${tr("touch_fire")}</dd></div>
    <div><dt>${tr("keys_aim")}</dt><dd>${tr("touch_aim")}</dd></div>
    <div><dt>${tr("keys_reload")}</dt><dd>${tr("touch_reload")}</dd></div>
    <div><dt>${tr("keys_jump")}</dt><dd>${tr("touch_jump")}</dd></div>
    <div><dt>${tr("keys_cut")}</dt><dd>${tr("touch_cut")}</dd></div>
    <div><dt>${tr("keys_sprint")}</dt><dd>${tr("touch_sprint")}</dd></div>
  </dl>`;
  }
  function createInputState(i, e) {
    let uiRoot = document.getElementById("ui"),
      n = loadSettings(),
      s = document.createElement("div");
    (s.className = "menu"),
      (s.dataset.screen = "none"),
      (s.innerHTML = `
    <div class="m-veil"></div>
    <div class="m-bars"><i></i><i></i></div>

    <section class="m-screen m-title" data-s="title" data-i18n-aria="game_title">
      <div class="m-title-main">
        <div class="m-eyebrow"><span class="m-tag">B4</span><span data-i18n="title_eyebrow_unit"></span><span class="m-dim" data-i18n="title_eyebrow_place"></span></div>
        <h1 class="m-word" data-i18n="wordmark"></h1>
        <p class="m-premise" data-i18n="title_premise"></p>
        <div class="m-actions">
          <button class="btn primary" data-act="deploy" data-i18n="title_deploy"></button>
          <button class="btn" data-act="coop" data-i18n="title_coop"></button>
          <button class="btn" data-act="settings" data-i18n="title_settings"></button>
          <button class="btn m-only-narrow" data-act="controls" data-i18n="title_controls"></button>
        </div>
        <p class="m-note" data-i18n="title_note"></p>
        <p class="m-ver" data-f="build"><span class="m-ver-k" data-i18n="title_build"></span><code data-f="build-id">—</code></p>
      </div>
      <aside class="m-legend" data-i18n-aria="legend_aria">
        <div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <i data-i18n="legend_move"></i></span><span><kbd>Mouse</kbd> <i data-i18n="legend_look"></i></span><span><kbd>LMB</kbd> <i data-i18n="legend_fire"></i></span><span><kbd>RMB</kbd> <i data-i18n="legend_aim"></i></span><span><kbd>R</kbd> <i data-i18n="legend_reload"></i></span></div>
        <div><span><kbd>E</kbd> <i data-i18n="legend_cut"></i></span><span><kbd>H</kbd> <i data-i18n="legend_heal"></i></span><span><kbd>Space</kbd> <i data-i18n="legend_jump"></i></span><span><kbd>Shift</kbd> <i data-i18n="legend_sprint"></i></span><span><kbd>C</kbd> <i data-i18n="legend_crouch"></i></span><span><kbd>Esc</kbd> <i data-i18n="legend_pause"></i></span></div>
        <div class="lg-touch"><em data-i18n="legend_touch"></em><span data-i18n="legend_touch_move"></span><span data-i18n="legend_touch_look"></span><span data-i18n="legend_touch_btns"></span></div>
      </aside>
    </section>

    <section class="m-screen m-card" data-s="paused" data-i18n-aria="paused_h">
      <div class="m-k" data-i18n="paused_k"></div>
      <h2 class="m-h" data-i18n="paused_h"></h2>
      <p class="m-line" data-f="lookmode"></p>
      <div class="m-actions col">
        <button class="btn primary" data-act="resume" data-i18n="paused_resume"></button>
        <button class="btn" data-act="settings" data-i18n="title_settings"></button>
        <button class="btn" data-act="controls" data-i18n="title_controls"></button>
        <button class="btn" data-act="restart" data-i18n="paused_restart"></button>
      </div>
    </section>

    <section class="m-screen m-card m-dead" data-s="dead" data-i18n-aria="dead_h">
      <div class="m-k" data-i18n="dead_k"></div>
      <h2 class="m-h" data-i18n="dead_h"></h2>
      <dl class="m-stats"><div><dt data-i18n="dead_time"></dt><dd data-f="dead-time">00:00</dd></div><div><dt data-i18n="dead_relays"></dt><dd data-f="dead-relays">0/3</dd></div></dl>
      <div class="m-actions col"><button class="btn primary" data-act="retry" data-i18n="dead_retry"></button></div>
    </section>

    <section class="m-screen m-card m-debrief" data-s="complete" data-i18n-aria="debrief_h">
      <div class="m-k" data-i18n="debrief_k"></div>
      <h2 class="m-h" data-i18n="debrief_h"></h2>
      <div class="m-rating"><span data-i18n="debrief_rating"></span><b data-f="rating"></b></div>
      <dl class="m-stats">
        <div><dt data-i18n="debrief_time"></dt><dd data-f="time">00:00</dd></div>
        <div><dt data-i18n="debrief_acc"></dt><dd data-f="acc">0%</dd></div>
        <div><dt data-i18n="debrief_kills"></dt><dd data-f="kills">0</dd></div>
        <div><dt data-i18n="debrief_retries"></dt><dd data-f="retries">0</dd></div>
      </dl>
      <div class="m-actions col"><button class="btn primary" data-act="redeploy" data-i18n="debrief_redeploy"></button></div>
    </section>

    <div class="panel" role="dialog" aria-modal="true" data-i18n-aria="panel_aria" tabindex="-1" hidden>
      <header class="panel-h">
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-tab="settings" aria-selected="true" data-i18n="panel_settings"></button>
          <button class="tab" role="tab" data-tab="controls" aria-selected="false" data-i18n="panel_controls"></button>
        </div>
        <button class="btn small" data-act="close-panel" data-i18n="panel_close"></button>
      </header>
      <div class="panel-b" data-pane="settings">
        <div class="row"><label id="l-lang" data-i18n="set_lang"></label>
          <div class="seg lang" role="group" aria-labelledby="l-lang">${LANGS.map((L) => `<button data-lang="${L.id}" aria-pressed="false">${L.label}</button>`).join("")}</div></div>
        <div class="row"><label id="l-q" data-i18n="set_quality"></label>
          <div class="seg" role="group" aria-labelledby="l-q">${QUALITY_TIERS.map((U) => `<button data-q="${U}" aria-pressed="false">${tr("q_" + U)}</button>`).join("")}</div></div>
        <div class="row"><label for="s-sens" data-i18n="set_sens"></label><div class="slider"><input id="s-sens" type="range" min="0.2" max="3" step="0.05"><output data-o="sens"></output></div></div>
        <div class="row"><label id="l-inv" data-i18n="set_invert"></label><button class="toggle" data-act="invert" aria-labelledby="l-inv" aria-pressed="false"><i></i><span>Off</span></button></div>
        <div class="row"><label for="s-vol" data-i18n="set_volume"></label><div class="slider"><input id="s-vol" type="range" min="0" max="100" step="1"><output data-o="vol"></output></div></div>
        <div class="row"><label for="s-fov" data-i18n="set_fov"></label><div class="slider"><input id="s-fov" type="range" min="60" max="95" step="1"><output data-o="fov"></output></div></div>
        <div class="row" data-row="fs"><label id="l-fs" data-i18n="set_display"></label><button class="btn small" data-act="fullscreen" aria-labelledby="l-fs fs-t"><span id="fs-t"></span></button></div>
        <p class="panel-note" data-f="qnote"></p>
      </div>
      <div class="panel-b" data-pane="controls" hidden>
        <h3 data-i18n="kb_mouse"></h3><div data-keys="kb"></div>
        <p class="panel-note" data-i18n="mouse_note"></p>
        <h3 data-i18n="legend_touch"></h3><div data-keys="touch"></div>
        <h3 data-i18n="gamepad"></h3>
        <p class="panel-note" data-i18n="gamepad_note"></p>
      </div>
    </div>

    <div class="loc-card" aria-hidden="true"><i></i><b data-i18n="loc_card"></b><span data-i18n="loc_card_sub"></span></div>
  `),
      uiRoot.appendChild(s);
    let o = (U) => s.querySelector(U),
      r = (U) => [...s.querySelectorAll(U)],
      a = o(".panel"),
      l = o(".loc-card"),
      c = (U) => s.querySelector(`[data-f="${U}"]`),
      u = o("#s-sens"),
      h = o("#s-vol"),
      f = o("#s-fov"),
      p = "none",
      d = null;

    // Rebuild every translated string in the menu. Called on load and whenever
    // the player switches language in Settings.
    function R() {
      applyI18n(s);
      let kb = o('[data-keys="kb"]'),
        tc = o('[data-keys="touch"]');
      if (kb) kb.innerHTML = keysKb();
      if (tc) tc.innerHTML = keysTouch();
      for (let L of r(".seg [data-q]")) L.textContent = tr("q_" + L.dataset.q);
      let inv = o('[data-act="invert"]');
      inv && (inv.querySelector("span").textContent = n.invertY ? tr("set_on") : tr("set_off"));
      y.textContent = b() ? tr("set_exit_fullscreen") : tr("set_fullscreen");
      g();
      paintVertexColors();
    }
    function paintVertexColors() {
      for (let L of r("[data-lang]"))
        L.setAttribute("aria-pressed", String(L.dataset.lang === getLang()));
    }
    function v(U) {
      if (
        ((!U || U === "sens") && (i.input.sensitivity = n.sens),
        (!U || U === "invertY") && (i.input.invertY = n.invertY),
        !U || U === "volume")
      )
        try {
          i.audio && i.audio.setVolume && i.audio.setVolume(n.volume);
        } catch (T) {
          console.error(T);
        }
      if (
        ((!U || U === "fov") &&
          i.player &&
          i.player.setFov &&
          i.player.setFov(n.fov),
        U === "quality" ||
          (!U &&
            n.quality !== "auto" &&
            !i.params.shot &&
            !i.params.q &&
            n.quality !== (i.quality && i.quality.name)))
      ) {
        let T = Pr[n.quality];
        if (T)
          try {
            i.render && i.render.setQuality
              ? i.render.setQuality({ ...T })
              : (i.quality = { ...T });
          } catch (D) {
            console.error("[game] setQuality failed", D);
          }
      }
    }
    function g() {
      let U = n.quality === "auto" ? i.quality && i.quality.name : n.quality;
      for (let D of r(".seg [data-q]"))
        D.setAttribute("aria-pressed", String(D.dataset.q === U));
      (u.value = n.sens),
        (h.value = Math.round(n.volume * 100)),
        (f.value = n.fov),
        (o('[data-o="sens"]').textContent = n.sens.toFixed(2) + "\xD7"),
        (o('[data-o="vol"]').textContent = Math.round(n.volume * 100) + "%"),
        (o('[data-o="fov"]').textContent = Math.round(n.fov) + "\xB0");
      let T = o('[data-act="invert"]');
      T.setAttribute("aria-pressed", String(n.invertY)),
        (T.querySelector("span").textContent = n.invertY ? tr("set_on") : tr("set_off")),
        (c("qnote").textContent =
          n.quality === "auto"
            ? tr("qnote_auto", { q: U ? tr("q_" + U) : tr("q_medium") })
            : tr("qnote_manual"));
    }
    u.addEventListener("input", () => {
      (n.sens = +u.value), v("sens"), g(), saveSettings(n);
    }),
      h.addEventListener("input", () => {
        (n.volume = +h.value / 100), v("volume"), g(), saveSettings(n);
      }),
      f.addEventListener("input", () => {
        (n.fov = +f.value), v("fov"), g(), saveSettings(n);
      });
    let x = o('[data-row="fs"]'),
      y = o("#fs-t"),
      b = () =>
        document.fullscreenElement || document.webkitFullscreenElement || null,
      m = document.getElementById("app") || document.documentElement;
    (m &&
      (m.requestFullscreen || m.webkitRequestFullscreen) &&
      document.fullscreenEnabled !== !1 &&
      document.webkitFullscreenEnabled !== !1) ||
      (x.hidden = !0);
    function _() {
      y.textContent = tr("set_fs_unavailable");
    }
    function M() {
      try {
        if (b()) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(
            document,
          );
          return;
        }
        let U = (m.requestFullscreen || m.webkitRequestFullscreen).call(m);
        U && U.catch && U.catch(_);
      } catch {
        _();
      }
    }
    let E = () => {
      y.textContent = b() ? tr("set_exit_fullscreen") : tr("set_fullscreen");
    };
    document.addEventListener("fullscreenchange", E),
      document.addEventListener("webkitfullscreenchange", E);
    function w(U) {
      (d = document.activeElement),
        (a.hidden = !1),
        s.classList.add("panel-open"),
        z(U || "settings");
      try {
        a.focus({ preventScroll: !0 });
      } catch {}
    }
    function S() {
      return a.hidden
        ? !1
        : ((a.hidden = !0),
          s.classList.remove("panel-open"),
          d && d.focus && s.contains(d) ? d.focus() : H(),
          !0);
    }
    function z(U) {
      for (let T of r(".tab"))
        T.setAttribute("aria-selected", String(T.dataset.tab === U));
      for (let T of r(".panel-b")) T.hidden = T.dataset.pane !== U;
    }
    function H() {
      let U = s.querySelector(`.m-screen[data-s="${p}"] .btn.primary`);
      if (U)
        try {
          U.focus({ preventScroll: !0 });
        } catch {}
    }
    s.addEventListener("click", (U) => {
      let T = U.target.closest("button");
      if (!T || !s.contains(T)) return;
      if ((i.events.emit("ui:click", {}), T.dataset.lang)) {
        setLang(T.dataset.lang), saveSettings(n), R();
        i.events.emit("lang:change", { lang: getLang() });
        return;
      }
      if (T.dataset.q) {
        (n.quality = T.dataset.q), v("quality"), g(), saveSettings(n);
        return;
      }
      if (T.dataset.tab) {
        z(T.dataset.tab);
        return;
      }
      let D = T.dataset.act;
      D === "settings"
        ? w("settings")
        : D === "controls"
          ? w("controls")
          : D === "close-panel"
            ? S()
            : D === "invert"
              ? ((n.invertY = !n.invertY), v("invertY"), g(), saveSettings(n))
              : D === "fullscreen"
                ? M()
                : D && e[D] && e[D](U);
    }),
      s.addEventListener("mouseover", (U) => {
        let T = U.target.closest("button");
        T &&
          U.relatedTarget &&
          !T.contains(U.relatedTarget) &&
          i.events.emit("ui:hover", {});
      }),
      s.addEventListener("keydown", (U) => {
        if (
          (U.code === "Escape" &&
            !a.hidden &&
            (S(), U.stopPropagation(), U.preventDefault()),
          U.code === "Tab" && !a.hidden)
        ) {
          let T = [...a.querySelectorAll("button, input")].filter(
            (G) => G.offsetParent !== null,
          );
          if (!T.length) return;
          let D = T[0],
            C = T[T.length - 1];
          U.shiftKey && document.activeElement === D
            ? (C.focus(), U.preventDefault())
            : !U.shiftKey &&
              document.activeElement === C &&
              (D.focus(), U.preventDefault());
        }
      });
    let O = (U) => (
        (U = Math.max(0, Math.floor(U))),
        String(Math.floor(U / 60)).padStart(2, "0") +
          ":" +
          String(U % 60).padStart(2, "0")
      ),
      q = {
        root: s,
        settings: n,
        fmtTime: O,
        get screen() {
          return p;
        },
        get panelOpen() {
          return !a.hidden;
        },
        closePanel: S,
        show(U) {
          U !== p &&
            ((p = U),
            (s.dataset.screen = U),
            S(),
            s.classList.toggle("open", U !== "none"),
            U !== "none"
              ? (g(), setTimeout(H, 30))
              : document.activeElement &&
                s.contains(document.activeElement) &&
                document.activeElement.blur());
        },
        locationCard(U) {
          l.classList.toggle("on", !!U);
        },
        setLookMode(U) {
          c("lookmode").textContent = U || "";
        },
        setDead({ time: U, relays: T, total: D }) {
          (c("dead-time").textContent = O(U)),
            (c("dead-relays").textContent = `${T}/${D}`);
        },
        setDebrief({ time: U, accuracy: T, kills: D, retries: C, rating: G }) {
          (c("time").textContent = O(U)),
            (c("acc").textContent =
              T == null ? "\u2014" : Math.round(T * 100) + "%"),
            (c("kills").textContent = String(D)),
            (c("retries").textContent = String(C)),
            (c("rating").textContent = G == null ? "" : tr("rating_" + G));
        },
        applySettings: v,
        relabel: R,
      };
    R();
    loadBuild();
    return g(), q;
  }

  // Show which build this is on the title screen. version.json is written at
  // deploy time from the git commit, so a stale page is obvious at a glance
  // (and the deploy route serves it no-cache, so it always revalidates).
  function loadBuild() {
    const slot = document.querySelector('[data-f="build-id"]');
    if (!slot) return;
    fetch("version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!v) throw new Error("no version.json");
        const id = v.short || String(v.commit || "").slice(0, 7) || "unknown";
        slot.textContent = id;
        slot.title = [v.commit, v.subject, v.built].filter(Boolean).join("\n");
        slot.dataset.build = id;
        watchBuild(id);
      })
      .catch(() => {
        // Local dev without a deploy: say so instead of showing a fake hash.
        slot.textContent = "dev";
        slot.dataset.build = "dev";
      });
  }

  // A tab left open keeps the old bundle in memory and the game never reloads
  // itself, so a player can end up judging a build that was replaced hours
  // ago. Poll the stamp and offer a reload instead of letting that happen.
  function watchBuild(loaded) {
    if (loaded === "dev") return;
    setInterval(() => {
      fetch("version.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          const id = v && (v.short || String(v.commit || "").slice(0, 7));
          if (!id || id === loaded || document.querySelector(".build-stale")) return;
          const el = document.createElement("button");
          el.className = "build-stale";
          el.textContent = "新版本 " + id + " 已部署 — 点击刷新";
          el.style.cssText =
            "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;" +
            "padding:8px 14px;border:0;border-radius:6px;cursor:pointer;" +
            "font:600 13px/1 ui-monospace,monospace;letter-spacing:.02em;" +
            "background:#e8b23a;color:#16181c;box-shadow:0 4px 18px rgba(0,0,0,.45)";
          el.onclick = () => location.reload();
          document.body.appendChild(el);
        })
        .catch(() => {});
    }, 45e3);
  }

export { createHud, makeElement, createInputState, keysKb, keysTouch };
