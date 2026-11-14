// Browser side of the co-op connection: handshake, input uplink, snapshot
// downlink and the bridge into the existing game modules.

import {
  PROTOCOL_VERSION,
  BTN,
  encode,
  decode,
} from "../../shared/protocol.js";
import { computeWorldHashes } from "./world-hash.js";
import { Prediction } from "./prediction.js";
import { Interpolator } from "./interpolation.js";
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
    this.ui = new NetUI(this);
    this.seq = 0;
    this.sendAcc = 0;
    this.pingAcc = 0;
    this.pending = 0;
    this.rtt = 0;
    this.lastSnap = null;
  }

  openUI() {
    this.ui.show();
  }

  connect(roomCode) {
    this.disconnect();
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
    ws.addEventListener("message", (ev) => this.onMessage(ev.data));
    ws.addEventListener("close", () => this.onClose());
    ws.addEventListener("error", () => this.onClose());
  }

  disconnect() {
    clearTimeout(this.startTimer);
    if (this.ws) {
      try {
        this.ws.close(1000, "bye");
      } catch {}
    }
    this.ws = null;
    this.active = false;
    this.prediction.reset();
    this.interp.reset();
  }

  onMessage(raw) {
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
      return;
    }
    this.started = true;
    this.active = true;
    this.prediction.reset();
    this.interp.reset();
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
    if (k === "match" && payload.state === "disbanded") {
      this.active = false;
      this.ui.setStatus("mp_err_closed", null, "error");
      this.ui.show();
    }
    this.game.events.emit(k, payload);
  }

  update(dt) {
    if (!this.active || !this.ws || this.ws.readyState !== 1) return;
    this.interp.update();

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
    try {
      this.ws.send(encode(msg));
      return true;
    } catch {
      return false;
    }
  }

  onClose() {
    if (!this.ws) return;
    this.ws = null;
    this.active = false;
    clearTimeout(this.startTimer);
    if (this.ui.connectBtn) this.ui.connectBtn.disabled = false;
    if (this.ui.root && this.ui.root.hidden)
      this.ui.setStatus("mp_err_closed", null, "error");
  }
}