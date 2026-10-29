import test from 'node:test';
import assert from 'node:assert/strict';
import { captureHandlingBaseline, applyHandlingMode, HANDLING_KEYS } from '../src/handling.mjs';
import { createCar } from '../src/physics.mjs';

test('arcade handling gives every entry the player settings and restores each baseline', () => {
  const entries = [{ car: createCar() }, { car: createCar() }, { car: createCar() }];
  entries[1].car.config.tireMu = 1.9;
  entries[2].car.config.corneringStiffness = 91000;
  const baseline = captureHandlingBaseline(entries);

  applyHandlingMode(entries, 'arcade', baseline);
  for (const key of HANDLING_KEYS)
    assert.ok(entries.every(({ car }) => car.config[key] === entries[0].car.config[key]), `${key} matches across the field`);

  applyHandlingMode(entries, 'sim', baseline);
  entries.forEach(({ car }, index) => {
    for (const key of HANDLING_KEYS) assert.equal(car.config[key], baseline[index][key], `${key} restores for entry ${index}`);
  });
});
