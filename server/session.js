// Short-lived reconnect tokens. A token is bound to one room slot and lives
// for the disconnect grace period.

import crypto from "node:crypto";

export const RECONNECT_TTL_MS = 90_000;

export class SessionStore {
  constructor() {
    this.map = new Map();
  }

  create(roomCode, playerId) {
    const token = crypto.randomBytes(18).toString("base64url");
    this.map.set(token, {
      roomCode,
      playerId,
      expires: Date.now() + RECONNECT_TTL_MS,
    });
    return token;
  }

  get(token) {
    if (!token) return null;
    const s = this.map.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) {
      this.map.delete(token);
      return null;
    }
    return s;
  }

  touch(token) {
    const s = this.map.get(token);
    if (s) s.expires = Date.now() + RECONNECT_TTL_MS;
  }

  remove(token) {
    this.map.delete(token);
  }

  cleanup() {
    const now = Date.now();
    for (const [token, s] of this.map)
      if (s.expires < now) this.map.delete(token);
  }
}