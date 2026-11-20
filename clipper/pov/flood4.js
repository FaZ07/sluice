// Flood series Part 4: the shelter choice played out, one per route.
//   ending "boat" -> STAY: the gym floods, bleachers, a wave through the door, ladder to the roof.
//   ending "heli" -> RUN:  through the storm to the garage, up the stairwell, the roof deck, the generator dies.
// Runs on Part 3's world (flood3.js) 44 s later; pure function of t like the rest of the series.
import * as THREE from "./vendor/three.module.min.js";
import { mulberry32, keyed, clamp, lerp, ease, V, toon, box } from "./flood.js";
import * as F3 from "./flood3.js";

export const buildArms = F3.buildArms;
const { FLOOR, GYM, GARAGE } = F3;
export const OFFSET = 44;                                   // world time = Part 3's end + t
export const WATER4 = [[0, 7.75], [8, 8.3], [16, 8.9], [24, 9.6], [33, 10.6], [44, 11.0]];
export const waterLevel4 = t => keyed(WATER4, t);
export const WATER4R = [[0, 7.75], [10, 8.3], [20, 9.0], [26, 9.4], [29.5, 9.9], [31, 10.7], [44, 11.2]];
export const WAVE = [15.8, 17.8];                           // stay: a surge through the door
export const LIGHTS_OUT = 34.0;                             // run: the garage generator floods
const TW = V(-105.6, 0, 18.4);                              // stair tower centre (flood3)
const tw = (x, y, z) => V(TW.x + x, y, TW.z + z);
const ROW = k => FLOOR + 0.5 * (k + 1);                     // bleacher row k top
const ROWZ = k => -6.6 - 0.8 * k;
const HATCH = V(-123.1, GYM.top + 0.4, -11.1);              // roof hatch (roof top 15.0)

