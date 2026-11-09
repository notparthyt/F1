const VERTEX_SHADER = /* glsl */ `
  attribute float aAge;
  attribute float aSize;
  attribute float aSeed;
  uniform float uPointScale;
  uniform float uGrow;
  varying float vAlpha;
  varying float vSeed;
  varying float vAge;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float alive = step(aAge, 0.999);
    float size = aSize * (1.0 + aAge * uGrow);          // puffs billow outward as they age
    gl_PointSize = clamp(size * uPointScale / max(-mv.z, 0.1), 0.0, 300.0) * alive;
    vAlpha = smoothstep(0.0, 0.06, aAge) * pow(1.0 - aAge, 1.6) * alive;
    vSeed = aSeed;
    vAge = aAge;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vSeed;
  varying float vAge;

  void main() {
    // Rotate each puff randomly so the cloud texture never visibly repeats
    vec2 uv = gl_PointCoord - 0.5;
    float a = vSeed * 6.2831 + vAge * 1.5;
    float c = cos(a);
    float s = sin(a);
    uv = mat2(c, -s, s, c) * uv + 0.5;

    float puff = texture2D(uMap, uv).a;
    vec3 col = uColor * mix(0.82, 1.0, vAge); // dense core is greyer, dispersed mist is whiter
    gl_FragColor = vec4(col, puff * vAlpha * uOpacity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Billowy cloud sprite: several overlapping soft blobs, faded to zero at the border
function makeCloudTexture(THREE, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let k = 0; k < 9; k++) {
    const x = size * (0.28 + Math.random() * 0.44);
    const y = size * (0.28 + Math.random() * 0.44);
    const r = size * (0.16 + Math.random() * 0.2);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Car-local axes: +x forward, +y up, +z right (matches the original rig, which trailed along -x)
const DEFAULT_EMITTERS = [
  // Rear tyres: the big, wide rooster tails
  { local: [-1.55, 0.25, -0.8], side: -1, weight: 1.0, lift: 1.0, size: 1.0 },
  { local: [-1.55, 0.25, 0.8], side: 1, weight: 1.0, lift: 1.0, size: 1.0 },
  // Diffuser / rear wing: the tall, finer central plume
  { local: [-2.1, 0.35, 0], side: 0, weight: 0.7, lift: 1.7, size: 0.7 },
  // Front tyres: light spray
  { local: [1.3, 0.25, -0.8], side: -1, weight: 0.25, lift: 0.6, size: 0.7 },
  { local: [1.3, 0.25, 0.8], side: 1, weight: 0.25, lift: 0.6, size: 0.7 },
];

/**
 * World-space F1 spray. Particles are emitted at the tyres/diffuser and then left
 * behind in the air, so the mist hangs and drifts while the car drives out of it.
 *
 *   const spray = createCarSpray(THREE);
 *   scene.add(spray.points);                       // add to the SCENE, not the car group
 *   // each frame:
 *   spray.setViewport(renderer, camera);
 *   spray.update(dt, { object: car.model.group, speed, compound, wetness, wind });
 */
export function createCarSpray(THREE, options = {}) {
  const {
    maxParticles = 700,
    maxSpeed = 90,
    speedScale = 1, // telemetry speed -> world units per second
    color = 0xdfe6ea,
    opacity = 0.5,
    emissionRate = 240, // particles per second per unit emitter weight at full strength
    emitters = DEFAULT_EMITTERS,
  } = options;

  const N = maxParticles;
  const positions = new Float32Array(N * 3);
  const velocities = new Float32Array(N * 3);
  const age = new Float32Array(N).fill(1);
  const life = new Float32Array(N).fill(1);
  const baseSize = new Float32Array(N);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const ageAttr = new THREE.BufferAttribute(new Float32Array(N).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
  const seedAttr = new THREE.BufferAttribute(new Float32Array(N), 1);
  for (let i = 0; i < N; i++) seedAttr.array[i] = Math.random();
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aAge', ageAttr);
  geometry.setAttribute('aSize', sizeAttr);
  geometry.setAttribute('aSeed', seedAttr);

  const texture = makeCloudTexture(THREE);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uPointScale: { value: 600 },
      uGrow: { value: 3.2 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;

  const accumulators = emitters.map(() => 0);
  const fwd = new THREE.Vector3();
  const sideDir = new THREE.Vector3();
  const upDir = new THREE.Vector3(0, 1, 0);
  const origin = new THREE.Vector3();
  const noWind = new THREE.Vector3();
  const drawingSize = new THREE.Vector2();
  let head = 0;
  let clock = 0;

  function spawn(e, speedW, speedN) {
    const i = head;
    head = (head + 1) % N;
    const j = i * 3;

    origin.set(e.local[0], e.local[1], e.local[2]).applyMatrix4(points.userData.matrixWorld);
    positions[j] = origin.x + (Math.random() - 0.5) * 0.25;
    positions[j + 1] = origin.y + Math.random() * 0.1;
    positions[j + 2] = origin.z + (Math.random() - 0.5) * 0.25;

    const side = e.side !== 0 ? e.side : Math.random() < 0.5 ? -1 : 1;
    const out = side * (0.5 + Math.random() * 1.6 + speedN * 1.5);
    const lift = (1.0 + Math.random() * 2.0 + speedN * 3.0) * e.lift;
    const carry = speedW * (0.18 + Math.random() * 0.15); // momentum thrown with the car, bleeds off via drag

    velocities[j] = fwd.x * carry + sideDir.x * out + upDir.x * lift;
    velocities[j + 1] = fwd.y * carry + sideDir.y * out + lift;
    velocities[j + 2] = fwd.z * carry + sideDir.z * out + upDir.z * lift;

    age[i] = 0;
    life[i] = (0.9 + Math.random() * 1.4) * (e.side === 0 ? 1.25 : 1);
    baseSize[i] = (0.9 + Math.random() * 1.1) * e.size;
    sizeAttr.array[i] = baseSize[i];
    ageAttr.array[i] = 0;
  }

  return {
    points,

    /** Call once per frame (or on resize) so puffs keep a correct on-screen size. */
    setViewport(renderer, camera) {
      renderer.getDrawingBufferSize(drawingSize);
      const fov = camera.isPerspectiveCamera ? camera.fov : 50;
      material.uniforms.uPointScale.value =
        (drawingSize.y * 0.5) / Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
    },

    update(dt, { object, speed, compound, wetness, wind = noWind }) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Spray dt must be a nonnegative finite number');
      dt = Math.min(dt, 0.05);
      clock += dt;

      // Wet tyres displace the most water, intermediates ~62%, slicks ~22%
      const tireSpray = compound === 'wet' ? 1 : compound === 'intermediate' ? 0.62 : 0.22;
      const strength = THREE.MathUtils.clamp(
        wetness * tireSpray * THREE.MathUtils.clamp((speed - 8) / 38, 0, 1),
        0,
        1,
      );
      const speedW = speed * speedScale;
      const speedN = Math.min(1, speed / maxSpeed);

      // Emit
      if (strength > 0.015 && object) {
        object.updateWorldMatrix(true, false);
        points.userData.matrixWorld = object.matrixWorld;
        fwd.set(1, 0, 0).transformDirection(object.matrixWorld);
        sideDir.set(0, 0, 1).transformDirection(object.matrixWorld);
        for (let k = 0; k < emitters.length; k++) {
          accumulators[k] += strength * emitters[k].weight * emissionRate * dt;
          while (accumulators[k] >= 1) {
            accumulators[k] -= 1;
            spawn(emitters[k], speedW, speedN);
          }
        }
      }

      // Integrate: drag toward the wind, light buoyancy, growing turbulence
      const drag = Math.exp(-1.8 * dt);
      const dragY = Math.exp(-1.1 * dt);
      for (let i = 0; i < N; i++) {
        if (age[i] >= 1) continue;
        age[i] += dt / life[i];
        if (age[i] >= 1) {
          age[i] = 1;
          ageAttr.array[i] = 1;
          continue;
        }
        const a = age[i];
        const seed = seedAttr.array[i];
        const turb = 0.6 + a * 2.2;
        const j = i * 3;

        velocities[j] = wind.x + (velocities[j] - wind.x) * drag + Math.sin(clock * 2.1 + seed * 31) * turb * dt;
        velocities[j + 1] = wind.y + (velocities[j + 1] - wind.y) * dragY + 0.5 * (1 - a) * dt;
        velocities[j + 2] = wind.z + (velocities[j + 2] - wind.z) * drag + Math.cos(clock * 1.7 + seed * 17) * turb * dt;

        positions[j] += velocities[j] * dt;
        positions[j + 1] += velocities[j + 1] * dt;
        positions[j + 2] += velocities[j + 2] * dt;
        ageAttr.array[i] = a;
      }

      posAttr.needsUpdate = true;
      ageAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    },

    clear() {
      age.fill(1);
      ageAttr.array.fill(1);
      ageAttr.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
