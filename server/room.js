// Authoritative room: handshake, 30 Hz simulation, 20 Hz snapshots.

import crypto from "node:crypto";
import { Vector3 } from "../shared/three.js";
import { createRoomWorld } from "./world.js";
import { SessionStore } from "./session.js";
import { buildSnapshot } from "./snapshot.js";
import { Bus } from "./bus.js";
import { createEnemySim, Director, CityDirector, makeFacade } from "./enemies.js";
import { resolveShot } from "./combat.js";
import { DropDirector } from "./drops.js";
import { createPlayerState, step } from "../shared/player.js";
import {
  encode,
  decode,
  validateClientMessage,
  inputCommand,
  ProtocolError,
  ERROR,
  PROTOCOL_VERSION,
  MAX_MESSAGES_PER_SECOND,
  MAX_MESSAGE_BYTES,
  BTN,
} from "../shared/protocol.js";
import { WEAPON, MATCH } from "../shared/constants.js";

const TICK_RATE = 30;
const SNAP_RATE = 20;
const DT = 1 / TICK_RATE;
const MAX_PLAYERS = 2;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let out = "";
  for (let i = 0; i < 5; i++)
    out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

function send(ws, msg) {
  if (!ws || ws.readyState !== 1) return false;
  try {
    ws.send(encode(msg));
    return true;
  } catch (err) {
    console.error("[room] send failed: " + ((err && err.message) || err));
    return false;
  }
}

function reject(ws, code, message) {
  send(ws, { t: "reject", code, message });
  try {
    ws.close(code, message);
  } catch {}
}

export class Room {
  constructor(code, manager) {
    this.code = code;
    this.manager = manager;
    this.seed = 4207;
    this.world = createRoomWorld();
    this.players = [];
    this.state = "lobby";
    this.tick = 0;
    this.time = 0;
    this.startTick = 0;
    this.snapAcc = 0;
    this.eventId = 1;
    this.threat = 0;
    this.extractT = 0;
    this.emptySince = Date.now();
    this.disposed = false;
    this.starting = false;
    this.bus = new Bus();
    this.enemies = null;
    this.enemyGame = null;
    this.director = null;
    this.cityDirector = new CityDirector(this);
    this.dropDirector = new DropDirector(this);
    this.facades = [];
    this.relays = [];
    this.cutCount = 0;
    this.allCut = false;
    this.history = [];
    this.waitTimer = null;
    this.bindEnemyEvents();
    this.enemySnapshot = () =>
      this.enemies
        ? this.enemies.list
            .filter((e) => e.alive && e.active)
            .map((e) => ({
              id: e.id,
              type: e.type,
              pos: [
                Math.round(e.pos.x * 1000) / 1000,
                Math.round(e.pos.y * 1000) / 1000,
                Math.round(e.pos.z * 1000) / 1000,
              ],
              yaw: Math.round(e.yaw * 1000) / 1000,
              mode: e.mode,
              hp: Math.max(0, Math.round(e.hp)),
              speed:
                Math.round(
                  Math.hypot(e.vel ? e.vel.x : 0, e.vel ? e.vel.z : 0) * 100,
                ) / 100,
            }))
        : [];
    this.relaySnapshot = () =>
      this.relays.map((r) => ({
        id: r.id,
        progress: Math.round(r.progress * 1000) / 1000,
        cut: r.cut,
      }));
    this.dropSnapshot = (player) => this.dropDirector.snapshot(player);
    this.timer = setInterval(() => this.step(), 1000 / TICK_RATE);
    if (this.timer.unref) this.timer.unref();
  }

