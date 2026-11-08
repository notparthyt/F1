import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createRacingLineMesh, updateWorldDaylight, updateWorldWeather, worldDetailsInRadius, worldObstacleAt, worldBarrierAt } from '../src/world3d.mjs';

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

test('environment updates smoothly recolor the sky and reveal clouds by daylight', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 10, 0], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const world = { userData: { skyMesh: { geometry }, skyRadius: 10, clouds: { material: { opacity: 0 } } } };

  updateWorldDaylight(world, 0);
  const nightColors = [...geometry.attributes.color.array];
  assert.ok(world.userData.clouds.material.opacity > 0);
  updateWorldDaylight(world, 1);
  assert.notDeepEqual([...geometry.attributes.color.array], nightColors);
  assert.throws(() => updateWorldDaylight(world, NaN), RangeError);
});

test('night sky reveals stars and moon, while daytime reveals the sun and clouds', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const world = { userData: {
    skyMesh: { geometry }, skyRadius: 100, skyCenter: new THREE.Vector3(),
    clouds: { material: { opacity: 0 } },
    stars: { material: { opacity: 0 }, visible: false },
    skySun: { position: new THREE.Vector3(), material: { opacity: 0 }, visible: false },
    skyMoon: { position: new THREE.Vector3(), material: { opacity: 0 }, visible: false },
  } };
  updateWorldDaylight(world, 0);
  assert.ok(world.userData.stars.visible);
  assert.ok(world.userData.skyMoon.visible);
  assert.ok(!world.userData.skySun.visible);
  updateWorldDaylight(world, 1);
  assert.ok(!world.userData.stars.visible);
  assert.ok(!world.userData.skyMoon.visible);
  assert.ok(world.userData.skySun.visible);
});

test('scenery collision shapes block foot movement without blocking distant locations', () => {
  const world = { userData: { collisionShapes: [
    { type: 'circle', x: 2, y: 3, radius: 1 },
    { type: 'box', x: 10, y: 10, heading: Math.PI / 2, halfLength: 2, halfWidth: 1 },
  ] } };
  assert.equal(worldObstacleAt(world, 2.8, 3), true);
  assert.equal(worldObstacleAt(world, 10, 11.5), true);
  assert.equal(worldObstacleAt(world, -20, -20), false);
  const circleBarrier = worldBarrierAt(world, 2.2, 3, 0);
  assert.ok(Math.abs(circleBarrier.depth - 0.8) < 1e-12);
  assert.equal(circleBarrier.nx, 1);
  assert.equal(circleBarrier.ny, 0);
  const boxBarrier = worldBarrierAt(world, 10, 10, 0);
  assert.equal(boxBarrier.depth, 1);
  assert.ok(boxBarrier.nx > 0.99);
  assert.throws(() => worldObstacleAt(world, 0, 0, -1), RangeError);
});

test('wet weather makes asphalt less rough and slightly reflective', () => {
  const road = { roughness: 1, metalness: 0 };
  updateWorldWeather({ userData: { roadMaterials: [road] } }, 0.75);
  assert.ok(road.roughness < 1);
  assert.ok(road.metalness > 0);
  assert.throws(() => updateWorldWeather({ userData: { roadMaterials: [road] } }, NaN), RangeError);
});
