// Test-drive car: "2026 Redbull RB22" by Tyler_Dave (CC BY 4.0, see models/CREDITS.md),
// fitted to the physics car as a drop-in for buildF1Car: { group, body, wheels, driver,
// drsFlap, steeringWheel, eye, mirrors }. The standard car; each car is repainted in its own colours
// with our sponsors in place of the Red Bull livery.
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';

export const RB22_URL = new URL('../models/redbull22.glb', import.meta.url).href;
// All four wheels of each of these materials are one mesh: split per corner at load.
const WHEEL_MATERIAL = /^(discs|redbull_wheel_hub|sidewall)/;
// Parts wholly inside this box (model metres, nose at +z) make up the steering wheel.
const STEERING_BOX = new THREE.Box3(new THREE.Vector3(-0.14, 0.48, 0.63), new THREE.Vector3(0.14, 0.69, 0.81));
const CORNERS = ['front-left', 'front-right', 'rear-left', 'rear-right'];
const MIRRORS = ['mirror-left', 'mirror-right'];
const MODEL_PARTS = new Set(['Wheel_Holder_Cup_L', 'Wheel_Holder_Cup_R', 'RearWing_flap', 'FrontWings-Flap', 'Lights', 'Yellow_Lights', 'Mirrors']);
const PART_PIVOTS = {
  RearWing_flap: new THREE.Vector3(0, 0.84, -2.165),
  'FrontWings-Flap': new THREE.Vector3(0, 0.2, 2.2),
};
const REAR_FLAP_OPEN_ANGLE = -150;
const REAR_FLAP_PIVOT_OFFSET = [0, 0.095, -0.145];
// Steering wheel turn per radian of road-wheel steer (full lock 0.38 rad -> about 110°).
export const STEERING_RATIO = 5;
function aimBoneAt(bone, endpoint, target, origin, from, to, rotation, worldRotation, parentRotation) {
  bone.getWorldPosition(origin);
  from.subVectors(endpoint, origin).normalize();
  to.subVectors(target, origin).normalize();
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  rotation.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(worldRotation);
  bone.parent.getWorldQuaternion(parentRotation).invert();
  bone.quaternion.copy(parentRotation.multiply(rotation.multiply(worldRotation)));
  bone.updateMatrixWorld(true);
}
function setBoneWorldQuaternion(bone, worldRotation, parentRotation) {
  bone.parent.getWorldQuaternion(parentRotation).invert();
  bone.quaternion.copy(parentRotation.multiply(worldRotation));
  bone.updateMatrixWorld(true);
}
// A flat 4 cm plate on top of the bodywork, left of the cockpit (part of the detail mesh): its
// magenta-and-white metallic texture flashes white in the cockpit view, so it is left out.
const NOSE_PLATE = new THREE.Box3(new THREE.Vector3(0.07, 0.69, 1.11), new THREE.Vector3(0.125, 0.712, 1.165));

// Load once (a URL in the browser, an ArrayBuffer in node, where textures are skipped);
// bake every mesh into model space and split the merged wheel meshes per corner.
export async function loadRB22Template(source = RB22_URL) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (typeof document === 'undefined') loader.register(() => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(null) }));
  const gltf = await (typeof source === 'string' ? loader.loadAsync(source) : loader.parseAsync(source, ''));
  gltf.scene.updateMatrixWorld(true);
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const template = new THREE.Group(), wheels = CORNERS.map(name => Object.assign(new THREE.Group(), { name }));
  const steering = new THREE.Group(); steering.name = 'steering';
  const parts = new Map();
  const partFor = mesh => {
    for (let node = mesh; node; node = node.parent) if (MODEL_PARTS.has(node.name)) return node.name;
    return null;
  };
  const partGroup = name => {
    if (!parts.has(name)) {
      const group = new THREE.Group(); group.name = name;
      const pivot = PART_PIVOTS[name];
      if (pivot) {
        group.position.copy(pivot);
        group.userData.pivotBase = pivot.toArray();
      }
      parts.set(name, group); template.add(group);
    }
    return parts.get(name);
  };
  const addMirror = (geometry, index, material) => template.add(Object.assign(new THREE.Mesh(geometry, material), { name: MIRRORS[index] }));
  const driverSource = gltf.scene.getObjectByName('Sketchfab_model');
  if (driverSource) {
    const driver = driverSource.clone(true);
    driver.name = 'driver-rig';
    driver.matrixAutoUpdate = false;
    driver.matrix.copy(driverSource.matrixWorld);
    template.add(driver);
  }
  for (const m of meshes) {
    if (m.isSkinnedMesh) continue;
    const geometry = toFloat(m.geometry).applyMatrix4(m.matrixWorld);
    if (m.material.name.startsWith('redbull_detail')) dropTriangles(geometry, NOSE_PLATE);
    geometry.computeBoundingBox();
    const part = partFor(m);
    if (part === 'Mirrors') {
      splitCorners(geometry).slice(0, 2).forEach((g, i) => { if (g) addMirror(g, i, m.material); });
      continue;
    }
    if (part && part !== 'Lights' && part !== 'Yellow_Lights' && part !== 'Wheel_Holder_Cup_L' && part !== 'Wheel_Holder_Cup_R') {
      const pivot = PART_PIVOTS[part];
      if (pivot) geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      partGroup(part).add(new THREE.Mesh(geometry, m.material));
      continue;
    }
    if (part) {
      partGroup(part).add(new THREE.Mesh(geometry, m.material));
      continue;
    }
    if (WHEEL_MATERIAL.test(m.material.name)) {
      splitCorners(geometry).forEach((g, i) => g && wheels[i].add(new THREE.Mesh(g, m.material)));
      continue;
    }
    // Both mirrors' glass is one mesh: split left / right so each can reflect its own view.
    if (m.material.name.startsWith('redbull_mirror')) {
      splitCorners(geometry).slice(0, 2).forEach((g, i) => { if (g) addMirror(g, i, m.material); });
      continue;
    }
    const mesh = new THREE.Mesh(geometry, m.material); mesh.name = m.name;
    (STEERING_BOX.containsBox(geometry.boundingBox) ? steering : template).add(mesh);
  }
  template.add(steering, ...wheels);
  return template;
}

