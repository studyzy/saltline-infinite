import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import WebSocket from "ws";
import { createRoomWorld } from "../../server/world.js";

const ROOT = new URL("../..", import.meta.url).pathname;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("server did not start")), 15000);
    child.stdout.on("data", (buf) => {
      out += buf.toString();
      if (out.includes("Saltline server on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (buf) => {
      const s = buf.toString();
      if (s.trim()) console.error("[server]", s.trim());
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("server exited " + code));
    });
  });
}

function client(port, room) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const state = {
    ws,
    welcome: null,
    snaps: [],
    events: [],
    started: false,
    closed: false,
    seq: 0,
  };
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.t === "welcome") state.welcome = msg;
    if (msg.t === "start") state.started = true;
    if (msg.t === "snap") state.snaps.push(msg);
    if (msg.t === "ev") state.events.push(msg);
    if (msg.t === "reject") state.reject = msg;
  });
  ws.on("close", () => {
    state.closed = true;
  });
  return state;
}

function open(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

test("two clients join, move, and see each other", async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const world = createRoomWorld();
  const a = client(port, "TST01");
  const b = client(port, "TST01");
  t.after(() => {
    a.ws.close();
    b.ws.close();
  });

  await Promise.all([open(a.ws), open(b.ws)]);
  send(a.ws, { t: "hello", v: 1, build: "test", room: "TST01" });
  send(b.ws, { t: "hello", v: 1, build: "test", room: "TST01" });

  await new Promise((r) => setTimeout(r, 200));
  assert.ok(a.welcome && b.welcome);
  assert.notEqual(a.welcome.playerId, b.welcome.playerId);

  for (const c of [a, b])
    send(c.ws, {
      t: "ready",
      portHash: world.portHash,
      cityHash: world.cityHash,
    });

  await new Promise((r) => {
    const timer = setInterval(() => {
      if (a.started && b.started) {
        clearInterval(timer);
        r();
      }
    }, 50);
    setTimeout(() => {
      clearInterval(timer);
      r();
    }, 5000);
  });
  assert.equal(a.started, true);
  assert.equal(b.started, true);

  // Movement starts after the three-second countdown.
  await new Promise((r) => setTimeout(r, 3300));
  for (let i = 0; i < 30; i++) {
    a.seq++;
    send(a.ws, {
      t: "input",
      seq: a.seq,
      dt: 1 / 30,
      mx: 1,
      my: 0,
      yaw: 0,
      pitch: 0,
      btn: 0,
      ct: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 33));
  }
  await new Promise((r) => setTimeout(r, 500));

  const lastA = a.snaps[a.snaps.length - 1];
  const lastB = b.snaps[b.snaps.length - 1];
  assert.ok(lastA && lastB);
  assert.ok(lastA.enemies.length >= 1, "patrol enemies exist");
  assert.ok(lastA.enemies.some((e) => e.type === "gull"));
  assert.ok(lastA.enemies.some((e) => e.type === "hound"));
  assert.ok(lastA.ack >= 20, `ack ${lastA.ack}`);
  assert.ok(lastB.players.length >= 1);
  const seen = lastB.players[0];
  const self = lastA.self;
  assert.ok(Math.abs(seen.pos[0] - self.pos[0]) < 0.3);
  assert.ok(Math.abs(seen.pos[2] - self.pos[2]) < 0.3);
  // The player actually moved from the spawn point.
  assert.ok(Math.abs(self.pos[0] + 32) > 0.5, `x=${self.pos[0]}`);

  // Fire at the first visible enemy. The exact hit is geometry-dependent; the
  // point of this check is that the authoritative fire path runs and answers.
  const enemy = lastA.enemies[0];
  const ox = self.pos[0];
  const oy = self.pos[1] + 1.68;
  const oz = self.pos[2];
  const dx = enemy.pos[0] - ox;
  const dy = enemy.pos[1] + 0.8 - oy;
  const dz = enemy.pos[2] - oz;
  const len = Math.hypot(dx, dy, dz) || 1;
  send(a.ws, {
    t: "fire",
    seq: a.seq,
    origin: [ox, oy, oz],
    dir: [dx / len, dy / len, dz / len],
    ct: Date.now(),
  });
  await new Promise((r) => setTimeout(r, 400));
  const shot = a.events.find((e) => e.k === "shot");
  assert.ok(shot, "server answered a fire event");
  assert.ok(
    shot.hit.kind === "world" ||
      shot.hit.kind === "enemy" ||
      shot.hit.kind === "none",
  );
  const afterFire = a.snaps[a.snaps.length - 1];
  assert.ok(afterFire.self.ammo < 30, `ammo ${afterFire.self.ammo}`);
});