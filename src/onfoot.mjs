export const ON_FOOT_WALK_SPEED = 3.5;
const ON_FOOT_COLLISION_SAMPLES = 8;
const ON_FOOT_PLAYER_RADIUS = 0.3;

export const ON_FOOT_EMOTES = Object.freeze([
  'Victory_Idle_1',
  'Victory_Idle_2',
  'Defeat_Idle',
  'Waving',
  'Clapping',
  'Shaking_Hands_2',
  'Shoved_Reaction_With_Spin',
  'Jump',
  'Wave_Hip_Hop_Dance',
]);

export function moveOnFoot(position, heading, { forward = 0, strafe = 0 } = {}, elapsed, speed = ON_FOOT_WALK_SPEED) {
  if (![position?.x, position?.y, heading, forward, strafe, elapsed, speed].every(Number.isFinite)
    || elapsed < 0 || speed < 0)
    throw new RangeError('On-foot position, input, time, and speed must be finite and nonnegative where applicable');
  const magnitude = Math.hypot(forward, strafe);
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  const f = forward * scale, r = strafe * scale, distance = speed * elapsed;
  return {
    x: position.x + (f * Math.cos(heading) + r * Math.sin(heading)) * distance,
    y: position.y + (f * Math.sin(heading) - r * Math.cos(heading)) * distance,
  };
}

export function moveOnFootColliding(position, heading, input, elapsed, {
  speed = ON_FOOT_WALK_SPEED,
  barrierAt = null,
  car = null,
  cars = null,
  playerRadius = ON_FOOT_PLAYER_RADIUS,
} = {}) {
  if (!Number.isFinite(playerRadius) || playerRadius < 0)
    throw new RangeError('On-foot collision radius must be finite and nonnegative');
  const target = moveOnFoot(position, heading, input, elapsed, speed);
  const collides = point => {
    if (barrierAt) {
      for (let i = 0; i < ON_FOOT_COLLISION_SAMPLES; i++) {
        const angle = 2 * Math.PI * i / ON_FOOT_COLLISION_SAMPLES;
        if (barrierAt(
          point.x + Math.cos(angle) * playerRadius,
          point.y + Math.sin(angle) * playerRadius,
        )) return true;
      }
    }
    for (const vehicle of cars ?? (car ? [car] : [])) {
      const config = vehicle.config ?? vehicle;
      const dx = point.x - vehicle.x, dy = point.y - vehicle.y;
      const cos = Math.cos(vehicle.heading), sin = Math.sin(vehicle.heading);
      const along = dx * cos - dy * sin;
      const across = dx * sin + dy * cos;
      const front = config.bodyFront ?? 2.95;
      const rear = config.bodyRear ?? 2.35;
      const halfWidth = config.bodyHalfWidth ?? 1;
      if (along >= -rear - playerRadius && along <= front + playerRadius
        && Math.abs(across) <= halfWidth + playerRadius) return true;
    }
    return false;
  };
  if (!collides(target)) return target;

  const resolved = { ...position };
  for (const axis of ['x', 'y']) {
    const candidate = { ...resolved, [axis]: target[axis] };
    if (!collides(candidate)) resolved[axis] = candidate[axis];
  }
  return resolved;
}

export function onFootEmoteAt(index) {
  return Number.isInteger(index) && index >= 0 && index < ON_FOOT_EMOTES.length
    ? ON_FOOT_EMOTES[index]
    : null;
}

export function canExitVehicle({ race = false, playerFinished = false, completedLaps = 0 } = {}) {
  return race ? playerFinished : completedLaps > 0;
}

export function shouldShowSeatedDriver({ player = false, onFoot = false, cockpit = false } = {}) {
  return !player || !onFoot;
}

export function shouldAutoPauseOnBlur({ onFoot = false, raceFinished = false } = {}) {
  return !(onFoot && raceFinished);
}
