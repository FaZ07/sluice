// Flood series world + Part 1 shot list. Flat toon-shaded 3D, POV with arms.
// Everything is a pure function of time t (seconds): no Math.random, no clock.
import * as THREE from "./vendor/three.module.min.js";

// ---------- helpers ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, u) => V(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));

export function keyed(keys, t) {           // piecewise smooth interpolation
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

// Water level (metres above floor). Ceiling of the room = 3.0, roof top = 4.1.
export const WATER = [[0, 0.03], [3.7, 0.03], [4.5, 0.45], [6.6, 0.6], [8.4, 1.0], [10.2, 1.35],
  [12.0, 1.9], [13.8, 2.45], [15.0, 3.05], [21.4, 3.2], [23.2, 3.3], [31, 3.6], [36, 3.8], [45, 3.85]];
export const waterLevel = t => keyed(WATER, t);

// ---------- materials ----------
const grad = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true; return tex;
})();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0b0d14, side: THREE.BackSide });

function box(w, h, d, color, x, y, z, parent, outline = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === "number" ? toon(color) : color);
  m.position.set(x, y, z); parent.add(m);
  if (outline) {
    const o = new THREE.Mesh(m.geometry, OUTLINE);
    o.scale.set(1 + 0.06 / w, 1 + 0.06 / h, 1 + 0.06 / d); m.add(o);
  }
  return m;
}