  bindEnemyEvents() {
    this.bus.on("enemy:killed", ({ enemy, type, pos }) => {
      if (!enemy) return;
      this.event("enemyDown", {
        id: enemy.id,
        type: type || enemy.type,
        pos: pos ? [pos.x, pos.y, pos.z] : null,
      });
    });
    this.bus.on("enemy:spawn", ({ enemy }) => {
      if (!enemy) return;
      this.event("enemySpawn", {
        id: enemy.id,
        type: enemy.type,
        pos: [enemy.pos.x, enemy.pos.y, enemy.pos.z],
        mode: enemy.mode,
      });
    });
    this.bus.on("enemy:telegraph", ({ enemy, type, time, pos, melee }) => {
      if (!enemy) return;
      this.event("telegraph", {
        id: enemy.id,
        type: type || enemy.type,
        time,
        melee: !!melee,
        pos: pos ? [pos.x, pos.y, pos.z] : null,
      });
    });
    this.bus.on("enemy:melee", ({ enemy, pos }) => {
      if (!enemy) return;
      this.event("melee", {
        id: enemy.id,
        type: enemy.type,
        pos: pos ? [pos.x, pos.y, pos.z] : null,
      });
    });
    this.bus.on("enemy:alert", ({ enemy, pos }) => {
      if (!enemy) return;
      this.event("alert", {
        id: enemy.id,
        type: enemy.type,
        pos: pos ? [pos.x, pos.y, pos.z] : null,
      });
    });
    this.bus.on("enemy:fire", ({ enemy, pos }) => {
      if (!enemy) return;
      this.event("enemyFire", {
        id: enemy.id,
        type: enemy.type,
        pos: pos ? [pos.x, pos.y, pos.z] : null,
      });
    });
  }

  addPlayer(ws, build) {
    if (this.players.length >= MAX_PLAYERS) return null;
    let id = 1;
    for (const p of this.players) if (p.id === id) id++;
    const player = {
      id,
      ws,
      build: build || "dev",
      connected: true,
      ready: false,
      state: createPlayerState({
        pos: this.spawnFor(id),
        yaw: this.world.level.playerStart.yaw || 0,
        health: 100,
      }),
      inputs: [],
      lastAck: 0,
      seqToTick: new Map(),
      lastFireAt: -1e9,
      lastBtn: 0,
      fireQueue: [],
      ammo: WEAPON.magSize,
      reserve: WEAPON.reserve,
      reloadT: 0,
      medkits: 0,
      downed: false,
      downT: 0,
      reviveT: 0,
    };
    this.players.push(player);
    this.emptySince = 0;
    return player;
  }

  spawnFor(id) {
    const start = this.world.level.playerStart.pos;
    if (id === 1) return start.clone();
    const offsets = [
      [1.4, 0],
      [-1.4, 0],
      [0, 1.4],
      [0, -1.4],
    ];
    for (const [dx, dz] of offsets) {
      const p = start.clone();
      p.x += dx;
      p.z += dz;
      if (
        !this.world.physics.cityBlocked(p.x, p.z) &&
        this.world.physics.nav.isWalkable(p.x, p.z)
      )
        return p;
    }
    return start.clone();
  }

  restorePlayer(id, ws) {
    const player = this.players.find((p) => p.id === id);
    if (!player || player.connected) return null;
    player.ws = ws;
    player.connected = true;
    player.inputs.length = 0;
    this.emptySince = 0;
    clearTimeout(this.waitTimer);
    this.waitTimer = null;
    if (
      this.state === "waiting" &&
      this.players.every((p) => p.connected)
    ) {
      this.state = "playing";
    }
    return player;
  }

  onInput(player, input) {
    if (this.state !== "playing" && this.state !== "countdown") {
      player.lastAck = Math.max(player.lastAck, input.seq);
      return;
    }
    if (player.inputs.length >= 12) {
      const dropped = player.inputs.shift();
      player.lastAck = Math.max(player.lastAck, dropped.seq);
    }
    input.receivedAt = Date.now();
    player.inputs.push(input);
  }

  onFire(player, fire) {
    if (this.state !== "playing") return;
    player.fireQueue = player.fireQueue || [];
    if (player.fireQueue.length < 32) player.fireQueue.push(fire);
  }

  async maybeStart() {
    if (this.state !== "lobby" || this.starting) return;
    if (this.players.length !== MAX_PLAYERS) return;
    if (!this.players.every((p) => p.ready && p.connected)) return;
    this.starting = true;
    try {
      await this.ensureEnemies();
      this.refreshFacades();
      this.resetMatch();
      this.state = "countdown";
      this.time = 0;
      this.startTick =
        this.tick + Math.round(MATCH.countdownSeconds * TICK_RATE);
      for (const p of this.players) {
        p.state.enabled = true;
        p.state.health = p.state.maxHealth;
        p.state.alive = true;
      }
      this.broadcast({
        t: "start",
        tick: this.startTick,
        countdownMs: Math.round(MATCH.countdownSeconds * 1000),
      });
    } finally {
      this.starting = false;
    }
  }

