import * as THREE from '../vendor/three.module.js';

const TREAD_PATTERNS = Object.freeze({
  intermediate: { rows: 36, sweep: 0.22, chevron: false },
  wet: { rows: 30, sweep: 0.34, chevron: true },
});
const GROOVE_STEPS = 8;
const GROOVE_HALF_WIDTH = 0.0022;

function appendGroove(positions, indices, radius, z0, z1, phiAt, slope) {
  const base = positions.length / 3;
  const acrossScale = Math.hypot(radius * slope, 1);
  const deltaPhi = GROOVE_HALF_WIDTH / (radius * acrossScale);
  const deltaZ = -radius * slope * GROOVE_HALF_WIDTH / acrossScale;

  for (let step = 0; step <= GROOVE_STEPS; step++) {
    const fraction = step / GROOVE_STEPS;
    const z = z0 + (z1 - z0) * fraction;
    const phi = phiAt(z);
    for (const side of [-1, 1]) {
      const angle = phi + side * deltaPhi;
      const across = z + side * deltaZ;
      positions.push(
        radius * Math.cos(angle),
        radius * Math.sin(angle),
        across,
      );
    }
  }

  for (let step = 0; step < GROOVE_STEPS; step++) {
    const a = base + step * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}

export function createTreadGrooveGeometry(radius, halfWidth) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(halfWidth) || halfWidth <= 0)
    throw new RangeError('Tire radius and half-width must be finite and positive.');

  const positions = [], indices = [], ranges = {};
  const span = halfWidth * 0.68;
  for (const [compound, pattern] of Object.entries(TREAD_PATTERNS)) {
    const start = indices.length;
    for (let row = 0; row < pattern.rows; row++) {
      const phase = row * Math.PI * 2 / pattern.rows;
      if (pattern.chevron) {
        for (const side of [-1, 1]) {
          const slope = -side * pattern.sweep / span;
          appendGroove(
            positions,
            indices,
            radius,
            0,
            side * span,
            z => phase + pattern.sweep - side * pattern.sweep * z / span,
            slope,
          );
        }
      } else {
        const sweep = row % 2 === 0 ? pattern.sweep : -pattern.sweep;
        const slope = sweep / (2 * span);
        appendGroove(
          positions,
          indices,
          radius,
          -span,
          span,
          z => phase + slope * (z + span),
          slope,
        );
      }
    }
    ranges[compound] = Object.freeze({ start, count: indices.length - start });
  }

  for (const compound of ['soft', 'medium', 'hard']) ranges[compound] = Object.freeze({ start: 0, count: 0 });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  geometry.computeVertexNormals();
  geometry.userData.compoundRanges = Object.freeze(ranges);
  return geometry;
}

export function setTreadCompound(meshes, compound) {
  for (const mesh of meshes) {
    const range = mesh.geometry.userData.compoundRanges?.[compound];
    if (!range) throw new RangeError(`Unknown tire compound: ${compound}`);
    mesh.geometry.setDrawRange(range.start, range.count);
    mesh.visible = range.count > 0;
  }
}
