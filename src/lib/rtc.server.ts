import { randomUUID } from "node:crypto";
import { canonicalRoomId, isPublicRoomId } from "../game/constants";

export type RtcPeer = { id: string; name: string; lastSeen: number };
export type RtcSignal = { id: number; from: string; to: string; kind: "offer" | "answer" | "ice"; payload: unknown; createdAt: number };
type Room = {
  peers: Map<string, RtcPeer>;
  signals: RtcSignal[];
  nextSignal: number;
};

const PEER_TTL_MS = 20_000;
const SIGNAL_TTL_MS = 40_000;
const SIGNAL_CAP = 48;

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

export function pollRoom(roomName: string, peerId: string, name: string, since: number) {
  if (!isPublicRoomId(roomName)) {
    return {
      peers: [] as { id: string; name: string }[],
      signals: [] as { id: number; from: string; kind: RtcSignal["kind"]; payload: unknown }[],
    };
  }
  const room = getRoom(canonicalRoomId(roomName));
  const now = Date.now();
  for (const [id, peer] of room.peers) if (now - peer.lastSeen > PEER_TTL_MS) room.peers.delete(id);
  room.peers.set(peerId, { id: peerId, name: name.slice(0, 14) || "Piloto", lastSeen: now });
  if (room.signals.length > SIGNAL_CAP || (room.signals[0] && now - room.signals[0].createdAt > SIGNAL_TTL_MS)) {
    room.signals = room.signals.filter((signal) => now - signal.createdAt < SIGNAL_TTL_MS);
    if (room.signals.length > SIGNAL_CAP) room.signals = room.signals.slice(-SIGNAL_CAP);
  }
  return {
    peers: [...room.peers.values()].map(({ id, name: peerName }) => ({ id, name: peerName })),
    signals: room.signals
      .filter((signal) => signal.id > since && signal.to === peerId)
      .map(({ id, from, kind, payload }) => ({ id, from, kind, payload })),
  };
}

export function addSignal(roomName: string, from: string, to: string, kind: RtcSignal["kind"], payload: unknown) {
  if (!isPublicRoomId(roomName)) return;
  const room = getRoom(canonicalRoomId(roomName));
  if (room.signals.length >= SIGNAL_CAP) room.signals.shift();
  room.signals.push({ id: room.nextSignal++, from, to, kind, payload, createdAt: Date.now() });
}

export function leaveRoom(roomName: string, peerId: string) {
  const room = rooms.get(canonicalRoomId(roomName));
  if (!room) return;
  room.peers.delete(peerId);
  room.signals = room.signals.filter((signal) => signal.from !== peerId && signal.to !== peerId);
  if (!room.peers.size) rooms.delete(roomName);
}

export function newPeerId(): string {
  return randomUUID();
}