  async ensureEnemies() {
    if (!this.enemies) await createEnemySim(this);
    if (!this.director) this.director = new Director(this);
  }

  refreshFacades() {
    this.facades = this.players.map((p) => makeFacade(this, p));
    if (this.enemyGame) {
      this.enemyGame.players = this.facades;
      this.enemyGame.player = this.facades[0] || null;
    }
  }

  resetMatch() {
    const start = this.world.level.playerStart;
    this.relays = (this.world.level.objectives || []).map((o, i) => ({
      id: o.id || "relay_" + i,
      pos: o.pos.clone ? o.pos.clone() : o.pos,
      progress: 0,
      cut: false,
      short: String(o.id || "A" + i).slice(-1).toUpperCase(),
    }));
    this.cutCount = 0;
    this.allCut = false;
    this.extractT = 0;
    this.threat = 0;
    this.history.length = 0;
    this.dropDirector.reset();
    this.cityDirector.reset();
    if (this.enemies) this.enemies.clear();
    for (const p of this.players) {
      const pos = this.spawnFor(p.id);
      p.state.pos.copy(pos);
      p.state.vel.set(0, 0, 0);
      p.state.yaw = start.yaw || 0;
      p.state.pitch = 0;
      p.state.health = p.state.maxHealth;
      p.state.alive = true;
      p.state.enabled = true;
      p.state.onGround = true;
      p.state.lastSafe.copy(pos);
      p.downed = false;
      p.downT = 0;
      p.reviveT = 0;
      p.ammo = WEAPON.magSize;
      p.reserve = WEAPON.reserve;
      p.reloadT = 0;
      p.lastFireAt = -1e9;
      p.lastBtn = 0;
      p.inputs.length = 0;
      p.lastAck = 0;
      p.seqToTick.clear();
      p.fireQueue = [];
    }
    if (this.director) this.director.start();
  }

  step() {
    if (this.disposed) return;
    this.tick++;

    if (this.state === "countdown" && this.tick >= this.startTick) {
      this.state = "playing";
      this.time = 0;
      this.broadcast({ t: "ev", id: this.eventId++, k: "match", state: "playing" });
    }

    if (this.state === "playing") {
      this.time += DT;
      const foci = this.players
        .filter((p) => p.connected)
        .map((p) => p.state.pos);
      if (foci.length) {
        this.world.city.update(0, foci);
        this.world.city.flush();
      }
      for (const p of this.players) if (p.connected) this.drainInputs(p);
      this.processFires();
      this.updateReload(DT);
      if (this.enemies) {
        try {
          this.enemies.update(DT);
        } catch (err) {
          console.error("[room] enemy update threw", err);
        }
      }
      if (this.director) this.director.update(DT);
      this.cityDirector.update(DT);
      this.updateDowned(DT);
      this.dropDirector.update(DT);
      this.updateRelays(DT);
      this.updateExtraction(DT);
      this.recordHistory();
      const aliveEnemies = this.enemies ? this.enemies.aliveCount() : 0;
      this.threat = Math.min(
        1,
        aliveEnemies / Math.max(1, MATCH.maxAlive) + (this.allCut ? 0.25 : 0),
      );
    }

    this.snapAcc += SNAP_RATE / TICK_RATE;
    if (this.snapAcc >= 1) {
      this.snapAcc -= 1;
      if (this.state !== "lobby") this.sendSnapshots();
    }

    if (this.emptySince && Date.now() - this.emptySince > 30_000)
      this.manager.disposeRoom(this);
  }

  drainInputs(player) {
    let applied = 0;
    while (applied < 3 && player.inputs.length) {
      const input = player.inputs.shift();
      applied++;
      if (Date.now() - input.receivedAt > 500) {
        player.lastAck = Math.max(player.lastAck, input.seq);
        continue;
      }
      if (player.downed || !player.state.alive) {
        player.lastAck = Math.max(player.lastAck, input.seq);
        player.lastBtn = 0;
        continue;
      }
      const firing = this.time - player.lastFireAt < 0.25;
      step(
        player.state,
        inputCommand(input, firing),
        input.dt,
        this.world.physics,
      );
      player.lastBtn = input.btn;
      if (input.btn & BTN.RELOAD) this.startReload(player);
      player.lastAck = Math.max(player.lastAck, input.seq);
      player.seqToTick.set(input.seq, this.tick);
      if (player.seqToTick.size > 120) {
        const first = player.seqToTick.keys().next().value;
        player.seqToTick.delete(first);
      }
    }
  }

