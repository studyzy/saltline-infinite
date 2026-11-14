import test from "node:test";
import assert from "node:assert/strict";
import {
  BTN,
  PROTOCOL_VERSION,
  ERROR,
  ProtocolError,
  encode,
  decode,
  validateHello,
  validateInput,
  validateFire,
  validateClientMessage,
} from "../../shared/protocol.js";

test("hello rejects a different protocol version", () => {
  assert.throws(
    () => validateHello({ t: "hello", v: PROTOCOL_VERSION + 1 }),
    (err) => err instanceof ProtocolError && err.code === ERROR.VERSION,
  );
});

test("input is clamped and the move axis is normalised", () => {
  const input = validateInput({
    t: "input",
    seq: 5,
    dt: 0.2,
    mx: 3,
    my: 4,
    yaw: 1,
    pitch: 9,
    btn: BTN.SPRINT | BTN.JUMP,
    ct: 10,
  });
  assert.ok(input);
  assert.equal(input.dt, 0.1);
  assert.ok(Math.abs(Math.hypot(input.mx, input.my) - 1) < 1e-9);
  assert.ok(input.pitch <= 1.5);
  assert.equal(input.btn & BTN.SPRINT, BTN.SPRINT);
});

test("input rejects non-finite values and bad sequence numbers", () => {
  assert.equal(
    validateInput({ t: "input", seq: 1, dt: 0.03, mx: NaN, my: 0, yaw: 0, pitch: 0 }),
    null,
  );
  assert.equal(
    validateInput({ t: "input", seq: -1, dt: 0.03, mx: 0, my: 0, yaw: 0, pitch: 0 }),
    null,
  );
});

test("fire direction is normalised and an empty direction is rejected", () => {
  const fire = validateFire({
    t: "fire",
    seq: 3,
    origin: [0, 1, 0],
    dir: [0, 0, -9],
    ct: 1,
  });
  assert.ok(fire);
  assert.ok(Math.abs(fire.dir[2] + 1) < 1e-9);
  assert.equal(
    validateFire({ t: "fire", seq: 3, origin: [0, 1, 0], dir: [0, 0, 0] }),
    null,
  );
});

test("encode/decode round-trips and rejects unknown types", () => {
  const raw = encode({ t: "ping", ct: 12.5 });
  assert.deepEqual(decode(raw), { t: "ping", ct: 12.5 });
  assert.equal(validateClientMessage({ t: "wat" }), null);
});

test("decode rejects malformed and oversized frames", () => {
  assert.throws(() => decode("{"));
  assert.throws(() => decode(JSON.stringify({ t: "input", pad: "x".repeat(70000) })));
});