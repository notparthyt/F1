import { randomInt } from "node:crypto";

const lobbyIdsByCode = new Map<string, string>();

export function registerLobby(roomId: string): string {
  let code: string;
  do {
    code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  } while (lobbyIdsByCode.has(code));

  lobbyIdsByCode.set(code, roomId);
  return code;
}

export function findLobbyRoom(code: string): string | undefined {
  return lobbyIdsByCode.get(code);
}

export function unregisterLobby(code: string): void {
  lobbyIdsByCode.delete(code);
}
