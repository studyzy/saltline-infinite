// End-to-end check of the co-op endpoint over the public URL.
//
//   node tools/probe-ws.mjs [wss://host/shoot/ws]
//
// Connects, sends the handshake the game sends, and waits for the authority's
// `welcome`. That proves three things at once: DNS/TLS, Caddy's /shoot/ws
// proxy, and the Node authority actually running the current build. Exit 0 on
// success. It also pins the shape of the welcome: this host runs another game
// on the root path /ws, and a probe that only checks "some welcome arrived"
// would happily pass while the page talks to the wrong server.
import { PROTOCOL_VERSION } from "../shared/protocol.js";

const url = process.argv[2] || "wss://124.221.164.209/shoot/ws";
const ws = new WebSocket(url);
let done = false;
const finish = (code, note) => {
  if (done) return;
  done = true;
  console.log(`${code === 0 ? "ok  " : "FAIL"}  ${url}  ${note}`);
  try { ws.close(); } catch {}
  process.exit(code);
};
const timer = setTimeout(() => finish(1, "no reply within 8 s"), 8000);

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, build: "probe" }));
});
ws.addEventListener("message", (ev) => {
  let msg;
  try { msg = JSON.parse(String(ev.data)); } catch { return finish(1, "non-JSON reply"); }
  if (msg.t !== "welcome") return finish(1, `unexpected first message: ${msg.t}`);
  // Saltline's welcome is flat and carries room/playerId; the other app on this
  // host answers with {t, d:{matchId, seat, ...}} and would leave the page
  // stuck on "connecting", so treat that as a routing failure.
  if (msg.matchId !== undefined || msg.room === undefined || msg.playerId === undefined)
    return finish(1, `wrong endpoint: got ${JSON.stringify(msg).slice(0, 120)}`);
  const d = msg;
  clearTimeout(timer);
  // Tokens are what a real client reconnects with, so report them, but do not
  // hard-fail on a tokenless welcome: that happens on the odd first connection
  // to a freshly restarted authority and is not a deploy problem.
  finish(0, `room ${d.room} player ${d.playerId} seed ${d.seed}`);
});
ws.addEventListener("error", () => finish(1, "connection error"));
ws.addEventListener("close", (ev) => finish(1, `closed ${ev.code} ${ev.reason || ""}`));