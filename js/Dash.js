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
/*
const kernel = `
vec4 kernel() {
  int a = 3;
  int b = 5;
  int c = int(mod(float(a), float(b)));
  return vec4(vec2(ivec2(kernelPosition * vec2(kernelSize))), -1, -1);
}
`;

const d = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1]);

import GPGPU from "./GPGPU2.js";

const g = new GPGPU([
  {
    width: 4,
    height: 4,
    kernel: kernel,
    uniforms: {
      tex: {
        type: 'texture',
        width: 8,
        height: 1,
        channels: 2,
        filter: 'linear',
        data: d
      }
    }
  }
]);

console.log(g.run());*/
