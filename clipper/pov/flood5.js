// Flood series Part 5: morning. The finale of each route, rescued by the ride you didn't pick in Part 2.
//   ending "boat" (stayed, on the gym roof)  -> the helicopter's basket lifts you off.
//   ending "heli" (ran, on the garage roof)   -> the boat driver from Part 2 pulls up at the second floor.
// Runs on Part 3's world (flood3.js) at dawn; pure function of t.
import * as THREE from "./vendor/three.module.min.js";
import { mulberry32, keyed, clamp, lerp, ease, V, toon, box, placeArm } from "./flood.js";
import * as F3 from "./flood3.js";

export const buildArms = F3.buildArms;
const { FLOOR, GYM } = F3;
export const OFFSET = 88;
export const WATER5 = { boat: [[0, 10.8], [44, 10.2]], heli: [[0, 10.9], [44, 10.25]] };
export const SUN_DIR = V(1, 0.09, -0.15).normalize();
const ROOF = GYM.top + 0.4;                                   // gym roof top (15.0)
const DECK2 = 10.4 + 0.16, DECK5 = 20.0 + 0.16;
const E = 1.65;

// heli route boat: in along the garage's east wall, then out past the shelter toward the sun
const curve = pts => new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z)), false, "centripetal");
export const BOAT_IN = curve([[-60, 46], [-85, 44], [-98, 38], [-102.6, 33.5], [-102.6, 30.5]]);
export const BOAT_OUT = curve([[-102.6, 30.5], [-101.5, 24], [-95, 17], [-88, 8], [-87, -4], [-88, -14], [-78, -22], [-50, -21], [-10, -19], [30, -19]]);
export const BT5 = { in0: 3.0, in1: 12.0, out0: 18.0, out1: 21.0 };
const LEN_OUT = BOAT_OUT.getLength(), VOUT = 7.0;
export function boatPose5(t) {
  let p, tan, v = 0;
  if (t < BT5.out0) {
    const u = ease((t - BT5.in0) / (BT5.in1 - BT5.in0));
    p = BOAT_IN.getPointAt(u); tan = BOAT_IN.getTangentAt(clamp(u, 0.001, 0.999)); v = u > 0 && u < 1 ? 4 : 0;
  } else {
    const a = BT5.out0, b = BT5.out1;
    const d = t < b ? VOUT * (t - a) ** 2 / (2 * (b - a)) : VOUT * (b - a) / 2 + VOUT * (t - b);
    const u = Math.min(1, d / LEN_OUT);
    p = BOAT_OUT.getPointAt(u); tan = BOAT_OUT.getTangentAt(clamp(u, 0.001, 0.999)); v = t < b ? VOUT * (t - a) / (b - a) : VOUT;
  }
  return { p, yaw: Math.atan2(-tan.x, -tan.z), v };
}

// boat route helicopter: in from the sunrise, hovers over the gym, leaves toward the sun
export const heliPos5 = t => V(keyed([[0, 40], [10.5, -112], [26.5, -112], [44, -40]], t),
  keyed([[0, 45], [10.5, 24], [26.5, 24], [44, 36]], t), keyed([[0, -40], [10.5, 2], [26.5, 2], [44, -16]], t));
export const cable5 = t => keyed([[11.5, 0.3], [13.8, 5.83], [15.0, 5.83], [17.4, 0.3], [17.8, 0.3], [20.0, 5.83], [20.8, 5.83], [25.8, 0.3]], t);