// A copy with float attributes (meshopt quantizes them, which a transform would clip).
export function toFloat(geometry) {
  const out = new THREE.BufferGeometry(); out.setIndex(geometry.index);
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const n = attr.itemSize, dst = new Float32Array(attr.count * n), get = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < attr.count; i++) for (let j = 0; j < n; j++) dst[i * n + j] = attr[get[j]](i);
    out.setAttribute(name, new THREE.BufferAttribute(dst, n));
  }
  return out;
}

// Remove the triangles whose centroid lies inside box (in place).
function dropTriangles(geometry, box) {
  const pos = geometry.attributes.position, n = geometry.index ? geometry.index.count : pos.count;
  const at = i => geometry.index ? geometry.index.getX(i) : i, c = new THREE.Vector3(), v = new THREE.Vector3(), keep = [];
  for (let i = 0; i < n; i += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, at(i + k)));
    if (!box.containsPoint(c.divideScalar(3))) keep.push(at(i), at(i + 1), at(i + 2));
  }
  geometry.setIndex(keep);
  return geometry;
}

// Split a non-indexed copy of geometry into four by triangle centroid: +z front, +x left.
export function splitCorners(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry, pos = g.attributes.position;
  const buckets = [[], [], [], []];
  for (let t = 0; t < pos.count; t += 3) {
    const x = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2), z = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2);
    buckets[(z > 0 ? 0 : 2) + (x > 0 ? 0 : 1)].push(t);
  }
  return buckets.map(tris => {
    if (!tris.length) return null;
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize, src = attr.array, dst = new src.constructor(tris.length * 3 * n);
      tris.forEach((t, k) => dst.set(src.subarray(t * n, (t + 3) * n), k * 3 * n));
      out.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    return out;
  });
}

// A corner's axle direction in car space (+z side): the area-weighted normal of its flat
// brake disc (split corner meshes are non-indexed). Needs current world matrices.
function axleOf(corner) {
  const axis = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const disc = corner.children.find(m => m.material.name.startsWith('discs'));
  if (!disc) return new THREE.Vector3(0, 0, 1);
  const pos = disc.geometry.attributes.position;
  for (let t = 0; t < pos.count; t += 3) {
    [a, b, c].forEach((v, k) => v.fromBufferAttribute(pos, t + k).applyMatrix4(disc.matrixWorld));
    n.crossVectors(b.sub(a), c.sub(a)); axis.addScaledVector(n, Math.sign(n.z) || 1);
  }
  return axis.normalize();
}

