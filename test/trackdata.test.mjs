import test from 'node:test';
import assert from 'node:assert/strict';
import { startingTyreForTrack } from '../src/trackdata.mjs';

test('race starting tyres vary with the selected circuit and default safely for the stadium', () => {
  assert.equal(startingTyreForTrack('bahrain'), 'hard');
  assert.equal(startingTyreForTrack('monaco'), 'soft');
  assert.equal(startingTyreForTrack('monza'), 'medium');
  assert.equal(startingTyreForTrack(null), 'medium');
});