  startReload(player) {
    if (player.reloadT > 0 || player.ammo >= WEAPON.magSize || player.reserve <= 0)
      return;
    player.reloadT =
      player.ammo <= 0 ? WEAPON.emptyReloadSeconds : WEAPON.reloadSeconds;
  }

  updateReload(dt) {
    for (const p of this.players) {
      if (p.reloadT <= 0) continue;
      p.reloadT = Math.max(0, p.reloadT - dt);
      if (p.reloadT <= 0) {
        const take = Math.min(WEAPON.magSize - p.ammo, p.reserve);
        p.ammo += take;
        p.reserve -= take;
      }
    }
  }

  tickForSeq(player, seq) {
    const t = player.seqToTick.get(seq);
    if (t == null) return this.tick;
    return Math.max(this.tick - 7, Math.min(this.tick, t));
  }

  liveEnemyState() {
    if (!this.enemies) return [];
    return this.enemies.list
      .filter((e) => e.alive)
      .map((e) => ({
        id: e.id,
        type: e.type,
        pos: [e.pos.x, e.pos.y, e.pos.z],
        alive: true,
      }));
  }

  stateAtTick(tick, shooterId) {
    const h = this.history.find((x) => x.tick === tick);
    if (!h)
      return {
        players: this.players
          .filter((p) => p.connected && p.id !== shooterId)
          .map((p) => ({
            id: p.id,
            pos: [p.state.pos.x, p.state.pos.y, p.state.pos.z],
            crouch: !!p.state.crouching,
            alive: p.state.alive && !p.downed,
          })),
        enemies: this.liveEnemyState(),
      };
    return {
      players: h.players.filter((p) => p.id !== shooterId),
      enemies: h.enemies,
    };
  }

  processFires() {
    for (const p of this.players) {
      if (!p.connected || p.downed || !p.state.alive) continue;
      if (!p.fireQueue || !p.fireQueue.length) continue;
      while (p.fireQueue.length) {
        const fire = p.fireQueue.shift();
        if (this.time - p.lastFireAt < WEAPON.shotInterval * 0.9) continue;
        if (p.reloadT > 0) continue;
        if (p.ammo <= 0) {
          this.startReload(p);
          continue;
        }
        p.ammo--;
        p.lastFireAt = this.time;

        const origin = new Vector3(fire.origin[0], fire.origin[1], fire.origin[2]);
        if (origin.distanceTo(p.state.eye) > 0.75) origin.copy(p.state.eye);
        const dir = new Vector3(fire.dir[0], fire.dir[1], fire.dir[2]).normalize();
        const tick = this.tickForSeq(p, fire.seq);
        const state = this.stateAtTick(tick, p.id);
        const hit = resolveShot(
          this.world.physics,
          origin,
          dir,
          WEAPON.range,
          state,
        );

        let killed = false;
        if (hit.kind === "enemy" && this.enemies) {
          const enemy = this.enemies.byId(hit.id);
          if (enemy && enemy.alive) {
            const dmg =
              WEAPON.damage *
              (hit.part === "weak" ? WEAPON.weakPointMultiplier : 1);
            killed = enemy.damage(dmg, hit.point, dir, hit.part) === true;
          }
        }

        this.bus.emit("weapon:fire", { origin });
        this.event("shot", {
          by: p.id,
          from: [origin.x, origin.y, origin.z],
          to: [hit.point.x, hit.point.y, hit.point.z],
          hit: {
            kind: hit.kind,
            id: hit.id || 0,
            part: hit.part || "body",
            point: [hit.point.x, hit.point.y, hit.point.z],
            normal: [hit.normal.x, hit.normal.y, hit.normal.z],
            surface: hit.surface,
            weak: hit.part === "weak",
            killed,
          },
        });
      }
    }
  }

