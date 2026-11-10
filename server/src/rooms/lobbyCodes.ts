import { randomInt } from "node:crypto";

const lobbiesByCode = new Map<string, { roomId: string; circuit: string }>();

export function registerLobby(roomId: string, circuit: string): string {
  let code: string;
  do {
    code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  } while (lobbiesByCode.has(code));

  lobbiesByCode.set(code, { roomId, circuit });
  return code;
}

export function findLobbyRoom(code: string): string | undefined {
  return lobbiesByCode.get(code)?.roomId;
}

export function findLobbyCircuit(code: string): string | undefined {
  return lobbiesByCode.get(code)?.circuit;
}

export function unregisterLobby(code: string): void {
  lobbiesByCode.delete(code);
}
