# Saltline 双人合作联机设计

- 日期：2026-11-14
- 状态：已确认，待实现
- 范围：把现有单机 PvE 改成 2 人合作 PvE，自建 Node 权威服务器

## 1. 背景与目标

现有游戏是一个纯静态的单机第一人称射击：玩家在雨夜集装箱港口切断 3 个中继站，躲开 Gull 无人机和 Hound 机器狗，最后撤离。港口西侧是无限程序化城市，按坐标确定性生成，支持单人探索与街头遭遇。

目标：

- 两名玩家进入同一局，共同切断 3 个中继站并撤离。
- 敌人、补给、中继进度、倒地与救援对两人完全一致。
- 采用类似吃鸡的权威服务器架构：服务器判定，客户端预测与插值，命中做延迟补偿。
- 保留单机模式，未联机时走原有代码路径。

成功标准：

- 两人在两个浏览器窗口中完成一整局（出生、交火、切中继、救援、撤离）。
- 人工注入 120 ms 延迟时，移动与射击仍可玩，队友和敌人运动平滑。
- 服务器与客户端对同一世界生成相同的碰撞体哈希。
- 单机模式行为与改动前一致。

非目标：

- 不做 PvP、匹配、排行榜、账号系统、观战、中途加入。
- 不做多房间分片与匹配；单进程按需创建房间，并发房间数由 CPU 决定，规模上限 2 人/房。
- 不做二进制协议与 delta 压缩；协议层预留替换空间。
- 不重写渲染、材质、音频、HUD 的视觉实现。

## 2. 决策摘要

| 主题 | 决策 |
|---|---|
| 玩法 | 2 人合作 PvE，共同完成原任务 |
| 部署 | 自建 Node 20+ 服务，同一端口提供静态文件与 WebSocket |
| 权威 | 服务器全权威：玩家、敌人、战斗、目标、随机内容 |
| 传输 | WebSocket + JSON v1；消息语义按可重复/可乱序设计 |
| 频率 | 模拟 30 Hz，快照 20 Hz，输入 30 Hz，开火即时发送 |
| 死亡 | 倒地 → 队友救援；两人都倒地/死亡判负 |
| 阵亡 | 流血死亡后观战，幸存者继续，胜利算两人 |
| 撤离 | 3 个中继全断后，所有存活玩家在圈内持续 3 秒 |
| 掉线 | 世界暂停，保留 90 秒重连 |
| 单机 | 完整保留，所有联机钩子仅在连接后生效 |

## 3. 总体架构

原则：渲染留在客户端，判定全部进共享层。现有 `js/game.js` 不重写，只在接缝上开钩子。

```
shared/                      浏览器与 Node 共用，无 DOM、无渲染器
  protocol.js                消息类型、版本、编解码、位掩码
  constants.js               移动/武器/敌人/局内/城市生活数值
  hash.js                    碰撞体规范化与 FNV-1a 哈希
  physics.js                 AABB 世界、raycast、lineOfSight
  player.js                  移动/碰撞/蹲跑跳一步结算
  combat.js                  命中判定、伤害、回溯历史
  enemies/ai.js              敌人状态机（目标为玩家数组）
  enemies/director.js        港口巡逻/波次/追击的唯一调度者
  world/director.js          城市敌人包与补给的唯一调度者
  world/port.js              加载 port-colliders.json
  world/port-colliders.json  由工具生成的港口静态碰撞体
  world/city.js              城市碰撞体生成（collideOnly）
server/
  index.js                   HTTP 静态服务 + WebSocket 升级
  room.js                    房间生命周期、30 Hz 循环、20 Hz 快照
  session.js                 会话与重连令牌
  snapshot.js                按玩家裁剪并编码快照
client/net/                  客户端网络层（ES module）
  connection.js              连接、握手、重连、心跳
  prediction.js              本地预测与回滚重放
  interpolation.js           队友/敌人/掉落插值
  replication.js             快照与事件绑定到现有子系统
tools/
  export-port-colliders.mjs  无渲染构建港口并导出碰撞体
test/
  *.test.js                  node --test
```

依赖方向：`server → shared`，`client/net → shared`，`game.js → client/net + shared`。`shared` 不得引用 `server`、`client/net` 或 DOM。

