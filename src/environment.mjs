import { NIGHT_CIRCUITS } from './trackdata.mjs';

const DAYLIGHT_PROFILES = Object.freeze({
  singapore: Object.freeze({ start: 0.035, end: 0.035 }),
  'yas-marina': Object.freeze({ start: 0.42, end: 0.025 }),
  bahrain: Object.freeze({ start: 0.045, end: 0.045 }),
  jeddah: Object.freeze({ start: 0.035, end: 0.035 }),
});

export function daylightForRace(trackKey, progress) {
  if (!Number.isFinite(progress)) throw new RangeError('Race progress must be finite');
  const profile = DAYLIGHT_PROFILES[trackKey] ?? (NIGHT_CIRCUITS.has(trackKey)
    ? { start: 0.05, end: 0.05 }
    : { start: 0.94, end: 0.025 });
  const t = Math.min(1, Math.max(0, progress));
  const eased = t * t * (3 - 2 * t);
  return profile.start + (profile.end - profile.start) * eased;
}
