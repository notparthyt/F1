import assert from "node:assert/strict";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/app.config.js";
import { normalizeLobbySettings, type LobbyRoom } from "../src/rooms/LobbyRoom.js";
import { LobbyState } from "../src/rooms/LobbyState.js";
import { DEFAULT_CAR } from "../../src/physics.mjs";
import { ARCADE_FACTORS } from "../../src/handling.mjs";
import { CIRCUITS } from "../../src/circuits.mjs";
import { createCircuitTrack } from "../../src/circuit.mjs";
import { CIRCUIT_PIT_CONFIGS, CIRCUIT_PIT_LAYOUTS, CIRCUIT_PIT_SIDES, CIRCUIT_PIT_TUNNELS } from "../../src/pitconfig.mjs";
import { CIRCUIT_ELEVATION_PROFILES, CIRCUIT_TRACK_STYLE } from "../../src/trackdata.mjs";

const settings = {
  circuit: "singapore",
  laps: 12,
  mode: "competitive",
  qualifying: true,
  retirements: false,
  penalties: true,
};

async function waitFor(condition: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function forceDriversIntoCars(
  room: LobbyRoom,
  host: { sessionId: string; send(type: string, message?: unknown): void },
): Promise<void> {
  const player = room.state.racePlayers.get(host.sessionId);
  assert.ok(player);
  host.send("race:avatar", {
    x: player.avatarX,
    y: player.avatarY,
    heading: player.avatarHeading,
    suit: player.avatarSuit,
    emote: "",
    moving: false,
    onFoot: false,
  });
  host.send("race:force-grid");
  await waitFor(() => room.state.phase === "countdown", "Host did not start the grid countdown.");
}

function advanceCountdown(room: LobbyRoom): void {
  const internals = room as unknown as { tickRace(): void };
  for (let tick = 0; tick < 180; tick++) internals.tickRace();
}

describe("multiplayer lobby", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => { colyseus = await boot(appConfig); });
  after(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); });

  it("creates a private lobby with validated settings and a six-digit code", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });

    assert.match(room.state.code, /^\d{6}$/);
    assert.equal(room.state.settingsReady, true);
    assert.equal(room.state.settings.circuit, "singapore");
    assert.equal(room.state.settings.laps, 12);
    assert.equal(room.state.settings.mode, "competitive");
    assert.equal(room.maxClients, 22);
  });

  it("uses the client Yas Marina pit-lane and underpass geometry on the server", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", {
      settings: { ...settings, circuit: "yas-marina", qualifying: false },
    });
    const host = await colyseus.connectTo(room, { identity: "identity-yas-host-001", name: "Host" });
    await colyseus.connectTo(room, { identity: "identity-yas-guest-001", name: "Guest" });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The Yas Marina race was not prepared.");

    const expected = createCircuitTrack({
      ...CIRCUITS["yas-marina"],
      ...CIRCUIT_TRACK_STYLE["yas-marina"],
      pitSide: CIRCUIT_PIT_SIDES["yas-marina"],
      pitTunnel: {
        depth: 5.5,
        ...CIRCUIT_PIT_TUNNELS["yas-marina"],
        ...CIRCUIT_PIT_LAYOUTS["yas-marina"].tunnel,
      },
      pitConfig: {
        ...CIRCUITS["yas-marina"].pitConfig,
        ...CIRCUIT_PIT_CONFIGS["yas-marina"],
        ...CIRCUIT_PIT_LAYOUTS["yas-marina"].lane,
      },
      elevationProfile: CIRCUIT_ELEVATION_PROFILES["yas-marina"],
      night: true,
    });
    const serverTrack = (room as unknown as {
      raceTrack: ReturnType<typeof createCircuitTrack>;
    }).raceTrack;
    assert.ok(serverTrack?.pit?.tunnel, "Yas Marina multiplayer must use the pit underpass.");
    assert.deepEqual({
      side: serverTrack.pit.side,
      entry: serverTrack.pit.entry,
      exit: serverTrack.pit.exit,
      mergeStart: serverTrack.pit.mergeStart,
      mergeLength: serverTrack.pit.mergeLength,
      tunnel: serverTrack.pit.tunnel,
      laneOffsetAt: [-250, 350, 500, 639].map(s => serverTrack.pit!.laneOffsetAt!(s)),
    }, {
      side: expected.pit.side,
      entry: expected.pit.entry,
      exit: expected.pit.exit,
      mergeStart: expected.pit.mergeStart,
      mergeLength: expected.pit.mergeLength,
      tunnel: expected.pit.tunnel,
      laneOffsetAt: [-250, 350, 500, 639].map(s => expected.pit!.laneOffsetAt!(s)),
    });
    assert.equal(serverTrack.wallOffset, expected.wallOffset);
    assert.deepEqual(serverTrack.samples.z, expected.samples.z);

    await room.disconnect();
  });

  it("replicates weather and applies safety-car speed and DRS restrictions", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", {
      settings: { ...settings, qualifying: false },
    });
    const host = await colyseus.connectTo(room, { identity: "identity-weather-host", name: "Host" });
    await colyseus.connectTo(room, { identity: "identity-weather-guest", name: "Guest" });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The race grid was not prepared.");
    await forceDriversIntoCars(room, host);
    advanceCountdown(room);

    const internals = room as unknown as {
      drivers: Map<string, {
        covered: number;
        pitPhase: string | null;
        compoundsUsed: Set<string>;
        disqualified: boolean;
        car: { telemetry: { speed: number } };
      }>;
      raceTrack: { length: number } | null;
      deploySafetyCar(): void;
      updateSafetyCarPasses(previousProgress: Map<string, number>): void;
      updateProgress(driver: {
        covered: number;
        compoundsUsed: Set<string>;
        disqualified: boolean;
      }): void;
      applySafetyCarRules(
        driver: { covered: number; pitPhase: string | null; car: { telemetry: { speed: number } } },
        input: { throttle: number; brake: number; steer: number; drs: boolean },
      ): { throttle: number; brake: number; steer: number; drs: boolean };
    };
    const driver = internals.drivers.get(host.sessionId);
    assert.ok(driver);
    assert.equal(driver.compoundsUsed.size, 1);
    assert.ok(driver.compoundsUsed.has("medium"), "Singapore no-qualifying races start on their configured compound.");
    driver.car.telemetry.speed = 45;
    internals.deploySafetyCar();

    assert.equal(room.state.yellowFlag, true);
    assert.ok(room.state.yellowFlagRemaining > 0);
    assert.ok(room.state.safetyCarProgress > driver.covered);
    assert.ok(Number.isFinite(room.state.weatherIntensity));
    const restricted = internals.applySafetyCarRules(driver, { throttle: 1, brake: 0, steer: 0, drs: true });
    assert.equal(restricted.drs, false);
    assert.ok(restricted.brake > 0);

    let safetyCarPass: { other: string; penaltiesEnabled: boolean } | undefined;
    host.onMessage("race:safety-car-pass", message => { safetyCarPass = message; });
    const guestSessionId = Array.from(internals.drivers.keys()).find(sessionId => sessionId !== host.sessionId);
    assert.ok(guestSessionId);
    const guestDriver = internals.drivers.get(guestSessionId);
    assert.ok(guestDriver);
    driver.covered = 20;
    guestDriver.covered = 19;
    internals.updateSafetyCarPasses(new Map([[host.sessionId, 19], [guestSessionId, 19]]));
    await waitFor(() => !!safetyCarPass, "A safety-car overtake did not request a driver decision.");
    assert.equal(safetyCarPass.penaltiesEnabled, true);
    host.send("race:safety-car-choice", { choice: "penalty" });
    await waitFor(() => (room.state.racePlayers.get(host.sessionId)?.penaltySeconds ?? 0) >= 5,
      "The server did not apply the safety-car overtake penalty.");

    assert.ok(internals.raceTrack);
    driver.compoundsUsed.clear();
    driver.covered = internals.raceTrack.length * settings.laps;
    internals.updateProgress(driver);
    assert.equal(driver.disqualified, true, "Competitive races require two tire compounds.");

    await host.leave();
  });

  it("suffixes duplicate names and transfers host when the host leaves", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });
    const host = await colyseus.connectTo(room, { identity: "identity-host-0001", name: "Player" });
    const second = await colyseus.connectTo(room, { identity: "identity-second-01", name: "player" });
    const third = await colyseus.connectTo(room, { identity: "identity-third-001", name: "Player" });

    assert.equal(second.state.players.get(second.sessionId)?.name, "player (1)");
    assert.equal(third.state.players.get(third.sessionId)?.name, "Player (2)");
    assert.equal(room.state.hostSessionId, host.sessionId);

    await host.leave();
    await waitFor(() => room.state.hostSessionId === second.sessionId, "Host was not transferred.");
    assert.equal(room.state.players.get(second.sessionId)?.isHost, true);

    await second.leave();
    await third.leave();
  });

  it("allows only the host to start once two players are present", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });
    const host = await colyseus.connectTo(room, { identity: "identity-host-0002", name: "Host" });
    const guest = await colyseus.connectTo(room, { identity: "identity-guest-002", name: "Guest" });
    host.onMessage("lobby:started", () => {});
    guest.onMessage("lobby:error", () => {});
    guest.onMessage("lobby:started", () => {});

    guest.send("lobby:start");
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(room.state.status, "lobby");

    host.send("lobby:start");
    await waitFor(() => room.state.status === "starting", "Host start request was not applied.");
    assert.equal(room.state.phase, "boarding");
    assert.equal(room.state.racePlayers.size, 2);
    guest.send("race:force-grid");
    host.send("race:force-grid");
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(room.state.phase, "boarding", "the host must enter the car before starting");
    await forceDriversIntoCars(room, host);
    assert.equal(room.state.racePlayers.get(host.sessionId)?.onFoot, false);
    assert.equal(room.state.racePlayers.get(guest.sessionId)?.onFoot, false);
    host.send("race:force-grid");
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(room.state.phase, "countdown", "the force-in action must not restart after it is used");
    assert.equal(Math.ceil(room.state.countdown), 5, "the race countdown must begin before the first start light.");
    advanceCountdown(room);
    assert.equal(room.state.phase, "qualifying");
    host.send("race:input", { sequence: 1, throttle: 1, brake: 0, steer: 0, handlingMode: "arcade" });
    await waitFor(
      () => (room.state.racePlayers.get(host.sessionId)?.speed ?? 0) > 0,
      "The server did not simulate the player's driving input.",
    );
    const internals = room as unknown as {
      drivers: Map<string, {
        car: {
          config: { tireMu: number };
          telemetry: { powertrain: unknown };
          fuel: number | null;
          gear: number;
          x: number;
          y: number;
          heading: number;
          vx: number;
          vy: number;
        };
      }>;
    };
    const drivenCar = internals.drivers.get(host.sessionId)?.car;
    assert.ok(drivenCar?.telemetry.powertrain, "multiplayer should use the full singleplayer vehicle simulation");
    assert.equal(drivenCar.config.tireMu, DEFAULT_CAR.tireMu * ARCADE_FACTORS.tireMu);
    host.send("race:input", { sequence: 2, throttle: 0, brake: 1, steer: 0, reverse: true, handlingMode: "arcade" });
    await waitFor(() => drivenCar.gear < 0, "The server did not select reverse after the car stopped.");
    host.send("race:input", { sequence: 3, throttle: 1, brake: 0, steer: 0, reverse: true, handlingMode: "arcade" });
    await waitFor(() => drivenCar.vx * Math.cos(drivenCar.heading) + drivenCar.vy * Math.sin(drivenCar.heading) < -0.5,
      "The server did not move the car backward in reverse.");
    host.send("race:input", { sequence: 4, throttle: 0, brake: 1, steer: 0, reverse: false, handlingMode: "arcade" });
    await waitFor(() => drivenCar.gear > 0, "The server did not select forward after braking to a stop.");
    host.send("race:input", { sequence: 5, throttle: 1, brake: 0, steer: 0, reverse: false, handlingMode: "arcade" });
    await waitFor(() => drivenCar.vx * Math.cos(drivenCar.heading) + drivenCar.vy * Math.sin(drivenCar.heading) > 0.5,
      "The server did not move the car forward after leaving reverse.");
    await guest.leave();
    await host.leave();
  });

  it("places the stadium grid at the start line in staggered, correctly ordered slots", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", {
      settings: { ...settings, circuit: "", qualifying: false },
    });
    const host = await colyseus.connectTo(room, { identity: "identity-grid-host", name: "Host" });
    const guest = await colyseus.connectTo(room, { identity: "identity-grid-guest", name: "Guest" });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The race grid was not prepared.");
    await forceDriversIntoCars(room, host);

    const internals = room as unknown as {
      drivers: Map<string, { car: { x: number; y: number; heading: number } }>;
    };
    const [pole, second] = Array.from(internals.drivers.values());
    assert.deepEqual([pole.car.x, pole.car.y, pole.car.heading], [0, -90, 0]);
    assert.ok(Math.abs(second.car.x + 10) < 1e-9);
    assert.ok(Math.abs(second.car.y + 87.4) < 1e-9);
    assert.ok(Math.abs(second.car.heading) < 1e-9);
    assert.equal(room.state.racePlayers.get(host.sessionId)?.position, 1);
    assert.equal(room.state.racePlayers.get(guest.sessionId)?.position, 2);

    await guest.leave();
    await host.leave();
  });

  it("coasts through brief input stalls instead of abruptly locking the brakes", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", {
      settings: { ...settings, qualifying: false },
    });
    const host = await colyseus.connectTo(room, { identity: "identity-stale-host", name: "Host" });
    await colyseus.connectTo(room, { identity: "identity-stale-guest", name: "Guest" });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The race grid was not prepared.");
    await forceDriversIntoCars(room, host);
    advanceCountdown(room);

    const internals = room as unknown as {
      drivers: Map<string, { input: { throttle: number; brake: number }; lastInputAt: number }>;
      tickRace(): void;
    };
    const driver = internals.drivers.get(host.sessionId);
    assert.ok(driver);
    driver.input = { throttle: 1, brake: 0 };
    driver.lastInputAt = Date.now() - 501;
    internals.tickRace();

    assert.equal(driver.input.throttle, 0);
    assert.equal(driver.input.brake, 0.18);
    await host.leave();
  });

  it("supports ERS, DRS, automatic pit requests, and post-finish driving", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", {
      settings: { ...settings, qualifying: false },
    });
    const host = await colyseus.connectTo(room, { identity: "identity-flow-host", name: "Host" });
    const guest = await colyseus.connectTo(room, { identity: "identity-flow-guest", name: "Guest" });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The race grid was not prepared.");
    await forceDriversIntoCars(room, host);
    advanceCountdown(room);
    assert.equal(room.state.phase, "racing");

    const internals = room as unknown as {
      drivers: Map<string, {
        car: ReturnType<typeof createCar> & { distance: number };
        covered: number;
        finished: boolean;
        lastProgress: number;
        pitPhase: string | null;
        pitRequest: string | null;
        pitBox: number;
        autoPit: boolean;
        pitServiceRemaining: number;
        lastInputAt: number;
        input: { throttle: number; brake: number; steer: number };
        avatarX: number;
        avatarY: number;
        avatarHeading: number;
        avatarSuit: number;
        onFoot: boolean;
      }>;
      raceTrack: {
        pit: {
          entry: number;
          boxOffset: number;
          boxStart: number;
          lane: number;
          side: number;
        } | null;
        point(s: number, offset?: number): [number, number];
        heading(s: number): number;
        progress(x: number, y: number): number;
      };
      driverCommand(driver: unknown): unknown;
      tickRace(): void;
    };
    const driver = internals.drivers.get(host.sessionId);
    const guestDriver = internals.drivers.get(guest.sessionId);
    const player = room.state.racePlayers.get(host.sessionId);
    assert.ok(driver && guestDriver && player);
    assert.ok((driver.car.fuel ?? 0) > 1, "Race starts should load fuel for the configured distance.");
    host.send("race:input", {
      sequence: 1,
      throttle: 1,
      brake: 0,
      steer: 0,
      drs: true,
      ers: true,
      ersMode: "overtake",
      autoPit: true,
      handlingMode: "arcade",
    });
    await waitFor(() => player.drs > 0.5, "The server did not apply DRS input.");
    driver.car.vx = 30;
    driver.car.vy = 0;
    driver.car.telemetry.speed = 30;
    driver.car.wheelOmega.fill(30 / driver.car.config.wheelRadius);
    host.send("race:input", {
      sequence: 2,
      throttle: 1,
      brake: 0,
      steer: 0,
      drs: true,
      ers: true,
      ersMode: "overtake",
      autoPit: true,
      handlingMode: "arcade",
    });
    await waitFor(() => player.ersDeploy > 0, "The server did not deploy ERS.");

    guest.send("race:input", {
      sequence: 1,
      throttle: 1,
      brake: 0,
      steer: 0,
      handlingMode: "arcade",
    });
    await waitFor(() => guestDriver.car.telemetry.speed > 0.5, "The other client did not start driving.");
    host.send("race:pit-request", { compound: "medium" });
    await waitFor(() => driver.pitRequest === "medium", "The server did not accept the pit request.");
    assert.equal(player.pitRequest, "medium", "the accepted pit request should be replicated to clients");
    assert.ok(guestDriver.car.telemetry.speed > 0,
      "A pit request from one client must not stop another client's car.");
    const pit = internals.raceTrack.pit;
    assert.ok(pit);
    const approach = pit.entry - 100;
    const [x, y] = internals.raceTrack.point(approach);
    Object.assign(driver.car, {
      x,
      y,
      heading: internals.raceTrack.heading(approach),
      vx: 0,
      vy: 0,
    });
    driver.lastProgress = internals.raceTrack.progress(x, y);
    const pitCommand = internals.driverCommand(driver) as { ers?: boolean; drs?: boolean };
    assert.equal(driver.pitPhase, "in", "auto-pit should take control before pit entry");
    assert.equal(pitCommand.ers, false, "pit autopilot must not spend ERS while controlling the car");
    assert.equal(pitCommand.drs, false, "pit autopilot must keep DRS closed");

    const guestProgressBeforePit = guestDriver.covered;
    for (let tick = 0; tick < 2400 && driver.pitPhase !== "service"; tick++) {
      driver.lastInputAt = Date.now();
      guestDriver.lastInputAt = Date.now();
      guestDriver.input = { throttle: 1, brake: 0, steer: 0 };
      internals.tickRace();
    }
    assert.equal(driver.pitPhase, "service",
      `auto-pit should reach service: ${JSON.stringify({
        phase: driver.pitPhase,
        progress: internals.raceTrack.progress(driver.car.x, driver.car.y),
        offset: internals.raceTrack.offset(driver.car.x, driver.car.y),
        speed: driver.car.telemetry.speed,
        pitBox: driver.pitBox,
        entry: pit.entry,
        exit: pit.exit,
      })}`);
    assert.equal(room.state.phase, "racing", "a pit request must not terminate the shared race room");
    assert.ok([driver.car.x, driver.car.y, driver.car.vx, driver.car.vy].every(Number.isFinite),
      "auto-pit physics must remain finite");
    assert.ok([guestDriver.car.x, guestDriver.car.y, guestDriver.car.vx, guestDriver.car.vy].every(Number.isFinite),
      "auto-pit must not corrupt another client's car physics");
    assert.ok(guestDriver.covered > guestProgressBeforePit,
      "other clients must continue moving while auto-pit is active");

    const guestProgressBeforeService = guestDriver.covered;
    for (let tick = 0; tick < 100 && driver.pitPhase === "service"; tick++) {
      driver.lastInputAt = Date.now();
      guestDriver.lastInputAt = Date.now();
      internals.tickRace();
    }
    assert.equal(driver.pitPhase, "out", "auto-pit service should complete on room ticks");
    assert.equal(driver.car.compound, "medium");
    assert.equal(player.pitPhase, "out", "the completed pit state should be replicated");
    assert.ok(guestDriver.covered > guestProgressBeforeService,
      "the other client should keep advancing through the complete pit-service timer");
    assert.equal(room.state.phase, "racing", "pit service should not interrupt the shared race");

    driver.pitPhase = null;
    await new Promise(resolve => setTimeout(resolve, 12));
    host.send("race:input", {
      sequence: 3,
      throttle: 0,
      brake: 1,
      steer: 0,
      autoPit: false,
      handlingMode: "arcade",
    });
    await waitFor(() => !driver.autoPit, "The server did not accept the manual pit input.");
    host.send("race:pit-request", { compound: "hard" });
    await waitFor(() => driver.pitRequest === "hard", "The server did not accept the manual pit request.");
    assert.equal(player.pitRequest, "hard", "the manual pit request should be replicated to clients");
    const manualEntry = pit.boxStart - 7;
    const [manualEntryX, manualEntryY] = internals.raceTrack.point(manualEntry, pit.side * pit.lane);
    Object.assign(driver.car, {
      x: manualEntryX,
      y: manualEntryY,
      heading: internals.raceTrack.heading(manualEntry),
      vx: 0,
      vy: 0,
    });
    driver.lastProgress = internals.raceTrack.progress(manualEntryX, manualEntryY);
    driver.lastInputAt = Date.now();
    internals.tickRace();
    assert.equal(driver.pitPhase, "in",
      "the server should recognize a manual pit-lane entry from authoritative car position");
    driver.pitBox = pit.boxStart;
    const [manualBoxX, manualBoxY] = internals.raceTrack.point(driver.pitBox, pit.side * pit.boxOffset);
    Object.assign(driver.car, {
      x: manualBoxX,
      y: manualBoxY,
      heading: internals.raceTrack.heading(driver.pitBox),
      vx: 0,
      vy: 0,
    });
    driver.car.telemetry.speed = 0;
    driver.car.wheelOmega.fill(0);
    driver.lastProgress = internals.raceTrack.progress(manualBoxX, manualBoxY);
    driver.lastInputAt = Date.now();
    internals.tickRace();
    assert.equal(driver.pitPhase, "service", "manual pit mode should service when stopped in the assigned box");
    const guestProgressBeforeManual = guestDriver.covered;
    for (let tick = 0; tick < 100 && driver.pitPhase === "service"; tick++) {
      driver.lastInputAt = Date.now();
      guestDriver.lastInputAt = Date.now();
      internals.tickRace();
    }
    assert.equal(driver.pitPhase, "out", "manual pit service should complete on room ticks");
    assert.equal(driver.car.compound, "hard");
    assert.ok(guestDriver.covered > guestProgressBeforeManual,
      "the other client should keep advancing through manual pit service");

    driver.pitPhase = null;
    driver.pitRequest = null;
    driver.finished = true;
    const coveredAtFinish = driver.covered;
    const distanceAtFinish = driver.car.distance;
    host.send("race:avatar", {
      x: driver.avatarX,
      y: driver.avatarY,
      heading: driver.avatarHeading,
      suit: driver.avatarSuit,
      emote: "",
      moving: false,
      onFoot: true,
    });
    await waitFor(() => driver.onFoot, "A finished driver must be allowed to leave the car.");
    host.send("race:avatar", {
      x: driver.avatarX,
      y: driver.avatarY,
      heading: driver.avatarHeading,
      suit: driver.avatarSuit,
      emote: "",
      moving: false,
      onFoot: false,
    });
    await waitFor(() => !driver.onFoot, "A finished driver must be allowed to re-enter the car.");
    host.send("race:input", {
      sequence: 4,
      throttle: 1,
      brake: 0,
      steer: 0,
      drs: true,
      ers: true,
      ersMode: "overtake",
      handlingMode: "arcade",
    });
    await waitFor(() => driver.car.distance > distanceAtFinish + 0.1,
      "A finished driver must remain controllable until the whole race ends.");
    assert.equal(driver.covered, coveredAtFinish, "post-finish driving must not change classified race distance");

    await guest.leave();
    await host.leave();
  });

  it("re-grids qualifying results fastest-first using the same staggered slots", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", {
      settings: { ...settings, circuit: "" },
    });
    const host = await colyseus.connectTo(room, { identity: "identity-regrid-host", name: "Host" });
    const guest = await colyseus.connectTo(room, { identity: "identity-regrid-guest", name: "Guest" });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The race grid was not prepared.");
    await forceDriversIntoCars(room, host);
    advanceCountdown(room);
    assert.equal(room.state.phase, "qualifying");

    const internals = room as unknown as {
      drivers: Map<string, { gridSlot: number; car: { x: number; y: number; heading: number }; bestLapTime: number }>;
      beginCountdown(qualifyingComplete: boolean): void;
    };
    const [hostDriver, guestDriver] = Array.from(internals.drivers.values());
    hostDriver.bestLapTime = 92;
    guestDriver.bestLapTime = 88;
    internals.beginCountdown(true);

    assert.deepEqual([guestDriver.car.x, guestDriver.car.y, guestDriver.car.heading], [0, -90, 0]);
    assert.ok(Math.abs(hostDriver.car.x + 10) < 1e-9);
    assert.ok(Math.abs(hostDriver.car.y + 87.4) < 1e-9);
    assert.equal(room.state.racePlayers.get(guest.sessionId)?.position, 1);
    assert.equal(room.state.racePlayers.get(host.sessionId)?.position, 2);
    assert.equal(guestDriver.gridSlot, 0);
    assert.equal(hostDriver.gridSlot, 1);

    await guest.leave();
    await host.leave();
  });

  it("disables car-to-car collisions during qualifying", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });
    const host = await colyseus.connectTo(room, { identity: "identity-qualify-host", name: "Host" });
    const guest = await colyseus.connectTo(room, { identity: "identity-qualify-guest", name: "Guest" });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The race grid was not prepared.");
    await forceDriversIntoCars(room, host);
    advanceCountdown(room);
    await waitFor(() => room.state.phase === "qualifying", "Qualifying did not start.");

    const internals = room as unknown as {
      drivers: Map<string, { car: { x: number; y: number; vx: number; vy: number; heading: number } }>;
      simulateDrivers(): void;
    };
    const [first, second] = Array.from(internals.drivers.values());
    const start = { x: first.car.x, y: first.car.y, heading: first.car.heading };
    for (const driver of [first, second]) {
      Object.assign(driver.car, { ...start, vx: 0, vy: 0 });
    }

    internals.simulateDrivers();
    assert.deepEqual(
      [first.car.x, first.car.y],
      [second.car.x, second.car.y],
    );
    await guest.leave();
    await host.leave();
  });

  it("lets the host ban a player and rejects that identity afterward", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });
    const host = await colyseus.connectTo(room, { identity: "identity-host-0003", name: "Host" });
    const guest = await colyseus.connectTo(room, { identity: "identity-banned-01", name: "Guest" });
    guest.onMessage("lobby:kicked", () => {});

    host.send("lobby:ban", { sessionId: guest.sessionId });
    await waitFor(() => !room.state.players.has(guest.sessionId), "Banned player was not removed.");
    await assert.rejects(
      colyseus.connectTo(room, { identity: "identity-banned-01", name: "Guest" }),
    );
    await host.leave();
  });

  it("caps a lobby at 22 players", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });
    const clients = [];
    for (let index = 0; index < 22; index++) {
      clients.push(await colyseus.connectTo(room, {
        identity: `capacity-id-${index.toString().padStart(2, "0")}`,
        name: `Driver ${index + 1}`,
      }));
    }

    assert.equal(room.clients.length, 22);
    await assert.rejects(colyseus.connectTo(room, {
      identity: "capacity-overflow",
      name: "One too many",
    }));
    await Promise.all(clients.map(client => client.leave()));
  });

  it("rejects invalid circuit and lap settings", async () => {
    assert.throws(() => normalizeLobbySettings({ ...settings, circuit: "unknown" }), /circuit/i);
    assert.throws(() => normalizeLobbySettings({ ...settings, laps: 0 }), /laps/i);
  });

  it("reserves a seat by six-digit invite code", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });
    const reservationResponse = await colyseus.http.post("/api/lobbies/join", {
      body: {
        code: room.state.code,
        identity: "identity-invite-001",
        name: "Invite",
      },
    });
    const guest = await colyseus.sdk.consumeSeatReservation(reservationResponse.data, LobbyState);
    await guest.waitForInitialState();

    assert.equal(guest.state.players.get(guest.sessionId)?.name, "Invite");
    await guest.leave();
  });

  it("replicates on-foot movement during boarding", async () => {
    const room = await colyseus.createRoom<LobbyRoom>("race_lobby", { settings });
    const host = await colyseus.connectTo(room, { identity: "identity-host-avatar", name: "Host" });
    const guest = await colyseus.connectTo(room, { identity: "identity-guest-avatar", name: "Guest" });
    let remoteAvatar: { x: number; heading: number; moving: boolean } | null = null;
    guest.onMessage("race:avatar-state", sample => { remoteAvatar = sample; });
    host.send("lobby:start");
    await waitFor(() => room.state.phase === "boarding", "The lobby did not enter boarding.");

    const player = room.state.racePlayers.get(host.sessionId);
    assert.ok(player);
    const expectedX = player.avatarX + 0.5;
    host.send("race:avatar", {
      x: expectedX,
      y: player.avatarY,
      heading: Math.PI / 2,
      suit: player.avatarSuit,
      emote: "",
      moving: true,
      onFoot: true,
    });

    await waitFor(() => room.state.racePlayers.get(host.sessionId)?.avatarX === expectedX,
      "The server did not apply the host's on-foot position.");
    await waitFor(() => remoteAvatar?.x === expectedX, "The guest did not receive the host's on-foot position.");
    const updated = room.state.racePlayers.get(host.sessionId);
    assert.equal(updated?.avatarHeading, Math.PI / 2);
    assert.equal(updated?.avatarMoving, true);
    assert.equal(remoteAvatar?.heading, Math.PI / 2);
    assert.equal(remoteAvatar?.moving, true);

    await host.leave();
    await guest.leave();
  });
});
