export const ARCADE_FACTORS = Object.freeze({
  tireMu: 1.6, corneringStiffness: 1, rearCorneringStiffness: 0.9,
  slidingGripRatio: 0.99, slidingFalloff: 3.5, brakeBias: 0.64,
});
export const HANDLING_KEYS = Object.keys(ARCADE_FACTORS);

export function captureHandlingBaseline(entries) {
  return entries.map(({ car }) => Object.fromEntries(HANDLING_KEYS.map(key => [key, car.config[key]])));
}

export function applyHandlingMode(entries, mode, baseline) {
  if (entries.length !== baseline.length) throw new RangeError('Handling baseline does not match the race entries');
  entries.forEach((entry, index) => {
    for (const key of HANDLING_KEYS) entry.car.config[key] = baseline[index][key];
  });
  if (mode !== 'arcade') return;

  for (const [key, factor] of Object.entries(ARCADE_FACTORS)) {
    const value = key === 'slidingGripRatio' || key === 'slidingFalloff' || key === 'brakeBias'
      ? factor : baseline[0][key] * factor;
    for (const { car } of entries) car.config[key] = value;
  }
}
