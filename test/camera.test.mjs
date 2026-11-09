import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { cameraShakeRotation, clampLook360Distance, constrainLook360Camera, LOOK360_MIN_DISTANCE } from '../src/camera.mjs';
import { createCar } from '../src/physics.mjs';

test('360 camera zoom cannot enter the car body', () => {
  assert.equal(clampLook360Distance(0), LOOK360_MIN_DISTANCE);
  assert.equal(clampLook360Distance(3), LOOK360_MIN_DISTANCE);
  assert.equal(clampLook360Distance(8), 8);
  assert.equal(clampLook360Distance(100), 14);
  assert.throws(() => clampLook360Distance(Infinity), RangeError);
});

test('360 camera stays on the track side of a barrier', () => {
  const target = new THREE.Vector3(0, 1, 0), desired = new THREE.Vector3(10, 2, 0);
  const camera = constrainLook360Camera(target, desired, (x, y) => x > 5 ? { depth: x - 5 } : null);
  assert.ok(camera.x <= 5 && camera.x > 4.9);
  assert.equal(camera.y, 1 + (camera.x / 10));
});

test('360 camera detects barriers along the orbit, not just at its endpoint', () => {
  const target = new THREE.Vector3(0, 1, 0), desired = new THREE.Vector3(10, 1, 0);
  const camera = constrainLook360Camera(target, desired, (x) => x > 4 && x < 6 ? { depth: 1 } : null);
  assert.ok(camera.x <= 4 && camera.x > 3.9);
});

test('360 camera remains above the ground surface', () => {
  const target = new THREE.Vector3(0, 1, 0), desired = new THREE.Vector3(10, 0, 0);
  const camera = constrainLook360Camera(target, desired, () => null, x => x > 5 ? 1 : 0);
  assert.ok(camera.x <= 5 && camera.x > 4.9);
  assert.ok(camera.y >= (camera.x > 5 ? 1 : 0) + 0.25);
});

test('onboard camera shake is rotational, elevation-aware, and responds to impacts', () => {
  const car = createCar();
  car.telemetry.speed = 55;
  const level = cameraShakeRotation(car, 1, 'tcam');
  const uphill = cameraShakeRotation(car, 1, 'tcam', 0.2, 0);
  assert.notDeepEqual(uphill, level);

  const visorBaseline = cameraShakeRotation(car, 1, 'visor');
  car.impact = { speed: 40, time: car.time };
  const impact = cameraShakeRotation(car, 1, 'visor');
  assert.ok(Math.abs(impact.pitch) > Math.abs(visorBaseline.pitch));
  assert.ok(Object.values(impact).every(Number.isFinite));
});