// ---------- world ----------
export function buildWorld(spec) {
  const rnd = mulberry32(1337);
  const scene = new THREE.Scene();
  const SKY = new THREE.Color(0x1c2846);
  scene.background = SKY.clone();
  scene.fog = new THREE.Fog(0x1c2846, 20, 140);

  const hemi = new THREE.HemisphereLight(0x8a9cc8, 0x1a1f2e, 1.2); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa8b8e0, 1.6); moon.position.set(-30, 50, 20); scene.add(moon);
  const lamp = new THREE.PointLight(0xffc27a, 6, 9, 1.6); lamp.position.set(-2.2, 1.9, 1.8); scene.add(lamp);
  const attic = new THREE.PointLight(0x8fb6ff, 0, 5, 1.5); attic.position.set(-1.0, 3.7, 1.2); scene.add(attic);
  const lampBulb = box(0.25, 0.25, 0.25, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), -2.2, 1.7, 1.8, scene);
  box(0.08, 1.6, 0.08, 0x3a3030, -2.2, 0.8, 1.8, scene);

  // --- our house: room x,z in [-3,3], y in [0,3]; attic 3..3.9; roof slab 3.9..4.1
  const house = new THREE.Group(); scene.add(house);
  const WALL = toon(0xd9c9a8), FLOOR = toon(0x7a5434), CEIL = toon(0xe8e2d6), EXT = toon(0xf2a7b8);
  box(6.4, 0.1, 6.4, FLOOR, 0, -0.05, 0, house);
  // front wall (z=-3) with door hole x in [-0.5,0.5], y < 2.1
  box(2.7, 3.9, 0.2, WALL, -1.85, 1.95, -3.1, house); box(2.7, 3.9, 0.2, WALL, 1.85, 1.95, -3.1, house);
  box(1.0, 1.8, 0.2, WALL, 0, 3.0, -3.1, house);
  // back wall
  box(6.4, 3.9, 0.2, WALL, 0, 1.95, 3.1, house);
  // left wall x=-3
  box(0.2, 3.9, 6.4, WALL, -3.1, 1.95, 0, house);
  // right wall x=+3 with window z in [-1,1], y in [1,2.2]
  box(0.2, 3.9, 2.2, WALL, 3.1, 1.95, -2.1, house); box(0.2, 3.9, 2.2, WALL, 3.1, 1.95, 2.1, house);
  box(0.2, 1.0, 2.0, WALL, 3.1, 0.5, 0, house); box(0.2, 1.7, 2.0, WALL, 3.1, 3.05, 0, house);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x9fc6e0, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  glass.rotation.y = Math.PI / 2; glass.position.set(3.02, 1.6, 0); house.add(glass);
  box(0.25, 0.08, 2.1, 0x5a4636, 3.0, 1.0, 0, house); box(0.25, 0.08, 2.1, 0x5a4636, 3.0, 2.2, 0, house);
  box(0.25, 1.2, 0.06, 0x5a4636, 3.0, 1.6, 0, house);
  // ceiling with hatch hole at x in [-1.95,-1.05], z in [1.05,1.95]
  box(4.05, 0.12, 6.0, CEIL, 0.975, 3.0, 0, house);       // x -1.05..3
  box(1.95, 0.12, 4.05, CEIL, -2.025, 3.0, -0.975, house); // z -3..1.05
  box(1.95, 0.12, 1.05, CEIL, -2.025, 3.0, 2.475, house);  // z 1.95..3 (x -3..-1.05)
  box(0.9, 0.12, 0.9, CEIL, -2.475, 3.0, 1.5, house);      // x -3..-1.95 strip
  const hatch = new THREE.Group(); hatch.position.set(-1.05, 3.0, 1.5); house.add(hatch);
  box(0.9, 0.06, 0.9, toon(0xc9c0b0), -0.45, -0.03, 0, hatch, true);
  // attic floor planks (dark) above ceiling, attic walls are the outer walls
  const ATTIC = toon(0x5b5048);
  // roof slab made of planks along x (so we can break the ones above the hatch)
  const planks = [];
  for (let i = 0; i < 16; i++) {
    const z = -3.2 + i * 0.4 + 0.2;
    const p = box(6.6, 0.2, 0.38, ATTIC, 0, 4.0, z, house);
    p.userData.z = z; planks.push(p);
  }
  // planks over the hatch get replaced by a breakable short piece
  const breakable = [];
  for (const p of planks) {
    if (p.userData.z > 1.0 && p.userData.z < 2.0) {
      p.geometry = new THREE.BoxGeometry(4.6, 0.2, 0.38); p.position.x = 1.0;
      const left = box(1.0, 0.2, 0.38, ATTIC, -2.8, 4.0, p.userData.z, house);
      const b = box(1.0, 0.2, 0.38, ATTIC, -1.8, 4.0, p.userData.z, house);
      b.userData.home = b.position.clone(); breakable.push(b); left.userData.keep = true;
    }
  }
  // roof top surface (lighter tar) — thin layer, with a hole region left for breakables
  // exterior skin of walls (pink stucco) a little outside
  box(6.6, 4.1, 0.05, EXT, 0, 2.05, -3.24, house); box(6.6, 4.1, 0.05, EXT, 0, 2.05, 3.24, house);
  box(0.05, 4.1, 6.6, EXT, -3.24, 2.05, 0, house);
  box(0.05, 1.0, 6.6, EXT, 3.24, 0.5, 0, house).scale.z = 1;
  // door
  const door = new THREE.Group(); door.position.set(-0.5, 0, -3.0); house.add(door);
  box(1.0, 2.1, 0.08, toon(0x8a5a3a), 0.5, 1.05, 0, door, true);
  box(0.08, 0.08, 0.12, toon(0xd4af37), 0.85, 1.0, 0.08, door);
  // crack on the roof (grows in Part 1's ending)
  const crack = new THREE.Group(); crack.position.set(-0.6, 4.13, -0.4); house.add(crack);
  { let x = 0, z = 0; const r = mulberry32(7);
    for (let i = 0; i < 9; i++) {
      const dx = 0.35 + r() * 0.2, dz = (r() - 0.5) * 0.5;
      const len = Math.hypot(dx, dz);
      const seg = box(len, 0.02, 0.05, new THREE.MeshBasicMaterial({ color: 0x0a0a0a }), x + dx / 2, 0, z + dz / 2, crack);
      seg.rotation.y = -Math.atan2(dz, dx); seg.userData.i = i; x += dx; z += dz;
    } }

  // furniture that floats
  const floaters = [];
  const chair = new THREE.Group(); box(0.5, 0.06, 0.5, 0x3b6ea5, 0, 0.45, 0, chair, true);
  box(0.5, 0.5, 0.06, 0x3b6ea5, 0, 0.72, -0.22, chair, true);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(0.05, 0.45, 0.05, 0x2a2a2a, x, 0.22, z, chair);
  chair.position.set(-1.2, 0, -1.4); scene.add(chair); floaters.push({ o: chair, base: 0, ph: 0.3, h: 0.5 });
  const crate = box(0.6, 0.45, 0.5, 0xc89b5a, 1.4, 0.22, 1.2, scene, true); floaters.push({ o: crate, base: 0.22, ph: 1.7, h: 0.45 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), toon(0xe8742a));
  ball.position.set(0.8, 0.13, -0.8); scene.add(ball); floaters.push({ o: ball, base: 0.13, ph: 2.4, h: 0.26 });
  const tv = box(0.9, 0.55, 0.08, 0x111111, -2.6, 1.3, -0.5, scene, true); tv.rotation.y = Math.PI / 2;
  box(0.6, 0.5, 0.4, 0x4a3a2a, -2.7, 0.25, -0.5, scene);
  box(1.8, 0.45, 0.8, 0x6b4f8a, 1.6, 0.25, -2.3, scene, true);          // couch base
  box(1.8, 0.5, 0.2, 0x6b4f8a, 1.6, 0.6, -2.62, scene, true);

  // --- neighbourhood
  const town = new THREE.Group(); scene.add(town);
  const PASTEL = [0xf6c1cc, 0xa8e6cf, 0xffe08a, 0x8fd3e8, 0xf9b384, 0xd6c1f0, 0xffffff];
  const lots = [];
  for (const x of [-42, -28, -14, 0, 14, 28, 42]) for (const z of [-30, -16, 0, 16, 30]) {
    if (x === 0 && z === 0) continue;
    if (z === 0 && x < 0) continue;   // open water to the west: the boat's approach
    lots.push([x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3]);
  }
  for (const [x, z] of lots) {
    const w = 6 + rnd() * 4, d = 6 + rnd() * 4, h = rnd() < 0.3 ? 7 + rnd() * 2 : 4 + rnd() * 1.2;
    const col = PASTEL[Math.floor(rnd() * PASTEL.length)];
    box(w, h, d, col, x, h / 2, z, town, true);
    box(w + 0.4, 0.25, d + 0.4, 0x5d5a58, x, h + 0.12, z, town);
    // a few lit windows
    const lit = new THREE.MeshBasicMaterial({ color: rnd() < 0.5 ? 0xffd58a : 0x2a3348 });
    box(1.1, 0.8, 0.05, lit, x - w / 4, h - 1.4, z - d / 2 - 0.03, town);
    box(1.1, 0.8, 0.05, new THREE.MeshBasicMaterial({ color: 0x2a3348 }), x + w / 4, h - 1.4, z - d / 2 - 0.03, town);
  }
  // palms
  for (let i = 0; i < 26; i++) {
    const x = -50 + rnd() * 100, z = -40 + rnd() * 80;
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
    const palm = new THREE.Group(); palm.position.set(x, 0, z); town.add(palm);
    const h = 7 + rnd() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 7), toon(0x7a5b3a));
    trunk.position.y = h / 2; trunk.rotation.z = (rnd() - 0.5) * 0.2; palm.add(trunk);
    for (let k = 0; k < 7; k++) {
      const leaf = box(3.2, 0.08, 0.6, 0x2f8f4e, 0, h, 0, palm);
      leaf.geometry.translate(1.6, 0, 0);
      leaf.rotation.set(0, (k / 7) * Math.PI * 2, -0.35);
      leaf.userData.leaf = k;
    }
    palm.userData.palm = rnd() * 6;
  }
  // far skyline (Miami towers) with lit windows
  const sky = new THREE.Group(); scene.add(sky);
  for (let i = 0; i < 26; i++) {
    const x = -160 + i * 13 + rnd() * 6, h = 30 + rnd() * 70, w = 8 + rnd() * 8;
    box(w, h, 8, 0x232a40, x, h / 2, -150 - rnd() * 20, sky);
    for (let k = 0; k < 6; k++) {
      box(1.2, 1.2, 0.2, new THREE.MeshBasicMaterial({ color: 0xffd58a }),
        x - w / 2 + 1 + rnd() * (w - 2), 4 + rnd() * (h - 8), -145.5, sky);
    }
  }
  // floating cars
  const cars = [];
  const CARC = [0xd94141, 0xf2f2f2, 0x2d6cdf, 0x222222, 0xf5c518];
  for (const [x, z, ry] of [[7, -1, 0.4], [8.5, 3.5, -0.9], [-6, -11, 1.4], [3, -10.5, 1.7], [-17, -11, 1.5], [12, -8, -0.4]]) {
    const car = new THREE.Group();
    const c = CARC[cars.length % CARC.length];
    box(1.9, 0.6, 4.0, c, 0, 0.5, 0, car, true); box(1.6, 0.55, 2.0, c, 0, 1.05, -0.2, car, true);
    box(1.62, 0.4, 1.0, new THREE.MeshBasicMaterial({ color: 0x223040 }), 0, 1.05, 0.55, car);
    for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), toon(0x151515));
      wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.33, wz); car.add(wh);
    }
    box(0.3, 0.15, 0.05, new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), -0.6, 0.6, -2.02, car);
    box(0.3, 0.15, 0.05, new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), 0.6, 0.6, -2.02, car);
    car.position.set(x, 0, z); car.rotation.y = ry; scene.add(car);
    cars.push({ o: car, x, z, ry, ph: cars.length * 1.3 });
  }
  // street lights (some still on)
  for (const [x, z, on] of [[-8, -6, 1], [8, -6, 0], [-20, -6, 1], [20, -6, 1], [6, 8, 1]]) {
    box(0.15, 5, 0.15, 0x333333, x, 2.5, z, town);
    box(0.5, 0.15, 0.3, new THREE.MeshBasicMaterial({ color: on ? 0xffe2a0 : 0x444444 }), x, 5, z, town);
  }

  // --- boat + helicopter
  const boat = new THREE.Group(); scene.add(boat);
  { const sh = new THREE.Shape(); sh.moveTo(-1.1, 0); sh.lineTo(1.1, 0); sh.lineTo(0.8, -0.6); sh.lineTo(-0.8, -0.6); sh.closePath();
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 4.4, bevelEnabled: false }), toon(0xff7a1a));
    hull.position.set(0, 0.5, -2.2); boat.add(hull);
    const ho = new THREE.Mesh(hull.geometry, OUTLINE); ho.scale.set(1.04, 1.06, 1.02); hull.add(ho);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.4, 4), toon(0xff7a1a)); bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    bow.scale.set(1, 1, 0.45); bow.position.set(0, 0.2, -2.9); boat.add(bow);
    box(1.2, 0.9, 1.2, 0xf2f2f2, 0, 0.95, 0.6, boat, true);
    box(0.25, 0.25, 0.25, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), 0, 1.55, 0.6, boat);
    const bl = new THREE.SpotLight(0xfff1c0, 30, 40, 0.35, 0.5, 1.2); bl.position.set(0, 1.4, -0.4); boat.add(bl);
    bl.target.position.set(0, -1, -12); boat.add(bl.target);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 12, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    beam.rotation.x = Math.PI / 2; beam.position.set(0, 1.0, -6.4); boat.add(beam);
  }
  const heli = new THREE.Group(); scene.add(heli);
  const rotor = new THREE.Group();
  { const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 12), toon(0xf1f1f1)); body.scale.set(1, 0.9, 1.6); heli.add(body);
    const bo = new THREE.Mesh(body.geometry, OUTLINE); bo.scale.set(1.05, 1.05, 1.05); body.add(bo);
    box(0.5, 0.4, 4.2, 0xf1f1f1, 0, 0.3, 3.6, heli, true);
    box(0.1, 1.2, 0.6, 0xd92b2b, 0, 0.9, 5.6, heli);
    box(2.81, 0.5, 0.3, 0xd92b2b, 0, -0.2, 0, heli);
    const win = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d2b3a }));
    win.rotation.x = -Math.PI / 2; win.position.set(0, 0.1, -1.5); win.scale.set(1.1, 0.8, 0.7); heli.add(win);
    for (const x of [-0.9, 0.9]) box(0.1, 0.08, 3.0, 0x333333, x, -1.45, 0, heli);
    box(0.15, 0.4, 0.15, 0x333333, 0, 1.35, 0, heli);
    rotor.position.set(0, 1.6, 0); heli.add(rotor);
    box(9, 0.05, 0.35, 0x222222, 0, 0, 0, rotor); box(0.35, 0.05, 9, 0x222222, 0, 0, 0, rotor);
    const hl = new THREE.SpotLight(0xffffff, 80, 60, 0.28, 0.4, 1.0); hl.position.set(0, -1.3, -1); heli.add(hl);
    hl.target.position.set(0, -20, -6); heli.add(hl.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 20, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfaf6e0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.set(0, -11.3, -3); cone.rotation.x = 0.3; heli.add(cone);
    heli.userData.cone = cone;
  }
  // lightning bolt (sky)
  const bolt = new THREE.Group(); scene.add(bolt);
  { let x = 0, y = 60; const r = mulberry32(99);
    for (let i = 0; i < 10; i++) {
      const nx = x + (r() - 0.5) * 8, ny = y - 6;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, Math.hypot(nx - x, 6), 5),
        new THREE.MeshBasicMaterial({ color: 0xeef4ff }));
      seg.position.set((x + nx) / 2, (y + ny) / 2, 0); seg.rotation.z = Math.atan2(nx - x, 6) * -1; bolt.add(seg);
      x = nx; y = ny;
    } }
  bolt.position.set(-30, 0, -90); bolt.visible = false;

  // --- water
  const wgeo = new THREE.PlaneGeometry(180, 180, 90, 90); wgeo.rotateX(-Math.PI / 2);
  const wbase = Float32Array.from(wgeo.attributes.position.array);
  const water = new THREE.Mesh(wgeo, toon(0x1f7a94, { transparent: true, opacity: 0.86, side: THREE.DoubleSide, emissive: 0x062a36 }));
  scene.add(water);
  // inside water sheet (small, calmer) so the room surface reads clearly
  const surge = box(1.2, 1.4, 1.0, toon(0x3fa3c0, { transparent: true, opacity: 0.8 }), 0, 0.7, -3.6, scene);
  surge.visible = false;

  // rain
  const RN = 2600, rpos = new Float32Array(RN * 6), rseed = [];
  const rr = mulberry32(4242);
  for (let i = 0; i < RN; i++) rseed.push([rr() * 40 - 20, rr() * 24, rr() * 40 - 20]);
  const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
  const rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: 0xaecbe8, transparent: true, opacity: 0.55 }));
  rain.frustumCulled = false; scene.add(rain);

  // bubbles (underwater)
  const bubbles = new THREE.Group();
  const br = mulberry32(55);
  for (let i = 0; i < 60; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.008 + br() * 0.014, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.7 }));
    b.userData.s = [br() * 1.6 - 0.8, br() * 2, -0.6 - br() * 1.6, 0.4 + br() * 0.8]; bubbles.add(b);
  }

  return { scene, hemi, moon, lamp, attic, lampBulb, door, hatch, breakable, crack, floaters, cars, boat, heli, rotor,
    bolt, water, wbase, surge, rain, rpos, rseed, bubbles, glass, SKY, town };
}

