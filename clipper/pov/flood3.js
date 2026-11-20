// Flood series Part 3: the shelter (spec.ending = "boat" | "heli" picks the intro; the rest is shared).
// A school gym on high ground past the highway, a parking garage next door that kept its lights,
// the calm eye of the hurricane, then the back eyewall and a second surge.
// Pure function of t like Parts 1-2: no Math.random, no clock.
import * as THREE from "./vendor/three.module.min.js";
import { buildWorld as baseWorld, mulberry32, keyed, clamp, lerp, ease, V, toon, OUTLINE, box, placeArm } from "./flood.js";
import { buildArms as arms2 } from "./flood2.js";

export const buildArms = arms2;

// ---------- timeline ----------
export const FLOOR = 7.3;                                  // gym floor (hill top 7.2 + slab)
export const WATER3 = [[0, 4.0], [22.6, 4.05], [28.4, FLOOR], [33, 7.52], [39, 7.72], [60, 7.8]];
export const waterLevel3 = t => keyed(WATER3, t);
export const EYE = [12.6, 14.0, 21.8, 22.6];              // rain fades out, calm, wall arrives, hit
export const BURST = 25.0, POWER_OFF = 26.0;
export const GYM = { x0: -124, x1: -100, z0: -12, z1: 12, top: 14.6 };
export const GARAGE = { x0: -124, x1: -104, z0: 20, z1: 40, decks: [7.2, 10.4, 13.6, 16.8, 20.0] };
const HILL = { x0: -140, x1: -91, z0: -30, z1: 52, top: 7.2 };
const insideGym = (x, z) => x > GYM.x0 && x < GYM.x1 && z > GYM.z0 && z < GYM.z1;
export const calm = t => t < EYE[0] ? 0 : t < EYE[1] ? ease((t - EYE[0]) / (EYE[1] - EYE[0])) : t < EYE[2] ? 1
  : t < EYE[3] ? 1 - ease((t - EYE[2]) / (EYE[3] - EYE[2])) : 0;

// ---------- builders ----------
function person(parent, vest, x, y, z, s = 1, seated = false) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  const legs = box(0.36, seated ? 0.42 : 0.8, 0.24, 0x2b2f3a, 0, seated ? 0.21 : 0.4, seated ? 0.12 : 0, g);
  if (seated) legs.rotation.x = 0;
  const y0 = seated ? 0.42 : 0.8;
  box(0.46, 0.62, 0.3, vest, 0, y0 + 0.31, 0, g, true);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), toon(0x8a5c3c)); head.position.set(0, y0 + 0.78, 0); g.add(head);
  const arm = side => {
    const a = new THREE.Group(); a.position.set(0.28 * side, y0 + 0.56, 0); g.add(a);
    box(0.11, 0.62, 0.11, vest, 0, -0.28, 0, a); return a;
  };
  g.userData = { armR: arm(1), armL: arm(-1), head, base: g.position.clone() };
  return g;
}

function car(parent, color, x, y, z, ry) {
  const c = new THREE.Group();
  box(1.9, 0.6, 4.0, color, 0, 0.5, 0, c, true); box(1.6, 0.55, 2.0, color, 0, 1.05, -0.2, c, true);
  box(1.62, 0.4, 1.0, new THREE.MeshBasicMaterial({ color: 0x223040 }), 0, 1.05, 0.55, c);
  for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), toon(0x151515));
    wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.33, wz); c.add(wh);
  }
  c.position.set(x, y, z); c.rotation.y = ry; parent.add(c);
  return c;
}

function sign(text, w, h, bg, fg, px) {                    // canvas-text plane (browser only)
  if (typeof document === "undefined") return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: bg }));
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = Math.round(1024 * h / w);
  const g = cv.getContext("2d");
  g.fillStyle = "#" + bg.toString(16).padStart(6, "0"); g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = "#ffffff"; g.lineWidth = 14; g.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  for (; px > 20; px -= 4) { g.font = `900 ${px}px "Arial Black", Arial, sans-serif`; if (g.measureText(text).width < cv.width - 80) break; }
  g.fillText(text, cv.width / 2, cv.height / 2 + 4);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

