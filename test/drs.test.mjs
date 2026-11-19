import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, DEFAULT_CAR } from '../src/physics.mjs';
import { createStadiumTrack } from '../src/track.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createRace, DEFAULT_GRID } from '../src/race.mjs';
import { createTimeTrial } from '../src/trial.mjs';

const track = createStadiumTrack({ halfStraight: 220, radius: 90, roadWidth: 15 });
function stadiumPoint(progress) {
  const straight = 2 * track.halfStraight, arc = Math.PI * track.radius;
  const s = ((progress % track.length) + track.length) % track.length;
  if (s < straight) return [s - track.halfStraight, -track.radius];
  if (s < straight + arc) {
    const angle = (s - straight) / track.radius - Math.PI / 2;
    return [track.halfStraight + track.radius * Math.cos(angle), track.radius * Math.sin(angle)];
  }
  if (s < 2 * straight + arc) return [track.halfStraight - (s - straight - arc), track.radius];
  const angle = (s - 2 * straight - arc) / track.radius + Math.PI / 2;
  return [-track.halfStraight + track.radius * Math.cos(angle), track.radius * Math.sin(angle)];
}

test('an open DRS flap cuts drag and rear downforce and raises top speed', () => {
  const run = drs => { const car = createCar(); for (let i = 0; i < 240 * 60; i++) step(car, { throttle: 1, drs }); return car; };
  const shut = run(false), open = run(true);
  assert.equal(shut.drs, 0); assert.equal(open.drs, 1);
  const gain = (open.telemetry.speed - shut.telemetry.speed) * 3.6;
  assert.ok(gain > 8 && gain < 20, `top speed gain ${gain.toFixed(1)} km/h`);
  // Same speed, flap open vs shut: less drag and downforce, balance forward.
  const at = drs => { const car = createCar(); car.vx = 80; car.drs = drs ? 1 : 0; step(car, { throttle: 1, drs }); return car.telemetry; };
  const a = at(false), b = at(true);
  assert.ok(Math.abs(b.drag / a.drag - (1 - DEFAULT_CAR.drsDragLoss)) < 0.01);
  assert.ok(Math.abs(b.downforce / a.downforce - (1 - DEFAULT_CAR.drsDownforceLoss)) < 0.01);
  assert.ok(Math.abs(b.downforce * b.frontShare - a.downforce * a.frontShare) < 0.01 * a.downforce, 'front downforce unchanged');
});

test('the flap moves at its actuation rate and the brakes close it', () => {
  const car = createCar(); car.vx = 80;
  for (let i = 0; i < 30; i++) step(car, { throttle: 1, drs: true });
  assert.ok(Math.abs(car.drs - 0.5) < 1e-9, 'half open after 1/8 s');
  for (let i = 0; i < 30; i++) step(car, { throttle: 1, drs: true });
  assert.equal(car.drs, 1);
  for (let i = 0; i < 60; i++) step(car, { brake: 0.5, drs: true });
  assert.equal(car.drs, 0, 'braking shuts it even while requested');
});

// Player (entry 0) starts 8 m behind one opponent.
function behind(options = {}, extra = {}) {
  return createRace(track, { grid: [DEFAULT_GRID[0]], options, ...extra });
}
function run(race, seconds, input = () => null) {
  const opened = [false, false], allowed = [false, false];
  for (let i = 0; i < seconds * 240; i++) {
    race.advance(1 / 240, input(race), track.surfaceAt, track.barrierAt);
    race.entries.forEach((e, k) => { opened[k] ||= e.car.drs > 0.5; allowed[k] ||= e.drsAllowed; });
  }
  return { opened, allowed };
}

