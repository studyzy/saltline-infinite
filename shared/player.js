// Shared player movement. This is the simulation subset of x_() in game.js:
// look angles, crouch, sprint, acceleration, jump, gravity and capsule
// collision. Health, recoil, camera bob and footsteps stay on the client; the
// server owns health and uses this step for movement.

import { Vector3, Euler } from "./three.js";
import { MOVE, VIEW, PHYSICS } from "./constants.js";

const JUMP_SPEED = Math.sqrt(2 * MOVE.gravity * MOVE.jumpApex);
const UP = Math.PI * 2;

function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createPlayerState(init = {}) {
  const pos = init.pos
    ? new Vector3(init.pos.x, init.pos.y, init.pos.z)
    : new Vector3();
  const state = {
    pos,
    vel: new Vector3(),
    eye: new Vector3(),
    forward: new Vector3(0, 0, -1),
    yaw: init.yaw || 0,
    pitch: 0,
    health: init.health ?? 100,
    maxHealth: init.maxHealth ?? 100,
    alive: init.alive !== false,
    enabled: init.enabled !== false,
    onGround: true,
    sprinting: false,
    crouching: false,
    ads: 0,
    speed: 0,
    coyote: 0,
    jumpBuffer: 0,
    airTime: 0,
    fallSpeed: 0,
    stepPhase: 0,
    surface: "concrete",
    lastSafe: pos.clone(),
  };
  state.eye.set(pos.x, pos.y + VIEW.eye, pos.z);
  return state;
}

export function canStand(physics, state) {
  const boxes = physics && physics.boxes;
  if (!boxes) return true;
  const r = VIEW.radius * 0.9;
  const low = state.pos.y + MOVE.crouchHeight - 0.05;
  const high = state.pos.y + MOVE.standHeight;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.bulletOnly) continue;
    if (
      state.pos.x + r < b.min.x ||
      state.pos.x - r > b.max.x ||
      state.pos.z + r < b.min.z ||
      state.pos.z - r > b.max.z
    )
      continue;
    if (b.min.y < high && b.max.y > low) return false;
  }
  return true;
}