// ---------- world ----------
export function buildWorld(spec) {
  const W = F3.buildWorld(spec);
  const S = W.scene, rnd = mulberry32(404);
  W.offset = OFFSET;
  W.waterFn = spec.ending === "heli" ? (t => keyed(WATER4R, t)) : waterLevel4;
  W.shots = spec.ending === "heli" ? RUN_SHOTS : STAY_SHOTS;
  W.guide.visible = true;

  if (spec.ending !== "heli") {
    // bleachers along the south wall, a ladder up the west wall to a roof hatch
    for (let k = 0; k < 7; k++) {
      const h = 0.5 * (k + 1);
      box(19.8, h, 0.8, k % 2 ? 0x7a889e : 0x8a99b0, -113.9, FLOOR + h / 2, ROWZ(k), W.gym);
      box(19.8, 0.03, 0.06, 0xd8dde6, -113.9, FLOOR + h + 0.015, ROWZ(k) + 0.37, W.gym);
    }
    const lad = new THREE.Group(); W.gym.add(lad);
    for (const z of [-11.45, -10.75]) box(0.06, 4.0, 0.06, 0xc0c4cc, -123.6, ROW(6) + 1.9, z, lad);
    for (let y = ROW(6) + 0.2; y < GYM.top - 0.1; y += 0.3) box(0.05, 0.05, 0.7, 0xc0c4cc, -123.6, y, -11.1, lad);
    box(0.9, 0.02, 0.9, new THREE.MeshBasicMaterial({ color: 0x0c0d10 }), -123.15, GYM.top - 0.01, -11.1, W.gym);
    for (const [w, d, dx, dz] of [[1.1, 0.1, 0, -0.5], [1.1, 0.1, 0, 0.5], [0.1, 1.1, -0.5, 0], [0.1, 1.1, 0.5, 0]])
      box(w, 0.22, d, 0x5a5048, HATCH.x + dx, HATCH.y + 0.11, HATCH.z + dz, S);
    W.lid = new THREE.Group(); W.lid.position.set(HATCH.x + 0.5, HATCH.y + 0.22, HATCH.z); S.add(W.lid);
    box(1.0, 0.06, 1.0, 0x6a6058, -0.5, 0.03, 0, W.lid, true);
    // the surge wave
    W.wave = new THREE.Group(); W.gym.add(W.wave);
    box(2.6, 2.2, 21, toon(0x3fa3c0, { transparent: true, opacity: 0.85 }), 0, 1.1, 0, W.wave);
    box(1.4, 0.45, 21, toon(0xeaf6ff), 0.6, 2.3, 0, W.wave);
    box(0.9, 0.3, 21, toon(0xffffff), 1.4, 2.0, 0, W.wave);
    // people who make it onto the roof, and the kid you pull up
    W.roofPeople = [];
    for (let i = 0; i < 7; i++) {
      const p = F3.person(S, [0xc0392b, 0x27ae60, 0x8e44ad, 0xf39c12, 0x34495e, 0x16a085, 0xe84393][i],
        -121.6 + (i % 4) * 1.2, GYM.top + 0.4, -10.2 + Math.floor(i / 4) * 1.4 + rnd() * 0.3, i === 3 ? 0.66 : 0.95, i % 2 === 0);
      p.rotation.y = rnd() * 6.28; p.visible = false; W.roofPeople.push(p);
    }
    W.kid = F3.person(S, 0xf1c40f, HATCH.x, 0, HATCH.z, 0.66);
  } else {
    // the stair tower door, a hollow stairwell inside, and the flying sheet of metal
    W.stair.children.forEach(c => { if (Math.abs(c.position.x - 1.62) < 0.01 && Math.abs(c.position.z + 0.9) < 0.01) c.visible = false; });
    W.towerDoor = new THREE.Group(); W.towerDoor.position.set(1.64, 7.2, -0.25); W.stair.add(W.towerDoor);
    box(0.06, 2.3, 1.3, 0x3a3a3a, 0.03, 1.15, -0.65, W.towerDoor, true);
    box(0.02, 2.2, 1.25, new THREE.MeshBasicMaterial({ color: 0x1c2026 }), 1.63, 8.3, -0.9, W.stair);
    box(0.02, 0.2, 0.5, new THREE.MeshBasicMaterial({ color: 0x23e06a }), 1.64, 9.55, -0.9, W.stair);
    W.inside = new THREE.Group(); W.inside.position.copy(TW); S.add(W.inside); W.inside.visible = false;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(3.1, 15.4, 3.1), toon(0x75726c, { side: THREE.BackSide }));
    shell.position.y = 7.2 + 7.7; W.inside.add(shell);
    const STEP = toon(0x5b5955), EDGE = new THREE.MeshBasicMaterial({ color: 0xf2c94c });
    for (let f = 0; f < 4; f++) {
      const b = 7.2 + 3.2 * f;
      box(3.0, 0.2, 0.7, STEP, 0, b - 0.1, -1.15, W.inside);                 // south landing
      box(3.0, 0.2, 0.7, STEP, 0, b + 1.5, 1.15, W.inside);                  // north landing
      for (let j = 0; j < 8; j++) {
        box(1.4, 0.2, 0.2, STEP, -0.75, b + 0.2 * j + 0.1, -0.7 + 0.2 * j, W.inside);
        box(1.4, 0.2, 0.2, STEP, 0.75, b + 1.6 + 0.2 * j + 0.1, 0.7 - 0.2 * j, W.inside);
        box(1.4, 0.015, 0.03, EDGE, -0.75, b + 0.2 * j + 0.205, -0.79 + 0.2 * j, W.inside);
        box(1.4, 0.015, 0.03, EDGE, 0.75, b + 1.6 + 0.2 * j + 0.205, 0.79 - 0.2 * j, W.inside);
      }
      const rail = (x, y0, z0, y1, z1) => {
        const a = V(x, y0, z0), c = V(x, y1, z1), d = c.clone().sub(a);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 6), toon(0xd94b2b));
        m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); W.inside.add(m);
      };
      rail(0, b + 0.95, -0.8, b + 2.55, 0.8); rail(0, b + 2.55, 0.8, b + 4.15, -0.8);
      box(0.5, 0.1, 0.12, new THREE.MeshBasicMaterial({ color: 0xfff6dc }), 0, b + 2.6, -1.52, W.inside);   // wall lamp
      const n = F3.sign(String(f + 1), 0.7, 0.7, 0x1d5fbf, "#ffffff", 420); n.position.set(-0.9, b + 2.0, -1.53); W.inside.add(n);
    }
    const top = F3.sign("5", 0.7, 0.7, 0x1d5fbf, "#ffffff", 420); top.position.set(-0.9, 20.0 + 2.0, -1.53); W.inside.add(top);
    box(0.5, 0.18, 0.04, new THREE.MeshBasicMaterial({ color: 0x23e06a }), 0, 22.4, 1.52, W.inside);
    W.roofDoor = new THREE.Group(); W.roofDoor.position.set(-0.6, 20.16, 1.53); W.inside.add(W.roofDoor);
    box(1.2, 2.2, 0.06, 0x3a3a3a, 0.6, 1.1, 0, W.roofDoor);
    W.stairLight = new THREE.PointLight(0xfff1d8, 5, 6, 1.4); S.add(W.stairLight);
    box(1.2, 2.2, 0.01, new THREE.MeshBasicMaterial({ color: 0x1f2a46 }), 0, 21.26, 1.545, W.inside);
    W.sheet = box(2.2, 0.04, 1.3, 0xb8bcc4, 0, 0, 0, S, true); W.sheet.visible = false;
    // what the generator powers
    W.genMats = []; W.genLights = [];
    W.garage.traverse(o => {
      if (o.isMesh && o.material.isMeshBasicMaterial && o.material.color.getHex() === 0xfff1c8) W.genMats.push(o.material);
      if (o.isPointLight) W.genLights.push(o);
    });
  }
  return W;
}

