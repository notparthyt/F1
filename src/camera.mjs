export const LOOK360_MIN_DISTANCE = 4.5;
const LOOK360_MAX_DISTANCE = 14;

export function clampLook360Distance(distance) {
  if (!Number.isFinite(distance)) throw new RangeError('360 camera distance must be finite');
  return Math.min(LOOK360_MAX_DISTANCE, Math.max(LOOK360_MIN_DISTANCE, distance));
}

export function constrainLook360Camera(target, desired, barrierAt) {
  if (!target || !desired || ![target.x, target.y, target.z, desired.x, desired.y, desired.z].every(Number.isFinite)
    || typeof barrierAt !== 'function')
    throw new TypeError('360 camera positions and track barrier test must be valid');
  const isClear = point => !barrierAt(point.x, -point.z);
  if (!isClear(target)) return target.clone();
  if (isClear(desired)) return desired.clone();

  let clear = 0, blocked = 1;
  for (let i = 0; i < 12; i++) {
    const midpoint = (clear + blocked) / 2;
    const point = target.clone().lerp(desired, midpoint);
    if (isClear(point)) clear = midpoint;
    else blocked = midpoint;
  }
  return target.clone().lerp(desired, clear);
}
