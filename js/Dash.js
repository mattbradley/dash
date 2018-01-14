import Simulator from "./Simulator.js";

//const geolocation = [36.037351, -86.786561];
const geolocation = [33.523900, -111.908756];
window.simulator = new Simulator(geolocation, document.getElementById('container'));

/*
import GPGPU from "./GPGPU2.js";

const g = new GPGPU([
  {
    width: 4,
    height: 2,
    kernel: `vec4 kernel() { return vec4(kernelPosition, 0, 0); }`
  }
]);
console.log(g.run());
*/

const kernel = `
vec4 kernel() {
  ivec2 indexes = ivec2(kernelPosition * vec2(kernelSize));
  return vec4(indexes.x, indexes.y, 0, 0);
}
`;

import GPGPU from "./GPGPU2.js";

const g = new GPGPU([
  {
    width: 4,
    height: 4,
    kernel: kernel
  }
]);

console.log(g.run());
