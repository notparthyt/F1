import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { loadRB22Template, buildRB22Car, haloGeometries, HALO_SLOTS, liveryTexels, LIVERY_SLOTS, SPONSORS, STEERING_RATIO } from '../src/rb22.mjs';
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

test('the original-livery toggle restores the active appearance', () => {
  const car = buildRB22Car(template, DEFAULT_CAR);
  const gameAppearance = [];
  car.group.traverse(object => {
    if (object.isMesh) gameAppearance.push([object, object.material, object.visible]);
  });
  assert.equal(car.setOriginalLivery(true), true);
  assert.equal(car.setOriginalLivery(false), false);
  gameAppearance.forEach(([object, material, visible]) => {
    assert.equal(object.material, material);
    assert.equal(object.visible, visible);
  });
});

test('the original-livery toggle preserves an active mirror material', () => {
  const car = buildRB22Car(template, DEFAULT_CAR);
  const mirror = car.mirrors[0];
  const reflection = new THREE.MeshBasicMaterial({ color: 0x123456 });
  mirror.material = reflection;
  mirror.userData.mirror = () => {};

  car.setOriginalLivery(true);
  assert.equal(mirror.material, reflection);
  car.setOriginalLivery(false);
  assert.equal(mirror.material, reflection);
});

test('the visor camera mount follows driver head animation', () => {
  const car = buildRB22Car(template, DEFAULT_CAR);
  assert.equal(car.visor.parent, car.driverHead);
  car.group.updateMatrixWorld(true);
  const restPosition = car.visor.getWorldPosition(new THREE.Vector3());
  car.updateHead({ ax: 8, ay: -6, steer: 0.7, speed: 70, time: 1.2 });
  car.group.updateMatrixWorld(true);
  const animatedPosition = car.visor.getWorldPosition(new THREE.Vector3());
  assert.ok(animatedPosition.distanceTo(restPosition) > 1e-4);
  car.updateHead();
  car.group.updateMatrixWorld(true);
  assert.ok(car.visor.getWorldPosition(new THREE.Vector3()).distanceTo(restPosition) < 1e-8);
});

test('driver wrists stay on their steering-wheel grips through full lock', () => {
  const car = buildRB22Car(template, DEFAULT_CAR);
  car.group.updateMatrixWorld(true);
  const grips = car.driverHands.map(hand =>
    car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3())));

  for (const angle of [-DEFAULT_CAR.maxSteer * STEERING_RATIO, -0.2, 0.2, DEFAULT_CAR.maxSteer * STEERING_RATIO]) {
    car.steeringWheel.rotation.x = angle;
    car.updateArms();
    car.group.updateMatrixWorld(true);
    car.driverHands.forEach((hand, i) => {
      const currentGrip = car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
      assert.ok(currentGrip.distanceTo(grips[i]) < 1e-4, `hand ${i} follows its wheel grip at ${angle} rad`);
    });
  }
});

test('both mirrors retain their authored mounting position', () => {
  const car = buildRB22Car(template, DEFAULT_CAR);
  car.group.updateMatrixWorld(true);
  const centers = car.mirrors.map(mirror => new THREE.Box3().setFromObject(mirror).getCenter(new THREE.Vector3()));
  centers.forEach((center, i) => {
    assert.ok(Math.abs(center.x - 0.905) < 0.01);
    assert.ok(Math.abs(center.y - 0.735) < 0.01);
    assert.ok(Math.abs(Math.abs(center.z) - 0.582) < 0.01);
    assert.equal(Math.sign(center.z), i === 0 ? -1 : 1);
  });
});

test('tire rubber retains its authored material', () => {
  const car = buildRB22Car(template, DEFAULT_CAR);
  for (const [i, wheel] of car.wheels.entries()) {
    let tire;
    wheel.spin.traverse(object => {
      if (object.isMesh && object.material.name.startsWith('sidewall')) tire = object.material;
    });
    assert.ok(tire);
    assert.equal(tire, template.getObjectByName(['front-left', 'front-right', 'rear-left', 'rear-right'][i]).children.find(object => object.material.name.startsWith('sidewall')).material);
  }
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
  assert.equal(car.setOriginalLivery(true), true);
  assert.equal(car.setOriginalLivery(false), false);
  assert.equal(car.driverElbows.length, 2);
  assert.equal(car.driverHands.length, 2);
  assert.ok(car.driverNeck);
  assert.ok(car.driverHead);
  assert.equal(car.drsFlap.userData.openingDirection, -1);
  assert.equal(car.drsFlap.userData.openAngle, -210 * Math.PI / 180);
  assert.deepEqual(car.drsFlap.userData.pivotOffset, [0, 0.095, -0.145]);
  assert.ok(car.drsFlap.position.distanceTo(new THREE.Vector3(0, 0.935, -2.31)) < 1e-9,
    'the build-time flap pivot includes the configured offset');
  const flapPosition = car.drsFlap.position.clone();
  assert.deepEqual(car.setRearFlap({ pivotOffset: [0.01, 0.02, -0.03], angle: -180 }), { pivotOffset: [0.01, 0.02, -0.03], angle: -180 });
  assert.ok(car.drsFlap.position.distanceTo(flapPosition) > 0.03);
  car.setRearFlap();
  assert.equal(car.drsFlap.userData.openAngle, -210 * Math.PI / 180);
  assert.deepEqual(car.drsFlap.userData.pivotOffset, [0, 0.095, -0.145]);
  assert.ok(car.drsFlap.position.distanceTo(flapPosition) < 1e-8);
  const headRestPosition = car.driverRest.headPosition.clone();
  car.updateHead({ ax: 8, ay: -6, steer: 0.7, speed: 70, time: 1.2 });
  assert.ok(car.driverHead.position.distanceTo(headRestPosition) > 1, 'driver head translates and rotates under driving forces');
  assert.ok(1 - Math.abs(car.driverHead.quaternion.dot(car.driverRest.head)) > 1e-4, 'driver head visibly rotates from its rest pose');
  assert.ok(1 - Math.abs(car.driverNeck.quaternion.dot(car.driverRest.neck)) > 1e-5, 'driver neck follows the head animation');
  car.updateHead();
  assert.ok(car.driverHead.position.distanceTo(headRestPosition) < 1e-8, 'driver head returns to its rest position');
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