// ---------- world ----------
export function buildWorld(spec) {
  const W = F3.buildWorld(spec);
  const S = W.scene, rnd = mulberry32(505);
  W.offset = OFFSET;
  W.waterFn = t => keyed(WATER5[spec.ending === "heli" ? "heli" : "boat"], t);
  W.shots = spec.ending === "heli" ? HELI5 : BOAT5;
  W.sunLight = S.children.find(o => o.isDirectionalLight);

  // dawn sky: graded dome with a sun glow, the sun, a few pink clouds
  const dome = new THREE.SphereGeometry(400, 48, 24);
  const col = [], c = new THREE.Color(), stops = [[-1, 0x26304a], [0, 0x3a4260], [0.02, 0xffa45c], [0.1, 0xf38a7a], [0.28, 0xb87fa8], [0.6, 0x5d6eb0], [1, 0x34478a]];
  const pos = dome.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const d = V(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let j = 0; while (j < stops.length - 2 && d.y > stops[j + 1][0]) j++;
    const [e0, c0] = stops[j], [e1, c1] = stops[j + 1];
    c.setHex(c0).lerp(new THREE.Color(c1), clamp((d.y - e0) / (e1 - e0), 0, 1));
    c.lerp(new THREE.Color(0xffe2a6), Math.pow(Math.max(0, d.dot(SUN_DIR)), 6) * 0.85);
    col.push(c.r, c.g, c.b);
  }
  dome.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  W.dome = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  W.dome.renderOrder = -1; S.add(W.dome);
  W.sun = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }));
  W.sunHalo = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false, transparent: true, opacity: 0.28, depthWrite: false }));
  S.add(W.sun); S.add(W.sunHalo);
  W.clouds = new THREE.Group(); S.add(W.clouds);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xe39a9a : 0xb78aac, fog: false }));
    const a = -0.9 + rnd() * 1.8, r = 300 + rnd() * 40;
    m.position.set(-100 + r * Math.cos(a), 45 + rnd() * 50, r * Math.sin(a) * 0.9);
    m.scale.set(30 + rnd() * 40, 3 + rnd() * 3, 10 + rnd() * 14); W.clouds.add(m);
  }
  W.sea.material.color.setHex(0x2f8098); W.sea.material.emissive.setHex(0x221c18);

  // everyone from the shelter made it onto the gym roof overnight
  W.roofSpots = W.people.map((p, i) => [-121 + ((i * 3.7) % 18.5), -9.5 + ((i * 5.3) % 19)]);

  if (spec.ending === "heli") {
    W.driver = F3.person(W.boat, 0xffd400, 0.45, 0.5, 1.6);
    W.genMats = []; W.genLights = [];
    W.garage.traverse(o => {
      if (o.isMesh && o.material.isMeshBasicMaterial && o.material.color.getHex() === 0xfff1c8) W.genMats.push(o.material);
      if (o.isPointLight) W.genLights.push(o);
    });
    W.boat.rotation.order = "YXZ";
  } else {
    // rescue basket on a cable, with a mother and kid for the first lift
    W.basket = new THREE.Group(); S.add(W.basket);
    const OR = 0xff8a00;
    box(1.1, 0.06, 1.1, OR, 0, 0.03, 0, W.basket, true);
    for (const [x, z] of [[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]]) box(0.06, 0.9, 0.06, OR, x, 0.45, z, W.basket);
    for (const [w, d, x, z] of [[1.1, 0.06, 0, -0.52], [1.1, 0.06, 0, 0.52], [0.06, 1.1, -0.52, 0], [0.06, 1.1, 0.52, 0]]) {
      box(w, 0.06, d, OR, x, 0.9, z, W.basket); box(w, 0.04, d, OR, x, 0.45, z, W.basket);
    }
    box(0.14, 0.14, 0.14, 0x333333, 0, 1.8, 0, W.basket);
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const a = V(x, 0.9, z), b = V(0, 1.8, 0), d = b.clone().sub(a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, d.length(), 5), toon(0x222222));
      m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); W.basket.add(m);
    }
    W.riders = [F3.person(W.basket, 0x8e44ad, -0.2, 0.06, 0.1, 0.92), F3.person(W.basket, 0xf1c40f, 0.25, 0.06, -0.15, 0.6)];
    W.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), toon(0x1a1a1a)); S.add(W.cable);
  }
  return W;
}

// ---------- shots ----------
const lv = (a, b, u) => a.clone().lerp(b, ease(u));
const none = () => ({ L: null, R: null });
const P = (x, z, y) => V(x, y, z);
const walk = t => ({ L: [-0.3, -0.42 + 0.05 * Math.sin(t * 7), -0.48], R: [0.3, -0.42 - 0.05 * Math.sin(t * 7), -0.48] });
const SUNPT = V(-100, 0, 0).addScaledVector(SUN_DIR, 300);

