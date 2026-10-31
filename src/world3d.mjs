// Three.js circuit scenery for the stadium test track used by the physics
// surface function. Physics (x, y) maps to world (x, 0, -y); y is up.
import * as THREE from '../vendor/three.module.js';
import { stadiumPitLane } from './track.mjs';

function texture(size, draw, repeatX = 1, repeatY = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  return t;
}
function noise(g, s, base, spread, count) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = (Math.random() - 0.5) * spread;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
// Photo-scanned race-track asphalt (Poly Haven, CC0; models/CREDITS.md) for a
// ribbon `width` metres across with v = s / vScale, at 2.5 m per tile.
function asphaltMaterial(width, vScale = 30) {
  const loader = new THREE.TextureLoader(), tile = 2.5;
  const [map, normalMap, roughnessMap] = ['diff', 'nor_gl', 'rough'].map(m => {
    const t = loader.load(new URL(`../models/asphalt_track_${m}_1k.jpg`, import.meta.url).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(width / tile, vScale / tile); t.anisotropy = 16;
    if (m === 'diff') t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map, normalMap, roughnessMap, roughness: 1 });
}

// Centerline samples (counter-clockwise from the start line) with left normals.
export function centerline(halfStraight, radius, step = 2) {
  const pts = [];
  const push = (x, y, dx, dy) => pts.push({ x, y, nx: -dy, ny: dx });
  for (let x = -halfStraight; x < halfStraight; x += step) push(x, -radius, 1, 0);
  const n = Math.ceil(Math.PI * radius / step);
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + Math.PI * i / n; push(halfStraight + radius * Math.cos(a), radius * Math.sin(a), -Math.sin(a), Math.cos(a)); }
  for (let x = halfStraight; x > -halfStraight; x -= step) push(x, radius, -1, 0);
  for (let i = 0; i < n; i++) { const a = Math.PI / 2 + Math.PI * i / n; push(-halfStraight + radius * Math.cos(a), radius * Math.sin(a), -Math.sin(a), Math.cos(a)); }
  pts.push({ ...pts[0] });
  let s = 0;
  pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = s; });
  return pts;
}

// Strip between left offsets a and b; vertical when y1 is given (walls).
function ribbon(pts, a, b, y0, material, vScale, y1) {
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    const base = p.h ?? 0;
    if (y1 === undefined) pos.push(p.x + p.nx * a, base + y0, -(p.y + p.ny * a), p.x + p.nx * b, base + y0, -(p.y + p.ny * b));
    else pos.push(p.x + p.nx * a, base + y0, -(p.y + p.ny * a), p.x + p.nx * a, base + y1, -(p.y + p.ny * a));
    uv.push(0, p.s / vScale, 1, p.s / vScale);
    if (i) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}