### 3.1 客户端接缝

`js/game.js` 只改以下位置：

1. 末尾启动：`QC()` 用 `typeof document !== "undefined"` 保护，并导出 `buildPortLevel`（即 `C1`）供导出工具使用。
2. 启动流程：连接成功后走联机初始化；未连接时完全走原路径。
3. `x_` 玩家控制器：移动结算调用 `shared/player.step`；联机时本地预测，收到 `ack` 后回滚重放。
4. `zv.playerShot`：联机时不本地扣血，改为发送 `fire`；命中反馈等待服务器 `shot` 事件。
5. `Em` 敌人模块：新增复制模式，位置/朝向/状态由快照驱动，不跑本地 AI；支持按服务器 id 生成与销毁。
6. `mM` 局内状态机：联机时中继、波次、胜负、救援由服务器事件驱动，客户端只播表现。
7. `city-life`：联机时关闭本地随机刷怪与掉落，只负责服务器实体的模型、动画和拾取提示。

## 4. 网络协议

### 4.1 传输与版本

- WebSocket，同一端口 `/ws`；JSON 文本消息。
- `PROTOCOL_VERSION = 1`。`hello` 携带协议版本与构建号；协议版本不匹配返回 `reject` 并以 4001 关闭，构建号只写入日志与提示，真正的世界差异由 `ready` 的碰撞体哈希兜底。
- 房间码 5 位，生成时检查冲突；`hello.room` 指定的房间不存在则创建，已满则 4002。
- 所有实时消息自带去重与过期依据：输入带 `seq`，快照带 `tick`，事件带 `id`。即使将来换到不可靠、无序的 WebRTC DataChannel，逻辑不变。
- 单包上限 64 KB；每客户端上限 120 条/秒；格式错误累计 3 次以 4004 断开。
- 快照不做 delta。2 人房间满快照约 1.5–2.5 KB，20 Hz 下 30–50 KB/s。

### 4.2 会话流程

```
C → S  hello   {v, build, room?, reconnect?}
S → C  welcome {session, token, playerId, room, seed, level, ruleset,
                tickRate:30, snapRate:20}
S → C  world   {seed, level:"port", portHash}
      客户端本地生成城市与港口
C → S  ready   {portHash, cityHash}
S → C  start   {tick, countdownMs:3000}
C → S  input / fire …
S → C  snap / ev / peer / pong
```

- 房间码 5 位大写字母数字；`?room=ABCDE` 直接加入，不带码则补进等待中的房间。
- `ready` 的哈希不一致返回 `reject` 4003，防止两人世界不同。
- 双方 `ready` 后服务器进入 `countdown`，倒计时结束广播 `start`。

### 4.3 消息定义

客户端到服务器：

| 类型 | 字段 | 说明 |
|---|---|---|
| `hello` | `v, build, room?, reconnect?` | 握手；`reconnect` 为上次 `token` |
| `ready` | `portHash, cityHash` | 世界生成完毕 |
| `input` | `seq, dt, mx, mz, yaw, pitch, btn, ct` | 30 Hz；`mx/mz` 为 -1..1 移动轴 |
| `fire` | `seq, origin, dir, ct` | 按下扳机立即发送；`seq` 指向最近 input |
| `ping` | `ct` | 1 Hz 时钟同步 |
| `bye` | — | 主动离开 |

`btn` 位掩码：1 瞄准、2 冲刺、4 蹲、8 跳、16 换弹、32 医疗包、64 交互。开火不在位掩码内。

服务器到客户端：

| 类型 | 字段 | 说明 |
|---|---|---|
| `welcome` | `session, token, playerId, room, seed, level, ruleset, tickRate, snapRate` | 入房 |
| `world` | `seed, level, portHash` | 世界参数 |
| `start` | `tick, countdownMs` | 开局 |
| `snap` | 见 4.4 | 20 Hz |
| `ev` | `id, k, …` | 见 4.5，立即发送 |
| `peer` | `state, playerId, timeoutMs` | `left` / `back` |
| `pong` | `ct, st` | 回显客户端时间与服务器时间 |
| `reject` | `code, message` | 拒绝原因 |

### 4.4 快照

