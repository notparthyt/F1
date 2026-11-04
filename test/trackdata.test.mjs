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
  assert.equal(CIRCUIT_TRACK_STYLE.nurburgring.boundary, true);
  assert.equal(CIRCUIT_TRACK_STYLE.nurburgring.wallOffset, 40);
  for (const key of ['singapore', 'buddh', 'nurburgring']) {
    assert.ok(CIRCUITS[key].points.length >= 200, `${key} keeps a detailed sourced layout trace`);
  }
  assert.deepEqual(CIRCUITS.buddh.points.slice(0, 2), [0, 0], 'the OSM centerline begins at its mapped start/finish node');
  assert.deepEqual(CIRCUIT_ELEVATION_PROFILES.singapore, [[0, 0], [.05, 0], [.15, 0], [.28, 2], [.40, 4], [.52, 1], [.68, 0], [.85, 1], [.95, 0]]);
  assert.deepEqual(CIRCUIT_ELEVATION_PROFILES.buddh, [[0, 0], [.11, 4], [.18, 14], [.35, -4], [.55, 6], [.72, -1], [.85, -8], [.95, -2]]);
  assert.equal(CIRCUIT_TRACK_STYLE['yas-marina'].runoffSurface, 'painted');
  for (const key of ['singapore', 'buddh', 'nurburgring']) {
    assert.ok(CIRCUITS[key].drs.length > 0, `${key} has DRS zones`);
  }
  const singapore = CIRCUITS.singapore;
  const signedArea = singapore.points.reduce((area, _, index, points) => {
    if (index % 2 !== 0) return area;
    const next = (index + 2) % points.length;
    return area + points[index] * points[next + 1] - points[next] * points[index + 1];
  }, 0) / 2;
  assert.deepEqual(singapore.points.slice(0, 2), [688.6, 116.4], 'reversing the trace keeps the start/finish anchor');
  assert.ok(signedArea > 0, 'Singapore follows the direction shown on the official F1 map');
  assert.deepEqual(singapore.drs, [[.935, .995]]);
  assert.deepEqual(singapore.sausageKerbs, [[.16, .18], [.41, .43], [.64, .66], [.9, .92]]);
  assert.deepEqual(singapore.paintedKerbs, [[.28, .3], [.52, .54], [.8, .82]]);
  assert.equal(singapore.pitConfig.side, 1);
  assert.deepEqual(singapore.runoffSections, [{ start: .59, end: .65, surface: 'sand' }]);
});
