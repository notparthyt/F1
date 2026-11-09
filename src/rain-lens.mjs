const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uRain;
  uniform float uWetness;
  uniform float uSpeed;
  uniform float uAspect;
  uniform float uStrength;
  uniform float uFogRadius;
  uniform float uSeed;
  uniform vec2 uTexel;
  uniform vec2 uFlow;       // direction drops slide on the lens (unit vector)
  varying vec2 vUv;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // One layer of drops. Every grid cell runs its own life cycle:
  //   impact (splat + grow) -> sit still -> (some) stick-slip slide leaving a wet trail -> run off
  // and re-rolls position, size and timing on every new cycle, so nothing ever repeats.
  // Returns: xy = UV offset (inverted refraction), z = clarity (wipes fog), w = specular
  vec4 dropLayer(float scale, float layerSeed, float slideChance, float sizeMul) {
    vec2 g = vUv * vec2(scale * uAspect, scale);
    vec2 cell = floor(g);
    vec2 local = fract(g) - 0.5;
    vec2 key = cell + layerSeed * 31.7 + uSeed;

    float period = mix(5.0, 14.0, hash21(key));
    float t = uTime / period + hash21(key + 7.7);
    float cycle = floor(t);
    float life = fract(t);
    vec2 id = key + cycle * 17.31;

    float seed = hash21(id);
    float present = smoothstep(seed, seed + 0.12, uRain * 0.8);

    vec2 jitter = vec2(hash21(id + 0.13), hash21(id + 0.71)) - 0.5;
    vec2 center = jitter * 0.26;

    // Only some drops are heavy enough to slide
    float slider = step(1.0 - slideChance, hash21(id + 5.3));
    float travel = slider * (0.12 + hash21(id + 9.1) * 0.18) * (0.6 + uRain * 0.4);
    float slideStart = 0.35 + hash21(id + 3.9) * 0.3;
    float u = clamp((life - slideStart) / (1.0 - slideStart), 0.0, 1.0);
    float x = u * 5.0;
    float prog = (floor(x) + smoothstep(0.0, 0.35, fract(x))) / 5.0; // stick-slip

    float grow = smoothstep(0.0, 0.05, life) * (1.0 + 0.25 * (1.0 - smoothstep(0.05, 0.16, life))); // splat overshoot
    float fade = 1.0 - smoothstep(0.88, 1.0, life);
    float radius = (0.06 + hash21(id + 2.4) * 0.08) * sizeMul * (0.85 + uRain * 0.3)
                 * grow * fade * (1.0 - 0.3 * prog * slider) * present;
    radius = max(radius, 1e-4);

    vec2 f = normalize(uFlow);
    vec2 pp = vec2(-f.y, f.x);
    vec2 start = center - f * travel * 0.5;
    vec2 pos = start + f * travel * prog;
    vec2 rel = local - pos;
    vec2 s = vec2(dot(rel, pp), dot(rel, f));

    // Wet trail left along the path the drop has travelled
    float pathLen = travel * prog;
    float behind = -s.y;
    float trail = 0.0;
    if (s.y < 0.0) {
      trail = (1.0 - smoothstep(0.6 * pathLen, pathLen + 1e-4, behind))
            * (1.0 - smoothstep(0.0, radius * 0.35 + 1e-4, abs(s.x)))
            * step(0.01, pathLen) * fade * step(0.001, present);
      s.y /= 1.0 + uSpeed * 0.3; // airflow stretches the tail
    }

    float d = length(s);
    float inside = (1.0 - smoothstep(radius * 0.85, radius, d)) * step(0.001, present);

    float nd = clamp(d / radius, 0.0, 1.0);
    vec3 n = normalize(vec3(rel / radius, sqrt(max(0.0, 1.0 - nd * nd)) + 0.05));
    float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 24.0) * inside;

    // A drop is a lens: it shows the scene inverted
    vec2 offsetCells = -rel * uStrength * inside;
    vec2 offsetUv = offsetCells / vec2(scale * uAspect, scale);

    return vec4(offsetUv, clamp(inside + trail * 0.6, 0.0, 1.0), spec);
  }

  void main() {
    vec4 a = dropLayer(4.0, 1.0, 0.60, 1.3);   // big heavy drops, many slide
    vec4 b = dropLayer(7.0, 2.0, 0.50, 1.0);   // medium
    vec4 c = dropLayer(13.0, 3.0, 0.25, 0.9);  // small
    vec4 d = dropLayer(30.0, 4.0, 0.0, 0.55);  // fine static mist droplets

    vec2 offset = a.xy + b.xy + c.xy + d.xy;
    float clarity = clamp(a.z + b.z + c.z + d.z, 0.0, 1.0);
    float spec = a.w + b.w + c.w + d.w;

    float fog = uWetness * (1.0 - clarity);
    vec2 r = uTexel * uFogRadius * fog;
    vec2 uv = vUv + offset;
    vec2 lo = vec2(0.001);
    vec2 hi = vec2(0.999);

    vec4 color = texture2D(tDiffuse, clamp(uv, lo, hi)) * 0.4;
    color += texture2D(tDiffuse, clamp(uv + vec2( r.x,  r.y), lo, hi)) * 0.15;
    color += texture2D(tDiffuse, clamp(uv + vec2(-r.x,  r.y), lo, hi)) * 0.15;
    color += texture2D(tDiffuse, clamp(uv + vec2( r.x, -r.y), lo, hi)) * 0.15;
    color += texture2D(tDiffuse, clamp(uv + vec2(-r.x, -r.y), lo, hi)) * 0.15;

    color.rgb *= 1.0 - fog * 0.08;
    color.rgb += vec3(0.12, 0.16, 0.19) * spec * 0.8;
    gl_FragColor = color;

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function assertFinite(name, value, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError(`Rain lens ${name} must be a finite number in [${min}, ${max}]`);
}

/**
 * options:
 *   samples    MSAA samples (default 4)
 *   maxSpeed   speed that maps to full airflow effect (default 90)
 *   strength   drop refraction strength (default 1.5)
 *   fogRadius  max fog blur radius in px (default 6)
 *   seed       random seed; default is random per instance so every session differs
 *   flow       [x, y] slide direction when stationary (default [0, -1] = gravity)
 *   speedFlow  [x, y] slide direction at full speed (default [0.35, 0.65] = airflow pushes drops up/out)
 */
export function createRainLensEffect(THREE, options = {}) {
  if (!THREE?.WebGLRenderTarget || !THREE?.ShaderMaterial || !THREE?.Scene || !THREE?.Vector2)
    throw new TypeError('Rain lens requires the Three.js rendering classes');

  const {
    samples = 4,
    maxSpeed = 90,
    strength = 1.5,
    fogRadius = 6,
    seed = Math.random() * 100,
    flow = [0, -1],
    speedFlow = [0.35, 0.65],
  } = options;
  assertFinite('samples', samples, { min: 0, max: 16 });
  assertFinite('maxSpeed', maxSpeed, { min: Number.EPSILON });
  assertFinite('strength', strength, { min: 0 });
  assertFinite('fogRadius', fogRadius, { min: 0 });
  assertFinite('seed', seed);

  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    samples,
    type: THREE.HalfFloatType ?? THREE.UnsignedByteType,
  });
  target.texture.generateMipmaps = false;

  const flowRest = new THREE.Vector2(flow[0], flow[1]).normalize();
  const flowFast = new THREE.Vector2(speedFlow[0], speedFlow[1]).normalize();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      uTime: { value: 0 },
      uRain: { value: 0 },
      uWetness: { value: 0 },
      uSpeed: { value: 0 },
      uAspect: { value: 1 },
      uStrength: { value: strength },
      uFogRadius: { value: fogRadius },
      uSeed: { value: seed },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uFlow: { value: flowRest.clone() },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  const drawingSize = new THREE.Vector2();
  let width = 1;
  let height = 1;
  let manualSize = false;

  function resize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === width && h === height) return;
    width = w;
    height = h;
    target.setSize(w, h);
    material.uniforms.uAspect.value = w / h;
    material.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  return {
    /** Optional. If never called, size follows the renderer drawing buffer (pixel ratio included). */
    setSize(w, h) {
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1)
        throw new RangeError('Rain lens dimensions must be positive finite numbers');
      manualSize = true;
      resize(w, h);
    },

    render(renderer, sourceScene, sourceCamera, { time, rain, wetness = 0, speed, enabled = true }) {
      assertFinite('time', time, { min: 0 });
      assertFinite('rain', rain, { min: 0 });
      assertFinite('speed', speed, { min: 0 });
      assertFinite('wetness', wetness, { min: 0, max: 1 });
      if (typeof enabled !== 'boolean') throw new TypeError('Rain lens enabled must be a boolean');

      if (rain === 0 || !enabled || renderer.xr?.isPresenting) {
        renderer.render(sourceScene, sourceCamera);
        return;
      }

      if (!manualSize) {
        renderer.getDrawingBufferSize(drawingSize);
        resize(drawingSize.x, drawingSize.y);
      }

      const speedN = Math.min(1, speed / maxSpeed);
      const u = material.uniforms;
      u.uTime.value = time;
      u.uRain.value = Math.min(1, rain);
      u.uWetness.value = wetness;
      u.uSpeed.value = speedN;
      u.uFlow.value.copy(flowRest).lerp(flowFast, speedN).normalize();

      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      try {
        renderer.render(sourceScene, sourceCamera);
      } finally {
        renderer.setRenderTarget(previousTarget);
      }
      renderer.render(scene, camera);
    },

    dispose() {
      scene.remove(quad);
      target.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
