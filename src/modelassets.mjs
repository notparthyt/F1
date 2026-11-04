const CAR_MODELS = Object.freeze({
  ultra: './models/redbull22.glb',
  max: './models/redbull22.glb',
  high: './models/redbull22.glb',
  default: './models/redbull22-optimized.glb',
  mid: './models/redbull22-optimized.glb',
  'max-optimized': './models/redbull22-optimized.glb',
});

const OPTIMIZED_DRIVER_MODES = new Set(['default', 'mid', 'max-optimized']);
const OPTIMIZED_DRIVER = './models/Realistic_Male_F1_Racer_Rigged_Animated-Optimized.glb';
const STANDARD_DRIVER = './models/Realistic_Male_F1_Racer_Rigged_Animated.gltf';

export function carModelForGraphics(mode) {
  const asset = CAR_MODELS[mode];
  if (!asset) throw new RangeError(`Unknown graphics mode: ${mode}`);
  return asset;
}

export function driverModelForGraphics(mode) {
  if (!Object.hasOwn(CAR_MODELS, mode)) throw new RangeError(`Unknown graphics mode: ${mode}`);
  return OPTIMIZED_DRIVER_MODES.has(mode) ? OPTIMIZED_DRIVER : STANDARD_DRIVER;
}