export const BOAT5 = [
  { t0: 0.0, t1: 2.4, cam: (u, t) => [P(-104.6, -2.0, ROOF + 1.1), lv(SUNPT.clone().add(V(0, -6, 0)), SUNPT, u), 64, 0.002], arms: none },
  { t0: 2.4, t1: 5.0, cam: (u, t) => [lv(P(-104.0, -2.0, ROOF + E), P(-100.8, -1.4, ROOF + E), u), V(-50, 9, 4), 70, 0.004], arms: (u, t) => walk(t) },
  { t0: 5.0, t1: 7.4, cam: (u, t) => [P(-101.4, -1.4, ROOF + E), lv(V(-112, 15.8, 2), V(-114, 17, -2), u), 70, 0.003], arms: none },
  { t0: 7.4, t1: 9.8, cam: (u, t, C) => [P(-101.4, -1.4, ROOF + E), C.heli, 58, 0.004], arms: none },
  { t0: 9.8, t1: 12.2, cam: (u, t, C) => [P(-108.0, 0.6, ROOF + E), C.heli.clone().add(V(0, -1, 0)), 70, 0.02], arms: () => ({ L: [-0.14, 0.05, -0.34], R: null }) },
  { t0: 12.2, t1: 14.8, cam: (u, t, C) => [P(-108.4, 0.8, ROOF + E), C.kw(0, 0.5, 0), 64, 0.015], arms: none },
  { t0: 14.8, t1: 17.6, cam: (u, t, C) => [P(-108.6, 0.9, ROOF + E), C.kw(0, 0.8, 0), 66, 0.015], arms: none },
  { t0: 17.6, t1: 20.0, cam: (u, t, C) => [P(-109.6, 1.4, ROOF + E), C.kw(0, 0.6, 0), 66, 0.015], arms: none },
  { t0: 20.0, t1: 22.6, cam: (u, t, C) => [lv(P(-109.6, 1.4, ROOF + E), C.kw(0, 1.3, 0.25), clamp(u * 2, 0, 1)), V(-109, ROOF, 0.5), 72, 0.015],
    arms: () => ({ L: [-0.3, -0.36, -0.45], R: [0.3, -0.36, -0.45] }) },
  { t0: 22.6, t1: 25.8, cam: (u, t, C) => [C.kw(0, 1.3, 0.25), lv(V(-60, 8, 20), SUNPT.clone().add(V(0, -40, 0)), u), 72, 0.01],
    arms: () => ({ L: [-0.3, -0.36, -0.45], R: [0.3, -0.36, -0.45] }) },
  { t0: 25.8, t1: 28.4, cam: (u, t, C) => [C.kw(0, 1.2, 0.25), C.heli.clone().add(V(0.6, -1.2, 0)), 70, 0.012],
    arms: u => ({ L: null, R: [0.1, 0.12 + 0.12 * ease(u * 1.4), -0.6], X: [0.08, 0.3 - 0.15 * ease(u * 1.4), -0.62] }) },
  { t0: 28.4, t1: 33.0, cabin: true, cam: (u, t, C) => [C.cabin, lv(V(-60, 6, 10), SUNPT.clone().add(V(0, -30, 0)), u), 66, 0.006],
    arms: () => ({ L: [-0.12, -0.24, -0.4], R: null }) },
  { t0: 33.0, t1: 60.0, cabin: true, cam: (u, t, C) => [C.cabin, SUNPT.clone().add(V(0, -30, 0)), 66, 0.004], arms: none },
];

