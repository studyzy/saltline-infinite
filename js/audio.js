// 音频模块 —— 从 js/game.js 独立出来的程序化音效与音乐系统
//
// 模块职责：
//   - 全部声音都在运行时用 DSP 合成，没有任何外部音频资源
//   - 合成基础：种子随机、白噪声、双二阶滤波、包络、扫频、共振、颗粒、无缝循环
//   - 55 个音效生成器：武器/换弹、脚步/命中、敌人/场景、环境、提示音与混响 IR
//   - 5 层程序化音乐：低音持续、琶音、打击、铜管、主题动机
//   - 播放引擎：分帧合成队列、总线与压缩/限幅、混响发送、声部抢占、
//     3D Panner 听者、循环声、音乐层混合、事件绑定与离线自检
//
// 对外导出：
//   createAudio(game)      创建 WebAudio 引擎；不可用时返回静音引擎
//   createSilentAudio()    静音引擎（同一套 API，便于无音频环境运行）
//
// createAudio 参数契约：
//   game.events            事件总线（on(name, cb)）
//   game.game.state        当前游戏状态（title/intro/playing/paused/dead/complete）
//   game.camera            相机（matrixWorld 用于听者位置与朝向）
//   game.level             关卡（interiorBoxes 判定室内；objectives 生成中继嗡鸣）
//   game.ground            地面（isPuddle 判定涉水脚步）
//   game.enemies.list      敌人列表（自动挂载旋翼/伺服循环声）
//
// 引擎返回的 API：update / resume / play / loop / setIntensity / setInterior /
//   setVolume / setPaused / ready / selfTest / debug / names。
//
// 原压缩名对照（便于与历史代码比对）：
//   vt→TAU  ao→createSeededRandom  Kb→hashString  St→allocSamples  Xt→randomBetween
//   Qn→generateNoise  Av→biquadCoefficients  tn→applyBiquad  di→applySweepingBiquad
//   Vo→frequencyRamp  lo→applyGainCurve  co→decayCurve  Se→mixBufferAt  Us→mixBufferLooping
//   at→filteredNoiseBurst  ei→pitchSweepTone  jc→sineSweep  dn→modalPing  Jc→noiseGrains
//   Rv→crossfadeLoop  Zc→noiseLoop  Q1→mixBuffers  Go→SOUND_LIBRARY
//   iC→createSilentAudio  c_→createAudio  u_→createAudioEngine

// ===== 基础工具：随机、哈希与缓冲 =====
var TAU = Math.PI * 2;

// 基于 mulberry32 的种子随机数生成器；同一 seed 得到同一音色变体
function createSeededRandom(i) {
  let e = i >>> 0;
  return () => {
    (e |= 0), (e = (e + 1831565813) | 0);
    let t = Math.imul(e ^ (e >>> 15), 1 | e);
    return (
      (t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t),
      ((t ^ (t >>> 14)) >>> 0) / 4294967296
    );
  };
}

// FNV-1a 字符串哈希，把音效名映射成稳定的随机种子
function hashString(i) {
  let e = 2166136261;
  for (let t = 0; t < i.length; t++)
    (e ^= i.charCodeAt(t)), (e = Math.imul(e, 16777619));
  return e >>> 0;
}
// 分配指定秒数的单声道 Float32 缓冲
var allocSamples = (i, e) => new Float32Array(Math.max(1, Math.round(i * e))),
  // 按随机函数在 [min,max) 内取值
  randomBetween = (i, e, t) => e + (t - e) * i(),
  // MIDI 音高转频率
  midiToHz = (i) => 440 * Math.pow(2, (i - 69) / 12);

// 生成指定时长的白噪声
function generateNoise(i, e, t) {
  let n = allocSamples(i, e);
  for (let s = 0; s < n.length; s++) n[s] = t() * 2 - 1;
  return n;
}

// ===== 合成基础：滤波、包络与噪声 =====

// 计算双二阶滤波器（lp/hp/bp）的系数
function biquadCoefficients(i, e, t, n) {
  let s = (TAU * Math.max(10, Math.min(e, n * 0.47))) / n,
    o = Math.cos(s),
    r = Math.sin(s),
    a = r / (2 * t),
    l,
    c,
    u,
    h = 1 + a,
    f = -2 * o,
    p = 1 - a;
  return (
    i === "lp"
      ? ((l = (1 - o) / 2), (c = 1 - o), (u = l))
      : i === "hp"
        ? ((l = (1 + o) / 2), (c = -(1 + o)), (u = l))
        : ((l = a), (c = 0), (u = -a)),
    [l / h, c / h, u / h, f / h, p / h]
  );
}

// 用固定参数双二阶滤波处理整段缓冲（原地）
function applyBiquad(i, e, t, n, s) {
  let [o, r, a, l, c] = biquadCoefficients(e, t, n, s),
    u = 0,
    h = 0;
  for (let f = 0; f < i.length; f++) {
    let p = i[f],
      d = o * p + u;
    (u = r * p - l * d + h), (h = a * p - c * d), (i[f] = d);
  }
  return i;
}

// 时变截止频率滤波：每 32 个采样更新一次系数，可多级串联
function applySweepingBiquad(i, e, t, n, s, o = 1) {
  let r = i.length;
  for (let a = 0; a < o; a++) {
    let l = 0,
      c = 0,
      u = null;
    a > 0 && ((l = applySweepingBiquad.z1), (c = applySweepingBiquad.z2));
    let h = a === o - 1 ? i : null;
    for (let f = 0; f < r; f++) {
      (f & 31) === 0 &&
        (u = biquadCoefficients(e, t(f / r), typeof n == "function" ? n(f / r) : n, s));
      let p = i[f],
        d = u[0] * p + l;
      (l = u[1] * p - u[3] * d + c),
        (c = u[2] * p - u[4] * d),
        h && (h[f] = d);
    }
    (applySweepingBiquad.z1 = l), (applySweepingBiquad.z2 = c);
  }
  return i;
}
// 返回频率从 from 指数滑向 to 的曲线函数
var frequencyRamp =
  (i, e, t = 1) =>
  (n) =>
    i * Math.pow(e / i, Math.pow(n, t));

// 按归一化时间施加增益包络
function applyGainCurve(i, e, t) {
  for (let n = 0; n < i.length; n++) i[n] *= t(n / e);
  return i;
}
// 指数衰减包络，可选起音时间
var decayCurve = (i, e = 0) =>
  e > 0
    ? (t) => (1 - Math.exp(-t / e)) * Math.exp(-t / i)
    : (t) => Math.exp(-t / i);

// 把源缓冲按秒偏移和增益叠加进目标缓冲
function mixBufferAt(i, e, t, n, s) {
  let o = Math.round(t * s),
    r = Math.min(e.length, i.length - o);
  for (let a = Math.max(0, -o); a < r; a++) i[o + a] += e[a] * n;
  return i;
}

// 循环叠加，用于在固定长度里铺满音符
function mixBufferLooping(i, e, t, n, s) {
  let o = i.length,
    r = Math.round(t * s) % o;
  r < 0 && (r += o);
  for (let a = 0; a < e.length; a++) (i[r] += e[a] * n), ++r >= o && (r = 0);
  return i;
}

// 取缓冲峰值
function peakLevel(i) {
  let e = 0;
  for (let t = 0; t < i.length; t++) {
    let n = Math.abs(i[t]);
    n > e && (e = n);
  }
  return e;
}

// 原地缩放缓冲
function scaleBuffer(i, e) {
  for (let t = 0; t < i.length; t++) i[t] *= e;
  return i;
}

// tanh 软削波，压住尖峰
function softClip(i, e) {
  let t = 1 / Math.tanh(e);
  for (let n = 0; n < i.length; n++) i[n] = Math.tanh(i[n] * e) * t;
  return i;
}

// 首尾淡入淡出，消除爆音
function fadeEdges(i, e, t, n) {
  let s = Math.min(i.length >> 1, Math.round(t * e)),
    o = Math.min(i.length >> 1, Math.round(n * e));
  for (let r = 0; r < s; r++) i[r] *= r / s;
  for (let r = 0; r < o; r++) {
    let a = r / o;
    i[i.length - 1 - r] *= a * a;
  }
  return i;
}

// 过滤白噪声 + 衰减包络，作撞击/摩擦底噪
function filteredNoiseBurst(i, e, t, n, s = {}) {
  let o = generateNoise(i, t, e);
  s.hp && applyBiquad(o, "hp", s.hp, 0.707, i),
    s.lp && applyBiquad(o, "lp", s.lp, 0.707, i),
    s.bp && applyBiquad(o, "bp", s.bp, s.q || 1, i),
    applyGainCurve(o, i, decayCurve(n, s.att || 0));
  let r = peakLevel(o);
  return r > 0 ? scaleBuffer(o, 1 / r) : o;
}

// 正弦扫频音，频率从高滑到低并指数衰减
function pitchSweepTone(i, e, t, n, s, o, r = 6e-4) {
  let a = allocSamples(i, e),
    l = 0;
  for (let c = 0; c < a.length; c++) {
    let u = c / i;
    (l += (TAU * (n + (t - n) * Math.exp(-u / s))) / i),
      (a[c] = Math.sin(l) * Math.exp(-u / o) * (1 - Math.exp(-u / r)));
  }
  return a;
}

// 正弦扫频，可加半周窗
function sineSweep(i, e, t, n, s = !0) {
  let o = allocSamples(i, e),
    r = 0,
    a = o.length;
  for (let l = 0; l < a; l++) {
    let c = l / a;
    (r += (TAU * t * Math.pow(n / t, c)) / i),
      (o[l] = Math.sin(r) * (s ? Math.sin(Math.PI * c) : 1));
  }
  return o;
}

// 多个衰减正弦叠加，模拟金属/木材/玻璃共振
function modalPing(i, e, t, n) {
  let s = allocSamples(i, e);
  for (let [r, a, l] of t) {
    if (r > i * 0.46) continue;
    let c = (TAU * r) / i,
      u = n ? n() * TAU : 0,
      h = Math.exp(-1 / (a * i)),
      f = l;
    for (
      let p = 0;
      p < s.length &&
      ((s[p] += Math.sin(c * p + u) * f), (f *= h), !(f < 1e-5));
      p++
    );
  }
  let o = Math.min(s.length, Math.round(4e-4 * i));
  for (let r = 0; r < o; r++) s[r] *= r / o;
  return s;
}

// 随机噪声颗粒，模拟碎裂/爆裂
function noiseGrains(i, e, t, n, s = {}) {
  let o = allocSamples(i, t),
    r = s.from || 0,
    a = s.fall || 1;
  for (let l = 0; l < n; l++) {
    let c = r + (t - r - 0.02) * Math.pow(e(), a),
      u = Math.round(c * i),
      h = Math.round(randomBetween(e, s.minLen || 0.001, s.maxLen || 0.004) * i),
      f = randomBetween(e, 0.2, 1) * (s.ampFall ? Math.exp(-c / s.ampFall) : 1);
    for (let p = 0; p < h && u + p < o.length; p++)
      o[u + p] += (e() * 2 - 1) * f * Math.exp((-4 * p) / h);
  }
  return (
    s.hp && applyBiquad(o, "hp", s.hp, 0.707, i),
    s.lp && applyBiquad(o, "lp", s.lp, 0.707, i),
    s.bp && applyBiquad(o, "bp", s.bp, s.q || 1, i),
    o
  );
}

// 把尾部交叉淡入头部，生成无缝循环
function crossfadeLoop(i, e, t) {
  let n = i.length - e,
    s = new Float32Array(e);
  s.set(i.subarray(0, e));
  for (let o = 0; o < n; o++) {
    let r = (o + 0.5) / n,
      a = t ? Math.sin((r * Math.PI) / 2) : r,
      l = t ? Math.cos((r * Math.PI) / 2) : 1 - r;
    s[o] = i[o] * a + i[e + o] * l;
  }
  return s;
}

// 生成可循环噪声（尾部与头部交叉淡化）
function noiseLoop(i, e, t, n, s = 0.4) {
  let o = generateNoise(i, e + s, t);
  return n(o), crossfadeLoop(o, Math.round(i * e), !0);
}

// 多个缓冲按增益相加
function mixBuffers(i, ...e) {
  let t = new Float32Array(i);
  for (let [n, s] of e)
    for (let o = 0; o < Math.min(i, n.length); o++) t[o] += n[o] * s;
  return t;
}

// ===== 武器与换弹音效 =====

// 步枪单发：多层噪声冲击 + 低频推力 + 机械尾音
function synthRifleShot(i, e, t) {
  let n = [1, 0.955, 1.045, 0.985][t & 3],
    s = [1, 1.12, 0.9, 1.05][t & 3],
    o = allocSamples(i, 0.32);
  mixBufferAt(o, filteredNoiseBurst(i, e, 0.012, 0.0011, { hp: 2600 * s }), 0, 2.6, i),
    mixBufferAt(o, filteredNoiseBurst(i, e, 0.02, 0.003, { hp: 1200, lp: 8e3 }), 2e-4, 1.2, i),
    mixBufferAt(o, pitchSweepTone(i, 0.11, 160 * n, 45 * n, 0.024, 0.03, 0.003), 0, 0.62, i),
    mixBufferAt(
      o,
      filteredNoiseBurst(i, e, 0.22, 0.03, { hp: 300 * n, lp: 2500 * n * s, att: 0.0012 }),
      0,
      1.5,
      i,
    ),
    mixBufferAt(
      o,
      filteredNoiseBurst(i, e, 0.09, 0.016, { bp: 760 * n, q: 2.2, att: 0.001 }),
      0,
      0.9,
      i,
    ),
    mixBufferAt(o, filteredNoiseBurst(i, e, 0.16, 0.04, { hp: 4800 }), 0.001, 0.34, i);
  let r = 0.035 + (t - 1.5) * 0.0015;
  return (
    mixBufferAt(
      o,
      modalPing(
        i,
        0.05,
        [
          [2150 * n, 0.007, 1],
          [3420 * n, 0.006, 0.7],
          [5230, 0.004, 0.5],
          [880 * n, 0.012, 0.5],
        ],
        e,
      ),
      r,
      0.26,
      i,
    ),
    mixBufferAt(o, filteredNoiseBurst(i, e, 0.012, 0.002, { bp: 3100, q: 1.2 }), r, 0.3, i),
    mixBufferAt(
      o,
      modalPing(
        i,
        0.05,
        [
          [1780 * n, 0.008, 1],
          [2890 * n, 0.006, 0.6],
          [640 * n, 0.02, 0.5],
        ],
        e,
      ),
      r + 0.027,
      0.17,
      i,
    ),
    mixBufferAt(o, filteredNoiseBurst(i, e, 0.01, 0.002, { bp: 2400, q: 1.2 }), r + 0.027, 0.16, i),
    mixBufferAt(
      o,
      modalPing(
        i,
        0.2,
        [
          [712 * n, 0.05, 1],
          [1466 * n, 0.03, 0.4],
        ],
        e,
      ),
      r + 0.03,
      0.035,
      i,
    ),
    softClip(scaleBuffer(o, 0.46), 1.5)
  );
}

// 室外枪声尾音（开阔地多次反射）
function synthRifleTailOutdoor(i, e, t) {
  let n = (o) => {
      let r = createSeededRandom(o),
        a = allocSamples(i, 1.55),
        l = t
          ? [
              [0.058, 0.5, 4200],
              [0.097, 0.4, 3300],
              [0.139, 0.28, 2500],
              [0.176, 0.2, 1900],
              [0.262, 0.1, 1300],
            ]
          : [
              [0.066, 0.52, 4600],
              [0.088, 0.34, 3600],
              [0.124, 0.3, 2700],
              [0.169, 0.22, 2e3],
              [0.231, 0.12, 1400],
            ];
      for (let [h, f, p] of l)
        mixBufferAt(
          a,
          filteredNoiseBurst(i, r, 0.09, 0.016, { hp: 420, lp: p }),
          h + randomBetween(r, -0.004, 0.004),
          f * randomBetween(r, 0.8, 1.1),
          i,
        );
      let c = generateNoise(i, 1.5, r);
      applySweepingBiquad(c, "lp", frequencyRamp(3400, 380, 0.6), 0.6, i),
        applyBiquad(c, "hp", 130, 0.7, i),
        mixBufferAt(a, applyGainCurve(c, i, decayCurve(0.3, 0.05)), 0.03, 0.55, i);
      let u = generateNoise(i, 1.2, r);
      return (
        applyBiquad(u, "lp", 150, 0.7, i),
        mixBufferAt(a, applyGainCurve(u, i, decayCurve(0.26, 0.03)), 0.02, 0.9, i),
        a
      );
    },
    s = Math.floor(e() * 1e9);
  return [n(s), n(s + 77)];
}

// 室内枪声尾音（短而闷）
function* synthRifleTailIndoor(i, e, t) {
  let n = function* (o) {
      let r = createSeededRandom(o),
        a = allocSamples(i, 2.3),
        l = generateNoise(i, 2.25, r);
      applySweepingBiquad(l, "lp", frequencyRamp(2400, 260, 0.5), 0.7, i),
        mixBufferAt(a, applyGainCurve(l, i, decayCurve(0.42, 0.012)), 0.008, 0.6, i);
      for (let [u, h] of [
        [54, 1],
        [81, 0.8],
        [117, 0.6],
        [163, 0.45],
        [228, 0.3],
      ]) {
        let f = generateNoise(i, 2.2, r);
        applyBiquad(f, "bp", u * (t ? 1.06 : 1), 9, i),
          mixBufferAt(a, applyGainCurve(f, i, decayCurve(0.5, 0.02)), 0.01, h * 2.4, i),
          yield;
      }
      let c = t ? 0.051 : 0.044;
      for (let u = 1; u < 9; u++)
        mixBufferAt(
          a,
          filteredNoiseBurst(i, r, 0.05, 0.009, { hp: 500, lp: 3800 / (1 + u * 0.35) }),
          c * u + randomBetween(r, -0.003, 0.003),
          0.42 * Math.pow(0.74, u),
          i,
        );
      return a;
    },
    s = Math.floor(e() * 1e9);
  return [yield* n(s), yield* n(s + 131)];
}

// 空仓击锤
function synthRifleDry(i, e) {
  let t = allocSamples(i, 0.13);
  return (
    mixBufferAt(
      t,
      modalPing(
        i,
        0.05,
        [
          [2840, 0.004, 1],
          [4130, 0.004, 0.7],
          [6320, 0.003, 0.5],
          [1210, 0.008, 0.4],
        ],
        e,
      ),
      0,
      0.7,
      i,
    ),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.006, 0.0012, { hp: 2e3 }), 0, 0.6, i),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.08,
        [
          [930, 0.018, 1],
          [1870, 0.012, 0.5],
        ],
        e,
      ),
      0.016,
      0.16,
      i,
    ),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.004, 0.001, { hp: 3e3 }), 0.018, 0.2, i),
    t
  );
}