// ---------- shots ----------
const lv = (a, b, u) => a.clone().lerp(b, ease(u));
const none = () => ({ L: null, R: null });
const E = 1.65;
const P = (x, z, y) => V(x, y, z);
const wade = t => ({ L: [-0.32, -0.36 + 0.07 * Math.sin(t * 5), -0.46], R: [0.32, -0.36 - 0.07 * Math.sin(t * 5), -0.46] });
const run = t => ({ L: [-0.3, -0.38 + 0.11 * Math.sin(t * 11), -0.46], R: [0.3, -0.38 - 0.11 * Math.sin(t * 11), -0.46] });
const climb = t => ({ L: [-0.18, 0.18 + 0.1 * Math.sin(t * 6), -0.42], R: [0.18, 0.18 - 0.1 * Math.sin(t * 6), -0.42] });
const R5 = ROW(5) + E, R6 = ROW(6) + E;

export const STAY_SHOTS = [
  { t0: 0.0, t1: 2.2, cam: (u, t) => [lv(P(-102.4, 0.0, 8.95), P(-103.0, -0.4, 8.95), u), V(-114, 7.9, 3), 72, 0.012], arms: none },
  { t0: 2.2, t1: 4.4, cam: (u, t, C) => [P(-103.0, -0.4, 8.95), V(-104.2, C.L - 0.2, 1.4), 70, 0.014], arms: t => wade(t) },
  { t0: 4.4, t1: 6.6, cam: (u, t) => [P(-103.0, -0.6, 8.95), V(-104.6, 8.6, -4.2), 60, 0.01], arms: none },
  { t0: 6.6, t1: 9.0, cam: (u, t) => [lv(P(-103.2, -0.8, 8.95), P(-108.0, -5.4, 8.95), u), V(-112, 9.6, -10), 70, 0.016], arms: (u, t) => wade(t) },
  { t0: 9.0, t1: 11.2, cam: (u, t) => { const k = 5 * ease(u); return [P(-108.2 - 0.2 * u, ROWZ(k), ROW(k) + E), V(-112, ROW(k) + 2.2, -12), 68, 0.012]; },
    arms: (u, t) => climb(t) },
  { t0: 11.2, t1: 13.4, cam: (u, t) => [P(-109.0, ROWZ(5), R5), lv(V(-110, 8.0, 6), V(-116, 8.0, 4), u), 74, 0.008], arms: none },
  { t0: 13.4, t1: 15.6, cam: (u, t, C) => [P(-109.0, ROWZ(5), R5), V(-109.4, C.L, -6.4), 62, 0.008], arms: none },
  { t0: 15.6, t1: 18.0, cam: (u, t) => [P(-109.0, ROWZ(5), R5), lv(V(-100.5, 9.0, 0), V(-112, 8.6, 0), clamp((t - WAVE[0]) / 2, 0, 1)), 68,
    t > 16.4 && t < 17.6 ? 0.05 : 0.012], arms: t => t > 16.2 ? { L: [-0.3, -0.25, -0.5], R: [0.3, -0.25, -0.5] } : none() },
  { t0: 18.0, t1: 20.0, cam: (u, t) => [P(-109.2, ROWZ(5), R5), V(-118, 8.6, 2), 72, 0.025], arms: none },
  { t0: 20.0, t1: 22.4, cam: (u, t, C) => [P(-109.2, ROWZ(5), R5), V(-109.6, C.L, -5.8), 66, 0.01], arms: none },
  { t0: 22.4, t1: 24.6, cam: (u, t) => [P(-110.0, ROWZ(6), R6), lv(V(-121.5, 11.2, -11.2), V(-123.4, 14.4, -11.1), u), 64, 0.01], arms: none },
  { t0: 24.6, t1: 27.0, cam: (u, t) => [lv(P(-110.5, ROWZ(6), R6), P(-122.3, -11.2, R6), u), V(-124, 12.6, -11.2), 66, 0.012], arms: (u, t) => wade(t) },
  { t0: 27.0, t1: 29.6, cam: (u, t) => { const y = lerp(R6, GYM.top - 0.3, ease(u)); return [P(-122.75, -11.1, y), V(-123.5, y + 1.6, -11.1), 72, 0.01]; },
    arms: (u, t) => climb(t) },
  { t0: 29.6, t1: 31.4, cam: (u, t) => [P(HATCH.x, HATCH.z, HATCH.y + 0.25 + 0.5 * ease(u)), lv(V(-110, 18, -4), V(-104, 14, 10), u), 76, 0.04],
    arms: u => ({ L: [-0.2, 0.25 - 0.4 * ease(u), -0.4], R: [0.24, 0.2 - 0.4 * ease(u), -0.42] }) },
  { t0: 31.4, t1: 34.0, cam: (u, t) => [P(-121.6, -10.4, HATCH.y + E), lv(V(-90, 12, 10), V(-108, 16, 30), u), 70, 0.03], arms: none },
  { t0: 34.0, t1: 36.6, cam: (u, t) => [P(-122.3, -10.6, HATCH.y + 1.4), V(HATCH.x, HATCH.y + 0.3, HATCH.z), 66, 0.02],
    arms: u => ({ L: null, R: [0.08, -0.3 + 0.12 * ease(u), -0.5] }) },
  { t0: 36.6, t1: 40.0, cam: (u, t) => [P(-116.5, -6.5, HATCH.y + 1.2), lv(V(-121, 15.4, -10), V(-117, 15.8, -12), u), 70, 0.02], arms: none },
  { t0: 40.0, t1: 60.0, cam: (u, t) => [P(-116.5, -6.5, HATCH.y + 1.2), V(-100, 13, -6), 66, 0.012], arms: none },
];