export const HELI5 = [
  { t0: 0.0, t1: 2.4, cam: (u, t) => [P(-105.4, 20.9, DECK5 + 0.95), lv(SUNPT.clone().add(V(0, -8, 0)), SUNPT, u), 66, 0.002], arms: none },
  { t0: 2.4, t1: 5.0, cam: (u, t) => [lv(P(-105.0, 23.0, DECK5 + E), P(-104.7, 30.0, DECK5 + E), u), V(-50, 10, 30), 70, 0.004], arms: (u, t) => walk(t) },
  { t0: 5.0, t1: 7.4, cam: (u, t, C) => [P(-104.7, 30.0, DECK5 + E), C.boatAt(0.8), 56, 0.003], arms: none },
  { t0: 7.4, t1: 9.8, cam: (u, t, C) => [P(-104.7, 30.4, DECK5 + E), C.boatAt(0.8), 60, 0.003], arms: (u, t) => ({ L: null, R: [0.22, 0.05 + 0.05 * Math.sin(t * 8), -0.6] }) },
  { t0: 9.8, t1: 12.2, cam: (u, t, C) => [P(-103.5, 30.6, DECK5 + 1.9), C.boatAt(1.2), 66, 0.003], arms: () => ({ L: [-0.3, -0.42, -0.42], R: [0.3, -0.42, -0.42] }) },
  { t0: 12.2, t1: 14.8, cam: (u, t, C) => [lv(P(-116, 27, DECK2 + E), P(-105.4, 30.4, DECK2 + E), u), C.boatAt(1.0), 68, 0.008], arms: (u, t) => walk(t) },
  { t0: 14.8, t1: 17.0, cam: (u, t, C) => { const p = P(-105.0, 30.4, DECK2 + E).lerp(C.bw(0, 1.55, -0.3), u); p.y += 0.8 * Math.sin(Math.PI * u);
    return [p, C.bw(0, 0.4, -1.4 * u), 74, 0.01]; }, arms: u => ({ L: [-0.25, 0.05 - 0.3 * u, -0.6], R: [0.25, 0.08 - 0.3 * u, -0.6] }) },
  { t0: 17.0, t1: 19.6, cam: (u, t, C) => [C.bw(0.0, 1.6, -0.8), C.bw(0.45, 1.5, 1.6), 64, 0.012], arms: none },
  { t0: 19.6, t1: 22.4, cam: (u, t, C) => [C.bw(0.3, 1.75, -1.0), C.bw(0, 1.0, -12), 66, 0.015], arms: () => ({ L: [-0.3, -0.36, -0.5], R: [0.3, -0.36, -0.5] }) },
  { t0: 22.4, t1: 25.2, cam: (u, t, C) => [C.bw(0.6, 1.7, -0.6), V(-106, ROOF + 1.2, lerp(6, -6, u)), 56, 0.012], arms: none },
  { t0: 25.2, t1: 28.4, cam: (u, t, C) => [C.bw(0.3, 1.75, -1.0), lv(C.bw(0, 1.0, -12), SUNPT.clone().add(V(0, -20, 0)), u), 64, 0.012],
    arms: () => ({ L: [-0.3, -0.36, -0.5], R: null }) },
  { t0: 28.4, t1: 33.0, cam: (u, t, C) => [C.bw(-0.9, 1.0, -1.4), SUNPT.clone().add(V(0, -25, 0)), 70, 0.012], arms: none },
  { t0: 33.0, t1: 60.0, cam: (u, t, C) => [C.bw(0.3, 1.75, -1.0), SUNPT.clone().add(V(0, -18, 0)), 66, 0.008], arms: none },
];
export const shotsFor5 = ending => ending === "heli" ? HELI5 : BOAT5;

// ---------- per-frame ----------
export function update(W, cam, arms, t, spec) {
  W.pre = (tt, C, L, shot) => {
    C.L = L;
    // the shelter crowd on the gym roof, waving once rescue shows up
    W.people.forEach((p, i) => {
      const [x, z] = W.roofSpots[i], d = p.userData;
      p.position.set(x, ROOF, z); p.rotation.y = (i * 1.7) % 6.28;
      const wave = (W.ending === "heli" ? tt > 21 : tt > 7.6) && i % 2 === 0;
      d.armR.rotation.z = wave ? 2.6 + 0.45 * Math.sin(tt * 8 + i) : 0.15;
      d.armL.rotation.z = -0.15;
      if (W.ending !== "heli" && tt > 14.6 && i < 2) p.visible = false;     // the first two leave in the basket
    });
    W.guide.position.set(-106.5, ROOF, 3.0); W.guide.rotation.y = 0.6;
    W.guide.userData.armR.rotation.set(0, 0, W.ending === "heli" ? (tt > 21 ? 2.7 + 0.4 * Math.sin(tt * 7) : 0.2) : (tt > 7.6 ? 2.7 + 0.4 * Math.sin(tt * 7) : 0.2));
    W.guide.visible = true;
    if (W.ending === "heli") heliRoute(W, tt, L, C); else boatRoute(W, tt, L, C, shot);
  };
  const info = F3.update(W, cam, arms, t, spec);
  dawn(W, cam, t, info.L);
  return info;
}

