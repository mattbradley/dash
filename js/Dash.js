import Simulator from "./Simulator.js";

//const geolocation = [36.037351, -86.786561];
const geolocation = [33.523900, -111.908756];
window.simulator = new Simulator(geolocation, document.getElementById('container'));

import GPGPU from "./GPGPU.js";

const input = GPGPU.alloc(10, 1);
for (let i = 0; i < 10; i++) input[i] = i % 4;

const out = GPGPU.run(
  {
    inputs: [input],
    globals: {
      test: {
        type: 'texture',
        width: 4,
        height: 1,
        stride: 1,
        data: new Float32Array([13, 14, 15, 16])
      }
    }
  },
  `
vec4 kernel(vec4 num) {
  return vec4(texelFetch(test, ivec2(num.r, 0), 0).r);
}
  `
);

console.log(out);
