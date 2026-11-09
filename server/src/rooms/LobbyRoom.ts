import { Client, CloseCode, Room } from "colyseus";
import { airDensityAtAltitude, createCar, fitTires, FIXED_DT, isCarCriticallyDamaged, newErsLap, step, TIRE_COMPOUNDS } from "../../../src/physics.mjs";
import { captureHandlingBaseline, applyHandlingMode as applyCarHandlingMode } from "../../../src/handling.mjs";
import { RACE_DEFAULTS, resolveCarContact, wakeStrength } from "../../../src/race.mjs";
import { ON_FOOT_EMOTES, onFootSpawn } from "../../../src/onfoot.mjs";
import { CIRCUITS } from "../../../src/circuits.mjs";
import { createCircuitTrack } from "../../../src/circuit.mjs";
import { createStadiumTrack } from "../../../src/track.mjs";
import { CIRCUIT_PIT_CONFIGS, CIRCUIT_PIT_LAYOUTS, CIRCUIT_PIT_SIDES, CIRCUIT_PIT_TUNNELS } from "../../../src/pitconfig.mjs";
import { createAutopilot, createCircuitAutopilot } from "../../../src/autopilot.mjs";
import { createWeather } from "../../../src/weather.mjs";
import {
  CIRCUIT_ALTITUDES,
  CIRCUIT_ELEVATION_PROFILES,
  CIRCUIT_TRACK_STYLE,
  NIGHT_CIRCUITS,
  startingTyreForTrack,
  weatherOptionsForTrack,
} from "../../../src/trackdata.mjs";
import { LobbyPlayer, LobbyState, RacePlayer, type LobbySettings } from "./LobbyState.js";
import { registerLobby, unregisterLobby } from "./lobbyCodes.js";

const MAX_PLAYERS = 22;
const MAX_NAME_LENGTH = 24;
const DRIVER_SUIT_COUNT = 9;
const PIT_BOX_PROGRESS_TOLERANCE = 4.5;
const ROOM_TICK_MS = 1000 / 30;
const QUALIFYING_SECONDS = 60;
const INPUT_STALE_MS = 500;
const STALE_INPUT_BRAKE = 0.18;
const ALLOWED_CIRCUITS = new Set([
  "", "singapore", "buddh", "nurburgring", "bahrain", "shanghai", "catalunya",
  "monaco", "montreal", "red-bull-ring", "silverstone", "hungaroring", "spa",
  "monza", "cota", "mexico", "interlagos", "yas-marina", "imola", "zandvoort",
  "jeddah", "miami",
]);

