// Saltline localisation. English + Simplified Chinese.
// A language is picked from ?lang=zh|en, then localStorage, then the browser.

const STORE_KEY = "saltline.lang.v1";

const S = {
  en: {
    // ---- boot ----
    boot_raising: "Raising the terminal",
    boot_renderer: "Waking the renderer",
    boot_materials: "Mixing paint, rust and rain",
    boot_containers: "Stacking containers",
    boot_cranes: "Raising the cranes",
    boot_apron: "Flooding the apron",
    boot_tracers: "Loading tracers and smoke",
    boot_rifle: "Checking the rifle",
    boot_harbormaster: "Waking the Harbormaster",
    boot_light: "Waiting for first light",
    boot_ready: "Ready",
    boot_fatal: "Saltline could not start: ",
    boot_city: "Laying out the city",

    // ---- title ----
    title_eyebrow_unit: "Port Authority Breach Unit",
    title_eyebrow_place: "Saltline Terminal · 05:42",
    title_premise:
      "The port’s security net has gone feral. Cut its three uplinks. Reach the boat.",
    title_deploy: "Deploy",
    title_settings: "Settings",
    title_controls: "Controls",
    title_build: "Build",
    title_note:
      "Every surface, machine and sound is generated in your browser. Nothing is downloaded.",
    legend_move: "Move",
    legend_look: "Look",
    legend_fire: "Fire",
    legend_aim: "Aim",
    legend_reload: "Reload",
    legend_cut: "Cut relay",
    legend_heal: "Medkit",
    legend_jump: "Jump",
    legend_sprint: "Sprint",
    legend_crouch: "Crouch",
    legend_pause: "Pause",
    legend_touch: "Touch",
    legend_touch_move: "Left thumb moves",
    legend_touch_look: "Right thumb looks",
    legend_touch_btns: "Fire · Aim · Reload · Jump on screen",
    legend_aria: "Controls at a glance",

    // ---- pause / dead / debrief ----
    paused_k: "Operation on hold",
    paused_h: "Paused",
    paused_resume: "Resume",
    paused_restart: "Restart mission",
    dead_k: "Breacher down",
    dead_h: "Signal lost",
    dead_time: "Time survived",
    dead_relays: "Relays cut",
    dead_retry: "Retry",
    debrief_k: "Berth 4 · Debrief",
    debrief_h: "Saltline is dark",
    debrief_rating: "Rating",
    debrief_time: "Time",
    debrief_acc: "Accuracy",
    debrief_kills: "Machines destroyed",
    debrief_retries: "Retries",
    debrief_redeploy: "Redeploy",
    rating_0: "Messy",
    rating_1: "Loud",
    rating_2: "Steady",
    rating_3: "Clean",
    rating_4: "Sharp",
    rating_5: "Surgical",

    // ---- settings panel ----
    panel_settings: "Settings",
    panel_controls: "Controls",
    panel_close: "Close",
    set_quality: "Graphics quality",
    set_lang: "Language",
    set_sens: "Mouse sensitivity",
    set_invert: "Invert Y",
    set_volume: "Master volume",
    set_fov: "Field of view",
    set_display: "Display",
    set_fullscreen: "Enter fullscreen",
    set_exit_fullscreen: "Exit fullscreen",
    set_fs_unavailable: "Fullscreen is not available here",
    set_on: "On",
    set_off: "Off",
    q_low: "low",
    q_medium: "medium",
    q_high: "high",
    q_ultra: "ultra",
    q_test: "test",
    qnote_auto:
      "Quality was picked for this device ({q}). Lower it if the frame rate struggles.",
    qnote_manual:
      "Quality changes apply at once; shadows and reflections may take a moment to rebuild.",
    panel_aria: "Settings and controls",
    kb_mouse: "Keyboard · Mouse",
    keys_move: "Move",
    keys_look: "Look",
    keys_fire: "Fire",
    keys_aim: "Aim",
    keys_reload: "Reload",
    keys_cut: "Cut relay",
    keys_jump: "Jump",
    keys_sprint: "Sprint",
    keys_crouch: "Crouch",
    keys_melee: "Melee",
    keys_pause: "Pause",
    mouse: "Mouse",
    lmb: "Left button",
    rmb: "Right button",
    touch_move: "Left thumb, anywhere",
    touch_look: "Drag the right side",
    touch_fire: "Hold FIRE, drag to track",
    touch_aim: "AIM toggles",
    touch_reload: "RLD",
    touch_jump: "JUMP",
    touch_cut: "Hold USE at a relay",
    touch_sprint: "Push the stick fully forward",
    mouse_note:
      "If the browser will not capture the mouse, hold a mouse button and drag to look (left also fires, right also aims). Arrow keys or IJKL turn, Enter fires.",
    gamepad: "Gamepad",
    gamepad_note:
      "Sticks move and look · RT fire · LT aim · A jump · B crouch · X reload · Y cut relay · L3 sprint · Start pause.",
    loc_card: "Saltline Terminal · Berth 4 · 05:42",
    loc_card_sub: "Port Authority Breach Unit — one breacher, no backup",

    // ---- hud ----
    hud_objective: "Objective",
    hud_relays: "Relays",
    hud_vitals: "Vitals",
    hud_medkit: "Medkit",
    hud_healed: "Medkit +{n}",
    hud_control: "Control",
    hud_destroyed: "destroyed",
    hud_weak: "Weak point",
    hud_reloading: "Reloading",
    hud_reload: "Reload",
    hud_reload_key: "R — Reload",
    hud_empty: "Empty",
    hud_low: "Low ammo",
    hud_hold: "Hold {key} — {label}",
    obj_boat: "Get to the boat",
    obj_three: "Cut the three uplink relays",
    obj_last: "Cut the last relay",
    obj_remaining: "Cut the remaining {n} relays",
    relay: "Relay {short}",
    relay_cut_prompt: "Cut relay {short}",
    boat: "Boat",
    rescued: "Hauled out of the water",
    relays_live: "Relays still live — the boat will not wait under fire",
    contact: "Contact — {dir}",
    dir_n: "N", dir_ne: "NE", dir_e: "E", dir_se: "SE",
    dir_s: "S", dir_sw: "SW", dir_w: "W", dir_nw: "NW",
    mode_touch: "Touch controls active",
    mode_drag:
      "Mouse capture unavailable — move the mouse to look, rest it at a screen edge to keep turning · click fires · arrows or IJKL also turn",
    mode_locked: "Mouse captured — Esc releases it",
    mode_click: "Click the view to capture the mouse",
    resume_hint: "Resume recaptures the mouse.",

    // ---- touch ----
    tbtn_fire: "FIRE",
    tbtn_aim: "AIM",
    tbtn_reload: "RLD",
    tbtn_jump: "JUMP",
    tbtn_use: "USE",
    tbtn_pause: "II",

    // ---- radio ----
    radio_intro:
      "Breacher, this is Control. The Harbormaster holds the berth. Cut its three uplinks — yard, shed, quay.",
    radio_contact: "It has seen you. Gulls fly, Hounds walk. Put them down.",
    radio_cut1: "One relay dark. It felt that — machines inbound.",
    radio_cut2: "Two dark. It is throwing everything it has left at you.",
    radio_all: "All three dark. The boat is holding at the quay ladder, south end. Run.",
    radio_low: "You are hit hard. Get behind steel and breathe.",
    radio_done: "Breacher is aboard. Saltline is dark. Good work.",
    radio_city:
      "You are past the perimeter. The city goes on — keep moving, they will follow you out here.",

    // ---- city ----
    city_enter: "Perimeter crossed — the city is open",
    city_district: "District {n}",
    city_ammo: "Magazine +{n} rounds",
    city_loot_ammo: "Rounds +{n}",
    city_medkit: "Medkit +1",
    city_clear: "Block clear — push deeper",
    city_threat: "Threat rising — {n} machines per block",
  },

  zh: {
    boot_raising: "正在升起终端机",
    boot_renderer: "正在唤醒渲染器",
    boot_materials: "正在调和油漆、铁锈与雨",
    boot_containers: "正在堆叠集装箱",
    boot_cranes: "正在架起门式起重机",
    boot_apron: "正在淹没码头前沿",
    boot_tracers: "正在装填曳光弹与硝烟",
    boot_rifle: "正在检查步枪",
    boot_harbormaster: "正在唤醒“港务长”",
    boot_light: "正在等待第一缕光",
    boot_ready: "就绪",
    boot_fatal: "《盐线》无法启动：",
    boot_city: "正在铺设城市",

    title_eyebrow_unit: "港务局破袭小队",
    title_eyebrow_place: "盐线码头 · 05:42",
    title_premise: "港口的安全网络已经失控。切断它的三条上行链路，然后上船。",
    title_deploy: "出击",
    title_settings: "设置",
    title_controls: "操作",
    title_build: "版本",
    title_note: "每一块表面、每一台机械、每一段声音都在你的浏览器里现场生成，没有下载任何素材。",
    legend_move: "移动",
    legend_look: "视角",
    legend_fire: "开火",
    legend_aim: "瞄准",
    legend_reload: "换弹",
    legend_cut: "切断中继",
    legend_heal: "使用医疗包",
    legend_jump: "跳跃",
    legend_sprint: "冲刺",
    legend_crouch: "下蹲",
    legend_pause: "暂停",
    legend_touch: "触屏",
    legend_touch_move: "左拇指移动",
    legend_touch_look: "右拇指转向",
    legend_touch_btns: "开火 · 瞄准 · 换弹 · 跳跃都在屏幕上",
    legend_aria: "操作一览",

    paused_k: "行动暂缓",
    paused_h: "已暂停",
    paused_resume: "继续",
    paused_restart: "重新开始任务",
    dead_k: "破袭者倒地",
    dead_h: "信号消失",
    dead_time: "存活时间",
    dead_relays: "已切断中继",
    dead_retry: "重试",
    debrief_k: "四号泊位 · 行动简报",
    debrief_h: "盐线已熄灭",
    debrief_rating: "评级",
    debrief_time: "用时",
    debrief_acc: "命中率",
    debrief_kills: "摧毁机械",
    debrief_retries: "重试次数",
    debrief_redeploy: "再次出击",
    rating_0: "拙劣",
    rating_1: "嘈杂",
    rating_2: "稳健",
    rating_3: "干净",
    rating_4: "精准",
    rating_5: "外科手术级",

    panel_settings: "设置",
    panel_controls: "操作",
    panel_close: "关闭",
    set_quality: "画质",
    set_lang: "语言",
    set_sens: "鼠标灵敏度",
    set_invert: "反转 Y 轴",
    set_volume: "主音量",
    set_fov: "视野范围",
    set_display: "显示",
    set_fullscreen: "进入全屏",
    set_exit_fullscreen: "退出全屏",
    set_fs_unavailable: "此环境不支持全屏",
    set_on: "开",
    set_off: "关",
    q_low: "低",
    q_medium: "中",
    q_high: "高",
    q_ultra: "极高",
    q_test: "测试",
    qnote_auto: "已按当前设备自动选择画质（{q}）。如果帧率吃力，可以再调低。",
    qnote_manual: "画质立即生效；阴影与反射需要一点时间重建。",
    panel_aria: "设置与操作",
    kb_mouse: "键盘 · 鼠标",
    keys_move: "移动",
    keys_look: "视角",
    keys_fire: "开火",
    keys_aim: "瞄准",
    keys_reload: "换弹",
    keys_cut: "切断中继",
    keys_jump: "跳跃",
    keys_sprint: "冲刺",
    keys_crouch: "下蹲",
    keys_melee: "近战",
    keys_pause: "暂停",
    mouse: "鼠标",
    lmb: "左键",
    rmb: "右键",
    touch_move: "左拇指，任意位置",
    touch_look: "拖动屏幕右侧",
    touch_fire: "按住开火，拖动跟随",
    touch_aim: "点击切换瞄准",
    touch_reload: "换弹",
    touch_jump: "跳跃",
    touch_cut: "在中继前按住使用",
    touch_sprint: "摇杆推到底",
    mouse_note:
      "如果浏览器拒绝锁定鼠标：按住鼠标键拖动即可转向（左键同时开火，右键同时瞄准）。方向键或 IJKL 也能转向，回车开火。",
    gamepad: "手柄",
    gamepad_note:
      "摇杆移动与转向 · RT 开火 · LT 瞄准 · A 跳跃 · B 下蹲 · X 换弹 · Y 切断中继 · L3 冲刺 · Start 暂停。",
    loc_card: "盐线码头 · 四号泊位 · 05:42",
    loc_card_sub: "港务局破袭小队 — 一人潜入，没有后援",

    hud_objective: "任务目标",
    hud_relays: "中继",
    hud_vitals: "生命体征",
    hud_medkit: "医疗包",
    hud_healed: "医疗包 +{n}",
    hud_control: "控制台",
    hud_destroyed: "已摧毁",
    hud_weak: "弱点",
    hud_reloading: "换弹中",
    hud_reload: "换弹",
    hud_reload_key: "R — 换弹",
    hud_empty: "空仓",
    hud_low: "弹药不足",
    hud_hold: "按住 {key} — {label}",
    obj_boat: "前往撤离船",
    obj_three: "切断三条上行中继",
    obj_last: "切断最后一个中继",
    obj_remaining: "切断剩余 {n} 个中继",
    relay: "{short} 号中继",
    relay_cut_prompt: "切断 {short} 号中继",
    boat: "撤离船",
    rescued: "被从水里捞了上来",
    relays_live: "中继还在运行 — 船不会在火力下等你",
    contact: "接触 — {dir}",
    dir_n: "正北", dir_ne: "东北", dir_e: "正东", dir_se: "东南",
    dir_s: "正南", dir_sw: "西南", dir_w: "正西", dir_nw: "西北",
    mode_touch: "触屏操作已启用",
    mode_drag:
      "无法锁定鼠标 — 移动鼠标即可转向，把鼠标停在屏幕边缘会持续旋转 · 点击开火 · 方向键或 IJKL 也能转向",
    mode_locked: "鼠标已锁定 — 按 Esc 释放",
    mode_click: "点击画面以锁定鼠标",
    resume_hint: "继续游戏会重新锁定鼠标。",

    tbtn_fire: "开火",
    tbtn_aim: "瞄准",
    tbtn_reload: "换弹",
    tbtn_jump: "跳跃",
    tbtn_use: "使用",
    tbtn_pause: "II",

    radio_intro: "破袭者，这里是控制台。“港务长”还占着泊位。切断它的三条上行链路——堆场、仓库、码头。",
    radio_contact: "它发现你了。海鸥会飞，猎犬会走。全部放倒。",
    radio_cut1: "一条中继熄灭了。它感觉到了——机械正在过来。",
    radio_cut2: "两条熄灭。它把剩下的一切都压上来了。",
    radio_all: "三条全灭。船停在码头南端的爬梯边，跑。",
    radio_low: "你被打得很重。躲到钢板后面喘口气。",
    radio_done: "破袭者已上船。盐线熄灭。干得好。",
    radio_city: "你已经出了围墙。这座城市没有尽头——继续走，它们会跟着你出来。",

    city_enter: "已越过围墙 — 城市向你敞开",
    city_district: "第 {n} 区",
    city_ammo: "弹夹 +{n} 发",
    city_loot_ammo: "弹药 +{n} 发",
    city_medkit: "医疗包 +1",
    city_clear: "街区肃清 — 继续深入",
    city_threat: "威胁上升 — 每街区 {n} 个敌人",
  },
};

