// Browser side of the co-op connection: handshake, input uplink, snapshot
// downlink and the bridge into the existing game modules.

import {
  PROTOCOL_VERSION,
  BTN,
  encode,
  decode,
} from "../../shared/protocol.js";
import { Vector3 } from "../../shared/three.js";
import { computeWorldHashes } from "./world-hash.js";
import { Prediction } from "./prediction.js";
import { Interpolator } from "./interpolation.js";
import { Drops } from "./drops.js";
import { NetUI } from "./ui.js";

const TOKEN_KEY = "saltline.mp.session.v1";
const INPUT_HZ = 30;

export class NetClient {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.active = false;
    this.started = false;
    this.room = "";
    this.playerId = 0;
    this.token = "";
    this.prediction = new Prediction(game);
    this.interp = new Interpolator(game);
    this.drops = new Drops(game);
    this.ui = new NetUI(this);
    this.seq = 0;
    this.sendAcc = 0;
    this.pingAcc = 0;
    this.pending = 0;
    this.rtt = 0;
    this.lastSnap = null;
    try {
      this.lagMs = Math.max(
        0,
        Number(new URLSearchParams(location.search).get("netlag")) || 0,
      );
    } catch {
      this.lagMs = 0;
    }
  }

  openUI() {
    this.ui.show();
  }

  connect(roomCode) {
    this.intentional = false;
    this.reconnectTries = this.reconnectTries || 0;
    clearTimeout(this.reconnectTimer);
    this.disconnect();
    this.intentional = false;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      const hello = { t: "hello", v: PROTOCOL_VERSION, build: "dev" };
      if (roomCode) hello.room = roomCode;
      try {
        const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
        if (saved && saved.token && (!roomCode || saved.room === roomCode))
          hello.reconnect = saved.token;
      } catch {}
      this.send(hello);
    });
    ws.addEventListener("message", (ev) => {
      if (this.ws !== ws) return;
      this.onMessage(ev.data);
    });
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.onClose();
    });
    ws.addEventListener("error", () => {
      if (this.ws !== ws) return;
      this.onClose();
    });
  }

  disconnect() {
    this.intentional = true;
    clearTimeout(this.startTimer);
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close(1000, "bye");
      } catch {}
    }
    this.ws = null;
    this.active = false;
    this.prediction.reset();
    this.interp.reset();
    this.drops.reset();
  }

  onMessage(raw) {
    if (this.lagMs) {
      setTimeout(() => this.handleMessage(raw), this.lagMs);
      return;
    }
    this.handleMessage(raw);
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = decode(typeof raw === "string" ? raw : "");
    } catch {
      return;
    }
    switch (msg.t) {
      case "welcome":
        this.token = msg.token || "";
        this.playerId = msg.playerId || 0;
        this.room = msg.room || "";
        this.resumed = !!msg.resumed;
        this.reconnectTries = 0;
        try {
          sessionStorage.setItem(
            TOKEN_KEY,
            JSON.stringify({ token: this.token, room: this.room }),
          );
        } catch {}
        this.ui.setRoom(this.room);
        break;
      case "world": {
        const { portHash, cityHash } = computeWorldHashes(this.game);
        this.send({ t: "ready", portHash, cityHash });
        this.ui.setStatus("mp_waiting");
        break;
      }
      case "start": {
        const delay = Math.max(0, Number(msg.countdownMs) || 0);
        this.ui.setStatus("mp_ready");
        clearTimeout(this.startTimer);
        this.startTimer = setTimeout(() => {
          if (this.ws && this.ws.readyState === 1) this.beginMatch();
        }, delay);
        break;
      }
      case "snap":
        this.lastSnap = msg;
        this.prediction.onSnapshot(msg.self);
        this.interp.push(msg);
        this.drops.apply(msg.drops);
        this.spectate = msg.self.state === "dead";
        this.ui.updateHud(msg);
        if (this.game.weapon && this.game.weapon.setNetworkState)
          this.game.weapon.setNetworkState({
            ammo: msg.self.ammo,
            reserve: msg.self.reserve,
          });
        break;
      case "ev":
        this.onEvent(msg);
        break;
      case "pong":
        this.rtt = Math.max(0, Date.now() - msg.ct);
        break;
      case "reject":
        this.ui.error(msg.code);
        this.active = false;
        break;
    }
  }

  beginMatch() {
    if (this.started) {
      this.active = true;
      this.ui.hide();
      this.ui.clearNotice();
      this.ui.showHud();
      if (this.game.game && this.game.game.state === "paused")
        try {
          this.game.game.resume();
        } catch {}
      return;
    }
    this.started = true;
    this.active = true;
    this.spectate = false;
    this.reconnectTries = 0;
    this.prediction.reset();
    this.interp.reset();
    this.drops.reset();
    this.ui.clearHud();
    this.ui.showHud();
    try {
      this.game.audio && this.game.audio.resume && this.game.audio.resume();
    } catch {}
    try {
      this.game.game.startMultiplayer();
    } catch (err) {
      console.error("[mp] start failed", err);
    }
    try {
      this.game.input.requestLock && this.game.input.requestLock();
    } catch {}
    this.ui.hide();
  }

  onEvent(msg) {
    const { k, id, t, ...payload } = msg;
    switch (k) {
      case "enemyDown":
        if (this.game.enemies && this.game.enemies.killRemote)
          this.game.enemies.killRemote(payload.id);
        this.game.events.emit("enemy:killed", {
          type: payload.type,
          pos: payload.pos ? new Vector3(...payload.pos) : null,
        });
        break;
      case "telegraph":
        this.game.events.emit("enemy:telegraph", {
          type: payload.type,
          time: payload.time,
          melee: payload.melee,
          pos: payload.pos ? new Vector3(...payload.pos) : null,
        });
        break;
      case "melee":
        this.game.events.emit("enemy:melee", {
          pos: payload.pos ? new Vector3(...payload.pos) : null,
        });
        break;
      case "alert":
        this.game.events.emit("enemy:alert", {
          type: payload.type,
          pos: payload.pos ? new Vector3(...payload.pos) : null,
        });
        break;
      case "enemyFire":
        this.game.events.emit("enemy:fire", {
          type: payload.type,
          pos: payload.pos ? new Vector3(...payload.pos) : null,
        });
        break;
      case "shot":
        this.onShot(payload);
        break;
      case "drop":
        this.drops.apply([payload]);
        break;
      case "dropTaken":
        this.drops.remove(payload.id);
        break;
      case "hurt":
        if (payload.playerId === this.playerId) {
          const p = this.game.player;
          if (p && p.addShake) p.addShake(0.2 + (payload.amount || 0) / 70);
          this.game.events.emit("player:hit", {
            amount: payload.amount,
            fromPos: payload.from ? new Vector3(...payload.from) : null,
          });
        }
        break;
      case "downed":
        if (payload.playerId === this.playerId)
          this.ui.notice("mp_revive_wait");
        else this.ui.notice("mp_team_downed");
        break;
      case "revived":
        this.ui.clearNotice();
        break;
      case "died":
        if (payload.playerId === this.playerId) {
          this.spectate = true;
          this.ui.notice("mp_spectate");
        }
        break;
      case "peer":
        if (payload.state === "left") this.ui.notice("mp_peer_left");
        else if (payload.state === "back") this.ui.clearNotice();
        break;
      case "match":
        if (payload.state === "won" || payload.state === "lost") {
          this.active = false;
          this.ui.clearHud();
          this.ui.hideHud();
          if (this.game.game && this.game.game.multiplayerEnd)
            this.game.game.multiplayerEnd(payload.state === "won");
        } else if (payload.state === "waiting") {
          this.waiting = true;
          this.active = false;
          try {
            this.game.game && this.game.game.pause && this.game.game.pause();
          } catch {}
          this.ui.notice("mp_peer_left");
        } else if (payload.state === "playing") {
          if (this.waiting) {
            this.waiting = false;
            this.active = true;
            try {
              this.game.game && this.game.game.resume && this.game.game.resume();
            } catch {}
            this.ui.clearNotice();
          }
        } else if (payload.state === "disbanded") {
          this.intentional = true;
          this.active = false;
          if (this.ui.connectBtn) this.ui.connectBtn.disabled = false;
          this.ui.setStatus("mp_err_closed", null, "error");
          this.ui.show();
        }
        break;
    }
    this.game.events.emit(k, payload);
  }

  onShot(payload) {
    const self = payload.by === this.playerId;
    const hit = payload.hit || {};
    if (self && hit.kind === "enemy") {
      this.game.events.emit("player:hitEnemy", {
        killed: !!hit.killed,
        weak: !!hit.weak,
        part: hit.part,
      });
      this.game.events.emit("impact", {
        point: new Vector3(...hit.point),
        normal: new Vector3(...(hit.normal || [0, 0, 0])),
        surface: "enemy",
        enemy: {},
        part: hit.part,
        from: "player",
      });
    } else if (self && hit.kind === "world") {
      this.game.events.emit("impact", {
        point: new Vector3(...hit.point),
        normal: new Vector3(...(hit.normal || [0, 0, 0])),
        surface: hit.surface,
        enemy: null,
        from: "player",
      });
    }
    if (!self && this.game.fx && this.game.fx.tracer) {
      try {
        this.game.fx.tracer(
          new Vector3(...payload.from),
          new Vector3(...payload.to),
        );
      } catch {}
    }
  }

  sendFire(origin, dir) {
    if (!this.active) return false;
    return this.send({
      t: "fire",
      seq: this.seq || 1,
      origin: [origin.x, origin.y, origin.z],
      dir: [dir.x, dir.y, dir.z],
      ct: Date.now(),
    });
  }

  update(dt) {
    if (!this.active || !this.ws || this.ws.readyState !== 1) return;
    this.interp.update(dt);
    this.netAcc = (this.netAcc || 0) + dt;
    if (this.netAcc >= 1) {
      this.netAcc = 0;
      const rtt = this.rtt || 0;
      this.ui.setNet(rtt, rtt > 200 ? "bad" : rtt > 90 ? "warn" : "ok");
    }

    if (this.spectate && this.lastSnap && this.lastSnap.players[0]) {
      const p = this.lastSnap.players[0];
      const cam = this.game.camera;
      if (cam) {
        cam.position.set(p.pos[0], p.pos[1] + 1.62, p.pos[2]);
        cam.rotation.set(p.pitch || 0, p.yaw || 0, 0, "YXZ");
      }
      return;
    }

    const input = this.game.input;
    if (!input) return;
    if (!input.locked && !input.touch) return;
    if (this.game.game && this.game.game.state !== "playing") return;

    if (input.pressed("jump")) this.pending |= BTN.JUMP;
    if (input.pressed("reload")) this.pending |= BTN.RELOAD;
    if (input.pressed("heal")) this.pending |= BTN.MEDKIT;

    this.sendAcc += dt;
    if (this.sendAcc < 1 / INPUT_HZ) return;
    const stepDt = Math.min(0.1, this.sendAcc);
    this.sendAcc = 0;

    let btn = this.pending;
    if (input.ads) btn |= BTN.ADS;
    if (input.sprint) btn |= BTN.SPRINT;
    if (input.crouch) btn |= BTN.CROUCH;
    if (input.down && input.down("interact")) btn |= BTN.INTERACT;
    this.pending &= ~(BTN.JUMP | BTN.RELOAD | BTN.MEDKIT);

    const player = this.game.player;
    this.seq++;
    const packet = {
      t: "input",
      seq: this.seq,
      dt: stepDt,
      mx: input.move ? input.move.x : 0,
      my: input.move ? input.move.y : 0,
      yaw: player ? player.yaw : 0,
      pitch: player ? player.pitch : 0,
      btn,
      ct: Date.now(),
    };
    if (this.send(packet)) this.prediction.record(packet);

    this.pingAcc += dt;
    if (this.pingAcc >= 1) {
      this.pingAcc = 0;
      this.send({ t: "ping", ct: Date.now() });
    }
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const ws = this.ws;
    const write = () => {
      if (ws.readyState !== 1) return;
      try {
        ws.send(encode(msg));
      } catch {}
    };
    if (this.lagMs) setTimeout(write, this.lagMs);
    else write();
    return true;
  }

  onClose() {
    if (!this.ws) return;
    this.ws = null;
    this.active = false;
    clearTimeout(this.startTimer);
    if (this.ui.connectBtn) this.ui.connectBtn.disabled = false;
    if (this.ui.root && this.ui.root.hidden)
      this.ui.setStatus("mp_err_closed", null, "error");
    if (!this.intentional && this.started && this.room) {
      if (!this.reconnectTries) {
        this.reconnectTries = 1;
        this.ui.notice("mp_peer_left");
        try {
          this.game.game && this.game.game.pause && this.game.game.pause();
        } catch {}
        this.reconnectTimer = setTimeout(() => this.connect(this.room), 2000);
      }
    }
  }
}