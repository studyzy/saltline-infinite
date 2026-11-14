// Per-recipient snapshot encoding. M2 fills players and match state; enemies,
// drops and relays are added by the later milestones.

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

function pos(v) {
  return [r3(v.x), r3(v.y), r3(v.z)];
}

function playerState(p) {
  if (p.downed) return "downed";
  return p.state.alive ? "alive" : "dead";
}

function selfView(player) {
  const s = player.state;
  return {
    pos: pos(s.pos),
    vel: pos(s.vel),
    yaw: r3(s.yaw),
    pitch: r3(s.pitch),
    hp: Math.round(s.health),
    state: playerState(player),
    med: player.medkits || 0,
    ammo: player.ammo ?? 0,
    reserve: player.reserve ?? 0,
    reload: r3(player.reloadT || 0),
    onGround: !!s.onGround,
    crouch: !!s.crouching,
    ads: r3(s.ads),
    downT: r3(player.downT || 0),
    revive: r3(player.reviveT || 0),
    ack: player.lastAck,
  };
}

function otherView(player) {
  const s = player.state;
  return {
    id: player.id,
    pos: pos(s.pos),
    vel: pos(s.vel),
    yaw: r3(s.yaw),
    pitch: r3(s.pitch),
    hp: Math.round(s.health),
    state: playerState(player),
    crouch: !!s.crouching,
    downT: r3(player.downT || 0),
    revive: r3(player.reviveT || 0),
  };
}

export function buildSnapshot(room, player) {
  return {
    t: "snap",
    tick: room.tick,
    st: r3(room.time),
    ack: player.lastAck,
    self: selfView(player),
    players: room.players
      .filter((p) => p !== player && p.connected)
      .map(otherView),
    enemies: room.enemySnapshot ? room.enemySnapshot() : [],
    drops: room.dropSnapshot ? room.dropSnapshot(player) : [],
    relays: room.relaySnapshot ? room.relaySnapshot() : [],
    match: {
      state: room.state,
      time: r3(room.time),
      threat: r3(room.threat || 0),
      extract: r3(room.extractT || 0),
    },
  };
}