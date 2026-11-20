// Node-side checks for the flood scene: timeline sanity + determinism.
//   node clipper/pov/check.mjs      -> prints "N/N checks passed", exit 1 on failure
import * as THREE from "./vendor/three.module.min.js";
import { SHOTS, WATER, waterLevel, buildWorld, buildArms, update, mulberry32 } from "./flood.js";

let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; else console.log("FAIL", name); };

// shots tile 0..45 with no gaps; cuts are 1.2-2.2 s except the held finale
check("shots start at 0", SHOTS[0].t0 === 0);
check("shots end at 45", SHOTS[SHOTS.length - 1].t1 === 45);
let tiled = true, paced = true;
for (let i = 0; i < SHOTS.length; i++) {
  if (i && SHOTS[i].t0 !== SHOTS[i - 1].t1) tiled = false;
  const len = SHOTS[i].t1 - SHOTS[i].t0;
  if (i < SHOTS.length - 1 && (len < 1.2 || len > 2.2)) paced = false;
}
check("shots tile the timeline", tiled);
check("cuts every 1.2-2.2 s", paced);

// water never drops; underwater only while it is above the room ceiling
let mono = true;
for (let t = 0; t < 45; t += 0.05) if (waterLevel(t + 0.05) + 1e-9 < waterLevel(t)) mono = false;
check("water level never falls", mono);
check("water keys sorted", WATER.every((k, i) => !i || k[0] > WATER[i - 1][0]));

// PRNG reproducible
const a = mulberry32(5), b = mulberry32(5);
check("prng reproducible", [0, 1, 2, 3].every(() => a() === b()));

// update() is a pure function of t: same t -> same camera, regardless of order
const spec = { sfx: { lightning: [0.6, 23.6] } };
const W1 = buildWorld(spec), W2 = buildWorld(spec);
const c1 = new THREE.PerspectiveCamera(60, 9 / 16, 0.05, 400), c2 = c1.clone();
W1.scene.add(c1); W2.scene.add(c2);
const a1 = buildArms(c1), a2 = buildArms(c2);
for (const t of [3, 17, 30]) update(W1, c1, a1, t, spec);           // different history
const i1 = update(W1, c1, a1, 16.0, spec), i2 = update(W2, c2, a2, 16.0, spec);
c1.updateMatrixWorld(); c2.updateMatrixWorld();
check("camera deterministic", c1.matrixWorld.elements.every((v, k) => Math.abs(v - c2.matrixWorld.elements[k]) < 1e-9));
check("same underwater state", i1.under === i2.under && i1.under === true);
check("roof shot above water", update(W2, c2, a2, 24.0, spec).under === false);
check("boat visible on the roof", W2.boat.visible === true);

console.log(`${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