test('active aero is available in marked zones on every lap without a one-second-gap restriction', () => {
  const race = behind(), [player, rival] = race.entries, zone = race.drsZones[0];
  const playerProgress = zone.start + 10, rivalProgress = zone.start + 260;
  [player.car.x, player.car.y] = stadiumPoint(playerProgress);
  [rival.car.x, rival.car.y] = stadiumPoint(rivalProgress);
  player.last = player.covered = playerProgress;
  rival.last = rival.covered = rivalProgress;
  assert.ok(Math.abs(rival.covered - player.covered) / 20 > 1, 'cars are more than one second apart at minimum speed');
  race.advance(1 / 240, { throttle: 1, drs: true }, track.surfaceAt, track.barrierAt);
  assert.equal(player.drsAllowed, true);
  assert.equal(rival.drsAllowed, true);
  assert.ok(player.car.drs > 0);

  [player.car.x, player.car.y] = stadiumPoint(zone.end + 20);
  race.advance(1 / 240, { throttle: 1, drs: true }, track.surfaceAt, track.barrierAt);
  assert.equal(player.drsAllowed, false);
  assert.equal(player.command.drs, false);
});

test('DRS is absent when the race turns it off', () => {
  const off = behind({}, { drs: false });
  assert.equal(off.drsZones.length, 0);
  assert.deepEqual(run(off, 20).opened, [false, false]);
});

test('a driving player opens DRS only on request', () => {
  for (const want of [false, true]) {
    const race = behind();
    const { opened } = run(race, 3, () => ({ ...race.aiCommand(0), drs: want }));
    assert.equal(opened[0], want);
  }
});

test('time trials allow manually requested active aero only in marked zones', () => {
  const monza = createCircuitTrack(CIRCUITS.monza), trial = createTimeTrial(monza);
  const [zoneStart, zoneEnd] = monza.drsZones[0];
  trial.placePlayerAt(...monza.point(zoneStart + 10, 0), monza.heading(zoneStart + 10));
  trial.advance(1 / 240, { throttle: 1, drs: true });
  assert.equal(trial.entries[0].drsAllowed, true);
  assert.ok(trial.car.drs > 0);
  trial.placePlayerAt(...monza.point(zoneEnd + 30, 0), monza.heading(zoneEnd + 30));
  trial.advance(1 / 240, { throttle: 1, drs: true });
  assert.equal(trial.entries[0].drsAllowed, false);
  assert.equal(trial.entries[0].command.drs, false);
});

test('circuits without zone data get DRS zones on their longest straights, Monza including the main straight', () => {
  const monza = createCircuitTrack({ ...CIRCUITS.monza, drs: null });
  const race = createRace(monza, { grid: [] });
  assert.equal(race.drsZones.length, 2);
  const length = monza.length, span = z => ((z.end - z.start) % length + length) % length;
  assert.ok(race.drsZones.some(z => ((0 - z.start) % length + length) % length <= span(z)), 'a zone spans the start line');
  for (const z of race.drsZones) assert.ok(span(z) >= 390);
});

test('configured circuit DRS zones each lie on a straight', () => {
  const count = { monaco: 1, imola: 1, monza: 2, spa: 2, silverstone: 2, bahrain: 3, jeddah: 3, 'red-bull-ring': 3, mexico: 3 };
  for (const [key, def] of Object.entries(CIRCUITS)) {
    const t = createCircuitTrack(def), zones = createRace(t, { grid: [] }).drsZones, L = t.length, k = t.samples.lineCurvature;
    assert.equal(zones.length, def.drs.length, key);
    if (count[key]) assert.equal(zones.length, count[key], key);
    for (const z of zones) {
      const span = ((z.end - z.start) % L + L) % L;
      assert.ok(span > 250 && span < 1000, `${key} zone ${span.toFixed(0)} m`);
      // The racing line through the zone bends no tighter than 80 m radius (the
      // tightest is Zandvoort's flat-out banked final corner, 87 m, where the
      // flap is opened before the corner).
      for (let d = 0; d <= span; d += 2) assert.ok(Math.abs(k[Math.floor(((z.start + d) % L) / L * k.length)]) < 1 / 80, `${key} zone at ${z.start.toFixed(0)}+${d}`);
      assert.ok(Math.abs(((z.start - z.detection) % L + L) % L - 150) < 1e-6, 'detection 150 m before');
    }
  }
});