// 带通噪声 + 随机幅度抖动（金属摩擦/弹片颤音）
function modulatedBandNoise(i, e, t, n, s, o) {
  let r = generateNoise(i, t, e);
  applySweepingBiquad(r, "bp", frequencyRamp(n, s), 1.6, i);
  let a = 0.5,
    l = 0.5;
  for (let c = 0; c < r.length; c++) {
    c % Math.round(i / o) === 0 && (l = 0.25 + e() * 0.75),
      (a += (l - a) * 0.02);
    let u = c / r.length;
    r[c] *= a * Math.sin(Math.PI * Math.pow(u, 0.7));
  }
  return r;
}

// 换弹：弹匣脱出
function synthReloadMagOut(i, e) {
  let t = allocSamples(i, 0.46);
  return (
    mixBufferAt(
      t,
      modalPing(
        i,
        0.03,
        [
          [3300, 0.004, 1],
          [5100, 0.003, 0.6],
        ],
        e,
      ),
      0.004,
      0.45,
      i,
    ),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.005, 0.001, { hp: 2500 }), 0.004, 0.35, i),
    mixBufferAt(t, modulatedBandNoise(i, e, 0.17, 1700, 3400, 190), 0.03, 0.5, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.06, 0.012, { lp: 950 }), 0.2, 0.8, i),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.12,
        [
          [415, 0.03, 1],
          [1140, 0.018, 0.6],
          [2290, 0.01, 0.4],
          [3470, 0.006, 0.25],
        ],
        e,
      ),
      0.2,
      0.42,
      i,
    ),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.08, 0.02, { bp: 2600, q: 0.8 }), 0.215, 0.14, i),
    t
  );
}

// 换弹：弹匣插入
function synthReloadMagIn(i, e) {
  let t = allocSamples(i, 0.5);
  return (
    mixBufferAt(t, modulatedBandNoise(i, e, 0.14, 1250, 2900, 240), 0, 0.55, i),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.03,
        [
          [2600, 0.004, 1],
          [4300, 0.003, 0.5],
        ],
        e,
      ),
      0.05,
      0.2,
      i,
    ),
    mixBufferAt(t, pitchSweepTone(i, 0.07, 190, 88, 0.02, 0.022), 0.15, 0.8, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.05, 0.008, { lp: 1600 }), 0.15, 0.8, i),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.1,
        [
          [655, 0.024, 1],
          [1710, 0.014, 0.6],
          [3120, 0.008, 0.4],
        ],
        e,
      ),
      0.15,
      0.4,
      i,
    ),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.04,
        [
          [3650, 0.005, 1],
          [5600, 0.004, 0.6],
          [2100, 0.007, 0.5],
        ],
        e,
      ),
      0.187,
      0.42,
      i,
    ),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.005, 0.001, { hp: 3e3 }), 0.187, 0.36, i),
    t
  );
}

// 换弹：拉枪机
function synthReloadBolt(i, e) {
  let t = allocSamples(i, 0.38);
  mixBufferAt(
    t,
    modalPing(
      i,
      0.03,
      [
        [2900, 0.005, 1],
        [4600, 0.004, 0.6],
      ],
      e,
    ),
    0,
    0.3,
    i,
  ),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.03, 0.01, { bp: 2200, q: 0.8 }), 0.004, 0.25, i);
  let n = 0.03;
  return (
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.02, 0.004, { hp: 1200 }), n, 1, i),
    mixBufferAt(t, pitchSweepTone(i, 0.06, 230, 105, 0.012, 0.018), n, 0.8, i),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.15,
        [
          [1310, 0.03, 1],
          [2460, 0.024, 0.8],
          [3920, 0.016, 0.6],
          [5640, 0.01, 0.45],
          [7900, 0.006, 0.3],
        ],
        e,
      ),
      n,
      0.36,
      i,
    ),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.3,
        [
          [722, 0.075, 1],
          [1451, 0.05, 0.35],
        ],
        e,
      ),
      n + 0.002,
      0.1,
      i,
    ),
    softClip(t, 1.3)
  );
}

// 弹壳落地弹跳（三种变体）
function synthShellBounce(i, e, t) {
  let n = allocSamples(i, 0.55),
    s = [1, 1.09, 0.93][t % 3],
    o = 0,
    r = 1,
    a = 2 + (t !== 1 ? 1 : 0);
  for (let l = 0; l < a; l++) {
    let c = s * randomBetween(e, 0.96, 1.05);
    mixBufferAt(
      n,
      modalPing(
        i,
        0.22,
        [
          [4180 * c, randomBetween(e, 0.03, 0.055), 1],
          [6830 * c, 0.03, 0.7],
          [9760 * c, 0.02, 0.5],
          [11900 * c, 0.012, 0.3],
          [2470 * c, 0.012, 0.3],
        ],
        e,
      ),
      o,
      r * 0.5,
      i,
    ),
      mixBufferAt(n, filteredNoiseBurst(i, e, 0.004, 8e-4, { hp: 3500 }), o, r * 0.5, i),
      (o += randomBetween(e, 0.085, 0.15) * (l ? 0.75 : 1)),
      (r *= randomBetween(e, 0.45, 0.62));
  }
  return n;
}

// ===== 脚步、落地与命中音效 =====

// 混凝土脚步
function synthStepConcrete(i, e, t) {
  let n = allocSamples(i, 0.3),
    s = [1, 1.07, 0.94, 1.03][t & 3];
  mixBufferAt(n, pitchSweepTone(i, 0.06, 112 * s, 58 * s, 0.018, 0.02, 0.002), 0, 0.75, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.06, 0.016, { lp: 720 * s }), 0, 0.9, i),
    mixBufferAt(
      n,
      filteredNoiseBurst(i, e, 0.1, 0.028, { bp: 2500 * s, q: 0.7, att: 0.004 }),
      0.012,
      0.22,
      i,
    );
  let o = filteredNoiseBurst(i, e, 0.2, 0.05, { hp: 3800, att: 0.01 }),
    r = 1;
  for (let a = 0; a < o.length; a++)
    a % 70 === 0 && (r = 0.3 + e() * 0.7), (o[a] *= r);
  return mixBufferAt(n, o, 0.02, 0.16, i), n;
}

// 水花与气泡层：带通噪声 + 随机小气泡扫频（涉水/湿地脚步共用）
function splashLayer(i, e, t, n) {
  let s = allocSamples(i, t),
    o = generateNoise(i, t * 0.9, e);
  applySweepingBiquad(o, "bp", frequencyRamp(1500, 520), 0.8, i),
    mixBufferAt(s, applyGainCurve(o, i, decayCurve(0.085 * n, 0.007)), 0, 0.9, i),
    mixBufferAt(
      s,
      filteredNoiseBurst(i, e, t * 0.8, 0.07 * n, { hp: 3e3, att: 0.012 }),
      0.01,
      0.25,
      i,
    );
  let r = Math.round(5 * n);
  for (let a = 0; a < r; a++) {
    let l = randomBetween(e, 500, 1700);
    mixBufferAt(
      s,
      sineSweep(i, randomBetween(e, 0.008, 0.02), l, l * randomBetween(e, 1.3, 1.9)),
      randomBetween(e, 0.03, t * 0.6),
      randomBetween(e, 0.1, 0.3),
      i,
    );
  }
  return s;
}

// 涉水脚步
function synthStepWater(i, e, t) {
  let n = splashLayer(i, e, 0.46, 1 + t * 0.08);
  return mixBufferAt(n, pitchSweepTone(i, 0.06, 100, 55, 0.02, 0.02, 0.002), 0, 0.5, i), n;
}

// 金属脚步
function synthStepMetal(i, e, t) {
  let n = allocSamples(i, 0.38),
    s = [1, 1.08, 0.92][t % 3];
  return (
    mixBufferAt(n, pitchSweepTone(i, 0.06, 120, 62, 0.018, 0.02, 0.002), 0, 0.6, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.04, 0.008, { lp: 2400 }), 0, 0.6, i),
    mixBufferAt(
      n,
      modalPing(
        i,
        0.36,
        [
          [178 * s, 0.09, 1],
          [412 * s, 0.075, 0.8],
          [733 * s, 0.06, 0.55],
          [1214 * s, 0.045, 0.4],
          [1958 * s, 0.03, 0.3],
          [3130 * s, 0.016, 0.18],
        ],
        e,
      ),
      0.001,
      0.3,
      i,
    ),
    mixBufferAt(
      n,
      filteredNoiseBurst(i, e, 0.08, 0.02, { bp: 3e3, q: 0.8, att: 0.003 }),
      0.01,
      0.1,
      i,
    ),
    n
  );
}

// 落地
function synthLand(i, e) {
  let t = allocSamples(i, 0.45);
  mixBufferAt(t, pitchSweepTone(i, 0.14, 124, 44, 0.03, 0.045, 0.002), 0, 1, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.14, 0.035, { lp: 520 }), 0, 1, i),
    mixBufferAt(
      t,
      filteredNoiseBurst(i, e, 0.2, 0.06, { bp: 1500, q: 0.7, att: 0.01 }),
      0.01,
      0.16,
      i,
    );
  for (let n of [0.022, 0.05, 0.088])
    mixBufferAt(
      t,
      filteredNoiseBurst(i, e, 0.012, 0.003, { bp: randomBetween(e, 2200, 4200), q: 2 }),
      n,
      randomBetween(e, 0.1, 0.22),
      i,
    );
  return (
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.2, 0.05, { hp: 3500, att: 0.01 }), 0.015, 0.1, i),
    softClip(t, 1.2)
  );
}

// 起跳/衣物摩擦
function synthJump(i, e) {
  let t = allocSamples(i, 0.26);
  return (
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.2, 0.05, { bp: 900, q: 0.7, att: 0.02 }), 0, 0.6, i),
    mixBufferAt(
      t,
      filteredNoiseBurst(i, e, 0.1, 0.025, { bp: 2600, q: 0.8, att: 0.004 }),
      0.005,
      0.35,
      i,
    ),
    mixBufferAt(t, pitchSweepTone(i, 0.05, 95, 60, 0.02, 0.018, 0.003), 0, 0.4, i),
    t
  );
}

// 玩家受伤
function synthHurt(i, e) {
  let t = allocSamples(i, 0.5);
  return (
    mixBufferAt(t, pitchSweepTone(i, 0.25, 92, 38, 0.04, 0.06, 0.0015), 0, 1.1, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.2, 0.04, { lp: 320 }), 0, 1.2, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.06, 0.01, { bp: 820, q: 1 }), 0, 0.55, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.03, 0.004, { hp: 1800, lp: 5e3 }), 0, 0.2, i),
    softClip(t, 1.6)
  );
}

// 受击后的耳鸣
function synthEarRing(i) {
  let e = allocSamples(i, 2.4);
  for (let t = 0; t < e.length; t++) {
    let n = t / i;
    e[t] =
      (Math.sin(TAU * 3150 * n) +
        0.7 * Math.sin(TAU * 4013 * n + 1) +
        0.35 * Math.sin(TAU * 5310 * n + 2)) *
      (1 - Math.exp(-n / 0.12)) *
      Math.exp(-n / 0.55);
  }
  return e;
}

// 子弹命中金属
function synthImpactMetal(i, e, t) {
  let n = allocSamples(i, 0.5),
    s = [640, 880, 745][t % 3] * randomBetween(e, 0.97, 1.03);
  return (
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.015, 0.003, { hp: 1500 }), 0, 1, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.04, 0.008, { lp: 1800 }), 0, 0.6, i),
    mixBufferAt(
      n,
      modalPing(
        i,
        0.48,
        [1, 1.58, 2.24, 2.92, 3.71, 4.93, 6.31, 8.1].map((r, a) => [
          s * r,
          0.13 / (1 + a * 0.55),
          1 / (1 + a * 0.5),
        ]),
        e,
      ),
      5e-4,
      0.42,
      i,
    ),
    n
  );
}

// 子弹命中混凝土
function synthImpactConcrete(i, e, t) {
  let n = allocSamples(i, 0.36),
    s = [1, 1.1, 0.9][t % 3];
  return (
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.06, 0.013, { lp: 950 * s }), 0, 1.1, i),
    mixBufferAt(n, pitchSweepTone(i, 0.05, 150 * s, 70, 0.012, 0.016), 0, 0.6, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.012, 0.002, { hp: 2e3 }), 0, 0.6, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.12, 0.024, { bp: 3500 * s, q: 0.7 }), 0.003, 0.3, i),
    mixBufferAt(
      n,
      noiseGrains(i, e, 0.34, 16, { from: 0.03, fall: 1.8, hp: 1800, ampFall: 0.1 }),
      0,
      0.35,
      i,
    ),
    n
  );
}

// 子弹命中木材
function synthImpactWood(i, e, t) {
  let n = allocSamples(i, 0.26),
    s = t ? 1.14 : 1;
  return (
    mixBufferAt(
      n,
      modalPing(
        i,
        0.2,
        [
          [238 * s, 0.03, 1],
          [512 * s, 0.022, 0.8],
          [893 * s, 0.016, 0.6],
          [1410 * s, 0.01, 0.4],
        ],
        e,
      ),
      0,
      0.6,
      i,
    ),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.03, 0.006, { lp: 2100 }), 0, 0.8, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.01, 0.002, { hp: 3e3 }), 0, 0.5, i),
    mixBufferAt(
      n,
      noiseGrains(i, e, 0.2, 6, { from: 0.01, fall: 2, bp: 2600, q: 1.5 }),
      0,
      0.3,
      i,
    ),
    n
  );
}

// 子弹入水
function synthImpactWater(i, e, t) {
  let n = splashLayer(i, e, 0.5, 0.8 + t * 0.2);
  return mixBufferAt(n, sineSweep(i, 0.035, 420, 1150), 0, 0.5, i), n;
}

// 命中敌人
function synthImpactEnemy(i, e, t) {
  let n = allocSamples(i, 0.3),
    s = [1, 1.12, 0.9][t % 3];
  mixBufferAt(n, filteredNoiseBurst(i, e, 0.03, 0.007, { hp: 4e3 }), 0, 0.9, i),
    mixBufferAt(
      n,
      modalPing(
        i,
        0.12,
        [
          [2920 * s, 0.022, 1],
          [4730 * s, 0.018, 0.8],
          [7310 * s, 0.012, 0.6],
          [1180 * s, 0.03, 0.5],
        ],
        e,
      ),
      0,
      0.4,
      i,
    ),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.05, 0.012, { bp: 320 * s, q: 1.5 }), 0, 0.9, i);
  let o = generateNoise(i, 0.06, e);
  applyBiquad(o, "bp", 2400, 1, i);
  for (let r = 0; r < o.length; r++) {
    let a = r / i;
    o[r] *= (Math.sin(TAU * 118 * a) > 0.2 ? 1 : 0.1) * Math.exp(-a / 0.02);
  }
  return (
    mixBufferAt(n, o, 0.004, 0.5, i),
    mixBufferAt(
      n,
      noiseGrains(i, e, 0.28, 10, { from: 0.02, fall: 1.6, hp: 5e3, ampFall: 0.08 }),
      0,
      0.3,
      i,
    ),
    n
  );
}

// 玻璃碎裂
function synthImpactGlass(i, e) {
  let t = allocSamples(i, 0.45);
  mixBufferAt(t, filteredNoiseBurst(i, e, 0.01, 0.002, { hp: 2500 }), 0, 1, i);
  for (let n = 0; n < 9; n++) {
    let s = randomBetween(e, 3200, 9500);
    mixBufferAt(
      t,
      modalPing(
        i,
        0.1,
        [
          [s, randomBetween(e, 0.01, 0.03), 1],
          [s * 1.47, 0.01, 0.5],
        ],
        e,
      ),
      Math.pow(e(), 2) * 0.3,
      randomBetween(e, 0.1, 0.35),
      i,
    );
  }
  return t;
}

// 跳弹
function synthRicochet(i, e, t) {
  let n = allocSamples(i, 0.75),
    s = [3300, 2700, 3900][t % 3],
    o = [820, 1100, 700][t % 3],
    r = 0,
    a = generateNoise(i, 0.75, e);
  for (let l = 0; l < n.length; l++) {
    let c = l / i,
      u = o + (s - o) * Math.exp(-c / 0.16),
      h = 1 + 0.035 * Math.sin(TAU * (18 + 30 * c) * c);
    (r += (TAU * u * h) / i),
      (n[l] =
        (Math.sin(r) + 0.3 * Math.sin(2 * r)) *
        (1 - Math.exp(-c / 0.004)) *
        Math.exp(-c / 0.19));
  }
  return (
    applySweepingBiquad(a, "bp", (l) => o + (s - o) * Math.exp((-l * 0.75) / 0.16), 6, i),
    mixBufferAt(n, applyGainCurve(a, i, decayCurve(0.15, 0.003)), 0, 1.6, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.01, 0.002, { hp: 2500 }), 0, 0.7, i),
    n
  );
}

// 子弹擦身而过的呼啸
function synthWhiz(i, e, t) {
  let n = allocSamples(i, 0.3),
    s = generateNoise(i, 0.28, e),
    o = [5200, 4300, 6100][t % 3],
    r = [1300, 1e3, 1700][t % 3];
  applySweepingBiquad(s, "bp", frequencyRamp(o, r, 0.8), 3.5, i);
  for (let l = 0; l < s.length; l++) {
    let c = (l / i - 0.05) / (l / i < 0.05 ? 0.018 : 0.05);
    s[l] *= Math.exp(-c * c);
  }
  mixBufferAt(n, s, 0, 1, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.006, 8e-4, { hp: 3e3 }), 0.048, 0.25, i);
  let a = sineSweep(i, 0.2, o * 0.5, r * 0.6);
  return mixBufferAt(n, a, 0, 0.03, i), n;
}
// 量化到指定精度
var quantize = (i, e) => Math.round(i * e) / e;

// 无人机旋翼循环
function* synthGullRotor(i, e) {
  let n = i * 2,
    s = new Float32Array(n),
    o = [
      [184, 2.5],
      [207.5, 3.5],
      [233, 2],
      [258.5, 4.5],
    ];
  for (let [l, c] of o) {
    let u = quantize(l, 2),
      h = quantize(c, 2),
      f = e() * TAU,
      p = e() * TAU;
    for (let d = 0; d < n; d++) {
      let v = d / i,
        g = TAU * u * v + f;
      s[d] +=
        (Math.sin(g) +
          0.5 * Math.sin(2 * g + 1) +
          0.3 * Math.sin(3 * g + 2) +
          0.16 * Math.sin(4 * g) +
          0.08 * Math.sin(6 * g)) *
        (0.72 + 0.28 * Math.sin(TAU * h * v + p)) *
        0.25;
    }
    yield;
  }
  let r = noiseLoop(
      i,
      2,
      e,
      (l) => {
        applyBiquad(l, "hp", 1100, 0.7, i), applyBiquad(l, "lp", 5200, 0.7, i);
      },
      0.25,
    ),
    a = quantize(46, 2);
  for (let l = 0; l < n; l++)
    s[l] += r[l] * (0.55 + 0.45 * Math.sin((TAU * a * l) / i)) * 0.5;
  return s;
}

