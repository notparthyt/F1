import test from 'node:test';
import assert from 'node:assert/strict';
import { carModelForGraphics, driverModelForGraphics } from '../src/modelassets.mjs';

test('graphics presets select a car model with an intact wheel and body hierarchy', () => {
  for (const mode of ['ultra', 'max', 'high']) assert.equal(carModelForGraphics(mode), './models/redbull22.glb');
  for (const mode of ['default', 'mid']) assert.equal(carModelForGraphics(mode), './models/redbull22-optimized.glb');
  assert.equal(carModelForGraphics('max-optimized'), './models/redbull22-optimized.glb');
});

test('standard, medium, and max-optimized presets use the supplied animated driver', () => {
  const optimized = './models/Realistic_Male_F1_Racer_Rigged_Animated-Optimized.glb';
  for (const mode of ['default', 'mid', 'max-optimized']) assert.equal(driverModelForGraphics(mode), optimized);
  assert.equal(driverModelForGraphics('high'), './models/Realistic_Male_F1_Racer_Rigged_Animated.gltf');
});

test('unknown graphics presets are rejected', () => {
  assert.throws(() => carModelForGraphics('unknown'), RangeError);
  assert.throws(() => driverModelForGraphics('unknown'), RangeError);
});
