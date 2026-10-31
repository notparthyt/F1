import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createTimeTrial } from '../src/trial.mjs';
import { canExitVehicle, moveOnFoot, moveOnFootColliding, onFootEmoteAt, ON_FOOT_EMOTES, ON_FOOT_WALK_SPEED, shouldAutoPauseOnBlur, shouldShowSeatedDriver } from '../src/onfoot.mjs';

test('on-foot W/S movement follows camera forward and backward at any heading', () => {
  const start = { x: 2, y: 3 };
  assert.deepEqual(moveOnFoot(start, 0, { forward: 1 }, 1), { x: 2 + ON_FOOT_WALK_SPEED, y: 3 });
  const forward = moveOnFoot(start, Math.PI / 2, { forward: 1 }, 1);
  const backward = moveOnFoot(start, Math.PI / 2, { forward: -1 }, 1);
  assert.ok(Math.abs(forward.x - start.x) < 1e-12);
  assert.equal(forward.y, start.y + ON_FOOT_WALK_SPEED);
  assert.ok(Math.abs(backward.x - start.x) < 1e-12);
  assert.equal(backward.y, start.y - ON_FOOT_WALK_SPEED);
  const diagonal = moveOnFoot(start, 0, { forward: 1, strafe: 1 }, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x - start.x, diagonal.y - start.y) - ON_FOOT_WALK_SPEED) < 1e-12);
  assert.deepEqual(start, { x: 2, y: 3 });
});

test('numbered emotes select gestures and never select locomotion', () => {
  assert.equal(onFootEmoteAt(0), ON_FOOT_EMOTES[0]);
  assert.equal(onFootEmoteAt(ON_FOOT_EMOTES.length - 1), ON_FOOT_EMOTES.at(-1));
  assert.equal(onFootEmoteAt(-1), null);
  assert.equal(onFootEmoteAt(ON_FOOT_EMOTES.length), null);
  assert.ok(ON_FOOT_EMOTES.every(name => !/walk|run/i.test(name)));
});

test('on-foot movement stops at barriers and the car while sliding along barriers', () => {
  const barrierAt = x => x > 1 ? { depth: x - 1 } : null;
  const start = { x: 0, y: 0 };
  const blocked = moveOnFootColliding(start, 0, { forward: 1 }, 1, { barrierAt });
  assert.deepEqual(blocked, start);
  const slid = moveOnFootColliding(start, 0, { forward: 1, strafe: 1 }, 1, { barrierAt });
  assert.equal(slid.x, 0);
  assert.ok(slid.y < 0);
  const carBlocked = moveOnFootColliding(start, 0, { forward: 1 }, 0.5, {
    car: { x: 0, y: 0, heading: 0 },
  });
  assert.deepEqual(carBlocked, start);
});

test('only finished races or completed practice laps allow exiting the car', () => {
  assert.equal(canExitVehicle({ race: true, playerFinished: false, completedLaps: 10 }), false);
  assert.equal(canExitVehicle({ race: true, playerFinished: true }), true);
  assert.equal(canExitVehicle({ race: false, completedLaps: 0 }), false);
  assert.equal(canExitVehicle({ race: false, completedLaps: 1 }), true);
});

test('seated driver stays visible in cockpit and is hidden only while on foot', () => {
  assert.equal(shouldShowSeatedDriver({ player: true, cockpit: true }), true);
  assert.equal(shouldShowSeatedDriver({ player: true, cockpit: false }), true);
  assert.equal(shouldShowSeatedDriver({ player: true, onFoot: true }), false);
  assert.equal(shouldShowSeatedDriver({ player: false, cockpit: true }), true);
  assert.equal(shouldShowSeatedDriver({ player: false, onFoot: true }), true);
});

test('finished-race on-foot mode is not auto-paused on blur', () => {
  assert.equal(shouldAutoPauseOnBlur({ onFoot: true, raceFinished: true }), false);
  assert.equal(shouldAutoPauseOnBlur({ onFoot: true, raceFinished: false }), true);
  assert.equal(shouldAutoPauseOnBlur({ onFoot: false, raceFinished: true }), true);
});

test('time-trial pit staging resets the car pose and progress baseline', () => {
  const track = createCircuitTrack(CIRCUITS.monza), trial = createTimeTrial(track);
  const progress = track.pit.boxStart, offset = track.pit.side * track.pit.boxOffset;
  const [x, y] = track.point(progress, offset), heading = track.heading(progress);
  trial.car.vx = 15; trial.car.vy = 4;
  assert.equal(trial.placePlayerAt(x, y, heading), track.progress(x, y));
  assert.deepEqual([trial.car.x, trial.car.y, trial.car.heading], [x, y, heading]);
  assert.deepEqual([trial.car.vx, trial.car.vy, trial.car.yawRate], [0, 0, 0]);
});