// stairwell camera: flight n (0..7) at fraction q
function stairCam(n, q) {
  const f = Math.floor(n / 2), b = 7.2 + 3.2 * f, A = n % 2 === 0;
  const z = A ? lerp(-1.0, 1.0, q) : lerp(1.0, -1.0, q), y = b + (A ? 0 : 1.6) + 1.6 * q + E, x = A ? -0.75 : 0.75;
  return [tw(x, y, z - (A ? 0.3 : -0.3)), tw(x, y - 0.5, z + (A ? 1.9 : -1.9))];
}
const panel = t => { const u = (t - 6.6) / 1.4; return V(lerp(-88, -110, u), lerp(9.6, 9.2, u), lerp(6, 15, u)); };

export const RUN_SHOTS = [
  { t0: 0.0, t1: 2.2, cam: (u, t) => [P(-96.9, 7.8, 8.95), V(-111, 14, 30), 64, 0.016], arms: none },
  { t0: 2.2, t1: 4.6, cam: (u, t) => [lv(P(-97.3, 8.4, 8.95), P(-98.4, 11.0, 8.95), u).add(V(0, 0.08 * Math.abs(Math.sin(t * 11)), 0)),
    V(-104, 9.4, 17.5), 72, 0.03], arms: (u, t) => run(t) },
  { t0: 4.6, t1: 6.6, cam: (u, t) => [lv(P(-98.4, 11.0, 8.95), P(-97.3, 11.4, 8.85), u), V(-102, 9.2, 16), 74, 0.06], arms: () => ({ L: [-0.38, -0.1, -0.4], R: [0.36, -0.3, -0.5] }) },
  { t0: 6.6, t1: 8.4, cam: (u, t) => { const d = clamp((t - 7.0) / 0.25, 0, 1) * (1 - clamp((t - 7.8) / 0.4, 0, 1));
    return [P(-98.0, 11.0, 8.95 - 0.85 * d), t < 7.1 ? panel(Math.max(6.7, t)) : V(-90, 9.6 - 0.5 * d, 7), 70, 0.02 + 0.05 * d]; },
    arms: (u, t) => t > 7.0 && t < 7.9 ? { L: [-0.14, 0.12, -0.32], R: [0.16, 0.14, -0.33] } : none() },
  { t0: 8.4, t1: 10.6, cam: (u, t) => [lv(P(-99.0, 12.6, 8.95), P(-102.6, 17.2, 8.95), u).add(V(0, 0.07 * Math.abs(Math.sin(t * 11)), 0)),
    V(-104.2, 9.0, 17.6), 70, 0.025], arms: (u, t) => run(t) },
  { t0: 10.6, t1: 12.4, cam: (u, t) => [lv(P(-102.4, 17.4, 8.95), P(-103.4, 17.6, 8.95), u), V(-106, 8.9, 17.6), 66, 0.015],
    arms: u => ({ L: null, R: [0.18, -0.12, -0.55 - 0.15 * ease(u)] }) },
  { t0: 12.4, t1: 14.4, inside: true, cam: (u, t) => { const [p, l] = stairCam(0, ease(u)); return [p, l, 92, 0.012]; }, arms: (u, t) => run(t) },
  { t0: 14.4, t1: 16.2, inside: true, cam: (u, t) => { const [p, l] = stairCam(1, ease(u)); return [p, l, 92, 0.012]; },
    arms: (u, t) => ({ L: null, R: [0.28, -0.3 + 0.05 * Math.sin(t * 9), -0.48] }) },
  { t0: 16.2, t1: 18.0, inside: true, cam: (u, t) => { const [p, l] = stairCam(4, ease(u)); return [p, l, 92, 0.015]; }, arms: (u, t) => run(t) },
  { t0: 18.0, t1: 19.6, inside: true, cam: (u, t) => { const [p, l] = stairCam(7, ease(u)); return [p, l, 92, 0.015]; },
    arms: (u, t) => ({ L: null, R: [0.28, -0.3 + 0.05 * Math.sin(t * 9), -0.48] }) },
  { t0: 19.6, t1: 21.0, inside: true, cam: (u, t) => [lv(tw(0.2, 20.16 + E, -1.0), tw(0, 20.16 + E, 1.1), u), tw(0, 20.16 + 1.4, 3), 70, 0.015],
    arms: u => ({ L: null, R: [0.16, -0.12, -0.55 - 0.15 * ease(u)] }) },
  { t0: 21.0, t1: 23.2, cam: (u, t) => [lv(tw(0, 20.16 + E, 2.2), tw(-1.5, 20.16 + E, 4.5), u), V(-116, 21.2, 34), 72, 0.04], arms: (u, t) => run(t) },
  { t0: 23.2, t1: 25.6, cam: (u, t) => [P(-114.0, 19.8, 20.16 + 2.0), V(-113, 11.2, 12.3), 64, 0.03], arms: () => ({ L: [-0.3, -0.42, -0.42], R: [0.3, -0.42, -0.42] }) },
  { t0: 25.6, t1: 28.0, cam: (u, t) => [P(-105.2, 21.0, 20.16 + 1.0), lv(V(-112, 21, 34), V(-100, 21.5, 36), u), 72, 0.03],
    arms: () => ({ L: [-0.3, -0.3, -0.45], R: null }) },
  { t0: 28.0, t1: 30.4, cam: (u, t) => [P(-104.6, 22.0, 20.16 + E), V(-84.6, 9.4, -3.5), 44, 0.02], arms: () => ({ L: [-0.3, -0.42, -0.42], R: [0.3, -0.42, -0.42] }) },
  { t0: 30.4, t1: 33.0, cam: (u, t, C) => [P(-110.0, 19.8, 20.16 + 2.0), V(-110, 10.9, 12.3), 56, 0.02], arms: none },
  { t0: 33.0, t1: 36.4, cam: (u, t) => [P(-110.0, 24.0, 20.16 + E), lv(V(-106, 21.6, 19), V(-105, 20.8, 22), u), 72, 0.02], arms: none },
  { t0: 36.4, t1: 40.0, cam: (u, t) => [P(-105.4, 20.9, 20.16 + 0.95), lv(V(-114, 21.4, 34), V(-108, 22, 38), u), 74, 0.02],
    arms: () => ({ L: [-0.22, -0.35, -0.36], R: [0.22, -0.35, -0.36] }) },
  { t0: 40.0, t1: 60.0, cam: (u, t) => [P(-105.4, 20.9, 20.16 + 0.95), V(-108, 22, 38), 74, 0.012], arms: none },
];
export const shotsFor4 = ending => ending === "heli" ? RUN_SHOTS : STAY_SHOTS;

