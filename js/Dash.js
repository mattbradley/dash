import Simulator from "./Simulator.js";

const geolocation = [36.037351, -86.786561];
window.simulation = new Simulator(geolocation, document.getElementById('container'));

import GPGPU from "./GPGPU.js";

const input1 = Float32Array.of(
  1, 2, 3, 4,
  5, 6, 7, 8,
  9, 10, 11, 12,
  13, 14, 15, 16
);

const input2 = Float32Array.of(
  10, 20, 30, 40
)

const inputs = [
  { data: input1, width: 4 },
  { data: input2, width: 1 }
];

const output = GPGPU(inputs, `
  vec4 kernel(vec4 a, vec4 b) {
    return a * b.x;
  }
`);

console.log(output);