type PlayerAuth = { identity: string; name: string };
type LobbyOptions = {
  identity?: unknown;
  name?: unknown;
  settings?: unknown;
};
type DriverInput = {
  throttle: number;
  brake: number;
  steer: number;
  reverse?: boolean;
  drs?: boolean;
  ers?: boolean;
  ersMode?: "off" | "normal" | "overtake";
};
type HandlingMode = "sim" | "arcade";
type HandlingBaseline = ReturnType<typeof captureHandlingBaseline>[number];
type ServerCar = ReturnType<typeof createCar>;
type ServerPit = {
  entry: number;
  exit: number;
  limitStart: number;
  limitEnd: number;
  mergeStart?: number;
  mergeLength?: number;
  boxStart: number;
  boxSpacing: number;
  boxOffset: number;
  lane: number;
  side: number;
  inner: number;
  outer: number;
  speedLimit: number;
  tunnel?: { start: number; end: number } | null;
  laneOffsetAt?: (s: number) => number;
  isOnRouteAt?: (x: number, y: number, s: number) => boolean;
};
type PitDrive = (
  car: ServerCar,
  options: { offset: number | ((s: number) => number); maxSpeed: number; grip: number },
) => DriverInput;
type RaceDriver = {
  sessionId: string;
  gridSlot: number;
  car: ServerCar;
  handlingMode: HandlingMode;
  handlingBaseline: HandlingBaseline;
  input: DriverInput;
  autoPit: boolean;
  pitRequest: keyof typeof TIRE_COMPOUNDS | null;
  pitPhase: "in" | "service" | "out" | null;
  pitBox: number;
  pitFrom: number;
  pitServiceRemaining: number;
  pitDrive: PitDrive;
  compoundsUsed: Set<string>;
  sequence: number;
  lastInputAt: number;
  lastProgress: number;
  covered: number;
  outside: boolean;
  warnings: number;
  penaltySeconds: number;
  finished: boolean;
  retired: boolean;
  disqualified: boolean;
  finishTime: number;
  lastLapAt: number;
  bestLapTime: number;
  contactCooldowns: Map<string, number>;
  safetyCarPassed: Set<string>;
  pendingSafetyCarPass: { otherSessionId: string; until: number; decision: "yield" | null } | null;
  avatarX: number;
  avatarY: number;
  avatarHeading: number;
  avatarSuit: number;
  avatarEmote: string;
  avatarMoving: boolean;
  onFoot: boolean;
  lastAvatarAt: number;
};
type ServerTrack = {
  kind: "circuit" | "stadium";
  altitudeMetres: number;
  halfStraight?: number;
  length: number;
  roadWidth: number;
  offset(x: number, y: number): number;
  pit: ServerPit | null;
  signed?: (s: number) => number;
  lineOffset?: (s: number) => number;
  progress(x: number, y: number): number;
  locate(x: number, y: number): { progress: number; offset: number };
  point(s: number, offset?: number): [number, number];
  heightAt?(s: number): number;
  heading(s: number): number;
  surfaceAt(x: number, y: number): number;
  barrierAt(x: number, y: number): { depth: number; nx: number; ny: number } | null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function createServerTrack(circuit: string): ServerTrack {
  if (circuit) {
    const key = circuit as keyof typeof CIRCUITS;
    const layout = CIRCUIT_PIT_LAYOUTS[key as keyof typeof CIRCUIT_PIT_LAYOUTS];
    const tunnel = CIRCUIT_PIT_TUNNELS[key as keyof typeof CIRCUIT_PIT_TUNNELS];
    const track = createCircuitTrack({
      ...CIRCUITS[key],
      ...CIRCUIT_TRACK_STYLE[key as keyof typeof CIRCUIT_TRACK_STYLE],
      pitSide: CIRCUIT_PIT_SIDES[key as keyof typeof CIRCUIT_PIT_SIDES],
      pitTunnel: (tunnel || layout?.tunnel) && {
        depth: 5.5,
        ...tunnel,
        ...layout?.tunnel,
      },
      pitConfig: {
        ...CIRCUITS[key].pitConfig,
        ...CIRCUIT_PIT_CONFIGS[key as keyof typeof CIRCUIT_PIT_CONFIGS],
        ...layout?.lane,
      },
      elevationProfile: CIRCUIT_ELEVATION_PROFILES[key as keyof typeof CIRCUIT_ELEVATION_PROFILES],
      altitudeMetres: CIRCUIT_ALTITUDES[key as keyof typeof CIRCUIT_ALTITUDES] ?? 0,
      night: NIGHT_CIRCUITS.has(circuit),
    });
    const circuitPoint = track.point;
    return Object.assign(track, {
      kind: "circuit" as const,
      altitudeMetres: track.altitudeMetres,
      point: (s: number, offset = 0): [number, number] => {
        const [x, y] = circuitPoint(s, offset);
        return [x, y];
      },
    });
  }
  const halfStraight = 220;
  const radius = 90;
  const straight = halfStraight * 2;
  const arc = Math.PI * radius;
  const length = 2 * straight + 2 * arc;
  const stadium = createStadiumTrack({ halfStraight, radius, roadWidth: 15 });
  const wrap = (s: number) => ((s % length) + length) % length;
  const point = (s: number, offset = 0): [number, number] => {
    s = wrap(s);
    if (s < straight) return [-halfStraight + s, -radius - offset];
    if (s < straight + arc) {
      const angle = (s - straight) / radius;
      return [halfStraight + Math.sin(angle) * (radius + offset), -Math.cos(angle) * (radius + offset)];
    }
    if (s < 2 * straight + arc) return [halfStraight - (s - straight - arc), radius + offset];
    const angle = (s - 2 * straight - arc) / radius;
    return [-halfStraight - Math.sin(angle) * (radius + offset), Math.cos(angle) * (radius + offset)];
  };
  const heading = (s: number): number => {
    s = wrap(s);
    if (s < straight) return 0;
    if (s < straight + arc) return (s - straight) / radius;
    if (s < 2 * straight + arc) return Math.PI;
    return Math.PI + (s - 2 * straight - arc) / radius;
  };
  return Object.assign(stadium, {
    kind: "stadium" as const,
    altitudeMetres: 0,
    point,
    heading,
    locate: (x: number, y: number) => ({ progress: stadium.progress(x, y), offset: stadium.offset(x, y) }),
  });
}

function gridPosition(track: ServerTrack, slot: number): { x: number; y: number; heading: number } {
  const lane = slot === 0 ? 0 : (slot % 2 ? -1 : 1) * 2.6;
  const progress = track.kind === "circuit"
    ? track.length - 0.8 - slot * 10
    : (track.halfStraight ?? 0) - slot * 10;
  const [x, y] = track.point(progress, lane);
  return { x, y, heading: track.heading(progress) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePlayer(options: LobbyOptions): PlayerAuth {
  const identity = typeof options.identity === "string" ? options.identity.trim() : "";
  const name = typeof options.name === "string"
    ? options.name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH)
    : "";

  if (!/^[\w.:-]{8,128}$/.test(identity)) {
    throw new Error("A valid player identity is required.");
  }
  if (!name) {
    throw new Error("Enter a player name.");
  }
  return { identity, name };
}

export function normalizeLobbySettings(value: unknown): LobbySettings {
  if (!isRecord(value)) {
    throw new Error("Lobby settings are invalid.");
  }
  const circuit = value.circuit;
  const laps = value.laps;
  const mode = value.mode;
  if (typeof circuit !== "string" || !ALLOWED_CIRCUITS.has(circuit)) {
    throw new Error("Choose a supported circuit.");
  }
  if (typeof laps !== "number" || !Number.isInteger(laps) || laps < 3 || laps > 99) {
    throw new Error("Choose between 3 and 99 laps.");
  }
  if (mode !== "casual" && mode !== "competitive") {
    throw new Error("Choose casual or competitive mode.");
  }
  for (const key of ["qualifying", "retirements", "penalties"] as const) {
    if (typeof value[key] !== "boolean") {
      throw new Error("Lobby settings are invalid.");
    }
  }
  return {
    circuit,
    laps,
    mode,
    qualifying: value.qualifying,
    retirements: value.retirements,
    penalties: value.penalties,
  } as LobbySettings;
}

function uniquePlayerName(name: string, existingNames: Iterable<string>): string {
  const usedNames = new Set(Array.from(existingNames, existing => existing.toLowerCase()));
  if (!usedNames.has(name.toLowerCase())) {
    return name;
  }
  for (let suffix = 1; suffix <= MAX_PLAYERS; suffix++) {
    const tag = ` (${suffix})`;
    const candidate = `${name.slice(0, MAX_NAME_LENGTH - tag.length)}${tag}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  throw new Error("Could not assign a unique player name.");
}

export class LobbyRoom extends Room<{ state: LobbyState }> {
  maxClients = MAX_PLAYERS;
  state = new LobbyState();

  private readonly identityBySession = new Map<string, string>();
  private readonly bannedIdentities = new Set<string>();
  private readonly drivers = new Map<string, RaceDriver>();
  private raceTrack: ServerTrack | null = null;
  private qualifyingElapsed = 0;
  private qualifyingComplete = false;
  private raceElapsed = 0;
  private weather = createWeather();
  private yellowFlagUntil = 0;
  private safetyCarProgress: number | null = null;
  private readonly safetyCarSpeed = 28;
  private virtualSafetyCar = false;
  private lastVirtualSafetyCarAt = -Infinity;
  private readonly virtualSafetyCarDuration = RACE_DEFAULTS.vscDuration;
  private readonly virtualSafetyCarSpeed = RACE_DEFAULTS.vscSpeed;

  async onCreate(options: LobbyOptions): Promise<void> {
    const settings = normalizeLobbySettings(options.settings ?? {
      circuit: "",
      laps: 10,
      mode: "casual",
      qualifying: true,
      retirements: true,
      penalties: true,
    });
    this.state.code = registerLobby(this.roomId);
    this.state.hostSessionId = "";
    this.state.status = "lobby";
    this.state.phase = "lobby";
    Object.assign(this.state.settings, settings);
    this.state.settingsReady = true;
    await this.setPrivate(true);

    this.onMessage("lobby:kick", (client, message: unknown) => this.moderate(client, message, false));
    this.onMessage("lobby:ban", (client, message: unknown) => this.moderate(client, message, true));
    this.onMessage("lobby:start", client => this.startRace(client));
    this.onMessage("race:force-grid", client => this.forceGrid(client));
    this.onMessage("race:input", (client, message: unknown) => this.receiveInput(client, message));
    this.onMessage("race:pit-request", (client, message: unknown) => this.receivePitRequest(client, message));
    this.onMessage("race:safety-car-choice", (client, message: unknown) => this.receiveSafetyCarChoice(client, message));
    this.onMessage("race:avatar", (client, message: unknown) => this.receiveAvatarState(client, message));
  }

  onAuth(_client: Client, options: LobbyOptions): PlayerAuth {
    const player = normalizePlayer(options);
    if (Array.from(this.identityBySession.values()).includes(player.identity)) {
      throw new Error("This player is already in the lobby.");
    }
    if (this.bannedIdentities.has(player.identity)) {
      throw new Error("You are banned from this lobby.");
    }
    if (this.state.status !== "lobby") {
      throw new Error("This lobby is no longer accepting players.");
    }
    return player;
  }

  onJoin(client: Client, _options: LobbyOptions, auth: PlayerAuth): void {
    const name = uniquePlayerName(auth.name, Array.from(this.state.players.values(), player => player.name));
    const player = new LobbyPlayer();
    player.name = name;
    player.isHost = this.state.players.size === 0;
    this.state.players.set(client.sessionId, player);
    this.identityBySession.set(client.sessionId, auth.identity);

    if (player.isHost) {
      this.state.hostSessionId = client.sessionId;
    }
  }

  onLeave(client: Client, _code: CloseCode): void {
    this.state.players.delete(client.sessionId);
    this.identityBySession.delete(client.sessionId);

    const driver = this.drivers.get(client.sessionId);
    if (driver) {
      driver.retired = true;
      driver.input = { throttle: 0, brake: 1, steer: 0 };
      const state = this.state.racePlayers.get(client.sessionId);
      if (state) state.retired = true;
    }

    if (this.state.status === "lobby" && this.state.hostSessionId === client.sessionId) {
      const nextHostSessionId = this.state.players.keys().next().value ?? "";
      this.state.hostSessionId = nextHostSessionId;
      for (const [sessionId, player] of this.state.players) {
        player.isHost = sessionId === nextHostSessionId;
      }
    }
  }

  onDispose(): void {
    unregisterLobby(this.state.code);
  }

  private moderate(client: Client, message: unknown, ban: boolean): void {
    if (client.sessionId !== this.state.hostSessionId || this.state.status !== "lobby") {
      client.send("lobby:error", { message: "Only the host can moderate this lobby." });
      return;
    }
    const targetSessionId = isRecord(message) && typeof message.sessionId === "string"
      ? message.sessionId
      : "";
    const target = this.clients.find(candidate => candidate.sessionId === targetSessionId);
    if (!target || target.sessionId === this.state.hostSessionId) {
      client.send("lobby:error", { message: "That player cannot be removed." });
      return;
    }

    const identity = this.identityBySession.get(target.sessionId);
    if (ban && identity) {
      this.bannedIdentities.add(identity);
    }
    target.send("lobby:kicked", { banned: ban });
    void target.leave(4000);
  }

  private startRace(client: Client): void {
    if (client.sessionId !== this.state.hostSessionId) {
      client.send("lobby:error", { message: "Only the host can start the lobby." });
      return;
    }
    if (this.state.players.size < 2) {
      client.send("lobby:error", { message: "At least two players are required." });
      return;
    }
    if (this.state.status !== "lobby") {
      client.send("lobby:error", { message: "This lobby has already started." });
      return;
    }

    this.state.status = "starting";
    this.state.phase = "boarding";
    this.state.raceTime = 0;
    this.state.countdown = 0;
    this.raceElapsed = 0;
    this.qualifyingElapsed = 0;
    this.qualifyingComplete = false;
    this.initializeRace();
    this.setSimulationInterval(() => this.tickRace(), ROOM_TICK_MS);
    this.broadcast("lobby:started", {
      settings: this.state.settings.toJSON(),
      players: this.state.players.size,
    });
  }

  private forceGrid(client: Client): void {
    const host = this.drivers.get(this.state.hostSessionId);
    if (client.sessionId !== this.state.hostSessionId || this.state.phase !== "boarding") {
      client.send("lobby:error", { message: "Only the host can start the race from the grid." });
      return;
    }
    if (!host || host.onFoot) {
      client.send("lobby:error", { message: "Enter your car before starting the race." });
      return;
    }
    for (const driver of this.drivers.values()) {
      driver.onFoot = false;
      driver.avatarMoving = false;
      driver.avatarEmote = "";
      const player = this.state.racePlayers.get(driver.sessionId);
      this.publishDriver(driver, player);
    }
    this.beginCountdown(false);
  }

  private initializeRace(): void {
    const circuit = this.state.settings.circuit;
    this.raceTrack = createServerTrack(circuit);
    this.weather = createWeather({ options: weatherOptionsForTrack(circuit) });
    this.yellowFlagUntil = 0;
    this.safetyCarProgress = null;
    this.virtualSafetyCar = false;
    this.lastVirtualSafetyCarAt = -Infinity;
    this.state.yellowFlag = false;
    this.state.yellowFlagRemaining = 0;
    this.state.safetyCarProgress = -1;
    this.state.safetyCarSpeed = this.safetyCarSpeed;
    this.publishWeather();
    this.drivers.clear();
    this.state.racePlayers.clear();
    let gridIndex = 0;
    for (const [sessionId, lobbyPlayer] of this.state.players) {
      const car = createCar({ altitudeMetres: this.raceTrack.altitudeMetres });
      const slot = gridIndex++;
      Object.assign(car, gridPosition(this.raceTrack, slot));
      car.fuel = this.state.settings.qualifying ? null : this.raceFuelLoad();
      fitTires(car, this.state.settings.qualifying ? "soft" : startingTyreForTrack(circuit));
      const avatar = onFootSpawn(car);
      const driver: RaceDriver = {
        sessionId,
        gridSlot: slot,
        car,
        handlingMode: "arcade",
        handlingBaseline: captureHandlingBaseline([{ car }])[0],
        input: { throttle: 0, brake: 1, steer: 0 },
        autoPit: true,
        pitRequest: null,
        pitPhase: null,
        pitBox: 0,
        pitFrom: 0,
        pitServiceRemaining: 0,
        pitDrive: this.raceTrack.kind === "circuit"
          ? createCircuitAutopilot(this.raceTrack, { ersPlan: false })
          : ((drive) => (car, options) => drive(car, {
            ...options,
            offset: typeof options.offset === "function"
              ? options.offset(this.raceTrack!.progress(car.x, car.y))
              : options.offset,
          }))(createAutopilot({ halfStraight: this.raceTrack.halfStraight ?? 220, radius: 90 })),
        compoundsUsed: new Set([car.compound]),
        sequence: -1,
        lastInputAt: 0,
        lastProgress: this.raceTrack.progress(car.x, car.y),
        covered: 0,
        outside: false,
        warnings: 0,
        penaltySeconds: 0,
        finished: false,
        retired: false,
        disqualified: false,
        finishTime: 0,
        lastLapAt: 0,
        bestLapTime: Number.POSITIVE_INFINITY,
        contactCooldowns: new Map(),
        safetyCarPassed: new Set(),
        pendingSafetyCarPass: null,
        avatarX: avatar.player.x,
        avatarY: avatar.player.y,
        avatarHeading: avatar.heading,
        avatarSuit: (slot + 1) % DRIVER_SUIT_COUNT,
        avatarEmote: "",
        avatarMoving: false,
        onFoot: true,
        lastAvatarAt: 0,
      };
      applyCarHandlingMode([{ car }], driver.handlingMode, [driver.handlingBaseline]);
      this.drivers.set(sessionId, driver);
      const racePlayer = new RacePlayer();
      racePlayer.name = lobbyPlayer.name;
      racePlayer.isHost = lobbyPlayer.isHost;
      this.state.racePlayers.set(sessionId, racePlayer);
      this.publishDriver(driver, racePlayer);
    }
    this.updateStandings();
  }

  private receiveInput(client: Client, message: unknown): void {
    const driver = this.drivers.get(client.sessionId);
    if (!driver || driver.retired || !["qualifying", "racing"].includes(this.state.phase)) return;
    if (!isRecord(message) || !Number.isSafeInteger(message.sequence) || (message.sequence as number) <= driver.sequence) return;
    const now = Date.now();
    if (now - driver.lastInputAt < 10) return;
    const read = (key: string, min: number, max: number): number => {
      const value = message[key];
      return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : 0;
    };
    driver.sequence = message.sequence as number;
    driver.lastInputAt = now;
    const handlingMode: HandlingMode = message.handlingMode === "arcade" ? "arcade" : "sim";
    if (driver.handlingMode !== handlingMode) {
      applyCarHandlingMode([{ car: driver.car }], handlingMode, [driver.handlingBaseline]);
      driver.handlingMode = handlingMode;
    }
    driver.input = {
      throttle: read("throttle", 0, 1),
      brake: read("brake", 0, 1),
      steer: read("steer", -1, 1),
      reverse: message.reverse === true,
      drs: message.drs === true,
      ers: message.ers === true,
      ersMode: message.ersMode === "normal" || message.ersMode === "overtake" || message.ersMode === "off"
        ? message.ersMode : undefined,
    };
    driver.autoPit = message.autoPit !== false;
  }

  private receivePitRequest(client: Client, message: unknown): void {
    const driver = this.drivers.get(client.sessionId);
    if (!driver || driver.finished || driver.retired || this.state.phase !== "racing" || !this.raceTrack?.pit) return;
    const compound = isRecord(message) ? message.compound : undefined;
    if (compound !== null && (typeof compound !== "string" || !Object.hasOwn(TIRE_COMPOUNDS, compound))) return;
    if (driver.pitPhase === "service") return;
    driver.pitRequest = compound as keyof typeof TIRE_COMPOUNDS | null;
    if (driver.pitRequest) {
      const boxIndex = Math.max(0, driver.gridSlot ?? 0) % 2;
      driver.pitBox = this.raceTrack.pit.boxStart + this.raceTrack.pit.boxSpacing * boxIndex;
    }

    if (driver.pitPhase === "in" && !driver.pitRequest) {
      driver.pitPhase = null;
    }
    this.publishDriver(driver, this.state.racePlayers.get(client.sessionId));
  }

  private receiveSafetyCarChoice(client: Client, message: unknown): void {
    const driver = this.drivers.get(client.sessionId);
    const pending = driver?.pendingSafetyCarPass;
    if (!driver || !pending || !isRecord(message)
      || (message.choice !== "yield" && message.choice !== "penalty")) return;
    if (message.choice === "penalty") {
      if (!this.state.settings.penalties) return;
      driver.penaltySeconds += 5;
      driver.safetyCarPassed.add(pending.otherSessionId);
      driver.pendingSafetyCarPass = null;
      this.publishDriver(driver, this.state.racePlayers.get(client.sessionId));
      client.send("race:safety-car-pass-complete", {});
      return;
    }
    pending.decision = "yield";
    pending.until = this.raceElapsed + 3;
    client.send("race:safety-car-pass-complete", {});
  }

  private receiveAvatarState(client: Client, message: unknown): void {
    const driver = this.drivers.get(client.sessionId);
    if (!driver || !isRecord(message) || !["boarding", "qualifying", "countdown", "racing"].includes(this.state.phase)) return;
    const { x, y, heading, suit, emote, moving, onFoot } = message;
    if (typeof x !== "number" || !Number.isFinite(x)
      || typeof y !== "number" || !Number.isFinite(y)
      || typeof heading !== "number" || !Number.isFinite(heading)
      || typeof suit !== "number" || !Number.isInteger(suit) || suit < 0 || suit >= DRIVER_SUIT_COUNT
      || typeof emote !== "string" || (emote !== "" && !ON_FOOT_EMOTES.includes(emote))
      || typeof moving !== "boolean"
      || typeof onFoot !== "boolean") return;
    if (onFoot && this.state.phase !== "boarding" && !driver.finished) return;
    const now = Date.now();
    if (now - driver.lastAvatarAt < 40 && onFoot === driver.onFoot) return;
    const elapsed = driver.lastAvatarAt ? Math.min((now - driver.lastAvatarAt) / 1000, 0.5) : 0.5;
    if (Math.hypot(x - driver.avatarX, y - driver.avatarY) > elapsed * 8 + 1) return;
    driver.lastAvatarAt = now;
    driver.avatarX = x;
    driver.avatarY = y;
    driver.avatarHeading = Math.atan2(Math.sin(heading), Math.cos(heading));
    driver.avatarSuit = suit;
    driver.avatarEmote = emote;
    driver.avatarMoving = moving;
    driver.onFoot = onFoot;
    this.publishDriver(driver, this.state.racePlayers.get(client.sessionId));
    if (onFoot) {
      this.broadcast("race:avatar-state", {
        sessionId: client.sessionId,
        x,
        y,
        heading: driver.avatarHeading,
        suit,
        emote,
        moving,
        onFoot,
      });
    }
  }

  private tickRace(): void {
    if (!this.raceTrack || (this.state.phase !== "qualifying" && this.state.phase !== "countdown" && this.state.phase !== "racing")) return;
    const dt = ROOM_TICK_MS / 1000;
    const now = Date.now();
    for (const driver of this.drivers.values()) {
      if (!driver.retired && now - driver.lastInputAt > INPUT_STALE_MS) {
        driver.input = { throttle: 0, brake: STALE_INPUT_BRAKE, steer: 0, drs: false, ers: false, ersMode: "off" };
      }
    }
    if (this.state.phase === "qualifying") {
      this.qualifyingElapsed += dt;
      this.weather.update(dt);
      this.publishWeather();
      this.state.raceTime = this.qualifyingElapsed;
      this.state.countdown = Math.max(0, QUALIFYING_SECONDS - this.qualifyingElapsed);
      this.simulateDrivers();
      if (this.qualifyingElapsed >= QUALIFYING_SECONDS) this.beginCountdown(true);
      return;
    }
    if (this.state.phase === "countdown") {
      this.state.countdown = Math.max(0, this.state.countdown - dt);
      if (this.state.countdown <= 0) {
        if (this.state.settings.qualifying && !this.qualifyingComplete) {
          this.state.phase = "qualifying";
          this.state.status = "qualifying";
          this.qualifyingElapsed = 0;
          this.state.raceTime = 0;
          this.state.countdown = QUALIFYING_SECONDS;
          this.broadcast("race:qualifying", { seconds: QUALIFYING_SECONDS });
        } else {
          this.state.phase = "racing";
          this.state.status = "racing";
          this.broadcast("race:green", {});
        }
      }
      return;
    }
    this.raceElapsed += dt;
    this.weather.update(dt);
    this.publishWeather();
    if (this.yellowFlagUntil > 0 && this.raceElapsed >= this.yellowFlagUntil) {
      this.yellowFlagUntil = 0;
      this.safetyCarProgress = null;
      this.virtualSafetyCar = false;
      for (const driver of this.drivers.values()) {
        if (!driver.pendingSafetyCarPass) continue;
        driver.pendingSafetyCarPass = null;
        this.clients.find(client => client.sessionId === driver.sessionId)
          ?.send("race:safety-car-pass-complete", {});
      }
    }
    this.publishRaceControl();
    this.state.raceTime = this.raceElapsed;
    this.simulateDrivers();
    const active = Array.from(this.drivers.values()).filter(driver => !driver.finished && !driver.retired);
    if (active.length === 0) {
      this.state.phase = "finished";
      this.state.status = "finished";
    }
  }

  private simulateDrivers(): void {
    if (!this.raceTrack) return;
    const previousProgress = new Map(Array.from(this.drivers, ([sessionId, driver]) => [sessionId, driver.covered]));
    const steps = Math.round(ROOM_TICK_MS / 1000 / FIXED_DT);
    for (let index = 0; index < steps; index++) {
      const activeDrivers = Array.from(this.drivers.values()).filter(driver => !driver.retired && !driver.onFoot);
      for (const driver of activeDrivers) {
        let strength = 0;
        for (const lead of activeDrivers) {
          if (lead !== driver) strength = Math.max(strength, wakeStrength(lead.car, driver.car));
        }
        driver.car.wake = {
          drag: 1 - RACE_DEFAULTS.towDragLoss * strength,
          downforce: 1 - RACE_DEFAULTS.dirtyAirLoss * strength,
        };
      }
      for (const driver of this.drivers.values()) {
        if (driver.retired || driver.onFoot) continue;
        if (this.raceTrack.kind === "circuit" && this.raceTrack.heightAt) {
          const progress = this.raceTrack.progress(driver.car.x, driver.car.y);
          driver.car.config.airDensity = airDensityAtAltitude(
            Math.max(0, this.raceTrack.altitudeMetres + this.raceTrack.heightAt(progress)),
          );
        }
        let input = this.state.phase === "qualifying"
          ? driver.input
          : this.state.phase === "racing" ? this.driverCommand(driver) : { throttle: 0, brake: 1, steer: 0 };
        if (this.state.phase === "racing") input = this.applySafetyCarRules(driver, input);
        step(driver.car, input, FIXED_DT,
          (x: number, y: number) => this.state.phase === "qualifying"
            ? this.raceTrack!.surfaceAt(x, y)
            : this.weather.surfaceGrip(this.raceTrack!.surfaceAt(x, y), driver.car.compound),
          this.raceTrack.barrierAt);
        this.advancePitStop(driver, FIXED_DT);
        const impact = driver.car.impact;
        if (this.state.phase === "racing" && impact
          && driver.car.time - impact.time <= FIXED_DT * 1.1) {
          if (impact.speed >= RACE_DEFAULTS.yellowFlagContactSpeed) this.deploySafetyCar();
          else if (impact.speed >= RACE_DEFAULTS.vscIncidentSpeed) this.deployVirtualSafetyCar();
        }
        if (this.state.phase === "racing" && this.safetyCarProgress !== null) {
          this.safetyCarProgress += this.safetyCarSpeed * FIXED_DT;
        }
      }
    }
    if (this.state.phase === "racing") {
      this.resolveContacts();
      for (const driver of this.drivers.values()) {
        if (driver.retired || !isCarCriticallyDamaged(driver.car)) continue;
        driver.retired = true;
        driver.input = { throttle: 0, brake: 1, steer: 0, drs: false, ers: false, ersMode: "off" };
      }
    }
    for (const driver of this.drivers.values()) {
      if (!driver.retired && !driver.finished) this.updateProgress(driver);
    }
    this.updateSafetyCarPasses(previousProgress);
    this.updateStandings();
    this.publishRaceControl();
  }

  private applySafetyCarRules(driver: RaceDriver, input: DriverInput): DriverInput {
    if (driver.pitPhase) return { ...input, drs: false };
    if (this.raceElapsed >= this.yellowFlagUntil) return input;
    if (this.virtualSafetyCar) {
      const speed = driver.car.telemetry.speed;
      if (speed > this.virtualSafetyCarSpeed + 0.3) {
        return {
          ...input,
          throttle: 0,
          brake: Math.max(input.brake, clamp((speed - this.virtualSafetyCarSpeed) / 5, 0.12, 1)),
          drs: false,
        };
      }
      return { ...input, drs: false };
    }
    if (this.safetyCarProgress === null) return input;
    const pending = driver.pendingSafetyCarPass;
    const other = pending ? this.drivers.get(pending.otherSessionId) : undefined;
    if (pending?.decision === "yield" && other && !other.retired && driver.covered > other.covered) {
      const speed = driver.car.telemetry.speed;
      if (speed > other.car.telemetry.speed) {
        input = { ...input, throttle: 0, brake: Math.max(input.brake, 0.35), drs: false };
      }
    }
    const gap = this.safetyCarProgress - driver.covered;
    if (gap < 0 || gap > 160) return { ...input, drs: false };
    const speedLimit = clamp(this.safetyCarSpeed + (gap - 45) / 4, 5, 40);
    const speed = driver.car.telemetry.speed;
    if (speed > speedLimit + 0.3) {
      return {
        ...input,
        throttle: 0,
        brake: Math.max(input.brake, clamp((speed - speedLimit) / 5, 0.12, 1)),
        drs: false,
      };
    }
    return {
      ...input,
      throttle: Math.min(input.throttle, clamp((speedLimit - speed) * 0.12, 0, input.throttle)),
      drs: false,
    };
  }

  private updateSafetyCarPasses(previousProgress: Map<string, number>): void {
    if (this.safetyCarProgress === null || this.raceElapsed >= this.yellowFlagUntil) return;
    const drivers = Array.from(this.drivers.values()).filter(driver => !driver.retired && !driver.finished);
    for (const driver of drivers) {
      const pending = driver.pendingSafetyCarPass;
      if (!pending) continue;
      const other = this.drivers.get(pending.otherSessionId);
      if (pending.decision === "yield" && other && driver.covered <= other.covered) {
        driver.safetyCarPassed.add(other.sessionId);
        driver.pendingSafetyCarPass = null;
      } else if (this.raceElapsed >= pending.until) {
        if (this.state.settings.penalties) driver.penaltySeconds += 5;
        else driver.disqualified = true;
        driver.safetyCarPassed.add(pending.otherSessionId);
        driver.pendingSafetyCarPass = null;
        this.publishDriver(driver, this.state.racePlayers.get(driver.sessionId));
        this.clients.find(client => client.sessionId === driver.sessionId)
          ?.send("race:safety-car-pass-complete", {});
      }
    }
    for (let first = 0; first < drivers.length; first++) {
      for (let second = first + 1; second < drivers.length; second++) {
        const a = drivers[first], b = drivers[second];
        if (a.pitPhase || b.pitPhase) continue;
        const recordPass = (overtaker: RaceDriver, overtaken: RaceDriver): void => {
          const wasBehind = (previousProgress.get(overtaker.sessionId) ?? overtaker.covered)
            <= (previousProgress.get(overtaken.sessionId) ?? overtaken.covered);
          if (!wasBehind || overtaker.covered <= overtaken.covered
            || overtaker.safetyCarPassed.has(overtaken.sessionId) || overtaker.pendingSafetyCarPass) return;
          overtaker.pendingSafetyCarPass = {
            otherSessionId: overtaken.sessionId,
            until: this.raceElapsed + 3,
            decision: null,
          };
          this.clients.find(client => client.sessionId === overtaker.sessionId)?.send("race:safety-car-pass", {
            other: this.state.players.get(overtaken.sessionId)?.name ?? "another driver",
            penaltiesEnabled: this.state.settings.penalties,
          });
        };
        recordPass(a, b);
        recordPass(b, a);
      }
    }
  }

  private deploySafetyCar(): void {
    if (!this.raceTrack || this.state.phase !== "racing") return;
    const leader = Array.from(this.drivers.values())
      .filter(driver => !driver.retired && !driver.finished)
      .sort((a, b) => b.covered - a.covered)[0];
    if (!leader) return;
    this.yellowFlagUntil = Math.max(this.yellowFlagUntil, this.raceElapsed + 45);
    this.safetyCarProgress ??= leader.covered + 80;
    this.virtualSafetyCar = false;
    this.publishRaceControl();
  }

  private deployVirtualSafetyCar(): void {
    if (!this.raceTrack || this.state.phase !== "racing"
      || this.raceElapsed < this.yellowFlagUntil
      || this.raceElapsed - this.lastVirtualSafetyCarAt < this.virtualSafetyCarDuration) return;
    this.yellowFlagUntil = this.raceElapsed + this.virtualSafetyCarDuration;
    this.virtualSafetyCar = true;
    this.safetyCarProgress = null;
    this.lastVirtualSafetyCarAt = this.raceElapsed;
    this.publishRaceControl();
  }

  private publishWeather(): void {
    const weather = this.weather.state;
    this.state.weatherRaining = weather.raining;
    this.state.weatherIntensity = weather.intensity;
    this.state.weatherWetness = weather.wetness;
  }

  private raceFuelLoad(): number {
    if (!this.raceTrack) return 0;
    const fuelPerLap = this.raceTrack.kind === "circuit"
      ? RACE_DEFAULTS.fuelPerKm * this.raceTrack.length / 1000
      : RACE_DEFAULTS.fuelPerLap;
    return this.state.settings.laps * fuelPerLap * (1 + RACE_DEFAULTS.fuelMargin)
      + RACE_DEFAULTS.fuelReserve;
  }

  private publishRaceControl(): void {
    const active = this.raceElapsed < this.yellowFlagUntil;
    this.state.yellowFlag = active;
    this.state.yellowFlagRemaining = active ? this.yellowFlagUntil - this.raceElapsed : 0;
    this.state.safetyCarProgress = active && !this.virtualSafetyCar ? this.safetyCarProgress! : -1;
    this.state.safetyCarSpeed = active && this.virtualSafetyCar ? this.virtualSafetyCarSpeed : this.safetyCarSpeed;
  }

  private driverCommand(driver: RaceDriver): DriverInput {
    const track = this.raceTrack;
    const pit = track?.pit;
    if (!track || !pit || driver.finished || driver.onFoot) return driver.input;
    if (driver.pitPhase === "service") {
      return { throttle: 0, brake: 1, steer: 0, ers: false, ersMode: "off", drs: false };
    }
    if (!driver.autoPit || (!driver.pitPhase && !driver.pitRequest)) return driver.input;
    const progress = track.progress(driver.car.x, driver.car.y);
    const frameProgress = track.kind === "circuit"
      ? ((progress + track.length / 2) % track.length + track.length) % track.length - track.length / 2
      : progress;
    const signedProgress = track.kind === 'circuit' && typeof (track as any).signed === 'function'
      ? (track as any).signed(progress)
      : frameProgress;
    const toEntry = ((pit.entry - signedProgress) % track.length + track.length) % track.length;
    const onPitRoute = track.kind === 'circuit'
      ? signedProgress >= pit.entry - 5 && signedProgress <= pit.exit
      : frameProgress >= pit.entry && frameProgress <= pit.exit;
    const nearEntry = track.kind === 'circuit'
      ? (signedProgress > pit.entry - 150 && signedProgress < pit.entry + 20)
      : (toEntry <= 180 || onPitRoute);
    if (!driver.pitPhase && (nearEntry || onPitRoute)) {
      driver.pitPhase = "in";
      driver.pitFrom = track.offset(driver.car.x, driver.car.y)
        - (track.lineOffset?.(progress) ?? 0);
      const boxIndex = Math.max(0, driver.gridSlot ?? 0) % 2;
      driver.pitBox = pit.boxStart + pit.boxSpacing * boxIndex;
    }
    if (!driver.pitPhase) return driver.input;

    const smooth = (value: number, start: number, end: number): number => {
      const t = clamp((value - start) / Math.max(end - start, 1e-6), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const swing = (s: number): number => (pit.boxOffset - pit.lane)
      * (smooth(s, driver.pitBox - 18, driver.pitBox - 1)
        - smooth(s, driver.pitBox + 1, driver.pitBox + 18));
    let path: (s: number) => number;
    if (track.kind === "circuit") {
      path = s => {
        const current = ((s + track.length / 2) % track.length + track.length) % track.length - track.length / 2;
        const line = track.lineOffset?.(s) ?? 0;
        if (driver.pitPhase === "in" && current > pit.exit) return line + driver.pitFrom;
        const into = smooth(current, pit.entry, pit.limitStart - 10);
        const merged = pit.mergeStart === undefined ? 0
          : smooth(current, pit.mergeStart, pit.mergeStart + (pit.mergeLength ?? 0));
        const lane = pit.tunnel && pit.laneOffsetAt
          ? pit.laneOffsetAt(current) + pit.side * swing(current)
          : pit.side * (pit.lane + swing(current));
        return (line + driver.pitFrom) * (1 - into)
          + (lane * (1 - merged) + line * merged) * into;
      };
    } else {
      const straight = 2 * (track.halfStraight ?? 220);
      path = s => {
        if (driver.pitPhase === "in" && s > straight) return driver.pitFrom;
        const into = smooth(s, pit.entry, pit.limitStart - 10);
        const merged = pit.mergeStart === undefined ? 0
          : smooth(s, pit.mergeStart, pit.mergeStart + (pit.mergeLength ?? 0));
        return driver.pitFrom + (pit.lane - driver.pitFrom) * into + swing(s)
          - pit.lane * merged;
      };
    }
    const distanceToEntry = Math.max(0, toEntry);
    const approachLimit = Math.sqrt(pit.speedLimit ** 2 + 16 * distanceToEntry);
    const inPitLimit = frameProgress >= pit.entry && frameProgress <= pit.exit ? pit.speedLimit : Infinity;
    const boxDistance = driver.pitPhase === "in" ? Math.max(0, driver.pitBox - frameProgress) : Infinity;
    const boxLimit = Math.sqrt(16 * boxDistance);
    return {
      ...driver.pitDrive(driver.car, {
        offset: path,
        maxSpeed: Math.min(approachLimit, inPitLimit, boxLimit),
        grip: 1,
      }),
      ers: false,
      ersMode: "off",
      drs: false,
    };
  }

  private advancePitStop(driver: RaceDriver, dt: number): void {
    const track = this.raceTrack;
    const pit = track?.pit;
    if (!track || !pit) return;
    if (driver.pitPhase === "service") {
      driver.pitServiceRemaining -= dt;
      if (driver.pitServiceRemaining <= 0 && driver.pitRequest) {
        fitTires(driver.car, driver.pitRequest);
        driver.compoundsUsed.add(driver.car.compound);
        driver.pitRequest = null;
        driver.pitPhase = "out";
      }
      return;
    }
    const progress = track.progress(driver.car.x, driver.car.y);
    const frameProgress = track.kind === "circuit"
      ? ((progress + track.length / 2) % track.length + track.length) % track.length - track.length / 2
      : progress;
    const offset = track.offset(driver.car.x, driver.car.y);
    const withinPitProgress = frameProgress >= pit.entry && frameProgress <= pit.exit;
    const onPitRoute = withinPitProgress && (
      pit.isOnRouteAt?.(driver.car.x, driver.car.y, progress)
      || (pit.side * offset <= -pit.inner && pit.side * offset >= -pit.outer)
    );
    if (driver.pitRequest && driver.pitPhase === null && onPitRoute) {
      driver.pitPhase = "in";
    }
    if (driver.pitRequest && driver.pitPhase !== "out"
      && Math.abs(frameProgress - driver.pitBox) <= PIT_BOX_PROGRESS_TOLERANCE
      && Math.abs(pit.side * offset - pit.boxOffset) < 2.25
      && driver.car.telemetry.speed < 0.6) {
      driver.pitPhase = "service";
      driver.pitServiceRemaining = 2.4;
      driver.car.vx = 0;
      driver.car.vy = 0;
      driver.car.wheelOmega.fill(0);
      return;
    }
    if (driver.pitPhase === "in" && frameProgress > driver.pitBox + 8) {
      driver.pitPhase = "out";
    }
    if (driver.pitPhase === "out"
      && (frameProgress >= (pit.mergeStart ?? pit.exit) + (pit.mergeLength ?? 0)
        || frameProgress >= pit.exit || frameProgress < pit.entry)) {
      driver.pitPhase = null;
    }
  }

    private updateProgress(driver: RaceDriver): void {
    if (!this.raceTrack) return;
    const current = this.raceTrack.progress(driver.car.x, driver.car.y);
    let delta = current - driver.lastProgress;
    if (delta < -this.raceTrack.length / 2) delta += this.raceTrack.length;
    else if (delta > this.raceTrack.length / 2) delta -= this.raceTrack.length;
    driver.lastProgress = current;
    if (delta > 0) driver.covered += delta;
    if (delta > 0 && Math.floor(driver.covered / this.raceTrack.length) > Math.floor((driver.covered - delta) / this.raceTrack.length)) {
      newErsLap(driver.car);
    }
    const lap = Math.floor(driver.covered / this.raceTrack.length) + 1;
    if (this.state.phase === "qualifying" && lap > 1) {
      const lapTime = this.qualifyingElapsed - driver.lastLapAt;
      if (lapTime > 5) driver.bestLapTime = Math.min(driver.bestLapTime, lapTime);
      driver.lastLapAt = this.qualifyingElapsed;
    }
    if (this.state.phase === "racing" && driver.covered >= this.raceTrack.length * this.state.settings.laps) {
      driver.finished = true;
      driver.finishTime = this.raceElapsed;
      if (this.state.settings.mode === "competitive" && driver.compoundsUsed.size < 2) {
        driver.disqualified = true;
      }
    }

    const offset = Math.abs(this.raceTrack.locate(driver.car.x, driver.car.y).offset);
    const outside = offset > this.raceTrack.roadWidth / 2 + 1.2;
    if (this.state.phase === "racing" && this.state.settings.penalties) {
      if (outside && !driver.outside) {
        driver.warnings++;
        if (driver.warnings >= 3) driver.penaltySeconds += 3;
      }
    }
    driver.outside = outside;
  }

  private resolveContacts(): void {
    const drivers = Array.from(this.drivers.values()).filter(driver => !driver.retired && !driver.finished);
    for (let first = 0; first < drivers.length; first++) {
      for (let second = first + 1; second < drivers.length; second++) {
        const a = drivers[first];
        const b = drivers[second];
        const speed = resolveCarContact(a.car, b.car);
        if (speed >= RACE_DEFAULTS.yellowFlagContactSpeed) this.deploySafetyCar();
        else if (speed >= RACE_DEFAULTS.vscIncidentSpeed) this.deployVirtualSafetyCar();
        if (speed < 18 || this.state.phase !== "racing") continue;
        if (this.state.settings.penalties) {
          const key = `${a.sessionId}:${b.sessionId}`;
          const lastPenalty = a.contactCooldowns.get(key) ?? -Infinity;
          if (this.raceElapsed - lastPenalty >= 3) {
            a.contactCooldowns.set(key, this.raceElapsed);
            a.penaltySeconds += 3;
            b.penaltySeconds += 3;
          }
        }
        if (this.state.settings.retirements && speed > 45) {
          a.retired = true;
          b.retired = true;
        }
      }
    }
  }

  private updateStandings(): void {
    const ordered = Array.from(this.drivers.values()).sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) {
        return a.finishTime + a.penaltySeconds - (b.finishTime + b.penaltySeconds)
          || a.gridSlot - b.gridSlot;
      }
      return b.covered - a.covered || a.gridSlot - b.gridSlot;
    });
    ordered.forEach((driver, index) => {
      const player = this.state.racePlayers.get(driver.sessionId);
      if (!player) return;
      player.position = index + 1;
      this.publishDriver(driver, player);
    });
  }

  private publishDriver(driver: RaceDriver, player: RacePlayer | undefined): void {
    if (!player) return;
    player.x = driver.car.x;
    player.y = driver.car.y;
    player.heading = driver.car.heading;
    player.vx = driver.car.vx;
    player.vy = driver.car.vy;
    player.yawRate = driver.car.yawRate;
    player.airborneHeight = driver.car.airborneHeight;
    player.gear = driver.car.gear;
    player.steer = driver.car.steer;
    player.speed = driver.car.telemetry.speed;
    player.drs = driver.car.drs;
    player.ersCharge = driver.car.ers?.charge ?? 0;
    player.ersDeploy = driver.car.telemetry.powertrain?.ers?.deploy ?? 0;
    player.compound = driver.car.compound;
    player.lap = this.raceTrack ? Math.min(this.state.settings.laps, Math.floor(driver.covered / this.raceTrack.length) + 1) : 1;
    player.progress = driver.covered;
    player.penaltySeconds = driver.penaltySeconds;
    player.trackLimitWarnings = driver.warnings;
    player.pitRequest = driver.pitRequest ?? "";
    player.pitPhase = driver.pitPhase ?? "";
    player.avatarX = driver.avatarX;
    player.avatarY = driver.avatarY;
    player.avatarHeading = driver.avatarHeading;
    player.avatarSuit = driver.avatarSuit;
    player.avatarEmote = driver.avatarEmote;
    player.avatarMoving = driver.avatarMoving;
    player.onFoot = driver.onFoot;
    player.finished = driver.finished;
    player.retired = driver.retired;
    player.disqualified = driver.disqualified;
    player.engineRpm = driver.car.telemetry.powertrain?.rpm ?? 0;
    player.engineLimiter = driver.car.telemetry.powertrain?.limiter ?? false;
    player.ax = driver.car.ax;
    player.ay = driver.car.ay;
    player.downforce = driver.car.telemetry.downforce;
    player.tireWear0 = driver.car.tireWear[0] ?? 0;
    player.tireWear1 = driver.car.tireWear[1] ?? 0;
    player.tireWear2 = driver.car.tireWear[2] ?? 0;
    player.tireWear3 = driver.car.tireWear[3] ?? 0;
    player.chassisDamage = driver.car.chassisDamage;
    player.tireDamage0 = driver.car.tireDamage[0] ?? 0;
    player.tireDamage1 = driver.car.tireDamage[1] ?? 0;
    player.tireDamage2 = driver.car.tireDamage[2] ?? 0;
    player.tireDamage3 = driver.car.tireDamage[3] ?? 0;
    player.tireSurfaceTemp0 = driver.car.tireTemp[0]?.surface ?? 0;
    player.tireSurfaceTemp1 = driver.car.tireTemp[1]?.surface ?? 0;
    player.tireSurfaceTemp2 = driver.car.tireTemp[2]?.surface ?? 0;
    player.tireSurfaceTemp3 = driver.car.tireTemp[3]?.surface ?? 0;
    player.tireCarcassTemp0 = driver.car.tireTemp[0]?.carcass ?? 0;
    player.tireCarcassTemp1 = driver.car.tireTemp[1]?.carcass ?? 0;
    player.tireCarcassTemp2 = driver.car.tireTemp[2]?.carcass ?? 0;
    player.tireCarcassTemp3 = driver.car.tireTemp[3]?.carcass ?? 0;
    player.tireSlipPower0 = driver.car.telemetry.wheels[0]?.slipPower ?? 0;
    player.tireSlipPower1 = driver.car.telemetry.wheels[1]?.slipPower ?? 0;
    player.tireSlipPower2 = driver.car.telemetry.wheels[2]?.slipPower ?? 0;
    player.tireSlipPower3 = driver.car.telemetry.wheels[3]?.slipPower ?? 0;
    player.ersDeployedLap = driver.car.telemetry.powertrain?.ers?.deployed ?? 0;
    player.ersHarvestedLap = driver.car.telemetry.powertrain?.ers?.harvested ?? 0;
    player.fuel = driver.car.fuel ?? 0;
  }

  private beginCountdown(qualifyingComplete: boolean): void {
    if (qualifyingComplete && this.raceTrack) {
      this.qualifyingComplete = true;
      const ordered = Array.from(this.drivers.values()).sort((a, b) =>
        Number(a.retired) - Number(b.retired) || a.bestLapTime - b.bestLapTime);
      ordered.forEach((driver, index) => {
        if (driver.retired) return;
        driver.gridSlot = index;
        driver.car = createCar({ altitudeMetres: this.raceTrack.altitudeMetres });
        driver.car.fuel = this.raceFuelLoad();
        driver.handlingBaseline = captureHandlingBaseline([{ car: driver.car }])[0];
        applyCarHandlingMode([{ car: driver.car }], driver.handlingMode, [driver.handlingBaseline]);
        fitTires(driver.car, startingTyreForTrack(this.state.settings.circuit));
        driver.compoundsUsed = new Set([driver.car.compound]);
        Object.assign(driver.car, gridPosition(this.raceTrack!, index));
        if (driver.onFoot) {
          const avatar = onFootSpawn(driver.car);
          driver.avatarX = avatar.player.x;
          driver.avatarY = avatar.player.y;
          driver.avatarHeading = avatar.heading;
          driver.avatarEmote = "";
          driver.avatarMoving = false;
        }
        driver.covered = 0;
        driver.lastProgress = this.raceTrack!.progress(driver.car.x, driver.car.y);
        driver.outside = false;
        driver.warnings = 0;
        driver.penaltySeconds = 0;
        driver.finished = false;
        driver.disqualified = false;
        driver.finishTime = 0;
        driver.lastLapAt = 0;
        driver.input = { throttle: 0, brake: 1, steer: 0 };
        const player = this.state.racePlayers.get(driver.sessionId);
        if (player) {
          player.position = index + 1;
          this.publishDriver(driver, player);
        }
      });
      this.raceElapsed = 0;
    }
    this.state.phase = "countdown";
    this.state.status = "starting";
    this.state.countdown = 5;
    this.broadcast("race:countdown", { seconds: 5 });
  }
}
