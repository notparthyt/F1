import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT, createCar, step } from '../src/physics.mjs';
import {
  captureNetworkCarState,
  replayNetworkInputs,
  restoreNetworkCarState,
  stepNetworkCar,
} from '../src/network-prediction.mjs';

test('network car snapshots restore the dynamic physics state and input acknowledgement', () => {
  const source = createCar({ altitudeMetres: 350 });
  source.x = 12.5;
  source.y = -7.25;
  source.heading = 0.8;
  source.vx = 31;
  source.vy = -2;
  source.wheelOmega.splice(0, 4, 90, 92, 94, 96);
  source.slipAngle.splice(0, 4, 0.01, 0.02, -0.01, -0.02);
  source.body.roll = 0.04;
  source.tireTemp[2].surface = 102;
  source.tireWear[1] = 0.27;
  source.ers.charge = 1_234_567;
  source.lastDamageTime = -Infinity;

  const snapshot = captureNetworkCarState(source, 18);
  const restored = createCar({ altitudeMetres: 0 });
  assert.equal(restoreNetworkCarState(restored, snapshot), 18);
  assert.deepEqual(captureNetworkCarState(restored, 18), snapshot);
});

test('network car snapshot validation rejects malformed physics state', () => {
  const car = createCar();
  const snapshot = captureNetworkCarState(car, -1);
  snapshot.wheelOmega = [1, 2];

  assert.throws(() => restoreNetworkCarState(car, snapshot), /wheelOmega must contain four finite values/);
});

test('network prediction replays only inputs newer than the server acknowledgement', () => {
  const predicted = createCar();
  const expected = createCar();
  const history = [
    { sequence: 3, input: { throttle: 1, brake: 0, steer: 0.2 } },
    { sequence: 4, input: { throttle: 1, brake: 0, steer: -0.1 } },
  ];

  step(expected, history[1].input, FIXED_DT);
  assert.deepEqual(replayNetworkInputs(predicted, history, 3, () => 1, null), [history[1]]);
  assert.equal(predicted.x, expected.x);
  assert.equal(predicted.y, expected.y);
  assert.equal(predicted.heading, expected.heading);
});

test('network prediction uses the same fixed-step physics as the authoritative simulation', () => {
  const predicted = createCar();
  const expected = createCar();
  const input = { throttle: 0.8, brake: 0, steer: 0.15, ersMode: 'normal' };

  stepNetworkCar(predicted, input, () => 1, null);
  step(expected, input, FIXED_DT, () => 1, null);
  assert.equal(predicted.x, expected.x);
  assert.equal(predicted.y, expected.y);
  assert.equal(predicted.heading, expected.heading);
});