// boxColors: one paint colour per pit box (car index order).
export function buildWorld({ halfStraight, radius, roadWidth, boxColors = [] }) {
  const world = new THREE.Group();
  const pts = centerline(halfStraight, radius);
  const half = roadWidth / 2, pit = stadiumPitLane(halfStraight, radius, roadWidth);
  const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });

  // Sky dome with a horizon gradient.
  const sky = new THREE.SphereGeometry(1800, 32, 16), col = [];
  for (let i = 0; i < sky.attributes.position.count; i++) {
    const t = Math.max(0, sky.attributes.position.getY(i) / 1800);
    const c = new THREE.Color(0xdfe9f1).lerp(new THREE.Color(0x3d78b8), Math.pow(t, 0.6)); col.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  world.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

  const grass = texture(256, (g, s) => {
    noise(g, s, '#3f6b2e', 0.25, 9000);
    for (let i = 0; i < s; i += 64) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, i, s, 32); }
  }, 300, 300);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; world.add(ground);

  const kerb = texture(64, (g, s) => { g.fillStyle = '#d8dad6'; g.fillRect(0, 0, s, s); g.fillStyle = '#c3302b'; g.fillRect(0, 0, s, s / 2); });
  const wall = texture(128, (g, s) => {
    g.fillStyle = '#c9ccc8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#13263a'; g.fillRect(0, 0, s, s * 0.55);
    g.fillStyle = '#6fffc3'; g.fillRect(0, s * 0.55, s, s * 0.05);
  });
  const runoff = texture(256, (g, s) => noise(g, s, '#8b8170', 0.3, 20000), 4, 1);
  const road = asphaltMaterial(roadWidth);
  world.add(ribbon(pts, -half, half, 0, road, 30));
  for (const s of [-1, 1]) {
    world.add(ribbon(pts, s * half, s * (half + 1.2), 0.012, std({ map: kerb, roughness: 0.7 }), 4));
    world.add(ribbon(pts, s * (half - 0.45), s * (half - 0.2), 0.008, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
    world.add(ribbon(pts, s * (half + 1.2), s * (half + 8), 0.004, std({ map: runoff, roughness: 1 }), 20));
    const w = ribbon(pts, s * (half + 12), 0, 0, std({ map: wall, roughness: 0.8 }), 6, 1.1);
    w.castShadow = true; world.add(w);
  }
  // Pit lane (track.mjs layout): asphalt apron on the inside from the entry to
  // the exit, a solid white line along the circuit edge, speed-limit lines,
  // painted boxes in each car's colour and a garage block behind the wall.
  const along = (a, b) => pts.filter(p => p.s >= a && p.s <= b);
  world.add(ribbon(along(pit.entry, pit.exit), pit.inner, pit.outer, 0.006, asphaltMaterial(Math.abs(pit.outer - pit.inner)), 30));
  world.add(ribbon(along(pit.entry, pit.exit), pit.inner, pit.inner + 0.25, 0.009, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
  // Physical pit divider, with short gaps at entry and exit so cars can join
  // and leave the lane. It matches the perimeter wall and catch fence.
  const pitDivider = along(pit.entry + 18, pit.exit - 18);
  const paint = (s, offset, length, width, color, y = 0.01) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(length, width), std({ color, roughness: 0.6 }));
    m.rotation.x = -Math.PI / 2; m.position.set(s - halfStraight, y, radius + offset); world.add(m); m.receiveShadow = true;
  };
  for (const s of [pit.limitStart, pit.limitEnd]) paint(s, -(pit.inner + pit.outer) / 2, 0.4, pit.outer - pit.inner, 0xf2f2ee);
  for (let i = 0; i < Math.max(boxColors.length, 5); i++) {
    const s = pit.boxStart + pit.boxSpacing * i;
    paint(s, pit.boxOffset, 7, 4.5, 0xf2f2ee); paint(s, pit.boxOffset, 6.6, 4.1, boxColors[i] ?? 0x3a4450, 0.012);
  }
  const garageLength = pit.boxSpacing * (Math.max(boxColors.length, 22) - 1) + 60;
  const garage = new THREE.Mesh(new THREE.BoxGeometry(garageLength, 6, 7), std({ color: 0xd9dcd6, roughness: 0.7 }));
  garage.position.set(pit.boxStart - 30 + garageLength / 2 - halfStraight, 3, radius - (half + 12 + 4.5)); garage.castShadow = garage.receiveShadow = true; world.add(garage);
  const garageBay = new THREE.MeshStandardMaterial({ color: 0x243140, roughness: 0.8 });
  const garageAccent = new THREE.MeshStandardMaterial({ color: 0x6fffc3, roughness: 0.55 });
  for (let i = 0; i < Math.max(boxColors.length, 22); i++) {
    const x = pit.boxStart + pit.boxSpacing * i - halfStraight;
    const door = new THREE.Mesh(new THREE.BoxGeometry(pit.boxSpacing - 1, 3.8, 0.12), garageBay);
    door.position.set(x, 2.1, garage.position.z + 3.56); world.add(door);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(pit.boxSpacing - 1, 0.18, 0.14), garageAccent);
    strip.position.set(x, 4.2, garage.position.z + 3.57); world.add(strip);
  }
  // Start/finish: chequered strip, gantry with lights.
  const chequer = texture(128, (g, s) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#eee'; g.fillRect(i * s / 8, j * s / 8, s / 8, s / 8); } }, 1, 7.5);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, roadWidth), new THREE.MeshStandardMaterial({ map: chequer, roughness: 0.6 }));
  line.rotation.x = -Math.PI / 2; line.position.set(0.8, 0.014, radius); line.receiveShadow = true; world.add(line);
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.7, roughness: 0.4 });
  for (const z of [radius - half - 2, radius + half + 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); post.position.set(-6, 3.5, z); post.castShadow = true; world.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, roadWidth + 4.5), steel); beam.position.set(-6, 7, radius); beam.castShadow = true; world.add(beam);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0.6 }));
    l.rotation.y = -Math.PI / 2; l.position.set(-6.41, 7, radius - 2 + i); world.add(l);
  }
  // Grandstands outside the main straight: seated crowd on the treads/risers,
  // concrete end walls, back wall, roof columns so nothing floats.
  const crowd = texture(512, (g, s) => {
    g.fillStyle = '#2a3440'; g.fillRect(0, 0, s, s);
    const seat = s / 16;
    for (let i = 0; i < 16; i++) {
      const x = i * seat;
      g.fillStyle = '#1d5f8c'; g.fillRect(x + 2, s * 0.55, seat - 4, s * 0.45);
      if (Math.random() < 0.12) continue;
      g.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${30 + Math.random() * 40}%)`;
      g.fillRect(x + seat * 0.18, s * 0.38, seat * 0.64, s * 0.62);
      g.fillStyle = `hsl(${20 + Math.random() * 15},${30 + Math.random() * 30}%,${35 + Math.random() * 40}%)`;
      g.beginPath(); g.arc(x + seat / 2, s * 0.26, seat * 0.26, 0, Math.PI * 2); g.fill();
    }
  }, 110 / 8, 1);
  const concrete = new THREE.MeshStandardMaterial({ map: texture(128, (g, s) => noise(g, s, '#a7aaa6', 0.18, 3000), 4, 2), roughness: 0.95 });
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  const stepMats = [concrete, concrete, crowdMat, concrete, concrete, crowdMat];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.5, side: THREE.DoubleSide });
  const z0 = radius + half + 18, zFront = z0 - 1, zBack = z0 + 15, roofY = 14;
  const endShape = new THREE.Shape();
  [[zFront, 0], [zFront, 1.4], [zBack, 10.4], [zBack + 0.6, roofY], [zBack + 0.6, 0]]
    .forEach(([z, y], i) => i ? endShape.lineTo(-z, y) : endShape.moveTo(-z, y));
  const endGeo = new THREE.ExtrudeGeometry(endShape, { depth: 0.6, bevelEnabled: false });
  const add = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; world.add(mesh); return mesh; };
  for (const x of [-140, 0, 140]) {
    for (let r = 0; r < 8; r++) add(new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 2), stepMats)).position.set(x, 0.6 + r * 1.2, z0 + r * 2);
    for (const ex of [x - 55.6, x + 55]) { const e = add(new THREE.Mesh(endGeo, concrete)); e.rotation.y = Math.PI / 2; e.position.x = ex; }
    add(new THREE.Mesh(new THREE.BoxGeometry(111.2, roofY, 0.6), concrete)).position.set(x, roofY / 2, zBack + 0.3);
    for (let i = 0; i < 7; i++) add(new THREE.Mesh(new THREE.BoxGeometry(0.35, roofY, 0.35), steel)).position.set(x - 54.4 + i * 18.13, roofY / 2, zFront - 0.6);
    add(new THREE.Mesh(new THREE.BoxGeometry(114, 0.4, 20), roofMat)).position.set(x, roofY + 0.2, radius + half + 25);
  }
  // Catch fence above both walls: alpha-tested diamond mesh plus steel posts.
  const meshTex = texture(64, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#b9c0c4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
  }, 20, 1);
  const fenceMat = new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
  if (pitDivider.length > 1) {
    const dividerWall = ribbon(pitDivider, pit.inner, 0, 0, std({ map: wall, roughness: 0.8 }), 6, 1.1);
    dividerWall.castShadow = true; world.add(dividerWall);
    world.add(ribbon(pitDivider, pit.inner, 0, 1.1, fenceMat, 0.16, 4.2));
  }
  const postSpots = [];
  for (const s of [-1, 1]) {
    world.add(ribbon(pts, s * (half + 12), 0, 1.1, fenceMat, 0.16, 4.2));
    pts.forEach((p, i) => { if (i % 4 === 0) postSpots.push([p.x + p.nx * s * (half + 12), p.y + p.ny * s * (half + 12)]); });
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), steel, postSpots.length);
  postSpots.forEach(([x, y], i) => posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.1, -y)));
  world.add(posts);

  // Cursor Racing branding: trackside hoardings, gantry, grandstand fascias, infield.
  const logo = (w, h, bg = true, repeat = 1) => {
    const t = texture(1, () => {}, repeat, 1);
    const cv = t.image; cv.width = w; cv.height = h; drawLogo(cv.getContext('2d'), w, h, bg); t.needsUpdate = true;
    return t;
  };
  const logoMat = new THREE.MeshStandardMaterial({ map: logo(1024, 128), roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.08 });
  logoMat.emissiveMap = logoMat.map;
  const boardBack = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.8 });
  const boardMats = [boardBack, boardBack, boardBack, boardBack, logoMat, boardBack];
  const boardSpots = [];
  // (none on the inside along the pit lane, which runs beside the inner wall)
  for (const s of [-1, 1]) pts.forEach((p, i) => { if (i % 18 === 9 && !(s > 0 && p.s > pit.entry && p.s < pit.exit)) boardSpots.push([p, s]); });
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 1, 0.12), boardMats, boardSpots.length);
  const dummy = new THREE.Object3D();
  boardSpots.forEach(([p, s], i) => {
    const off = s * (half + 10.5);
    dummy.position.set(p.x + p.nx * off, 0.75, -(p.y + p.ny * off));
    dummy.lookAt(p.x, 0.75, -p.y); dummy.updateMatrix(); boards.setMatrixAt(i, dummy.matrix);
  });
  boards.castShadow = true; world.add(boards);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth + 4.5, (roadWidth + 4.5) / 8), logoMat);
    panel.rotation.y = -side * Math.PI / 2; panel.position.set(-6 + side * 0.42, 8.6, radius); world.add(panel);
  }
  const fasciaMat = new THREE.MeshStandardMaterial({ map: logo(1024, 128, true, 4), roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.08 });
  fasciaMat.emissiveMap = fasciaMat.map;
  for (const x of [-140, 0, 140]) {
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(114, 3.5), fasciaMat);
    fascia.rotation.y = Math.PI; fascia.position.set(x, 13.4, radius + half + 14.9); world.add(fascia);
  }
  const infield = new THREE.Mesh(new THREE.PlaneGeometry(160, 20),
    new THREE.MeshStandardMaterial({ map: logo(2048, 256, false), transparent: true, depthWrite: false, roughness: 0.9 }));
  infield.rotation.x = -Math.PI / 2; infield.position.y = 0.02; world.add(infield);

  // Distant wooded hills so the horizon is not a flat edge.
  const hillGeo = new THREE.BufferGeometry(), hp = [], hc = [], hi = [], A = 160, R = 7;
  const forest = new THREE.Color(0x2c4a2a), meadow = new THREE.Color(0x5d7a3e);
  for (let a = 0; a <= A; a++) for (let r = 0; r < R; r++) {
    const th = a / A * Math.PI * 2, rr = 680 + r * 70;
    const h = (38 + 26 * Math.sin(th * 3 + 1) + 18 * Math.sin(th * 7 + 2) + 9 * Math.sin(th * 17)) * Math.pow(r / (R - 1), 0.7);
    hp.push(Math.cos(th) * rr, h - 1, Math.sin(th) * rr);
    const c = meadow.clone().lerp(forest, Math.min(1, r / 2 + 0.2 * Math.sin(th * 23))); hc.push(c.r, c.g, c.b);
    if (a && r) { const k = a * R + r, j = k - R; hi.push(j - 1, k - 1, j, j, k - 1, k); }
  }
  hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
  hillGeo.setIndex(hi); hillGeo.computeVertexNormals();
  world.add(new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));

  // Trees: two species (conifer, broadleaf) built from jittered low-poly parts, planted in clusters.
  const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const spots = [];
  const clear = (x, y) => {
    const d = Math.abs(Math.hypot(x - Math.max(-halfStraight, Math.min(halfStraight, x)), y) - radius);
    return d > half + 20 && !(y < -radius - half - 8 && y > -radius - 62 && Math.abs(x) < 215) && !(Math.abs(x) < 90 && Math.abs(y) < 16);
  };
  while (spots.length < 420) {
    const cx = (rng() - 0.5) * 1100, cy = (rng() - 0.5) * 760, n = 3 + Math.floor(rng() * 9);
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 40, y = cy + (rng() - 0.5) * 40;
      if (clear(x, y)) spots.push([x, y, 0.75 + rng() * 0.6, rng() * Math.PI * 2, rng()]);
    }
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const species = [treeGeometry('conifer'), treeGeometry('broadleaf')].map((geo, k) => {
    const list = spots.filter(t => (t[4] < 0.45) === (k === 0));
    const mesh = new THREE.InstancedMesh(geo, treeMat, list.length);
    list.forEach(([x, y, sc, rot, v], i) => {
      dummy.position.set(x, 0, -y); dummy.rotation.set(0, rot, 0); dummy.scale.set(sc, sc * (0.85 + v * 0.3), sc);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      const tint = 0.8 + rng() * 0.35; mesh.setColorAt(i, new THREE.Color(tint * (0.95 + rng() * 0.15), tint, tint * (0.85 + rng() * 0.15)));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  });
  world.add(...species);
  return world;
}

// Scenery for a real circuit (circuit.mjs track): road, white edge lines,
// kerbs only where the track flags them, runoff, walls and catch fence at
// wallOffset (left out where another part of the circuit runs closer), a
// start/finish line and light gantry at s = 0, a grandstand beside it,
// hoardings, trees off the circuit and a hill ring sized to the layout.
export function buildCircuitWorld(track, { boxColors = [], night = false } = {}) {
  const world = new THREE.Group(), half = track.roadWidth / 2, wallAt = track.wallOffset;
  const { x: X, y: Y, z: Z, s: S, heading: H, kerb } = track.samples, n = X.length;
  const pts = Array.from({ length: n + 1 }, (_, k) => { const i = k % n; return { x: X[i], y: Y[i], h: Z?.[i] ?? 0, nx: -Math.sin(H[i]), ny: Math.cos(H[i]), s: k < n ? S[i] : track.length, i }; });
  // Consecutive runs of samples meeting a predicate (each run shares its end point).
  const runs = keep => { const out = []; let cur = null; for (const p of pts) { if (keep(p)) (cur ??= (out.push([]), out.at(-1))).push(p); else cur = null; } return out.filter(r => r.length > 1); };
  const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); minY = Math.min(minY, Y[i]); maxY = Math.max(maxY, Y[i]); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, extent = Math.hypot(maxX - minX, maxY - minY) / 2;

  const skyR = extent + 1500, sky = new THREE.SphereGeometry(skyR, 32, 16), col = [];
  for (let i = 0; i < sky.attributes.position.count; i++) {
    const t = Math.max(0, sky.attributes.position.getY(i) / skyR);
    const c = night
      ? new THREE.Color(0x111a30).lerp(new THREE.Color(0x02040b), Math.pow(t, 0.7))
      : new THREE.Color(0xdfe9f1).lerp(new THREE.Color(0x3d78b8), Math.pow(t, 0.6));
    col.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyMesh.position.set(cx, 0, -cy); world.add(skyMesh);
  const size = 2 * extent + 1200;
  const grass = texture(256, (g, s) => {
    noise(g, s, '#3f6b2e', 0.25, 9000);
    for (let i = 0; i < s; i += 64) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, i, s, 32); }
  }, size / 8, size / 8);
  // Drape the infield and verges to the same continuous elevation curve used
  // by the road. Use a spatial segment index so each terrain vertex projects
  // to a nearby centreline segment instead of snapping to a sparse sample.
  const terrainSegments = 160, terrainPositions = [], terrainUvs = [], terrainIndices = [];
  const terrainCellSize = 80, terrainSearchRadius = 205, terrainCells = new Map();
  const terrainCellKey = (x, y) => `${x},${y}`;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const minX = Math.floor((Math.min(X[k], X[j]) - terrainSearchRadius) / terrainCellSize);
    const maxX = Math.floor((Math.max(X[k], X[j]) + terrainSearchRadius) / terrainCellSize);
    const minY = Math.floor((Math.min(Y[k], Y[j]) - terrainSearchRadius) / terrainCellSize);
    const maxY = Math.floor((Math.max(Y[k], Y[j]) + terrainSearchRadius) / terrainCellSize);
    for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) {
      const key = terrainCellKey(gx, gy);
      (terrainCells.get(key) ?? terrainCells.set(key, []).get(key)).push(k);
    }
  }
  for (let j = 0; j <= terrainSegments; j++) for (let i = 0; i <= terrainSegments; i++) {
    const x = cx + (i / terrainSegments - 0.5) * size;
    const y = cy + (j / terrainSegments - 0.5) * size;
    const candidates = terrainCells.get(terrainCellKey(Math.floor(x / terrainCellSize), Math.floor(y / terrainCellSize))) ?? [];
    let progress = 0, bestD2 = Infinity;
    for (const k of candidates) {
      const next = (k + 1) % n, dx = X[next] - X[k], dy = Y[next] - Y[k];
      const lengthSquared = dx * dx + dy * dy;
      const fraction = Math.max(0, Math.min(1, ((x - X[k]) * dx + (y - Y[k]) * dy) / lengthSquared));
      const px = X[k] + dx * fraction, py = Y[k] + dy * fraction;
      const distanceSquared = (x - px) ** 2 + (y - py) ** 2;
      if (distanceSquared < bestD2) {
        bestD2 = distanceSquared;
        progress = S[k] + (S[k + 1] - S[k]) * fraction;
      }
    }
    const distance = Math.sqrt(bestD2), fade = 1 - THREE.MathUtils.smoothstep(distance, wallAt + 20, 190);
    const height = (bestD2 < Infinity ? track.heightAt(progress) * fade : 0) - 0.055;
    terrainPositions.push(x, height, -y);
    terrainUvs.push(i / terrainSegments * size / 8, j / terrainSegments * size / 8);
    if (i && j) {
      const k = j * (terrainSegments + 1) + i, a = k - terrainSegments - 2, b = a + 1, c = k - 1, e = k;
      terrainIndices.push(a, b, c, b, e, c);
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3));
  terrainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(terrainUvs, 2));
  terrainGeometry.setIndex(terrainIndices); terrainGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ map: grass, roughness: 1, side: THREE.DoubleSide }));
  ground.receiveShadow = true; world.add(ground);

  const kerbTex = texture(64, (g, s) => { g.fillStyle = '#d8dad6'; g.fillRect(0, 0, s, s); g.fillStyle = '#c3302b'; g.fillRect(0, 0, s, s / 2); });
  const wallTex = texture(128, (g, s) => {
    g.fillStyle = '#c9ccc8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#13263a'; g.fillRect(0, 0, s, s * 0.55);
    g.fillStyle = '#6fffc3'; g.fillRect(0, s * 0.55, s, s * 0.05);
  });
  const runoffTex = texture(256, (g, s) => noise(g, s, '#8b8170', 0.3, 20000), 4, 1);
  const meshTex = texture(64, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#b9c0c4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
  }, 20, 1);
  const fenceMat = new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.7, roughness: 0.4 });
  world.add(ribbon(pts, -half, half, 0, asphaltMaterial(track.roadWidth), 30));
  const postSpots = [];
  for (const side of [-1, 1]) {
    world.add(ribbon(pts, side * (half - 0.45), side * (half - 0.2), 0.008, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
    for (const r of runs(p => kerb[p.i])) world.add(ribbon(r, side * half, side * (half + 1.2), 0.012, std({ map: kerbTex, roughness: 0.7 }), 4));
    world.add(ribbon(pts, side * (half + 1.2), side * (half + 8), 0.004, std({ map: runoffTex, roughness: 1 }), 20));
    // Barrier where its line is still nearest this part of the circuit.
    const clear = p => Math.abs(track.offset(p.x + p.nx * side * wallAt, p.y + p.ny * side * wallAt)) > wallAt - 1;
    for (const r of runs(clear)) {
      const w = ribbon(r, side * wallAt, 0, 0, std({ map: wallTex, roughness: 0.8 }), 6, 1.1); w.castShadow = true; world.add(w);
      world.add(ribbon(r, side * wallAt, 0, 1.1, fenceMat, 0.16, 4.2));
      r.forEach((p, k) => { if (k % 4 === 0) postSpots.push([p.x + p.nx * side * wallAt, p.y + p.ny * side * wallAt, p.h]); });
    }
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), steel, postSpots.length);
  postSpots.forEach(([x, y, h], i) => posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, h + 2.1, -y)));
  world.add(posts);

  // Start/finish at s = 0 in a local frame: +x along the track, +z to the right.
  const start = new THREE.Group(); start.position.set(X[0], Z?.[0] ?? 0, -Y[0]); start.rotation.y = H[0]; world.add(start);
  const chequer = texture(128, (g, s) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#eee'; g.fillRect(i * s / 8, j * s / 8, s / 8, s / 8); } }, 1, track.roadWidth / 2);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, track.roadWidth), new THREE.MeshStandardMaterial({ map: chequer, roughness: 0.6 }));
  line.rotation.x = -Math.PI / 2; line.position.set(0, 0.014, 0); line.receiveShadow = true; start.add(line);
  for (const z of [-half - 2, half + 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); post.position.set(-6, 3.5, z); post.castShadow = true; start.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, track.roadWidth + 4.5), steel); beam.position.set(-6, 7, 0); beam.castShadow = true; start.add(beam);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0.6 }));
    l.rotation.y = -Math.PI / 2; l.position.set(-6.41, 7, -2 + i); start.add(l);
  }
  // Grandstand on whichever side of the straight before the line has room.
  const crowd = texture(512, (g, s) => {
    g.fillStyle = '#2a3440'; g.fillRect(0, 0, s, s);
    const seat = s / 16;
    for (let i = 0; i < 16; i++) {
      const x = i * seat;
      g.fillStyle = '#1d5f8c'; g.fillRect(x + 2, s * 0.55, seat - 4, s * 0.45);
      if (Math.random() < 0.12) continue;
      g.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${30 + Math.random() * 40}%)`;
      g.fillRect(x + seat * 0.18, s * 0.38, seat * 0.64, s * 0.62);
      g.fillStyle = `hsl(${20 + Math.random() * 15},${30 + Math.random() * 30}%,${35 + Math.random() * 40}%)`;
      g.beginPath(); g.arc(x + seat / 2, s * 0.26, seat * 0.26, 0, Math.PI * 2); g.fill();
    }
  }, 110 / 8, 1);
  const concrete = new THREE.MeshStandardMaterial({ map: texture(128, (g, s) => noise(g, s, '#a7aaa6', 0.18, 3000), 4, 2), roughness: 0.95 });
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  const stepMats = [concrete, concrete, crowdMat, concrete, concrete, crowdMat];
  const room = side => [-120, -60, 0].every(d => { const [x, y] = track.point(d, side * (wallAt + 20)); return Math.abs(track.offset(x, y)) > wallAt + 10; });
  // Across the straight from the pit lane where there is room for it.
  const pit = track.pit, standSide = [pit ? pit.side : -1, pit ? -pit.side : 1].find(room) ?? 0;
  if (standSide) {
    const stand = new THREE.Group(); stand.position.copy(start.position); stand.rotation.y = H[0]; world.add(stand);
    const z0 = wallAt + 6;
    for (let r = 0; r < 8; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 2), stepMats); step.castShadow = step.receiveShadow = true;
      step.position.set(-60, 0.6 + r * 1.2, standSide * (z0 + r * 2)); stand.add(step);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(111.2, 14, 0.6), concrete); back.position.set(-60, 7, standSide * (z0 + 16)); back.castShadow = true; stand.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(114, 0.4, 20), std({ color: 0xe6e9ec, roughness: 0.5 })); roof.position.set(-60, 14.2, standSide * (z0 + 7)); roof.castShadow = true; stand.add(roof);
    for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.35, 14, 0.35), steel); c.position.set(-114.4 + i * 18.13, 7, standSide * (z0 - 1.6)); stand.add(c); }
  }

  // Additional spectator blocks at separate sectors make each circuit read
  // as a race venue from the cockpit, not an empty ribbon with distant trees.
  for (let i = 0; i < 4; i++) {
    const s = track.length * (0.13 + i * 0.19), side = i % 2 ? 1 : -1;
    const [x, y] = track.point(s, side * (wallAt + 31)), h = track.heightAt(s);
    if (Math.abs(track.offset(x, y)) < wallAt + 18) continue;
    const stand = new THREE.Group(); stand.position.set(x, h, -y); stand.rotation.y = track.heading(s); world.add(stand);
    const sign = side;
    const base = new THREE.Mesh(new THREE.BoxGeometry(68, 1.2, 13), concrete); base.position.set(0, 0.7, 0); base.castShadow = base.receiveShadow = true; stand.add(base);
    for (let row = 0; row < 7; row++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(66 - row * 1.2, 0.8, 1.5), stepMats);
      step.position.set(0, 1.7 + row * 0.85, sign * (1 + row * 1.45)); step.castShadow = true; stand.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(70, 0.7, 14), std({ color: 0xc9d0d2, roughness: 0.55 }));
    roof.position.set(0, 9.2, sign * 5); roof.castShadow = true; stand.add(roof);
  }

  // Marshal posts, safety cabinets and camera platforms along the outer fence.
  const marshalMat = std({ color: 0xffc857, roughness: 0.72 });
  for (let i = 0; i < 12; i++) {
    const s = track.length * (i + 0.35) / 12, side = i % 2 ? -1 : 1;
    const [x, y] = track.point(s, side * (wallAt + 10)), h = track.heightAt(s);
    if (Math.abs(track.offset(x, y)) < wallAt + 7) continue;
    const post = new THREE.Group(); post.position.set(x, h, -y); post.rotation.y = track.heading(s); world.add(post);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.4), marshalMat); box.position.y = 1.1; box.castShadow = true; post.add(box);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 3), steel); platform.position.set(0, 2.35, side * 1.2); post.add(platform);
    const camera = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.42), std({ color: 0x111820, metalness: 0.5 }));
    camera.position.set(0, 2.9, side * 1.2); camera.rotation.y = Math.PI / 2; post.add(camera);
  }

  if (night) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x252a32, metalness: 0.72, roughness: 0.36 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffefc2, emissive: 0xffd77a, emissiveIntensity: 3.8, roughness: 0.25 });
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.78, emissive: 0x111a2a, emissiveIntensity: 0.35 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0xffd88a, emissive: 0xffb84d, emissiveIntensity: 2.2, roughness: 0.25 });
    const lampCount = 36;
    for (let i = 0; i < lampCount; i++) {
      const s = track.length * i / lampCount, side = i % 2 ? -1 : 1, h = track.heightAt(s);
      const [x, y] = track.point(s, side * (wallAt + 22));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 15, 7), poleMat);
      mast.position.set(x, h + 7.5, -y); mast.castShadow = true; world.add(mast);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 25), poleMat);
      const [ax, ay] = track.point(s, side * (wallAt + 10));
      arm.position.set(ax, h + 14.8, -ay); arm.rotation.y = track.heading(s) + (side > 0 ? Math.PI : 0); world.add(arm);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.25, 1), lampMat);
      const [lx, ly] = track.point(s, side * (wallAt - 2));
      bulb.position.set(lx, h + 14.5, -ly); bulb.rotation.y = track.heading(s); world.add(bulb);
      // Keep the repeated lamp fixtures emissive; only every third mast adds
      // a dynamic light to the scene to keep the night renderer light.
      if (i % 3 === 0) {
        const light = new THREE.PointLight(0xffdfa0, 1400, 190, 2);
        light.position.set(lx, h + 13.5, -ly); world.add(light);
      }
    }
    // Low-rise illuminated city blocks give the street venues a night skyline.
    for (let i = 0; i < 18; i++) {
      const s = track.length * (i + 0.5) / 18, side = i % 2 ? 1 : -1, h = track.heightAt(s);
      const [x, y] = track.point(s, side * (wallAt + 82));
      if (Math.abs(track.offset(x, y)) < wallAt + 45) continue;
      const building = new THREE.Group(); building.position.set(x, h, -y); building.rotation.y = track.heading(s); world.add(building);
      const tall = 8 + (i % 4) * 5, w = 10 + (i % 3) * 3;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, tall, 9), buildingMat); block.position.y = tall / 2; block.castShadow = true; building.add(block);
      for (let row = 0; row < Math.floor(tall / 2.5); row++) {
        const windows = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.28, 0.08), windowMat);
        windows.position.set(0, 1.6 + row * 2.2, -side * 4.56); building.add(windows);
      }
    }
  }

  // Pit lane (circuit.mjs layout; pit-frame offsets are negative towards the
  // pits, centreline offset = side × that): asphalt from the road edge out to
  // the apron's far side between entry and exit, a white line along the fast
  // lane's inner edge, the speed-limit lines, the box marks (the field's
  // boxes, the player's first) and a garage behind the wall at each box.
  if (pit) {
    const strip = (a, b) => Array.from({ length: Math.round((b - a) / 2) + 1 }, (_, k) => {
      const s = a + (b - a) * k / Math.round((b - a) / 2), [x, y] = track.point(s), h = track.heading(s);
      return { x, y, h: track.heightAt(s), nx: -Math.sin(h), ny: Math.cos(h), s: s - a };
    });
    // Build pit-lane meshes from track.point's same signed offsets used by
    // collision, pit boxes and the AI route, so left/right cannot diverge.
    const pitRoadMesh = (a, b, material, yOffset = 0.006) => {
      const path = strip(a, b), positions = [], uvs = [], indices = [];
      path.forEach(p => {
        const s = a + p.s, inner = track.point(s, -pit.side * half), outer = track.point(s, -pit.side * pit.outer);
        const h = track.heightAt(s) + yOffset;
        positions.push(inner[0], h, -inner[1], outer[0], h, -outer[1]);
        uvs.push(0, p.s / 30, 1, p.s / 30);
      });
      for (let i = 1; i < path.length; i++) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; world.add(mesh); return mesh;
    };
    const pitSurface = asphaltMaterial(Math.abs(pit.outer - half));
    world.add(pitRoadMesh(pit.entry, pit.exit, pitSurface));
    const dividerStart = pit.entry + 18;
    const divider = strip(dividerStart, pit.exit - 18).map(p => {
      const [x, y] = track.point(dividerStart + p.s, -pit.side * pit.inner);
      return { ...p, x, y };
    });
    if (divider.length > 1) {
      const barrier = ribbon(divider, 0, 0, 0, std({ map: wallTex, roughness: 0.8 }), 6, 1.1);
      barrier.castShadow = true; world.add(barrier);
      world.add(ribbon(divider, 0, 0, 1.1, fenceMat, 0.16, 4.2));
      divider.forEach((p, k) => { if (k % 4 === 0) postSpots.push([p.x, p.y, p.h]); });
    }
    const linePath = strip(pit.limitStart, pit.limitEnd), linePositions = [], lineUvs = [], lineIndices = [];
    linePath.forEach(p => {
      const s = pit.limitStart + p.s, a = track.point(s, -pit.side * pit.inner), b = track.point(s, -pit.side * (pit.inner + 0.25)), h = track.heightAt(s) + 0.009;
      linePositions.push(a[0], h, -a[1], b[0], h, -b[1]); lineUvs.push(0, p.s / 10, 1, p.s / 10);
    });
    for (let i = 1; i < linePath.length; i++) { const k = i * 2; lineIndices.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    const pitLineGeometry = new THREE.BufferGeometry();
    pitLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3)); pitLineGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(lineUvs, 2)); pitLineGeometry.setIndex(lineIndices); pitLineGeometry.computeVertexNormals();
    world.add(new THREE.Mesh(pitLineGeometry, std({ color: 0xf2f2ee, roughness: 0.6 })));
    const flat = (s, f, length, width, color, y = 0.01) => {
      const [x, z] = track.point(s, pit.side * f), m = new THREE.Mesh(new THREE.PlaneGeometry(length, width), std({ color, roughness: 0.6 }));
      m.rotation.set(-Math.PI / 2, 0, track.heading(s)); m.position.set(x, track.heightAt(s) + y, -z); m.receiveShadow = true; world.add(m);
    };
    for (const s of [pit.limitStart, pit.limitEnd]) flat(s, -(pit.inner + pit.outer) / 2, 0.4, pit.outer - pit.inner, 0xf2f2ee);
    const garageAt = -(wallAt + 4.5), concreteGarage = std({ color: 0xd9dcd6, roughness: 0.7 });
    for (let i = 0; i < Math.max(boxColors.length, 5); i++) {
      const s = pit.boxStart + pit.boxSpacing * i;
      flat(s, pit.boxOffset, 7, 4.5, 0xf2f2ee); flat(s, pit.boxOffset, 6.6, 4.1, boxColors[i] ?? 0x3a4450, 0.012);
      const [x, y] = track.point(s, pit.side * garageAt);
      if (standSide === -pit.side || Math.abs(track.offset(x, y)) < wallAt + 3) continue;
      const g = new THREE.Mesh(new THREE.BoxGeometry(pit.boxSpacing - 0.5, 6, 7), concreteGarage);
      g.position.set(x, track.heightAt(s) + 3, -y); g.rotation.y = track.heading(s); g.castShadow = g.receiveShadow = true; world.add(g);
    }
  }

  // Hoardings every ~36 m both sides, facing the track (none along the pit lane).
  const logo = (w, h) => { const t = texture(1, () => {}); const cv = t.image; cv.width = w; cv.height = h; drawLogo(cv.getContext('2d'), w, h, true); t.needsUpdate = true; return t; };
  const logoMat = new THREE.MeshStandardMaterial({ map: logo(1024, 128), roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.08 });
  logoMat.emissiveMap = logoMat.map;
  // Cursor Racing panels on both faces of the start-light gantry, as on the stadium track.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(track.roadWidth + 4.5, (track.roadWidth + 4.5) / 8), logoMat);
    panel.rotation.y = -side * Math.PI / 2; panel.position.set(-6 + side * 0.42, 8.6, 0); start.add(panel);
  }
  const boardBack = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.8 });
  const boardSpots = [];
  for (const side of [-1, 1]) pts.forEach((p, k) => {
    if (k % 18 !== 9 || k === n) return;
    const off = side * (half + 10.5);
    const s = p.s > track.length / 2 ? p.s - track.length : p.s;
    if (pit && Math.sign(off) === pit.side && s > pit.entry - 10 && s < pit.exit + 10) return;
    if (Math.abs(track.offset(p.x + p.nx * off, p.y + p.ny * off)) > half + 10) boardSpots.push([p, off]);
  });
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 1, 0.12), [boardBack, boardBack, boardBack, boardBack, logoMat, boardBack], boardSpots.length);
  const dummy = new THREE.Object3D();
  boardSpots.forEach(([p, off], i) => {
    dummy.position.set(p.x + p.nx * off, p.h + 0.75, -(p.y + p.ny * off));
    dummy.lookAt(p.x, p.h + 0.75, -p.y); dummy.updateMatrix(); boards.setMatrixAt(i, dummy.matrix);
  });
  boards.castShadow = true; world.add(boards);

  // Hill ring beyond the circuit.
  const hillGeo = new THREE.BufferGeometry(), hp = [], hc = [], hi = [], A = 160, R = 7, r0 = extent + 450;
  const forest = new THREE.Color(0x2c4a2a), meadow = new THREE.Color(0x5d7a3e);
  for (let a = 0; a <= A; a++) for (let r = 0; r < R; r++) {
    const th = a / A * Math.PI * 2, rr = r0 + r * 90;
    const h = (45 + 30 * Math.sin(th * 3 + 1) + 20 * Math.sin(th * 7 + 2) + 10 * Math.sin(th * 17)) * Math.pow(r / (R - 1), 0.7);
    hp.push(cx + Math.cos(th) * rr, h - 1, -cy + Math.sin(th) * rr);
    const c = meadow.clone().lerp(forest, Math.min(1, r / 2 + 0.2 * Math.sin(th * 23))); hc.push(c.r, c.g, c.b);
    if (a && r) { const k = a * R + r, j = k - R; hi.push(j - 1, k - 1, j, j, k - 1, k); }
  }
  hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
  hillGeo.setIndex(hi); hillGeo.computeVertexNormals();
  world.add(new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));

  // Tree clusters anywhere at least 20 m clear of the road.
  const rng = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const spots = [];
  for (let tries = 0; spots.length < 900 && tries < 600; tries++) {
    const tx = cx + (rng() - 0.5) * (maxX - minX + 300), ty = cy + (rng() - 0.5) * (maxY - minY + 300), m = 3 + Math.floor(rng() * 9);
    for (let i = 0; i < m; i++) {
      const x = tx + (rng() - 0.5) * 40, y = ty + (rng() - 0.5) * 40;
      if (Math.abs(track.offset(x, y)) > half + 20) spots.push([x, y, 0.75 + rng() * 0.6, rng() * Math.PI * 2, rng()]);
    }
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const treeGeometries = [treeGeometry('conifer'), treeGeometry('broadleaf')];
  const treeCells = new Map(), cellSize = 400;
  for (const spot of spots) {
    const [x, y] = spot, species = spot[4] < 0.45 ? 0 : 1;
    const key = `${species}:${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    (treeCells.get(key) ?? treeCells.set(key, { species, spots: [] }).get(key)).spots.push(spot);
  }
  for (const { species, spots: cellSpots } of treeCells.values()) {
    const mesh = new THREE.InstancedMesh(treeGeometries[species], treeMat, cellSpots.length);
    cellSpots.forEach(([x, y, sc, rot, v], i) => {
      const h = track.heightAt(track.progress(x, y));
      dummy.position.set(x, h, -y); dummy.rotation.set(0, rot, 0); dummy.scale.set(sc, sc * (0.85 + v * 0.3), sc);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      const tint = 0.8 + rng() * 0.35; mesh.setColorAt(i, new THREE.Color(tint * (0.95 + rng() * 0.15), tint, tint * (0.85 + rng() * 0.15)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = false;
    world.add(mesh);
  }
  world.userData = { center: [cx, cy], extent };
  return world;
}

// "Cursor Racing" wordmark with a two-ring loop mark; transparent background when bg is false.
export function drawLogo(g, w, h, bg = true) {
  g.clearRect(0, 0, w, h);
  if (bg) {
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#13263a'); grad.addColorStop(1, '#08111b');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6fffc3'; g.fillRect(0, h * 0.9, w, h * 0.04);
  }
  g.font = `italic 800 ${h * 0.5}px system-ui, sans-serif`;
  const word = g.measureText('Cursor').width;
  g.font = `italic 600 ${h * 0.3}px system-ui, sans-serif`;
  const racing = g.measureText('RACING').width + h * 0.3;
  const total = h * 1.25 + word + h * 0.25 + racing;
  let x = (w - total) / 2;
  const cy = h * 0.47, r = h * 0.2;
  const accent = g.createLinearGradient(x, 0, x + h * 1.1, 0); accent.addColorStop(0, '#6fffc3'); accent.addColorStop(1, '#3aa0ff');
  g.lineWidth = h * 0.09; g.strokeStyle = accent;
  g.beginPath(); g.arc(x + r + h * 0.05, cy, r, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x + r * 2.6 + h * 0.05, cy, r, 0, Math.PI * 2); g.stroke();
  x += h * 1.25;
  g.fillStyle = bg ? '#f2f7fb' : 'rgba(245,250,255,0.82)'; g.textBaseline = 'middle';
  g.font = `italic 800 ${h * 0.5}px system-ui, sans-serif`; g.fillText('Cursor', x, cy);
  x += word + h * 0.25;
  g.fillStyle = bg ? '#6fffc3' : 'rgba(111,255,195,0.85)';
  g.font = `italic 600 ${h * 0.3}px system-ui, sans-serif`;
  if ('letterSpacing' in g) g.letterSpacing = `${h * 0.06}px`;
  g.fillText('RACING', x, cy + h * 0.04);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

// Deterministic per-position hash so seam vertices of a primitive stay welded after jitter.
const hash = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };

// One tree as a non-indexed geometry with baked vertex colors (darker toward the crown base).
function treeGeometry(kind) {
  const parts = [];
  const add = (geo, color, center, crown, jitter) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = hash(x, y, z) - 0.5;
      if (jitter) { const k = 1 + n * jitter; p.setXYZ(i, center.x + (x - center.x) * k, y + n * jitter * 0.6, center.z + (z - center.z) * k); }
    }
    geo.computeVertexNormals();
    const g = geo.toNonIndexed(), q = g.attributes.position, nr = g.attributes.normal, col = [];
    for (let i = 0; i < q.count; i++) {
      const y = q.getY(i);
      let shade = 1;
      if (crown) {
        shade = 0.5 + 0.55 * Math.min(1, Math.max(0, (y - crown[0]) / (crown[1] - crown[0])));
        const rx = q.getX(i) - center.x, ry = y - center.y, rz = q.getZ(i) - center.z, l = Math.hypot(rx, ry, rz) || 1;
        nr.setXYZ(i, nr.getX(i) * 0.4 + rx / l * 0.6, nr.getY(i) * 0.4 + ry / l * 0.6, nr.getZ(i) * 0.4 + rz / l * 0.6);
      }
      const v = 0.92 + 0.16 * hash(q.getX(i) * 3, y * 3, q.getZ(i) * 3);
      col.push(color.r * shade * v, color.g * shade * v, color.b * shade * v);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(g);
  };
  const bark = new THREE.Color(0x4a3527);
  if (kind === 'conifer') {
    add(new THREE.CylinderGeometry(0.16, 0.3, 4, 7).translate(0, 2, 0), bark);
    const green = new THREE.Color(0x1f4a2b), top = 12.5;
    for (let i = 0; i < 5; i++) {
      const r = 2.7 * (1 - i * 0.17), y = 2.6 + i * 1.75;
      add(new THREE.ConeGeometry(r, 3.4 - i * 0.2, 11, 2).translate(0, y + 1.6, 0), green, new THREE.Vector3(0, 7, 0), [2.2, top], 0.35);
    }
  } else {
    add(new THREE.CylinderGeometry(0.22, 0.38, 4.2, 7).translate(0, 2.1, 0), bark);
    add(new THREE.CylinderGeometry(0.08, 0.16, 2.4, 5).rotateZ(0.7).translate(0.7, 4.2, 0), bark);
    add(new THREE.CylinderGeometry(0.08, 0.16, 2.2, 5).rotateZ(-0.6).rotateY(2).translate(-0.4, 4.0, 0.5), bark);
    const leaf = new THREE.Color(0x3d6a2c), c = new THREE.Vector3(0, 6.6, 0);
    const blobs = [[0, 6.8, 0, 2.6], [1.6, 6.0, 0.4, 1.9], [-1.5, 6.2, -0.5, 2.0], [0.3, 6.1, 1.6, 1.8], [-0.4, 5.9, -1.6, 1.8], [0.2, 8.4, 0.1, 1.8], [1.1, 7.7, -1.0, 1.5]];
    for (const [x, y, z, r] of blobs) add(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), leaf, c, [4.2, 9.8], 0.45);
  }
  // Merge parts.
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o);
    o += g.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