```json
{"t":"snap","tick":4210,"st":123456.78,"ack":812,
 "self":{"pos":[12,1.7,-4],"vel":[0,0,-5.2],"yaw":0.31,"pitch":-0.05,
         "hp":74,"state":"alive","med":1,"ammo":24,"reload":0,
         "onGround":true,"crouch":false,"downT":0,"revive":0},
 "players":[{"id":2,"pos":[15,0.9,-8],"vel":[0,0,3.1],"yaw":1.2,
             "hp":0,"state":"downed","downT":31.2,"revive":0.35}],
 "enemies":[{"id":31,"type":"hound","pos":[18,0,-12],"yaw":0.8,
             "mode":"engage","hp":42,"target":1}],
 "drops":[{"id":"d7","kind":"mag","pos":[9,0.2,-2]}],
 "relays":[{"id":"relay_a","progress":0.62,"cut":false}],
 "match":{"state":"playing","time":321.4,"threat":0.7,"pursuit":true,
          "extract":0}}
```

- `ack` 是服务器已处理或已过期的最后一个 input `seq`；客户端据此回滚重放。
- `self` 只发给本人；`players` 只含队友。
- `enemies` 全量，活跃上限 40。
- `drops` 按收件人 120 m 半径裁剪。
- `match.extract` 为撤离读条进度 0..1。
- 快照按收件人分别编码；2 人房间每 tick 编码两份。

### 4.5 事件

| `k` | 载荷 | 客户端反应 |
|---|---|---|
| `shot` | `by, from, to, hit{kind,id,point,part}` | 曳光、弹孔、命中反馈；伤害只认服务器 |
| `enemySpawn` | `id, type, pos, mode` | 生成远端敌人骨架 |
| `enemyDown` | `id, by, weak` | 死亡特效与音效 |
| `hurt` | `amount, from, dir` | 受击表现（震屏、音效），血量以快照为准 |
| `downed` | `playerId, downT` | 倒地界面与语音 |
| `revived` | `playerId, by` | 起身表现 |
| `died` | `playerId` | 观战切换 |
| `relay` | `id, progress, cut, by` | 目标进度与无线电 |
| `drop` | `id, kind, pos, takenBy` | 补给生成/消失 |
| `match` | `state, reason` | `won` / `lost` / `waiting` / `resume` / `disbanded` |
| `radio` | `key, params` | 字幕与语音，保证两人同一句 |

事件 `id` 全局自增，客户端按 `id` 去重。网络层收到后转发进 `game.events` 总线，HUD、音效、FX 复用现有监听器。

### 4.6 时钟与回溯

- 客户端 1 Hz 发 `ping{ct}`，服务器回 `pong{ct, st}`；客户端取最近 8 个样本的中位数作为 `serverTimeOffset`，丢弃 RTT 超过中位数 3 倍的样本。
- 命中回溯不依赖客户端时钟：`fire.seq` 对应的 input 在哪个 tick 被应用，服务器就回溯到那个 tick。
- 服务器维护 `seq → tick` 映射（最近 2 秒）和位置历史环形缓冲（最近 1 秒，30 条）。
- 回溯窗口封顶 250 ms；更旧的 `seq` 按 250 ms 处理。
- 历史中保存：两名玩家的位置、蹲伏高度、存活状态；所有存活敌人的位置与类型。静态世界不回溯。

### 4.7 校验

- `input`：`dt` 限制 0–100 ms，移动轴长度 ≤1，`yaw/pitch` 必须有限，超出速度上限直接钳制。
- `fire`：射速按武器当前状态校验，容差 10%；弹药与换弹由服务器维护；射线起点与服务器位置偏差 >0.75 m 时改用服务器位置重算。
- 命中顺序：静态世界（当前）→ 队友（回溯位置，作为遮挡，不造成伤害）→ 敌人（回溯位置）。无友伤。
- 交互：服务器根据 `btn`、距离 2.2 m、朝向 0.45 点积判定中继与救援。
- 目标进度、伤害、死亡、胜负只由服务器写入。

## 5. 世界一致性

### 5.1 港口静态碰撞体

`C1`（`js/game.js:15824`）和建造器 `ob`（`js/game.js:13523`）不调用 DOM，只依赖 three 的几何与材质接口。做法：