// ---------- POV arms ----------
export function buildArms(camera) {
  const SLEEVE = toon(0x2b2f3a), SKIN = toon(0x9a6a48);
  const mk = () => {
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 1, 10), SLEEVE);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), toon(0x1c1f27));
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), SKIN); palm.scale.set(1.0, 0.65, 1.35); hand.add(palm);
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.05, 4, 6), SKIN);
      f.rotation.x = Math.PI / 2; f.position.set(-0.03 + k * 0.02, 0, -0.09); hand.add(f);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.04, 4, 6), SKIN);
    th.rotation.set(Math.PI / 2, 0, 0.9); th.position.set(0.055, 0, -0.03); hand.add(th);
    g.add(arm); g.add(cuff); g.add(hand);
    camera.add(g);
    return { g, arm, cuff, hand };
  };
  return { L: mk(), R: mk() };
}

const UP = V(0, 1, 0);
function placeArm(a, shoulder, handPos, side) {
  const dir = handPos.clone().sub(shoulder); const len = dir.length();
  a.arm.scale.set(1, len, 1);
  a.arm.position.copy(shoulder).addScaledVector(dir, 0.5);
  a.arm.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  a.cuff.position.copy(handPos).addScaledVector(dir.clone().normalize(), -0.03);
  a.cuff.quaternion.copy(a.arm.quaternion);
  a.hand.position.copy(handPos);
  a.hand.quaternion.setFromUnitVectors(V(0, 0, -1), dir.clone().normalize());  // fingers along the arm
  a.hand.rotateZ(side * 0.4);
}

