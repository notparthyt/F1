import { FIXED_DT, step, TIRE_COMPOUNDS } from './physics.mjs';

const numericFields = [
  'x', 'y', 'heading', 'vx', 'vy', 'yawRate', 'steer', 'ax', 'ay', 'time', 'distance',
  'airborneHeight', 'verticalVelocity', 'crashRoll', 'crashRollRate', 'crashPitch',
  'crashPitchRate', 'spinOut', 'gear', 'shiftTimer', 'drs', 'chassisDamage',
];
const arrayFields = ['wheelOmega', 'slipAngle', 'tireWear', 'tireDamage'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertFinite(value, field) {
  if (!Number.isFinite(value)) throw new TypeError(`Invalid network car state: ${field} must be finite.`);
}

export function captureNetworkCarState(car, inputAck) {
  if (!Number.isSafeInteger(inputAck)) throw new TypeError('Input acknowledgement must be a safe integer.');
  const state = { inputAck };
  for (const field of numericFields) state[field] = car[field];
  for (const field of arrayFields) state[field] = [...car[field]];
  state.lastDamageTime = Number.isFinite(car.lastDamageTime) ? car.lastDamageTime : -1e9;
  state.airDensity = car.config.airDensity;
  state.body = { ...car.body };
  state.tireTemp = car.tireTemp.map(tire => ({ surface: tire.surface, carcass: tire.carcass }));
  state.fuel = car.fuel;
  state.compound = car.compound;
  state.ers = car.ers ? { ...car.ers } : null;
  state.wake = { drag: car.wake?.drag ?? 1, downforce: car.wake?.downforce ?? 1 };
  return state;
}

export function restoreNetworkCarState(car, state) {
  if (!isRecord(state) || !Number.isSafeInteger(state.inputAck))
    throw new TypeError('Invalid network car state: input acknowledgement is missing.');

  for (const field of numericFields) assertFinite(state[field], field);
  assertFinite(state.lastDamageTime, 'lastDamageTime');
  assertFinite(state.airDensity, 'airDensity');
  for (const field of arrayFields) {
    if (!Array.isArray(state[field]) || state[field].length !== 4
      || !state[field].every(Number.isFinite)) {
      throw new TypeError(`Invalid network car state: ${field} must contain four finite values.`);
    }
  }
  if (!isRecord(state.body)
    || !['roll', 'rollRate', 'pitch', 'pitchRate', 'heave', 'heaveRate'].every(field => Number.isFinite(state.body[field]))) {
    throw new TypeError('Invalid network car state: body state is malformed.');
  }
  if (!Array.isArray(state.tireTemp) || state.tireTemp.length !== 4
    || !state.tireTemp.every(tire => isRecord(tire) && Number.isFinite(tire.surface) && Number.isFinite(tire.carcass))) {
    throw new TypeError('Invalid network car state: tire temperatures are malformed.');
  }
  if (!Object.hasOwn(TIRE_COMPOUNDS, state.compound)) {
    throw new TypeError('Invalid network car state: tire compound is unknown.');
  }
  if (state.fuel !== null) assertFinite(state.fuel, 'fuel');
  if (!isRecord(state.wake) || !Number.isFinite(state.wake.drag) || !Number.isFinite(state.wake.downforce)) {
    throw new TypeError('Invalid network car state: wake state is malformed.');
  }
  if (state.ers !== null && (!isRecord(state.ers)
    || !['charge', 'deployed', 'harvested'].every(field => Number.isFinite(state.ers[field])))) {
    throw new TypeError('Invalid network car state: ERS state is malformed.');
  }
  if ((car.ers === null) !== (state.ers === null)) {
    throw new TypeError('Network car configuration does not match the authoritative ERS state.');
  }

  for (const field of numericFields) car[field] = state[field];
  for (const field of arrayFields) car[field].splice(0, 4, ...state[field]);
  car.config.airDensity = state.airDensity;
  car.lastDamageTime = state.lastDamageTime;
  Object.assign(car.body, state.body);
  state.tireTemp.forEach((tire, index) => Object.assign(car.tireTemp[index], tire));
  car.fuel = state.fuel;
  car.compound = state.compound;
  if (car.ers && state.ers) Object.assign(car.ers, state.ers);
  car.wake = { ...state.wake };
  return state.inputAck;
}

export function stepNetworkCar(car, input, surfaceAt, barrierAt) {
  return step(car, input, FIXED_DT, surfaceAt, barrierAt);
}

export function replayNetworkInputs(car, history, inputAck, surfaceAt, barrierAt) {
  if (!Number.isSafeInteger(inputAck)) throw new TypeError('Input acknowledgement must be a safe integer.');
  const pending = history.filter(entry => {
    if (!Number.isSafeInteger(entry.sequence) || !isRecord(entry.input)) {
      throw new TypeError('Invalid predicted input history entry.');
    }
    return entry.sequence > inputAck;
  });
  for (const entry of pending) stepNetworkCar(car, entry.input, surfaceAt, barrierAt);
  return pending;
}
