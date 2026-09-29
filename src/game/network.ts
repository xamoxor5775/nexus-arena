import type { WeaponId } from "./types";

export type RemoteSnapshot = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  alive: boolean;
  health: number;
  weapon: WeaponId;
};

type Track = {
  from: RemoteSnapshot;
  to: RemoteSnapshot;
  t: number;
};

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function mix(a: RemoteSnapshot, b: RemoteSnapshot, t: number): RemoteSnapshot {
  const k = Math.min(1, Math.max(0, t));
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    yaw: lerpAngle(a.yaw, b.yaw, k),
    pitch: a.pitch + (b.pitch - a.pitch) * k,
    alive: b.alive,
    health: b.health,
    weapon: b.weapon,
  };
}

/** Snapshot buffer with short lerp so remote players don't teleport every packet. */
export class RemoteSync {
  private tracks = new Map<string, Track>();
  constructor(private duration = 0.1) {}

  ingest(id: string, snapshot: RemoteSnapshot) {
    const cur = this.tracks.get(id);
    this.tracks.set(id, {
      from: cur ? mix(cur.from, cur.to, cur.t) : snapshot,
      to: snapshot,
      t: 0,
    });
  }

  sample(id: string, dt: number): RemoteSnapshot | null {
    const track = this.tracks.get(id);
    if (!track) return null;
    track.t = Math.min(1, track.t + dt / this.duration);
    return mix(track.from, track.to, track.t);
  }

  latest(id: string): RemoteSnapshot | null {
    return this.tracks.get(id)?.to ?? null;
  }

  remove(id: string) {
    this.tracks.delete(id);
  }
}

export function localSnapshot(player: {
  pos: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  alive: boolean;
  health: number;
  weapon: WeaponId;
}): RemoteSnapshot {
  return {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z,
    yaw: player.yaw,
    pitch: player.pitch,
    alive: player.alive,
    health: player.health,
    weapon: player.weapon,
  };
}