  damagePlayer(player, amount, from) {
    if (!player.state.alive || player.downed || this.state !== "playing") return;
    if (!(amount > 0)) return;
    player.state.health = Math.max(0, player.state.health - amount);
    this.event("hurt", {
      playerId: player.id,
      amount: Math.round(amount * 10) / 10,
      from: from ? [from.x, from.y, from.z] : null,
    });
    if (player.state.health <= 0) {
      player.downed = true;
      player.downT = MATCH.bleedoutSeconds;
      player.reviveT = 0;
      player.state.enabled = false;
      player.state.vel.set(0, 0, 0);
      this.event("downed", {
        playerId: player.id,
        downT: MATCH.bleedoutSeconds,
      });
      if (
        !this.players.some(
          (p) => p.connected && p.state.alive && !p.downed,
        )
      )
        this.finish(false);
    }
  }

  updateDowned(dt) {
    for (const player of this.players) {
      if (!player.downed) continue;
      player.downT -= dt;
      if (player.downT <= 0) {
        player.downed = false;
        player.state.alive = false;
        player.state.enabled = false;
        this.event("died", { playerId: player.id });
        if (
          !this.players.some(
            (p) => p.connected && p.state.alive && !p.downed,
          )
        )
          this.finish(false);
        continue;
      }
      let rescuer = null;
      for (const other of this.players) {
        if (other === player || !other.connected) continue;
        if (!other.state.alive || other.downed) continue;
        if (!(other.lastBtn & BTN.INTERACT)) continue;
        const d = Math.hypot(
          other.state.pos.x - player.state.pos.x,
          other.state.pos.z - player.state.pos.z,
        );
        if (d > MATCH.reviveRange) continue;
        if (other.state.speed > 0.6) continue;
        if (this.time - other.lastFireAt < 0.2) continue;
        rescuer = other;
        break;
      }
      if (rescuer)
        player.reviveT = Math.min(
          1,
          player.reviveT + dt / MATCH.reviveSeconds,
        );
      else
        player.reviveT = Math.max(
          0,
          player.reviveT -
            (dt / MATCH.reviveSeconds) * MATCH.reviveDecay,
        );
      if (player.reviveT >= 1) {
        player.downed = false;
        player.downT = 0;
        player.reviveT = 0;
        player.state.alive = true;
        player.state.health = MATCH.reviveHealth;
        player.state.enabled = true;
        this.event("revived", {
          playerId: player.id,
          by: rescuer.id,
        });
      }
    }
  }