// 机器狗伺服循环
function synthHoundServo(i, e) {
  let n = i * 2,
    s = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    let a = r / i,
      l = 1.1 * Math.sin(TAU * 0.5 * a) + 0.5 * Math.sin(TAU * 1.5 * a + 1),
      c = TAU * 310 * a + l,
      u = 0.7 + 0.3 * Math.sin(TAU * 1.5 * a),
      h =
        (Math.sin(c) +
          0.45 * Math.sin(2 * c + l) +
          0.2 * Math.sin(4 * c + 0.5)) *
        0.3 *
        u,
      f = TAU * 62 * a;
    (h +=
      (Math.sin(f) +
        0.5 * Math.sin(2 * f) +
        0.33 * Math.sin(3 * f) +
        0.2 * Math.sin(5 * f)) *
      0.28),
      (s[r] = h);
  }
  let o = noiseLoop(
    i,
    2,
    e,
    (r) => {
      applyBiquad(r, "hp", 2800, 0.7, i), applyBiquad(r, "lp", 7e3, 0.7, i);
    },
    0.25,
  );
  for (let r = 0; r < n; r++)
    s[r] += o[r] * 0.12 * (0.6 + 0.4 * Math.sin((TAU * 1.5 * r) / i + 2));
  return s;
}

// 中继器电流嗡鸣
function synthRelayHum(i, e) {
  let n = i * 2,
    s = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    let a = r / i,
      l = TAU * 50 * a;
    s[r] =
      (Math.sin(l) * 0.5 +
        Math.sin(2 * l + 0.4) +
        0.5 * Math.sin(3 * l + 1) +
        0.3 * Math.sin(4 * l) +
        0.22 * Math.sin(6 * l + 2) +
        0.12 * Math.sin(10 * l)) *
        0.3 *
        (0.9 + 0.1 * Math.sin(TAU * 0.5 * a)) +
      Math.sin(TAU * 4100 * a) * 0.012 * (0.6 + 0.4 * Math.sin(TAU * 1 * a)) +
      Math.sin(TAU * 1250 * a + 0.6 * Math.sin(TAU * 2 * a)) * 0.02;
  }
  let o = noiseLoop(i, 2, e, (r) => applyBiquad(r, "bp", 2100, 1.2, i), 0.25);
  for (let r = 0; r < n; r++)
    s[r] +=
      o[r] * 0.16 * Math.pow(0.5 + 0.5 * Math.sin((TAU * 100 * r) / i), 3);
  return s;
}

// ===== 敌人、场景与 UI 音效 =====

// 无人机开火
function synthGullFire(i, e, t) {
  let n = allocSamples(i, 0.3),
    s = t ? 1.07 : 1,
    o = 0;
  mixBufferAt(n, filteredNoiseBurst(i, e, 0.008, 0.0012, { hp: 3200 }), 0, 1.1, i);
  let r = allocSamples(i, 0.12);
  for (let a = 0; a < r.length; a++) {
    let l = a / i,
      c = (380 + 620 * Math.exp(-l / 0.018)) * s;
    o += c / i;
    let u = 2 * (o - Math.floor(o)) - 1;
    r[a] =
      (u + 0.5 * Math.sign(Math.sin(TAU * o * 2.02))) * Math.exp(-l / 0.024);
  }
  return (
    applyBiquad(r, "bp", 1500 * s, 0.9, i),
    mixBufferAt(n, r, 0, 1.5, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.08, 0.014, { bp: 2400 * s, q: 1.4 }), 0, 0.7, i),
    mixBufferAt(n, pitchSweepTone(i, 0.05, 240, 120, 0.012, 0.014), 0, 0.5, i),
    mixBufferAt(
      n,
      modalPing(
        i,
        0.05,
        [
          [3400 * s, 0.006, 1],
          [5200, 0.005, 0.6],
          [1900, 0.008, 0.5],
        ],
        e,
      ),
      0.021,
      0.2,
      i,
    ),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.15, 0.04, { hp: 6e3 }), 0.002, 0.1, i),
    softClip(scaleBuffer(n, 0.6), 1.6)
  );
}

// 机器狗开火
function synthHoundFire(i, e, t) {
  let n = allocSamples(i, 0.48),
    s = t ? 0.94 : 1;
  return (
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.012, 0.002, { hp: 1500, lp: 6e3 }), 0, 0.7, i),
    mixBufferAt(n, pitchSweepTone(i, 0.3, 112 * s, 37 * s, 0.035, 0.07), 0, 1.4, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.3, 0.045, { hp: 90, lp: 900 * s }), 0, 1.2, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.12, 0.024, { bp: 420 * s, q: 1.6 }), 0, 1.2, i),
    mixBufferAt(
      n,
      modalPing(
        i,
        0.12,
        [
          [310 * s, 0.03, 1],
          [642 * s, 0.022, 0.7],
          [985 * s, 0.016, 0.5],
          [2200, 0.006, 0.3],
        ],
        e,
      ),
      0.055,
      0.3,
      i,
    ),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.02, 0.004, { bp: 1800, q: 1 }), 0.055, 0.25, i),
    softClip(scaleBuffer(n, 0.42), 1.8)
  );
}

// 机器狗脚步
function synthHoundStep(i, e, t) {
  let n = allocSamples(i, 0.42),
    s = [1, 1.07, 0.93][t % 3];
  mixBufferAt(n, sineSweep(i, 0.035, 920 * s, 610 * s), 0, 0.06, i);
  let o = 0.03;
  return (
    mixBufferAt(n, pitchSweepTone(i, 0.2, 84 * s, 41, 0.03, 0.05, 0.002), o, 1.1, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.12, 0.03, { lp: 360 }), o, 1.1, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.03, 0.006, { lp: 2600, hp: 500 }), o, 0.4, i),
    mixBufferAt(
      n,
      modalPing(
        i,
        0.12,
        [
          [522 * s, 0.026, 1],
          [1133 * s, 0.02, 0.7],
          [1871 * s, 0.014, 0.5],
          [3040 * s, 0.008, 0.3],
        ],
        e,
      ),
      o,
      0.2,
      i,
    ),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.14, 0.04, { hp: 3e3, att: 0.006 }), o + 0.01, 0.06, i),
    softClip(n, 1.5)
  );
}

// 无人机坠毁
function synthGullDie(i, e) {
  let t = allocSamples(i, 1.5),
    n = [0, 0, 0, 0];
  mixBufferAt(t, filteredNoiseBurst(i, e, 0.02, 0.004, { hp: 2500 }), 0, 0.9, i);
  let s = [184, 207, 233, 258];
  for (let a = 0; a < Math.round(1.1 * i); a++) {
    let l = a / i,
      c = Math.pow(0.16, l / 1) * (1 + 0.06 * Math.sin(TAU * (9 - 5 * l) * l)),
      u = 0;
    for (let f = 0; f < 4; f++)
      (n[f] += (TAU * s[f] * c) / i),
        (u +=
          Math.sin(n[f]) +
          0.5 * Math.sin(2 * n[f]) +
          0.3 * Math.sin(3 * n[f]));
    let h = 0.6 + 0.4 * Math.sign(Math.sin(TAU * (26 - 16 * l) * l));
    t[a] += u * 0.16 * h * Math.exp(-l / 0.55) * (1 - Math.exp(-l / 0.01));
  }
  let o = generateNoise(i, 1, e);
  applySweepingBiquad(o, "bp", frequencyRamp(3200, 500), 1, i),
    mixBufferAt(t, applyGainCurve(o, i, decayCurve(0.35, 0.01)), 0, 0.3, i);
  let r = 0.72;
  return (
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.2, 0.035, { lp: 3e3 }), r, 1, i),
    mixBufferAt(t, pitchSweepTone(i, 0.12, 130, 55, 0.02, 0.035), r, 0.8, i),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.4,
        [
          [705, 0.07, 1],
          [1490, 0.05, 0.7],
          [2610, 0.035, 0.5],
          [4020, 0.02, 0.3],
        ],
        e,
      ),
      r,
      0.28,
      i,
    ),
    mixBufferAt(
      t,
      noiseGrains(i, e, 0.7, 26, {
        from: 0.02,
        fall: 1.7,
        hp: 1500,
        ampFall: 0.2,
        maxLen: 0.008,
      }),
      r,
      0.5,
      i,
    ),
    mixBufferAt(
      t,
      modalPing(
        i,
        0.2,
        [
          [1900, 0.03, 1],
          [3350, 0.02, 0.6],
        ],
        e,
      ),
      r + 0.19,
      0.14,
      i,
    ),
    softClip(t, 1.4)
  );
}

// 机器狗报废
function synthHoundDie(i, e) {
  let t = allocSamples(i, 1.9),
    n = 0,
    s = 0,
    o = allocSamples(i, 1.3);
  for (let r = 0; r < o.length; r++) {
    let a = r / i,
      l = 30 + 112 * Math.pow(1 - a / 1.3, 1.6);
    (n += l / i),
      (s += (180 + 1050 * Math.exp(-a / 0.3)) / i),
      (o[r] =
        (2 * (n - Math.floor(n)) - 1) *
          (1 - Math.exp(-a / 0.02)) *
          Math.pow(1 - a / 1.3, 0.7) +
        Math.sin(TAU * s) * 0.25 * Math.exp(-a / 0.4));
  }
  applySweepingBiquad(o, "lp", frequencyRamp(1100, 160), 2.5, i),
    mixBufferAt(t, o, 0, 0.55, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.03, 0.006, { hp: 2e3 }), 0, 0.5, i);
  for (let [r, a, l] of [
    [0.62, 1, 1],
    [0.84, 0.75, 1.22],
    [0.98, 0.5, 0.86],
    [1.17, 0.42, 1.4],
    [1.33, 0.22, 1.1],
  ])
    mixBufferAt(t, pitchSweepTone(i, 0.1, 105 * l, 48, 0.02, 0.035), r, a * 0.9, i),
      mixBufferAt(t, filteredNoiseBurst(i, e, 0.08, 0.016, { lp: 2400 }), r, a * 0.8, i),
      mixBufferAt(
        t,
        modalPing(
          i,
          0.3,
          [
            [388 * l, 0.07, 1],
            [861 * l, 0.05, 0.7],
            [1540 * l, 0.035, 0.5],
            [2750 * l, 0.02, 0.35],
          ],
          e,
        ),
        r,
        a * 0.3,
        i,
      );
  return (
    mixBufferAt(
      t,
      noiseGrains(i, e, 1, 22, {
        from: 0,
        fall: 1.2,
        hp: 1800,
        ampFall: 0.4,
        maxLen: 0.007,
      }),
      0.62,
      0.3,
      i,
    ),
    softClip(scaleBuffer(t, 0.55), 1.5)
  );
}

// 敌人发现玩家
function synthAlert(i, e, t) {
  let n = allocSamples(i, 0.52),
    s = t ? 622 : 1320,
    o = s * 1.4142,
    r = 0,
    a = (l, c, u, h) => {
      let f = Math.round(c * i),
        p = Math.round(l * i);
      for (let d = 0; d < f; d++) {
        let v = d / f,
          g = d / i;
        r += (TAU * u * (1 + h * v)) / i;
        let x = Math.sin(
          r + 1.6 * Math.sin(r * 0.25) + 0.4 * Math.sin(TAU * 71 * g),
        );
        n[p + d] +=
          Math.tanh(x * 2.2) *
          Math.min(1, d / (0.004 * i), (f - d) / (0.012 * i));
      }
    };
  return (
    a(0, 0.09, s, 0),
    a(0.12, 0.17, o, -0.05),
    t && a(0.3, 0.2, s * 0.5, 0.5),
    applyBiquad(n, "bp", t ? 1100 : 2100, 0.6, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.4, 0.2, { hp: 4e3, att: 0.02 }), 0, 0.03, i),
    n
  );
}

// 攻击前摇提示
function synthTelegraph(i, e, t) {
  let n = allocSamples(i, 0.6),
    s = n.length,
    o = 0.55,
    r = 0,
    a = 0;
  for (let c = 0; c < s; c++) {
    let u = c / i,
      h = Math.min(1, u / o),
      f = Math.pow(h, 1.4) * (u < o ? 1 : Math.exp(-(u - o) / 0.008));
    if (t) {
      (r += (170 + 380 * h * h) / i), (a += (680 + 900 * h) / i);
      let p = 2 * (r - Math.floor(r)) - 1;
      n[c] =
        (p * (0.7 + 0.3 * Math.sin(TAU * 38 * u)) + 0.35 * Math.sin(TAU * a)) *
        f;
    } else
      (r += (620 + 1900 * h * h * h) / i),
        (a += ((1240 + 3800 * h * h * h) * 1.003) / i),
        (n[c] =
          (Math.sin(TAU * r) +
            0.4 * Math.sin(TAU * a) +
            0.25 * Math.sign(Math.sin(TAU * r * 0.5))) *
          f *
          (0.8 + 0.2 * Math.sin(TAU * (20 + 60 * h) * u)));
  }
  applyBiquad(n, "lp", t ? 2600 : 7e3, 0.7, i), applyBiquad(n, "hp", t ? 120 : 400, 0.7, i);
  let l = t ? 7 : 5;
  for (let c = 0; c < l; c++) {
    let u = o * Math.sqrt(c / l);
    mixBufferAt(
      n,
      modalPing(
        i,
        0.03,
        [
          [t ? 1500 : 3800, 0.004, 1],
          [t ? 2600 : 6100, 0.003, 0.6],
        ],
        e,
      ),
      u,
      0.12 + (0.2 * c) / l,
      i,
    );
  }
  return n;
}

// 爆炸
function synthExplosion(i, e, t) {
  let n = allocSamples(i, 3),
    s = t ? 0.9 : 1;
  mixBufferAt(n, filteredNoiseBurst(i, e, 0.03, 0.006, { hp: 1500 }), 0, 1.8, i),
    mixBufferAt(n, pitchSweepTone(i, 1.6, 96 * s, 27, 0.16, 0.36, 0.001), 0, 0.85, i);
  let o = generateNoise(i, 1.6, e);
  applySweepingBiquad(o, "lp", frequencyRamp(2800, 260, 0.5), 0.7, i),
    mixBufferAt(n, applyGainCurve(o, i, decayCurve(0.26, 0.002)), 0, 3.2, i);
  let r = generateNoise(i, 2.6, e);
  applyBiquad(r, "lp", 120, 0.7, i),
    mixBufferAt(n, applyGainCurve(r, i, decayCurve(0.7, 0.03)), 0, 2.2, i),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.5, 0.09, { bp: 520 * s, q: 1.2 }), 0, 1.3, i),
    mixBufferAt(
      n,
      noiseGrains(i, e, 2.5, 120, {
        from: 0.25,
        fall: 1.5,
        hp: 1500,
        lp: 9e3,
        ampFall: 0.8,
        maxLen: 0.01,
      }),
      0,
      0.5,
      i,
    );
  for (let a = 0; a < 7; a++) {
    let l = randomBetween(e, 900, 3600);
    mixBufferAt(
      n,
      modalPing(
        i,
        0.2,
        [
          [l, randomBetween(e, 0.02, 0.06), 1],
          [l * 1.61, 0.02, 0.5],
        ],
        e,
      ),
      randomBetween(e, 0.4, 1.9),
      randomBetween(e, 0.03, 0.09),
      i,
    );
  }
  return softClip(scaleBuffer(n, 0.36), 1.7);
}

// 中继器切断
function synthRelayCut(i, e) {
  let t = allocSamples(i, 1.7);
  mixBufferAt(t, filteredNoiseBurst(i, e, 0.01, 0.002, { hp: 2500 }), 0, 1, i);
  let n = generateNoise(i, 0.5, e);
  applyBiquad(n, "bp", 3e3, 0.8, i);
  let s = 1;
  for (let l = 0; l < n.length; l++) {
    let c = l / i;
    l % 220 === 0 && (s = e() < 0.55 + 0.4 * (1 - c / 0.5) ? 1 : 0),
      (n[l] =
        (n[l] * (Math.sin(TAU * 100 * c) > -0.2 ? 1 : 0.15) +
          0.35 * Math.sign(Math.sin(TAU * 100 * c)) * (e() - 0.3)) *
        s *
        Math.exp(-c / 0.3));
  }
  mixBufferAt(t, n, 0.005, 0.8, i);
  let o = allocSamples(i, 1.25),
    r = 0,
    a = 0;
  for (let l = 0; l < o.length; l++) {
    let c = l / i,
      u = Math.pow(0.22, c / 1.2);
    (r += (TAU * 100 * u) / i),
      (a += (TAU * (150 + 1900 * Math.pow(1 - c / 1.25, 2.2))) / i),
      (o[l] =
        ((Math.sin(r) +
          0.6 * Math.sin(2 * r) +
          0.4 * Math.sin(3 * r) +
          0.25 * Math.sin(5 * r)) *
          0.5 +
          Math.sin(a) * 0.22) *
        Math.pow(1 - c / 1.25, 1.2) *
        (1 - Math.exp(-c / 0.03)));
  }
  return (
    mixBufferAt(t, o, 0.4, 0.8, i),
    mixBufferAt(t, pitchSweepTone(i, 0.12, 140, 60, 0.03, 0.04), 0.4, 0.5, i),
    softClip(t, 1.3)
  );
}

// 雷声（两种强度）
function* synthThunder(i, e, t) {
  let n = allocSamples(i, 6.5),
    s = generateNoise(i, 6.4, e);
  yield, applySweepingBiquad(s, "lp", frequencyRamp(t ? 520 : 380, 70, 0.6), 0.7, i), yield;
  let o = [];
  for (let a = 0; a < 9; a++)
    o.push([randomBetween(e, 0.05, 3.6), randomBetween(e, 0.12, 0.5), randomBetween(e, 0.4, 1)]);
  for (let a = 0; a < s.length; a++) {
    let l = a / i,
      c = 0;
    for (let [u, h, f] of o) {
      let p = (l - u) / h;
      c += f * Math.exp(-p * p);
    }
    s[a] *= (0.25 + c) * Math.exp(-l / 1.9) * (1 - Math.exp(-l / 0.05));
  }
  mixBufferAt(n, s, 0, 1, i), yield;
  let r = generateNoise(i, 6, e);
  return (
    applyBiquad(r, "bp", 48, 1.2, i),
    mixBufferAt(n, applyGainCurve(r, i, decayCurve(2, 0.2)), 0.05, 3, i),
    t && mixBufferAt(n, filteredNoiseBurst(i, e, 0.3, 0.06, { hp: 300, lp: 2500 }), 0.02, 0.25, i),
    n
  );
}
var FOGHORN_HARMONICS = [0, 1, 0.435, 0.268, 0.19, 0.145, 0.116, 0.097];

