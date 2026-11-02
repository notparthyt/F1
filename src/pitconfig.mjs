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

// Yas Marina's pit exit passes through a covered underpass. The exit-side
// interval is measured back from the generated pit-lane merge point.
export const CIRCUIT_PIT_TUNNELS = Object.freeze({
  'yas-marina': Object.freeze({ beforeExit: 160, endBeforeExit: 12, depth: 6.5, ramp: 24 }),
});
