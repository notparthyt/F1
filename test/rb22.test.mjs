import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { loadRB22Template, buildRB22Car, haloGeometries, HALO_SLOTS, liveryTexels, LIVERY_SLOTS, SPONSORS } from '../src/rb22.mjs';
import { DEFAULT_CAR } from '../src/physics.mjs';

const bytes = readFileSync(new URL('../models/redbull22.glb', import.meta.url));
const template = await loadRB22Template(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

test('every livery slot lands on the bodywork', () => {
  const texels = liveryTexels(template);
  assert.equal(texels.length, LIVERY_SLOTS.length);
  LIVERY_SLOTS.forEach((slot, k) => {
    const { idx, s, t } = texels[k];
    // Coverage of the label rectangle on a 24 x 6 grid.
    const cells = new Set();
    for (let i = 0; i < idx.length; i++) cells.add(Math.floor((s[i] / slot.w + 0.5) * 24) * 6 + Math.floor((t[i] / slot.h + 0.5) * 6));
    const coverage = cells.size / 144;
    assert.ok(coverage > (slot.role === 1 ? 0.65 : 0.8), `slot ${k} (${slot.role}) covers ${(coverage * 100).toFixed(0)}%`);
    assert.ok(idx.every(i => i >= 0 && i < 1024 * 1024), `slot ${k} texel range`);
  });
});

test('halo sponsor labels have paint geometry under every cockpit-facing slot', () => {
  const decals = haloGeometries(template);
  assert.equal(decals.length, HALO_SLOTS.length);
  decals.forEach((geometry, i) => {
    assert.ok(geometry.attributes.position.count >= 30, `halo slot ${i} has no paint geometry`);
    assert.equal(geometry.attributes.uv.count, geometry.attributes.position.count);
  });
});

test('the sponsor names are current and the car builds with its animated assemblies', () => {
  assert.deepEqual(SPONSORS, ['CursorRacing', 'notparthyt', 'CR', 'C1']);
  const car = buildRB22Car(template, DEFAULT_CAR, { paint: 0xc8102e, accent: 0xf4f4f4, index: 1 });
  const { group, wheels } = car;
  assert.equal(group.name, 'f1-car');
  assert.equal(wheels.length, 4);
  assert.deepEqual(car.mirrors.map(mirror => mirror.name), ['mirror-left', 'mirror-right']);
  assert.equal(car.drsFlap.name, 'RearWing_flap');
  assert.equal(car.frontWingFlap.name, 'FrontWings-Flap');
  assert.equal(car.driverElbows.length, 2);
  assert.equal(car.driverHands.length, 2);
  assert.ok(car.driverHead);
  car.group.updateMatrixWorld(true);
  const wheelCenter = car.steeringWheel.getWorldPosition(new THREE.Vector3());
  const handCenter = car.driverHands.reduce((center, hand) => center.add(hand.getWorldPosition(new THREE.Vector3())), new THREE.Vector3())
    .multiplyScalar(1 / car.driverHands.length);
  assert.ok(wheelCenter.x - handCenter.x > 0.1 && wheelCenter.x - handCenter.x < 0.15,
    'the authored wheel stays ahead of the default wrist positions');
  const grips = car.driverHands.map(hand => car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3())));
  assert.ok(grips.every(grip => Math.abs(grip.z) > 0.1), 'wrist targets retain their default lateral positions');
  for (const angle of [-0.2, 0.2]) {
    car.steeringWheel.rotation.x = angle;
    car.updateArms();
    car.group.updateMatrixWorld(true);
    car.driverHands.forEach((hand, i) => {
      const currentGrip = car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
      assert.ok(currentGrip.distanceTo(grips[i]) < 0.01, `hand ${i} follows its wheel grip at ${angle} rad`);
    });
  }
  assert.ok(wheels[0].pivot.getObjectByName('Wheel_Holder_Cup_L'));
  assert.ok(wheels[1].pivot.getObjectByName('Wheel_Holder_Cup_R'));
});
