const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const WEATHER_DEFAULTS = Object.freeze({
  initialRainChance: 0.18,
  dryMin: 80,
  dryMax: 180,
  rainMin: 45,
  rainMax: 120,
  rampTime: 8,
  wettingRate: 1 / 100,
  dryingRate: 1 / 180,
  maxGripLoss: 0.32,
});

export function createWeather({ random = Math.random, options = {} } = {}) {
  const config = { ...WEATHER_DEFAULTS, ...options };
  const duration = raining => {
    const min = raining ? config.rainMin : config.dryMin;
    const max = raining ? config.rainMax : config.dryMax;
    return min + random() * (max - min);
  };
  let raining = random() < config.initialRainChance;
  let phaseRemaining = duration(raining);
  let intensity = 0;
  let wetness = 0;

  const snapshot = () => ({
    raining: intensity > 0.01,
    intensity,
    wetness,
    grip: 1 - config.maxGripLoss * wetness,
    label: intensity > 0.65 ? 'Heavy rain' : intensity > 0.05 ? 'Light rain'
      : wetness > 0.7 ? 'Wet track' : wetness > 0.25 ? 'Damp track' : 'Dry',
  });

  return {
    get state() { return snapshot(); },
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return snapshot();
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(remaining, phaseRemaining);
        phaseRemaining -= step;
        remaining -= step;
        intensity = clamp(intensity + (raining ? 1 : -1) * step / config.rampTime, 0, 1);
        wetness = clamp(wetness + (raining ? config.wettingRate : -config.dryingRate) * step, 0, 1);
        if (phaseRemaining <= 1e-9) {
          raining = !raining;
          phaseRemaining = duration(raining);
        }
      }
      return snapshot();
    },
    surfaceGrip(baseGrip) {
      return baseGrip * (1 - config.maxGripLoss * wetness);
    },
  };
}