function detect() {
  let q = null;
  try { q = new URLSearchParams(location.search).get("lang"); } catch {}
  if (q && S[q]) return q === "zh" || q === "cn" ? "zh" : "en";
  if (q && /^zh/i.test(q)) return "zh";
  if (q && /^en/i.test(q)) return "en";
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch {}
  if (saved && S[saved]) return saved;
  const list = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || "en"];
  for (const l of list) if (/^zh\b|^zh-/i.test(String(l))) return "zh";
  return "en";
}

let lang = detect();

export function getLang() { return lang; }

export function setLang(next, { persist = true } = {}) {
  if (!S[next] || next === lang) return false;
  lang = next;
  if (persist) { try { localStorage.setItem(STORE_KEY, lang); } catch {} }
  try { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; } catch {}
  return true;
}

export function t(key, vars) {
  const table = S[lang] || S.en;
  let out = table[key];
  if (out === undefined) out = S.en[key];
  if (out === undefined) return key;
  if (vars) {
    for (const k in vars) out = out.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
  }
  return out;
}

// Fill every element carrying data-i18n / data-i18n-aria. Safe to call anytime.
export function applyI18n(root) {
  const scope = root || document;
  try { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; } catch {}
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = t(el.dataset.i18n);
    if (el.textContent !== v) el.textContent = v;
  });
  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  scope.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPh));
  });
  return scope;
}

export const LANGS = [
  { id: "en", label: "EN" },
  { id: "zh", label: "中文" },
];