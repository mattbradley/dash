import Simulator from "./Simulator.js";

Box2D().then(Box2D => {
  window.Box2D = Box2D;

  //const geolocation = [36.037351, -86.786561];
  const geolocation = [33.523900, -111.908756];
  window.simulator = new Simulator(geolocation, document.getElementById('container'));
});

/*
import GPGPU from "./GPGPU2.js";

const kernel = `
vec4 kernel() {
  int a = 0; // 8
  int v = 3; // 4
  int t = 0; // 2
  int l = 16; // 19
  int s = 2; // 10

  int index = a + v * 8 + t * 8 * 4 + l * 8 * 4 * 2 + s * 8 * 4 * 2 * 19;
  return vec4(index);
}
`;

const g = new GPGPU([{
  kernel: kernel,
  width: 1,
  height: 1
}]);

let index = g.run()[0][0];
console.log(index);

const s = index / (19 * 2 * 4 * 8) | 0;
index -= s * (19 * 2 * 4 * 8);

const l = index / (2 * 4 * 8) | 0;
index -= l * (2 * 4 * 8);

const t = index / (4 * 8) | 0;
index -= t * (4 * 8);

const v = index / 8 | 0;
const a = index % 8;

console.log(`s: ${s}`);
console.log(`l: ${l}`);
console.log(`t: ${t}`);
console.log(`v: ${v}`);
console.log(`a: ${a}`);
*/