// ---------- shots (Part 1) ----------
// cam: position / look target as [x,y,z] start->end (u in 0..1), fov, shake.
// arms(u, t) -> {L:[x,y,z]|null, R:[x,y,z]|null} in camera space.
const REST = s => [0.3 * s, -0.42, -0.5];
export const SHOTS = [
  { t0: 0.0, t1: 1.8, p: [[0.3, 1.65, 0.9], [0.25, 1.65, 0.45]], l: [[0, 1.1, -3], [0, 1.15, -3]], fov: 62, shake: 0.004,
    arms: u => ({ L: null, R: [lerp(0.32, 0.14, ease(u)), lerp(-0.45, -0.22, ease(u)), lerp(-0.5, -0.75, ease(u))] }) },
  { t0: 1.8, t1: 3.5, p: [[0.25, 0.32, -1.3], [0.2, 0.28, -1.75]], l: [[0, 0.02, -3], [0, 0.02, -3]], fov: 60, shake: 0.003,
    arms: () => ({ L: null, R: null }) },
  { t0: 3.5, t1: 5.0, p: [[0.1, 1.62, -1.55], [0.1, 1.6, -1.35]], l: [[0, 1.15, -3], [0, 1.0, -3]], fov: 64, shake: t => t > 3.75 ? 0.06 : 0.006,
    arms: u => u < 0.2 ? { L: null, R: [0.18, -0.25, -0.62] } : { L: [-0.25, -0.1 + 0.05 * Math.sin(u * 30), -0.55], R: [0.25, -0.12, -0.55] } },
  { t0: 5.0, t1: 6.6, p: [[2.15, 1.65, 0.3], [2.3, 1.62, 0.15]], l: [[12, 1.0, -0.5], [12, 0.8, 0.5]], fov: 60, shake: 0.012,
    arms: u => ({ L: [-0.32, -0.12, -0.6], R: null }) },
  { t0: 6.6, t1: 8.4, p: [[0, 1.65, 0.2], [0, 1.66, 0.0]], l: [[0.2, 0.0, -1.3], [0.1, 0.2, -1.5]], fov: 66, shake: 0.016,
    arms: (u, t) => ({ L: [-0.2 - 0.15 * Math.sin(t * 5), -0.38, -0.55], R: [0.2 + 0.15 * Math.sin(t * 5 + 1), -0.38, -0.55] }) },
  { t0: 8.4, t1: 10.2, p: [[0.1, 1.62, -1.75], [0.1, 1.62, -1.8]], l: [[0, 1.25, -3], [0, 1.2, -3]], fov: 62, shake: 0.03,
    arms: (u, t) => ({ L: [-0.22, -0.05, -0.62 - 0.08 * Math.max(0, Math.sin(t * 9))], R: [0.22, -0.02, -0.62 - 0.08 * Math.max(0, Math.sin(t * 9 + 1.6))] }) },
  { t0: 10.2, t1: 12.0, p: [[2.05, 1.72, 0.1], [2.15, 1.75, 0.0]], l: [[3, 1.6, 0.05], [3, 1.6, -0.05]], fov: 64, shake: t => 0.012 + 0.05 * Math.max(0, Math.sin(t * 13.9)),
    arms: (u, t) => ({ L: [-0.3, -0.25, -0.5], R: [0.12, 0.0, -0.62 - 0.14 * Math.max(0, Math.sin(t * 13.9))] }) },
  { t0: 12.0, t1: 13.8, p: [[0, 2.72, 0.5], [0, 2.78, 0.35]], l: [[0.3, 2.95, -1.8], [0.3, 2.98, -1.8]], fov: 70, shake: 0.02,
    arms: (u, t) => ({ L: [-0.3, 0.08, -0.38 + 0.02 * Math.sin(t * 7)], R: [0.3, 0.08, -0.4] }) },
  { t0: 13.8, t1: 15.6, p: [[0, 2.82, 0.3], [0, 2.25, 0.1]], l: [[0, 2.85, -3], [0, 2.35, -3]], fov: 70, shake: 0.025,
    arms: (u, t) => ({ L: [-0.28, 0.0 - 0.3 * u, -0.45], R: [0.28, 0.02 - 0.3 * u, -0.45] }) },
  { t0: 15.6, t1: 17.6, p: [[0.6, 2.2, 0.9], [0.1, 2.3, 0.3]], l: [[-1.2, 2.5, -1.6], [-1.4, 2.6, -1.9]], fov: 72, shake: 0.006,
    arms: (u, t) => { const s = 0.5 + 0.5 * Math.sin(t * 4); return { L: [-0.1 - 0.35 * s, -0.15, -0.65 + 0.2 * s], R: [0.1 + 0.35 * s, -0.15, -0.65 + 0.2 * s] }; } },
  { t0: 17.6, t1: 19.6, p: [[-1.5, 2.15, 2.15], [-1.5, 2.35, 1.95]], l: [[-1.5, 3.2, 1.4], [-1.5, 3.3, 1.45]], fov: 70, shake: 0.008,
    arms: (u, t) => ({ L: [-0.12, -0.05, -0.55 - 0.15 * ease(u)], R: [0.12, -0.05, -0.55 - 0.15 * ease(u)] }) },
  { t0: 19.6, t1: 21.4, p: [[-1.5, 2.95, 1.5], [-1.4, 3.45, 1.5]], l: [[1.5, 3.4, 1.5], [1.5, 3.42, 1.4]], fov: 72, shake: t => t < 20.2 ? 0.04 : 0.01,
    arms: u => ({ L: [-0.32, -0.32, -0.5], R: u > 0.4 ? [0.3, -0.3, -0.55] : null }) },
  { t0: 21.4, t1: 23.2, p: [[-1.55, 3.45, 1.55], [-1.55, 3.48, 1.55]], l: [[-1.6, 4.6, 1.45], [-1.6, 4.6, 1.45]], fov: 74,
    shake: t => 0.015 + 0.06 * Math.max(0, Math.sin((t - 21.4) * 7.9)),
    arms: (u, t) => ({ L: [-0.15, -0.08, -0.4 - 0.25 * Math.max(0, Math.sin((t - 21.4) * 7.9))], R: [0.15, -0.08, -0.4 - 0.25 * Math.max(0, Math.sin((t - 21.4) * 7.9 + 3.1))] }) },
  { t0: 23.2, t1: 25.2, p: [[-1.0, 5.65, 1.1], [-1.0, 5.7, 1.0]], l: [[-14, 3.8, -20], [10, 3.8, -22]], fov: 70, shake: 0.012,
    arms: () => ({ L: null, R: null }) },
  { t0: 25.2, t1: 27.0, p: [[-1.4, 5.7, 1.0], [-1.45, 5.7, 1.0]], l: ["boat", "boat"], fov: 58, shake: 0.01,
    arms: () => ({ L: [-0.3, -0.3, -0.55], R: null }) },
  { t0: 27.0, t1: 29.0, p: [[-1.0, 5.6, 1.2], [-1.0, 5.6, 1.2]], l: ["heli", "heli"], fov: 64, shake: 0.03,
    arms: () => ({ L: null, R: null }) },
  { t0: 29.0, t1: 31.0, p: [[-1.0, 5.7, 1.2], [-1.0, 5.72, 1.15]], l: [[3, 10, -9], [2, 10.5, -9]], fov: 70, shake: 0.03,
    arms: (u, t) => ({ L: [-0.3 + 0.12 * Math.sin(t * 9), 0.22, -0.55], R: [0.3 + 0.12 * Math.sin(t * 9 + 2), 0.24, -0.55] }) },
  { t0: 31.0, t1: 33.0, p: [[-1.0, 5.55, 1.3], [-1.0, 5.45, 1.25]], l: [[-0.3, 4.1, -0.7], [-0.2, 4.1, -0.8]], fov: 66, shake: t => 0.02 + 0.03 * Math.max(0, Math.sin(t * 6)),
    arms: () => ({ L: [-0.32, -0.4, -0.45], R: [0.32, -0.4, -0.45] }) },
  { t0: 33.0, t1: 35.0, p: [[-1.4, 5.6, 1.0], [-1.4, 5.6, 1.0]], l: ["boat", "boat"], fov: 50, shake: 0.02,
    arms: () => ({ L: null, R: null }) },
  { t0: 35.0, t1: 36.5, p: [[-1.0, 5.6, 1.2], [-1.0, 5.6, 1.2]], l: ["heli", "heli"], fov: 52, shake: 0.03,
    arms: () => ({ L: null, R: null }) },
  { t0: 36.5, t1: 45.0, p: [[-1.0, 5.75, 2.0], [-1.0, 5.85, 1.6]], l: [[-6, 6.0, -10], [-6, 6.3, -10]], fov: 80, shake: 0.01,
    arms: () => ({ L: null, R: null }) },
];