- `tools/export-port-colliders.mjs` 用 `THREE.Scene`、真实 `physics`、桩材质对象运行 `C1`，导出 `physics.boxes` 到 `shared/world/port-colliders.json`。
- 桩材质实现 `get(name, opts)` 与 `emissive(color, gain)`，返回无贴图的 `MeshStandardMaterial` / `MeshBasicMaterial`。
- 导出时把每个 box 的 `min/max` 四舍五入到 1e-3，按 `min.x,min.y,min.z,max.x,max.y,max.z,surface,tag,flags` 排序后计算 FNV-1a 32 位哈希，写入 JSON 的 `hash` 字段。
- 服务器启动时加载 JSON 并校验哈希；客户端关卡构建完成后，对 `tag !== "city"` 的碰撞体用同一规范化函数计算哈希。
- `ready.portHash` 与服务器不一致则拒绝 4003。
- 测试运行导出工具并与仓库内 JSON 比对；关卡改动而 JSON 未更新会让测试失败。

### 5.2 城市

- `js/city.js` 保持共享，新增 `createCity(game, { collideOnly: true })`：
  - 跳过所有几何、材质、灯光、阴影创建，只调用 `physics.addBox` 并维护街区生命周期。
  - `update(dt, focus)` 的 `focus` 支持单个位置或位置数组；按"任意焦点附近"决定保留、降级与回收的街区。
  - 客户端仍传单个位置，视觉结果不变。
- 服务器以出生点为中心预生成 3×3 街区碰撞体，之后跟随两名玩家推进；因为不建网格，单街区成本远低于客户端的 12 ms。
- 确定性来自坐标哈希，不使用 `Math.random`。客户端开局对出生点 3×3 街区中 `tag === "city"` 的碰撞体按 5.1 的规范计算 `cityHash`；服务器用同一函数校验。
- `city.spawnPoint`、`streetAt`、`blockedAt`、`surfaceAt` 在 `collideOnly` 下保持可用。

### 5.3 随机内容的归属

- `city-life` 拆成：
  - `shared/world/director.js`：补给生成/拾取、街区敌人包的生成/回收、种子随机。服务器唯一实例。
  - `js/city-life.js`：模型、动画、拾取提示、HUD 交互；联机时不再自行决定生成。
- 港口波次与追击从 `mM`（`js/game.js:37146` 起）抽到 `shared/enemies/director.js`：巡逻、波次、`waveHot`、`pursuit`、`maxAlive` 都由服务器驱动，目标为玩家数组。
- 服务器事件与快照携带实体 id；客户端按 id 建立远端敌人和补给的映射。
- 城市敌人上限保持 10（`TUNE.aliveMax`），港口 `maxAlive` 保持 9，巡逻 2 Gull + 1 Hound，波次表沿用现有三档。

### 5.4 常量

`shared/constants.js` 导出五组数值，客户端与服务器共同引用：

- `VIEW`：`Pi`（眼高、蹲眼高、半径、身高、FOV）。
- `MOVE`：`Mt`（速度、加速度、重力、跳、蹲、后坐、回血、医疗包）。
- `ENEMY_TUNE`：`Ui`（视野、听觉、令牌、池大小）。
- `MATCH`：`Yi`（交互距离、切割秒数、巡逻、波次、追击、最大存活）。
- `CITY_LIFE`：`TUNE`（弹匣/医疗包/掉落/敌人包全部参数）。

`game.js` 与 `city-life.js` 中原对象字面量改为从 `shared/constants.js` 导入后赋给原变量名，避免行为漂移。

## 6. 局内状态机

### 6.1 房间

```
lobby → countdown → playing ↔ waiting → won | lost | disbanded
```

- `lobby`：等待两人 `ready`；超时 10 分钟后房间回收。
- `countdown`：3 秒；期间玩家不能移动。
- `playing`：模拟运行。
- `waiting`：有玩家掉线，模拟冻结，计时器暂停。
- `won` / `lost`：冻结并保留 60 秒供客户端展示结算。
- `disbanded`：重连超时或服务器主动终止。

### 6.2 玩家

```
alive → downed → dead
  ↑        │
  └─ revive ┘
```