  updateRelays(dt) {
    if (!this.relays.length) return;
    for (const relay of this.relays) {
      if (relay.cut) continue;
      let interactors = 0;
      let by = 0;
      for (const p of this.players) {
        if (!p.connected || !p.state.alive || p.downed) continue;
        if (!(p.lastBtn & BTN.INTERACT)) continue;
        const dx = relay.pos.x - p.state.pos.x;
        const dz = relay.pos.z - p.state.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > MATCH.interactRange) continue;
        if (Math.abs((relay.pos.y || 0) - p.state.pos.y) > 2.5) continue;
        const f = p.state.forward;
        const fl = Math.hypot(f.x, f.z) || 1;
        if (d > 0.9 && (dx * f.x + dz * f.z) / (d * fl) < MATCH.interactFacing)
          continue;
        interactors++;
        if (!by) by = p.id;
      }
      if (interactors > 0)
        relay.progress = Math.min(
          1,
          relay.progress + (dt / MATCH.cutSeconds) * interactors,
        );
      else
        relay.progress = Math.max(0, relay.progress - dt * MATCH.cutDecay);
      if (relay.progress >= 1) {
        relay.cut = true;
        relay.progress = 1;
        this.cutCount++;
        this.event("relay", {
          id: relay.id,
          progress: 1,
          cut: true,
          by,
        });
        if (this.director) this.director.onCut(this.cutCount - 1);
        if (this.cutCount >= this.relays.length) {
          this.allCut = true;
          this.extractT = 0;
        }
      }
    }
  }

  updateExtraction(dt) {
    if (!this.allCut) {
      this.extractT = 0;
      return;
    }
    const alive = this.players.filter(
      (p) => p.connected && p.state.alive && !p.downed,
    );
    if (!alive.length) {
      this.extractT = 0;
      return;
    }
    const ext = this.world.level.extraction;
    let inside = true;
    for (const p of alive) {
      const d = Math.hypot(
        p.state.pos.x - ext.pos.x,
        p.state.pos.z - ext.pos.z,
      );
      if (d > ext.radius || Math.abs(p.state.pos.y - ext.pos.y) > 3.5) {
        inside = false;
        break;
      }
    }
    this.extractT = inside ? this.extractT + dt : 0;
    if (this.extractT >= MATCH.extractionSeconds) this.finish(true);
  }

  recordHistory() {
    this.history.push({
      tick: this.tick,
      players: this.players
        .filter((p) => p.connected)
        .map((p) => ({
          id: p.id,
          pos: [p.state.pos.x, p.state.pos.y, p.state.pos.z],
          crouch: !!p.state.crouching,
          alive: p.state.alive && !p.downed,
        })),
      enemies: this.liveEnemyState(),
    });
    if (this.history.length > 30) this.history.shift();
  }

  finish(won) {
    if (this.state !== "playing" && this.state !== "countdown") return;
    clearTimeout(this.waitTimer);
    this.waitTimer = null;
    this.state = won ? "won" : "lost";
    this.event("match", { state: this.state });
  }

  event(kind, payload = {}) {
    this.broadcast({ t: "ev", id: this.eventId++, k: kind, ...payload });
  }

  sendSnapshots() {
    for (const p of this.players) {
      if (!p.connected) continue;
      if (p.ws && p.ws.bufferedAmount > 256 * 1024) continue;
      send(p.ws, buildSnapshot(this, p));
    }
  }

  broadcast(msg) {
    for (const p of this.players) if (p.connected) send(p.ws, msg);
  }

  markConnected(player, connected) {
    player.connected = connected;
    if (!connected) player.inputs.length = 0;
    const any = this.players.some((p) => p.connected);
    if (!any) this.emptySince = Date.now();
    else this.emptySince = 0;
    if (!connected && this.state === "playing") {
      this.state = "waiting";
      this.event("peer", {
        state: "left",
        playerId: player.id,
        timeoutMs: MATCH.disconnectGraceSeconds * 1000,
      });
      this.event("match", { state: "waiting" });
      clearTimeout(this.waitTimer);
      this.waitTimer = setTimeout(
        () => this.disband(),
        MATCH.disconnectGraceSeconds * 1000,
      );
    }
  }

  disband() {
    if (this.state === "disbanded" || this.disposed) return;
    this.state = "disbanded";
    this.event("match", { state: "disbanded" });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.waitTimer);
    clearInterval(this.timer);
    if (this.enemies) {
      try {
        this.enemies.clear();
      } catch {}
    }
    this.world.city.dispose();
    this.players.length = 0;
  }
}

