export const LOOK360_MIN_DISTANCE = 4.5;
const LOOK360_MAX_DISTANCE = 14;
const LOOK360_GROUND_CLEARANCE = 0.25;

export function cameraShakeRotation(car, time, mode = 'tcam', grade = 0, crossGrade = 0) {
  if (!car || !Number.isFinite(time) || !['visor', 'tcam'].includes(mode)
    || ![grade, crossGrade, car.telemetry?.speed, car.ax, car.ay, car.body?.pitch, car.body?.roll].every(Number.isFinite))
    throw new TypeError('Camera shake inputs must be finite');
  const impactIntensity = event => {
    if (!event || !Number.isFinite(event.speed) || !Number.isFinite(event.time)) return 0;
    return Math.min(1, event.speed / 45) * Math.exp(-Math.max(0, car.time - event.time) * 7);
  };
  const impact = Math.max(impactIntensity(car.impact), impactIntensity(car.contact));
  if (impact < 0.001) return { pitch: 0, yaw: 0, roll: 0 };
  const impactKick = impact * (mode === 'visor' ? 0.055 : 0.035);
  return {
    pitch: Math.sin(time * 48) * impactKick,
    yaw: Math.sin(time * 37 + 0.8) * impactKick * 0.35,
    roll: Math.sin(time * 42 + 1.4) * impactKick * 0.65,
  };
}

export function clampLook360Distance(distance) {
  if (!Number.isFinite(distance)) throw new RangeError('360 camera distance must be finite');
  return Math.min(LOOK360_MAX_DISTANCE, Math.max(LOOK360_MIN_DISTANCE, distance));
}

export function constrainLook360Camera(target, desired, barrierAt, groundAt = null) {
  if (!target || !desired || ![target.x, target.y, target.z, desired.x, desired.y, desired.z].every(Number.isFinite)
    || typeof barrierAt !== 'function' || (groundAt !== null && typeof groundAt !== 'function'))
    throw new TypeError('360 camera positions and track barrier test must be valid');
  const isClear = point => !barrierAt(point.x, -point.z)
    && (!groundAt || point.y >= groundAt(point.x, -point.z) + LOOK360_GROUND_CLEARANCE);
  if (!isClear(target)) return target.clone();

  const distance = target.distanceTo(desired);
  const steps = Math.max(1, Math.ceil(distance / 1.25));
  let clear = 0, blocked = null;
  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    if (!isClear(target.clone().lerp(desired, fraction))) {
      blocked = fraction;
      break;
    }
    clear = fraction;
  }
  if (blocked === null) return desired.clone();

  for (let i = 0; i < 12; i++) {
    const midpoint = (clear + blocked) / 2;
    const point = target.clone().lerp(desired, midpoint);
    if (isClear(point)) clear = midpoint;
    else blocked = midpoint;
  }
  return target.clone().lerp(desired, clear);
}
