import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeather } from '../src/weather.mjs';

test('rain lowers grip, wets the circuit, then leaves a damp track while it clears', () => {
  const weather = createWeather({
    random: () => 0,
    options: { initialRainChance: 1, rainMin: 20, rainMax: 20, dryMin: 40, dryMax: 40 },
  });
  assert.equal(weather.state.label, 'Dry');

  const raining = weather.update(8);
  assert.equal(raining.label, 'Heavy rain');
  assert.ok(Math.abs(raining.wetness - 0.08) < 1e-12);
  assert.ok(raining.grip < 1);
  assert.ok(Math.abs(weather.surfaceGrip(0.9) - 0.9 * raining.grip) < 1e-12);

  weather.update(12);
  const clearing = weather.update(8);
  assert.equal(clearing.raining, false);
  assert.ok(clearing.wetness > 0);
  assert.ok(clearing.grip < 1);
});

test('dry conditions stay at full grip and nonpositive frame times do not advance weather', () => {
  const weather = createWeather({ random: () => 1, options: { initialRainChance: 0 } });
  const before = weather.state;
  assert.deepEqual(weather.update(0), before);
  assert.deepEqual(weather.update(-1), before);
  assert.equal(weather.surfaceGrip(0.7), 0.7);
});