- `alive`：正常移动、射击、交互。
- `downed`：血量 0；不能移动、射击、切割、救援；可以转视角和看 HUD；流血倒计时 45 秒。
- `dead`：流血结束或两人同时倒地时进入；观战队友，不参与撤离判定。
- 两人都处于 `downed` 或 `dead` 立即 `lost`。
- 一人 `dead`、一人 `alive` 时继续；幸存者完成目标即 `won`，两人都记胜利。

### 6.3 倒地与救援

- 救援条件：救援者 `alive`，与目标水平距离 ≤1.8 m，按住交互。
- 读条 3 秒；救援者移动、开火、松开交互会中断，进度按 1.5 倍速衰减；受伤不中断。
- 救起后目标 40 血、保留医疗包与弹药、清除流血计时。
- 服务端维护 `revive` 进度并写入快照；客户端显示队友倒地位置与读条。
- 倒地玩家附近没有队友时，HUD 显示流血倒计时与"等待救援"。

### 6.4 中继与撤离

- 中继沿用现有规则：交互距离 2.2 m、朝向点积 ≥0.45、按住交互累计 2.4 秒；松开后进度以 1.6 倍速衰减；切断后不可恢复。
- 两名玩家可同时切割同一中继，进度叠加；中继进度写入快照。
- 每切断一个中继触发对应波次；全部切断后进入追击阶段，规则沿用 `MATCH.pursuit*`。
- 撤离：3 个中继全断后，所有存活玩家必须在撤离圈内持续 3 秒。倒地玩家仍算存活，但无法移动，必须先被救起；任何人离开或倒地则计时清零。已死亡玩家不参与判定。
- `match.extract` 为读条进度；HUD 显示"等待队友进入撤离点"。

### 6.5 掉线与重连

- 心跳 5 秒无响应判定掉线；`peer{state:"left"}` 广播，`match.state = waiting`，模拟与所有计时冻结。
- `welcome` 返回的 `token` 存 sessionStorage；90 秒内带 `hello{reconnect}` 回来，恢复同一 `playerId` 与完整状态。
- 重连成功广播 `peer{state:"back"}` 与 `match{state:"resume"}`；服务器补一份完整快照。
- 超时未回：`match{state:"disbanded"}`，房间在 60 秒后回收。
- 不允许第三人加入或中途加入。

## 7. 服务器

### 7.1 循环

固定步长 30 Hz，使用 `setInterval` 加单调时钟补偿；单 tick 超过 33 ms 时只补一次，不追赶堆积。

每 tick：

1. 从每个玩家的输入队列取最多 3 条，按顺序应用 `shared/player.step`。
2. 处理 `fire` 队列：射速/弹药校验 → 回溯 → 命中 → 伤害。
3. 更新倒地、流血、救援、中继、撤离计时。
4. 运行敌人导演（生成/回收）与 `shared/enemies/ai`。
5. 检查胜负与掉线超时。
6. 把本 tick 结束时的玩家与敌人状态写入位置历史。
7. 用累加器每 1.5 tick（20 Hz）逐玩家编码并发送快照；事件即时发送。

每个阶段包在独立 try/catch 中：记录首次异常并继续；玩家位置出现非有限值时回退到最近安全点；连续 3 个 tick 都出现异常则结束本局。

### 7.2 输入

- 输入按 `seq` 排序；重复 `seq` 丢弃。
- `dt` 钳制到 0–0.1 秒；晚于 500 ms 的输入不再模拟，但其 `seq` 计入 `ack`，让客户端丢弃。
- 每 tick 最多应用 3 条，剩余留到下 tick；队列超过 12 条时丢弃最旧的并推进 `ack`。
- 输入只影响该玩家自身状态，不直接改世界。

### 7.3 快照

- `server/snapshot.js` 为每个玩家构造一次：`self` 取该玩家，`players` 取另一人，`enemies` 全量，`drops` 按 120 m 过滤，`relays` 与 `match` 共享。
- 快照在 tick 结束后构造；发送前检查 `ws.bufferedAmount`，超过 256 KB 时跳过本次快照，事件仍发送。
- 快照不重传；丢失由下一份覆盖。

### 7.4 延迟补偿