// 雾笛
function synthFoghorn(i, e) {
  let t = allocSamples(i, 5),
    n = t.length;
  for (let s = 0; s < n; s++) {
    let o = s / i,
      r = 0.0025 * Math.sin(TAU * 4.3 * o),
      a =
        Math.min(1, o / 0.45) *
        Math.min(1, (5 - o) / 1.5) *
        (o < 3.2 ? 1 : Math.exp(-(o - 3.2) / 0.7)),
      l = 0;
    for (let c = 1; c <= 7; c++)
      l += Math.sin(TAU * 92.5 * c * o * (1 + r) + c) * FOGHORN_HARMONICS[c];
    for (let c = 1; c <= 4; c++)
      l += 0.45 * Math.sin(TAU * 138.6 * c * o + c * 2) * FOGHORN_HARMONICS[c];
    t[s] = l * a;
  }
  return applyBiquad(t, "lp", 520, 0.7, i), t;
}

// 海鸥叫
function synthGullCry(i, e, t) {
  let n = allocSamples(i, 1.4),
    s = t ? 3 : 4,
    o = 0.02;
  for (let r = 0; r < s; r++) {
    let a = randomBetween(e, 0.17, 0.26) * (t ? 1.4 : 1),
      l = Math.round(a * i),
      c = Math.round(o * i),
      u = (t ? 1250 : 1550) * (1 - r * 0.04),
      h = 0;
    for (let f = 0; f < l && c + f < n.length; f++) {
      let p = f / l,
        d = u * (1 + 0.55 * Math.sin(Math.PI * Math.pow(p, 0.6)) - 0.25 * p);
      h += (TAU * d) / i;
      let v = 1 + 0.3 * Math.sin((TAU * 63 * f) / i);
      n[c + f] +=
        (Math.sin(h) +
          0.6 * Math.sin(2 * h + 0.5) +
          0.35 * Math.sin(3 * h) +
          0.15 * Math.sin(4 * h)) *
        v *
        Math.pow(Math.sin(Math.PI * p), 0.7) *
        (1 - r * 0.14);
    }
    o += a + randomBetween(e, 0.05, 0.12);
  }
  return applyBiquad(n, "lp", 4200, 0.7, i), n;
}

// 缆绳/旗绳拍打
function synthHalyard(i, e, t) {
  let n = allocSamples(i, 1.1),
    s = t ? 1.19 : 1,
    o = 0.01,
    r = t ? 3 : 4;
  for (let a = 0; a < r; a++)
    mixBufferAt(
      n,
      modalPing(
        i,
        0.5,
        [
          [2310 * s, randomBetween(e, 0.06, 0.13), 1],
          [3740 * s, 0.07, 0.7],
          [5910 * s, 0.04, 0.5],
          [8130 * s, 0.025, 0.3],
          [1012 * s, 0.03, 0.3],
        ],
        e,
      ),
      o,
      randomBetween(e, 0.35, 1),
      i,
    ),
      mixBufferAt(n, filteredNoiseBurst(i, e, 0.004, 0.001, { hp: 3e3 }), o, 0.3, i),
      (o += randomBetween(e, 0.09, 0.26));
  return n;
}

// 集装箱闷响
function synthContainerBang(i, e) {
  let t = allocSamples(i, 2.8),
    n = allocSamples(i, 2.2);
  return (
    mixBufferAt(
      n,
      modalPing(
        i,
        2.2,
        [
          [47, 0.7, 1],
          [77, 0.55, 0.9],
          [121, 0.4, 0.7],
          [163, 0.3, 0.5],
          [214, 0.22, 0.4],
          [330, 0.12, 0.25],
        ],
        e,
      ),
      0,
      0.5,
      i,
    ),
    mixBufferAt(n, filteredNoiseBurst(i, e, 0.5, 0.11, { lp: 420 }), 0, 1, i),
    mixBufferAt(t, n, 0, 1, i),
    mixBufferAt(t, n, 0.36, 0.3, i),
    mixBufferAt(t, n, 0.61, 0.12, i),
    t
  );
}

// UI 点击
function synthUiClick(i, e) {
  let t = allocSamples(i, 0.09);
  return (
    mixBufferAt(
      t,
      modalPing(
        i,
        0.08,
        [
          [1820, 0.009, 1],
          [2730, 0.007, 0.6],
          [640, 0.012, 0.5],
        ],
        e,
      ),
      0,
      1,
      i,
    ),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.004, 0.001, { hp: 2500 }), 0, 0.5, i),
    t
  );
}

// UI 悬停
function synthUiHover(i, e) {
  let t = allocSamples(i, 0.06);
  return (
    mixBufferAt(
      t,
      modalPing(
        i,
        0.05,
        [
          [3200, 0.008, 1],
          [4800, 0.005, 0.3],
        ],
        e,
      ),
      0,
      1,
      i,
    ),
    t
  );
}

// ===== 环境声 =====

// 室外雨声循环
function* synthRain(i, e) {
  let n = function* (s) {
    let o = noiseLoop(i, 6, s, (u) => {
      applyBiquad(u, "hp", 900, 0.6, i), applyBiquad(u, "lp", 8500, 0.6, i);
    });
    yield;
    let r = noiseLoop(i, 6, s, (u) => {
        applyBiquad(u, "bp", 420, 0.5, i);
      }),
      a = o.length,
      l = mixBuffers(a, [o, 0.5], [r, 0.75]),
      c = new Float32Array(a);
    for (let u = 0; u < 1020; u++) {
      let h = Math.floor(s() * a),
        f = Math.round(randomBetween(s, 6e-4, 0.003) * i),
        p = Math.pow(s(), 3) * 1.6 + 0.15;
      for (let d = 0; d < f; d++)
        (c[h] += (s() * 2 - 1) * p * Math.exp((-5 * d) / f)),
          ++h >= a && (h = 0);
    }
    yield, applySweepingBiquad(c, "hp", () => 2200, 0.7, i, 2), yield;
    for (let u = 0; u < 30; u++) {
      let h = randomBetween(s, 700, 2100);
      mixBufferLooping(
        c,
        sineSweep(i, randomBetween(s, 0.008, 0.02), h, h * 1.7),
        s() * 6,
        randomBetween(s, 0.08, 0.3),
        i,
      );
    }
    for (let u = 0; u < a; u++) l[u] += c[u] * 0.55;
    return l;
  };
  return [
    yield* n(createSeededRandom(Math.floor(e() * 1e9))),
    yield* n(createSeededRandom(Math.floor(e() * 1e9))),
  ];
}

// 室内雨声循环
function* synthRainInterior(i, e) {
  let n = function* (s) {
    let o = noiseLoop(i, 6, s, (c) => {
        applyBiquad(c, "lp", 1300, 0.6, i), applyBiquad(c, "hp", 110, 0.7, i);
      }),
      r = o.length,
      a = new Float32Array(r);
    for (let c = 0; c < 1560; c++)
      a[Math.floor(s() * r)] += (s() * 2 - 1) * (0.2 + Math.pow(s(), 4) * 3);
    let l = mixBuffers(r, [o, 0.8]);
    for (let [c, u, h] of [
      [1820, 14, 1],
      [2740, 16, 0.8],
      [4150, 18, 0.6],
      [6200, 14, 0.35],
      [940, 8, 0.7],
    ]) {
      let f = Float32Array.from(a);
      applySweepingBiquad(f, "bp", () => c, u, i, 2);
      for (let p = 0; p < r; p++) l[p] += f[p] * h * 5;
      yield;
    }
    for (let c = 0; c < 4; c++) {
      let u = randomBetween(s, 900, 1600);
      mixBufferLooping(l, sineSweep(i, 0.014, u, u * 1.8), s() * 6, 0.25, i);
    }
    return l;
  };
  return [
    yield* n(createSeededRandom(Math.floor(e() * 1e9))),
    yield* n(createSeededRandom(Math.floor(e() * 1e9))),
  ];
}

// 风声循环
function synthWind(i, e) {
  let s = generateNoise(i, 8.5, e),
    o = Float32Array.from(s);
  applySweepingBiquad(
    s,
    "bp",
    (r) => {
      let a = r * 8.5;
      return (
        380 +
        190 * Math.sin((TAU * a) / 8) +
        90 * Math.sin((TAU * a) / 2.667 + 1)
      );
    },
    1.3,
    i,
  ),
    applySweepingBiquad(
      o,
      "bp",
      (r) => {
        let a = r * 8.5;
        return 1350 + 260 * Math.sin((TAU * a) / 4 + 2);
      },
      9,
      i,
    );
  for (let r = 0; r < s.length; r++) {
    let a = r / i;
    s[r] =
      s[r] * (0.7 + 0.3 * Math.sin((TAU * a) / 8 + 0.5)) +
      o[r] * 0.22 * Math.pow(0.5 + 0.5 * Math.sin((TAU * a) / 4 + 1), 2);
  }
  return crossfadeLoop(s, i * 8, !0);
}

// 海浪循环
function* synthSea(i, e) {
  let s = generateNoise(i, 8.5, e),
    o = generateNoise(i, 8 + 0.5, e),
    r = generateNoise(i, 8 + 0.5, e);
  yield,
    applyBiquad(s, "lp", 1100, 0.6, i),
    applyBiquad(s, "hp", 70, 0.7, i),
    applyBiquad(o, "hp", 2400, 0.7, i),
    applyBiquad(r, "bp", 520, 1.2, i),
    yield;
  for (let a = 0; a < s.length; a++) {
    let l = a / i,
      c = (l % 4) / 4,
      u = Math.pow(0.5 - 0.5 * Math.cos(TAU * c), 1.5),
      h = Math.exp(-Math.pow((c - 0.5) / 0.05, 2)),
      f = Math.exp(-Math.pow((c - 0.68) / 0.16, 2)),
      p = 0.5 - 0.5 * Math.cos((TAU * ((l + 1.3) % 2.667)) / 2.667);
    s[a] =
      s[a] * (0.3 + 0.7 * u + 0.25 * p) + r[a] * h * 1.8 + o[a] * f * 0.35;
  }
  return crossfadeLoop(s, i * 8, !0);
}
// ===== 音乐：和声网格、音符音色与分层循环 =====
var MUSIC_GRID = { bpm: 100, bar: 2.4, loopBars: 8, sr: 32e3 },
  MUSIC_PROGRESSION = [
    { root: 38, tones: [0, 3, 7, 12, 10], base: 50 },
    { root: 34, tones: [0, 4, 7, 12, 11], base: 46 },
    { root: 31, tones: [0, 3, 7, 12, 10], base: 43 },
    { root: 33, tones: [0, 5, 7, 12, 10], base: 45 },
  ];

// 三振荡器弦乐音符（低音持续）
function renderStringNote(i, e, t, n, s, o, r) {
  let a = Math.round((t + s) * i),
    l = new Float32Array(a),
    c = [r(), r(), r()],
    u = [1 - o, 1, 1 + o * 1.1];
  for (let h = 0; h < a; h++) {
    let f = h / i,
      p = 0;
    for (let v = 0; v < 3; v++)
      (c[v] += (e * u[v]) / i),
        (c[v] -= Math.floor(c[v])),
        (p += 2 * c[v] - 1);
    let d =
      f < t
        ? 1 - Math.exp(-f / n)
        : (1 - Math.exp(-t / n)) * Math.exp(-(f - t) / (s * 0.3));
    l[h] = p * d * 0.33;
  }
  return fadeEdges(l, i, 0, 0.1), l;
}

// 音乐：低音持续层
function* synthMusicDrone(i, e) {
  let t = MUSIC_GRID.bar * 8,
    n = Math.round(t * i),
    s = function* (o) {
      let r = new Float32Array(n);
      for (let a = 0; a < 4; a++) {
        let l = MUSIC_PROGRESSION[a],
          c = a * 4.8;
        for (let [u, h] of [
          [0, 1],
          [7, 0.6],
          [12, 0.5],
          [l.tones[1] + 12, 0.28],
        ])
          mixBufferLooping(
            r,
            renderStringNote(i, midiToHz(l.root + u), 4.6, 1.3, 1.8, 0.0035, o),
            c - 0.5,
            h * 0.3,
            i,
          ),
            yield;
      }
      return (
        mixBufferLooping(r, renderStringNote(i, midiToHz(26), t - 0.2, 2.5, 0.2, 0.002, o), 0.1, 0.16, i),
        yield,
        applySweepingBiquad(
          r,
          "lp",
          (a) =>
            560 + 300 * Math.sin(TAU * a * 2) + 120 * Math.sin(TAU * a * 5 + 1),
          0.9,
          i,
          2,
        ),
        yield,
        r
      );
    };
  return [
    yield* s(createSeededRandom(Math.floor(e() * 1e9))),
    yield* s(createSeededRandom(Math.floor(e() * 1e9))),
  ];
}

// 弹拨音符
function renderPluck(i, e, t) {
  let n = Math.round(0.42 * i),
    s = new Float32Array(n),
    o = 0,
    r = 0,
    a = 0,
    l = 0,
    c = 0;
  for (let u = 0; u < n; u++) {
    let h = u / i;
    (o += e / i),
      (o -= Math.floor(o)),
      (r += (e * 0.5) / i),
      (r -= Math.floor(r));
    let f = 2 * o - 1 + 0.4 * (r < 0.5 ? 1 : -1);
    (u & 15) === 0 &&
      (c = 1 - Math.exp((-TAU * (300 + 2600 * t * Math.exp(-h / 0.06))) / i)),
      (a += (f - a) * c),
      (l += (a - l) * c),
      (s[u] = l * Math.exp(-h / 0.1) * Math.min(1, u / 40));
  }
  return fadeEdges(s, i, 0, 0.03);
}

// 音乐：琶音层
function* synthMusicOst(i) {
  let e = MUSIC_GRID.bar * 8,
    t = new Float32Array(Math.round(e * i)),
    n = [0, 0, 2, 0, 1, 0, 2, 0, 3, 0, 2, 0, 1, 0, 4, 2],
    s = [
      1, 0.45, 0.7, 0.45, 0.85, 0.45, 0.7, 0.5, 1, 0.45, 0.7, 0.45, 0.85, 0.5,
      0.8, 0.6,
    ];
  for (let o = 0; o < 128; o++) {
    let r = MUSIC_PROGRESSION[(o >> 5) & 3],
      a = o & 15,
      l = renderPluck(i, midiToHz(r.base + r.tones[n[a]]), s[a]);
    mixBufferLooping(t, l, o * 0.15, 0.5 * (0.5 + 0.5 * s[a]), i),
      mixBufferLooping(t, l, o * 0.15 + 0.45, 0.14, i),
      (o & 7) === 7 && (yield);
  }
  return t;
}

// 音乐：打击层
function* synthMusicPerc(i, e) {
  let t = MUSIC_GRID.bar * 4,
    n = new Float32Array(Math.round(t * i)),
    s = () =>
      mixBuffers(
        Math.round(0.9 * i),
        [pitchSweepTone(i, 0.9, 74, 34, 0.07, 0.24, 0.002), 1],
        [filteredNoiseBurst(i, e, 0.4, 0.07, { lp: 240 }), 1.2],
        [filteredNoiseBurst(i, e, 0.05, 0.008, { bp: 1400, q: 0.8 }), 0.25],
      ),
    o = (a) =>
      mixBuffers(
        Math.round(0.5 * i),
        [pitchSweepTone(i, 0.5, a, a * 0.55, 0.05, 0.12, 0.002), 1],
        [filteredNoiseBurst(i, e, 0.1, 0.02, { lp: 600 }), 0.5],
      ),
    r = (a) => filteredNoiseBurst(i, e, 0.06, 0.008 + a * 0.01, { hp: 6500 });
  for (let a = 0; a < 4; a++) {
    let l = a * 2.4;
    mixBufferLooping(n, s(), l, 1, i),
      mixBufferLooping(n, o(104), l + 1.5, 0.55, i),
      a % 2 === 1 && mixBufferLooping(n, s(), l + 2.1, 0.6, i);
    for (let c = 0; c < 16; c++)
      mixBufferLooping(
        n,
        r(c % 4 === 2 ? 1 : 0),
        l + c * 0.15,
        c % 4 === 2 ? 0.34 : c % 2 ? 0.11 : 0.2,
        i,
      );
    yield;
  }
  for (let [a, l] of [
    [12, 120],
    [13, 104],
    [14, 88],
    [15, 74],
  ])
    mixBufferLooping(n, o(l), 7.2 + a * 0.15, 0.6, i);
  return softClip(n, 1.3);
}

// 铜管/铺底音符
function renderBrassNote(i, e, t) {
  let n = Math.round(t * i),
    s = new Float32Array(n),
    o = 0,
    r = 0,
    a = 0,
    l = 0,
    c = null;
  for (let u = 0; u < n; u++) {
    let h = u / i,
      f = u / n,
      p = Math.pow(Math.sin(Math.PI * Math.pow(f, 0.8)), 1.5),
      d = 1 + 0.004 * Math.sin(TAU * 5.1 * h) * Math.min(1, h);
    (o += (e * d) / i),
      (o -= Math.floor(o)),
      (r += (e * 1.004 * d) / i),
      (r -= Math.floor(r)),
      (u & 31) === 0 && (c = biquadCoefficients("lp", 240 + 1700 * p * p, 1.1, i));
    let v = 2 * o - 1 + (2 * r - 1),
      g = c[0] * v + a;
    (a = c[1] * v - c[3] * g + l),
      (l = c[2] * v - c[4] * g),
      (s[u] = g * p * 0.5);
  }
  return s;
}

// 音乐：铜管层
function* synthMusicBrass(i) {
  let e = MUSIC_GRID.bar * 8,
    t = new Float32Array(Math.round(e * i));
  for (let n = 0; n < 4; n++) {
    let s = MUSIC_PROGRESSION[n];
    for (let [o, r] of [
      [12, 1],
      [19, 0.7],
      [24 + s.tones[1], 0.5],
      [24, 0.4],
    ])
      mixBufferLooping(t, renderBrassNote(i, midiToHz(s.root + o), 4.7), n * 4.8 + 0.05, r * 0.3, i), yield;
  }
  return t;
}

// 钟琴音符（多个泛音叠加）
function renderBell(i, e, t) {
  let n = modalPing(i, t, [
      [e, t * 0.3, 1],
      [e * 2.003, t * 0.18, 0.4],
      [e * 3.01, t * 0.1, 0.18],
      [e * 4.2, t * 0.05, 0.1],
      [e * 0.5, t * 0.3, 0.25],
    ]),
    s = Math.round(0.006 * i);
  for (let o = 0; o < s; o++) n[o] *= o / s;
  return fadeEdges(n, i, 0, 0.2);
}