// Our livery replaces Red Bull's: the paint is refilled in the car's colour, the decals are
// cleared, the sponsor names are projected onto both, and the race-number mesh is hidden.
export const SPONSORS = ['CursorRacing', 'notparthyt', 'CR', 'C1'];
export const GITHUB = 'github.com/notparthyt/F1';
// Label slots in model space (nose +z, left +x, up +y): centre c, facing n, w x h metres.
// Text reads along b (default: left to right seen from outside, tops up, or forward on
// upward faces) and is projected along n onto the texels within `depth` that face n.
// role: the index into the car's rotated sponsor list, 'github' or 'number'.
const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const mirror = s => ({ ...s, c: [-s.c[0], s.c[1], s.c[2]], n: new THREE.Vector3(-s.n.x, s.n.y, s.n.z) });
const sides = s => [s, mirror(s)];
export const LIVERY_SLOTS = [
  ...sides({ role: 0, c: [0.575, 0.41, -0.35], n: v(1, 0, -0.3), w: 1.0, h: 0.2 }), // sidepod
  // Engine cover spine, either side of the fin, tops toward the fin: read from the car's side,
  // that runs rearward on the left and forward on the right.
  { role: 0, c: [0.062, 0.86, -0.95], n: v(0, 1, 0), b: v(0, 0, -1), w: 0.64, h: 0.09 },
  { role: 0, c: [-0.062, 0.86, -0.95], n: v(0, 1, 0), b: v(0, 0, 1), w: 0.64, h: 0.09 },
  { role: 1, on: 'decals', c: [0, 0.845, -2.167], n: v(0, 0.94, 0.33), w: 0.9, h: 0.05 }, // rear wing
  ...sides({ role: 2, c: [0.62, 0.3, 2.42], n: v(1, 0, 0), w: 0.4, h: 0.16 }), // front wing endplates (the right one's decal area is cut short)
  ...sides({ role: 3, on: 'decals', c: [0.39, 0.16, 2.61], n: v(0, 1, 0), w: 0.55, h: 0.14 }), // front wing
  ...sides({ role: 3, c: [0.57, 0.8, -2.1], n: v(1, 0, 0), w: 0.4, h: 0.2 }), // rear wing endplates
  { role: 'number', c: [0, 0.425, 2.38], n: v(0, 0.93, 0.36), b: v(1, 0, 0), w: 0.26, h: 0.24 }, // nose tip, upright seen from the front
  ...sides({ role: 'github', c: [0.54, 0.555, -0.35], n: v(1, 0.35, -0.3), w: 0.9, h: 0.07 }), // above the title
];
// The halo's front cross bar, facing the driver: one label in the middle and the same one on
// either side. Its UVs are mirrored and ~1 cm per texel, too coarse for text, so these are
// decal meshes (the bar's own triangles lifted 2 mm) with their own texture. The bar curves
// every way, so the labels are laid out as the driver sees it, flat in the cockpit camera's
// image plane (x right, y up, as tangents of the view angle): there the middle of the bar's
// visible band is level (y ~0.32) all the way across; the labels sit above it so they
// don't look like they bend off the bar's lower edge as it curves away.
const HALO_EYE = new THREE.Vector3(0, 0.77, 0.167), HALO_PITCH = 4 * Math.PI / 180; // cockpit camera, model space
export const HALO_SLOTS = [
  { role: 0, x: 0, y: 0.347, w: 0.5, h: 0.075 },
  { role: 1, x: -0.62, y: 0.347, w: 0.34, h: 0.07 },
  { role: 1, x: 0.62, y: 0.347, w: 0.34, h: 0.07 },
];
const HALO = new WeakMap(); // template -> one decal geometry per HALO_SLOTS entry

// The paint triangles of the bar facing the eye under each slot, lifted off the surface,
// with UVs across the slot's label (0..1; the label canvas is transparent outside).
export function haloGeometries(template, slots = HALO_SLOTS) {
  const meshes = [];
  template.traverse(o => { if (o.isMesh && o.material.name.startsWith(LAYERS.paint)) meshes.push(o); });
  if (!meshes.length) throw new Error('Could not find paint meshes for halo livery');
  const F = new THREE.Vector3(0, -Math.sin(HALO_PITCH), Math.cos(HALO_PITCH)), U = new THREE.Vector3(0, Math.cos(HALO_PITCH), Math.sin(HALO_PITCH));
  const p = new THREE.Vector3(), d = new THREE.Vector3(), nrm = new THREE.Vector3();
  return slots.map(s => {
    const pos = [], uv = [];
    for (const mesh of meshes) {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i += 3) {
        nrm.set(0, 0, 0); const st = [];
        for (let k = 0; k < 3; k++) {
          p.fromBufferAttribute(P, i + k); nrm.add(d.fromBufferAttribute(N, i + k));
          d.subVectors(p, HALO_EYE);
          if (p.y < 0.75 || p.z < 0.3 || p.z > 0.75 || d.dot(F) <= 0) break;
          st.push([(-d.x / d.dot(F) - s.x) / s.w + 0.5, (d.dot(U) / d.dot(F) - s.y) / s.h + 0.5]);
        }
        if (st.length < 3 || nrm.dot(d) >= 0 || !st.some(([u, v]) => u > 0 && u < 1 && v > 0 && v < 1)) continue;
        for (let k = 0; k < 3; k++) {
          p.fromBufferAttribute(P, i + k).addScaledVector(nrm.fromBufferAttribute(N, i + k), 0.002); pos.push(p.x, p.y, p.z);
          uv.push(...st[k]);
        }
      }
    }
    if (!pos.length) throw new Error(`Could not find halo paint geometry for label at x=${s.x}`);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.computeVertexNormals();
    return out;
  });
}
const PAINT_SIZE = 1024;
const TEXELS = new WeakMap(); // template -> liveryTexels, worked out once

