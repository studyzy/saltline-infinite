import WebSocket from "ws";
import { createRoomWorld } from "../../server/world.js";

const world = createRoomWorld();
const url = `ws://localhost:${process.env.PORT || 8731}/ws`;

function client(name, room) {
  const ws = new WebSocket(url);
  let seq = 0;
  let started = false;
  ws.on("open", () => {
    ws.send(JSON.stringify({ t: "hello", v: 1, build: "test", room }));
  });
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.t === "welcome") console.log(name, "welcome", msg.playerId, msg.room);
    if (msg.t === "world") {
      ws.send(
        JSON.stringify({
          t: "ready",
          portHash: world.portHash,
          cityHash: world.cityHash,
        }),
      );
    }
    if (msg.t === "start") {
      started = true;
      console.log(name, "start", msg.countdownMs);
      setTimeout(() => {
        const timer = setInterval(() => {
          seq++;
          ws.send(
            JSON.stringify({
              t: "input",
              seq,
              dt: 1 / 30,
              mx: 0,
              my: 1,
              yaw: 0,
              pitch: 0,
              btn: 0,
              ct: Date.now(),
            }),
          );
        }, 33);
        setTimeout(() => clearInterval(timer), 1200);
      }, 3200);
    }
    if (msg.t === "snap") {
      if (msg.self && msg.self.ack > 0 && started) {
        console.log(name, "snap ack", msg.self.ack, "z", msg.self.pos[2].toFixed(2), "players", msg.players.length);
        started = false;
      }
    }
    if (msg.t === "reject") console.log(name, "reject", msg.code, msg.message);
  });
  ws.on("close", (code) => console.log(name, "close", code));
  return ws;
}

client("A", "ABCDE");
setTimeout(() => client("B", "ABCDE"), 300);
setTimeout(() => process.exit(0), 6500);