// 音乐：主题动机层
function* synthMusicMotif(i) {
  let e = MUSIC_GRID.bar * 8,
    t = new Float32Array(Math.round(e * i)),
    n = (s, o, r) => {
      let a = renderBell(i, midiToHz(o), 3.2);
      mixBufferLooping(t, a, s, r, i),
        mixBufferLooping(t, a, s + 0.45, r * 0.28, i),
        mixBufferLooping(t, a, s + 0.9, r * 0.1, i);
    };
  for (let [s, o] of [
    [0, 62],
    [0.9, 69],
    [1.8, 70],
    [3, 65],
  ])
    n(s, o, 0.5), yield;
  for (let [s, o] of [
    [0, 62],
    [0.9, 69],
    [1.8, 72],
    [3, 67],
  ])
    n(9.6 + s, o, 0.42), yield;
  return t;
}

// ===== 提示音与混响脉冲 =====

// 完成单个目标
function* synthObjective(i) {
  let e = allocSamples(i, 2.8);
  [57, 62, 65, 69].forEach((t, n) => {
    mixBufferAt(e, renderBell(i, midiToHz(t), 1.6), n * 0.15, 0.45 + n * 0.08, i),
      mixBufferAt(e, renderPluck(i, midiToHz(t), 1), n * 0.15, 0.3, i);
  }),
    mixBufferAt(e, pitchSweepTone(i, 0.8, 73.4, 36.7, 0.1, 0.25, 0.002), 0.45, 0.7, i);
  for (let t of [50, 57, 62, 64])
    mixBufferAt(e, renderBrassNote(i, midiToHz(t), 2.2), 0.45, 0.14, i), yield;
  return e;
}

// 全部目标完成
function* synthObjectiveAll(i) {
  let e = allocSamples(i, 4.2);
  mixBufferAt(e, pitchSweepTone(i, 1, 73.4, 36.7, 0.1, 0.3, 0.002), 0, 0.9, i),
    mixBufferAt(e, pitchSweepTone(i, 1, 73.4, 36.7, 0.1, 0.3, 0.002), 0.6, 0.7, i);
  for (let t of [50, 57, 62, 65]) mixBufferAt(e, renderBrassNote(i, midiToHz(t), 1.5), 0, 0.16, i), yield;
  for (let t of [48, 55, 60, 64])
    mixBufferAt(e, renderBrassNote(i, midiToHz(t), 1.4), 0.6, 0.16, i), yield;
  for (let t of [50, 57, 62, 65, 69])
    mixBufferAt(e, renderBrassNote(i, midiToHz(t), 2.9), 1.2, 0.17, i), yield;
  return (
    [62, 65, 69, 74].forEach((t, n) =>
      mixBufferAt(e, renderBell(i, midiToHz(t), 2), 1.2 + n * 0.15, 0.4, i),
    ),
    e
  );
}

// 撤离成功
function* synthComplete(i) {
  let e = allocSamples(i, 6);
  mixBufferAt(e, pitchSweepTone(i, 1.4, 73.4, 36.7, 0.15, 0.4, 0.003), 0, 0.9, i);
  for (let [t, n] of [
    [38, 1],
    [50, 0.8],
    [57, 0.7],
    [62, 0.7],
    [66, 0.7],
    [69, 0.5],
  ])
    mixBufferAt(e, renderBrassNote(i, midiToHz(t), 5.6), 0, 0.14 * n, i), yield;
  return (
    [62, 66, 69, 74, 78, 81].forEach((t, n) => {
      mixBufferAt(e, renderBell(i, midiToHz(t), 3), 0.3 + n * 0.3, 0.42, i),
        mixBufferAt(e, renderBell(i, midiToHz(t), 3), 0.75 + n * 0.3, 0.12, i);
    }),
    e
  );
}

// 玩家死亡
function synthDeath(i, e) {
  let t = allocSamples(i, 3.8),
    n = t.length,
    s = [0, 0, 0];
  for (let o = 0; o < n; o++) {
    let r = o / i,
      a = Math.pow(2, -1.1 * Math.pow(r / 3.8, 0.7)),
      l = 0;
    [73.42, 110, 146.83].forEach((c, u) => {
      (s[u] += (c * a * (1 + u * 0.002)) / i),
        (s[u] -= Math.floor(s[u])),
        (l += (2 * s[u] - 1) * (u === 1 ? 0.6 : 1));
    }),
      (t[o] =
        l * 0.3 * Math.pow(1 - r / 3.8, 1.3) * (1 - Math.exp(-r / 0.01)));
  }
  return (
    applySweepingBiquad(t, "lp", frequencyRamp(1500, 110, 0.7), 1.2, i),
    mixBufferAt(t, pitchSweepTone(i, 1.2, 82, 30, 0.12, 0.35, 0.002), 0, 1, i),
    mixBufferAt(t, filteredNoiseBurst(i, e, 0.3, 0.06, { lp: 300 }), 0, 0.8, i),
    t
  );
}

// 室外混响脉冲响应
function synthIrOutdoor(i, e) {
  let t = (n, s) => {
    let o = allocSamples(i, 1.4),
      r = [
        [0.062, 0.55],
        [0.089, 0.42],
        [0.118, 0.36],
        [0.151, 0.26],
        [0.178, 0.2],
        [0.243, 0.1],
      ];
    for (let [l, c] of r)
      mixBufferAt(
        o,
        filteredNoiseBurst(i, n, 0.01, 0.0018, { hp: 700, lp: 5500 }),
        l * (s ? 1.07 : 0.96) + randomBetween(n, 0, 0.006),
        c * randomBetween(n, 0.6, 1.15),
        i,
      );
    let a = generateNoise(i, 1.3, n);
    return (
      applyBiquad(a, "hp", 300, 0.7, i),
      applySweepingBiquad(a, "lp", frequencyRamp(6e3, 900, 0.6), 0.7, i),
      mixBufferAt(o, applyGainCurve(a, i, decayCurve(0.27, 0.04)), 0.04, 0.045, i),
      o
    );
  };
  return [t(createSeededRandom(Math.floor(e() * 1e9)), 0), t(createSeededRandom(Math.floor(e() * 1e9)), 1)];
}

// 室内混响脉冲响应
function synthIrShed(i, e) {
  let t = (n, s) => {
    let o = allocSamples(i, 2.2),
      r = generateNoise(i, 2.18, n);
    applySweepingBiquad(r, "lp", frequencyRamp(5200, 650, 0.5), 0.7, i),
      mixBufferAt(o, applyGainCurve(r, i, decayCurve(0.33, 0.006)), 0.012, 0.3, i);
    let a = generateNoise(i, 2.1, n);
    applyBiquad(a, "lp", 260, 0.7, i), mixBufferAt(o, applyGainCurve(a, i, decayCurve(0.4, 0.01)), 0.012, 0.5, i);
    for (let [l, c] of [
      [0.018, 0.7],
      [0.031, 0.55],
      [0.047, 0.45],
      [0.093, 0.3],
      [0.139, 0.2],
    ])
      mixBufferAt(
        o,
        filteredNoiseBurst(i, n, 0.008, 0.0015, { lp: 4500 }),
        l * (s ? 1.09 : 0.95),
        c,
        i,
      );
    return o;
  };
  return [t(createSeededRandom(Math.floor(e() * 1e9)), 0), t(createSeededRandom(Math.floor(e() * 1e9)), 1)];
}
// ===== 音效库：名称 → 生成器 / 采样率 / 总线 / 优先级 =====
var SAMPLE_RATE_44K = 44100,
  SAMPLE_RATE_32K = 32e3,
  SAMPLE_RATE_22K = 22050,
  SOUND_LIBRARY = {
    rifle_shot: {
      gen: synthRifleShot,
      n: 4,
      sr: SAMPLE_RATE_44K,
      peak: 0.97,
      bus: "near",
      max: 5,
      pri: 9,
      boot: 1,
    },
    rifle_tail_out: {
      gen: synthRifleTailOutdoor,
      n: 2,
      sr: SAMPLE_RATE_32K,
      peak: 0.5,
      bus: "dry",
      max: 3,
      pri: 8,
      boot: 1,
    },
    rifle_tail_in: {
      gen: synthRifleTailIndoor,
      n: 2,
      sr: SAMPLE_RATE_32K,
      peak: 0.62,
      bus: "dry",
      max: 3,
      pri: 8,
      boot: 1,
    },
    rifle_dry: {
      gen: synthRifleDry,
      n: 1,
      sr: SAMPLE_RATE_44K,
      peak: 0.5,
      bus: "near",
      max: 2,
      pri: 6,
      boot: 1,
    },
    reload_magout: {
      gen: synthReloadMagOut,
      n: 1,
      sr: SAMPLE_RATE_44K,
      peak: 0.6,
      bus: "near",
      max: 2,
      pri: 6,
    },
    reload_magin: {
      gen: synthReloadMagIn,
      n: 1,
      sr: SAMPLE_RATE_44K,
      peak: 0.65,
      bus: "near",
      max: 2,
      pri: 6,
    },
    reload_bolt: {
      gen: synthReloadBolt,
      n: 1,
      sr: SAMPLE_RATE_44K,
      peak: 0.8,
      bus: "near",
      max: 2,
      pri: 6,
    },
    shell_bounce: {
      gen: synthShellBounce,
      n: 3,
      sr: SAMPLE_RATE_44K,
      peak: 0.3,
      bus: "world",
      max: 4,
      pri: 1,
      ref: 2,
      roll: 1,
    },
    step_concrete: {
      gen: synthStepConcrete,
      n: 4,
      sr: SAMPLE_RATE_32K,
      peak: 0.45,
      bus: "near",
      max: 3,
      pri: 3,
      boot: 1,
    },
    step_water: {
      gen: synthStepWater,
      n: 3,
      sr: SAMPLE_RATE_32K,
      peak: 0.5,
      bus: "near",
      max: 3,
      pri: 3,
      boot: 1,
    },
    step_metal: {
      gen: synthStepMetal,
      n: 3,
      sr: SAMPLE_RATE_32K,
      peak: 0.5,
      bus: "near",
      max: 3,
      pri: 3,
      boot: 1,
    },
    land: { gen: synthLand, n: 1, sr: SAMPLE_RATE_32K, peak: 0.7, bus: "near", max: 2, pri: 4 },
    jump: { gen: synthJump, n: 1, sr: SAMPLE_RATE_32K, peak: 0.35, bus: "near", max: 2, pri: 3 },
    hurt: { gen: synthHurt, n: 1, sr: SAMPLE_RATE_32K, peak: 0.85, bus: "dry", max: 2, pri: 8 },
    ear_ring: {
      gen: synthEarRing,
      n: 1,
      sr: SAMPLE_RATE_22K,
      peak: 0.2,
      bus: "dry",
      max: 1,
      pri: 5,
    },
    impact_metal: {
      gen: synthImpactMetal,
      n: 3,
      sr: SAMPLE_RATE_44K,
      peak: 0.7,
      bus: "world",
      max: 4,
      pri: 4,
      ref: 4,
      roll: 0.7,
    },
    impact_concrete: {
      gen: synthImpactConcrete,
      n: 3,
      sr: SAMPLE_RATE_44K,
      peak: 0.7,
      bus: "world",
      max: 4,
      pri: 4,
      ref: 4,
      roll: 0.7,
    },
    impact_wood: {
      gen: synthImpactWood,
      n: 2,
      sr: SAMPLE_RATE_44K,
      peak: 0.7,
      bus: "world",
      max: 3,
      pri: 4,
      ref: 4,
      roll: 0.7,
    },
    impact_water: {
      gen: synthImpactWater,
      n: 2,
      sr: SAMPLE_RATE_32K,
      peak: 0.6,
      bus: "world",
      max: 3,
      pri: 4,
      ref: 4,
      roll: 0.7,
    },
    impact_enemy: {
      gen: synthImpactEnemy,
      n: 3,
      sr: SAMPLE_RATE_44K,
      peak: 0.75,
      bus: "world",
      max: 4,
      pri: 5,
      ref: 5,
      roll: 0.6,
    },
    impact_glass: {
      gen: synthImpactGlass,
      n: 1,
      sr: SAMPLE_RATE_44K,
      peak: 0.6,
      bus: "world",
      max: 2,
      pri: 4,
      ref: 4,
      roll: 0.7,
    },
    whiz: {
      gen: synthWhiz,
      n: 3,
      sr: SAMPLE_RATE_44K,
      peak: 0.5,
      bus: "world",
      max: 3,
      pri: 5,
      ref: 2.5,
      roll: 0.6,
    },
    ricochet: {
      gen: synthRicochet,
      n: 3,
      sr: SAMPLE_RATE_44K,
      peak: 0.4,
      bus: "world",
      max: 2,
      pri: 3,
      ref: 5,
      roll: 0.6,
    },
    gull_fire: {
      gen: synthGullFire,
      n: 2,
      sr: SAMPLE_RATE_44K,
      peak: 0.85,
      bus: "world",
      max: 5,
      pri: 7,
      ref: 7,
      roll: 0.55,
    },
    hound_fire: {
      gen: synthHoundFire,
      n: 2,
      sr: SAMPLE_RATE_44K,
      peak: 0.95,
      bus: "world",
      max: 5,
      pri: 7,
      ref: 8,
      roll: 0.5,
    },
    hound_step: {
      gen: synthHoundStep,
      n: 3,
      sr: SAMPLE_RATE_32K,
      peak: 0.7,
      bus: "world",
      max: 4,
      pri: 3,
      ref: 5,
      roll: 0.8,
    },
    gull_die: {
      gen: synthGullDie,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.85,
      bus: "world",
      max: 3,
      pri: 7,
      ref: 7,
      roll: 0.5,
    },
    hound_die: {
      gen: synthHoundDie,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.9,
      bus: "world",
      max: 3,
      pri: 7,
      ref: 7,
      roll: 0.5,
    },
    telegraph: {
      gen: synthTelegraph,
      n: 2,
      sr: SAMPLE_RATE_32K,
      peak: 0.42,
      bus: "world",
      max: 4,
      pri: 6,
      ref: 6,
      roll: 0.6,
    },
    alert: {
      gen: synthAlert,
      n: 2,
      sr: SAMPLE_RATE_32K,
      peak: 0.5,
      bus: "world",
      max: 3,
      pri: 6,
      ref: 8,
      roll: 0.5,
    },
    explosion: {
      gen: synthExplosion,
      n: 2,
      sr: SAMPLE_RATE_44K,
      peak: 0.97,
      bus: "world",
      max: 3,
      pri: 10,
      ref: 12,
      roll: 0.5,
    },
    relay_cut: {
      gen: synthRelayCut,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.75,
      bus: "world",
      max: 2,
      pri: 8,
      ref: 6,
      roll: 0.5,
    },
    thunder: { gen: synthThunder, n: 2, sr: SAMPLE_RATE_22K, peak: 0.8, bus: "dry", max: 2, pri: 6 },
    foghorn: {
      gen: synthFoghorn,
      n: 1,
      sr: SAMPLE_RATE_22K,
      peak: 0.5,
      bus: "world",
      max: 1,
      pri: 2,
    },
    gull_cry: {
      gen: synthGullCry,
      n: 2,
      sr: SAMPLE_RATE_22K,
      peak: 0.4,
      bus: "world",
      max: 2,
      pri: 1,
    },
    halyard: {
      gen: synthHalyard,
      n: 2,
      sr: SAMPLE_RATE_32K,
      peak: 0.3,
      bus: "world",
      max: 2,
      pri: 1,
    },
    container_bang: {
      gen: synthContainerBang,
      n: 1,
      sr: SAMPLE_RATE_22K,
      peak: 0.6,
      bus: "world",
      max: 1,
      pri: 2,
    },
    ui_click: {
      gen: synthUiClick,
      n: 1,
      sr: SAMPLE_RATE_44K,
      peak: 0.3,
      bus: "dry",
      max: 2,
      pri: 9,
    },
    ui_hover: {
      gen: synthUiHover,
      n: 1,
      sr: SAMPLE_RATE_44K,
      peak: 0.12,
      bus: "dry",
      max: 2,
      pri: 9,
    },
    objective: {
      gen: synthObjective,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.6,
      bus: "music",
      max: 1,
      pri: 9,
    },
    objective_all: {
      gen: synthObjectiveAll,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.65,
      bus: "music",
      max: 1,
      pri: 9,
    },
    complete: {
      gen: synthComplete,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.7,
      bus: "music",
      max: 1,
      pri: 9,
    },
    death: {
      gen: synthDeath,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.75,
      bus: "music",
      max: 1,
      pri: 9,
    },
    gull_rotor: {
      gen: synthGullRotor,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.6,
      loop: 1,
      ref: 5,
      roll: 0.9,
    },
    hound_servo: {
      gen: synthHoundServo,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.42,
      loop: 1,
      ref: 4,
      roll: 1,
    },
    relay_hum: {
      gen: synthRelayHum,
      n: 1,
      sr: SAMPLE_RATE_32K,
      peak: 0.4,
      loop: 1,
      ref: 2.5,
      roll: 1.4,
    },
    rain: { gen: synthRain, n: 1, sr: SAMPLE_RATE_32K, peak: 0.5, loop: 1 },
    rain_interior: { gen: synthRainInterior, n: 1, sr: SAMPLE_RATE_32K, peak: 0.7, loop: 1 },
    wind: { gen: synthWind, n: 1, sr: SAMPLE_RATE_22K, peak: 0.5, loop: 1 },
    sea: { gen: synthSea, n: 1, sr: SAMPLE_RATE_22K, peak: 0.5, loop: 1, ref: 10, roll: 0.6 },
    music_drone: { gen: synthMusicDrone, n: 1, sr: MUSIC_GRID.sr, peak: 0.5, loop: 1, music: 1 },
    music_ost: { gen: synthMusicOst, n: 1, sr: MUSIC_GRID.sr, peak: 0.45, loop: 1, music: 1 },
    music_perc: { gen: synthMusicPerc, n: 1, sr: MUSIC_GRID.sr, peak: 0.7, loop: 1, music: 1 },
    music_brass: { gen: synthMusicBrass, n: 1, sr: MUSIC_GRID.sr, peak: 0.45, loop: 1, music: 1 },
    music_motif: { gen: synthMusicMotif, n: 1, sr: MUSIC_GRID.sr, peak: 0.45, loop: 1, music: 1 },
    ir_outdoor: { gen: synthIrOutdoor, n: 1, sr: SAMPLE_RATE_44K, peak: 0.9, ir: 1 },
    ir_shed: { gen: synthIrShed, n: 1, sr: SAMPLE_RATE_44K, peak: 0.9, ir: 1 },
  },
  // ===== 播放引擎：事件别名、启动顺序与静音兜底 =====
  EVENT_SOUND_ALIASES = {
    step: "step_concrete",
    impact: "impact_concrete",
    hurt: "hurt",
    objective_done: "objective",
    extraction: "complete",
    enemy_alert: "alert",
  },
  isIterator = (i) => i && typeof i.next == "function";