// The texels under each slot, from rasterising the UVs (they wrap) of its layer's mesh,
// slot.on: the paint (default) or the decals, which only exist where Red Bull's logos were.
// Per slot { idx, s, t } (texel index, local metres along b and up). Texels the UV layout
// shares between two places (mirrored panels) are left out, or a label would show twice.
export const LAYERS = { paint: 'redbull_paint', decals: 'redbull_decals' };
export function liveryTexels(template, slots = LIVERY_SLOTS, size = PAINT_SIZE) {
  const out = [];
  for (const [layer, material] of Object.entries(LAYERS)) {
    const keys = slots.flatMap((s, k) => (s.on ?? 'paint') === layer ? [k] : []);
    const meshes = [];
    template.traverse(o => { if (o.isMesh && o.material.name.startsWith(material)) meshes.push(o); });
    const parts = meshes.map(mesh => rasterSlots(mesh, keys.map(k => slots[k]), size));
    keys.forEach((key, j) => {
      const hits = parts.map(part => part[j]).filter(Boolean);
      const count = hits.reduce((sum, hit) => sum + hit.idx.length, 0);
      const idx = new Int32Array(count), s = new Float32Array(count), t = new Float32Array(count);
      let offset = 0;
      for (const hit of hits) {
        idx.set(hit.idx, offset); s.set(hit.s, offset); t.set(hit.t, offset);
        offset += hit.idx.length;
      }
      out[key] = {
        idx, s, t,
      };
    });
  }
  return out;
}

// A slot's frame: centre c, facing n, reading direction b, up u, half sizes w and h.
function frameOf(s) {
  const n = s.n, b = (s.b ?? new THREE.Vector3(0, Math.abs(n.y) > 0.7 ? 0 : 1, Math.abs(n.y) > 0.7 ? 1 : 0).cross(n)).clone().normalize();
  return { c: new THREE.Vector3(...s.c), n, b, u: n.clone().cross(b), w: s.w / 2, h: s.h / 2, depth: s.depth ?? 0.12 };
}

function rasterSlots(mesh, slots, size) {
  const frames = slots.map(frameOf);
  const first = new Float32Array(size * size * 3), seen = new Uint8Array(size * size), shared = new Uint8Array(size * size);
  const hits = frames.map(() => []);
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, I = g.index;
  const p = new THREE.Vector3(), nrm = new THREE.Vector3(), d = new THREE.Vector3(), vi = [0, 0, 0], ux = [0, 0, 0], uy = [0, 0, 0];
  for (let i = 0; i < (I ? I.count : P.count); i += 3) {
    for (let k = 0; k < 3; k++) { vi[k] = I ? I.getX(i + k) : i + k; ux[k] = UV.getX(vi[k]) * size; uy[k] = UV.getY(vi[k]) * size; }
    const det = (uy[1] - uy[2]) * (ux[0] - ux[2]) + (ux[2] - ux[1]) * (uy[0] - uy[2]);
    if (!det) continue;
    for (let y = Math.floor(Math.min(...uy)); y < Math.ceil(Math.max(...uy)); y++)
      for (let x = Math.floor(Math.min(...ux)); x < Math.ceil(Math.max(...ux)); x++) {
        const a = ((uy[1] - uy[2]) * (x + 0.5 - ux[2]) + (ux[2] - ux[1]) * (y + 0.5 - uy[2])) / det;
        const bb = ((uy[2] - uy[0]) * (x + 0.5 - ux[2]) + (ux[0] - ux[2]) * (y + 0.5 - uy[2])) / det, cc = 1 - a - bb;
        if (a < 0 || bb < 0 || cc < 0) continue;
        p.set(0, 0, 0); nrm.set(0, 0, 0);
        [a, bb, cc].forEach((w, k) => { p.x += w * P.getX(vi[k]); p.y += w * P.getY(vi[k]); p.z += w * P.getZ(vi[k]);
          nrm.x += w * N.getX(vi[k]); nrm.y += w * N.getY(vi[k]); nrm.z += w * N.getZ(vi[k]); });
        const t = ((y % size) + size) % size * size + ((x % size) + size) % size;
        if (!seen[t]) { seen[t] = 1; p.toArray(first, t * 3); }
        else if (Math.hypot(p.x - first[t * 3], p.y - first[t * 3 + 1], p.z - first[t * 3 + 2]) > 0.05) { shared[t] = 1; continue; }
        nrm.normalize();
        frames.forEach((f, k) => {
          d.subVectors(p, f.c);
          const s = d.dot(f.b), up = d.dot(f.u);
          if (Math.abs(s) < f.w && Math.abs(up) < f.h && Math.abs(d.dot(f.n)) < f.depth && nrm.dot(f.n) > 0.5) hits[k].push(t, s, up);
        });
      }
  }
  return hits.map(h => {
    const keep = []; for (let k = 0; k < h.length; k += 3) if (!shared[h[k]]) keep.push(k);
    return { idx: Int32Array.from(keep, k => h[k]), s: Float32Array.from(keep, k => h[k + 1]), t: Float32Array.from(keep, k => h[k + 2]) };
  });
}

const css = c => `#${new THREE.Color(c).getHexString()}`;
// Light text on dark paint and dark on light.
const inkFor = paint => { const c = new THREE.Color(paint); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.45 ? 0x111418 : 0xf4f4f4; };

