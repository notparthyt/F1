import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createRacingLineMesh, worldDetailsInRadius } from '../src/world3d.mjs';

test('world detail preloading includes chunks within a circular radius and their cell bounds', () => {
  const center = new THREE.Vector3(0, 0, 0);
  const close = { mesh: {}, center: new THREE.Vector3(500, 0, 0), radius: 100 };
  const edge = { mesh: {}, center: new THREE.Vector3(550, 0, 0), radius: 0 };
  const distant = { mesh: {}, center: new THREE.Vector3(551, 0, 0), radius: 0 };
  const world = { userData: { detailLod: [close, edge, distant] } };

  assert.deepEqual(worldDetailsInRadius(world, center, 550), [close, edge]);
});

test('world detail preloading rejects invalid radius inputs', () => {
  assert.throws(() => worldDetailsInRadius({ userData: {} }, new THREE.Vector3(), -1), RangeError);
});

test('racing-line visualization uses sparse directional arrows with one of the track colors', () => {
  const points = Array.from({ length: 201 }, (_, i) => ({ x: i * 2, y: 0, h: 0, curvature: 0 }));
  const arrows = createRacingLineMesh(points, ['#39e0ae', '#ffd166', '#ff6b5f']);
  const positions = arrows.geometry.getAttribute('position'), colors = arrows.geometry.getAttribute('color');

  assert.equal(arrows.name, 'racing-line-arrows');
  assert.ok(positions.count > 0);
  assert.ok(positions.count < points.length * 2, 'arrows are sparse instead of one continuous strip');
  assert.equal(colors.count, positions.count);
  assert.equal(arrows.geometry.index.count % 3, 0);
  assert.ok([...colors.array].some(channel => channel > 0));
});