// 去爆音、按峰值归一化，输出 {sr,ch,loop}
function finalizeSoundBuffer(i, e, t) {
  let n = Array.isArray(e) ? e : [e];
  if (!i.loop)
    for (let r of n) fadeEdges(r, t, i.ir ? 0 : 3e-4, i.ir ? 0.05 : 0.012);
  let s = 0;
  for (let r of n) s = Math.max(s, peakLevel(r));
  let o = s > 0 ? i.peak / s : 1;
  for (let r of n) scaleBuffer(r, o);
  return { sr: t, ch: n, loop: !!i.loop };
}

// 同步渲染一个音效变体（解析生成器迭代）
function renderSoundVariant(i, e = 0, t) {
  let n = SOUND_LIBRARY[i];
  if (!n) return null;
  let s = t || n.sr,
    o = e % n.n,
    r = n.gen(s, createSeededRandom(hashString(i) + o * 7919), o);
  if (isIterator(r)) {
    let a;
    do a = r.next();
    while (!a.done);
    r = a.value;
  }
  return finalizeSoundBuffer(n, r, s);
}

// 创建分步渲染器，避免一次性合成卡住主线程
function createIncrementalRender(i, e = 0, t) {
  let n = SOUND_LIBRARY[i];
  if (!n) return null;
  let s = t || n.sr,
    o = e % n.n,
    r = n.gen(s, createSeededRandom(hashString(i) + o * 7919), o),
    a = null;
  return {
    step() {
      if (a) return a;
      if (isIterator(r)) {
        let l = r.next();
        if (!l.done) return null;
        r = l.value;
      }
      return (a = finalizeSoundBuffer(n, r, s));
    },
  };
}
var clamp = (i, e, t) => Math.min(t, Math.max(e, i)),
  smoothstep = (i, e, t) => {
    let n = clamp((t - i) / (e - i), 0, 1);
    return n * n * (3 - 2 * n);
  },
  IMPACT_SOUND_BY_SURFACE = {
    metal: "impact_metal",
    concrete: "impact_concrete",
    wood: "impact_wood",
    water: "impact_water",
    glass: "impact_glass",
    dirt: "impact_concrete",
    rubber: "impact_wood",
  },
  STEP_SOUND_BY_SURFACE = {
    metal: "step_metal",
    water: "step_water",
    concrete: "step_concrete",
    wood: "step_concrete",
    dirt: "step_concrete",
    glass: "step_concrete",
    rubber: "step_concrete",
  },
  BOOT_CRITICAL_SOUNDS = new Set([
    "thunder",
    "foghorn",
    "objective",
    "objective_all",
    "complete",
    "death",
    "explosion",
    "rifle_tail_in",
    "gull_die",
    "hound_die",
    "relay_cut",
    "container_bang",
    "ear_ring",
  ]),
  BOOT_SYNTHESIS_ORDER = [
    "ir_outdoor",
    "ir_shed",
    "rain",
    "whiz",
    "reload_magout",
    "reload_magin",
    "reload_bolt",
    "shell_bounce",
    "impact_concrete",
    "impact_metal",
    "land",
    "jump",
    "hurt",
    "music_drone",
    "wind",
    "music_motif",
    "impact_enemy",
    "impact_wood",
    "impact_water",
    "impact_glass",
    "ricochet",
    "gull_rotor",
    "hound_servo",
    "alert",
    "telegraph",
    "gull_fire",
    "hound_fire",
    "hound_step",
    "ui_click",
    "ui_hover",
    "sea",
    "rain_interior",
    "relay_hum",
    "gull_die",
    "hound_die",
    "explosion",
    "ear_ring",
    "death",
    "music_ost",
    "music_perc",
    "music_brass",
    "relay_cut",
    "objective",
    "thunder",
    "objective_all",
    "complete",
    "gull_cry",
    "halyard",
    "foghorn",
    "container_bang",
  ],
  MUSIC_LAYER_NAMES = [
    "music_drone",
    "music_ost",
    "music_perc",
    "music_brass",
    "music_motif",
  ];

// WebAudio 不可用时的静音实现
function createSilentAudio() {
  let i = () => {},
    e = { setPos: i, setGain: i, setPitch: i, stop: i };
  return {
    silent: !0,
    update: i,
    resume: i,
    play: i,
    loop: () => e,
    setIntensity: i,
    setInterior: i,
    setVolume: i,
    setPaused: i,
    debug: () => ({ state: "none" }),
    names: Object.keys(SOUND_LIBRARY),
    ready: Promise.resolve(),
  };
}

// 创建 WebAudio 上下文并装配音频引擎；失败则返回静音实现
async function createAudio(i) {
  let e =
      typeof window < "u" &&
      (window.AudioContext || window.webkitAudioContext),
    t = null;
  try {
    e && (t = new e({ latencyHint: "interactive" }));
  } catch {
    t = null;
  }
  return t
    ? createAudioEngine(i, t, null)
    : (console.warn("[audio] WebAudio unavailable \u2014 running silent"),
      createSilentAudio());
}

