// Authoritative room: handshake, 30 Hz simulation, 20 Hz snapshots.

import crypto from "node:crypto";
import { createRoomWorld } from "./world.js";
import { SessionStore } from "./session.js";
import { buildSnapshot } from "./snapshot.js";
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
    this.timer = setInterval(() => this.step(), 1000 / TICK_RATE);
    if (this.timer.unref) this.timer.unref();
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

  maybeStart() {
    if (this.state !== "lobby") return;
    if (this.players.length !== MAX_PLAYERS) return;
    if (!this.players.every((p) => p.ready && p.connected)) return;
    this.state = "countdown";
    this.time = 0;
    this.startTick = this.tick + Math.round(MATCH.countdownSeconds * TICK_RATE);
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
      for (const p of this.players) if (p.connected) this.drainInputs(p);
      const foci = this.players
        .filter((p) => p.connected)
        .map((p) => p.state.pos);
      if (foci.length) {
        this.world.city.update(0, foci);
        this.world.city.flush();
      }
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
      const firing = Date.now() - player.lastFireAt < 250;
      step(
        player.state,
        inputCommand(input, firing),
        input.dt,
        this.world.physics,
      );
      player.lastAck = Math.max(player.lastAck, input.seq);
      player.seqToTick.set(input.seq, this.tick);
      if (player.seqToTick.size > 120) {
        const first = player.seqToTick.keys().next().value;
        player.seqToTick.delete(first);
      }
    }
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
      this.state = "disbanded";
      this.broadcast({
        t: "ev",
        id: this.eventId++,
        k: "match",
        state: "disbanded",
      });
    }
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
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
    room.maybeStart();
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