// ---------- world ----------
export function buildWorld(spec) {
  const W = baseWorld(spec);
  const S = W.scene;
  W.ending = spec.ending;
  W.house.visible = false;                                 // gone under in Part 2
  W.floaters.forEach(f => { f.o.visible = false; });
  W.lamp.intensity = 0; W.attic.intensity = 0; W.lampBulb.visible = false;
  W.water.visible = false;
  const rnd = mulberry32(2026);

  // wider sea that reaches past the highway (Part 1's water stops at x=-90)
  const wgeo = new THREE.PlaneGeometry(420, 420, 140, 140); wgeo.rotateX(-Math.PI / 2); wgeo.translate(-60, 0, 0);
  W.sea = new THREE.Mesh(wgeo, toon(0x1f7a94, { transparent: true, opacity: 0.88, side: THREE.DoubleSide, emissive: 0x062a36 }));
  W.seaBase = Float32Array.from(wgeo.attributes.position.array); S.add(W.sea);

  // high ground
  box(HILL.x1 - HILL.x0, 8.2, HILL.z1 - HILL.z0, 0x6b5a45, (HILL.x0 + HILL.x1) / 2, HILL.top - 4.1, (HILL.z0 + HILL.z1) / 2, S);
  box(HILL.x1 - HILL.x0, 0.06, HILL.z1 - HILL.z0, 0x3f7a3a, (HILL.x0 + HILL.x1) / 2, HILL.top + 0.03, (HILL.z0 + HILL.z1) / 2, S);
  box(9, 0.07, 4, 0x55575d, -95.5, HILL.top + 0.05, 0, S);                    // path to the door
  box(6, 0.07, 14, 0x55575d, -94, HILL.top + 0.05, -8, S);

  // highway (as in Part 2)
  const top = 7.2, cx = -86;
  box(10, 1.0, 170, 0x8d8f96, cx, top - 0.5, 0, S, true);
  box(10, 0.04, 170, 0x4a4c52, cx, top + 0.02, 0, S);
  for (let z = -80; z <= 80; z += 4) box(0.15, 0.03, 1.8, 0xe8e2c0, cx, top + 0.05, z, S);
  for (let k = -7; k <= 6; k++) {
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, top - 1, 10), toon(0x7d7f86)); pl.position.set(cx, (top - 1) / 2, 12 * k + 6); S.add(pl);
  }
  box(0.25, 0.8, 170, 0xb8bac0, -81.2, top + 0.4, 0, S);
  const amb = new THREE.Group(); amb.position.set(-84.6, top, -3.5); S.add(amb);
  box(2.2, 2.3, 5.4, 0xf4f4f4, 0, 1.45, 0, amb, true); box(2.22, 0.3, 5.42, 0xd92b2b, 0, 1.2, 0, amb);
  W.flashers = [];
  for (const [z, i] of [[-0.6, 0], [0.6, 1]]) {
    const m = box(0.5, 0.22, 0.45, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), 0, 2.75, z, amb);
    W.flashers.push({ m, on: i ? 0x6f9bff : 0xff5050, off: i ? 0x10204a : 0x4a1010, ph: i });
  }

  // ----- the gym -----
  const gym = new THREE.Group(); S.add(gym); W.gym = gym;
  const { x0, x1, z0, z1 } = GYM, H = GYM.top - FLOOR, gx = (x0 + x1) / 2;
  const EXT = toon(0xc9b79c), INT = toon(0xd8d2c4), BAND = toon(0x2d4f8a), WOOD = toon(0xc99a62);
  box(x1 - x0, 0.1, z1 - z0, WOOD, gx, FLOOR - 0.05, 0, gym);
  // court lines
  const LINE = new THREE.MeshBasicMaterial({ color: 0xf4efe4 });
  box(0.08, 0.012, 18, LINE, gx, FLOOR + 0.006, 0, gym);
  box(20, 0.012, 0.08, LINE, gx, FLOOR + 0.006, -9, gym); box(20, 0.012, 0.08, LINE, gx, FLOOR + 0.006, 9, gym);
  box(0.08, 0.012, 18, LINE, x0 + 2, FLOOR + 0.006, 0, gym); box(0.08, 0.012, 18, LINE, x1 - 2, FLOOR + 0.006, 0, gym);
  { const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.3, 40), LINE); ring.rotation.x = -Math.PI / 2; ring.position.set(gx, FLOOR + 0.007, 0); gym.add(ring); }
  // walls: east wall has the double door (z -1.6..1.6, up to 3.2 m)
  const wall = (w, h, d, x, y, z) => { box(w, h, d, INT, x, y, z, gym); };
  wall(0.3, H, z1 - z0, x0, FLOOR + H / 2, 0);
  wall(0.3, H, 1.6 - z0, x1, FLOOR + H / 2, (z0 - 1.6) / 2); wall(0.3, H, z1 - 1.6, x1, FLOOR + H / 2, (z1 + 1.6) / 2);
  wall(0.3, H - 3.2, 3.2, x1, FLOOR + 3.2 + (H - 3.2) / 2, 0);
  // long walls with a strip of high windows (y 10.6..12.2)
  W.panes = [];
  for (const z of [z0, z1]) {
    wall(x1 - x0, 3.3, 0.3, gx, FLOOR + 1.65, z);
    wall(x1 - x0, H - 4.9, 0.3, gx, 12.2 + (H - 4.9) / 2, z);
    for (let i = 0; i <= 6; i++) wall(0.5, 1.6, 0.3, x0 + 0.25 + i * (x1 - x0 - 0.5) / 6, 11.4, z);
    for (let i = 0; i < 6; i++) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.5),
        new THREE.MeshBasicMaterial({ color: 0x9fc6e0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      pane.position.set(x0 + 0.5 + 2.0 + i * 3.92 - 0.25, 11.4, z); gym.add(pane); W.panes.push(pane);
    }
    // painted band + bleacher-side trim inside
    box(x1 - x0 - 0.4, 1.2, 0.02, BAND, gx, FLOOR + 0.6, z + (z < 0 ? 0.17 : -0.17), gym);
  }
  // exterior skin + roof + trusses
  box(x1 - x0 + 0.6, 0.4, z1 - z0 + 0.6, 0x7a7068, gx, GYM.top + 0.2, 0, gym, true);
  for (const z of [z0 - 0.17, z1 + 0.17]) box(x1 - x0 + 0.3, 3.3, 0.04, EXT, gx, FLOOR + 1.65, z, gym);
  for (const z of [z0 - 0.17, z1 + 0.17]) box(x1 - x0 + 0.3, H - 4.9, 0.04, EXT, gx, 12.2 + (H - 4.9) / 2, z, gym);
  box(0.04, H, 10.4, EXT, x1 + 0.17, FLOOR + H / 2, -6.8, gym); box(0.04, H, 10.4, EXT, x1 + 0.17, FLOOR + H / 2, 6.8, gym);
  box(0.04, H - 3.2, 3.2, EXT, x1 + 0.17, FLOOR + 3.2 + (H - 3.2) / 2, 0, gym);
  for (let i = 1; i < 6; i++) box(0.25, 0.5, z1 - z0, 0x5a5048, x0 + i * 4, GYM.top - 0.35, 0, gym);
  // doors (swung open inward) + frame
  W.doors = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Group(); d.position.set(x1 - 0.1, FLOOR, 1.6 * s); gym.add(d);
    box(0.08, 3.1, 1.55, toon(0x8a3a2a), -0.04, 1.55, -0.78 * s, d, true);
    box(0.06, 0.1, 0.5, toon(0xd4d4d4), -0.1, 1.1, -1.3 * s, d);
    d.rotation.y = -1.25 * s; W.doors.push(d);
  }
  // sign over the door + lamps + sandbags
  const sg = sign("EMERGENCY SHELTER", 6.4, 1.1, 0x1d5fbf, "#ffffff", 104); sg.rotation.y = Math.PI / 2; sg.position.set(x1 + 0.22, FLOOR + 4.3, 0); gym.add(sg);
  W.extLamps = [];
  for (const z of [-2.6, 2.6]) {
    box(0.4, 0.25, 0.25, 0x333333, x1 + 0.35, FLOOR + 3.5, z, gym);
    const b = box(0.3, 0.12, 0.3, new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), x1 + 0.4, FLOOR + 3.36, z, gym);
    const pl = new THREE.PointLight(0xffc98a, 10, 10, 1.4); pl.position.set(x1 + 1.0, FLOOR + 3.0, z); gym.add(pl);
    W.extLamps.push({ b, pl });
  }
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toon(0xb8a27a)); bag.scale.set(1.3, 0.55, 0.8);
    bag.position.set(x1 + 0.7 + (i % 3) * 0.05, FLOOR + 0.15 + Math.floor(i / 3) * 0.28, s * (1.9 + (i % 3) * 0.6)); gym.add(bag);
  }
  // flagpole
  box(0.12, 9, 0.12, 0xd0d0d0, x1 + 6, FLOOR + 4.5, 7, S);
  W.flag = new THREE.Group(); W.flag.position.set(x1 + 6, FLOOR + 8.4, 7); S.add(W.flag);
  box(1.8, 1.0, 0.04, 0x2a6bff, 0.95, 0, 0, W.flag); box(1.8, 0.2, 0.05, 0xf2f2f2, 0.95, 0, 0, W.flag);

  // interior: lights, hoops, cots, supplies, radio, people
  W.ceil = []; W.inLights = [];
  for (const [x, z] of [[-106, -5], [-106, 5], [-112, -5], [-112, 5], [-118, -5], [-118, 5]]) {
    W.ceil.push(box(1.6, 0.12, 0.5, new THREE.MeshBasicMaterial({ color: 0xfff4d6 }), x, GYM.top - 0.9, z, gym));
    box(0.03, 0.8, 0.03, 0x333333, x, GYM.top - 0.45, z, gym);
  }
  for (const [x, z] of [[-106, 0], [-113, 0], [-120, 0]]) {
    const l = new THREE.PointLight(0xffe7c0, 22, 24, 1.1); l.position.set(x, GYM.top - 1.6, z); gym.add(l); W.inLights.push(l);
  }
  W.emerg = [];
  for (const [x, z] of [[x1 - 0.3, -3], [x1 - 0.3, 3], [x0 + 0.3, 0]]) {
    W.emerg.push({ m: box(0.2, 0.25, 0.45, new THREE.MeshBasicMaterial({ color: 0x3a1010 }), x, FLOOR + 4.4, z, gym) });
  }
  W.redLights = [new THREE.PointLight(0xff2a1a, 0, 22, 1.2), new THREE.PointLight(0xff2a1a, 0, 22, 1.2)];
  W.redLights[0].position.set(-102, FLOOR + 4, 0); W.redLights[1].position.set(-121, FLOOR + 4, 0);
  W.redLights.forEach(l => gym.add(l));
  for (const s of [-1, 1]) {
    const hx = s < 0 ? x0 + 0.6 : x1 - 0.6;
    if (s > 0) continue;                                    // the door wall has no hoop
    box(0.06, 1.1, 1.8, 0xf4f4f4, hx, FLOOR + 3.6, 0, gym, true);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20), toon(0xff6a00)); rim.rotation.x = Math.PI / 2;
    rim.position.set(hx + 0.35 * -s, FLOOR + 3.1, 0); gym.add(rim);
  }
  // red-cross supply stack + water pallets
  for (let i = 0; i < 6; i++) {
    const bx = box(0.7, 0.5, 0.5, 0xf2f2f2, -121.5 + (i % 3) * 0.75, FLOOR + 0.25 + Math.floor(i / 3) * 0.5, -10.4, gym, true);
    box(0.5, 0.12, 0.02, new THREE.MeshBasicMaterial({ color: 0xd91e1e }), 0, 0, -0.26, bx);
    box(0.12, 0.36, 0.02, new THREE.MeshBasicMaterial({ color: 0xd91e1e }), 0, 0, -0.26, bx);
  }
  for (let i = 0; i < 8; i++) box(0.5, 0.35, 0.35, 0x3d8fd9, -116 + (i % 4) * 0.55, FLOOR + 0.18 + Math.floor(i / 4) * 0.36, -10.5, gym);
  // radio table by the door
  box(1.6, 0.06, 0.8, 0x6b4a32, -103, FLOOR + 0.78, 6.2, gym, true);
  for (const [dx, dz] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) box(0.06, 0.78, 0.06, 0x333333, -103 + dx, FLOOR + 0.39, 6.2 + dz, gym);
  box(0.55, 0.3, 0.22, 0x1c1c1c, -103.2, FLOOR + 0.96, 6.2, gym, true);
  box(0.02, 0.5, 0.02, 0x888888, -103.0, FLOOR + 1.35, 6.2, gym);
  box(0.2, 0.14, 0.01, new THREE.MeshBasicMaterial({ color: 0x9ee08a }), -103.3, FLOOR + 1.0, 6.08, gym);
  W.led = box(0.04, 0.04, 0.01, new THREE.MeshBasicMaterial({ color: 0x40ff60 }), -103.05, FLOOR + 1.0, 6.08, gym);
  box(0.4, 0.3, 0.3, 0xe8a23a, -102.5, FLOOR + 0.96, 6.2, gym);   // flashlight box
  // cots in rows, some with blankets, people on and around them
  W.cots = [];
  const BL = [0xc0392b, 0x2980b9, 0x8e44ad, 0xf1c40f, 0x16a085, 0xe67e22];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const cot = new THREE.Group(); cot.position.set(-105.5 - c * 2.9, FLOOR, -7.5 + r * 4.4 + (c % 2) * 0.3); cot.rotation.y = (rnd() - 0.5) * 0.1;
    box(0.78, 0.08, 1.95, 0x5f7a4a, 0, 0.42, 0, cot, true);
    for (const [dx, dz] of [[-0.36, -0.9], [0.36, -0.9], [-0.36, 0.9], [0.36, 0.9]]) box(0.04, 0.4, 0.04, 0x333333, dx, 0.2, dz, cot);
    if (rnd() < 0.6) box(0.72, 0.06, 1.0, BL[Math.floor(rnd() * BL.length)], 0, 0.49, 0.35, cot);
    box(0.5, 0.1, 0.3, 0xf2f2f2, 0, 0.5, -0.75, cot);
    gym.add(cot); W.cots.push({ o: cot, ph: rnd() * 6 });
  }
  W.people = [];
  const VEST = [0xc0392b, 0x2c3e50, 0x27ae60, 0xd35400, 0x7f8c8d, 0x8e44ad, 0x16a085, 0xf39c12, 0x34495e, 0xe84393];
  for (let i = 0; i < 26; i++) {
    const cot = W.cots[Math.floor(rnd() * W.cots.length)].o;
    const seated = i < 11, kid = rnd() < 0.25;
    const x = seated ? cot.position.x : -104 - rnd() * 18, z = seated ? cot.position.z + (rnd() - 0.5) * 0.6 : -10 + rnd() * 20;
    const p = person(gym, VEST[i % VEST.length], x + (seated ? 0.45 : 0), FLOOR + (seated ? 0.44 : 0), z, kid ? 0.66 : 0.92 + rnd() * 0.14, seated);
    p.rotation.y = rnd() * Math.PI * 2; p.userData.ph = rnd() * 6; p.userData.panic = rnd() < 0.5;
    W.people.push(p);
  }

  // ----- the parking garage (on its own generator: lights stay on) -----
  const gar = new THREE.Group(); S.add(gar); W.garage = gar;
  const G = GARAGE, gxc = (G.x0 + G.x1) / 2, gzc = (G.z0 + G.z1) / 2;
  W.garLights = [];
  G.decks.forEach((y, k) => {
    box(G.x1 - G.x0, 0.32, G.z1 - G.z0, 0x9a9ca2, gxc, y + (k ? 0 : 0.05), gzc, gar, true);
    if (k) {
      for (const [w, d, x, z] of [[G.x1 - G.x0, 0.2, gxc, G.z0], [G.x1 - G.x0, 0.2, gxc, G.z1], [0.2, G.z1 - G.z0, G.x0, gzc], [0.2, G.z1 - G.z0, G.x1, gzc]])
        box(w, 1.0, d, 0xb8bac0, x, y + 0.66, z, gar);
      box(G.x1 - G.x0 - 2, 0.06, 0.25, new THREE.MeshBasicMaterial({ color: 0xfff1c8 }), gxc, y - 0.2, gzc - 4, gar);
      box(G.x1 - G.x0 - 2, 0.06, 0.25, new THREE.MeshBasicMaterial({ color: 0xfff1c8 }), gxc, y - 0.2, gzc + 4, gar);
    }
    if (k < G.decks.length - 1) for (const x of [G.x0 + 0.4, gxc, G.x1 - 0.4]) for (const z of [G.z0 + 0.4, gzc, G.z1 - 0.4])
      box(0.5, G.decks[k + 1] - y, 0.5, 0x8a8c92, x, y + (G.decks[k + 1] - y) / 2, z, gar);
    if (k && k < G.decks.length) {
      const l = new THREE.PointLight(0xfff1c8, 14, 16, 1.2); l.position.set(gxc, y - 0.6, gzc); gar.add(l); W.garLights.push(l);
    }
  });
  // cars on the decks
  [[1, -118, 24, 0], [1, -110, 36, Math.PI], [2, -120, 33, 0.05], [3, -108, 25, Math.PI], [4, -115, 37, 0]].forEach(([k, x, z, ry], i) =>
    car(gar, [0xf2f2f2, 0x2d6cdf, 0x222222, 0xd94141, 0xf5c518][i], x, G.decks[k] + 0.16, z, ry));
  // stair tower on the gym-facing corner, lit
  const st = new THREE.Group(); st.position.set(G.x1 - 1.6, 0, G.z0 - 1.6); gar.add(st);
  box(3.2, 15.6, 3.2, 0xa8a196, 0, 7.2 + 7.8, 0, st, true);
  for (let k = 0; k < 5; k++) box(0.06, 1.6, 1.4, new THREE.MeshBasicMaterial({ color: 0xfff1c8 }), 1.62, 8.6 + k * 3.2, 0, st);
  box(0.05, 0.4, 1.0, new THREE.MeshBasicMaterial({ color: 0x23e06a }), 1.63, 10.0, 0, st);
  box(0.06, 2.4, 1.3, toon(0x3a3a3a), 1.62, 8.4, -0.9, st);
  const ps = sign("P", 1.4, 1.4, 0x1d5fbf, "#ffffff", 700); ps.rotation.y = Math.PI / 2; ps.position.set(G.x1 + 0.12, 15.5, gzc); gar.add(ps);
  const stl = new THREE.PointLight(0xfff1c8, 10, 12, 1.3); stl.position.set(G.x1 + 0.8, 9.2, G.z0 - 1.6); gar.add(stl);

  // ----- the eye: stars, moon, the cloud wall around it -----
  { const n = 700, pos = new Float32Array(n * 3), r = mulberry32(31);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, e = 0.15 + r() * 1.35, R = 260;
      pos[i * 3] = -110 + R * Math.cos(e) * Math.cos(a); pos[i * 3 + 1] = R * Math.sin(e); pos[i * 3 + 2] = R * Math.cos(e) * Math.sin(a);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    W.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    W.stars.frustumCulled = false; S.add(W.stars); }
  W.moon = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf6f2e2, fog: false, transparent: true, opacity: 0 }));
  W.moon.position.set(-60, 170, -150); S.add(W.moon);
  W.halo = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xbfcbe8, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  W.halo.position.copy(W.moon.position); S.add(W.halo);
  W.eyewall = new THREE.Group(); S.add(W.eyewall);
  W.wallMat = new THREE.MeshBasicMaterial({ color: 0x252b38, fog: false, side: THREE.BackSide });
  W.wallBase = 0x252b38;
  if (typeof document !== "undefined") {
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 512;
    const g = cv.getContext("2d"), r = mulberry32(4711);
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#56607a"); grd.addColorStop(0.25, "#3c4459"); grd.addColorStop(1, "#1c212c");
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 70; i++) {                       // cloud lumps along the top
      g.fillStyle = `rgba(${110 + r() * 40 | 0},${118 + r() * 40 | 0},${140 + r() * 40 | 0},${0.25 + r() * 0.3})`;
      g.beginPath(); g.ellipse(r() * 1024, 30 + r() * 120, 40 + r() * 90, 18 + r() * 40, 0, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 420; i++) {                      // rain curtains hanging down
      const x = r() * 1024, w = 1 + r() * 6, y0 = 80 + r() * 120;
      g.fillStyle = `rgba(150,165,195,${0.05 + r() * 0.12})`; g.fillRect(x, y0, w, 512 - y0);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(7, 1);
    W.wallMat.map = tex; W.wallBase = 0x9a9a9a; W.wallMat.color.setHex(W.wallBase); W.wallMat.needsUpdate = true;
  }
  { const c = new THREE.Mesh(new THREE.CylinderGeometry(240, 240, 170, 64, 1, true), W.wallMat); c.position.y = 55; W.eyewall.add(c);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(236, 244, 16, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x59627a, fog: false, side: THREE.BackSide })); rim.position.y = 132; W.eyewall.add(rim);
    const rim2 = new THREE.Mesh(new THREE.CylinderGeometry(242, 238, 10, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3a4152, fog: false, side: THREE.BackSide })); rim2.position.y = 116; W.eyewall.add(rim2); }

  // debris for the back eyewall
  W.debris = [];
  { const r = mulberry32(77), COL = [0x8a6a4a, 0x5d5a58, 0xd9d0c0, 0x2e7d32, 0xb03a2e];
    for (let i = 0; i < 18; i++) {
      const m = box(0.3 + r() * 1.4, 0.06 + r() * 0.3, 0.2 + r() * 0.8, COL[i % COL.length], 0, 0, 0, S, i % 3 === 0);
      m.userData.s = [r() * 2.2, 6 + r() * 18, -14 + r() * 28, 18 + r() * 14, r() * 6]; W.debris.push(m);
    } }
  // window shards
  W.shards = new THREE.Group(); gym.add(W.shards);
  { const r = mulberry32(91);
    for (let i = 0; i < 60; i++) {
      const pane = W.panes[i % W.panes.length];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15 + r() * 0.3, 0.1 + r() * 0.25),
        new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      m.userData.s = [pane.position.x + (r() - 0.5) * 3.2, 11.4 + (r() - 0.5) * 1.3, pane.position.z, (pane.position.z < 0 ? 1 : -1) * (2 + r() * 4), (r() - 0.5) * 3, r() * 9];
      W.shards.add(m);
    } }

  // the guide who walks you in
  W.guide = person(S, spec.ending === "heli" ? 0xff6d00 : 0x2a6bff, -84, top, 1);
  if (spec.ending === "heli") box(0.34, 0.1, 0.34, 0xf2f2f2, 0, 1.7, 0, W.guide);
  W.boat.position.set(-78.6, 4, 2.0); W.boat.rotation.set(0, Math.PI / 2, 0);
  return W;
}

