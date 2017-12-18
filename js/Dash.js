import Simulator from "./Simulator.js";

const geolocation = [36.037351, -86.786561];
window.simulation = new Simulator(geolocation, document.getElementById('container'));

import GPGPU from "./autonomy/path_finding/GPGPU.js";

const input = Float32Array.of(
  1, 2, 3, 4,
  5, 6, 7, 8,
  9, 10, 11, 12,
  13, 14, 15, 16
);

const output = GPGPU(input, `
  void main() {
    gl_FragColor = texture2D(texture0, pos) * 2.0;
  }
`);

console.log(output);
