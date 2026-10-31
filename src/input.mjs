// Driver input: rate-limited keyboard ramps and analog gamepad (W3C "standard"
// mapping) merged into one { throttle, brake, steer } command for physics.mjs.
// All rates are illustrative, in full-travel units per second.

export const INPUT_DEFAULTS = Object.freeze({
  throttleRise: 6, throttleFall: 10, // keyboard pedal ramps (0 -> 1 in ~0.17 s)
  brakeRise: 6, brakeFall: 10,
  steerRate: 3, steerReturn: 5,      // keyboard steering: toward lock / back toward centre
  deadzone: 0.08,                    // stick and trigger deadzone (fraction of travel)
  steerExponent: 1.5,                // stick response curve: finer control near centre
  stickBrakeExponent: 2.5,           // right stick back: gradual brake, full only at full travel
  steerSpeedScale: 40,               // m/s; reduce high-speed twitch without taking away most steering
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function applyArcadeSteeringAssist(command, car) {
  const c = car ?? {};
  const cfg = c.config ?? {};
  const heading = Number.isFinite(c.heading) ? c.heading : 0;
  const cos = Math.cos(heading), sin = Math.sin(heading);
  const forwardSpeed = (Number.isFinite(c.vx) ? c.vx : 0) * cos + (Number.isFinite(c.vy) ? c.vy : 0) * sin;
  const lateralSpeed = -(Number.isFinite(c.vx) ? c.vx : 0) * sin + (Number.isFinite(c.vy) ? c.vy : 0) * cos;
  const sideslip = Math.atan2(lateralSpeed, Math.max(Math.abs(forwardSpeed), 4));
  const excessSlip = Math.sign(sideslip) * Math.max(0, Math.abs(sideslip) - 0.04);
  const maxSteer = Number.isFinite(cfg.maxSteer) ? cfg.maxSteer : 0.38;
  const correction = maxSteer > 0 ? clamp(excessSlip / maxSteer * 1.6, -0.9, 0.9) : 0;
  const steer = clamp((command?.steer ?? 0) - correction, -1, 1);
  return { ...command, steer, brake: (command?.brake ?? 0) * (1 - 0.85 * Math.abs(steer)) };
}

// Deadzone with the remaining travel rescaled to 0..1, then a power curve.
export function shapeAxis(value, deadzone, exponent = 1) {
  const n = Number.isFinite(value) ? value : 0;
  const d = Number.isFinite(deadzone) ? Math.max(0, deadzone) : 0;
  const e = Number.isFinite(exponent) ? exponent : 1;
  const a = Math.abs(n);
  if (d >= 1 || a <= d) return 0;
  return Math.sign(n) * (Math.min(1, (a - d) / (1 - d)) ** e);
}

// Standard mapping: left stick x = axes[0] (+ is right), RT = buttons[7], LT = buttons[6].
// Right stick y = axes[3] (- is forward) is an alternative pedal: forward throttle, back brake.
export function readGamepad(pad, cfg = INPUT_DEFAULTS) {
  if (!pad || !pad.connected || String(pad.mapping ?? '').toLowerCase() !== 'standard') return null;
  const trigger = b => shapeAxis(clamp(Number.isFinite(b?.value) ? b.value : (b?.pressed ? 1 : 0), 0, 1), cfg.deadzone);
  const stickY = shapeAxis(clamp(Number.isFinite(pad.axes?.[3]) ? pad.axes[3] : 0, -1, 1), cfg.deadzone);
  return {
    throttle: Math.max(trigger(pad.buttons?.[7]), -stickY),
    brake: Math.max(trigger(pad.buttons?.[6]), Math.max(0, stickY) ** cfg.stickBrakeExponent),
    steer: -shapeAxis(clamp(Number.isFinite(pad.axes?.[0]) ? pad.axes[0] : 0, -1, 1), cfg.deadzone, cfg.steerExponent), // + is left in physics
  };
}

// Move value toward target, at most rate * dt (exact for any step size).
function ramp(value, target, up, down, dt) {
  return target > value ? Math.min(target, value + up * dt) : Math.max(target, value - down * dt);
}

export function createDriverInput(cfg = INPUT_DEFAULTS) {
  const key = { throttle: 0, brake: 0, steer: 0 };
  let source = 'keyboard';
  return {
    get keyboard() { return { ...key }; },
    get source() { return source; },
    reset() { key.throttle = key.brake = key.steer = 0; },
    // keys: { throttle, brake, left, right } booleans; pad: readGamepad() result or null.
    update(dt, keys, pad, speed = 0) {
      const ped = keys ?? {};
      key.throttle = ramp(key.throttle, ped.throttle ? 1 : 0, cfg.throttleRise, cfg.throttleFall, dt);
      key.brake = ramp(key.brake, ped.brake ? 1 : 0, cfg.brakeRise, cfg.brakeFall, dt);
      const target = (ped.left ? 1 : 0) - (ped.right ? 1 : 0);
      // Steering back toward centre uses the faster return rate; the rest of the
      // step after crossing centre ramps toward the opposite lock at steerRate.
      if (key.steer !== 0 && target * key.steer <= 0) {
        const toCentre = Math.abs(key.steer) / cfg.steerReturn;
        key.steer = dt < toCentre ? key.steer - Math.sign(key.steer) * cfg.steerReturn * dt
          : target * Math.min(1, (dt - toCentre) * cfg.steerRate);
      } else key.steer = ramp(key.steer, target, cfg.steerRate, cfg.steerRate, dt);
      // No switching: keyboard is always on, and a connected pad is on alongside it.
      source = pad ? 'keyboard + gamepad' : 'keyboard';
      const padSteer = Number.isFinite(pad?.steer) ? pad.steer : 0;
      const padThrottle = Number.isFinite(pad?.throttle) ? pad.throttle : 0;
      const padBrake = Number.isFinite(pad?.brake) ? pad.brake : 0;
      const steer = key.steer !== 0 ? key.steer : padSteer;
      return {
        throttle: Math.max(key.throttle, padThrottle),
        brake: Math.max(key.brake, padBrake),
        steer: steer / (1 + (speed / cfg.steerSpeedScale) ** 2),
      };
    },
  };
}
