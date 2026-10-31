// Track-specific visual/weather metadata. Elevations are approximate samples
// along the bundled centreline, in metres relative to the start/finish height.
// They are deliberately keyed per venue instead of generated as a generic wave.
export const CIRCUIT_ELEVATION_PROFILES = Object.freeze({
  bahrain: [[0,0],[.12,3],[.24,6],[.36,2],[.50,-3],[.64,-1],[.78,4],[.9,1]],
  shanghai: [[0,0],[.12,-4],[.25,-8],[.38,-2],[.52,5],[.66,8],[.8,3],[.92,-3]],
  catalunya: [[0,0],[.12,4],[.25,8],[.38,3],[.5,-2],[.64,-5],[.78,0],[.9,4]],
  monaco: [[0,0],[.1,-7],[.22,8],[.34,19],[.46,13],[.58,-5],[.7,-15],[.82,-4],[.93,5]],
  montreal: [[0,0],[.12,1],[.25,2],[.38,-1],[.52,-2],[.66,1],[.8,2],[.92,0]],
  'red-bull-ring': [[0,0],[.08,13],[.17,31],[.25,47],[.34,34],[.43,12],[.53,-4],[.64,-18],[.75,-8],[.86,14],[.95,4]],
  silverstone: [[0,0],[.12,3],[.24,6],[.36,2],[.5,-3],[.64,-5],[.78,-1],[.9,3]],
  hungaroring: [[0,0],[.12,4],[.24,11],[.36,14],[.48,8],[.6,2],[.72,-2],[.84,1],[.94,4]],
  spa: [[0,0],[.035,-8],[.08,18],[.14,48],[.2,73],[.26,86],[.33,68],[.42,38],[.53,12],[.64,-2],[.75,-16],[.86,-8],[.95,-2]],
  monza: [[0,0],[.12,2],[.25,4],[.38,1],[.5,-2],[.63,-3],[.76,0],[.9,2]],
  cota: [[0,0],[.035,6],[.08,19],[.13,30],[.2,24],[.3,14],[.42,4],[.55,-6],[.68,-10],[.8,-7],[.92,-3]],
  mexico: [[0,0],[.12,1],[.25,2],[.38,1],[.5,-1],[.64,-2],[.78,0],[.9,1]],
  interlagos: [[0,0],[.08,-4],[.17,-15],[.26,-25],[.35,-17],[.45,-5],[.56,7],[.68,19],[.78,31],[.88,22],[.96,8]],
  'yas-marina': [[0,0],[.12,2],[.24,4],[.38,3],[.5,0],[.64,-3],[.78,-2],[.9,1]],
  imola: [[0,0],[.12,5],[.24,13],[.36,17],[.48,9],[.6,0],[.72,-8],[.84,-4],[.94,3]],
  zandvoort: [[0,0],[.12,3],[.25,8],[.38,12],[.5,7],[.62,1],[.75,-4],[.88,-1]],
  jeddah: [[0,0],[.12,1],[.25,2],[.38,1],[.5,-1],[.64,-2],[.78,-1],[.9,0]],
  miami: [[0,0],[.12,2],[.25,5],[.38,3],[.5,-1],[.64,-4],[.78,-2],[.9,1]],
});

export const NIGHT_CIRCUITS = new Set(['bahrain', 'jeddah', 'yas-marina']);

const RAIN_CHANCE = Object.freeze({
  bahrain: .04, shanghai: .18, catalunya: .12, monaco: .18, montreal: .24,
  'red-bull-ring': .22, silverstone: .4, hungaroring: .12, spa: .48,
  monza: .14, cota: .2, mexico: .08, interlagos: .42, 'yas-marina': .03,
  imola: .2, zandvoort: .28, jeddah: .03, miami: .28,
});

export function weatherOptionsForTrack(key) {
  const rainChance = key ? (RAIN_CHANCE[key] ?? 0) : .18;
  return { rainChance, initialRainChance: rainChance * .35 };
}