// ---------- shots ----------
const lv = (a, b, u) => a.clone().lerp(b, ease(u));
const none = () => ({ L: null, R: null });
const EYE_H = 8.95;                                    // standing eye height on the hill / highway
const P = (x, z, y = EYE_H) => V(x, y, z);
const walk = T => ({ L: [-0.3, -0.42 + 0.06 * Math.sin(T * 8), -0.48], R: [0.3, -0.42 - 0.06 * Math.sin(T * 8), -0.48] });
const shield = () => ({ L: [-0.14, 0.04, -0.33], R: [0.16, 0.07, -0.35] });

const INTRO = {
  boat: [
    { t0: 0.0, t1: 2.2, walk: [P(-82.2, 2.0), P(-83.0, 1.8)], cam: (u, T, C) => [lv(P(-82.2, 2.0), P(-83.0, 1.8), u), V(-100, 10.2, 0), 62, 0.008], arms: none },
    { t0: 2.2, t1: 5.0, walk: [P(-83.0, 1.8), P(-95.6, 0.6)], cam: (u, T, C) => [lv(P(-83.0, 1.8), P(-95.6, 0.6), u).add(V(0, 0.05 * Math.abs(Math.sin(T * 8)), 0)),
      V(-101, 10.0, 0), 64, 0.01], arms: (u, T) => walk(T) },
  ],
  heli: [
    { t0: 0.0, t1: 2.4, cabin: true, cam: (u, T, C) => [C.cabin, V(-104, 9, 4), 66, 0.02], arms: () => ({ L: [-0.12, -0.24, -0.4], R: null }) },
    { t0: 2.4, t1: 5.0, walk: [P(-87.2, -11.0), P(-95.6, -0.8)], cam: (u, T, C) => [lv(P(-87.2, -11.0), P(-95.6, -0.8), u).add(V(0, 0.05 * Math.abs(Math.sin(T * 8)), 0)),
      V(-101, 10.0, 0), 66, 0.03 * (1 - u) + 0.01], arms: (u, T) => walk(T) },
  ],
};
const COMMON = [
  { t0: 5.0, t1: 7.4, cam: (u, T) => [lv(P(-96.0, 0.3), P(-99.4, 0.2), u), lv(V(-100.2, 11.4, 0), V(-108, 8.6, 0), u), 62, 0.008], arms: (u, T) => walk(T) },
  { t0: 7.4, t1: 9.8, cam: (u, T) => [lv(P(-101.4, 0.2), P(-103.6, -1.0), u), V(-121, 8.2, 1 - 2 * u), 76, 0.006], arms: none },
  { t0: 9.8, t1: 12.4, cam: (u, T) => [lv(P(-102.6, 4.3, 8.9), P(-102.8, 4.7, 8.85), u), V(-103.2, FLOOR + 1.0, 6.2), 56, 0.004],
    arms: u => ({ L: null, R: [0.12, -0.25 + 0.1 * ease(u), -0.6] }) },
  { t0: 12.4, t1: 14.4, cam: (u, T) => [lv(P(-103.2, 1.0), P(-100.6, 0.3), u), V(-88, 9.6, 0), 64, 0.005], arms: (u, T) => walk(T) },
  { t0: 14.4, t1: 16.4, cam: (u, T) => [lv(P(-99.0, 0.3), P(-98.4, 0.4), u), lv(V(-80, 30, -30), V(-70, 60, -70), u), 72, 0.003], arms: none },
  { t0: 16.4, t1: 18.6, cam: (u, T) => [P(-98.4, 0.4), lv(V(-40, 90, 40), V(-60, 80, 90), u), 80, 0.003], arms: none },
  { t0: 18.6, t1: 20.6, cam: (u, T) => [P(-98.2, 0.4), V(-20, 34, -6), 62, 0.004], arms: none },
  { t0: 20.6, t1: 22.6, cam: (u, T) => [lv(P(-98.2, 0.4), P(-97.6, 0.5), u), V(-30, 26, -2), 54, 0.006 + 0.02 * u], arms: none },
  { t0: 22.6, t1: 24.4, cam: (u, T) => [lv(P(-97.6, 0.5), P(-100.9, 0.2), u), V(-80, 10, 2), 70, T < 23.4 ? 0.08 : 0.04], arms: shield },
  { t0: 24.4, t1: 26.2, cam: (u, T) => [lv(P(-103.0, 0.0), P(-104.0, 0.4), u), V(-113, 11.6, 12), 72, T > BURST && T < BURST + 0.6 ? 0.05 : 0.012],
    arms: (u, T) => T > BURST ? shield() : none() },
  { t0: 26.2, t1: 28.4, cam: (u, T) => [P(-103.2, -1.0), V(-119, 8.2, -2 + 4 * u), 74, 0.01], arms: none },
  { t0: 28.4, t1: 30.6, cam: (u, T) => [lv(P(-104.2, 1.6, 8.8), P(-103.8, 1.4, 8.75), u), V(-100.2, FLOOR, 0), 70, 0.014], arms: none },
  { t0: 30.6, t1: 33.0, cam: (u, T) => [lv(P(-96.6, 6.6), P(-96.9, 7.6), u), lv(V(-108, 12.5, 30), V(-112, 15, 32), u), 62, 0.02], arms: () => ({ L: [-0.32, 0.0, -0.55], R: null }) },
  { t0: 33.0, t1: 35.6, cam: (u, T) => [P(-102.4, 0.0), V(-114, FLOOR + 0.2, 4 - 6 * u), 72, 0.012], arms: none },
  { t0: 35.6, t1: 37.2, cam: (u, T) => [P(-101.4, 0.2), lv(V(-116, 8.4, -3), V(-116, 8.6, 3), u), 70, 0.016], arms: none },
  { t0: 37.2, t1: 39.0, cam: (u, T) => [lv(P(-96.6, 7.0), P(-96.9, 7.8), u), V(-111, 14, 30), 64, 0.016], arms: none },
  { t0: 39.0, t1: 60.0, cam: (u, T) => [P(-96.9, 7.8), V(-111.5, 14.5, 30.5), 64, 0.008], arms: none },
];
export const shotsFor3 = ending => [...INTRO[ending === "heli" ? "heli" : "boat"], ...COMMON];
export function shotAt3(ending, t) {
  const S = shotsFor3(ending);
  for (const s of S) if (t >= s.t0 && t < s.t1) return s;
  return S[S.length - 1];
}
// helicopter landing on the highway
export const heliPos3 = t => V(keyed([[0, -68], [3.0, -86]], t), keyed([[0, 21], [3.0, 8.75]], t), keyed([[0, -24], [3.0, -13]], t));