// ---------- per-frame ----------
export function update(W, cam, arms, t, spec) {
  W.pre = (tt, C, L, shot) => {
    C.L = L;
    if (W.ending !== "heli") stayPre(W, tt, L);
    else runPre(W, tt, L, shot);
  };
  const info = F3.update(W, cam, arms, t, spec);
  if (W.ending === "heli") W.stairLight.position.set(cam.position.x, cam.position.y + 1.2, cam.position.z);
  return info;
}

function stayPre(W, t, L) {
  // everyone heads for the bleachers, then the top rows
  W.people.forEach((p, i) => {
    const v = (i * 2.37) % 13, d = p.userData, k = 4 + (i % 2), tx = v < 3 ? -104.5 - v : -111.4 - (v - 3) * 0.95, tz = ROWZ(k) + 0.1;
    const u = ease((t - 4.6 - (i % 7) * 0.55) / 3.2);
    p.position.set(lerp(d.base.x, tx, u), lerp(d.base.y, ROW(k), u), lerp(d.base.z, tz, u));
    if (u > 0 && u < 1) p.rotation.y = Math.atan2(tx - d.base.x, tz - d.base.z);
    if (u >= 1) p.rotation.y = 0;
    const late = t > 30 && i % 3 === 2 && i < 18 && false;           // the top row starts up the ladder
    if (late) p.visible = t < 31 + (i % 6);
  });
  // the guide calls everyone up, then points at the ladder
  const g = W.guide;
  const gu = ease((t - 8.0) / 6);
  g.position.set(lerp(-104.6, -121.4, gu), lerp(FLOOR, ROW(6), gu), lerp(-4.2, ROWZ(6) + 0.1, gu));
  g.rotation.y = t < 8 ? -Math.PI / 2 : t < 14 ? Math.atan2(-17, -7) : Math.PI / 2;
  g.userData.armR.rotation.set(0, 0, t < 8 ? 2.2 + 0.4 * Math.sin(t * 7) : t > 22 && t < 27 ? 3.0 : 0.2);
  g.visible = t < 31.5;
  // the wave through the door pushes the cots
  const wu = (t - WAVE[0]) / (WAVE[1] - WAVE[0]);
  W.wave.visible = wu > 0 && wu < 1;
  if (W.wave.visible) { W.wave.position.set(lerp(-99.5, -121, wu), L - 0.6, 0); W.wave.scale.set(1, 1 - 0.6 * wu, 1); }
  W.cots.forEach(c => {
    c.bx ??= c.o.position.x;
    const pass = WAVE[0] + (-99.5 - c.bx) / (-21.5) * (WAVE[1] - WAVE[0]);
    c.o.position.x = c.bx - 2.6 * ease((t - pass) / 0.9);
    c.o.position.y = Math.max(c.o.position.y, L - 0.3);
  });
  // hatch, roof people, the kid you pull up
  W.lid.rotation.z = t > 29.8 ? -1.9 * ease((t - 29.8) / 0.8) : 0;
  W.roofPeople.forEach((p, i) => { p.visible = t > 33.5 + i * 0.5; });
  W.kid.position.y = t < 34 ? -50 : lerp(GYM.top - 0.9, GYM.top + 0.42, ease((t - 34.2) / 2.0));
  W.kid.userData.armR.rotation.z = 2.8;
}

function runPre(W, t, L, shot) {
  const inside = !!shot.inside;
  W.inside.visible = inside;
  W.stair.visible = !inside;
  W.towerDoor.rotation.y = t > 10.8 ? 1.4 * ease((t - 10.8) / 0.8) : 0;
  W.roofDoor.rotation.y = t > 20.0 ? -1.5 * ease((t - 20.0) / 0.6) : 0;
  W.sheet.visible = t > 6.6 && t < 8.0;
  if (W.sheet.visible) { W.sheet.position.copy(panel(t)); W.sheet.rotation.set(t * 3.1, t * 1.7, t * 2.3); }
  // the generator: flickers, then dies with the second floor
  const flick = t > LIGHTS_OUT - 0.6 && t < LIGHTS_OUT && Math.sin(t * 57) + Math.sin(t * 19) > 0.4;
  const on = t < LIGHTS_OUT - 0.6 || flick;
  W.genMats.forEach(m => m.color.setHex(on ? 0xfff1c8 : 0x2a2a28));
  W.genLights.forEach(l => { l.visible = on; });
  W.stairLight.intensity = inside ? 5 : 0;
  W.guide.visible = false;
  W.heli.visible = false;
}