export function shotAt(t) {
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1) return s;
  return SHOTS[SHOTS.length - 1];
}

// boat / heli paths
const boatPos = t => lerpV([-50, 0, -8], [-7, 0, -7.2], ease((t - 24) / 17));
const heliPos = t => lerpV([26, 30, -46], [-2, 14.5, -12], ease((t - 25.5) / 15));

// ---------- per-frame update ----------
export function update(W, cam, arms, t, spec) {
  const T = Math.min(t, 40.0);                      // world freezes under the choice card
  const L = waterLevel(T);
  const shot = shotAt(T);
  const u = (T - shot.t0) / (shot.t1 - shot.t0);

  // boat / heli
  const bp = boatPos(T); bp.y = L + 0.15 * Math.sin(T * 2.1); W.boat.position.copy(bp);
  W.boat.rotation.set(0.05 * Math.sin(T * 1.7), Math.atan2(bp.x - (-1), bp.z - 1), 0.06 * Math.sin(T * 2.3));
  W.boat.visible = T > 23;
  const hp = heliPos(T); hp.y += 0.4 * Math.sin(T * 1.3); W.heli.position.copy(hp);
  W.heli.lookAt(V(-1, hp.y, 1)); W.heli.rotateY(Math.PI); W.heli.rotateX(-0.12);
  W.rotor.rotation.y = T * 31.0;
  W.heli.visible = T > 23;
  W.heli.userData.cone.rotation.z = 0.25 * Math.sin(T * 0.9);

  // camera
  const pick = (v, k) => v === "boat" ? boatPos(T).add(V(0, L + 0.8, 0)) : v === "heli" ? heliPos(T) : V(...v);
  const p = lerpV(shot.p[0], shot.p[1], ease(u));
  const look = pick(shot.l[0]).lerp(pick(shot.l[1]), ease(u));
  const sh = typeof shot.shake === "function" ? shot.shake(T) : shot.shake;
  const n1 = Math.sin(T * 37.1) + 0.6 * Math.sin(T * 23.7 + 1.3), n2 = Math.sin(T * 31.3 + 2.1) + 0.6 * Math.sin(T * 19.9);
  const bob = 0.012 * Math.sin(T * 7.0);
  cam.position.set(p.x + sh * n1, p.y + sh * n2 + bob, p.z);
  cam.fov = shot.fov; cam.updateProjectionMatrix();
  cam.lookAt(look);
  cam.rotateZ(sh * 0.8 * Math.sin(T * 17.3));

  // arms
  const pose = shot.arms(u, T);
  for (const [k, s] of [["L", -1], ["R", 1]]) {
    const a = arms[k], hp2 = pose[k];
    a.g.visible = !!hp2;
    if (hp2) placeArm(a, V(0.34 * s, -0.5, 0.2), V(...hp2), s);
  }

  // water surface
  const amp = T > 23 ? 0.28 : (T > 3.7 ? 0.06 : 0.01);
  const pos = W.water.geometry.attributes.position, b = W.wbase;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], z = b[i * 3 + 2];
    pos.array[i * 3 + 1] = amp * (Math.sin(x * 0.35 + T * 1.9) + 0.6 * Math.sin(z * 0.5 - T * 2.6) + 0.3 * Math.sin((x + z) * 1.3 + T * 4.1));
  }
  pos.needsUpdate = true; W.water.geometry.computeVertexNormals();
  W.water.position.y = L;
  W.water.material.opacity = L < 0.3 ? 0.45 : 0.86;
  W.attic.intensity = (T > 17.6 && T < 23.2) ? 0.9 : 0;

  // surge wave through the door
  W.surge.visible = T > 3.7 && T < 5.0;
  if (W.surge.visible) { const s = ease((T - 3.7) / 1.1); W.surge.position.set(0, 0.7, lerp(-3.4, -1.2, s)); W.surge.scale.set(1, lerp(0.4, 1.0, s), lerp(0.5, 2.5, s)); }

  // door + hatch + roof break + crack
  W.door.rotation.y = (T > 3.65 && T < 8.4) ? -1.45 * ease((T - 3.65) / 0.4) : 0;
  W.hatch.rotation.z = T > 18.6 ? -1.6 * ease((T - 18.6) / 0.6) : 0;
  W.breakable.forEach((p, i) => {
    if (T > 22.6) { const k = (T - 22.6); p.position.set(p.userData.home.x + k * (1 + i), p.userData.home.y + 2.5 * k - 4.9 * k * k, p.userData.home.z); p.rotation.set(k * 3, 0, k * 2); p.visible = k < 1.2; }
    else { p.position.copy(p.userData.home); p.rotation.set(0, 0, 0); p.visible = true; }
  });
  const cg = clamp((T - 31.0) / 1.8, 0, 1);
  W.crack.children.forEach(c => { c.visible = c.userData.i / 9 < cg; });

  // floaters
  for (const f of W.floaters) {
    const top = Math.min(L, 2.92);
    const y = Math.max(f.base, top - f.h * 0.4);
    f.o.position.y = (f.o === W.floaters[0].o) ? y - f.base : y;
    f.o.rotation.z = L > 0.4 ? 0.15 * Math.sin(T * 1.3 + f.ph) : 0;
    f.o.rotation.x = L > 0.4 ? 0.12 * Math.sin(T * 1.1 + f.ph * 2) : 0;
  }
  for (const c of W.cars) {
    c.o.position.y = Math.max(0, L - 0.6) + 0.1 * Math.sin(T * 1.5 + c.ph);
    c.o.rotation.set(0.08 * Math.sin(T * 1.2 + c.ph), c.ry + 0.1 * Math.sin(T * 0.4 + c.ph), 0.1 * Math.sin(T * 1.7 + c.ph));
  }

  // lamp dies when the water reaches it
  const lampOn = T < 7.8 || (T < 8.1 && Math.sin(T * 90) > 0);
  W.lamp.intensity = lampOn ? 6 : 0;
  W.lampBulb.material.color.setHex(lampOn ? 0xffd9a0 : 0x333333);

  // lightning
  let flash = 0;
  for (const lt of (spec.sfx?.lightning || [])) {
    const d = T - lt;
    if (d >= 0 && d < 0.35) flash = Math.max(flash, d < 0.08 ? 1 : d < 0.16 ? 0.3 : d < 0.24 ? 0.8 : 0.2);
  }
  W.bolt.visible = flash > 0.5 && T > 23;
  W.hemi.intensity = (T < 22.6 ? 0.75 : 1.2) + 3.0 * flash;

  // rain (around the camera; only outside or seen through the window)
  const outside = T >= 22.6;
  const rspeed = 18, ra = W.rpos;
  for (let i = 0; i < W.rseed.length; i++) {
    const [sx, sy, sz] = W.rseed[i];
    let y = (sy - T * rspeed) % 24; if (y < 0) y += 24;
    const x = outside ? cam.position.x + sx : 3.5 + (sx + 20), z = cam.position.z + sz;
    const yy = cam.position.y - 8 + y;
    ra[i * 6] = x; ra[i * 6 + 1] = yy; ra[i * 6 + 2] = z;
    ra[i * 6 + 3] = x + 0.12; ra[i * 6 + 4] = yy + 0.7; ra[i * 6 + 5] = z;
  }
  W.rain.geometry.attributes.position.needsUpdate = true;

  // underwater
  const under = cam.position.y < L - 0.02;
  if (under) {
    W.scene.background.setHex(0x0b5266); W.scene.fog.color.setHex(0x0b5266); W.scene.fog.near = 0.2; W.scene.fog.far = 5.5;
  } else {
    W.scene.background.copy(W.SKY).lerp(new THREE.Color(0x9fb3d8), flash * 0.6);
    W.scene.fog.color.copy(W.scene.background); W.scene.fog.near = 20; W.scene.fog.far = 140;
  }
  W.bubbles.visible = under;
  if (under) W.bubbles.children.forEach(b => {
    const [x, y, z, sp] = b.userData.s; let yy = (y + T * sp) % 2;
    b.position.set(x, yy - 1, z);
  });

  return { L, under, flash, shot: SHOTS.indexOf(shot) };
}
