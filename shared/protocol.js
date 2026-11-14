// Wire protocol for the co-op server. JSON in a versioned envelope; every
// real-time message carries its own ordering key (seq / tick / id) so the
// semantics survive a move to an unreliable transport later.

import { MOVE } from "./constants.js";

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 64 * 1024;
const utf8 = new TextEncoder();

function byteLength(str) {
  return utf8.encode(str).length;
}
export const MAX_MESSAGES_PER_SECOND = 120;
export const MAX_FIRE_ORIGIN_ERROR = 0.75;

export const ERROR = {
  VERSION: 4001,
  ROOM_FULL: 4002,
  WORLD_MISMATCH: 4003,
  MALFORMED: 4004,
};

export const BTN = {
  ADS: 1,
  SPRINT: 2,
  CROUCH: 4,
  JUMP: 8,
  RELOAD: 16,
  MEDKIT: 32,
  INTERACT: 64,
};

const ALL_BUTTONS =
  BTN.ADS | BTN.SPRINT | BTN.CROUCH | BTN.JUMP | BTN.RELOAD | BTN.MEDKIT | BTN.INTERACT;

export class ProtocolError extends Error {
  constructor(message, code = ERROR.MALFORMED) {
    super(message);
    this.code = code;
  }
}

function finite(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

function validVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every(finite);
}

function validHash(h) {
  return typeof h === "string" && /^[0-9a-f]{8}$/.test(h);
}

export function validateHello(msg) {
  if (!msg || msg.t !== "hello") return null;
  if (msg.v !== PROTOCOL_VERSION) {
    throw new ProtocolError("protocol version mismatch", ERROR.VERSION);
  }
  const out = {
    t: "hello",
    v: PROTOCOL_VERSION,
    build: typeof msg.build === "string" ? msg.build.slice(0, 64) : "dev",
  };
  if (typeof msg.room === "string" && /^[A-Z0-9]{5}$/.test(msg.room))
    out.room = msg.room;
  if (typeof msg.reconnect === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(msg.reconnect))
    out.reconnect = msg.reconnect;
  return out;
}

export function validateReady(msg) {
  if (!msg || msg.t !== "ready") return null;
  if (!validHash(msg.portHash) || !validHash(msg.cityHash)) return null;
  return { t: "ready", portHash: msg.portHash, cityHash: msg.cityHash };
}

export function validateInput(msg) {
  if (!msg || msg.t !== "input") return null;
  if (!Number.isInteger(msg.seq) || msg.seq <= 0 || msg.seq > 0x7fffffff)
    return null;
  if (!finite(msg.dt)) return null;
  if (!finite(msg.mx) || !finite(msg.my)) return null;
  if (!finite(msg.yaw) || !finite(msg.pitch)) return null;

  let mx = clamp(msg.mx, -1, 1);
  let my = clamp(msg.my, -1, 1);
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }

  const btn = Number.isInteger(msg.btn) ? msg.btn & ALL_BUTTONS : 0;
  return {
    t: "input",
    seq: msg.seq,
    dt: clamp(msg.dt, 0, 0.1),
    mx,
    my,
    yaw: msg.yaw,
    pitch: clamp(msg.pitch, -MOVE.pitchLimit, MOVE.pitchLimit),
    btn,
    ct: finite(msg.ct) ? msg.ct : 0,
  };
}

export function validateFire(msg) {
  if (!msg || msg.t !== "fire") return null;
  if (!Number.isInteger(msg.seq) || msg.seq <= 0) return null;
  if (!validVec3(msg.origin) || !validVec3(msg.dir)) return null;
  const len = Math.hypot(msg.dir[0], msg.dir[1], msg.dir[2]);
  if (len < 1e-6) return null;
  return {
    t: "fire",
    seq: msg.seq,
    origin: [msg.origin[0], msg.origin[1], msg.origin[2]],
    dir: [msg.dir[0] / len, msg.dir[1] / len, msg.dir[2] / len],
    ct: finite(msg.ct) ? msg.ct : 0,
  };
}

export function validatePing(msg) {
  if (!msg || msg.t !== "ping" || !finite(msg.ct)) return null;
  return { t: "ping", ct: msg.ct };
}

export function validateClientMessage(msg) {
  switch (msg && msg.t) {
    case "hello":
      return validateHello(msg);
    case "ready":
      return validateReady(msg);
    case "input":
      return validateInput(msg);
    case "fire":
      return validateFire(msg);
    case "ping":
      return validatePing(msg);
    case "bye":
      return { t: "bye" };
    default:
      return null;
  }
}

export function encode(msg) {
  const raw = JSON.stringify(msg);
  if (byteLength(raw) > MAX_MESSAGE_BYTES)
    throw new ProtocolError("message too large");
  return raw;
}

export function decode(raw) {
  if (typeof raw !== "string") throw new ProtocolError("binary frame unsupported");
  if (byteLength(raw) > MAX_MESSAGE_BYTES)
    throw new ProtocolError("message too large");
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    throw new ProtocolError("invalid json");
  }
  if (!msg || typeof msg !== "object" || typeof msg.t !== "string")
    throw new ProtocolError("missing type");
  return msg;
}

export function has(msg, bit) {
  return (msg.btn & bit) !== 0;
}

export function inputCommand(input, firing = false) {
  return {
    mx: input.mx,
    my: input.my,
    yaw: input.yaw,
    pitch: input.pitch,
    sprint: has(input, BTN.SPRINT),
    crouch: has(input, BTN.CROUCH),
    jumpPressed: has(input, BTN.JUMP),
    fire: !!firing,
    ads: has(input, BTN.ADS),
  };
}