// A slot's label drawn at PX pixels per metre, on a transparent canvas.
function drawLabel(slot, text, color, PX) {
  const lw = Math.ceil(slot.w * PX), lh = Math.ceil(slot.h * PX), label = document.createElement('canvas');
  label.width = lw; label.height = lh;
  const l = label.getContext('2d'), font = px => `${slot.role === 'github' ? 600 : 800} ${px}px "Helvetica Neue", Arial, sans-serif`;
  let px = lh * 0.8; l.font = font(px);
  px = Math.min(px, px * lw * 0.94 / l.measureText(text).width); l.font = font(px);
  l.fillStyle = css(color);
  l.textAlign = 'center'; l.textBaseline = 'middle'; l.fillText(text, lw / 2, lh / 2);
  return label;
}

// One car's paint and decal textures (browser only): the paint refilled in the car's colour,
// the decals cleared, and each slot's label baked into its layer.
export function liveryTextures(texels, { paint, accent, index = 0 }, slots = LIVERY_SLOTS, size = PAINT_SIZE) {
  const names = SPONSORS.map((_, k) => SPONSORS[(k + index) % SPONSORS.length]);
  const PX = 800; // label pixels per metre
  const layers = Object.fromEntries(Object.keys(LAYERS).map(layer => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (layer === 'paint') { ctx.fillStyle = css(paint); ctx.fillRect(0, 0, size, size); }
    return [layer, { canvas, ctx, image: ctx.getImageData(0, 0, size, size) }];
  }));
  slots.forEach((slot, k) => {
    const layer = slot.on ?? 'paint', out = layers[layer].image.data;
    const text = slot.role === 'github' ? GITHUB : slot.role === 'number' ? String(index + 1) : names[slot.role];
    // Decals sit on dark carbon: light text there.
    const label = drawLabel(slot, text, slot.role === 0 || slot.role === 'number' ? accent : layer === 'paint' ? inkFor(paint) : 0xf4f4f4, PX);
    const lw = label.width, lh = label.height, l = label.getContext('2d');
    const src = l.getImageData(0, 0, lw, lh).data, { idx, s, t } = texels[k];
    for (let i = 0; i < idx.length; i++) {
      const x = Math.min(lw - 1, Math.floor((s[i] / slot.w + 0.5) * lw)), y = Math.min(lh - 1, Math.floor((0.5 - t[i] / slot.h) * lh));
      const q = (y * lw + x) * 4, a = src[q + 3] / 255, o = idx[i] * 4, da = out[o + 3] / 255, oa = a + da * (1 - a);
      if (!oa) continue;
      for (let c = 0; c < 3; c++) out[o + c] = (src[q + c] * a + out[o + c] * da * (1 - a)) / oa;
      out[o + 3] = oa * 255;
    }
  });
  return Object.fromEntries(Object.entries(layers).map(([layer, { canvas, ctx, image }]) => {
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    Object.assign(texture, { colorSpace: THREE.SRGBColorSpace, flipY: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 16 });
    return [layer, texture];
  }));
}

// The steering wheel's decal texture without its two ORACLE logos (the wide one across the top
// of the wheel and the small upright one), as [x0, y0, x1, y1] fractions of the image.
const WHEEL_LOGOS = [[250 / 1024, 934 / 1024, 770 / 1024, 1008 / 1024], [976 / 1024, 704 / 1024, 1010 / 1024, 890 / 1024]];
const WHEEL_DECALS = new WeakMap(); // source texture -> cleaned copy, shared by every car
function wheelDecals(map) {
  if (!map?.image) return map;
  if (!WHEEL_DECALS.has(map)) {
    const { width: w, height: h } = map.image, canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(map.image, 0, 0);
    for (const [x0, y0, x1, y1] of WHEEL_LOGOS) ctx.clearRect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h);
    const texture = new THREE.CanvasTexture(canvas);
    for (const k of ['colorSpace', 'flipY', 'wrapS', 'wrapT', 'anisotropy', 'channel']) texture[k] = map[k];
    WHEEL_DECALS.set(map, texture);
  }
  return WHEEL_DECALS.get(map);
}

