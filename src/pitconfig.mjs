// Pit lane sides follow the race direction. +1 is left; -1 is right.
// Most layouts place the pit lane on the right, with these traced layouts
// configured on the left. Yas Marina is explicitly right-side.
export const CIRCUIT_PIT_SIDES = Object.freeze({
  bahrain: -1,
  shanghai: -1,
  catalunya: -1,
  monaco: 1,
  montreal: 1,
  'red-bull-ring': -1,
  silverstone: -1,
  hungaroring: -1,
  spa: -1,
  monza: -1,
  cota: 1,
  mexico: -1,
  interlagos: 1,
  'yas-marina': -1,
  imola: -1,
  zandvoort: -1,
  jeddah: -1,
  miami: -1,
});

export const CIRCUIT_PIT_CONFIGS = Object.freeze({
  'yas-marina': Object.freeze({ entryAt: 240, laneOffset: 4, toMerge: 120, mergeLength: 40 }),
});

export const CIRCUIT_PIT_LAYOUTS = Object.freeze({
  'yas-marina': Object.freeze({
    lane: Object.freeze({ exitAt: 639, limitLength: 600, toMerge: 40, mergeLength: 100 }),
    tunnel: Object.freeze({ beforeExit: 310, endBeforeExit: 100, ramp: 50 }),
  }),
});

// The Yas Marina underpass crosses from the right-side pit lane to the left.
// The far-side exit and merge are placed at the Turn 3 approach.
export const CIRCUIT_PIT_TUNNELS = Object.freeze({
  'yas-marina': Object.freeze({ beforeExit: 150, endBeforeExit: 40, depth: 6.5, ramp: 24 }),
});