export function step(state, cmd, dt, physics) {
  const events = [];
  if (!state.alive || !state.enabled || dt <= 0) return events;

  if (typeof cmd.yaw === "number" && Number.isFinite(cmd.yaw))
    state.yaw = cmd.yaw;
  if (typeof cmd.pitch === "number" && Number.isFinite(cmd.pitch))
    state.pitch = clamp(cmd.pitch, -MOVE.pitchLimit, MOVE.pitchLimit);
  if (state.yaw > UP * 2 || state.yaw < -UP * 2) state.yaw %= UP;

  state.ads = damp(state.ads, cmd.ads ? 1 : 0, 14, dt);

  if (cmd.crouch) state.crouching = true;
  else if (state.crouching && canStand(physics, state)) state.crouching = false;

  const height = state.crouching ? MOVE.crouchHeight : MOVE.standHeight;
  const mx = clamp(cmd.mx || 0, -1, 1);
  const my = clamp(cmd.my || 0, -1, 1);
  const moving = mx * mx + my * my > 0.01;

  const wantSprint =
    !!cmd.sprint &&
    my > 0.55 &&
    Math.abs(mx) < 0.6 &&
    !state.crouching &&
    state.ads < 0.35 &&
    !cmd.fire;

  state.sprinting =
    (wantSprint && state.onGround && state.speed > MOVE.walk * 0.6) ||
    (wantSprint && !state.onGround && state.sprinting);

  let targetSpeed = MOVE.walk;
  if (state.crouching) targetSpeed = MOVE.crouch;
  else if (wantSprint || state.sprinting) targetSpeed = MOVE.sprint;
  targetSpeed = lerp(targetSpeed, Math.min(targetSpeed, MOVE.ads), state.ads);
  if (my < 0) targetSpeed *= lerp(1, 0.82, -my);

  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);
  const wishX = (mx * cosY - my * sinY) * targetSpeed;
  const wishZ = (-mx * sinY - my * cosY) * targetSpeed;

  const accel = state.onGround
    ? moving
      ? MOVE.accelGround
      : MOVE.decelGround
    : moving
      ? MOVE.accelAir
      : 0.6;

  let dx = wishX - state.vel.x;
  let dz = wishZ - state.vel.z;
  if (!state.onGround && !moving) {
    dx = -state.vel.x;
    dz = -state.vel.z;
  }
  const dlen = Math.hypot(dx, dz);
  const maxDelta = accel * dt;
  if (dlen <= maxDelta || dlen < 1e-6) {
    if (state.onGround || moving) {
      state.vel.x = wishX;
      state.vel.z = wishZ;
    }
  } else {
    state.vel.x += (dx / dlen) * maxDelta;
    state.vel.z += (dz / dlen) * maxDelta;
  }

  state.coyote = state.onGround
    ? MOVE.coyote
    : Math.max(0, state.coyote - dt);
  state.jumpBuffer = cmd.jumpPressed
    ? MOVE.jumpBuffer
    : Math.max(0, state.jumpBuffer - dt);

  if (
    state.jumpBuffer > 0 &&
    state.coyote > 0 &&
    (!state.crouching || canStand(physics, state))
  ) {
    state.vel.y = JUMP_SPEED;
    state.jumpBuffer = 0;
    state.coyote = 0;
    state.onGround = false;
    state.crouching = false;
    events.push({ kind: "jump" });
  }

  state.vel.y -= MOVE.gravity * dt * 0.5;
  if (state.vel.y < -40) state.vel.y = -40;

  const landingVy = state.vel.y;
  const hit = physics.moveCapsule(
    state.pos,
    state.vel,
    dt,
    VIEW.radius,
    height,
    state.onGround,
  ) || {};

  if (!hit.onGround) state.vel.y -= MOVE.gravity * dt * 0.5;

  const bounds = physics.bounds;
  if (bounds) {
    state.pos.x = clamp(state.pos.x, bounds.min.x + 0.4, bounds.max.x - 0.4);
    state.pos.z = clamp(state.pos.z, bounds.min.z + 0.4, bounds.max.z - 0.4);
  }

  state.onGround = !!hit.onGround;
  if (hit.surface) state.surface = hit.surface;

  if (state.onGround) {
    if (state.airTime > 0.12) {
      const impact = Math.max(0, -landingVy, state.fallSpeed);
      events.push({
        kind: "land",
        speed: impact,
        surface: state.surface,
      });
    }
    state.airTime = 0;
    state.fallSpeed = 0;
    if (
      state.pos.x <= PHYSICS.quayX - 1.2 &&
      state.pos.y > -0.5
    )
      state.lastSafe.copy(state.pos);
  } else {
    state.airTime += dt;
    state.fallSpeed = Math.max(state.fallSpeed, -state.vel.y);
  }

  if (state.pos.y < PHYSICS.seaY - 2.2) {
    state.pos.copy(state.lastSafe);
    state.vel.set(0, 0, 0);
    state.onGround = true;
    state.airTime = 0;
    state.fallSpeed = 0;
    state.yaw += Math.PI;
    state.pitch = 0;
    events.push({ kind: "seaRescue" });
  }

  state.speed = Math.hypot(state.vel.x, state.vel.z);

  const stride = state.crouching
    ? MOVE.stride.crouch
    : state.sprinting
      ? MOVE.stride.sprint
      : MOVE.stride.walk;
  if (state.onGround && state.speed > 0.5) {
    const before = state.stepPhase;
    state.stepPhase += (state.speed * dt) / stride;
    if (Math.floor(state.stepPhase) > Math.floor(before))
      events.push({
        kind: "step",
        surface: state.surface,
        sprint: state.sprinting,
      });
  } else if (state.onGround) {
    state.stepPhase = damp(state.stepPhase, Math.round(state.stepPhase), 8, dt);
  }

  state.eye.set(
    state.pos.x,
    state.pos.y + (state.crouching ? VIEW.crouchEye : VIEW.eye),
    state.pos.z,
  );
  state.forward
    .set(0, 0, -1)
    .applyEuler(new Euler(state.pitch, state.yaw, 0, "YXZ"));

  return events;
}

export function applyServerCorrection(state, snapshot) {
  if (!snapshot) return;
  if (snapshot.pos) state.pos.set(snapshot.pos[0], snapshot.pos[1], snapshot.pos[2]);
  if (snapshot.vel) state.vel.set(snapshot.vel[0], snapshot.vel[1], snapshot.vel[2]);
  if (typeof snapshot.hp === "number") state.health = snapshot.hp;
  if (typeof snapshot.state === "string") state.alive = snapshot.state !== "dead";
  if (typeof snapshot.onGround === "boolean") state.onGround = snapshot.onGround;
  if (typeof snapshot.crouch === "boolean") state.crouching = snapshot.crouch;
  state.speed = Math.hypot(state.vel.x, state.vel.z);
}