// 音频引擎主体：合成队列、总线、声部池、循环声、音乐层与 3D 听者
function createAudioEngine(game, ctx, offline) {
  let events = game.events,
    random = Math.random,
    isReady = () => (offline ? !0 : ctx.state === "running"),
    bufferCache = offline ? offline.bufs : new Map(),
    bufferWaiters = new Map(),
    synthMs = 0,
    bufferCount = 0,
    bootMs = 0;

  // 把合成数据上传为 AudioBuffer，并唤醒等待该音效的回调
  function registerBuffer(te, he) {
    let pe = ctx.createBuffer(he.ch.length, he.ch[0].length, he.sr);
    for (let ye = 0; ye < he.ch.length; ye++)
      pe.getChannelData(ye).set(he.ch[ye]);
    bufferCache.set(te, pe), bufferCount++;
    let ge = bufferWaiters.get(te);
    if (ge) {
      bufferWaiters.delete(te);
      for (let ye of ge)
        try {
          ye(pe);
        } catch (Le) {
          console.error("[audio] ready callback", Le);
        }
    }
    return pe;
  }
  let sampleRateFor = (te) => (SOUND_LIBRARY[te].ir ? ctx.sampleRate : void 0);

  // 立即同步渲染并上传一个变体
  function renderNow(te, he) {
    let pe = performance.now(),
      ge = registerBuffer(te + "#" + he, renderSoundVariant(te, he, sampleRateFor(te)));
    return (synthMs += performance.now() - pe), ge;
  }
  let synthQueue = [],
    seenSounds = new Set();
  for (let te of [...BOOT_SYNTHESIS_ORDER, ...Object.keys(SOUND_LIBRARY)]) {
    let he = SOUND_LIBRARY[te];
    if (!(!he || seenSounds.has(te))) {
      seenSounds.add(te);
      for (let pe = 0; pe < he.n; pe++)
        bufferCache.has(te + "#" + pe) ||
          (he.boot
            ? renderNow(te, pe)
            : synthQueue.push({ name: te, v: pe, k: te + "#" + pe, steps: null }));
    }
  }
  bootMs = synthMs;
  let resolveReady,
    readyPromise = new Promise((te) => {
      resolveReady = te;
    });

  // 按每帧 6ms 预算分片合成剩余音效
  function pumpQueue() {
    let te = performance.now();
    for (; synthQueue.length; ) {
      let he = synthQueue[0];
      if (bufferCache.has(he.k)) {
        synthQueue.shift();
        continue;
      }
      he.steps || (he.steps = createIncrementalRender(he.name, he.v, sampleRateFor(he.name)));
      let pe = null;
      try {
        pe = he.steps.step();
      } catch (ge) {
        console.error("[audio] synthesis failed for " + he.k, ge), synthQueue.shift();
        continue;
      }
      if (
        (pe && (registerBuffer(he.k, pe), synthQueue.shift(), maybeStartMusic(he.name)),
        performance.now() - te > 6)
      )
        break;
    }
    (synthMs += performance.now() - te), synthQueue.length ? setTimeout(pumpQueue, 12) : resolveReady();
  }
  offline ? resolveReady() : setTimeout(pumpQueue, 120);

  // 音效就绪后执行回调；未就绪则排队
  function whenBufferReady(te, he, pe) {
    let ge = te + "#" + he,
      ye = bufferCache.get(ge);
    if (ye) {
      pe(ye);
      return;
    }
    bufferWaiters.has(ge) || bufferWaiters.set(ge, []), bufferWaiters.get(ge).push(pe);
    let Le = synthQueue.findIndex((ke) => ke.k === ge);
    if (Le > 0 && !synthQueue[Le].steps) {
      let [ke] = synthQueue.splice(Le, 1);
      synthQueue.splice(synthQueue[0] && synthQueue[0].steps ? 1 : 0, 0, ke);
    }
  }
  let gainNode = (te) => {
      let he = ctx.createGain();
      return (he.gain.value = te), he;
    },
    masterInput = gainNode(1),
    compressor = ctx.createDynamicsCompressor(),
    makeupGain = gainNode(0.45),
    softLimiter = ctx.createWaveShaper(),
    volumeGain = gainNode(0.9);
  (compressor.threshold.value = -10),
    (compressor.knee.value = 6),
    (compressor.ratio.value = 6),
    (compressor.attack.value = 0.002),
    (compressor.release.value = 0.14);
  {
    let he = new Float32Array(2049);
    for (let pe = 0; pe < 2049; pe++) {
      let ge = ((pe / 2048) * 2 - 1) * 2,
        ye = Math.abs(ge);
      he[pe] =
        Math.sign(ge) *
        (ye <= 0.6 ? ye : 0.6 + 0.4 * Math.tanh((ye - 0.6) / 0.4));
    }
    softLimiter.curve = he;
    try {
      softLimiter.oversample = "2x";
    } catch {}
  }
  // 母带链：压缩 → 补偿增益 → 软限幅 → 总音量
  masterInput.connect(compressor),
    compressor.connect(makeupGain),
    makeupGain.connect(softLimiter),
    softLimiter.connect(volumeGain),
    volumeGain.connect(ctx.destination);
  let muffleFilter = ctx.createBiquadFilter();
  (muffleFilter.type = "lowpass"), (muffleFilter.frequency.value = 2e4), (muffleFilter.Q.value = 0.5);
  let masterGate = gainNode(1);
  muffleFilter.connect(masterGate), masterGate.connect(masterInput);
  // 五条总线：世界 / 近场 / 环境 / 干声 / 音乐
  let busGains = {
    world: gainNode(1),
    near: gainNode(0.95),
    amb: gainNode(0.55),
    dry: gainNode(1),
    music: gainNode(0.62),
  };
  busGains.world.connect(muffleFilter), busGains.near.connect(muffleFilter), busGains.amb.connect(muffleFilter), busGains.dry.connect(masterInput);
  let musicBusGain = gainNode(1);
  busGains.music.connect(musicBusGain), musicBusGain.connect(masterInput);
  // 混响：室外 / 室内两条卷积支路，按室内混合交叉淡化
  let reverbSend = gainNode(1),
    outdoorSend = gainNode(1),
    interiorSend = gainNode(0),
    outdoorConvolver = ctx.createConvolver(),
    interiorConvolver = ctx.createConvolver(),
    outdoorReturn = gainNode(0.75),
    interiorReturn = gainNode(0.95),
    worldReverbSend = gainNode(0.9),
    nearReverbSend = gainNode(0.32),
    musicReverbSend = gainNode(0.2);
  busGains.world.connect(worldReverbSend),
    worldReverbSend.connect(reverbSend),
    busGains.near.connect(nearReverbSend),
    nearReverbSend.connect(reverbSend),
    reverbSend.connect(outdoorSend),
    reverbSend.connect(interiorSend),
    outdoorSend.connect(outdoorConvolver),
    interiorSend.connect(interiorConvolver),
    outdoorConvolver.connect(outdoorReturn),
    interiorConvolver.connect(interiorReturn),
    outdoorReturn.connect(muffleFilter),
    interiorReturn.connect(muffleFilter),
    busGains.music.connect(musicReverbSend),
    musicReverbSend.connect(interiorConvolver),
    whenBufferReady("ir_outdoor", 0, (te) => {
      outdoorConvolver.buffer = te;
    }),
    whenBufferReady("ir_shed", 0, (te) => {
      interiorConvolver.buffer = te;
    });

  // 兼容新旧 WebAudio 的 PannerNode 定位
  function setPannerPosition(te, he, pe, ge) {
    te.positionX
      ? ((te.positionX.value = he),
        (te.positionY.value = pe),
        (te.positionZ.value = ge))
      : te.setPosition(he, pe, ge);
  }

  // 创建 3D Panner（HRTF 或等功率）
  function createPanner(te) {
    let he = ctx.createPanner();
    return (
      (he.panningModel = te ? "HRTF" : "equalpower"),
      (he.distanceModel = "inverse"),
      (he.refDistance = 3),
      (he.rolloffFactor = 0.6),
      (he.maxDistance = 400),
      (he.coneInnerAngle = 360),
      he
    );
  }
  // 一次性音效声部池：总线 → 可选 Panner → 增益
  let voicePools = { world: [], near: [], dry: [], music: [] };

  // 从总线声部池取一个声部
  function createVoice(te, he) {
    let pe = {
      g: gainNode(0),
      pan: null,
      src: null,
      end: 0,
      start: 0,
      name: "",
      pri: 0,
    };
    he
      ? ((pe.pan = createPanner(!1)), pe.g.connect(pe.pan), pe.pan.connect(busGains[te]))
      : pe.g.connect(busGains[te]),
      voicePools[te].push(pe);
  }
  for (let te = 0; te < 22; te++) createVoice("world", !0);
  for (let te = 0; te < 12; te++) createVoice("near", !1);
  for (let te = 0; te < 8; te++) createVoice("dry", !1);
  for (let te = 0; te < 3; te++) createVoice("music", !1);
  let listenerPos = { x: 0, y: 1.7, z: 0 },
    userHasResumed = !1,
    paused = !1,
    masterVolume = 0.9,
    gameState = (game.game && game.game.state) || "title",
    interiorTarget = 0,
    interiorMix = 0,
    intensityTarget = 0,
    dangerLevel = 0,
    intensity = 0,
    muffle = 0,
    musicFade = 1,
    masterGateLevel = 1,
    ambienceLevel = 0,
    lastShotAt = -9,
    lastTailAt = -9,
    shotVariant = 0,
    lastImpactAt = -9,
    lastRicochetAt = -9,
    lastEarRingAt = -9,
    lastShellAt = -9,
    lastAlertAt = -9,
    lastStingAt = -9,
    lastWhizAt = -9,
    variantCursor = {},
    api = { autoIntensity: !0 };

  // 为新声音挑选可抢占的声部
  function pickVoice(te, he, pe, ge) {
    let ye = null,
      Le = 0,
      ke = null,
      Ue = null;
    for (let ct = 0; ct < te.length; ct++) {
      let De = te[ct];
      if (De.end <= ge) {
        ye || (ye = De);
        continue;
      }
      De.name === he && (Le++, (!ke || De.start < ke.start) && (ke = De)),
        (!Ue ||
          De.pri < Ue.pri ||
          (De.pri === Ue.pri && De.start < Ue.start)) &&
          (Ue = De);
    }
    return Le >= (pe.max || 4)
      ? ke
      : ye || (Ue && Ue.pri <= pe.pri ? Ue : null);
  }

  // 播放一次性音效（表面映射、变体、优先级、3D 定位）
  function playSound(te, he) {
    (he = he || {}),
      (te = EVENT_SOUND_ALIASES[te] || te),
      he.surface &&
        (te === "impact_concrete"
          ? (te = IMPACT_SOUND_BY_SURFACE[he.surface] || te)
          : te === "step_concrete" && (te = STEP_SOUND_BY_SURFACE[he.surface] || te));
    let pe = SOUND_LIBRARY[te];
    if (!pe || pe.loop || pe.ir || !isReady()) return !1;
    let ge = he.variant;
    ge == null
      ? (ge = variantCursor[te] =
          ((variantCursor[te] || 0) + 1 + (pe.n > 2 && random() < 0.3 ? 1 : 0)) % pe.n)
      : (ge %= pe.n);
    let ye = bufferCache.get(te + "#" + ge);
    if (!ye) {
      if (BOOT_CRITICAL_SOUNDS.has(te)) {
        let Ht = ctx.currentTime;
        return (
          whenBufferReady(te, ge, () => {
            ctx.currentTime - Ht < 2.5 &&
              playSound(te, Object.assign({}, he, { variant: ge }));
          }),
          !1
        );
      }
      ye = renderNow(te, ge);
    }
    let Le = ctx.currentTime,
      ke = he.pos,
      Ue = !!ke && pe.bus === "world",
      ct = Ue ? voicePools.world : voicePools[pe.bus === "world" ? "near" : pe.bus],
      De = pickVoice(ct, te, pe, Le);
    if (!De) return !1;
    let it = Le + (he.delay || 0),
      gt = De.g.gain;
    if ((gt.cancelScheduledValues(Le), De.end > Le && De.src)) {
      gt.setTargetAtTime(0, Le, 0.004);
      try {
        De.src.stop(Le + 0.025);
      } catch {}
      it = Math.max(it, Le + 0.025);
    }
    let Ot = he.jitter != null ? he.jitter : 0.035,
      xn = clamp((he.pitch || 1) * (1 + (random() * 2 - 1) * Ot), 0.25, 4);
    if (
      (gt.setValueAtTime(
        (he.gain != null ? he.gain : 1) * (1 - random() * 0.08),
        it,
      ),
      Ue)
    ) {
      let Ht = Array.isArray(ke) ? { x: ke[0], y: ke[1], z: ke[2] } : ke;
      setPannerPosition(De.pan, Ht.x || 0, Ht.y || 0, Ht.z || 0),
        (De.pan.refDistance = he.ref || pe.ref || 3),
        (De.pan.rolloffFactor =
          he.roll != null ? he.roll : pe.roll != null ? pe.roll : 0.6);
    }
    let $t = ctx.createBufferSource();
    return (
      ($t.buffer = ye),
      ($t.playbackRate.value = xn),
      $t.connect(De.g),
      ($t.onended = () => {
        try {
          $t.disconnect();
        } catch {}
      }),
      $t.start(it),
      (De.src = $t),
      (De.start = it),
      (De.end = it + ye.duration / xn + 0.03),
      (De.name = te),
      (De.pri = pe.pri || 0),
      !0
    );
  }
  let activeLoops = new Set(),
    autoEnemyLoops = new Set(),
    noop = () => {},
    autoLoopsOff = !1,
    deadLoop = { setPos: noop, setGain: noop, setPitch: noop, stop: noop, alive: !1 };

  // 启动循环声，返回 setPos/setGain/setPitch/stop 句柄
  function startLoop(te, he) {
    he = he || {};
    let pe = SOUND_LIBRARY[te];
    if (!pe || !pe.loop) return deadLoop;
    let ge = (te === "gull_rotor" || te === "hound_servo") && !he._auto;
    ge && !he.hrtf && (he = Object.assign({ hrtf: !0 }, he));
    let ye = {
        name: te,
        alive: !0,
        vT: 1,
        vC: 1,
        px: 0,
        py: 0,
        pz: 0,
        gT: he.gain != null ? he.gain : 1,
        gC: 0,
        pT: he.pitch || 1,
        pC: he.pitch || 1,
        src: null,
        g: gainNode(0),
        pan: null,
        rate: he.fade || 6,
      },
      Le = ye.g;
    if (
      (he.pos &&
        ((ye.pan = createPanner(!!he.hrtf)),
        (ye.pan.refDistance = he.ref || pe.ref || 3),
        (ye.pan.rolloffFactor =
          he.roll != null ? he.roll : pe.roll != null ? pe.roll : 0.6),
        ye.g.connect(ye.pan),
        (Le = ye.pan)),
      Le.connect(
        busGains[he.bus || (he.pos ? "world" : pe.music ? "music" : "amb")],
      ),
      (ye.setPos = (ke) => {
        ye.pan &&
          ke &&
          (Array.isArray(ke)
            ? ((ye.px = ke[0]), (ye.py = ke[1]), (ye.pz = ke[2]))
            : ((ye.px = ke.x || 0), (ye.py = ke.y || 0), (ye.pz = ke.z || 0)),
          Number.isFinite(ye.px + ye.py + ye.pz) &&
            setPannerPosition(ye.pan, ye.px, ye.py, ye.pz));
      }),
      (ye.setGain = (ke) => {
        ye.gT = Math.max(0, +ke || 0);
      }),
      (ye.setPitch = (ke) => {
        ye.pT = clamp(+ke || 1, 0.25, 4);
      }),
      (ye.stop = (ke) => {
        if (!ye.alive) return;
        (ye.alive = !1), activeLoops.delete(ye), autoEnemyLoops.delete(ye);
        let Ue = ke ?? 0.18,
          ct = ctx.currentTime;
        try {
          ye.g.gain.setValueAtTime(ye.gC, ct),
            ye.g.gain.linearRampToValueAtTime(0, ct + Ue),
            ye.src && ye.src.stop(ct + Ue + 0.03);
        } catch {}
        setTimeout(
          () => {
            try {
              ye.src && ye.src.disconnect(),
                ye.g.disconnect(),
                ye.pan && ye.pan.disconnect();
            } catch {}
          },
          (Ue + 0.3) * 1e3,
        );
      }),
      he.pos && ye.setPos(he.pos),
      whenBufferReady(te, 0, (ke) => {
        if (!ye.alive) return;
        let Ue = ctx.createBufferSource();
        (Ue.buffer = ke),
          (Ue.loop = !0),
          (Ue.playbackRate.value = ye.pC),
          Ue.connect(ye.g),
          Ue.start(0, he.offset != null ? he.offset : random() * ke.duration),
          (ye.src = Ue);
      }),
      activeLoops.add(ye),
      ge && (autoEnemyLoops.add(ye), !autoLoopsOff))
    ) {
      autoLoopsOff = !0;
      for (let ke of [...trackedEnemies.keys()]) untrackEnemy(ke);
    }
    return ye;
  }
  let musicLayers = { on: !1, layers: {} };

  // 启动五层音乐循环
  function startMusicLayers() {
    if (musicLayers.on || !isReady()) return;
    for (let he of MUSIC_LAYER_NAMES) if (!bufferCache.has(he + "#0")) return;
    let te = ctx.currentTime + 0.08;
    for (let he of MUSIC_LAYER_NAMES) {
      let pe = gainNode(0),
        ge = ctx.createBufferSource();
      (ge.buffer = bufferCache.get(he + "#0")),
        (ge.loop = !0),
        ge.connect(pe),
        pe.connect(busGains.music),
        ge.start(te),
        (musicLayers.layers[he] = { g: pe, s: ge, c: 0 });
    }
    (musicLayers.on = !0), (musicLayers.t0 = te);
  }

  // 按游戏状态与强度计算各音乐层目标音量
  function musicTargets(te) {
    return gameState === "title"
      ? [0.85, 0, 0, 0, 0.9]
      : gameState === "intro"
        ? [0.8, 0, 0, 0, 0.6]
        : gameState === "dead"
          ? [0.75, 0, 0, 0, 0]
          : gameState === "complete"
            ? [0.6, 0, 0, 0, 0.7]
            : [
                0.6 + 0.3 * te,
                smoothstep(0.05, 0.5, te) * 0.85,
                smoothstep(0.4, 0.8, te) * 0.95,
                smoothstep(0.62, 1, te) * 0.8,
                0,
              ];
  }

  // 音乐缓冲就绪后自动启动音乐层
  function maybeStartMusic(te) {
    SOUND_LIBRARY[te].music && startMusicLayers();
  }
  let ambienceLoops = {
      rain: startLoop("rain", { gain: 0, fade: 2 }),
      rainIn: startLoop("rain_interior", { gain: 0, fade: 2 }),
      wind: startLoop("wind", { gain: 0, fade: 2 }),
      sea: startLoop("sea", { gain: 0, pos: [33, -1, 0], fade: 2, bus: "amb" }),
    },
    windGust = 0.4,
    windGustTarget = 0.4,
    windTimer = 2,
    ambientTimers = {
      fog: 14 + random() * 14,
      gull: 5 + random() * 8,
      hal: 4 + random() * 6,
      bang: 20 + random() * 25,
    };

  // 调度雾笛、海鸥、缆绳、集装箱等环境点缀
  function updateAmbient(te, he) {
    let pe = 1 - 0.7 * interiorMix;
    if ((ambientTimers.fog -= te) <= 0) {
      ambientTimers.fog = 40 + random() * 30;
      let ge = listenerPos.z + (random() * 2 - 1) * 250;
      playSound("foghorn", {
        pos: [listenerPos.x + 320, 8, ge],
        ref: 400,
        gain: 0.34 * he * pe,
        pitch: random() < 0.3 ? 0.89 : 1,
        jitter: 0.01,
      });
    }
    if ((ambientTimers.gull -= te) <= 0) {
      ambientTimers.gull = 9 + random() * 16;
      let ge = random() * 6.283,
        ye = 35 + random() * 50;
      playSound("gull_cry", {
        pos: [
          listenerPos.x + Math.cos(ge) * ye,
          14 + random() * 18,
          listenerPos.z + Math.sin(ge) * ye,
        ],
        ref: ye,
        roll: 1,
        gain: (0.16 + random() * 0.16) * he * pe,
        jitter: 0.1,
      });
    }
    if (
      ((ambientTimers.hal -= te) <= 0 &&
        ((ambientTimers.hal = 6 + random() * 11),
        playSound("halyard", {
          pos: [29 + random() * 8, 3 + random() * 6, -8 + random() * 32],
          ref: 16,
          roll: 0.5,
          gain: (0.3 + random() * 0.3) * he * pe,
          jitter: 0.08,
        })),
      (ambientTimers.bang -= te) <= 0)
    ) {
      ambientTimers.bang = 28 + random() * 34;
      let ge = 1.6 + random() * 3.2;
      playSound("container_bang", {
        pos: [listenerPos.x + Math.cos(ge) * 150, 4, listenerPos.z + Math.sin(ge) * 150],
        ref: 150,
        gain: (0.2 + random() * 0.16) * he * pe,
        jitter: 0.12,
      });
    }
  }
  let trackedEnemies = new Map(),
    enemyTimer = 0;

  // 把敌人加入 3D 循环声跟踪表
  function trackEnemy(te) {
    !te ||
      autoLoopsOff ||
      trackedEnemies.has(te) ||
      te.alive === !1 ||
      trackedEnemies.set(te, {
        handle: null,
        type: te.type === "hound" ? "hound" : "gull",
        lx: te.pos ? te.pos.x : 0,
        ly: te.pos ? te.pos.y : 0,
        lz: te.pos ? te.pos.z : 0,
        sp: 0,
        dist: 1e9,
        tune: 0.96 + random() * 0.1,
      });
  }

  // 停止并移除敌人的循环声
  function untrackEnemy(te) {
    let he = trackedEnemies.get(te);
    he && (he.handle && he.handle.stop(0.12), trackedEnemies.delete(te));
  }
  let sortScratch = [];

  // 按距离维护最近敌人的旋翼/伺服循环声
  function updateEnemyLoops(te) {
    if (((enemyTimer -= te), enemyTimer <= 0 && autoLoopsOff)) {
      (enemyTimer = 0.25), (sortScratch.length = 0);
      for (let he of autoEnemyLoops)
        (he.dist = Math.hypot(he.px - listenerPos.x, he.py - listenerPos.y, he.pz - listenerPos.z)),
          sortScratch.push(he);
      sortScratch.sort((he, pe) => he.dist - pe.dist);
      for (let he = 0; he < sortScratch.length; he++)
        sortScratch[he].vT = he < 6 && sortScratch[he].dist < 90 ? 1 : 0;
    }
    if (enemyTimer <= 0) {
      enemyTimer = 0.25;
      let he = game.enemies && game.enemies.list;
      if (Array.isArray(he))
        for (let pe = 0; pe < he.length; pe++) {
          let ge = he[pe];
          ge && ge.alive !== !1 && !trackedEnemies.has(ge) && trackEnemy(ge);
        }
      sortScratch.length = 0;
      for (let [pe, ge] of trackedEnemies) {
        if (pe.alive === !1 || (Array.isArray(he) && he.indexOf(pe) < 0)) {
          untrackEnemy(pe);
          continue;
        }
        let ye = pe.pos;
        ye &&
          ((ge.dist = Math.hypot(ye.x - listenerPos.x, ye.y - listenerPos.y, ye.z - listenerPos.z)),
          sortScratch.push(ge));
      }
      sortScratch.sort((pe, ge) => pe.dist - ge.dist);
      for (let pe = 0; pe < sortScratch.length; pe++) {
        let ge = sortScratch[pe],
          ye = pe < 6 && ge.dist < 90;
        ye && !ge.handle
          ? (ge.handle = startLoop(ge.type === "gull" ? "gull_rotor" : "hound_servo", {
              pos: [ge.lx, ge.ly, ge.lz],
              gain: 0,
              hrtf: !0,
              fade: 5,
              _auto: !0,
            }))
          : !ye && ge.handle && (ge.handle.stop(0.25), (ge.handle = null));
      }
    }
    for (let [he, pe] of trackedEnemies) {
      let ge = he.pos;
      if (ge) {
        if (te > 0) {
          let ye = Math.hypot(ge.x - pe.lx, ge.y - pe.ly, ge.z - pe.lz) / te;
          pe.sp += (Math.min(ye, 30) - pe.sp) * Math.min(1, te * 5);
        }
        if (((pe.lx = ge.x), (pe.ly = ge.y), (pe.lz = ge.z), !!pe.handle))
          if ((pe.handle.setPos(ge), pe.type === "gull"))
            pe.handle.setGain(1),
              pe.handle.setPitch(pe.tune * (0.94 + 0.3 * clamp(pe.sp / 10, 0, 1)));
          else {
            let ye = clamp(pe.sp / 3, 0, 1);
            pe.handle.setGain(0.3 + 0.5 * ye),
              pe.handle.setPitch(pe.tune * (0.88 + 0.3 * ye));
          }
      }
    }
  }
  let relayHums = [];

  // 为每个中继器启动嗡鸣循环
  function startRelayHums() {
    for (let he of relayHums) he.handle.stop(0.2);
    relayHums = [];
    let te = game.level && game.level.objectives;
    Array.isArray(te) &&
      te.forEach((he, pe) => {
        he &&
          he.pos &&
          relayHums.push({
            id: he.id,
            index: pe,
            pos: { x: he.pos.x, y: (he.pos.y || 0) + 1.2, z: he.pos.z },
            handle: startLoop("relay_hum", {
              pos: [he.pos.x, (he.pos.y || 0) + 1.2, he.pos.z],
              gain: 0.9,
            }),
          });
      });
  }

  // 中继器被切断时停掉对应嗡鸣并播放切断声
  function cutRelayHum(te) {
    te = te || {};
    let he = relayHums.findIndex((pe) => te.id != null && pe.id === te.id);
    if (
      (he < 0 &&
        te.index != null &&
        (he = relayHums.findIndex((pe) => pe.index === te.index)),
      he >= 0)
    ) {
      let pe = relayHums[he];
      pe.handle.stop(0.08),
        relayHums.splice(he, 1),
        playSound("relay_cut", { pos: pe.pos, gain: 1 });
    } else playSound("relay_cut", { gain: 0.8 });
  }
  let asVec3 = (te) => (te && typeof te.x == "number" ? te : null);

  // 按室内外混合播放枪声尾音
  function playRifleTail(te) {
    let he = interiorMix;
    he < 0.95 && playSound("rifle_tail_out", { gain: te * (1 - he), jitter: 0.03 }),
      he > 0.05 && playSound("rifle_tail_in", { gain: te * he, jitter: 0.03 }),
      (lastTailAt = ctx.currentTime);
  }
  // 游戏事件 → 音效 / 音乐强度 / 循环声
  let onEvent = (te, he) => {
    events &&
      events.on &&
      events.on(te, (pe) => {
        try {
          he(pe || {});
        } catch (ge) {
          console.error("[audio] " + te, ge);
        }
      });
  };
  onEvent("weapon:fire", () => {
    (shotVariant = (shotVariant + 1) & 3),
      playSound("rifle_shot", { variant: shotVariant, gain: 1, jitter: 0.012 });
    let te = ctx.currentTime;
    (lastShotAt = te),
      te - lastTailAt > 0.28 && playRifleTail(1),
      (musicFade = Math.min(musicFade, 0.55)),
      dangerLevel > 0.3 && (dangerLevel = Math.min(1, dangerLevel + 0.015));
  }),
    onEvent("weapon:dry", () => playSound("rifle_dry", { gain: 0.9 })),
    onEvent("weapon:reload", (te) => {
      te.phase === "magout"
        ? playSound("reload_magout")
        : te.phase === "magin"
          ? playSound("reload_magin")
          : te.phase === "bolt"
            ? playSound("reload_bolt")
            : te.phase === "start" && playSound("jump", { gain: 0.5, pitch: 1.3 });
    }),
    onEvent("weapon:melee", () => playSound("jump", { gain: 0.9, pitch: 1.2 })),
    onEvent("shell:bounce", (te) => {
      let he = ctx.currentTime;
      he - lastShellAt < 0.04 ||
        ((lastShellAt = he),
        te.surface === "water"
          ? playSound("impact_water", { pos: asVec3(te.pos), gain: 0.25, pitch: 1.7 })
          : playSound("shell_bounce", {
              pos: asVec3(te.pos),
              gain: te.surface === "metal" ? 1 : 0.8,
              pitch: te.surface === "metal" ? 1.12 : 1,
            }));
    }),
    onEvent("impact", (te) => {
      let he = ctx.currentTime;
      if (he - lastImpactAt < 0.022) return;
      lastImpactAt = he;
      let pe = asVec3(te.point),
        ge = te.surface;
      if (te.enemy) {
        playSound("impact_enemy", {
          pos: pe,
          gain: te.part === "weak" ? 1 : 0.85,
          pitch: te.part === "weak" ? 1.25 : 1,
        });
        return;
      }
      if (
        te.from === "enemy" &&
        pe &&
        te.dir &&
        typeof te.dir.x == "number" &&
        he - lastWhizAt > 0.09
      ) {
        let ye = te.dir,
          Le = ye.x * ye.x + ye.y * ye.y + ye.z * ye.z || 1,
          ke =
            ((listenerPos.x - pe.x) * ye.x +
              (listenerPos.y - pe.y) * ye.y +
              (listenerPos.z - pe.z) * ye.z) /
            Le;
        if (ke < -1.5) {
          let Ue = pe.x + ye.x * ke,
            ct = pe.y + ye.y * ke,
            De = pe.z + ye.z * ke,
            it = Math.hypot(listenerPos.x - Ue, listenerPos.y - ct, listenerPos.z - De);
          it < 3.2 &&
            ((lastWhizAt = he),
            playSound("whiz", {
              pos: { x: Ue, y: ct, z: De },
              gain: clamp(1.15 - it / 3.5, 0.3, 1),
              jitter: 0.1,
            }));
        }
      }
      playSound(IMPACT_SOUND_BY_SURFACE[ge] || "impact_concrete", {
        pos: pe,
        gain: te.from === "enemy" ? 0.8 : 0.9,
        pitch: ge === "dirt" ? 0.8 : ge === "rubber" ? 0.7 : 1,
        jitter: 0.07,
      }),
        he - lastRicochetAt > 0.22 &&
          ((ge === "metal" && random() < 0.24) ||
            (ge === "concrete" && random() < 0.07)) &&
          ((lastRicochetAt = he),
          playSound("ricochet", {
            pos: pe,
            gain: 0.75,
            delay: 0.012,
            jitter: 0.12,
          }));
    }),
    onEvent("player:step", (te) => {
      let he = te.surface || "concrete";
      try {
        te.pos &&
          game.ground &&
          game.ground.isPuddle &&
          game.ground.isPuddle(te.pos.x, te.pos.z) &&
          (he = "water");
      } catch {}
      playSound(STEP_SOUND_BY_SURFACE[he] || "step_concrete", {
        gain: (te.sprint ? 0.8 : 0.55) * (he === "water" ? 0.9 : 1),
        pitch: (te.sprint ? 1.05 : 1) * (he === "wood" ? 1.18 : 1),
        jitter: 0.06,
      });
    }),
    onEvent("player:jump", () => playSound("jump", { gain: 0.8 })),
    onEvent("player:land", (te) => {
      let he = clamp(0.35 + (Math.abs(te.speed) || 4) / 10, 0.35, 1);
      playSound("land", { gain: he }),
        (te.surface === "water" || te.surface === "metal") &&
          playSound(STEP_SOUND_BY_SURFACE[te.surface], { gain: he * 0.8, pitch: 0.9 });
    }),
    onEvent("player:hit", (te) => {
      let he = +te.amount || 10,
        pe = ctx.currentTime;
      playSound("hurt", { gain: clamp(0.5 + he / 40, 0.5, 1), jitter: 0.08 }),
        he >= 6 &&
          pe - lastEarRingAt > 1.8 &&
          ((lastEarRingAt = pe),
          playSound("ear_ring", { gain: clamp(he / 28, 0.3, 1), jitter: 0.02 })),
        (muffle = Math.max(muffle, clamp(he / 40, 0.2, 0.7))),
        (dangerLevel = Math.min(1, Math.max(dangerLevel, 0.6) + 0.15));
    }),
    onEvent("player:heal", () =>
      playSound("reload_magin", { gain: 0.4, pitch: 1.5 })),
    onEvent("player:dead", () => {
      ctx.currentTime - lastStingAt > 1 &&
        ((lastStingAt = ctx.currentTime), playSound("death", { gain: 1, jitter: 0 })),
        (muffle = 1);
    }),
    onEvent("enemy:spawn", (te) => trackEnemy(te.enemy)),
    onEvent("enemy:alert", (te) => {
      dangerLevel = Math.max(dangerLevel, 0.6);
      let he = ctx.currentTime;
      if (he - lastAlertAt < 0.12) return;
      lastAlertAt = he;
      let pe = te.enemy || {};
      playSound("alert", {
        pos: asVec3(pe.pos) || asVec3(te.pos),
        variant: pe.type === "hound" ? 1 : 0,
        gain: 0.9,
      });
    }),
    onEvent("enemy:fire", (te) => {
      let he = te.type || (te.enemy && te.enemy.type),
        pe = asVec3(te.pos) || (te.enemy && asVec3(te.enemy.pos));
      playSound(he === "hound" ? "hound_fire" : "gull_fire", {
        pos: pe,
        gain: 1,
        jitter: 0.04,
      }),
        (dangerLevel = Math.min(1, Math.max(dangerLevel, 0.6) + 0.05));
    }),
    onEvent("enemy:step", (te) => {
      if (te.crash) {
        playSound("hound_step", { pos: asVec3(te.pos), gain: 1, pitch: 0.72 }),
          playSound("impact_metal", { pos: asVec3(te.pos), gain: 0.8, pitch: 0.55 });
        return;
      }
      te.type !== "gull" &&
        playSound("hound_step", {
          pos: asVec3(te.pos),
          gain: clamp(0.6 + (+te.speed || 2) * 0.1, 0.6, 1),
          jitter: 0.06,
        });
    }),
    onEvent("enemy:telegraph", (te) => {
      let he = te.enemy || {},
        pe = te.type || he.type,
        ge = clamp(+te.time || 0.55, 0.15, 1.5);
      playSound("telegraph", {
        pos: asVec3(te.pos) || asVec3(he.pos),
        variant: pe === "hound" ? 1 : 0,
        pitch: 0.55 / ge,
        gain: te.melee ? 0.7 : 1,
        jitter: 0,
      }),
        (dangerLevel = Math.max(dangerLevel, 0.6));
    }),
    onEvent("enemy:melee", (te) => {
      let he = asVec3(te.pos) || (te.enemy && asVec3(te.enemy.pos));
      playSound("hound_step", { pos: he, gain: 1, pitch: 0.8 }),
        playSound("impact_metal", { pos: he, gain: 0.9, pitch: 0.7 }),
        playSound("hurt", { gain: 0.6 });
    }),
    onEvent("enemy:killed", (te) => {
      let he = te.enemy,
        pe = te.type || (he && he.type),
        ge = asVec3(te.pos) || (he && asVec3(he.pos));
      he && untrackEnemy(he),
        playSound(pe === "hound" ? "hound_die" : "gull_die", {
          pos: ge,
          gain: 1,
          jitter: 0.05,
        });
    }),
    onEvent("explosion", (te) => {
      let he = clamp(+te.size || 1, 0.3, 3),
        pe = asVec3(te.pos);
      if (
        (playSound("explosion", {
          pos: pe,
          gain: clamp(0.6 + 0.25 * he, 0.5, 1.1),
          pitch: clamp(1.12 - 0.1 * he, 0.8, 1.15),
          jitter: 0.04,
        }),
        pe)
      ) {
        let ge = Math.hypot(pe.x - listenerPos.x, pe.y - listenerPos.y, pe.z - listenerPos.z);
        muffle = Math.max(muffle, clamp(1 - (ge - 5) / 10, 0, 0.8));
      }
      (dangerLevel = Math.max(dangerLevel, 0.6)), (musicFade = Math.min(musicFade, 0.4));
    }),
    onEvent("objective:done", (te) => {
      cutRelayHum(te), playSound("objective", { delay: 0.35, gain: 1, jitter: 0 });
    }),
    onEvent("objective:all", () =>
      playSound("objective_all", { delay: 2.2, gain: 1, jitter: 0 }),
    );
  let playExtractionSting = () => {
    let te = ctx.currentTime;
    te - lastStingAt > 6 && ((lastStingAt = te), playSound("complete", { gain: 1, jitter: 0 }));
  };
  onEvent("extraction:reached", playExtractionSting),
    onEvent("thunder", (te) => {
      let he = clamp(te.intensity != null ? +te.intensity : 0.6, 0.1, 1);
      playSound("thunder", {
        variant: he > 0.6 ? 1 : 0,
        delay: 0.5 + (1 - he) * 2 + random() * 0.6,
        gain: 0.35 + 0.65 * he,
        jitter: 0.1,
      });
    }),
    onEvent("ui:click", () => playSound("ui_click")),
    onEvent("ui:hover", () => playSound("ui_hover")),
    onEvent("game:state", (te) => {
      let he = gameState;
      if (((gameState = te.state || gameState), gameState === "playing" && he !== "paused")) {
        (dangerLevel = 0), (muffle = 0), startRelayHums();
        for (let pe of [...trackedEnemies.keys()]) pe.alive === !1 && untrackEnemy(pe);
      }
      gameState === "complete" && playExtractionSting(),
        gameState === "paused" ? (paused = !0) : he === "paused" && (paused = !1);
    });

  // 恢复 AudioContext（需用户手势）
  function resume() {
    if (((userHasResumed = !0), ctx.state !== "running" && ctx.state !== "closed"))
      try {
        let te = ctx.resume();
        te && te.catch && te.catch(() => {});
      } catch {}
  }
  if (typeof window < "u" && !offline) {
    let te = () => {
      if ((resume(), isReady()))
        for (let he of ["pointerdown", "keydown", "touchend", "mousedown"])
          window.removeEventListener(he, te, !0);
    };
    for (let he of ["pointerdown", "keydown", "touchend", "mousedown"])
      window.addEventListener(he, te, { capture: !0, passive: !0 });
    document.addEventListener("visibilitychange", () => {
      try {
        document.hidden ? ctx.suspend() : userHasResumed && ctx.resume();
      } catch {}
    });
  }

  // 每帧更新：听者、室内外混合、音乐层、环境声与循环声
  function update(te) {
    te = Math.min(Math.max(+te || 0, 0), 0.25);
    let he = game.camera,
      pe = ctx.listener;
    // 听者位置/朝向跟随相机
    if (he && he.matrixWorld) {
      let De = he.matrixWorld.elements;
      (listenerPos.x = De[12]),
        (listenerPos.y = De[13]),
        (listenerPos.z = De[14]),
        Number.isFinite(listenerPos.x + listenerPos.y + listenerPos.z + De[8] + De[4]) &&
          (pe.positionX
            ? ((pe.positionX.value = listenerPos.x),
              (pe.positionY.value = listenerPos.y),
              (pe.positionZ.value = listenerPos.z),
              (pe.forwardX.value = -De[8]),
              (pe.forwardY.value = -De[9]),
              (pe.forwardZ.value = -De[10]),
              (pe.upX.value = De[4]),
              (pe.upY.value = De[5]),
              (pe.upZ.value = De[6]))
            : (pe.setPosition(listenerPos.x, listenerPos.y, listenerPos.z),
              pe.setOrientation(
                -De[8],
                -De[9],
                -De[10],
                De[4],
                De[5],
                De[6],
              )));
    }
    // 室内检测：听者落在任一 interiorBox 内就切到室内混响
    let ge = game.level && game.level.interiorBoxes;
    if (Array.isArray(ge) && ge.length) {
      let De = 0;
      for (let it = 0; it < ge.length; it++) {
        let gt = ge[it];
        if (
          gt &&
          gt.min &&
          gt.max &&
          listenerPos.x > gt.min.x &&
          listenerPos.x < gt.max.x &&
          listenerPos.y > gt.min.y - 0.5 &&
          listenerPos.y < gt.max.y &&
          listenerPos.z > gt.min.z &&
          listenerPos.z < gt.max.z
        ) {
          De = 1;
          break;
        }
      }
      interiorTarget = De;
    }
    let ye = (De) => 1 - Math.exp(-te * De);
    if (
      ((interiorMix += (interiorTarget - interiorMix) * ye(3)),
      (outdoorSend.gain.value = 1 - 0.9 * interiorMix),
      (interiorSend.gain.value = interiorMix),
      !isReady())
    )
      return;
    startMusicLayers();
    let Le = ctx.currentTime;
    lastShotAt > lastTailAt + 0.02 && Le - lastShotAt > 0.1 && playRifleTail(0.9);
    let ke = gameState === "playing" || gameState === "intro";
    // 环境声与状态混合：雨/风/海随室内外、暂停和死亡淡入淡出
    (ambienceLevel +=
      ((paused ? 0 : gameState === "title" ? 0.6 : gameState === "dead" ? 0.7 : 1) - ambienceLevel) *
      ye(1.2)),
      (masterGateLevel += ((paused ? 0 : 1) - masterGateLevel) * ye(12)),
      (masterGate.gain.value = masterGateLevel),
      (muffle += ((gameState === "dead" ? 0.85 : 0) - muffle) * ye(gameState === "dead" ? 3 : 0.9)),
      (muffleFilter.frequency.value = 2e4 * Math.pow(0.03, clamp(muffle, 0, 1))),
      (volumeGain.gain.value = masterVolume),
      (windTimer -= te) <= 0 && ((windTimer = 3 + random() * 6), (windGustTarget = 0.12 + random() * 0.88)),
      (windGust += (windGustTarget - windGust) * ye(0.5)),
      ambienceLoops.rain.setGain(ambienceLevel * (1 - 0.93 * interiorMix) * 0.95),
      ambienceLoops.rainIn.setGain(ambienceLevel * interiorMix * 0.95),
      ambienceLoops.wind.setGain(ambienceLevel * (0.3 + 0.7 * windGust) * (1 - 0.65 * interiorMix) * 0.75),
      ambienceLoops.wind.setPitch(0.9 + 0.25 * windGust),
      ambienceLoops.sea.setGain(ambienceLevel * (1 - 0.5 * interiorMix) * 1),
      ambienceLoops.sea.setPos([33, -1, clamp(listenerPos.z, -28, 26)]),
      !paused &&
        (ke || gameState === "title" || gameState === "complete") &&
        updateAmbient(te, gameState === "title" ? 0.7 : 1),
      paused || updateEnemyLoops(te),
      (dangerLevel = Math.max(0, dangerLevel - te * (trackedEnemies.size ? 0.045 : 0.14)));
    // 音乐强度：脚本设置与危险度取较大值，再平滑到各音乐层
    let ct =
      ke || paused ? Math.max(intensityTarget, api.autoIntensity ? Math.max(0.15, dangerLevel) : 0) : 0;
    if (
      ((intensity += (ct - intensity) * ye(2)),
      (musicFade += (1 - musicFade) * ye(3.5)),
      (musicBusGain.gain.value = musicFade * (paused ? 0.45 : 1)),
      musicLayers.on)
    ) {
      let De = musicTargets(intensity),
        it = ye(1 / 0.5);
      for (let gt = 0; gt < MUSIC_LAYER_NAMES.length; gt++) {
        let Ot = musicLayers.layers[MUSIC_LAYER_NAMES[gt]];
        (Ot.c += (De[gt] - Ot.c) * it), (Ot.g.gain.value = Ot.c);
      }
    }
    // 循环声平滑跟随目标增益与音高
    for (let De of activeLoops)
      (De.vC += (De.vT - De.vC) * ye(4)),
        (De.gC += (De.gT * De.vC - De.gC) * ye(De.rate)),
        (De.g.gain.value = De.gC),
        De.src &&
          Math.abs(De.pT - De.pC) > 1e-4 &&
          ((De.pC += (De.pT - De.pC) * ye(8)),
          (De.src.playbackRate.value = De.pC));
  }

  // 离线渲染自检：统计峰值、削波、NaN 与 RMS
  async function selfTest(te) {
    (te = te || {}), await readyPromise;
    let he = ctx.sampleRate,
      pe = te.seconds || 10,
      ge = new OfflineAudioContext(2, he * pe, he),
      ye = new Map(),
      Le = {
        on(Tt, Ai) {
          ye.has(Tt) || ye.set(Tt, []), ye.get(Tt).push(Ai);
        },
        emit(Tt, Ai) {
          for (let sn of ye.get(Tt) || []) sn(Ai);
        },
      },
      ke = new Float32Array(16);
    (ke[0] = ke[5] = ke[10] = ke[15] = 1), (ke[13] = 1.7);
    let Ue = [
        { type: "gull", alive: !0, pos: { x: 6, y: 4, z: -9 } },
        { type: "hound", alive: !0, pos: { x: -8, y: 0, z: -14 } },
        { type: "gull", alive: !0, pos: { x: 0, y: 5, z: -30 } },
      ],
      ct = { min: { x: -99, y: -9, z: -99 }, max: { x: 99, y: 99, z: 99 } },
      De = {
        events: Le,
        params: {},
        camera: { matrixWorld: { elements: ke } },
        enemies: { list: [] },
        level: {
          interiorBoxes: te.interior
            ? [ct]
            : [
                {
                  min: { x: 500, y: 0, z: 500 },
                  max: { x: 501, y: 1, z: 501 },
                },
              ],
          objectives: [{ id: "A", pos: { x: 4, y: 0, z: 3 } }],
        },
      },
      it = createAudioEngine(De, ge, { bufs: bufferCache }),
      gt = 0.02,
      Ot = 0,
      xn = (Tt) => {
        let Ai = Tt * gt;
        if (
          (Tt === 0 && Le.emit("game:state", { state: "playing" }),
          Ai < 3 &&
            Tt % 23 === 0 &&
            Le.emit("player:step", { surface: "concrete", sprint: !1 }),
          Tt === 150)
        ) {
          for (let sn of Ue)
            De.enemies.list.push(sn), Le.emit("enemy:spawn", { enemy: sn });
          Le.emit("enemy:alert", { enemy: Ue[0] }), it.setIntensity(1);
        }
        Ai >= 3 &&
          Ai < 6 &&
          (Tt % 4 === 0 &&
            (Ai < 4.2 || Ai > 4.8) &&
            (Le.emit("weapon:fire", {}),
            Le.emit("impact", {
              point: { x: 4, y: 1, z: -12 },
              surface: Tt % 8 ? "metal" : "concrete",
              from: "player",
            }),
            Le.emit("shell:bounce", {
              pos: { x: 0.6, y: 0, z: 0.2 },
              surface: "concrete",
            })),
          Tt % 13 === 0 &&
            Le.emit("enemy:fire", {
              enemy: Ue[0],
              pos: Ue[0].pos,
              type: "gull",
            }),
          Tt % 17 === 0 &&
            Le.emit("enemy:fire", {
              enemy: Ue[1],
              pos: Ue[1].pos,
              type: "hound",
            }),
          Tt % 25 === 0 &&
            Le.emit("enemy:step", { pos: Ue[1].pos, type: "hound" })),
          Tt === 300 &&
            Le.emit("explosion", { pos: { x: 3, y: 0, z: -5 }, size: 1.5 }),
          Tt === 350 && Le.emit("player:hit", { amount: 20 }),
          Tt === 360 &&
            ((Ue[0].alive = !1),
            Le.emit("enemy:killed", {
              enemy: Ue[0],
              pos: Ue[0].pos,
              type: "gull",
            })),
          Tt === 400 &&
            (Le.emit("objective:done", { id: "A", index: 0, total: 3 }),
            it.setIntensity(0.15));
      };
    for (let Tt = 1; Tt * gt < pe - 0.01; Tt++)
      ge.suspend(Tt * gt).then(() => {
        xn(Tt), it.update(gt), Ot++, ge.resume();
      });
    xn(0), it.update(gt);
    let $t = performance.now(),
      Ht = await ge.startRendering(),
      Je = performance.now() - $t,
      Pt = {
        interior: !!te.interior,
        renderMs: Math.round(Je),
        steps: Ot,
        peak: 0,
        over: 0,
        nan: 0,
        rmsDb: [],
        inst: it.debug(),
      },
      Vt = Ht.getChannelData(0),
      ss = Ht.getChannelData(1),
      Hs = Math.round(he / 2);
    for (let Tt = 0; Tt * Hs < Vt.length; Tt++) {
      let Ai = 0;
      for (let sn = Tt * Hs; sn < (Tt + 1) * Hs && sn < Vt.length; sn++) {
        let os = Vt[sn],
          rs = ss[sn];
        (!(Math.abs(os) < 1e9) || !(Math.abs(rs) < 1e9)) && Pt.nan++;
        let Ni = Math.max(Math.abs(os), Math.abs(rs));
        Ni > Pt.peak && (Pt.peak = Ni),
          Ni >= 0.999 && Pt.over++,
          (Ai += os * os + rs * rs);
      }
      Pt.rmsDb.push(+(10 * Math.log10(Ai / (2 * Hs) + 1e-12)).toFixed(1));
    }
    return (Pt.peak = +Pt.peak.toFixed(3)), Pt;
  }
  // 对外 API：游戏主循环每帧调用 update，其余为设置与调试入口
  return (
    Object.assign(api, {
      ctx: ctx,
      resume: resume,
      play: playSound,
      loop: startLoop,
      update: update,
      ready: readyPromise,
      selfTest: selfTest,
      setIntensity(te) {
        intensityTarget = clamp(+te || 0, 0, 1);
      },
      setInterior(te) {
        interiorTarget = clamp(+te || 0, 0, 1);
      },
      setVolume(te) {
        (masterVolume = clamp(+te, 0, 1)),
          Number.isFinite(masterVolume) || (masterVolume = 0.9),
          (volumeGain.gain.value = masterVolume);
      },
      setPaused(te) {
        paused = !!te;
      },
      names: Object.keys(SOUND_LIBRARY).filter((te) => !SOUND_LIBRARY[te].ir),
      get intensity() {
        return intensity;
      },
      get interior() {
        return interiorMix;
      },
      debug() {
        let te = 0,
          he = ctx.currentTime;
        for (let pe in voicePools) for (let ge of voicePools[pe]) ge.end > he && te++;
        return {
          state: ctx.state,
          sampleRate: ctx.sampleRate,
          buffers: bufferCount,
          queued: synthQueue.length,
          genMs: Math.round(synthMs),
          bootMs: Math.round(bootMs),
          voices: te,
          loops: activeLoops.size,
          tracked: trackedEnemies.size,
          music: musicLayers.on,
          intensity: +intensity.toFixed(2),
          interior: +interiorMix.toFixed(2),
          gameState: gameState,
          reverb: [!!outdoorConvolver.buffer, !!interiorConvolver.buffer],
        };
      },
    }),
    api
  );
}

// 启动时只装配一次引擎；静音实现用于 WebAudio 缺失或基准测试。
export { createAudio, createSilentAudio };
