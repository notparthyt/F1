const DROPLET_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRain: { value: 0 },
    uWetness: { value: 0 },
    uSpeed: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uRain;
    uniform float uWetness;
    uniform float uSpeed;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      float density = mix(7.0, 12.0, uRain);
      vec2 grid = vUv * vec2(density * uAspect, density);
      grid.y += uTime * (0.12 + uSpeed * 0.9 + uRain * 0.35);
      vec2 cell = floor(grid);
      vec2 local = fract(grid) - 0.5;
      float seed = hash(cell);
      vec2 center = (vec2(hash(cell + 0.13), hash(cell + 0.71)) - 0.5) * 0.48;
      float radius = (0.10 + hash(cell + 2.4) * 0.12) * (0.85 + uRain * 0.3);
      vec2 shape = local - center;
      shape.y += max(0.0, shape.y) * uSpeed * 0.55;
      float distanceToDrop = length(shape);
      float visible = step(seed, uRain * 0.72);
      float lens = (1.0 - smoothstep(radius * 0.45, radius, distanceToDrop)) * visible;
      vec2 normal = normalize(shape + vec2(0.0001));
      vec2 offset = normal * lens * radius * (0.035 + uWetness * 0.02) / vec2(density * uAspect, density);
      vec4 color = texture2D(tDiffuse, clamp(vUv - offset, vec2(0.001), vec2(0.999)));
      float highlight = smoothstep(radius * 0.72, radius * 0.35, distanceToDrop) * lens;
      color.rgb += vec3(0.12, 0.16, 0.19) * highlight;
      gl_FragColor = color;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

export function createRainLensEffect(THREE) {
  if (!THREE?.WebGLRenderTarget || !THREE?.ShaderMaterial || !THREE?.Scene)
    throw new TypeError('Rain lens requires the Three.js rendering classes');

  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(DROPLET_SHADER.uniforms),
    vertexShader: DROPLET_SHADER.vertexShader,
    fragmentShader: DROPLET_SHADER.fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  material.uniforms.tDiffuse.value = target.texture;

  return {
    setSize(width, height) {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
        throw new RangeError('Rain lens dimensions must be positive finite numbers');
      target.setSize(Math.round(width), Math.round(height));
      material.uniforms.uAspect.value = width / height;
    },
    render(renderer, sourceScene, sourceCamera, { time, rain, wetness = 0, speed, enabled = true }) {
      if (![time, rain, speed].every(Number.isFinite) || rain < 0 || speed < 0)
        throw new RangeError('Rain lens time, rain, and speed must be nonnegative finite numbers');
      if (!Number.isFinite(wetness) || wetness < 0 || wetness > 1 || typeof enabled !== 'boolean')
        throw new RangeError('Rain lens wetness must be normalized and enabled must be a boolean');
      if (rain === 0 || !enabled) {
        renderer.render(sourceScene, sourceCamera);
        return;
      }

      material.uniforms.uTime.value = time;
      material.uniforms.uRain.value = Math.min(1, rain);
      material.uniforms.uWetness.value = wetness;
      material.uniforms.uSpeed.value = Math.min(1, speed / 90);
      renderer.setRenderTarget(target);
      try {
        renderer.render(sourceScene, sourceCamera);
      } finally {
        renderer.setRenderTarget(null);
      }
      renderer.render(scene, camera);
    },
    dispose() {
      target.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