- 历史环形缓冲每条 tick 记录玩家与敌人的位置、蹲伏高度、存活状态。
- `fire` 到达后查 `seq → tick`，取目标 tick 的历史；窗口钳制在 `[now-7, now]` tick（约 233 ms，上限 250 ms）。
- 目标 tick 等于当前 tick 时直接用实时状态，因为该 tick 的历史要到 tick 结束才写入。
- 静态世界用当前碰撞体；队友与敌人用历史位置。
- 命中判定只对敌人结算伤害；队友只作为遮挡。
- 服务器广播 `shot` 事件，包含起点、终点与命中信息；射手客户端据此显示命中反馈。

### 7.5 背压与资源

- 每房间最多 2 个连接；空房间 30 秒后释放城市碰撞体与历史缓冲。
- 城市街区离开范围即释放碰撞体；`collideOnly` 模式不保留几何。
- 服务器不加载材质、贴图、音频；`shared` 与 `server` 不得 import `js/vendor` 之外的渲染模块。

## 8. 客户端

### 8.1 预测与回滚

- 本地玩家每帧读取输入，调用 `shared/player.step` 立即移动；摄像机跟随预测位置。
- 输入按 30 Hz 发送并保存在待确认队列。
- 收到快照后：若 `ack` 大于上次，应用 `self` 权威状态，然后重放 `seq > ack` 的输入；重放最多 300 ms。
- 位置误差 <0.05 m 时保留预测结果避免抖动；误差 >2 m 时硬校正并记录一次遥测。
- 血量、弹药、换弹、倒地状态不做预测，直接采用服务器值；开火音效与枪口火光本地立即播放。

### 8.2 插值

- 客户端维持 100 ms 快照缓冲，以 `serverTime - 100ms` 为渲染时间。
- 队友、敌人、掉落位置线性插值，朝向按最短弧插值。
- 缓冲耗尽时最多外推 150 ms（用速度），之后冻结并在 HUD 显示连接质量。
- 敌人动画由快照 `mode`、速度和位移驱动；不运行本地 AI。

### 8.3 事件桥

- `replication.js` 把 `ev` 重新发射到 `game.events`，复用现有 HUD、音效、FX 监听器。
- `shot`：本地不预测命中，只播放曳光；命中标记等待服务器确认。
- `hurt`：调用玩家表现层（震屏、受击音、红屏），不调用会扣血的 `damage()`。
- `downed`/`revived`/`died`：切换 HUD 状态与观战摄像机。
- `match`：`won`/`lost` 复用现有结算；`waiting` 显示暂停遮罩。

### 8.4 HUD

在现有 HUD 上增加：

- 队友状态条：血量、倒地/流血计时、距离。
- 救援提示与读条。
- 撤离等待提示与读条。
- 连接质量图标：RTT、丢包/外推状态。
- 观战模式：跟随幸存者视角，显示"任务继续"。

## 9. 错误处理

| 场景 | 处理 |
|---|---|
| 协议版本不符 | `reject{code:4001}`，关闭 |
| 房间已满 | `reject{code:4002}`，关闭 |
| 世界哈希不符 | `reject{code:4003}`，提示刷新或检查构建 |
| 消息格式错误/超频 | 累计 3 次，`4004` 关闭 |
| 心跳超时 | 广播 `peer left`，进入 `waiting`，保留 90 秒 |
| 重连超时 | `match disbanded`，60 秒后回收房间 |
| 发送积压 | 跳过快照，保留事件；持续积压 5 秒断开 |
| 输入队列溢出 | 丢弃最旧输入并推进 `ack` |
| 快照过期 | 客户端按 `tick` 丢弃旧快照 |
| 插值欠载 | 外推 ≤150 ms 后冻结，显示连接质量 |
| 预测误差过大 | >2 m 硬校正，记录遥测 |
| 服务器 tick 异常 | 单阶段隔离；连续 3 次结束本局 |
| 玩家位置非有限值 | 回退最近安全点；再次出现则结束本局 |
| 城市生成异常 | 跳过该街区碰撞体并记录；玩家落到实体内部时回退最近安全点；连续 3 个街区失败则结束本局 |

## 10. 测试

### 10.1 单元测试（`node --test`）

