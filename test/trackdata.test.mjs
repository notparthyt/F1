import test from 'node:test';
import assert from 'node:assert/strict';
import { CIRCUIT_ELEVATION_PROFILES, CIRCUIT_TRACK_STYLE, startingTyreForTrack } from '../src/trackdata.mjs';
import { CIRCUITS } from '../src/circuits.mjs';

test('race starting tyres vary with the selected circuit and default safely for the stadium', () => {
  assert.equal(startingTyreForTrack('bahrain'), 'hard');
  assert.equal(startingTyreForTrack('monaco'), 'soft');
  assert.equal(startingTyreForTrack('monza'), 'medium');
  assert.equal(startingTyreForTrack(null), 'medium');
});

test('every circuit has a trackside style and the new layouts retain their venue-specific boundaries', () => {
  assert.equal(Object.keys(CIRCUITS).length, 21);
  assert.equal(Object.hasOwn(CIRCUITS, 'rwanda'), false);
  for (const key of Object.keys(CIRCUITS)) {
    const style = CIRCUIT_TRACK_STYLE[key];
    assert.ok(style, `${key} has a visual track style`);
    assert.ok(style.wallOffset > (CIRCUITS[key].roadWidth ?? 13) / 2, `${key} barrier clears the road`);
    assert.ok(style.runoffSurface, `${key} has a runoff surface`);
  }
  assert.equal(CIRCUIT_TRACK_STYLE.monaco.grassWidth, 0);
  assert.equal(CIRCUIT_TRACK_STYLE.singapore.urban, true);
  assert.equal(CIRCUIT_TRACK_STYLE.singapore.night, true);
  assert.equal(CIRCUIT_TRACK_STYLE.buddh.runoffSurface, 'sand');
  assert.equal(CIRCUIT_TRACK_STYLE.nurburgring.runoffSurface, 'gravel');
  for (const key of ['singapore', 'buddh', 'nurburgring']) {
    assert.ok(CIRCUITS[key].points.length >= 200, `${key} keeps a detailed sourced layout trace`);
  }
  assert.deepEqual(CIRCUIT_ELEVATION_PROFILES.singapore, [[0, 0], [.15, 1], [.32, 0], [.48, 1], [.60, 4], [.72, 2], [.85, 0], [.95, 0]]);
  assert.deepEqual(CIRCUIT_ELEVATION_PROFILES.buddh, [[0, 0], [.11, 4], [.18, 14], [.35, -4], [.55, 6], [.72, -1], [.85, -8], [.95, -2]]);
  assert.equal(CIRCUIT_TRACK_STYLE['yas-marina'].runoffSurface, 'painted');
  for (const key of ['singapore', 'buddh', 'nurburgring']) {
    assert.ok(CIRCUITS[key].drs.length > 0, `${key} has DRS zones`);
  }
});