// livery: { paint, accent, helmet } hex colours and index (the car's place in the sponsor
// rotation and its race number, index + 1). Without a DOM (node) the paint stays as modelled.
export function buildRB22Car(template, config, { paint = 0x0e1626, accent = 0x39e0ae, helmet = 0x1e2a6e, index = 0 } = {}) {
  const physical = o => new THREE.MeshPhysicalMaterial(o);
  const car = new THREE.Group(); car.name = 'f1-car';
  const root = template.clone(true);
  template.traverse(source => {
    if (!source.isSkinnedMesh) return;
    const target = root.getObjectByName(source.name);
    if (!target?.isSkinnedMesh) return;
    const bones = source.skeleton.bones.map(bone => root.getObjectByName(bone.name));
    if (bones.some(bone => !bone)) throw new Error(`Could not clone driver skeleton for ${source.name}`);
    target.bind(new THREE.Skeleton(bones, source.skeleton.boneInverses.map(matrix => matrix.clone())), source.bindMatrix.clone());
  });
  // Nose +z, left +x -> nose +x, left -z; then put the front axle on the physics front axle.
  root.rotation.y = Math.PI / 2; car.add(root);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const originalAppearance = new Map();
  root.traverse(o => {
    if (o.isMesh) originalAppearance.set(o, { material: o.material, visible: o.visible });
  });
  if (typeof document !== 'undefined') {
    if (!TEXELS.has(template)) TEXELS.set(template, liveryTexels(template));
    const maps = liveryTextures(TEXELS.get(template), { paint, accent, index }), materials = new Map();
    const repaint = (o, set) => { if (!materials.has(o.material)) materials.set(o.material, Object.assign(o.material.clone(), set)); o.material = materials.get(o.material); };
    root.traverse(o => {
      if (!o.isMesh) return;
      const name = o.material.name;
      // The model's clearcoat is a perfect mirror (roughness 0): on sharp creases it pins the
      // sun into tiny white specks. A little roughness spreads them into a soft sheen.
      if (name.startsWith(LAYERS.paint)) repaint(o, { map: maps.paint, clearcoatRoughness: 0.18 });
      else if (name.startsWith(LAYERS.decals)) repaint(o, { map: maps.decals });
      else if (name.startsWith('redbull_color')) repaint(o, { color: new THREE.Color(accent) });
      else if (name.startsWith('redbull_number')) o.visible = false;
      else if (name.startsWith('sw_decals')) repaint(o, { map: wheelDecals(o.material.map) });
    });
    if (!HALO.has(template)) HALO.set(template, haloGeometries(template));
    const names = SPONSORS.map((_, k) => SPONSORS[(k + index) % SPONSORS.length]);
    HALO.get(template).forEach((geometry, k) => {
      const slot = HALO_SLOTS[k], map = new THREE.CanvasTexture(drawLabel(slot, names[slot.role], slot.role === 0 ? accent : inkFor(paint), 2400));
      Object.assign(map, { colorSpace: THREE.SRGBColorSpace, anisotropy: 16 });
      const decal = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -4 }));
      decal.name = 'halo-label'; root.add(decal);
    });
  }
  const box = o => { car.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
  const F = config.wheelbase * (1 - config.frontWeight);
  root.position.x = F - box(root.getObjectByName(CORNERS[0])).getCenter(new THREE.Vector3()).x;

  // Wheels: the whole corner (tyre, rim, disc) spins about its hub, on the wheel's own
  // axle: the front wheels are modelled with camber, and spun about the car's lateral
  // axis instead they wobble.
  const wheels = CORNERS.map((name, i) => {
    const node = root.getObjectByName(name), hub = box(node).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.position.copy(hub); car.add(pivot);
    const axle = new THREE.Group(); axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axleOf(node)); pivot.add(axle);
    const spin = new THREE.Group(); axle.add(spin); car.updateMatrixWorld(true);
    spin.attach(node);
    return { pivot, spin, front: i < 2 };
  });

  for (const [name, i] of [['Wheel_Holder_Cup_L', 0], ['Wheel_Holder_Cup_R', 1]]) {
    const holder = root.getObjectByName(name);
    if (holder) { car.updateMatrixWorld(true); wheels[i].pivot.attach(holder); }
  }
  const drsFlap = root.getObjectByName('RearWing_flap') ?? new THREE.Group();
  const frontWingFlap = root.getObjectByName('FrontWings-Flap');
  if (!drsFlap.parent) car.add(drsFlap);
  if (frontWingFlap) frontWingFlap.userData.closedRotation = frontWingFlap.rotation.x;
  drsFlap.userData.closedRotation = drsFlap.rotation.x;
  drsFlap.userData.openingDirection = -1;
  drsFlap.userData.openAngle = REAR_FLAP_OPEN_ANGLE * Math.PI / 180;
  const rearFlapBasePivot = drsFlap.userData.pivotBase
    ? new THREE.Vector3().fromArray(drsFlap.userData.pivotBase)
    : drsFlap.position.clone();
  const rearFlapBaseChildren = drsFlap.children.map(child => child.position.clone());
  drsFlap.userData.pivotOffset = [...REAR_FLAP_PIVOT_OFFSET];
  drsFlap.userData.angleDegrees = REAR_FLAP_OPEN_ANGLE;
  const setRearFlap = ({ pivotOffset = REAR_FLAP_PIVOT_OFFSET, angle = REAR_FLAP_OPEN_ANGLE } = {}) => {
    if (!Array.isArray(pivotOffset) || pivotOffset.length !== 3 || !pivotOffset.every(Number.isFinite))
      throw new TypeError('Rear flap pivotOffset must be an array of three finite numbers');
    if (!Number.isFinite(angle) || angle < -360 || angle > 360)
      throw new RangeError('Rear flap angle must be between -360 and 360 degrees');
    const pivot = rearFlapBasePivot.clone().add(new THREE.Vector3(...pivotOffset));
    drsFlap.children.forEach((child, i) => child.position.copy(rearFlapBaseChildren[i]).add(rearFlapBasePivot).sub(pivot));
    drsFlap.position.copy(pivot);
    drsFlap.userData.openAngle = angle * Math.PI / 180;
    drsFlap.userData.pivotOffset = [...pivotOffset];
    drsFlap.userData.angleDegrees = angle;
    return { pivotOffset: [...pivotOffset], angle };
  };
  setRearFlap();
  const rearLights = root.getObjectByName('Lights');
  const yellowLights = root.getObjectByName('Yellow_Lights');
  if (yellowLights) yellowLights.visible = false;
  rearLights?.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if ('emissive' in o.material) {
      o.material.emissive.set(0xff1414);
      o.material.emissiveIntensity = 0;
    }
  });
  yellowLights?.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if ('emissive' in o.material) {
      o.material.emissive.set(0xffb400);
      o.material.emissiveIntensity = 0;
    }
  });

  // Steering wheel turns about its column (steeringWheel.rotation.x).
  const steer = root.getObjectByName('steering'), sc = box(steer).getCenter(new THREE.Vector3());
  const steeringWheel = new THREE.Group(); steeringWheel.name = 'steering-wheel';
  steeringWheel.position.copy(sc); car.add(steeringWheel); car.updateMatrixWorld(true);
  steeringWheel.attach(steer);

  const rig = root.getObjectByName('driver-rig');
  const skeleton = rig && (() => { let found; rig.traverse(o => { if (!found && o.isSkinnedMesh) found = o.skeleton; }); return found; })();
  const driverNeck = skeleton?.bones[6] ?? null;
  const driverHead = skeleton?.bones[7] ?? null;
  const elbowBones = [skeleton?.bones[10] ?? null, skeleton?.bones[34] ?? null];
  const handBones = [skeleton?.bones[11] ?? null, skeleton?.bones[35] ?? null];
  const driverElbows = elbowBones.filter(Boolean), driverHands = handBones.filter(Boolean);
  const arms = elbowBones.flatMap((fore, i) => {
    const hand = handBones[i], upper = fore?.parent;
    return upper && hand ? [{ upper, fore, hand }] : [];
  });
  car.updateMatrixWorld(true);
  const wheelRotation = steeringWheel.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const arm of arms) {
    arm.rest = {
      upper: arm.upper.quaternion.clone(),
      fore: arm.fore.quaternion.clone(),
      hand: arm.hand.quaternion.clone(),
      handPosition: arm.hand.position.clone(),
    };
    const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
    const elbow = arm.fore.getWorldPosition(new THREE.Vector3());
    const hand = arm.hand.getWorldPosition(new THREE.Vector3());
    arm.upperLength = shoulder.distanceTo(elbow);
    arm.foreLength = elbow.distanceTo(hand);
    arm.grip = steeringWheel.worldToLocal(hand.clone());
    arm.handRotation = wheelRotation.clone().multiply(arm.hand.getWorldQuaternion(new THREE.Quaternion()));
    arm.pole = root.worldToLocal(elbow.clone());
  }
  const shoulder = new THREE.Vector3(), target = new THREE.Vector3(), wristTarget = new THREE.Vector3(), direction = new THREE.Vector3();
  const pole = new THREE.Vector3(), elbowTarget = new THREE.Vector3(), endpoint = new THREE.Vector3();
  const origin = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), wheelWorldRotation = new THREE.Quaternion();
  const boneWorldRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  const updateArms = () => {
    for (const arm of arms) {
      arm.upper.quaternion.copy(arm.rest.upper);
      arm.fore.quaternion.copy(arm.rest.fore);
      arm.hand.quaternion.copy(arm.rest.hand);
      arm.hand.position.copy(arm.rest.handPosition);
    }
    steeringWheel.updateWorldMatrix(true, false);
    for (const arm of arms) arm.upper.updateWorldMatrix(true, true);
    steeringWheel.getWorldQuaternion(wheelWorldRotation);
    for (const arm of arms) {
      arm.upper.getWorldPosition(shoulder);
      steeringWheel.localToWorld(target.copy(arm.grip));
      direction.subVectors(target, shoulder);
      const maxReach = arm.upperLength + arm.foreLength - 1e-4;
      const minReach = Math.abs(arm.upperLength - arm.foreLength) + 1e-4;
      const reach = THREE.MathUtils.clamp(direction.length(), minReach, maxReach);
      direction.normalize();

      root.localToWorld(pole.copy(arm.pole)).sub(shoulder);
      pole.addScaledVector(direction, -pole.dot(direction));
      if (pole.lengthSq() < 1e-8) {
        pole.set(0, 1, 0).addScaledVector(direction, -direction.y);
        if (pole.lengthSq() < 1e-8) pole.set(1, 0, 0).addScaledVector(direction, -direction.x);
      }
      pole.normalize();
      const along = (arm.upperLength ** 2 - arm.foreLength ** 2 + reach ** 2) / (2 * reach);
      const height = Math.sqrt(Math.max(arm.upperLength ** 2 - along ** 2, 0));
      elbowTarget.copy(shoulder).addScaledVector(direction, along).addScaledVector(pole, height);

      arm.fore.getWorldPosition(endpoint);
      aimBoneAt(arm.upper, endpoint, elbowTarget, origin, from, to, rotation, boneWorldRotation, parentRotation);
      arm.hand.getWorldPosition(endpoint);
      aimBoneAt(arm.fore, endpoint, target, origin, from, to, rotation, boneWorldRotation, parentRotation);
      arm.fore.updateWorldMatrix(true, false);
      wristTarget.copy(target);
      arm.fore.worldToLocal(wristTarget);
      arm.hand.position.copy(wristTarget);
      arm.hand.updateMatrixWorld(true);
      rotation.copy(wheelWorldRotation).multiply(arm.handRotation);
      setBoneWorldQuaternion(arm.hand, rotation, parentRotation);
    }
  };
  const driverRest = {
    neck: driverNeck?.quaternion.clone() ?? null,
    head: driverHead?.quaternion.clone() ?? null,
    headPosition: driverHead?.position.clone() ?? null,
  };
  const eye = driverHead
    ? car.worldToLocal(driverHead.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0)))
    : new THREE.Vector3(sc.x - 0.55, 0.77, 0);

  const gameAppearance = new Map();
  root.traverse(o => {
    if (o.isMesh) gameAppearance.set(o, { material: o.material, visible: o.visible });
  });
  const setOriginalLivery = enabled => {
    root.traverse(o => {
      if (o.isMesh && o.userData.mirror) return;
      if (o.isMesh && o.name === 'halo-label') {
        o.visible = !enabled;
        return;
      }
      const appearance = (enabled ? originalAppearance : gameAppearance).get(o);
      if (appearance) {
        o.material = appearance.material;
        o.visible = appearance.visible;
      }
    });
    return enabled;
  };

  const body = new THREE.Group(); body.name = 'sprung-body';
  const pivots = new Set(wheels.map(w => w.pivot));
  car.children.filter(o => !pivots.has(o)).forEach(o => body.add(o));
  car.add(body);
  const headMotion = new THREE.Euler(), headRotation = new THREE.Quaternion();
  const neckMotion = new THREE.Euler(), neckRotation = new THREE.Quaternion();
  const headOffset = new THREE.Vector3();
  const headWorldOrigin = new THREE.Vector3(), headParentOrigin = new THREE.Vector3();
  const updateHead = ({ ax = 0, ay = 0, steer = 0, speed = 0, time = 0 } = {}) => {
    if (!driverHead || !driverRest.head || !driverRest.headPosition) return;
    const clamp = (value, limit) => THREE.MathUtils.clamp(value, -limit, limit);
    const vibration = THREE.MathUtils.clamp(speed / 80, 0, 1);
    headMotion.set(
      clamp(-ax * 0.006, 0.18) + Math.sin(time * 3.2) * vibration * 0.065,
      clamp(steer * 0.28, 0.2) + Math.sin(time * 1.7) * vibration * 0.075,
      clamp(-ay * 0.006, 0.18) + Math.sin(time * 2.6 + 0.7) * vibration * 0.08,
    );
    headRotation.setFromEuler(headMotion);
    driverHead.quaternion.copy(driverRest.head).multiply(headRotation);
    if (driverNeck && driverRest.neck) {
      neckMotion.set(headMotion.x * 0.35, headMotion.y * 0.35, headMotion.z * 0.35);
      neckRotation.setFromEuler(neckMotion);
      driverNeck.quaternion.copy(driverRest.neck).multiply(neckRotation);
    }

    headOffset.set(
      clamp(-ax * 0.0025, 0.05),
      Math.sin(time * 1.7) * vibration * 0.025,
      clamp(ay * 0.0025, 0.05),
    );
    body.updateWorldMatrix(true, false);
    driverHead.parent.updateWorldMatrix(true, false);
    headWorldOrigin.set(0, 0, 0);
    body.localToWorld(headWorldOrigin);
    headParentOrigin.copy(headWorldOrigin);
    body.localToWorld(headOffset);
    driverHead.parent.worldToLocal(headOffset);
    driverHead.parent.worldToLocal(headParentOrigin);
    headOffset.sub(headParentOrigin);
    driverHead.position.copy(driverRest.headPosition).add(headOffset);
  };
  updateHead();
  const visor = new THREE.Object3D();
  if (driverHead) {
    car.updateMatrixWorld(true);
    visor.position.copy(driverHead.worldToLocal(car.localToWorld(new THREE.Vector3(...eye))));
    const cameraTilt = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-4 * Math.PI / 180, -Math.PI / 2, 0, 'YXZ'),
    );
    const headRotationAtRest = driverHead.getWorldQuaternion(new THREE.Quaternion()).invert();
    const cameraRotationAtRest = body.getWorldQuaternion(new THREE.Quaternion()).multiply(cameraTilt);
    visor.quaternion.copy(headRotationAtRest.multiply(cameraRotationAtRest));
    driverHead.add(visor);
  } else {
    visor.position.copy(eye);
    body.add(visor);
  }
  visor.name = 'driver-visor-camera';
  updateArms();
  return { group: car, body, wheels, driver: [], driverNeck, driverHead, visor, driverElbows, driverHands, driverRest, updateHead, updateArms, drsFlap, setRearFlap, setOriginalLivery, frontWingFlap, steeringWheel,
    rearLights, yellowLights, eye: [eye.x, eye.y, eye.z], mirrors: MIRRORS.map(name => root.getObjectByName(name)).filter(Boolean) };
}
