import Simulator from "./Simulator.js";

//const geolocation = [36.037351, -86.786561];
const geolocation = [33.523900, -111.908756];
window.simulator = new Simulator(geolocation, document.getElementById('container'));

import GPGPU from "./GPGPU2.js";

const i1 = GPGPU.alloc(4, 1);
i1[0] = 0;
i1[1] = 1;
i1[2] = 2;
i1[3] = 3;

const i2 = GPGPU.alloc(4, 1);
i2[0] = 4;
i2[1] = 3;
i2[2] = 2;
i2[3] = 1;

const g = new GPGPU([
  {
    inputs: [i1],
    globals: {
      num: 10,
    },
    kernel: `vec4 kernel(vec4 i1) { return vec4(kernelPosition + num, i1.r, 0); }`,
    outputName: 'out1'
  },
  {
    size: 2,
    globals: {
      out1: { type: 'output' }
    },
    kernel: `vec4 kernel() { return vec4(texture(out1, kernelPosition) * 2.0); }`
  }
]);

const start = performance.now();
console.log(g.run());
g.updateProgramInputs(0, [i2]);
g.updateProgramGlobal(0, 'num', 15);
console.log(g.run());
console.log(`GPGPU: ${(performance.now() - start) / 1000} seconds`);
