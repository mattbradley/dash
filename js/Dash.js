import Simulator from "./Simulator.js";

const geolocation = [36.037351, -86.786561];
window.simulator = new Simulator(geolocation, document.getElementById('container'));

/*
const start = new THREE.Vector2(10, -5);
const startRot = 0;
const end = new THREE.Vector2(20, -6);

const startRotVec = THREE.Vector2.fromAngle(startRot);
const diff = end.clone().sub(start);
const dist = diff.length();
const dot = end.clone().sub(start).dot(startRotVec) / dist;
//const angle = 2 * Math.acos(dot);
//const kappa = 2 / dist * Math.sqrt(1 - dot * dot);
const angle = 2 * (Math.atan2(diff.y, diff.x) - Math.atan2(startRotVec.y, startRotVec.x));
const kappa = 2 / dist * Math.sin(angle / 2);
const arcLength = angle / kappa;
console.log(`dist: ${dist}`);
console.log(`angle: ${angle}`);
console.log(`arc length: ${arcLength}`);
console.log(`radius: ${1/kappa}`);
console.log(`curvature: ${kappa}`);

const arcAngle = startRot + Math.sign(angle) * Math.PI / 2;
const center = THREE.Vector2.fromAngle(arcAngle + Math.PI).multiplyScalar(1 / kappa).add(start);

for (let i = 0; i <= 10; i++) {
  console.log(THREE.Vector2.fromAngle(arcAngle + i * angle / 10).multiplyScalar(1 / kappa).add(center));
}
*/
