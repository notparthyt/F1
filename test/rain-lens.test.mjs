import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createRainLensEffect } from '../src/rain-lens.mjs';

test('rain lens renders a screen-space pass only when rain is present', () => {
  const effect = createRainLensEffect(THREE);
  const renderTargets = [], renders = [];
  const renderer = {
    getRenderTarget() { return null; },
    setRenderTarget(target) { renderTargets.push(target); },
    render(scene, camera) { renders.push([scene, camera]); },
  };
  const sourceScene = new THREE.Scene(), sourceCamera = new THREE.PerspectiveCamera();
  effect.setSize(1600, 900);
  effect.render(renderer, sourceScene, sourceCamera, { time: 3, rain: 0, speed: 20 });
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0], sourceScene);

  effect.render(renderer, sourceScene, sourceCamera, { time: 4, rain: 0.6, speed: 45 });
  assert.equal(renders.length, 3);
  assert.equal(renders[1][0], sourceScene);
  assert.notEqual(renders[2][0], sourceScene);
  assert.equal(renderTargets.length, 2);
  assert.ok(renderTargets[0]);
  assert.equal(renderTargets[1], null);
  effect.render(renderer, sourceScene, sourceCamera, { time: 5, rain: 0.7, wetness: 0.8, speed: 20, enabled: false });
  assert.equal(renders.length, 4);
  assert.equal(renders[3][0], sourceScene);
  effect.dispose();
});
