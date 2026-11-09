import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createCarSpray } from '../src/car-spray.mjs';

test('car spray emits moving world-space particles in wet conditions', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement() {
      const context = {
        globalCompositeOperation: 'source-over',
        createRadialGradient() { return { addColorStop() {} }; },
        fillRect() {},
      };
      return { width: 0, height: 0, getContext: () => context };
    },
  };
  try {
    const spray = createCarSpray(THREE, { maxParticles: 16, emissionRate: 120 });
    const scene = new THREE.Scene();
    const car = new THREE.Group();
    scene.add(car, spray.points);
    car.updateWorldMatrix(true, false);
    spray.update(1 / 60, { object: car, speed: 45, compound: 'wet', wetness: 1 });
    const positions = spray.points.geometry.attributes.position.array;
    assert.ok(positions.some(value => value !== 0));
    assert.ok(spray.points.geometry.attributes.aAge.array.some(value => value < 1));
    spray.clear();
    assert.ok(spray.points.geometry.attributes.aAge.array.every(value => value === 1));
    spray.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
