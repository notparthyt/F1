import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { worldDetailsInRadius } from '../src/world3d.mjs';

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
