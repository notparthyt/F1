// Rear-view mirrors render the scene from the viewer's eye reflected through the glass plane.
import * as THREE from '../vendor/three.module.js';

let rendering = false;

export function makeMirror(mesh, { width = 512, hide = [], tilt = 0.18, extend = 3 } = {}) {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const positions = geometry.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), center = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    const triangle = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const triangleArea = triangle.length() / 2;
    normal.add(triangle);
    center.addScaledVector(a.add(b).add(c), triangleArea / 3);
    area += triangleArea;
  }
  normal.normalize();
  center.divideScalar(area);

  const horizontal = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const vertical = normal.clone().cross(horizontal);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const offset = a.fromBufferAttribute(positions, i).sub(center);
    const u = offset.dot(horizontal), v = offset.dot(vertical);
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }

  const corners = [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]]
    .map(([u, v]) => center.clone().addScaledVector(horizontal, u).addScaledVector(vertical, v));
  const verticalUp = vertical.clone();
  const base = [corners[0].clone(), corners[1].clone()];
  const meshPositions = mesh.geometry.attributes.position;
  const originalPositions = meshPositions.array.slice();
  const weights = Array.from({ length: meshPositions.count }, (_, i) =>
    (vMax - a.fromBufferAttribute(meshPositions, i).sub(center).dot(verticalUp)) / (vMax - vMin));
  let stretchedBy = 0;
  const stretch = amount => {
    if (Math.abs(amount - stretchedBy) < 1e-6) return;
    stretchedBy = amount;
    for (let i = 0; i < meshPositions.count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        meshPositions.array[3 * i + axis] =
          originalPositions[3 * i + axis] - verticalUp.getComponent(axis) * amount * weights[i];
      }
    }
    meshPositions.needsUpdate = true;
    corners[0].copy(base[0]).addScaledVector(verticalUp, -amount);
    corners[1].copy(base[1]).addScaledVector(verticalUp, -amount);
  };

  const tiltedNormal = normal.clone().multiplyScalar(Math.cos(tilt))
    .addScaledVector(vertical, Math.sin(tilt));
  vertical.multiplyScalar(Math.cos(tilt)).addScaledVector(normal, -Math.sin(tilt));
  normal.copy(tiltedNormal);

  const target = new THREE.WebGLRenderTarget(
    width,
    Math.max(16, Math.round(width * (vMax - vMin) / (uMax - uMin))),
    { type: THREE.HalfFloatType, samples: 4 },
  );
  const textureMatrix = new THREE.Matrix4();
  const mirrorCamera = new THREE.PerspectiveCamera();
  const modelled = mesh.material;
  const glass = new THREE.ShaderMaterial({
    name: 'mirror',
    uniforms: { map: { value: target.texture }, textureMatrix: { value: textureMatrix } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vMirror;
      void main() {
        vMirror = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform sampler2D map; varying vec4 vMirror;
      void main() {
        gl_FragColor = texture2DProj(map, vMirror);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mesh.userData.mirror = on => {
    mesh.material = on ? glass : modelled;
    if (!on) stretch(0);
  };
  mesh.userData.mirror(true);

  const q = new THREE.Vector3(), down = new THREE.Vector3(), size = new THREE.Vector2();
  const worldCenter = new THREE.Vector3(), worldNormal = new THREE.Vector3();
  const up = new THREE.Vector3(), eye = new THREE.Vector3(), point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const bias = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1,
  );
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (rendering || mesh.material !== glass) return;

    worldCenter.copy(center).applyMatrix4(mesh.matrixWorld);
    worldNormal.copy(normal).transformDirection(mesh.matrixWorld);
    up.copy(vertical).transformDirection(mesh.matrixWorld);
    const distance = eye.setFromMatrixPosition(camera.matrixWorld).sub(worldCenter).dot(worldNormal);
    if (distance <= 1e-3) return;

    point.copy(base[0]).lerp(base[1], 0.5).applyMatrix4(mesh.matrixWorld);
    down.copy(verticalUp).transformDirection(mesh.matrixWorld).negate();
    q.copy(point).addScaledVector(down, 0.01).project(camera);
    const pixelsPerMetre = Math.abs(q.y - point.project(camera).y) / 2
      * renderer.getSize(size).y / 0.01;
    if (pixelsPerMetre > 0) {
      stretch(extend / pixelsPerMetre / mesh.matrixWorld.getMaxScaleOnAxis());
    }

    camera.getWorldDirection(direction);
    direction.addScaledVector(worldNormal, -2 * direction.dot(worldNormal)).normalize();
    eye.addScaledVector(worldNormal, -2 * distance).add(worldCenter);
    mirrorCamera.position.copy(eye);
    mirrorCamera.up.copy(up);
    mirrorCamera.lookAt(point.copy(eye).add(direction));
    mirrorCamera.updateMatrixWorld();
    const frustumDistance = point.copy(worldCenter).sub(eye)
      .dot(mirrorCamera.getWorldDirection(direction));
    if (frustumDistance <= 1e-3) return;

    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (const corner of corners) {
      point.copy(corner).applyMatrix4(mesh.matrixWorld).applyMatrix4(mirrorCamera.matrixWorldInverse);
      const x = point.x * frustumDistance / -point.z;
      const y = point.y * frustumDistance / -point.z;
      left = Math.min(left, x); right = Math.max(right, x);
      bottom = Math.min(bottom, y); top = Math.max(top, y);
    }
    mirrorCamera.projectionMatrix.makePerspective(left, right, top, bottom, frustumDistance, camera.far);
    mirrorCamera.projectionMatrixInverse.copy(mirrorCamera.projectionMatrix).invert();
    textureMatrix.copy(bias)
      .multiply(mirrorCamera.projectionMatrix)
      .multiply(mirrorCamera.matrixWorldInverse)
      .multiply(mesh.matrixWorld);

    const previousTarget = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.autoUpdate;
    const hiddenObjects = hide.map(object => object.visible);
    rendering = true;
    mesh.visible = false;
    renderer.shadowMap.autoUpdate = false;
    hide.forEach(object => { object.visible = false; });
    try {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, mirrorCamera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      hide.forEach((object, i) => { object.visible = hiddenObjects[i]; });
      renderer.shadowMap.autoUpdate = shadows;
      mesh.visible = true;
      rendering = false;
    }
  };
  return mesh;
}