export class RoomManager {
  constructor(build = "dev") {
    this.build = build;
    this.rooms = new Map();
    this.sessions = new SessionStore();
    this.cleanupTimer = setInterval(() => this.cleanup(), 10_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  handle(ws) {
    const conn = {
      ws,
      room: null,
      player: null,
      token: null,
      count: 0,
      window: Date.now(),
      malformed: 0,
      helloTimer: setTimeout(() => {
        if (!conn.player) reject(ws, ERROR.MALFORMED, "hello timeout");
      }, 10_000),
    };
    ws.on("message", (raw) => this.onMessage(conn, raw));
    ws.on("close", () => this.onClose(conn));
    ws.on("error", () => this.onClose(conn));
  }

  onMessage(conn, raw) {
    const now = Date.now();
    if (now - conn.window > 1000) {
      conn.window = now;
      conn.count = 0;
    }
    if (++conn.count > MAX_MESSAGES_PER_SECOND) {
      reject(conn.ws, ERROR.MALFORMED, "too many messages");
      return;
    }
    if (raw.length > MAX_MESSAGE_BYTES) {
      reject(conn.ws, ERROR.MALFORMED, "message too large");
      return;
    }

    let msg;
    try {
      msg = decode(raw.toString());
    } catch {
      if (++conn.malformed >= 3) reject(conn.ws, ERROR.MALFORMED, "malformed");
      return;
    }

    let valid;
    try {
      valid = validateClientMessage(msg);
    } catch (err) {
      if (err instanceof ProtocolError) {
        reject(conn.ws, err.code, err.message);
        return;
      }
      if (++conn.malformed >= 3) reject(conn.ws, ERROR.MALFORMED, "malformed");
      return;
    }
    if (!valid) {
      if (++conn.malformed >= 3)
        reject(conn.ws, ERROR.MALFORMED, "malformed");
      return;
    }

    switch (valid.t) {
      case "hello":
        this.onHello(conn, valid);
        break;
      case "ready":
        this.onReady(conn, valid);
        break;
      case "input":
        if (conn.player && conn.player.connected)
          conn.room.onInput(conn.player, valid);
        break;
      case "fire":
        if (conn.player && conn.player.connected)
          conn.room.onFire(conn.player, valid);
        break;
      case "ping":
        send(conn.ws, { t: "pong", ct: valid.ct, st: Date.now() });
        break;
      case "bye":
        conn.ws.close(1000, "bye");
        break;
    }
  }

  onHello(conn, msg) {
    if (conn.player) return;

    if (msg.reconnect) {
      const session = this.sessions.get(msg.reconnect);
      if (session) {
        const room = this.rooms.get(session.roomCode);
        const player = room && room.restorePlayer(session.playerId, conn.ws);
        if (player) {
          this.sessions.touch(msg.reconnect);
          conn.room = room;
          conn.player = player;
          conn.token = msg.reconnect;
          this.sendWelcome(conn, player, room, msg.reconnect, true);
          if (room.state === "playing") {
            room.event("peer", { state: "back", playerId: player.id });
            room.event("match", { state: "playing" });
          }
          return;
        }
      }
    }

    let room = msg.room ? this.rooms.get(msg.room) : this.findOpenRoom();
    if (!room) {
      const code = msg.room || this.uniqueCode();
      room = new Room(code, this);
      this.rooms.set(code, room);
    }
    if (room.players.length >= MAX_PLAYERS) {
      reject(conn.ws, ERROR.ROOM_FULL, "room full");
      return;
    }

    const player = room.addPlayer(conn.ws, msg.build);
    if (!player) {
      reject(conn.ws, ERROR.ROOM_FULL, "room full");
      return;
    }
    const token = this.sessions.create(room.code, player.id);
    conn.room = room;
    conn.player = player;
    conn.token = token;
    clearTimeout(conn.helloTimer);
    this.sendWelcome(conn, player, room, token, false);
  }

  sendWelcome(conn, player, room, token, resumed) {
    send(conn.ws, {
      t: "welcome",
      session: room.code + ":" + player.id,
      token,
      playerId: player.id,
      room: room.code,
      seed: 4207,
      level: "port",
      ruleset: 1,
      tickRate: TICK_RATE,
      snapRate: SNAP_RATE,
      resumed: !!resumed,
    });
    send(conn.ws, {
      t: "world",
      seed: 4207,
      level: "port",
      portHash: room.world.portHash,
    });
    if (resumed && room.state !== "lobby") {
      send(conn.ws, {
        t: "start",
        tick: room.startTick,
        countdownMs: 0,
      });
    }
  }

  onReady(conn, msg) {
    const { room, player } = conn;
    if (!room || !player) return;
    if (
      msg.portHash !== room.world.portHash ||
      msg.cityHash !== room.world.cityHash
    ) {
      reject(conn.ws, ERROR.WORLD_MISMATCH, "world hash mismatch");
      return;
    }
    if (player.ready) return;
    player.ready = true;
    room.maybeStart().catch((err) => {
      console.error("[room] start failed", err);
      reject(conn.ws, ERROR.MALFORMED, "start failed");
    });
  }

  onClose(conn) {
    clearTimeout(conn.helloTimer);
    const { room, player } = conn;
    if (!room || !player) return;
    room.markConnected(player, false);
    // In the lobby, free the slot right away. During play the slot is held
    // for the reconnect grace period by the room state machine.
    if (room.state === "lobby" || room.state === "countdown") {
      room.players = room.players.filter((p) => p !== player);
      if (!room.players.length) this.disposeRoom(room);
      else room.state = "lobby";
    }
  }

  findOpenRoom() {
    for (const room of this.rooms.values()) {
      if (room.state === "lobby" && room.players.length < MAX_PLAYERS)
        return room;
    }
    return null;
  }

  uniqueCode() {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    return code;
  }

  disposeRoom(room) {
    if (!room || room.disposed) return;
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    room.dispose();
  }

  cleanup() {
    this.sessions.cleanup();
    for (const room of [...this.rooms.values()]) {
      if (room.players.length === 0) this.disposeRoom(room);
    }
  }
}