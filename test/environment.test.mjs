import test from 'node:test';
import assert from 'node:assert/strict';
import { daylightForRace } from '../src/environment.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { NIGHT_CIRCUITS } from '../src/trackdata.mjs';

test('Singapore lighting stays at night throughout the race', () => {
  for (const progress of [0, 0.25, 0.5, 0.75, 1])
    assert.ok(daylightForRace('singapore', progress) < 0.05);
});

test('Yas Marina transitions from evening to night without starting in daytime', () => {
  assert.ok(daylightForRace('yas-marina', 0) > 0.35);
  assert.ok(daylightForRace('yas-marina', 0.5) < daylightForRace('yas-marina', 0));
  assert.ok(daylightForRace('yas-marina', 1) < 0.04);
});

test('all other daytime circuits transition from day to night', () => {
  for (const key of Object.keys(CIRCUITS)) {
    if (key === 'yas-marina') continue;
    if (NIGHT_CIRCUITS.has(key)) {
      assert.ok(daylightForRace(key, 0) < 0.05 && daylightForRace(key, 1) < 0.05, `${key} remains a night race`);
    } else {
      assert.ok(daylightForRace(key, 0) > 0.9, `${key} starts in daytime`);
      assert.ok(daylightForRace(key, 1) < 0.04, `${key} transitions into night`);
    }
  }
  assert.equal(daylightForRace('monza', 2), daylightForRace('monza', 1));
  assert.throws(() => daylightForRace('monza', NaN), RangeError);
});