function boatRoute(W, t, L, C, shot) {
  const hp = heliPos5(t); hp.y += 0.3 * Math.sin(t * 1.3);
  W.heli.position.copy(hp);
  const dir = t < 26.5 ? V(-1, 0, 0.3) : V(1, 0, -0.25);
  W.heli.lookAt(hp.clone().add(dir)); W.heli.rotateY(Math.PI); W.heli.rotateX(-0.06);
  W.rotor.rotation.y = t * 31; W.heli.userData.cone.visible = false;
  W.heli.updateMatrixWorld(true);
  W.heli.visible = !shot.cabin;
  const belly = W.heli.localToWorld(V(0, -1.35, 0));
  const sw = 0.05 * Math.sin(t * 1.7);
  const hook = belly.clone().add(V(sw, -cable5(t), 0));
  W.basket.position.copy(hook).add(V(0, -1.8, 0)); W.basket.rotation.set(0, 0.4 * Math.sin(t * 0.5), sw * 0.3);
  W.basket.updateMatrixWorld(true);
  W.basket.visible = t > 11.6 && !shot.cabin;
  W.riders.forEach(r => { r.visible = t > 14.6 && t < 17.3; });
  const top = W.basket.localToWorld(V(0, 1.8, 0)), d = top.clone().sub(belly);
  W.cable.position.copy(belly).addScaledVector(d, 0.5); W.cable.scale.set(1, Math.max(0.01, d.length()), 1);
  W.cable.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  W.cable.visible = W.basket.visible;
  C.heli = hp; C.kw = (x, y, z) => W.basket.localToWorld(V(x, y, z));
  C.cabin = W.heli.localToWorld(V(0.9, -0.35, 0.2));
  W.boat.visible = false;
}

function heliRoute(W, t, L, C) {
  const bp = boatPose5(t);
  W.boat.position.set(bp.p.x, L + 0.1 * Math.sin(t * 2.1), bp.p.z);
  W.boat.rotation.set(0.04 * Math.sin(t * 1.7) + 0.01 * bp.v, bp.yaw, 0.05 * Math.sin(t * 2.3));
  W.boat.visible = t > BT5.in0 - 0.1;
  W.boat.updateMatrixWorld(true);
  C.bw = (x, y, z) => W.boat.localToWorld(V(x, y, z));
  C.boatAt = h => W.boat.position.clone().add(V(0, h, 0));
  const d = W.driver.userData;
  d.armR.rotation.z = t > 6 && t < 14.8 ? 2.6 + 0.45 * Math.sin(t * 8) : t > 17 && t < 19.6 ? 2.2 : 0.25;
  W.heli.visible = false;
  W.genMats.forEach(m => m.color.setHex(0x2a2a28));
  W.genLights.forEach(l => { l.visible = false; });
}

function dawn(W, cam, t, L) {
  W.rain.visible = false; W.bolt.visible = false;
  W.debris.forEach(m => { m.visible = false; });
  W.dome.position.copy(cam.position);
  W.sun.position.copy(cam.position).addScaledVector(SUN_DIR, 330);
  W.sunHalo.position.copy(W.sun.position);
  W.scene.background.setHex(0xe89a7e);
  W.scene.fog.color.setHex(0xd99c8c); W.scene.fog.near = 70; W.scene.fog.far = 420;
  W.hemi.color.setHex(0xffd8bc); W.hemi.groundColor.setHex(0x3a4a66); W.hemi.intensity = 1.45;
  if (W.sunLight) { W.sunLight.color.setHex(0xffc890); W.sunLight.intensity = 2.0; W.sunLight.position.copy(SUN_DIR).multiplyScalar(100); }
  W.flag.rotation.set(0, Math.PI + 0.12 * Math.sin(t * 2.2), -0.25);
  W.doors.forEach((d, i) => { d.rotation.y = (i ? 1 : -1) * -1.25; });
  // calm water, a slow swell
  const pos = W.sea.geometry.attributes.position, b = W.seaBase;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], z = b[i * 3 + 2];
    pos.array[i * 3 + 1] = 0.07 * (Math.sin(x * 0.18 + t * 0.9) + 0.6 * Math.sin(z * 0.23 - t * 0.7));
  }
  pos.needsUpdate = true; W.sea.geometry.computeVertexNormals();
}
