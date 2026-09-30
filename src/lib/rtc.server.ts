import { randomUUID } from "node:crypto";
import {
  MAX_OVERFLOW_ROOMS,
  baseRoomId,
  canonicalRoomId,
  isPublicRoomId,
  overflowRoomId,
  roomCapacity,
} from "../game/constants.ts";

export type RtcPeer = { id: string; name: string; lastSeen: number; joinedAt: number };
export type RtcSignal = { id: number; from: string; to: string; kind: "offer" | "answer" | "ice"; payload: unknown; createdAt: number };
type Room = {
  peers: Map<string, RtcPeer>;
  signals: RtcSignal[];
  nextSignal: number;
};

const PEER_TTL_MS = 20_000;
const SIGNAL_TTL_MS = 40_000;
/**
 * Whole-room backstop (was 48). An 8-peer full mesh negotiating at once is 28
 * pairs x (offer/answer + ICE both ways) ≈ 600 signals kept for SIGNAL_TTL_MS;
 * the per-recipient cap below is the real bound (8 x 96 < 1024).
 */
export const SIGNAL_CAP = 1024;
/** Pending signals per recipient, so one noisy pair cannot evict everyone else's SDP. */
export const SIGNAL_CAP_PER_PEER = 96;

const state = globalThis as typeof globalThis & { __nexusRtcRooms__?: Map<string, Room> };
state.__nexusRtcRooms__ ??= new Map();
const rooms = state.__nexusRtcRooms__;

function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (!room) {
    room = { peers: new Map(), signals: [], nextSignal: 1 };
    rooms.set(name, room);
  }
  return room;
}

function expirePeers(room: Room, now: number) {
  for (const [id, peer] of room.peers) if (now - peer.lastSeen > PEER_TTL_MS) room.peers.delete(id);
}

/** Live peers in a room without mutating it (used to pick an overflow room). */
function livePeerCount(name: string, now: number): number {
  const room = rooms.get(name);
  if (!room) return 0;
  let n = 0;
  for (const peer of room.peers.values()) if (now - peer.lastSeen <= PEER_TTL_MS) n++;
  return n;
}

/** First room of the same family (base, -2, -3, …) with a free slot, other than `full`. */
export function suggestRoom(full: string, now = Date.now()): string | null {
  const base = baseRoomId(full);
  if (!base) return null;
  for (let index = 1; index <= MAX_OVERFLOW_ROOMS + 1; index++) {
    const candidate = overflowRoomId(base, index);
    if (candidate === full) continue;
    if (livePeerCount(candidate, now) < roomCapacity(candidate)) return candidate;
  }
  return null;
}

/** Earliest-joined live peer: the room host for arena-cycle sync. */
function hostOf(room: Room): string | undefined {
  let host: RtcPeer | undefined;
  for (const peer of room.peers.values()) if (!host || peer.joinedAt < host.joinedAt) host = peer;
  return host?.id;
}

export type RtcPollResult =
  | {
      peers: { id: string; name: string }[];
      signals: { id: number; from: string; kind: RtcSignal["kind"]; payload: unknown }[];
      hostId?: string;
      capacity?: number;
      full?: false;
      /** Set only for the fixed dev room: the room actually joined. */
      room?: string;
      dev?: true;
    }
  | { full: true; room: string; capacity: number; suggestedRoom: string | null; peers: []; signals: [] };

/**
 * `dev: true` = the fixed tester room (see dev-room.ts). The caller has already
 * routed the peer there, so it is joined without cap/overflow; `roomName` is the
 * dev room id, not a public room.
 */
export type RoomAccess = { dev?: boolean };

function roomKey(roomName: string, access?: RoomAccess): string | null {
  if (access?.dev) return roomName || null;
  return isPublicRoomId(roomName) ? canonicalRoomId(roomName) : null;
}

export function pollRoom(roomName: string, peerId: string, name: string, since: number, access?: RoomAccess): RtcPollResult {
  const roomId = roomKey(roomName, access);
  if (!roomId) {
    return { peers: [], signals: [] };
  }
  const dev = Boolean(access?.dev);
  const room = getRoom(roomId);
  const now = Date.now();
  expirePeers(room, now);
  const existing = room.peers.get(peerId);
  const capacity = roomCapacity(roomId);
  if (!dev && !existing && room.peers.size >= capacity) {
    // Never kick anyone already inside: the newcomer is sent to an overflow room.
    return { full: true, room: roomId, capacity, suggestedRoom: suggestRoom(roomId, now), peers: [], signals: [] };
  }
  room.peers.set(peerId, { id: peerId, name: name.slice(0, 14) || "Piloto", lastSeen: now, joinedAt: existing?.joinedAt ?? now });
  if (room.signals.length > SIGNAL_CAP || (room.signals[0] && now - room.signals[0].createdAt > SIGNAL_TTL_MS)) {
    room.signals = room.signals.filter((signal) => now - signal.createdAt < SIGNAL_TTL_MS);
    if (room.signals.length > SIGNAL_CAP) room.signals = room.signals.slice(-SIGNAL_CAP);
  }
  return {
    peers: [...room.peers.values()].map(({ id, name: peerName }) => ({ id, name: peerName })),
    signals: room.signals
      .filter((signal) => signal.id > since && signal.to === peerId)
      .map(({ id, from, kind, payload }) => ({ id, from, kind, payload })),
    hostId: hostOf(room),
    ...(dev ? { room: roomId, dev: true as const } : { capacity }),
  };
}

export function addSignal(roomName: string, from: string, to: string, kind: RtcSignal["kind"], payload: unknown, access?: RoomAccess) {
  const roomId = roomKey(roomName, access);
  if (!roomId) return;
  const room = getRoom(roomId);
  let forPeer = 0;
  for (const signal of room.signals) if (signal.to === to) forPeer++;
  if (forPeer >= SIGNAL_CAP_PER_PEER) {
    const oldest = room.signals.findIndex((signal) => signal.to === to);
    if (oldest >= 0) room.signals.splice(oldest, 1);
  }
  if (room.signals.length >= SIGNAL_CAP) room.signals.shift();
  room.signals.push({ id: room.nextSignal++, from, to, kind, payload, createdAt: Date.now() });
}

export function leaveRoom(roomName: string, peerId: string, access?: RoomAccess) {
  const roomId = roomKey(roomName, access);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  room.signals = room.signals.filter((signal) => signal.from !== peerId && signal.to !== peerId);
  if (!room.peers.size) rooms.delete(roomId);
}

export function newPeerId(): string {
  return randomUUID();
}