// ---------- per-frame update ----------
export function update(W, cam, arms, t, spec) {
  const T = t, end = W.ending || spec.ending;
  const L = waterLevel3(T), k = calm(T), wallOn = T >= EYE[3];
  const S = shotsFor3(end), shot = shotAt3(end, T);
  const u = clamp((T - shot.t0) / (shot.t1 - shot.t0), 0, 1);
  const C = {};

  // helicopter (heli intro) or parked boat
  if (end === "heli") {
    const hp = heliPos3(T); hp.y += T < 3 ? 0.25 * Math.sin(T * 1.3) : 0;
    W.heli.position.copy(hp); W.heli.lookAt(hp.clone().add(V(-1, 0, 0.6))); W.heli.rotateY(Math.PI); W.heli.rotateX(T < 3 ? -0.06 : 0);
    W.rotor.rotation.y = T * 31.0 * (T < 8 ? 1 : 0.3);
    W.heli.userData.cone.visible = false;
    W.heli.updateMatrixWorld(true);
    C.cabin = W.heli.localToWorld(V(0.9, -0.35, 0.2));
    W.heli.visible = !shot.cabin;
    W.boat.visible = false;
  } else {
    W.heli.visible = false;
    W.boat.position.y = L + 0.12 * Math.sin(T * 2.1); W.boat.visible = L < 7;
  }
  arms.frame.visible = !!shot.cabin;

  // guide walks ahead of you on the intro, then waits inside by the door
  const g = W.guide;
  if (shot.walk && T < 5.0) {
    const a = shot.walk[0], b = shot.walk[1], uu = Math.min(1, ease(u) + 0.22);
    const p = a.clone().lerp(b, uu);
    g.position.set(p.x + (end === "heli" ? 0.9 : -0.9) * 0 - 0.4, 7.2 + 0.03 * Math.abs(Math.sin(T * 8)), p.z + 0.8);
    g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    g.userData.armR.rotation.x = 0.5 * Math.sin(T * 8); g.userData.armL.rotation.x = -0.5 * Math.sin(T * 8);
    g.userData.armR.rotation.z = T < 2.2 ? 2.5 + 0.4 * Math.sin(T * 7) : 0;
  } else {
    g.position.set(-103.6, FLOOR, -3.0); g.rotation.y = Math.PI / 2;
    g.userData.armR.rotation.set(0, 0, T > 22.6 ? 2.4 + 0.4 * Math.sin(T * 6) : 0.15); g.userData.armL.rotation.set(0, 0, -0.15);
  }
  g.visible = !(shot.cabin);

  // power: on until the eyewall, flicker, then red emergency light
  const flick = T > POWER_OFF - 0.5 && T < POWER_OFF && Math.sin(T * 61) + Math.sin(T * 23) > 0.3;
  const power = T < POWER_OFF - 0.5 || flick;
  W.inLights.forEach(l => { l.intensity = power ? 22 : 0; });
  W.ceil.forEach(m => m.material.color.setHex(power ? 0xfff4d6 : 0x2a2a2a));
  W.extLamps.forEach(e => { e.pl.intensity = power ? 10 : 0; e.b.material.color.setHex(power ? 0xffe0a0 : 0x333333); });
  const red = T >= POWER_OFF ? 0.6 + 0.4 * Math.max(0, Math.sin(T * 5)) : 0;
  W.redLights.forEach(l => { l.intensity = 30 * red; });
  W.emerg.forEach(e => e.m.material.color.setHex(T >= POWER_OFF ? (Math.sin(T * 5) > 0 ? 0xff3a2a : 0x8a1a12) : 0x3a1010));
  W.led.material.color.setHex(T > 9.8 && T < 12.4 && Math.sin(T * 18) > 0 ? 0x40ff60 : 0x1a5a24);
  const blink = Math.floor(T * 4) % 2;
  W.flashers.forEach(f => f.m.material.color.setHex(blink === f.ph ? f.on : f.off));

  // windows burst, shards fly in and fall
  W.panes.forEach(p => { p.visible = T < BURST; });
  const ks = T - BURST;
  W.shards.visible = ks >= 0 && ks < 1.6;
  if (W.shards.visible) W.shards.children.forEach(m => {
    const [x, y, z, vz, vx, sp] = m.userData.s;
    m.position.set(x + vx * ks, Math.max(FLOOR + 0.02, y + 1.2 * ks - 4.9 * ks * ks), z + vz * ks);
    m.rotation.set(sp * ks, sp * 0.7 * ks, sp * 0.3 * ks);
  });

  // people: a little life, then fear
  W.people.forEach(p => {
    const d = p.userData;
    d.head.position.x = 0.02 * Math.sin(T * 1.3 + d.ph);
    const scared = T > BURST && d.panic;
    d.armR.rotation.z = scared ? 2.3 + 0.3 * Math.sin(T * 7 + d.ph) : 0.15;
    d.armL.rotation.z = scared ? -2.3 - 0.3 * Math.sin(T * 7 + d.ph) : -0.15;
    const wet = Math.max(0, L - FLOOR);
    p.position.y = d.base.y + (d.base.y > FLOOR + 0.2 ? Math.max(0, wet - 0.3) : 0);
  });
  // cots float once the water is in
  const wet = Math.max(0, L - FLOOR);
  W.cots.forEach(c => {
    c.o.position.y = FLOOR + Math.max(0, wet - 0.32);
    const f = wet > 0.32 ? 1 : 0;
    c.o.rotation.set(f * 0.06 * Math.sin(T * 1.4 + c.ph), c.o.rotation.y, f * 0.07 * Math.sin(T * 1.1 + c.ph));
  });
  W.doors.forEach((d, i) => { d.rotation.y = (i ? 1 : -1) * (-1.25 + (T > 22.6 ? 0.15 * Math.sin(T * 9 + i) : 0)); });

  // flag: whipping in the storm, limp in the eye
  W.flag.rotation.set(0, Math.PI + (1 - k) * 0.25 * Math.sin(T * 9), (k * -1.2) + (wallOn ? 0.2 * Math.sin(T * 13) : 0));

  // the eye
  W.stars.material.opacity = k; W.stars.visible = k > 0.01;
  W.moon.material.opacity = k; W.halo.material.opacity = 0.12 * k; W.moon.visible = W.halo.visible = k > 0.01;
  const wu = clamp((T - EYE[0]) / (EYE[3] - EYE[0]), 0, 1);
  W.eyewall.visible = T > EYE[0] - 0.2 && T < EYE[3] + 0.4;
  W.eyewall.position.set(-110 - 230 * wu, 0, 0);        // the east side of the wall closes on you

  // camera
  const [p, look, fov, sh] = shot.cam(u, T, C);
  const n1 = Math.sin(T * 37.1) + 0.6 * Math.sin(T * 23.7 + 1.3), n2 = Math.sin(T * 31.3 + 2.1) + 0.6 * Math.sin(T * 19.9);
  cam.position.set(p.x + sh * n1, p.y + sh * n2 + 0.01 * Math.sin(T * 7.0), p.z);
  cam.fov = fov; cam.updateProjectionMatrix();
  cam.lookAt(look);
  cam.rotateZ(sh * 0.8 * Math.sin(T * 17.3));

  // arms
  const pose = shot.arms(u, T);
  for (const [key, s] of [["L", -1], ["R", 1]]) {
    const a = arms[key], h = pose[key];
    a.g.visible = !!h;
    if (h) placeArm(a, V(0.34 * s, -0.5, 0.2), V(...h), s);
  }
  arms.X.g.visible = false;

  // sea: chop that dies in the eye and doubles in the back wall; flat inside the gym
  const amp = 0.28 * (1 - 0.8 * k) * (wallOn ? 1.6 : 1);
  const pos = W.sea.geometry.attributes.position, b = W.seaBase;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], z = b[i * 3 + 2];
    const a2 = insideGym(x, z) ? 0.08 : 1;
    pos.array[i * 3 + 1] = amp * a2 * (Math.sin(x * 0.35 + T * 1.9) + 0.6 * Math.sin(z * 0.5 - T * 2.6) + 0.3 * Math.sin((x + z) * 1.3 + T * 4.1));
  }
  pos.needsUpdate = true; W.sea.geometry.computeVertexNormals();
  W.sea.position.y = L;
  for (const c of W.cars) {
    c.o.position.y = Math.max(0, L - 0.6) + 0.1 * Math.sin(T * 1.5 + c.ph);
    c.o.rotation.set(0.08 * Math.sin(T * 1.2 + c.ph), c.ry + 0.1 * Math.sin(T * 0.4 + c.ph), 0.1 * Math.sin(T * 1.7 + c.ph));
  }

  // lightning (also lights up the eyewall from inside)
  let flash = 0;
  for (const lt of (spec.sfx?.lightning || [])) {
    const d = T - lt;
    if (d >= 0 && d < 0.35) flash = Math.max(flash, d < 0.08 ? 1 : d < 0.16 ? 0.3 : d < 0.24 ? 0.8 : 0.2);
  }
  W.bolt.visible = flash > 0.5 && !W.eyewall.visible;
  W.wallMat.color.setHex(W.wallBase).lerp(new THREE.Color(0xffffff), flash * 0.8);
  W.hemi.intensity = (T >= POWER_OFF ? 0.85 : 1.2) * (1 - 0.35 * k) + 3.0 * flash * (W.eyewall.visible ? 0.3 : 1);
  W.moon.visible = W.moon.visible;
  const storm = new THREE.Color(0x1c2846), eyeSky = new THREE.Color(0x0a1028);
  W.scene.background.copy(storm).lerp(eyeSky, k).lerp(new THREE.Color(0x9fb3d8), flash * 0.6 * (1 - k));
  W.scene.fog.color.copy(W.scene.background);
  W.scene.fog.near = lerp(20, 120, k) * (wallOn ? 0.6 : 1); W.scene.fog.far = lerp(150, 600, k) * (wallOn ? 0.7 : 1);
  W.bubbles.visible = false;

  // rain: around the camera, never inside the gym; gone in the eye; sideways in the back wall
  const wind = wallOn ? 1.0 : 0.12, speed = wallOn ? 26 : 18, ra = W.rpos;
  W.rain.material.opacity = 0.55 * (1 - k) + (wallOn ? 0.15 : 0);
  W.rain.visible = k < 0.99;
  for (let i = 0; i < W.rseed.length; i++) {
    const [sx, sy, sz] = W.rseed[i];
    let y = (sy - T * speed) % 24; if (y < 0) y += 24;
    let ox = ((sx + 20 + T * speed * wind * 0.8) % 40); if (ox < 0) ox += 40;
    const x = cam.position.x + 20 - ox, z = cam.position.z + sz;
    let yy = cam.position.y - 8 + y;
    if (insideGym(x, z) && yy < GYM.top + 0.5) yy = -50;
    ra[i * 6] = x; ra[i * 6 + 1] = yy; ra[i * 6 + 2] = z;
    ra[i * 6 + 3] = x + 0.12 + wind * 0.8; ra[i * 6 + 4] = yy + 0.7; ra[i * 6 + 5] = z;
  }
  W.rain.geometry.attributes.position.needsUpdate = true;

  // debris rides the back wall across the hill
  W.debris.forEach(m => {
    const [dl, h, z, sp, rot] = m.userData.s;
    const kk = T - EYE[3] - dl;
    m.visible = kk > 0;
    if (!m.visible) return;
    const span = 90, d = (kk * sp) % span;
    const x = -60 - d;
    m.position.set(x, h + 1.5 * Math.sin(kk * 2 + rot), z);
    m.rotation.set(kk * (2 + rot), kk * 1.3, kk * (1 + rot * 0.5));
    if (insideGym(x, z) && h < GYM.top + 1) m.visible = false;
  });

  return { L, under: false, flash, shot: S.indexOf(shot) };
}