- `shared/physics`：AABB 射线、地面/水面、`lineOfSight`、边界。
- `shared/player`：加速/减速、跳跃、蹲伏、碰撞、楼梯/斜坡边界、速度上限。
- `shared/combat`：射速校验、回溯窗口、队友遮挡、无友伤。
- `shared/enemies/ai`：巡逻 → 调查 → 交战 → 丢失目标的状态转换；多目标选择。
- `shared/protocol`：版本、位掩码、编码/解码、非法字段拒绝。
- 倒地/救援状态机：计时、衰减、两人同时倒地判负、死亡后观战。

### 10.2 确定性测试

- 同一 seed 连续生成两次城市，3×3 街区碰撞体哈希一致。
- 导出工具重新生成港口 JSON，与仓库内文件哈希一致。
- 客户端与服务端规范化函数对同一 box 集合产生同一哈希。

### 10.3 无头集成测试

- 在随机端口启动真实服务器。
- 两个 Node WebSocket 客户端完成握手、`ready`、`start`。
- 脚本化输入：前进、切中继、开火、倒地、救援、撤离。
- 断言：两人快照中的敌人 id/位置一致；中继进度一致；救援与胜负一致；断线重连后状态恢复。
- 人工延迟：服务器支持 `--lag ms --jitter ms` 调试；客户端支持 `?netlag=ms`。

### 10.4 手动 QA

- 两个浏览器窗口同房间：移动、视角、射击、命中反馈、敌人同步、补给拾取。
- 中继切割、波次、追击、撤离。
- 倒地、救援、流血死亡、观战、两人倒地判负。
- 掉线暂停、90 秒内重连、超时解散。
- 单机模式回归：标题、开场、完整一局、结算。

## 11. 实施阶段

### 阶段 1：共享层与导出工具

- 建立 `shared/`：常量、物理、玩家、协议、哈希。
- 加 `game.js` 启动保护与 `buildPortLevel` 导出。
- 完成港口碰撞体导出工具与城市 `collideOnly`。
- 测试：单测 + 确定性测试通过；`portHash` 在客户端与工具间一致。

### 阶段 2：服务器与移动同步

- `server/index.js` + `room.js` + `session.js`，握手、房间码、`ready`、`start`。
- 服务器跑两名玩家移动与快照；客户端预测、回滚、队友插值。
- 暂不接敌人与目标。
- 验收：两个浏览器能同房移动、互相看见；单机不受影响。

### 阶段 3：战斗、敌人与目标

- 服务器运行敌人 AI 与导演；客户端复制模式。
- `fire` 校验、延迟补偿、`shot` 事件、伤害与死亡。
- 中继、波次、追击、撤离、胜负。
- 验收：两人完成一整局，延迟 120 ms 下可玩。

### 阶段 4：倒地救援、掉线与收尾

- 倒地/救援/观战、双倒地判负、撤离全员判定。
- 掉线暂停、重连、超时解散。
- 城市生活导演迁移、补给同步。
- HUD、连接质量、遥测。
- 验收：手动 QA 清单全过；`npm test` 全绿。

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 无渲染运行 `C1` 仍需额外桩 | 阶段 1 先做导出工具验证；失败则给 `C1` 加 `collideOnly` 分支，几何与碰撞体分离 |
| 城市 `collideOnly` 改动影响客户端视觉 | 视觉路径保持默认；对照截图与街区统计；`?nocity` 与现有审计工具回归 |
| 敌人 AI 抽离后行为漂移 | 保留原 `Em` 作为单机实现；共享 AI 用状态转换测试对齐巡逻/交战/丢失目标 |
| 双玩家城市焦点导致街区抖动 | 以"任意焦点附近"为保留条件；只在新焦点进入时规划，不因另一人离开回收 |
| WebSocket 队头阻塞 | 消息小而频繁；积压丢快照；协议按可重复/乱序设计，后续可换 WebRTC |
| 浮点确定性导致城市哈希不一致 | 哈希前四舍五入到 1e-3；不依赖 `Math.random`；开局即校验并拒绝 |
| 端口/城市数值漂移 | 常量集中到 `shared/constants.js`；测试校验导出哈希 |
| 单机回归 | 所有联机分支由 `net.connected` 控制；单机 QA 列入每阶段验收 |