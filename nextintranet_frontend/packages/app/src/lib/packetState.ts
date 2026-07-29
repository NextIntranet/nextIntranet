/**
 * Packet lifecycle state (backend: PacketState).
 *
 * `state` is the source of truth; `is_active` is derived from it and kept for
 * backwards compatibility, so prefer reading `state` when it is present.
 */
export type PacketStateValue = "expected" | "stocked" | "in_transit" | "retired"

export const packetStateLabels: Record<PacketStateValue, string> = {
  expected: "Expected",
  stocked: "Stocked",
  in_transit: "In transit",
  retired: "Retired",
}

export interface PacketStateLike {
  state?: string | null
  is_active?: boolean | null
}

export const packetStateOf = (packet: PacketStateLike): PacketStateValue => {
  const state = packet.state as PacketStateValue | undefined | null
  if (state && state in packetStateLabels) {
    return state
  }
  return packet.is_active === false ? "retired" : "stocked"
}

export const packetStateLabel = (packet: PacketStateLike): string =>
  packetStateLabels[packetStateOf(packet)]

/** Packets that are expected or retired are not usable stock yet (or any more). */
export const isPacketExpected = (packet: PacketStateLike): boolean =>
  packetStateOf(packet) === "expected"
